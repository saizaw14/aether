import type { InteractionInput } from '../input/types'
export type { InteractionInput } from '../input/types'

export function createMouseInput(canvas: HTMLCanvasElement) {
  const input: InteractionInput = { x: 0, y: 0, active: false, visible: false }
  let activePointer: number | null = null
  const hide = () => { input.visible = false }
  const update = (event: PointerEvent) => {
    if (!event.isPrimary || (activePointer !== null && event.pointerId !== activePointer)) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    input.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    input.y = 1 - ((event.clientY - rect.top) / rect.height) * 2
    input.visible = true
  }
  const release = (event?: PointerEvent) => {
    if (event && activePointer !== null && event.pointerId !== activePointer) return
    const captured = activePointer
    activePointer = null
    input.active = false
    if (captured !== null && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured)
    if (event) {
      const rect = canvas.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) hide()
    } else hide()
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || activePointer !== null) return
    update(event)
    activePointer = event.pointerId
    input.active = true
    canvas.setPointerCapture(event.pointerId)
  }
  const leave = () => { if (!input.active) hide() }
  const blur = () => release()

  canvas.addEventListener('pointermove', update)
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointerleave', leave)
  canvas.addEventListener('lostpointercapture', release)
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
  window.addEventListener('blur', blur)
  return { input, sample: () => input, reset: () => release(), dispose() {
    release()
    canvas.removeEventListener('pointermove', update)
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('pointerleave', leave)
    canvas.removeEventListener('lostpointercapture', release)
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', release)
    window.removeEventListener('blur', blur)
  } }
}

export function stepParticles(positions: Float32Array, target: Float32Array, input: InteractionInput,
  worldX: number, worldY: number, strength: number, dt: number, time: number, reduced: boolean) {
  const follow = 1 - Math.exp(-dt * (reduced ? 5 : 2.2))
  const angle = reduced ? 0 : Math.sin(time * 0.08) * 0.14
  const cos = Math.cos(angle), sin = Math.sin(angle)
  for (let i = 0; i < positions.length; i += 3) {
    const phase = i * 0.17
    const drift = reduced ? 0 : 0.12
    let x = target[i] * cos - target[i + 1] * sin + Math.sin(time * 0.25 + phase) * drift
    let y = target[i] * sin + target[i + 1] * cos + Math.cos(time * 0.22 + phase) * drift
    const z = target[i + 2]
    if (input.active) {
      const distance = Math.hypot(positions[i] - worldX, positions[i + 1] - worldY)
      const influence = Math.max(0, 1 - distance / 3.2) * strength * (input.attraction ?? 1) * 0.92
      x += (worldX - x) * influence
      y += (worldY - y) * influence
    }
    positions[i] += (x - positions[i]) * follow
    positions[i + 1] += (y - positions[i + 1]) * follow
    positions[i + 2] += (z - positions[i + 2]) * follow
  }
}
