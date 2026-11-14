import type { GestureResult } from '../gestures/engine'
import type { FormationTransform } from './types'

export interface TransformSettings {
  minScale: number
  maxScale: number
  minSeparation: number
  smoothingMs: number
  staleMs: number
}
const defaults: TransformSettings = { minScale: 0.5, maxScale: 2, minSeparation: 0.12, smoothingMs: 90, staleMs: 250 }
/** Relative screen-space scale/rotation; independent of React, camera and renderer. */
export function createTwoHandTransform(options: Partial<TransformSettings> = {}, onModeChange?: (active: boolean) => void) {
  const settings = { ...defaults, ...options }
  if (Object.values(settings).some(v => !Number.isFinite(v)) || settings.minScale <= 0 || settings.minScale > 1 ||
      settings.maxScale < 1 || settings.maxScale <= settings.minScale || settings.minSeparation <= 0 ||
      settings.smoothingMs < 0 || settings.staleMs <= 0) throw new RangeError('Invalid two-hand transform settings.')
  const state: FormationTransform = { active: false, scale: 1, rotation: 0 }
  let enabled = false
  const armed = new Set<number>()
  let pair: { ids: string; a: { x: number; y: number }; b: { x: number; y: number } } | undefined
  let capture = true
  let lastSeen = -Infinity
  let referenceDistance = 1
  let referenceScale = 1
  let previousAngle = 0
  let targetScale = 1
  let targetRotation = 0
  let lastAspect = 1
  const mode = (active: boolean) => {
    if (state.active === active) return
    state.active = active; onModeChange?.(active)
  }
  const stop = () => {
    pair = undefined; capture = true
    targetScale = state.scale; targetRotation = state.rotation
    mode(false)
  }
  const interrupt = () => { stop(); armed.clear(); lastSeen = -Infinity }
  return {
    get engaged() { return Boolean(pair) },
    setEnabled(value: boolean) { if (enabled !== value) { enabled = value; interrupt() } },
    update(result: GestureResult, now: number) {
      if (!enabled || !result.accepted || !Number.isFinite(now)) return
      if (result.events.some(event => event.reason === 'reset')) { interrupt(); return }
      if (now - lastSeen > settings.staleMs) interrupt()
      lastSeen = now
      const hands = result.hands.filter(hand => hand.present && Number.isFinite(hand.position.x) && Number.isFinite(hand.position.y))
        .sort((a, b) => a.id - b.id).slice(0, 2)
      for (const id of armed) if (!hands.some(hand => hand.id === id)) armed.delete(id)
      for (const hand of hands) if (hand.open) armed.add(hand.id)
      if (hands.length !== 2 || hands.some(hand => !hand.pinching || !armed.has(hand.id))) { stop(); return }
      const ids = `${hands[0].id}:${hands[1].id}`
      if (pair?.ids !== ids) { stop(); capture = true }
      pair = { ids, a: { ...hands[0].position }, b: { ...hands[1].position } }
    },
    sample(now: number, dt: number, aspect = 1): FormationTransform {
      if (now - lastSeen > settings.staleMs) interrupt()
      if (!pair) return { ...state }
      const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
      const dx = (pair.b.x - pair.a.x) * safeAspect, dy = pair.b.y - pair.a.y
      const distance = Math.hypot(dx, dy), angle = Math.atan2(dy, dx)
      // A nearly coincident pair has no reliable orientation or distance reference.
      if (distance < settings.minSeparation) { interrupt(); return { ...state } }
      if (capture || safeAspect !== lastAspect) {
        referenceDistance = distance; referenceScale = state.scale
        previousAngle = angle; targetScale = state.scale; targetRotation = state.rotation
        lastAspect = safeAspect; capture = false; mode(true)
      } else {
        targetScale = Math.max(settings.minScale, Math.min(settings.maxScale, referenceScale * distance / referenceDistance))
        // Small signed delta across ±π; IDs determine vector direction, not detection order.
        targetRotation += Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle))
        previousAngle = angle
      }
      const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0
      const follow = settings.smoothingMs === 0 ? 1 : 1 - Math.exp(-seconds * 1000 / settings.smoothingMs)
      state.scale += (targetScale - state.scale) * follow
      state.rotation += (targetRotation - state.rotation) * follow
      return { ...state }
    },
    interrupt,
    reset() { interrupt(); state.scale = 1; state.rotation = 0; targetScale = 1; targetRotation = 0 },
  }
}
