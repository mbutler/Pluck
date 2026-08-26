import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import Sound from '../src/core/Sound.js'
import {
  MockAudioContext,
  MockMediaStream,
  calls,
  captureConsole,
  edgesFrom,
  hasEdge,
  onFetch,
  onGetUserMedia,
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

/** A sound with a decoded buffer already in place, skipping the fetch. */
const bufferedSound = (options = {}) =>
  new Sound({ context, audioBuffer: { sampleRate: 44100 }, ...options })

describe('initialization', () => {
  test('defaults to a 440Hz sine when given no source', async () => {
    const sound = new Sound({ context })
    await sound.initialized
    await sound.play()

    expect(sound.source.type).toBe('sine')
    expect(sound.source.frequency.value).toBe(440)
  })

  // Source nodes are single-use, so building one at init only to throw it away
  // on the first play is waste. Nothing exists until there is a voice.
  test('creates no source node before playing', async () => {
    const sound = new Sound({ context, wave: { type: 'sine' } })
    await sound.initialized

    expect(sound.source).toBe(null)
    expect(sound.voices).toEqual([])
  })

  test('loads and decodes a file', async () => {
    const sound = new Sound({ context, file: 'snd.mp3' })
    await sound.initialized

    expect(calls.fetch).toEqual(['snd.mp3'])
    expect(calls.decodeAudioData.length).toBe(1)
    expect(sound.audioBuffer).toBeTruthy()
    expect(sound.fileName).toBe('snd.mp3')
  })

  test('reports a failed load without rejecting', async () => {
    onFetch(() => { throw new Error('network down') })
    const sound = new Sound({ context, file: 'missing.mp3' })
    await sound.initialized

    expect(console_.saw('error', 'Error loading sound file')).toBe(true)
    expect(sound.audioBuffer).toBe(null)
  })

  test('builds an oscillator from wave options', async () => {
    const sound = new Sound({ context, wave: { type: 'square', frequency: 220 } })
    await sound.initialized
    await sound.play()

    expect(sound.source.type).toBe('square')
    expect(sound.source.frequency.value).toBe(220)
  })

  // Regression: initSource only checked file/wave/input, so a raw buffer fell
  // through to the default sine and the buffer was never used.
  test('builds a buffer source from a supplied audioBuffer', async () => {
    const buffer = { sampleRate: 44100 }
    const sound = new Sound({ context, audioBuffer: buffer })
    await sound.initialized
    await sound.play()

    expect(sound.source.buffer).toBe(buffer)
    expect(sound.source.frequency).toBeUndefined()
  })

  test('opens a microphone input', async () => {
    const sound = new Sound({ context, input: true })
    await sound.initialized

    expect(calls.getUserMedia.length).toBe(1)
    expect(sound.mediaStream).toBeInstanceOf(MockMediaStream)
  })

  test('reports a denied microphone without rejecting', async () => {
    onGetUserMedia(() => { throw new Error('NotAllowedError') })
    const sound = new Sound({ context, input: true })
    await sound.initialized

    expect(console_.saw('error', 'Error initializing microphone input')).toBe(true)
  })

  // Regression: `{ input: true }` was stored as the media stream itself, so
  // stop() before initialization hit `true.getTracks()`.
  test('does not store `input: true` as the media stream', () => {
    const sound = new Sound({ context, input: true })

    expect(sound.mediaStream).toBe(null)
    expect(() => sound.stop()).not.toThrow()
  })

  test('applies the initial volume to the gain node', () => {
    const sound = bufferedSound({ volume: 0.25 })

    expect(sound.volume).toBe(0.25)
    expect(sound.gainNode.gain.value).toBe(0.25)
  })
})

describe('loop', () => {
  // Regression: an `async loop()` method shadowed these accessors, so `loop`
  // read back as a function and every buffer source looped forever.
  test('is a boolean, not a method', () => {
    const sound = bufferedSound()

    expect(typeof sound.loop).toBe('boolean')
    expect(sound.loop).toBe(false)
  })

  test('is copied onto the source node verbatim', async () => {
    const looping = bufferedSound({ loop: true })
    const once = bufferedSound({ loop: false })
    await looping.play()
    await once.play()

    expect(looping.source.loop).toBe(true)
    expect(once.source.loop).toBe(false)
  })

  test('is settable', () => {
    const sound = bufferedSound()
    sound.loop = true

    expect(sound.loop).toBe(true)
  })
})

describe('play', () => {
  test('starts the source and marks the sound playing', async () => {
    const sound = bufferedSound({ offset: 2 })
    await sound.play()

    expect(sound.isPlaying).toBe(true)
    expect(sound.source.startCalls).toEqual([{ when: context.currentTime, offset: 2 }])
  })

  test('routes source through the voice and sound gain to the destination', async () => {
    const sound = bufferedSound()
    await sound.play()
    const [voice] = sound.voices

    expect(hasEdge(sound.source, voice.gainNode)).toBe(true)
    expect(hasEdge(voice.gainNode, sound.gainNode)).toBe(true)
    expect(hasEdge(sound.gainNode, context.destination)).toBe(true)
    expect(pathExists(sound.source, context.destination)).toBe(true)
  })

  test('resumes a suspended context', async () => {
    context.state = 'suspended'
    const sound = bufferedSound()
    await sound.play()

    expect(context.resumeCalls).toBe(1)
    expect(context.state).toBe('running')
  })

  // Regression: the source node was reused, so a second play() hit the spec's
  // "cannot call start more than once" and the sound was silent forever after.
  test('replays a buffer sound repeatedly', async () => {
    const sound = bufferedSound()

    for (let i = 0; i < 3; i++) {
      await sound.play()
      expect(sound.isPlaying).toBe(true)
      sound.stop()
    }

    expect(console_.messages.error).toEqual([])
  })

  test('replays an oscillator, preserving its wave settings', async () => {
    const sound = new Sound({ context, wave: { type: 'sawtooth', frequency: 330 } })
    await sound.initialized

    await sound.play()
    sound.stop()
    await sound.play()

    expect(sound.source.type).toBe('sawtooth')
    expect(sound.source.frequency.value).toBe(330)
    expect(console_.messages.error).toEqual([])
  })

  test('builds a fresh source for each play', async () => {
    const sound = bufferedSound()
    await sound.play()
    const first = sound.source
    sound.stop()
    await sound.play()

    expect(sound.source).not.toBe(first)
  })

  test('leaves no dangling connection from the discarded source', async () => {
    const sound = bufferedSound()
    await sound.play()
    const first = sound.source
    sound.stop()
    await sound.play()

    expect(edgesFrom(first)).toEqual([])
    expect(pathExists(sound.source, context.destination)).toBe(true)
  })

  test('applies the attack envelope on the voice, not the sound', async () => {
    const sound = bufferedSound({ volume: 0.8, attack: 0.5 })
    await sound.play()
    const [voice] = sound.voices

    // The envelope runs 0..1 so it composes with volume rather than replacing
    // it; multiplying both onto one node would square the volume.
    expect(voice.gainNode.gain.automation).toEqual([
      { type: 'setValueAtTime', value: 0, time: 0 },
      { type: 'linearRampToValueAtTime', value: 1, time: 0.5 }
    ])
    expect(sound.gainNode.gain.value).toBe(0.8)
    expect(sound.gainNode.gain.automation).toEqual([])
  })

  test('triggers the play event', async () => {
    const sound = bufferedSound()
    let fired = 0
    sound.events.on('play', () => fired++)
    await sound.play()

    expect(fired).toBe(1)
  })

  test('treats a live input as already running', async () => {
    const sound = new Sound({ context, input: true })
    await sound.play()

    expect(sound.isPlaying).toBe(true)
    expect(console_.messages.error).toEqual([])
  })

  // Regression: isPlaying was set before the awaits, so it stayed true when
  // play() bailed out.
  test('does not report playing when there is nothing to play', async () => {
    onFetch(() => { throw new Error('network down') })
    const sound = new Sound({ context, file: 'missing.mp3' })
    await sound.initialized
    await sound.play()

    expect(sound.isPlaying).toBe(false)
    expect(console_.saw('error', 'No audio buffer or source available to play')).toBe(true)
  })
})

describe('stop', () => {
  test('stops the source and clears it', async () => {
    const sound = bufferedSound()
    await sound.play()
    const source = sound.source
    sound.stop()

    expect(sound.isPlaying).toBe(false)
    expect(source.stopCalls.length).toBe(1)
    expect(sound.source).toBe(null)
  })

  test('disconnects the source from the graph', async () => {
    const sound = bufferedSound()
    await sound.play()
    const source = sound.source
    sound.stop()

    expect(edgesFrom(source)).toEqual([])
  })

  test('releases microphone tracks', async () => {
    const sound = new Sound({ context, input: true })
    await sound.initialized
    const stream = sound.mediaStream
    sound.stop()

    expect(stream.getTracks().every(track => track.stopped)).toBe(true)
    expect(sound.mediaStream).toBe(null)
  })

  test('is safe to call before the sound has ever played', async () => {
    const sound = bufferedSound()
    await sound.initialized

    expect(() => sound.stop()).not.toThrow()
  })

  test('is safe to call twice', async () => {
    const sound = bufferedSound()
    await sound.play()

    expect(() => { sound.stop(); sound.stop() }).not.toThrow()
  })

  test('clears the buffer when clearBuffer is set', async () => {
    const sound = bufferedSound({ clearBuffer: true })
    await sound.play()
    sound.stop()

    expect(sound.audioBuffer).toBe(null)
  })
})

describe('onended', () => {
  test('clears state when playback finishes on its own', async () => {
    const sound = bufferedSound()
    await sound.play()
    sound.source.onended()

    expect(sound.isPlaying).toBe(false)
    expect(sound.source).toBe(null)
  })

  // Regression: the callback captured `this.source` late, so a stopped source
  // firing after a restart would null out the freshly built one.
  test('a stale callback does not clobber a newer source', async () => {
    const sound = bufferedSound()
    await sound.play()
    sound.stop()          // queues the old source's onended
    await sound.play()
    const fresh = sound.source
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(sound.source).toBe(fresh)
    expect(sound.isPlaying).toBe(true)
  })
})

describe('volume', () => {
  test('writes through to the gain node', () => {
    const sound = bufferedSound()
    sound.volume = 0.5

    expect(sound.volume).toBe(0.5)
    expect(sound.gainNode.gain.value).toBe(0.5)
  })

  test('rejects values outside 0..1', () => {
    const sound = bufferedSound()

    expect(() => { sound.volume = 1.5 }).toThrow('Volume must be between 0 and 1')
    expect(() => { sound.volume = -0.1 }).toThrow('Volume must be between 0 and 1')
  })

  test('fadeVolumeTo schedules a ramp from the current value', () => {
    const sound = bufferedSound({ volume: 0.4 })
    sound.fadeVolumeTo(0.9, 3)

    expect(sound.gainNode.gain.automation).toEqual([
      { type: 'setValueAtTime', value: 0.4, time: 0 },
      { type: 'linearRampToValueAtTime', value: 0.9, time: 3 }
    ])
  })
})

describe('applyRelease', () => {
  test('ramps to silence over the release time', () => {
    const sound = bufferedSound({ volume: 0.6, release: 0.25 })
    sound.applyRelease()

    expect(sound.gainNode.gain.automation).toEqual([
      { type: 'setValueAtTime', value: 0.6, time: 0 },
      { type: 'linearRampToValueAtTime', value: 0, time: 0.25 }
    ])
  })

  test('invokes the callback after the release time', async () => {
    const sound = bufferedSound({ release: 0.01 })
    let called = false
    sound.applyRelease(() => { called = true })

    expect(called).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 25))
    expect(called).toBe(true)
  })
})

describe('clone', () => {
  // Regression: clone passed `file: source.buffer`, an AudioBuffer that
  // initSource preferred over the decoded buffer and handed to fetch().
  test('shares the decoded buffer instead of refetching', async () => {
    const original = new Sound({ context, file: 'snd.mp3' })
    await original.initialized
    calls.fetch.length = 0

    const copy = original.clone()
    await copy.initialized

    expect(calls.fetch).toEqual([])
    expect(copy.audioBuffer).toBe(original.audioBuffer)
  })

  test('carries every playback setting across', async () => {
    const original = new Sound({
      context, file: 'snd.mp3',
      volume: 0.3, loop: true, attack: 0.1, release: 0.2, offset: 1.5, clearBuffer: true
    })
    await original.initialized
    const copy = original.clone()
    await copy.initialized

    expect(copy.fileName).toBe('snd.mp3')
    expect(copy.volume).toBe(0.3)
    expect(copy.loop).toBe(true)
    expect(copy.attack).toBe(0.1)
    expect(copy.release).toBe(0.2)
    expect(copy.offset).toBe(1.5)
    expect(copy.clearBuffer).toBe(true)
    expect(copy.context).toBe(context)
  })

  test('is independent of the original', async () => {
    const original = bufferedSound({ volume: 0.3, loop: true })
    await original.initialized
    const copy = original.clone()
    await copy.initialized

    copy.volume = 0.9
    copy.loop = false

    expect(original.volume).toBe(0.3)
    expect(original.loop).toBe(true)
  })

  // Regression: `wave` was read off `this.source`, which is null while idle.
  test('keeps wave settings even when the source is torn down', async () => {
    const original = new Sound({ context, wave: { type: 'triangle', frequency: 660 } })
    await original.initialized
    await original.play()
    original.stop()

    const copy = original.clone()
    await copy.play()

    expect(copy.source.type).toBe('triangle')
    expect(copy.source.frequency.value).toBe(660)
  })

  // Regression: passing the stream as `input` triggered a second getUserMedia,
  // which means a second microphone permission prompt.
  test('reuses the microphone stream rather than prompting again', async () => {
    const original = new Sound({ context, input: true })
    await original.initialized
    const copy = original.clone()
    await copy.initialized

    expect(calls.getUserMedia.length).toBe(1)
    expect(copy.mediaStream).toBe(original.mediaStream)
  })

  test('falls back to loading the file when nothing is decoded yet', async () => {
    const original = new Sound({ context, file: 'later.mp3' })
    const copy = original.clone()   // cloned before the load resolves
    await original.initialized
    await copy.initialized

    // Both wanted the same file, so the cache served one fetch to both.
    expect(calls.fetch).toEqual(['later.mp3'])
    expect(copy.audioBuffer).toBe(original.audioBuffer)
  })

  test('produces a playable sound', async () => {
    const original = bufferedSound()
    await original.initialized
    const copy = original.clone()
    await copy.play()

    expect(copy.isPlaying).toBe(true)
    expect(pathExists(copy.source, context.destination)).toBe(true)
  })
})

describe('play options', () => {
  test('takes when as an option', async () => {
    const sound = bufferedSound()
    await sound.play({ when: 3 })

    expect(sound.source.startCalls[0].when).toBe(3)
  })

  test('defaults to starting now', async () => {
    const sound = bufferedSound()
    context.currentTime = 5
    await sound.play()

    expect(sound.source.startCalls[0].when).toBe(5)
  })

  test('a time in the past starts now', async () => {
    const sound = bufferedSound()
    context.currentTime = 5
    await sound.play({ when: 1 })

    expect(sound.source.startCalls[0].when).toBe(5)
  })

  test('fromGroup lets a grouped sound play', async () => {
    const sound = bufferedSound()
    await sound.initialized
    sound.isGrouped = true

    await sound.play()
    expect(sound.isPlaying).toBe(false)
    expect(console_.saw('warn', 'It is in a group')).toBe(true)

    await sound.play({ fromGroup: true })
    expect(sound.isPlaying).toBe(true)
  })

  test('options can be combined', async () => {
    const sound = bufferedSound()
    sound.isGrouped = true

    await sound.play({ when: 4, fromGroup: true })

    expect(sound.source.startCalls[0].when).toBe(4)
  })

  // The old signature was play(fromGroup, when). Destructuring a boolean would
  // silently drop both arguments, so the mistake is made loud instead.
  test('the old positional signature throws rather than misbehaving', async () => {
    const sound = bufferedSound()

    expect(sound.play(true)).rejects.toThrow('play() takes an options object')
    expect(sound.play(false)).rejects.toThrow('play() takes an options object')
  })
})

describe('fade out and stop', () => {
  test('ramps the gain to silence on the audio clock', async () => {
    const sound = bufferedSound({ volume: 0.8 })
    await sound.play()
    sound.gainNode.gain.automation.length = 0

    sound.stop({ fade: 3 })

    expect(sound.gainNode.gain.automation).toEqual([
      { type: 'cancelScheduledValues', time: 0 },
      { type: 'setValueAtTime', value: 0.8, time: 0 },
      { type: 'linearRampToValueAtTime', value: 0, time: 3 }
    ])
  })

  test('keeps playing until the fade finishes', async () => {
    const sound = bufferedSound()
    await sound.play()

    const stopping = sound.stop({ fade: 0.05 })
    expect(sound.isPlaying).toBe(true)

    await stopping
    expect(sound.isPlaying).toBe(false)
    expect(sound.voices).toEqual([])
  })

  // The ramp leaves the gain at zero; without restoring it the next play would
  // be silent.
  test('restores the gain so the sound can play again', async () => {
    const sound = bufferedSound({ volume: 0.6 })
    await sound.play()
    await sound.stop({ fade: 0.05 })

    expect(sound.gainNode.gain.value).toBe(0.6)

    await sound.play()
    expect(sound.isPlaying).toBe(true)
  })

  test('fires ended once, when the fade completes', async () => {
    const sound = bufferedSound()
    const seen = []
    sound.events.on('stop', () => seen.push('stop'))
    sound.events.on('ended', () => seen.push('ended'))
    await sound.play()

    const stopping = sound.stop({ fade: 0.05 })
    expect(seen).toEqual([])

    await stopping
    expect(seen).toEqual(['stop', 'ended'])
  })

  // Monsoon Station's hand-rolled version could stack two fade intervals on the
  // same volume, because two code paths both routed into it.
  test('a second fade joins the first rather than stacking', async () => {
    const sound = bufferedSound()
    await sound.play()

    const first = sound.stop({ fade: 0.05 })
    const second = sound.stop({ fade: 0.05 })
    expect(second).toBe(first)

    await first
    expect(sound.isPlaying).toBe(false)
  })

  test('an immediate stop cancels a fade in progress', async () => {
    const sound = bufferedSound({ volume: 0.5 })
    await sound.play()

    sound.stop({ fade: 10 })
    await sound.stop()

    expect(sound.isPlaying).toBe(false)
    expect(sound.gainNode.gain.value).toBe(0.5)

    // The abandoned timer must not fire later and stop a fresh playthrough.
    await sound.play()
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(sound.isPlaying).toBe(true)
  })

  test('fading a sound that is not playing stops it immediately', async () => {
    const sound = bufferedSound()
    await sound.initialized

    await sound.stop({ fade: 10 })

    expect(sound.isPlaying).toBe(false)
  })

  test('stop returns a promise either way', async () => {
    const sound = bufferedSound()
    await sound.play()

    expect(sound.stop()).toBeInstanceOf(Promise)
  })
})
