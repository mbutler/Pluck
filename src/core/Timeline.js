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

  loop() {
    if (!this.isPlaying) return

    this.currentTime = this.context.currentTime - this.startTime
    this.playScheduledSounds()
    requestAnimationFrame(() => this.loop())
    if (this.currentTime - this.lastTimestamp >= 1) {
        this.lastTimestamp = this.currentTime;
        this.runEverySecond();
      }
  }

  stop() {
    this.isPlaying = false
  }

  scheduleSound(sound, time) {
    this.sounds.push({ sound, time })
  }

  async playScheduledSounds() {
    for (const { sound, time } of this.sounds) {
      if (this.currentTime >= time && !sound.isPlaying) {
        try {
          await sound.play()
          sound.isPlaying = true
        } catch (error) {
          console.error('Error playing sound:', error)
        }
      }
    }
  }

  addSound(file, startTime) {
    const sound = new Sound({ file, context: this.context })
    this.scheduleSound(sound, startTime)
  }

  async addSoundAsync(file, startTime) {
    const sound = new Sound({ file, context: this.context })
    await sound.initialized
    this.scheduleSound(sound, startTime)
  }

    runEverySecond() {
        console.log('Every second')
    }
}

export default Timeline