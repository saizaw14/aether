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

Add opt-in webcam hand tracking through a separate input adapter: hand position, pinch-to-gather, then two-hand scale/rotation. Camera lifecycle, two-hand landmark tracking, and an optional mirrored overlay preview are implemented. The reusable gesture engine interprets hand position and pinch transitions. One-hand hover and pinch attraction now control the particles through the shared input layer. Two-hand relative screen-based scale/rotation is also implemented. Sound, recording, accounts, and backend services remain future work.

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

Camera frames are processed locally in a dedicated MediaPipe worker, at up to 10 inference requests per second with only one in flight. The runtime is loaded only after explicit enable. Matching WASM and model assets are served from Aether’s own origin. The preparation script downloads the official model from Google Storage once and verifies its SHA-256; WASM files are copied from the pinned installed package. There are no runtime CDN requests. These are inbound asset requests: no images, video, audio, or landmarks are uploaded, stored, or recorded. Camera readiness means the model has processed its first frame, not that a hand was found. Select Hand mode after the camera is ready: open-hand hover and deliberate pinch gathering control the same particles as mouse dragging. All mouse controls remain usable.

`src/CameraControls.tsx` owns the panel and DOM video element. `src/camera/session.ts` owns cancellable startup, state transitions, timeouts, video tracks, and worker scheduling. `src/camera/tracker.worker.ts` owns the local model and frame processing. Disable, failure, page exit, and unmount stop tracks, detach video, cancel frame scheduling/timers, and terminate the worker to release its model/WASM resources. Late streams and frame snapshots are released without restarting a cancelled session.

Camera automated verification adds four test groups (`npm run verify`, eight total): lifecycle transitions/retry; denied/missing/busy/model failures; disable/unmount during permission/model loading; and device disconnection. Tests use media and worker doubles and do **not** prove real device access or model inference.

Manual camera checks still required: allow/deny permission; unplug a camera; test an occupied device; block model downloads; disable during each loading stage; retry; confirm the browser's camera indicator turns off after disable/unmount; inspect network requests to confirm only model assets download. Browser QA remains blocked by unavailable computer-use permission; actual camera and model behavior remain unverified on hardware.


## Two-hand tracking and preview

The worker uses `@mediapipe/tasks-vision` **1.2.3**, pinned exactly, in `VIDEO` mode with `numHands: 2`. It returns 21 normalized landmarks per detected hand, handedness, confidence, and the inference timestamp. The optional **Show camera preview** checkbox displays a canvas with both hand skeletons (cyan/violet); **Mirror view** defaults on. Neither preview checkbox changes camera permission or restarts inference. Mouse particle controls remain active alongside one-hand attraction. Pinching both hands enables relative screen-based scale/rotation.

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

1. Run `npm run dev`, open the local URL, and select **Enable Camera**. Select **Hand** in the control-mode buttons. Camera readiness alone never changes the selected mode.
2. Show an open hand to arm interaction. Its thumb/index midpoint moves the subtle marker, using the same mirrored convention as the preview.
3. Pinch thumb and index together to gather nearby particles; move while holding to move the attraction point.
4. Open/release to let attraction fade and particles return smoothly to the selected formation.
5. If tracking drops, keep or reopen your hand before pinching again. A hand that appears already closed cannot start attraction.

The lowest stable hand ID is selected initially. The adapter keeps that primary hand through brief dropouts even if a second hand is visible. After confirmed loss, another visible hand can become primary, but must open and pinch deliberately. Pinching both armed hands takes priority and enables two-hand transformation (described below).

`src/input/types.ts` defines the shared normalized `InteractionInput` and sampled `InteractionSource` contract. Mouse and hand adapters both produce X/Y position, visibility, and activity; optional continuous attraction/opacity weights allow loss/release fading without separate particle physics. `src/input/hand.ts` interprets gesture output for one-hand control. `App` owns the stable adapter object, CameraControls updates it through callbacks, and the renderer samples it outside React state. The renderer owns a single marker for both inputs and applies the same camera-plane mapping and attraction simulation to either source.

Safety and smoothing behavior:

- Initial acquisition, reset, mirror changes, camera re-enable, hand switches, explicit absence, and stale results all disarm attraction. A clearly open reading (`open`, beyond the engine’s release threshold) followed by a fresh pinch-start is required to rearm. A retained gesture-engine hold across a dropout cannot reactivate the adapter.
- Missing results become stale after 250 ms. Attraction fades with a 110 ms exponential time constant, marker visibility with 160 ms, and adapter movement eases with 65 ms. The gesture engine’s position smoothing remains in effect too. All timings are configurable via `createHandInput(settings)`.
- A dropped pinch fades at its last position. Reacquisition cannot move the remaining force to a new location; the old force decays first, then the marker eases to the reacquired position. A long inactive gap clears residual interaction.
- An intentional mouse drag takes priority and clears/disarms hand interaction. Mouse hover alone does not steal control from a visible hand. After a drag ends, show an open hand and pinch again to resume hand attraction.
- Reset returns to Nebula and 65% strength and also clears both input adapters. Disabling/failing camera setup restores Mouse mode. Existing mouse-only behavior is preserved.

Verification on November 14, 2026: lint, production build, `git diff --check`, and **23 automated test groups pass**. New tests cover open hover, actual engine→adapter pinch/drag/release, smooth particle recovery through the shared physics, loss fading at a frozen point, held-closed reacquisition prevention, stale input/reset/re-enable safety, stable primary selection, mouse priority, 30/120 Hz fade agreement, and renderer consumption/marker mapping using a mocked GPU. The existing bundle-size advisory remains.

Browser/hardware testing was attempted but computer-use permission was unavailable. Still check live camera marker alignment, gathering/release feel, partial occlusion and reacquisition while closed, opening then repinching, movement near camera edges, two visible hands with the primary temporarily hidden, mouse override, reset while pinching, camera disable, and mirrored/unmirrored preview consistency.


## Two-hand scale and rotation

Open both hands once after acquisition, then pinch both to enter **Two-hand transform** mode. Move them apart/together to scale the formation, or turn the line between the hands to rotate it. These are relative screen-based controls, not physical-depth measurements. The compact Gesture status identifies active transformation.

- Entry captures the current displayed controller scale/rotation and the hands’ current distance/angle. Entering/re-entering has no offset jump.
- Distance ratios scale relative to the captured value. Scale is clamped to **0.5×–2×**. Rotation accumulates the smallest signed angular changes across ±π, so crossing the wrap boundary does not spin the formation. Stable hand IDs fix vector direction independently of detection order.
- Coordinates use mirrored, smoothed X/Y positions only. X is corrected for the actual canvas aspect ratio; the controller rebases its reference on viewport aspect changes without changing the chosen transform. Hands closer than 0.12 normalized height units have an unreliable angle, so transformation exits safely.
- Releasing either pinch, losing either hand, changing the hand pair, stale results (250 ms), camera disable, or gesture reset ends/rebases the mode as appropriate. The last chosen transform is retained. A lost/reacquired hand must open before it can participate again.
- Active two-hand transformation suppresses one-hand attraction, including any fading attraction tail. Exiting cannot silently turn the remaining held pinch into gathering: open and freshly pinch to resume one-hand attraction. A deliberate mouse drag interrupts hand control while retaining the chosen formation scale/rotation.
- **Reset** restores scale 1×, rotation 0, Nebula, and default strength. Formation switching otherwise retains the chosen transform. Motion eases with a 90 ms controller time constant and the existing particle follow simulation; reduced-motion users retain controllable transforms without ambient drift.

Architecture: `src/input/transform.ts` is a pure two-hand controller with reference capture, validation, clamping, angular unwrapping, and `update/sample/interrupt/reset` APIs. `src/input/controls.ts` arbitrates transformation versus one-hand input. The shared sampled input carries an optional formation transform. The renderer applies that transform to formation **targets** through `stepParticles`; it does not scale/rotate the mesh. Mouse/hand attraction therefore remains in world space with correct marker alignment even after the formation is transformed. The controller exposes configurable bounds/timings via `createTwoHandTransform(settings)` and emits only discrete mode-change callbacks, not React updates per animation frame.

Verification: lint and production build pass, with the existing bundle-size advisory. **30 automated test groups pass**, including reference capture/re-entry, scale clamps, ±π wraparound, hand-order changes, screen aspect/resize rebasing, tracking loss/stale input/degenerate separation, safe closed-hand reacquisition, transform priority and graceful exit, transformed formation convergence with world-space attraction, frame-time smoothing, and renderer forwarding of transformation to particle targets. `git diff --check` also passes.

Live browser testing was attempted but computer-use permission is unavailable. Manual checks still needed: enter with hands at different separations/angles; scale through both limits; rotate across the angle boundary; release either pinch; hide either hand and reacquire closed; switch formations during transformation; resize; use mouse override; disable camera; and Reset. Confirm each entry starts from the current pose and exits preserve it.


## Guidance, modes, and feedback

Aether starts in explicit **Mouse** mode. Use the **Mouse / Hand** buttons in the compact edge panel to choose input. Selecting Hand does not request camera access; use **Enable Camera** separately. Camera readiness never silently switches modes. Hand input is enabled only when Hand is selected, camera tracking is ready, and hand interaction is unpaused. Mouse drag remains available as an override in either mode.

**Pause hand interaction / Resume hand interaction** suspends/resumes the hand adapter without stopping camera tracking or the optional preview. Pause and switching to Mouse immediately clear hand force, end live transformation while retaining its pose, and disarm held gestures. On resume/switching back, show an open hand before pinching again. Disable Camera separately stops capture and releases camera resources.

Compact feedback distinguishes:

- **Tracking:** Searching before any hand is found, One hand, Two hands, or Tracking lost after previously observed hands disappear. Camera off is shown when capture is disabled or failed. Tracking feedback continues while hand control is paused or Mouse is selected.
- **Gesture:** Ready, Gathering, or Transforming, based on the input actually applied by the renderer, including mouse overrides and residual attraction fading. Disarmed raw pinches do not falsely report Gathering. Status callbacks fire only on transitions; particle animation does not update React every frame.

**Gesture guide** is a collapsed native disclosure explaining pinch, drag/release, and two-hand spread/rotation, including open-before-repinch recovery. **Show camera preview** remains directly available; **Camera settings** holds mirroring, sensitivity, and permission detail. These optional sections stay collapsed by default to keep the canvas visually dominant. On narrow/short layouts the panel scrolls within its bounded area.

All interface controls work with mouse and keyboard: Tab/Shift+Tab traverse controls, Enter/Space activate buttons and native disclosure summaries, arrow keys adjust range/select controls, and Space toggles preview checkboxes. Labels, pressed states for mode buttons, visible focus outlines, and a polite status region identify controls and feedback. No hand gesture is required to operate the interface.

Verification on November 15, 2026: lint, production build, and `git diff --check` pass; **34 automated test groups pass**. Added checks cover all explicit-mode/ready/paused gate combinations, search/presence/loss/recovery feedback, stale-result rejection, immediate force clearing on pause/Mouse selection, safe held-pinch resume, retained transform pose, and edge-triggered applied gesture feedback in the mocked renderer. The existing bundle-size advisory remains.

Browser UI/keyboard testing was attempted but blocked by unavailable computer-use permissions. Manual checks: tab through every control at desktop and narrow sizes; activate the mode buttons, pause/resume, preview, guide, settings, sensitivity, formation selector, strength, Reset, and fullscreen; confirm focus remains visible and the panel scrolls focused controls into view. Verify camera-ready does not change Mouse mode, Pause leaves the camera indicator/preview active, Hand resume requires open→pinch, and live status matches searching, one/two hands, loss, gathering, and transformation.

## Performance and lifecycle audit

Enable **Show performance debug** in the controls panel for rendering FPS, tracking update rate, the latest worker inference duration, active input/interaction mode, quality level, and drawn point count. The overlay is off by default. Its own React component samples a bounded mutable metrics store at **2 Hz**, and its interval is removed when hidden/unmounted. Rendering, tracking, and metric collection never depend on the overlay. Inference duration measures `detectForVideo` execution inside the worker; it excludes camera startup, model loading, snapshot transfer, and UI work. Rates use recent one-second samples; stale tracking duration becomes unavailable and camera disable clears tracking metrics.

Rendering retains its own requestAnimationFrame loop and uses elapsed seconds. Camera inference runs on a separate scheduler, capped at 10 Hz, with one snapshot/request in flight and decoded-frame deduplication. Particle motion, loss fading, and transformation smoothing continue between tracking updates. UI state changes only on discrete control/camera/tracking/interaction transitions; frame data and performance counters remain outside React state. Hidden previews no longer return their image snapshots to the main thread or redraw a hidden canvas.

Adaptive quality uses foreground FPS windows and changes one level at a time:

| Level | Pixel-density cap | Particle budget |
| --- | --- | --- |
| High | 1.75 | 5,000 |
| Medium | 1.25 | 3,500 |
| Low | 1.0 | 2,000 |

Below 45 FPS for at least two measured seconds reduces quality; above 57 FPS for at least eight seconds restores a level. Changes have a five-second cooldown to prevent oscillation. Draw/simulation counts ease between budgets instead of replacing meshes/buffers. Hidden-tab gaps and intervals longer than 250 ms reset the timing window rather than count as rendering load. The render loop is cancelled while the document is hidden and restarted once on return; active input is disarmed. Low quality preserves all controls, formations, and camera behavior. These safeguards improve load tolerance but do not guarantee a frame rate on every device.

Lifecycle hardening:

- Repeated Enable calls during permission, camera/model initialization, or ready state are idempotent. Disable→Enable while a permission request is pending waits for and stops the cancelled stream before requesting another.
- Duplicate worker-ready messages cannot start another tracking scheduler. Only a response matching the current in-flight timestamp can update tracking or metrics; duplicate/stale transferred images are closed.
- Shutdown is idempotent. Tracks, video handlers, watchdogs, schedules, and workers are released on disable, failure, or unmount. Late snapshots/streams are released without reviving a cancelled generation.
- Renderer startup now rolls back partial resources if setup fails after creating a canvas or listeners. Runtime input/render failures also clean up. Disposing twice, Strict Mode-style remounts, repeated visibility events, resizing, and formation switching do not add canvases or loops.

### Results — November 16, 2026

Lint, production build, `git diff --check`, and **42 automated test groups pass**. The pre-existing Three.js bundle-size advisory remains. New tests explicitly cover:

- 25 camera enable/disable cycles, repeated Enable, duplicate worker-ready/results, stream/worker/scheduler counts, and listener removal.
- Disable/re-enable during pending permission, late-stream cleanup, and serialized replacement requests.
- Pinch threshold equality, confidence boundaries, hysteresis, one-time start/release, tracking loss/recovery, safe resume, and one/two-hand mode transitions.
- Close hand crossings exiting transform without a large rotation or accidental held-pinch reactivation.
- Equal 60 Hz simulated particle motion with static gestures delivered at 10 vs 30 Hz.
- Adaptive downgrade/recovery and suspension-gap handling, rolling metrics/staleness, resize/formation stress, visibility pause/resume, initialization rollback, runtime failure cleanup, and idempotent disposal.

A local Node CPU microbenchmark (300 warm-up + 300 measured updates) measured approximately **0.115 ms mean / 0.141 ms p95** for 5,000 simulated particles, and **0.045 ms mean / 0.046 ms p95** for 2,000. This is a synthetic simulation-only measurement on the execution machine, not a browser/GPU FPS or camera inference benchmark.

Live browser profiling was attempted but computer-use permission is unavailable. Actual GPU FPS, real inference latency, visual adaptation, hardware camera cycling, and sustained memory behavior remain unverified. Manual check: open the debug overlay; enable/disable the camera repeatedly; resize and switch formations; cross/occlude/recover hands; toggle preview and pause; background/restore the tab; throttle rendering and observe quality reduce/recover. Check that FPS continues between inference results, tracking remains single-flight, no duplicate permission requests/camera indicators appear, and the browser console stays clear. Use browser performance/memory tools for a longer-session allocation and GPU check.
