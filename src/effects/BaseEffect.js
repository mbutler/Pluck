class BaseEffect {
    constructor() {
      this.inputNode = null
      this.outputNode = null
    }
  
    connect(audioNode) {
      this.outputNode.connect(audioNode)
      return this
    }
  
    disconnect(audioNode) {
      this.outputNode.disconnect(audioNode)
      return this
    }
  }
  
  export default BaseEffect
  