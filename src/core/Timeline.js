import Sound from './Sound.js'

class Timeline {
  constructor() {
    this.context = null
    this.sounds = []
    this.startTime = null
    this.currentTime = 0
    this.lastTimestamp = 0
    this.isPlaying = false
  }

  start() {
    this.context = new (window.AudioContext || window.webkitAudioContext)()
    console.log('Audio context initialized', this.context)
    this.startTime = this.context.currentTime
    console.log('Timeline started', this.startTime)
    this.isPlaying = true
    this.loop()
  }

  async loop() {
    if (!this.isPlaying) return

    this.currentTime = this.context.currentTime - this.startTime

    await this.playScheduledSounds()

    if (this.currentTime - this.lastTimestamp >= 1) {
      this.lastTimestamp = this.currentTime
      this.runEverySecond()
    }

    requestAnimationFrame(() => this.loop())
  }

  stop() {
    this.isPlaying = false
  }

  scheduleSound(sound, time, offset = 0, options = {}) {
    this.sounds.push({ sound, time, offset, options, played: false })
  }

  async playScheduledSounds() {
    for (const scheduledSound of this.sounds) {
      const { sound, time, offset, played, options } = scheduledSound
      if (this.currentTime >= time && (!played || options.loop)) {
        try {
          await sound.play(offset)
          if (!options.loop) {
            scheduledSound.played = true
          }
          console.log(`Played sound at ${time} with offset=${offset}`)
        } catch (error) {
          console.error('Error playing sound:', error)
        }
      }
    }
  }

  async addSound(file, offset = 0, startTime, options = {}) {
    const sound = new Sound({ file, context: this.context, ...options })
    await sound.initialized
    this.scheduleSound(sound, startTime, offset, options)
  }

  async playSound(file, offset = 0, options = {}) {
    if (!this.context) {
      console.error('Audio context is not initialized. Call start() first.')
      return
    }
    const sound = new Sound({ file, context: this.context, ...options })
    await sound.initialized
    await sound.play(offset)
  }

  runEverySecond() {
    console.log('Every second')
  }
}

export default Timeline
