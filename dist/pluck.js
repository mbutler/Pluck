// src/core/Sound.js
var soundProperties = new WeakMap;

class Sound {
  constructor(options = {}) {
    const audioContext = options.context || new (window.AudioContext || window.webkitAudioContext);
    const gainNode = audioContext.createGain();
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
      isPlaying: false
    };
    soundProperties.set(this, properties);
    this.initialized = this.initialize(options);
  }
  async initialize(options) {
    try {
      await this.initSource(options);
    } catch (error) {
      console.error("Error initializing source:", error);
    }
  }
  get fileName() {
    return soundProperties.get(this).fileName;
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
  get offset() {
    return soundProperties.get(this).offset;
  }
  set offset(value) {
    const properties = soundProperties.get(this);
    properties.offset = value;
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
    this.connectGain();
    this.source.onended = () => {
      console.log("Sound playback ended");
      this.isPlaying = false;
      this.source = null;
      if (this.clearBuffer)
        this.audioBuffer = null;
    };
    console.log("Created source from buffer:", this.source);
  }
  initFromWave(waveOptions) {
    this.source = this.context.createOscillator();
    this.source.type = waveOptions.type || "sine";
    this.source.frequency.value = waveOptions.frequency || 440;
    this.connectGain();
    this.source.onended = () => {
      console.log("Sound playback ended");
      this.isPlaying = false;
      this.source = null;
    };
  }
  async initFromInput() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;
      this.source = this.context.createMediaStreamSource(stream);
      this.connectGain();
    } catch (error) {
      console.error("Error initializing microphone input:", error);
    }
  }
  connectGain() {
    if (this.source) {
      this.source.connect(this.gainNode);
      this.gainNode.connect(this.context.destination);
      console.log("Source connected to gain node");
    } else {
      console.error("No source to connect to gain node");
    }
  }
  async play() {
    this.isPlaying = true;
    await this.initialized;
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    if (!this.audioBuffer && !this.source) {
      console.error("No audio buffer or source available to play");
      return;
    }
    if (this.audioBuffer) {
      this.createSourceFromBuffer();
    }
    if (this.mediaStream) {
      console.log("Microphone input started");
      return;
    }
    if (this.source && this.source.start) {
      this.applyAttack();
      console.log("Starting source", this.source);
      this.source.start(this.context.currentTime, this.offset);
    } else {
      console.error("No source to play");
      this.isPlaying = false;
    }
  }
  stop() {
    this.isPlaying = false;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.source.disconnect();
      this.source = null;
      console.log("Microphone input stopped");
      return;
    }
    if (this.source && this.source.stop) {
      this.applyRelease(() => {
        this.source.stop();
        this.source.disconnect();
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
    const properties = soundProperties.get(this);
    if (properties.source) {
      properties.source.connect(node);
    } else {
      console.error("No source to connect");
    }
  }
  disconnect(node) {
    const properties = soundProperties.get(this);
    if (properties.source) {
      properties.source.disconnect(node);
    } else {
      console.error("No source to disconnect");
    }
  }
}
var Sound_default = Sound;

// src/core/PriorityQueue.js
class PriorityQueue {
  constructor() {
    this.queue = [];
  }
  enqueue(item, priority) {
    const node = { item, priority };
    this.queue.push(node);
    this.bubbleUp(this.queue.length - 1);
  }
  dequeue() {
    if (this.isEmpty())
      return null;
    const first = this.queue[0];
    const last = this.queue.pop();
    if (this.queue.length > 0) {
      this.queue[0] = last;
      this.bubbleDown(0);
    }
    return first.item;
  }
  peek() {
    return this.queue[0];
  }
  isEmpty() {
    return this.queue.length === 0;
  }
  bubbleUp(index) {
    const node = this.queue[index];
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.queue[parentIndex];
      if (node.priority >= parent.priority)
        break;
      this.queue[index] = parent;
      index = parentIndex;
    }
    this.queue[index] = node;
  }
  bubbleDown(index) {
    const length = this.queue.length;
    const node = this.queue[index];
    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let leftChild = this.queue[leftChildIndex];
      let rightChild = this.queue[rightChildIndex];
      let swapIndex = null;
      if (leftChildIndex < length) {
        if (leftChild.priority < node.priority) {
          swapIndex = leftChildIndex;
        }
      }
      if (rightChildIndex < length) {
        if (swapIndex === null && rightChild.priority < node.priority || swapIndex !== null && rightChild.priority < leftChild?.priority) {
          swapIndex = rightChildIndex;
        }
      }
      if (swapIndex === null)
        break;
      this.queue[index] = this.queue[swapIndex];
      index = swapIndex;
    }
    this.queue[index] = node;
  }
  remove(item) {
    const index = this.queue.findIndex((node) => node.item === item);
    if (index === -1)
      return false;
    const last = this.queue.pop();
    if (index < this.queue.length) {
      this.queue[index] = last;
      this.bubbleUp(index);
      this.bubbleDown(index);
    }
    return true;
  }
}
var PriorityQueue_default = PriorityQueue;

// src/core/Timeline.js
var timelineProperties = new WeakMap;

class Timeline {
  constructor() {
    const properties = {
      context: null,
      currentTime: 0,
      isPlaying: false,
      soundQueue: new PriorityQueue_default,
      events: {
        onStart: [],
        onStop: [],
        onLoop: [],
        onSoundScheduled: [],
        onSoundPlayed: [],
        onEffectTriggered: []
      }
    };
    timelineProperties.set(this, properties);
  }
  get context() {
    return timelineProperties.get(this).context;
  }
  set context(value) {
    const properties = timelineProperties.get(this);
    properties.context = value;
  }
  get currentTime() {
    return timelineProperties.get(this).currentTime;
  }
  set currentTime(value) {
    const properties = timelineProperties.get(this);
    properties.currentTime = value;
  }
  get isPlaying() {
    return timelineProperties.get(this).isPlaying;
  }
  set isPlaying(value) {
    const properties = timelineProperties.get(this);
    properties.isPlaying = value;
  }
  get soundQueue() {
    return timelineProperties.get(this).soundQueue;
  }
  get events() {
    return timelineProperties.get(this).events;
  }
  on(event, listener) {
    const properties = timelineProperties.get(this);
    if (properties.events[event]) {
      properties.events[event].push(listener);
    } else {
      console.error(`Event ${event} is not supported.`);
    }
  }
  off(event, listener) {
    const properties = timelineProperties.get(this);
    if (properties.events[event]) {
      properties.events[event] = properties.events[event].filter((l) => l !== listener);
    } else {
      console.error(`Event ${event} is not supported.`);
    }
  }
  triggerEvent(event, sound, time) {
    const properties = timelineProperties.get(this);
    if (properties.events[event]) {
      properties.events[event].forEach((listener) => listener(sound, time));
    }
  }
  async start() {
    this.context = new (window.AudioContext || window.webkitAudioContext);
    console.log("Audio context initialized", this.context);
    this.isPlaying = true;
    this.triggerEvent("onStart");
    await this.context.resume();
    this.loop();
  }
  async loop() {
    if (!this.isPlaying)
      return;
    this.currentTime = this.context.currentTime;
    while (!this.soundQueue.isEmpty() && this.soundQueue.peek().priority <= this.currentTime) {
      const node = this.soundQueue.dequeue();
      const { sound, time } = node;
      console.log(`Processing item scheduled for time: ${time}`);
      if (sound) {
        console.log("Playing sound:", sound);
        try {
          this.triggerEvent("onSoundPlayed", sound, this.currentTime);
          await sound.play();
        } catch (error) {
          console.error("Error playing sound:", error);
        }
      }
    }
    this.triggerEvent("onLoop");
    requestAnimationFrame(() => this.loop());
  }
  stop() {
    this.isPlaying = false;
    this.triggerEvent("onStop");
  }
  scheduleSound(sound, time) {
    this.soundQueue.enqueue({ sound, time }, time);
    console.log("Queue state after scheduling:", this.soundQueue);
    this.triggerEvent("onSoundScheduled", sound, time);
  }
  rescheduleSound(sound, newTime) {
    this.soundQueue.remove(sound);
    this.scheduleSound(sound, newTime);
  }
  playNow(sound) {
    this.soundQueue.enqueue({ sound, time: this.currentTime }, this.currentTime);
    console.log(`Playing sound immediately at ${this.currentTime}`);
  }
  async addSound(file, startTime, options = {}) {
    const sound = new Sound_default({ file, ...options });
    await sound.initialized;
    this.scheduleSound(sound, startTime);
  }
  async playSound(file, options = {}) {
    if (!this.context) {
      console.error("Audio context is not initialized. Call start() first.");
      return;
    }
    const sound = new Sound_default({ file, ...options });
    await sound.initialized;
    await sound.play();
    this.triggerEvent("onSoundPlayed", sound, this.currentTime);
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
