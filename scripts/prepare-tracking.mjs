import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
const pkg = JSON.parse(await readFile(new URL('node_modules/@mediapipe/tasks-vision/package.json', root), 'utf8'))
const expected = '1.2.3'
if (pkg.version !== expected) throw new Error(`Expected MediaPipe ${expected}; update asset configuration when upgrading.`)
const output = new URL(`public/tracking/mediapipe-${expected}/`, root)
await mkdir(new URL('wasm/', output), { recursive: true })
for (const name of ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm']) {
  await copyFile(new URL(`node_modules/@mediapipe/tasks-vision/wasm/${name}`, root), new URL(`wasm/${name}`, output))
}
const checksum = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'
const model = new URL('hand_landmarker.task', output)
const valid = data => createHash('sha256').update(data).digest('hex') === checksum
let cached = false
try { cached = valid(await readFile(model)) } catch { /* First setup downloads the official model. */ }
if (!cached) {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`Model download failed (${response.status}); rerun npm run prepare:tracking.`)
  const data = Buffer.from(await response.arrayBuffer())
  if (!valid(data)) throw new Error('Model checksum mismatch; refusing to package an unknown model.')
  const temp = new URL('hand_landmarker.task.tmp', output)
  try { await writeFile(temp, data); await rename(temp, model) } finally { await rm(temp, { force: true }) }
}
console.log(`Tracking assets ready: ${fileURLToPath(output)} (MediaPipe ${expected}, verified model)`)
