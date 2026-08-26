/**
 * Fetches and decodes an audio file. Decoding is the expensive half, and it
 * produces an AudioBuffer that any number of sources can read from at once.
 */
export const fetchAndDecode = async (context, url) => {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  return context.decodeAudioData(arrayBuffer)
}

/**
 * Keeps one decoded AudioBuffer per URL, so loading the same file into several
 * Sounds costs one fetch and one decode rather than one of each per Sound.
 *
 * In-flight loads are shared too: asking for a file that is still downloading
 * joins the existing request instead of starting a second one.
 *
 * Buffers are keyed by URL alone. A page using two AudioContexts at different
 * sample rates would share a buffer decoded at whichever rate got there first,
 * and the browser resamples on playback; that is the usual trade and not worth
 * a second copy in memory.
 */
class BufferCache {
  constructor() {
    this.buffers = new Map()
    this.pending = new Map()
  }

  async load(context, url) {
    const decoded = this.buffers.get(url)
    if (decoded) return decoded

    let pending = this.pending.get(url)
    if (!pending) {
      pending = fetchAndDecode(context, url)
      this.pending.set(url, pending)
    }

    try {
      const buffer = await pending
      this.buffers.set(url, buffer)
      return buffer
    } finally {
      // Cleared either way: a failed load must not be remembered, or retrying
      // would replay the same rejection forever.
      this.pending.delete(url)
    }
  }

  /** The decoded buffer for a URL, or undefined if it is not loaded yet. */
  get(url) {
    return this.buffers.get(url)
  }

  has(url) {
    return this.buffers.has(url)
  }

  /** Drops one buffer. Sounds already holding a reference keep working. */
  delete(url) {
    return this.buffers.delete(url)
  }

  clear() {
    this.buffers.clear()
  }

  get size() {
    return this.buffers.size
  }
}

export { BufferCache }

// The instance Sound uses by default. Exported so an application can inspect it,
// drop a single file, or clear the lot to release memory.
export default new BufferCache()
