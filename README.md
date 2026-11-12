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

`npm run lint` and `npm run build` pass. A direct simulation check confirmed deterministic finite layouts, gathering consistency at 30/144 Hz, release recovery, and formation convergence. The build reports a bundle-size advisory for Three.js. Browser visual and pointer testing could not run in this environment because computer-use permission was unavailable; verify glow, mouse drag/release, fullscreen, narrow layouts, and reduced-motion behavior locally.
