/**
 * Wires `head` through a list of effects and on to every destination.
 *
 *   head -> effect0.input .. effect0.output -> effect1.input .. -> destinations
 *
 * Rebuilt from scratch whenever the chain changes, which is simpler than
 * splicing and cannot leave a stale edge behind. Only the upstream side of each
 * link is disconnected, which is enough to clear every edge the chain owns
 * without touching connections made into `head` from elsewhere.
 *
 * @returns {AudioNode} the tail of the chain, for anything that wants to tap it
 */
export const rebuildChain = (head, effects, destinations) => {
  head.disconnect()
  effects.forEach(effect => effect.output.disconnect())

  let node = head
  for (const effect of effects) {
    node.connect(effect.input)
    node = effect.output
  }

  destinations.forEach(destination => {
    if (destination) node.connect(destination)
  })

  return node
}
