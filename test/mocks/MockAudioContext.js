export class MockAudioContext {
  constructor() {
    this.destination = new MockGainNode()
    this.state = 'running'
  }

  createGain() {
    return new MockGainNode()
  }

  createOscillator() {
    return new MockOscillatorNode()
  }

  createMediaStreamSource() {
    return new MockMediaStreamSourceNode()
  }

  decodeAudioData(arrayBuffer) {
    return new Promise(resolve => {
      resolve(new MockAudioBuffer())
    })
  }

  resume() {
    return Promise.resolve()
  }
}

export class MockGainNode {
  constructor() {
    this.gain = { value: 1 }
    this.connect = jest.fn()
    this.disconnect = jest.fn()
  }
}

export class MockOscillatorNode {
  constructor() {
    this.frequency = { value: 440 }
    this.type = 'sine'
    this.connect = jest.fn()
    this.disconnect = jest.fn()
    this.start = jest.fn()
    this.stop = jest.fn()
  }
}

export class MockAudioBuffer {
  constructor() {
    this.duration = 1
  }
}

export class MockMediaStreamSourceNode {
  constructor() {
    this.connect = jest.fn()
    this.disconnect = jest.fn()
  }
}
