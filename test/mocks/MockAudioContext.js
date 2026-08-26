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

const edges = new Set()
let nextId = 0

const edgeKey = (from, to) => `${from.label}->${to.label}`

class MockAudioNode {
  constructor(label) {
    this.label = `${label}#${nextId++}`
  }

  connect(destination) {
    if (!destination || typeof destination.label !== 'string') {
      throw new TypeError('Failed to execute connect: parameter is not an AudioNode')
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
  }
}

class MockOscillatorNode extends MockAudioScheduledSourceNode {
  constructor() {
    super('oscillator')
    this.type = 'sine'
    this.frequency = new MockAudioParam(440)
  }
}

class MockMediaStreamAudioSourceNode extends MockAudioNode {
  constructor(stream) {
    super('mediaStreamSource')
    this.mediaStream = stream
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
    return { sampleRate: 44100, duration: 1, id: nextId++ }
  }

  globalThis.requestAnimationFrame = () => 0
  globalThis.cancelAnimationFrame = () => {}
}

/** Clears the recorded graph and call log. Call between tests. */
export const resetMocks = () => {
  edges.clear()
  calls.fetch.length = 0
  calls.getUserMedia.length = 0
  calls.decodeAudioData.length = 0
  fetchHandler = null
  getUserMediaHandler = null
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
