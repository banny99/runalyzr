# Runalyzr

Browser-based movement analysis tools. No account, no server, no cost — everything runs on your device.

## Tools

**[Runalyzr — Running Gait Analysis](https://banny99.github.io/runalyzr/run/)**
Upload or record a running video and get instant biomechanical feedback.

**[Bike — Bike Fit Analysis](https://banny99.github.io/runalyzr/bike/)**
Analyse your bike position with static fit captures or live ride recording.

## What it does

- Pose estimation via MediaPipe runs entirely on your device, GPU-accelerated
- **Running:** 10 gait metrics (knee flexion, ankle dorsiflexion, cadence, pelvic drop, and more) with colour-coded skeleton overlays and PDF report export
- **Bike:** fit mode for static position captures and ride mode for dynamic pedalling analysis — sagittal, rear, and front views — with PDF report export
- PWA — installable on your home screen, works offline after first load

## For developers

This is an npm workspace monorepo with three packages: `shared`, `runalyzr`, and `bike`.

```bash
npm install

# run either app
cd runalyzr && npm run dev   # http://localhost:5173/runalyzr/
cd bike      && npm run dev  # http://localhost:5173/runalyzr/

# run tests
npm test
```

Deployments are handled automatically via GitHub Actions on push to `main`.
