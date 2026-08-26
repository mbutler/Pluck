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
    await sound.play({ when: 1 })
    await sound.play({ when: 1.5 })
    await sound.play({ when: 2 })

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
    await sound.play({ when: 100 })

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
    await sound.play({ fromGroup: true })

    expect(sound.voices.length).toBe(2)
    for (const voice of sound.voices) {
      expect(hasEdge(voice.gainNode, sound.gainNode)).toBe(true)
      expect(pathExists(voice.source, context.destination)).toBe(true)
    }
    expect(hasEdge(sound.gainNode, group.gainNode)).toBe(true)
  })
})

describe('ended event', () => {
  test('fires when the last voice finishes on its own', async () => {
    const sound = bufferedSound()
    const ended = []
    sound.events.on('ended', s => ended.push(s))
    await sound.play()

    sound.source.onended()

    expect(ended).toEqual([sound])
  })

  test('does not fire while other voices are still ringing', async () => {
    const sound = bufferedSound({ polyphony: 3 })
    let ended = 0
    sound.events.on('ended', () => ended++)
    await sound.play()
    await sound.play()
    await sound.play()
    const voices = sound.voices

    voices[0].source.onended()
    voices[1].source.onended()
    expect(ended).toBe(0)

    voices[2].source.onended()
    expect(ended).toBe(1)
  })

  test('fires once, not once per voice', async () => {
    const sound = bufferedSound({ polyphony: 4 })
    let ended = 0
    sound.events.on('ended', () => ended++)
    await sound.play()
    await sound.play()

    sound.stop()

    expect(ended).toBe(1)
  })

  // A listener should see the sound settled, not half torn down.
  test('the sound is fully stopped by the time it fires', async () => {
    const sound = bufferedSound({ clearBuffer: true })
    let state = null
    sound.events.on('ended', s => {
      state = { isPlaying: s.isPlaying, source: s.source, voices: s.voices.length, buffer: s.audioBuffer }
    })
    await sound.play()

    sound.source.onended()

    expect(state).toEqual({ isPlaying: false, source: null, voices: 0, buffer: null })
  })

  test('fires on an explicit stop, after the stop event', async () => {
    const sound = bufferedSound()
    const seen = []
    sound.events.on('stop', () => seen.push('stop'))
    sound.events.on('ended', () => seen.push('ended'))
    await sound.play()

    sound.stop()

    expect(seen).toEqual(['stop', 'ended'])
  })

  // Voiced sounds fire 'ended' from voice teardown and live inputs fire it from
  // stop() itself; the order relative to 'stop' has to match either way.
  test('the same order holds for a microphone sound', async () => {
    const sound = new Sound({ context, input: true })
    await sound.initialized
    const seen = []
    sound.events.on('stop', () => seen.push('stop'))
    sound.events.on('ended', () => seen.push('ended'))
    await sound.play()

    sound.stop()

    expect(seen).toEqual(['stop', 'ended'])
  })

  test('stop fires even when nothing was playing, but ended does not', () => {
    const sound = bufferedSound()
    const seen = []
    sound.events.on('stop', () => seen.push('stop'))
    sound.events.on('ended', () => seen.push('ended'))

    sound.stop()

    expect(seen).toEqual(['stop'])
  })

  test('stopping a sound that was never playing does not fire ended', () => {
    const sound = bufferedSound()
    let ended = 0
    sound.events.on('ended', () => ended++)

    sound.stop()

    expect(ended).toBe(0)
  })

  // A live input has no voices, so nothing retires to announce the end.
  test('fires for a microphone sound on stop', async () => {
    const sound = new Sound({ context, input: true })
    await sound.initialized
    let ended = 0
    sound.events.on('ended', () => ended++)
    await sound.play()

    sound.stop()

    expect(ended).toBe(1)
  })

  // Replaying a monophonic sound steals the old voice, but the sound never
  // stopped sounding, so announcing an end between the two would be wrong.
  test('a monophonic replay does not fire ended', async () => {
    const sound = bufferedSound({ polyphony: 1 })
    const seen = []
    sound.events.on('play', () => seen.push('play'))
    sound.events.on('ended', () => seen.push('ended'))

    await sound.play()
    await sound.play()
    await sound.play()

    expect(seen).toEqual(['play', 'play', 'play'])
    expect(sound.isPlaying).toBe(true)
  })

  test('voice stealing at a higher polyphony does not fire ended either', async () => {
    const sound = bufferedSound({ polyphony: 2 })
    let ended = 0
    sound.events.on('ended', () => ended++)

    await sound.play()
    await sound.play()
    await sound.play()   // steals the oldest

    expect(ended).toBe(0)
    expect(sound.voices.length).toBe(2)
  })

  test('fires again on a later playthrough', async () => {
    const sound = bufferedSound()
    let ended = 0
    sound.events.on('ended', () => ended++)

    await sound.play()
    sound.stop()
    await sound.play()
    sound.stop()

    expect(ended).toBe(2)
  })

  test('the play event carries the sound', async () => {
    const sound = bufferedSound()
    const played = []
    sound.events.on('play', s => played.push(s))
    await sound.play()

    expect(played).toEqual([sound])
  })

  test('a listener can be removed', async () => {
    const sound = bufferedSound()
    let ended = 0
    const listener = () => ended++
    sound.events.on('ended', listener)
    sound.events.off('ended', listener)

    await sound.play()
    sound.stop()

    expect(ended).toBe(0)
  })

  // The motivating use: chaining one sound off the end of another.
  test('supports chaining a follow-up sound', async () => {
    const first = bufferedSound()
    const second = bufferedSound()
    await second.initialized
    first.events.on('ended', () => second.play())

    await first.play()
    first.source.onended()
    await Promise.resolve()

    expect(second.isPlaying).toBe(true)
  })
})
