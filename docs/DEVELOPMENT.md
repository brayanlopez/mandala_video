# Development — Mandala Animada

> Development guide: setup, testing, CI, module notes, open issues, and quality history.

---

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

---

## Testing

| File                         | Lines     | What it covers                                         |
| ---------------------------- | --------- | ------------------------------------------------------ |
| `animator.test.js`           | 1086      | State machine, 8 entry effects, 4 continuous effects   |
| `geometry-patterns.test.js`  | 660       | 14 patterns, coordinates, image assignment             |
| `renderer-p5.test.js`        | 522       | Command queue, glow, particles, export interface       |
| `renderer-three.test.js`     | 693       | ThreeRenderer interface, Z-depth, flush, init, destroy |
| `renderer-interface.test.js` | 75        | RENDERER_REGISTRY structure, createRenderer()          |
| `geometry.test.js`           | 239       | CWE-22 path sanitization, layout, coordinates          |
| `presets.test.js`            | 211       | CRUD localStorage, JSON round-trip, validation         |
| **Total**                    | **3,486** | **352 cases — 98.7% coverage**                         |

Coverage threshold enforced at 95% on all four metrics (statements, branches, functions,
lines) via `vitest.config.mjs`. The CI pipeline blocks deploy if coverage drops below
threshold.

**Gap**: no integration tests between layers (animator → renderer → canvas → export).
Unit coverage is comprehensive; full-stack export path is only tested manually.

---

## CI / CD pipeline

```
lint  ──→  test  ──→  build  ──→  deploy
 ↓           ↓          ↓
ESLint    98.7% cov  dist/       GitHub Pages
Prettier  7 suites  cp files
```

| Job    | Command                         | Blocks next |
| ------ | ------------------------------- | ----------- |
| lint   | `npm run lint` + `format:check` | Yes         |
| test   | `npm run test:coverage` (≥95%)  | Yes         |
| build  | Copy `src/`, `lib/`, `images/`  | Yes         |
| deploy | `actions/deploy-pages`          | N/A         |

All jobs use `npm ci` for reproducible installs.

---

## Module notes

### `main.js` — 933 lines

- `AppState` centralizes all mutable state (`main.js:78-87`)
- Input validation via 4 allowlist constants + regex + `clamp()` (`main.js:302-310`)
- 20 focused binding functions — one per control
- `withPresetAction(fn)` — async try/catch wrapper for all preset handlers; eliminates repeated boilerplate and also covers the previously unprotected `deletePreset()` call
- `bindEffectsControls()` — 8 bindings for continuous effects + master toggle button
- `_syncToggleEffectsBtn()` — keeps the master button label in sync with individual checkboxes
- `syncUIFromConfig()` — single source of truth for reflecting CONFIG into all UI controls
- `switchPattern()` async — same pattern as `switchRenderer()`
- `switchRenderer(engine)` async — destroys current renderer, creates the new one, reloads images
- `bindRendererSelect()` — wires the engine `<select>` to `switchRenderer()`

---

### `animator.js` — 421 lines

- Constants defined before the class: `GOLDEN_ANGLE_RAD`, `SPIN_IN_ROTATION_DEG`,
  `DROP_HEIGHT_FACTOR`, `SLIDE_OUT_FACTOR`, `SHRINK_INITIAL_SCALE`, `SPIRAL_ROTATIONS_DEG`
- `_cx`/`_cy` precomputed in constructor — no division per frame in hot path
- 8 entry effects with correct easing
- 4 continuous effects (idle float, camera breathing, glow, particles) — fully renderer-agnostic
- `tickExport()` calls `renderer.tickEffects(dt)` before advancing time — export determinism
- No coupling to any concrete renderer type

No active issues.

---

### `renderer-p5.js` — 262 lines

- 10-method interface documented in file header
- `drawGlow` — additive radial gradient via `drawingContext.createRadialGradient()` + `"lighter"`
- `drawParticle` — additive circle via `drawingContext.arc()` + `"lighter"`
- `pauseEffects` / `tickEffects` / `resumeEffects` — no-ops establishing the GPU renderer contract
- `_hexToRgb()` — module-level helper, used by both glow and particle handlers

`_imageCache` is cleared on every `switchPattern()` call via `clearImageCache()` (`main.js:203`),
so it never grows across pattern changes within a session.

---

### `renderer-interface.js` — 41 lines

- `RENDERER_REGISTRY` — maps engine names (`"p5"`, `"three"`) to lazy module imports and constructor names
- `createRenderer(name)` — async factory using dynamic import; only loads the selected engine's bundle
- Adding a new renderer requires one entry here, one new file, and one `<option>` in HTML

No active issues.

---

### `renderer-three.js` — 473 lines

- Implements the full 10-method interface plus `setSlotMetadata(slots)` for Z-depth mapping
- Z-depth: `slotIndex` (7th arg of `drawImage`) is mapped to ring via `setSlotMetadata`, applied as `z = ring × -35`
- `drawGlow()` — mesh pool with `CanvasTexture` + `AdditiveBlending` (gradient texture generated once)
- `drawParticle()` — pre-allocated `BufferGeometry` (512 slots) updated per frame from animator calls
- `preserveDrawingBuffer: true` — required for CCapture to read the WebGL framebuffer
- `destroy()` — disposes all GPU resources (textures, geometries, materials, WebGLRenderer)
- `pauseEffects`/`tickEffects`/`resumeEffects` are no-ops; all effects driven by `animator.js`

No active issues.

---

### `exporter.js` — 258 lines

- Capture mode is fully transparent to `main.js`
- Codec auto-detection with fallback (`_getSupportedMimeType()`)
- Accepts `renderer` as optional 4th param — calls `pauseEffects()` / `resumeEffects()` at
  export boundaries for GPU-side determinism
- Object URLs revoked after 10s

---

### `geometry-patterns.js` — 735 lines

14 patterns across 5 categories. Each algorithm is documented with the math in comments.
`buildImagePool()` / `assignImages()` are shared helpers — not duplicated per pattern.

All scale factors have named constants at the top of the file:

| Constant                 | Value | Used in                         |
| ------------------------ | ----- | ------------------------------- |
| `HEX_SPACING_FACTOR`     | 0.152 | Flor de la vida                 |
| `DIAMOND_SPACING_FACTOR` | 0.115 | Diamante                        |
| `TRIANGLE_CIRCUM_FACTOR` | 0.42  | Koch, Triangular, Sierpinski    |
| `OUTER_RADIUS_FACTOR`    | 0.44  | Espiral, Triskelion, Arquímedes |
| `CURVE_RADIUS_FACTOR`    | 0.38  | Lissajous, Rosa polar           |

---

### `presets.js` — 165 lines

Pure functions — no DOM dependency, fully unit-testable. `QuotaExceededError` caught with
descriptive message.

`requireObject(data, field)` helper extracted in `presetFromJSON()` — eliminates the
repeated `typeof data[x] !== "object"` guard pattern.

---

## Open issues

| #   | Priority | Description                                      | File     |
| --- | -------- | ------------------------------------------------ | -------- |
| 1   | Medium   | Integration tests (animator → renderer → export) | `tests/` |
| 2   | Low      | Implement PixiJS renderer (`renderer-pixi.js`)   | `js/`    |
| 3   | Low      | Tests for PixiJS renderer (once implemented)     | `tests/` |
