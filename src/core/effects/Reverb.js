import Effect from './Effect.js'

/**
 * Builds an impulse response rather than loading one, so reverb needs no asset
 * and no dependency. Decaying noise is a coarse approximation of a real space,
 * but it is the standard trick and sounds like a room.
 */
const buildImpulse = (context, seconds, decay, reverse) => {
  const rate = context.sampleRate
  const length = Math.max(1, Math.floor(rate * seconds))
  const impulse = context.createBuffer(2, length, rate)

  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const samples = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      const n = reverse ? length - i : i
      samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay)
    }
  }

  return impulse
}

class Reverb extends Effect {
  constructor(context, options = {}) {
    super(context, { mix: options.mix ?? 0.5 })

    this.timeValue = options.time ?? 2
    this.decayValue = options.decay ?? 2
    this.reverseValue = options.reverse ?? false

    this.convolver = context.createConvolver()
    this.convolver.buffer = buildImpulse(context, this.timeValue, this.decayValue, this.reverseValue)

    this.route(this.convolver, this.convolver)
  }

  /** Tail length in seconds. Changing it rebuilds the impulse response. */
  get time() {
    return this.timeValue
  }

  set time(value) {
    this.timeValue = Math.max(value, 0.01)
    this.rebuildImpulse()
  }

  get decay() {
    return this.decayValue
  }

  set decay(value) {
    this.decayValue = value
    this.rebuildImpulse()
  }

  get reverse() {
    return this.reverseValue
  }

  set reverse(value) {
    this.reverseValue = value
    this.rebuildImpulse()
  }

  rebuildImpulse() {
    this.convolver.buffer = buildImpulse(
      this.context, this.timeValue, this.decayValue, this.reverseValue
    )
  }
}

export default Reverb
export { buildImpulse }
