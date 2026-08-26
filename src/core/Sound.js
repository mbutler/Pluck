import Events from './Events.js'

const soundProperties = new WeakMap()

const isMediaStream = value => !!value && typeof value.getTracks === 'function'

class Sound {
  constructor(options = {}) {
    const audioContext = options.context || new (window.AudioContext || window.webkitAudioContext)()
    const gainNode = audioContext.createGain()
    gainNode.gain.value = options.volume ?? 1
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
      sourceStarted: false,
      waveOptions: options.wave || null,
      output: audioContext.destination
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
    if (options.file) {
      await this.loadFromFile(options.file)
    } else if (options.audioBuffer) {
      this.createSourceFromBuffer()
    } else if (options.wave) {
      this.initFromWave(options.wave)
    } else if (options.input) {
      await this.initFromInput(isMediaStream(options.input) ? options.input : null)
    } else {
      this.initFromWave({ type: 'sine', frequency: 440 })
    }
  }

  async loadFromFile(file) {
    try {
      const response = await fetch(file)
      const arrayBuffer = await response.arrayBuffer()
      this.audioBuffer = await this.context.decodeAudioData(arrayBuffer)
      this.createSourceFromBuffer()
    } catch (error) {
      console.error('Error loading sound file:', error)
    }
  }

  createSourceFromBuffer() {
    if (!this.audioBuffer) {
      console.error('No audio buffer to create source from')
      return
    }
    const source = this.context.createBufferSource()
    source.buffer = this.audioBuffer
    source.loop = this.loop
    this.source = source
    soundProperties.get(this).sourceStarted = false
    this.connectGain()
    source.onended = () => {
      // A later play() may already have swapped in a fresh source.
      if (this.source !== source) return
      this.isPlaying = false
      this.source = null
      if (this.clearBuffer) this.audioBuffer = null
    }
  }

  initFromWave(waveOptions) {
    const properties = soundProperties.get(this)
    properties.waveOptions = waveOptions
    const source = this.context.createOscillator()
    source.type = waveOptions.type || 'sine'
    source.frequency.value = waveOptions.frequency || 440
    this.source = source
    properties.sourceStarted = false
    this.connectGain()
    source.onended = () => {
      if (this.source !== source) return
      this.isPlaying = false
      this.source = null
    }
  }

  // Stops and unhooks the current source. A source node that was never started
  // must not be stopped: the Web Audio spec makes that an InvalidStateError.
  releaseSource() {
    const properties = soundProperties.get(this)
    const source = properties.source
    if (!source) return

    if (properties.sourceStarted && source.stop) source.stop()
    source.disconnect()
    properties.sourceStarted = false
    properties.source = null
  }

  // Source nodes are single-use, so every play() needs a fresh one.
  createSource() {
    if (this.audioBuffer) {
      this.createSourceFromBuffer()
    } else if (this.waveOptions) {
      this.initFromWave(this.waveOptions)
    }
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

  async play(fromGroup = false) {
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

    if (!this.audioBuffer && !this.waveOptions) {
      console.error('No audio buffer or source available to play')
      return
    }

    // Buffer and oscillator nodes cannot be restarted, so discard whatever the
    // last play() left behind and build a new one. Grouped sounds included:
    // the fresh source feeds this.gainNode, which is already wired to the
    // group, so the routing survives.
    this.releaseSource()
    this.createSource()

    if (this.source && this.source.start) {
      this.isPlaying = true
      this.applyAttack()
      this.events.trigger('play')
      this.source.start(this.context.currentTime, this.offset)
      soundProperties.get(this).sourceStarted = true
    } else {
      console.error('No source to play')
      this.isPlaying = false
    }
  }

  stop() {
    this.isPlaying = false
    this.releaseSource()

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }
    if (this.clearBuffer) {
      this.audioBuffer = null
    }
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
      clearBuffer: properties.clearBuffer
    }

    if (properties.audioBuffer) {
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

  applyAttack() {
    if (!this.gainNode) return
    const currentTime = this.context.currentTime
    this.gainNode.gain.setValueAtTime(0, currentTime)
    this.gainNode.gain.linearRampToValueAtTime(this.volume, currentTime + this.attack)
  }

  applyRelease(callback) {
    if (!this.gainNode) return
    const currentTime = this.context.currentTime
    this.gainNode.gain.setValueAtTime(this.volume, currentTime)
    this.gainNode.gain.linearRampToValueAtTime(0, currentTime + this.release)
    // Schedule the callback after the release time
    if (typeof callback === 'function') {
      setTimeout(callback, this.release * 1000)
    }
  }

  connect(node) {
    const properties = soundProperties.get(this)
    if (properties.source) {
      properties.source.connect(node)
    } else {
      console.error('No source to connect')
    }
  }
  
  disconnect(node) {
    const properties = soundProperties.get(this)
    if (properties.source) {
      properties.source.disconnect(node)
    } else {
      console.error('No source to disconnect')
    }
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

  get output() {
    return soundProperties.get(this).output
  }

  // Re-points this sound's gain node at a new destination (a group's gain node,
  // or the context destination again). Per-sound volume and envelope still apply.
  set output(node) {
    const properties = soundProperties.get(this)
    if (properties.output === node) return
    properties.gainNode.disconnect()
    properties.output = node
    properties.gainNode.connect(node)
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
