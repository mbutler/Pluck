import Sound from './Sound.js'
import PriorityQueue from './PriorityQueue.js'
import Events from './Events.js'

const timelineProperties = new WeakMap()

class Timeline {
  constructor() {
    const properties = {
      context: null,
      currentTime: 0,
      isPlaying: false,
      soundQueue: new PriorityQueue(),
      intervalIDs: {},
      events: new Events()
    }
    timelineProperties.set(this, properties)
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

  async start() {
    console.info('Starting timeline')
    this.context = new (window.AudioContext || window.webkitAudioContext)()
    this.isPlaying = true
    this.events.trigger('start')
    await this.context.resume()
    this.loop()
  }

  async loop() {
    if (!this.isPlaying) return

    this.currentTime = this.context.currentTime

    while (!this.soundQueue.isEmpty() && this.soundQueue.peek().priority <= this.currentTime) {
      const node = this.soundQueue.dequeue()
      const { sound, time } = node

      if (sound) {
        try {
          await sound.play()
          this.events.trigger('play', sound, this.currentTime)
        } catch (error) {
          console.error("Error playing sound:", error)
        }
      }
    }

    this.events.trigger('loop')
    requestAnimationFrame(() => this.loop())
  }

  stop() {
    Object.keys(this.intervalIDs).forEach(intervalInSeconds => {
      this.stopInterval(Number(intervalInSeconds))
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
    this.events.trigger('stop')
  }

  scheduleSound(sound, time) {
    this.soundQueue.enqueue({ sound, time }, time)
    this.events.trigger('scheduled', sound, time)
  }

  rescheduleSound(sound, newTime) {
    this.soundQueue.remove(sound)
    this.scheduleSound(sound, newTime)
  }

  playNow(sound) {
    this.soundQueue.enqueue({ sound, time: this.currentTime }, this.currentTime)
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
    this.events.trigger('play', sound, this.currentTime)
  }

  future(seconds) {
    return this.currentTime + seconds
  }

  runEverySecond() {
    console.info('Every second')
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

  set events(value) {
    const properties = timelineProperties.get(this)
    properties.events = value
  }
}

export default Timeline
