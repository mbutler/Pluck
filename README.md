# Pluck.js

A dependency-free Web Audio library for JavaScript, built for music rather than
for sound effects.

Pluck schedules against the audio clock rather than against timers, so notes
land where you put them; plays the same sound in overlapping voices, so a hi-hat
at 0.0 and 0.1 both sound; thinks in bars and beats as well as seconds; and
carries an effects chain you can put on a single sound or across a whole bus.

It started as a replacement for [Pizzicato.js](https://alemangui.github.io/pizzicato/),
which has no scheduler. The API is no longer a drop-in swap, but it covers the
same ground and adds the parts a sequencer needs.

- [Installing](#installing)
- [Quick start](#quick-start)
- [How it fits together](#how-it-fits-together)
- [Sound](#sound)
- [Polyphony](#polyphony)
- [Group](#group)
- [Timeline](#timeline)
- [Musical time](#musical-time)
- [Effects](#effects)
- [The buffer cache](#the-buffer-cache)
- [Events](#events)
- [Design notes](#design-notes)
- [Development](#development)

## Installing

```bash
bun add pluck
```

```js
import { Sound, Timeline, Group, Reverb } from 'pluck'
```

The package is ESM only. Web Audio does not exist outside a browser, so a
CommonJS build would have nowhere to run.

Importing has no side effects, so bundlers can tree-shake it and a
server-rendered app can import it at the top level. Web Audio is looked up on
`globalThis`, and only when audio is actually created — evaluating the module
where there is no `window` is safe, and constructing a `Sound` there throws
`Web Audio is not available in this environment` rather than a ReferenceError
about `window`.

For a plain script tag, use the bundled build, which sets `window.Pluck`:

```html
<script src="dist/pluck.js"></script>
<script>
  const sound = new Pluck.Sound({ file: 'snd.mp3' })
</script>
```

| Build | Format | For |
| --- | --- | --- |
| `dist/pluck.esm.js` | ESM | `import` from a bundler; what the package entry points at |
| `dist/pluck.js` | IIFE | a `<script>` tag; sets `window.Pluck` |
| `dist/pluck.min.js` | IIFE, minified | the same, for production |

## Quick start

```js
import { Timeline, Sound, Reverb } from 'pluck'

const timeline = new Timeline({ bpm: 120, beatsPerBar: 4 })

// Browsers require a user gesture before audio can start.
playButton.addEventListener('click', async () => {
  await timeline.start()

  const kick = new Sound({
    file: 'kick.mp3',
    context: timeline.context,   // share the timeline's context
    polyphony: 4                 // let hits overlap
  })
  await kick.initialized

  kick.addEffect(new Reverb(timeline.context, { time: 1.2, mix: 0.15 }))

  // Called ahead of each beat with the exact time to schedule for.
  timeline.everyBeat(1, time => kick.play(false, time))

  // Or place something at a bar and beat.
  timeline.scheduleBar(kick.clone(), 4, 2)
})
```

> **Share one AudioContext.** Pass `context: timeline.context` to every Sound
> you intend to schedule. Times from the timeline are positions on *its* audio
> clock, and a sound built on a different context measures against a different
> one. A `Group` enforces this; the `Timeline` does not.

## How it fits together

```
Sound ── voice ─┐
        voice ──┼─> sound.gainNode ─> sound effects ─┐
        voice ──┘        (volume)                     │
                                                      ├─> group.gainNode ─> group effects ─> destination
Sound ──────────> sound.gainNode ─> sound effects ────┘
```

- **Sound** is a source and its settings — a file, a waveform, or a microphone.
- **Voice** is one sounding instance of a Sound. Each has its own source node and
  its own gain node, which is what lets hits overlap with independent envelopes.
- **Group** is a bus. Sounds routed into it share its volume, mute, and effects.
- **Timeline** is the scheduler: a queue plus a clock.
- **Effect** is anything with an `input` node and an `output` node.

Volume lives on the Sound's gain node, downstream of every voice, so changing it
moves them all together. Effects sit downstream of that again, so one instance
serves every voice and a delay or reverb tail outlives the voice that fed it.

## Sound

```js
const sound = new Sound({ file: 'snare.mp3', volume: 0.8, polyphony: 3 })
await sound.initialized
await sound.play()
```

`initialized` is a promise that resolves once the source is ready. A file is
fetched and decoded; a waveform or microphone is set up. `play()` awaits it
internally, so awaiting it yourself is only necessary when you want to know the
sound is loaded before continuing.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `file` | — | URL to fetch and decode |
| `wave` | — | `{ type, frequency }` for an oscillator; type defaults to `'sine'`, frequency to `440` |
| `input` | — | `true` to open the microphone, or an existing `MediaStream` to reuse |
| `audioBuffer` | — | an already-decoded `AudioBuffer` |
| `context` | a new one | the `AudioContext` to use |
| `volume` | `1` | `0`–`1`; throws outside that range |
| `loop` | `false` | loop the buffer |
| `attack` | `0.04` | fade-in seconds, applied per voice |
| `release` | `0.04` | fade-out seconds used by `applyRelease` |
| `offset` | `0` | seconds into the buffer to start from |
| `polyphony` | `1` | how many instances may ring at once |
| `clearBuffer` | `false` | drop this sound's buffer reference when it stops |
| `cache` | `true` | share the decoded buffer through the buffer cache |
| `fileName` | from `file` | a label, when you supply the buffer yourself |

With no source at all, a Sound defaults to a 440 Hz sine.

### Methods

| Method | Notes |
| --- | --- |
| `play(fromGroup, when)` | `when` is an absolute time on the context clock; `0` or the past means now. Pass `false` for `fromGroup` when scheduling yourself: `sound.play(false, time)` |
| `stop()` | Cuts every voice, releases the microphone, fires `stop` then `ended` |
| `clone()` | A separate Sound sharing the decoded buffer and the context |
| `fadeVolumeTo(value, duration)` | Ramps the sound's gain |
| `applyAttack(startTime)` | Manual envelope on the sound's gain; per-voice attack is automatic |
| `applyRelease(callback, startTime)` | Ramps to silence, then calls back |
| `addEffect(effect, index)` | Appends, or inserts at `index`. Returns the effect |
| `removeEffect(effect)` / `clearEffects()` | |
| `connect(node)` / `disconnect(node)` | Send the output somewhere extra — an analyser, a recorder. Survives replaying and chain changes |

### Properties

`source`, `voices`, `outputNode`, `effects` and `isPlaying` are read-only;
`volume`, `loop`, `attack`, `release`, `offset`, `polyphony`, `output`,
`clearBuffer` and `audioBuffer` are settable. `source` is `null` until something
is playing, then reads as the most recent voice's source.

`clone()` picks one source in priority order — decoded buffer, then file, then
wave, then microphone stream — and carries every playback setting across. It
shares the buffer rather than copying it, and reuses a microphone stream rather
than prompting again.

## Polyphony

`polyphony` defaults to `1`, where replaying restarts the sound. Raise it and
hits overlap:

```js
const hat = new Sound({ file: 'hat.mp3', polyphony: 8 })
await hat.initialized

hat.play()          // 8 of these can ring at once
hat.play()
```

Each voice owns its source node and a gain node of its own, so a second hit gets
its own attack instead of restarting a shared one. The per-voice envelope runs
`0`–`1` and composes with `volume`, which lives downstream.

At the limit the oldest voice is cut to make room. Lowering `polyphony` while
sounds are ringing trims immediately. Replaying a monophonic sound does not fire
`ended`, because the sound never stopped sounding.

`sound.voices` lists what is currently ringing, oldest first.

## Group

```js
const group = new Group(context)
group.addSounds([kick, snare, hat])

group.volume = 0.7
group.addEffect(new Reverb(context, { time: 2 }))

await group.play()
await group.stop()
```

Every member must share the group's `AudioContext`; a mismatch is refused with
an error to the console. Adding a sound to a group re-points the tail of its
chain into the group, so per-sound volume and effects keep working. A grouped
sound refuses to be played directly — play the group.

`mute()` / `unmute()` remember the previous volume. `fadeVolumeTo(value,
duration)` ramps the bus. `removeSound(sound)` restores the sound's direct
routing and clears its grouped flag.

`isPlaying` is true while any member is sounding, and `ended` waits for the last
of them.

## Timeline

The timeline hands sounds to the audio clock ahead of time rather than starting
them when a timer fires. A scheduler tick wakes every `tickInterval` seconds and
schedules everything due within the next `lookahead` seconds, at its exact time.
The timer can be coarse and irregular without affecting playback accuracy.

```js
const timeline = new Timeline()
await timeline.start()

timeline.scheduleSound(sound, 10)          // at 10s on the audio clock
timeline.scheduleSound(other, timeline.future(4))
timeline.playNow(sound)

await timeline.addSound('snd.mp3', 15)     // loads, then schedules
await timeline.playSound('snd.mp3')        // loads and plays now
```

| Option | Default | Meaning |
| --- | --- | --- |
| `lookahead` | `2` | seconds of audio scheduled in advance |
| `tickInterval` | `0.25` | seconds between scheduler wake-ups |
| `maxLateness` | `1` | seconds overdue before a sound is dropped |
| `bpm` | `120` | tempo |
| `beatsPerBar` | `4` | time signature |

`lookahead` is deliberately larger than the one second browsers throttle
background timers to, so a hidden tab keeps playing on time.
(`requestAnimationFrame`, which this replaced, stops entirely in a hidden tab.)

If the scheduler is starved for longer than that anyway — a sleeping machine,
or unusually aggressive throttling — sounds more than `maxLateness` overdue are
dropped and reported through the `missed` event, rather than released all at
once as a burst.

`stop()` clears both queues, cancels sounds already handed to the audio clock,
stops the scheduler and intervals, and closes the context.

`currentTime` is a live, read-only view of the audio clock.

### Wall-clock intervals

`startInterval(seconds, callback)` and `stopInterval(seconds)` use `setInterval`
and drift against the audio clock. They are fine for UI. For anything musical,
use `everyBeat`.

## Musical time

Bars and beats are **zero-indexed**: bar 0 beat 0 is the downbeat.

```js
const timeline = new Timeline({ bpm: 140, beatsPerBar: 4 })
await timeline.start()

timeline.scheduleBeat(sound, 16)        // beat 16
timeline.scheduleBar(sound, 3, 2)       // bar 3, beat 2
timeline.scheduleBeat(sound, timeline.nextBar())   // start of the next bar

timeline.bpm = 90                       // moves everything still queued
```

| Member | Returns |
| --- | --- |
| `bpm`, `beatsPerBar` | settable; changing `bpm` re-anchors at the current position |
| `currentBeat`, `currentBar` | live position, fractional |
| `at(bar, beat)` | the beat number for a bar/beat position |
| `beatToTime(beat)` / `timeToBeat(time)` | position conversions |
| `beatsToSeconds(beats)` / `secondsToBeats(seconds)` | duration conversions |
| `nextBeat(count)` / `nextBar(count)` | the next boundary, always strictly ahead of now |
| `scheduleBeat`, `scheduleBar`, `rescheduleBeat` | queueing in beats |
| `everyBeat(beats, callback, startBeat)` | a repeating callback on the beat grid; returns an id |
| `stopEveryBeat(id)` | cancels one |
| `tempo` | the underlying `Tempo` |

### everyBeat

This is the sequencer primitive. The callback receives the **exact audio-clock
time** of the grid point and is called *ahead* of it, so it should schedule sound
at that time rather than play when it runs:

```js
timeline.everyBeat(0.25, (time, beat) => {
  if (beat % 1 === 0) kick.play(false, time)
  hat.play(false, time)
})
```

It follows tempo. A `bpm` change stretches subsequent grid points.

### Tempo changes

Tempo is held as an anchor — "at this time the transport was at this beat,
running at this bpm" — rather than a multiplication from zero. Changing it
re-anchors at the current position, so beats already played keep the times they
were played at, and only the future stretches.

Queued beats convert to seconds only when they come due, so a tempo change moves
everything still waiting. **Anything already inside the lookahead window is
committed** and keeps the time it was given, the same way a DAW cannot un-send
audio to the hardware. A change therefore lands cleanly from the next
uncommitted grid point, not instantly.

`Tempo` can also be used on its own; it is pure arithmetic and needs no audio
context.

## Effects

```js
import { LowPassFilter, Delay, Reverb } from 'pluck'

sound.addEffect(new LowPassFilter(context, { frequency: 800 }))
sound.addEffect(new Delay(context, { time: 0.25, feedback: 0.5 }))

group.addEffect(new Reverb(context, { time: 2, mix: 0.3 }))
```

Effects chain in the order added and take the context as their first argument.
Every effect has a `mix` (`0`–`1`, wet/dry) and a `bypassed` flag that passes the
signal through and restores the previous mix when cleared.

| Effect | Options | Defaults |
| --- | --- | --- |
| `Filter` | `type`, `frequency`, `q`, `gain`, `mix` | `'lowpass'`, `1000`, `1`, —, `1` |
| `LowPassFilter`, `HighPassFilter` | as `Filter`, with `type` fixed | |
| `Delay` | `time`, `feedback`, `maxTime`, `mix` | `0.3`, `0.4`, `5`, `0.5` |
| `Distortion` | `amount`, `oversample`, `mix` | `0.4`, `'4x'`, `1` |
| `Compressor` | `threshold`, `knee`, `ratio`, `attack`, `release` | `-24`, `30`, `12`, `0.003`, `0.25` |
| `StereoPanner` | `pan` | `0` (`-1` left, `1` right) |
| `Tremolo` | `speed`, `depth`, `wave` | `5`, `0.5`, `'sine'` |
| `Reverb` | `time`, `decay`, `reverse`, `mix` | `2`, `2`, `false`, `0.5` |

`Delay` caps feedback below `1`, since feedback at or above unity never decays.
`Tremolo` clamps depth to `0.5`, where the trough reaches silence, and runs an
oscillator that keeps going whether or not anything is playing — call
`dispose()` when you are done with it. `Reverb` generates its impulse response
from decaying noise rather than loading one, so no effect needs an asset.

### Writing your own

Anything with an `input` node and an `output` node can be added. Extending
`Effect` gives you the dry/wet split for free — build your nodes and call
`route(head, tail)` once:

```js
import { Effect } from 'pluck'

class Widener extends Effect {
  constructor(context, options = {}) {
    super(context, options)
    this.panner = context.createStereoPanner()
    this.panner.pan.value = options.pan ?? 0.5
    this.route(this.panner, this.panner)
  }
}
```

## The buffer cache

Loading the same file into several Sounds costs one fetch and one decode
between them, and holds one buffer rather than one each. In-flight loads are
shared too, so building a kit does not race into duplicate downloads.

```js
import { bufferCache } from 'pluck'

bufferCache.size          // how many buffers are held
bufferCache.has(url)
bufferCache.delete(url)   // drop one
bufferCache.clear()       // release everything
```

Pass `cache: false` to a Sound to bypass it. Note that `clearBuffer` drops only
*that sound's* reference — the cache still holds the buffer, which is the point.
Use `delete` or `clear` to actually free memory.

## Events

```js
sound.events.on('ended', s => console.log('finished'))
sound.events.off('ended', listener)
```

| Emitter | Event | Arguments |
| --- | --- | --- |
| `Sound` | `play` | `(sound)` — a voice started |
| | `stop` | `(sound)` — `stop()` was called |
| | `ended` | `(sound)` — no longer sounding |
| `Group` | `play`, `stop`, `ended` | `(group)` — once for the group, not per member |
| `Timeline` | `start`, `stop` | — |
| | `loop` | — once per scheduler tick |
| | `scheduled` | `(sound, time, beat)` — `beat` only when scheduled in beats |
| | `play` | `(sound, when, beat)` |
| | `missed` | `(sound, time, beat)` — dropped for being too late |

`stop` always precedes `ended`. `ended` fires once per silence, not once per
voice or per member: three voices ringing produce one `ended` when the last
finishes. Listeners run with the sound already settled — `isPlaying` false,
`source` null, no voices, buffer cleared if `clearBuffer` was set.

`Events` also accepts an `effect` name that nothing currently fires.

## Design notes

The decisions that are not obvious from the API.

**Scheduling is lookahead, not polling.** `tick()` does not start sounds; it
hands them to `source.start(when)` with an absolute time up to `lookahead`
seconds out. Timer jitter therefore does not reach the audio. Measured in
Chrome, a grid at 120 bpm fires at 0.5000 s intervals with a worst-case error
around 1e-16.

**Committed audio cannot move.** Anything already inside the lookahead window
has been given to the hardware. Tempo changes and `stop()` handle this — `stop()`
tracks scheduled sounds separately from the queue so it can cancel them — but it
is why a tempo change is not instantaneous.

**The voice envelope runs 0–1.** Volume lives on the Sound's gain node,
downstream. Ramping the voice to `volume` while `volume` also sat downstream
would square it.

**Effects sit after the gain node, not inside voices.** One instance serves every
voice, and a delay or reverb tail is not cut when the voice that fed it retires.

**The chain rebuilds from scratch on every change.** Slightly more work per edit
than splicing, but it cannot leave a stale edge behind — and stale edges in an
audio graph are silent, unpredictable bugs.

**Source nodes are single-use.** Nothing is built until `play()`, and each play
builds a fresh node. This is why `sound.source` is `null` before playback.

## Development

```bash
bun install
bun test          # 299 tests
bun run build     # all three bundles
bun run start     # rebuild the script bundle on change
bun run document  # JSDoc into docs/
```

```
src/
  index.js            exports only, no side effects
  global.js           sets window.Pluck; the script-tag entry
  core/
    Sound.js  Voice.js  Group.js
    Timeline.js  Tempo.js  PriorityQueue.js
    BufferCache.js  Events.js  chain.js  audioContext.js
    effects/          Effect.js and the built-in effects
test/
  mocks/MockAudioContext.js
  *.test.js
dist/                 built bundles, plus demo pages and their audio
```

### Testing

Tests run against a mock Web Audio implementation, so they need no browser and
finish in well under a second. The mock records every `connect()` so tests can
assert on the shape of the audio graph, and it reproduces the spec behaviours
the library has to respect: a source node can only be started once, `stop()`
before `start()` is an error, connecting the same pair twice is a no-op, and
`AudioParam.value` reflects the last set value rather than a ramp in progress.

The tests are only as truthful as the mock. If one of its assumptions is wrong,
the suite will agree with itself and still disagree with a browser — so the demo
pages in `dist/` remain the manual check against the real API, and the effects
are separately verified by rendering through an `OfflineAudioContext` and
measuring the samples.

## License

None yet. Add a `LICENSE` file before publishing.
