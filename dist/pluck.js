// src/core/Sound.js
var soundProperties = new WeakMap;

class Sound {
  constructor(options = {}) {
    const audioContext = options.context || new (window.AudioContext || window.webkitAudioContext);
    const gainNode = audioContext.createGain();
    const properties = {
      context: audioContext,
      source: null,
      audioBuffer: options.audioBuffer || null,
      volume: options.volume || 1,
      loop: options.loop || false,
      attack: options.attack || 0.04,
      release: options.release || 0.04,
      gainNode,
      mediaStream: options.input || null,
      clearBuffer: options.clearBuffer || false,
      isPlaying: false
    };
    soundProperties.set(this, properties);
    this.initialized = this.initialize(options);
  }
  async initialize(options) {
    try {
      await this.initSource(options);
      this.volume = options.volume || 1;
    } catch (error) {
      console.error("Error initializing source:", error);
    }
  }
  get context() {
    return soundProperties.get(this).context;
  }
  get source() {
    return soundProperties.get(this).source;
  }
  set source(value) {
    const properties = soundProperties.get(this);
    properties.source = value;
  }
  get audioBuffer() {
    return soundProperties.get(this).audioBuffer;
  }
  set audioBuffer(value) {
    const properties = soundProperties.get(this);
    properties.audioBuffer = value;
  }
  get volume() {
    return soundProperties.get(this).volume;
  }
  set volume(value) {
    const properties = soundProperties.get(this);
    properties.volume = value;
    if (properties.gainNode) {
      properties.gainNode.gain.value = value;
    }
  }
  get loop() {
    return soundProperties.get(this).loop;
  }
  set loop(value) {
    const properties = soundProperties.get(this);
    properties.loop = value;
  }
  get attack() {
    return soundProperties.get(this).attack;
  }
  set attack(value) {
    const properties = soundProperties.get(this);
    properties.attack = value;
  }
  get release() {
    return soundProperties.get(this).release;
  }
  set release(value) {
    const properties = soundProperties.get(this);
    properties.release = value;
  }
  get gainNode() {
    return soundProperties.get(this).gainNode;
  }
  get mediaStream() {
    return soundProperties.get(this).mediaStream;
  }
  set mediaStream(value) {
    const properties = soundProperties.get(this);
    properties.mediaStream = value;
  }
  get clearBuffer() {
    return soundProperties.get(this).clearBuffer;
  }
  set clearBuffer(value) {
    const properties = soundProperties.get(this);
    properties.clearBuffer = value;
  }
  get isPlaying() {
    return soundProperties.get(this).isPlaying;
  }
  set isPlaying(value) {
    const properties = soundProperties.get(this);
    properties.isPlaying = value;
  }
  async initSource(options) {
    if (options.file) {
      await this.loadFromFile(options.file);
    } else if (options.wave) {
      this.initFromWave(options.wave);
    } else if (options.input) {
      await this.initFromInput();
    } else {
      this.initFromWave({ type: "sine", frequency: 440 });
    }
  }
  async loadFromFile(file) {
    try {
      console.log("Fetching sound file:", file);
      const response = await fetch(file);
      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.createSourceFromBuffer();
      console.log("Sound file loaded:", file);
    } catch (error) {
      console.error("Error loading sound file:", error);
    }
  }
  createSourceFromBuffer() {
    if (!this.audioBuffer) {
      console.error("No audio buffer to create source from");
      return;
    }
    this.source = this.context.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.loop = this.loop;
    this.source.onended = () => {
      console.log("Sound playback ended");
      this.isPlaying = false;
      this.source = null;
      if (this.clearBuffer)
        this.audioBuffer = null;
    };
    console.log("Created source from buffer:", this.source);
    this.connectSourceToGainNode();
  }
  initFromWave(waveOptions) {
    this.source = this.context.createOscillator();
    this.source.type = waveOptions.type || "sine";
    this.source.frequency.value = waveOptions.frequency || 440;
    this.source.onended = () => {
      console.log("Sound playback ended");
      this.isPlaying = false;
      this.source = null;
    };
    this.connectSourceToGainNode();
  }
  async initFromInput() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;
      this.source = this.context.createMediaStreamSource(stream);
      this.connectSourceToGainNode();
    } catch (error) {
      console.error("Error initializing microphone input:", error);
    }
  }
  connectSourceToGainNode() {
    if (this.source) {
      this.source.connect(this.gainNode);
      this.gainNode.connect(this.context.destination);
      console.log("Source connected to gain node");
    } else {
      console.error("No source to connect to gain node");
    }
  }
  async play(offset = 0) {
    this.isPlaying = true;
    await this.initialized;
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    if (!this.audioBuffer && !this.source) {
      console.error("No audio buffer or source available to play");
      return;
    }
    if (this.mediaStream) {
      console.log("Microphone input started");
      return;
    }
    if (this.source && this.source.start) {
      this.applyAttack();
      console.log("Starting source", this.source);
      this.source.start(this.context.currentTime, offset);
    } else {
      console.error("No source to play");
      this.isPlaying = false;
    }
  }
  stop() {
    this.isPlaying = false;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.source.disconnect(this.gainNode);
      this.source = null;
      console.log("Microphone input stopped");
      return;
    }
    if (this.source && this.source.stop) {
      this.applyRelease(() => {
        this.source.stop();
        this.source = null;
        if (this.clearBuffer)
          this.audioBuffer = null;
        console.log("Stopping sound");
      });
    }
  }
  clone() {
    const properties = soundProperties.get(this);
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
      wave: this.source && this.source.frequency ? { type: this.source.type, frequency: this.source.frequency.value } : undefined
    });
  }
  applyAttack() {
    if (!this.gainNode)
      return;
    const currentTime = this.context.currentTime;
    this.gainNode.gain.setValueAtTime(0, currentTime);
    this.gainNode.gain.linearRampToValueAtTime(this.volume, currentTime + this.attack);
    console.log("Attack applied");
  }
  applyRelease() {
    if (!this.gainNode)
      return;
    const currentTime = this.context.currentTime;
    this.gainNode.gain.setValueAtTime(this.volume, currentTime);
    this.gainNode.gain.linearRampToValueAtTime(0, currentTime + this.release);
    console.log("Release applied");
  }
  connect(node) {
    this.gainNode.connect(node);
  }
  disconnect(node) {
    this.gainNode.disconnect(node);
  }
}
var Sound_default = Sound;

// src/core/Timeline.js
class Timeline {
  constructor() {
    this.context = null;
    this.sounds = [];
    this.startTime = null;
    this.currentTime = 0;
    this.lastTimestamp = 0;
    this.isPlaying = false;
  }
  start() {
    this.context = new (window.AudioContext || window.webkitAudioContext);
    console.log("Audio context initialized", this.context);
    this.startTime = this.context.currentTime;
    console.log("Timeline started", this.startTime);
    this.isPlaying = true;
    this.loop();
  }
  async loop() {
    if (!this.isPlaying)
      return;
    this.currentTime = this.context.currentTime - this.startTime;
    await this.playScheduledSounds();
    if (this.currentTime - this.lastTimestamp >= 1) {
      this.lastTimestamp = this.currentTime;
      this.runEverySecond();
    }
    requestAnimationFrame(() => this.loop());
  }
  stop() {
    this.isPlaying = false;
  }
  scheduleSound(sound, time, offset = 0, options = {}) {
    this.sounds.push({ sound, time, offset, options, played: false });
  }
  async playScheduledSounds() {
    for (const scheduledSound of this.sounds) {
      const { sound, time, offset, played, options } = scheduledSound;
      if (this.currentTime >= time && (!played || options.loop)) {
        try {
          await sound.play(offset);
          if (!options.loop) {
            scheduledSound.played = true;
          }
          console.log(`Played sound at ${time} with offset=${offset}`);
        } catch (error) {
          console.error("Error playing sound:", error);
        }
      }
    }
  }
  async addSound(file, offset = 0, startTime, options = {}) {
    const sound = new Sound_default({ file, context: this.context, ...options });
    await sound.initialized;
    this.scheduleSound(sound, startTime, offset, options);
  }
  async playSound(file, offset = 0, options = {}) {
    if (!this.context) {
      console.error("Audio context is not initialized. Call start() first.");
      return;
    }
    const sound = new Sound_default({ file, context: this.context, ...options });
    await sound.initialized;
    await sound.play(offset);
  }
  runEverySecond() {
    console.log("Every second");
  }
}
var Timeline_default = Timeline;

// src/core/Group.js
var groupProperties = new WeakMap;

class Group {
  constructor(sounds = []) {
    if (sounds.length === 0) {
      throw new Error("Group requires at least one sound");
    }
    const context = sounds[0].context;
    const gainNode = context.createGain();
    const properties = {
      context,
      gainNode,
      sounds: [],
      muted: false
    };
    groupProperties.set(this, properties);
    sounds.forEach((sound) => {
      if (sound instanceof Sound_default) {
        this.addSound(sound);
      } else {
        console.error("Sound is not an instance of Sound class:", sound);
      }
    });
    gainNode.connect(context.destination);
  }
  get context() {
    return groupProperties.get(this).context;
  }
  get gainNode() {
    return groupProperties.get(this).gainNode;
  }
  get sounds() {
    return groupProperties.get(this).sounds;
  }
  async play() {
    const properties = groupProperties.get(this);
    const promises = properties.sounds.map(async (sound) => {
      if (!sound.isPlaying) {
        try {
          await sound.play();
          sound.isPlaying = true;
        } catch (error) {
          console.error("Error playing sound:", error);
        }
      }
    });
    await Promise.all(promises);
  }
  async stop() {
    const properties = groupProperties.get(this);
    const promises = properties.sounds.map(async (sound) => {
      if (sound.isPlaying) {
        sound.stop();
        sound.isPlaying = false;
      }
    });
    await Promise.all(promises);
  }
  async addSound(sound) {
    if (!(sound instanceof Sound_default)) {
      console.error("The sound is not an instance of Sound class:", sound);
      return;
    }
    const properties = groupProperties.get(this);
    if (sound.context !== properties.context) {
      console.error("Cannot add sound to group: mismatched audio contexts");
      return;
    }
    properties.sounds.push(sound);
    sound.connect(properties.gainNode);
    console.log("Added and connected new sound to group gain node:", sound);
  }
  async removeSound(sound) {
    const properties = groupProperties.get(this);
    const index = properties.sounds.indexOf(sound);
    if (index === -1) {
      console.warn("The sound is not in the group");
      return;
    }
    sound.disconnect(properties.gainNode);
    properties.sounds.splice(index, 1);
    console.log("Removed and disconnected sound from group gain node:", sound);
    if (properties.sounds.length === 0) {
      properties.gainNode.disconnect(properties.context.destination);
    }
  }
  set volume(value) {
    if (value < 0 || value > 1) {
      console.warn("Volume value must be between 0 and 1.");
      return;
    }
    groupProperties.get(this).gainNode.gain.value = value;
  }
  get volume() {
    return groupProperties.get(this).gainNode.gain.value;
  }
  setVolumeGradually(value, duration = 1) {
    if (value < 0 || value > 1) {
      console.warn("Volume value must be between 0 and 1.");
      return;
    }
    const gainNode = groupProperties.get(this).gainNode;
    const currentTime = this.context.currentTime;
    gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
    gainNode.gain.linearRampToValueAtTime(value, currentTime + duration);
    console.log(`Volume set to ${value} over ${duration} seconds`);
  }
  mute() {
    const properties = groupProperties.get(this);
    if (!properties.muted) {
      properties.previousVolume = this.volume;
      this.volume = 0;
      properties.muted = true;
      console.log("Group muted");
    }
  }
  unmute() {
    const properties = groupProperties.get(this);
    if (properties.muted) {
      this.volume = properties.previousVolume;
      properties.muted = false;
      console.log("Group unmuted");
    }
  }
}
var Group_default = Group;

// src/index.js
window.Pluck = {
  Timeline: Timeline_default,
  Sound: Sound_default,
  Group: Group_default
};
