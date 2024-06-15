import { describe, it, expect, beforeEach } from "bun:test"
import Sound from "../src/core/Sound.js"
import { MockAudioContext } from "./mocks/MockAudioContext.js"

// Mock global objects for Bun environment
global.AudioContext = MockAudioContext
global.webkitAudioContext = MockAudioContext

describe('Sound Class', () => {
  let sound

  beforeEach(() => {
    sound = new Sound()
  })

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(sound.volume).toBe(1)
      expect(sound.loop).toBe(false)
      expect(sound.attack).toBe(0.04)
      expect(sound.release).toBe(0.04)
      expect(sound.context).toBeInstanceOf(AudioContext)
    })

    it('should initialize with provided options', () => {
      const options = { volume: 0.5, loop: true, attack: 0.1, release: 0.2 }
      const customSound = new Sound(options)
      expect(customSound.volume).toBe(options.volume)
      expect(customSound.loop).toBe(true)
      expect(customSound.attack).toBe(options.attack)
      expect(customSound.release).toBe(options.release)
    })
  })

  describe('Playback', () => {
    it('should play the sound', () => {
      sound.play()
      expect(sound.source).toBeTruthy()
    })

    it('should stop the sound', async () => {
      sound.play()
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
    it('should clone the sound with the same properties', () => {
      const options = { volume: 0.5, loop: true, attack: 0.1, release: 0.2 }
      const originalSound = new Sound(options)
      const clone = originalSound.clone()
      expect(clone.volume).toBe(originalSound.volume)
      expect(clone.loop).toBe(originalSound.loop)
      expect(clone.attack).toBe(originalSound.attack)
      expect(clone.release).toBe(originalSound.release)
    })
  })
})
