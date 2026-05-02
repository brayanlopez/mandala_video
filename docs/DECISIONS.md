# Architecture Decision Records — Mandala Animada

Important design decisions with their context, alternatives considered, and rationale.
Each record is a permanent log — superseded decisions are kept for history.

---

## ADR-01 — Command Queue rendering pattern

**Date**: initial implementation  
**Status**: Accepted

### Context

The animator needs to tell the renderer what to draw each frame. The naive approach is to
call renderer methods directly from within the animation loop. This creates direct coupling:
the animator would need to know which engine is active and call its specific API.

### Options considered

| Option            | Description                                                    | Problem                                |
| ----------------- | -------------------------------------------------------------- | -------------------------------------- |
| **Direct calls**  | `p5.image(...)`, `gl.drawArrays(...)` inline in animator       | Couples animator to specific engine    |
| **Event system**  | Emit events like `"draw:image"` with data                      | Async, ordering issues, harder to test |
| **Command queue** | Enqueue `{type, data}` objects; renderer executes on `flush()` | Chosen                                 |

### Decision

The animator **enqueues** draw commands; the renderer **executes** them all at once on `flush()`.

```
animator._renderFrame()
  → renderer.clear(bgColor)        → push { type: "clear", bgColor }
  → renderer.drawImage(img, ...)   → push { type: "image", img, x, y, size, alpha, rot }
  → renderer.drawGlow(...)         → push { type: "glow", ... }
  → renderer.drawParticle(...)     → push { type: "particle", ... }
  → renderer.flush()               → execute all queued commands
```

### Consequences

- ✅ `animator.js` has zero knowledge of the active rendering engine
- ✅ New renderers need only implement the same 10-method interface — no changes elsewhere
- ✅ Deterministic export: `tickExport()` calls `flush()` exactly once per frame
- ✅ Easy to test: inject a mock renderer with `vi.fn()` spies
- ⚠ Each renderer must implement its own queue execution — small boilerplate per engine

---

## ADR-02 — Renderer-agnostic effects design

**Date**: continuous effects sprint  
**Status**: Accepted

### Context

Adding visual effects (idle float, camera breathing, particles, glow halo) — where should
the state and math live? Options were: inside each renderer (GPU-native), or in `animator.js`
(engine-agnostic).

### Options considered

**Option A — Effects in each renderer**  
Each renderer implements its own particle system, floating logic, etc. using GPU-native
primitives (Three.js: `THREE.Points`; PixiJS: particle container).

- ✅ Maximum GPU efficiency — Three.js particles using `BufferGeometry` directly
- ❌ Logic is duplicated across renderers
- ❌ Swapping renderer resets all effects state
- ❌ Config controls (`effects.idleFloat.enabled`) would need to reach the renderer

**Option B — Effects in `animator.js` (chosen)**  
All effect state (positions, phases, physics) lives in `animator.js`. Renderers receive
only primitive values (`x, y, size, alpha, colorHex`).

- ✅ Effects work identically across p5, Three.js, and any future renderer
- ✅ Config toggles and sliders directly control effects — single code path
- ✅ No state loss on renderer switch
- ⚠ Can't use GPU-native particle systems (e.g. `THREE.Points` for 200 particles is better
  than 200 `drawParticle()` calls). Acceptable at this scale.

### Decision

All effect state lives in `animator.js`. Renderers receive only primitives via the interface:

| Effect           | State in                                                                  | Renderer receives                           |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| Idle float       | `animator.js` — `sin(elapsed × speed + i × GOLDEN_ANGLE_RAD) × amplitude` | Modified Y in `drawImage()`                 |
| Camera breathing | `animator.js` — two orthogonal sines (×1 and ×0.71)                       | Modified X, Y, size in `drawImage()`        |
| Glow halo        | `animator.js` — emitted per visible slot                                  | `drawGlow(x, y, size, alpha, colorHex)`     |
| Particles        | `animator.js` — array `{x, y, vy, size, alpha, color}`, vertical wrap     | `drawParticle(x, y, size, alpha, colorHex)` |

The **golden angle** (137.508° = 2.3999… rad) distributes idle-float phases so no two
sprites oscillate in sync — the same spacing used by sunflowers to pack seeds.

### Consequences

- ✅ `renderer-p5.js` and `renderer-three.js` implement effects with different GPU paths
  but identical animator calls
- ✅ Adding PixiJS renderer requires zero changes to `animator.js`
- ✅ UI controls (`effects.*` config + settings panel) work for all renderers
- ⚠ `pauseEffects() / tickEffects() / resumeEffects()` on the renderer interface are no-ops
  today because effects run in animator. A future engine with self-managed GPU loops would
  use them — see ADR-05.

---

## ADR-03 — Multi-renderer architecture: swappable strategy

**Date**: multi-renderer sprint  
**Status**: Accepted

### Context

p5.js uses the Canvas 2D API (CPU-only, software-rendered). With 37+ images at 60fps, CPU
usage is noticeable. The question was whether to replace p5.js or build a swappable system.

### Options considered

**Option A — Replace p5.js with a single GPU renderer**  
Choose one engine, rewrite the rendering layer. Simpler long-term codebase.

- ✅ No abstraction overhead
- ❌ Loses p5.js simplicity and broad compatibility (no WebGL required)
- ❌ Cannot easily compare rendering approaches or offer fallback

**Option B — Swappable renderer via registry (chosen)**  
Define a contract (10-method interface), implement multiple adapters, select via config.

- ✅ p5.js stays as default (works everywhere, no WebGL required)
- ✅ GPU renderers available when needed
- ✅ Adding PixiJS or any future engine requires one new file
- ⚠ More initial design work — interface must be stable

### Decision

`renderer-interface.js` provides a `RENDERER_REGISTRY` and a `createRenderer(name)` factory
using dynamic import. Only the selected engine's bundle is loaded.

```
config.renderer.engine = "p5" | "three"   →   createRenderer(name)
                                               ↓
                                     dynamic import of renderer-xxx.js
                                               ↓
                                     new XxxRenderer()
```

Modules that **never change** when swapping renderer: `animator.js`, `exporter.js`,
`geometry.js`, `geometry-patterns.js`, `presets.js`.

Modules with **minimal changes**: `main.js` (`new XxxRenderer()` → `createRenderer()`),
`index.html` (add `<option>`), `config.js` (add `renderer.engine`).

### Consequences

- ✅ Phases 1 (interface), 3 (UI), and 4 (Three.js) implemented
- ⏳ Phase 2 (PixiJS) pending — see `ROADMAP.md`

---

## ADR-04 — Renderer engine selection

**Date**: multi-renderer sprint  
**Status**: Accepted

### Context

Three candidate GPU engines for replacing or complementing p5.js: PixiJS, Three.js, raw WebGL.
The decision had two sub-questions: which to build first, and which should be the default.

### Full comparison

| Criterion                        | p5.js       | PixiJS      | Three.js             |
| -------------------------------- | ----------- | ----------- | -------------------- |
| **Performance (37+ images)**     | ★★☆ Slow    | ★★★ Fast    | ★★★ Fast             |
| **Implementation complexity**    | ★★★ Low     | ★★☆ Medium  | ★☆☆ High             |
| **2D visual effects**            | ★★☆ Basic   | ★★★ Good    | ★★★ Good             |
| **3D effects / shaders**         | ★☆☆ No      | ★★☆ Filters | ★★★ Full             |
| **Transparent bg (export)**      | ★★★ Trivial | ★★☆ Config  | ★☆☆ Complex          |
| **CCapture compatibility**       | ★★★         | ★★★         | ★★☆ (\*)             |
| **Bundle size**                  | ~800 KB     | ~700 KB     | ~1 MB                |
| **Testability (mocking)**        | ★★★         | ★★☆         | ★☆☆                  |
| **Fit with command queue model** | ★★★ Exact   | ★★★ Natural | ★★☆ Needs adaptation |

(\*) Three.js needs `preserveDrawingBuffer: true` for CCapture, which has a 10–20% performance
cost.

### Decision

- **Default engine: p5.js** — works everywhere without WebGL, easy to test, zero setup
- **Second engine: Three.js** — needed for Z-depth per ring (actual 3D layering), which is
  fundamentally impossible in Canvas 2D. Built first because the Z-depth feature was a hard
  requirement.
- **Third engine: PixiJS** — best choice for 2D GPU performance. Lower complexity than
  Three.js, natural fit with the command queue, enables WebGL filters without changing the
  interface. Pending implementation.

### When to use each engine

| Use case                                  | Recommendation               |
| ----------------------------------------- | ---------------------------- |
| Default — broad compatibility             | p5.js                        |
| Better 60fps performance (37+ images)     | PixiJS                       |
| WebGL filters (glow, blur, color grading) | PixiJS with `@pixi/filter-*` |
| Z-depth per ring, 3D rotations            | Three.js                     |
| No WebGL available                        | p5.js                        |

### Consequences

- ✅ Three.js implemented: `renderer-three.js` — Z-depth, GPU particles, glow mesh pool
- ⏳ PixiJS pending: `renderer-pixi.js` — see `ROADMAP.md` for implementation guide
- ⚠ Three.js `preserveDrawingBuffer: true` accepted as necessary cost for CCapture support

---

## ADR-05 — pauseEffects / tickEffects / resumeEffects on the renderer interface

**Date**: continuous effects sprint  
**Status**: Accepted

### Context

Frame-by-frame export (`tickExport`) needs deterministic rendering — every frame must be
identical across runs. If a renderer has a self-managed GPU effects loop (e.g. a Three.js
particle system running on its own RAF), those effects would advance at wall-clock speed
during export, making the output non-deterministic.

### Options considered

**Option A — Animator controls all effects**  
All effects advance through `tickExport()` calls from the animator. No renderer-side loops.

- ✅ Deterministic by construction
- ✅ Already the design for p5 and current Three.js
- ❌ Can't use self-managed GPU particle systems that need their own RAF loop

**Option B — Renderer controls its effects loop; pause/resume on export (chosen)**  
Renderer runs its own effects loop during preview. On export start, animator tells renderer
to pause; each export frame, animator ticks renderer by exactly `frameDeltaMs`.

```js
// Export start
renderer.pauseEffects();

// Per export frame
renderer.tickEffects(frameDeltaMs); // advance GPU effects by exactly 1 frame
animator.tickExport(frameDeltaMs); // advance animation by exactly 1 frame

// Export end
renderer.resumeEffects();
```

- ✅ Future GPU renderer can have self-managed effects (GPU particles, camera animation)
- ✅ Export remains deterministic — renderer advances by fixed delta, not wall clock
- ✅ No-ops in p5 and current Three.js (effects driven by animator) — zero cost today

### Decision

Add `pauseEffects()`, `tickEffects(dt)`, `resumeEffects()` to the renderer interface.
Current implementations are **no-ops** because effects state lives in `animator.js` (ADR-02).
The contract is established for future renderers that may self-manage GPU effects.

`animator.tickExport()` always calls `renderer.tickEffects(frameDeltaMs)` before advancing
its own time — correct ordering is enforced even when the methods are no-ops.

### Consequences

- ✅ Interface is forward-compatible with self-managed GPU effect loops
- ✅ Zero runtime cost for p5 and Three.js (no-ops)
- ✅ Export determinism guaranteed regardless of renderer implementation
- ⚠ A future renderer that implements real `tickEffects()` must be careful not to double-advance
  effects that are also driven by `animator.js` coordinate pre-computation
