import Sound from './Sound.js'
import PriorityQueue from './PriorityQueue.js'
import Events from './Events.js'
import Tempo from './Tempo.js'
import { createAudioContext } from './audioContext.js'

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
      // Musical events are queued in beats, not seconds. Converting only when
      // they come due is what lets a tempo change move everything still in the
      // queue; anything already handed to the audio clock is committed.
      beatQueue: new PriorityQueue(),
      repeats: [],
      nextRepeatID: 1,
      tempo: new Tempo(options),
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
    properties.context = createAudioContext()
    // Beat 0 is the moment the transport starts, not the moment the context was
    // created, so musical positions are relative to playback.
    properties.tempo.reset(properties.context.currentTime, 0)
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
    const tempo = properties.tempo

    const due = []

    while (!properties.soundQueue.isEmpty() && properties.soundQueue.peek().priority <= horizon) {
      const entry = properties.soundQueue.dequeue()
      if (entry && entry.sound) due.push({ sound: entry.sound, time: entry.time })
    }

    const horizonBeat = tempo.timeToBeat(horizon)
    while (!properties.beatQueue.isEmpty() && properties.beatQueue.peek().priority <= horizonBeat) {
      const entry = properties.beatQueue.dequeue()
      if (entry && entry.sound) {
        due.push({ sound: entry.sound, time: tempo.beatToTime(entry.beat), beat: entry.beat })
      }
    }

    this.runRepeats(horizonBeat)

    // Both queues feed one stream of events, so order by when they will sound.
    due.sort((a, b) => a.time - b.time)

    for (const { sound, time, beat } of due) {
      if (time < now - properties.maxLateness) {
        this.events.trigger('missed', sound, time, beat)
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

      this.events.trigger('play', sound, when, beat)
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

    for (const queue of [properties.soundQueue, properties.beatQueue]) {
      while (!queue.isEmpty()) {
        const entry = queue.dequeue()
        if (entry && entry.sound && entry.sound.isPlaying) {
          entry.sound.stop()
        }
      }
    }
    properties.repeats.length = 0

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

  /**
   * Fires each registered repeat for every grid point now inside the lookahead
   * window. The callback receives the exact audio-clock time of that grid point,
   * so it can schedule sound there rather than playing when it is called --
   * which is always early, by design.
   */
  runRepeats(horizonBeat) {
    const properties = timelineProperties.get(this)

    for (const repeat of properties.repeats) {
      // A pathological interval combined with a wide horizon could spin here.
      let fired = 0
      while (repeat.nextBeat <= horizonBeat && fired < 256) {
        repeat.callback(properties.tempo.beatToTime(repeat.nextBeat), repeat.nextBeat)
        repeat.nextBeat += repeat.interval
        fired++
      }
    }
  }

  /**
   * Runs a callback on a musical grid: every `beats` beats, forever. Unlike
   * startInterval, which counts wall-clock milliseconds and drifts against the
   * audio clock, this follows tempo and is called ahead of time with the exact
   * time to schedule for.
   *
   * @returns {number} an id for stopEveryBeat
   */
  everyBeat(beats, callback, startBeat = null) {
    if (!(beats > 0)) throw new Error('everyBeat needs an interval greater than 0')

    const properties = timelineProperties.get(this)
    const from = startBeat ?? Math.ceil(this.currentBeat / beats) * beats
    const id = properties.nextRepeatID++

    properties.repeats.push({ id, interval: beats, nextBeat: from, callback })
    return id
  }

  stopEveryBeat(id) {
    const properties = timelineProperties.get(this)
    const index = properties.repeats.findIndex(repeat => repeat.id === id)
    if (index === -1) return false
    properties.repeats.splice(index, 1)
    return true
  }

  scheduleSound(sound, time) {
    this.soundQueue.enqueue({ sound, time }, time)
    this.events.trigger('scheduled', sound, time)
  }

  /** Schedules a sound at a beat position rather than at a number of seconds. */
  scheduleBeat(sound, beat) {
    const properties = timelineProperties.get(this)
    properties.beatQueue.enqueue({ sound, beat }, beat)
    this.events.trigger('scheduled', sound, properties.tempo.beatToTime(beat), beat)
  }

  /** Schedules a sound at bar/beat. Both are zero-indexed. */
  scheduleBar(sound, bar, beat = 0) {
    this.scheduleBeat(sound, this.at(bar, beat))
  }

  rescheduleBeat(sound, newBeat) {
    const properties = timelineProperties.get(this)
    properties.beatQueue.remove(entry => entry.sound === sound)
    this.scheduleBeat(sound, newBeat)
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

  /* ---- musical position ------------------------------------------------ *
   * Bars and beats are zero-indexed: bar 0 beat 0 is the downbeat.
   * -------------------------------------------------------------------- */

  /** The beat number for a bar/beat position, for passing to scheduleBeat. */
  at(bar, beat = 0) {
    return this.tempo.barToBeat(bar, beat)
  }

  beatToTime(beat) {
    return this.tempo.beatToTime(beat)
  }

  timeToBeat(time) {
    return this.tempo.timeToBeat(time)
  }

  beatsToSeconds(beats) {
    return this.tempo.beatsToSeconds(beats)
  }

  secondsToBeats(seconds) {
    return this.tempo.secondsToBeats(seconds)
  }

  /**
   * The next whole beat boundary, always strictly ahead of now, for launching
   * something in sync with what is already playing.
   */
  nextBeat(count = 1) {
    return Math.floor(this.currentBeat) + count
  }

  /** The downbeat of the next bar, in beats. */
  nextBar(count = 1) {
    return (Math.floor(this.currentBar) + count) * this.beatsPerBar
  }

  get tempo() {
    return timelineProperties.get(this).tempo
  }

  get bpm() {
    return timelineProperties.get(this).tempo.bpm
  }

  /**
   * Changes tempo from now onward. Beats already played keep their times, and
   * anything still queued but outside the lookahead window moves with the new
   * tempo. Sounds already handed to the audio clock are committed and will not
   * move -- the same way a DAW cannot un-send audio to the hardware.
   */
  set bpm(value) {
    const properties = timelineProperties.get(this)
    properties.tempo.setBpm(value, this.currentTime)
  }

  get beatsPerBar() {
    return timelineProperties.get(this).tempo.beatsPerBar
  }

  set beatsPerBar(value) {
    timelineProperties.get(this).tempo.beatsPerBar = value
  }

  get currentBeat() {
    return this.tempo.timeToBeat(this.currentTime)
  }

  get currentBar() {
    return this.tempo.beatToBar(this.currentBeat)
  }

  get beatQueue() {
    return timelineProperties.get(this).beatQueue
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
