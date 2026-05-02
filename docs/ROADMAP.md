# Roadmap — Mandala Animada

> For implemented features see [`README.md`](README.md).
> For technical architecture see [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Current status

| Category            | Status                                                       |
| ------------------- | ------------------------------------------------------------ |
| Geometric engine    | Complete — 14 patterns in 5 categories                       |
| Animation system    | Complete — 8 entry effects + 4 continuous effects            |
| Video export        | Complete — CCapture + MediaRecorder + transparent background |
| User interface      | Complete — settings panel, effects, presets, master toggle   |
| Preset persistence  | Complete — CRUD localStorage + import/export JSON            |
| Security            | Solid — CSP, XSS, path traversal, ARIA                       |
| CI/CD               | Automated — GitHub Pages                                     |
| Tests               | 352 cases, 98.7% coverage                                    |
| Swappable renderer  | p5.js + Three.js implemented — PixiJS pending                |
| Custom image upload | Pending                                                      |
| Audio sync          | Pending                                                      |

---

## Pending features

### High priority

#### F-01 — PixiJS renderer (`renderer-pixi.js`)

GPU-accelerated 2D rendering. Biggest performance gain with medium effort.
Three.js is already implemented; PixiJS fills the gap between p5 (CPU 2D) and Three.js (GPU 3D).
See the [PixiJS implementation guide](#pixi-js-renderer-implementation-guide) below.

#### F-04 — GIF export

The CCapture frame loop already controls timing; GIF is a more portable format for social media.
Proposal: integrate `gif.js` as an additional export mode alongside WebM.
Effort: Low — new branch in `exporter.js`.

### Medium priority

#### F-05 — Custom image upload from the browser

Today images must be placed in server folders.
Proposal: `FileReader` / `createObjectURL` to replace ring images via drag & drop or `<input type="file">`.
Effort: Medium.

#### F-07 — Audio / BPM sync

Proposal: Web Audio API frequency analysis; map BPM to `rotationSpeed` and `staggerDelay`.
Effort: High — requires new `audio-analyzer.js` module.

#### F-09 — Color themes

Proposal: themes object in `config.js` with UI selector (cosmos, forest, ocean, fire).
Effort: Low.

#### F-10 — Server-side MP4 export

Proposal: optional endpoint in `server.js` that receives the WebM and converts with `fluent-ffmpeg`.
Effort: Medium.

### Low priority / experimental

#### F-11 — 3D mandala

Requires Three.js (already implemented). Animate the mandala on a torus or sphere in 3D.
Effort: High.

#### F-12 — Generative AI images

Proposal: generate images via external API; use results as slot sources per ring.
Effort: High.

#### F-13 — Kiosk / presentation mode

Proposal: `kioskMode: true` option that cycles patterns and effects automatically.
Effort: Low.

---

## PixiJS renderer implementation guide

> Phases 1 (interface), 3 (switchRenderer UI), and 4 (Three.js) are complete.
> **Phase 2 (PixiJS) and Phase 5 (PixiJS tests) are pending.**
> For the engine comparison and decision rationale, see [`DECISIONS.md — ADR-04`](DECISIONS.md#adr-04--renderer-engine-selection).

### Technical challenges

**Challenge 1 — Async init (Pixi v8)**

PixiJS v8 requires `await app.init(...)`. The current `init()` interface uses an `onReady` callback.
Solution: wrap the Promise in a callback internally:

```js
init(containerId, w, h, onReady) {
  const app = new PIXI.Application();
  app.init({ width: w, height: h, backgroundAlpha: 0, antialias: true }).then(() => {
    document.getElementById(containerId).appendChild(app.canvas);
    app.ticker.stop();   // same pull model as p5's noLoop()
    this._app    = app;
    this._canvas = app.canvas;
    this._ready  = true;
    onReady();
  });
}
```

**Challenge 2 — Sprites per frame**

Creating a `PIXI.Sprite` per image per frame and destroying it is inefficient.
A sprite pool (reuse between frames) is needed for good performance — internal change,
zero interface impact.

**Challenge 3 — Transparent background**

```js
// In init():
app.init({ backgroundAlpha: 0 });

// In clear() when bgColor === "transparent":
this._app.renderer.clear();
// vs solid color:
this._app.renderer.background.color = new PIXI.Color(bgColor);
```

### Full reference implementation

The complete `renderer-pixi.js` skeleton, ready to adapt and expand:

```js
import * as PIXI from "pixi.js";

export class PixiRenderer {
  constructor() {
    this._app = null;
    this._canvas = null;
    this._queue = [];
    this._cache = new Map(); // src → Promise<PIXI.Texture|null>
    this._ready = false;
  }

  init(containerId, w, h, onReady) {
    const app = new PIXI.Application();
    app
      .init({ width: w, height: h, backgroundAlpha: 0, antialias: true })
      .then(() => {
        document.getElementById(containerId).appendChild(app.canvas);
        app.ticker.stop();
        this._app = app;
        this._canvas = app.canvas;
        this._ready = true;
        onReady();
      });
  }

  loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (this._cache.has(src)) return this._cache.get(src);
    const p = PIXI.Assets.load(src).catch(() => {
      console.warn(`[PixiRenderer] Could not load: ${src}`);
      return null;
    });
    this._cache.set(src, p);
    return p;
  }

  clear(bgColor) {
    this._queue.push({ type: "clear", bgColor });
  }
  drawImage(img, x, y, size, a, rot) {
    if (img)
      this._queue.push({
        type: "image",
        img,
        x,
        y,
        size,
        alpha: a,
        rotDeg: rot,
      });
  }
  drawGlow(x, y, size, alpha, color) {
    this._queue.push({ type: "glow", x, y, size, alpha, colorHex: color });
  }
  drawParticle(x, y, size, a, color) {
    this._queue.push({
      type: "particle",
      x,
      y,
      size,
      alpha: a,
      colorHex: color,
    });
  }

  flush() {
    if (!this._ready) return;
    this._executeQueue();
    this._app.renderer.render(this._app.stage);
  }

  getCanvas() {
    return this._canvas;
  }
  pauseEffects() {}
  tickEffects(_dt) {}
  resumeEffects() {}

  clearImageCache() {
    this._cache.forEach((p) =>
      p.then((tex) => {
        if (tex) tex.destroy();
      }),
    );
    this._cache.clear();
  }

  destroy() {
    if (this._app) {
      this._app.destroy(true);
      this._app = null;
    }
    this._canvas = null;
    this._queue = [];
    this._cache.clear();
    this._ready = false;
  }

  setSlotMetadata(_slots) {} // no Z-depth in 2D mode; no-op

  _executeQueue() {
    const stage = this._app.stage;
    stage.removeChildren(); // clear previous frame sprites

    for (const cmd of this._queue) {
      if (cmd.type === "clear") {
        if (cmd.bgColor !== "transparent") {
          const bg = new PIXI.Graphics();
          bg.beginFill(new PIXI.Color(cmd.bgColor).toNumber());
          bg.drawRect(0, 0, this._app.screen.width, this._app.screen.height);
          bg.endFill();
          stage.addChildAt(bg, 0);
        }
      } else if (cmd.type === "image") {
        const sprite = PIXI.Sprite.from(cmd.img);
        sprite.anchor.set(0.5);
        sprite.x = cmd.x;
        sprite.y = cmd.y;
        sprite.width = cmd.size;
        sprite.height = cmd.size;
        sprite.alpha = cmd.alpha;
        sprite.rotation = cmd.rotDeg * (Math.PI / 180);
        stage.addChild(sprite);
      }
      // TODO: handle "glow" and "particle" command types
      // PixiJS filters (@pixi/filter-glow) can replace the Canvas 2D gradient approach
    }

    this._queue = [];
  }
}
```

### Steps to complete

1. Add `"pixi.js": "^8.0.0"` to `package.json`
2. Add `/lib/pixi.min.js` to `server.js` LIB_ALLOWLIST
3. Add stub `lib/pixi.min.js` for Node.js test resolution (same pattern as `lib/three.module.js`)
4. Create `js/renderer-pixi.js` using the skeleton above
5. Add `pixi` entry to `RENDERER_REGISTRY` in `renderer-interface.js`
6. Add `<option value="pixi">PixiJS (WebGL 2D)</option>` to `index.html`
7. Add `tests/renderer-pixi.test.js` — same suite as `renderer-three.test.js` adapted for Pixi mocks
8. Copy `node_modules/pixi.js/dist/pixi.min.js` to `dist/lib/` in `deploy.yml`
