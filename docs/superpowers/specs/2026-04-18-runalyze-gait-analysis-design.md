# Runalyze — Running Gait Analysis PWA: Design Spec
**Date:** 2026-04-18

---

## What We're Building

A zero-backend, offline-capable PWA named **Runalyze** that a physiotherapist runs on an iPad to analyze a client's running gait. The physio uploads a video (or films live), the app detects body landmarks, calculates biomechanical metrics, flags issues, and exports a PDF report. Everything runs on-device — no server, no cloud AI, no data transmitted.

---

## Architecture Principle

MediaPipe handles pose estimation (the hard AI part). Everything else is geometry, clinical rules, and DOM manipulation. The app deploys as a single directory of static files.

No framework, no backend, no AI interpretation, no localStorage, no routing, no state management library.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| Vanilla TypeScript | All logic — no React, Angular, or Vue |
| Vite | TS compilation, dev server, PWA plugin |
| `@mediapipe/tasks-vision` | PoseLandmarker via WASM |
| Canvas API | Skeleton overlay rendering |
| jsPDF | PDF report export (Step 5) |
| vite-plugin-pwa | Offline/installable PWA (Step 6) |

**Explicitly excluded:** React, Angular, Vue, Tailwind, any CSS framework, any UI library, any backend, any database, localStorage, sessionStorage, any LLM/AI for interpretation, Python, `@mediapipe/pose` (deprecated).

### Model Strategy
- Steps 1–5: **lite model** loaded from CDN (fast iteration, no local bundling)
- Step 6: swap to **heavy model**, bundled locally in `public/models/` for offline use

---

## Project Structure

```
/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── public/
│   ├── manifest.json
│   ├── icons/                   # Placeholder SVG icons
│   └── models/                  # Empty until Step 6
└── src/
    ├── main.ts                  # Entry point, DOM setup, event wiring
    ├── ui/
    │   ├── videoPlayer.ts       # Video/camera input, playback controls
    │   ├── overlay.ts           # Canvas skeleton drawing
    │   ├── dashboard.ts         # Metric cards, findings, DOM updates
    │   └── styles.css           # All styles, single file, no framework
    ├── pose/
    │   ├── landmarker.ts        # PoseLandmarker init + config
    │   └── processing.ts        # Frame processing loop, landmark storage
    ├── analysis/
    │   ├── types.ts             # All TypeScript interfaces
    │   ├── angles.ts            # Angle calculation utilities
    │   ├── gaitDetection.ts     # Footstrike/toe-off detection, cycle segmentation
    │   ├── metrics.ts           # All 10 metric calculations
    │   ├── thresholds.ts        # Threshold definitions (green/amber/red)
    │   └── findings.ts          # Rule-based finding templates
    ├── report/
    │   └── pdfGenerator.ts      # jsPDF report builder
    └── config/
        └── defaults.ts          # App-wide defaults
```

---

## Data Flow

```
Video/Camera Input
      │
      ▼
videoPlayer.ts  ──── frames ──►  processing.ts
                                      │
                                      │  calls PoseLandmarker per frame
                                      │  stores landmarks[] typed array
                                      ▼
                               analysis pipeline
                              ┌───────────────────┐
                              │  angles.ts         │ ← pure math
                              │  gaitDetection.ts  │ ← pure math
                              │  metrics.ts        │ ← pure math
                              │  thresholds.ts     │ ← evaluate results
                              │  findings.ts       │ ← generate text
                              └───────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                    overlay.ts              dashboard.ts
                 (canvas drawing)        (metric cards,
                                          findings text)
                                                  │
                                                  ▼
                                          pdfGenerator.ts
                                          (on export click)
```

**Key principle:** `analysis/` modules are pure functions — they take landmark data and return numbers/results, never touching the DOM. `ui/` modules consume results and update the DOM.

**State:** All landmark data lives in a typed array in `processing.ts` — in memory only. No persistence between sessions.

---

## Core Features

### 1. Video Input
- File upload accepting MP4 and MOV
- Live camera capture via `getUserMedia` (Step 6)
- Toggle between upload and live capture modes
- Playback controls: play, pause, frame-by-frame (arrow keys), speed toggle (0.25x, 0.5x, 1x) — Step 6

### 2. Pose Estimation Pipeline
- `@mediapipe/tasks-vision` PoseLandmarker
- VIDEO mode for uploaded files, LIVE_STREAM mode for camera (Step 6)
- 33 body landmarks per frame (x, y, z, visibility)
- All frame landmark data stored in typed array for post-processing
- Frame skipping if performance drops below 20fps

### 3. Skeleton Overlay
- Transparent canvas positioned exactly over the video element
- Landmark connections as lines, landmarks as circles
- Colour-coded by analysis result:
  - 🟢 `#22c55e` — normal range
  - 🟡 `#f59e0b` — borderline
  - 🔴 `#ef4444` — flagged
  - White — no analysis yet (Step 1)
- Live angle value labels at key joints (knee, hip, ankle)
- Toggle overlay visibility button

### 4. Biomechanical Analysis Engine

All calculations use trigonometry on landmark coordinates. No machine learning, no external libraries — just math.

**`angles.ts` utilities:**
- `angleBetweenThreePoints(a, b, c)` — angle in degrees at point b
- `lateralAngle(top, bottom)` — frontal-plane lean angle
- `verticalDisplacement(landmark, frames)` — oscillation data over time

**`gaitDetection.ts`:**
- Footstrike detection via ankle landmark vertical velocity (rapid downward deceleration)
- Toe-off detection via toe landmark vertical acceleration
- Cycle segmentation (footstrike to footstrike, same foot)
- Stance phase vs swing phase per cycle

**`metrics.ts` — 10 metrics:**

| Metric | Calculation | Landmarks |
|---|---|---|
| Knee flexion at initial contact | Angle at knee (hip-knee-ankle) at footstrike frame | Hip, Knee, Ankle |
| Hip adduction (stance) | Frontal plane angle of thigh relative to pelvis midline during stance | Both hips, stance-side knee |
| Pelvic drop | Height difference between left/right hip during single-leg stance | Left hip, Right hip |
| Trunk lateral lean | Angle of shoulder midpoint to hip midpoint relative to vertical | Shoulders, Hips |
| Ankle dorsiflexion at contact | Angle at ankle (knee-ankle-toe) at footstrike | Knee, Ankle, Foot index |
| Cadence | Count footstrike events per minute | Ankles |
| Vertical oscillation | Peak-to-peak y-displacement of hip midpoint across cycles | Both hips |
| Overstriding | Horizontal distance between ankle and hip at footstrike | Hip, Ankle at footstrike |
| Stride symmetry | Compare all left-side metrics to right-side metrics, % difference | All bilateral landmarks |
| Ground contact time | Frame count from footstrike to toe-off, converted to ms | Ankle, Toe |

**`thresholds.ts` — evidence-based defaults:**
```typescript
export const THRESHOLDS = {
  kneeFlexionAtContact:  { green: [155, 170], amber: [145, 155], unit: '°', direction: 'lower_is_worse' },
  cadence:               { green: [170, 195], amber: [160, 170], unit: 'spm', direction: 'lower_is_worse' },
  pelvicDrop:            { green: [0, 5],     amber: [5, 7],     unit: '°', direction: 'higher_is_worse' },
  trunkLateralLean:      { green: [0, 5],     amber: [5, 8],     unit: '°', direction: 'higher_is_worse' },
  hipAdduction:          { green: [0, 10],    amber: [10, 15],   unit: '°', direction: 'higher_is_worse' },
  verticalOscillation:   { green: [6, 10],    amber: [10, 13],   unit: 'cm', direction: 'higher_is_worse' },
  groundContactTime:     { green: [200, 260], amber: [260, 300], unit: 'ms', direction: 'higher_is_worse' },
  strideSymmetry:        { green: [0, 5],     amber: [5, 10],    unit: '%', direction: 'higher_is_worse' },
} as const;
```
Anything outside both green and amber ranges = red.

### 5. Results Dashboard

Single-page layout, sections arranged vertically for iPad scrolling:

- **Section 1 — Video + Overlay:** Video player with skeleton overlay, playback controls. ~60% screen width. Remaining 40% shows live metrics for current frame.
- **Section 2 — Summary Cards:** Grid of metric cards (name, value, status dot, normal range). Tapping a card highlights relevant joints in overlay.
- **Section 3 — Findings:** Auto-generated text findings for amber and red metrics only, from `findings.ts` templates.
- **Section 4 — Export:** Physio notes textarea + "Export PDF" button.

### 6. PDF Report (jsPDF)

- Header: "Running Gait Analysis Report" + date + session timestamp
- Placeholder rectangle for clinic logo
- Client name field (entered before export, not stored)
- Key frame screenshot: canvas capture at most-flagged frame
- Metrics summary table: metric | value | status | normal range
- Findings section: all amber/red findings as paragraphs
- Physio notes section
- Footer: "Generated by Runalyze — on-device analysis, no data transmitted"

### 7. PWA Configuration (Step 6)

- Service worker caching all assets including MediaPipe WASM and model files
- Offline-first: app works fully without internet after first load
- Web app manifest with app name "Runalyze", placeholder SVG icons, theme colour
- Installable on iPad home screen

---

## Key Technical Notes

### Camera Angle Detection
Most running videos are side-on (sagittal plane). Pelvic drop and hip adduction require a frontal view. `processing.ts` auto-detects the view by comparing left/right hip x-coordinates — if close together it's sagittal, if spread apart it's frontal. The dashboard only shows metrics valid for the detected view.

### Performance (iPad/Safari WebKit)
- Frame processing loop uses `requestAnimationFrame`
- If processing drops below 20fps, skip every other frame
- Minimise DOM updates during playback — only canvas and live metric values update per frame
- Full dashboard re-renders only on pause or end of video

### No Premature Abstraction
This is a focused tool, not a platform. No user accounts, no routing, no state management library, no component system. DOM manipulation with typed helpers throughout.

---

## Implementation Steps

Build in this order. Each step is independently testable before proceeding.

### Step 1 — Video + Pose
- Vite+TS project scaffold with full directory structure
- `index.html` with video element and canvas overlay
- File upload wired to video element
- MediaPipe PoseLandmarker (lite, CDN) initialised and processing frames
- Raw landmarks drawn on canvas as white dots and lines
- **✅ Test:** upload a running video, see skeleton tracking the runner

### Step 2 — Angle Calculations
- Implement `angles.ts` utilities
- Calculate knee flexion and trunk lean per frame
- Display live angle values as text labels on canvas near joints
- **✅ Test:** pause video, knee angle label reads a plausible value (155–175°)

### Step 3 — Gait Event Detection
- Implement `gaitDetection.ts` footstrike + toe-off detection
- Calculate cadence from detected events
- Display cadence as live counter
- **✅ Test:** cadence reads 160–190 spm for a typical running video

### Step 4 — Full Metrics + Dashboard
- Implement all 10 metrics in `metrics.ts`
- Apply green/amber/red thresholds from `thresholds.ts`
- Build dashboard with metric cards and findings text
- Colour-code skeleton overlay joints by status
- **✅ Test:** all metric cards shown colour-coded, findings appear for red/amber values

### Step 5 — PDF Export
- Implement `pdfGenerator.ts` with jsPDF
- Canvas screenshot capture at most-flagged frame
- Client name input + physio notes field
- **✅ Test:** exported PDF contains all sections, is readable, looks professional

### Step 6 — Polish + PWA
- Live camera capture mode (`getUserMedia`, LIVE_STREAM mode)
- Frame-by-frame playback controls
- Swap lite model → heavy model
- Bundle model files locally in `public/models/`
- PWA manifest + service worker for offline use
- iPad/Safari testing
- **✅ Test:** install on iPad, disconnect from internet, app works fully
