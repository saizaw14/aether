import * as THREE from 'three'
import { generateFormation, PARTICLE_COUNT } from './formations'
import type { Formation } from './formations'
import { createMouseInput, stepParticles } from './interaction'
import { selectInteraction } from '../input/hand'
import { appliedGestureStatus } from '../input/feedback'
import { createQualityController } from '../performance/quality'
import type { PerformanceMonitor } from '../performance/monitor'
import type { GestureStatus, InteractionSource } from '../input/types'

export function createParticleRenderer(host: HTMLElement, marker: HTMLElement, onError: () => void, handSource?: InteractionSource, onGestureStatus?: (status: GestureStatus) => void, monitor?: PerformanceMonitor) {
  const releases: Array<() => void> = []
  let frame = 0, stopped = false, disposed = false
  const release = () => {
    if (disposed) return
    monitor?.interaction('Stopped', 'ready')
    disposed = true; stopped = true; cancelAnimationFrame(frame); frame = 0
    for (const cleanup of releases.reverse()) { try { cleanup() } catch { /* Finish remaining cleanup even after context loss. */ } }
  }
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
    releases.push(() => { renderer.dispose(); renderer.forceContextLoss() })
    const quality = createQualityController()
    let particleCount = PARTICLE_COUNT
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.z = 16
    let target = generateFormation('nebula')
    const positions = target.slice()
    const geometry = new THREE.BufferGeometry()
    releases.push(() => geometry.dispose())
    const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', position)
    const colors = new Float32Array(PARTICLE_COUNT * 3)
    const sizes = new Float32Array(PARTICLE_COUNT)
    const palette = ['#64e5ed', '#8b79ed', '#d794d7', '#b2e9f4']
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const color = new THREE.Color(palette[i % 13 < 6 ? 0 : i % 13 < 10 ? 1 : i % 13 < 12 ? 2 : 3])
      color.toArray(colors, i * 3)
      sizes[i] = 1.6 + ((i * 37) % 100) / 100 * 3.6
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { pixelRatio: { value: 1 } },
      vertexShader: `attribute float size; uniform float pixelRatio; varying vec3 vColor;
        void main() { vColor = color; vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p; gl_PointSize = clamp(size * pixelRatio * 16.0 / -p.z, 1.0, 14.0); }`,
      fragmentShader: `varying vec3 vColor; void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-d*d*4.5) * 0.5 + exp(-d*d*32.0) * 0.5;
        gl_FragColor = vec4(vColor, glow * (1.0 - smoothstep(0.65, 1.0, d)) * 0.78); }`,
    })
    releases.push(() => material.dispose())
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    renderer.domElement.setAttribute('aria-label', 'Interactive particle universe. Hold and drag to gather particles.')
    host.appendChild(renderer.domElement)
    releases.push(() => renderer.domElement.remove())
    const mouse = createMouseInput(renderer.domElement)
    releases.push(() => mouse.dispose())
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let strength = 0.65
    let previous = 0
    let time = 0
    let gestureStatus: GestureStatus = 'ready'
    const report = (next: GestureStatus) => {
      if (next !== gestureStatus) { gestureStatus = next; onGestureStatus?.(next) }
    }
    let viewportWidth = 1
    let viewportHeight = 1
    const resize = () => {
      const { width, height } = host.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      viewportWidth = width; viewportHeight = height
      camera.aspect = width / height
      // Give portrait screens enough room for the entire formation.
      camera.position.z = camera.aspect < 1 ? 16 / camera.aspect : 16
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.profile.pixelRatio))
      material.uniforms.pixelRatio.value = renderer.getPixelRatio()
      renderer.setSize(width, height)
    }
    const observer = new ResizeObserver(resize)
    releases.push(() => observer.disconnect())
    observer.observe(host)
    resize()
    const lost = (event: Event) => { event.preventDefault(); report('ready'); release(); onError() }
    renderer.domElement.addEventListener('webglcontextlost', lost)
    releases.push(() => renderer.domElement.removeEventListener('webglcontextlost', lost))
    const animate = (now: number) => {
      frame = 0
      if (stopped) return
      try {
        const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0
        previous = now
        if (quality.frame(now)) resize()
        particleCount += (quality.profile.particles - particleCount) * (1 - Math.exp(-dt * 4))
        if (Math.abs(particleCount - quality.profile.particles) < 1) particleCount = quality.profile.particles
        const activeCount = Math.ceil(particleCount)
        geometry.setDrawRange(0, activeCount)
        monitor?.quality(quality.profile.level, activeCount)
        if (!motion.matches) time += dt
        const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z
        if (mouse.input.active) {
          if (handSource?.interrupt) handSource.interrupt()
          else handSource?.reset()
        }
        const hand = handSource?.sample(now, dt, camera.aspect)
        const input = hand?.transform?.active ? hand : selectInteraction(mouse.sample(), hand)
        const applied = appliedGestureStatus(input, Boolean(hand?.transform?.active))
        report(applied)
        monitor?.interaction(hand?.transform?.active ? 'Two-hand' : input === hand ? 'Hand' : 'Mouse', applied)
        marker.style.transform = `translate(${(input.x + 1) * viewportWidth / 2}px, ${(1 - input.y) * viewportHeight / 2}px)`
        marker.style.opacity = String(input.visible ? input.opacity ?? 1 : 0)
        marker.dataset.visible = String(input.visible)
        marker.dataset.active = String(input.active)
        stepParticles(positions, target, input, input.x * halfHeight * camera.aspect,
          input.y * halfHeight, strength, dt, time, motion.matches, hand?.transform, activeCount)
        position.needsUpdate = true
        renderer.render(scene, camera)
        monitor?.rendered(now)
        schedule()
      } catch { release(); report('ready'); onError() }
    }
    const hidden = () => typeof document !== 'undefined' && document.hidden
    const schedule = () => { if (!stopped && !frame && !hidden()) frame = requestAnimationFrame(animate) }
    const visibility = () => {
      cancelAnimationFrame(frame); frame = 0; previous = 0; quality.resetTiming()
      mouse.reset(); handSource?.interrupt?.(); report('ready')
      schedule()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', visibility)
      releases.push(() => document.removeEventListener('visibilitychange', visibility))
    }
    schedule()
    return {
      setFormation(formation: Formation) { target = generateFormation(formation) },
      setStrength(value: number) { strength = value },
      reset() { report('ready'); mouse.reset(); handSource?.reset(); time = 0; target = generateFormation('nebula'); strength = 0.65 },
      dispose() {
        if (disposed) return
        report('ready'); handSource?.reset(); release()
      },
    }
  } catch (error) { release(); throw error }
}
export type ParticleRenderer = ReturnType<typeof createParticleRenderer>
