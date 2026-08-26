import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import Sound from '../src/core/Sound.js'
import Group from '../src/core/Group.js'
import {
  MockAudioContext,
  captureConsole,
  hasEdge,
  pathExists,
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

describe('monophonic by default', () => {
  test('polyphony defaults to 1', () => {
    expect(bufferedSound().polyphony).toBe(1)
  })

  // The pre-existing behaviour, kept as the default so nothing changes for code
  // that does not ask for overlap.
  test('a second play restarts rather than layering', async () => {
    const sound = bufferedSound()
    await sound.play()
    const first = sound.source
    await sound.play()

    expect(sound.voices.length).toBe(1)
    expect(sound.source).not.toBe(first)
    expect(first.stopCalls.length).toBe(1)
  })

  test('the replaced voice is disconnected', async () => {
    const sound = bufferedSound()
    await sound.play()
    const first = sound.voices[0]
    await sound.play()

    expect(first.ended).toBe(true)
    expect(hasEdge(first.gainNode, sound.gainNode)).toBe(false)
  })
})

describe('overlapping voices', () => {
  test('plays several instances at once', async () => {
    const sound = bufferedSound({ polyphony: 4 })
    await sound.play()
    await sound.play()
    await sound.play()

    expect(sound.voices.length).toBe(3)
    expect(sound.isPlaying).toBe(true)
  })

  test('each voice gets its own source and gain node', async () => {
    const sound = bufferedSound({ polyphony: 3 })
    await sound.play()
    await sound.play()
    const [one, two] = sound.voices

    expect(one.source).not.toBe(two.source)
    expect(one.gainNode).not.toBe(two.gainNode)
  })

  test('every voice reaches the destination', async () => {
    const sound = bufferedSound({ polyphony: 3 })
    await sound.play()
    await sound.play()

    for (const voice of sound.voices) {
      expect(hasEdge(voice.source, voice.gainNode)).toBe(true)
      expect(hasEdge(voice.gainNode, sound.gainNode)).toBe(true)
      expect(pathExists(voice.source, context.destination)).toBe(true)
    }
  })

  // The reason each voice needs a gain node of its own: a shared one would have
  // the second hit's attack restart the first hit mid-flight.
  test('each voice runs its own envelope', async () => {
    const sound = bufferedSound({ polyphony: 2, attack: 0.1 })
    await sound.play()
    context.currentTime = 5
    await sound.play()
    const [one, two] = sound.voices

    expect(one.gainNode.gain.automation).toEqual([
      { type: 'setValueAtTime', value: 0, time: 0 },
      { type: 'linearRampToValueAtTime', value: 1, time: 0.1 }
    ])
    expect(two.gainNode.gain.automation).toEqual([
      { type: 'setValueAtTime', value: 0, time: 5 },
      { type: 'linearRampToValueAtTime', value: 1, time: 5.1 }
    ])
  })

  test('overlapping voices start at their own scheduled times', async () => {
    const sound = bufferedSound({ polyphony: 3 })
    await sound.play(false, 1)
    await sound.play(false, 1.5)
    await sound.play(false, 2)

    expect(sound.voices.map(voice => voice.source.startCalls[0].when)).toEqual([1, 1.5, 2])
  })

  test('volume applies to every voice at once', async () => {
    const sound = bufferedSound({ polyphony: 3, volume: 0.5 })
    await sound.play()
    await sound.play()

    sound.volume = 0.2

    // Volume lives downstream of the voices, so one node governs them all.
    expect(sound.gainNode.gain.value).toBe(0.2)
    for (const voice of sound.voices) {
      expect(hasEdge(voice.gainNode, sound.gainNode)).toBe(true)
    }
  })
})

describe('voice stealing', () => {
  test('the oldest voice is cut when the limit is reached', async () => {
    const sound = bufferedSound({ polyphony: 2 })
    await sound.play()
    const oldest = sound.voices[0]
    await sound.play()
    await sound.play()

    expect(sound.voices.length).toBe(2)
    expect(oldest.ended).toBe(true)
    expect(sound.voices).not.toContain(oldest)
  })

  test('a stolen voice releases its nodes', async () => {
    const sound = bufferedSound({ polyphony: 1 })
    await sound.play()
    const stolen = sound.voices[0]
    await sound.play()

    expect(stolen.source.stopCalls.length).toBe(1)
    expect(hasEdge(stolen.source, stolen.gainNode)).toBe(false)
    expect(hasEdge(stolen.gainNode, sound.gainNode)).toBe(false)
  })

  test('lowering polyphony cuts the excess immediately', async () => {
    const sound = bufferedSound({ polyphony: 4 })
    await sound.play()
    await sound.play()
    await sound.play()

    sound.polyphony = 1

    expect(sound.voices.length).toBe(1)
  })

  test('raising polyphony allows more overlap', async () => {
    const sound = bufferedSound({ polyphony: 1 })
    await sound.play()
    sound.polyphony = 3
    await sound.play()
    await sound.play()

    expect(sound.voices.length).toBe(3)
  })
})

describe('lifecycle', () => {
  test('isPlaying stays true until the last voice ends', async () => {
    const sound = bufferedSound({ polyphony: 3 })
    await sound.play()
    await sound.play()
    const [one, two] = sound.voices

    one.source.onended()
    expect(sound.isPlaying).toBe(true)

    two.source.onended()
    expect(sound.isPlaying).toBe(false)
    expect(sound.source).toBe(null)
  })

  test('a finished voice is removed from the list', async () => {
    const sound = bufferedSound({ polyphony: 3 })
    await sound.play()
    await sound.play()
    const [one] = sound.voices

    one.source.onended()

    expect(sound.voices.length).toBe(1)
    expect(sound.voices).not.toContain(one)
  })

  test('stop cuts every voice', async () => {
    const sound = bufferedSound({ polyphony: 3 })
    await sound.play()
    await sound.play()
    const voices = sound.voices

    sound.stop()

    expect(sound.voices).toEqual([])
    expect(sound.isPlaying).toBe(false)
    expect(voices.every(voice => voice.ended)).toBe(true)
  })

  test('clearBuffer waits for the last voice', async () => {
    const sound = bufferedSound({ polyphony: 2, clearBuffer: true })
    const buffer = sound.audioBuffer
    await sound.play()
    await sound.play()
    const [one, two] = sound.voices

    one.source.onended()
    expect(sound.audioBuffer).toBe(buffer)

    two.source.onended()
    expect(sound.audioBuffer).toBe(null)
  })

  test('stopping a voice scheduled but not yet started does not throw', async () => {
    const sound = bufferedSound({ polyphony: 1 })
    await sound.play(false, 100)

    expect(() => sound.stop()).not.toThrow()
  })

  test('a clone carries the polyphony setting', async () => {
    const original = bufferedSound({ polyphony: 6 })
    await original.initialized
    const copy = original.clone()
    await copy.initialized

    expect(copy.polyphony).toBe(6)
  })
})

describe('inside a group', () => {
  test('overlapping voices stay routed through the group', async () => {
    const group = new Group(context)
    const sound = bufferedSound({ polyphony: 3 })
    await sound.initialized
    group.addSounds([sound])

    await group.play()
    await sound.play(true)

    expect(sound.voices.length).toBe(2)
    for (const voice of sound.voices) {
      expect(hasEdge(voice.gainNode, sound.gainNode)).toBe(true)
      expect(pathExists(voice.source, context.destination)).toBe(true)
    }
    expect(hasEdge(sound.gainNode, group.gainNode)).toBe(true)
  })
})
