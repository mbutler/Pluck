import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import Group from '../src/core/Group.js'
import Sound from '../src/core/Sound.js'
import Compressor from '../src/core/effects/Compressor.js'
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

describe('construction', () => {
  test('exposes the context and an empty sound list', () => {
    const group = new Group(context)

    expect(group.context).toBe(context)
    expect(group.sounds).toEqual([])
  })

  test('connects its gain node to the destination', () => {
    const group = new Group(context)

    expect(hasEdge(group.gainNode, context.destination)).toBe(true)
  })

  // Regression: `!context instanceof AudioContext` parsed as
  // `(!context) instanceof AudioContext`, which is always false, so a Group was
  // built with nothing in the WeakMap and every getter threw later.
  test('rejects a missing or bogus context', () => {
    expect(() => new Group(null)).toThrow('No audio context provided to Group')
    expect(() => new Group(undefined)).toThrow('No audio context provided to Group')
    expect(() => new Group({ notAContext: true })).toThrow('No audio context provided to Group')
  })
})

describe('addSounds', () => {
  test('adds sounds and marks them grouped', async () => {
    const group = new Group(context)
    const one = bufferedSound()
    const two = bufferedSound()
    await one.initialized
    await two.initialized

    group.addSounds([one, two])

    expect(group.sounds.length).toBe(2)
    expect(one.isGrouped).toBe(true)
    expect(two.isGrouped).toBe(true)
  })

  // Regression: addSounds rewired the raw source node to the group, cutting the
  // sound's own gain node out of the chain and losing its volume and envelope.
  test('routes each sound through its own gain node into the group', async () => {
    const group = new Group(context)
    const sound = bufferedSound({ volume: 0.5 })
    await sound.initialized
    group.addSounds([sound])
    await group.play()
    const [voice] = sound.voices

    expect(hasEdge(sound.source, voice.gainNode)).toBe(true)
    expect(hasEdge(voice.gainNode, sound.gainNode)).toBe(true)
    expect(hasEdge(sound.gainNode, group.gainNode)).toBe(true)
    expect(hasEdge(group.gainNode, context.destination)).toBe(true)

    expect(hasEdge(sound.source, group.gainNode)).toBe(false)
    expect(hasEdge(sound.gainNode, context.destination)).toBe(false)
  })

  test('keeps per-sound volume working inside a group', async () => {
    const group = new Group(context)
    const sound = bufferedSound({ volume: 0.5 })
    await sound.initialized
    group.addSounds([sound])

    expect(sound.gainNode.gain.value).toBe(0.5)
    sound.volume = 0.25
    expect(sound.gainNode.gain.value).toBe(0.25)
  })

  test('rejects a non-array', () => {
    const group = new Group(context)
    group.addSounds(bufferedSound())

    expect(console_.saw('error', 'Not an array of sounds')).toBe(true)
    expect(group.sounds.length).toBe(0)
  })

  test('rejects things that are not Sounds', () => {
    const group = new Group(context)
    group.addSounds([{ pretending: true }])

    expect(console_.saw('error', 'not an instance of Sound')).toBe(true)
    expect(group.sounds.length).toBe(0)
  })

  test('rejects a sound from a different context', async () => {
    const group = new Group(context)
    const foreign = new Sound({ context: new MockAudioContext(), audioBuffer: {} })
    await foreign.initialized
    group.addSounds([foreign])

    expect(console_.saw('error', 'mismatched audio contexts')).toBe(true)
    expect(group.sounds.length).toBe(0)
  })
})

describe('play', () => {
  test('plays every sound in the group', async () => {
    const group = new Group(context)
    const one = bufferedSound()
    const two = bufferedSound()
    await one.initialized
    await two.initialized
    group.addSounds([one, two])

    await group.play()

    expect(one.isPlaying).toBe(true)
    expect(two.isPlaying).toBe(true)
    expect(console_.messages.error).toEqual([])
  })

  // Regression: the whole point of this round of fixes. A grouped sound reused
  // its source node, so the second play() found nothing to start.
  test('can be played, stopped and played again', async () => {
    const group = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    group.addSounds([sound])

    for (let round = 0; round < 3; round++) {
      await group.play()
      expect(sound.isPlaying).toBe(true)
      expect(pathExists(sound.source, context.destination)).toBe(true)
      await group.stop()
      expect(sound.isPlaying).toBe(false)
    }

    expect(console_.messages.error).toEqual([])
  })

  test('a grouped sound refuses to be played directly', async () => {
    const group = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    group.addSounds([sound])

    await sound.play()

    expect(console_.saw('warn', 'It is in a group')).toBe(true)
    expect(sound.isPlaying).toBe(false)
  })

  test('skips sounds that are already playing', async () => {
    const group = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    group.addSounds([sound])

    await group.play()
    const source = sound.source
    await group.play()

    expect(sound.source).toBe(source)
  })
})

describe('removeSound', () => {
  // Regression: isGrouped stayed true, so a removed sound could never be played
  // again — play() kept refusing it as still grouped.
  test('clears the grouped flag and restores direct routing', async () => {
    const group = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    group.addSounds([sound])

    group.removeSound(sound)

    expect(sound.isGrouped).toBe(false)
    expect(group.sounds.length).toBe(0)
    expect(hasEdge(sound.gainNode, context.destination)).toBe(true)
    expect(hasEdge(sound.gainNode, group.gainNode)).toBe(false)
  })

  test('a removed sound plays on its own again', async () => {
    const group = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    group.addSounds([sound])
    group.removeSound(sound)

    await sound.play()

    expect(sound.isPlaying).toBe(true)
    expect(pathExists(sound.source, context.destination)).toBe(true)
    expect(console_.messages.warn).toEqual([])
  })

  test('warns about a sound that is not in the group', async () => {
    const group = new Group(context)
    const stranger = bufferedSound()
    await stranger.initialized

    group.removeSound(stranger)

    expect(console_.saw('warn', 'not in the group')).toBe(true)
  })

  // Regression: emptying a group disconnects its gain node, so reusing the
  // group afterwards produced silence.
  test('a group emptied and refilled is still audible', async () => {
    const group = new Group(context)
    const sound = bufferedSound()
    await sound.initialized

    group.addSounds([sound])
    group.removeSound(sound)
    expect(group.sounds.length).toBe(0)

    group.addSounds([sound])
    await group.play()

    expect(pathExists(sound.source, context.destination)).toBe(true)
  })
})

describe('volume', () => {
  test('reads and writes the group gain', () => {
    const group = new Group(context)
    group.volume = 0.4

    expect(group.volume).toBe(0.4)
    expect(group.gainNode.gain.value).toBe(0.4)
  })

  test('mute and unmute restore the previous volume', () => {
    const group = new Group(context)
    group.volume = 0.7

    group.mute()
    expect(group.volume).toBe(0)
    expect(group.muted).toBe(true)

    group.unmute()
    expect(group.volume).toBe(0.7)
    expect(group.muted).toBe(false)
  })

  test('mute is idempotent', () => {
    const group = new Group(context)
    group.volume = 0.7
    group.mute()
    group.mute()
    group.unmute()

    expect(group.volume).toBe(0.7)
  })

  // Regression: fadeVolumeTo referenced a bare `gainNode` rather than
  // `this.gainNode`, so it threw a ReferenceError every time.
  test('fadeVolumeTo schedules a ramp instead of throwing', () => {
    const group = new Group(context)
    group.volume = 0.2

    expect(() => group.fadeVolumeTo(0.8, 2)).not.toThrow()
    expect(group.gainNode.gain.automation).toEqual([
      { type: 'setValueAtTime', value: 0.2, time: 0 },
      { type: 'linearRampToValueAtTime', value: 0.8, time: 2 }
    ])
  })
})

describe('stop', () => {
  test('stops every playing sound', async () => {
    const group = new Group(context)
    const one = bufferedSound()
    const two = bufferedSound()
    await one.initialized
    await two.initialized
    group.addSounds([one, two])
    await group.play()

    await group.stop()

    expect(one.isPlaying).toBe(false)
    expect(two.isPlaying).toBe(false)
  })

  test('is safe on a group that never played', async () => {
    const group = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    group.addSounds([sound])

    expect(async () => await group.stop()).not.toThrow()
  })
})

describe('events', () => {
  const readySound = async (options = {}) => {
    const sound = bufferedSound(options)
    await sound.initialized
    return sound
  }

  test('a group has its own event surface', () => {
    const group = new Group(context)

    expect(group.events).toBeTruthy()
    expect(typeof group.events.on).toBe('function')
  })

  test('play fires once for the group, not once per sound', async () => {
    const group = new Group(context)
    group.addSounds([await readySound(), await readySound()])
    let played = 0
    group.events.on('play', () => played++)

    await group.play()

    expect(played).toBe(1)
  })

  test('the play event carries the group', async () => {
    const group = new Group(context)
    group.addSounds([await readySound()])
    const seen = []
    group.events.on('play', g => seen.push(g))

    await group.play()

    expect(seen).toEqual([group])
  })

  test('isPlaying reflects its members', async () => {
    const group = new Group(context)
    const sound = await readySound()
    group.addSounds([sound])

    expect(group.isPlaying).toBe(false)
    await group.play()
    expect(group.isPlaying).toBe(true)
    await group.stop()
    expect(group.isPlaying).toBe(false)
  })

  // The group has not ended while any member is still sounding.
  test('ended waits for the last sound', async () => {
    const group = new Group(context)
    const one = await readySound()
    const two = await readySound()
    group.addSounds([one, two])
    let ended = 0
    group.events.on('ended', () => ended++)

    await group.play()

    one.source.onended()
    expect(ended).toBe(0)

    two.source.onended()
    expect(ended).toBe(1)
  })

  test('ended fires once even with several sounds ending together', async () => {
    const group = new Group(context)
    const sounds = [await readySound(), await readySound(), await readySound()]
    group.addSounds(sounds)
    let ended = 0
    group.events.on('ended', () => ended++)

    await group.play()
    await group.stop()

    expect(ended).toBe(1)
  })

  test('stop fires before ended', async () => {
    const group = new Group(context)
    group.addSounds([await readySound()])
    const seen = []
    group.events.on('stop', () => seen.push('stop'))
    group.events.on('ended', () => seen.push('ended'))

    await group.play()
    await group.stop()

    expect(seen).toEqual(['stop', 'ended'])
  })

  test('stopping an idle group fires stop but not ended', async () => {
    const group = new Group(context)
    group.addSounds([await readySound()])
    const seen = []
    group.events.on('stop', () => seen.push('stop'))
    group.events.on('ended', () => seen.push('ended'))

    await group.stop()

    expect(seen).toEqual(['stop'])
  })

  test('a polyphonic member ending one voice does not end the group', async () => {
    const group = new Group(context)
    const sound = await readySound({ polyphony: 3 })
    group.addSounds([sound])
    let ended = 0
    group.events.on('ended', () => ended++)

    await group.play()
    await sound.play({ fromGroup: true })
    const voices = sound.voices

    voices[0].source.onended()
    expect(ended).toBe(0)

    voices[1].source.onended()
    expect(ended).toBe(1)
  })

  test('the group can run again after ending', async () => {
    const group = new Group(context)
    const sound = await readySound()
    group.addSounds([sound])
    let ended = 0
    group.events.on('ended', () => ended++)

    await group.play()
    await group.stop()
    await group.play()
    await group.stop()

    expect(ended).toBe(2)
  })

  // Membership changing is not the group ending, so removal stays quiet. It
  // must also detach the listener, or a removed sound would keep reporting in.
  test('removing a sound detaches its listener', async () => {
    const group = new Group(context)
    const sound = await readySound()
    group.addSounds([sound])
    let ended = 0
    group.events.on('ended', () => ended++)

    await group.play()
    group.removeSound(sound)
    expect(ended).toBe(0)

    await sound.play()
    sound.stop()

    expect(ended).toBe(0)
  })

  test('re-adding a sound attaches the listener once', async () => {
    const group = new Group(context)
    const sound = await readySound()
    group.addSounds([sound])
    group.removeSound(sound)
    group.addSounds([sound])
    let ended = 0
    group.events.on('ended', () => ended++)

    await group.play()
    await group.stop()

    expect(ended).toBe(1)
  })

  test('a rejected sound is not watched', async () => {
    const group = new Group(context)
    const foreign = new Sound({ context: new MockAudioContext(), audioBuffer: {} })
    await foreign.initialized

    group.addSounds([foreign])

    expect(group.sounds.length).toBe(0)
    expect(() => { foreign.stop() }).not.toThrow()
  })
})

describe('fading a group', () => {
  test('forwards the fade to every member', async () => {
    const group = new Group(context)
    const one = bufferedSound({ volume: 0.5 })
    const two = bufferedSound({ volume: 0.5 })
    await one.initialized
    await two.initialized
    group.addSounds([one, two])
    await group.play()

    const stopping = group.stop({ fade: 0.05 })
    expect(one.isPlaying).toBe(true)
    expect(two.isPlaying).toBe(true)

    await stopping
    expect(one.isPlaying).toBe(false)
    expect(two.isPlaying).toBe(false)
  })

  test('the group ends once the fade completes', async () => {
    const group = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    group.addSounds([sound])
    const seen = []
    group.events.on('ended', () => seen.push('ended'))

    await group.play()
    const stopping = group.stop({ fade: 0.05 })
    expect(seen).toEqual([])

    await stopping
    expect(seen).toEqual(['ended'])
  })
})

describe('nesting', () => {
  test('a nested group feeds the parent rather than the destination', async () => {
    const master = new Group(context)
    const pads = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    pads.addSounds([sound])
    master.addGroups([pads])

    await pads.play()

    expect(hasEdge(pads.gainNode, master.gainNode)).toBe(true)
    expect(hasEdge(pads.gainNode, context.destination)).toBe(false)
    expect(hasEdge(master.gainNode, context.destination)).toBe(true)
    expect(pathExists(sound.source, context.destination)).toBe(true)
  })

  test('a nested group can still be played on its own', async () => {
    const master = new Group(context)
    const pads = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    pads.addSounds([sound])
    master.addGroups([pads])

    await pads.play()

    expect(sound.isPlaying).toBe(true)
    expect(pads.isPlaying).toBe(true)
    expect(master.isPlaying).toBe(true)
  })

  test('playing the parent plays nested groups', async () => {
    const master = new Group(context)
    const pads = new Group(context)
    const drums = new Group(context)
    const pad = bufferedSound()
    const drum = bufferedSound()
    await pad.initialized
    await drum.initialized
    pads.addSounds([pad])
    drums.addSounds([drum])
    master.addGroups([pads, drums])

    await master.play()

    expect(pad.isPlaying).toBe(true)
    expect(drum.isPlaying).toBe(true)
  })

  test('stopping the parent stops nested groups', async () => {
    const master = new Group(context)
    const pads = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    pads.addSounds([sound])
    master.addGroups([pads])
    await master.play()

    await master.stop()

    expect(sound.isPlaying).toBe(false)
    expect(pads.isPlaying).toBe(false)
    expect(master.isPlaying).toBe(false)
  })

  test('a parent effect processes every nested section', async () => {
    const master = new Group(context)
    const pads = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    pads.addSounds([sound])
    master.addGroups([pads])
    const compressor = master.addEffect(new Compressor(context))
    await pads.play()

    expect(hasEdge(master.gainNode, compressor.input)).toBe(true)
    expect(hasEdge(compressor.output, context.destination)).toBe(true)
    expect(pathExists(sound.source, compressor.input)).toBe(true)
  })

  test('removing a nested group restores its direct routing', async () => {
    const master = new Group(context)
    const pads = new Group(context)
    const sound = bufferedSound()
    await sound.initialized
    pads.addSounds([sound])
    master.addGroups([pads])
    master.removeGroup(pads)

    expect(master.groups).toEqual([])
    expect(hasEdge(pads.gainNode, context.destination)).toBe(true)
    expect(hasEdge(pads.gainNode, master.gainNode)).toBe(false)

    await pads.play()
    expect(pathExists(sound.source, context.destination)).toBe(true)
  })

  test('output can be pointed at another group without addGroups', () => {
    const master = new Group(context)
    const pads = new Group(context)

    pads.output = master

    expect(hasEdge(pads.gainNode, master.gainNode)).toBe(true)
    expect(hasEdge(pads.gainNode, context.destination)).toBe(false)
  })

  test('refuses a cycle', () => {
    const master = new Group(context)
    const pads = new Group(context)
    master.addGroups([pads])
    pads.addGroups([master])

    expect(console_.saw('error', 'that would create a cycle')).toBe(true)
    expect(pads.groups).toEqual([])
  })

  test('refuses to add a group to itself', () => {
    const group = new Group(context)
    group.addGroups([group])

    expect(console_.saw('error', 'Cannot add a group to itself')).toBe(true)
    expect(group.groups).toEqual([])
  })

  test('moving a group re-parents it', () => {
    const one = new Group(context)
    const two = new Group(context)
    const pads = new Group(context)
    one.addGroups([pads])
    two.addGroups([pads])

    expect(one.groups).toEqual([])
    expect(two.groups).toEqual([pads])
    expect(hasEdge(pads.gainNode, two.gainNode)).toBe(true)
    expect(hasEdge(pads.gainNode, one.gainNode)).toBe(false)
  })

  test('the groups list cannot be mutated from outside', () => {
    const master = new Group(context)
    const pads = new Group(context)
    master.addGroups([pads])

    master.groups.push(new Group(context))

    expect(master.groups.length).toBe(1)
  })

  test('parent ended waits for the last nested group', async () => {
    const master = new Group(context)
    const pads = new Group(context)
    const drums = new Group(context)
    const pad = bufferedSound()
    const drum = bufferedSound()
    await pad.initialized
    await drum.initialized
    pads.addSounds([pad])
    drums.addSounds([drum])
    master.addGroups([pads, drums])
    let ended = 0
    master.events.on('ended', () => ended++)

    await master.play()
    pad.source.onended()
    expect(ended).toBe(0)

    drum.source.onended()
    expect(ended).toBe(1)
  })
})
