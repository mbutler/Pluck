class PriorityQueue {
    constructor() {
      this.queue = []
    }
  
    enqueue(item, priority) {
      const node = { item, priority }
      this.queue.push(node)
      this.bubbleUp()
    }
  
    dequeue() {
      const first = this.queue[0]
      const last = this.queue.pop()
      if (this.queue.length > 0) {
        this.queue[0] = last
        this.bubbleDown()
      }
      return first.item
    }
  
    peek() {
      return this.queue[0]?.item
    }
  
    isEmpty() {
      return this.queue.length === 0
    }
  
    bubbleUp() {
      let index = this.queue.length - 1
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
  
    bubbleDown() {
      let index = 0
      const length = this.queue.length
      const node = this.queue[index]
      while (true) {
        const leftChildIndex = 2 * index + 1
        const rightChildIndex = 2 * index + 2
        let leftChild, rightChild
        let swapIndex = null
  
        if (leftChildIndex < length) {
          leftChild = this.queue[leftChildIndex]
          if (leftChild.priority < node.priority) {
            swapIndex = leftChildIndex
          }
        }
  
        if (rightChildIndex < length) {
          rightChild = this.queue[rightChildIndex]
          if (
            (swapIndex === null && rightChild.priority < node.priority) ||
            (swapIndex !== null && rightChild.priority < leftChild.priority)
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
  
    remove(item) {
      const index = this.queue.findIndex(node => node.item === item)
      if (index === -1) return false
  
      const last = this.queue.pop()
      if (index < this.queue.length) {
        this.queue[index] = last
        this.bubbleUpFrom(index)
        this.bubbleDownFrom(index)
      }
      return true
    }
  
    bubbleUpFrom(index) {
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
  
    bubbleDownFrom(index) {
      const length = this.queue.length
      const node = this.queue[index]
      while (true) {
        const leftChildIndex = 2 * index + 1
        const rightChildIndex = 2 * index + 2
        let leftChild, rightChild
        let swapIndex = null
  
        if (leftChildIndex < length) {
          leftChild = this.queue[leftChildIndex]
          if (leftChild.priority < node.priority) {
            swapIndex = leftChildIndex
          }
        }
  
        if (rightChildIndex < length) {
          rightChild = this.queue[rightChildIndex]
          if (
            (swapIndex === null && rightChild.priority < node.priority) ||
            (swapIndex !== null && rightChild.priority < leftChild.priority)
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
  }

export default PriorityQueue