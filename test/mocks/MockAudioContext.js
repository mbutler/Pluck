class MockAudioParam {
    constructor() {
      this.value = 0
    }
  }
  
  class MockAudioNode {
    connect() {}
    disconnect() {}
  }
  
  class MockGainNode extends MockAudioNode {
    constructor() {
      super()
      this.gain = new MockAudioParam()
    }
  }
  
  class MockOscillatorNode extends MockAudioNode {
    constructor() {
      super()
      this.frequency = new MockAudioParam()
      this.type = 'sine'
    }
    start() {}
    stop() {}
  }
  
  class MockBufferSourceNode extends MockAudioNode {
    constructor() {
      super()
      this.buffer = null
      this.loop = false
      this.onended = null
    }
    start() {
      if (this.onended) this.onended()
    }
    stop() {}
  }
  
  class MockAudioBuffer {
    constructor(options) {
      this.length = options.length
      this.duration = options.duration
      this.sampleRate = options.sampleRate
      this.numberOfChannels = options.numberOfChannels
    }
    getChannelData() {
      return new Float32Array(this.length)
    }
  }
  
  class MockAudioContext {
    constructor() {
      this.currentTime = 0
      this.destination = new MockAudioNode()
    }
  
    createGain() {
      return new MockGainNode()
    }
  
    createOscillator() {
      return new MockOscillatorNode()
    }
  
    createBufferSource() {
      return new MockBufferSourceNode()
    }
  
    decodeAudioData(arrayBuffer, successCallback, errorCallback) {
      // Mock decoding audio data
      if (successCallback) {
        successCallback(new MockAudioBuffer({
          length: arrayBuffer.byteLength,
          duration: arrayBuffer.byteLength / 44100,
          sampleRate: 44100,
          numberOfChannels: 2,
        }))
      } else if (errorCallback) {
        errorCallback(new Error('Error decoding audio data'))
      }
    }
  }
  
  export { MockAudioContext }
  