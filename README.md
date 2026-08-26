# Pluck.js

Pluck.js is a modern, lightweight, and efficient JavaScript sound library designed to be a drop-in replacement for Pizzicato.js. This library utilizes modern JavaScript standards (ES8+) and browser Web Audio APIs to create, play, and manage audio with a focus on memory efficiency.

## Installing

```bash
bun add pluck
```

```js
import { Sound, Timeline, Group, Reverb } from 'pluck'
```

The package is ESM only. Web Audio does not exist outside a browser, so there
is nowhere for a CommonJS build to run.

Importing the library has no side effects, so a bundler can tree-shake it and a
server-rendered app can import it at the top level. Web Audio is looked up on
`globalThis` and only when audio is actually created, so evaluating the module
where there is no `window` is safe; constructing a `Sound` there throws
`Web Audio is not available in this environment` rather than a ReferenceError.

For a plain `<script>` tag, use the bundled build, which attaches everything to
`window.Pluck`:

```html
<script src="dist/pluck.js"></script>
<script>
  const sound = new Pluck.Sound({ file: 'snd.mp3' })
</script>
```

### Builds

| File | Format | For |
| --- | --- | --- |
| `dist/pluck.esm.js` | ESM | `import` from a bundler; what the package entry points at |
| `dist/pluck.js` | IIFE | a `<script>` tag; sets `window.Pluck` |
| `dist/pluck.min.js` | IIFE, minified | the same, for production |

Build them all with `bun run build`, or `bun run start` to rebuild the script
bundle on change while working on the demos in `dist/`.

## Project Priorities

1. **Highly Efficient Memory Management**
   - Pluck.js is designed to handle the creation, playback, and stopping of multiple audio sources simultaneously without memory leaks, ensuring minimal memory usage.

2. **Drop-In Replacement for Pizzicato.js**
   - The API is designed to be nearly identical to Pizzicato.js, allowing for easy migration. Some changes are made where necessary to leverage modern JavaScript features.

3. **Extensible**
   - Pluck.js is built with extensibility in mind, allowing for easy addition of plugins and effects through a modular plugin system.

4. **No Dependencies**
   - The library is written in pure ES8+ JavaScript, with no dependencies on external libraries, ensuring it remains lightweight and fast.

## Project Structure
## Project Structure

- pluck/
  - dist/ (Compiled code)
  - docs/ (JSDocs documentation)
  - src/ (Source code)
    - core/ (Core classes and utilities)
      - Sound.js
      - Group.js
      - effects/
      - Util.js
    - index.js (Entry point)
  - test/ (Tests)
    - mocks/ (Mock classes for testing)
      - MockAudioContext.js
    - Sound.test.js
    - Voice.test.js
    - Group.test.js
    - Timeline.test.js
    - Tempo.test.js
    - Effects.test.js
    - packaging.test.js
    - BufferCache.test.js
    - PriorityQueue.test.js
    - Events.test.js
  - index.html (Sample HTML file for testing in the browser)
  - README.md (Project documentation)



## Current Progress

### Core Classes

- **Sound.js**
  - Handles the creation, playback, and stopping of audio.
  - Manages volume, loop, attack, and release properties.
  - Supports various audio sources including files, waves, inputs, and functions.
  - Uses `WeakMap` for efficient memory management.
  - Includes methods for cloning and managing audio playback.
  - `polyphony` (default 1) sets how many instances may ring at once. At 1 a
    replay restarts the sound; higher values let hits overlap, and once the
    limit is reached the oldest voice is cut to make room.

- **Events.js**
  - A small pub/sub. A Sound fires `play` when a voice starts, `stop` when
    `stop()` is called, and `ended` when it stops sounding — whether that is a
    natural finish, a `stop()`, or the last voice being cut. `stop` always
    precedes `ended`.
  - `ended` fires once per silence, not once per voice: a polyphonic sound with
    three voices ringing announces one `ended` when the last of them finishes.
    Replaying a monophonic sound does not fire it, because the sound never
    stopped sounding.
  - Listeners run with the sound already settled: `isPlaying` false, `source`
    null, no voices, and the buffer cleared if `clearBuffer` was set.

- **Voice.js**
  - One sounding instance of a Sound: its own source node and its own gain node,
    wired `source -> voice.gain -> sound.gain -> output`. The private gain node
    is what makes overlap work — the envelope is per-voice, so a second hit does
    not restart the first one's attack. Volume lives on the Sound's gain node,
    downstream of every voice, so it moves them together.

- **BufferCache.js**
  - One decoded `AudioBuffer` per URL, shared across Sounds, so loading the same
    file into several Sounds costs one fetch and one decode rather than one of
    each. In-flight loads are shared too. Pass `cache: false` to a Sound to opt
    out; `Pluck.bufferCache.clear()` releases everything.
  - Note that `clearBuffer` drops only that Sound's reference — the cache still
    holds the buffer, which is the point. Use the cache's own `delete(url)` or
    `clear()` to actually free memory.

- **Group.js**
  - Manages groups of sounds, allowing for collective playback and manipulation.
  - Fires the same `play` / `stop` / `ended` events a Sound does, once for the
    group rather than once per member. `isPlaying` is true while any member is
    sounding, and `ended` waits for the last of them — a short sound finishing
    while a longer one still rings does not end the group.
  - The group listens to its members' `ended` events to work that out, and
    detaches the listener when a sound is removed. Removing a sound is a change
    of membership rather than the group ending, so it fires nothing.

- **Timeline.js**
  - Schedules sounds against the audio clock using lookahead. A timer wakes the
    scheduler every `tickInterval` seconds and hands every sound due within the
    next `lookahead` seconds to the hardware with its exact start time, so
    playback accuracy does not depend on when the timer happens to fire.
  - `lookahead` defaults to 2 seconds, comfortably more than the one second that
    browsers throttle background timers to, so a hidden tab keeps playing on
    time. (`requestAnimationFrame`, which this replaced, stops entirely in a
    hidden tab.)
  - If the scheduler is starved for longer than that anyway — a sleeping machine,
    or unusually aggressive throttling — sounds more than `maxLateness` seconds
    overdue are dropped and reported through the `missed` event, rather than
    released as one burst.
  - All three are settable: `new Timeline({ lookahead, tickInterval, maxLateness })`.
  - Musical scheduling sits on top: `scheduleBeat(sound, beat)` and
    `scheduleBar(sound, bar, beat)` queue in beats rather than seconds, and
    `everyBeat(beats, callback)` runs a callback on the beat grid. Beats convert
    to seconds only when they come due, so a tempo change moves everything still
    queued; anything already inside the lookahead window is committed and keeps
    the time it was given.
  - `everyBeat` is what a sequencer should use in place of `startInterval`. The
    callback receives the exact audio-clock time of the grid point and is called
    *ahead* of it, so it can schedule sound at that time rather than playing
    when it happens to run. `startInterval` counts wall-clock milliseconds and
    drifts against the audio clock; it is fine for UI, not for music.

- **Tempo.js**
  - Maps musical position to audio-clock time. The mapping is an anchor — "at
    `time` the transport was at `beat`, running at `bpm`" — rather than a
    multiplication from zero, which is what makes tempo changes work: changing
    tempo re-anchors at the current position, so beats already played keep the
    times they were played at and only the future stretches.
  - Bars and beats are zero-indexed: bar 0 beat 0 is the downbeat.
  - `new Timeline({ bpm: 140, beatsPerBar: 4 })`, then `timeline.bpm = 90` to
    change it. `currentBeat`, `currentBar`, `at(bar, beat)`, `nextBeat()` and
    `nextBar()` cover the usual position arithmetic.

- **effects/**
  - `Effect.js` is the base class and the contract anything pluggable meets: an
    `input` node to connect into and an `output` node to connect from. It builds
    the dry/wet split, so a subclass creates its own nodes and calls
    `route(head, tail)` once to drop them into the wet path.
  - Built in: `Filter` (plus `LowPassFilter` / `HighPassFilter`), `Delay`,
    `Distortion`, `Compressor`, `StereoPanner`, `Tremolo`, `Reverb`. All are
    built from native Web Audio nodes, and `Reverb` generates its impulse
    response rather than loading one, so no effect needs an asset.
  - Effects attach with `sound.addEffect(effect)` / `removeEffect` /
    `clearEffects`, and chain in the order added. They sit *after* the sound's
    gain node, so there is one instance per sound rather than per voice and a
    delay or reverb tail outlives the voice that fed it.
  - `group.addEffect(effect)` does the same for a whole group — one reverb for
    the kit rather than one per drum. A sound keeps its own effects inside a
    group; the two chains compose.
  - `sound.connect(node)` sends the sound's output somewhere additional (an
    analyser, a recorder, a send bus). The connection is re-established whenever
    the chain is rebuilt, so it survives adding effects and replaying.

- **Util.js**
  - Utility functions for common tasks such as type checking and range validation.

### Testing

Run the suite with:

```bash
bun test
```

- **mocks/MockAudioContext.js**
  - A stand-in for the parts of the Web Audio API that Pluck uses. It records
    every `connect()` so tests can assert on the shape of the audio graph, and
    it reproduces the spec behaviours Pluck has to respect: a source node can
    only be started once, `stop()` before `start()` is an error, connecting the
    same pair of nodes twice is a no-op, and `AudioParam.value` reflects the
    last set value rather than a ramp in progress.

- **Sound.test.js**, **Voice.test.js**, **Group.test.js**, **Timeline.test.js**,
  **Tempo.test.js**, **Effects.test.js**, **BufferCache.test.js**,
  **PriorityQueue.test.js**, **Events.test.js**
  - Run against the mock under Bun's test runner, so they need no browser and
    finish in well under a second.

The tests are only as truthful as the mock. If one of its assumptions about the
Web Audio API is wrong, the suite will agree with itself and still disagree with
a browser, so the demo pages in `dist/` remain the manual check against the real
API.

### Build and Bundle

- **Bun Configuration**
  - Uses Bun for building and bundling the project.
  - `dist/pluck.js` is the output file for use in projects.

### Documentation

- **JSDoc**
  - Documentation is generated using JSDoc, with output stored in the `docs` folder.

### Sample Usage

A sample `index.html` file demonstrates how to use Pluck.js to create and play a sound:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pluck.js Test</title>
</head>
<body>
    <button id="playButton">Play Sound</button>
    <script type="module">
        import Pluck from './dist/pluck.js'

        document.getElementById('playButton').addEventListener('click', () => {
            const sound = new Pluck.Sound({ file: 'snd.mp3' })
            console.log(sound)
            sound.play()
        })
    </script>
</body>
</html>
```

## Future Work

- **Additional Features and Improvements**
  - Implement additional effects and refine the existing ones.
  - Optimize performance and memory management further.
  - Enhance documentation with more detailed usage examples and API references.
