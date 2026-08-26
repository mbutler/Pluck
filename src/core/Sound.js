import Events from './Events.js'
import Voice from './Voice.js'
import { rebuildChain } from './chain.js'
import { createAudioContext } from './audioContext.js'
import bufferCache, { fetchAndDecode } from './BufferCache.js'

const soundProperties = new WeakMap()

const isMediaStream = value => !!value && typeof value.getTracks === 'function'

class Sound {
  constructor(options = {}) {
    const audioContext = options.context || createAudioContext()
    const gainNode = audioContext.createGain()
    gainNode.gain.value = options.volume ?? 1
    // Voices connect into this node, so it has to reach the output whether or
    // not anything is playing yet.
    gainNode.connect(audioContext.destination)
    const properties = {
      fileName: options.file || options.fileName || null,
      context: audioContext,
      source: null,
      audioBuffer: options.audioBuffer || null,
      volume: options.volume || 1,
      loop: options.loop || false,
      attack: options.attack || 0.04,
      release: options.release || 0.04,
      offset: options.offset || 0,
      gainNode,
      mediaStream: isMediaStream(options.input) ? options.input : null,
      clearBuffer: options.clearBuffer || false,
      isPlaying: false,
      isGrouped: false,
      events: new Events(),
      waveOptions: options.wave || null,
      output: audioContext.destination,
      useCache: options.cache !== false,
      // Effects sit after the sound's gain node, so there is one instance per
      // sound rather than per voice, and a delay or reverb tail outlives the
      // voice that fed it.
      effects: [],
      // Extra destinations added with connect(), re-established whenever the
      // chain is rebuilt.
      taps: new Set(),
      // { timer, promise } while a fade-out is running, so a second request
      // joins the first instead of stacking a second ramp on the same gain.
      fadeOut: null,
      // Set when the source is a streaming <audio> element rather than a
      // decoded buffer. Streamed sounds have no voices: the element itself is
      // the one thing playing.
      streamUrl: options.stream || null,
      audioElement: null,
      // How many instances of this sound may ring at once. The default of 1
      // restarts on replay; raising it lets hits overlap.
      polyphony: options.polyphony ?? 1,
      voices: []
    }
    soundProperties.set(this, properties)

    this.initialized = this.initialize(options)
  }

  async initialize(options) {
    try {
      await this.initSource(options)
    } catch (error) {
      console.error('Error initializing source:', error)
      throw error
    }
  }

  async initSource(options) {
    if (options.stream) {
      this.initFromStream(options.stream)
    } else if (options.file) {
      await this.loadFromFile(options.file)
    } else if (options.audioBuffer) {
      // Nothing to build: the buffer is all a voice needs.
    } else if (options.wave) {
      this.initFromWave(options.wave)
    } else if (options.input) {
      await this.initFromInput(isMediaStream(options.input) ? options.input : null)
    } else {
      this.initFromWave({ type: 'sine', frequency: 440 })
    }
  }

  async loadFromFile(file) {
    const properties = soundProperties.get(this)
    try {
      // The shared cache means several Sounds on the same file cost one fetch
      // and one decode between them, and hold one buffer rather than one each.
      this.audioBuffer = properties.useCache
        ? await bufferCache.load(this.context, file)
        : await fetchAndDecode(this.context, file)
    } catch (error) {
      console.error('Error loading sound file:', error)
    }
  }

  initFromWave(waveOptions) {
    soundProperties.get(this).waveOptions = waveOptions
  }

  /**
   * Streams from an <audio> element instead of decoding the whole file.
   *
   * A decoded AudioBuffer is uncompressed float32: a fifteen-minute stereo file
   * is over three hundred megabytes in memory, and several of those at once is
   * more than a browser tab should be asked to hold. Streaming keeps the file
   * compressed and reads it as it plays, which is what long-form audio -- music
   * beds, ambient layers, anything measured in minutes -- actually wants.
   *
   * The trade is timing. A media element cannot be started at an exact time on
   * the audio clock, so a streamed sound is scheduled with a timer and lands
   * within a few milliseconds rather than on the sample. That is fine for a pad
   * and wrong for a snare.
   */
  initFromStream(url) {
    const properties = soundProperties.get(this)
    const element = new Audio()
    element.crossOrigin = 'anonymous'   // must be set before src to take effect
    element.preload = 'auto'
    element.src = url
    element.loop = properties.loop

    properties.audioElement = element
    properties.streamUrl = url
    properties.source = this.context.createMediaElementSource(element)
    this.connectGain()

    element.addEventListener('ended', () => {
      // Only reached when the element is not looping.
      if (!properties.isPlaying) return
      properties.isPlaying = false
      this.events.trigger('ended', this)
    })
  }

  /** Starts the streaming element, at `when` if that is still ahead of us. */
  playStream(when) {
    const properties = soundProperties.get(this)
    const element = properties.audioElement

    element.loop = properties.loop
    properties.isPlaying = true
    this.applyAttack(this.context.currentTime)
    this.events.trigger('play', this)

    const begin = () => {
      element.currentTime = properties.offset
      const started = element.play()
      if (started && typeof started.catch === 'function') {
        started.catch(error => console.error('Error playing stream:', error))
      }
    }

    const delay = (when - this.context.currentTime) * 1000
    if (delay > 0) {
      // A timer, not the audio clock: see initFromStream.
      properties.streamTimer = setTimeout(begin, delay)
      return
    }

    begin()
  }

  /**
   * Builds a fresh, unconnected source node. Source nodes cannot be restarted,
   * so this runs once per voice; the voice takes ownership of wiring it up.
   */
  createSourceNode() {
    if (this.audioBuffer) {
      const source = this.context.createBufferSource()
      source.buffer = this.audioBuffer
      source.loop = this.loop
      return source
    }

    if (this.waveOptions) {
      const source = this.context.createOscillator()
      source.type = this.waveOptions.type || 'sine'
      source.frequency.value = this.waveOptions.frequency || 440
      return source
    }

    return null
  }

  async initFromInput(existingStream = null) {
    try {
      const stream = existingStream || await navigator.mediaDevices.getUserMedia({ audio: true })
      this.mediaStream = stream
      this.source = this.context.createMediaStreamSource(stream)
      this.connectGain()
    } catch (error) {
      console.error('Error initializing microphone input:', error)
    }
  }

  connectGain() {
    if (this.source) {
      this.source.connect(this.gainNode)
      this.gainNode.connect(this.output)
    } else {
      console.error('No source to connect to gain node')
    }
  }

  /**
   * @param {object}  [options]
   * @param {number}  [options.when=0]  absolute time on the context clock to
   *   start at. Anything at or before now starts immediately, which is the
   *   default. Scheduling ahead is what lets the Timeline place sounds on the
   *   audio clock rather than on whenever a timer happened to fire.
   * @param {boolean} [options.fromGroup=false]  set by Group when it plays its
   *   members; a grouped sound refuses to be played directly.
   */
  async play(options = {}) {
    // A boolean here is the old positional signature, play(fromGroup, when).
    // Destructuring it would silently drop both arguments, so say so instead.
    if (typeof options !== 'object' || options === null) {
      throw new TypeError('play() takes an options object, e.g. play({ when: time })')
    }

    const { when = 0, fromGroup = false } = options
    const properties = soundProperties.get(this)

    if (this.isGrouped && !fromGroup) {
      console.warn(`Cannot play the sound ${this.fileName} directly. It is in a group.`)
      return
    }

    await this.initialized
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }

    // A live input is already streaming; there is nothing to start.
    if (this.mediaStream) {
      this.isPlaying = true
      return
    }

    // A streamed sound has no voices; the element itself is what plays.
    if (properties.audioElement) {
      this.cancelFadeOut()
      this.playStream(when)
      return
    }

    if (!this.audioBuffer && !this.waveOptions) {
      console.error('No audio buffer or source available to play')
      return
    }

    // Buffer and oscillator nodes cannot be restarted, so discard whatever the
    // last play() left behind and build a new one. Grouped sounds included:
    // the fresh source feeds this.gainNode, which is already wired to the
    // group, so the routing survives.
    const source = this.createSourceNode()
    if (!source || !source.start) {
      console.error('No source to play')
      this.isPlaying = false
      return
    }

    const startTime = when > this.context.currentTime ? when : this.context.currentTime
    const voice = new Voice(this.context, source, properties.gainNode)
    voice.onended = () => this.retireVoice(voice)
    properties.voices.push(voice)

    // Trimming to the limit after adding, rather than before, keeps at least
    // one voice in the list throughout. Stealing first would empty it on a
    // monophonic replay and announce an 'ended' the sound never had.
    while (properties.voices.length > properties.polyphony) {
      properties.voices[0].stop()
    }

    properties.source = source
    this.isPlaying = true
    this.events.trigger('play', this)

    voice.start(startTime, this.offset, this.attack)
  }

  /** Called when a voice finishes or is cut short. */
  retireVoice(voice) {
    const properties = soundProperties.get(this)

    const index = properties.voices.indexOf(voice)
    if (index !== -1) properties.voices.splice(index, 1)

    if (properties.voices.length) {
      properties.source = properties.voices[properties.voices.length - 1].source
      return
    }

    properties.source = null
    properties.isPlaying = false
    if (properties.clearBuffer) properties.audioBuffer = null

    // Fired last, so a listener sees the sound fully settled rather than
    // half torn down.
    this.events.trigger('ended', this)
  }

  /**
   * @param {object} [options]
   * @param {number} [options.fade=0]  seconds to ramp to silence before
   *   stopping. The ramp runs on the audio clock rather than on a timer, so it
   *   is smooth regardless of what the main thread is doing.
   * @returns {Promise<void>} resolves once the sound has actually stopped
   */
  stop(options = {}) {
    const properties = soundProperties.get(this)
    const { fade = 0 } = options

    if (fade > 0 && properties.isPlaying) {
      return properties.fadeOut ? properties.fadeOut.promise : this.fadeOutAndStop(fade)
    }

    this.cancelFadeOut()
    this.stopNow()
    return Promise.resolve()
  }

  /** Ramps this sound's gain to silence, then stops it. */
  fadeOutAndStop(seconds) {
    const properties = soundProperties.get(this)
    const gain = properties.gainNode.gain
    const now = this.context.currentTime

    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(0, now + seconds)

    const state = { timer: null, promise: null }
    properties.fadeOut = state

    state.promise = new Promise(resolve => {
      state.timer = setTimeout(() => {
        properties.fadeOut = null
        // Restore the gain before tearing down, or the next play would be
        // silent: the ramp left the node at zero.
        gain.cancelScheduledValues(this.context.currentTime)
        gain.value = properties.volume
        this.stopNow()
        resolve()
      }, seconds * 1000)
    })

    return state.promise
  }

  /** Abandons a fade in progress and puts the gain back where it belongs. */
  cancelFadeOut() {
    const properties = soundProperties.get(this)
    if (!properties.fadeOut) return

    clearTimeout(properties.fadeOut.timer)
    properties.fadeOut = null

    const gain = properties.gainNode.gain
    gain.cancelScheduledValues(this.context.currentTime)
    gain.value = properties.volume
  }

  stopNow() {
    const properties = soundProperties.get(this)
    const wasPlaying = properties.isPlaying

    // Announced before the teardown, so 'stop' always precedes the 'ended' that
    // the teardown triggers. Tearing down first would put them in one order for
    // a sound with voices and the opposite order for a live input.
    this.events.trigger('stop', this)

    // slice() because stopping a voice retires it out of the same array. The
    // last one to retire fires 'ended' on the way out.
    properties.voices.slice().forEach(voice => voice.stop())
    properties.voices.length = 0
    const endedDuringTeardown = wasPlaying && !properties.isPlaying
    properties.isPlaying = false

    if (properties.audioElement) {
      clearTimeout(properties.streamTimer)
      properties.streamTimer = null
      properties.audioElement.pause()
      properties.audioElement.currentTime = 0
      // The element and its source node are kept: unlike a buffer source they
      // are reusable, so the sound can simply be played again.
    } else {
      // A live input has a source node but no voice; unhook it directly.
      if (properties.source && properties.mediaStream) {
        properties.source.disconnect()
      }
      properties.source = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }
    if (this.clearBuffer) {
      this.audioBuffer = null
    }

    // A live input has no voices, so nothing retired to announce the end.
    if (wasPlaying && !endedDuringTeardown) this.events.trigger('ended', this)
  }

  clone() {
    const properties = soundProperties.get(this)
    const options = {
      context: properties.context,
      fileName: properties.fileName,
      volume: properties.volume,
      loop: properties.loop,
      attack: properties.attack,
      release: properties.release,
      offset: properties.offset,
      clearBuffer: properties.clearBuffer,
      polyphony: properties.polyphony,
      cache: properties.useCache
    }

    if (properties.streamUrl) {
      // Each clone streams independently; there is no buffer to share.
      options.stream = properties.streamUrl
    } else if (properties.audioBuffer) {
      // Share the decoded buffer rather than fetching and decoding again.
      options.audioBuffer = properties.audioBuffer
    } else if (properties.fileName) {
      // Nothing decoded yet (still loading, or cleared): let the clone load it.
      options.file = properties.fileName
    } else if (properties.waveOptions) {
      options.wave = { ...properties.waveOptions }
    } else if (properties.mediaStream) {
      // Reuse the live stream; re-prompting for microphone access would be wrong.
      options.input = properties.mediaStream
    }

    return new Sound(options)
  }

  // startTime defaults to now. When a sound is scheduled ahead the envelope has
  // to be scheduled at the same moment, or the gain finishes ramping up long
  // before the source starts and the attack is never heard.
  applyAttack(startTime = this.context.currentTime) {
    if (!this.gainNode) return
    this.gainNode.gain.setValueAtTime(0, startTime)
    this.gainNode.gain.linearRampToValueAtTime(this.volume, startTime + this.attack)
  }

  applyRelease(callback, startTime = this.context.currentTime) {
    if (!this.gainNode) return
    this.gainNode.gain.setValueAtTime(this.volume, startTime)
    this.gainNode.gain.linearRampToValueAtTime(0, startTime + this.release)
    // Schedule the callback for when the ramp finishes, allowing for a release
    // that has not started yet.
    if (typeof callback === 'function') {
      const delay = (startTime - this.context.currentTime + this.release) * 1000
      setTimeout(callback, Math.max(0, delay))
    }
  }

  /* ---- effects --------------------------------------------------------- */

  /** The effects on this sound, in signal order. */
  get effects() {
    return [...soundProperties.get(this).effects]
  }

  /**
   * Appends an effect to the chain, or inserts it at `index`.
   * @returns {Effect} the effect, so it can be kept and adjusted
   */
  addEffect(effect, index = null) {
    const properties = soundProperties.get(this)
    if (properties.effects.includes(effect)) {
      console.warn('Effect is already on this sound')
      return effect
    }

    if (index === null) properties.effects.push(effect)
    else properties.effects.splice(index, 0, effect)

    this.rebuildOutputChain()
    return effect
  }

  removeEffect(effect) {
    const properties = soundProperties.get(this)
    const index = properties.effects.indexOf(effect)
    if (index === -1) {
      console.warn('Effect is not on this sound')
      return false
    }

    properties.effects.splice(index, 1)
    effect.input.disconnect()
    effect.output.disconnect()
    this.rebuildOutputChain()
    return true
  }

  clearEffects() {
    const properties = soundProperties.get(this)
    properties.effects.forEach(effect => {
      effect.input.disconnect()
      effect.output.disconnect()
    })
    properties.effects.length = 0
    this.rebuildOutputChain()
  }

  /** Rewires gain -> effects -> output, plus any taps added with connect(). */
  rebuildOutputChain() {
    const properties = soundProperties.get(this)
    return rebuildChain(
      properties.gainNode,
      properties.effects,
      [properties.output, ...properties.taps]
    )
  }

  /** The last node in the chain: this sound's actual output. */
  get outputNode() {
    const properties = soundProperties.get(this)
    const effects = properties.effects
    return effects.length ? effects[effects.length - 1].output : properties.gainNode
  }

  /**
   * Sends this sound's output to another node as well as to its usual
   * destination -- an analyser, a recorder, a send bus. The connection survives
   * changes to the effects chain.
   */
  connect(node) {
    const properties = soundProperties.get(this)
    properties.taps.add(node)
    this.outputNode.connect(node)
    return node
  }

  disconnect(node) {
    const properties = soundProperties.get(this)
    if (!node) {
      properties.taps.forEach(tap => this.outputNode.disconnect(tap))
      properties.taps.clear()
      return
    }
    properties.taps.delete(node)
    this.outputNode.disconnect(node)
  }

  get fileName() {
    return soundProperties.get(this).fileName
  }

  get context() {
    return soundProperties.get(this).context
  }

  get source() {
    return soundProperties.get(this).source
  }

  set source(value) {
    const properties = soundProperties.get(this)
    properties.source = value
  }

  get audioBuffer() {
    return soundProperties.get(this).audioBuffer
  }

  set audioBuffer(value) {
    const properties = soundProperties.get(this)
    properties.audioBuffer = value
  }

  get volume() {
    return soundProperties.get(this).volume
  }

  set volume(value) {
    if (value < 0 || value > 1) {
        throw new Error('Volume must be between 0 and 1');
    }
    const properties = soundProperties.get(this);
    properties.volume = value;
    if (properties.gainNode) {
        properties.gainNode.gain.value = value;
    }
  }

  get loop() {
    return soundProperties.get(this).loop
  }

  set loop(value) {
    const properties = soundProperties.get(this)
    properties.loop = value
    if (properties.audioElement) properties.audioElement.loop = value
  }

  get attack() {
    return soundProperties.get(this).attack
  }

  set attack(value) {
    const properties = soundProperties.get(this)
    properties.attack = value
  }

  get release() {
    return soundProperties.get(this).release
  }

  set release(value) {
    const properties = soundProperties.get(this)
    properties.release = value
  }

  get offset() {
    return soundProperties.get(this).offset
  }

  set offset(value) {
    const properties = soundProperties.get(this)
    properties.offset = value
  }

  get gainNode() {
    return soundProperties.get(this).gainNode
  }

  get waveOptions() {
    return soundProperties.get(this).waveOptions
  }

  /** The URL this sound streams from, or null if it is buffer-backed. */
  get streamUrl() {
    return soundProperties.get(this).streamUrl
  }

  /** The underlying <audio> element for a streamed sound, or null. */
  get audioElement() {
    return soundProperties.get(this).audioElement
  }

  get isStreaming() {
    return soundProperties.get(this).audioElement !== null
  }

  /** The voices currently sounding, oldest first. */
  get voices() {
    return [...soundProperties.get(this).voices]
  }

  get polyphony() {
    return soundProperties.get(this).polyphony
  }

  /**
   * How many instances of this sound may ring at once. 1 (the default) restarts
   * on replay. Raising it lets hits overlap; once the limit is reached the
   * oldest voice is cut to make room.
   */
  set polyphony(value) {
    const properties = soundProperties.get(this)
    properties.polyphony = value
    while (properties.voices.length > value) {
      properties.voices[0].stop()
    }
  }

  get output() {
    return soundProperties.get(this).output
  }

  // Re-points this sound's gain node at a new destination (a group's gain node,
  // or the context destination again). Per-sound volume and envelope still apply.
  set output(node) {
    const properties = soundProperties.get(this)
    if (properties.output === node) return
    properties.output = node
    this.rebuildOutputChain()
  }

  get mediaStream() {
    return soundProperties.get(this).mediaStream
  }

  set mediaStream(value) {
    const properties = soundProperties.get(this)
    properties.mediaStream = value
  }

  get clearBuffer() {
    return soundProperties.get(this).clearBuffer
  }

  set clearBuffer(value) {
    const properties = soundProperties.get(this)
    properties.clearBuffer = value
  }

  get isPlaying() {
    return soundProperties.get(this).isPlaying
  }

  set isPlaying(value) {
    const properties = soundProperties.get(this)
    properties.isPlaying = value
  }

  get isGrouped() {
    return soundProperties.get(this).isGrouped
  }

  set isGrouped(value) {
    const properties = soundProperties.get(this)
    properties.isGrouped = value
  }

  get events() {
    return soundProperties.get(this).events
  }

  set events(value) {
    const properties = soundProperties.get(this)
    properties.events = value
  }


  fadeVolumeTo(value, duration = 1) {
    const currentTime = this.context.currentTime
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currentTime)
    this.gainNode.gain.linearRampToValueAtTime(value, currentTime + duration)
  }
}

export default Sound
