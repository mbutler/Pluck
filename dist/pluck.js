// src/core/Events.js
class Events {
  constructor() {
    this.events = {
      start: [],
      stop: [],
      loop: [],
      scheduled: [],
      missed: [],
      play: [],
      effect: []
    };
  }
  on(event, listener) {
    if (this.events[event]) {
      this.events[event].push(listener);
    } else {
      console.error(`Event ${event} is not supported.`);
    }
  }
  off(event, listener) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter((l) => l !== listener);
    } else {
      console.error(`Event ${event} is not supported.`);
    }
  }
  trigger(event, sound, time) {
    if (this.events[event]) {
      this.events[event].forEach((listener) => listener(sound, time));
    }
  }
}
var Events_default = Events;

// src/core/Sound.js
var soundProperties = new WeakMap;
var isMediaStream = (value) => !!value && typeof value.getTracks === "function";

class Sound {
  constructor(options = {}) {
    const audioContext = options.context || new (window.AudioContext || window.webkitAudioContext);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = options.volume ?? 1;
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
      events: new Events_default,
      sourceStarted: false,
      waveOptions: options.wave || null,
      output: audioContext.destination
    };
    soundProperties.set(this, properties);
    this.initialized = this.initialize(options);
  }
  async initialize(options) {
    try {
      await this.initSource(options);
    } catch (error) {
      console.error("Error initializing source:", error);
      throw error;
    }
  }
  async initSource(options) {
    if (options.file) {
      await this.loadFromFile(options.file);
    } else if (options.audioBuffer) {
      this.createSourceFromBuffer();
    } else if (options.wave) {
      this.initFromWave(options.wave);
    } else if (options.input) {
      await this.initFromInput(isMediaStream(options.input) ? options.input : null);
    } else {
      this.initFromWave({ type: "sine", frequency: 440 });
    }
  }
  async loadFromFile(file) {
    try {
      const response = await fetch(file);
      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.createSourceFromBuffer();
    } catch (error) {
      console.error("Error loading sound file:", error);
    }
  }
  createSourceFromBuffer() {
    if (!this.audioBuffer) {
      console.error("No audio buffer to create source from");
      return;
    }
    const source = this.context.createBufferSource();
    source.buffer = this.audioBuffer;
    source.loop = this.loop;
    this.source = source;
    soundProperties.get(this).sourceStarted = false;
    this.connectGain();
    source.onended = () => {
      if (this.source !== source)
        return;
      this.isPlaying = false;
      this.source = null;
      if (this.clearBuffer)
        this.audioBuffer = null;
    };
  }
  initFromWave(waveOptions) {
    const properties = soundProperties.get(this);
    properties.waveOptions = waveOptions;
    const source = this.context.createOscillator();
    source.type = waveOptions.type || "sine";
    source.frequency.value = waveOptions.frequency || 440;
    this.source = source;
    properties.sourceStarted = false;
    this.connectGain();
    source.onended = () => {
      if (this.source !== source)
        return;
      this.isPlaying = false;
      this.source = null;
    };
  }
  releaseSource() {
    const properties = soundProperties.get(this);
    const source = properties.source;
    if (!source)
      return;
    if (properties.sourceStarted && source.stop)
      source.stop();
    source.disconnect();
    properties.sourceStarted = false;
    properties.source = null;
  }
  createSource() {
    if (this.audioBuffer) {
      this.createSourceFromBuffer();
    } else if (this.waveOptions) {
      this.initFromWave(this.waveOptions);
    }
  }
  async initFromInput(existingStream = null) {
    try {
      const stream = existingStream || await navigator.mediaDevices.getUserMedia({ audio: true });
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
      this.gainNode.connect(this.output);
    } else {
      console.error("No source to connect to gain node");
    }
  }
  async play(fromGroup = false, when = 0) {
    if (this.isGrouped && !fromGroup) {
      console.warn(`Cannot play the sound ${this.fileName} directly. It is in a group.`);
      return;
    }
    await this.initialized;
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    if (this.mediaStream) {
      this.isPlaying = true;
      return;
    }
    if (!this.audioBuffer && !this.waveOptions) {
      console.error("No audio buffer or source available to play");
      return;
    }
    this.releaseSource();
    this.createSource();
    if (this.source && this.source.start) {
      const startTime = when > this.context.currentTime ? when : this.context.currentTime;
      this.isPlaying = true;
      this.applyAttack(startTime);
      this.events.trigger("play");
      this.source.start(startTime, this.offset);
      soundProperties.get(this).sourceStarted = true;
    } else {
      console.error("No source to play");
      this.isPlaying = false;
    }
  }
  stop() {
    this.isPlaying = false;
    this.releaseSource();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.clearBuffer) {
      this.audioBuffer = null;
    }
  }
  clone() {
    const properties = soundProperties.get(this);
    const options = {
      context: properties.context,
      fileName: properties.fileName,
      volume: properties.volume,
      loop: properties.loop,
      attack: properties.attack,
      release: properties.release,
      offset: properties.offset,
      clearBuffer: properties.clearBuffer
    };
    if (properties.audioBuffer) {
      options.audioBuffer = properties.audioBuffer;
    } else if (properties.fileName) {
      options.file = properties.fileName;
    } else if (properties.waveOptions) {
      options.wave = { ...properties.waveOptions };
    } else if (properties.mediaStream) {
      options.input = properties.mediaStream;
    }
    return new Sound(options);
  }
  applyAttack(startTime = this.context.currentTime) {
    if (!this.gainNode)
      return;
    this.gainNode.gain.setValueAtTime(0, startTime);
    this.gainNode.gain.linearRampToValueAtTime(this.volume, startTime + this.attack);
  }
  applyRelease(callback, startTime = this.context.currentTime) {
    if (!this.gainNode)
      return;
    this.gainNode.gain.setValueAtTime(this.volume, startTime);
    this.gainNode.gain.linearRampToValueAtTime(0, startTime + this.release);
    if (typeof callback === "function") {
      const delay = (startTime - this.context.currentTime + this.release) * 1000;
      setTimeout(callback, Math.max(0, delay));
    }
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
    if (value < 0 || value > 1) {
      throw new Error("Volume must be between 0 and 1");
    }
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
  get waveOptions() {
    return soundProperties.get(this).waveOptions;
  }
  get output() {
    return soundProperties.get(this).output;
  }
  set output(node) {
    const properties = soundProperties.get(this);
    if (properties.output === node)
      return;
    properties.gainNode.disconnect();
    properties.output = node;
    properties.gainNode.connect(node);
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
  get isGrouped() {
    return soundProperties.get(this).isGrouped;
  }
  set isGrouped(value) {
    const properties = soundProperties.get(this);
    properties.isGrouped = value;
  }
  get events() {
    return soundProperties.get(this).events;
  }
  set events(value) {
    const properties = soundProperties.get(this);
    properties.events = value;
  }
  fadeVolumeTo(value, duration = 1) {
    const currentTime = this.context.currentTime;
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currentTime);
    this.gainNode.gain.linearRampToValueAtTime(value, currentTime + duration);
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
  remove(match) {
    const matches = typeof match === "function" ? (node) => match(node.item) : (node) => node.item === match;
    const index = this.queue.findIndex(matches);
    if (index === -1)
      return false;
    const last = this.queue.pop();
    if (index < this.queue.length) {
      this.queue[index] = last;
      const parentIndex = Math.floor((index - 1) / 2);
      if (index > 0 && last.priority < this.queue[parentIndex].priority) {
        this.bubbleUp(index);
      } else {
        this.bubbleDown(index);
      }
    }
    return true;
  }
}
var PriorityQueue_default = PriorityQueue;

// src/core/Timeline.js
var timelineProperties = new WeakMap;
var DEFAULTS = {
  lookahead: 2,
  tickInterval: 0.25,
  maxLateness: 1
};

class Timeline {
  constructor(options = {}) {
    const properties = {
      context: null,
      isPlaying: false,
      soundQueue: new PriorityQueue_default,
      intervalIDs: {},
      events: new Events_default,
      lookahead: options.lookahead ?? DEFAULTS.lookahead,
      tickInterval: options.tickInterval ?? DEFAULTS.tickInterval,
      maxLateness: options.maxLateness ?? DEFAULTS.maxLateness,
      schedulerID: null,
      active: new Set
    };
    timelineProperties.set(this, properties);
  }
  async start() {
    console.info("Starting timeline");
    const properties = timelineProperties.get(this);
    this.stopScheduler();
    properties.context = new (window.AudioContext || window.webkitAudioContext);
    properties.isPlaying = true;
    this.events.trigger("start");
    await properties.context.resume();
    this.tick();
    properties.schedulerID = setInterval(() => this.tick(), properties.tickInterval * 1000);
  }
  tick() {
    const properties = timelineProperties.get(this);
    if (!properties.isPlaying || !properties.context)
      return;
    const now = properties.context.currentTime;
    const horizon = now + properties.lookahead;
    while (!properties.soundQueue.isEmpty() && properties.soundQueue.peek().priority <= horizon) {
      const entry = properties.soundQueue.dequeue();
      if (!entry || !entry.sound)
        continue;
      const { sound, time } = entry;
      if (time < now - properties.maxLateness) {
        this.events.trigger("missed", sound, time);
        continue;
      }
      const when = Math.max(time, now);
      const tracked = { sound, ready: false };
      properties.active.add(tracked);
      Promise.resolve(sound.play(false, when)).catch((error) => console.error("Error playing scheduled sound:", error)).finally(() => {
        tracked.ready = true;
      });
      this.events.trigger("play", sound, when);
    }
    for (const tracked of properties.active) {
      if (tracked.ready && !tracked.sound.isPlaying)
        properties.active.delete(tracked);
    }
    this.events.trigger("loop");
  }
  stop() {
    const properties = timelineProperties.get(this);
    Object.keys(properties.intervalIDs).forEach((intervalInSeconds) => {
      this.stopInterval(Number(intervalInSeconds));
    });
    this.stopScheduler();
    properties.active.forEach((entry) => entry.sound.stop());
    properties.active.clear();
    while (!properties.soundQueue.isEmpty()) {
      const entry = properties.soundQueue.dequeue();
      if (entry && entry.sound && entry.sound.isPlaying) {
        entry.sound.stop();
      }
    }
    if (properties.context && properties.context.state !== "closed") {
      properties.context.close();
    }
    properties.isPlaying = false;
    this.events.trigger("stop");
  }
  stopScheduler() {
    const properties = timelineProperties.get(this);
    if (properties.schedulerID === null)
      return;
    clearInterval(properties.schedulerID);
    properties.schedulerID = null;
  }
  startInterval(intervalInSeconds, callback) {
    const intervalID = setInterval(() => {
      callback();
    }, intervalInSeconds * 1000);
    this.intervalIDs = { ...this.intervalIDs, [intervalInSeconds]: intervalID };
  }
  stopInterval(intervalInSeconds) {
    const intervalID = this.intervalIDs[intervalInSeconds];
    if (intervalID) {
      clearInterval(intervalID);
      const { [intervalInSeconds]: _, ...remainingIntervalIDs } = this.intervalIDs;
      this.intervalIDs = remainingIntervalIDs;
    }
  }
  scheduleSound(sound, time) {
    this.soundQueue.enqueue({ sound, time }, time);
    this.events.trigger("scheduled", sound, time);
  }
  rescheduleSound(sound, newTime) {
    this.soundQueue.remove((entry) => entry.sound === sound);
    this.scheduleSound(sound, newTime);
  }
  playNow(sound) {
    this.scheduleSound(sound, this.currentTime);
  }
  async addSound(file, startTime, options = {}) {
    const sound = new Sound_default({ file, ...options });
    await sound.initialized;
    this.scheduleSound(sound, startTime);
  }
  async playSound(file, options = {}) {
    const sound = new Sound_default({ file, ...options });
    await sound.initialized;
    await sound.play();
    this.events.trigger("play", sound, this.currentTime);
  }
  future(seconds) {
    return this.currentTime + seconds;
  }
  get context() {
    return timelineProperties.get(this).context;
  }
  set context(value) {
    const properties = timelineProperties.get(this);
    properties.context = value;
  }
  get currentTime() {
    const properties = timelineProperties.get(this);
    return properties.context ? properties.context.currentTime : 0;
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
  get intervalIDs() {
    return timelineProperties.get(this).intervalIDs;
  }
  set intervalIDs(value) {
    const properties = timelineProperties.get(this);
    properties.intervalIDs = value;
  }
  get events() {
    return timelineProperties.get(this).events;
  }
  set events(value) {
    const properties = timelineProperties.get(this);
    properties.events = value;
  }
  get lookahead() {
    return timelineProperties.get(this).lookahead;
  }
  set lookahead(value) {
    const properties = timelineProperties.get(this);
    properties.lookahead = value;
  }
  get tickInterval() {
    return timelineProperties.get(this).tickInterval;
  }
  set tickInterval(value) {
    const properties = timelineProperties.get(this);
    properties.tickInterval = value;
    if (properties.schedulerID !== null) {
      this.stopScheduler();
      properties.schedulerID = setInterval(() => this.tick(), value * 1000);
    }
  }
  get maxLateness() {
    return timelineProperties.get(this).maxLateness;
  }
  set maxLateness(value) {
    const properties = timelineProperties.get(this);
    properties.maxLateness = value;
  }
}
var Timeline_default = Timeline;

// src/core/Group.js
var groupProperties = new WeakMap;

class Group {
  constructor(context) {
    if (!(context instanceof (window.AudioContext || window.webkitAudioContext))) {
      throw new Error("No audio context provided to Group");
    }
    const gainNode = context.createGain();
    gainNode.connect(context.destination);
    const properties = {
      context,
      gainNode,
      sounds: [],
      volume: 1,
      muted: false,
      previousVolume: 1
    };
    groupProperties.set(this, properties);
  }
  async play() {
    const promises = this.sounds.map(async (sound) => {
      if (!sound.isPlaying) {
        try {
          await sound.play(true);
        } catch (error) {
          console.error("Error playing sound:", error);
        }
      }
    });
    await Promise.all(promises);
  }
  async stop() {
    const promises = this.sounds.map(async (sound) => {
      if (sound.isPlaying) {
        sound.stop();
      }
    });
    await Promise.all(promises);
  }
  addSounds(sounds) {
    if (!Array.isArray(sounds)) {
      console.error("Not an array of sounds");
      return;
    }
    sounds.forEach((sound) => {
      if (!(sound instanceof Sound_default)) {
        console.error("The sound is not an instance of Sound class:", sound);
        return;
      }
      if (sound.context !== this.context) {
        console.error("Cannot add sound to group: mismatched audio contexts", sound);
        return;
      }
      this.gainNode.connect(this.context.destination);
      sound.isGrouped = true;
      sound.output = this.gainNode;
      this.sounds.push(sound);
    });
  }
  removeSound(sound) {
    const index = this.sounds.indexOf(sound);
    if (index === -1) {
      console.warn("The sound is not in the group");
      return;
    }
    sound.isGrouped = false;
    sound.output = sound.context.destination;
    this.sounds.splice(index, 1);
    if (this.sounds.length === 0) {
      this.gainNode.disconnect(this.context.destination);
    }
  }
  fadeVolumeTo(value, duration = 1) {
    const currentTime = this.context.currentTime;
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currentTime);
    this.gainNode.gain.linearRampToValueAtTime(value, currentTime + duration);
  }
  mute() {
    if (!this.muted) {
      this.previousVolume = this.volume;
      this.volume = 0;
      this.muted = true;
    }
  }
  unmute() {
    if (this.muted) {
      this.volume = this.previousVolume;
      this.muted = false;
    }
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
  get volume() {
    return groupProperties.get(this).gainNode.gain.value;
  }
  set volume(value) {
    groupProperties.get(this).gainNode.gain.value = value;
  }
  get muted() {
    return groupProperties.get(this).muted;
  }
  set muted(value) {
    groupProperties.get(this).muted = value;
  }
  get previousVolume() {
    return groupProperties.get(this).previousVolume;
  }
  set previousVolume(value) {
    groupProperties.get(this).previousVolume = value;
  }
}
var Group_default = Group;

// src/index.js
window.Pluck = {
  Timeline: Timeline_default,
  Sound: Sound_default,
  Group: Group_default
};
