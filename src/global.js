/**
 * Browser bundle entry. Attaches everything to window.Pluck for use from a
 * plain <script> tag; this is the one module in the library with a side effect.
 */
import * as Pluck from './index.js'

if (typeof window !== 'undefined') {
  window.Pluck = { ...Pluck }
}

export * from './index.js'
