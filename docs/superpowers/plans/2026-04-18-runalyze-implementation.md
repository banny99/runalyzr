# Runalyze — Running Gait Analysis PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Runalyze, a zero-backend PWA that analyses running gait from video using MediaPipe pose estimation, displays biomechanical metrics on a dashboard, and exports a clinical PDF report — all running fully offline on an iPad.

**Architecture:** Vanilla TypeScript + Vite, no framework. MediaPipe `@mediapipe/tasks-vision` runs pose estimation in-browser via WASM. Pure math functions in `src/analysis/` compute biomechanical metrics from stored landmark arrays; `src/ui/` modules render results to DOM and canvas. No data leaves the device.

**Tech Stack:** TypeScript 5, Vite 5, `@mediapipe/tasks-vision` (lite model via CDN → heavy + local in Task 22), jsPDF 2, vite-plugin-pwa (Task 23), Vitest 2 (unit tests for pure functions)

---

## File Map

| File | Responsibility |
|---|---|
| `index.html` | Shell HTML — video, canvas, all dashboard sections |
| `src/main.ts` | Entry point — wires all modules, owns app state |
| `src/config/defaults.ts` | Landmark indices, pose connections, overlay colours, URLs |
| `src/analysis/types.ts` | All shared TypeScript interfaces |
| `src/ui/styles.css` | All styles, single file |
| `src/ui/videoPlayer.ts` | File upload, video element control |
| `src/ui/overlay.ts` | Canvas skeleton drawing, angle labels, colour coding |
| `src/ui/dashboard.ts` | Metric cards, findings list, live metric panel |
| `src/pose/landmarker.ts` | PoseLandmarker init + config |
| `src/pose/processing.ts` | Frame loop, landmark storage, camera view detection |
| `src/analysis/angles.ts` | Pure angle/geometry utilities |
| `src/analysis/gaitDetection.ts` | Footstrike/toe-off detection, cycle segmentation, cadence |
| `src/analysis/metrics.ts` | All 10 metric calculations |
| `src/analysis/thresholds.ts` | Threshold definitions + `evaluateMetric()` |
| `src/analysis/findings.ts` | Rule-based finding text templates + `generateFindings()` |
| `src/report/pdfGenerator.ts` | jsPDF report builder |
| `public/manifest.json` | PWA manifest (Task 23) |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/ui/styles.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "runalyze",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "^0.10.14",
    "jspdf": "^2.5.1"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Runalyze</title>
  <link rel="stylesheet" href="/src/ui/styles.css" />
</head>
<body>
  <header id="app-header">
    <h1>Runalyze</h1>
    <div id="upload-controls">
      <label id="upload-label" for="file-input">Upload Video</label>
      <input type="file" id="file-input" accept="video/mp4,video/quicktime" />
      <button id="toggle-overlay">Toggle Overlay</button>
    </div>
  </header>

  <main>
    <!-- Section 1: Video + live metrics -->
    <section id="video-section">
      <div id="video-container">
        <video id="video" playsinline></video>
        <canvas id="overlay"></canvas>
      </div>
      <div id="live-metrics">
        <p id="cadence-display">Cadence: —</p>
        <p id="view-display">View: —</p>
      </div>
    </section>

    <!-- Section 2: Summary cards -->
    <section id="summary-cards"></section>

    <!-- Section 3: Findings -->
    <section id="findings">
      <h2>Findings</h2>
      <div id="findings-list"></div>
    </section>

    <!-- Section 4: Export -->
    <section id="export-section">
      <input type="text" id="client-name" placeholder="Client name (not stored)" />
      <textarea id="physio-notes" placeholder="Session notes..."></textarea>
      <button id="export-pdf" disabled>Export PDF</button>
    </section>
  </main>

  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Create `src/ui/styles.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f0f0f;
  color: #f0f0f0;
  min-height: 100vh;
}

#app-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
}

#app-header h1 { font-size: 1.25rem; font-weight: 700; color: #22c55e; }

#upload-controls { display: flex; gap: 0.5rem; align-items: center; margin-left: auto; }

#upload-label, button {
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2a2a2a;
  color: #f0f0f0;
  cursor: pointer;
  font-size: 0.875rem;
}
#upload-label:hover, button:hover:not(:disabled) { background: #333; }
button:disabled { opacity: 0.4; cursor: default; }
#file-input { display: none; }

#video-section {
  display: flex;
  gap: 1rem;
  padding: 1rem;
}

#video-container {
  position: relative;
  flex: 3;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

#video { width: 100%; display: block; }

#overlay {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
}

#live-metrics {
  flex: 1;
  background: #1a1a1a;
  border-radius: 8px;
  padding: 1rem;
  font-size: 0.875rem;
}

#summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
  padding: 1rem;
}

.metric-card {
  background: #1a1a1a;
  border-radius: 8px;
  padding: 0.75rem;
  border: 1px solid #333;
}
.metric-card .metric-name { font-size: 0.75rem; color: #aaa; margin-bottom: 0.25rem; }
.metric-card .metric-value { font-size: 1.25rem; font-weight: 700; }
.metric-card .metric-range { font-size: 0.7rem; color: #666; margin-top: 0.25rem; }
.metric-card.green { border-color: #22c55e; }
.metric-card.amber { border-color: #f59e0b; }
.metric-card.red { border-color: #ef4444; }
.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.status-dot.green { background: #22c55e; }
.status-dot.amber { background: #f59e0b; }
.status-dot.red { background: #ef4444; }

#findings { padding: 1rem; }
#findings h2 { font-size: 1rem; margin-bottom: 0.75rem; }
.finding-item { background: #1a1a1a; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem; font-size: 0.875rem; line-height: 1.5; }
.finding-item.red { border-left: 3px solid #ef4444; }
.finding-item.amber { border-left: 3px solid #f59e0b; }

#export-section {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 600px;
}
#client-name, #physio-notes {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #f0f0f0;
  padding: 0.5rem;
  font-family: inherit;
  font-size: 0.875rem;
}
#physio-notes { min-height: 80px; resize: vertical; }
#export-pdf { align-self: flex-start; background: #22c55e; color: #000; border-color: #22c55e; font-weight: 600; }
#export-pdf:hover:not(:disabled) { background: #16a34a; }

#loading-msg {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 1.5rem 2rem;
  font-size: 1rem;
  z-index: 100;
}
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite dev server running at `http://localhost:5173`. Open in browser — page loads with dark header and empty sections.

- [ ] **Step 8: Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html src/ui/styles.css
git commit -m "feat: project scaffold — Vite+TS, index.html, styles"
```

---

## Task 2: TypeScript Interfaces & Constants

**Files:**
- Create: `src/analysis/types.ts`
- Create: `src/config/defaults.ts`

- [ ] **Step 1: Create `src/analysis/types.ts`**

```typescript
export interface Landmark {
  x: number;       // normalised 0–1 (left→right)
  y: number;       // normalised 0–1 (top→bottom, increases downward)
  z: number;       // normalised depth
  visibility?: number; // 0–1
}

export type LandmarkArray = Landmark[];

export interface FrameData {
  timestamp: number; // ms, from performance.now()
  landmarks: LandmarkArray;
}

export type GaitEventType = 'footstrike' | 'toe_off';
export type Foot = 'left' | 'right';
export type CameraView = 'sagittal' | 'frontal' | 'unknown';
export type MetricStatus = 'green' | 'amber' | 'red' | 'unknown';

export interface GaitEvent {
  type: GaitEventType;
  foot: Foot;
  frameIndex: number;
  timestamp: number;
}

export interface GaitCycle {
  foot: Foot;
  startFrame: number;
  endFrame: number;
  footstrikeFrame: number;
  toeOffFrame: number;
}

export interface MetricResult {
  value: number;
  status: MetricStatus;
  unit: string;
}

export interface AnalysisResults {
  kneeFlexionAtContact: MetricResult | null;
  hipAdduction: MetricResult | null;
  pelvicDrop: MetricResult | null;
  trunkLateralLean: MetricResult | null;
  ankleDorsiflexion: MetricResult | null;
  cadence: MetricResult | null;
  verticalOscillation: MetricResult | null;
  overstriding: MetricResult | null;
  strideSymmetry: MetricResult | null;
  groundContactTime: MetricResult | null;
}

export interface FindingItem {
  metric: keyof AnalysisResults;
  status: 'amber' | 'red';
  text: string;
}

export interface ReportParams {
  clientName: string;
  notes: string;
  metrics: AnalysisResults;
  findings: FindingItem[];
  frameDataUrl: string | null;
}
```

- [ ] **Step 2: Create `src/config/defaults.ts`**

```typescript
export const LANDMARKS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],          // shoulders
  [11, 23], [12, 24], // shoulder → hip
  [23, 24],          // hips
  [23, 25], [25, 27], [27, 31], // left leg
  [24, 26], [26, 28], [28, 32], // right leg
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
];

export const OVERLAY_COLORS = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  neutral: '#ffffff',
} as const;

export const METRIC_LABELS: Record<string, string> = {
  kneeFlexionAtContact: 'Knee Flexion at Contact',
  hipAdduction: 'Hip Adduction',
  pelvicDrop: 'Pelvic Drop',
  trunkLateralLean: 'Trunk Lateral Lean',
  ankleDorsiflexion: 'Ankle Dorsiflexion',
  cadence: 'Cadence',
  verticalOscillation: 'Vertical Oscillation',
  overstriding: 'Overstriding',
  strideSymmetry: 'Stride Symmetry',
  groundContactTime: 'Ground Contact Time',
};

export const APP_NAME = 'Runalyze';

export const MEDIAPIPE_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

export const LITE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const HEAVY_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task';

export const FPS_TARGET = 30;
export const FPS_SKIP_THRESHOLD = 20;
```

- [ ] **Step 3: Commit**

```bash
git add src/analysis/types.ts src/config/defaults.ts
git commit -m "feat: TypeScript interfaces and landmark constants"
```

---

## Task 3: Video Player

**Files:**
- Create: `src/ui/videoPlayer.ts`

- [ ] **Step 1: Create `src/ui/videoPlayer.ts`**

```typescript
export interface VideoPlayerCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onSeeked: () => void;
  onLoadedMetadata: () => void;
}

export function initVideoPlayer(
  video: HTMLVideoElement,
  fileInput: HTMLInputElement,
  callbacks: VideoPlayerCallbacks,
): void {
  fileInput.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
  });

  video.addEventListener('play', callbacks.onPlay);
  video.addEventListener('pause', callbacks.onPause);
  video.addEventListener('seeked', callbacks.onSeeked);
  video.addEventListener('loadedmetadata', callbacks.onLoadedMetadata);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/videoPlayer.ts
git commit -m "feat: video player — file upload and event callbacks"
```

---

## Task 4: Pose Landmarker Init

**Files:**
- Create: `src/pose/landmarker.ts`

- [ ] **Step 1: Create `src/pose/landmarker.ts`**

```typescript
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_CDN, LITE_MODEL_URL } from '../config/defaults';

export async function initLandmarker(
  modelUrl: string = LITE_MODEL_URL,
): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);

  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pose/landmarker.ts
git commit -m "feat: MediaPipe PoseLandmarker init (lite model, CDN)"
```

---

## Task 5: Frame Processing Loop

**Files:**
- Create: `src/pose/processing.ts`

- [ ] **Step 1: Create `src/pose/processing.ts`**

```typescript
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { FPS_TARGET, FPS_SKIP_THRESHOLD, LANDMARKS } from '../config/defaults';
import type { FrameData, LandmarkArray, CameraView } from '../analysis/types';

export interface ProcessingController {
  start: () => void;
  stop: () => void;
  getFrames: () => FrameData[];
  getCurrentLandmarks: () => LandmarkArray | null;
  getFps: () => number;
}

export function detectCameraView(landmarks: LandmarkArray): CameraView {
  const leftHip = landmarks[LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[LANDMARKS.RIGHT_HIP];
  if (!leftHip || !rightHip) return 'unknown';
  const hipWidth = Math.abs(leftHip.x - rightHip.x);
  if (hipWidth > 0.15) return 'frontal';
  if (hipWidth < 0.08) return 'sagittal';
  return 'unknown';
}

export function createProcessingLoop(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  onFrame: (landmarks: LandmarkArray, timestamp: number) => void,
): ProcessingController {
  let running = false;
  let rafId = 0;
  let lastProcessTime = 0;
  let currentFps = FPS_TARGET;
  const frames: FrameData[] = [];
  let currentLandmarks: LandmarkArray | null = null;

  function processFrame() {
    if (!running) return;

    const now = performance.now();
    const elapsed = now - lastProcessTime;

    if (!video.paused && !video.ended && video.readyState >= 2) {
      const targetInterval = 1000 / FPS_TARGET;
      if (elapsed >= targetInterval) {
        currentFps = elapsed > 0 ? 1000 / elapsed : FPS_TARGET;

        // Skip frame if performance is poor
        const shouldProcess =
          currentFps >= FPS_SKIP_THRESHOLD || frames.length % 2 === 0;

        if (shouldProcess) {
          const result = landmarker.detectForVideo(video, now);
          if (result.landmarks.length > 0) {
            currentLandmarks = result.landmarks[0] as LandmarkArray;
            frames.push({ timestamp: now, landmarks: currentLandmarks });
            onFrame(currentLandmarks, now);
          }
        }
        lastProcessTime = now;
      }
    }

    rafId = requestAnimationFrame(processFrame);
  }

  return {
    start() {
      running = true;
      frames.length = 0;
      currentLandmarks = null;
      lastProcessTime = 0;
      processFrame();
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    getFrames: () => frames,
    getCurrentLandmarks: () => currentLandmarks,
    getFps: () => currentFps,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pose/processing.ts
git commit -m "feat: frame processing loop with FPS-adaptive frame skipping"
```

---

## Task 6: Basic Skeleton Overlay (white)

**Files:**
- Create: `src/ui/overlay.ts`

- [ ] **Step 1: Create `src/ui/overlay.ts`**

```typescript
import { POSE_CONNECTIONS, OVERLAY_COLORS } from '../config/defaults';
import type { LandmarkArray, MetricStatus } from '../analysis/types';

export type JointStatuses = Partial<Record<number, MetricStatus>>;

export interface OverlayController {
  drawSkeleton: (landmarks: LandmarkArray, statuses?: JointStatuses) => void;
  drawAngleLabel: (
    landmarks: LandmarkArray,
    landmarkIndex: number,
    label: string,
  ) => void;
  clear: () => void;
  syncSize: () => void;
  setVisible: (visible: boolean) => void;
  captureDataUrl: () => string;
}

export function initOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): OverlayController {
  const ctx = canvas.getContext('2d')!;
  let visible = true;

  function syncSize() {
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function statusToColor(status?: MetricStatus): string {
    if (status === 'green') return OVERLAY_COLORS.green;
    if (status === 'amber') return OVERLAY_COLORS.amber;
    if (status === 'red') return OVERLAY_COLORS.red;
    return OVERLAY_COLORS.neutral;
  }

  function drawSkeleton(
    landmarks: LandmarkArray,
    statuses: JointStatuses = {},
  ) {
    if (!visible) return;
    clear();
    const w = canvas.width;
    const h = canvas.height;

    // Connections
    ctx.lineWidth = 2;
    for (const [a, b] of POSE_CONNECTIONS) {
      const lmA = landmarks[a];
      const lmB = landmarks[b];
      if (!lmA || !lmB) continue;
      if ((lmA.visibility ?? 1) < 0.4 || (lmB.visibility ?? 1) < 0.4) continue;
      const color =
        statusToColor(statuses[a]) !== OVERLAY_COLORS.neutral
          ? statusToColor(statuses[a])
          : statusToColor(statuses[b]);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(lmA.x * w, lmA.y * h);
      ctx.lineTo(lmB.x * w, lmB.y * h);
      ctx.stroke();
    }

    // Landmark dots
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm || (lm.visibility ?? 1) < 0.4) continue;
      ctx.fillStyle = statusToColor(statuses[i]);
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAngleLabel(
    landmarks: LandmarkArray,
    landmarkIndex: number,
    label: string,
  ) {
    const lm = landmarks[landmarkIndex];
    if (!lm || (lm.visibility ?? 1) < 0.4) return;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px system-ui';
    ctx.fillText(label, lm.x * canvas.width + 6, lm.y * canvas.height - 6);
  }

  return {
    drawSkeleton,
    drawAngleLabel,
    clear,
    syncSize,
    setVisible(v) {
      visible = v;
      if (!v) clear();
    },
    captureDataUrl: () => canvas.toDataURL('image/png'),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/overlay.ts
git commit -m "feat: canvas skeleton overlay — white landmark drawing"
```

---

## Task 7: Wire Step 1 — main.ts (manual test)

**Files:**
- Create: `src/main.ts`

- [ ] **Step 1: Create `src/main.ts`**

```typescript
import { initVideoPlayer } from './ui/videoPlayer';
import { initLandmarker } from './pose/landmarker';
import { createProcessingLoop, detectCameraView } from './pose/processing';
import { initOverlay } from './ui/overlay';

async function main() {
  // Show loading indicator while MediaPipe initialises
  const loadingEl = document.createElement('div');
  loadingEl.id = 'loading-msg';
  loadingEl.textContent = 'Loading pose model…';
  document.body.appendChild(loadingEl);

  const video = document.getElementById('video') as HTMLVideoElement;
  const canvas = document.getElementById('overlay') as HTMLCanvasElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const toggleOverlayBtn = document.getElementById('toggle-overlay') as HTMLButtonElement;
  const viewDisplay = document.getElementById('view-display') as HTMLParagraphElement;

  const landmarker = await initLandmarker();
  loadingEl.remove();

  const overlay = initOverlay(canvas, video);

  const loop = createProcessingLoop(landmarker, video, (landmarks) => {
    overlay.drawSkeleton(landmarks);
    const view = detectCameraView(landmarks);
    viewDisplay.textContent = `View: ${view}`;
  });

  initVideoPlayer(video, fileInput, {
    onLoadedMetadata: () => overlay.syncSize(),
    onPlay: () => loop.start(),
    onPause: () => loop.stop(),
    onSeeked: () => {
      const lm = loop.getCurrentLandmarks();
      if (lm) overlay.drawSkeleton(lm);
    },
  });

  toggleOverlayBtn.addEventListener('click', () => {
    const next = !canvas.style.display || canvas.style.display !== 'none';
    overlay.setVisible(next);
    canvas.style.display = next ? '' : 'none';
  });
}

main().catch(console.error);
```

- [ ] **Step 2: Run dev server and test manually**

```bash
npm run dev
```

Open `http://localhost:5173`. Upload a running video. Expected:
- "Loading pose model…" shown during init
- After model loads, upload video and press play
- White skeleton dots and lines track the runner
- "View: sagittal" or "View: frontal" shown in live panel

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: Step 1 complete — video + pose skeleton overlay working"
```

---

## Task 8: Angle Utilities (with tests)

**Files:**
- Create: `src/analysis/angles.ts`
- Create: `src/analysis/angles.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/analysis/angles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  angleBetweenThreePoints,
  lateralAngle,
  verticalDisplacement,
  midpoint,
} from './angles';
import type { Landmark, FrameData } from './types';

const lm = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 1 });

describe('angleBetweenThreePoints', () => {
  it('returns 90° for a right angle', () => {
    // b at origin, a to the left, c above — right angle at b
    expect(angleBetweenThreePoints(lm(0, 0), lm(1, 0), lm(1, 1))).toBeCloseTo(90, 1);
  });

  it('returns 180° for a straight line', () => {
    expect(angleBetweenThreePoints(lm(0, 0), lm(1, 0), lm(2, 0))).toBeCloseTo(180, 1);
  });

  it('returns ~160° for a slightly bent knee', () => {
    // hip above knee, ankle slightly forward — realistic running position
    const hip = lm(0.5, 0.3);
    const knee = lm(0.52, 0.55);
    const ankle = lm(0.48, 0.78);
    const angle = angleBetweenThreePoints(hip, knee, ankle);
    expect(angle).toBeGreaterThan(140);
    expect(angle).toBeLessThan(180);
  });
});

describe('lateralAngle', () => {
  it('returns 0° for a perfectly vertical line', () => {
    expect(lateralAngle(lm(0.5, 0.2), lm(0.5, 0.8))).toBeCloseTo(0, 1);
  });

  it('returns ~45° for a 45° lean', () => {
    expect(lateralAngle(lm(0.3, 0.2), lm(0.7, 0.6))).toBeCloseTo(45, 1);
  });
});

describe('midpoint', () => {
  it('returns midpoint of two landmarks', () => {
    const m = midpoint(lm(0.2, 0.4), lm(0.6, 0.8));
    expect(m.x).toBeCloseTo(0.4);
    expect(m.y).toBeCloseTo(0.6);
  });
});

describe('verticalDisplacement', () => {
  it('returns peak-to-peak y displacement across frames', () => {
    const makeFrame = (y: number): FrameData => ({
      timestamp: 0,
      landmarks: Array(33).fill(null).map((_, i) =>
        i === 23 ? lm(0.5, y) : lm(0.5, 0.5)
      ),
    });
    const frames: FrameData[] = [
      makeFrame(0.4), makeFrame(0.5), makeFrame(0.6),
      makeFrame(0.5), makeFrame(0.4),
    ];
    // peak-to-peak = 0.6 - 0.4 = 0.2, × 100 = 20 cm
    expect(verticalDisplacement(23, frames)).toBeCloseTo(20, 1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test
```

Expected: FAIL — `Cannot find module './angles'`

- [ ] **Step 3: Create `src/analysis/angles.ts`**

```typescript
import type { Landmark, FrameData } from './types';

export function angleBetweenThreePoints(
  a: Landmark,
  b: Landmark,
  c: Landmark,
): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBa = Math.sqrt(ba.x ** 2 + ba.y ** 2);
  const magBc = Math.sqrt(bc.x ** 2 + bc.y ** 2);
  if (magBa === 0 || magBc === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBa * magBc)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

export function lateralAngle(top: Landmark, bottom: Landmark): number {
  const dx = top.x - bottom.x;
  const dy = Math.abs(top.y - bottom.y);
  return Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
}

export function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

/**
 * Returns peak-to-peak vertical displacement of a landmark across frames, in cm.
 * Uses rough approximation: normalised y × 100 ≈ cm (assumes runner fills ~1m of frame height).
 */
export function verticalDisplacement(
  landmarkIndex: number,
  frames: FrameData[],
): number {
  const ys = frames
    .map((f) => f.landmarks[landmarkIndex]?.y ?? 0)
    .filter((y) => y > 0);
  if (ys.length < 2) return 0;
  return (Math.max(...ys) - Math.min(...ys)) * 100;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```

Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/analysis/angles.ts src/analysis/angles.test.ts
git commit -m "feat: angle calculation utilities with tests"
```

---

## Task 9: Angle Labels on Overlay

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update `src/main.ts` to import angles and draw labels**

Replace the `onFrame` callback in `createProcessingLoop`:

```typescript
// Add imports at top
import { angleBetweenThreePoints } from './analysis/angles';
import { LANDMARKS } from './config/defaults';
import type { LandmarkArray } from './analysis/types';

// Replace the onFrame callback inside createProcessingLoop call:
const loop = createProcessingLoop(landmarker, video, (landmarks: LandmarkArray) => {
  overlay.drawSkeleton(landmarks);

  // Left knee flexion angle
  const leftKneeAngle = angleBetweenThreePoints(
    landmarks[LANDMARKS.LEFT_HIP],
    landmarks[LANDMARKS.LEFT_KNEE],
    landmarks[LANDMARKS.LEFT_ANKLE],
  );
  overlay.drawAngleLabel(landmarks, LANDMARKS.LEFT_KNEE, `${leftKneeAngle.toFixed(0)}°`);

  // Right knee flexion angle
  const rightKneeAngle = angleBetweenThreePoints(
    landmarks[LANDMARKS.RIGHT_HIP],
    landmarks[LANDMARKS.RIGHT_KNEE],
    landmarks[LANDMARKS.RIGHT_ANKLE],
  );
  overlay.drawAngleLabel(landmarks, LANDMARKS.RIGHT_KNEE, `${rightKneeAngle.toFixed(0)}°`);

  const view = detectCameraView(landmarks);
  viewDisplay.textContent = `View: ${view}`;
});
```

- [ ] **Step 2: Test manually**

```bash
npm run dev
```

Upload a running video, press play. Expected: knee angle values (e.g., "163°", "158°") appear as white labels near each knee joint on the canvas. Pause video — labels should still show the last frame's values.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: Step 2 complete — live knee angle labels on overlay"
```

---

## Task 10: Gait Event Detection (with tests)

**Files:**
- Create: `src/analysis/gaitDetection.ts`
- Create: `src/analysis/gaitDetection.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/analysis/gaitDetection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectGaitEvents, calculateCadence, segmentGaitCycles } from './gaitDetection';
import type { FrameData, Landmark } from './types';

function makeFrames(ankleYValues: number[], leftAnkle = true): FrameData[] {
  const ankleIdx = leftAnkle ? 27 : 28;
  return ankleYValues.map((y, i) => ({
    timestamp: i * (1000 / 30),
    landmarks: Array(33).fill(null).map((_, li): Landmark => ({
      x: 0.5, y: li === ankleIdx ? y : 0.5, z: 0, visibility: 1,
    })),
  }));
}

describe('detectGaitEvents', () => {
  it('detects footstrikes at local maxima of ankle y', () => {
    // Simulate 2 footstrikes: peaks at frames 15 and 45 (30fps, ~1 step/sec)
    const ys = Array(60).fill(0).map((_, i) => {
      // Sinusoidal oscillation: peaks at ~15 and ~45
      return 0.7 + 0.1 * Math.sin((i / 30) * Math.PI * 2 - Math.PI / 2);
    });
    const frames = makeFrames(ys);
    const events = detectGaitEvents(frames, 30);
    const footstrikes = events.filter(e => e.type === 'footstrike' && e.foot === 'left');
    expect(footstrikes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('calculateCadence', () => {
  it('returns 180 spm for 30 footstrikes over 10 seconds', () => {
    const events = Array(30).fill(null).map((_, i) => ({
      type: 'footstrike' as const,
      foot: (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
      frameIndex: i * 10,
      timestamp: i * (10000 / 30),
    }));
    expect(calculateCadence(events, 10)).toBe(180);
  });

  it('returns 0 for zero duration', () => {
    expect(calculateCadence([], 0)).toBe(0);
  });
});

describe('segmentGaitCycles', () => {
  it('creates one cycle between two consecutive footstrikes of the same foot', () => {
    const events = [
      { type: 'footstrike' as const, foot: 'left' as const, frameIndex: 0, timestamp: 0 },
      { type: 'toe_off' as const, foot: 'left' as const, frameIndex: 10, timestamp: 333 },
      { type: 'footstrike' as const, foot: 'left' as const, frameIndex: 30, timestamp: 1000 },
    ];
    const cycles = segmentGaitCycles(events);
    const leftCycles = cycles.filter(c => c.foot === 'left');
    expect(leftCycles).toHaveLength(1);
    expect(leftCycles[0].startFrame).toBe(0);
    expect(leftCycles[0].endFrame).toBe(30);
    expect(leftCycles[0].toeOffFrame).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test
```

Expected: FAIL — `Cannot find module './gaitDetection'`

- [ ] **Step 3: Create `src/analysis/gaitDetection.ts`**

```typescript
import type { FrameData, GaitEvent, GaitCycle, Foot } from './types';
import { LANDMARKS } from '../config/defaults';

function findLocalMaxima(
  values: number[],
  minDistance: number,
  minProminence: number,
): number[] {
  const indices: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] <= values[i - 1] || values[i] < values[i + 1]) continue;
    if (indices.length > 0 && i - indices[indices.length - 1] < minDistance) continue;
    const windowStart = Math.max(0, i - minDistance);
    const windowEnd = Math.min(values.length - 1, i + minDistance);
    const windowMin = Math.min(...values.slice(windowStart, windowEnd + 1));
    if (values[i] - windowMin >= minProminence) indices.push(i);
  }
  return indices;
}

function findLocalMinima(
  values: number[],
  minDistance: number,
  minProminence: number,
): number[] {
  const negated = values.map((v) => -v);
  return findLocalMaxima(negated, minDistance, minProminence);
}

export function detectGaitEvents(frames: FrameData[], fps: number): GaitEvent[] {
  const minFramesBetweenSteps = Math.round(fps * 0.25);
  const minProminence = 0.02;
  const events: GaitEvent[] = [];

  const ankleConfig: Array<{ index: number; foot: Foot }> = [
    { index: LANDMARKS.LEFT_ANKLE, foot: 'left' },
    { index: LANDMARKS.RIGHT_ANKLE, foot: 'right' },
  ];

  for (const { index: ankleIdx, foot } of ankleConfig) {
    const ys = frames.map((f) => f.landmarks[ankleIdx]?.y ?? 0);

    for (const fi of findLocalMaxima(ys, minFramesBetweenSteps, minProminence)) {
      events.push({ type: 'footstrike', foot, frameIndex: fi, timestamp: frames[fi].timestamp });
    }
    for (const fi of findLocalMinima(ys, minFramesBetweenSteps, minProminence)) {
      events.push({ type: 'toe_off', foot, frameIndex: fi, timestamp: frames[fi].timestamp });
    }
  }

  return events.sort((a, b) => a.frameIndex - b.frameIndex);
}

export function calculateCadence(events: GaitEvent[], totalDurationSeconds: number): number {
  if (totalDurationSeconds <= 0) return 0;
  const footstrikes = events.filter((e) => e.type === 'footstrike');
  return Math.round((footstrikes.length / totalDurationSeconds) * 60);
}

export function segmentGaitCycles(events: GaitEvent[]): GaitCycle[] {
  const cycles: GaitCycle[] = [];

  for (const foot of ['left', 'right'] as Foot[]) {
    const footstrikes = events
      .filter((e) => e.type === 'footstrike' && e.foot === foot)
      .sort((a, b) => a.frameIndex - b.frameIndex);
    const toeOffs = events
      .filter((e) => e.type === 'toe_off' && e.foot === foot)
      .sort((a, b) => a.frameIndex - b.frameIndex);

    for (let i = 0; i < footstrikes.length - 1; i++) {
      const start = footstrikes[i].frameIndex;
      const end = footstrikes[i + 1].frameIndex;
      const toeOff = toeOffs.find((t) => t.frameIndex > start && t.frameIndex < end);
      cycles.push({
        foot,
        startFrame: start,
        endFrame: end,
        footstrikeFrame: start,
        toeOffFrame: toeOff?.frameIndex ?? Math.round(start + (end - start) * 0.4),
      });
    }
  }

  return cycles.sort((a, b) => a.startFrame - b.startFrame);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```

Expected: All gaitDetection tests pass (angles tests still pass too).

- [ ] **Step 5: Commit**

```bash
git add src/analysis/gaitDetection.ts src/analysis/gaitDetection.test.ts
git commit -m "feat: gait event detection — footstrike, toe-off, cadence"
```

---

## Task 11: Cadence Display

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update `src/main.ts` to run gait detection on video end and display cadence**

Add imports at top of `src/main.ts`:

```typescript
import { detectGaitEvents, calculateCadence, segmentGaitCycles } from './analysis/gaitDetection';
```

Add a `video.addEventListener('ended', ...)` handler inside `main()`, after `initVideoPlayer`:

```typescript
const cadenceDisplay = document.getElementById('cadence-display') as HTMLParagraphElement;

video.addEventListener('ended', () => {
  const frames = loop.getFrames();
  if (frames.length < 10) return;

  const durationSeconds = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000;
  const fps = frames.length / durationSeconds;

  const gaitEvents = detectGaitEvents(frames, fps);
  const cadence = calculateCadence(gaitEvents, durationSeconds);
  cadenceDisplay.textContent = `Cadence: ${cadence} spm`;
});
```

- [ ] **Step 2: Test manually**

```bash
npm run dev
```

Upload a running video, let it play to completion. Expected: cadence counter updates to a value in the range 150–200 spm. For a typical treadmill running video it should read 160–190.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: Step 3 complete — gait detection + cadence display"
```

---

## Task 12: Thresholds (with tests)

**Files:**
- Create: `src/analysis/thresholds.ts`
- Create: `src/analysis/thresholds.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/analysis/thresholds.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateMetric } from './thresholds';

describe('evaluateMetric', () => {
  it('returns green for cadence in green range', () => {
    expect(evaluateMetric(180, 'cadence')).toBe('green');
  });

  it('returns amber for cadence in amber range', () => {
    expect(evaluateMetric(165, 'cadence')).toBe('amber');
  });

  it('returns red for cadence below amber', () => {
    expect(evaluateMetric(150, 'cadence')).toBe('red');
  });

  it('returns green for cadence above green max (lower_is_worse)', () => {
    expect(evaluateMetric(200, 'cadence')).toBe('green');
  });

  it('returns green for pelvicDrop in green range', () => {
    expect(evaluateMetric(3, 'pelvicDrop')).toBe('green');
  });

  it('returns amber for pelvicDrop in amber range', () => {
    expect(evaluateMetric(6, 'pelvicDrop')).toBe('amber');
  });

  it('returns red for pelvicDrop above amber max', () => {
    expect(evaluateMetric(9, 'pelvicDrop')).toBe('red');
  });

  it('returns green for pelvicDrop below green min (higher_is_worse)', () => {
    expect(evaluateMetric(0, 'pelvicDrop')).toBe('green');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```

- [ ] **Step 3: Create `src/analysis/thresholds.ts`**

```typescript
import type { MetricStatus, AnalysisResults } from './types';

interface ThresholdEntry {
  green: [number, number];
  amber: [number, number];
  unit: string;
  direction: 'lower_is_worse' | 'higher_is_worse';
}

export const THRESHOLDS: Record<keyof AnalysisResults, ThresholdEntry> = {
  kneeFlexionAtContact:  { green: [155, 170], amber: [145, 155], unit: '°',   direction: 'lower_is_worse' },
  cadence:               { green: [170, 195], amber: [160, 170], unit: ' spm', direction: 'lower_is_worse' },
  pelvicDrop:            { green: [0, 5],     amber: [5, 7],     unit: '°',   direction: 'higher_is_worse' },
  trunkLateralLean:      { green: [0, 5],     amber: [5, 8],     unit: '°',   direction: 'higher_is_worse' },
  hipAdduction:          { green: [0, 10],    amber: [10, 15],   unit: '°',   direction: 'higher_is_worse' },
  ankleDorsiflexion:     { green: [8, 20],    amber: [4, 8],     unit: '°',   direction: 'lower_is_worse' },
  verticalOscillation:   { green: [6, 10],    amber: [10, 13],   unit: ' cm', direction: 'higher_is_worse' },
  overstriding:          { green: [0, 8],     amber: [8, 15],    unit: ' cm', direction: 'higher_is_worse' },
  strideSymmetry:        { green: [0, 5],     amber: [5, 10],    unit: '%',   direction: 'higher_is_worse' },
  groundContactTime:     { green: [200, 260], amber: [260, 300], unit: ' ms', direction: 'higher_is_worse' },
};

export function evaluateMetric(
  value: number,
  key: keyof typeof THRESHOLDS,
): MetricStatus {
  const t = THRESHOLDS[key];
  if (!t) return 'unknown';

  if (value >= t.green[0] && value <= t.green[1]) return 'green';
  if (value >= t.amber[0] && value <= t.amber[1]) return 'amber';

  // Values better than the optimal bound are still green
  if (t.direction === 'higher_is_worse' && value < t.green[0]) return 'green';
  if (t.direction === 'lower_is_worse' && value > t.green[1]) return 'green';

  return 'red';
}

export function makeMetricResult(
  value: number,
  key: keyof typeof THRESHOLDS,
): import('./types').MetricResult {
  return {
    value,
    status: evaluateMetric(value, key),
    unit: THRESHOLDS[key].unit,
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/analysis/thresholds.ts src/analysis/thresholds.test.ts
git commit -m "feat: threshold definitions and evaluateMetric() with tests"
```

---

## Task 13: Metrics Engine (with tests)

**Files:**
- Create: `src/analysis/metrics.ts`
- Create: `src/analysis/metrics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/analysis/metrics.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  calculateKneeFlexionAtContact,
  calculateTrunkLateralLean,
  calculateVerticalOscillation,
  calculateAllMetrics,
} from './metrics';
import type { FrameData, GaitEvent, Landmark } from './types';

function lm(x: number, y: number): Landmark {
  return { x, y, z: 0, visibility: 1 };
}

function makeFrame(overrides: Partial<Record<number, Landmark>>): FrameData {
  const base = Array(33).fill(null).map(() => lm(0.5, 0.5));
  Object.entries(overrides).forEach(([i, l]) => { base[Number(i)] = l!; });
  return { timestamp: 0, landmarks: base };
}

describe('calculateKneeFlexionAtContact', () => {
  it('returns null when no footstrike events', () => {
    expect(calculateKneeFlexionAtContact([], [], 'left')).toBeNull();
  });

  it('calculates knee angle at footstrike frame', () => {
    // Left side: hip above knee, ankle below — roughly 160° angle
    const frame = makeFrame({
      23: lm(0.5, 0.3),   // left hip
      25: lm(0.52, 0.55), // left knee
      27: lm(0.48, 0.78), // left ankle
    });
    const events: GaitEvent[] = [
      { type: 'footstrike', foot: 'left', frameIndex: 0, timestamp: 0 },
    ];
    const result = calculateKneeFlexionAtContact([frame], events, 'left');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(140);
    expect(result!).toBeLessThan(180);
  });
});

describe('calculateTrunkLateralLean', () => {
  it('returns null when no footstrike events', () => {
    expect(calculateTrunkLateralLean([], [])).toBeNull();
  });

  it('returns ~0 for a vertical trunk', () => {
    // Symmetric: shoulders and hips centred
    const frame = makeFrame({
      11: lm(0.4, 0.2), // left shoulder
      12: lm(0.6, 0.2), // right shoulder
      23: lm(0.4, 0.5), // left hip
      24: lm(0.6, 0.5), // right hip
    });
    const events: GaitEvent[] = [
      { type: 'footstrike', foot: 'left', frameIndex: 0, timestamp: 0 },
    ];
    const result = calculateTrunkLateralLean([frame], events);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0, 1);
  });
});

describe('calculateVerticalOscillation', () => {
  it('returns peak-to-peak hip oscillation in cm', () => {
    const frames: FrameData[] = [0.45, 0.5, 0.55, 0.5, 0.45].map((y) =>
      makeFrame({ 23: lm(0.4, y), 24: lm(0.6, y) })
    );
    const result = calculateVerticalOscillation(frames);
    // midpoint y oscillates 0.45–0.55, displacement = 0.1 × 100 = 10 cm
    expect(result).toBeCloseTo(10, 0);
  });
});

describe('calculateAllMetrics', () => {
  it('returns null for frontal-only metrics when view is sagittal', () => {
    const results = calculateAllMetrics([], [], [], 30, 'sagittal');
    expect(results.pelvicDrop).toBeNull();
    expect(results.hipAdduction).toBeNull();
  });

  it('returns null for sagittal-only metrics when view is frontal', () => {
    const results = calculateAllMetrics([], [], [], 30, 'frontal');
    expect(results.kneeFlexionAtContact).toBeNull();
    expect(results.ankleDorsiflexion).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```

- [ ] **Step 3: Create `src/analysis/metrics.ts`**

```typescript
import type {
  FrameData, GaitEvent, GaitCycle, AnalysisResults,
  MetricResult, CameraView, Foot,
} from './types';
import { LANDMARKS } from '../config/defaults';
import { angleBetweenThreePoints, lateralAngle, midpoint, verticalDisplacement } from './angles';
import { makeMetricResult } from './thresholds';

export function calculateKneeFlexionAtContact(
  frames: FrameData[],
  events: GaitEvent[],
  side: Foot,
): number | null {
  const L = LANDMARKS;
  const hipIdx = side === 'left' ? L.LEFT_HIP : L.RIGHT_HIP;
  const kneeIdx = side === 'left' ? L.LEFT_KNEE : L.RIGHT_KNEE;
  const ankleIdx = side === 'left' ? L.LEFT_ANKLE : L.RIGHT_ANKLE;

  const footstrikes = events.filter((e) => e.type === 'footstrike' && e.foot === side);
  if (footstrikes.length === 0) return null;

  const angles = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) =>
      angleBetweenThreePoints(f.landmarks[hipIdx], f.landmarks[kneeIdx], f.landmarks[ankleIdx])
    );
  return angles.reduce((a, b) => a + b, 0) / angles.length;
}

export function calculateAnkleDorsiflexion(
  frames: FrameData[],
  events: GaitEvent[],
  side: Foot,
): number | null {
  const L = LANDMARKS;
  const kneeIdx = side === 'left' ? L.LEFT_KNEE : L.RIGHT_KNEE;
  const ankleIdx = side === 'left' ? L.LEFT_ANKLE : L.RIGHT_ANKLE;
  const footIdx = side === 'left' ? L.LEFT_FOOT_INDEX : L.RIGHT_FOOT_INDEX;

  const footstrikes = events.filter((e) => e.type === 'footstrike' && e.foot === side);
  if (footstrikes.length === 0) return null;

  const angles = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) =>
      angleBetweenThreePoints(f.landmarks[kneeIdx], f.landmarks[ankleIdx], f.landmarks[footIdx])
    );
  // Dorsiflexion = 180 - ankle angle (the supplementary angle represents dorsiflexion degrees)
  const avg = angles.reduce((a, b) => a + b, 0) / angles.length;
  return 180 - avg;
}

export function calculateTrunkLateralLean(
  frames: FrameData[],
  events: GaitEvent[],
): number | null {
  const L = LANDMARKS;
  const footstrikes = events.filter((e) => e.type === 'footstrike');
  if (footstrikes.length === 0) return null;

  const leans = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) => {
      const shoulderMid = midpoint(f.landmarks[L.LEFT_SHOULDER], f.landmarks[L.RIGHT_SHOULDER]);
      const hipMid = midpoint(f.landmarks[L.LEFT_HIP], f.landmarks[L.RIGHT_HIP]);
      return lateralAngle(shoulderMid, hipMid);
    });
  return leans.reduce((a, b) => a + b, 0) / leans.length;
}

export function calculatePelvicDrop(
  frames: FrameData[],
  events: GaitEvent[],
): number | null {
  const footstrikes = events.filter((e) => e.type === 'footstrike');
  if (footstrikes.length < 2) return null;

  // At each footstrike, measure height difference between hips
  const drops = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) => {
      const lh = f.landmarks[LANDMARKS.LEFT_HIP];
      const rh = f.landmarks[LANDMARKS.RIGHT_HIP];
      return Math.abs(lh.y - rh.y) * 100; // rough cm
    });
  return drops.reduce((a, b) => a + b, 0) / drops.length;
}

export function calculateHipAdduction(
  frames: FrameData[],
  events: GaitEvent[],
  side: Foot,
): number | null {
  const L = LANDMARKS;
  const stanceHipIdx = side === 'left' ? L.LEFT_HIP : L.RIGHT_HIP;
  const kneeIdx = side === 'left' ? L.LEFT_KNEE : L.RIGHT_KNEE;
  const otherHipIdx = side === 'left' ? L.RIGHT_HIP : L.LEFT_HIP;

  const footstrikes = events.filter((e) => e.type === 'footstrike' && e.foot === side);
  if (footstrikes.length === 0) return null;

  const angles = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) =>
      angleBetweenThreePoints(
        f.landmarks[otherHipIdx],
        f.landmarks[stanceHipIdx],
        f.landmarks[kneeIdx],
      )
    )
    .map((a) => Math.abs(90 - a)); // deviation from neutral

  return angles.reduce((a, b) => a + b, 0) / angles.length;
}

export function calculateVerticalOscillation(frames: FrameData[]): number | null {
  if (frames.length < 10) return null;
  const L = LANDMARKS;
  // Use midpoint of both hips
  const midYs = frames.map((f) => {
    const lh = f.landmarks[L.LEFT_HIP];
    const rh = f.landmarks[L.RIGHT_HIP];
    return (lh.y + rh.y) / 2;
  });
  const ys = midYs.filter((y) => y > 0);
  if (ys.length < 2) return null;
  return (Math.max(...ys) - Math.min(...ys)) * 100;
}

export function calculateOverstriding(
  frames: FrameData[],
  events: GaitEvent[],
  side: Foot,
): number | null {
  const L = LANDMARKS;
  const hipIdx = side === 'left' ? L.LEFT_HIP : L.RIGHT_HIP;
  const ankleIdx = side === 'left' ? L.LEFT_ANKLE : L.RIGHT_ANKLE;

  const footstrikes = events.filter((e) => e.type === 'footstrike' && e.foot === side);
  if (footstrikes.length === 0) return null;

  const distances = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) => {
      const hip = f.landmarks[hipIdx];
      const ankle = f.landmarks[ankleIdx];
      // Positive = ankle ahead of hip (overstriding)
      return (ankle.x - hip.x) * 100; // rough cm
    });
  return distances.reduce((a, b) => a + b, 0) / distances.length;
}

export function calculateStrideSymmetry(
  leftVal: number | null,
  rightVal: number | null,
): number | null {
  if (leftVal === null || rightVal === null) return null;
  const avg = (Math.abs(leftVal) + Math.abs(rightVal)) / 2;
  if (avg === 0) return 0;
  return (Math.abs(Math.abs(leftVal) - Math.abs(rightVal)) / avg) * 100;
}

export function calculateGroundContactTime(
  cycles: GaitCycle[],
  fps: number,
): number | null {
  if (cycles.length === 0) return null;
  const times = cycles.map((c) => {
    const frames = c.toeOffFrame - c.footstrikeFrame;
    return (frames / fps) * 1000; // ms
  });
  return times.reduce((a, b) => a + b, 0) / times.length;
}

function toResult(value: number | null, key: keyof AnalysisResults): MetricResult | null {
  if (value === null) return null;
  return makeMetricResult(Math.abs(value), key);
}

export function calculateAllMetrics(
  frames: FrameData[],
  events: GaitEvent[],
  cycles: GaitCycle[],
  fps: number,
  cameraView: CameraView,
): AnalysisResults {
  const isSagittal = cameraView === 'sagittal' || cameraView === 'unknown';
  const isFrontal = cameraView === 'frontal' || cameraView === 'unknown';

  const leftKnee = isSagittal ? calculateKneeFlexionAtContact(frames, events, 'left') : null;
  const rightKnee = isSagittal ? calculateKneeFlexionAtContact(frames, events, 'right') : null;
  const avgKnee = leftKnee !== null && rightKnee !== null
    ? (leftKnee + rightKnee) / 2
    : leftKnee ?? rightKnee;

  const leftAnkle = isSagittal ? calculateAnkleDorsiflexion(frames, events, 'left') : null;
  const rightAnkle = isSagittal ? calculateAnkleDorsiflexion(frames, events, 'right') : null;
  const avgAnkle = leftAnkle !== null && rightAnkle !== null
    ? (leftAnkle + rightAnkle) / 2
    : leftAnkle ?? rightAnkle;

  const leftOver = isSagittal ? calculateOverstriding(frames, events, 'left') : null;
  const rightOver = isSagittal ? calculateOverstriding(frames, events, 'right') : null;
  const avgOver = leftOver !== null && rightOver !== null
    ? (Math.abs(leftOver) + Math.abs(rightOver)) / 2
    : leftOver !== null ? Math.abs(leftOver) : rightOver !== null ? Math.abs(rightOver) : null;

  const leftHipAdd = isFrontal ? calculateHipAdduction(frames, events, 'left') : null;
  const rightHipAdd = isFrontal ? calculateHipAdduction(frames, events, 'right') : null;
  const avgHipAdd = leftHipAdd !== null && rightHipAdd !== null
    ? (leftHipAdd + rightHipAdd) / 2
    : leftHipAdd ?? rightHipAdd;

  const durationSeconds = frames.length > 0
    ? (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000
    : 0;
  const cadenceVal = durationSeconds > 0
    ? calculateCadenceValue(events, durationSeconds)
    : null;

  const symmetry = calculateStrideSymmetry(leftKnee, rightKnee);

  return {
    kneeFlexionAtContact: toResult(avgKnee, 'kneeFlexionAtContact'),
    hipAdduction: toResult(avgHipAdd, 'hipAdduction'),
    pelvicDrop: isFrontal ? toResult(calculatePelvicDrop(frames, events), 'pelvicDrop') : null,
    trunkLateralLean: toResult(calculateTrunkLateralLean(frames, events), 'trunkLateralLean'),
    ankleDorsiflexion: toResult(avgAnkle, 'ankleDorsiflexion'),
    cadence: toResult(cadenceVal, 'cadence'),
    verticalOscillation: toResult(calculateVerticalOscillation(frames), 'verticalOscillation'),
    overstriding: toResult(avgOver, 'overstriding'),
    strideSymmetry: toResult(symmetry, 'strideSymmetry'),
    groundContactTime: toResult(calculateGroundContactTime(cycles, fps), 'groundContactTime'),
  };
}

function calculateCadenceValue(events: GaitEvent[], durationSeconds: number): number | null {
  if (durationSeconds <= 0) return null;
  const footstrikes = events.filter((e) => e.type === 'footstrike');
  if (footstrikes.length === 0) return null;
  return Math.round((footstrikes.length / durationSeconds) * 60);
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/analysis/metrics.ts src/analysis/metrics.test.ts
git commit -m "feat: all 10 biomechanical metric calculations with tests"
```

---

## Task 14: Findings Templates (with tests)

**Files:**
- Create: `src/analysis/findings.ts`
- Create: `src/analysis/findings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/analysis/findings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateFindings } from './findings';
import type { AnalysisResults } from './types';

const emptyResults: AnalysisResults = {
  kneeFlexionAtContact: null, hipAdduction: null, pelvicDrop: null,
  trunkLateralLean: null, ankleDorsiflexion: null, cadence: null,
  verticalOscillation: null, overstriding: null, strideSymmetry: null,
  groundContactTime: null,
};

describe('generateFindings', () => {
  it('returns empty array when all metrics are null', () => {
    expect(generateFindings(emptyResults)).toHaveLength(0);
  });

  it('returns empty array when all metrics are green', () => {
    const results: AnalysisResults = {
      ...emptyResults,
      cadence: { value: 180, status: 'green', unit: ' spm' },
    };
    expect(generateFindings(results)).toHaveLength(0);
  });

  it('generates a finding for a red metric', () => {
    const results: AnalysisResults = {
      ...emptyResults,
      cadence: { value: 150, status: 'red', unit: ' spm' },
    };
    const findings = generateFindings(results);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe('red');
    expect(findings[0].text).toContain('150');
  });

  it('generates an amber finding for amber metric', () => {
    const results: AnalysisResults = {
      ...emptyResults,
      pelvicDrop: { value: 6, status: 'amber', unit: '°' },
    };
    const findings = generateFindings(results);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe('amber');
  });

  it('sorts red findings before amber findings', () => {
    const results: AnalysisResults = {
      ...emptyResults,
      cadence: { value: 150, status: 'red', unit: ' spm' },
      pelvicDrop: { value: 6, status: 'amber', unit: '°' },
    };
    const findings = generateFindings(results);
    expect(findings[0].status).toBe('red');
    expect(findings[1].status).toBe('amber');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```

- [ ] **Step 3: Create `src/analysis/findings.ts`**

```typescript
import type { AnalysisResults, FindingItem } from './types';

type FindingTemplate = {
  red: string;
  amber: string;
};

const FINDING_TEMPLATES: Partial<Record<keyof AnalysisResults, FindingTemplate>> = {
  kneeFlexionAtContact: {
    red: 'Knee is nearly fully extended at initial contact ({value}°), indicating significant heel striking. Consider increasing cadence and landing with greater knee flexion.',
    amber: 'Knee flexion at initial contact ({value}°) is slightly below optimal. Minor adjustment to footstrike pattern may be beneficial.',
  },
  pelvicDrop: {
    red: 'Contralateral pelvic drop of {value}° during stance phase exceeds normal range, suggesting hip abductor weakness. Hip strengthening exercises recommended.',
    amber: 'Mild contralateral pelvic drop of {value}° detected. Worth monitoring.',
  },
  hipAdduction: {
    red: 'Hip adduction of {value}° during stance is excessive. Combined with pelvic drop this may indicate iliotibial band stress.',
    amber: 'Hip adduction of {value}° is slightly elevated during stance phase.',
  },
  trunkLateralLean: {
    red: 'Trunk lateral lean of {value}° is excessive, indicating possible hip weakness or compensatory movement. Core stability work recommended.',
    amber: 'Mild trunk lateral lean of {value}° noted. May indicate fatigue or minor hip weakness.',
  },
  ankleDorsiflexion: {
    red: 'Ankle dorsiflexion at contact is reduced ({value}°), suggesting limited ankle mobility. Gastrocnemius/soleus stretching and ankle mobility work indicated.',
    amber: 'Ankle dorsiflexion at contact ({value}°) is slightly below optimal.',
  },
  cadence: {
    red: 'Cadence of {value} spm is below optimal range. Low cadence is associated with increased impact loading. Aim to increase by 5–10%.',
    amber: 'Cadence of {value} spm is slightly low. A minor increase may reduce injury risk.',
  },
  verticalOscillation: {
    red: 'Vertical oscillation of {value} cm is excessive, representing wasted energy. Focus on running along the ground with reduced up-and-down movement.',
    amber: 'Vertical oscillation of {value} cm is slightly above optimal.',
  },
  overstriding: {
    red: 'Significant overstriding detected ({value} cm ahead of centre of mass at contact). This increases braking forces and injury risk. Land closer to your centre of mass.',
    amber: 'Mild overstriding detected ({value} cm). Landing slightly closer to centre of mass is advised.',
  },
  strideSymmetry: {
    red: 'Stride asymmetry of {value}% is significant, suggesting a compensation pattern or underlying injury. Asymmetries above 10% warrant clinical investigation.',
    amber: 'Mild stride asymmetry of {value}% detected. Monitoring recommended.',
  },
  groundContactTime: {
    red: 'Ground contact time of {value} ms is excessive, suggesting inefficient push-off mechanics. Focus on quick ground contact and strong toe-off.',
    amber: 'Ground contact time of {value} ms is slightly above optimal.',
  },
};

export function generateFindings(results: AnalysisResults): FindingItem[] {
  const findings: FindingItem[] = [];

  for (const [key, result] of Object.entries(results) as [keyof AnalysisResults, typeof results[keyof AnalysisResults]][]) {
    if (!result || result.status === 'green' || result.status === 'unknown') continue;
    const template = FINDING_TEMPLATES[key];
    if (!template) continue;

    const text = template[result.status as 'red' | 'amber'].replace(
      '{value}',
      result.value.toFixed(1),
    );
    findings.push({ metric: key, status: result.status as 'red' | 'amber', text });
  }

  // Red findings first
  return findings.sort((a, b) => (a.status === 'red' ? -1 : 1) - (b.status === 'red' ? -1 : 1));
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/analysis/findings.ts src/analysis/findings.test.ts
git commit -m "feat: clinical findings templates and generateFindings() with tests"
```

---

## Task 15: Full Dashboard

**Files:**
- Create: `src/ui/dashboard.ts`

- [ ] **Step 1: Create `src/ui/dashboard.ts`**

```typescript
import { METRIC_LABELS, OVERLAY_COLORS } from '../config/defaults';
import type { AnalysisResults, FindingItem, MetricStatus } from '../analysis/types';
import { THRESHOLDS } from '../analysis/thresholds';

export function renderDashboard(results: AnalysisResults, findings: FindingItem[]): void {
  renderSummaryCards(results);
  renderFindings(findings);
  document.getElementById('export-pdf')?.removeAttribute('disabled');
}

export function renderSummaryCards(results: AnalysisResults): void {
  const container = document.getElementById('summary-cards')!;
  container.innerHTML = '';

  for (const [key, result] of Object.entries(results) as [keyof AnalysisResults, typeof results[keyof AnalysisResults]][]) {
    if (!result) continue;

    const threshold = THRESHOLDS[key];
    const card = document.createElement('div');
    card.className = `metric-card ${result.status}`;
    card.dataset.metric = key;

    const normalRange = threshold
      ? `Normal: ${threshold.green[0]}–${threshold.green[1]}${threshold.unit}`
      : '';

    card.innerHTML = `
      <div class="metric-name">${METRIC_LABELS[key] ?? key}</div>
      <div class="metric-value">
        <span class="status-dot ${result.status}"></span>
        ${result.value.toFixed(1)}${result.unit}
      </div>
      <div class="metric-range">${normalRange}</div>
    `;

    container.appendChild(card);
  }
}

export function renderFindings(findings: FindingItem[]): void {
  const container = document.getElementById('findings-list')!;
  container.innerHTML = '';

  if (findings.length === 0) {
    container.innerHTML = '<p style="color:#666;font-size:0.875rem;">No issues detected.</p>';
    return;
  }

  for (const finding of findings) {
    const item = document.createElement('div');
    item.className = `finding-item ${finding.status}`;
    item.textContent = finding.text;
    container.appendChild(item);
  }
}

export function updateLiveMetrics(
  cadence: number | null,
  view: string,
  fps: number,
): void {
  const cadenceEl = document.getElementById('cadence-display');
  const viewEl = document.getElementById('view-display');
  if (cadenceEl) cadenceEl.textContent = cadence ? `Cadence: ${cadence} spm` : 'Cadence: —';
  if (viewEl) viewEl.textContent = `View: ${view} | ${fps.toFixed(0)} fps`;
}

export function highlightMetricJoints(
  metricKey: string,
  statuses: Partial<Record<number, MetricStatus>>,
): void {
  // Called when user taps a metric card — highlights relevant joints
  // This triggers a redraw via the current landmarks + override statuses
  document.dispatchEvent(
    new CustomEvent('highlight-joints', { detail: { metricKey, statuses } })
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/dashboard.ts
git commit -m "feat: full dashboard — metric cards, findings list, live metrics"
```

---

## Task 16: Colored Overlay + Wire Step 4

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update `src/main.ts` to run full analysis pipeline and render dashboard**

Replace the entire `src/main.ts` with:

```typescript
import { initVideoPlayer } from './ui/videoPlayer';
import { initLandmarker } from './pose/landmarker';
import { createProcessingLoop, detectCameraView } from './pose/processing';
import { initOverlay } from './ui/overlay';
import { renderDashboard, updateLiveMetrics } from './ui/dashboard';
import { angleBetweenThreePoints } from './analysis/angles';
import { detectGaitEvents, segmentGaitCycles } from './analysis/gaitDetection';
import { calculateAllMetrics } from './analysis/metrics';
import { generateFindings } from './analysis/findings';
import { LANDMARKS } from './config/defaults';
import type { LandmarkArray, MetricStatus, AnalysisResults } from './analysis/types';

async function main() {
  const loadingEl = document.createElement('div');
  loadingEl.id = 'loading-msg';
  loadingEl.textContent = 'Loading pose model…';
  document.body.appendChild(loadingEl);

  const video = document.getElementById('video') as HTMLVideoElement;
  const canvas = document.getElementById('overlay') as HTMLCanvasElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const toggleOverlayBtn = document.getElementById('toggle-overlay') as HTMLButtonElement;
  const exportPdfBtn = document.getElementById('export-pdf') as HTMLButtonElement;

  const landmarker = await initLandmarker();
  loadingEl.remove();

  const overlay = initOverlay(canvas, video);
  let lastResults: AnalysisResults | null = null;
  let lastAnalysisFrameUrl: string | null = null;

  // Build joint→status map from results for overlay colour coding
  function buildJointStatuses(results: AnalysisResults): Partial<Record<number, MetricStatus>> {
    const s: Partial<Record<number, MetricStatus>> = {};
    const L = LANDMARKS;

    const set = (indices: number[], status: MetricStatus) => {
      indices.forEach((i) => { s[i] = status; });
    };

    if (results.kneeFlexionAtContact) {
      set([L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
        results.kneeFlexionAtContact.status);
    }
    if (results.pelvicDrop) {
      set([L.LEFT_HIP, L.RIGHT_HIP], results.pelvicDrop.status);
    }
    if (results.trunkLateralLean) {
      set([L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
        results.trunkLateralLean.status);
    }

    return s;
  }

  const loop = createProcessingLoop(landmarker, video, (landmarks: LandmarkArray) => {
    const statuses = lastResults ? buildJointStatuses(lastResults) : {};
    overlay.drawSkeleton(landmarks, statuses);

    // Angle labels
    const leftKneeAngle = angleBetweenThreePoints(
      landmarks[LANDMARKS.LEFT_HIP], landmarks[LANDMARKS.LEFT_KNEE], landmarks[LANDMARKS.LEFT_ANKLE],
    );
    const rightKneeAngle = angleBetweenThreePoints(
      landmarks[LANDMARKS.RIGHT_HIP], landmarks[LANDMARKS.RIGHT_KNEE], landmarks[LANDMARKS.RIGHT_ANKLE],
    );
    overlay.drawAngleLabel(landmarks, LANDMARKS.LEFT_KNEE, `${leftKneeAngle.toFixed(0)}°`);
    overlay.drawAngleLabel(landmarks, LANDMARKS.RIGHT_KNEE, `${rightKneeAngle.toFixed(0)}°`);

    const view = detectCameraView(landmarks);
    updateLiveMetrics(null, view, loop.getFps());
  });

  function runAnalysis() {
    const frames = loop.getFrames();
    if (frames.length < 30) return;

    const durationSec = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000;
    const fps = frames.length / durationSec;
    const view = detectCameraView(frames[frames.length - 1].landmarks);

    const gaitEvents = detectGaitEvents(frames, fps);
    const gaitCycles = segmentGaitCycles(gaitEvents);
    const results = calculateAllMetrics(frames, gaitEvents, gaitCycles, fps, view);
    const findings = generateFindings(results);

    lastResults = results;
    lastAnalysisFrameUrl = overlay.captureDataUrl();

    renderDashboard(results, findings);
    updateLiveMetrics(results.cadence?.value ?? null, view, fps);
  }

  initVideoPlayer(video, fileInput, {
    onLoadedMetadata: () => overlay.syncSize(),
    onPlay: () => loop.start(),
    onPause: () => { loop.stop(); runAnalysis(); },
    onSeeked: () => {
      const lm = loop.getCurrentLandmarks();
      if (lm) overlay.drawSkeleton(lm, lastResults ? buildJointStatuses(lastResults) : {});
    },
  });

  video.addEventListener('ended', () => { loop.stop(); runAnalysis(); });

  toggleOverlayBtn.addEventListener('click', () => {
    const isVisible = canvas.style.display !== 'none';
    overlay.setVisible(!isVisible);
    canvas.style.display = isVisible ? 'none' : '';
  });

  // PDF export — wired in Task 18
  exportPdfBtn.addEventListener('click', async () => {
    if (!lastResults) return;
    const { generateReport } = await import('./report/pdfGenerator');
    const clientName = (document.getElementById('client-name') as HTMLInputElement).value;
    const notes = (document.getElementById('physio-notes') as HTMLTextAreaElement).value;
    generateReport({
      clientName,
      notes,
      metrics: lastResults,
      findings: generateFindings(lastResults),
      frameDataUrl: lastAnalysisFrameUrl,
    });
  });
}

main().catch(console.error);
```

- [ ] **Step 2: Test manually**

```bash
npm run dev
```

Upload a running video, play it to completion or press pause. Expected:
- Skeleton joints are colour-coded (green/amber/red) based on analysis
- Metric cards grid appears below video
- Findings section shows text for any flagged metrics
- "Export PDF" button becomes enabled

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: Step 4 complete — full metrics dashboard with coloured overlay"
```

---

## Task 17: PDF Generator

**Files:**
- Create: `src/report/pdfGenerator.ts`

- [ ] **Step 1: Create `src/report/pdfGenerator.ts`**

```typescript
import jsPDF from 'jspdf';
import { METRIC_LABELS, APP_NAME } from '../config/defaults';
import { THRESHOLDS } from '../analysis/thresholds';
import type { ReportParams, AnalysisResults } from '../analysis/types';

export function generateReport(params: ReportParams): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  function checkPage(needed = 10) {
    if (y + needed > 275) { doc.addPage(); y = 20; }
  }

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Running Gait Analysis Report', margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, y);
  doc.text(`Generated: ${new Date().toLocaleTimeString()}`, margin + 60, y);
  if (params.clientName) doc.text(`Client: ${params.clientName}`, margin + 120, y);
  y += 6;

  // Logo placeholder
  doc.setDrawColor(200, 200, 200);
  doc.rect(pageWidth - margin - 45, 10, 45, 18);
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Clinic Logo', pageWidth - margin - 22, 20, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Key frame screenshot
  if (params.frameDataUrl) {
    checkPage(65);
    doc.addImage(params.frameDataUrl, 'PNG', margin, y, contentWidth, 80);
    y += 83;
  }

  // Metrics table
  checkPage(15);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Metrics Summary', margin, y);
  y += 7;

  // Table header
  doc.setFontSize(8);
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 4, contentWidth, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Metric', margin + 2, y);
  doc.text('Value', margin + 85, y);
  doc.text('Status', margin + 110, y);
  doc.text('Normal Range', margin + 135, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  for (const [key, result] of Object.entries(params.metrics) as [keyof AnalysisResults, typeof params.metrics[keyof AnalysisResults]][]) {
    if (!result) continue;
    checkPage(6);

    const threshold = THRESHOLDS[key];
    const label = METRIC_LABELS[key] ?? key;
    const range = threshold
      ? `${threshold.green[0]}–${threshold.green[1]}${threshold.unit}`
      : '—';

    // Status colour dot
    const statusColors: Record<string, [number, number, number]> = {
      green: [34, 197, 94],
      amber: [245, 158, 11],
      red: [239, 68, 68],
    };
    const color = statusColors[result.status] ?? [150, 150, 150];
    doc.setFillColor(...color);
    doc.circle(margin + 107, y - 1.5, 1.5, 'F');
    doc.setFillColor(0, 0, 0);

    doc.text(label, margin + 2, y);
    doc.text(`${result.value.toFixed(1)}${result.unit}`, margin + 85, y);
    doc.text(result.status.toUpperCase(), margin + 112, y);
    doc.text(range, margin + 135, y);
    y += 6;
  }

  y += 4;

  // Findings
  if (params.findings.length > 0) {
    checkPage(15);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Clinical Findings', margin, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    for (const finding of params.findings) {
      const lines = doc.splitTextToSize(finding.text, contentWidth - 8);
      checkPage(lines.length * 5 + 6);

      // Coloured left bar
      const barColor = finding.status === 'red' ? [239, 68, 68] : [245, 158, 11];
      doc.setFillColor(...(barColor as [number, number, number]));
      doc.rect(margin, y - 4, 2, lines.length * 5 + 2, 'F');
      doc.setFillColor(0, 0, 0);

      doc.text(lines, margin + 5, y);
      y += lines.length * 5 + 4;
    }
    y += 4;
  }

  // Physio notes
  if (params.notes.trim()) {
    checkPage(15);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Session Notes', margin, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(params.notes, contentWidth);
    checkPage(noteLines.length * 5);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 5;
  }

  // Footer on all pages
  const pageCount = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated by ${APP_NAME} — on-device analysis, no data transmitted | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      290,
      { align: 'center' },
    );
    doc.setTextColor(0, 0, 0);
  }

  doc.save(`runalyze-report-${Date.now()}.pdf`);
}
```

- [ ] **Step 2: Test manually**

```bash
npm run dev
```

Upload and play a running video. After analysis runs, fill in client name, add a note, click "Export PDF". Expected: a PDF downloads with header, metrics table, findings, notes, and footer. Layout should be clean and readable.

- [ ] **Step 3: Commit**

```bash
git add src/report/pdfGenerator.ts
git commit -m "feat: Step 5 complete — jsPDF report generation"
```

---

## Task 18: Live Camera Mode

**Files:**
- Modify: `src/ui/videoPlayer.ts`
- Modify: `src/pose/landmarker.ts`
- Modify: `src/main.ts`
- Modify: `index.html`

- [ ] **Step 1: Add camera toggle button to `index.html`**

In `#upload-controls`, add after the file input label:

```html
<button id="camera-btn">Use Camera</button>
```

- [ ] **Step 2: Update `src/ui/videoPlayer.ts` to support live camera**

Add to the end of the file:

```typescript
export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  await video.play();
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
```

- [ ] **Step 3: Update `src/pose/landmarker.ts` to support LIVE_STREAM mode**

Replace entire file:

```typescript
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_CDN, LITE_MODEL_URL } from '../config/defaults';
import type { LandmarkArray } from '../analysis/types';

export async function initLandmarker(
  modelUrl: string = LITE_MODEL_URL,
  mode: 'VIDEO' | 'LIVE_STREAM' = 'VIDEO',
  onResult?: (landmarks: LandmarkArray, timestamp: number) => void,
): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);

  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
    runningMode: mode,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    ...(mode === 'LIVE_STREAM' && onResult
      ? {
          resultListener: (result, _, timestamp) => {
            if (result.landmarks.length > 0) {
              onResult(result.landmarks[0] as LandmarkArray, timestamp);
            }
          },
        }
      : {}),
  });
}
```

- [ ] **Step 4: Add camera wiring in `src/main.ts`**

Add inside `main()`, after the `toggleOverlayBtn` handler:

```typescript
import { startCamera, stopCamera } from './ui/videoPlayer';

// Add after existing event listeners:
const cameraBtn = document.getElementById('camera-btn') as HTMLButtonElement;
let cameraActive = false;
let cameraLandmarker: import('@mediapipe/tasks-vision').PoseLandmarker | null = null;

cameraBtn.addEventListener('click', async () => {
  if (!cameraActive) {
    cameraActive = true;
    cameraBtn.textContent = 'Stop Camera';
    loop.stop();

    cameraLandmarker = await initLandmarker(
      undefined,
      'LIVE_STREAM',
      (landmarks, timestamp) => {
        overlay.drawSkeleton(landmarks, lastResults ? buildJointStatuses(lastResults) : {});
        overlay.drawAngleLabel(landmarks, LANDMARKS.LEFT_KNEE,
          `${angleBetweenThreePoints(landmarks[LANDMARKS.LEFT_HIP], landmarks[LANDMARKS.LEFT_KNEE], landmarks[LANDMARKS.LEFT_ANKLE]).toFixed(0)}°`);

        // In LIVE_STREAM we call detectForVideoAsync instead
        cameraLandmarker!.detectForVideoAsync(video, timestamp);
        updateLiveMetrics(null, detectCameraView(landmarks), 30);
      },
    );

    await startCamera(video);
    overlay.syncSize();
  } else {
    cameraActive = false;
    cameraBtn.textContent = 'Use Camera';
    stopCamera(video);
    cameraLandmarker?.close();
    cameraLandmarker = null;
  }
});
```

- [ ] **Step 5: Test manually**

```bash
npm run dev
```

Click "Use Camera" — browser asks for camera permission. Grant it. Expected: live video from camera with skeleton overlay tracking in real time. "Stop Camera" button returns to file upload mode.

- [ ] **Step 6: Commit**

```bash
git add index.html src/ui/videoPlayer.ts src/pose/landmarker.ts src/main.ts
git commit -m "feat: live camera mode with LIVE_STREAM pose estimation"
```

---

## Task 19: Frame-by-Frame Controls

**Files:**
- Modify: `index.html`
- Modify: `src/ui/videoPlayer.ts`

- [ ] **Step 1: Add speed toggle and frame step buttons to `index.html`**

After `#upload-controls`, add a new `<div id="playback-controls">`:

```html
<div id="playback-controls" style="display:none; padding: 0.5rem 1rem; background:#1a1a1a; gap:0.5rem; display:flex; align-items:center;">
  <button id="frame-back">← Frame</button>
  <button id="frame-forward">Frame →</button>
  <select id="speed-select" style="background:#2a2a2a;color:#f0f0f0;border:1px solid #444;padding:0.3rem;border-radius:6px;">
    <option value="0.25">0.25×</option>
    <option value="0.5">0.5×</option>
    <option value="1" selected>1×</option>
  </select>
</div>
```

- [ ] **Step 2: Update `src/ui/videoPlayer.ts` to wire frame controls**

Add to the end of `initVideoPlayer`:

```typescript
  // Show playback controls once a video is loaded
  video.addEventListener('loadedmetadata', () => {
    const controls = document.getElementById('playback-controls');
    if (controls) controls.style.display = 'flex';
  });

  const frameBackBtn = document.getElementById('frame-back') as HTMLButtonElement | null;
  const frameForwardBtn = document.getElementById('frame-forward') as HTMLButtonElement | null;
  const speedSelect = document.getElementById('speed-select') as HTMLSelectElement | null;

  frameBackBtn?.addEventListener('click', () => {
    video.pause();
    video.currentTime = Math.max(0, video.currentTime - 1 / 30);
  });

  frameForwardBtn?.addEventListener('click', () => {
    video.pause();
    video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30);
  });

  speedSelect?.addEventListener('change', () => {
    video.playbackRate = parseFloat(speedSelect.value);
  });
```

Also wire arrow keys in `initVideoPlayer` after the above:

```typescript
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      video.pause();
      video.currentTime = Math.max(0, video.currentTime - 1 / 30);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      video.pause();
      video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30);
    }
  });
```

- [ ] **Step 3: Test manually**

```bash
npm run dev
```

Upload a video. Expected: "← Frame" / "Frame →" buttons and speed dropdown appear. Arrow keys step forward/backward one frame. Speed selector changes playback rate.

- [ ] **Step 4: Commit**

```bash
git add index.html src/ui/videoPlayer.ts
git commit -m "feat: frame-by-frame controls and speed toggle"
```

---

## Task 20: Swap to Heavy Model + Bundle Locally

**Files:**
- Modify: `src/config/defaults.ts`
- Modify: `src/pose/landmarker.ts`
- Add: `public/models/` (model files downloaded manually)

- [ ] **Step 1: Download MediaPipe model files into `public/models/`**

```bash
mkdir -p public/models
curl -L "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task" \
  -o public/models/pose_landmarker_heavy.task
```

Expected: `public/models/pose_landmarker_heavy.task` exists (~25 MB).

Also download the WASM files:
```bash
node -e "
const fs = require('fs');
const https = require('https');
const files = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];
const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/';
fs.mkdirSync('public/wasm', { recursive: true });
files.forEach(f => {
  const dest = fs.createWriteStream('public/wasm/' + f);
  https.get(base + f, r => r.pipe(dest));
});
"
```

Expected: `public/wasm/` contains 4 files.

- [ ] **Step 2: Update `src/config/defaults.ts`**

Replace `MEDIAPIPE_CDN` and `HEAVY_MODEL_URL`:

```typescript
export const MEDIAPIPE_CDN = '/wasm';
export const HEAVY_MODEL_URL = '/models/pose_landmarker_heavy.task';
```

- [ ] **Step 3: Update `src/pose/landmarker.ts` to use heavy model by default**

Change the default parameter:

```typescript
export async function initLandmarker(
  modelUrl: string = HEAVY_MODEL_URL,   // ← was LITE_MODEL_URL
  mode: 'VIDEO' | 'LIVE_STREAM' = 'VIDEO',
  onResult?: (landmarks: LandmarkArray, timestamp: number) => void,
): Promise<PoseLandmarker> {
```

- [ ] **Step 4: Test manually**

```bash
npm run dev
```

Open browser DevTools → Network tab. Upload and play a video. Expected: model and WASM files load from `/models/` and `/wasm/` (not from CDN). Skeleton tracking should be noticeably more accurate than with the lite model.

- [ ] **Step 5: Commit**

```bash
git add public/models/ public/wasm/ src/config/defaults.ts src/pose/landmarker.ts
git commit -m "feat: swap to heavy model + bundle WASM and model files locally"
```

---

## Task 21: PWA Configuration

**Files:**
- Create: `public/manifest.json`
- Create: `public/icons/icon.svg`
- Modify: `vite.config.ts`
- Modify: `index.html`
- Modify: `package.json`

- [ ] **Step 1: Install vite-plugin-pwa**

```bash
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: Create `public/manifest.json`**

```json
{
  "name": "Runalyze",
  "short_name": "Runalyze",
  "description": "Running gait analysis — on-device, no data transmitted",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f0f0f",
  "theme_color": "#22c55e",
  "icons": [
    { "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 3: Create `public/icons/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#0f0f0f"/>
  <text x="50" y="68" font-size="60" text-anchor="middle" fill="#22c55e" font-family="system-ui">R</text>
</svg>
```

- [ ] **Step 4: Update `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm,task}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50 MB for model files
      },
      manifest: false, // using public/manifest.json
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Add manifest link to `index.html` `<head>`**

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#22c55e" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Runalyze" />
```

- [ ] **Step 6: Build and verify**

```bash
npm run build
npm run preview
```

Open `http://localhost:4173` in Chrome. Open DevTools → Application → Service Workers. Expected: service worker registered. Application → Manifest shows Runalyze manifest. "Install app" option should appear in browser.

- [ ] **Step 7: Run all tests to confirm nothing regressed**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add public/manifest.json public/icons/ vite.config.ts index.html package.json package-lock.json
git commit -m "feat: Step 6 complete — PWA manifest, service worker, offline caching"
```

---

## Final Verification

- [ ] Run `npm test` — all tests pass
- [ ] Run `npm run build` — no TypeScript errors, build succeeds
- [ ] Open `npm run preview`, upload a running video, verify full flow: skeleton → metrics → PDF export
- [ ] Install on iPad: open Safari → Share → "Add to Home Screen" → disconnect WiFi → open app — all features work offline
