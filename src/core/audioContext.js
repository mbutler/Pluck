/**
 * Web Audio lookups go through `globalThis` rather than `window`.
 *
 * The library is browser-only in practice, but a bundler or a server-rendered
 * app will evaluate the module where `window` does not exist, and a bare
 * `window.AudioContext` throws a ReferenceError at that point rather than when
 * audio is actually used. `globalThis` is defined everywhere, so the failure
 * moves to the moment something genuinely needs audio, with a message that says
 * so.
 */
const findAudioContext = () => globalThis.AudioContext || globalThis.webkitAudioContext

export const createAudioContext = () => {
  const AudioContextClass = findAudioContext()
  if (!AudioContextClass) {
    throw new Error('Web Audio is not available in this environment')
  }
  return new AudioContextClass()
}

/** True when `value` is an AudioContext. False, not a throw, off the browser. */
export const isAudioContext = value => {
  const AudioContextClass = findAudioContext()
  return !!AudioContextClass && value instanceof AudioContextClass
}
