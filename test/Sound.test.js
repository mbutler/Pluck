import { describe, it, expect, beforeEach } from "bun:test"
import Sound from "../src/core/Sound.js"
import { MockAudioContext } from "./mocks/MockAudioContext.js"

// Mock global objects for Bun environment
global.AudioContext = MockAudioContext
global.webkitAudioContext = MockAudioContext

// Mock fetch function
global.fetch = (url) => {
  return new Promise((resolve, reject) => {
    if (url === 'path/to/mock/file.mp3') {
      resolve({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)) // Mocked array buffer
      })
    } else {
      reject(new TypeError('fetch() URL is invalid'))
    }
  })
}

describe('Sound Class', () => {
  let sound

  beforeEach(async () => {
    sound = new Sound({ file: 'path/to/mock/file.mp3' })
    await sound.initialized
  })

  describe('Initialization', () => {
    it('should initialize with default values', async () => {
      const defaultSound = new Sound()
      await defaultSound.initialized
      expect(defaultSound.volume).toBe(1)
      expect(defaultSound.loop).toBe(false)
      expect(defaultSound.attack).toBe(0.04)
      expect(defaultSound.release).toBe(0.04)
      expect(defaultSound.context).toBeInstanceOf(AudioContext)
    })

    it('should initialize with provided options', async () => {
      const options = { volume: 0.5, loop: true, attack: 0.1, release: 0.2 }
      const customSound = new Sound(options)
      await customSound.initialized
      expect(customSound.volume).toBe(options.volume)
      expect(customSound.loop).toBe(true)
      expect(customSound.attack).toBe(options.attack)
      expect(customSound.release).toBe(options.release)
    })
  })

  describe('Playback', () => {
    it('should play the sound', async () => {
      await sound.play()
      expect(sound.source).toBeTruthy()
    })

    it('should stop the sound', async () => {
      await sound.play()
      await new Promise((resolve) => setTimeout(resolve, 100))
      sound.stop()
      expect(sound.source).toBeFalsy()
    })
  })

  describe('Volume Control', () => {
    it('should set the volume', () => {
      sound.setVolume(0.5)
      expect(sound.volume).toBe(0.5)
      expect(sound.gainNode.gain.value).toBe(0.5)
    })

    it('should not set the volume outside the range 0-1', () => {
      sound.setVolume(1.5)
      expect(sound.volume).not.toBe(1.5)
      sound.setVolume(-0.5)
      expect(sound.volume).not.toBe(-0.5)
    })
  })

  describe('Cloning', () => {
    it('should clone the sound with the same properties', async () => {
      const options = { volume: 0.5, loop: true, attack: 0.1, release: 0.2 }
      const originalSound = new Sound(options)
      await originalSound.initialized
      const clone = originalSound.clone()
      await clone.initialized
      expect(clone.volume).toBe(originalSound.volume)
      expect(clone.loop).toBe(originalSound.loop)
      expect(clone.attack).toBe(originalSound.attack)
      expect(clone.release).toBe(originalSound.release)
    })
  })
})
