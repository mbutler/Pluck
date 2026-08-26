import Sound from './Sound.js'
import Events from './Events.js'
import { rebuildChain } from './chain.js'
import { isAudioContext } from './audioContext.js'

var groupProperties = new WeakMap;

class Group {
  constructor(context) {
    if (!isAudioContext(context)) {
      throw new Error('No audio context provided to Group')
    }

    const gainNode = context.createGain()
    gainNode.connect(context.destination)
    
    const properties = {
      context: context,
      gainNode,
      sounds: [],
      volume: 1,
      muted: false,
      previousVolume: 1,
      // A group's effects process every sound in it at once, which is the
      // point of a bus: one reverb for the kit, not one per drum.
      effects: [],
      taps: new Set(),
      events: new Events(),
      // One 'ended' listener per member, kept so it can be detached again when
      // the sound leaves the group.
      endedListeners: new Map()
    }
    
    groupProperties.set(this, properties)    
  }

  async play() {
    const promises = this.sounds.map(async (sound) => {
      if (!sound.isPlaying) {
        try {
          await sound.play(true)
        } catch (error) {
          console.error("Error playing sound:", error)
        }
      }
    })
    await Promise.all(promises)
    this.events.trigger('play', this)
  }

  async stop() {
    // Announced before the members are stopped, so 'stop' precedes the 'ended'
    // their stopping triggers -- the same order a Sound uses.
    this.events.trigger('stop', this)

    const promises = this.sounds.map(async (sound) => {
      if (sound.isPlaying) {
        sound.stop()
      }
    })
    await Promise.all(promises)
  }

  /** True while any member is sounding. */
  get isPlaying() {
    return this.sounds.some(sound => sound.isPlaying)
  }

  /**
   * A member finished. The group has only ended once none of them is left
   * sounding, so this fires at most once per run rather than once per sound.
   */
  handleSoundEnded() {
    if (this.isPlaying) return
    this.events.trigger('ended', this)
  }

  watchSound(sound) {
    const properties = groupProperties.get(this)
    if (properties.endedListeners.has(sound)) return

    const listener = () => this.handleSoundEnded()
    properties.endedListeners.set(sound, listener)
    sound.events.on('ended', listener)
  }

  unwatchSound(sound) {
    const properties = groupProperties.get(this)
    const listener = properties.endedListeners.get(sound)
    if (!listener) return

    sound.events.off('ended', listener)
    properties.endedListeners.delete(sound)
  }

  addSounds(sounds) {
    if (!Array.isArray(sounds)) {
      console.error("Not an array of sounds")
      return
    }
  
    sounds.forEach((sound) => {
      if (!(sound instanceof Sound)) {
        console.error("The sound is not an instance of Sound class:", sound)
        return
      }
  
      if (sound.context !== this.context) {
        console.error("Cannot add sound to group: mismatched audio contexts", sound)
        return
      }

      // removeSound() unhooks the group once it empties; re-hook it here.
      this.rebuildOutputChain()

      sound.isGrouped = true
      sound.output = this.gainNode
      this.sounds.push(sound)
      this.watchSound(sound)
    })
  }
  
  removeSound(sound) {
    const index = this.sounds.indexOf(sound)
    if (index === -1) {
      console.warn("The sound is not in the group")
      return
    }
    sound.isGrouped = false
    sound.output = sound.context.destination
    this.unwatchSound(sound)
    this.sounds.splice(index, 1)
    if (this.sounds.length === 0) {
      this.outputNode.disconnect(this.context.destination)
    }
  }

  /* ---- effects --------------------------------------------------------- */

  /** The effects on this group, in signal order. */
  get effects() {
    return [...groupProperties.get(this).effects]
  }

  addEffect(effect, index = null) {
    const properties = groupProperties.get(this)
    if (properties.effects.includes(effect)) {
      console.warn('Effect is already on this group')
      return effect
    }

    if (index === null) properties.effects.push(effect)
    else properties.effects.splice(index, 0, effect)

    this.rebuildOutputChain()
    return effect
  }

  removeEffect(effect) {
    const properties = groupProperties.get(this)
    const index = properties.effects.indexOf(effect)
    if (index === -1) {
      console.warn('Effect is not on this group')
      return false
    }

    properties.effects.splice(index, 1)
    effect.input.disconnect()
    effect.output.disconnect()
    this.rebuildOutputChain()
    return true
  }

  clearEffects() {
    const properties = groupProperties.get(this)
    properties.effects.forEach(effect => {
      effect.input.disconnect()
      effect.output.disconnect()
    })
    properties.effects.length = 0
    this.rebuildOutputChain()
  }

  rebuildOutputChain() {
    const properties = groupProperties.get(this)
    return rebuildChain(
      properties.gainNode,
      properties.effects,
      [properties.context.destination, ...properties.taps]
    )
  }

  /** The last node in the chain: this group's actual output. */
  get outputNode() {
    const properties = groupProperties.get(this)
    const effects = properties.effects
    return effects.length ? effects[effects.length - 1].output : properties.gainNode
  }

  connect(node) {
    const properties = groupProperties.get(this)
    properties.taps.add(node)
    this.outputNode.connect(node)
    return node
  }

  disconnect(node) {
    const properties = groupProperties.get(this)
    if (!node) {
      properties.taps.forEach(tap => this.outputNode.disconnect(tap))
      properties.taps.clear()
      return
    }
    properties.taps.delete(node)
    this.outputNode.disconnect(node)
  }

  fadeVolumeTo(value, duration = 1) {
    const currentTime = this.context.currentTime
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currentTime)
    this.gainNode.gain.linearRampToValueAtTime(value, currentTime + duration)
  }

  mute() {
    if (!this.muted) {
      this.previousVolume = this.volume
      this.volume = 0
      this.muted = true
    }
  }

  unmute() {
    if (this.muted) {
      this.volume = this.previousVolume
      this.muted = false
    }
  }

  get events() {
    return groupProperties.get(this).events
  }

  get context() {
    return groupProperties.get(this).context
  }

  get gainNode() {
    return groupProperties.get(this).gainNode
  }

  get sounds() {
    return groupProperties.get(this).sounds
  }

  get volume() {
    return groupProperties.get(this).gainNode.gain.value
  }

  set volume(value) {
    groupProperties.get(this).gainNode.gain.value = value
  }

  get muted() {
    return groupProperties.get(this).muted
  }

  set muted(value) {
    groupProperties.get(this).muted = value
  }

  get previousVolume() {
    return groupProperties.get(this).previousVolume
  }

  set previousVolume(value) {
    groupProperties.get(this).previousVolume = value
  }
}

export default Group
