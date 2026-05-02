# Mandala Animada

Animated mandala generator built with p5.js and CCapture.js, exportable to Full HD WebM video.

## Features

- **14 geometric patterns** — rings, golden spiral, flower of life, star, pentagon, triskelion, Lissajous, Koch snowflake, Sierpinski, and more
- **8 entry effects** — Scale In, Fade In, Spin In, Fly In, Drop, Slide, Shrink, Spiral
- **Continuous effects** — idle float, camera breathing, ambient particles, glow halo (all renderer-agnostic)
- **Settings panel** — real-time controls for animation, effects, presets, and export
- **Preset system** — save/load/import/export configuration via localStorage and JSON
- **Two rendering engines** — p5.js (Canvas 2D, default) and Three.js (WebGL 3D with Z-depth per ring), switchable at runtime from the settings panel
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
Full parameter reference: [`ARCHITECTURE.md — Configuration reference`](ARCHITECTURE.md#configuration-reference).

Effects can also be toggled live from **⚙ Ajustes → Efectos** without editing any file.

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
│   ├── renderer-interface.js  # Renderer registry + createRenderer() factory (41 lines)
│   ├── renderer-p5.js         # p5.js Canvas 2D adapter (262 lines)
│   ├── renderer-three.js      # Three.js WebGL 3D adapter — Z-depth, GPU glow/particles (473 lines)
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
| [`DEVELOPMENT.md`](DEVELOPMENT.md)   | Dev setup, testing, CI, module notes, open issues, scorecard                    |
| [`ROADMAP.md`](ROADMAP.md)           | Pending features and PixiJS renderer implementation guide                       |
