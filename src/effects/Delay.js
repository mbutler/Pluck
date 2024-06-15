import BaseEffect from './BaseEffect'
import { isInRange, getDryLevel, getWetLevel } from '../utils/Util'

class Delay extends BaseEffect {
  constructor(options = {}) {
    super()
    this.context = new (window.AudioContext || window.webkitAudioContext)()
    this.inputNode = this.context.createGain()
    this.outputNode = this.context.createGain()
    this.delayNode = this.context.createDelay()
    this.feedbackGainNode = this.context.createGain()
    this.dryGainNode = this.context.createGain()
    this.wetGainNode = this.context.createGain()
    this.options = {
      feedback: options.feedback || 0.5,
      time: options.time || 0.3,
      mix: options.mix || 0.5
    }
    this.setupNodes()
  }

  setupNodes() {
    this.inputNode.connect(this.dryGainNode)
    this.dryGainNode.connect(this.outputNode)
    this.inputNode.connect(this.delayNode)
    this.delayNode.connect(this.feedbackGainNode)
    this.feedbackGainNode.connect(this.delayNode)
    this.delayNode.connect(this.wetGainNode)
    this.wetGainNode.connect(this.outputNode)
    this.updateParameters()
  }

  updateParameters() {
    this.delayNode.delayTime.value = this.options.time
    this.feedbackGainNode.gain.value = this.options.feedback
    this.dryGainNode.gain.value = getDryLevel(this.options.mix)
    this.wetGainNode.gain.value = getWetLevel(this.options.mix)
  }

  set time(value) {
    if (isInRange(value, 0, 180)) {
      this.options.time = value
      this.delayNode.delayTime.value = value
    }
  }

  get time() {
    return this.options.time
  }

  set feedback(value) {
    if (isInRange(value, 0, 1)) {
      this.options.feedback = value
      this.feedbackGainNode.gain.value = value
    }
  }

  get feedback() {
    return this.options.feedback
  }

  set mix(value) {
    if (isInRange(value, 0, 1)) {
      this.options.mix = value
      this.dryGainNode.gain.value = getDryLevel(value)
      this.wetGainNode.gain.value = getWetLevel(value)
    }
  }

  get mix() {
    return this.options.mix
  }
}

export default Delay
