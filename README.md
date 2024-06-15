# pluck

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.js
```

This project was created using `bun init` in bun v1.1.13. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

# Pluck.js

Pluck.js is a modern, lightweight, and efficient JavaScript sound library designed to be a drop-in replacement for Pizzicato.js. This library utilizes modern JavaScript standards (ES8+) and browser Web Audio APIs to create, play, and manage audio with a focus on memory efficiency.

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
      - Effects.js
      - Util.js
    - index.js (Entry point)
  - test/ (Tests)
    - mocks/ (Mock classes for testing)
      - MockAudioContext.js
    - Sound.test.js
    - Group.test.js
    - Effects.test.js
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

- **Group.js**
  - Manages groups of sounds, allowing for collective playback and manipulation.

- **Effects.js**
  - Provides a base for adding effects to sounds.

- **Util.js**
  - Utility functions for common tasks such as type checking and range validation.

### Testing

- **MockAudioContext.js**
  - Provides a mock implementation of the Web Audio API for testing purposes.

- **Sound.test.js**
  - Comprehensive tests for the `Sound` class using Bun's testing framework.
  - **Note**: One test related to playback is currently not passing, but the basic functionality is verified to work in the browser.

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

- **Fix Playback Test**
  - Address the issue with the playback test in `Sound.test.js` to ensure all tests pass.

- **Additional Features and Improvements**
  - Implement additional effects and refine the existing ones.
  - Optimize performance and memory management further.
  - Enhance documentation with more detailed usage examples and API references.
