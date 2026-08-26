class Events {
  constructor() {
    this.events = {
      start: [],
      stop: [],
      loop: [],
      scheduled: [],
      missed: [],
      play: [],
      ended: [],
      effect: []
    }
  }

  on(event, listener) {
    if (this.events[event]) {
      this.events[event].push(listener)
    } else {
      console.error(`Event ${event} is not supported.`)
    }
  }

  off(event, listener) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(l => l !== listener)
    } else {
      console.error(`Event ${event} is not supported.`)
    }
  }

  trigger(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(...args))
    }
  }
}

export default Events
