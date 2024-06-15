export function isInRange(value, min, max) {
    return typeof value === 'number' && value >= min && value <= max
  }
  
  export function getDryLevel(mix) {
    return mix <= 0.5 ? 1 : 1 - (mix - 0.5) * 2
  }
  
  export function getWetLevel(mix) {
    return mix >= 0.5 ? 1 : mix * 2
  }
  