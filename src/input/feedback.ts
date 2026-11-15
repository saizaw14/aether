import type { GestureResult } from '../gestures/engine'
import type { GestureStatus, InteractionInput } from './types'

export type ControlMode = 'mouse' | 'hand'
export interface ControlPreferences { mode: ControlMode; paused: boolean; cameraReady: boolean }
export function handControlsEnabled(preferences: ControlPreferences) {
  return preferences.mode === 'hand' && preferences.cameraReady && !preferences.paused
}
export type TrackingStatus = 'Searching' | 'One hand' | 'Two hands' | 'Tracking lost'
/** Presence feedback stays independent of pinch state and whether hand input is paused. */
export function createTrackingFeedback() {
  let seen = false
  let status: TrackingStatus = 'Searching'
  return {
    update(result: GestureResult): TrackingStatus {
      if (!result.accepted) return status
      const count = result.hands.filter(hand => hand.present).length
      if (count > 0) seen = true
      status = count >= 2 ? 'Two hands' : count === 1 ? 'One hand' : seen ? 'Tracking lost' : 'Searching'
      return status
    },
    reset(): TrackingStatus { seen = false; status = 'Searching'; return status },
  }
}
export function appliedGestureStatus(input: InteractionInput, transforming: boolean): GestureStatus {
  return transforming ? 'transforming' : input.active && (input.attraction ?? 1) > 0 ? 'gathering' : 'ready'
}
