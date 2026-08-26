import { describe, test, expect } from 'bun:test'
import Tempo from '../src/core/Tempo.js'

describe('defaults', () => {
  test('120bpm in 4/4', () => {
    const tempo = new Tempo()

    expect(tempo.bpm).toBe(120)
    expect(tempo.beatsPerBar).toBe(4)
  })

  test('takes bpm and beatsPerBar from options', () => {
    const tempo = new Tempo({ bpm: 90, beatsPerBar: 3 })

    expect(tempo.bpm).toBe(90)
    expect(tempo.beatsPerBar).toBe(3)
  })
})

describe('conversion', () => {
  test('a beat at 120bpm is half a second', () => {
    const tempo = new Tempo({ bpm: 120 })

    expect(tempo.beatsToSeconds(1)).toBe(0.5)
    expect(tempo.beatsToSeconds(8)).toBe(4)
    expect(tempo.secondsToBeats(0.5)).toBe(1)
    expect(tempo.secondsToBeats(4)).toBe(8)
  })

  test('a beat at 60bpm is a second', () => {
    const tempo = new Tempo({ bpm: 60 })

    expect(tempo.beatsToSeconds(1)).toBe(1)
    expect(tempo.beatToTime(4)).toBe(4)
  })

  test('beat and time round-trip', () => {
    const tempo = new Tempo({ bpm: 137 })

    for (const beat of [0, 1, 3.5, 64, 999.25]) {
      expect(tempo.timeToBeat(tempo.beatToTime(beat))).toBeCloseTo(beat, 10)
    }
  })

  test('bars convert to beats by the time signature', () => {
    const tempo = new Tempo({ beatsPerBar: 4 })

    expect(tempo.barToBeat(0)).toBe(0)
    expect(tempo.barToBeat(1)).toBe(4)
    expect(tempo.barToBeat(2, 2)).toBe(10)
    expect(tempo.beatToBar(12)).toBe(3)
  })

  test('honours an odd time signature', () => {
    const tempo = new Tempo({ beatsPerBar: 7 })

    expect(tempo.barToBeat(3)).toBe(21)
    expect(tempo.beatToBar(21)).toBe(3)
  })
})

describe('anchoring', () => {
  test('reset places a beat at a time', () => {
    const tempo = new Tempo({ bpm: 120 })
    tempo.reset(10)

    expect(tempo.beatToTime(0)).toBe(10)
    expect(tempo.beatToTime(2)).toBe(11)
    expect(tempo.timeToBeat(10)).toBe(0)
  })

  test('reset can place a non-zero beat', () => {
    const tempo = new Tempo({ bpm: 120 })
    tempo.reset(10, 8)

    expect(tempo.beatToTime(8)).toBe(10)
    expect(tempo.beatToTime(9)).toBe(10.5)
  })
})

describe('tempo changes', () => {
  // The reason the mapping is an anchor rather than a multiplication from zero:
  // a beat that has already been played must keep the time it was played at.
  test('beats already elapsed keep their times', () => {
    const tempo = new Tempo({ bpm: 120 })
    const beatFourWas = tempo.beatToTime(4)   // 2s

    tempo.setBpm(60, 2)                       // double the beat length at 2s

    expect(tempo.beatToTime(4)).toBe(beatFourWas)
    expect(tempo.timeToBeat(2)).toBe(4)
  })

  test('later beats stretch to the new tempo', () => {
    const tempo = new Tempo({ bpm: 120 })
    tempo.setBpm(60, 2)

    // From beat 4 onward a beat is a full second rather than half of one.
    expect(tempo.beatToTime(5)).toBe(3)
    expect(tempo.beatToTime(6)).toBe(4)
  })

  test('speeding up compresses later beats', () => {
    const tempo = new Tempo({ bpm: 120 })
    tempo.setBpm(240, 2)

    expect(tempo.beatToTime(4)).toBe(2)
    expect(tempo.beatToTime(8)).toBe(3)
  })

  test('successive changes compose', () => {
    const tempo = new Tempo({ bpm: 120 })
    tempo.setBpm(60, 2)     // at beat 4
    tempo.setBpm(120, 4)    // two seconds later, at beat 6

    expect(tempo.timeToBeat(4)).toBe(6)
    expect(tempo.beatToTime(8)).toBe(5)
  })

  test('rejects a tempo of zero or less', () => {
    const tempo = new Tempo()

    expect(() => tempo.setBpm(0)).toThrow('bpm must be greater than 0')
    expect(() => tempo.setBpm(-120)).toThrow('bpm must be greater than 0')
  })

  test('a change with no elapsed time simply replaces the tempo', () => {
    const tempo = new Tempo({ bpm: 120 })
    tempo.setBpm(90, 0)

    expect(tempo.bpm).toBe(90)
    expect(tempo.beatToTime(0)).toBe(0)
    expect(tempo.beatsToSeconds(1)).toBeCloseTo(60 / 90, 10)
  })
})
