import Timeline from './core/Timeline.js'
import Sound from './core/Sound.js'
import Group from './core/Group.js'
import Voice from './core/Voice.js'
import Tempo from './core/Tempo.js'
import bufferCache, { BufferCache } from './core/BufferCache.js'
import * as effects from './core/effects/index.js'

const Pluck = {
  Timeline,
  Sound,
  Group,
  Voice,
  Tempo,
  BufferCache,
  // Effects: Filter, LowPassFilter, HighPassFilter, Delay, Distortion,
  // Compressor, StereoPanner, Tremolo, Reverb, and the Effect base class.
  ...effects,
  // The cache Sound loads through. Clear it to release decoded audio.
  bufferCache
}

window.Pluck = Pluck
