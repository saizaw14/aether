export interface Landmark { x: number; y: number; z: number }
export interface TrackedHand { landmarks: Landmark[]; handedness: string; confidence: number }
export interface TrackingFrame { hands: TrackedHand[]; timestamp: number; aspectRatio?: number }
// Raw model coordinates stay unmirrored. Both preview and input use this one transform.
export function displayPoint(point: Landmark, mirrored: boolean) {
  return { x: mirrored ? 1 - point.x : point.x, y: point.y }
}
export function interactionPoint(point: Landmark, mirrored: boolean) {
  const screen = displayPoint(point, mirrored)
  return { x: screen.x * 2 - 1, y: 1 - screen.y * 2 }
}
// MediaPipe's 21-landmark hand topology; no runtime library import needed in the UI.
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
] as const
export function drawTrackingPreview(canvas: HTMLCanvasElement, image: ImageBitmap, frame: TrackingFrame, mirrored: boolean) {
  if (canvas.width !== image.width) canvas.width = image.width
  if (canvas.height !== image.height) canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  if (mirrored) { ctx.translate(width, 0); ctx.scale(-1, 1) }
  ctx.drawImage(image, 0, 0, width, height)
  ctx.restore()
  for (const [index, hand] of frame.hands.entries()) {
    const color = index === 0 ? '#7be6ec' : '#dc9df0'
    const points = hand.landmarks.map(p => displayPoint(p, mirrored))
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, width / 300)
    ctx.beginPath()
    for (const [a, b] of HAND_CONNECTIONS) {
      if (!points[a] || !points[b]) continue
      ctx.moveTo(points[a].x * width, points[a].y * height)
      ctx.lineTo(points[b].x * width, points[b].y * height)
    }
    ctx.stroke()
    for (const p of points) { ctx.beginPath(); ctx.arc(p.x * width, p.y * height, width / 180, 0, Math.PI * 2); ctx.fill() }
  }
}
