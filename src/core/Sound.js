const soundProperties = new WeakMap()

class Sound {
  constructor(options = {}) {
    const audioContext = options.context || new (window.AudioContext || window.webkitAudioContext)()
    const gainNode = audioContext.createGain()
    const properties = {
      fileName: options.file || null,
      context: audioContext,
      source: null,
      audioBuffer: options.audioBuffer || null,
      volume: options.volume || 1,
      loop: options.loop || false,
      attack: options.attack || 0.04,
      release: options.release || 0.04,
      offset: options.offset || 0,
      gainNode,
      mediaStream: options.input || null,
      clearBuffer: options.clearBuffer || false,
      isPlaying: false,
    }
    soundProperties.set(this, properties)

    this.initialized = this.initialize(options)
  }

  async initialize(options) {
    try {
      await this.initSource(options)
    } catch (error) {
      console.error('Error initializing source:', error)
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
    const properties = soundProperties.get(this)
    properties.volume = value
    if (properties.gainNode) {
      properties.gainNode.gain.value = value
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

  async initSource(options) {
    if (options.file) {
      await this.loadFromFile(options.file)
    } else if (options.wave) {
      this.initFromWave(options.wave)
    } else if (options.input) {
      await this.initFromInput()
    } else {
      this.initFromWave({ type: 'sine', frequency: 440 })
    }
  }

  async loadFromFile(file) {
    try {
      console.log('Fetching sound file:', file)
      const response = await fetch(file)
      const arrayBuffer = await response.arrayBuffer()
      this.audioBuffer = await this.context.decodeAudioData(arrayBuffer)
      this.createSourceFromBuffer()
      console.log('Sound file loaded:', file)
    } catch (error) {
      console.error('Error loading sound file:', error)
    }
  }

  createSourceFromBuffer() {
    if (!this.audioBuffer) {
      console.error('No audio buffer to create source from')
      return
    }
    this.source = this.context.createBufferSource()
    this.source.buffer = this.audioBuffer
    this.source.loop = this.loop
    this.connectGain()
    this.source.onended = () => {
      console.log('Sound playback ended')
      this.isPlaying = false
      this.source = null
      if (this.clearBuffer) this.audioBuffer = null
    }
    console.log('Created source from buffer:', this.source)
  }

  initFromWave(waveOptions) {
    this.source = this.context.createOscillator()
    this.source.type = waveOptions.type || 'sine'
    this.source.frequency.value = waveOptions.frequency || 440
    this.connectGain()
    this.source.onended = () => {
      console.log('Sound playback ended')
      this.isPlaying = false
      this.source = null
    }
  }

  async initFromInput() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
      this.gainNode.connect(this.context.destination)
      console.log('Source connected to gain node')
    } else {
      console.error('No source to connect to gain node')
    }
  }

  async play() {
    this.isPlaying = true
    await this.initialized
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }

    if (!this.audioBuffer && !this.source) {
      console.error('No audio buffer or source available to play')
      return
    }

    if (this.audioBuffer) {
      this.createSourceFromBuffer()
    }

    if (this.mediaStream) {
      console.log('Microphone input started')
      return
    }
  
    if (this.source && this.source.start) {
      this.applyAttack()
      console.log('Starting source', this.source)
      this.source.start(this.context.currentTime, this.offset)
    } else {
      console.error('No source to play')
      this.isPlaying = false
    }
  }

  stop() {
    this.isPlaying = false
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.source.disconnect()
      this.source = null
      console.log('Microphone input stopped')
      return
    }
    if (this.source && this.source.stop) {
      this.applyRelease(() => {
        this.source.stop()
        this.source.disconnect()
        this.source = null
        if (this.clearBuffer) this.audioBuffer = null
        console.log('Stopping sound')
      })
    }
  }

  clone() {
    const properties = soundProperties.get(this)
    return new Sound({
      context: properties.context,
      audioBuffer: properties.audioBuffer,
      volume: properties.volume,
      loop: properties.loop,
      attack: properties.attack,
      release: properties.release,
      input: this.mediaStream || null,
      clearBuffer: properties.clearBuffer,
      file: this.source && this.source.buffer ? this.source.buffer : undefined,
      wave: this.source && this.source.frequency ? { type: this.source.type, frequency: this.source.frequency.value } : undefined,
    })
  }

  applyAttack() {
    if (!this.gainNode) return
    const currentTime = this.context.currentTime
    this.gainNode.gain.setValueAtTime(0, currentTime)
    this.gainNode.gain.linearRampToValueAtTime(this.volume, currentTime + this.attack)
    console.log('Attack applied')
  }

  applyRelease() {
    if (!this.gainNode) return
    const currentTime = this.context.currentTime
    this.gainNode.gain.setValueAtTime(this.volume, currentTime)
    this.gainNode.gain.linearRampToValueAtTime(0, currentTime + this.release)
    console.log('Release applied')
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
}

export default Sound
