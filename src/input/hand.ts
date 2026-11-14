import type { GestureResult } from '../gestures/engine'
import type { InteractionInput, InteractionSource } from './types'

export interface HandInputSettings {
  staleMs: number
  attractionFadeMs: number
  markerFadeMs: number
  movementMs: number
}
const defaults: HandInputSettings = { staleMs: 250, attractionFadeMs: 110, markerFadeMs: 160, movementMs: 65 }

/** Converts interpreted gestures into the same contract as the mouse; no rendering/DOM. */
export function createHandInput(options: Partial<HandInputSettings> = {}) {
  const settings = { ...defaults, ...options }
  if (Object.values(settings).some(v => !Number.isFinite(v) || v <= 0)) throw new RangeError('Hand input timings must be positive milliseconds.')
  const input: InteractionInput = { x: 0, y: 0, active: false, visible: false, attraction: 0, opacity: 0 }
  let enabled = false
  let selected: number | undefined
  let present = false
  let armed = false
  let gathering = false
  let lastSeen = -Infinity
  let target = { x: 0, y: 0 }
  let positioned = false
  let interrupted = false
  const suspend = () => { present = false; armed = false; gathering = false; interrupted = true }
  const reset = () => {
    suspend(); selected = undefined; positioned = false; lastSeen = -Infinity
    input.active = false; input.visible = false; input.attraction = 0; input.opacity = 0
  }
  const source: InteractionSource & {
    update(result: GestureResult, now: number): void
    setEnabled(value: boolean): void
  } = {
    setEnabled(value) {
      if (enabled === value) return
      enabled = value
      suspend()
      if (value) { selected = undefined; lastSeen = -Infinity }
    },
    update(result, now) {
      if (!enabled || !result.accepted || !Number.isFinite(now)) return
      if (result.events.some(event => event.reason === 'reset')) { reset(); return }
      let hand = result.hands.find(candidate => candidate.id === selected)
      if (!hand) {
        suspend()
        hand = result.hands.filter(candidate => candidate.present).sort((a, b) => a.id - b.id)[0]
        selected = hand?.id
      }
      if (!hand?.present || !Number.isFinite(hand.position.x) || !Number.isFinite(hand.position.y)) { suspend(); return }
      // Also detect a gap if no explicit missing frame arrived before reacquisition.
      if (now - lastSeen > settings.staleMs) suspend()
      present = true; lastSeen = now
      target = { x: Math.max(-1, Math.min(1, hand.position.x)), y: Math.max(-1, Math.min(1, hand.position.y)) }
      if (hand.open) armed = true
      if (armed && hand.pinch === 'start') gathering = true
      if (!hand.pinching) gathering = false
    },
    sample(now, dt) {
      if (now - lastSeen > settings.staleMs) suspend()
      const seen = enabled && present
      const wanted = seen && gathering
      const seconds = Math.max(0, Number.isFinite(dt) ? dt : 0)
      const fade = (value: number, goal: number, ms: number) => goal + (value - goal) * Math.exp(-seconds * 1000 / ms)
      // A dropped pinch fades at its old position; it cannot tug particles toward a reacquired hand.
      const fadingOldAttraction = interrupted && (input.attraction ?? 0) > 0.005
      input.attraction = fade(input.attraction ?? 0, wanted && !fadingOldAttraction ? 1 : 0, settings.attractionFadeMs)
      if (input.attraction < 0.005 && !wanted) input.attraction = 0
      input.opacity = fade(input.opacity ?? 0, seen ? 1 : 0, settings.markerFadeMs)
      if (input.opacity < 0.005 && !seen) input.opacity = 0
      if (seen && !fadingOldAttraction) {
        if (!positioned) { input.x = target.x; input.y = target.y; positioned = true }
        else {
          input.x = fade(input.x, target.x, settings.movementMs)
          input.y = fade(input.y, target.y, settings.movementMs)
        }
        interrupted = false
      }
      // A long pause must not resurrect old force on a resumed animation frame.
      if (now - lastSeen > settings.staleMs + 1500) { input.attraction = 0; input.opacity = 0 }
      input.active = (input.attraction ?? 0) > 0
      input.visible = (input.opacity ?? 0) > 0
      return input
    },
    reset,
  }
  return source
}
export type HandInput = ReturnType<typeof createHandInput>

/** A deliberate mouse drag takes priority. Hover alone does not steal a tracked hand. */
export function selectInteraction(mouse: InteractionInput, hand?: InteractionInput): InteractionInput {
  return mouse.active || !hand?.visible ? mouse : hand
}
