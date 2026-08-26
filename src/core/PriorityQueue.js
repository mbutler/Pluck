class PriorityQueue {
  constructor() {
    this.queue = []
  }

  enqueue(item, priority) {
    const node = { item, priority }
    this.queue.push(node)
    this.bubbleUp(this.queue.length - 1)
  }

  dequeue() {
    if (this.isEmpty()) return null
    const first = this.queue[0]
    const last = this.queue.pop()
    if (this.queue.length > 0) {
      this.queue[0] = last
      this.bubbleDown(0)
    }
    return first.item
  }

  peek() {
    return this.queue[0]
  }

  isEmpty() {
    return this.queue.length === 0
  }

  bubbleUp(index) {
    const node = this.queue[index]
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      const parent = this.queue[parentIndex]
      if (node.priority >= parent.priority) break
      this.queue[index] = parent
      index = parentIndex
    }
    this.queue[index] = node
  }

  bubbleDown(index) {
    const length = this.queue.length
    const node = this.queue[index]
    while (true) {
      const leftChildIndex = 2 * index + 1
      const rightChildIndex = 2 * index + 2
      let leftChild = this.queue[leftChildIndex]
      let rightChild = this.queue[rightChildIndex]
      let swapIndex = null

      if (leftChildIndex < length) {
        if (leftChild.priority < node.priority) {
          swapIndex = leftChildIndex
        }
      }

      if (rightChildIndex < length) {
        if (
          (swapIndex === null && rightChild.priority < node.priority) ||
          (swapIndex !== null && rightChild.priority < leftChild?.priority)
        ) {
          swapIndex = rightChildIndex
        }
      }

      if (swapIndex === null) break
      this.queue[index] = this.queue[swapIndex]
      index = swapIndex
    }
    this.queue[index] = node
  }

  remove(match) {
    const matches = typeof match === 'function'
      ? node => match(node.item)
      : node => node.item === match

    const index = this.queue.findIndex(matches)
    if (index === -1) return false

    const last = this.queue.pop()
    if (index < this.queue.length) {
      this.queue[index] = last
      // At most one direction applies: sift up if the replacement outranks
      // its parent, otherwise sift down.
      const parentIndex = Math.floor((index - 1) / 2)
      if (index > 0 && last.priority < this.queue[parentIndex].priority) {
        this.bubbleUp(index)
      } else {
        this.bubbleDown(index)
      }
    }
    return true
  }
}

export default PriorityQueue
