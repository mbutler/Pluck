const soundProperties = new WeakMap()

class Sound {
  constructor(options = {}) {
    const audioContext = options.context || new (window.AudioContext || window.webkitAudioContext)()
    const gainNode = audioContext.createGain()
    const properties = {
      context: audioContext,
      source: null,
      audioBuffer: options.audioBuffer || null,
      volume: options.volume || 1,
      loop: options.loop || false,
      attack: options.attack || 0.04,
      release: options.release || 0.04,
      gainNode,
      isMicrophone: options.input || false,
      mediaStream: null,
      clearBuffer: options.clearBuffer || false,
      isPlaying: false,
    }
    soundProperties.set(this, properties)

    this.initialized = this.initialize(options)
  }

  async initialize(options) {
    try {
      await this.initSource(options)
      this.volume = options.volume || 1
    } catch (error) {
      console.error('Error initializing source:', error)
    }
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

  get volume() {
    return soundProperties.get(this).volume
  }

  set volume(value) {
    const properties = soundProperties.get(this)
    if (value < 0 || value > 1) {
      console.warn('Volume value must be between 0 and 1.')
      return
    }
    properties.volume = value
    if (properties.gainNode) {
      properties.gainNode.gain.value = value
    }
  }

  get loop() {
    return soundProperties.get(this).loop
  }

  set loop(value) {
    soundProperties.get(this).loop = value
  }

  get attack() {
    return soundProperties.get(this).attack
  }

  set attack(value) {
    soundProperties.get(this).attack = value
  }

  get release() {
    return soundProperties.get(this).release
  }

  set release(value) {
    soundProperties.get(this).release = value
  }

  get gainNode() {
    return soundProperties.get(this).gainNode
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
    } else if (options.audioFunction) {
      this.initFromFunction(options.audioFunction)
    } else {
      this.initFromWave({ type: 'sine', frequency: 440 })
    }
  }

  async loadFromFile(file) {
    const properties = soundProperties.get(this)
    try {
      console.log('Fetching sound file:', file)
      const response = await fetch(file)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await properties.context.decodeAudioData(arrayBuffer)
      properties.audioBuffer = audioBuffer
      console.log('Sound file loaded:', file)
    } catch (error) {
      console.error('Error loading sound file:', error)
    }
  }

  createSourceFromBuffer() {
    const properties = soundProperties.get(this)
    if (!properties.audioBuffer) {
      console.error('No audio buffer to create source from')
      return
    }
    this.source = properties.context.createBufferSource()
    this.source.buffer = properties.audioBuffer
    this.source.loop = properties.loop
    this.source.onended = () => {
      console.log('Sound playback ended')
      this.isPlaying = false
      this.source = null
      if (properties.clearBuffer) this.cleanupAudioBuffer()
    }
    console.log('Created source from buffer:', this.source)
    this.connectSourceToGainNode()
  }
  

  initFromWave(waveOptions) {
    const properties = soundProperties.get(this)
    this.source = properties.context.createOscillator()
    this.source.type = waveOptions.type || 'sine'
    this.source.frequency.value = waveOptions.frequency || 440
    this.source.onended = () => {
      console.log('Sound playback ended')
      this.isPlaying = false
      this.source = null
    }
    this.connectSourceToGainNode()
  }

  async initFromInput() {
    const properties = soundProperties.get(this)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.mediaStream = stream
      this.source = properties.context.createMediaStreamSource(stream)
      this.connectSourceToGainNode()
    } catch (error) {
      console.error('Error initializing microphone input:', error)
    }
  }

  initFromFunction(audioFunction) {
    const properties = soundProperties.get(this)
    this.source = properties.context.createScriptProcessor(2048, 1, 1)
    this.source.onaudioprocess = audioFunction
    this.connectSourceToGainNode()
  }

  connectSourceToGainNode() {
    const properties = soundProperties.get(this)
    if (this.source) {
      this.source.connect(properties.gainNode)
      properties.gainNode.connect(properties.context.destination)
      console.log('Source connected to gain node')
    } else {
      console.error('No source to connect to gain node')
    }
  }

  async play(offset = 0) {
    await this.initialized
    const properties = soundProperties.get(this)
    if (properties.context.state === 'suspended') {
      await properties.context.resume()
    }
    if (!properties.audioBuffer && !properties.source) {
      console.error('No audio buffer or source available to play')
      return
    }
    if (properties.audioBuffer) {
      this.createSourceFromBuffer()
    }
  
    while (!properties.source) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  
    if (properties.source && properties.source.start) {
      console.log('Applying attack')
      this.applyAttack()
      const startTime = offset
      properties.startTime = properties.context.currentTime - startTime
      console.log('Starting source', properties.source)
      properties.source.start(properties.context.currentTime, startTime)
      this.isPlaying = true
      console.log('Playing sound')
    }
  }
  

  stop() {
    const properties = soundProperties.get(this)
    if (properties.isMicrophone && this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.source.disconnect(properties.gainNode)
      this.source = null
      console.log('Microphone input stopped')
      return
    }
    if (this.source && this.source.stop) {
      this.applyRelease(() => {
        this.source.stop()
        this.isPlaying = false
        this.source = null
        if (this.clearBuffer) this.cleanupAudioBuffer()
        console.log('Stopping sound')
      })
    } else {
      console.error('No source to stop')
    }
  }

  clone() {
    const properties = soundProperties.get(this)
    const isMediaStreamSource = this.source && typeof this.source.mediaStream !== 'undefined'
    return new Sound({
      volume: this.volume,
      loop: this.loop,
      attack: this.attack,
      release: this.release,
      file: this.source && this.source.buffer ? this.source.buffer : undefined,
      wave: this.source && this.source.frequency ? { type: this.source.type, frequency: this.source.frequency.value } : undefined,
      input: isMediaStreamSource,
      audioFunction: this.source.onaudioprocess,
    })
  }

  setVolume(volume) {
    this.volume = volume
  }

  applyAttack() {
    const properties = soundProperties.get(this)
    if (!properties.gainNode) return
    const currentTime = properties.context.currentTime
    properties.gainNode.gain.setValueAtTime(0, currentTime)
    properties.gainNode.gain.linearRampToValueAtTime(this.volume, currentTime + this.attack)
    console.log('Attack applied')
  }

  applyRelease(callback) {
    const properties = soundProperties.get(this)
    if (!properties.gainNode) return
    const currentTime = properties.context.currentTime
    properties.gainNode.gain.setValueAtTime(this.volume, currentTime)
    properties.gainNode.gain.linearRampToValueAtTime(0, currentTime + this.release)
    setTimeout(callback, this.release * 1000)
    console.log('Release applied')
  }

  cleanupAudioBuffer() {
    const properties = soundProperties.get(this)
    properties.audioBuffer = null
    console.log('Audio buffer cleaned up')
  }

  connect(node) {
    const properties = soundProperties.get(this)
    properties.gainNode.connect(node)
  }

  disconnect(node) {
    const properties = soundProperties.get(this)
    properties.gainNode.disconnect(node)
  }
}

export default Sound
