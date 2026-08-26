import Effect from './Effect.js'
import { rampParam } from '../ramp.js'

/**
 * Amplitude modulation.
 *
 *   input -> tremoloGain -> wet
 *   lfo -> depthGain -> tremoloGain.gain
 *
 * The modulated gain sits at 1 - depth and the LFO swings it by depth either
 * way, so the signal moves between 1 - 2*depth and 1 rather than clipping above
 * unity. At depth 0.5 it reaches silence at the trough.
 */
class Tremolo extends Effect {
  constructor(context, options = {}) {
    super(context, options)

    const depth = Math.min(Math.max(options.depth ?? 0.5, 0), 0.5)

    this.tremoloGain = context.createGain()
    this.tremoloGain.gain.value = 1 - depth

    this.lfo = context.createOscillator()
    this.lfo.type = options.wave || 'sine'
    this.lfo.frequency.value = options.speed ?? 5

    this.depthGain = context.createGain()
    this.depthGain.gain.value = depth

    this.lfo.connect(this.depthGain)
    this.depthGain.connect(this.tremoloGain.gain)
    this.lfo.start()

    this.route(this.tremoloGain, this.tremoloGain)
  }

  get speed() {
    return this.lfo.frequency.value
  }

  set speed(value) {
    this.lfo.frequency.value = value
  }

  get depth() {
    return this.depthGain.gain.value
  }

  set depth(value) {
    const depth = Math.min(Math.max(value, 0), 0.5)
    this.depthGain.gain.value = depth
    this.tremoloGain.gain.value = 1 - depth
  }

  audioParams() {
    return { speed: this.lfo.frequency }
  }

  prepareRamp(name, value) {
    if (name === 'depth') return Math.min(Math.max(value, 0), 0.5)
    return super.prepareRamp(name, value)
  }

  rampTo(name, value, seconds = 1) {
    if (name === 'depth') {
      const depth = this.prepareRamp('depth', value)
      const now = this.context.currentTime
      rampParam(this.depthGain.gain, depth, seconds, now)
      rampParam(this.tremoloGain.gain, 1 - depth, seconds, now)
      return this
    }
    return super.rampTo(name, value, seconds)
  }

  /** The LFO runs whether or not anything is playing, so it must be stopped. */
  dispose() {
    this.lfo.stop()
    this.lfo.disconnect()
    this.depthGain.disconnect()
    this.tremoloGain.disconnect()
    super.dispose()
  }
}

export default Tremolo
