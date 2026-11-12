// Input contract is independent of React and the renderer. Future hand input can
// supply the same normalized position and active state without changing physics.
export interface InteractionInput { x: number; y: number; active: boolean; visible: boolean }
export function createMouseInput(canvas: HTMLCanvasElement, marker: HTMLElement) {
  const input: InteractionInput = { x: 0, y: 0, active: false, visible: false }
  const update = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    input.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    input.y = 1 - ((event.clientY - rect.top) / rect.height) * 2
    input.visible = true
    marker.style.transform = `translate(${event.clientX - rect.left}px, ${event.clientY - rect.top}px)`
    marker.dataset.visible = 'true'
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary) return
    update(event); input.active = true
    canvas.setPointerCapture(event.pointerId)
    marker.dataset.active = 'true'
  }
  const release = () => { input.active = false; marker.dataset.active = 'false' }
  const leave = () => { if (!input.active) { input.visible = false; marker.dataset.visible = 'false' } }
  canvas.addEventListener('pointermove', update)
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointerleave', leave)
  canvas.addEventListener('lostpointercapture', release)
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
  window.addEventListener('blur', release)
  return { input, reset: release, dispose() {
    canvas.removeEventListener('pointermove', update)
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('pointerleave', leave)
    canvas.removeEventListener('lostpointercapture', release)
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', release)
    window.removeEventListener('blur', release)
  } }
}

export function stepParticles(positions: Float32Array, target: Float32Array, input: InteractionInput,
  worldX: number, worldY: number, strength: number, dt: number, time: number, reduced: boolean) {
  const follow = 1 - Math.exp(-dt * (reduced ? 5 : 2.2))
  for (let i = 0; i < positions.length; i += 3) {
    const phase = i * 0.17
    const drift = reduced ? 0 : 0.12
    const angle = reduced ? 0 : Math.sin(time * 0.08) * 0.14
    let x = target[i] * Math.cos(angle) - target[i + 1] * Math.sin(angle) + Math.sin(time * 0.25 + phase) * drift
    let y = target[i] * Math.sin(angle) + target[i + 1] * Math.cos(angle) + Math.cos(time * 0.22 + phase) * drift
    const z = target[i + 2]
    if (input.active) {
      const distance = Math.hypot(positions[i] - worldX, positions[i + 1] - worldY)
      const influence = Math.max(0, 1 - distance / 3.2) * strength * 0.92
      x += (worldX - x) * influence
      y += (worldY - y) * influence
    }
    positions[i] += (x - positions[i]) * follow
    positions[i + 1] += (y - positions[i + 1]) * follow
    positions[i + 2] += (z - positions[i + 2]) * follow
  }
}
