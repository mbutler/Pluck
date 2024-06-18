import Sound from './Sound.js'
import PriorityQueue from './PriorityQueue.js'

class Timeline {
  constructor() {
    this.context = null
    this.sounds = []
    this.startTime = null
    this.currentTime = 0
    this.lastTimestamp = 0
    this.isPlaying = false,
    this.soundQueue = new PriorityQueue()
    this.events = {
      onStart: [],
      onStop: [],
      onLoop: [],
      onSoundScheduled: [],
      onSoundPlayed: []
    }
  }

  on(event, listener) {
    if (this.events[event]) {
      this.events[event].push(listener)
    } else {
      console.error(`Event ${event} is not supported.`)
    }
  }

  triggerEvent(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(...args))
    }
  }

  start() {
    this.context = new (window.AudioContext || window.webkitAudioContext)()
    console.log('Audio context initialized', this.context)
    this.startTime = this.context.currentTime
    console.log('Timeline started', this.startTime)
    this.isPlaying = true
    this.triggerEvent('onStart')
    this.loop()
  }

  async loop() {
    if (!this.isPlaying) return

    this.currentTime = this.context.currentTime - this.startTime

    while (!this.soundQueue.isEmpty() && this.soundQueue.peek().time <= currentTime) {
      const { sound, offset, options } = this.soundQueue.dequeue().item
      try {
        await sound.play(offset)
        this.triggerEvent('onSoundPlayed', sound, currentTime, offset)
        if (options.loop) {
          this.scheduleSound(sound, currentTime + sound.audioBuffer.duration, offset, options)
        }
      } catch (error) {
        console.error("Error playing sound:", error)
      }
    }

    if (this.currentTime - this.lastTimestamp >= 1) {
      this.lastTimestamp = this.currentTime
      this.runEverySecond()
      this.triggerEvent('onLoop')
    }

    requestAnimationFrame(() => this.loop())
  }

  stop() {
    this.isPlaying = false
    this.triggerEvent('onStop')
  }

  scheduleSound(sound, time, offset = 0, options = {}) {
    this.soundQueue.enqueue({ sound, time, offset, options }, time)
    this.triggerEvent('onSoundScheduled', sound, time, offset, options)
  }

  rescheduleSound(sound, newTime, offset = 0, options = {}) {
    this.soundQueue.remove(sound)
    this.scheduleSound(sound, newTime, offset, options)
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
          this.triggerEvent('onSoundPlayed', sound, time, offset)
          console.log(`Played sound at ${time} with offset=${offset}`)
        } catch (error) {
          console.error('Error playing sound:', error)
        }
      }
    }
  }

  playNow(sound) {
    this.soundQueue.enqueue({ sound, time: this.context.currentTime, offset: 0, options: {} }, 0)
  }
  
  scheduleEffect(effect, time) {
    this.soundQueue.enqueue({ effect, time }, time)
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
