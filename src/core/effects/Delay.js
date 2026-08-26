import Effect from './Effect.js'

/**
 * A feedback delay.
 *
 *   input -> delay -> wet
 *             ^ |
 *             | v
 *           feedback
 *
 * Defaults to a half-and-half mix, since a delay is normally heard alongside
 * the dry signal rather than in place of it.
 */
class Delay extends Effect {
  constructor(context, options = {}) {
    super(context, { mix: options.mix ?? 0.5 })

    const maxTime = options.maxTime ?? 5
    this.delay = context.createDelay(maxTime)
    this.delay.delayTime.value = Math.min(options.time ?? 0.3, maxTime)

    this.feedbackGain = context.createGain()
    // Feedback of 1 or more never decays; cap below that.
    this.feedbackGain.gain.value = Math.min(options.feedback ?? 0.4, 0.95)

    this.delay.connect(this.feedbackGain)
    this.feedbackGain.connect(this.delay)

    this.route(this.delay, this.delay)
  }

  get time() {
    return this.delay.delayTime.value
  }

  set time(value) {
    this.delay.delayTime.value = value
  }

  get feedback() {
    return this.feedbackGain.gain.value
  }

  set feedback(value) {
    this.feedbackGain.gain.value = Math.min(Math.max(value, 0), 0.95)
  }
}

export default Delay
