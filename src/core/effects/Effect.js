import { rampParam } from '../ramp.js'

/**
 * Base class for effects, and the contract anything pluggable has to meet:
 * an `input` node to connect into and an `output` node to connect from.
 *
 * The base builds the dry/wet split so subclasses do not have to:
 *
 *   input ──┬─> dryGain ─────────┬─> output
 *           └─> [subclass] -> wetGain
 *
 * A subclass creates whatever nodes it needs and calls route(head, tail) once
 * to drop them into the wet path. Effects that replace the signal rather than
 * add to it — a filter, a panner — default to mix 1 and the dry path simply
 * carries nothing.
 */
class Effect {
  constructor(context, options = {}) {
    this.context = context

    this.input = context.createGain()
    this.output = context.createGain()
    this.dryGain = context.createGain()
    this.wetGain = context.createGain()

    this.input.connect(this.dryGain)
    this.dryGain.connect(this.output)
    this.wetGain.connect(this.output)

    this.mixBeforeBypass = null
    this.mix = options.mix ?? 1
  }

  /** Places a subclass's own graph in the wet path. */
  route(head, tail) {
    this.input.connect(head)
    tail.connect(this.wetGain)
  }

  /**
   * AudioParams this effect can ramp, keyed by the same names as the
   * properties. Subclasses override. `mix` is handled in the base.
   */
  audioParams() {
    return {}
  }

  /**
   * Clamps a value about to be ramped. Subclasses override for parameters
   * that have a legal range (pan, feedback, depth).
   */
  prepareRamp(name, value) {
    if (name === 'mix') return Math.min(1, Math.max(0, value))
    return value
  }

  /**
   * Linearly ramps a named parameter over `seconds`. `mix` is always available;
   * everything else is whatever `audioParams()` exposes. Parameters that are
   * not AudioParams (a distortion amount, a reverb time) cannot be ramped and
   * warn instead.
   *
   * @returns {Effect} this, so ramps can be chained
   */
  rampTo(name, value, seconds = 1) {
    const target = this.prepareRamp(name, value)
    const now = this.context.currentTime

    if (name === 'mix') {
      rampParam(this.wetGain.gain, target, seconds, now)
      rampParam(this.dryGain.gain, 1 - target, seconds, now)
      return this
    }

    const param = this.audioParams()[name]
    if (!param) {
      console.warn(`Cannot ramp '${name}' on this effect`)
      return this
    }

    rampParam(param, target, seconds, now)
    return this
  }

  /**
   * Wet/dry balance, 0..1. Read straight off the gain nodes rather than kept
   * in a field, so the two can never disagree.
   */
  get mix() {
    return this.wetGain.gain.value
  }

  set mix(value) {
    const amount = Math.min(1, Math.max(0, value))
    this.wetGain.gain.value = amount
    this.dryGain.gain.value = 1 - amount
  }

  get bypassed() {
    return this.mixBeforeBypass !== null
  }

  /** Passes the signal straight through, remembering the mix to restore. */
  set bypassed(value) {
    if (value === this.bypassed) return

    if (value) {
      this.mixBeforeBypass = this.mix
      this.mix = 0
      return
    }

    this.mix = this.mixBeforeBypass
    this.mixBeforeBypass = null
  }

  /**
   * Releases anything that keeps running on its own. The base has nothing to
   * release; effects with an internal oscillator override this.
   */
  dispose() {
    this.input.disconnect()
    this.output.disconnect()
    this.dryGain.disconnect()
    this.wetGain.disconnect()
  }
}

export default Effect
