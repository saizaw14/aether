import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

let tracker: HandLandmarker | undefined
self.onmessage = async (event: MessageEvent<{ type: string; image?: ImageBitmap; timestamp: number }>) => {
  const { type, image, timestamp } = event.data
  try {
    if (type === 'load') {
      const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm', true)
      tracker = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
      })
      self.postMessage({ type: 'loaded' })
    } else if (type === 'frame' && image && tracker) {
      tracker.detectForVideo(image, timestamp)
      // No frame or landmarks leave this worker. Gesture mapping comes later.
      self.postMessage({ type: 'result' })
    }
  } catch {
    tracker?.close(); tracker = undefined
    self.postMessage({ type: 'error', message: 'Local model initialization or processing failed' })
  } finally { image?.close() }
}
// Termination releases the worker's WASM heap and model even during initialization.
