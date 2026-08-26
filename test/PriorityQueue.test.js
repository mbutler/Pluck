import { describe, test, expect } from 'bun:test'
import PriorityQueue from '../src/core/PriorityQueue.js'

const drain = queue => {
  const out = []
  while (!queue.isEmpty()) out.push(queue.dequeue())
  return out
}

describe('ordering', () => {
  test('starts empty', () => {
    const queue = new PriorityQueue()

    expect(queue.isEmpty()).toBe(true)
    expect(queue.dequeue()).toBe(null)
    expect(queue.peek()).toBeUndefined()
  })

  test('dequeues in priority order regardless of insertion order', () => {
    const queue = new PriorityQueue()
    queue.enqueue('c', 30)
    queue.enqueue('a', 10)
    queue.enqueue('d', 40)
    queue.enqueue('b', 20)

    expect(drain(queue)).toEqual(['a', 'b', 'c', 'd'])
  })

  test('peek exposes the next node without removing it', () => {
    const queue = new PriorityQueue()
    queue.enqueue('later', 10)
    queue.enqueue('sooner', 5)

    expect(queue.peek().priority).toBe(5)
    expect(queue.peek().item).toBe('sooner')
    expect(queue.isEmpty()).toBe(false)
  })

  test('handles duplicate priorities', () => {
    const queue = new PriorityQueue()
    queue.enqueue('x', 1)
    queue.enqueue('y', 1)
    queue.enqueue('z', 1)

    expect(drain(queue).sort()).toEqual(['x', 'y', 'z'])
  })
})

describe('remove', () => {
  test('removes by identity', () => {
    const queue = new PriorityQueue()
    const target = { id: 'target' }
    queue.enqueue({ id: 'a' }, 1)
    queue.enqueue(target, 2)
    queue.enqueue({ id: 'b' }, 3)

    expect(queue.remove(target)).toBe(true)
    expect(drain(queue).map(item => item.id)).toEqual(['a', 'b'])
  })

  // Regression: remove() compared against node.item, but Timeline enqueues
  // { sound, time } wrappers, so removing by the sound never matched and
  // rescheduleSound left the original entry in place.
  test('removes by predicate, reaching inside a wrapper', () => {
    const queue = new PriorityQueue()
    const sound = { name: 'kick' }
    queue.enqueue({ sound, time: 5 }, 5)
    queue.enqueue({ sound: { name: 'snare' }, time: 6 }, 6)

    expect(queue.remove(entry => entry.sound === sound)).toBe(true)
    expect(drain(queue).map(entry => entry.sound.name)).toEqual(['snare'])
  })

  test('reports false when nothing matches', () => {
    const queue = new PriorityQueue()
    queue.enqueue('a', 1)

    expect(queue.remove('missing')).toBe(false)
    expect(queue.remove(() => false)).toBe(false)
    expect(queue.isEmpty()).toBe(false)
  })

  test('removes the only element', () => {
    const queue = new PriorityQueue()
    queue.enqueue('only', 1)

    expect(queue.remove('only')).toBe(true)
    expect(queue.isEmpty()).toBe(true)
  })

  test('removes the highest priority element', () => {
    const queue = new PriorityQueue()
    queue.enqueue('a', 1)
    queue.enqueue('b', 2)
    queue.enqueue('c', 3)

    queue.remove('a')

    expect(queue.peek().item).toBe('b')
    expect(drain(queue)).toEqual(['b', 'c'])
  })

  test('removes the last element', () => {
    const queue = new PriorityQueue()
    queue.enqueue('a', 1)
    queue.enqueue('b', 2)
    queue.enqueue('c', 3)

    queue.remove('c')

    expect(drain(queue)).toEqual(['a', 'b'])
  })
})

describe('heap invariant', () => {
  // The interesting case is removal from the middle, where the replacement node
  // may need to sift either up or down. Random interleaving is a better check
  // of that than any handful of hand-picked cases.
  test('stays sorted across randomised inserts and removes', () => {
    for (let trial = 0; trial < 1000; trial++) {
      const queue = new PriorityQueue()
      let live = []

      for (let i = 0; i < 40; i++) {
        const item = { id: i, priority: Math.floor(Math.random() * 50) }
        queue.enqueue(item, item.priority)
        live.push(item)
      }

      for (let i = 0; i < 15; i++) {
        const victim = live[Math.floor(Math.random() * live.length)]
        expect(queue.remove(victim)).toBe(true)
        live = live.filter(item => item !== victim)
      }

      const drained = drain(queue).map(item => item.priority)
      const expected = live.map(item => item.priority).sort((a, b) => a - b)

      expect(drained).toEqual(expected)
    }
  })

  test('survives interleaved enqueue, dequeue and remove', () => {
    for (let trial = 0; trial < 500; trial++) {
      const queue = new PriorityQueue()
      let live = []
      let nextId = 0

      for (let step = 0; step < 60; step++) {
        const roll = Math.random()

        if (roll < 0.5 || live.length === 0) {
          const item = { id: nextId++, priority: Math.floor(Math.random() * 30) }
          queue.enqueue(item, item.priority)
          live.push(item)
        } else if (roll < 0.75) {
          const lowest = Math.min(...live.map(item => item.priority))
          const item = queue.dequeue()
          expect(item.priority).toBe(lowest)
          live = live.filter(entry => entry !== item)
        } else {
          const victim = live[Math.floor(Math.random() * live.length)]
          queue.remove(victim)
          live = live.filter(entry => entry !== victim)
        }
      }

      const drained = drain(queue).map(item => item.priority)
      expect(drained).toEqual(live.map(item => item.priority).sort((a, b) => a - b))
    }
  })
})
