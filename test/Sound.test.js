import puppeteer from 'puppeteer-core';

async function runTests() {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage();

  // Load a blank page to run tests
  await page.goto('about:blank');

  // Expose Pluck library to the page
  await page.addScriptTag({ path: '../dist/pluck.js' }); 

  // Define test cases
  const testCases = [
    {
      name: 'Test Sound Initialization',
      script: `async () => {
        const sound = new window.Pluck.Sound({ file: '../dist/snd.mp3' });
        await sound.initialized;
        return sound.context instanceof AudioContext;
      }`,
      expected: true,
    },
    {
      name: 'Test Timeline Start',
      script: `async () => {
        const timeline = new window.Pluck.Timeline();
        timeline.start();
        return timeline.isPlaying;
      }`,
      expected: true,
    },
    {
      name: 'Test Group Play',
      script: `async () => {
        const context = new window.AudioContext();
        const sound1 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context: context });
        const sound2 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context: context });
        await sound1.initialized;
        await sound2.initialized;
        const group = new window.Pluck.Group(context);
        group.addSounds([sound1, sound2]);
        await group.play();
        return sound1.isPlaying && sound2.isPlaying;
      }`,
      expected: true,
    },
    {
      name: 'Test Sound Playback',
      script: `async () => {
        const sound = new window.Pluck.Sound({ file: '../dist/snd.mp3' });
        await sound.initialized;
        await sound.play();
        return sound.isPlaying;
      }`,
      expected: true,
    },    
    {
      name: 'Test Microphone Input Initialization',
      script: `async () => {
        const sound = new window.Pluck.Sound({ input: true });
        return sound.mediaStream;
      }`,
      expected: true,
    },
    {
      name: 'Test Volume Setter',
      script: `async () => {
        const sound = new window.Pluck.Sound({ file: '../dist/snd.mp3' });
        await sound.initialized;
        sound.volume = 0.5;
        return sound.volume === 0.5;
      }`,
      expected: true,
    },
    {
      name: 'Test Play Method Without Source',
      script: `async () => {
        const sound = new window.Pluck.Sound({});
        await sound.initialized;
        await sound.play();
        return sound.isPlaying === true;
      }`,
      expected: true,
    },
    {
      name: 'Test Stop Method',
      script: `async () => {
        const sound = new window.Pluck.Sound({ file: '../dist/snd.mp3' });
        await sound.initialized;
        await sound.play();
        sound.stop();
        return sound.isPlaying === false;
      }`,
      expected: true,
    },
    {
      name: 'Test Clone Method',
      script: `async () => {
        const sound = new window.Pluck.Sound({ file: '../dist/snd.mp3', volume: 0.3 });
        await sound.initialized;
        const clonedSound = sound.clone();
        await clonedSound.initialized;
        return clonedSound.volume === 0.3 && clonedSound.context instanceof AudioContext;
      }`,
      expected: true,
    },
    {
      name: 'Test Apply Attack',
      script: `async () => {
        const sound = new window.Pluck.Sound({ file: '../dist/snd.mp3' });
        await sound.initialized;
        sound.applyAttack();
        return sound.gainNode instanceof GainNode;
      }`,
      expected: true,
    },
    {
      name: 'Test Apply Release',
      script: `async () => {
        const sound = new window.Pluck.Sound({ file: '../dist/snd.mp3' });
        await sound.initialized;
        sound.applyRelease();
        return sound.gainNode instanceof GainNode;
      }`,
      expected: true,
    },
    {
      name: 'Test Group Initialization',
      script: `async () => {
        const context = new window.AudioContext();
        const sound = new window.Pluck.Sound({ context });
        await sound.initialized;
        const group = new window.Pluck.Group(context);
        group.addSounds([sound]);
        return group.context === context && group.sounds.length === 1;
      }`,
      expected: true,
    },
    {
      name: 'Test Group Add Sound',
      script: `async () => {
        const context = new window.AudioContext();
        const sound1 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context });
        const sound2 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context });
        await sound1.initialized;
        await sound2.initialized;
        const group = new window.Pluck.Group(context);
        group.addSounds([sound2]);
        group.addSounds([sound1]);
        return group.sounds.length === 2 && group.sounds.includes(sound2);
      }`,
      expected: true,
    },
    {
      name: 'Test Group Remove Sound',
      script: `async () => {
        const context = new window.AudioContext();
        const sound1 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context });
        const sound2 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context });
        await sound1.initialized;
        await sound2.initialized;
        const group = new window.Pluck.Group(context);
        group.sounds.push(sound1, sound2); // horrible hack but addSounds is not working here
        group.removeSound(sound2);
        return group.sounds.length === 1 && !group.sounds.includes(sound2);
      }`,
      expected: true,
    },
    {
      name: 'Test Group Volume Control',
      script: `async () => {
        const context = new window.AudioContext();
        const sound = new window.Pluck.Sound({ file: '../dist/snd.mp3', context });
        await sound.initialized;
        const group = new window.Pluck.Group(context);
        group.addSounds([sound]);
        group.volume = 0.5;
        return group.volume === 0.5;
      }`,
      expected: true,
    },
    {
      name: 'Test Group Mute/Unmute',
      script: `async () => {
        const context = new window.AudioContext();
        const sound = new window.Pluck.Sound({ file: '../dist/snd.mp3', context });
        await sound.initialized;
        const group = new window.Pluck.Group(context);
        group.addSounds([sound]);
        group.mute();
        const isMuted = group.volume === 0;
        group.unmute();
        const isUnmuted = group.volume === 1;
        return isMuted && isUnmuted;
      }`,
      expected: true,
    },
    {
      name: 'Test Group Play All Sounds',
      script: `async () => {
        const context = new window.AudioContext();
        const sound1 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context });
        const sound2 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context });
        await sound1.initialized;
        await sound2.initialized;
        const group = new window.Pluck.Group(context);
        group.addSounds([sound1, sound2]);
        await group.play();
        return sound1.isPlaying && sound2.isPlaying;
      }`,
      expected: true,
    },
    {
      name: 'Test Group Stop All Sounds',
      script: `async () => {
        const context = new window.AudioContext();
        const sound1 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context });
        const sound2 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context });
        await sound1.initialized;
        await sound2.initialized;
        const group = new window.Pluck.Group(context);
        group.addSounds([sound1, sound2]);
        await group.play();
        group.stop();
        return !sound1.isPlaying && !sound2.isPlaying;
      }`,
      expected: true,
    }
  ];
  

  // Inject test cases into the page and run them
  const results = await page.evaluate(async (testCases) => {
    const results = [];
    for (const { name, script, expected } of testCases) {
      try {
        const fn = new Function('return ' + script)();
        const result = await fn();
        results.push({ name, result, expected, passed: result === expected });
      } catch (error) {
        results.push({ name, error: error.message, passed: false });
      }
    }
    return results;
  }, testCases);

  // Output results
  results.forEach(({ name, result, expected, passed, error }) => {
    if (passed) {
      console.log(`${name}: PASSED`);
    } else {
      console.log(`${name}: FAILED (Expected: ${expected}, Got: ${result}, Error: ${error})`);
    }
  });

  await browser.close();
}

runTests().catch(console.error);
