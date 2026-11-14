import type { GestureResult } from '../gestures/engine'
import { createHandInput } from './hand'
import { createTwoHandTransform } from './transform'
import type { InteractionInput, InteractionSource } from './types'

/** Arbitration lives here, so particle physics never needs to interpret gestures. */
export function createHandControls(onTransformModeChange?: (active: boolean) => void) {
  const single = createHandInput()
  const transform = createTwoHandTransform({}, onTransformModeChange)
  return {
    setEnabled(value: boolean) { single.setEnabled(value); transform.setEnabled(value) },
    update(result: GestureResult, now: number) {
      if (!result.accepted) return
      const wasEngaged = transform.engaged
      transform.update(result, now)
      if (transform.engaged || wasEngaged) single.reset()
      if (!transform.engaged) single.update(result, now)
    },
    sample(now: number, dt: number, aspect = 1): InteractionInput {
      const formation = transform.sample(now, dt, aspect)
      if (formation.active) {
        // Suppress even the fading tail of a previous single-hand attraction.
        single.reset()
        return { x: 0, y: 0, active: false, visible: false, attraction: 0, opacity: 0, transform: formation }
      }
      return { ...single.sample(now, dt), transform: formation }
    },
    interrupt() { single.reset(); transform.interrupt() },
    reset() { single.reset(); transform.reset() },
  } satisfies InteractionSource & { update(result: GestureResult, now: number): void; setEnabled(value: boolean): void }
}
