class Events {
  constructor() {
    this.events = {
      onStart: [],
      onStop: [],
      onLoop: [],
      onSoundScheduled: [],
      onSoundPlayed: [],
      onEffectTriggered: []
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

  trigger(event, sound, time) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(sound, time))
    }
  }
}

export default Events
