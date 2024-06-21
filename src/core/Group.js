import Sound from './Sound.js'
var groupProperties = new WeakMap;

class Group {
  constructor(context, sounds) {
    if (!context) {
      console.error('No audio context provided to Group')
      return
    }

    const invalidSounds = sounds.filter(sound => sound.context !== context)
    if (invalidSounds.length) {
      console.error('Sounds with mismatched audio contexts:', invalidSounds)
      return
    }

    console.log("Creating new group with sounds:", sounds)
    
    sounds.forEach(sound => { sound.source.disconnect(sound.gainNode)})
    const gainNode = context.createGain()
    sounds.forEach(sound => { sound.connect(gainNode) })
    gainNode.connect(context.destination)
    
    const properties = {
      context: context,
      gainNode,
      sounds: sounds.filter((sound) => sound instanceof Sound) || [],
      volume: 1,
      muted: false,
      previousVolume: 1,
    }
    
    groupProperties.set(this, properties)    
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

  async play() {
    const promises = this.sounds.map(async (sound) => {
      if (!sound.isPlaying) {
        try {
          await sound.play()
        } catch (error) {
          console.error("Error playing sound:", error)
        }
      }
    })
    await Promise.all(promises)
  }

  async stop() {
    const promises = this.sounds.map(async (sound) => {
      if (sound.isPlaying) {
        sound.stop()
      }
    })
    await Promise.all(promises)
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
  
      this.sounds.push(sound)
      sound.connect(this.gainNode)
      console.log("Added and connected new sound to group gain node:", sound)
    })
  }
  

  removeSound(sound) {
    const index = this.sounds.indexOf(sound)
    if (index === -1) {
      console.warn("The sound is not in the group")
      return
    }
    sound.disconnect(this.gainNode)
    this.sounds.splice(index, 1)
    console.log("Removed and disconnected sound from group gain node:", sound)
    if (this.sounds.length === 0) {
      this.gainNode.disconnect(this.context.destination)
    }
  }

  setVolumeGradually(value, duration = 1) {
    const currentTime = this.context.currentTime
    gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime)
    gainNode.gain.linearRampToValueAtTime(value, currentTime + duration)
    console.log(`Volume set to ${value} over ${duration} seconds`)
  }

  mute() {
    if (!this.muted) {
      this.previousVolume = this.volume
      this.volume = 0
      this.muted = true
      console.log("Group muted")
    }
  }

  unmute() {
    if (this.muted) {
      this.volume = this.previousVolume
      this.muted = false
      console.log("Group unmuted")
    }
  }
}

export default Group
