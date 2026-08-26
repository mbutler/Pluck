import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import Sound from '../src/core/Sound.js'
import Group from '../src/core/Group.js'
import bufferCache from '../src/core/BufferCache.js'
import {
  MockAudioContext,
  MockAudioElement,
  calls,
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

const streamed = (options = {}) => new Sound({ context, stream: 'bed.mp3', ...options })

describe('setup', () => {
  test('creates an element rather than fetching and decoding', async () => {
    const sound = streamed()
    await sound.initialized

    expect(sound.isStreaming).toBe(true)
    expect(sound.audioElement).toBeInstanceOf(MockAudioElement)
    expect(sound.audioElement.src).toBe('bed.mp3')
    expect(calls.fetch).toEqual([])
    expect(calls.decodeAudioData).toEqual([])
    expect(sound.audioBuffer).toBe(null)
  })

  // The whole point: a long file never becomes an uncompressed buffer.
  test('holds nothing in the buffer cache', async () => {
    const sound = streamed()
    await sound.initialized

    expect(bufferCache.size).toBe(0)
    expect(bufferCache.bytes).toBe(0)
  })

  test('routes the element through the gain node to the destination', async () => {
    const sound = streamed()
    await sound.initialized

    expect(hasEdge(sound.source, sound.gainNode)).toBe(true)
    expect(pathExists(sound.source, context.destination)).toBe(true)
  })

  test('sets crossOrigin before src so it takes effect', async () => {
    const sound = streamed()
    await sound.initialized

    expect(sound.audioElement.crossOrigin).toBe('anonymous')
  })

  test('carries the loop option to the element', async () => {
    const sound = streamed({ loop: true })
    await sound.initialized

    expect(sound.audioElement.loop).toBe(true)

    sound.loop = false
    expect(sound.audioElement.loop).toBe(false)
  })
})

describe('playback', () => {
  test('plays the element', async () => {
    const sound = streamed()
    await sound.play()

    expect(sound.audioElement.playCalls).toBe(1)
    expect(sound.audioElement.paused).toBe(false)
    expect(sound.isPlaying).toBe(true)
  })

  test('starts from the offset', async () => {
    const sound = streamed({ offset: 30 })
    await sound.play()

    expect(sound.audioElement.currentTime).toBe(30)
  })

  test('creates no voices', async () => {
    const sound = streamed()
    await sound.play()

    expect(sound.voices).toEqual([])
  })

  test('fires the play event', async () => {
    const sound = streamed()
    const seen = []
    sound.events.on('play', s => seen.push(s))
    await sound.play()

    expect(seen).toEqual([sound])
  })

  test('applies the attack as a fade-in on the sound gain', async () => {
    const sound = streamed({ attack: 5, volume: 0.8 })
    await sound.play()

    expect(sound.gainNode.gain.automation).toEqual([
      { type: 'setValueAtTime', value: 0, time: 0 },
      { type: 'linearRampToValueAtTime', value: 0.8, time: 5 }
    ])
  })

  // Media elements cannot be started on the audio clock, so a scheduled stream
  // waits on a timer and is approximate by design.
  test('a future start waits rather than playing immediately', async () => {
    const sound = streamed()
    await sound.play({ when: context.currentTime + 0.05 })

    expect(sound.audioElement.playCalls).toBe(0)
    expect(sound.isPlaying).toBe(true)

    await new Promise(resolve => setTimeout(resolve, 90))
    expect(sound.audioElement.playCalls).toBe(1)
  })

  test('a start time in the past plays immediately', async () => {
    const sound = streamed()
    context.currentTime = 10
    await sound.play({ when: 2 })

    expect(sound.audioElement.playCalls).toBe(1)
  })

  test('reports a rejected play without throwing', async () => {
    const sound = streamed()
    await sound.initialized
    sound.audioElement.play = () => Promise.reject(new Error('NotAllowedError'))

    await sound.play()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(console_.saw('error', 'Error playing stream')).toBe(true)
  })
})

describe('stopping', () => {
  test('pauses and rewinds', async () => {
    const sound = streamed()
    await sound.play()
    await sound.stop()

    expect(sound.audioElement.pauseCalls).toBe(1)
    expect(sound.audioElement.currentTime).toBe(0)
    expect(sound.isPlaying).toBe(false)
  })

  // A media element is reusable, unlike a buffer source, so stopping must not
  // tear it down.
  test('keeps the element and can play again', async () => {
    const sound = streamed()
    await sound.play()
    const element = sound.audioElement
    const node = sound.source
    await sound.stop()
    await sound.play()

    expect(sound.audioElement).toBe(element)
    expect(sound.source).toBe(node)
    expect(element.playCalls).toBe(2)
    expect(pathExists(sound.source, context.destination)).toBe(true)
  })

  test('fires stop then ended', async () => {
    const sound = streamed()
    const seen = []
    sound.events.on('stop', () => seen.push('stop'))
    sound.events.on('ended', () => seen.push('ended'))
    await sound.play()
    await sound.stop()

    expect(seen).toEqual(['stop', 'ended'])
  })

  test('the element ending fires ended', async () => {
    const sound = streamed()
    let ended = 0
    sound.events.on('ended', () => ended++)
    await sound.play()

    sound.audioElement.emit('ended')

    expect(ended).toBe(1)
    expect(sound.isPlaying).toBe(false)
  })

  test('cancels a pending scheduled start', async () => {
    const sound = streamed()
    await sound.play({ when: context.currentTime + 0.05 })
    await sound.stop()

    await new Promise(resolve => setTimeout(resolve, 90))

    expect(sound.audioElement.playCalls).toBe(0)
  })
})

describe('in a group', () => {
  test('streams route through the group bus', async () => {
    const group = new Group(context)
    const sound = streamed()
    await sound.initialized
    group.addSounds([sound])
    await group.play()

    expect(hasEdge(sound.gainNode, group.gainNode)).toBe(true)
    expect(pathExists(sound.source, context.destination)).toBe(true)
    expect(sound.audioElement.playCalls).toBe(1)
  })

  test('the group ends when the stream does', async () => {
    const group = new Group(context)
    const sound = streamed()
    await sound.initialized
    group.addSounds([sound])
    let ended = 0
    group.events.on('ended', () => ended++)

    await group.play()
    sound.audioElement.emit('ended')

    expect(ended).toBe(1)
  })
})

describe('cloning', () => {
  test('a clone streams the same url independently', async () => {
    const original = streamed({ volume: 0.4, loop: true })
    await original.initialized
    const copy = original.clone()
    await copy.initialized

    expect(copy.isStreaming).toBe(true)
    expect(copy.streamUrl).toBe('bed.mp3')
    expect(copy.audioElement).not.toBe(original.audioElement)
    expect(copy.volume).toBe(0.4)
    expect(copy.loop).toBe(true)
    expect(calls.fetch).toEqual([])
  })
})
