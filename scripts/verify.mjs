// Node contract tests. GPU output and browser UI are deliberately not simulated as proof of visual correctness.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import * as THREE from 'three'
const modules = new Map()
function moduleURL(path) {
  if (modules.has(path)) return modules.get(path)
  let code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
  }).outputText
  code = code.replace(/from '\.\/(formations|interaction)'/g, (_, name) => `from '${moduleURL(`src/particles/${name}.ts`)}'`)
  if (path.endsWith('renderer.ts')) code = code.replace("import * as THREE from 'three';", 'const THREE = globalThis.testThree;')
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  modules.set(path, url)
  return url
}
const { generateFormation } = await import(moduleURL('src/particles/formations.ts'))
const { stepParticles, createMouseInput } = await import(moduleURL('src/particles/interaction.ts'))
const idle = { x: 0, y: 0, active: false, visible: true }
const error = (a, b) => a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0)
function evolve(start, target, hz, active, strength = .9) {
  const p = start.slice()
  for (let n = 0; n < hz * 3; n++) stepParticles(p, target, { ...idle, active }, 0, 0, strength, 1 / hz, 0, true)
  return p
}
test('both formations are finite, deterministic, distinct, and converge in both directions', () => {
  const n = generateFormation('nebula'), g = generateFormation('galaxy')
  for (const p of [n, g]) { assert.equal(p.length, 15000); assert.ok(p.every(Number.isFinite)) }
  assert.deepEqual(n, generateFormation('nebula'))
  assert.ok(error(n, g) > 1000)
  assert.ok(error(evolve(n, g, 60, false), g) < .001)
  assert.ok(error(evolve(g, n, 60, false), n) < .001)
})
test('attraction gathers local particles, zero strength is inert, release returns, frame rates agree', () => {
  const target = new Float32Array([1, 1, 0, 5, 5, 0])
  const gathered = evolve(target, target, 60, true)
  assert.ok(Math.hypot(gathered[0], gathered[1]) < 1)
  assert.equal(gathered[3], 5)
  assert.deepEqual(evolve(target, target, 60, true, 0), target)
  assert.ok(error(evolve(gathered, target, 60, false), target) < .00001)
  const a = evolve(target, target, 30, true), b = evolve(target, target, 144, true)
  assert.ok(Math.max(...a.map((v, i) => Math.abs(v - b[i]))) < .02)
})
class Surface extends EventTarget {
  style = {}; dataset = {}; captures = new Set(); children = []
  rect = { left: 10, top: 20, width: 800, height: 600, right: 810, bottom: 620 }
  getBoundingClientRect() { return this.rect }
  setPointerCapture(id) { this.captures.add(id) }
  hasPointerCapture(id) { return this.captures.has(id) }
  releasePointerCapture(id) { this.captures.delete(id) }
  appendChild(child) { this.children.push(child); child.parent = this }
  remove() { this.parent.children = this.parent.children.filter(c => c !== this) }
  setAttribute() {}
}
function pointer(surface, type, props = {}) {
  const event = new Event(type)
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 410, clientY: 320 }, props)
  surface.dispatchEvent(event)
}
test('mouse normalization, drag, primary-pointer ownership, release outside, blur, reset, disposal', () => {
  globalThis.window = new Surface()
  const canvas = new Surface(), marker = new Surface()
  const mouse = createMouseInput(canvas, marker)
  pointer(canvas, 'pointermove')
  assert.equal(mouse.input.x, 0); assert.equal(mouse.input.y, 0)
  pointer(canvas, 'pointerdown', { button: 2 }); assert.equal(mouse.input.active, false)
  pointer(canvas, 'pointerdown'); assert.equal(mouse.input.active, true)
  pointer(canvas, 'pointermove', { clientX: 610 }); assert.equal(mouse.input.x, .5)
  pointer(canvas, 'pointermove', { pointerId: 2, isPrimary: false, clientX: 10 })
  pointer(window, 'pointerup', { pointerId: 2 }); assert.equal(mouse.input.active, true); assert.equal(mouse.input.x, .5)
  pointer(window, 'pointerup', { clientX: 1000 }); assert.equal(mouse.input.active, false); assert.equal(mouse.input.visible, false)
  assert.equal(canvas.captures.size, 0)
  pointer(canvas, 'pointerdown'); window.dispatchEvent(new Event('blur')); assert.equal(mouse.input.active, false)
  pointer(canvas, 'pointerdown'); mouse.reset(); assert.equal(mouse.input.active, false)
  pointer(canvas, 'pointerdown'); pointer(window, 'pointercancel'); assert.equal(mouse.input.active, false)
  mouse.dispose(); pointer(canvas, 'pointerdown'); assert.equal(mouse.input.active, false)
})
test('renderer sizing, density cap, switching/reset and Strict Mode style cleanup (mock GPU)', async () => {
  let renderer, resizeCallback, disposed = false, contextLost = false, observerDisconnected = false
  globalThis.window = new Surface(); window.devicePixelRatio = 3; window.matchMedia = () => ({ matches: true })
  globalThis.ResizeObserver = class { constructor(callback) { resizeCallback = callback } observe() {} disconnect() { observerDisconnected = true } }
  const frames = new Map(); let id = 0
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id }
  globalThis.cancelAnimationFrame = key => frames.delete(key)
  globalThis.testThree = { ...THREE, WebGLRenderer: class {
    domElement = new Surface(); ratio = 1
    constructor() { renderer = this }
    setPixelRatio(v) { this.ratio = v } getPixelRatio() { return this.ratio }
    setSize(w, h) { this.size = [w, h] }
    render(scene, camera) { this.scene = scene; this.camera = camera }
    dispose() { disposed = true } forceContextLoss() { contextLost = true }
  } }
  const { createParticleRenderer } = await import(moduleURL('src/particles/renderer.ts'))
  const host = new Surface(), marker = new Surface()
  const engine = createParticleRenderer(host, marker, () => assert.fail('unexpected renderer failure'))
  const tick = time => { const [key, callback] = frames.entries().next().value; frames.delete(key); callback(time) }
  assert.equal(host.children.length, 1); assert.equal(frames.size, 1); assert.equal(renderer.ratio, 1.75)
  tick(1000); const points = renderer.scene.children[0]
  const start = points.geometry.attributes.position.array.slice()
  engine.setFormation('galaxy'); for (let i = 1; i <= 180; i++) tick(1000 + i * 1000 / 60)
  assert.ok(error(points.geometry.attributes.position.array, generateFormation('galaxy')) < .001)
  engine.reset(); for (let i = 181; i <= 360; i++) tick(1000 + i * 1000 / 60)
  assert.ok(error(points.geometry.attributes.position.array, start) < .001)
  host.rect.width = 300; host.rect.height = 700; resizeCallback(); tick(8000)
  assert.equal(renderer.camera.aspect, 300 / 700); assert.ok(Number.isFinite(renderer.camera.position.z))
  host.rect.width = 0; resizeCallback(); assert.ok(Number.isFinite(renderer.camera.position.z))
  let geometryDisposed = false, materialDisposed = false
  points.geometry.addEventListener('dispose', () => { geometryDisposed = true })
  points.material.addEventListener('dispose', () => { materialDisposed = true })
  engine.dispose()
  assert.ok(disposed && contextLost && observerDisconnected && geometryDisposed && materialDisposed)
  assert.equal(frames.size, 0); assert.equal(host.children.length, 0)
  const again = createParticleRenderer(host, marker, () => {})
  assert.equal(frames.size, 1); assert.equal(host.children.length, 1); again.dispose()
})

const { createCameraSession, cameraFailure } = await import(moduleURL('src/camera/session.ts'))
function cameraHarness(getStream, overrides = {}) {
  let stopped = 0, terminated = 0, paused = 0
  const states = [], frames = new Map()
  const track = new EventTarget(); track.stop = () => { stopped++ }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const video = new EventTarget()
  Object.assign(video, { readyState: 2, currentTime: 1, play: async () => {}, pause: () => { paused++ }, srcObject: null })
  const worker = { postMessage: message => { worker.last = message }, terminate: () => { terminated++ } }
  let serial = 0
  const session = createCameraSession(video, state => states.push(state), {
    getStream: getStream || (async () => stream), createWorker: () => worker,
    bitmap: async () => ({ close() {} }),
    schedule: cb => { frames.set(++serial, cb); return serial }, cancel: id => frames.delete(id),
    ...overrides,
  })
  return { session, states, stream, track, video, worker, frames, counts: () => ({ stopped, terminated, paused }) }
}
test('camera lifecycle: permission, initialization, model loading, actual ready response, disable and retry', async () => {
  const h = cameraHarness()
  await h.session.enable()
  assert.deepEqual(h.states.map(s => s.phase), ['permission', 'initializing', 'loading'])
  assert.equal(h.video.srcObject, h.stream)
  h.worker.onmessage({ data: { type: 'loaded' } })
  assert.equal(h.states.at(-1).phase, 'initializing')
  h.worker.onmessage({ data: { type: 'result' } })
  assert.equal(h.states.at(-1).phase, 'ready')
  h.session.disable()
  assert.equal(h.states.at(-1).phase, 'off')
  assert.equal(h.video.srcObject, null); assert.equal(h.frames.size, 0)
  assert.equal(h.counts().stopped, 1); assert.equal(h.counts().terminated, 1)
  await h.session.enable(); h.session.dispose()
  assert.equal(h.counts().stopped, 2); assert.equal(h.counts().terminated, 2)
})
test('camera errors offer specific recovery and model failure shuts down camera', async () => {
  for (const [name, pattern] of [['NotAllowedError', /denied/], ['NotFoundError', /No usable/], ['NotReadableError', /in use/]]) {
    const e = new Error(); e.name = name
    const h = cameraHarness(async () => { throw e })
    await h.session.enable()
    assert.equal(h.states.at(-1).phase, 'failure'); assert.match(h.states.at(-1).message, pattern)
    assert.ok(h.states.at(-1).recovery)
    if (name === 'NotAllowedError') assert.equal(h.states.at(-1).permission, 'denied')
    h.session.dispose()
  }
  const h = cameraHarness(); await h.session.enable()
  h.worker.onmessage({ data: { type: 'error' } })
  assert.match(h.states.at(-1).message, /model could not load/)
  assert.equal(h.counts().stopped, 1); assert.equal(h.counts().terminated, 1)
  assert.ok(cameraFailure(new Error(), 'ready').recovery)
  h.session.dispose()
})
test('disable/unmount during permission and model loading cannot resurrect camera', async () => {
  let grant
  const h = cameraHarness(() => new Promise(resolve => { grant = resolve }))
  const pending = h.session.enable()
  h.session.disable(); grant(h.stream); await pending
  assert.equal(h.counts().stopped, 1); assert.equal(h.video.srcObject, null)
  assert.equal(h.states.at(-1).phase, 'off')
  h.session.dispose()
  const loading = cameraHarness(); await loading.session.enable()
  const count = loading.states.length
  loading.session.dispose()
  loading.worker.onmessage({ data: { type: 'loaded' } })
  assert.equal(loading.states.length, count); assert.equal(loading.frames.size, 0)
  assert.equal(loading.counts().terminated, 1); assert.equal(loading.counts().stopped, 1)
})
test('camera disconnect is a recoverable failure and stops local resources', async () => {
  const h = cameraHarness(); await h.session.enable()
  h.worker.onmessage({ data: { type: 'loaded' } }); h.worker.onmessage({ data: { type: 'result' } })
  h.track.dispatchEvent(new Event('ended'))
  assert.equal(h.states.at(-1).phase, 'failure')
  assert.equal(h.counts().stopped, 1); assert.equal(h.frames.size, 0)
  h.session.dispose()
})

test('inference is single-flight and unchanged decoded video frames are skipped', async () => {
  let snapshots = 0, closed = 0, results = 0
  const h = cameraHarness(undefined, {
    bitmap: async () => { snapshots++; return { close() { closed++ } } },
    onTracking: () => { results++ },
  })
  await h.session.enable()
  h.worker.onmessage({ data: { type: 'loaded' } })
  const tick = async now => {
    const [key, callback] = h.frames.entries().next().value
    h.frames.delete(key); callback(now); await Promise.resolve()
  }
  await tick(1000); assert.equal(snapshots, 1)
  h.video.currentTime = 2
  await tick(1200); assert.equal(snapshots, 1) // Pending worker result owns the only request.
  const image = { close() { closed++ } }
  h.worker.onmessage({ data: { type: 'result', hands: [], timestamp: 1000, image } })
  assert.equal(closed, 1); assert.equal(results, 1)
  await tick(1300); assert.equal(snapshots, 2)
  h.worker.onmessage({ data: { type: 'result', hands: [], timestamp: 1300 } })
  await tick(1500); assert.equal(snapshots, 2) // No newly decoded video frame.
  h.video.currentTime = 3
  await tick(1510); assert.equal(snapshots, 3)
  h.session.disable()
  h.worker.onmessage({ data: { type: 'result', hands: [], image } })
  assert.equal(closed, 2) // Even stale transferred frames must be released.
  h.session.dispose()
})

test('preview and normalized interaction coordinates share the same mirror transform', async () => {
  const { displayPoint, interactionPoint, drawTrackingPreview, HAND_CONNECTIONS } = await import(moduleURL('src/camera/landmarks.ts'))
  const landmark = { x: .2, y: .3, z: -.1 }
  for (const mirrored of [false, true]) {
    const screen = displayPoint(landmark, mirrored), input = interactionPoint(landmark, mirrored)
    assert.equal((input.x + 1) / 2, screen.x)
    assert.equal((1 - input.y) / 2, screen.y)
  }
  assert.equal(displayPoint(landmark, true).x, .8)
  assert.equal(HAND_CONNECTIONS.length, 21)
  const calls = []
  const ctx = { clearRect() {}, save() {}, restore() {}, translate(...a) { calls.push(['translate', ...a]) }, scale(...a) { calls.push(['scale', ...a]) }, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc(...a) { calls.push(['arc', ...a]) }, fill() {} }
  const canvas = { width: 0, height: 0, getContext: () => ctx }
  const hand = { landmarks: Array.from({ length: 21 }, () => landmark), handedness: 'Left', confidence: .9 }
  drawTrackingPreview(canvas, { width: 640, height: 480 }, { hands: [hand, hand], timestamp: 1 }, true)
  assert.equal(calls.filter(c => c[0] === 'arc').length, 42)
  assert.deepEqual(calls.find(c => c[0] === 'scale'), ['scale', -1, 1])
  assert.equal(calls.find(c => c[0] === 'arc')[1], 512) // Mirrored 0.2 → 0.8 of 640.
})
