import Effect from './Effect.js'

const CURVE_SAMPLES = 2048

/**
 * Maps input amplitude to output amplitude. The shape is the familiar
 * arctangent-like curve: gentle either side of silence, flattening towards the
 * rails as `amount` rises, so low levels stay recognisable while peaks clip.
 */
const buildCurve = amount => {
  const k = amount * 100
  const curve = new Float32Array(CURVE_SAMPLES)
  const deg = Math.PI / 180

  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const x = (i * 2) / CURVE_SAMPLES - 1
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x))
  }

  return curve
}

class Distortion extends Effect {
  constructor(context, options = {}) {
    super(context, options)

    this.shaper = context.createWaveShaper()
    this.shaper.oversample = options.oversample || '4x'
    this.amountValue = options.amount ?? 0.4
    this.shaper.curve = buildCurve(this.amountValue)

    this.route(this.shaper, this.shaper)
  }

  /** 0..1. The curve is rebuilt on change, which is why this is not a param. */
  get amount() {
    return this.amountValue
  }

  set amount(value) {
    this.amountValue = Math.min(Math.max(value, 0), 1)
    this.shaper.curve = buildCurve(this.amountValue)
  }
}

export default Distortion
export { buildCurve }
