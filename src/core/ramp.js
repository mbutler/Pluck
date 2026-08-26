/**
 * Cancels in-flight automation and ramps an AudioParam linearly from wherever
 * it is now. `seconds` of 0 snaps. Returns the param so a caller can chain.
 */
export const rampParam = (param, value, seconds, currentTime) => {
  param.cancelScheduledValues(currentTime)
  param.setValueAtTime(param.value, currentTime)
  if (seconds > 0) param.linearRampToValueAtTime(value, currentTime + seconds)
  else param.value = value
  return param
}
