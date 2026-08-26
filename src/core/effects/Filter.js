import Effect from './Effect.js'

/**
 * A biquad filter. `type` takes any of the Web Audio filter types --
 * lowpass, highpass, bandpass, lowshelf, highshelf, peaking, notch, allpass.
 */
class Filter extends Effect {
  constructor(context, options = {}) {
    super(context, options)

    this.filter = context.createBiquadFilter()
    this.filter.type = options.type || 'lowpass'
    this.filter.frequency.value = options.frequency ?? 1000
    this.filter.Q.value = options.q ?? 1
    if (options.gain !== undefined) this.filter.gain.value = options.gain

    this.route(this.filter, this.filter)
  }

  get type() {
    return this.filter.type
  }

  set type(value) {
    this.filter.type = value
  }

  get frequency() {
    return this.filter.frequency.value
  }

  set frequency(value) {
    this.filter.frequency.value = value
  }

  /** Resonance. Named `q` rather than `Q` to match the rest of the library. */
  get q() {
    return this.filter.Q.value
  }

  set q(value) {
    this.filter.Q.value = value
  }

  get gain() {
    return this.filter.gain.value
  }

  set gain(value) {
    this.filter.gain.value = value
  }

  audioParams() {
    return {
      frequency: this.filter.frequency,
      q: this.filter.Q,
      gain: this.filter.gain
    }
  }
}

class LowPassFilter extends Filter {
  constructor(context, options = {}) {
    super(context, { ...options, type: 'lowpass' })
  }
}

class HighPassFilter extends Filter {
  constructor(context, options = {}) {
    super(context, { ...options, type: 'highpass' })
  }
}

export default Filter
export { LowPassFilter, HighPassFilter }
