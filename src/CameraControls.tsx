import { useEffect, useRef, useState } from 'react'
import { cameraOff, createCameraSession } from './camera/session'
import type { CameraState } from './camera/session'
import { drawTrackingPreview } from './camera/landmarks'
import { createGestureEngine, GESTURE_SENSITIVITY_PRESETS } from './gestures/engine'
import type { GestureEngine, GestureResult, GestureSensitivity } from './gestures/engine'
import { createTrackingFeedback } from './input/feedback'
import type { ControlMode, TrackingStatus } from './input/feedback'
import type { PerformanceMonitor } from './performance/monitor'
import type { GestureStatus } from './input/types'

interface Props {
  monitor: PerformanceMonitor
  showDebug: boolean
  onDebugChange: (visible: boolean) => void
  mode: ControlMode
  paused: boolean
  gestureStatus: GestureStatus
  onModeChange: (mode: ControlMode) => void
  onPauseChange: (paused: boolean) => void
  onGestures?: (result: GestureResult) => void
  onCameraState?: (state: CameraState) => void
}
export default function CameraControls({ monitor, showDebug, onDebugChange, mode, paused, gestureStatus, onModeChange, onPauseChange, onGestures, onCameraState }: Props) {
  const sensitivity = useRef<GestureSensitivity>('balanced')
  const [sensitivityName, setSensitivityName] = useState<GestureSensitivity>('balanced')
  const engine = useRef<GestureEngine | null>(null)
  const observer = useRef(onGestures)
  const stateObserver = useRef(onCameraState)
  const previousTracking = useRef<TrackingStatus>('Searching')
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('Searching')
  useEffect(() => { observer.current = onGestures; stateObserver.current = onCameraState }, [onGestures, onCameraState])
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const previewEnabled = useRef(false)
  const mirrored = useRef(true)
  const [showPreview, setShowPreview] = useState(false)
  const [mirrorPreview, setMirrorPreview] = useState(true)
  const session = useRef<ReturnType<typeof createCameraSession> | null>(null)
  const [state, setState] = useState<CameraState>(cameraOff)
  useEffect(() => {
    if (!video.current) return
    const tracking = createTrackingFeedback()
    const gestures = createGestureEngine({ mirrored: mirrored.current, ...GESTURE_SENSITIVITY_PRESETS[sensitivity.current] })
    engine.current = gestures
    let mounted = true
    let receivedAt = 0
    const publishTracking = (next: TrackingStatus) => {
      if (mounted && previousTracking.current !== next) { previousTracking.current = next; setTrackingStatus(next) }
    }
    const deliver = (result: GestureResult) => {
      observer.current?.(result)
      publishTracking(tracking.update(result))
    }
    const controller = createCameraSession(video.current, next => {
      if (next.phase === 'permission' || next.phase === 'off' || next.phase === 'failure') { publishTracking(tracking.reset()); monitor.clearTracking() }
      setState(next); stateObserver.current?.(next)
    }, {
      getStream: () => {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return Promise.reject(new DOMException('Camera requires HTTPS or localhost', 'NotSupportedError'))
        return navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 }, facingMode: 'user' } })
      },
      createWorker: () => new Worker(new URL('./camera/tracker.worker.ts', import.meta.url), { type: 'module' }),
      bitmap: source => createImageBitmap(source),
      wantsPreview: () => previewEnabled.current,
      onInference: (now, duration) => monitor.tracked(now, duration),
      assetBase: new URL(`${import.meta.env.BASE_URL}tracking/mediapipe-1.2.3/`, window.location.href).href,
      onTracking: (frame, image) => {
        if (frame.timestamp === 0) { receivedAt = 0; publishTracking(tracking.reset()); deliver(gestures.reset()) }
        else {
          receivedAt = performance.now()
          deliver(gestures.update({ ...frame, aspectRatio: frame.aspectRatio ?? 4 / 3 }))
        }
        if (!canvas.current) return
        if (image && previewEnabled.current) drawTrackingPreview(canvas.current, image, frame, mirrored.current)
        else if (frame.timestamp === 0) canvas.current.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height)
      },
      schedule: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id),
    })
    session.current = controller
    const expiry = window.setInterval(() => {
      const now = performance.now()
      if (receivedAt && now - receivedAt >= gestures.settings.trackingLossMs) {
        receivedAt = 0
        deliver(gestures.advance(now))
      }
    }, 100)
    const leave = () => controller.disable()
    window.addEventListener('pagehide', leave)
    return () => { mounted = false; window.clearInterval(expiry); window.removeEventListener('pagehide', leave); controller.dispose(); session.current = null; engine.current = null }
  }, [monitor])
  const active = !['off', 'failure'].includes(state.phase)
  const displayedTracking = state.phase === 'ready' ? trackingStatus : active ? 'Searching' : 'Camera off'
  return <section className="camera-panel" aria-label="Interaction controls">
    <div className="camera-heading"><span className="control-label">CONTROLS</span><span className="camera-badge">Video only · local</span></div>
    <div className="segmented mode-selector" role="group" aria-label="Control mode">
      <button type="button" aria-pressed={mode === 'mouse'} onClick={() => onModeChange('mouse')}>Mouse</button>
      <button type="button" aria-pressed={mode === 'hand'} onClick={() => onModeChange('hand')}>Hand</button>
    </div>
    <dl className="live-feedback" role="status" aria-live="polite" aria-atomic="true">
      <div><dt>Tracking</dt><dd>{displayedTracking}</dd></div>
      <div><dt>Gesture</dt><dd className="gesture-value">{gestureStatus}</dd></div>
    </dl>
    <button type="button" className="pause-hands" disabled={mode !== 'hand'}
      data-paused={paused} aria-describedby="hand-control-hint" onClick={() => onPauseChange(!paused)}>
      {paused ? 'Resume hand interaction' : 'Pause hand interaction'}
    </button>
    <p id="hand-control-hint" className="control-hint">{mode === 'mouse' ? 'Mouse controls active. Hand gestures are ignored.' : paused ? 'Paused. Camera and preview stay on; mouse drag still works.' : state.phase !== 'ready' ? 'Enable camera below to begin. Mouse drag still works.' : 'Open your hand first, then pinch. Mouse drag can take over.'}</p>
    {state.phase !== 'ready' && state.phase !== 'off' && <p className="camera-status" role="status">{state.message}</p>}
    {state.recovery && <p className="camera-recovery">{state.recovery}</p>}
    <div className="camera-actions">
      <button type="button" disabled={active} onClick={() => void session.current?.enable()}>{state.phase === 'failure' ? 'Retry · Enable Camera' : 'Enable Camera'}</button>
      <button type="button" disabled={!active} onClick={() => session.current?.disable()}>Disable Camera</button>
    </div>
    <div className="preview-options">
      <label><input type="checkbox" checked={showPreview} aria-controls="camera-preview" onChange={event => {
        previewEnabled.current = event.target.checked
        setShowPreview(event.target.checked)
        if (!event.target.checked) canvas.current?.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height)
      }} /> Show camera preview</label>
    </div>
    <div id="camera-preview" className="tracking-preview" hidden={!showPreview}>
      <canvas ref={canvas} aria-label="Camera preview with hand landmarks" />
      <span>{state.phase === 'ready' ? trackingStatus : 'Enable camera to see landmarks'}</span>
    </div>
    <details className="guidance-details">
      <summary>Gesture guide</summary>
      <ol>
        <li><strong>Pinch.</strong> Show an open hand, then bring thumb and index together to gather.</li>
        <li><strong>Drag.</strong> Move while pinching. Open your hand to release the particles.</li>
        <li><strong>Transform.</strong> Open both hands, then pinch both. Spread to scale; turn the line between them to rotate.</li>
      </ol>
      <p>After tracking loss or resume, open before pinching again. Controls are relative to the screen.</p>
      <p className="keyboard-hint">Tab between controls. Enter/Space activates buttons and guides; arrow keys adjust sliders and selects.</p>
    </details>
    <details className="guidance-details">
      <summary>Camera settings</summary>
      <p className="camera-permission">Permission: {state.permission.replace('-', ' ')}</p>
      <div className="preview-options">
        <label><input type="checkbox" checked={mirrorPreview} onChange={event => {
          mirrored.current = event.target.checked
          observer.current?.(engine.current?.reset() ?? { timestamp: 0, accepted: true, hands: [], events: [] })
          engine.current?.configure({ mirrored: event.target.checked })
          setMirrorPreview(event.target.checked)
          canvas.current?.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height)
        }} /> Mirror preview and hand coordinates</label>
      </div>
      <label className="gesture-settings">Gesture sensitivity
        <select value={sensitivityName} onChange={event => {
          const next = event.target.value as GestureSensitivity
          sensitivity.current = next
          setSensitivityName(next)
          engine.current?.configure(GESTURE_SENSITIVITY_PRESETS[next])
        }}>
          <option value="gentle">Gentle</option><option value="balanced">Balanced</option><option value="precise">Precise</option>
        </select>
      </label>
    </details>
    <label className="debug-toggle"><input type="checkbox" checked={showDebug} onChange={event => onDebugChange(event.target.checked)} /> Show performance debug</label>
    <p className="camera-privacy">Frames stay on this device. Pause stops hand control; Disable Camera stops capture.</p>
    <video ref={video} muted playsInline className="camera-source" aria-hidden="true" />
  </section>
}
