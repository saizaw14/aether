import { useEffect, useRef, useState } from 'react'
import { cameraOff, createCameraSession } from './camera/session'
import type { CameraState } from './camera/session'
import { drawTrackingPreview } from './camera/landmarks'

export default function CameraControls() {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const previewEnabled = useRef(false)
  const mirrored = useRef(true)
  const [showPreview, setShowPreview] = useState(false)
  const [mirrorPreview, setMirrorPreview] = useState(true)
  const [handCount, setHandCount] = useState(0)
  const previousCount = useRef(0)
  const session = useRef<ReturnType<typeof createCameraSession> | null>(null)
  const [state, setState] = useState<CameraState>(cameraOff)
  useEffect(() => {
    if (!video.current) return
    const controller = createCameraSession(video.current, setState, {
      getStream: () => {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return Promise.reject(new DOMException('Camera requires HTTPS or localhost', 'NotSupportedError'))
        return navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 }, facingMode: 'user' } })
      },
      createWorker: () => new Worker(new URL('./camera/tracker.worker.ts', import.meta.url), { type: 'module' }),
      bitmap: source => createImageBitmap(source),
      assetBase: new URL(`${import.meta.env.BASE_URL}tracking/mediapipe-1.2.3/`, window.location.href).href,
      onTracking: (frame, image) => {
        if (previousCount.current !== frame.hands.length) {
          previousCount.current = frame.hands.length
          setHandCount(frame.hands.length)
        }
        if (!canvas.current) return
        if (image && previewEnabled.current) drawTrackingPreview(canvas.current, image, frame, mirrored.current)
        else canvas.current.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height)
      },
      schedule: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id),
    })
    session.current = controller
    const leave = () => controller.disable()
    window.addEventListener('pagehide', leave)
    return () => { window.removeEventListener('pagehide', leave); controller.dispose(); session.current = null }
  }, [])
  const active = !['off', 'failure'].includes(state.phase)
  return <section className="camera-panel" aria-label="Camera controls">
    <div className="camera-heading"><span className="control-label">CAMERA</span><span className="camera-badge">{state.phase === 'ready' ? 'Ready' : 'Optional'}</span></div>
    <p className="camera-status" role="status" aria-live="polite">{state.message}</p>
    <p className="camera-permission">Permission: {state.permission.replace('-', ' ')}</p>
    {state.recovery && <p className="camera-recovery">{state.recovery}</p>}
    <div className="camera-actions"><button disabled={active} onClick={() => void session.current?.enable()}>{state.phase === 'failure' ? 'Retry · Enable Camera' : 'Enable Camera'}</button><button disabled={!active} onClick={() => session.current?.disable()}>Disable Camera</button></div>
    <div className="preview-options">
      <label><input type="checkbox" checked={showPreview} onChange={event => {
        previewEnabled.current = event.target.checked
        setShowPreview(event.target.checked)
      }} /> Show camera preview</label>
      <label><input type="checkbox" checked={mirrorPreview} onChange={event => {
        mirrored.current = event.target.checked
        setMirrorPreview(event.target.checked)
        canvas.current?.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height)
      }} /> Mirror view</label>
    </div>
    <div className="tracking-preview" hidden={!showPreview}>
      <canvas ref={canvas} aria-label="Camera preview with hand landmarks" />
      <span>{state.phase === 'ready' ? `${handCount} / 2 hands detected` : 'Enable camera to see landmarks'}</span>
    </div>
    <p className="camera-hands" role="status">{state.phase === 'ready' ? `${handCount} ${handCount === 1 ? 'hand' : 'hands'} detected` : 'Tracks up to two hands'}</p>
    <p className="camera-privacy">Video only. Frames stay on this device.<br />{state.phase === 'ready' ? 'Tracker ready. Use the mouse to shape particles.' : 'Mouse controls remain available.'}</p>
    <video ref={video} muted playsInline className="camera-source" aria-hidden="true" />
  </section>
}
