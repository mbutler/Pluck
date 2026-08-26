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

/** A timeline with a context in place, without entering the rAF loop. */
const startedTimeline = () => {
  const timeline = new Timeline()
  timeline.context = new MockAudioContext()
  timeline.isPlaying = true
  return timeline
}

const soundFor = timeline =>
  new Sound({ context: timeline.context, audioBuffer: { sampleRate: 44100 } })

describe('scheduling', () => {
  test('queues a sound at a time', () => {
    const timeline = startedTimeline()
    const sound = soundFor(timeline)

    timeline.scheduleSound(sound, 5)

    expect(timeline.soundQueue.peek().priority).toBe(5)
    expect(timeline.soundQueue.peek().item.sound).toBe(sound)
  })

  test('triggers the scheduled event', () => {
    const timeline = startedTimeline()
    const sound = soundFor(timeline)
    const seen = []
    timeline.events.on('scheduled', (s, time) => seen.push({ s, time }))

    timeline.scheduleSound(sound, 3)

    expect(seen).toEqual([{ s: sound, time: 3 }])
  })

  test('orders sounds by time, not insertion order', () => {
    const timeline = startedTimeline()
    const late = soundFor(timeline)
    const early = soundFor(timeline)

    timeline.scheduleSound(late, 10)
    timeline.scheduleSound(early, 1)

    expect(timeline.soundQueue.dequeue().sound).toBe(early)
    expect(timeline.soundQueue.dequeue().sound).toBe(late)
  })

  // Regression: remove() never matched the { sound, time } wrapper, so the old
  // entry stayed queued and the sound played at both times.
  test('rescheduling moves a sound instead of duplicating it', () => {
    const timeline = startedTimeline()
    const sound = soundFor(timeline)
    timeline.scheduleSound(sound, 5)

    timeline.rescheduleSound(sound, 12)

    const entries = []
    while (!timeline.soundQueue.isEmpty()) entries.push(timeline.soundQueue.dequeue())

    expect(entries.length).toBe(1)
    expect(entries[0].time).toBe(12)
  })

  test('rescheduling leaves other sounds alone', () => {
    const timeline = startedTimeline()
    const moved = soundFor(timeline)
    const other = soundFor(timeline)
    timeline.scheduleSound(moved, 5)
    timeline.scheduleSound(other, 7)

    timeline.rescheduleSound(moved, 20)

    expect(timeline.soundQueue.dequeue().sound).toBe(other)
    expect(timeline.soundQueue.dequeue().sound).toBe(moved)
  })

  test('playNow queues at the current time', () => {
    const timeline = startedTimeline()
    timeline.currentTime = 4
    const sound = soundFor(timeline)

    timeline.playNow(sound)

    expect(timeline.soundQueue.peek().priority).toBe(4)
  })

  test('future offsets from the current time', () => {
    const timeline = startedTimeline()
    timeline.currentTime = 10

    expect(timeline.future(5)).toBe(15)
  })

  test('addSound loads a file before queueing it', async () => {
    const timeline = startedTimeline()

    await timeline.addSound('snd.mp3', 8, { context: timeline.context })

    expect(calls.fetch).toEqual(['snd.mp3'])
    expect(timeline.soundQueue.peek().priority).toBe(8)
    expect(timeline.soundQueue.peek().item.sound.audioBuffer).toBeTruthy()
  })
})

describe('loop', () => {
  test('plays everything already due and leaves the rest queued', async () => {
    const timeline = startedTimeline()
    const due = soundFor(timeline)
    const later = soundFor(timeline)
    await due.initialized
    await later.initialized

    timeline.scheduleSound(due, 0)
    timeline.scheduleSound(later, 100)
    timeline.context.currentTime = 0

    await timeline.loop()

    expect(due.isPlaying).toBe(true)
    expect(later.isPlaying).toBe(false)
    expect(timeline.soundQueue.peek().item.sound).toBe(later)
  })

  test('does nothing once stopped', async () => {
    const timeline = startedTimeline()
    const sound = soundFor(timeline)
    await sound.initialized
    timeline.scheduleSound(sound, 0)
    timeline.isPlaying = false

    await timeline.loop()

    expect(sound.isPlaying).toBe(false)
  })

  test('triggers play and loop events', async () => {
    const timeline = startedTimeline()
    const sound = soundFor(timeline)
    await sound.initialized
    timeline.scheduleSound(sound, 0)

    const played = []
    let loops = 0
    timeline.events.on('play', s => played.push(s))
    timeline.events.on('loop', () => loops++)

    await timeline.loop()

    expect(played).toEqual([sound])
    expect(loops).toBe(1)
  })
})

describe('intervals', () => {
  test('runs a callback on an interval and stops on request', async () => {
    const timeline = startedTimeline()
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
    const timeline = startedTimeline()

    expect(() => timeline.stopInterval(99)).not.toThrow()
  })
})

describe('stop', () => {
  test('stops playing sounds, clears the queue and closes the context', async () => {
    const timeline = startedTimeline()
    const sound = soundFor(timeline)
    await sound.initialized
    await sound.play()
    timeline.scheduleSound(sound, 0)

    timeline.stop()

    expect(sound.isPlaying).toBe(false)
    expect(timeline.soundQueue.isEmpty()).toBe(true)
    expect(timeline.isPlaying).toBe(false)
    expect(timeline.context.state).toBe('closed')
  })

  test('clears any running intervals', async () => {
    const timeline = startedTimeline()
    let ticks = 0
    timeline.startInterval(0.01, () => ticks++)

    timeline.stop()
    const atStop = ticks
    await new Promise(resolve => setTimeout(resolve, 30))

    expect(ticks).toBe(atStop)
    expect(timeline.intervalIDs).toEqual({})
  })

  test('triggers the stop event', () => {
    const timeline = startedTimeline()
    let stopped = 0
    timeline.events.on('stop', () => stopped++)

    timeline.stop()

    expect(stopped).toBe(1)
  })
})
