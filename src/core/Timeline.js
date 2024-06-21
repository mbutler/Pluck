import Sound from './Sound.js'
import PriorityQueue from './PriorityQueue.js'

const timelineProperties = new WeakMap()

class Timeline {
  constructor() {
    const properties = {
      context: null,
      currentTime: 0,
      isPlaying: false,
      soundQueue: new PriorityQueue(),
      intervalIDs: {},
      events: {
        onStart: [],
        onStop: [],
        onLoop: [],
        onSoundScheduled: [],
        onSoundPlayed: [],
        onEffectTriggered: []
      }
    }
    timelineProperties.set(this, properties)
  }

  get context() {
    return timelineProperties.get(this).context
  }

  set context(value) {
    const properties = timelineProperties.get(this)
    properties.context = value
  }

  get currentTime() {
    return timelineProperties.get(this).currentTime
  }

  set currentTime(value) {
    const properties = timelineProperties.get(this)
    properties.currentTime = value
  }

  get isPlaying() {
    return timelineProperties.get(this).isPlaying
  }

  set isPlaying(value) {
    const properties = timelineProperties.get(this)
    properties.isPlaying = value
  }

  get soundQueue() {
    return timelineProperties.get(this).soundQueue
  }

  get intervalIDs() {
    return timelineProperties.get(this).intervalIDs
  }

  set intervalIDs(value) {
    const properties = timelineProperties.get(this)
    properties.intervalIDs = value
  }

  get events() {
    return timelineProperties.get(this).events
  }

  on(event, listener) {
    const properties = timelineProperties.get(this)
    if (properties.events[event]) {
      properties.events[event].push(listener)
    } else {
      console.error(`Event ${event} is not supported.`)
    }
  }

  off(event, listener) {
    const properties = timelineProperties.get(this)
    if (properties.events[event]) {
      properties.events[event] = properties.events[event].filter(l => l !== listener)
    } else {
      console.error(`Event ${event} is not supported.`)
    }
  }

  future(seconds) {
    return this.currentTime + seconds
  }

  startInterval(intervalInSeconds, callback) {
    const intervalID = setInterval(() => {
      callback()
    }, intervalInSeconds * 1000)
    this.intervalIDs = { ...this.intervalIDs, [intervalInSeconds]: intervalID }
  }

  stopInterval(intervalInSeconds) {
    const intervalID = this.intervalIDs[intervalInSeconds]
    if (intervalID) {
      clearInterval(intervalID)
      const { [intervalInSeconds]: _, ...remainingIntervalIDs } = this.intervalIDs
      this.intervalIDs = remainingIntervalIDs
    }
  }

  triggerEvent(event, sound, time) {
    const properties = timelineProperties.get(this)
    if (properties.events[event]) {
      properties.events[event].forEach(listener => listener(sound, time))
    }
  }

  async start() {
    this.context = new (window.AudioContext || window.webkitAudioContext)()
    console.log('Audio context initialized', this.context)
    this.isPlaying = true
    this.triggerEvent('onStart')
    await this.context.resume()
    this.loop()
  }

  async loop() {
    if (!this.isPlaying) return

    this.currentTime = this.context.currentTime

    while (!this.soundQueue.isEmpty() && this.soundQueue.peek().priority <= this.currentTime) {
      const node = this.soundQueue.dequeue()
      const { sound, time } = node
      console.log(`Processing item scheduled for time: ${time}`)

      if (sound) {
        console.log('Playing sound:', sound)
        try {
          await sound.play()
          this.triggerEvent('onSoundPlayed', sound, this.currentTime)
        } catch (error) {
          console.error("Error playing sound:", error)
        }
      }
    }

    this.triggerEvent('onLoop')
    requestAnimationFrame(() => this.loop())
  }

  stop() {
    Object.keys(this.intervalIDs).forEach(intervalInSeconds => {
      this.stopTimer(Number(intervalInSeconds))
    })
  
    while (!this.soundQueue.isEmpty()) {
      const node = this.soundQueue.dequeue()
      const { sound } = node
      if (sound && sound.isPlaying) {
        sound.stop()
      }
    }
  
    if (this.context && this.context.state !== 'closed') {
      this.context.close()
    }
  
    this.isPlaying = false
    this.triggerEvent('onStop')
  }

  scheduleSound(sound, time) {
    this.soundQueue.enqueue({ sound, time }, time)
    console.log("Queue state after scheduling:", this.soundQueue)
    this.triggerEvent('onSoundScheduled', sound, time)
  }

  rescheduleSound(sound, newTime) {
    this.soundQueue.remove(sound)
    this.scheduleSound(sound, newTime)
  }

  playNow(sound) {
    this.soundQueue.enqueue({ sound, time: this.currentTime }, this.currentTime)
    console.log(`Playing sound immediately at ${this.currentTime}`)
  }

  async addSound(file, startTime, options = {}) {
    const sound = new Sound({ file, ...options })
    await sound.initialized
    this.scheduleSound(sound, startTime)
  }

  async playSound(file, options = {}) {
    const sound = new Sound({ file, ...options })
    await sound.initialized
    await sound.play()
    this.triggerEvent('onSoundPlayed', sound, this.currentTime)
  }

  runEverySecond() {
    console.log('Every second')
  }
}

export default Timeline
