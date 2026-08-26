import Effect from './Effect.js'

/** Places the signal in the stereo field. -1 is hard left, 1 is hard right. */
class StereoPanner extends Effect {
  constructor(context, options = {}) {
    super(context, options)

    this.panner = context.createStereoPanner()
    this.panner.pan.value = Math.min(Math.max(options.pan ?? 0, -1), 1)

    this.route(this.panner, this.panner)
  }

  get pan() {
    return this.panner.pan.value
  }

  set pan(value) {
    this.panner.pan.value = Math.min(Math.max(value, -1), 1)
  }
}

export default StereoPanner
