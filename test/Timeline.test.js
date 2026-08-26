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

describe('musical time', () => {
  test('defaults to 120bpm in 4/4', () => {
    const timeline = primedTimeline()

    expect(timeline.bpm).toBe(120)
    expect(timeline.beatsPerBar).toBe(4)
  })

  test('takes tempo from the constructor', () => {
    const timeline = primedTimeline({ bpm: 90, beatsPerBar: 3 })

    expect(timeline.bpm).toBe(90)
    expect(timeline.beatsPerBar).toBe(3)
  })

  test('at() maps bar and beat to a beat number', () => {
    const timeline = primedTimeline({ beatsPerBar: 4 })

    expect(timeline.at(0)).toBe(0)
    expect(timeline.at(2)).toBe(8)
    expect(timeline.at(2, 3)).toBe(11)
  })

  test('currentBeat and currentBar follow the audio clock', () => {
    const timeline = primedTimeline({ bpm: 120 })
    timeline.context.currentTime = 5     // ten beats at 120bpm

    expect(timeline.currentBeat).toBe(10)
    expect(timeline.currentBar).toBe(2.5)
  })

  test('nextBeat and nextBar are always ahead of now', () => {
    const timeline = primedTimeline({ bpm: 120 })
    timeline.context.currentTime = 2.25  // beat 4.5, bar 1.125

    expect(timeline.nextBeat()).toBe(5)
    expect(timeline.nextBeat(2)).toBe(6)
    expect(timeline.nextBar()).toBe(8)

    // Exactly on a boundary still resolves to the next one, never to now.
    timeline.context.currentTime = 2     // beat 4 exactly
    expect(timeline.nextBeat()).toBe(5)
  })
})

describe('scheduling in beats', () => {
  test('queues a sound at a beat', async () => {
    const timeline = primedTimeline()
    const sound = await soundFor(timeline)

    timeline.scheduleBeat(sound, 16)

    expect(timeline.beatQueue.peek().priority).toBe(16)
    expect(timeline.soundQueue.isEmpty()).toBe(true)
  })

  test('scheduleBar converts through the time signature', async () => {
    const timeline = primedTimeline({ beatsPerBar: 4 })
    const sound = await soundFor(timeline)

    timeline.scheduleBar(sound, 3, 2)

    expect(timeline.beatQueue.peek().priority).toBe(14)
  })

  test('starts a beat-scheduled sound at the right audio time', async () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 2 })
    const sound = await soundFor(timeline)

    timeline.scheduleBeat(sound, 3)      // 1.5s at 120bpm
    timeline.tick()
    await settle()

    expect(sound.source.startCalls[0].when).toBe(1.5)
  })

  test('reports both time and beat on the scheduled and play events', async () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 2 })
    const sound = await soundFor(timeline)
    const scheduled = []
    const played = []
    timeline.events.on('scheduled', (s, time, beat) => scheduled.push({ time, beat }))
    timeline.events.on('play', (s, time, beat) => played.push({ time, beat }))

    timeline.scheduleBeat(sound, 2)
    timeline.tick()
    await settle()

    expect(scheduled).toEqual([{ time: 1, beat: 2 }])
    expect(played).toEqual([{ time: 1, beat: 2 }])
  })

  test('leaves beats beyond the lookahead queued', async () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 2 })
    const soon = await soundFor(timeline)
    const later = await soundFor(timeline)

    timeline.scheduleBeat(soon, 2)       // 1s
    timeline.scheduleBeat(later, 64)     // 32s
    timeline.tick()
    await settle()

    expect(soon.isPlaying).toBe(true)
    expect(later.isPlaying).toBe(false)
    expect(timeline.beatQueue.peek().item.sound).toBe(later)
  })

  test('rescheduleBeat moves a sound instead of duplicating it', async () => {
    const timeline = primedTimeline()
    const sound = await soundFor(timeline)
    timeline.scheduleBeat(sound, 8)

    timeline.rescheduleBeat(sound, 32)

    const entries = []
    while (!timeline.beatQueue.isEmpty()) entries.push(timeline.beatQueue.dequeue())

    expect(entries.length).toBe(1)
    expect(entries[0].beat).toBe(32)
  })

  test('beat and second scheduling interleave in playback order', async () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 5 })
    const onBeat = await soundFor(timeline)
    const onClock = await soundFor(timeline)
    const order = []
    timeline.events.on('play', (sound, time) => order.push(time))

    timeline.scheduleBeat(onBeat, 4)       // 2s
    timeline.scheduleSound(onClock, 1)     // 1s
    timeline.tick()
    await settle()

    expect(order).toEqual([1, 2])
  })

  test('drops beats that are too late, like the seconds queue', async () => {
    const timeline = primedTimeline({ bpm: 120, maxLateness: 1 })
    const sound = await soundFor(timeline)
    const missed = []
    timeline.events.on('missed', (s, time, beat) => missed.push(beat))

    timeline.scheduleBeat(sound, 0)
    timeline.context.currentTime = 60
    timeline.tick()
    await settle()

    expect(missed).toEqual([0])
    expect(sound.isPlaying).toBe(false)
  })
})

describe('tempo changes during playback', () => {
  // Queued beats convert to seconds only when they come due, so a tempo change
  // moves everything still waiting.
  test('move sounds still in the queue', async () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 1 })
    const sound = await soundFor(timeline)
    timeline.scheduleBeat(sound, 8)      // 4s at 120bpm

    timeline.bpm = 60                    // now 8s away
    timeline.context.currentTime = 3.5
    timeline.tick()
    await settle()

    expect(sound.isPlaying).toBe(false)  // no longer due at 4s

    timeline.context.currentTime = 7.5
    timeline.tick()
    await settle()

    expect(sound.source.startCalls[0].when).toBe(8)
  })

  test('do not move sounds already handed to the audio clock', async () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 5 })
    const sound = await soundFor(timeline)
    timeline.scheduleBeat(sound, 4)      // 2s, inside the lookahead
    timeline.tick()
    await settle()

    expect(sound.source.startCalls[0].when).toBe(2)

    timeline.bpm = 60

    // Committed: the source is already started at 2s and cannot be recalled.
    expect(sound.source.startCalls[0].when).toBe(2)
  })

  test('leave the current position unchanged', () => {
    const timeline = primedTimeline({ bpm: 120 })
    timeline.context.currentTime = 2     // beat 4

    timeline.bpm = 60

    expect(timeline.currentBeat).toBe(4)
    timeline.context.currentTime = 3
    expect(timeline.currentBeat).toBe(5)
  })
})

describe('everyBeat', () => {
  test('calls back on the beat grid with the exact time', () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 2 })
    const fired = []
    timeline.everyBeat(1, (time, beat) => fired.push({ time, beat }))

    timeline.tick()

    // Lookahead of 2s at 120bpm reaches beat 4.
    expect(fired).toEqual([
      { time: 0, beat: 0 },
      { time: 0.5, beat: 1 },
      { time: 1, beat: 2 },
      { time: 1.5, beat: 3 },
      { time: 2, beat: 4 }
    ])
  })

  test('does not repeat a grid point across ticks', () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 2 })
    const fired = []
    timeline.everyBeat(1, (time, beat) => fired.push(beat))

    timeline.tick()
    timeline.context.currentTime = 1
    timeline.tick()

    expect(fired).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  test('honours a subdivision', () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 1 })
    const fired = []
    timeline.everyBeat(0.25, (time, beat) => fired.push(beat))

    timeline.tick()

    expect(fired).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2])
  })

  test('follows a tempo change', () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 1 })
    const fired = []
    timeline.everyBeat(1, time => fired.push(time))

    timeline.tick()                      // beats 0..2 at 0, 0.5, 1
    timeline.context.currentTime = 1     // now at beat 2
    timeline.bpm = 60
    timeline.tick()

    // From beat 2 (at 1s) a beat is a full second, so beat 3 lands at 2s.
    expect(fired).toEqual([0, 0.5, 1, 2])
  })

  test('starts from a given beat when asked', () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 2 })
    const fired = []
    timeline.everyBeat(2, (time, beat) => fired.push(beat), 1)

    timeline.tick()

    expect(fired).toEqual([1, 3])
  })

  test('stopEveryBeat cancels it', () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 1 })
    let fired = 0
    const id = timeline.everyBeat(1, () => fired++)

    timeline.tick()
    const afterFirst = fired
    expect(timeline.stopEveryBeat(id)).toBe(true)

    timeline.context.currentTime = 10
    timeline.tick()

    expect(fired).toBe(afterFirst)
    expect(timeline.stopEveryBeat(id)).toBe(false)
  })

  test('rejects a non-positive interval', () => {
    const timeline = primedTimeline()

    expect(() => timeline.everyBeat(0, () => {})).toThrow('greater than 0')
    expect(() => timeline.everyBeat(-1, () => {})).toThrow('greater than 0')
  })

  test('stop clears repeats', () => {
    const timeline = primedTimeline({ bpm: 120, lookahead: 1 })
    let fired = 0
    timeline.everyBeat(1, () => fired++)

    timeline.stop()
    timeline.isPlaying = true
    timeline.context.currentTime = 10
    timeline.tick()

    expect(fired).toBe(0)
  })
})
