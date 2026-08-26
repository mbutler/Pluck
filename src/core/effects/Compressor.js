import Effect from './Effect.js'

/** Dynamics compression. Parameter names and units follow the Web Audio node. */
class Compressor extends Effect {
  constructor(context, options = {}) {
    super(context, options)

    this.compressor = context.createDynamicsCompressor()
    this.compressor.threshold.value = options.threshold ?? -24
    this.compressor.knee.value = options.knee ?? 30
    this.compressor.ratio.value = options.ratio ?? 12
    this.compressor.attack.value = options.attack ?? 0.003
    this.compressor.release.value = options.release ?? 0.25

    this.route(this.compressor, this.compressor)
  }

  get threshold() { return this.compressor.threshold.value }
  set threshold(value) { this.compressor.threshold.value = value }

  get knee() { return this.compressor.knee.value }
  set knee(value) { this.compressor.knee.value = value }

  get ratio() { return this.compressor.ratio.value }
  set ratio(value) { this.compressor.ratio.value = value }

  get attack() { return this.compressor.attack.value }
  set attack(value) { this.compressor.attack.value = value }

  get release() { return this.compressor.release.value }
  set release(value) { this.compressor.release.value = value }

  audioParams() {
    return {
      threshold: this.compressor.threshold,
      knee: this.compressor.knee,
      ratio: this.compressor.ratio,
      attack: this.compressor.attack,
      release: this.compressor.release
    }
  }
}

export default Compressor
