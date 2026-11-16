import type { ControlPreferences } from '../input/feedback'
import type { GestureStatus } from '../input/types'
export type QualityLevel = 'high' | 'medium' | 'low'
function rateCounter() {
  let times: number[] = [], first: number | undefined
  return {
    record(now: number) {
      if (!Number.isFinite(now) || (times.length && now <= times[times.length - 1])) return
      first ??= now; times.push(now)
      while (times.length && times[0] < now - 1000) times.shift()
    },
    read(now: number) {
      if (first === undefined) return 0
      const count = times.reduce((sum, time) => sum + Number(time >= now - 1000 && time <= now), 0)
      return count * 1000 / Math.max(250, Math.min(1000, now - first))
    },
    clear() { times = []; first = undefined },
  }
}
/** Mutable samples only. Reading the optional overlay never drives rendering or inference. */
export function createPerformanceMonitor() {
  const render = rateCounter(), tracking = rateCounter()
  let inferenceMs: number | null = null, lastTracking = -Infinity
  let controls: ControlPreferences = { mode: 'mouse', paused: false, cameraReady: false }
  let source = 'Mouse', gesture: GestureStatus = 'ready', quality: QualityLevel = 'high', particles = 5000
  return {
    rendered: (now: number) => render.record(now),
    tracked(now: number, duration?: number) {
      tracking.record(now); lastTracking = now
      inferenceMs = Number.isFinite(duration) && duration! >= 0 ? duration! : null
    },
    clearTracking() { tracking.clear(); inferenceMs = null; lastTracking = -Infinity },
    setControls(next: ControlPreferences) { controls = { ...next } },
    interaction(nextSource: string, nextGesture: GestureStatus) { source = nextSource; gesture = nextGesture },
    quality(level: QualityLevel, count: number) { quality = level; particles = count },
    snapshot(now: number) {
      return {
        fps: render.read(now), trackingHz: tracking.read(now), inferenceMs: now - lastTracking < 1500 ? inferenceMs : null,
        mode: controls.mode === 'hand' && controls.paused ? `Hand paused · ${source}` : `${source} · ${gesture}`,
        quality, particles,
      }
    },
  }
}
export type PerformanceMonitor = ReturnType<typeof createPerformanceMonitor>
