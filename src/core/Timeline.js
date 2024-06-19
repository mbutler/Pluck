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

  triggerEvent(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(...args))
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

  async loop(offset = 0) {
    if (!this.isPlaying) return

    this.currentTime = this.context.currentTime

    while (!this.soundQueue.isEmpty() && this.soundQueue.peek().priority <= this.currentTime) {

      const node = this.soundQueue.dequeue()
      const { sound, time, offset, options } = node
      console.log("node:", node)  
      console.log(`Processing item scheduled for time: ${node.priority}`)      

      if (sound) {
        console.log('Playing sound:', sound)
        try {
          await sound.play(offset)
          this.triggerEvent('onSoundPlayed', sound, this.currentTime, offset)
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

  scheduleSound(sound, time, offset = 0, options = {}) {
    this.soundQueue.enqueue({ sound, time, offset, options }, time)
    console.log(`Scheduled sound at ${time} with offset ${offset}`)
    console.log("Queue state after scheduling:", this.soundQueue)
    this.triggerEvent('onSoundScheduled', sound, time, offset, options)
  }

  rescheduleSound(sound, newTime, offset = 0, options = {}) {
    this.soundQueue.remove(sound)
    this.scheduleSound(sound, newTime, offset, options)
  }

  playNow(sound) {
    this.soundQueue.enqueue({ sound, time: this.currentTime, offset: 0, options: {} }, this.currentTime)
    console.log(`Playing sound immediately at ${this.currentTime}`)
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
    this.triggerEvent('onSoundPlayed', sound, this.currentTime, offset)
  }

  runEverySecond() {
    console.log('Every second')
  }
}

export default Timeline
