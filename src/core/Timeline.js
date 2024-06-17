import Sound from './Sound.js'

class Timeline {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)()
    this.sounds = []
    this.startTime = null
    this.currentTime = 0
    this.lastTimestamp = 0
    this.isPlaying = false
  }

  start() {
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

  scheduleSound(sound, time, options = {}) {
    this.sounds.push({ sound, time, options, played: false })
  }

  async playScheduledSounds() {
    for (const scheduledSound of this.sounds) {
      const { sound, time, played, options } = scheduledSound
      if (this.currentTime >= time && (!played || options.loop)) {
        try {
          if (!played || options.loop) {
            await sound.play()
            if (!options.loop) {
              scheduledSound.played = true
            }
            console.log(`Played sound at ${time}`)
          }
        } catch (error) {
          console.error('Error playing sound:', error)
        }
      }
    }
  }

  async addSound(file, startTime, options = {}) {
    const sound = new Sound({ file, context: this.context, ...options })
    await sound.initialized
    this.scheduleSound(sound, startTime, options)
  }

  runEverySecond() {
    console.log('Every second')
  }
}

export default Timeline
