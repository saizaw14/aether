# Aether

An interactive particle universe built with React, TypeScript, Vite, and Three.js. First visual milestone: mouse-driven formations, before webcam input.

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

The optional Google Fonts stylesheet has local sans-serif fallbacks; particle rendering requires no external assets or services.

## Next milestone

Add opt-in webcam hand tracking through a separate input adapter: hand position, pinch-to-gather, then two-hand scale/rotation. Webcam capture, gesture recognition, sound, recording, accounts, and backend services are intentionally outside this milestone.

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
