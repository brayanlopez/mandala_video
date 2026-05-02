# Architecture — Mandala Animada

> Last updated: 2026-05-02

---

## Project structure

```
mandala_video/
├── config.js                    # Single source of truth for all parameters (138 lines)
├── server.js                    # Standalone dev server with security headers
├── index.html                   # UI — strict CSP + full ARIA (327 lines)
├── styles.css                   # Dark theme (433 lines)
├── eslint.config.js             # ESLint 9 flat config
├── .prettierrc
├── js/
│   ├── main.js                  # Orchestrator, AppState, UI binding (845 lines)
│   ├── animator.js              # Animation state machine + continuous effects (420 lines)
│   ├── exporter.js              # CCapture / MediaRecorder abstraction (258 lines)
│   ├── renderer-p5.js           # p5.js rendering adapter — swappable (255 lines)
│   ├── geometry.js              # Pattern router + CWE-22 path sanitization (123 lines)
│   ├── geometry-patterns.js     # 14 geometric layout algorithms (731 lines)
│   └── presets.js               # Preset persistence + serialization (156 lines)
├── tests/
│   ├── animator.test.js         # 1085 lines — state machine, 8 entry effects, 4 continuous effects
│   ├── geometry-patterns.test.js # 660 lines — 14 patterns, image assignment
│   ├── renderer-p5.test.js      # 522 lines — command queue, glow, particles, export interface
│   ├── geometry.test.js         # 239 lines — path sanitization, coordinates
│   └── presets.test.js          # 211 lines — CRUD, JSON, validation
├── images/                      # center/, ring1/, ring2/, ring3/
├── package.json
├── vitest.config.mjs            # 95% coverage threshold on 4 metrics
└── .github/workflows/deploy.yml # CI: lint → test → build → deploy
```

**Source**: ~2,930 lines | **Tests**: 2,717 lines | **Coverage**: 98.7%

---

## Layers

```
┌────────────────────────────────────────────┐
│  UI Layer            →  main.js            │  Event handling, AppState, DOM binding
├────────────────────────────────────────────┤
│  Animator            →  animator.js        │  State machine, timing, entry + continuous effects
│  Exporter            →  exporter.js        │  CCapture / MediaRecorder, export lifecycle
├────────────────────────────────────────────┤
│  Renderer            →  renderer-p5.js     │  Command queue, drawing (swappable)
├────────────────────────────────────────────┤
│  Geometry            →  geometry.js        │  Pattern router, CWE-22 sanitization
│  Patterns            →  geometry-patterns.js │  14 layout algorithms
└────────────────────────────────────────────┘
```

### Application state

`AppState` in `main.js` centralizes all mutable state:

```js
const AppState = {
  renderer: null, // active renderer instance
  animator: null, // animation state machine
  exporter: null, // video capture
  slots: [], // positions computed by geometry
  images: [], // loaded images (opaque type — only renderer knows)
  isPlaying: false,
  isExporting: false,
  currentPattern: "circular",
};
```

The image type (`p5.Image`, `PIXI.Texture`, `THREE.Texture`) is intentionally opaque to all
layers except the renderer. `animator.js` passes images back to `drawImage()` without
inspecting them.

---

## Design patterns

| Pattern                  | Location                                    | Benefit                                              |
| ------------------------ | ------------------------------------------- | ---------------------------------------------------- |
| **Command Queue**        | `renderer-p5.js`                            | Decouples animation logic from rendering engine      |
| **Registry Pattern**     | `geometry-patterns.js` (`PATTERN_REGISTRY`) | Adding a pattern = 1 entry; UI updates automatically |
| **State Machine**        | `animator.js`                               | State transitions without possibility of corruption  |
| **Layered Architecture** | All modules                                 | Swap renderer = 1 new file, zero changes to animator |
| **Preset Versioning**    | `presets.js`                                | Forward/backward compatibility in serialization      |

---

## Module coupling

| Module                 | Responsibility                     | Coupled to                              |
| ---------------------- | ---------------------------------- | --------------------------------------- |
| `config.js`            | Global configuration               | Nothing — pure data                     |
| `geometry.js`          | Pattern router + path sanitization | `PATTERN_REGISTRY` only                 |
| `geometry-patterns.js` | 14 layout algorithms               | `geometry.js` (`sanitizePath`)          |
| `animator.js`          | Timing, effects, visual state      | Renderer interface only (10 methods)    |
| `renderer-p5.js`       | p5.js adapter                      | Self-contained                          |
| `exporter.js`          | Video capture                      | `HTMLCanvasElement` + optional renderer |
| `presets.js`           | Serialization + persistence        | Nothing — pure functions                |
| `main.js`              | Orchestration + UI                 | All modules (expected role)             |

---

## Renderer interface

The renderer contract (`renderer-p5.js`) defines 10 public methods. Any renderer implementing
this interface works without changes to `animator.js`, `exporter.js`, or `main.js`.

```
init(containerId, w, h, onReady)          → set up canvas, call onReady when ready
loadImage(src)                            → Promise<engine-specific image type>
clear(bgColor)                            → enqueue frame clear (color or 'transparent')
drawImage(img, x, y, size, alpha, rotDeg) → enqueue centered image with rotation
flush()                                   → execute queue and present frame to canvas
getCanvas()                               → HTMLCanvasElement (for CCapture/MediaRecorder)
destroy()                                 → release resources, unmount from DOM
drawGlow(x, y, size, alpha, colorHex)     → enqueue additive radial halo
drawParticle(x, y, size, alpha, colorHex) → enqueue additive circle
pauseEffects()                            → freeze engine-side effects before frame export
tickEffects(dt)                           → advance engine-side effects by exactly dt ms
resumeEffects()                           → resume engine-side effects after export
```

`pauseEffects`, `tickEffects`, and `resumeEffects` are no-ops in `renderer-p5.js` because
all effect state lives in `animator.js`. A GPU renderer (Three.js, PixiJS) would use them
to keep particle systems and camera animations deterministic during frame-by-frame export.

See `MULTI_RENDERER_ANALYSIS.md` for the full multi-renderer implementation plan.

---

## Continuous effects (renderer-agnostic)

All post-entry effects are decomposed into two layers:

1. **State layer** (`animator.js`) — manages positions, timing, particle physics. Has zero
   knowledge of the rendering engine.
2. **Draw layer** (renderer) — receives only primitive values (`x, y, size, alpha, colorHex`)
   and implements the visual with whatever engine is active.

| Effect           | State owner   | Renderer call              | How it works                                                         |
| ---------------- | ------------- | -------------------------- | -------------------------------------------------------------------- |
| Idle float       | `animator.js` | `drawImage(…, y)`          | `sin(elapsed × speed + i × GOLDEN_ANGLE_RAD) × amplitude` added to Y |
| Camera breathing | `animator.js` | `drawImage(…, x, y, size)` | Two orthogonal sines (×1 and ×0.71) scale + sway all slots           |
| Glow halo        | `animator.js` | `drawGlow()`               | Emitted per visible slot before the image                            |
| Particles        | `animator.js` | `drawParticle()`           | Array of `{x, y, vy, size, alpha, color}`, vertical wrap             |

The golden angle (137.508°) distributes idle-float phases across slots so no two sprites
oscillate in sync.

---

## Configuration reference

All parameters live in `config.js`. Changes take effect immediately — no rebuild required.

### `canvas`

| Key        | Default   | Description                             |
| ---------- | --------- | --------------------------------------- |
| `width`    | `1920`    | Canvas width in px                      |
| `height`   | `1080`    | Canvas height in px                     |
| `bgColor`  | `#1a0a2e` | Background color (hex or `transparent`) |
| `fps`      | `60`      | Export framerate (30 or 60)             |
| `imgScale` | `1.0`     | Global image size multiplier (0.3–2.0)  |

### `animation`

| Key             | Default   | Description                                                             |
| --------------- | --------- | ----------------------------------------------------------------------- |
| `speed`         | `1.0`     | Global speed multiplier (preview only; export is always deterministic)  |
| `staggerDelay`  | `160`     | ms between each slot's entrance start                                   |
| `entryDuration` | `700`     | ms for the entry effect of each slot                                    |
| `entryEffect`   | `scaleIn` | `fadeIn` `scaleIn` `spinIn` `flyIn` `drop` `slideOut` `shrink` `spiral` |
| `rotationSpeed` | `0.04`    | Degrees/frame continuous global rotation (0 = none)                     |
| `loopAnimation` | `false`   | Restart animation after completion                                      |

### `effects`

All effects are renderer-agnostic — swapping the renderer does not require any changes here.

| Key                        | Default  | Description                                    |
| -------------------------- | -------- | ---------------------------------------------- |
| `idleFloat.enabled`        | `true`   | Sinusoidal Y oscillation after entry completes |
| `idleFloat.amplitude`      | `8`      | Max vertical displacement in px                |
| `idleFloat.speed`          | `0.0012` | Oscillation speed in rad/ms                    |
| `cameraBreathing.enabled`  | `true`   | Global scale + lateral sway                    |
| `cameraBreathing.scaleAmp` | `0.013`  | Scale oscillation (1 ± value)                  |
| `cameraBreathing.swayAmp`  | `12`     | Max horizontal sway in px                      |
| `cameraBreathing.speed`    | `0.0008` | Breathing speed in rad/ms                      |
| `particles.enabled`        | `true`   | Ambient ascending particles                    |
| `particles.count`          | `200`    | Number of particles                            |
| `particles.speed`          | `0.08`   | Vertical drift in px/ms                        |
| `particles.palette`        | `[…]`    | `#RRGGBB` colors cycled per particle index     |
| `glow.enabled`             | `true`   | Soft radial halo behind each image             |
| `glow.radiusMultiplier`    | `1.6`    | Halo radius = `imgSize × radiusMultiplier`     |
| `glow.intensity`           | `0.55`   | Peak alpha of the halo center (0–1)            |

### `export`

| Key                  | Default    | Description                                          |
| -------------------- | ---------- | ---------------------------------------------------- |
| `captureMode`        | `ccapture` | `ccapture` (recommended) or `mediarecorder`          |
| `durationSeconds`    | `null`     | Export duration in s (`null` = until animation ends) |
| `videoBitsPerSecond` | `8000000`  | Bitrate for MediaRecorder (8 Mbps)                   |
| `transparentBg`      | `false`    | Export without background (alpha channel)            |

---

## Extensibility

### Add a geometric pattern

1. Implement `computeXxxLayout(config)` in `geometry-patterns.js` → returns `MandalaSlot[]`
2. Add an entry to `PATTERN_REGISTRY` with `label` and `category`
3. The UI dropdown updates automatically — no other changes needed

### Add a renderer

1. Create `js/renderer-xxx.js` implementing the 10-method interface above
2. Add it to `RENDERER_REGISTRY` (to be created in `renderer-interface.js`)
3. UI selects the engine via `<select>` → `switchRenderer()` in `main.js`
4. **Zero changes** to `animator.js`, `geometry.js`, `presets.js`, or `exporter.js`

Full plan: `MULTI_RENDERER_ANALYSIS.md`.

### Use the architecture for non-mandala animations

The renderer, exporter, and animator are content-agnostic — they only know about positions,
sizes, alphas, and rotations. Any animation expressible as _N images each with a
position/size/alpha/rotation that changes over time_ works without structural changes.

**Current structural limits:**

| Limit                                | What would remove it                                          |
| ------------------------------------ | ------------------------------------------------------------- |
| Single entry sequence per slot       | Timeline / keyframe model in `Animator`                       |
| Images only (no shapes, text, video) | New command types in the queue, or migrate to PixiJS/Three.js |
| All slots active simultaneously      | Per-slot `visible/hidden` state in `Animator`                 |

---

## Security

| Practice                    | Implementation                                        | Location                   |
| --------------------------- | ----------------------------------------------------- | -------------------------- |
| **Strict CSP**              | `script-src 'self'` — no CDN, no eval, no inline      | `index.html:14-25`         |
| **Path traversal (CWE-22)** | `sanitizePath()` blocks `..` and non-safe chars       | `geometry.js:108-123`      |
| **No XSS**                  | `textContent` everywhere — never `innerHTML`          | `main.js` (all DOM writes) |
| **Input validation**        | Allowlists + regex + `clamp()` before mutating CONFIG | `main.js:302-310`          |
| **MIME allowlist**          | Server only serves authorized file types              | `server.js`                |
| **Security headers**        | COOP: same-origin, COEP: require-corp, X-CTO          | `server.js`                |
| **Preset versioning**       | `data.version` validated before applying              | `presets.js:17, 144`       |
| **Storage quota**           | `QuotaExceededError` caught in save/delete            | `presets.js:83-85`         |
| **Full ARIA**               | `aria-label`, `aria-live`, `role="progressbar"`       | `index.html`               |
