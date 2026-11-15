// Node contract tests. GPU output and browser UI are deliberately not simulated as proof of visual correctness.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import * as THREE from 'three'
const modules = new Map()
function moduleURL(pathname) {
  if (modules.has(pathname)) return modules.get(pathname)
  let code = ts.transpileModule(fs.readFileSync(pathname, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
  }).outputText
  code = code.replace(/from '(\.[^']+)'/g, (_, name) => `from '${moduleURL(path.resolve(path.dirname(pathname), name + '.ts'))}'`)
  if (pathname.endsWith('renderer.ts')) code = code.replace("import * as THREE from 'three';", 'const THREE = globalThis.testThree;')
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  modules.set(pathname, url)
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
  const canvas = new Surface()
  const mouse = createMouseInput(canvas)
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

const { createGestureEngine, DEFAULT_GESTURE_SETTINGS } = await import(moduleURL('src/gestures/engine.ts'))
function syntheticHand({ x = .5, y = .4, ratio = .6, scale = 1, aspect = 1, label = 'Left', confidence = .99 } = {}) {
  const point = (dx, dy) => ({ x: x + dx * scale / aspect, y: y + dy * scale, z: 0 })
  const landmarks = Array.from({ length: 21 }, () => point(0, 0))
  landmarks[0] = point(0, .2)
  landmarks[5] = point(-.09, 0); landmarks[9] = point(0, 0)
  landmarks[13] = point(.04, 0); landmarks[17] = point(.09, 0)
  landmarks[4] = point(-ratio * .19 / 2, -.08); landmarks[8] = point(ratio * .19 / 2, -.08)
  return { landmarks, handedness: label, confidence }
}
const gestureFrame = (timestamp, hands, aspectRatio = 1) => ({ timestamp, hands, aspectRatio })
const pinchEvents = result => result.events.filter(e => e.type.startsWith('pinch-')).map(e => e.type)
test('gesture pinch metrics are invariant to hand scale and image aspect; mirrored position agrees', () => {
  for (const aspect of [.6, 1, 16 / 9]) for (const scale of [.5, 1, 1.5]) {
    const e = createGestureEngine({ mirrored: false })
    const hand = e.update(gestureFrame(0, [syntheticHand({ ratio: .25, aspect, scale })], aspect)).hands[0]
    assert.ok(Math.abs(hand.normalizedPinchDistance - .25) < 1e-12)
    assert.ok(Math.abs(hand.handSize - .19 * scale) < 1e-12)
    assert.equal(hand.pinch, 'start')
    assert.equal(hand.position.x, 0)
    assert.ok(Math.abs(hand.position.y - (1 - (.4 - .08 * scale) * 2)) < 1e-12)
  }
  const e = createGestureEngine({ mirrored: false })
  const raw = e.update(gestureFrame(0, [syntheticHand({ x: .2 })])).hands[0].position
  e.configure({ mirrored: true })
  const mirror = e.update(gestureFrame(10, [syntheticHand({ x: .2 })])).hands[0].position
  assert.ok(Math.abs(mirror.x + raw.x) < 1e-12); assert.equal(mirror.y, raw.y)
})
test('pinch hysteresis emits one start/release, holds through threshold jitter, ignores replayed frames', () => {
  const e = createGestureEngine({ pinchSmoothingMs: 0 })
  const step = (t, ratio) => e.update(gestureFrame(t, [syntheticHand({ ratio })]))
  assert.deepEqual(pinchEvents(step(0, .6)), [])
  assert.deepEqual(pinchEvents(step(100, .25)), ['pinch-start'])
  for (const [t, ratio] of [[200, .29], [300, .4], [400, .27]]) {
    const r = step(t, ratio); assert.equal(r.hands[0].pinch, 'hold'); assert.deepEqual(pinchEvents(r), [])
  }
  const repeated = step(400, .9); assert.equal(repeated.accepted, false); assert.equal(repeated.events.length, 0)
  assert.deepEqual(pinchEvents(step(500, .5)), ['pinch-release'])
  assert.deepEqual(pinchEvents(step(600, .5)), [])
  assert.deepEqual(pinchEvents(step(550, .1)), [])
})
test('stable hand IDs survive reordered detections, label flicker, and a predicted crossing', () => {
  const e = createGestureEngine({ positionSmoothingMs: 0 })
  const left = x => syntheticHand({ x, label: 'Left' }), right = x => syntheticHand({ x, label: 'Right' })
  const first = e.update(gestureFrame(0, [left(.2), right(.8)]))
  const leftId = first.hands[0].id, rightId = first.hands[1].id
  const reordered = e.update(gestureFrame(100, [right(.65), left(.35)]))
  assert.equal(reordered.hands.find(h => h.handedness === 'Left').id, leftId)
  assert.equal(reordered.hands.find(h => h.handedness === 'Right').id, rightId)
  const crossed = e.update(gestureFrame(200, [right(.48), left(.52)]))
  assert.equal(crossed.hands.find(h => h.handedness === 'Left').id, leftId)
  assert.equal(crossed.hands.find(h => h.handedness === 'Right').id, rightId)
  const single = createGestureEngine()
  const id = single.update(gestureFrame(0, [left(.3)])).hands[0].id
  assert.equal(single.update(gestureFrame(100, [right(.31)])).hands[0].id, id)
})
test('dropouts suspend activity, retain ID briefly, then release and lose once; timeout/reset are safe', () => {
  const e = createGestureEngine({ pinchSmoothingMs: 0 })
  const start = e.update(gestureFrame(0, [syntheticHand({ ratio: .2 })])); const id = start.hands[0].id
  const missing = e.update(gestureFrame(100, []))
  assert.equal(missing.hands[0].present, false); assert.equal(missing.hands[0].pinching, false)
  assert.equal(missing.events.length, 0)
  const recovered = e.update(gestureFrame(200, [syntheticHand({ ratio: .2 })]))
  assert.equal(recovered.hands[0].id, id); assert.equal(recovered.hands[0].pinch, 'hold'); assert.equal(recovered.events.length, 0)
  const lost = e.advance(501)
  assert.deepEqual(lost.events.map(e => e.type), ['pinch-release', 'tracking-lost'])
  assert.equal(lost.hands.length, 0); assert.equal(e.advance(700).events.length, 0)
  const fresh = e.update(gestureFrame(800, [syntheticHand({ ratio: .2 })]))
  assert.notEqual(fresh.hands[0].id, id)
  assert.deepEqual(e.reset().events.map(e => e.type), ['pinch-release', 'tracking-lost'])
  assert.equal(e.reset().events.length, 0)
  assert.equal(e.update(gestureFrame(0, [syntheticHand()])).accepted, true)
})
test('time-based position smoothing reduces jitter and agrees across sample rates', () => {
  const run = hz => {
    const e = createGestureEngine({ mirrored: false, associationMaxDistance: 1 })
    e.update(gestureFrame(0, [syntheticHand({ x: .2 })]))
    let result
    for (let i = 1; i <= hz; i++) result = e.update(gestureFrame(i * 1000 / hz, [syntheticHand({ x: .4 })]))
    return result.hands[0].position.x
  }
  assert.ok(Math.abs(run(30) - run(120)) < 1e-6)
  const e = createGestureEngine({ mirrored: false })
  e.update(gestureFrame(0, [syntheticHand({ x: .2 })]))
  const next = e.update(gestureFrame(10, [syntheticHand({ x: .3 })])).hands[0]
  assert.ok(next.position.x > -.6 && next.position.x < -.4)
})
test('gesture settings and malformed measurements are validated without false pinches', () => {
  assert.ok(DEFAULT_GESTURE_SETTINGS.pinchStart < DEFAULT_GESTURE_SETTINGS.pinchRelease)
  assert.throws(() => createGestureEngine({ pinchStart: .5, pinchRelease: .4 }), RangeError)
  const e = createGestureEngine()
  assert.throws(() => e.configure({ positionSmoothingMs: -1 }), RangeError)
  assert.throws(() => e.update(gestureFrame(NaN, [])), RangeError)
  assert.throws(() => e.update(gestureFrame(0, [], 0)), RangeError)
  const zero = syntheticHand({ scale: 0 }), invalid = syntheticHand(); invalid.landmarks[8].x = NaN
  const r = e.update(gestureFrame(0, [zero, invalid])); assert.equal(r.hands.length, 0); assert.equal(r.events.length, 0)
  assert.equal(e.update(gestureFrame(100, [syntheticHand({ confidence: .1 })])).hands.length, 0)
})

test('sensitivity presets remain valid and can tune a live engine without resetting IDs', async () => {
  const { GESTURE_SENSITIVITY_PRESETS } = await import(moduleURL('src/gestures/engine.ts'))
  for (const preset of Object.values(GESTURE_SENSITIVITY_PRESETS)) assert.doesNotThrow(() => createGestureEngine(preset))
  const e = createGestureEngine({ pinchSmoothingMs: 0 })
  const before = e.update(gestureFrame(0, [syntheticHand({ ratio: .3 })]))
  assert.equal(before.hands[0].pinching, false)
  e.configure(GESTURE_SENSITIVITY_PRESETS.gentle)
  const after = e.update(gestureFrame(100, [syntheticHand({ ratio: .3 })]))
  assert.equal(after.hands[0].id, before.hands[0].id)
  assert.deepEqual(pinchEvents(after), ['pinch-start'])
})

const { createHandInput, selectInteraction } = await import(moduleURL('src/input/hand.ts'))
function oneHandHarness() {
  const gestures = createGestureEngine({ pinchSmoothingMs: 0, positionSmoothingMs: 0, associationMaxDistance: 1 })
  const hand = createHandInput(); hand.setEnabled(true)
  return {
    hand,
    send(t, hands) { const result = gestures.update(gestureFrame(t, hands)); hand.update(result, t); return result },
    sample(t, dt = .1) { return { ...hand.sample(t, dt) } },
  }
}
test('one-hand control: open hover, deliberate pinch/drag, smooth release, shared particle physics', () => {
  const h = oneHandHarness()
  h.send(0, [syntheticHand({ x: .3 })])
  const hover = h.sample(0)
  assert.equal(hover.active, false); assert.equal(hover.visible, true)
  assert.ok(Math.abs(hover.x - .4) < 1e-10)
  h.send(100, [syntheticHand({ x: .3, ratio: .2 })])
  const pinch = h.sample(100)
  assert.ok(pinch.attraction > 0 && pinch.attraction < 1)
  h.send(200, [syntheticHand({ x: .5, ratio: .2 })])
  const moved = h.sample(200)
  assert.ok(moved.x < pinch.x && moved.x > -.001)
  assert.ok(moved.attraction > pinch.attraction)
  h.send(300, [syntheticHand({ x: .5, ratio: .6 })])
  const released = h.sample(300)
  assert.ok(released.attraction < moved.attraction && released.attraction > 0)
  const target = new Float32Array([1, 0, 0]), positions = target.slice()
  for (let i = 0; i < 60; i++) stepParticles(positions, target, pinch, 0, 0, 1, 1 / 60, 0, true)
  assert.ok(positions[0] < .9)
  for (let i = 1; i <= 300; i++) {
    const now = 300 + i * 1000 / 60
    const input = h.hand.sample(now, 1 / 60)
    stepParticles(positions, target, input, 0, 0, 1, 1 / 60, 0, true)
  }
  assert.ok(Math.abs(positions[0] - 1) < .001)
})
test('tracking loss fades in place, and reacquisition held closed cannot reactivate attraction', () => {
  const h = oneHandHarness()
  h.send(0, [syntheticHand({ x: .3 })]); h.sample(0)
  h.send(100, [syntheticHand({ x: .3, ratio: .2 })]); const before = h.sample(100)
  h.send(200, []); const lost = h.sample(200)
  assert.ok(lost.attraction > 0 && lost.attraction < before.attraction)
  assert.ok(lost.opacity < before.opacity)
  assert.equal(lost.x, before.x)
  h.send(250, [syntheticHand({ x: .7, ratio: .2 })]); const returned = h.sample(250, .05)
  assert.equal(returned.x, lost.x); assert.ok(returned.attraction < lost.attraction)
  let previous = returned.attraction
  for (let t = 350; t <= 1250; t += 100) {
    h.send(t, [syntheticHand({ x: .7, ratio: .2 })]); const input = h.sample(t)
    assert.ok(input.attraction <= previous); previous = input.attraction
  }
  assert.equal(previous, 0)
  h.send(1350, [syntheticHand({ x: .7, ratio: .6 })]); assert.equal(h.sample(1350).active, false)
  h.send(1450, [syntheticHand({ x: .7, ratio: .2 })]); assert.equal(h.sample(1450).active, true)
})
test('initial closed hand, stale input, resets, and camera re-enable all require open then a fresh pinch', () => {
  const h = oneHandHarness()
  h.send(0, [syntheticHand({ ratio: .2 })]); assert.equal(h.sample(0).active, false)
  h.send(100, [syntheticHand({ ratio: .35 })]); assert.equal(h.sample(100).active, false)
  h.send(200, [syntheticHand({ ratio: .6 })]); h.sample(200)
  h.send(300, [syntheticHand({ ratio: .2 })]); const active = h.sample(300); assert.ok(active.active)
  const stale = h.sample(600)
  assert.ok(stale.attraction < active.attraction)
  h.send(650, [syntheticHand({ ratio: .2 })]); assert.ok(h.sample(650).attraction < stale.attraction)
  h.hand.reset(); assert.equal(h.sample(660).active, false)
  h.send(750, [syntheticHand({ ratio: .2 })]); assert.equal(h.sample(750).active, false)
  h.hand.setEnabled(false); h.hand.setEnabled(true)
  h.send(850, [syntheticHand({ ratio: .2 })]); assert.equal(h.sample(850).active, false)
  h.send(950, [syntheticHand({ ratio: .6 })]); h.sample(950)
  h.send(1050, [syntheticHand({ ratio: .2 })]); assert.equal(h.sample(1050).active, true)
})
test('one selected hand stays primary; mouse drag wins and hover does not steal hand control', () => {
  const h = oneHandHarness()
  h.send(0, [syntheticHand({ x: .2, label: 'Left' }), syntheticHand({ x: .8, label: 'Right' })])
  const primary = h.sample(0)
  h.send(100, [syntheticHand({ x: .8, label: 'Right', ratio: .2 }), syntheticHand({ x: .2, label: 'Left' })])
  assert.equal(h.sample(100).active, false)
  h.send(200, [syntheticHand({ x: .8, label: 'Right', ratio: .2 })])
  const absent = h.sample(200)
  assert.equal(absent.x, primary.x)
  assert.equal(absent.active, false)
  const mouse = { ...idle, x: -.4 }, hand = { ...idle, x: .4, visible: true }
  assert.equal(selectInteraction(mouse, hand), hand)
  mouse.active = true; assert.equal(selectInteraction(mouse, hand), mouse)
  mouse.active = false; hand.visible = false; assert.equal(selectInteraction(mouse, hand), mouse)
})
test('hand fading agrees at 30/120 Hz and rejects invalid timing settings', () => {
  const fade = hz => {
    const h = oneHandHarness()
    h.send(0, [syntheticHand()]); h.sample(0)
    h.send(100, [syntheticHand({ ratio: .2 })]); h.sample(100)
    h.send(200, [])
    let input
    for (let i = 1; i <= hz / 2; i++) input = h.sample(200 + i * 1000 / hz, 1 / hz)
    return input
  }
  assert.ok(Math.abs(fade(30).attraction - fade(120).attraction) < 1e-10)
  assert.ok(Math.abs(fade(30).opacity - fade(120).opacity) < 1e-10)
  assert.throws(() => createHandInput({ staleMs: 0 }), RangeError)
})

test('renderer consumes hand input for the marker and particles; mouse capture overrides and clears it', async () => {
  let rendered, resets = 0
  globalThis.window = new Surface(); window.devicePixelRatio = 1; window.matchMedia = () => ({ matches: true })
  globalThis.ResizeObserver = class { observe() {} disconnect() {} }
  const frames = new Map(); let id = 0
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id }
  globalThis.cancelAnimationFrame = key => frames.delete(key)
  globalThis.testThree.WebGLRenderer = class {
    domElement = new Surface(); ratio = 1
    setPixelRatio(v) { this.ratio = v } getPixelRatio() { return this.ratio }
    setSize() {} render(scene) { rendered = scene.children[0] }
    dispose() {} forceContextLoss() {}
  }
  const { createParticleRenderer } = await import(moduleURL('src/particles/renderer.ts'))
  const host = new Surface(), marker = new Surface()
  const value = { x: .5, y: -.25, visible: true, active: false, attraction: 0, opacity: .4 }
  const source = { sample: () => value, reset() { resets++; value.active = false; value.visible = false; value.attraction = 0; value.opacity = 0 } }
  const statuses = []
  const renderer = createParticleRenderer(host, marker, () => assert.fail('render failed'), source, status => statuses.push(status))
  const tick = now => { const [key, callback] = frames.entries().next().value; frames.delete(key); callback(now) }
  tick(1000)
  assert.equal(marker.style.transform, 'translate(600px, 375px)'); assert.equal(marker.style.opacity, '0.4')
  const original = rendered.geometry.attributes.position.array.slice()
  Object.assign(value, { x: 0, y: 0, active: true, attraction: 1 })
  for (let i = 1; i <= 60; i++) tick(1000 + i * 1000 / 60)
  assert.ok(error(original, rendered.geometry.attributes.position.array) > 1)
  assert.deepEqual(statuses, ['gathering']) // A hold does not send feedback every frame.
  Object.assign(value, { active: false, attraction: 0 })
  for (let i = 61; i <= 240; i++) tick(1000 + i * 1000 / 60)
  assert.ok(error(original, rendered.geometry.attributes.position.array) < .001)
  Object.assign(value, { transform: { active: true, scale: 1.5, rotation: Math.PI / 4 } })
  for (let i = 241; i <= 420; i++) tick(1000 + i * 1000 / 60)
  const transformedTarget = original.slice(), cos = Math.cos(Math.PI / 4), sin = Math.sin(Math.PI / 4)
  for (let i = 0; i < original.length; i += 3) {
    transformedTarget[i] = (original[i] * cos - original[i + 1] * sin) * 1.5
    transformedTarget[i + 1] = (original[i] * sin + original[i + 1] * cos) * 1.5
    transformedTarget[i + 2] = original[i + 2] * 1.5
  }
  assert.ok(error(transformedTarget, rendered.geometry.attributes.position.array) < .001)
  assert.deepEqual(statuses, ['gathering', 'ready', 'transforming'])
  value.transform = undefined
  Object.assign(value, { active: true, attraction: 1 })
  pointer(host.children[0], 'pointerdown')
  tick(8100)
  assert.ok(resets > 0); assert.equal(value.attraction, 0)
  assert.equal(marker.style.transform, 'translate(400px, 300px)')
  renderer.dispose(); assert.equal(frames.size, 0)
  assert.deepEqual(statuses, ['gathering', 'ready', 'transforming', 'gathering', 'ready'])
})

const { createTwoHandTransform } = await import(moduleURL('src/input/transform.ts'))
const { createHandControls } = await import(moduleURL('src/input/controls.ts'))
function transformResult(timestamp, points, pinches = [true, true], ids = [1, 2]) {
  return { timestamp, accepted: true, events: [], hands: points.map((position, i) => ({
    id: ids[i], position, present: true, handedness: i ? 'Right' : 'Left', confidence: .99,
    pinchDistance: pinches[i] ? .03 : .1, handSize: .2,
    normalizedPinchDistance: pinches[i] ? .15 : .5, smoothedPinchDistance: pinches[i] ? .15 : .5,
    pinching: pinches[i], open: !pinches[i], pinch: pinches[i] ? 'start' : 'release',
  })) }
}
const line = (distance = 1, angle = 0) => [
  { x: -Math.cos(angle) * distance / 2, y: -Math.sin(angle) * distance / 2 },
  { x: Math.cos(angle) * distance / 2, y: Math.sin(angle) * distance / 2 },
]
function startTransform(controller, points = line(), time = 0) {
  controller.setEnabled(true)
  controller.update(transformResult(time, points, [false, false]), time)
  controller.update(transformResult(time + 100, points), time + 100)
  return controller.sample(time + 100, .1, 1)
}
test('two-hand mode captures references, scales relatively, clamps, and retains pose across exits/re-entry', () => {
  const events = [], t = createTwoHandTransform({ smoothingMs: 0 }, active => events.push(active))
  const entry = startTransform(t)
  assert.deepEqual(entry, { active: true, scale: 1, rotation: 0 })
  t.update(transformResult(200, line(1.5, .3)), 200)
  const changed = t.sample(200, .1)
  assert.ok(Math.abs(changed.scale - 1.5) < 1e-12); assert.ok(Math.abs(changed.rotation - .3) < 1e-12)
  t.update(transformResult(300, line(1.9, .5), [true, false]), 300)
  const exit = t.sample(300, .1)
  assert.equal(exit.active, false); assert.equal(exit.scale, changed.scale); assert.equal(exit.rotation, changed.rotation)
  t.update(transformResult(400, line(.6, -.8)), 400)
  assert.deepEqual(t.sample(400, .1), { ...changed, active: true }) // New reference; zero jump.
  t.update(transformResult(500, line(1.8, -.8)), 500); assert.equal(t.sample(500, .1).scale, 2)
  t.update(transformResult(600, line(.15, -.8)), 600); assert.equal(t.sample(600, .1).scale, .5)
  assert.deepEqual(events, [true, false, true])
  t.setEnabled(false); assert.equal(t.sample(650, .1).scale, .5)
  t.reset(); assert.deepEqual(t.sample(700, .1), { active: false, scale: 1, rotation: 0 })
})
test('rotation unwraps across ±π and detection-order reversal does not flip the formation', () => {
  const t = createTwoHandTransform({ smoothingMs: 0 })
  startTransform(t, line(1, 179 * Math.PI / 180))
  const result = transformResult(200, line(1, -179 * Math.PI / 180))
  result.hands.reverse()
  t.update(result, 200)
  const state = t.sample(200, .1)
  assert.ok(Math.abs(state.rotation - 2 * Math.PI / 180) < 1e-12)
  t.update(transformResult(300, line(1, -170 * Math.PI / 180)), 300)
  assert.ok(Math.abs(t.sample(300, .1).rotation - 11 * Math.PI / 180) < 1e-12)
})
test('loss, stale input, tiny separation, changed IDs, and already-closed reacquisition exit safely', () => {
  const t = createTwoHandTransform({ smoothingMs: 0 })
  startTransform(t)
  t.update(transformResult(200, line(1.5, .2)), 200)
  const pose = t.sample(200, .1)
  const missing = transformResult(300, line()); missing.hands[1].present = false
  t.update(missing, 300); assert.equal(t.sample(300, .1).active, false)
  t.update(transformResult(400, line()), 400); assert.equal(t.sample(400, .1).active, false)
  t.update(transformResult(500, line(), [false, false]), 500)
  t.update(transformResult(600, line()), 600); assert.equal(t.sample(600, .1).active, true)
  assert.equal(t.sample(900, .1).active, false) // Result stall, independently of engine callbacks.
  t.update(transformResult(950, line()), 950); assert.equal(t.sample(950, .1).active, false)
  t.update(transformResult(1000, line(), [false, false]), 1000)
  t.update(transformResult(1100, line()), 1100); t.sample(1100, .1)
  t.update(transformResult(1200, line(.01)), 1200); assert.equal(t.sample(1200, .1).active, false)
  t.update(transformResult(1300, line(), [true, true], [3, 4]), 1300)
  const blocked = t.sample(1300, .1)
  assert.equal(blocked.active, false); assert.equal(blocked.scale, pose.scale)
  assert.ok(Number.isFinite(blocked.rotation))
})
test('screen aspect correction and viewport resize rebase references without jumps', () => {
  const t = createTwoHandTransform({ smoothingMs: 0 })
  t.setEnabled(true)
  t.update(transformResult(0, line(.6), [false, false]), 0)
  t.update(transformResult(100, line(.6)), 100)
  t.sample(100, .1, 2)
  t.update(transformResult(200, line(.6, Math.PI / 2)), 200)
  const vertical = t.sample(200, .1, 2)
  assert.equal(vertical.scale, .5); assert.ok(Math.abs(vertical.rotation - Math.PI / 2) < 1e-12)
  assert.deepEqual(t.sample(210, .01, .7), vertical)
})
test('two-hand arbitration suppresses existing attraction, keeps transforms on interrupt, and exits without gathering', () => {
  const c = createHandControls()
  c.setEnabled(true)
  c.update(transformResult(0, line(), [false, false]), 0)
  c.update(transformResult(100, line(), [true, false]), 100)
  assert.ok(c.sample(100, .1).attraction > 0)
  c.update(transformResult(200, line()), 200)
  const both = c.sample(200, .1)
  assert.equal(both.transform.active, true); assert.equal(both.attraction, 0); assert.equal(both.active, false)
  c.update(transformResult(300, line(1.5, .4)), 300)
  const transformed = c.sample(300, 1).transform
  assert.ok(transformed.scale > 1.4)
  c.update(transformResult(400, line(1.5), [true, false]), 400)
  const exit = c.sample(400, .1)
  assert.equal(exit.transform.active, false); assert.equal(exit.attraction, 0)
  assert.equal(exit.transform.scale, transformed.scale)
  c.interrupt(); assert.equal(c.sample(450, .1).transform.scale, transformed.scale)
  c.reset(); assert.equal(c.sample(500, .1).transform.scale, 1)
})
test('transformed formation targets converge through the existing physics with world-space attraction intact', () => {
  const positions = new Float32Array([1, 0, 1]), target = positions.slice()
  const transform = { active: true, scale: 2, rotation: Math.PI / 2 }
  for (let i = 0; i < 180; i++) stepParticles(positions, target, { ...idle }, 0, 0, 1, 1 / 60, 0, true, transform)
  assert.ok(Math.abs(positions[0]) < .00001 && Math.abs(positions[1] - 2) < .00001 && Math.abs(positions[2] - 2) < .00001)
  for (let i = 0; i < 180; i++) stepParticles(positions, target, { ...idle, active: true }, 0, 1, 1, 1 / 60, 0, true, transform)
  assert.ok(positions[1] < 1.5) // Attraction remains at a world-space point after transforming the target.
})
test('transform smoothing is frame-time based and configuration rejects invalid bounds', () => {
  const run = hz => {
    const t = createTwoHandTransform(); startTransform(t)
    let state
    for (let i = 1; i <= hz; i++) {
      const time = 100 + i * 1000 / hz
      t.update(transformResult(time, line(1.5, .6)), time)
      state = t.sample(time, 1 / hz)
    }
    return state
  }
  assert.ok(Math.abs(run(30).scale - run(120).scale) < 1e-12)
  assert.ok(Math.abs(run(30).rotation - run(120).rotation) < 1e-12)
  assert.throws(() => createTwoHandTransform({ minScale: 2 }), RangeError)
  assert.throws(() => createTwoHandTransform({ maxScale: NaN }), RangeError)
})

const { handControlsEnabled, createTrackingFeedback, appliedGestureStatus } = await import(moduleURL('src/input/feedback.ts'))
test('explicit mode gating requires Hand, ready camera, and unpaused input', () => {
  for (const mode of ['mouse', 'hand']) for (const cameraReady of [false, true]) for (const paused of [false, true]) {
    assert.equal(handControlsEnabled({ mode, cameraReady, paused }), mode === 'hand' && cameraReady && !paused)
  }
})
test('tracking feedback distinguishes initial search, one/two hands, loss and recovery without stale replay', () => {
  const feedback = createTrackingFeedback()
  assert.equal(feedback.update({ timestamp: 0, accepted: true, hands: [], events: [] }), 'Searching')
  const both = transformResult(100, line(), [false, false])
  assert.equal(feedback.update({ ...both, hands: both.hands.slice(0, 1) }), 'One hand')
  assert.equal(feedback.update(both), 'Two hands')
  assert.equal(feedback.update({ ...both, hands: both.hands.map(h => ({ ...h, present: false })) }), 'Tracking lost')
  assert.equal(feedback.update({ ...both, accepted: false }), 'Tracking lost')
  assert.equal(feedback.update(both), 'Two hands')
  assert.equal(feedback.reset(), 'Searching')
  assert.equal(feedback.update({ ...both, hands: [] }), 'Searching')
})
test('pause or Mouse mode clears active hand force, retains transform, and resumes without a held-pinch action', () => {
  const control = createHandControls()
  control.setEnabled(handControlsEnabled({ mode: 'hand', cameraReady: true, paused: false }))
  control.update(transformResult(0, line(), [false, false]), 0)
  control.update(transformResult(100, line(), [true, false]), 100)
  assert.ok(control.sample(100, .1).active)
  control.setEnabled(handControlsEnabled({ mode: 'hand', cameraReady: true, paused: true }))
  const paused = control.sample(110, .01)
  assert.equal(paused.active, false); assert.equal(paused.attraction, 0); assert.equal(paused.visible, false)
  control.update(transformResult(200, line()), 200)
  assert.equal(control.sample(200, .1).transform.active, false)
  control.setEnabled(true)
  control.update(transformResult(300, line()), 300)
  assert.equal(control.sample(300, .1).active, false)
  assert.equal(control.sample(300, .1).transform.active, false)
  control.update(transformResult(400, line(), [false, false]), 400)
  control.update(transformResult(500, line()), 500)
  assert.equal(control.sample(500, .1).transform.active, true)
  control.update(transformResult(600, line(1.5, .5)), 600)
  const pose = control.sample(600, 1).transform
  control.setEnabled(handControlsEnabled({ mode: 'mouse', cameraReady: true, paused: false }))
  const mouse = control.sample(610, .01)
  assert.equal(mouse.transform.active, false); assert.equal(mouse.transform.scale, pose.scale)
  assert.equal(mouse.transform.rotation, pose.rotation); assert.equal(mouse.attraction, 0)
})
test('gesture feedback describes applied interaction, giving transformation priority over gathering', () => {
  assert.equal(appliedGestureStatus({ ...idle }, false), 'ready')
  assert.equal(appliedGestureStatus({ ...idle, active: true, attraction: 0 }, false), 'ready')
  assert.equal(appliedGestureStatus({ ...idle, active: true }, false), 'gathering')
  assert.equal(appliedGestureStatus({ ...idle, active: true }, true), 'transforming')
})
