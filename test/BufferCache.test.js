import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import Sound from '../src/core/Sound.js'
import sharedCache, { BufferCache } from '../src/core/BufferCache.js'
import {
  MockAudioContext,
  calls,
  captureConsole,
  onFetch,
  resetMocks
} from './mocks/MockAudioContext.js'

let context
let cache
let console_

beforeEach(() => {
  resetMocks()
  context = new MockAudioContext()
  cache = new BufferCache()
  console_ = captureConsole()
})

afterEach(() => console_.restore())

describe('loading', () => {
  test('fetches and decodes on the first request', async () => {
    const buffer = await cache.load(context, 'kick.mp3')

    expect(calls.fetch).toEqual(['kick.mp3'])
    expect(calls.decodeAudioData.length).toBe(1)
    expect(buffer).toBeTruthy()
    expect(cache.size).toBe(1)
  })

  test('serves a second request from memory', async () => {
    const first = await cache.load(context, 'kick.mp3')
    const second = await cache.load(context, 'kick.mp3')

    expect(calls.fetch).toEqual(['kick.mp3'])
    expect(calls.decodeAudioData.length).toBe(1)
    expect(second).toBe(first)
  })

  test('keeps separate buffers for separate files', async () => {
    const kick = await cache.load(context, 'kick.mp3')
    const snare = await cache.load(context, 'snare.mp3')

    expect(calls.fetch).toEqual(['kick.mp3', 'snare.mp3'])
    expect(kick).not.toBe(snare)
    expect(cache.size).toBe(2)
  })

  // Two Sounds constructed back to back should not race into two downloads of
  // the same file, which is the common case when a kit loads.
  test('concurrent requests share one fetch', async () => {
    const [a, b, c] = await Promise.all([
      cache.load(context, 'kick.mp3'),
      cache.load(context, 'kick.mp3'),
      cache.load(context, 'kick.mp3')
    ])

    expect(calls.fetch).toEqual(['kick.mp3'])
    expect(calls.decodeAudioData.length).toBe(1)
    expect(b).toBe(a)
    expect(c).toBe(a)
  })
})

describe('failure', () => {
  test('propagates the error', async () => {
    onFetch(() => { throw new Error('network down') })

    await expect(cache.load(context, 'missing.mp3')).rejects.toThrow('network down')
  })

  // A remembered rejection would make every later attempt fail with the original
  // error, so a failed load must leave nothing behind.
  test('does not cache a failure', async () => {
    onFetch(() => { throw new Error('network down') })
    await cache.load(context, 'flaky.mp3').catch(() => {})

    expect(cache.size).toBe(0)

    onFetch(null)
    const buffer = await cache.load(context, 'flaky.mp3')

    expect(buffer).toBeTruthy()
    expect(calls.fetch).toEqual(['flaky.mp3', 'flaky.mp3'])
  })
})

describe('eviction', () => {
  test('delete drops one buffer', async () => {
    await cache.load(context, 'kick.mp3')
    await cache.load(context, 'snare.mp3')

    expect(cache.delete('kick.mp3')).toBe(true)
    expect(cache.has('kick.mp3')).toBe(false)
    expect(cache.has('snare.mp3')).toBe(true)
  })

  test('clear drops everything', async () => {
    await cache.load(context, 'kick.mp3')
    await cache.load(context, 'snare.mp3')

    cache.clear()

    expect(cache.size).toBe(0)
  })

  test('a sound already holding a buffer keeps working after eviction', async () => {
    const sound = new Sound({ context, file: 'kick.mp3' })
    await sound.initialized
    const buffer = sound.audioBuffer

    sharedCache.clear()
    await sound.play()

    expect(sound.audioBuffer).toBe(buffer)
    expect(sound.isPlaying).toBe(true)
  })

  test('reloading after eviction fetches again', async () => {
    await cache.load(context, 'kick.mp3')
    cache.clear()
    await cache.load(context, 'kick.mp3')

    expect(calls.fetch).toEqual(['kick.mp3', 'kick.mp3'])
  })
})

describe('Sound integration', () => {
  // The motivating case: a kit that uses the same sample at several points in a
  // piece used to fetch and decode it once per Sound.
  test('several sounds on one file cost one fetch and one decode', async () => {
    const sounds = [
      new Sound({ context, file: 'kick.mp3' }),
      new Sound({ context, file: 'kick.mp3' }),
      new Sound({ context, file: 'kick.mp3' })
    ]
    await Promise.all(sounds.map(sound => sound.initialized))

    expect(calls.fetch).toEqual(['kick.mp3'])
    expect(calls.decodeAudioData.length).toBe(1)
    expect(sounds[1].audioBuffer).toBe(sounds[0].audioBuffer)
    expect(sounds[2].audioBuffer).toBe(sounds[0].audioBuffer)
  })

  test('sounds sharing a buffer play independently', async () => {
    const one = new Sound({ context, file: 'kick.mp3', volume: 0.2 })
    const two = new Sound({ context, file: 'kick.mp3', volume: 0.9 })
    await one.initialized
    await two.initialized

    await one.play()

    expect(one.isPlaying).toBe(true)
    expect(two.isPlaying).toBe(false)
    expect(one.source).not.toBe(two.source)
    expect(one.gainNode.gain.value).toBe(0.2)
    expect(two.gainNode.gain.value).toBe(0.9)
  })

  test('Timeline.addSound on a repeated file reuses the buffer', async () => {
    const { default: Timeline } = await import('../src/core/Timeline.js')
    const timeline = new Timeline()
    timeline.context = context

    await timeline.addSound('snd.mp3', 10, { context })
    await timeline.addSound('snd.mp3', 40, { context })

    expect(calls.fetch).toEqual(['snd.mp3'])
    expect(calls.decodeAudioData.length).toBe(1)
  })

  test('cache: false bypasses the cache entirely', async () => {
    const one = new Sound({ context, file: 'kick.mp3', cache: false })
    const two = new Sound({ context, file: 'kick.mp3', cache: false })
    await one.initialized
    await two.initialized

    expect(calls.fetch).toEqual(['kick.mp3', 'kick.mp3'])
    expect(one.audioBuffer).not.toBe(two.audioBuffer)
    expect(sharedCache.size).toBe(0)
  })

  test('a clone inherits the cache setting', async () => {
    const original = new Sound({ context, file: 'kick.mp3', cache: false })
    await original.initialized
    const copy = original.clone()
    await copy.initialized

    expect(sharedCache.size).toBe(0)
  })
})
