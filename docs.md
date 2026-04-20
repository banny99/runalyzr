# Runalyzr — Developer Docs

## Architecture

Zero-backend PWA. Everything runs in the browser:

```
Video input → MediaPipe (GPU) → Landmark frames → Gait detection → Metrics → UI + PDF
```

MediaPipe runs as a WASM + GPU delegate bundle served from `/public/wasm/`. The heavy pose model (~30 MB) is bundled at `/public/models/`.

---

## Directory Structure

```
src/
├── main.ts               Entry point — wires all modules together
├── config/
│   └── defaults.ts       Landmark indices, metric labels, view sets, FPS config
├── pose/
│   ├── landmarker.ts     Initialises MediaPipe PoseLandmarker
│   └── processing.ts     Per-frame capture loop, camera view detection
├── analysis/
│   ├── types.ts          Core interfaces (Landmark, FrameData, GaitEvent, AnalysisResults…)
│   ├── angles.ts         angleBetweenThreePoints, lateralAngle, midpoint, verticalDisplacement
│   ├── gaitDetection.ts  Peak detection → footstrikes, toe-offs, gait cycles
│   ├── metrics.ts        One function per metric + calculateAllMetrics orchestrator
│   ├── thresholds.ts     Green/amber/red ranges per metric
│   └── findings.ts       Human-readable finding text from metric results
├── ui/
│   ├── dashboard.ts      Metric cards and findings panel
│   ├── overlay.ts        Skeleton + status overlay drawn on canvas
│   ├── videoPlayer.ts    Video element management
│   └── styles.css
└── report/
    └── pdfGenerator.ts   jsPDF report builder
```

---

## Data Flow

1. **Frame capture** — `createProcessingLoop()` calls `landmarker.detectForVideo()` at up to 30 fps using `requestVideoFrameCallback` (falls back to `rAF`).
2. **Storage** — each frame saved as `{ timestamp, landmarks }` in a capped array.
3. **Gait detection** — after recording stops, ankle Y-trajectory peaks/troughs → footstrikes and toe-offs → gait cycles.
4. **Metrics** — `calculateAllMetrics()` receives all frames, events, cycles, fps, and camera view; returns `AnalysisResults`.
5. **Thresholds** — each numeric value is wrapped with a green/amber/red status via `makeMetricResult()`.
6. **Findings** — amber/red metrics generate plain-English finding items.
7. **Output** — dashboard renders metric cards; canvas overlay draws colour-coded skeleton; PDF export bundles everything.

---

## Camera Views

Detected automatically from hip landmark spread:

| View | Condition | Metrics |
|---|---|---|
| Sagittal | hip width < 0.08 | Knee flexion, ankle dorsiflexion, overstriding, vertical oscillation, cadence, GCT, stride symmetry |
| Frontal | hip width > 0.15 | Pelvic drop, hip adduction, trunk lateral lean, stride symmetry |
| Unknown | 0.08–0.15 | Both sets computed |

---

## Metrics Reference

| Metric | View | Calculation |
|---|---|---|
| Knee flexion at contact | Sagittal | Angle hip→knee→ankle at footstrike |
| Ankle dorsiflexion | Sagittal | 180° − angle knee→ankle→foot at footstrike |
| Overstriding | Sagittal | Horizontal distance ankle − hip at footstrike |
| Vertical oscillation | Both | Peak-to-peak Y of hip midpoint |
| Pelvic drop | Frontal | Vertical spread between hips at footstrike |
| Hip adduction | Frontal | Angle other-hip→stance-hip→knee at footstrike |
| Trunk lateral lean | Frontal | Lateral angle shoulder midpoint → hip midpoint |
| Cadence | Both | Footstrikes per minute |
| Ground contact time | Both | Frames footstrike→toe-off converted to ms |
| Stride symmetry | Both | Average asymmetry % across knee, ankle, overstriding pairs |

---

## Key Constraints

- **Zero backend** — no server, no API calls for analysis
- **Offline-first** — model and WASM bundled; works after first load
- **Zero cost** — no paid APIs or services
- **iPad compatible** — GPU delegate, VFC frame capture, memory-capped frame storage

---

## Known Limitations / Future Improvements

### High priority

**Switch to `worldLandmarks`**
MediaPipe returns a second landmark array (`result.worldLandmarks`) alongside the image-space `landmarks`. World landmarks are true 3D coordinates in metres, origin at hips, rotation-normalised. Currently unused. Using them would:
- Make all angle calculations true 3D (knee flexion, ankle dorsiflexion, hip adduction)
- Give pelvic drop and overstriding in real centimetres instead of scaled pixel approximations
- Remove dependence on camera distance and positioning for accuracy
- Files to change: `types.ts`, `processing.ts`, `angles.ts`, `metrics.ts`

### Lower priority

- **Stride length estimation** — world landmarks would also unlock anterior-posterior displacement as a real stride length approximation
- **Frontal-plane knee valgus** — currently no valgus/varus metric; hip→knee→ankle in frontal view would detect this
- **Per-cycle trend charts** — metrics currently averaged over all cycles; showing per-cycle trends would reveal fatigue patterns
- **Slow-motion playback** — video playback rate control for manual review
