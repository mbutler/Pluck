import puppeteer from 'puppeteer-core';

async function runTests() {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" // Specify the path to the Chrome executable
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
        return timeline.context instanceof AudioContext;
      }`,
      expected: true,
    },
    {
      name: 'Test Group Play',
      script: `async () => {
        const context = new window.AudioContext();
        const sound1 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context: context });
        const sound2 = new window.Pluck.Sound({ file: '../dist/snd.mp3', context: context});
        await sound1.initialized;
        await sound2.initialized;
        const group = new window.Pluck.Group([sound1, sound2]);
        await group.play();
        return sound1.isPlaying && sound2.isPlaying;
      }`,
      expected: true,
    },
    {
      name: 'Test Sound Playback with Offset',
      script: `async () => {
        const sound = new window.Pluck.Sound({ file: '../dist/snd.mp3' });
        await sound.play();
        return sound.isPlaying;
      }`,
      expected: true,
    },
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
