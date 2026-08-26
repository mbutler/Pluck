const DEFAULTS = {
  bpm: 120,
  beatsPerBar: 4
}

/**
 * Maps musical position to audio-clock time.
 *
 * The mapping is held as an anchor — "at `time` seconds the transport was at
 * `beat`, running at `bpm`" — rather than as a bare multiplication from zero.
 * That is what makes tempo changes work: changing the tempo re-anchors at the
 * current position, so beats already elapsed keep the times they were played
 * at, and only the future is stretched.
 *
 * Bars and beats are zero-indexed: bar 0 beat 0 is the downbeat of the piece.
 */
class Tempo {
  constructor(options = {}) {
    this.beatsPerBar = options.beatsPerBar ?? DEFAULTS.beatsPerBar
    this.anchor = { beat: 0, time: 0, bpm: options.bpm ?? DEFAULTS.bpm }
  }

  get bpm() {
    return this.anchor.bpm
  }

  /** Changes tempo from `atTime` onward, leaving earlier beats where they were. */
  setBpm(value, atTime = this.anchor.time) {
    if (!(value > 0)) throw new Error('bpm must be greater than 0')
    this.anchor = { beat: this.timeToBeat(atTime), time: atTime, bpm: value }
  }

  /** Places `beat` at `atTime`. Used when the transport starts. */
  reset(atTime, beat = 0) {
    this.anchor = { beat, time: atTime, bpm: this.anchor.bpm }
  }

  /** Absolute audio-clock time of a beat position. */
  beatToTime(beat) {
    return this.anchor.time + (beat - this.anchor.beat) * 60 / this.anchor.bpm
  }

  /** Beat position at an absolute audio-clock time. */
  timeToBeat(time) {
    return this.anchor.beat + (time - this.anchor.time) * this.anchor.bpm / 60
  }

  /** Duration conversions, for lengths rather than positions. */
  beatsToSeconds(beats) {
    return beats * 60 / this.anchor.bpm
  }

  secondsToBeats(seconds) {
    return seconds * this.anchor.bpm / 60
  }

  barToBeat(bar, beat = 0) {
    return bar * this.beatsPerBar + beat
  }

  beatToBar(beat) {
    return beat / this.beatsPerBar
  }
}

export default Tempo
