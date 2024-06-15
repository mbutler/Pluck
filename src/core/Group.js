import EventManager from '../events/EventManager'
import Sound from './Sound'

class Group extends EventManager {
  constructor(sounds = []) {
    super()
    this.sounds = []
    this.effects = []
    this.initGroup(sounds)
  }

  initGroup(sounds) {
    sounds.forEach(sound => this.addSound(sound))
  }

  addSound(sound) {
    if (!(sound instanceof Sound)) {
      console.error('You can only add instances of Sound')
      return
    }
    if (this.sounds.includes(sound)) {
      console.warn('The Sound object is already added to this group')
      return
    }
    this.sounds.push(sound)
  }

  removeSound(sound) {
    const index = this.sounds.indexOf(sound)
    if (index === -1) {
      console.warn('Cannot remove a sound that is not part of this group')
      return
    }
    this.sounds.splice(index, 1)
  }

  play() {
    this.sounds.forEach(sound => sound.play())
    this.trigger('play')
  }

  pause() {
    this.sounds.forEach(sound => sound.pause())
    this.trigger('pause')
  }

  stop() {
    this.sounds.forEach(sound => sound.stop())
    this.trigger('stop')
  }

  setVolume(volume) {
    if (volume < 0 || volume > 1) return
    this.sounds.forEach(sound => sound.setVolume(volume))
  }

  // Additional methods as required
}

export default Group
