# Mandala Animada

Animated mandala generator built with p5.js and CCapture.js, exportable to Full HD video.

## Features

- **Configurable mandala rings** — Customize ring count, radius, image size, and images via `config.js`
- **5 geometric patterns** — Circular rings, interlaced star, golden spiral, flower of life, sacred grid
- **4 entry effects** — Scale In, Fade In, Spin In, Fly In
- **Video export** — Export to WebM using CCapture.js (high quality) or MediaRecorder API
- **Full HD output** — 1920×1080 canvas at 60fps
- **Security-first** — Strict CSP, no external CDN dependencies, path traversal protection

For a detailed per-file feature breakdown and future roadmap, see [FEATURE.md](FEATURE.md).

## Requirements

- Node.js ≥ 16
- npm

## Quick Start

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The server auto-installs dependencies on first run.

## Configuration

Edit `config.js` to customize:

### Canvas

| Parameter        | Default   | Description                             |
| ---------------- | --------- | --------------------------------------- |
| `canvas.width`   | `1920`    | Canvas width in pixels                  |
| `canvas.height`  | `1080`    | Canvas height in pixels                 |
| `canvas.bgColor` | `#1a0a2e` | Background color (hex or `transparent`) |
| `canvas.fps`     | `60`      | Export framerate (30 or 60)             |

### Animation

| Parameter                 | Default   | Description                                          |
| ------------------------- | --------- | ---------------------------------------------------- |
| `animation.speed`         | `1.0`     | Global speed multiplier                              |
| `animation.staggerDelay`  | `160`     | ms delay between each image entry                    |
| `animation.entryDuration` | `700`     | ms duration of entry effect per image                |
| `animation.entryEffect`   | `scaleIn` | Entry effect: `fadeIn`, `scaleIn`, `spinIn`, `flyIn` |
| `animation.rotationSpeed` | `0.04`    | Degrees/frame continuous rotation (0 = none)         |
| `animation.loopAnimation` | `false`   | Loop animation after completion                      |

### Mandala Rings

Each ring object in `mandala.rings` defines:

- `count` — number of positions in the ring
- `radius` — distance from center in pixels (0 = exact center)
- `imgSize` — image size in pixels
- `images` — array of image paths (cycles if fewer than `count`)

### Export

| Parameter                   | Default    | Description                                              |
| --------------------------- | ---------- | -------------------------------------------------------- |
| `export.captureMode`        | `ccapture` | `ccapture` (recommended) or `mediarecorder`              |
| `export.durationSeconds`    | `null`     | Export duration in seconds (null = until animation ends) |
| `export.videoBitsPerSecond` | `8000000`  | Bitrate for MediaRecorder (8 Mbps)                       |

## Customizing Images

1. Place your images in the `images/` folder (or subfolders)
2. Update the `images` arrays in `config.js` with the new paths

## Converting WebM to MP4

The app exports WebM files. Convert to MP4 using ffmpeg:

```bash
ffmpeg -i mandala.webm -c:v libx264 -crf 17 -pix_fmt yuv420p mandala_1080p.mp4
```

## Project Structure

```
mandala_video/
├── config.js           # Editable mandala parameters
├── server.js           # Local dev server (auto-installs deps)
├── index.html          # Main UI
├── js/
│   ├── main.js         # Entry point, event handling
│   ├── animator.js     # Animation timing and state
│   ├── exporter.js     # Video export (CCapture/MediaRecorder)
│   ├── geometry.js     # Core geometry calculations
│   ├── geometry-patterns.js  # Pattern generators
│   └── renderer-p5.js  # p5.js rendering layer
├── images/
│   ├── center/         # Center image
│   ├── ring1/          # Inner ring images
│   ├── ring2/          # Middle ring images
│   └── ring3/          # Outer ring images
└── package.json
```

## Security

- Strict Content Security Policy (no external scripts, no eval)
- All libraries served locally from `node_modules` (no CDN)
- Path traversal protection on static file serving
- MIME type allowlist for served files
- Security headers: COOP, COEP, X-Content-Type-Options
