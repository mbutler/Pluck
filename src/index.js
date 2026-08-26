import Timeline from './core/Timeline.js'
import Sound from './core/Sound.js'
import Group from './core/Group.js'
import Voice from './core/Voice.js'
import Tempo from './core/Tempo.js'
import bufferCache, { BufferCache } from './core/BufferCache.js'

const Pluck = {
  Timeline,
  Sound,
  Group,
  Voice,
  Tempo,
  BufferCache,
  // The cache Sound loads through. Clear it to release decoded audio.
  bufferCache
}

window.Pluck = Pluck
