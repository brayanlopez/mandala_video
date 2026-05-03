# AGENTS.md — Mandala Animada

Guide for coding agents working on this project.

## Quick start

```bash
npm run dev          # start dev server at http://localhost:3000
npm test             # run tests once
npm run test:watch   # watch mode
npm run lint         # ESLint + Prettier check
npm run check        # lint + format:check + test:coverage (CI script)
```

Node.js ≥ 16 required. No bundler — ES Modules served directly by `server.js`.

## Project overview

Animated mandala generator with p5.js/Three.js renderers, exportable to Full HD WebM video. ~2,930 source lines, 98.7% test coverage.

## Commands to run after changes

Always run these before committing:

```bash
npm run lint         # ESLint check on js/ config.js
npm run format:check # Prettier check on js/**/*.js config.js styles.css
npm run test:coverage  # must maintain ≥95% coverage on all metrics
```

## Architecture

Layered architecture — modules are intentionally decoupled:

```
UI Layer        → main.js              Event handling, AppState, DOM binding
Animator       → animator.js          State machine, effects (renderer-agnostic)
Exporter       → exporter.js          CCapture / MediaRecorder abstraction
Renderer       → renderer-p5.js       Swappable rendering adapter
Geometry       → geometry.js          Pattern router + CWE-22 path sanitization
Patterns       → geometry-patterns.js 14 layout algorithms
```

Key contract: **Renderer interface** (`renderer-p5.js`) defines 10 methods. Any renderer implementing this interface works without changes to animator, exporter, or main.

## Code style

- **ES Modules** — `import`/`export`, no `require()`
- **No comments** unless explicitly requested by user
- **Constants** — named constants for all magic numbers (see `geometry-patterns.js` top)
- **Formatting** — Prettier with project `.prettierrc`
- **Linting** — ESLint 9 flat config (`eslint.config.js`)

## Testing

- Framework: **Vitest** with jsdom environment
- Location: `test/` directory, co-located `.test.js` files
- Coverage threshold: **95%** on statements, branches, functions, lines
- Current coverage: **98.7%** (352 cases)
- Run: `npm run test:coverage`

### Adding tests

Follow existing patterns in `test/` files. Each module has a corresponding test file:
- `animator.test.js` — state machine, 8 entry effects, 4 continuous effects
- `geometry-patterns.test.js` — 14 patterns, coordinates, image assignment
- `renderer-p5.test.js` — command queue, glow, particles, export interface
- `geometry.test.js` — CWE-22 path sanitization, layout, coordinates
- `presets.test.js` — CRUD localStorage, JSON round-trip, validation

## Security rules

- **No `innerHTML`** — always use `textContent` for DOM updates
- **Strict CSP** — no CDN, no eval, no inline scripts (`index.html`)
- **Path traversal** — use `sanitizePath()` from `geometry.js` for all user-supplied paths
- **Input validation** — allowlists + regex + `clamp()` before mutating CONFIG (`main.js:302-310`)

## Extensibility patterns

### Add a geometric pattern

1. Implement `computeXxxLayout(config)` in `geometry-patterns.js` → returns `MandalaSlot[]`
2. Add entry to `PATTERN_REGISTRY` with `label` and `category`
3. UI dropdown updates automatically — no other changes needed

### Add a renderer

1. Create `js/renderer-xxx.js` implementing the 10-method interface
2. Add to `RENDERER_REGISTRY` in `renderer-interface.js`
3. **Zero changes** to `animator.js`, `geometry.js`, `presets.js`, or `exporter.js`

## Key files

| File | Purpose |
|------|---------|
| `config.js` | Single source of truth for all parameters (138 lines) |
| `js/main.js` | Orchestrator, AppState, UI binding (845 lines) |
| `js/animator.js` | Animation state machine + continuous effects (420 lines) |
| `js/renderer-p5.js` | p5.js rendering adapter (255 lines) |
| `js/geometry-patterns.js` | 14 geometric layout algorithms (731 lines) |
| `docs/ARCHITECTURE.md` | Full system design and config reference |
| `docs/DEVELOPMENT.md` | Dev setup, testing details, module notes |

## CI/CD pipeline

```
lint → test → build → deploy
 ↓      ↓       ↓
ESLint 98.7%  dist/   GitHub Pages
Prettier cov    cp files
```

CI blocks deploy if coverage drops below 95%.

## Common pitfalls

- **Don't modify `animator.js` when swapping renderers** — it's renderer-agnostic
- **All effect state lives in `animator.js`** — renderers receive only primitive values
- **Images are opaque** — only renderer knows the image type (`p5.Image`, `THREE.Texture`, etc.)
- **`preserveDrawingBuffer: true`** required in WebGL renderers for CCapture framebuffer access
- **Golden angle** (137.508°) used for distributing idle-float phases across slots
