/**
 * A stand-in for the parts of the Web Audio API that Pluck uses.
 *
 * It records every connection so tests can assert on the shape of the audio
 * graph, and it reproduces the spec behaviours that Pluck has to respect:
 *
 *   - a source node can only be started once (InvalidStateError otherwise)
 *   - stop() before start() is an InvalidStateError
 *   - connecting the same pair of nodes twice is a no-op, not a second edge
 *   - AudioParam.value reflects the last set value, not a ramp in progress
 *
 * If one of those assumptions is wrong, these tests will agree with each other
 * and still disagree with a browser, so the demo pages in dist/ remain the
 * manual check against the real API.
 */

import bufferCache from '../../src/core/BufferCache.js'

const edges = new Set()
let nextId = 0

const edgeKey = (from, to) => `${from.label}->${to.label}`

class MockAudioNode {
  constructor(label) {
    this.label = `${label}#${nextId++}`
  }

  connect(destination) {
    // An AudioParam is a valid target: that is how modulation is wired, e.g. an
    // LFO into a gain's .gain. Params carry a label for exactly this reason.
    if (!destination || typeof destination.label !== 'string') {
      throw new TypeError('Failed to execute connect: parameter is not an AudioNode or AudioParam')
    }
    edges.add(edgeKey(this, destination))
    return destination
  }

  disconnect(destination) {
    if (!destination) {
      for (const edge of [...edges]) {
        if (edge.startsWith(`${this.label}->`)) edges.delete(edge)
      }
      return
    }
    edges.delete(edgeKey(this, destination))
  }
}

class MockAudioParam {
  constructor(value) {
    this.value = value
    this.automation = []
    this.label = `param#${nextId++}`
  }

  setValueAtTime(value, time) {
    this.automation.push({ type: 'setValueAtTime', value, time })
    this.value = value
    return this
  }

  linearRampToValueAtTime(value, time) {
    this.automation.push({ type: 'linearRampToValueAtTime', value, time })
    return this
  }

  cancelScheduledValues(time) {
    this.automation.push({ type: 'cancelScheduledValues', time })
    return this
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super('gain')
    this.gain = new MockAudioParam(1)
  }
}

class MockAudioScheduledSourceNode extends MockAudioNode {
  constructor(label) {
    super(label)
    this.onended = null
    this.startCalls = []
    this.stopCalls = []
  }

  start(when = 0, offset = 0) {
    if (this.startCalls.length) {
      throw new Error('InvalidStateError: cannot call start more than once')
    }
    this.startCalls.push({ when, offset })
  }

  stop(when = 0) {
    if (!this.startCalls.length) {
      throw new Error('InvalidStateError: cannot call stop without calling start first')
    }
    this.stopCalls.push({ when })
    if (this.onended) {
      const onended = this.onended
      queueMicrotask(() => onended())
    }
  }
}

class MockAudioBufferSourceNode extends MockAudioScheduledSourceNode {
  constructor() {
    super('bufferSource')
    this.buffer = null
    this.loop = false
    this.playbackRate = new MockAudioParam(1)
    this.detune = new MockAudioParam(0)
  }
}

class MockOscillatorNode extends MockAudioScheduledSourceNode {
  constructor() {
    super('oscillator')
    this.type = 'sine'
    this.frequency = new MockAudioParam(440)
    this.detune = new MockAudioParam(0)
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super('biquadFilter')
    this.type = 'lowpass'
    this.frequency = new MockAudioParam(350)
    this.Q = new MockAudioParam(1)
    this.gain = new MockAudioParam(0)
    this.detune = new MockAudioParam(0)
  }
}

class MockDelayNode extends MockAudioNode {
  constructor(maxDelayTime = 1) {
    super('delay')
    this.maxDelayTime = maxDelayTime
    this.delayTime = new MockAudioParam(0)
  }
}

class MockWaveShaperNode extends MockAudioNode {
  constructor() {
    super('waveShaper')
    this.curve = null
    this.oversample = 'none'
  }
}

class MockDynamicsCompressorNode extends MockAudioNode {
  constructor() {
    super('compressor')
    this.threshold = new MockAudioParam(-24)
    this.knee = new MockAudioParam(30)
    this.ratio = new MockAudioParam(12)
    this.attack = new MockAudioParam(0.003)
    this.release = new MockAudioParam(0.25)
    this.reduction = 0
  }
}

class MockStereoPannerNode extends MockAudioNode {
  constructor() {
    super('stereoPanner')
    this.pan = new MockAudioParam(0)
  }
}

class MockConvolverNode extends MockAudioNode {
  constructor() {
    super('convolver')
    this.buffer = null
    this.normalize = true
  }
}

class MockAudioBuffer {
  /**
   * @param {boolean} sparse  skip allocating the sample arrays. Tests that only
   *   care about reported size can ask for a fifteen-minute buffer without
   *   actually reserving 300MB for it.
   */
  constructor(numberOfChannels, length, sampleRate, sparse = false) {
    this.numberOfChannels = numberOfChannels
    this.length = length
    this.sampleRate = sampleRate
    this.duration = length / sampleRate
    this.channels = sparse
      ? null
      : Array.from({ length: numberOfChannels }, () => new Float32Array(length))
  }

  getChannelData(channel) {
    if (!this.channels) throw new Error('sparse mock buffer has no sample data')
    return this.channels[channel]
  }
}

class MockMediaStreamAudioSourceNode extends MockAudioNode {
  constructor(stream) {
    super('mediaStreamSource')
    this.mediaStream = stream
  }
}

class MockMediaElementAudioSourceNode extends MockAudioNode {
  constructor(element) {
    super('mediaElementSource')
    this.mediaElement = element
  }
}

/** Stands in for an HTMLAudioElement used as a streaming source. */
export class MockAudioElement {
  constructor(src = '') {
    this.src = src
    this.loop = false
    this.currentTime = 0
    this.preload = 'auto'
    this.crossOrigin = null
    this.playbackRate = 1
    this.paused = true
    this.playCalls = 0
    this.pauseCalls = 0
    this.listeners = {}
  }

  async play() {
    this.playCalls++
    this.paused = false
  }

  pause() {
    this.pauseCalls++
    this.paused = true
  }

  addEventListener(name, listener) {
    (this.listeners[name] ||= []).push(listener)
  }

  removeEventListener(name, listener) {
    this.listeners[name] = (this.listeners[name] || []).filter(l => l !== listener)
  }

  /** Test hook: fire an event as the browser would. */
  emit(name) {
    (this.listeners[name] || []).forEach(listener => listener())
  }
}

export class MockMediaStream {
  constructor(label = 'stream') {
    this.label = label
    this.tracks = [{ kind: 'audio', stopped: false, stop() { this.stopped = true } }]
  }

  getTracks() {
    return this.tracks
  }
}

export class MockAudioContext extends MockAudioNode {
  constructor() {
    super('context')
    this.state = 'running'
    this.sampleRate = 44100
    this.currentTime = 0
    this.destination = new MockAudioNode('destination')
    this.resumeCalls = 0
    this.closeCalls = 0
  }

  createGain() {
    return new MockGainNode()
  }

  createOscillator() {
    return new MockOscillatorNode()
  }

  createBufferSource() {
    return new MockAudioBufferSourceNode()
  }

  createMediaStreamSource(stream) {
    return new MockMediaStreamAudioSourceNode(stream)
  }

  createMediaElementSource(element) {
    return new MockMediaElementAudioSourceNode(element)
  }

  createBiquadFilter() {
    return new MockBiquadFilterNode()
  }

  createDelay(maxDelayTime = 1) {
    return new MockDelayNode(maxDelayTime)
  }

  createWaveShaper() {
    return new MockWaveShaperNode()
  }

  createDynamicsCompressor() {
    return new MockDynamicsCompressorNode()
  }

  createStereoPanner() {
    return new MockStereoPannerNode()
  }

  createConvolver() {
    return new MockConvolverNode()
  }

  createBuffer(numberOfChannels, length, sampleRate) {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate)
  }

  async resume() {
    this.resumeCalls++
    this.state = 'running'
  }

  async close() {
    this.closeCalls++
    this.state = 'closed'
  }
}

/* ------------------------------------------------------------------ *
 * Graph assertions
 * ------------------------------------------------------------------ */

export const hasEdge = (from, to) => edges.has(edgeKey(from, to))

/** True when audio can travel from `from` to `to` through the recorded graph. */
export const pathExists = (from, to) => {
  const seen = new Set([from.label])
  const stack = [from.label]
  while (stack.length) {
    const current = stack.pop()
    if (current === to.label) return true
    for (const edge of edges) {
      const [source, destination] = edge.split('->')
      if (source === current && !seen.has(destination)) {
        seen.add(destination)
        stack.push(destination)
      }
    }
  }
  return false
}

export const edgesFrom = node =>
  [...edges].filter(edge => edge.startsWith(`${node.label}->`))

/* ------------------------------------------------------------------ *
 * Browser globals
 * ------------------------------------------------------------------ */

export const calls = {
  fetch: [],
  getUserMedia: [],
  decodeAudioData: []
}

let fetchHandler = null
let getUserMediaHandler = null
let decodedSeconds = 1

/** Sets how long the next decodeAudioData results claim to be. */
export const setDecodedSeconds = seconds => { decodedSeconds = seconds }

/** Controls what the next fetch() resolves to. Throw from here to fail a load. */
export const onFetch = handler => { fetchHandler = handler }

/** Controls what getUserMedia() resolves to. Throw from here to deny the mic. */
export const onGetUserMedia = handler => { getUserMediaHandler = handler }

export const installBrowserGlobals = () => {
  globalThis.window = { AudioContext: MockAudioContext, webkitAudioContext: MockAudioContext }
  globalThis.AudioContext = MockAudioContext

  globalThis.fetch = async url => {
    calls.fetch.push(url)
    if (fetchHandler) return fetchHandler(url)
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
  }

  globalThis.navigator = {
    mediaDevices: {
      getUserMedia: async constraints => {
        calls.getUserMedia.push(constraints)
        if (getUserMediaHandler) return getUserMediaHandler(constraints)
        return new MockMediaStream()
      }
    }
  }

  MockAudioContext.prototype.decodeAudioData = async function (arrayBuffer) {
    calls.decodeAudioData.push(arrayBuffer)
    // A real AudioBuffer, so cache byte accounting has something true to measure.
    // decodedSeconds lets a test ask for a large buffer without allocating one.
    const seconds = decodedSeconds
    return new MockAudioBuffer(2, Math.floor(this.sampleRate * seconds), this.sampleRate, true)
  }

  globalThis.Audio = MockAudioElement
  globalThis.requestAnimationFrame = () => 0
  globalThis.cancelAnimationFrame = () => {}
}

/**
 * Clears the recorded graph, the call log, and the shared buffer cache. The
 * cache is module-level and would otherwise carry decoded audio between tests,
 * making fetch counts depend on test order.
 */
export const resetMocks = () => {
  bufferCache.clear()
  edges.clear()
  calls.fetch.length = 0
  calls.getUserMedia.length = 0
  calls.decodeAudioData.length = 0
  fetchHandler = null
  getUserMediaHandler = null
  decodedSeconds = 1
}

/* ------------------------------------------------------------------ *
 * Console capture
 *
 * Pluck reports most failures through console.error / console.warn, so tests
 * need to both silence and inspect them.
 * ------------------------------------------------------------------ */

export const captureConsole = () => {
  const original = { error: console.error, warn: console.warn, log: console.log, info: console.info }
  const messages = { error: [], warn: [], log: [], info: [] }

  for (const level of Object.keys(messages)) {
    console[level] = (...args) => messages[level].push(args.map(String).join(' '))
  }

  return {
    messages,
    /** True when any captured message at `level` contains `text`. */
    saw: (level, text) => messages[level].some(message => message.includes(text)),
    restore: () => Object.assign(console, original)
  }
}
