/**
 * One sounding instance of a Sound.
 *
 * Source nodes are single-use, so every play needs a new one. A voice pairs that
 * source with a gain node of its own and owns both for its lifetime:
 *
 *   source -> voice.gainNode -> sound.gainNode -> output
 *
 * The private gain node is what makes overlapping playback work. The envelope is
 * per-voice, so a second hit starting while the first is still ringing gets its
 * own attack instead of restarting the shared one, and a voice ending tears down
 * only its own nodes. Volume stays on the Sound's gain node, downstream of every
 * voice, so changing it moves them all together.
 */
class Voice {
  constructor(context, source, output) {
    this.context = context
    this.source = source
    this.gainNode = context.createGain()
    this.gainNode.gain.value = 0

    source.connect(this.gainNode)
    this.gainNode.connect(output)

    this.started = false
    this.ended = false
    this.onended = null

    source.onended = () => this.retire()
  }

  /**
   * @param {number} when    absolute context time to start at
   * @param {number} offset  seconds into the buffer to start from
   * @param {number} attack  envelope ramp length in seconds
   */
  start(when, offset, attack) {
    // The envelope runs 0..1 and is scheduled at `when`, not now, so a voice
    // handed to the audio clock ahead of time still fades in at the right moment.
    this.gainNode.gain.setValueAtTime(0, when)
    this.gainNode.gain.linearRampToValueAtTime(1, when + attack)

    this.source.start(when, offset)
    this.started = true
  }

  /** Cuts the voice immediately and releases its nodes. */
  stop() {
    if (this.ended) return
    // Stopping a source that never started is an InvalidStateError. A voice can
    // be stopped before its scheduled start time, so this has to be guarded.
    if (this.started && this.source.stop) this.source.stop()
    this.retire()
  }

  retire() {
    if (this.ended) return
    this.ended = true

    this.source.disconnect()
    this.gainNode.disconnect()

    if (this.onended) this.onended(this)
  }
}

export default Voice
