import { describe, test, expect } from 'bun:test'
import * as Pluck from '../src/index.js'
import packageJson from '../package.json'

const EXPORTS = [
  'Timeline', 'Sound', 'Group', 'Voice', 'Tempo', 'PriorityQueue', 'Events',
  'BufferCache', 'bufferCache',
  'Effect', 'Filter', 'LowPassFilter', 'HighPassFilter', 'Delay', 'Distortion',
  'Compressor', 'StereoPanner', 'Tremolo', 'Reverb'
]

describe('library entry', () => {
  test('exports every public class', () => {
    for (const name of EXPORTS) {
      expect(Pluck[name]).toBeDefined()
    }
  })

  test('classes are constructors', () => {
    const classes = EXPORTS.filter(name => name !== 'bufferCache')
    for (const name of classes) {
      expect(typeof Pluck[name]).toBe('function')
    }
  })

  test('bufferCache is the shared instance', () => {
    expect(Pluck.bufferCache).toBeInstanceOf(Pluck.BufferCache)
  })

  // Importing the library must not touch the DOM: a bundler needs to be able to
  // drop unused exports, and a server-rendered app evaluates this module where
  // there is no window at all.
  test('importing has no side effects on window', async () => {
    const before = globalThis.window.Pluck
    await import('../src/index.js?fresh=' + Math.random())

    expect(globalThis.window.Pluck).toBe(before)
  })

  test('declares its side-effecting modules for tree shaking', () => {
    expect(packageJson.sideEffects).toContain('./src/global.js')
    expect(packageJson.sideEffects).not.toContain('./src/index.js')
  })
})

describe('package metadata', () => {
  test('has a version', () => {
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  test('entry points agree with each other', () => {
    expect(packageJson.main).toBe(packageJson.module)
    expect(packageJson.exports['.'].import).toBe(packageJson.module)
  })

  test('ships the files the entry points name', () => {
    const referenced = [
      packageJson.main,
      packageJson.exports['.'].import,
      packageJson.exports['./global']
    ]

    for (const path of referenced) {
      expect(path.startsWith('./dist/')).toBe(true)
      expect(packageJson.files).toContain(path.slice(2))
    }
  })

  // dist/ also holds the demo pages and 19MB of sample audio. Shipping the
  // whole directory would make a 25KB library a 19MB dependency.
  test('ships the bundles rather than all of dist', () => {
    expect(packageJson.files).not.toContain('dist')
    expect(packageJson.files.every(entry => !entry.endsWith('.mp3'))).toBe(true)
  })

  test('has no runtime dependencies', () => {
    expect(packageJson.dependencies).toBeUndefined()
  })
})

describe('environments without Web Audio', () => {
  // A ReferenceError on `window` at import time would break any bundler or SSR
  // build. Failures should surface when audio is actually requested.
  test('the source names no bare window global', async () => {
    const { Glob } = await import('bun')
    const glob = new Glob('**/*.js')
    const offenders = []

    for await (const file of glob.scan({ cwd: 'src' })) {
      if (file === 'global.js') continue
      const source = await Bun.file(`src/${file}`).text()
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      if (/(^|[^.\w])window\s*\./.test(code)) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })

  test('creating a Sound without Web Audio fails with a clear message', () => {
    const { AudioContext, webkitAudioContext } = globalThis
    delete globalThis.AudioContext
    delete globalThis.webkitAudioContext

    try {
      expect(() => new Pluck.Sound()).toThrow('Web Audio is not available in this environment')
    } finally {
      globalThis.AudioContext = AudioContext
      globalThis.webkitAudioContext = webkitAudioContext
    }
  })

  test('Group rejects a context instead of throwing on a missing global', () => {
    const { AudioContext, webkitAudioContext } = globalThis
    delete globalThis.AudioContext
    delete globalThis.webkitAudioContext

    try {
      expect(() => new Pluck.Group({})).toThrow('No audio context provided to Group')
    } finally {
      globalThis.AudioContext = AudioContext
      globalThis.webkitAudioContext = webkitAudioContext
    }
  })
})

describe('global bundle entry', () => {
  test('attaches everything to window.Pluck', async () => {
    await import('../src/global.js')

    expect(globalThis.window.Pluck).toBeDefined()
    for (const name of EXPORTS) {
      expect(globalThis.window.Pluck[name]).toBeDefined()
    }
  })

  test('re-exports the library as well', async () => {
    const globalEntry = await import('../src/global.js')

    expect(globalEntry.Sound).toBe(Pluck.Sound)
  })

  // The bundle is loaded by a plain <script> tag, where a top-level `export` is
  // a syntax error. It must be built as IIFE, not ESM.
  test('the built global bundle carries no export statements', async () => {
    for (const file of ['dist/pluck.js', 'dist/pluck.min.js']) {
      const source = await Bun.file(file).text()
      expect(/(^|[;\n])\s*export[\s{*]/.test(source)).toBe(false)
      expect(source).toContain('Pluck')
    }
  })

  test('the esm bundle does export', async () => {
    const source = await Bun.file('dist/pluck.esm.js').text()

    expect(/(^|[;\n])\s*export\s*{/.test(source)).toBe(true)
  })
})
