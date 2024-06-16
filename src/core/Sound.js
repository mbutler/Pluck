const soundProperties = new WeakMap()

class Sound {
  constructor(options = {}) {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext
    const context = new AudioContext()
    const gainNode = context.createGain()
    const properties = {
      context,
      source: null,
      audioBuffer: null,
      volume: options.volume || 1,
      loop: options.loop || false,
      attack: options.attack || 0.04,
      release: options.release || 0.04,
      gainNode,
    }
    soundProperties.set(this, properties)
    this.initialized = this.initSource(options).then(() => {
      this.volume = properties.volume
    })
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
    properties.source = properties.context.createBufferSource()
    properties.source.buffer = properties.audioBuffer
    properties.source.loop = properties.loop
    properties.source.onended = () => {
      console.log('Sound playback ended')
      properties.source = null
    }
    console.log('Created source from buffer:', properties.source)
    this.connectSourceToGainNode()
  }

  initFromWave(waveOptions) {
    const properties = soundProperties.get(this)
    properties.source = properties.context.createOscillator()
    properties.source.type = waveOptions.type || 'sine'
    properties.source.frequency.value = waveOptions.frequency || 440
    properties.source.onended = () => {
      console.log('Sound playback ended')
      properties.source = null
    }
    console.log('Created wave source:', properties.source)
    this.connectSourceToGainNode()
  }

  async initFromInput() {
    const properties = soundProperties.get(this)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    properties.source = properties.context.createMediaStreamSource(stream)
    this.connectSourceToGainNode()
  }

  initFromFunction(audioFunction) {
    const properties = soundProperties.get(this)
    properties.source = properties.context.createScriptProcessor(2048, 1, 1)
    properties.source.onaudioprocess = audioFunction
    this.connectSourceToGainNode()
  }

  connectSourceToGainNode() {
    const properties = soundProperties.get(this)
    if (properties.source) {
      properties.source.connect(properties.gainNode)
      properties.gainNode.connect(properties.context.destination)
      console.log('Source connected to gain node')
    } else {
      console.error('No source to connect to gain node')
    }
  }

  async play(when = 0, offset = 0) {
    await this.initialized
    const properties = soundProperties.get(this)
    if (properties.context.state === 'suspended') {
      await properties.context.resume()
    }
    if (properties.source) {
      properties.source.start(properties.context.currentTime + when, offset)
      console.log('Playing sound')
    } else {
      if (properties.audioBuffer) {
        this.createSourceFromBuffer()
        this.play(when, offset)
      } else {
        console.error('No source or audio buffer available to play')
      }
    }
  }

  pause() {
    // Implement pause functionality
  }

  stop() {
    const properties = soundProperties.get(this)
    if (properties.source && properties.source.stop) {
      this.applyRelease(() => {
        properties.source.stop()
        properties.source = null // Explicitly set source to null after stopping
        console.log('Stopping sound')
      })
    } else {
      console.error('No source to stop')
    }
  }

  clone() {
    const properties = soundProperties.get(this)
    const isMediaStreamSource = properties.source && typeof properties.source.mediaStream !== 'undefined'
    return new Sound({
      volume: properties.volume,
      loop: properties.loop,
      attack: properties.attack,
      release: properties.release,
      file: properties.source && properties.source.buffer ? properties.source.buffer : undefined,
      wave: properties.source && properties.source.frequency ? { type: properties.source.type, frequency: properties.source.frequency.value } : undefined,
      input: isMediaStreamSource,
      audioFunction: properties.source.onaudioprocess
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
    properties.gainNode.gain.linearRampToValueAtTime(properties.volume, currentTime + properties.attack)
    console.log('Attack applied')
  }

  applyRelease(callback) {
    const properties = soundProperties.get(this)
    if (!properties.gainNode) return
    const currentTime = properties.context.currentTime
    properties.gainNode.gain.setValueAtTime(properties.volume, currentTime)
    properties.gainNode.gain.linearRampToValueAtTime(0, currentTime + properties.release)
    setTimeout(callback, properties.release * 1000)
    console.log('Release applied')
  }
}

export default Sound
