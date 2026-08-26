import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import Timeline from '../src/core/Timeline.js'
import Sound from '../src/core/Sound.js'
import { MockAudioContext, calls, captureConsole, resetMocks } from './mocks/MockAudioContext.js'

let console_

beforeEach(() => {
  resetMocks()
  console_ = captureConsole()
})

afterEach(() => console_.restore())

/**
 * A timeline with a context in place but no live interval, so tests drive the
 * scheduler by calling tick() and moving the mock's clock by hand.
 */
const primedTimeline = (options = {}) => {
  const timeline = new Timeline(options)
  timeline.context = new MockAudioContext()
  timeline.isPlaying = true
  return timeline
}

const soundFor = async timeline => {
  const sound = new Sound({ context: timeline.context, audioBuffer: { sampleRate: 44100 } })
  await sound.initialized
  return sound
}

/** tick() starts sounds without awaiting them; let those microtasks settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

describe('scheduling', () => {
  test('queues a sound at a time', async () => {
    const timeline = primedTimeline()
    const sound = await soundFor(timeline)

    timeline.scheduleSound(sound, 5)

    expect(timeline.soundQueue.peek().priority).toBe(5)
    expect(timeline.soundQueue.peek().item.sound).toBe(sound)
  })

  test('triggers the scheduled event', async () => {
    const timeline = primedTimeline()
    const sound = await soundFor(timeline)
    const seen = []
    timeline.events.on('scheduled', (s, time) => seen.push({ s, time }))

    timeline.scheduleSound(sound, 3)

    expect(seen).toEqual([{ s: sound, time: 3 }])
  })

  test('orders sounds by time, not insertion order', async () => {
    const timeline = primedTimeline()
    const late = await soundFor(timeline)
    const early = await soundFor(timeline)

    timeline.scheduleSound(late, 10)
    timeline.scheduleSound(early, 1)

    expect(timeline.soundQueue.dequeue().sound).toBe(early)
    expect(timeline.soundQueue.dequeue().sound).toBe(late)
  })

  // Regression: remove() never matched the { sound, time } wrapper, so the old
  // entry stayed queued and the sound played at both times.
  test('rescheduling moves a sound instead of duplicating it', async () => {
    const timeline = primedTimeline()
    const sound = await soundFor(timeline)
    timeline.scheduleSound(sound, 5)

    timeline.rescheduleSound(sound, 12)

    const entries = []
    while (!timeline.soundQueue.isEmpty()) entries.push(timeline.soundQueue.dequeue())

    expect(entries.length).toBe(1)
    expect(entries[0].time).toBe(12)
  })

  test('rescheduling leaves other sounds alone', async () => {
    const timeline = primedTimeline()
    const moved = await soundFor(timeline)
    const other = await soundFor(timeline)
    timeline.scheduleSound(moved, 5)
    timeline.scheduleSound(other, 7)

    timeline.rescheduleSound(moved, 20)

    expect(timeline.soundQueue.dequeue().sound).toBe(other)
    expect(timeline.soundQueue.dequeue().sound).toBe(moved)
  })

  test('playNow queues at the live audio time', async () => {
    const timeline = primedTimeline()
    timeline.context.currentTime = 4
    const sound = await soundFor(timeline)

    timeline.playNow(sound)

    expect(timeline.soundQueue.peek().priority).toBe(4)
  })

  test('future offsets from the live audio time', () => {
    const timeline = primedTimeline()
    timeline.context.currentTime = 10

    expect(timeline.future(5)).toBe(15)
  })

  test('currentTime tracks the audio clock and is read-only', () => {
    const timeline = primedTimeline()
    timeline.context.currentTime = 7.5

    expect(timeline.currentTime).toBe(7.5)
    expect(Object.getOwnPropertyDescriptor(Timeline.prototype, 'currentTime').set).toBeUndefined()
  })

  test('currentTime is 0 before a context exists', () => {
    expect(new Timeline().currentTime).toBe(0)
  })

  test('addSound loads a file before queueing it', async () => {
    const timeline = primedTimeline()

    await timeline.addSound('snd.mp3', 8, { context: timeline.context })

    expect(calls.fetch).toEqual(['snd.mp3'])
    expect(timeline.soundQueue.peek().priority).toBe(8)
    expect(timeline.soundQueue.peek().item.sound.audioBuffer).toBeTruthy()
  })
})

describe('lookahead', () => {
  test('schedules sounds inside the lookahead window and leaves the rest queued', async () => {
    const timeline = primedTimeline({ lookahead: 2 })
    const soon = await soundFor(timeline)
    const later = await soundFor(timeline)

    timeline.scheduleSound(soon, 1.5)
    timeline.scheduleSound(later, 10)
    timeline.tick()
    await settle()

    expect(soon.isPlaying).toBe(true)
    expect(later.isPlaying).toBe(false)
    expect(timeline.soundQueue.peek().item.sound).toBe(later)
  })

  // The point of the rewrite: a sound due in the future is handed to the audio
  // clock with its exact start time, rather than being started when a timer
  // happens to notice it.
  test('starts a future sound at its exact scheduled time', async () => {
    const timeline = primedTimeline({ lookahead: 2 })
    const sound = await soundFor(timeline)

    timeline.scheduleSound(sound, 1.75)
    timeline.tick()
    await settle()

    expect(sound.source.startCalls[0].when).toBe(1.75)
  })

  test('schedules the attack envelope at the start time, not at tick time', async () => {
    const timeline = primedTimeline({ lookahead: 2 })
    const sound = new Sound({
      context: timeline.context, audioBuffer: {}, volume: 0.5, attack: 0.1
    })
    await sound.initialized

    timeline.scheduleSound(sound, 1.5)
    timeline.tick()
    await settle()

    expect(sound.voices[0].gainNode.gain.automation).toEqual([
      { type: 'setValueAtTime', value: 0, time: 1.5 },
      { type: 'linearRampToValueAtTime', value: 1, time: 1.6 }
    ])
  })

  test('an overdue sound inside the tolerance starts immediately', async () => {
    const timeline = primedTimeline({ maxLateness: 1 })
    const sound = await soundFor(timeline)

    timeline.scheduleSound(sound, 0)
    timeline.context.currentTime = 0.5
    timeline.tick()
    await settle()

    expect(sound.source.startCalls[0].when).toBe(0.5)
  })

  test('sounds simultaneous on the audio clock get the same start time', async () => {
    const timeline = primedTimeline({ lookahead: 2 })
    const one = await soundFor(timeline)
    const two = await soundFor(timeline)

    timeline.scheduleSound(one, 1)
    timeline.scheduleSound(two, 1)
    timeline.tick()
    await settle()

    expect(one.source.startCalls[0].when).toBe(1)
    expect(two.source.startCalls[0].when).toBe(1)
  })

  test('a wider lookahead reaches further into the queue', async () => {
    const timeline = primedTimeline({ lookahead: 20 })
    const sound = await soundFor(timeline)

    timeline.scheduleSound(sound, 15)
    timeline.tick()
    await settle()

    expect(sound.isPlaying).toBe(true)
    expect(sound.source.startCalls[0].when).toBe(15)
  })

  test('triggers the loop event once per tick', () => {
    const timeline = primedTimeline()
    let loops = 0
    timeline.events.on('loop', () => loops++)

    timeline.tick()
    timeline.tick()

    expect(loops).toBe(2)
  })

  test('reports the scheduled start time on the play event', async () => {
    const timeline = primedTimeline({ lookahead: 2 })
    const sound = await soundFor(timeline)
    const seen = []
    timeline.events.on('play', (s, time) => seen.push(time))

    timeline.scheduleSound(sound, 1.25)
    timeline.tick()
    await settle()

    expect(seen).toEqual([1.25])
  })

  test('does nothing once stopped', async () => {
    const timeline = primedTimeline()
    const sound = await soundFor(timeline)
    timeline.scheduleSound(sound, 0)
    timeline.isPlaying = false

    timeline.tick()
    await settle()

    expect(sound.isPlaying).toBe(false)
  })
})

describe('starved scheduler', () => {
  // A hidden tab or a sleeping machine can stall the scheduler for longer than
  // the lookahead. Releasing the whole backlog at once would be a burst of
  // simultaneous audio, so anything too late is dropped instead.
  test('drops a backlog rather than firing it all at once', async () => {
    const timeline = primedTimeline({ maxLateness: 1 })
    const backlog = []
    for (let time = 0; time < 5; time++) backlog.push(await soundFor(timeline))
    backlog.forEach((sound, time) => timeline.scheduleSound(sound, time))

    timeline.context.currentTime = 60   // woke up a minute later
    timeline.tick()
    await settle()

    expect(backlog.every(sound => !sound.isPlaying)).toBe(true)
    expect(timeline.soundQueue.isEmpty()).toBe(true)
  })

  test('reports each dropped sound through the missed event', async () => {
    const timeline = primedTimeline({ maxLateness: 1 })
    const dropped = await soundFor(timeline)
    const kept = await soundFor(timeline)
    const missed = []
    timeline.events.on('missed', (sound, time) => missed.push({ sound, time }))

    timeline.scheduleSound(dropped, 0)
    timeline.scheduleSound(kept, 59.5)
    timeline.context.currentTime = 60
    timeline.tick()
    await settle()

    expect(missed).toEqual([{ sound: dropped, time: 0 }])
    expect(kept.isPlaying).toBe(true)
  })

  test('a wider tolerance keeps later sounds', async () => {
    const timeline = primedTimeline({ maxLateness: 100 })
    const sound = await soundFor(timeline)

    timeline.scheduleSound(sound, 0)
    timeline.context.currentTime = 60
    timeline.tick()
    await settle()

    expect(sound.isPlaying).toBe(true)
  })
})

describe('start', () => {
  test('creates a context, resumes it and runs the scheduler', async () => {
    const timeline = new Timeline({ tickInterval: 0.01 })
    const sound = new Sound({ context: undefined, audioBuffer: {} })
    await timeline.start()
    await sound.initialized

    expect(timeline.context).toBeInstanceOf(MockAudioContext)
    expect(timeline.context.resumeCalls).toBe(1)
    expect(timeline.isPlaying).toBe(true)

    let loops = 0
    timeline.events.on('loop', () => loops++)
    await new Promise(resolve => setTimeout(resolve, 45))
    timeline.stop()

    expect(loops).toBeGreaterThan(1)
  })

  test('triggers the start event', async () => {
    const timeline = new Timeline()
    let started = 0
    timeline.events.on('start', () => started++)

    await timeline.start()
    timeline.stop()

    expect(started).toBe(1)
  })

  test('restarting does not leave the old scheduler running', async () => {
    const timeline = new Timeline({ tickInterval: 0.01 })
    await timeline.start()
    await timeline.start()

    let loops = 0
    timeline.events.on('loop', () => loops++)
    await new Promise(resolve => setTimeout(resolve, 45))
    timeline.stop()
    const afterStop = loops
    await new Promise(resolve => setTimeout(resolve, 30))

    // One scheduler, not two: roughly 45ms of 10ms ticks.
    expect(loops).toBeLessThan(9)
    expect(loops).toBe(afterStop)
  })
})

describe('tickInterval', () => {
  test('takes effect immediately while running', async () => {
    const timeline = new Timeline({ tickInterval: 10 })
    await timeline.start()
    let loops = 0
    timeline.events.on('loop', () => loops++)

    timeline.tickInterval = 0.01
    await new Promise(resolve => setTimeout(resolve, 45))
    timeline.stop()

    expect(loops).toBeGreaterThan(1)
  })
})

describe('intervals', () => {
  test('runs a callback on an interval and stops on request', async () => {
    const timeline = primedTimeline()
    let ticks = 0

    timeline.startInterval(0.01, () => ticks++)
    await new Promise(resolve => setTimeout(resolve, 45))
    timeline.stopInterval(0.01)
    const afterStop = ticks
    await new Promise(resolve => setTimeout(resolve, 30))

    expect(afterStop).toBeGreaterThan(0)
    expect(ticks).toBe(afterStop)
    expect(timeline.intervalIDs).toEqual({})
  })

  test('stopping an unknown interval is harmless', () => {
    const timeline = primedTimeline()

    expect(() => timeline.stopInterval(99)).not.toThrow()
  })
})

describe('stop', () => {
  test('stops playing sounds, clears the queue and closes the context', async () => {
    const timeline = primedTimeline()
    const playing = await soundFor(timeline)
    const queued = await soundFor(timeline)
    timeline.scheduleSound(playing, 0)
    timeline.tick()
    await settle()
    timeline.scheduleSound(queued, 100)

    timeline.stop()

    expect(playing.isPlaying).toBe(false)
    expect(timeline.soundQueue.isEmpty()).toBe(true)
    expect(timeline.isPlaying).toBe(false)
    expect(timeline.context.state).toBe('closed')
  })

  // Lookahead means sounds can be sitting on the audio clock waiting to fire.
  // They are out of the queue by then, so stop() has to cancel them directly or
  // they play after the timeline has stopped.
  test('cancels sounds already handed to the audio clock', async () => {
    const timeline = primedTimeline({ lookahead: 5 })
    const sound = await soundFor(timeline)
    timeline.scheduleSound(sound, 3)
    timeline.tick()
    await settle()

    const source = sound.source
    expect(source.startCalls[0].when).toBe(3)

    timeline.stop()

    expect(source.stopCalls.length).toBe(1)
    expect(sound.isPlaying).toBe(false)
  })

  test('stops the scheduler', async () => {
    const timeline = new Timeline({ tickInterval: 0.01 })
    await timeline.start()
    let loops = 0
    timeline.events.on('loop', () => loops++)
    await new Promise(resolve => setTimeout(resolve, 30))

    timeline.stop()
    const atStop = loops
    await new Promise(resolve => setTimeout(resolve, 30))

    expect(loops).toBe(atStop)
  })

  test('clears any running intervals', async () => {
    const timeline = primedTimeline()
    let ticks = 0
    timeline.startInterval(0.01, () => ticks++)

    timeline.stop()
    const atStop = ticks
    await new Promise(resolve => setTimeout(resolve, 30))

    expect(ticks).toBe(atStop)
    expect(timeline.intervalIDs).toEqual({})
  })

  test('triggers the stop event', () => {
    const timeline = primedTimeline()
    let stopped = 0
    timeline.events.on('stop', () => stopped++)

    timeline.stop()

    expect(stopped).toBe(1)
  })
})
