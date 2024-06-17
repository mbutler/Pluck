import { describe, it, expect, beforeEach } from "bun:test"
import Group from "../src/core/Group.js"
import Sound from "../src/core/Sound.js"
import { MockAudioContext, MockGainNode, MockOscillatorNode, MockMediaStreamSourceNode } from "./mocks/MockAudioContext.js"

// Mock global objects for Bun environment
global.AudioContext = MockAudioContext
global.webkitAudioContext = MockAudioContext

describe('Group Class', () => {
  let group
  let sound1, sound2

  beforeEach(async () => {
    sound1 = new Sound({ wave: { type: 'sine', frequency: 440 } })
    sound2 = new Sound({ wave: { type: 'square', frequency: 880 } })
    await sound1.initialized
    await sound2.initialized
    group = new Group([sound1, sound2])
  })

  describe('Initialization', () => {
    it('should initialize with provided sounds', () => {
      expect(group.sounds.length).toBe(2)
      expect(group.sounds).toContain(sound1)
      expect(group.sounds).toContain(sound2)
    })

    it('should initialize with default volume', () => {
      expect(group.volume).toBe(1)
    })
  })

  describe('Sound Management', () => {
    it('should add a sound to the group', () => {
      const sound3 = new Sound({ wave: { type: 'triangle', frequency: 660 } })
      group.addSound(sound3)
      expect(group.sounds.length).toBe(3)
      expect(group.sounds).toContain(sound3)
    })

    it('should remove a sound from the group', () => {
      group.removeSound(sound1)
      expect(group.sounds.length).toBe(1)
      expect(group.sounds).not.toContain(sound1)
    })
  })

  describe('Playback Control', () => {
    it('should play all sounds in the group', async () => {
      await Promise.all(group.sounds.map(sound => sound.initialized))
      group.play()
      group.sounds.forEach(sound => {
        expect(sound.source).toBeTruthy()
      })
    })

    it('should stop all sounds in the group', async () => {
      await Promise.all(group.sounds.map(sound => sound.initialized))
      group.play()
      group.stop()
      group.sounds.forEach(sound => {
        expect(sound.source).toBeFalsy()
      })
    })

    it('should pause all sounds in the group', async () => {
      await Promise.all(group.sounds.map(sound => sound.initialized))
      group.play()
      group.pause()
      group.sounds.forEach(sound => {
        expect(sound.source).toBeTruthy()
        // Add more specific checks if pause functionality is implemented
      })
    })
  })

  describe('Volume Control', () => {
    it('should set the volume for the group', () => {
      group.volume = 0.5
      expect(group.volume).toBe(0.5)
      expect(group.gainNode.gain.value).toBe(0.5)
    })

    it('should not set the volume outside the range 0-1', () => {
      group.volume = 1.5
      expect(group.volume).not.toBe(1.5)
      group.volume = -0.5
      expect(group.volume).not.toBe(-0.5)
    })
  })

  describe('Effects Management', () => {
    it('should add an effect to the group', () => {
      const effect = new MockGainNode()
      group.addEffect(effect)
      expect(group.effects.length).toBe(1)
      expect(group.effects).toContain(effect)
    })

    it('should remove an effect from the group', () => {
      const effect = new MockGainNode()
      group.addEffect(effect)
      group.removeEffect(effect)
      expect(group.effects.length).toBe(0)
      expect(group.effects).not.toContain(effect)
    })
  })
})
