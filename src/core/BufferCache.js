/**
 * Fetches and decodes an audio file. Decoding is the expensive half, and it
 * produces an AudioBuffer that any number of sources can read from at once.
 */
export const fetchAndDecode = async (context, url) => {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  return context.decodeAudioData(arrayBuffer)
}

/** Decoded size in bytes: float32 per sample, per channel. */
export const bufferBytes = buffer => {
  if (!buffer || !buffer.length || !buffer.numberOfChannels) return 0
  return buffer.length * buffer.numberOfChannels * 4
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
  /**
   * @param {object} [limits]
   * @param {number} [limits.maxBytes=Infinity]  ceiling on decoded audio held.
   *   Bytes rather than a count, because decoded size varies enormously: a drum
   *   hit is a couple of hundred kilobytes and a fifteen-minute ambient bed is
   *   over three hundred megabytes, so capping the number of buffers says
   *   almost nothing about memory.
   * @param {number} [limits.maxSize=Infinity]  ceiling on the number of buffers.
   *
   * Both default to unbounded, which suits short samples. Anything working with
   * long-form audio should set a ceiling.
   */
  constructor({ maxBytes = Infinity, maxSize = Infinity } = {}) {
    // Insertion order doubles as least-recently-used order: a hit is deleted and
    // re-set, moving it to the end, so the oldest entry is always first.
    this.buffers = new Map()
    this.pending = new Map()
    this.maxBytes = maxBytes
    this.maxSize = maxSize
    this.bytes = 0
  }

  async load(context, url) {
    if (this.buffers.has(url)) return this.touch(url)

    let pending = this.pending.get(url)
    if (!pending) {
      pending = fetchAndDecode(context, url)
      this.pending.set(url, pending)
    }

    try {
      const buffer = await pending
      this.remember(url, buffer)
      // Returned whether or not it stayed cached: a buffer too large for the
      // ceiling is still the buffer the caller asked for.
      return buffer
    } finally {
      // Cleared either way: a failed load must not be remembered, or retrying
      // would replay the same rejection forever.
      this.pending.delete(url)
    }
  }

  remember(url, buffer) {
    if (this.buffers.has(url)) this.delete(url)
    this.buffers.set(url, buffer)
    this.bytes += bufferBytes(buffer)
    this.evict()
  }

  /** Marks a URL as most recently used and returns its buffer. */
  touch(url) {
    const buffer = this.buffers.get(url)
    this.buffers.delete(url)
    this.buffers.set(url, buffer)
    return buffer
  }

  /** Drops least-recently-used buffers until both ceilings are satisfied. */
  evict() {
    while (this.buffers.size > this.maxSize || this.bytes > this.maxBytes) {
      const oldest = this.buffers.keys().next().value
      if (oldest === undefined) return
      this.delete(oldest)
    }
  }

  /** The decoded buffer for a URL, or undefined if it is not loaded yet. */
  get(url) {
    if (!this.buffers.has(url)) return undefined
    return this.touch(url)
  }

  has(url) {
    return this.buffers.has(url)
  }

  /** Drops one buffer. Sounds already holding a reference keep working. */
  delete(url) {
    if (!this.buffers.has(url)) return false
    this.bytes -= bufferBytes(this.buffers.get(url))
    return this.buffers.delete(url)
  }

  clear() {
    this.buffers.clear()
    this.bytes = 0
  }

  get size() {
    return this.buffers.size
  }
}

export { BufferCache }

// The instance Sound uses by default. Exported so an application can inspect it,
// drop a single file, or clear the lot to release memory.
export default new BufferCache()
