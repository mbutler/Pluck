(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __moduleCache = /* @__PURE__ */ new WeakMap;
  var __toCommonJS = (from) => {
    var entry = __moduleCache.get(from), desc;
    if (entry)
      return entry;
    entry = __defProp({}, "__esModule", { value: true });
    if (from && typeof from === "object" || typeof from === "function")
      __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
        get: () => from[key],
        enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
      }));
    __moduleCache.set(from, entry);
    return entry;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: (newValue) => all[name] = () => newValue
      });
  };

  // src/global.js
  var exports_global = {};
  __export(exports_global, {
    bufferCache: () => BufferCache_default,
    Voice: () => Voice_default,
    Tremolo: () => Tremolo_default,
    Timeline: () => Timeline_default,
    Tempo: () => Tempo_default,
    StereoPanner: () => StereoPanner_default,
    Sound: () => Sound_default,
    Reverb: () => Reverb_default,
    PriorityQueue: () => PriorityQueue_default,
    LowPassFilter: () => LowPassFilter,
    HighPassFilter: () => HighPassFilter,
    Group: () => Group_default,
    Filter: () => Filter_default,
    Events: () => Events_default,
    Effect: () => Effect_default,
    Distortion: () => Distortion_default,
    Delay: () => Delay_default,
    Compressor: () => Compressor_default,
    BufferCache: () => BufferCache
  });

  // src/index.js
  var exports_src = {};
  __export(exports_src, {
    bufferCache: () => BufferCache_default,
    Voice: () => Voice_default,
    Tremolo: () => Tremolo_default,
    Timeline: () => Timeline_default,
    Tempo: () => Tempo_default,
    StereoPanner: () => StereoPanner_default,
    Sound: () => Sound_default,
    Reverb: () => Reverb_default,
    PriorityQueue: () => PriorityQueue_default,
    LowPassFilter: () => LowPassFilter,
    HighPassFilter: () => HighPassFilter,
    Group: () => Group_default,
    Filter: () => Filter_default,
    Events: () => Events_default,
    Effect: () => Effect_default,
    Distortion: () => Distortion_default,
    Delay: () => Delay_default,
    Compressor: () => Compressor_default,
    BufferCache: () => BufferCache
  });

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
        ended: [],
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
    trigger(event, ...args) {
      if (this.events[event]) {
        this.events[event].forEach((listener) => listener(...args));
      }
    }
  }
  var Events_default = Events;

  // src/core/Voice.js
  class Voice {
    constructor(context, source, output) {
      this.context = context;
      this.source = source;
      this.gainNode = context.createGain();
      this.gainNode.gain.value = 0;
      source.connect(this.gainNode);
      this.gainNode.connect(output);
      this.started = false;
      this.ended = false;
      this.onended = null;
      source.onended = () => this.retire();
    }
    start(when, offset, attack) {
      this.gainNode.gain.setValueAtTime(0, when);
      this.gainNode.gain.linearRampToValueAtTime(1, when + attack);
      this.source.start(when, offset);
      this.started = true;
    }
    stop() {
      if (this.ended)
        return;
      if (this.started && this.source.stop)
        this.source.stop();
      this.retire();
    }
    retire() {
      if (this.ended)
        return;
      this.ended = true;
      this.source.disconnect();
      this.gainNode.disconnect();
      if (this.onended)
        this.onended(this);
    }
  }
  var Voice_default = Voice;

  // src/core/chain.js
  var rebuildChain = (head, effects, destinations) => {
    head.disconnect();
    effects.forEach((effect) => effect.output.disconnect());
    let node = head;
    for (const effect of effects) {
      node.connect(effect.input);
      node = effect.output;
    }
    destinations.forEach((destination) => {
      if (destination)
        node.connect(destination);
    });
    return node;
  };

  // src/core/audioContext.js
  var findAudioContext = () => globalThis.AudioContext || globalThis.webkitAudioContext;
  var createAudioContext = () => {
    const AudioContextClass = findAudioContext();
    if (!AudioContextClass) {
      throw new Error("Web Audio is not available in this environment");
    }
    return new AudioContextClass;
  };
  var isAudioContext = (value) => {
    const AudioContextClass = findAudioContext();
    return !!AudioContextClass && value instanceof AudioContextClass;
  };

  // src/core/BufferCache.js
  var fetchAndDecode = async (context, url) => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return context.decodeAudioData(arrayBuffer);
  };

  class BufferCache {
    constructor() {
      this.buffers = new Map;
      this.pending = new Map;
    }
    async load(context, url) {
      const decoded = this.buffers.get(url);
      if (decoded)
        return decoded;
      let pending = this.pending.get(url);
      if (!pending) {
        pending = fetchAndDecode(context, url);
        this.pending.set(url, pending);
      }
      try {
        const buffer = await pending;
        this.buffers.set(url, buffer);
        return buffer;
      } finally {
        this.pending.delete(url);
      }
    }
    get(url) {
      return this.buffers.get(url);
    }
    has(url) {
      return this.buffers.has(url);
    }
    delete(url) {
      return this.buffers.delete(url);
    }
    clear() {
      this.buffers.clear();
    }
    get size() {
      return this.buffers.size;
    }
  }
  var BufferCache_default = new BufferCache;

  // src/core/Sound.js
  var soundProperties = new WeakMap;
  var isMediaStream = (value) => !!value && typeof value.getTracks === "function";

  class Sound {
    constructor(options = {}) {
      const audioContext = options.context || createAudioContext();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = options.volume ?? 1;
      gainNode.connect(audioContext.destination);
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
        waveOptions: options.wave || null,
        output: audioContext.destination,
        useCache: options.cache !== false,
        effects: [],
        taps: new Set,
        polyphony: options.polyphony ?? 1,
        voices: []
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
      } else if (options.audioBuffer) {} else if (options.wave) {
        this.initFromWave(options.wave);
      } else if (options.input) {
        await this.initFromInput(isMediaStream(options.input) ? options.input : null);
      } else {
        this.initFromWave({ type: "sine", frequency: 440 });
      }
    }
    async loadFromFile(file) {
      const properties = soundProperties.get(this);
      try {
        this.audioBuffer = properties.useCache ? await BufferCache_default.load(this.context, file) : await fetchAndDecode(this.context, file);
      } catch (error) {
        console.error("Error loading sound file:", error);
      }
    }
    initFromWave(waveOptions) {
      soundProperties.get(this).waveOptions = waveOptions;
    }
    createSourceNode() {
      if (this.audioBuffer) {
        const source = this.context.createBufferSource();
        source.buffer = this.audioBuffer;
        source.loop = this.loop;
        return source;
      }
      if (this.waveOptions) {
        const source = this.context.createOscillator();
        source.type = this.waveOptions.type || "sine";
        source.frequency.value = this.waveOptions.frequency || 440;
        return source;
      }
      return null;
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
      const properties = soundProperties.get(this);
      const source = this.createSourceNode();
      if (!source || !source.start) {
        console.error("No source to play");
        this.isPlaying = false;
        return;
      }
      const startTime = when > this.context.currentTime ? when : this.context.currentTime;
      const voice = new Voice_default(this.context, source, properties.gainNode);
      voice.onended = () => this.retireVoice(voice);
      properties.voices.push(voice);
      while (properties.voices.length > properties.polyphony) {
        properties.voices[0].stop();
      }
      properties.source = source;
      this.isPlaying = true;
      this.events.trigger("play", this);
      voice.start(startTime, this.offset, this.attack);
    }
    retireVoice(voice) {
      const properties = soundProperties.get(this);
      const index = properties.voices.indexOf(voice);
      if (index !== -1)
        properties.voices.splice(index, 1);
      if (properties.voices.length) {
        properties.source = properties.voices[properties.voices.length - 1].source;
        return;
      }
      properties.source = null;
      properties.isPlaying = false;
      if (properties.clearBuffer)
        properties.audioBuffer = null;
      this.events.trigger("ended", this);
    }
    stop() {
      const properties = soundProperties.get(this);
      const wasPlaying = properties.isPlaying;
      this.events.trigger("stop", this);
      properties.voices.slice().forEach((voice) => voice.stop());
      properties.voices.length = 0;
      const endedDuringTeardown = wasPlaying && !properties.isPlaying;
      properties.isPlaying = false;
      if (properties.source && properties.mediaStream) {
        properties.source.disconnect();
      }
      properties.source = null;
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
      }
      if (this.clearBuffer) {
        this.audioBuffer = null;
      }
      if (wasPlaying && !endedDuringTeardown)
        this.events.trigger("ended", this);
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
        clearBuffer: properties.clearBuffer,
        polyphony: properties.polyphony,
        cache: properties.useCache
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
    get effects() {
      return [...soundProperties.get(this).effects];
    }
    addEffect(effect, index = null) {
      const properties = soundProperties.get(this);
      if (properties.effects.includes(effect)) {
        console.warn("Effect is already on this sound");
        return effect;
      }
      if (index === null)
        properties.effects.push(effect);
      else
        properties.effects.splice(index, 0, effect);
      this.rebuildOutputChain();
      return effect;
    }
    removeEffect(effect) {
      const properties = soundProperties.get(this);
      const index = properties.effects.indexOf(effect);
      if (index === -1) {
        console.warn("Effect is not on this sound");
        return false;
      }
      properties.effects.splice(index, 1);
      effect.input.disconnect();
      effect.output.disconnect();
      this.rebuildOutputChain();
      return true;
    }
    clearEffects() {
      const properties = soundProperties.get(this);
      properties.effects.forEach((effect) => {
        effect.input.disconnect();
        effect.output.disconnect();
      });
      properties.effects.length = 0;
      this.rebuildOutputChain();
    }
    rebuildOutputChain() {
      const properties = soundProperties.get(this);
      return rebuildChain(properties.gainNode, properties.effects, [properties.output, ...properties.taps]);
    }
    get outputNode() {
      const properties = soundProperties.get(this);
      const effects = properties.effects;
      return effects.length ? effects[effects.length - 1].output : properties.gainNode;
    }
    connect(node) {
      const properties = soundProperties.get(this);
      properties.taps.add(node);
      this.outputNode.connect(node);
      return node;
    }
    disconnect(node) {
      const properties = soundProperties.get(this);
      if (!node) {
        properties.taps.forEach((tap) => this.outputNode.disconnect(tap));
        properties.taps.clear();
        return;
      }
      properties.taps.delete(node);
      this.outputNode.disconnect(node);
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
    get voices() {
      return [...soundProperties.get(this).voices];
    }
    get polyphony() {
      return soundProperties.get(this).polyphony;
    }
    set polyphony(value) {
      const properties = soundProperties.get(this);
      properties.polyphony = value;
      while (properties.voices.length > value) {
        properties.voices[0].stop();
      }
    }
    get output() {
      return soundProperties.get(this).output;
    }
    set output(node) {
      const properties = soundProperties.get(this);
      if (properties.output === node)
        return;
      properties.output = node;
      this.rebuildOutputChain();
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

  // src/core/Tempo.js
  var DEFAULTS = {
    bpm: 120,
    beatsPerBar: 4
  };

  class Tempo {
    constructor(options = {}) {
      this.beatsPerBar = options.beatsPerBar ?? DEFAULTS.beatsPerBar;
      this.anchor = { beat: 0, time: 0, bpm: options.bpm ?? DEFAULTS.bpm };
    }
    get bpm() {
      return this.anchor.bpm;
    }
    setBpm(value, atTime = this.anchor.time) {
      if (!(value > 0))
        throw new Error("bpm must be greater than 0");
      this.anchor = { beat: this.timeToBeat(atTime), time: atTime, bpm: value };
    }
    reset(atTime, beat = 0) {
      this.anchor = { beat, time: atTime, bpm: this.anchor.bpm };
    }
    beatToTime(beat) {
      return this.anchor.time + (beat - this.anchor.beat) * 60 / this.anchor.bpm;
    }
    timeToBeat(time) {
      return this.anchor.beat + (time - this.anchor.time) * this.anchor.bpm / 60;
    }
    beatsToSeconds(beats) {
      return beats * 60 / this.anchor.bpm;
    }
    secondsToBeats(seconds) {
      return seconds * this.anchor.bpm / 60;
    }
    barToBeat(bar, beat = 0) {
      return bar * this.beatsPerBar + beat;
    }
    beatToBar(beat) {
      return beat / this.beatsPerBar;
    }
  }
  var Tempo_default = Tempo;

  // src/core/Timeline.js
  var timelineProperties = new WeakMap;
  var DEFAULTS2 = {
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
        beatQueue: new PriorityQueue_default,
        repeats: [],
        nextRepeatID: 1,
        tempo: new Tempo_default(options),
        intervalIDs: {},
        events: new Events_default,
        lookahead: options.lookahead ?? DEFAULTS2.lookahead,
        tickInterval: options.tickInterval ?? DEFAULTS2.tickInterval,
        maxLateness: options.maxLateness ?? DEFAULTS2.maxLateness,
        schedulerID: null,
        active: new Set
      };
      timelineProperties.set(this, properties);
    }
    async start() {
      console.info("Starting timeline");
      const properties = timelineProperties.get(this);
      this.stopScheduler();
      properties.context = createAudioContext();
      properties.tempo.reset(properties.context.currentTime, 0);
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
      const tempo = properties.tempo;
      const due = [];
      while (!properties.soundQueue.isEmpty() && properties.soundQueue.peek().priority <= horizon) {
        const entry = properties.soundQueue.dequeue();
        if (entry && entry.sound)
          due.push({ sound: entry.sound, time: entry.time });
      }
      const horizonBeat = tempo.timeToBeat(horizon);
      while (!properties.beatQueue.isEmpty() && properties.beatQueue.peek().priority <= horizonBeat) {
        const entry = properties.beatQueue.dequeue();
        if (entry && entry.sound) {
          due.push({ sound: entry.sound, time: tempo.beatToTime(entry.beat), beat: entry.beat });
        }
      }
      this.runRepeats(horizonBeat);
      due.sort((a, b) => a.time - b.time);
      for (const { sound, time, beat } of due) {
        if (time < now - properties.maxLateness) {
          this.events.trigger("missed", sound, time, beat);
          continue;
        }
        const when = Math.max(time, now);
        const tracked = { sound, ready: false };
        properties.active.add(tracked);
        Promise.resolve(sound.play(false, when)).catch((error) => console.error("Error playing scheduled sound:", error)).finally(() => {
          tracked.ready = true;
        });
        this.events.trigger("play", sound, when, beat);
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
      for (const queue of [properties.soundQueue, properties.beatQueue]) {
        while (!queue.isEmpty()) {
          const entry = queue.dequeue();
          if (entry && entry.sound && entry.sound.isPlaying) {
            entry.sound.stop();
          }
        }
      }
      properties.repeats.length = 0;
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
    runRepeats(horizonBeat) {
      const properties = timelineProperties.get(this);
      for (const repeat of properties.repeats) {
        let fired = 0;
        while (repeat.nextBeat <= horizonBeat && fired < 256) {
          repeat.callback(properties.tempo.beatToTime(repeat.nextBeat), repeat.nextBeat);
          repeat.nextBeat += repeat.interval;
          fired++;
        }
      }
    }
    everyBeat(beats, callback, startBeat = null) {
      if (!(beats > 0))
        throw new Error("everyBeat needs an interval greater than 0");
      const properties = timelineProperties.get(this);
      const from = startBeat ?? Math.ceil(this.currentBeat / beats) * beats;
      const id = properties.nextRepeatID++;
      properties.repeats.push({ id, interval: beats, nextBeat: from, callback });
      return id;
    }
    stopEveryBeat(id) {
      const properties = timelineProperties.get(this);
      const index = properties.repeats.findIndex((repeat) => repeat.id === id);
      if (index === -1)
        return false;
      properties.repeats.splice(index, 1);
      return true;
    }
    scheduleSound(sound, time) {
      this.soundQueue.enqueue({ sound, time }, time);
      this.events.trigger("scheduled", sound, time);
    }
    scheduleBeat(sound, beat) {
      const properties = timelineProperties.get(this);
      properties.beatQueue.enqueue({ sound, beat }, beat);
      this.events.trigger("scheduled", sound, properties.tempo.beatToTime(beat), beat);
    }
    scheduleBar(sound, bar, beat = 0) {
      this.scheduleBeat(sound, this.at(bar, beat));
    }
    rescheduleBeat(sound, newBeat) {
      const properties = timelineProperties.get(this);
      properties.beatQueue.remove((entry) => entry.sound === sound);
      this.scheduleBeat(sound, newBeat);
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
    at(bar, beat = 0) {
      return this.tempo.barToBeat(bar, beat);
    }
    beatToTime(beat) {
      return this.tempo.beatToTime(beat);
    }
    timeToBeat(time) {
      return this.tempo.timeToBeat(time);
    }
    beatsToSeconds(beats) {
      return this.tempo.beatsToSeconds(beats);
    }
    secondsToBeats(seconds) {
      return this.tempo.secondsToBeats(seconds);
    }
    nextBeat(count = 1) {
      return Math.floor(this.currentBeat) + count;
    }
    nextBar(count = 1) {
      return (Math.floor(this.currentBar) + count) * this.beatsPerBar;
    }
    get tempo() {
      return timelineProperties.get(this).tempo;
    }
    get bpm() {
      return timelineProperties.get(this).tempo.bpm;
    }
    set bpm(value) {
      const properties = timelineProperties.get(this);
      properties.tempo.setBpm(value, this.currentTime);
    }
    get beatsPerBar() {
      return timelineProperties.get(this).tempo.beatsPerBar;
    }
    set beatsPerBar(value) {
      timelineProperties.get(this).tempo.beatsPerBar = value;
    }
    get currentBeat() {
      return this.tempo.timeToBeat(this.currentTime);
    }
    get currentBar() {
      return this.tempo.beatToBar(this.currentBeat);
    }
    get beatQueue() {
      return timelineProperties.get(this).beatQueue;
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
      if (!isAudioContext(context)) {
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
        previousVolume: 1,
        effects: [],
        taps: new Set
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
        this.rebuildOutputChain();
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
        this.outputNode.disconnect(this.context.destination);
      }
    }
    get effects() {
      return [...groupProperties.get(this).effects];
    }
    addEffect(effect, index = null) {
      const properties = groupProperties.get(this);
      if (properties.effects.includes(effect)) {
        console.warn("Effect is already on this group");
        return effect;
      }
      if (index === null)
        properties.effects.push(effect);
      else
        properties.effects.splice(index, 0, effect);
      this.rebuildOutputChain();
      return effect;
    }
    removeEffect(effect) {
      const properties = groupProperties.get(this);
      const index = properties.effects.indexOf(effect);
      if (index === -1) {
        console.warn("Effect is not on this group");
        return false;
      }
      properties.effects.splice(index, 1);
      effect.input.disconnect();
      effect.output.disconnect();
      this.rebuildOutputChain();
      return true;
    }
    clearEffects() {
      const properties = groupProperties.get(this);
      properties.effects.forEach((effect) => {
        effect.input.disconnect();
        effect.output.disconnect();
      });
      properties.effects.length = 0;
      this.rebuildOutputChain();
    }
    rebuildOutputChain() {
      const properties = groupProperties.get(this);
      return rebuildChain(properties.gainNode, properties.effects, [properties.context.destination, ...properties.taps]);
    }
    get outputNode() {
      const properties = groupProperties.get(this);
      const effects = properties.effects;
      return effects.length ? effects[effects.length - 1].output : properties.gainNode;
    }
    connect(node) {
      const properties = groupProperties.get(this);
      properties.taps.add(node);
      this.outputNode.connect(node);
      return node;
    }
    disconnect(node) {
      const properties = groupProperties.get(this);
      if (!node) {
        properties.taps.forEach((tap) => this.outputNode.disconnect(tap));
        properties.taps.clear();
        return;
      }
      properties.taps.delete(node);
      this.outputNode.disconnect(node);
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
  // src/core/effects/Effect.js
  class Effect {
    constructor(context, options = {}) {
      this.context = context;
      this.input = context.createGain();
      this.output = context.createGain();
      this.dryGain = context.createGain();
      this.wetGain = context.createGain();
      this.input.connect(this.dryGain);
      this.dryGain.connect(this.output);
      this.wetGain.connect(this.output);
      this.mixBeforeBypass = null;
      this.mix = options.mix ?? 1;
    }
    route(head, tail) {
      this.input.connect(head);
      tail.connect(this.wetGain);
    }
    get mix() {
      return this.wetGain.gain.value;
    }
    set mix(value) {
      const amount = Math.min(1, Math.max(0, value));
      this.wetGain.gain.value = amount;
      this.dryGain.gain.value = 1 - amount;
    }
    get bypassed() {
      return this.mixBeforeBypass !== null;
    }
    set bypassed(value) {
      if (value === this.bypassed)
        return;
      if (value) {
        this.mixBeforeBypass = this.mix;
        this.mix = 0;
        return;
      }
      this.mix = this.mixBeforeBypass;
      this.mixBeforeBypass = null;
    }
    dispose() {
      this.input.disconnect();
      this.output.disconnect();
      this.dryGain.disconnect();
      this.wetGain.disconnect();
    }
  }
  var Effect_default = Effect;

  // src/core/effects/Filter.js
  class Filter extends Effect_default {
    constructor(context, options = {}) {
      super(context, options);
      this.filter = context.createBiquadFilter();
      this.filter.type = options.type || "lowpass";
      this.filter.frequency.value = options.frequency ?? 1000;
      this.filter.Q.value = options.q ?? 1;
      if (options.gain !== undefined)
        this.filter.gain.value = options.gain;
      this.route(this.filter, this.filter);
    }
    get type() {
      return this.filter.type;
    }
    set type(value) {
      this.filter.type = value;
    }
    get frequency() {
      return this.filter.frequency.value;
    }
    set frequency(value) {
      this.filter.frequency.value = value;
    }
    get q() {
      return this.filter.Q.value;
    }
    set q(value) {
      this.filter.Q.value = value;
    }
  }

  class LowPassFilter extends Filter {
    constructor(context, options = {}) {
      super(context, { ...options, type: "lowpass" });
    }
  }

  class HighPassFilter extends Filter {
    constructor(context, options = {}) {
      super(context, { ...options, type: "highpass" });
    }
  }
  var Filter_default = Filter;

  // src/core/effects/Delay.js
  class Delay extends Effect_default {
    constructor(context, options = {}) {
      super(context, { mix: options.mix ?? 0.5 });
      const maxTime = options.maxTime ?? 5;
      this.delay = context.createDelay(maxTime);
      this.delay.delayTime.value = Math.min(options.time ?? 0.3, maxTime);
      this.feedbackGain = context.createGain();
      this.feedbackGain.gain.value = Math.min(options.feedback ?? 0.4, 0.95);
      this.delay.connect(this.feedbackGain);
      this.feedbackGain.connect(this.delay);
      this.route(this.delay, this.delay);
    }
    get time() {
      return this.delay.delayTime.value;
    }
    set time(value) {
      this.delay.delayTime.value = value;
    }
    get feedback() {
      return this.feedbackGain.gain.value;
    }
    set feedback(value) {
      this.feedbackGain.gain.value = Math.min(Math.max(value, 0), 0.95);
    }
  }
  var Delay_default = Delay;

  // src/core/effects/Distortion.js
  var CURVE_SAMPLES = 2048;
  var buildCurve = (amount) => {
    const k = amount * 100;
    const curve = new Float32Array(CURVE_SAMPLES);
    const deg = Math.PI / 180;
    for (let i = 0;i < CURVE_SAMPLES; i++) {
      const x = i * 2 / CURVE_SAMPLES - 1;
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
  };

  class Distortion extends Effect_default {
    constructor(context, options = {}) {
      super(context, options);
      this.shaper = context.createWaveShaper();
      this.shaper.oversample = options.oversample || "4x";
      this.amountValue = options.amount ?? 0.4;
      this.shaper.curve = buildCurve(this.amountValue);
      this.route(this.shaper, this.shaper);
    }
    get amount() {
      return this.amountValue;
    }
    set amount(value) {
      this.amountValue = Math.min(Math.max(value, 0), 1);
      this.shaper.curve = buildCurve(this.amountValue);
    }
  }
  var Distortion_default = Distortion;

  // src/core/effects/Compressor.js
  class Compressor extends Effect_default {
    constructor(context, options = {}) {
      super(context, options);
      this.compressor = context.createDynamicsCompressor();
      this.compressor.threshold.value = options.threshold ?? -24;
      this.compressor.knee.value = options.knee ?? 30;
      this.compressor.ratio.value = options.ratio ?? 12;
      this.compressor.attack.value = options.attack ?? 0.003;
      this.compressor.release.value = options.release ?? 0.25;
      this.route(this.compressor, this.compressor);
    }
    get threshold() {
      return this.compressor.threshold.value;
    }
    set threshold(value) {
      this.compressor.threshold.value = value;
    }
    get knee() {
      return this.compressor.knee.value;
    }
    set knee(value) {
      this.compressor.knee.value = value;
    }
    get ratio() {
      return this.compressor.ratio.value;
    }
    set ratio(value) {
      this.compressor.ratio.value = value;
    }
    get attack() {
      return this.compressor.attack.value;
    }
    set attack(value) {
      this.compressor.attack.value = value;
    }
    get release() {
      return this.compressor.release.value;
    }
    set release(value) {
      this.compressor.release.value = value;
    }
  }
  var Compressor_default = Compressor;

  // src/core/effects/StereoPanner.js
  class StereoPanner extends Effect_default {
    constructor(context, options = {}) {
      super(context, options);
      this.panner = context.createStereoPanner();
      this.panner.pan.value = Math.min(Math.max(options.pan ?? 0, -1), 1);
      this.route(this.panner, this.panner);
    }
    get pan() {
      return this.panner.pan.value;
    }
    set pan(value) {
      this.panner.pan.value = Math.min(Math.max(value, -1), 1);
    }
  }
  var StereoPanner_default = StereoPanner;

  // src/core/effects/Tremolo.js
  class Tremolo extends Effect_default {
    constructor(context, options = {}) {
      super(context, options);
      const depth = Math.min(Math.max(options.depth ?? 0.5, 0), 0.5);
      this.tremoloGain = context.createGain();
      this.tremoloGain.gain.value = 1 - depth;
      this.lfo = context.createOscillator();
      this.lfo.type = options.wave || "sine";
      this.lfo.frequency.value = options.speed ?? 5;
      this.depthGain = context.createGain();
      this.depthGain.gain.value = depth;
      this.lfo.connect(this.depthGain);
      this.depthGain.connect(this.tremoloGain.gain);
      this.lfo.start();
      this.route(this.tremoloGain, this.tremoloGain);
    }
    get speed() {
      return this.lfo.frequency.value;
    }
    set speed(value) {
      this.lfo.frequency.value = value;
    }
    get depth() {
      return this.depthGain.gain.value;
    }
    set depth(value) {
      const depth = Math.min(Math.max(value, 0), 0.5);
      this.depthGain.gain.value = depth;
      this.tremoloGain.gain.value = 1 - depth;
    }
    dispose() {
      this.lfo.stop();
      this.lfo.disconnect();
      this.depthGain.disconnect();
      this.tremoloGain.disconnect();
      super.dispose();
    }
  }
  var Tremolo_default = Tremolo;

  // src/core/effects/Reverb.js
  var buildImpulse = (context, seconds, decay, reverse) => {
    const rate = context.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const impulse = context.createBuffer(2, length, rate);
    for (let channel = 0;channel < impulse.numberOfChannels; channel++) {
      const samples = impulse.getChannelData(channel);
      for (let i = 0;i < length; i++) {
        const n = reverse ? length - i : i;
        samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      }
    }
    return impulse;
  };

  class Reverb extends Effect_default {
    constructor(context, options = {}) {
      super(context, { mix: options.mix ?? 0.5 });
      this.timeValue = options.time ?? 2;
      this.decayValue = options.decay ?? 2;
      this.reverseValue = options.reverse ?? false;
      this.convolver = context.createConvolver();
      this.convolver.buffer = buildImpulse(context, this.timeValue, this.decayValue, this.reverseValue);
      this.route(this.convolver, this.convolver);
    }
    get time() {
      return this.timeValue;
    }
    set time(value) {
      this.timeValue = Math.max(value, 0.01);
      this.rebuildImpulse();
    }
    get decay() {
      return this.decayValue;
    }
    set decay(value) {
      this.decayValue = value;
      this.rebuildImpulse();
    }
    get reverse() {
      return this.reverseValue;
    }
    set reverse(value) {
      this.reverseValue = value;
      this.rebuildImpulse();
    }
    rebuildImpulse() {
      this.convolver.buffer = buildImpulse(this.context, this.timeValue, this.decayValue, this.reverseValue);
    }
  }
  var Reverb_default = Reverb;
  // src/global.js
  if (typeof window !== "undefined") {
    window.Pluck = { ...exports_src };
  }
})();
