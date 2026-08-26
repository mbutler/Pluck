import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import Events from '../src/core/Events.js'
import { captureConsole } from './mocks/MockAudioContext.js'

let events
let console_

beforeEach(() => {
  events = new Events()
  console_ = captureConsole()
})

afterEach(() => console_.restore())

describe('on', () => {
  test('registers a listener that fires on trigger', () => {
    let fired = 0
    events.on('play', () => fired++)

    events.trigger('play')

    expect(fired).toBe(1)
  })

  test('fires every listener, in registration order', () => {
    const order = []
    events.on('start', () => order.push('first'))
    events.on('start', () => order.push('second'))

    events.trigger('start')

    expect(order).toEqual(['first', 'second'])
  })

  test('passes the sound and time through', () => {
    const seen = []
    const sound = { name: 'kick' }
    events.on('scheduled', (s, time) => seen.push({ s, time }))

    events.trigger('scheduled', sound, 12)

    expect(seen).toEqual([{ s: sound, time: 12 }])
  })

  test('rejects an unsupported event', () => {
    events.on('nope', () => {})

    expect(console_.saw('error', 'Event nope is not supported')).toBe(true)
  })
})

describe('off', () => {
  test('removes a listener', () => {
    let fired = 0
    const listener = () => fired++
    events.on('stop', listener)
    events.off('stop', listener)

    events.trigger('stop')

    expect(fired).toBe(0)
  })

  test('leaves other listeners in place', () => {
    const order = []
    const removed = () => order.push('removed')
    events.on('stop', removed)
    events.on('stop', () => order.push('kept'))
    events.off('stop', removed)

    events.trigger('stop')

    expect(order).toEqual(['kept'])
  })

  test('rejects an unsupported event', () => {
    events.off('nope', () => {})

    expect(console_.saw('error', 'Event nope is not supported')).toBe(true)
  })
})

describe('trigger', () => {
  test('is a no-op for an event with no listeners', () => {
    expect(() => events.trigger('loop')).not.toThrow()
  })

  test('ignores an unsupported event', () => {
    expect(() => events.trigger('nope')).not.toThrow()
  })

  test('supports the documented event names', () => {
    const names = ['start', 'stop', 'loop', 'scheduled', 'missed', 'play', 'effect']
    const fired = []

    for (const name of names) events.on(name, () => fired.push(name))
    for (const name of names) events.trigger(name)

    expect(fired).toEqual(names)
    expect(console_.messages.error).toEqual([])
  })
})
