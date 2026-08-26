import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import Sound from '../src/core/Sound.js'
import Group from '../src/core/Group.js'
import Effect from '../src/core/effects/Effect.js'
import Filter, { LowPassFilter, HighPassFilter } from '../src/core/effects/Filter.js'
import Delay from '../src/core/effects/Delay.js'
import Distortion, { buildCurve } from '../src/core/effects/Distortion.js'
import Compressor from '../src/core/effects/Compressor.js'
import StereoPanner from '../src/core/effects/StereoPanner.js'
import Tremolo from '../src/core/effects/Tremolo.js'
import Reverb, { buildImpulse } from '../src/core/effects/Reverb.js'
import {
  MockAudioContext,
  captureConsole,
  hasEdge,
  pathExists,
  resetMocks
} from './mocks/MockAudioContext.js'

let context
let console_

beforeEach(() => {
  resetMocks()
  context = new MockAudioContext()
  console_ = captureConsole()
})

afterEach(() => console_.restore())

const bufferedSound = (options = {}) =>
  new Sound({ context, audioBuffer: { sampleRate: 44100 }, ...options })

describe('Effect base', () => {
  test('exposes an input and an output', () => {
    const effect = new Effect(context)

    expect(effect.input).toBeTruthy()
    expect(effect.output).toBeTruthy()
    expect(effect.input).not.toBe(effect.output)
  })

  test('splits into dry and wet paths', () => {
    const effect = new Effect(context)

    expect(hasEdge(effect.input, effect.dryGain)).toBe(true)
    expect(hasEdge(effect.dryGain, effect.output)).toBe(true)
    expect(hasEdge(effect.wetGain, effect.output)).toBe(true)
  })

  test('mix balances the two paths', () => {
    const effect = new Effect(context, { mix: 0.25 })

    expect(effect.mix).toBe(0.25)
    expect(effect.wetGain.gain.value).toBe(0.25)
    expect(effect.dryGain.gain.value).toBe(0.75)
  })

  test('mix clamps to 0..1', () => {
    const effect = new Effect(context)

    effect.mix = 5
    expect(effect.mix).toBe(1)
    effect.mix = -2
    expect(effect.mix).toBe(0)
  })

  test('route puts a subclass graph in the wet path', () => {
    const effect = new Effect(context)
    const node = context.createGain()
    effect.route(node, node)

    expect(hasEdge(effect.input, node)).toBe(true)
    expect(hasEdge(node, effect.wetGain)).toBe(true)
  })

  test('bypass goes fully dry and restores the previous mix', () => {
    const effect = new Effect(context, { mix: 0.4 })

    effect.bypassed = true
    expect(effect.bypassed).toBe(true)
    expect(effect.mix).toBe(0)

    effect.bypassed = false
    expect(effect.bypassed).toBe(false)
    expect(effect.mix).toBe(0.4)
  })

  test('bypassing twice does not lose the mix', () => {
    const effect = new Effect(context, { mix: 0.4 })

    effect.bypassed = true
    effect.bypassed = true
    effect.bypassed = false

    expect(effect.mix).toBe(0.4)
  })
})

describe('chaining onto a sound', () => {
  test('a sound starts with no effects', () => {
    expect(bufferedSound().effects).toEqual([])
  })

  test('adding an effect routes the gain node through it', async () => {
    const sound = bufferedSound()
    const filter = sound.addEffect(new Filter(context))

    expect(sound.effects).toEqual([filter])
    expect(hasEdge(sound.gainNode, filter.input)).toBe(true)
    expect(hasEdge(filter.output, context.destination)).toBe(true)
    expect(hasEdge(sound.gainNode, context.destination)).toBe(false)
  })

  test('audio still reaches the destination through the chain', async () => {
    const sound = bufferedSound()
    sound.addEffect(new Delay(context))
    await sound.play()

    expect(pathExists(sound.source, context.destination)).toBe(true)
  })

  test('effects chain in the order they were added', () => {
    const sound = bufferedSound()
    const first = sound.addEffect(new Filter(context))
    const second = sound.addEffect(new Delay(context))
    const third = sound.addEffect(new Reverb(context))

    expect(hasEdge(sound.gainNode, first.input)).toBe(true)
    expect(hasEdge(first.output, second.input)).toBe(true)
    expect(hasEdge(second.output, third.input)).toBe(true)
    expect(hasEdge(third.output, context.destination)).toBe(true)
  })

  test('an effect can be inserted at a position', () => {
    const sound = bufferedSound()
    const last = sound.addEffect(new Filter(context))
    const first = sound.addEffect(new Distortion(context), 0)

    expect(sound.effects).toEqual([first, last])
    expect(hasEdge(sound.gainNode, first.input)).toBe(true)
    expect(hasEdge(first.output, last.input)).toBe(true)
  })

  test('removing an effect closes the gap', () => {
    const sound = bufferedSound()
    const first = sound.addEffect(new Filter(context))
    const middle = sound.addEffect(new Delay(context))
    const last = sound.addEffect(new Reverb(context))

    expect(sound.removeEffect(middle)).toBe(true)

    expect(sound.effects).toEqual([first, last])
    expect(hasEdge(first.output, last.input)).toBe(true)
    expect(hasEdge(first.output, middle.input)).toBe(false)
    expect(hasEdge(middle.output, last.input)).toBe(false)
  })

  test('removing the only effect restores the direct connection', () => {
    const sound = bufferedSound()
    const filter = sound.addEffect(new Filter(context))
    sound.removeEffect(filter)

    expect(hasEdge(sound.gainNode, context.destination)).toBe(true)
    expect(hasEdge(sound.gainNode, filter.input)).toBe(false)
  })

  test('removing an effect that is not there warns', () => {
    const sound = bufferedSound()

    expect(sound.removeEffect(new Filter(context))).toBe(false)
    expect(console_.saw('warn', 'not on this sound')).toBe(true)
  })

  test('adding the same effect twice warns and does not duplicate it', () => {
    const sound = bufferedSound()
    const filter = new Filter(context)
    sound.addEffect(filter)
    sound.addEffect(filter)

    expect(sound.effects.length).toBe(1)
    expect(console_.saw('warn', 'already on this sound')).toBe(true)
  })

  test('clearEffects unwires everything', () => {
    const sound = bufferedSound()
    const filter = sound.addEffect(new Filter(context))
    sound.addEffect(new Delay(context))

    sound.clearEffects()

    expect(sound.effects).toEqual([])
    expect(hasEdge(sound.gainNode, context.destination)).toBe(true)
    expect(hasEdge(sound.gainNode, filter.input)).toBe(false)
  })

  test('the effects list cannot be mutated from outside', () => {
    const sound = bufferedSound()
    sound.addEffect(new Filter(context))

    sound.effects.push(new Delay(context))

    expect(sound.effects.length).toBe(1)
  })

  // Effects sit after the sound's gain node, so one instance serves every voice
  // and a delay tail is not cut when the voice that fed it retires.
  test('every voice feeds the one chain', async () => {
    const sound = bufferedSound({ polyphony: 3 })
    const filter = sound.addEffect(new Filter(context))
    await sound.play()
    await sound.play()

    expect(sound.voices.length).toBe(2)
    for (const voice of sound.voices) {
      expect(hasEdge(voice.gainNode, sound.gainNode)).toBe(true)
      expect(pathExists(voice.source, context.destination)).toBe(true)
    }
    expect(hasEdge(sound.gainNode, filter.input)).toBe(true)
  })

  test('the chain survives a change of output', () => {
    const sound = bufferedSound()
    const filter = sound.addEffect(new Filter(context))
    const bus = context.createGain()

    sound.output = bus

    expect(hasEdge(sound.gainNode, filter.input)).toBe(true)
    expect(hasEdge(filter.output, bus)).toBe(true)
    expect(hasEdge(filter.output, context.destination)).toBe(false)
  })
})

describe('connect', () => {
  // Regression: connect() used to attach to the source node, which is rebuilt
  // on every play, so the connection vanished the next time the sound played.
  test('a tap survives replaying the sound', async () => {
    const sound = bufferedSound()
    const analyser = context.createGain()
    sound.connect(analyser)

    await sound.play()
    sound.stop()
    await sound.play()

    expect(hasEdge(sound.outputNode, analyser)).toBe(true)
    expect(pathExists(sound.source, analyser)).toBe(true)
  })

  test('a tap survives adding an effect, moving to the chain tail', () => {
    const sound = bufferedSound()
    const analyser = context.createGain()
    sound.connect(analyser)

    const filter = sound.addEffect(new Filter(context))

    expect(hasEdge(filter.output, analyser)).toBe(true)
    expect(hasEdge(sound.gainNode, analyser)).toBe(false)
  })

  test('the sound still reaches its normal destination as well', () => {
    const sound = bufferedSound()
    const analyser = context.createGain()
    sound.connect(analyser)

    expect(hasEdge(sound.gainNode, analyser)).toBe(true)
    expect(hasEdge(sound.gainNode, context.destination)).toBe(true)
  })

  test('disconnect removes one tap', () => {
    const sound = bufferedSound()
    const analyser = context.createGain()
    sound.connect(analyser)

    sound.disconnect(analyser)

    expect(hasEdge(sound.outputNode, analyser)).toBe(false)
    expect(hasEdge(sound.gainNode, context.destination)).toBe(true)
  })

  test('disconnect with no argument removes every tap', () => {
    const sound = bufferedSound()
    const one = context.createGain()
    const two = context.createGain()
    sound.connect(one)
    sound.connect(two)

    sound.disconnect()

    expect(hasEdge(sound.outputNode, one)).toBe(false)
    expect(hasEdge(sound.outputNode, two)).toBe(false)
    expect(hasEdge(sound.gainNode, context.destination)).toBe(true)
  })
})

describe('group effects', () => {
  test('process every sound in the group at once', async () => {
    const group = new Group(context)
    const one = bufferedSound()
    const two = bufferedSound()
    await one.initialized
    await two.initialized
    group.addSounds([one, two])

    const reverb = group.addEffect(new Reverb(context))
    await group.play()

    expect(hasEdge(group.gainNode, reverb.input)).toBe(true)
    expect(hasEdge(reverb.output, context.destination)).toBe(true)
    expect(pathExists(one.source, reverb.input)).toBe(true)
    expect(pathExists(two.source, reverb.input)).toBe(true)
  })

  test('a sound keeps its own effects inside a group', async () => {
    const group = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    const filter = sound.addEffect(new Filter(context))
    group.addSounds([sound])

    const delay = group.addEffect(new Delay(context))
    await group.play()

    expect(hasEdge(sound.gainNode, filter.input)).toBe(true)
    expect(hasEdge(filter.output, group.gainNode)).toBe(true)
    expect(hasEdge(group.gainNode, delay.input)).toBe(true)
    expect(pathExists(sound.source, context.destination)).toBe(true)
  })

  test('a group emptied and refilled keeps its chain', async () => {
    const group = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    const reverb = group.addEffect(new Reverb(context))

    group.addSounds([sound])
    group.removeSound(sound)
    group.addSounds([sound])
    await group.play()

    expect(hasEdge(group.gainNode, reverb.input)).toBe(true)
    expect(pathExists(sound.source, context.destination)).toBe(true)
  })

  test('removing a group effect restores the direct connection', () => {
    const group = new Group(context)
    const reverb = group.addEffect(new Reverb(context))

    group.removeEffect(reverb)

    expect(hasEdge(group.gainNode, context.destination)).toBe(true)
  })
})

describe('Filter', () => {
  test('defaults to a lowpass at 1kHz', () => {
    const filter = new Filter(context)

    expect(filter.type).toBe('lowpass')
    expect(filter.frequency).toBe(1000)
    expect(filter.q).toBe(1)
  })

  test('takes its settings from options', () => {
    const filter = new Filter(context, { type: 'bandpass', frequency: 440, q: 8 })

    expect(filter.type).toBe('bandpass')
    expect(filter.frequency).toBe(440)
    expect(filter.q).toBe(8)
  })

  test('settings are live', () => {
    const filter = new Filter(context)
    filter.frequency = 220
    filter.q = 4
    filter.type = 'notch'

    expect(filter.filter.frequency.value).toBe(220)
    expect(filter.filter.Q.value).toBe(4)
    expect(filter.filter.type).toBe('notch')
  })

  test('the filter sits in the wet path', () => {
    const filter = new Filter(context)

    expect(hasEdge(filter.input, filter.filter)).toBe(true)
    expect(hasEdge(filter.filter, filter.wetGain)).toBe(true)
    expect(filter.mix).toBe(1)
  })

  test('the named variants set their type', () => {
    expect(new LowPassFilter(context).type).toBe('lowpass')
    expect(new HighPassFilter(context).type).toBe('highpass')
    expect(new HighPassFilter(context, { frequency: 80 }).frequency).toBe(80)
  })
})

describe('Delay', () => {
  test('defaults to a half-wet 300ms delay', () => {
    const delay = new Delay(context)

    expect(delay.time).toBe(0.3)
    expect(delay.feedback).toBe(0.4)
    expect(delay.mix).toBe(0.5)
  })

  test('feeds its output back into itself', () => {
    const delay = new Delay(context)

    expect(hasEdge(delay.delay, delay.feedbackGain)).toBe(true)
    expect(hasEdge(delay.feedbackGain, delay.delay)).toBe(true)
  })

  // Feedback at or above 1 never decays, which is a runaway rather than an echo.
  test('feedback is capped below unity', () => {
    expect(new Delay(context, { feedback: 2 }).feedback).toBe(0.95)

    const delay = new Delay(context)
    delay.feedback = 1.5
    expect(delay.feedback).toBe(0.95)
    delay.feedback = -1
    expect(delay.feedback).toBe(0)
  })

  test('delay time is capped to the maximum it was built for', () => {
    const delay = new Delay(context, { maxTime: 1, time: 10 })

    expect(delay.delay.maxDelayTime).toBe(1)
    expect(delay.time).toBe(1)
  })
})

describe('Distortion', () => {
  test('builds a shaping curve', () => {
    const distortion = new Distortion(context)

    expect(distortion.shaper.curve).toBeInstanceOf(Float32Array)
    expect(distortion.shaper.curve.length).toBe(2048)
    expect(distortion.amount).toBe(0.4)
  })

  test('rebuilds the curve when the amount changes', () => {
    const distortion = new Distortion(context)
    const before = distortion.shaper.curve

    distortion.amount = 0.9

    expect(distortion.shaper.curve).not.toBe(before)
    expect(distortion.amount).toBe(0.9)
  })

  test('amount clamps to 0..1', () => {
    const distortion = new Distortion(context)
    distortion.amount = 4
    expect(distortion.amount).toBe(1)
    distortion.amount = -1
    expect(distortion.amount).toBe(0)
  })

  test('the curve is odd-symmetric and rises through zero', () => {
    const curve = buildCurve(0.5)
    const middle = curve.length / 2

    expect(curve[0]).toBeLessThan(0)
    expect(curve[curve.length - 1]).toBeGreaterThan(0)
    expect(curve[middle]).toBeCloseTo(0, 6)
    // Mirrored either side of silence, so the waveform is not skewed.
    expect(curve[middle + 100]).toBeCloseTo(-curve[middle - 100], 6)
  })

  test('a higher amount shapes harder', () => {
    const gentle = buildCurve(0.1)
    const harsh = buildCurve(0.9)
    const quarter = Math.floor(gentle.length * 0.6)

    expect(harsh[quarter]).toBeGreaterThan(gentle[quarter])
  })
})

describe('Compressor', () => {
  test('has the usual defaults', () => {
    const compressor = new Compressor(context)

    expect(compressor.threshold).toBe(-24)
    expect(compressor.knee).toBe(30)
    expect(compressor.ratio).toBe(12)
    expect(compressor.attack).toBe(0.003)
    expect(compressor.release).toBe(0.25)
  })

  test('every parameter is settable', () => {
    const compressor = new Compressor(context, { threshold: -6, ratio: 4 })
    compressor.knee = 0
    compressor.attack = 0.01
    compressor.release = 0.5

    expect(compressor.threshold).toBe(-6)
    expect(compressor.ratio).toBe(4)
    expect(compressor.knee).toBe(0)
    expect(compressor.attack).toBe(0.01)
    expect(compressor.release).toBe(0.5)
  })
})

describe('StereoPanner', () => {
  test('defaults to centre', () => {
    expect(new StereoPanner(context).pan).toBe(0)
  })

  test('pans and clamps to -1..1', () => {
    const panner = new StereoPanner(context, { pan: -1 })
    expect(panner.pan).toBe(-1)

    panner.pan = 3
    expect(panner.pan).toBe(1)
    panner.pan = -3
    expect(panner.pan).toBe(-1)
  })
})

describe('Tremolo', () => {
  test('runs an LFO into the modulated gain', () => {
    const tremolo = new Tremolo(context, { speed: 8, depth: 0.4 })

    expect(tremolo.speed).toBe(8)
    expect(tremolo.depth).toBe(0.4)
    expect(hasEdge(tremolo.lfo, tremolo.depthGain)).toBe(true)
    expect(hasEdge(tremolo.depthGain, tremolo.tremoloGain.gain)).toBe(true)
  })

  test('starts its oscillator', () => {
    const tremolo = new Tremolo(context)

    expect(tremolo.lfo.startCalls.length).toBe(1)
  })

  // The modulated gain sits at 1 - depth so the LFO swing tops out at unity
  // rather than boosting above it.
  test('the modulated gain is offset by the depth', () => {
    const tremolo = new Tremolo(context, { depth: 0.3 })

    expect(tremolo.tremoloGain.gain.value).toBeCloseTo(0.7, 10)

    tremolo.depth = 0.5
    expect(tremolo.tremoloGain.gain.value).toBeCloseTo(0.5, 10)
  })

  test('depth clamps to 0..0.5', () => {
    expect(new Tremolo(context, { depth: 2 }).depth).toBe(0.5)
    expect(new Tremolo(context, { depth: -1 }).depth).toBe(0)
  })

  // The LFO runs regardless of playback, so disposing has to stop it.
  test('dispose stops the oscillator', () => {
    const tremolo = new Tremolo(context)
    tremolo.dispose()

    expect(tremolo.lfo.stopCalls.length).toBe(1)
  })
})

describe('Reverb', () => {
  test('generates an impulse response rather than loading one', () => {
    const reverb = new Reverb(context, { time: 1 })

    expect(reverb.convolver.buffer).toBeTruthy()
    expect(reverb.convolver.buffer.numberOfChannels).toBe(2)
    expect(reverb.convolver.buffer.length).toBe(context.sampleRate)
    expect(reverb.mix).toBe(0.5)
  })

  test('rebuilds the impulse when its shape changes', () => {
    const reverb = new Reverb(context, { time: 1 })
    const before = reverb.convolver.buffer

    reverb.time = 2

    expect(reverb.convolver.buffer).not.toBe(before)
    expect(reverb.convolver.buffer.length).toBe(context.sampleRate * 2)
  })

  test('the impulse decays', () => {
    const impulse = buildImpulse(context, 1, 2, false)
    const samples = impulse.getChannelData(0)

    const early = Math.max(...samples.slice(0, 1000).map(Math.abs))
    const late = Math.max(...samples.slice(samples.length - 1000).map(Math.abs))

    expect(early).toBeGreaterThan(late)
    expect(early).toBeLessThanOrEqual(1)
  })

  test('a reversed impulse swells instead', () => {
    const impulse = buildImpulse(context, 1, 2, true)
    const samples = impulse.getChannelData(0)

    const early = Math.max(...samples.slice(0, 1000).map(Math.abs))
    const late = Math.max(...samples.slice(samples.length - 1000).map(Math.abs))

    expect(late).toBeGreaterThan(early)
  })

  test('both channels are filled and differ', () => {
    const impulse = buildImpulse(context, 0.1, 2, false)

    expect(impulse.getChannelData(0).some(sample => sample !== 0)).toBe(true)
    expect(impulse.getChannelData(1).some(sample => sample !== 0)).toBe(true)
    expect(impulse.getChannelData(0)[10]).not.toBe(impulse.getChannelData(1)[10])
  })

  test('a very short time still produces a usable buffer', () => {
    const reverb = new Reverb(context)
    reverb.time = 0

    expect(reverb.time).toBe(0.01)
    expect(reverb.convolver.buffer.length).toBeGreaterThan(0)
  })
})

describe('rampTo', () => {
  const ramp = (param, from, to, seconds, time = 0) => [
    { type: 'cancelScheduledValues', time },
    { type: 'setValueAtTime', value: from, time },
    { type: 'linearRampToValueAtTime', value: to, time: time + seconds }
  ]

  test('mix ramps wet and dry together', () => {
    const effect = new Effect(context, { mix: 1 })
    effect.rampTo('mix', 0.25, 2)

    expect(effect.wetGain.gain.automation).toEqual(ramp(null, 1, 0.25, 2))
    expect(effect.dryGain.gain.automation).toEqual(ramp(null, 0, 0.75, 2))
  })

  test('mix clamps before ramping', () => {
    const effect = new Effect(context, { mix: 0.5 })
    effect.rampTo('mix', 4, 1)

    expect(effect.wetGain.gain.automation.at(-1).value).toBe(1)
  })

  test('a filter frequency sweeps', () => {
    const filter = new Filter(context, { frequency: 1000 })
    filter.rampTo('frequency', 400, 3)

    expect(filter.filter.frequency.automation).toEqual(ramp(null, 1000, 400, 3))
  })

  test('returns the effect so ramps can be chained', () => {
    const filter = new Filter(context)
    expect(filter.rampTo('frequency', 800, 1).rampTo('q', 8, 1)).toBe(filter)
  })

  test('a parameter that is not an AudioParam warns', () => {
    const distortion = new Distortion(context)
    distortion.rampTo('amount', 0.9, 1)

    expect(console_.saw('warn', "Cannot ramp 'amount'")).toBe(true)
  })

  test('an unknown name warns', () => {
    const filter = new Filter(context)
    filter.rampTo('colour', 1, 1)

    expect(console_.saw('warn', "Cannot ramp 'colour'")).toBe(true)
  })

  test('pan clamps to -1..1', () => {
    const panner = new StereoPanner(context)
    panner.rampTo('pan', 5, 1)

    expect(panner.panner.pan.automation.at(-1).value).toBe(1)
  })

  test('delay feedback clamps below unity', () => {
    const delay = new Delay(context)
    delay.rampTo('feedback', 2, 1)

    expect(delay.feedbackGain.gain.automation.at(-1).value).toBe(0.95)
  })

  test('tremolo depth ramps both the depth and the offset', () => {
    const tremolo = new Tremolo(context, { depth: 0.2 })
    tremolo.rampTo('depth', 0.5, 2)

    expect(tremolo.depthGain.gain.automation).toEqual(ramp(null, 0.2, 0.5, 2))
    expect(tremolo.tremoloGain.gain.automation).toEqual(ramp(null, 0.8, 0.5, 2))
  })

  test('compressor parameters are ramped by name', () => {
    const compressor = new Compressor(context)
    compressor.rampTo('threshold', -6, 0.5)

    expect(compressor.compressor.threshold.automation).toEqual(ramp(null, -24, -6, 0.5))
  })

  test('seconds of 0 snaps', () => {
    const filter = new Filter(context, { frequency: 1000 })
    filter.rampTo('frequency', 200, 0)

    expect(filter.filter.frequency.value).toBe(200)
    expect(filter.filter.frequency.automation).toEqual([
      { type: 'cancelScheduledValues', time: 0 },
      { type: 'setValueAtTime', value: 1000, time: 0 }
    ])
  })
})
