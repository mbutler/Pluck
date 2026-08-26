import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import Sound from '../src/core/Sound.js'
import {
  MockAudioContext,
  captureConsole,
  resetMocks
} from './mocks/MockAudioContext.js'

let context
let console_

beforeEach(() => {
  resetMocks()
  context = new MockAudioContext()
  console_ = captureConsole()
})

afterEach(() => console_.restore())

const bufferedSound = (options = {}) =>
  new Sound({ context, audioBuffer: { sampleRate: 44100 }, ...options })

const waveSound = (options = {}) =>
  new Sound({ context, wave: { type: 'sine', frequency: 440 }, ...options })

describe('playbackRate', () => {
  test('defaults to 1 and is copied onto a buffer source', async () => {
    const sound = bufferedSound()
    await sound.play()

    expect(sound.playbackRate).toBe(1)
    expect(sound.source.playbackRate.value).toBe(1)
  })

  test('an option sets the rate of every new voice', async () => {
    const sound = bufferedSound({ playbackRate: 1.5, polyphony: 2 })
    await sound.play()
    await sound.play()

    expect(sound.voices.every(voice => voice.source.playbackRate.value === 1.5)).toBe(true)
  })

  test('play() can override the rate per voice', async () => {
    const sound = bufferedSound({ polyphony: 2 })
    await sound.play({ playbackRate: 0.5 })
    await sound.play({ playbackRate: 2 })
    const [low, high] = sound.voices

    expect(low.source.playbackRate.value).toBe(0.5)
    expect(high.source.playbackRate.value).toBe(2)
    expect(sound.playbackRate).toBe(1)
  })

  test('setting it writes through to sounding voices', async () => {
    const sound = bufferedSound({ polyphony: 2 })
    await sound.play()
    await sound.play()

    sound.playbackRate = 0.75

    expect(sound.playbackRate).toBe(0.75)
    expect(sound.voices.every(voice => voice.source.playbackRate.value === 0.75)).toBe(true)
  })

  test('a clone carries the rate', async () => {
    const original = bufferedSound({ playbackRate: 1.25 })
    await original.initialized
    const copy = original.clone()
    await copy.play()

    expect(copy.playbackRate).toBe(1.25)
    expect(copy.source.playbackRate.value).toBe(1.25)
  })

  test('rampPlaybackRateTo schedules on every sounding voice', async () => {
    const sound = bufferedSound({ polyphony: 2 })
    await sound.play()
    await sound.play()
    sound.source.playbackRate.automation.length = 0

    sound.rampPlaybackRateTo(2, 3)

    expect(sound.playbackRate).toBe(2)
    for (const voice of sound.voices) {
      expect(voice.source.playbackRate.automation).toEqual([
        { type: 'cancelScheduledValues', time: 0 },
        { type: 'setValueAtTime', value: 1, time: 0 },
        { type: 'linearRampToValueAtTime', value: 2, time: 3 }
      ])
    }
  })
})

describe('detune', () => {
  test('defaults to 0 cents and is copied onto buffer and oscillator sources', async () => {
    const sample = bufferedSound({ detune: 100 })
    const tone = waveSound({ detune: -50 })
    await sample.play()
    await tone.play()

    expect(sample.source.detune.value).toBe(100)
    expect(tone.source.detune.value).toBe(-50)
  })

  test('play() can detune one voice without moving the rest', async () => {
    const sound = bufferedSound({ polyphony: 2 })
    await sound.play()
    await sound.play({ detune: 700 })
    const [concert, sharp] = sound.voices

    expect(concert.source.detune.value).toBe(0)
    expect(sharp.source.detune.value).toBe(700)
  })

  test('setting it writes through to sounding oscillators', async () => {
    const sound = waveSound()
    await sound.play()

    sound.detune = 200

    expect(sound.source.detune.value).toBe(200)
  })

  test('rampDetuneTo schedules on sounding voices', async () => {
    const sound = bufferedSound()
    await sound.play()

    sound.rampDetuneTo(1200, 0.5)

    expect(sound.detune).toBe(1200)
    expect(sound.source.detune.automation).toEqual([
      { type: 'cancelScheduledValues', time: 0 },
      { type: 'setValueAtTime', value: 0, time: 0 },
      { type: 'linearRampToValueAtTime', value: 1200, time: 0.5 }
    ])
  })
})

describe('frequency', () => {
  test('a wave option is the live frequency', async () => {
    const sound = new Sound({ context, wave: { type: 'square', frequency: 220 } })
    await sound.initialized

    expect(sound.frequency).toBe(220)
    await sound.play()
    expect(sound.source.frequency.value).toBe(220)
  })

  test('frequency can be set without a wave object', async () => {
    const sound = new Sound({ context, frequency: 110 })
    await sound.play()

    expect(sound.source.type).toBe('sine')
    expect(sound.source.frequency.value).toBe(110)
  })

  test('setting it retunes a sounding oscillator without rebuilding it', async () => {
    const sound = waveSound()
    await sound.play()
    const source = sound.source

    sound.frequency = 880

    expect(sound.source).toBe(source)
    expect(source.frequency.value).toBe(880)
    expect(sound.frequency).toBe(880)
  })

  test('a later voice uses the updated frequency', async () => {
    const sound = waveSound({ polyphony: 2 })
    await sound.play()
    sound.frequency = 330
    await sound.play()

    expect(sound.voices[1].source.frequency.value).toBe(330)
  })

  test('play() can override frequency per voice', async () => {
    const sound = waveSound({ polyphony: 2 })
    await sound.play({ frequency: 220 })
    await sound.play({ frequency: 440 })

    expect(sound.voices[0].source.frequency.value).toBe(220)
    expect(sound.voices[1].source.frequency.value).toBe(440)
    expect(sound.frequency).toBe(440)
  })

  test('rampFrequencyTo glides a sounding oscillator', async () => {
    const sound = waveSound()
    await sound.play()

    sound.rampFrequencyTo(880, 2)

    expect(sound.frequency).toBe(880)
    expect(sound.source.frequency.automation).toEqual([
      { type: 'cancelScheduledValues', time: 0 },
      { type: 'setValueAtTime', value: 440, time: 0 },
      { type: 'linearRampToValueAtTime', value: 880, time: 2 }
    ])
  })

  test('a clone of a retuned oscillator keeps the new frequency', async () => {
    const original = waveSound()
    original.frequency = 523.25
    const copy = original.clone()
    await copy.play()

    expect(copy.frequency).toBe(523.25)
    expect(copy.source.frequency.value).toBe(523.25)
  })

  test('a buffer source ignores frequency', async () => {
    const sound = bufferedSound()
    await sound.play()
    sound.frequency = 1000

    expect(sound.source.frequency).toBeUndefined()
    expect(console_.messages.error).toEqual([])
  })
})
