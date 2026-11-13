import { interactionPoint } from '../camera/landmarks'
import type { Landmark, TrackedHand } from '../camera/landmarks'

export interface GestureSettings {
  mirrored: boolean
  pinchStart: number
  pinchRelease: number
  positionSmoothingMs: number
  pinchSmoothingMs: number
  trackingLossMs: number
  associationMaxDistance: number
  handednessPenalty: number
  minHandConfidence: number
}
export const DEFAULT_GESTURE_SETTINGS: Readonly<GestureSettings> = Object.freeze({
  mirrored: true, pinchStart: 0.28, pinchRelease: 0.42,
  positionSmoothingMs: 80, pinchSmoothingMs: 35, trackingLossMs: 300,
  associationMaxDistance: 0.4, handednessPenalty: 0.12, minHandConfidence: 0.5,
})
export const GESTURE_SENSITIVITY_PRESETS = {
  gentle: { pinchStart: 0.34, pinchRelease: 0.50, positionSmoothingMs: 100 },
  balanced: { pinchStart: 0.28, pinchRelease: 0.42, positionSmoothingMs: 80 },
  precise: { pinchStart: 0.20, pinchRelease: 0.34, positionSmoothingMs: 65 },
} as const
export type GestureSensitivity = keyof typeof GESTURE_SENSITIVITY_PRESETS
export interface GestureFrame { hands: TrackedHand[]; timestamp: number; aspectRatio: number }
export type GestureEvent = {
  type: 'tracking-acquired' | 'tracking-lost' | 'pinch-start' | 'pinch-release'
  handId: number
  timestamp: number
  reason?: 'opened' | 'tracking-lost' | 'reset'
}
export interface HandGesture {
  id: number
  present: boolean
  handedness: string
  confidence: number
  /** Smoothed, mirrored when configured, [-1,1] with Y up. */
  position: { x: number; y: number }
  /** Aspect-corrected normalized image units, never pixels. */
  pinchDistance: number
  handSize: number
  normalizedPinchDistance: number
  smoothedPinchDistance: number
  pinching: boolean
  pinch: 'idle' | 'start' | 'hold' | 'release'
}
export interface GestureResult { timestamp: number; accepted: boolean; hands: HandGesture[]; events: GestureEvent[] }
interface Measurement {
  palm: Landmark
  position: Landmark
  pinchDistance: number
  handSize: number
  ratio: number
  hand: TrackedHand
}
interface Track {
  id: number
  lastSeen: number
  present: boolean
  measurement: Measurement
  position: Landmark
  velocity: { x: number; y: number }
  ratio: number
  pinching: boolean
}
function validate(settings: GestureSettings) {
  const numbers = Object.entries(settings).filter(([key]) => key !== 'mirrored').map(([, value]) => value)
  if (numbers.some(v => !Number.isFinite(v)) || typeof settings.mirrored !== 'boolean' ||
      settings.pinchStart <= 0 || settings.pinchRelease <= settings.pinchStart ||
      settings.positionSmoothingMs < 0 || settings.pinchSmoothingMs < 0 || settings.trackingLossMs <= 0 ||
      settings.associationMaxDistance <= 0 || settings.handednessPenalty < 0 ||
      settings.minHandConfidence < 0 || settings.minHandConfidence > 1) {
    throw new RangeError('Invalid gesture settings: use positive start < release, nonnegative smoothing, and positive tracking limits.')
  }
}
function measure(hand: TrackedHand, aspect: number, confidence: number): Measurement | undefined {
  if (!Number.isFinite(hand.confidence) || hand.confidence < confidence || hand.landmarks.length !== 21 ||
      hand.landmarks.some(p => !p || ![p.x, p.y, p.z].every(Number.isFinite))) return
  const p = hand.landmarks
  // MediaPipe X/Z are relative to image width; Y is relative to image height.
  const distance = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y, (a.z - b.z) * aspect)
  const handSize = (distance(p[5], p[17]) + distance(p[0], p[9])) / 2
  if (handSize < 1e-5) return
  const palm = { x: 0, y: 0, z: 0 }
  for (const i of [0, 5, 9, 13, 17]) { palm.x += p[i].x / 5; palm.y += p[i].y / 5; palm.z += p[i].z / 5 }
  const position = { x: (p[4].x + p[8].x) / 2, y: (p[4].y + p[8].y) / 2, z: (p[4].z + p[8].z) / 2 }
  const pinchDistance = distance(p[4], p[8])
  return { palm, position, pinchDistance, handSize, ratio: pinchDistance / handSize, hand }
}
const alpha = (dt: number, ms: number) => ms === 0 ? 1 : 1 - Math.exp(-dt / ms)

/** Stateful interpretation only: no DOM, MediaPipe runtime, timers, React, or renderer. */
export function createGestureEngine(initial: Partial<GestureSettings> = {}) {
  let settings = { ...DEFAULT_GESTURE_SETTINGS, ...initial }
  validate(settings)
  let tracks: Track[] = []
  let nextId = 1
  let lastTimestamp = -Infinity
  const snapshot = (timestamp: number, events: GestureEvent[], accepted = true): GestureResult => ({
    timestamp, accepted, events,
    hands: tracks.map(track => {
      const projected = interactionPoint(track.position, settings.mirrored)
      const start = events.some(e => e.handId === track.id && e.type === 'pinch-start')
      const release = events.some(e => e.handId === track.id && e.type === 'pinch-release')
      return {
        id: track.id, present: track.present, handedness: track.measurement.hand.handedness,
        confidence: track.measurement.hand.confidence,
        position: { x: Math.max(-1, Math.min(1, projected.x)), y: Math.max(-1, Math.min(1, projected.y)) },
        pinchDistance: track.measurement.pinchDistance, handSize: track.measurement.handSize,
        normalizedPinchDistance: track.measurement.ratio, smoothedPinchDistance: track.ratio,
        pinching: track.present && track.pinching,
        pinch: !track.present ? 'idle' : start ? 'start' : release ? 'release' : track.pinching ? 'hold' : 'idle',
      }
    }),
  })
  const lose = (track: Track, timestamp: number, events: GestureEvent[], reason: 'tracking-lost' | 'reset') => {
    if (track.pinching) events.push({ type: 'pinch-release', handId: track.id, timestamp, reason })
    events.push({ type: 'tracking-lost', handId: track.id, timestamp, reason })
  }
  const expire = (timestamp: number, events: GestureEvent[]) => {
    tracks = tracks.filter(track => {
      if (timestamp - track.lastSeen < settings.trackingLossMs) return true
      lose(track, timestamp, events, 'tracking-lost'); return false
    })
  }
  const checkTime = (timestamp: number) => {
    if (!Number.isFinite(timestamp) || timestamp < 0) throw new RangeError('Gesture timestamps must be finite nonnegative milliseconds.')
    return timestamp > lastTimestamp
  }
  return {
    get settings(): Readonly<GestureSettings> { return { ...settings } },
    configure(changes: Partial<GestureSettings>) {
      const next = { ...settings, ...changes }; validate(next); settings = next
    },
    update(frame: GestureFrame): GestureResult {
      const { timestamp, aspectRatio } = frame
      if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) throw new RangeError('A positive camera aspectRatio is required.')
      if (!checkTime(timestamp)) return snapshot(lastTimestamp, [], false)
      lastTimestamp = timestamp
      const events: GestureEvent[] = []
      expire(timestamp, events)
      const measurements = frame.hands.slice(0, 2).flatMap(hand => {
        const measurement = measure(hand, aspectRatio, settings.minHandConfidence)
        return measurement ? [measurement] : []
      })
      // Exhaustive global assignment is tiny (at most two hands), and avoids greedy ID swaps.
      let bestCost = Infinity
      let best: number[] = []
      const assign = (index: number, used: Set<number>, assignment: number[], cost: number) => {
        if (index === measurements.length) {
          if (cost < bestCost) { bestCost = cost; best = assignment.slice() }
          return
        }
        assign(index + 1, used, [...assignment, -1], cost + settings.associationMaxDistance)
        const m = measurements[index]
        tracks.forEach((track, i) => {
          if (used.has(i)) return
          const dt = Math.min(timestamp - track.lastSeen, 150)
          const predicted = { x: track.measurement.palm.x + track.velocity.x * dt, y: track.measurement.palm.y + track.velocity.y * dt }
          const distance = Math.hypot((predicted.x - m.palm.x) * aspectRatio, predicted.y - m.palm.y)
          if (distance > settings.associationMaxDistance) return
          const mismatch = track.measurement.hand.handedness !== m.hand.handedness ? settings.handednessPenalty : 0
          const sizeChange = Math.abs(Math.log(m.handSize / track.measurement.handSize)) * 0.05
          used.add(i)
          assign(index + 1, used, [...assignment, i], cost + distance + mismatch + sizeChange)
          used.delete(i)
        })
      }
      assign(0, new Set(), [], 0)
      tracks.forEach(track => { track.present = false })
      measurements.forEach((m, i) => {
        let track = best[i] === -1 ? undefined : tracks[best[i]]
        if (!track) {
          track = { id: nextId++, lastSeen: timestamp, present: true, measurement: m, position: { ...m.position }, velocity: { x: 0, y: 0 }, ratio: m.ratio, pinching: false }
          tracks.push(track)
          events.push({ type: 'tracking-acquired', handId: track.id, timestamp })
        } else {
          const dt = timestamp - track.lastSeen
          const a = alpha(dt, settings.positionSmoothingMs)
          track.velocity = {
            x: track.velocity.x * 0.5 + (m.palm.x - track.measurement.palm.x) / dt * 0.5,
            y: track.velocity.y * 0.5 + (m.palm.y - track.measurement.palm.y) / dt * 0.5,
          }
          for (const axis of ['x', 'y', 'z'] as const) track.position[axis] += (m.position[axis] - track.position[axis]) * a
          track.ratio += (m.ratio - track.ratio) * alpha(dt, settings.pinchSmoothingMs)
          track.measurement = m; track.lastSeen = timestamp; track.present = true
        }
        if (!track.pinching && track.ratio <= settings.pinchStart) {
          track.pinching = true; events.push({ type: 'pinch-start', handId: track.id, timestamp })
        } else if (track.pinching && track.ratio >= settings.pinchRelease) {
          track.pinching = false; events.push({ type: 'pinch-release', handId: track.id, timestamp, reason: 'opened' })
        }
      })
      return snapshot(timestamp, events)
    },
    /** Call using the same monotonic clock if inference stalls; no internal timer to leak. */
    advance(timestamp: number): GestureResult {
      if (!checkTime(timestamp)) return snapshot(lastTimestamp, [], false)
      lastTimestamp = timestamp
      const events: GestureEvent[] = []
      expire(timestamp, events)
      return snapshot(timestamp, events)
    },
    reset(): GestureResult {
      const timestamp = Number.isFinite(lastTimestamp) ? lastTimestamp : 0
      const events: GestureEvent[] = []
      tracks.forEach(track => lose(track, timestamp, events, 'reset'))
      tracks = []; lastTimestamp = -Infinity
      return snapshot(timestamp, events)
    },
  }
}
export type GestureEngine = ReturnType<typeof createGestureEngine>
