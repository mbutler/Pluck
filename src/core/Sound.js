import Events from './Events.js'

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
      isGrouped: false,
      events: new Events(),
      animationFrameId: null,
      intervalIDs: {}
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
    this.source = this.context.createBufferSource()
    this.source.buffer = this.audioBuffer
    this.source.loop = this.loop
    this.connectGain()
    this.source.onended = () => {
      this.isPlaying = false
      this.source = null
      if (this.clearBuffer) this.audioBuffer = null
    }
  }

  initFromWave(waveOptions) {
    this.source = this.context.createOscillator()
    this.source.type = waveOptions.type || 'sine'
    this.source.frequency.value = waveOptions.frequency || 440
    this.connectGain()
    this.source.onended = () => {
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
    } else {
      console.error('No source to connect to gain node')
    }
  }

  async play(fromGroup = false) {
    if (this.isGrouped && !fromGroup) {
        console.warn(`Cannot play the sound ${this.fileName} directly. It is in a group.`)
        return
    }

    this.isPlaying = true
    await this.initialized
    if (this.context.state === 'suspended') {
        await this.context.resume()
    }

    if (!this.audioBuffer && !this.source) {
        console.error('No audio buffer or source available to play')
        return
    }
    
    if (!this.isGrouped && this.audioBuffer && !fromGroup) {
        this.source = null
        this.createSourceFromBuffer()
    }
        

    if (this.mediaStream) {
        return
    }

    if (this.source && this.source.start) {
        this.applyAttack()
        this.events.trigger('play')
        this.source.start(this.context.currentTime, this.offset)
    } else {
        console.error('No source to play')
        this.isPlaying = false
    }
}

  stop() {
    this.isPlaying = false;
    if (this.source) {
        this.source.disconnect();
        if (this.source.stop) {
            this.source.stop();
        }
        this.source = null;
    }
    if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
    }
    if (this.clearBuffer) {
        this.audioBuffer = null;
    }
    if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
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

  async loop() {
    if (!this.isPlaying) return;
    
    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  scheduleSound(sound, time) {
    if (time < this.currentTime) {
        console.warn('Cannot schedule sound in the past');
        return;
    }
    if (this.soundQueue.find(node => node.item.sound === sound)) {
        console.warn('Sound is already scheduled');
        return;
    }
    this.soundQueue.enqueue({ sound, time }, time);
    this.events.trigger('scheduled', sound, time);
  }

  startInterval(intervalInSeconds, callback) {
    // Check for existing interval
    if (this.intervalIDs[intervalInSeconds]) {
        this.stopInterval(intervalInSeconds);
    }
    const intervalID = setInterval(() => {
        if (!this.isPlaying) {
            this.stopInterval(intervalInSeconds);
            return;
        }
        callback();
    }, intervalInSeconds * 1000);
    this.intervalIDs = { ...this.intervalIDs, [intervalInSeconds]: intervalID };
  }

  async addSound(file, startTime, options = {}) {
    const sound = new Sound({ file, ...options });
    try {
        await Promise.race([
            sound.initialized,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Sound loading timeout')), 5000)
            )
        ]);
        this.scheduleSound(sound, startTime);
    } catch (error) {
        console.error('Failed to load sound:', error);
        this.events.trigger('error', error);
    }
  }

  fadeVolumeTo(value, duration = 1) {
    const currentTime = this.context.currentTime
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currentTime)
    this.gainNode.gain.linearRampToValueAtTime(value, currentTime + duration)
  }
}

class Group {
    constructor(context) {
        if (!(context instanceof AudioContext)) {
            throw new Error('No audio context provided to Group');
        }

        const gainNode = context.createGain();
        gainNode.connect(context.destination);
        
        const properties = {
            context,
            gainNode,
            sounds: new Set(), // Use Set to prevent duplicates
            volume: 1,
            muted: false,
            previousVolume: 1,
            maxSounds: 100 // Add maximum limit
        };
        
        groupProperties.set(this, properties);
    }

    addSounds(sounds) {
        if (!Array.isArray(sounds)) {
            throw new Error("Not an array of sounds");
        }
    
        if (this.sounds.size + sounds.length > this.maxSounds) {
            throw new Error(`Cannot add more sounds. Maximum limit is ${this.maxSounds}`);
        }

        sounds.forEach((sound) => {
            if (!(sound instanceof Sound)) {
                throw new Error("The sound is not an instance of Sound class");
            }
    
            if (sound.context !== this.context) {
                throw new Error("Cannot add sound to group: mismatched audio contexts");
            }

            if (this.sounds.has(sound)) {
                console.warn("Sound already in group");
                return;
            }

            sound.isGrouped = true;
            sound.disconnect(sound.gainNode);
            this.sounds.add(sound);
            sound.connect(this.gainNode);
        });
    }

    removeSound(sound) {
        if (!this.sounds.has(sound)) {
            console.warn("The sound is not in the group");
            return;
        }
        sound.isGrouped = false; // Reset the flag
        sound.disconnect(this.gainNode);
        this.sounds.delete(sound);
        if (this.sounds.size === 0) {
            this.gainNode.disconnect(this.context.destination);
        }
    }

    fadeVolumeTo(value, duration = 1) {
        if (value < 0 || value > 1) {
            throw new Error('Volume must be between 0 and 1');
        }
        const currentTime = this.context.currentTime;
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currentTime);
        this.gainNode.gain.linearRampToValueAtTime(value, currentTime + duration);
    }

    destroy() {
        this.stop();
        this.sounds.forEach(sound => {
            sound.isGrouped = false;
            sound.disconnect(this.gainNode);
        });
        this.sounds.clear();
        this.gainNode.disconnect();
        this.gainNode = null;
    }
}

export default Sound
