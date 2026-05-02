# Contributing — Mandala Animada

> Development guide: setup, testing, CI, known issues, and how to extend the project.

## Development setup

```bash
npm start          # start dev server at http://localhost:3000 (auto-installs deps)
npm test           # run test suite once
npm run test:watch # watch mode
npm run test:coverage  # run with coverage report
npm run lint       # ESLint check
npm run format     # Prettier format
```

Node.js ≥ 16 required. No bundler — ES Modules served directly by `server.js`.

## Testing

| File                        | Lines     | What it covers                                       |
| --------------------------- | --------- | ---------------------------------------------------- |
| `animator.test.js`          | 1085      | State machine, 8 entry effects, 4 continuous effects |
| `geometry-patterns.test.js` | 660       | 14 patterns, coordinates, image assignment           |
| `renderer-p5.test.js`       | 522       | Command queue, glow, particles, export interface     |
| `geometry.test.js`          | 239       | CWE-22 path sanitization, layout, coordinates        |
| `presets.test.js`           | 211       | CRUD localStorage, JSON round-trip, validation       |
| **Total**                   | **2,717** | **277 cases — 98.7% coverage**                       |

Coverage threshold enforced at 95% on all four metrics (statements, branches, functions,
lines) via `vitest.config.mjs`. The CI pipeline blocks deploy if coverage drops below
threshold.

**Gap**: no integration tests between layers (animator → renderer → canvas → export).
Unit coverage is comprehensive; full-stack export path is only tested manually.

## CI / CD pipeline

```
lint  ──→  test  ──→  build  ──→  deploy
 ↓           ↓          ↓
ESLint    98.7% cov  dist/       GitHub Pages
Prettier  5 suites  cp files
```

| Job    | Command                         | Blocks next |
| ------ | ------------------------------- | ----------- |
| lint   | `npm run lint` + `format:check` | Yes         |
| test   | `npm run test:coverage` (≥95%)  | Yes         |
| build  | Copy `src/`, `lib/`, `images/`  | Yes         |
| deploy | `actions/deploy-pages`          | N/A         |

All jobs use `npm ci` for reproducible installs.

## Module notes

### `main.js` — 845 lines

- `AppState` centralizes all mutable state (`main.js:78-87`)
- Input validation via 4 allowlist constants + regex + `clamp()` (`main.js:302-310`)
- 20 focused binding functions — one per control
- `bindEffectsControls()` — 8 bindings for continuous effects + master toggle button
- `_syncToggleEffectsBtn()` — keeps the master button label in sync with individual checkboxes
- `syncUIFromConfig()` — single source of truth for reflecting CONFIG into all UI controls
- `switchPattern()` async — same pattern as future `switchRenderer()`

---

### `animator.js` — 420 lines

- Constants defined before the class: `GOLDEN_ANGLE_RAD`, `SPIN_IN_ROTATION_DEG`,
  `DROP_HEIGHT_FACTOR`, `SLIDE_OUT_FACTOR`, `SHRINK_INITIAL_SCALE`, `SPIRAL_ROTATIONS_DEG`
- `_cx`/`_cy` precomputed in constructor — no division per frame in hot path
- 8 entry effects with correct easing
- 4 continuous effects (idle float, camera breathing, glow, particles) — fully renderer-agnostic
- `tickExport()` calls `renderer.tickEffects(dt)` before advancing time — export determinism
- No coupling to any concrete renderer type

---

### `renderer-p5.js` — 255 lines

- 10-method interface documented in file header
- `drawGlow` — additive radial gradient via `drawingContext.createRadialGradient()` + `"lighter"`
- `drawParticle` — additive circle via `drawingContext.arc()` + `"lighter"`
- `pauseEffects` / `tickEffects` / `resumeEffects` — no-ops establishing the GPU renderer contract
- `_hexToRgb()` — module-level helper, used by both glow and particle handlers

---

### `exporter.js` — 258 lines

- Capture mode is fully transparent to `main.js`
- Codec auto-detection with fallback (`_getSupportedMimeType()`)
- Accepts `renderer` as optional 4th param — calls `pauseEffects()` / `resumeEffects()` at
  export boundaries for GPU-side determinism
- Object URLs revoked after 10s

---

### `geometry-patterns.js` — 731 lines

14 patterns across 5 categories. Each algorithm is documented with the math in comments.
`buildImagePool()` / `assignImages()` are shared helpers — not duplicated per pattern.

---

### `presets.js` — 156 lines

Pure functions — no DOM dependency, fully unit-testable. `QuotaExceededError` caught with
descriptive message.
