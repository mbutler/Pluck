class MockAudioContext {
    constructor() {
      this.destination = {}
      this.currentTime = 0
    }
  
    createGain() {
      return new MockGainNode()
    }
  
    createBufferSource() {
      return new MockBufferSourceNode()
    }
  
    createOscillator() {
      return new MockOscillatorNode()
    }
  
    decodeAudioData(arrayBuffer, successCallback, errorCallback) {
      // Mock decoding audio data
      successCallback(new ArrayBuffer(0))
    }
  
    close() {}
  }
  
  class MockGainNode {
    constructor() {
      this.gain = {
        value: 1,
        setValueAtTime: function (value, time) {
          this.value = value
        },
        linearRampToValueAtTime: function (value, endTime) {
          this.value = value
        }
      }
    }
  
    connect() {}
    disconnect() {}
  }
  
  class MockBufferSourceNode {
    constructor() {
      this.buffer = null
      this.loop = false
    }
  
    connect() {}
    disconnect() {}
    start() {}
    stop() {}
  }
  
  class MockOscillatorNode {
    constructor() {
      this.frequency = { value: 440 }
      this.type = 'sine'
    }
  
    connect() {}
    disconnect() {}
    start() {}
    stop() {}
  }
  
  module.exports = {
    MockAudioContext,
    MockGainNode,
    MockBufferSourceNode,
    MockOscillatorNode
  }
  