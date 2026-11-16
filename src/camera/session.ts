import type { TrackingFrame } from './landmarks'

export type CameraPhase = 'off' | 'permission' | 'initializing' | 'loading' | 'ready' | 'failure'
export interface CameraState {
  phase: CameraPhase
  permission: 'not-requested' | 'requesting' | 'granted' | 'denied' | 'unknown'
  message: string
  recovery?: string
}
export const cameraOff: CameraState = { phase: 'off', permission: 'not-requested', message: 'Camera is off.' }
interface Dependencies {
  getStream: () => Promise<MediaStream>
  createWorker: () => Worker
  bitmap: (video: HTMLVideoElement) => Promise<ImageBitmap>
  schedule: (callback: FrameRequestCallback) => number
  cancel: (id: number) => void
  assetBase?: string
  wantsPreview?: () => boolean
  now?: () => number
  onInference?: (now: number, durationMs?: number) => void
  onTracking?: (frame: TrackingFrame, image?: ImageBitmap) => void
}
export function cameraFailure(error: unknown, stage: CameraPhase): Pick<CameraState, 'message' | 'recovery'> {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotSupportedError') return {
    message: 'Camera access is unavailable in this browser or page.', recovery: 'Open Aether on HTTPS or localhost in a browser with camera support, then retry.',
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') return {
    message: 'Camera permission was denied.', recovery: 'Allow camera access in your browser’s site settings, then try again. Mouse mode is still available.',
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return {
    message: 'No usable camera was found.', recovery: 'Connect or enable a camera, then try again.',
  }
  if (name === 'NotReadableError' || name === 'AbortError') return {
    message: 'The camera could not be opened. It may be in use.', recovery: 'Close other apps or tabs using the camera, check system permissions, then try again.',
  }
  if (stage === 'loading') return {
    message: 'The hand model could not load.', recovery: 'Check your internet connection and reload the page to fetch Aether’s local tracking assets, then retry.',
  }
  return { message: 'Camera tracking could not start or was interrupted.', recovery: 'Check your camera connection and browser support, then retry. Mouse mode remains available.' }
}

// Each enable owns its resources. Late permission results cannot resurrect a cancelled session.
export function createCameraSession(video: HTMLVideoElement, publish: (state: CameraState) => void, deps: Dependencies) {
  let pendingCapture: Promise<void> | undefined
  let generation = 0
  let cleanup: (() => void) | undefined
  let disposed = false
  let phase: CameraPhase = 'off'
  let permission: CameraState['permission'] = 'not-requested'
  const emit = (state: CameraState) => { phase = state.phase; if (!disposed) publish(state) }
  const stop = () => { generation++; const release = cleanup; cleanup = undefined; release?.() }
  const disable = () => { stop(); emit({ ...cameraOff, permission }) }
  const enable = async () => {
    if (disposed || ['permission', 'initializing', 'loading', 'ready'].includes(phase)) return
    stop()
    const token = generation
    const current = () => !disposed && token === generation
    let stream: MediaStream | undefined
    let worker: Worker | undefined
    let frame = 0
    let timeout: ReturnType<typeof setTimeout> | undefined
    let cancelVideo: (() => void) | undefined
    let released = false
    let started = false
    let inFlight: number | undefined
    let busy = false
    let lastFrame = -1
    let lastTime = -100
    const ended = () => fail(new Error('Camera disconnected'))
    cleanup = () => {
      if (released) return
      released = true
      if (timeout) clearTimeout(timeout)
      deps.cancel(frame)
      worker?.terminate()
      stream?.getTracks().forEach(track => { track.removeEventListener('ended', ended); track.stop() })
      cancelVideo?.()
      video.pause(); video.srcObject = null
      try { deps.onTracking?.({ hands: [], timestamp: 0 }) } catch { /* Teardown must finish even if a consumer fails. */ }
    }
    const fail = (error: unknown) => {
      if (!current()) return
      const details = cameraFailure(error, phase)
      if (error instanceof Error && ['NotAllowedError', 'SecurityError'].includes(error.name)) permission = 'denied'
      if (permission === 'requesting') permission = 'unknown'
      stop(); emit({ phase: 'failure', permission, ...details })
    }
    const watchdog = (ms: number) => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => fail(new Error('Initialization timed out')), ms)
    }
    permission = 'requesting'
    emit({ phase: 'permission', permission, message: 'Waiting for camera permission…' })
    try {
      // Browsers cannot cancel a permission prompt. Wait for its late result to
      // be released before making another request after Disable → Enable.
      if (pendingCapture) await pendingCapture
      if (!current()) return
      const request = deps.getStream()
      const settled = request.then(() => {}, () => {})
      pendingCapture = settled
      try { stream = await request } finally { if (pendingCapture === settled) pendingCapture = undefined }
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return }
      permission = 'granted'
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', ended))
      emit({ phase: 'initializing', permission, message: 'Initializing camera…' })
      watchdog(15000)
      video.srcObject = stream
      const videoReady = new Promise<void>((resolve, reject) => {
        const loaded = () => { if (video.readyState >= 2) { remove(); resolve() } }
        const failed = () => { remove(); reject(new Error('Video unavailable')) }
        const remove = () => { video.removeEventListener('loadeddata', loaded); video.removeEventListener('error', failed) }
        cancelVideo = () => { remove(); reject(new Error('Cancelled')) }
        video.addEventListener('loadeddata', loaded); video.addEventListener('error', failed)
        loaded()
      })
      await Promise.all([video.play(), videoReady])
      if (!current()) return
      emit({ phase: 'loading', permission, message: 'Loading hand model…' })
      watchdog(45000)
      worker = deps.createWorker()
      worker.onerror = () => fail(new Error('Tracking worker failed'))
      const process = async (now: number) => {
        if (!current()) return
        frame = deps.schedule(process)
        if (busy || now - lastTime < 100 || video.readyState < 2 || video.currentTime === lastFrame) return
        busy = true; lastTime = now; lastFrame = video.currentTime
        try {
          const image = await deps.bitmap(video)
          if (!current()) { image.close(); return }
          inFlight = now
          worker!.postMessage({ type: 'frame', image, timestamp: now, returnImage: deps.wantsPreview?.() ?? true }, [image])
          watchdog(15000)
        } catch (error) { fail(error) }
      }
      worker.onmessage = (event: MessageEvent<TrackingFrame & { type: string; message?: string; image?: ImageBitmap; inferenceMs?: number }>) => {
        if (!current()) { event.data.image?.close(); return }
        if (event.data.type === 'error') { fail(new Error(event.data.message)); return }
        if (event.data.type === 'loaded' && !started) {
          started = true
          if (timeout) clearTimeout(timeout)
          emit({ phase: 'initializing', permission, message: 'Starting local frame processing…' })
          watchdog(15000)
          frame = deps.schedule(process)
        }
        if (event.data.type === 'result') {
          if (!busy || inFlight === undefined || event.data.timestamp !== inFlight) { event.data.image?.close(); return }
          inFlight = undefined
          if (timeout) clearTimeout(timeout)
          busy = false
          try {
            deps.onInference?.(deps.now?.() ?? performance.now(), event.data.inferenceMs)
            deps.onTracking?.({ hands: event.data.hands ?? [], timestamp: event.data.timestamp, aspectRatio: event.data.aspectRatio }, event.data.image) }
          catch (error) { fail(error) }
          finally { event.data.image?.close() }
          if (current() && phase !== 'ready') emit({ phase: 'ready', permission, message: 'Camera ready · frames processed locally.' })
        }
      }
      worker.postMessage({ type: 'load', assetBase: deps.assetBase })
    } catch (error) { fail(error) }
  }
  return { enable, disable, dispose() { disposed = true; stop() } }
}
