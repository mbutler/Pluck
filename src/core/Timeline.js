import Sound from './Sound.js'
import PriorityQueue from './PriorityQueue.js'
import Events from './Events.js'

const timelineProperties = new WeakMap()

const DEFAULTS = {
  // How far ahead of the audio clock sounds are handed to the hardware. This is
  // deliberately larger than the one second that browsers throttle background
  // timers to, so a hidden tab still schedules everything on time.
  lookahead: 2,

  // How often the scheduler wakes up. Only affects how promptly a newly queued
  // sound is noticed; it has no bearing on playback accuracy, because sounds
  // are placed on the audio clock rather than started when the timer fires.
  tickInterval: 0.25,

  // A backlog can build up if the scheduler is starved for longer than the
  // lookahead: a sleeping machine, or a tab throttled harder than expected.
  // Firing all of it at once is worse than dropping it, so anything later than
  // this is skipped and reported through the 'missed' event.
  maxLateness: 1
}

class Timeline {
  constructor(options = {}) {
    const properties = {
      context: null,
      isPlaying: false,
      soundQueue: new PriorityQueue(),
      intervalIDs: {},
      events: new Events(),
      lookahead: options.lookahead ?? DEFAULTS.lookahead,
      tickInterval: options.tickInterval ?? DEFAULTS.tickInterval,
      maxLateness: options.maxLateness ?? DEFAULTS.maxLateness,
      schedulerID: null,
      // { sound, ready } entries for sounds handed to the audio clock but not
      // finished. They are no longer in the queue, so stop() needs its own
      // handle on them to cancel them.
      active: new Set()
    }
    timelineProperties.set(this, properties)
  }

  async start() {
    console.info('Starting timeline')
    const properties = timelineProperties.get(this)

    this.stopScheduler()
    properties.context = new (window.AudioContext || window.webkitAudioContext)()
    properties.isPlaying = true
    this.events.trigger('start')
    await properties.context.resume()

    this.tick()
    properties.schedulerID = setInterval(() => this.tick(), properties.tickInterval * 1000)
  }

  /**
   * Hands every sound due within the lookahead window to the audio clock, with
   * the exact time it should start. Sounds are not started when this runs, so
   * the interval can be coarse and irregular without affecting timing.
   */
  tick() {
    const properties = timelineProperties.get(this)
    if (!properties.isPlaying || !properties.context) return

    const now = properties.context.currentTime
    const horizon = now + properties.lookahead

    while (!properties.soundQueue.isEmpty() && properties.soundQueue.peek().priority <= horizon) {
      const entry = properties.soundQueue.dequeue()
      if (!entry || !entry.sound) continue

      const { sound, time } = entry

      if (time < now - properties.maxLateness) {
        this.events.trigger('missed', sound, time)
        continue
      }

      const when = Math.max(time, now)

      // `ready` guards the pruning below: play() is deliberately not awaited, so
      // the sound is not yet marked playing when this tick finishes, and pruning
      // on isPlaying alone would drop it again immediately.
      const tracked = { sound, ready: false }
      properties.active.add(tracked)

      // Not awaited: the sound only has to reach source.start() before `when`
      // arrives, and awaiting here would serialise sounds meant to be
      // simultaneous.
      Promise.resolve(sound.play(false, when))
        .catch(error => console.error('Error playing scheduled sound:', error))
        .finally(() => { tracked.ready = true })

      this.events.trigger('play', sound, when)
    }

    for (const tracked of properties.active) {
      if (tracked.ready && !tracked.sound.isPlaying) properties.active.delete(tracked)
    }

    this.events.trigger('loop')
  }

  stop() {
    const properties = timelineProperties.get(this)

    Object.keys(properties.intervalIDs).forEach(intervalInSeconds => {
      this.stopInterval(Number(intervalInSeconds))
    })
    this.stopScheduler()

    // Sounds already placed on the audio clock will fire unless cancelled.
    properties.active.forEach(entry => entry.sound.stop())
    properties.active.clear()

    while (!properties.soundQueue.isEmpty()) {
      const entry = properties.soundQueue.dequeue()
      if (entry && entry.sound && entry.sound.isPlaying) {
        entry.sound.stop()
      }
    }

    if (properties.context && properties.context.state !== 'closed') {
      properties.context.close()
    }

    properties.isPlaying = false
    this.events.trigger('stop')
  }

  stopScheduler() {
    const properties = timelineProperties.get(this)
    if (properties.schedulerID === null) return
    clearInterval(properties.schedulerID)
    properties.schedulerID = null
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

  scheduleSound(sound, time) {
    this.soundQueue.enqueue({ sound, time }, time)
    this.events.trigger('scheduled', sound, time)
  }

  rescheduleSound(sound, newTime) {
    this.soundQueue.remove(entry => entry.sound === sound)
    this.scheduleSound(sound, newTime)
  }

  playNow(sound) {
    this.scheduleSound(sound, this.currentTime)
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

  get context() {
    return timelineProperties.get(this).context
  }

  set context(value) {
    const properties = timelineProperties.get(this)
    properties.context = value
  }

  /** Live audio-clock time. Read-only: the audio clock cannot be set. */
  get currentTime() {
    const properties = timelineProperties.get(this)
    return properties.context ? properties.context.currentTime : 0
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

  get lookahead() {
    return timelineProperties.get(this).lookahead
  }

  set lookahead(value) {
    const properties = timelineProperties.get(this)
    properties.lookahead = value
  }

  get tickInterval() {
    return timelineProperties.get(this).tickInterval
  }

  set tickInterval(value) {
    const properties = timelineProperties.get(this)
    properties.tickInterval = value
    if (properties.schedulerID !== null) {
      this.stopScheduler()
      properties.schedulerID = setInterval(() => this.tick(), value * 1000)
    }
  }

  get maxLateness() {
    return timelineProperties.get(this).maxLateness
  }

  set maxLateness(value) {
    const properties = timelineProperties.get(this)
    properties.maxLateness = value
  }
}

export default Timeline
