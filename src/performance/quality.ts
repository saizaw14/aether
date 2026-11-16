import type { QualityLevel } from './monitor'
export const QUALITY_PROFILES = {
  high: { level: 'high', pixelRatio: 1.75, particles: 5000 },
  medium: { level: 'medium', pixelRatio: 1.25, particles: 3500 },
  low: { level: 'low', pixelRatio: 1, particles: 2000 },
} as const
/** Sustained foreground FPS, with hysteresis/cooldown. Never treats tab suspension as load. */
export function createQualityController() {
  const levels: QualityLevel[] = ['low', 'medium', 'high']
  let index = 2, previous: number | undefined, start: number | undefined, frames = 0
  let slowMs = 0, fastMs = 0, changedAt = -Infinity
  return {
    get profile() { return QUALITY_PROFILES[levels[index]] },
    resetTiming() { previous = undefined; start = undefined; frames = 0; slowMs = 0; fastMs = 0 },
    frame(now: number) {
      if (!Number.isFinite(now)) return
      if (previous === undefined || now - previous > 250 || now <= previous) {
        previous = now; start = now; frames = 0; slowMs = 0; fastMs = 0; return
      }
      previous = now; frames++
      const elapsed = now - start!
      if (elapsed < 1000) return
      const fps = frames * 1000 / elapsed
      frames = 0; start = now
      slowMs = fps < 45 ? slowMs + elapsed : 0
      fastMs = fps > 57 ? fastMs + elapsed : 0
      if (now - changedAt < 5000) return
      const next = slowMs >= 2000 ? Math.max(0, index - 1) : fastMs >= 8000 ? Math.min(2, index + 1) : index
      if (next === index) return
      index = next; changedAt = now; slowMs = 0; fastMs = 0
      return QUALITY_PROFILES[levels[index]]
    },
  }
}
