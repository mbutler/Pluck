class EventManager {
    constructor() {
      this.events = new Map()
    }
  
    on(event, callback) {
      if (!this.events.has(event)) {
        this.events.set(event, [])
      }
      this.events.get(event).push(callback)
    }
  
    trigger(event, ...args) {
      if (!this.events.has(event)) return
      this.events.get(event).forEach(callback => callback(...args))
    }
  
    off(event, callback) {
      if (!this.events.has(event)) return
      const callbacks = this.events.get(event).filter(cb => cb !== callback)
      this.events.set(event, callbacks)
    }
  }
  
  export default EventManager
  