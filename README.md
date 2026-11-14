# Aether

An interactive particle universe built with React, TypeScript, Vite, and Three.js. Mouse- and hand-controlled formations with local webcam tracking.

## Run locally

Use a current Node.js version supported by Vite 8 (Node 22.12+ recommended).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

```sh
npm run lint
npm run build
npm run preview
```

`preview` serves the production build locally.

## Controls

- Move the pointer over the scene to position the interaction ring.
- Hold the primary button and drag to gather nearby particles. Release to let them ease back into formation.
- Switch between Nebula and Galaxy to smoothly morph the same 5,000 particles.
- Adjust interaction strength from 0–100%. At 0%, gathering is disabled.
- Reset restores Nebula, 65% strength, and the animation clock, then gently releases gathered particles.
- Use the fullscreen button to enter/exit fullscreen, or Escape to exit. Unsupported fullscreen requests show a status message.
- Buttons and the strength slider support standard keyboard navigation.

## Architecture

- `src/App.tsx`: React interface, discrete formation/strength/reset settings, fullscreen status.
- `src/ParticleScene.tsx`: renderer lifecycle and graphics failure UI.
- `src/particles/renderer.ts`: Three.js scene, one `Points` draw call, buffer updates, soft additive glow shader, resize handling, and animation loop.
- `src/particles/formations.ts`: deterministic Nebula and three-arm Galaxy generators.
- `src/particles/interaction.ts`: normalized input contract, mouse adapter, and frame-time-based attraction/return simulation. A future hand adapter can provide the same `InteractionInput` values.

No React state updates occur per frame. Pixel density is capped at 1.75. Cleanup cancels animation, disconnects resize observation, removes input listeners and the canvas, and disposes geometry, material, and renderer resources; React Strict Mode can safely mount/unmount/remount the scene. Reduced-motion preferences disable ambient drift and swirl while retaining responsive, smoothed input and formation changes. A lost or unavailable WebGL context displays recovery guidance. The scene requires WebGL 2 and hardware acceleration.

## Completed

- Fullscreen near-black scene with 5,000 cyan, violet, and pink glowing particles.
- Drifting, gently swirling Nebula and a centrally concentrated spiral Galaxy.
- Smooth formation morphs, local mouse gathering, and release recovery.
- Responsive control dock, mouse mode indicator, reset, fullscreen, and accessible control labels.
- Reduced-motion support and graphics initialization/context-loss messaging.

The optional Google Fonts stylesheet has local sans-serif fallbacks. Particle rendering requires no external assets or services; tracking assets are prepared before development/build and served locally.

## Next milestone

Add opt-in webcam hand tracking through a separate input adapter: hand position, pinch-to-gather, then two-hand scale/rotation. Camera lifecycle, two-hand landmark tracking, and an optional mirrored overlay preview are implemented. The reusable gesture engine interprets hand position and pinch transitions. One-hand hover and pinch attraction now control the particles through the shared input layer. Two-hand scale/rotation, sound, recording, accounts, and backend services remain future work.

## Verification

Run `npm run verify` for the repeatable Node contract tests in `scripts/verify.mjs`.

Checks performed on November 13, 2026:

| Check | Result and scope |
| --- | --- |
| `npm run lint` | Passed. |
| `npm run build` | Passed; Three.js bundle-size advisory remains. |
| `npm run verify` | Four test groups passed. |
| Nebula ↔ Galaxy | Both simulation directions converge; renderer target switching exercised with a mocked GPU. |
| Attraction/release | Local gathering, zero strength, return to formation, and 30/144 Hz consistency checked in simulation. |
| Mouse events | Normalized coordinates, drag updates, primary-button/pointer ownership, release outside, cancellation, blur, reset, and listener removal checked with event doubles. |
| Resize | Portrait camera aspect/distance, pixel-density cap, and zero-width guard checked with mocked ResizeObserver/GPU. |
| Reset | Renderer returns to Nebula after switching; mouse adapter releases active attraction. React button wiring reviewed in source. |
| Cleanup/remount | Canvas and animation callback counts, observer disconnection, geometry/material/renderer disposal checked with mocked GPU. |
| Fullscreen | Request/exit, change listener, and failure-message wiring reviewed in source only. Native behavior untested. |
| Browser rendering | Blocked: computer-use permission unavailable. No real WebGL rendering or visual interaction test was performed. |

Fixes made during verification: an unrelated pointer no longer moves or releases an active drag, release outside the canvas hides the marker, reset/blur/disposal release pointer capture, and zero-size resize measurements cannot produce an invalid camera. Common swirl trigonometry is calculated once per frame.

Manual browser checklist (`npm run dev`, then open Vite's local URL):

- Confirm both formations render with readable controls and no browser console errors.
- Switch repeatedly in both directions, including during a drag; confirm smooth morphs.
- Gather near and far from the center, release outside the canvas, and switch window focus while holding. Confirm particles return and no attraction gets stuck.
- Change strength to 0% and 100%; reset from Galaxy while gathering. Confirm Nebula and 65% are restored.
- Resize across wide, narrow, and short windows; check layout, clipping, marker alignment, and particle visibility.
- Enter fullscreen, exit via its button, then enter again and exit with Escape. Confirm the label and canvas size follow.
- Enable reduced motion; confirm ambient movement stops while controls remain usable.

These automated tests validate logic and lifecycle contracts; they do not establish shader correctness, frame rate, visual quality, native pointer capture, or fullscreen behavior in a browser.


## Opt-in camera controls

Select **Enable Camera** to request video only (`audio: false`). The panel reports permission, camera initialization, model loading, first-frame initialization, ready, and failure states. **Disable Camera** works during every active stage, including a pending permission prompt. The browser prompt itself cannot be dismissed programmatically; if permission is granted after disabling, the late stream is immediately stopped.

Denied permission provides browser site-settings guidance. Missing devices provide reconnect guidance; unreadable/busy devices suggest closing other camera apps and checking system permissions. Model download failures offer retry guidance. Failed setup stops the camera automatically, and **Retry · Enable Camera** starts a fresh session. HTTPS or localhost is required.

Camera frames are processed locally in a dedicated MediaPipe worker, at up to 10 inference requests per second with only one in flight. The runtime is loaded only after explicit enable. Matching WASM and model assets are served from Aether’s own origin. The preparation script downloads the official model from Google Storage once and verifies its SHA-256; WASM files are copied from the pinned installed package. There are no runtime CDN requests. These are inbound asset requests: no images, video, audio, or landmarks are uploaded, stored, or recorded. Camera readiness means the model has processed its first frame, not that a hand was found. Camera ready enables Hand mode: open-hand hover and deliberate pinch gathering control the same particles as mouse dragging. All mouse controls remain usable.

`src/CameraControls.tsx` owns the panel and DOM video element. `src/camera/session.ts` owns cancellable startup, state transitions, timeouts, video tracks, and worker scheduling. `src/camera/tracker.worker.ts` owns the local model and frame processing. Disable, failure, page exit, and unmount stop tracks, detach video, cancel frame scheduling/timers, and terminate the worker to release its model/WASM resources. Late streams and frame snapshots are released without restarting a cancelled session.

Camera automated verification adds four test groups (`npm run verify`, eight total): lifecycle transitions/retry; denied/missing/busy/model failures; disable/unmount during permission/model loading; and device disconnection. Tests use media and worker doubles and do **not** prove real device access or model inference.

Manual camera checks still required: allow/deny permission; unplug a camera; test an occupied device; block model downloads; disable during each loading stage; retry; confirm the browser's camera indicator turns off after disable/unmount; inspect network requests to confirm only model assets download. Browser QA remains blocked by unavailable computer-use permission; actual camera and model behavior remain unverified on hardware.


## Two-hand tracking and preview

The worker uses `@mediapipe/tasks-vision` **1.2.3**, pinned exactly, in `VIDEO` mode with `numHands: 2`. It returns 21 normalized landmarks per detected hand, handedness, confidence, and the inference timestamp. The optional **Show camera preview** checkbox displays a canvas with both hand skeletons (cyan/violet); **Mirror view** defaults on. Neither preview checkbox changes camera permission or restarts inference. Mouse particle controls remain active alongside one-hand attraction. Two-hand scale/rotation are the next integration step.

The preview displays the exact analyzed frame returned by the worker, not a newer live video frame. The main thread closes each transferred image after drawing (including stale results after cancellation). Landmark coordinates remain raw/unmirrored in `TrackingFrame`; `displayPoint` applies `x → 1−x` for mirrored views, and `interactionPoint` maps the same displayed coordinates to the renderer’s `[-1,1]`, Y-up input space. No crop or `object-fit: cover` transform is applied, so changing preview size preserves landmark alignment. These helpers also supply the mirrored particle interaction coordinates.

At most one snapshot/inference request is in flight, including the asynchronous snapshot step. The scheduler skips unchanged `video.currentTime` values, caps inference at 10 Hz, and uses monotonic animation timestamps. React updates only when the detected-hand count changes; canvas drawing runs outside React state. Losing hands clears the skeleton on the next result; disable/failure clears the preview/count.

### Asset preparation

`npm run dev` and `npm run build` automatically run `npm run prepare:tracking`. The script copies the matching module-loader JS and WASM from the pinned package into ignored `public/tracking/mediapipe-1.2.3/` and downloads the versioned official model if missing. Model SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`. Cached valid models need no network; failed downloads or checksum mismatches fail preparation with an error. First setup/CI needs internet access to Google Storage. Do not skip Vite’s prebuild hook in CI.

Vite copies these assets into `dist/tracking/`; deploy the entire `dist` directory, including that directory. Asset URLs respect Vite’s configured `base` and are resolved on the main thread before being sent to the ES module worker. Runtime/model loading is same-origin in development and production. Serve `.wasm` with `application/wasm`; hosts must serve real files rather than returning the SPA fallback for missing tracking assets. A corrupt/missing runtime asset triggers the recoverable model-loading failure state. Upgrade the package pin, preparation script, and asset path together.

Compatibility was checked against the current [official Hand Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Web), [web setup guide](https://developers.google.com/edge/mediapipe/solutions/setup_web), and installed TypeScript API (including module WASM filesets). Use a modern browser with WebAssembly, module workers, OffscreenCanvas/ImageBitmap support, camera access, and HTTPS or localhost. CPU inference keeps GPU requirements modest; unsupported browser/runtime combinations show a recoverable failure and preserve mouse mode.

Verification: lint/build pass and `npm run verify` passes ten test groups. New tests cover one inference request in flight, decoded-frame deduplication, stale-image cleanup, two skeletons, and mirror/input coordinate agreement. Real development HTTP checks returned 200 for page, worker, JS runtime, WASM (`application/wasm`), and model. Both public and production directories contain the expected runtime and checksum-verified model. These checks do not establish real inference performance or camera accuracy.

Manual checks still needed: show one hand then two; move toward each edge in mirrored/unmirrored views; check all joints follow the hands; hide/show preview while tracking; remove both hands; disable/re-enable while processing; test production hosting on a non-root base path. Browser visual/hardware QA could not run because computer-use permission is unavailable.


## Reusable gesture engine

`src/gestures/engine.ts` interprets landmarks independently of React, the camera runtime, and Three.js. It exposes `createGestureEngine(settings)`, `update(frame)`, `advance(timestamp)`, `configure(settings)`, `reset()`, and a copied `settings` snapshot. The engine has no internal timers or side effects.

`CameraControls` feeds each tracking result into the engine and exposes an optional `onGestures(result)` consumer callback. The camera panel shows stable hand IDs and open/pinching state, and provides Gentle/Balanced/Precise sensitivity presets. A separate hand input adapter connects this output to the particle renderer; the gesture engine itself remains rendering-independent.

Each result contains:

- `hands`: stable ID, immediate `present` flag, handedness/confidence, smoothed interaction position, thumb/index distance, hand size, raw and smoothed hand-normalized pinch distance, `pinching`, and `pinch` phase (`idle`, `start`, `hold`, `release`).
- `events`: one-time `tracking-acquired`, `pinch-start`, `pinch-release`, and `tracking-lost` transitions, with hand IDs and timestamps. Release/loss reasons distinguish opening, tracking loss, and reset. Hold is continuous state, **not** a repeated action event.
- `accepted`: false for duplicate/out-of-order frames. Such results contain no events and cannot replay a start/release.

Interaction position is the midpoint of thumb tip (4) and index tip (8). Position smoothing happens in unmirrored camera coordinates, then uses the shared mirror transform to produce `[-1,1]`, Y-up coordinates. Mirror changes therefore do not animate the pointer through the middle of the scene. Results are clamped to the interaction viewport.

Distance uses aspect-corrected normalized XYZ coordinates (X/Z scaled by camera aspect ratio). Hand size is the average of index-to-pinky MCP span (5→17) and wrist-to-middle MCP length (0→9). Pinch distance divided by that size is dimensionless; no gesture thresholds use raw pixels. The worker supplies the actual analyzed frame’s aspect ratio. The engine requires a positive `aspectRatio` on every input, rather than inferring dimensions from a preview element.

Default settings:

| Setting | Default | Meaning |
| --- | --- | --- |
| `pinchStart` | 0.28 | Start at or below this smoothed pinch/hand-size ratio. |
| `pinchRelease` | 0.42 | Release at or above this ratio; hysteresis avoids chatter. |
| `positionSmoothingMs` | 80 | Exponential movement smoothing time constant; 0 disables. |
| `pinchSmoothingMs` | 35 | Exponential ratio smoothing; 0 disables. |
| `trackingLossMs` | 300 | Identity grace period and confirmed-loss timeout. |
| `associationMaxDistance` | 0.4 | Maximum predicted palm displacement in aspect-corrected normalized image units. |
| `handednessPenalty` | 0.12 | Soft identity-matching penalty for a changed handedness label. |
| `minHandConfidence` | 0.5 | Minimum supplied hand confidence (currently MediaPipe’s handedness score, not independent tracking certainty). |
| `mirrored` | true | Match the mirrored preview/input convention. |

Gentle starts at 0.34 and releases at 0.50 with 100 ms movement smoothing; Precise uses 0.20/0.34 and 65 ms. `configure` validates settings and preserves tracked IDs; it rejects non-finite values, invalid ranges, and start thresholds at/above release thresholds. Runtime sensitivity changes can intentionally trigger a transition on the next valid observation.

For a consumer:

```ts
const gestures = createGestureEngine({ mirrored: true })
// In a camera result callback; timestamp is monotonic capture time in milliseconds:
const result = gestures.update({ hands, timestamp, aspectRatio })
// Dispatch discrete actions ONLY from result.events, not on every held frame.
const starts = result.events.filter(event => event.type === 'pinch-start')
// Continuous gathering can instead read hand.present && hand.pinching.
```

Association globally matches both detections to predicted palm locations with soft handedness and size-change costs, independently of detection order. Small label flickers and brief dropouts preserve IDs. Completely overlapping/occluded hands are inherently ambiguous; these heuristics cannot guarantee anatomical identity under all crossings.

On the first missing/invalid observation, a hand is immediately `present: false` and inactive, retaining its ID and internal latch briefly. Reappearance during the grace period resumes hold without another start action. Confirmed loss emits one release (if needed) and one lost event, then removes the track. Reacquisition after timeout receives a new ID. Invalid/degenerate hands are treated as missing. `reset()` emits final release/lost events once, clears state, and allows a fresh timestamp sequence without reusing IDs.

If inference stalls, call `advance(now)` using the **same monotonic millisecond clock** to expire old tracks. All engine calls must progress in time; older results are ignored. The camera adapter checks for stalled results on a cleaned-up 100 ms interval and calls `advance` only after a full result timeout, so normal asynchronous inference is not rejected by a continuously advancing clock.

Verification: `npm run verify` now contains 17 test groups, including scale/aspect invariance, mirrored positions, pinch hysteresis and one-time events, duplicate/out-of-order frames, reordered/crossing hands, label flicker, temporary loss/reacquisition, confirmed loss/reset, 30/120 Hz smoothing agreement, invalid inputs, and live sensitivity changes. Lint and production build also pass (the existing bundle-size advisory remains). Real-camera gesture calibration and the new sensitivity selector still require browser/hardware testing; prior browser access was unavailable.


## One-hand particle controls

1. Run `npm run dev`, open the local URL, and select **Enable Camera**. The header switches to **Hand mode** only when local tracking is ready.
2. Show an open hand to arm interaction. Its thumb/index midpoint moves the subtle marker, using the same mirrored convention as the preview.
3. Pinch thumb and index together to gather nearby particles; move while holding to move the attraction point.
4. Open/release to let attraction fade and particles return smoothly to the selected formation.
5. If tracking drops, keep or reopen your hand before pinching again. A hand that appears already closed cannot start attraction.

The lowest stable hand ID is selected initially. The adapter keeps that primary hand through brief dropouts even if a second hand is visible. After confirmed loss, another visible hand can become primary, but must open and pinch deliberately. Two-hand scale/rotation is not implemented.

`src/input/types.ts` defines the shared normalized `InteractionInput` and sampled `InteractionSource` contract. Mouse and hand adapters both produce X/Y position, visibility, and activity; optional continuous attraction/opacity weights allow loss/release fading without separate particle physics. `src/input/hand.ts` interprets gesture output for one-hand control. `App` owns the stable adapter object, CameraControls updates it through callbacks, and the renderer samples it outside React state. The renderer owns a single marker for both inputs and applies the same camera-plane mapping and attraction simulation to either source.

Safety and smoothing behavior:

- Initial acquisition, reset, mirror changes, camera re-enable, hand switches, explicit absence, and stale results all disarm attraction. A clearly open reading (`open`, beyond the engine’s release threshold) followed by a fresh pinch-start is required to rearm. A retained gesture-engine hold across a dropout cannot reactivate the adapter.
- Missing results become stale after 250 ms. Attraction fades with a 110 ms exponential time constant, marker visibility with 160 ms, and adapter movement eases with 65 ms. The gesture engine’s position smoothing remains in effect too. All timings are configurable via `createHandInput(settings)`.
- A dropped pinch fades at its last position. Reacquisition cannot move the remaining force to a new location; the old force decays first, then the marker eases to the reacquired position. A long inactive gap clears residual interaction.
- An intentional mouse drag takes priority and clears/disarms hand interaction. Mouse hover alone does not steal control from a visible hand. After a drag ends, show an open hand and pinch again to resume hand attraction.
- Reset returns to Nebula and 65% strength and also clears both input adapters. Disabling/failing camera setup restores Mouse mode. Existing mouse-only behavior is preserved.

Verification on November 14, 2026: lint, production build, `git diff --check`, and **23 automated test groups pass**. New tests cover open hover, actual engine→adapter pinch/drag/release, smooth particle recovery through the shared physics, loss fading at a frozen point, held-closed reacquisition prevention, stale input/reset/re-enable safety, stable primary selection, mouse priority, 30/120 Hz fade agreement, and renderer consumption/marker mapping using a mocked GPU. The existing bundle-size advisory remains.

Browser/hardware testing was attempted but computer-use permission was unavailable. Still check live camera marker alignment, gathering/release feel, partial occlusion and reacquisition while closed, opening then repinching, movement near camera edges, two visible hands with the primary temporarily hidden, mouse override, reset while pinching, camera disable, and mirrored/unmirrored preview consistency.
