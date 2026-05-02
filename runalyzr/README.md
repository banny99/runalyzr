# Runalyzr

Browser-based running gait analysis. Upload or record a video, get instant biomechanical feedback — no account, no server, no cost.

## Features

- Pose estimation via MediaPipe (runs entirely on-device, GPU-accelerated)
- Sagittal and frontal view analysis with automatic camera view detection
- 10 gait metrics: knee flexion, ankle dorsiflexion, pelvic drop, hip adduction, trunk lean, vertical oscillation, overstriding, stride symmetry, cadence, ground contact time
- Colour-coded overlays (green / amber / red) drawn on the video in real time
- PDF report export with findings and recommendations
- PWA — installable, works offline after first load

## Getting Started

```bash
npm install
npm run dev
```

Then open `http://localhost:5173/runalyzr/`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm test` | Run test suite |
| `npm run test:watch` | Tests in watch mode |

## Tech Stack

- **TypeScript + Vite** — build tooling
- **MediaPipe Tasks Vision** — pose landmark detection
- **jsPDF** — PDF report generation
- **Vitest** — unit tests
- **vite-plugin-pwa** — offline / installable PWA
