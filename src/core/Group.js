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

    const properties = {
      context: context,
      gainNode,
      sounds: [],
      groups: [],
      parent: null,
      volume: 1,
      muted: false,
      previousVolume: 1,
      // A group's effects process every sound in it at once, which is the
      // point of a bus: one reverb for the kit, not one per drum.
      effects: [],
      taps: new Set(),
      // Default output is the destination; re-pointed when this group is
      // nested inside another, so sections can feed a master bus.
      output: context.destination,
      events: new Events(),
      // One 'ended' listener per member, kept so it can be detached again when
      // the sound leaves the group.
      endedListeners: new Map()
    }
    
    groupProperties.set(this, properties)
    this.rebuildOutputChain()
  }

  async play() {
    const properties = groupProperties.get(this)
    const promises = [
      ...this.sounds.map(async (sound) => {
        if (!sound.isPlaying) {
          try {
            await sound.play({ fromGroup: true })
          } catch (error) {
            console.error("Error playing sound:", error)
          }
        }
      }),
      ...properties.groups.map(async (group) => {
        if (!group.isPlaying) {
          try {
            await group.play()
          } catch (error) {
            console.error("Error playing group:", error)
          }
        }
      })
    ]
    await Promise.all(promises)
    this.events.trigger('play', this)
  }

  /**
   * @param {object} [options]
   * @param {number} [options.fade=0]  seconds to ramp each member to silence
   *   before stopping, for crossfading one set of layers into another.
   */
  async stop(options = {}) {
    // Announced before the members are stopped, so 'stop' precedes the 'ended'
    // their stopping triggers -- the same order a Sound uses.
    this.events.trigger('stop', this)

    const properties = groupProperties.get(this)
    const promises = [
      ...this.sounds.map(async (sound) => {
        if (sound.isPlaying) {
          await sound.stop(options)
        }
      }),
      ...properties.groups.map(async (group) => {
        if (group.isPlaying) {
          await group.stop(options)
        }
      })
    ]
    await Promise.all(promises)
  }

  /** True while any member sound or nested group is sounding. */
  get isPlaying() {
    const properties = groupProperties.get(this)
    return this.sounds.some(sound => sound.isPlaying)
      || properties.groups.some(group => group.isPlaying)
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
  }

  /**
   * Nests other groups inside this one. Each child's output is re-pointed into
   * this group's gain node, so a pad bus and a drum bus can share one master
   * compressor. Nested groups stay independently playable — unlike a grouped
   * sound, a section is meant to be started and stopped on its own.
   */
  addGroups(groups) {
    if (!Array.isArray(groups)) {
      console.error("Not an array of groups")
      return
    }

    const properties = groupProperties.get(this)

    groups.forEach((group) => {
      if (!(group instanceof Group)) {
        console.error("The group is not an instance of Group class:", group)
        return
      }

      if (group === this) {
        console.error("Cannot add a group to itself")
        return
      }

      if (group.context !== this.context) {
        console.error("Cannot add group: mismatched audio contexts", group)
        return
      }

      if (this.feedsInto(group)) {
        console.error("Cannot add group: that would create a cycle")
        return
      }

      if (properties.groups.includes(group)) {
        console.warn("The group is already nested here")
        return
      }

      const previous = groupProperties.get(group).parent
      if (previous && previous !== this) previous.removeGroup(group)

      groupProperties.get(group).parent = this
      group.output = this
      properties.groups.push(group)
      this.watchSound(group)
    })
  }

  removeGroup(group) {
    const properties = groupProperties.get(this)
    const index = properties.groups.indexOf(group)
    if (index === -1) {
      console.warn("The group is not nested here")
      return
    }

    const child = groupProperties.get(group)
    child.parent = null
    group.output = group.context.destination
    this.unwatchSound(group)
    properties.groups.splice(index, 1)
  }

  /**
   * True when `group` is this group or an ancestor, i.e. when nesting `group`
   * inside this one would loop the graph.
   */
  feedsInto(group) {
    let node = this
    while (node) {
      if (node === group) return true
      node = groupProperties.get(node).parent
    }
    return false
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
      [properties.output, ...properties.taps]
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

  /** Nested groups, in the order they were added. */
  get groups() {
    return [...groupProperties.get(this).groups]
  }

  /**
   * Where this group's chain currently feeds. Defaults to the context
   * destination; set to another group (or a node) to nest this bus.
   */
  get output() {
    return groupProperties.get(this).output
  }

  set output(node) {
    const properties = groupProperties.get(this)
    const destination = node instanceof Group ? node.gainNode : node
    if (properties.output === destination) return
    properties.output = destination
    this.rebuildOutputChain()
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
