import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { TrackedHand } from './landmarks'

let tracker: HandLandmarker | undefined
let loading = false
let previousTimestamp = -1
self.onmessage = async (event: MessageEvent<{ type: string; image?: ImageBitmap; timestamp: number; assetBase?: string }>) => {
  const { type, timestamp, assetBase } = event.data
  let image = event.data.image
  try {
    if (type === 'load' && !loading && !tracker) {
      loading = true
      const files = await FilesetResolver.forVisionTasks(`${assetBase}wasm`, true)
      tracker = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${assetBase}hand_landmarker.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      })
      self.postMessage({ type: 'loaded' })
    } else if (type === 'frame' && image && tracker) {
      if (timestamp <= previousTimestamp) throw new Error('Non-monotonic frame timestamp')
      previousTimestamp = timestamp
      const result = tracker.detectForVideo(image, timestamp)
      const hands: TrackedHand[] = result.landmarks.slice(0, 2).map((landmarks, i) => ({
        landmarks, handedness: result.handedness[i]?.[0]?.categoryName ?? 'Unknown',
        confidence: result.handedness[i]?.[0]?.score ?? 0,
      }))
      // Return the exact analyzed frame, so the overlay cannot drift onto a newer video frame.
      self.postMessage({ type: 'result', hands, timestamp, aspectRatio: image.width / image.height, image }, { transfer: [image] })
      image = undefined // Ownership transferred to the main thread, which closes it after drawing.
    }
  } catch {
    tracker?.close(); tracker = undefined
    self.postMessage({ type: 'error', message: 'Local model initialization or processing failed' })
  } finally { image?.close() }
}
// Worker termination releases its WASM heap/model, including pending initialization.
