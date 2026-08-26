const TYPES = ['white', 'pink', 'brown']

const fillWhite = samples => {
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.random() * 2 - 1
  }
}

/**
 * Paul Kellet's approximation. Pink noise falls 3dB/octave, which is what
 * "air moving" usually wants — white noise is too bright for wind or rain.
 */
const fillPink = samples => {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < samples.length; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.96900 * b2 + white * 0.1538520
    b3 = 0.86650 * b3 + white * 0.3104856
    b4 = 0.55000 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.0168980
    samples[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
    b6 = white * 0.115926
  }
}

/** Integrated white noise, 6dB/octave. Heavier than pink; useful for rumble. */
const fillBrown = samples => {
  let last = 0
  for (let i = 0; i < samples.length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    samples[i] = Math.min(1, Math.max(-1, last * 3.5))
  }
}

const fillers = { white: fillWhite, pink: fillPink, brown: fillBrown }

/**
 * Builds a looping noise buffer. One second of mono is long enough that the
 * loop is not heard as a cycle, and short enough to be cheap.
 *
 * @param {AudioContext} context
 * @param {string} [type='white']  `white`, `pink`, or `brown`
 * @param {number} [duration=1]    length in seconds
 * @returns {AudioBuffer}
 */
export const buildNoise = (context, type = 'white', duration = 1) => {
  const kind = TYPES.includes(type) ? type : 'white'
  const length = Math.max(1, Math.floor(context.sampleRate * Math.max(duration, 0.01)))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  fillers[kind](buffer.getChannelData(0))
  return buffer
}

export { TYPES as noiseTypes }
