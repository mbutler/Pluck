import Sound from './Sound.js'
import PriorityQueue from './PriorityQueue.js'

class Timeline {
  constructor() {
    this.context = null
    this.sounds = []
    this.currentTime = 0
    this.lastTimestamp = 0
    this.isPlaying = false
    this.soundQueue = new PriorityQueue()
    this.events = {
      onStart: [],
      onStop: [],
      onLoop: [],
      onSoundScheduled: [],
      onSoundPlayed: [],
      onEffectTriggered: []
    }
  }

  on(event, listener) {
    if (this.events[event]) {
      this.events[event].push(listener)
    } else {
      console.error(`Event ${event} is not supported.`)
    }
  }

  triggerEvent(event, sound, time, options) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(sound, time, options))
    }
  }

  async start() {
    this.context = new (window.AudioContext || window.webkitAudioContext)()
    console.log('Audio context initialized', this.context)
    this.isPlaying = true
    this.triggerEvent('onStart')
    await this.context.resume()  // Ensure the audio context is running
    this.loop()
  }

  async loop() {
    if (!this.isPlaying) return

    this.currentTime = this.context.currentTime

    while (!this.soundQueue.isEmpty() && this.soundQueue.peek().priority <= this.currentTime) {

      const node = this.soundQueue.dequeue()
      const { sound, time, options } = node
      console.log("OPTIONS:", options)  
      console.log(`Processing item scheduled for time: ${time}`)      

      if (sound) {
        console.log('Playing sound:', sound)
        try {
          await sound.play()
          this.triggerEvent('onSoundPlayed', sound, this.currentTime, options)
        } catch (error) {
          console.error("Error playing sound:", error)
        }
      }
    }

    this.triggerEvent('onLoop')
    requestAnimationFrame(() => this.loop())
  }

  stop() {
    this.isPlaying = false
    this.triggerEvent('onStop')
  }

  scheduleSound(sound, time, options = {}) {
    this.soundQueue.enqueue({ sound, time, options }, time)
    console.log("Queue state after scheduling:", this.soundQueue)
    this.triggerEvent('onSoundScheduled', sound, time, options)
  }

  rescheduleSound(sound, newTime, options = {}) {
    this.soundQueue.remove(sound)
    this.scheduleSound(sound, newTime, options)
  }

  playNow(sound) {
    this.soundQueue.enqueue({ sound, time: this.currentTime, options: {} }, this.currentTime)
    console.log(`Playing sound immediately at ${this.currentTime}`)
  }

  scheduleEffect(effect, time) {
    this.soundQueue.enqueue({ effect, time }, time)
  }

  async addSound(file, startTime, options = {}) {
    const sound = new Sound({ file, context: this.context, ...options })
    await sound.initialized
    this.scheduleSound(sound, startTime, options)
  }

  async playSound(file, options = {}) {
    if (!this.context) {
      console.error('Audio context is not initialized. Call start() first.')
      return
    }
    const sound = new Sound({ file, context: this.context, ...options })
    await sound.initialized
    await sound.play()
    this.triggerEvent('onSoundPlayed', sound, this.currentTime, options)
  }

  runEverySecond() {
    console.log('Every second')
  }
}

export default Timeline
