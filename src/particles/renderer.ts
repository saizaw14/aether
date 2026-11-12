import * as THREE from 'three'
import { generateFormation, PARTICLE_COUNT } from './formations'
import type { Formation } from './formations'
import { createMouseInput, stepParticles } from './interaction'

export function createParticleRenderer(host: HTMLElement, marker: HTMLElement, onError: () => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.z = 16
  let target = generateFormation('nebula')
  const positions = target.slice()
  const geometry = new THREE.BufferGeometry()
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
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)
  renderer.domElement.setAttribute('aria-label', 'Interactive particle universe. Hold and drag to gather particles.')
  host.appendChild(renderer.domElement)
  const mouse = createMouseInput(renderer.domElement, marker)
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let strength = 0.65
  let frame = 0
  let previous = 0
  let time = 0
  let stopped = false
  const resize = () => {
    const { width, height } = host.getBoundingClientRect()
    camera.aspect = width / Math.max(height, 1)
    // Give portrait screens enough room for the entire formation.
    camera.position.z = camera.aspect < 1 ? 16 / camera.aspect : 16
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    material.uniforms.pixelRatio.value = renderer.getPixelRatio()
    renderer.setSize(width, height)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  const lost = (event: Event) => { event.preventDefault(); stopped = true; cancelAnimationFrame(frame); onError() }
  renderer.domElement.addEventListener('webglcontextlost', lost)
  const animate = (now: number) => {
    if (stopped) return
    const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0
    previous = now
    if (!motion.matches) time += dt
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z
    stepParticles(positions, target, mouse.input, mouse.input.x * halfHeight * camera.aspect,
      mouse.input.y * halfHeight, strength, dt, time, motion.matches)
    position.needsUpdate = true
    try { renderer.render(scene, camera) } catch { stopped = true; onError(); return }
    frame = requestAnimationFrame(animate)
  }
  frame = requestAnimationFrame(animate)
  return {
    setFormation(formation: Formation) { target = generateFormation(formation) },
    setStrength(value: number) { strength = value },
    reset() { mouse.reset(); time = 0; target = generateFormation('nebula'); strength = 0.65 },
    dispose() {
      stopped = true; cancelAnimationFrame(frame); observer.disconnect(); mouse.dispose()
      renderer.domElement.removeEventListener('webglcontextlost', lost)
      geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
export type ParticleRenderer = ReturnType<typeof createParticleRenderer>
