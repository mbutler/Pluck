import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import Sound from '../src/core/Sound.js'
import { buildNoise } from '../src/core/noise.js'
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

describe('buildNoise', () => {
  test('fills a mono buffer of the requested duration', () => {
    const buffer = buildNoise(context, 'white', 0.5)

    expect(buffer.numberOfChannels).toBe(1)
    expect(buffer.length).toBe(context.sampleRate * 0.5)
    expect(buffer.getChannelData(0).some(sample => sample !== 0)).toBe(true)
  })

  test('samples stay within -1..1', () => {
    for (const type of ['white', 'pink', 'brown']) {
      const samples = buildNoise(context, type, 0.1).getChannelData(0)
      expect(Math.max(...samples)).toBeLessThanOrEqual(1)
      expect(Math.min(...samples)).toBeGreaterThanOrEqual(-1)
    }
  })

  test('an unknown type falls back to white', () => {
    const buffer = buildNoise(context, 'octarine', 0.05)
    expect(buffer.length).toBeGreaterThan(0)
  })
})

describe('Sound from noise', () => {
  test('true builds looping white noise', async () => {
    const sound = new Sound({ context, noise: true })
    await sound.initialized
    await sound.play()

    expect(sound.noise).toEqual({ type: 'white', duration: 1 })
    expect(sound.loop).toBe(true)
    expect(sound.audioBuffer.numberOfChannels).toBe(1)
    expect(sound.source.loop).toBe(true)
    expect(pathExists(sound.source, context.destination)).toBe(true)
  })

  test('a type string selects the colour', async () => {
    const sound = new Sound({ context, noise: 'pink' })
    await sound.initialized

    expect(sound.noise.type).toBe('pink')
    expect(sound.audioBuffer.length).toBe(context.sampleRate)
  })

  test('an object can set type and duration', async () => {
    const sound = new Sound({ context, noise: { type: 'brown', duration: 0.25 } })
    await sound.initialized

    expect(sound.noise).toEqual({ type: 'brown', duration: 0.25 })
    expect(sound.audioBuffer.length).toBe(context.sampleRate * 0.25)
  })

  test('loop can still be turned off', async () => {
    const sound = new Sound({ context, noise: true, loop: false })
    await sound.play()

    expect(sound.loop).toBe(false)
    expect(sound.source.loop).toBe(false)
  })

  test('an unknown type warns and uses white', async () => {
    const sound = new Sound({ context, noise: 'octarine' })
    await sound.initialized

    expect(sound.noise.type).toBe('white')
    expect(console_.saw('warn', "Unknown noise type 'octarine'")).toBe(true)
  })

  test('needs no fetch', async () => {
    const { calls } = await import('./mocks/MockAudioContext.js')
    const sound = new Sound({ context, noise: true })
    await sound.initialized

    expect(calls.fetch).toEqual([])
    expect(sound.audioBuffer).toBeTruthy()
  })

  test('a clone shares the buffer rather than generating another', async () => {
    const original = new Sound({ context, noise: 'pink' })
    await original.initialized
    const copy = original.clone()
    await copy.initialized

    expect(copy.audioBuffer).toBe(original.audioBuffer)
    expect(copy.noise).toEqual({ type: 'pink', duration: 1 })
    expect(copy.loop).toBe(true)
  })

  test('pitch controls apply the same as any other buffer', async () => {
    const sound = new Sound({ context, noise: true, playbackRate: 0.5, detune: 100 })
    await sound.play()

    expect(sound.source.playbackRate.value).toBe(0.5)
    expect(sound.source.detune.value).toBe(100)
  })

  test('routes through the sound gain like any other source', async () => {
    const sound = new Sound({ context, noise: true, volume: 0.4 })
    await sound.play()
    const [voice] = sound.voices

    expect(hasEdge(sound.source, voice.gainNode)).toBe(true)
    expect(hasEdge(voice.gainNode, sound.gainNode)).toBe(true)
    expect(sound.gainNode.gain.value).toBe(0.4)
  })
})
