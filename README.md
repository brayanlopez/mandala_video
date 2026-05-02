# Mandala Animada

Animated mandala generator built with p5.js and CCapture.js, exportable to Full HD WebM video.

## Features

- **14 geometric patterns** — rings, golden spiral, flower of life, star, pentagon, triskelion, Lissajous, Koch snowflake, Sierpinski, and more
- **8 entry effects** — Scale In, Fade In, Spin In, Fly In, Drop, Slide, Shrink, Spiral
- **Continuous effects** — idle float, camera breathing, ambient particles, glow halo (all renderer-agnostic)
- **Settings panel** — real-time controls for animation, effects, presets, and export
- **Preset system** — save/load/import/export configuration via localStorage and JSON
- **Full HD export** — 1920×1080 WebM via CCapture.js (frame-by-frame, deterministic) or MediaRecorder
- **Security-first** — strict CSP, no external CDN, path traversal protection, no `innerHTML`

## Quick start

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). Dependencies install automatically on first run.

Node.js ≥ 16 required.

## Configuration

Edit `config.js`. All changes are picked up immediately without restarting.

### Canvas & animation

| Key                       | Default   | Description                                                             |
| ------------------------- | --------- | ----------------------------------------------------------------------- |
| `canvas.bgColor`          | `#1a0a2e` | Background color (hex or `transparent`)                                 |
| `canvas.fps`              | `60`      | Export framerate (30 or 60)                                             |
| `canvas.imgScale`         | `1.0`     | Global image size multiplier                                            |
| `animation.staggerDelay`  | `160`     | ms between each slot's entrance                                         |
| `animation.entryDuration` | `700`     | ms per entry effect                                                     |
| `animation.entryEffect`   | `scaleIn` | `fadeIn` `scaleIn` `spinIn` `flyIn` `drop` `slideOut` `shrink` `spiral` |
| `animation.rotationSpeed` | `0.04`    | Degrees/frame continuous rotation                                       |

### Effects

Each effect can also be toggled and tuned live from the **⚙ Ajustes → Efectos** panel.
Full parameter reference in [`ARCHITECTURE.md`](ARCHITECTURE.md#effects).

| Key                               | Default | Description                        |
| --------------------------------- | ------- | ---------------------------------- |
| `effects.idleFloat.enabled`       | `true`  | Per-slot sinusoidal oscillation    |
| `effects.cameraBreathing.enabled` | `true`  | Global scale + lateral sway        |
| `effects.particles.enabled`       | `true`  | 200 ambient ascending particles    |
| `effects.glow.enabled`            | `true`  | Soft radial halo behind each image |

### Export

| Key                      | Default    | Description                                          |
| ------------------------ | ---------- | ---------------------------------------------------- |
| `export.captureMode`     | `ccapture` | `ccapture` (recommended) or `mediarecorder`          |
| `export.durationSeconds` | `null`     | Export duration in s (`null` = until animation ends) |
| `export.transparentBg`   | `false`    | Export with alpha channel                            |

### Mandala rings

Each object in `mandala.rings`:

- `count` — positions in this ring
- `radius` — distance from center in px (`0` = exact center)
- `imgSize` — image size in px
- `images` — paths cycled if fewer than `count`

## Customizing images

1. Place images in `images/` (or subfolders)
2. Update the `images` arrays in `config.js`

## Convert WebM to MP4

```bash
ffmpeg -i mandala.webm -c:v libx264 -crf 17 -pix_fmt yuv420p mandala_1080p.mp4
```

## Project structure

```
├── config.js              # All parameters
├── js/
│   ├── main.js            # Orchestrator + UI
│   ├── animator.js        # State machine + effects
│   ├── renderer-p5.js     # p5.js adapter (swappable)
│   ├── exporter.js        # Video capture
│   ├── geometry*.js       # Layout algorithms
│   └── presets.js         # Preset persistence
├── tests/                 # 277 cases, 98.7% coverage
└── images/                # center/, ring1/, ring2/, ring3/
```

## Documentation

| File                                 | Contents                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System design, layers, patterns, full config reference, extensibility, security |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Dev setup, testing, CI, module notes, open issues                               |
