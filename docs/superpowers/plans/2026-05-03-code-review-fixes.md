# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all issues found in the 2026-05-03 code review: correctness bugs (spread stack overflow, URL leaks, listener leak), type safety escapes, duplication, missing GPU fallback, and code organisation.

**Architecture:** Tasks are ordered from safest (isolated fixes) to riskiest (main.ts split). Each task is independently testable. Tasks 1–9 are correctness/quality fixes; Tasks 10–12 are structural refactors; Task 13 adds bike test coverage.

**Tech Stack:** TypeScript, Vite, Vitest, MediaPipe tasks-vision, jsPDF

---

## File Map

**Modified:**
- `shared/src/math/angles.ts` — add `findLocalMaxima`, `findLocalMinima`; fix spread calls
- `shared/package.json` — point exports to `.js`; add peerDependency
- `shared/src/pose/landmarker.ts` — remove `as any`; add CPU fallback
- `runalyzr/src/analysis/gaitDetection.ts` — import `findLocalMaxima`/`findLocalMinima` from shared
- `runalyzr/src/analysis/metrics.ts` — fix `Math.max(...midYs)` spread
- `runalyzr/src/analysis/thresholds.ts` — fix boundary overlap comment
- `runalyzr/src/analysis/setupChecks.ts` — add comment for magic `100`
- `runalyzr/src/ui/videoPlayer.ts` — fix keydown listener leak; fix URL leak
- `bike/src/analysis/pedalDetection.ts` — import `findLocalMaxima`/`findLocalMinima` from shared
- `bike/src/analysis/metrics/rear.ts` — fix `Math.max(...hipXs)` spread
- `bike/src/analysis/findings.ts` — remove `as unknown as` casts (make helper generic)
- `bike/src/ui/videoPlayer.ts` — fix URL leak
- `bike/src/main.ts` — add 5-second recording lock; extract CameraController

**Created:**
- `runalyzr/src/ui/cameraController.ts` — extracted camera state machine
- `bike/src/analysis/pedalDetection.test.ts` — bike analysis tests
- `bike/src/analysis/metrics.test.ts` — bike metrics tests
- `bike/src/analysis/findings.test.ts` — bike findings tests

---

## Task 1: Fix Math spread calls (stack overflow risk)

`Math.max(...array)` / `Math.min(...array)` will throw a RangeError on Safari when arrays exceed ~65 000 elements. At 30fps × 9000 frame cap the call is safe today but the pattern is fragile. Replace with explicit loops in all three affected locations.

**Files:**
- Modify: `shared/src/math/angles.ts:33-52`
- Modify: `runalyzr/src/analysis/metrics.ts:123-132`
- Modify: `bike/src/analysis/metrics/rear.ts:13-22`

- [ ] **Step 1: Fix `verticalDisplacement` and `lateralDisplacement` in shared**

```typescript
// shared/src/math/angles.ts  — replace both functions

export function verticalDisplacement(
  landmarkIndex: number,
  frames: FrameData[],
): number {
  const ys = frames
    .map((f) => f.landmarks[landmarkIndex]?.y ?? 0)
    .filter((y) => y > 0);
  if (ys.length < 2) return 0;
  let lo = ys[0], hi = ys[0];
  for (const y of ys) { if (y < lo) lo = y; if (y > hi) hi = y; }
  return (hi - lo) * 100;
}

export function lateralDisplacement(
  landmarkIndex: number,
  frames: FrameData[],
): number {
  const xs = frames
    .map((f) => f.landmarks[landmarkIndex]?.x ?? 0)
    .filter((x) => x > 0);
  if (xs.length < 2) return 0;
  let lo = xs[0], hi = xs[0];
  for (const x of xs) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return (hi - lo) * 100;
}
```

- [ ] **Step 2: Fix `calculateVerticalOscillation` in runalyzr metrics**

```typescript
// runalyzr/src/analysis/metrics.ts:123-132  — replace the return line

  if (midYs.length < 2) return null;
  let lo = midYs[0], hi = midYs[0];
  for (const y of midYs) { if (y < lo) lo = y; if (y > hi) hi = y; }
  return (hi - lo) * 100;
```

- [ ] **Step 3: Fix `hipRock` in bike rear metrics**

```typescript
// bike/src/analysis/metrics/rear.ts:13-22  — replace the return line

    if (hipXs.length < 2) return null;
    let lo = hipXs[0], hi = hipXs[0];
    for (const x of hipXs) { if (x < lo) lo = x; if (x > hi) hi = x; }
    return (hi - lo) * 100;
```

- [ ] **Step 4: Run existing tests to confirm no regressions**

```bash
cd runalyzr && npm test
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared/src/math/angles.ts runalyzr/src/analysis/metrics.ts bike/src/analysis/metrics/rear.ts
git commit -m "fix: replace Math.spread with explicit min/max loops to avoid Safari stack limit"
```

---

## Task 2: Fix shared/package.json exports and add peerDependency

The `package.json` exports point to `.ts` source files. Non-Vite/tsc consumers (e.g. standalone vitest runs, third-party apps) resolve via Node and fail because `.ts` is not a valid module. The compiled `.js` files already exist next to the sources. Also add the missing `peerDependency` for `@mediapipe/tasks-vision`.

**Files:**
- Modify: `shared/package.json`

- [ ] **Step 1: Update shared/package.json**

```json
{
  "name": "@runalyzr/shared",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    "./math":  "./src/math/angles.js",
    "./types": "./src/types/index.js",
    "./pose":  "./src/pose/landmarker.js",
    "./pdf":   "./src/pdf/renderer.js"
  },
  "peerDependencies": {
    "@mediapipe/tasks-vision": "*"
  }
}
```

Note: both `runalyzr` and `bike` override these exports via tsconfig `paths` + vite `alias`, so this change has no effect on their builds. It only fixes resolution for non-Vite consumers.

- [ ] **Step 2: Verify build still works**

```bash
cd runalyzr && npm run build 2>&1 | tail -5
```
Expected: `✓ built in Xs`

- [ ] **Step 3: Commit**

```bash
git add shared/package.json
git commit -m "fix: shared package exports point to .js; add mediapipe peerDependency"
```

---

## Task 3: Move findLocalMaxima/findLocalMinima to shared

`findLocalMaxima` and `findLocalMinima` are character-for-character duplicates in `gaitDetection.ts` and `pedalDetection.ts`. Move them to `@runalyzr/shared/math` and import from there in both callers.

**Files:**
- Modify: `shared/src/math/angles.ts` (add functions, export them)
- Modify: `runalyzr/src/analysis/gaitDetection.ts` (remove local defs, add import)
- Modify: `bike/src/analysis/pedalDetection.ts` (remove local defs, add import)

- [ ] **Step 1: Add `findLocalMaxima` and `findLocalMinima` to shared/src/math/angles.ts**

Append to the end of the file:

```typescript
export function findLocalMaxima(
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

export function findLocalMinima(
  values: number[],
  minDistance: number,
  minProminence: number,
): number[] {
  return findLocalMaxima(values.map((v) => -v), minDistance, minProminence);
}
```

- [ ] **Step 2: Update runalyzr/src/analysis/gaitDetection.ts**

Remove the two local `findLocalMaxima`/`findLocalMinima` function definitions (lines 4–27) and add the import:

```typescript
import type { FrameData, GaitEvent, GaitCycle, Foot } from './types';
import { LANDMARKS } from '../config/defaults';
import { findLocalMaxima, findLocalMinima } from '@runalyzr/shared/math';
```

- [ ] **Step 3: Update bike/src/analysis/pedalDetection.ts**

Remove the two local function definitions (lines 6–21) and add to the existing import:

```typescript
import { angleBetweenThreePoints, findLocalMaxima, findLocalMinima } from '@runalyzr/shared/math';
```

- [ ] **Step 4: Run tests**

```bash
cd runalyzr && npm test
```
Expected: all tests pass (gaitDetection tests still exercise the same logic via the shared import).

- [ ] **Step 5: Commit**

```bash
git add shared/src/math/angles.ts runalyzr/src/analysis/gaitDetection.ts bike/src/analysis/pedalDetection.ts
git commit -m "refactor: move findLocalMaxima/findLocalMinima to @runalyzr/shared/math"
```

---

## Task 4: Fix shared/src/pose/landmarker.ts — type safety and CPU fallback

Two issues: (1) `mode as any` should use the proper `RunningMode` type from mediapipe; (2) GPU delegate failure (common on iOS WebKit in low-power mode) causes the whole app to fail with no recovery path.

**Files:**
- Modify: `shared/src/pose/landmarker.ts`

- [ ] **Step 1: Replace landmarker.ts with type-safe version + CPU fallback**

```typescript
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { RunningMode } from '@mediapipe/tasks-vision';
import type { LandmarkArray } from '../types/index';

async function buildLandmarker(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  modelUrl: string,
  mode: RunningMode,
  delegate: 'GPU' | 'CPU',
  onResult?: (landmarks: LandmarkArray, timestamp: number) => void,
): Promise<PoseLandmarker> {
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode: mode,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    ...(mode === 'LIVE_STREAM' && onResult
      ? {
          resultListener: (result, _: unknown, timestamp: number) => {
            if (result.landmarks.length > 0) {
              onResult(result.landmarks[0] as LandmarkArray, timestamp);
            }
          },
        }
      : {}),
  });
}

export async function initLandmarker(
  modelUrl: string,
  wasmPath: string,
  mode: RunningMode = 'VIDEO',
  onResult?: (landmarks: LandmarkArray, timestamp: number) => void,
): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  try {
    return await buildLandmarker(vision, modelUrl, mode, 'GPU', onResult);
  } catch {
    return buildLandmarker(vision, modelUrl, mode, 'CPU', onResult);
  }
}
```

- [ ] **Step 2: Update runalyzr/src/pose/landmarker.ts to pass RunningMode type**

The caller's signature uses `'VIDEO' | 'LIVE_STREAM'` which is compatible with `RunningMode`. Update the import to re-export the type so callers don't need to import from mediapipe directly:

```typescript
import { initLandmarker as _initLandmarker } from '@runalyzr/shared/pose';
import type { RunningMode } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_CDN, HEAVY_MODEL_URL } from '../config/defaults';
import type { LandmarkArray } from '@runalyzr/shared/types';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';

export async function initLandmarker(
  modelUrl: string = HEAVY_MODEL_URL,
  mode: RunningMode = 'VIDEO',
  onResult?: (landmarks: LandmarkArray, timestamp: number) => void,
): Promise<PoseLandmarker> {
  return _initLandmarker(modelUrl, MEDIAPIPE_CDN, mode, onResult);
}
```

- [ ] **Step 3: Verify build**

```bash
cd runalyzr && npm run build 2>&1 | tail -5
```
Expected: `✓ built in Xs` — no type errors.

- [ ] **Step 4: Commit**

```bash
git add shared/src/pose/landmarker.ts runalyzr/src/pose/landmarker.ts
git commit -m "fix: remove as-any from landmarker runningMode; add GPU→CPU fallback"
```

---

## Task 5: Fix bike/src/analysis/findings.ts type casts

`generateSagittalFindings`, `generateRearFindings`, and `generateFrontFindings` all use `metrics as unknown as Record<string, MetricResult | null>`. The fix is to make `findingsFromMetricGroup` generic so the callers can pass typed structs directly.

**Files:**
- Modify: `bike/src/analysis/findings.ts:71-101`

- [ ] **Step 1: Make findingsFromMetricGroup generic**

Replace the existing `findingsFromMetricGroup` and the three exported functions:

```typescript
function findingsFromMetricGroup<T extends Record<string, MetricResult | null>>(
  metrics: T,
): Finding[] {
  const findings: Finding[] = [];
  for (const [key, result] of Object.entries(metrics) as [string, MetricResult | null][]) {
    if (!result || result.status === 'green' || result.status === 'unknown') continue;
    const template = TEMPLATES[key];
    if (!template) continue;
    findings.push({
      metric: key,
      status: result.status as 'amber' | 'red',
      text: template[result.status as 'red' | 'amber'].replace('{value}', result.value.toFixed(1)),
    });
  }
  return findings;
}

export function generateSagittalFindings(metrics: SagittalMetrics): Finding[] {
  return findingsFromMetricGroup(metrics).sort((a, b) =>
    (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));
}

export function generateRearFindings(metrics: RearMetrics): Finding[] {
  return findingsFromMetricGroup(metrics).sort((a, b) =>
    (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));
}

export function generateFrontFindings(metrics: FrontMetrics): Finding[] {
  return findingsFromMetricGroup(metrics).sort((a, b) =>
    (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));
}
```

- [ ] **Step 2: Verify build (tsc catches any remaining type errors)**

```bash
cd bike && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add bike/src/analysis/findings.ts
git commit -m "fix: remove as-unknown-as casts in bike findings by making helper generic"
```

---

## Task 6: Fix videoPlayer.ts — keydown listener leak and URL leak

Two issues in `runalyzr/src/ui/videoPlayer.ts`:
1. `document.addEventListener('keydown', ...)` is never removed — leaks on re-init.
2. `URL.createObjectURL(file)` is never revoked — leaks memory on every file change.

`bike/src/ui/videoPlayer.ts` has the URL leak only (no keydown listener).

**Files:**
- Modify: `runalyzr/src/ui/videoPlayer.ts`
- Modify: `bike/src/ui/videoPlayer.ts`

- [ ] **Step 1: Fix runalyzr/src/ui/videoPlayer.ts**

Replace the entire `initVideoPlayer` function body with a version that (a) stores and revokes the previous object URL and (b) returns a cleanup function for the keydown listener:

```typescript
export function initVideoPlayer(
  video: HTMLVideoElement,
  fileInput: HTMLInputElement,
  callbacks: VideoPlayerCallbacks,
): () => void {
  let currentObjectUrl: string | null = null;

  fileInput.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    video.src = currentObjectUrl;
    video.load();
  });

  video.addEventListener('play', callbacks.onPlay);
  video.addEventListener('pause', callbacks.onPause);
  video.addEventListener('seeked', callbacks.onSeeked);
  video.addEventListener('loadedmetadata', callbacks.onLoadedMetadata);

  const playPauseBtn    = document.getElementById('play-pause')    as HTMLButtonElement | null;
  const frameBackBtn    = document.getElementById('frame-back')    as HTMLButtonElement | null;
  const frameForwardBtn = document.getElementById('frame-forward') as HTMLButtonElement | null;
  const speedSelect     = document.getElementById('speed-select')  as HTMLSelectElement | null;

  function syncPlayPause(): void {
    if (playPauseBtn) playPauseBtn.textContent = video.paused ? '▶' : '⏸';
  }

  playPauseBtn?.addEventListener('click', () => {
    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      video.play();
    } else {
      video.pause();
    }
  });

  video.addEventListener('play', syncPlayPause);
  video.addEventListener('pause', syncPlayPause);
  video.addEventListener('ended', syncPlayPause);

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

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      video.pause();
      video.currentTime = Math.max(0, video.currentTime - 1 / 30);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      video.pause();
      video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30);
    }
  }
  document.addEventListener('keydown', onKeydown);

  return () => document.removeEventListener('keydown', onKeydown);
}
```

Note: the return type changed from `void` to `() => void`. Update the call site in `runalyzr/src/main.ts` — it currently ignores the return value, so the call site does not need to change unless the app is ever re-initialised (which it isn't today). The change is backward-compatible.

- [ ] **Step 2: Fix bike/src/ui/videoPlayer.ts**

Replace the `fileInput` change handler:

```typescript
export function initVideoPlayer(
  video: HTMLVideoElement,
  fileInput: HTMLInputElement,
  callbacks: VideoPlayerCallbacks,
): void {
  let currentObjectUrl: string | null = null;

  video.addEventListener('loadedmetadata', () => callbacks.onLoadedMetadata?.());
  video.addEventListener('play',           () => callbacks.onPlay?.());
  video.addEventListener('pause',          () => callbacks.onPause?.());
  video.addEventListener('seeked',         () => callbacks.onSeeked?.());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    video.src = currentObjectUrl;
    video.load();
  });
}
```

- [ ] **Step 3: Verify build**

```bash
cd runalyzr && npm run build 2>&1 | tail -5
```
Expected: `✓ built in Xs`

- [ ] **Step 4: Commit**

```bash
git add runalyzr/src/ui/videoPlayer.ts bike/src/ui/videoPlayer.ts
git commit -m "fix: revoke object URLs on file change; make keydown listener removable"
```

---

## Task 7: Add 5-second recording lock to bike/src/main.ts

`runalyzr` prevents users from stopping a recording before 5 seconds (matching the 30-frame minimum). `bike` has no such lock — the stop button is immediately active, so recordings stopped too early always produce a "not enough footage" error. Add parity.

**Files:**
- Modify: `bike/src/main.ts:416-441` (the `rideRecordBtn` click handler)

- [ ] **Step 1: Add lock timer to the recording start block**

Find the `rideRecordBtn.addEventListener('click', ...)` block. Replace the start branch:

```typescript
  rideRecordBtn.addEventListener('click', () => {
    if (cameraState !== 'recording') {
      cameraState = 'recording';
      cameraFrames.length = 0;
      recordedChunks.length = 0;
      rideRecordBtn.classList.add('recording');
      rideRecordBtn.textContent = '⏹';
      rideRecordBtn.disabled = true;

      // Enforce a 5-second minimum so the 30-frame floor is never hit
      let lockSecondsLeft = 5;
      const lockInterval = window.setInterval(() => {
        lockSecondsLeft--;
        if (lockSecondsLeft <= 0) {
          clearInterval(lockInterval);
          rideRecordBtn.disabled = false;
        }
      }, 1000);

      if (typeof MediaRecorder !== 'undefined' && rideVideo.srcObject) {
        const mimeType = ['video/webm;codecs=vp9', 'video/webm']
          .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
        try {
          mediaRecorder = new MediaRecorder(rideVideo.srcObject as MediaStream,
            mimeType ? { mimeType } : {});
          mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
          mediaRecorder.start(100);
        } catch { mediaRecorder = null; }
      }
    } else {
      cameraState = 'closed';
      rideRecordBtn.classList.remove('recording');
      rideRecordBtn.textContent = '⏺';
      rideRecordBtn.disabled = false;
      if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
      mediaRecorder = null;
      runRideAnalysis([...cameraFrames]);
    }
  });
```

- [ ] **Step 2: Verify build**

```bash
cd bike && npx tsc --noEmit 2>&1 | head -10
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add bike/src/main.ts
git commit -m "fix: add 5-second recording lock to bike ride mode"
```

---

## Task 8: Fix threshold boundary overlap and add magic-100 comment

Two minor clarity issues: (1) runalyzr thresholds have overlapping `amber`/`green` bounds at the boundary value (e.g. `155°` is in both `green: [155, 170]` and `amber: [145, 155]`); currently harmless because `green` is checked first, but confusing. Fix by making the amber upper bound exclusive (change `155` to `154`). (2) `evaluateVideoQuality` passes `consecutiveFrames = 100` to `evaluateSetupChecks` — looks like a magic number; add a comment.

**Files:**
- Modify: `runalyzr/src/analysis/thresholds.ts`
- Modify: `runalyzr/src/analysis/setupChecks.ts:181`

- [ ] **Step 1: Fix amber upper bounds in thresholds.ts**

For every metric where `amber[1] === green[0]` (overlap), change amber upper bound to `green[0] - 1` (for integer-unit metrics) or keep as-is with a comment. For degree/cm metrics the values are continuous — a half-open interval `[lo, hi)` is more correct. The simplest approach: add a comment to the evaluation logic explaining the overlap is intentional and green wins.

Actually the cleanest fix is to document the behaviour in `evaluateMetric`:

```typescript
export function evaluateMetric(
  value: number,
  key: keyof typeof THRESHOLDS,
): MetricStatus {
  const t = THRESHOLDS[key];
  if (!t) return 'unknown';

  // Green is checked first; amber ranges that touch the green boundary are
  // half-open [amber.lo, green.lo) — the boundary value itself is green.
  if (value >= t.green[0] && value <= t.green[1]) return 'green';
  if (value >= t.amber[0] && value < t.green[0]) return 'amber';
  if (value > t.green[1] && value <= t.amber[1]) return 'amber';

  if (t.direction === 'higher_is_worse' && value < t.green[0]) return 'green';
  if (t.direction === 'lower_is_worse'  && value > t.green[1]) return 'green';

  return 'red';
}
```

This replaces the single `value >= t.amber[0] && value <= t.amber[1]` check with explicit lower and upper amber bands, eliminating the overlap ambiguity.

- [ ] **Step 2: Run thresholds tests to ensure no regressions**

```bash
cd runalyzr && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×)"
```
Expected: all green.

- [ ] **Step 3: Add comment for magic 100 in setupChecks.ts**

In `runalyzr/src/analysis/setupChecks.ts`, line 181:

```typescript
    // Pass 100 consecutive frames to force stable=true — we're evaluating a completed recording.
    const checks = evaluateSetupChecks(frame.landmarks, 100, selectedView);
```

- [ ] **Step 4: Commit**

```bash
git add runalyzr/src/analysis/thresholds.ts runalyzr/src/analysis/setupChecks.ts
git commit -m "fix: clarify amber/green boundary logic; document magic-100 in evaluateVideoQuality"
```

---

## Task 9: Add bike analysis tests

`bike/src` has zero test coverage. `pedalDetection`, the three metric calculators, and `findings` all have non-trivial logic. Add a focused test file for each using the same patterns as `runalyzr/src/analysis/*.test.ts`.

**Files:**
- Create: `bike/src/analysis/pedalDetection.test.ts`
- Create: `bike/src/analysis/metrics.test.ts`
- Create: `bike/src/analysis/findings.test.ts`

**Test runner:** `cd bike && npm test` (uses `vitest` via `vite.config.ts`)

- [ ] **Step 1: Create bike/src/analysis/pedalDetection.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { detectPedalEvents, segmentPedalCycles, calculateCadence } from './pedalDetection';
import type { FrameData } from '@runalyzr/shared/types';
import { LANDMARKS } from '../config/defaults';

const L = LANDMARKS;

function makeFrame(
  kneeAngle: number,
  timestamp: number,
): FrameData {
  // Simulate a knee angle by placing hip, knee, ankle so that
  // angleBetweenThreePoints(hip, knee, ankle) ≈ kneeAngle.
  // Simplest: hip at (0,0), knee at (0,1), ankle such that angle = kneeAngle.
  const rad = (kneeAngle * Math.PI) / 180;
  const lms = Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  // world landmarks only matter for pedalDetection
  const wlms = Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  // hip at origin, knee below, ankle at angle
  wlms[L.LEFT_HIP]   = { x: 0,           y: 0, z: 0, visibility: 1 };
  wlms[L.LEFT_KNEE]  = { x: 0,           y: 1, z: 0, visibility: 1 };
  wlms[L.LEFT_ANKLE] = { x: Math.sin(Math.PI - rad), y: 1 + Math.cos(Math.PI - rad), z: 0, visibility: 1 };
  wlms[L.RIGHT_HIP]   = { x: 0,           y: 0, z: 0, visibility: 1 };
  wlms[L.RIGHT_KNEE]  = { x: 0,           y: 1, z: 0, visibility: 1 };
  wlms[L.RIGHT_ANKLE] = { x: Math.sin(Math.PI - rad), y: 1 + Math.cos(Math.PI - rad), z: 0, visibility: 1 };
  return { timestamp, landmarks: lms as any, worldLandmarks: wlms as any };
}

describe('detectPedalEvents', () => {
  it('detects BDC events at knee angle peaks', () => {
    // Simulate one revolution: angle rises to 160° (BDC), falls to 100° (TDC), rises again
    const angles = [100, 120, 140, 155, 160, 155, 140, 120, 100, 120, 140, 160];
    const frames = angles.map((a, i) => makeFrame(a, i * 33));
    const events = detectPedalEvents(frames, 30);
    const bdcs = events.filter((e) => e.phase === 'bdc');
    expect(bdcs.length).toBeGreaterThanOrEqual(1);
  });

  it('detects TDC events at knee angle troughs', () => {
    const angles = [100, 120, 140, 160, 140, 120, 100, 120, 140, 160];
    const frames = angles.map((a, i) => makeFrame(a, i * 33));
    const events = detectPedalEvents(frames, 30);
    const tdcs = events.filter((e) => e.phase === 'tdc');
    expect(tdcs.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for flat (no movement) frames', () => {
    const frames = Array(20).fill(null).map((_, i) => makeFrame(140, i * 33));
    const events = detectPedalEvents(frames, 30);
    expect(events).toHaveLength(0);
  });
});

describe('calculateCadence', () => {
  it('computes rpm from BDC event count', () => {
    // 4 BDC events in 2 sides over 2 seconds = 2 full revolutions / 2s = 60rpm
    const events = [
      { phase: 'bdc' as const, side: 'left' as const,  frameIndex: 0,  timestamp: 0    },
      { phase: 'bdc' as const, side: 'right' as const, frameIndex: 30, timestamp: 1000 },
      { phase: 'bdc' as const, side: 'left' as const,  frameIndex: 60, timestamp: 2000 },
      { phase: 'bdc' as const, side: 'right' as const, frameIndex: 90, timestamp: 3000 },
    ];
    // bdcCount=4, /2 sides = 2 full revolutions, /2s duration = 1 rev/s = 60rpm
    expect(calculateCadence(events, 2)).toBe(60);
  });

  it('returns 0 for zero duration', () => {
    expect(calculateCadence([], 0)).toBe(0);
  });
});

describe('segmentPedalCycles', () => {
  it('pairs consecutive BDC events into cycles', () => {
    const events = [
      { phase: 'bdc' as const, side: 'left' as const, frameIndex: 0,  timestamp: 0    },
      { phase: 'bdc' as const, side: 'left' as const, frameIndex: 30, timestamp: 1000 },
    ];
    const cycles = segmentPedalCycles(events);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].startFrame).toBe(0);
    expect(cycles[0].endFrame).toBe(30);
  });
});
```

- [ ] **Step 2: Run the new test**

```bash
cd bike && npm test 2>&1 | tail -20
```
Expected: test suite runs (some may pass, any failures indicate real bugs — fix them before proceeding).

- [ ] **Step 3: Create bike/src/analysis/metrics.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateRearMetrics } from './metrics/rear';
import { calculateFrontMetrics } from './metrics/front';
import type { FrameData } from '@runalyzr/shared/types';
import type { PedalEvent } from './types';
import { LANDMARKS } from '../config/defaults';

const L = LANDMARKS;

function lm(x: number, y: number, z = 0) {
  return { x, y, z, visibility: 1 };
}

function makeFrame(overrides: Partial<Record<number, ReturnType<typeof lm>>> = {}): FrameData {
  const base = Array(33).fill(null).map(() => lm(0.5, 0.5));
  for (const [idx, val] of Object.entries(overrides)) {
    base[Number(idx)] = val!;
  }
  return { timestamp: 0, landmarks: base as any, worldLandmarks: base as any };
}

describe('calculateRearMetrics — hipRock', () => {
  it('returns null when fewer than 2 valid frames', () => {
    const frames = [makeFrame()];
    const result = calculateRearMetrics(frames, []);
    // hipRock requires 2 frames with left and right hip
    // single frame → null
    expect(result.hipRock).toBeNull();
  });

  it('computes hip rock from lateral hip displacement', () => {
    // hipMidX oscillates between 0.4 and 0.6 → range = 0.2 * 100 = 20cm
    const frames = [
      makeFrame({ [L.LEFT_HIP]: lm(0.35, 0.5), [L.RIGHT_HIP]: lm(0.45, 0.5) }), // midX=0.40
      makeFrame({ [L.LEFT_HIP]: lm(0.55, 0.5), [L.RIGHT_HIP]: lm(0.65, 0.5) }), // midX=0.60
    ];
    const result = calculateRearMetrics(frames, []);
    expect(result.hipRock).not.toBeNull();
    expect(result.hipRock!.value).toBeCloseTo(20, 0);
  });
});

describe('calculateFrontMetrics — kneeSymmetry', () => {
  it('returns null when no BDC events', () => {
    const frames = [makeFrame(), makeFrame()];
    const result = calculateFrontMetrics(frames, []);
    expect(result.kneeSymmetry).toBeNull();
  });

  it('reports near-zero symmetry when knees are aligned', () => {
    const frame = makeFrame({
      [L.LEFT_KNEE]:  lm(0.45, 0.6),
      [L.RIGHT_KNEE]: lm(0.55, 0.6),
      [L.LEFT_HIP]:   lm(0.45, 0.4),
      [L.RIGHT_HIP]:  lm(0.55, 0.4),
    });
    const events: PedalEvent[] = [
      { phase: 'bdc', side: 'left',  frameIndex: 0, timestamp: 0 },
      { phase: 'bdc', side: 'right', frameIndex: 0, timestamp: 0 },
    ];
    const frames = [frame];
    const result = calculateFrontMetrics(frames, events);
    // Symmetric knees → kneeSymmetry value near 0
    if (result.kneeSymmetry) {
      expect(result.kneeSymmetry.value).toBeLessThan(2);
    }
  });
});
```

- [ ] **Step 4: Create bike/src/analysis/findings.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { generateRearFindings, generateSagittalFindings } from './findings';
import type { RearMetrics, SagittalMetrics } from './types';

function makeRearMetrics(overrides: Partial<RearMetrics> = {}): RearMetrics {
  return {
    hipRock:          null,
    pelvicObliquity:  null,
    kneeVarusValgus:  null,
    heelAlignment:    null,
    ...overrides,
  };
}

describe('generateRearFindings', () => {
  it('returns empty array when all metrics are null', () => {
    expect(generateRearFindings(makeRearMetrics())).toHaveLength(0);
  });

  it('returns empty array when all metrics are green', () => {
    const metrics = makeRearMetrics({
      hipRock: { value: 1, status: 'green', unit: ' cm' },
    });
    expect(generateRearFindings(metrics)).toHaveLength(0);
  });

  it('generates a finding for a red hipRock metric', () => {
    const metrics = makeRearMetrics({
      hipRock: { value: 5, status: 'red', unit: ' cm' },
    });
    const findings = generateRearFindings(metrics);
    expect(findings).toHaveLength(1);
    expect(findings[0].metric).toBe('hipRock');
    expect(findings[0].status).toBe('red');
    expect(findings[0].text).toContain('5.0');
  });

  it('sorts red findings before amber findings', () => {
    const metrics = makeRearMetrics({
      hipRock:         { value: 5,   status: 'red',   unit: ' cm' },
      pelvicObliquity: { value: 1.5, status: 'amber', unit: ' cm' },
    });
    const findings = generateRearFindings(metrics);
    expect(findings[0].status).toBe('red');
    expect(findings[1].status).toBe('amber');
  });
});

describe('generateSagittalFindings', () => {
  function makeSagittal(overrides: Partial<SagittalMetrics> = {}): SagittalMetrics {
    return {
      kneeExtensionBDC: null, kneeFlexionTDC: null, hipAngleTDC: null,
      hipVerticalOscillation: null, torsoAngle: null, pelvicTilt: null,
      elbowAngle: null, wristAngle: null, ankleAnkling: null, cadence: null,
      ...overrides,
    };
  }

  it('generates finding text with interpolated value', () => {
    const metrics = makeSagittal({
      cadence: { value: 55, status: 'red', unit: ' rpm' },
    });
    const findings = generateSagittalFindings(metrics);
    expect(findings[0].text).toContain('55.0');
  });
});
```

- [ ] **Step 5: Run all bike tests**

```bash
cd bike && npm test 2>&1 | tail -30
```
Expected: test suites run; investigate and fix any failures before proceeding.

- [ ] **Step 6: Commit**

```bash
git add bike/src/analysis/pedalDetection.test.ts bike/src/analysis/metrics.test.ts bike/src/analysis/findings.test.ts
git commit -m "test: add bike analysis test suite (pedalDetection, metrics, findings)"
```

---

## Task 10: Extract CameraController from runalyzr/src/main.ts

`runalyzr/src/main.ts` is 625 lines. The camera state machine (`openCamera`, `closeCamera`, `startRecording`, `stopRecording`, the `cameraLoop` IIFE, setup checks, composite recording) is ~250 lines of closely coupled state that can be isolated. Extract it into `runalyzr/src/ui/cameraController.ts`.

**Files:**
- Create: `runalyzr/src/ui/cameraController.ts`
- Modify: `runalyzr/src/main.ts` (remove extracted code, import controller)

- [ ] **Step 1: Create runalyzr/src/ui/cameraController.ts**

```typescript
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { FrameData, CameraView, AnalysisResults } from '../analysis/types';
import { LANDMARKS } from '../config/defaults';
import { detectCameraView } from '../pose/processing';
import { evaluateSetupChecks } from '../analysis/setupChecks';
import { angleBetweenThreePoints } from '../analysis/angles';
import { startCamera, stopCamera } from './videoPlayer';
import type { initOverlay } from './overlay';

type OverlayHandle = ReturnType<typeof initOverlay>;

export interface CameraControllerDeps {
  video: HTMLVideoElement;
  overlay: OverlayHandle;
  landmarker: PoseLandmarker;
  liveMetricsEl: HTMLElement;
  setupOverlayEl: HTMLElement;
  setupPanelEl: HTMLElement;
  videoContainerEl: HTMLElement;
  videoTopRightEl: HTMLElement;
  recordBtn: HTMLButtonElement;
  viewModeBtn: HTMLButtonElement;
  recIndicator: HTMLElement;
  recTimerEl: HTMLElement;
  shareVideoBtn: HTMLButtonElement;
  setupToggleEl: HTMLElement;
  setupToggleIcon: HTMLElement;
  onAnalysisReady: (frames: FrameData[], view: CameraView | null) => void;
  onBlobUrl: (url: string | null) => void;
  getLastResults: () => AnalysisResults | null;
  updateLiveMetrics: (cadence: number | null, view: CameraView, fps: number) => void;
}

function applyCheck(
  id: string,
  pass: boolean,
  passText: string,
  failText: string,
  pending = false,
): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = pass ? passText : failText;
  el.className = pending ? 'check-pending' : (pass ? 'check-pass' : 'check-fail');
}

export function initCameraController(deps: CameraControllerDeps) {
  const {
    video, overlay, landmarker,
    liveMetricsEl, setupOverlayEl, setupPanelEl, videoContainerEl, videoTopRightEl,
    recordBtn, viewModeBtn, recIndicator, recTimerEl, shareVideoBtn,
    setupToggleEl, setupToggleIcon,
    onAnalysisReady, onBlobUrl, getLastResults, updateLiveMetrics,
  } = deps;

  let cameraState: 'closed' | 'setup' | 'recording' = 'closed';
  let cameraRunning = false;
  let cameraRafId = 0;
  let setupConsecutiveFrames = 0;
  let lastLandmarkTime = 0;
  let recTimerInterval = 0;
  let recStartTime = 0;
  let selectedView: CameraView | null = null;
  let recordedBlobUrl: string | null = null;
  let compositeCanvas: HTMLCanvasElement | null = null;
  let compositeCtx: CanvasRenderingContext2D | null = null;
  let recordingHasOverlay = false;
  let mediaRecorder: MediaRecorder | null = null;
  const recordedChunks: Blob[] = [];
  const cameraFrames: FrameData[] = [];

  const L = LANDMARKS;

  function setPillColor(color: 'green' | 'red' | 'grey'): void {
    setupToggleEl.classList.remove('pill-red', 'pill-green');
    if (color !== 'grey') setupToggleEl.classList.add(`pill-${color}`);
    setupToggleIcon.textContent = color === 'green' ? '✓' : color === 'red' ? '✗' : '⚠';
  }

  function showSetupPanel(): void {
    liveMetricsEl.style.display = 'none';
    setupOverlayEl.classList.add('visible');
    setupPanelEl.classList.add('open');
    videoContainerEl.classList.remove('frame-red', 'frame-amber', 'frame-green');
    videoContainerEl.classList.add('frame-grey');
    setPillColor('grey');
  }

  function showLivePanel(): void {
    liveMetricsEl.style.display = 'flex';
  }

  function refreshSetupUI(checks: ReturnType<typeof evaluateSetupChecks>): void {
    const isSag = selectedView === 'sagittal';
    const notReady = (dep: boolean) => !checks.viewSelected || !checks.stable || !dep;

    if (checks.viewSelected) {
      const label = isSag ? 'Side view' : 'Front view';
      const mismatch = checks.detectedView !== selectedView && checks.detectedView !== 'unknown';
      const suffix = mismatch
        ? ` (camera sees ${checks.detectedView === 'sagittal' ? 'side' : 'front'})`
        : '';
      applyCheck('check-view', !mismatch, `${label} selected${suffix}`, `${label} selected${suffix}`);
    } else {
      applyCheck('check-view', false, '', 'Choose view (tap button above)');
    }
    applyCheck('check-stable',      checks.stable,         'Pose detected',                            'Detecting pose…',               !checks.stable);
    applyCheck('check-orientation', checks.orientation,    isSag ? 'Sideways to camera' : 'Facing camera',        isSag ? 'Turn sideways' : 'Face the camera', notReady(true));
    applyCheck('check-alignment',   checks.jointAlignment, isSag ? 'Hip–knee–ankle aligned' : 'Bilateral symmetry OK', isSag ? 'Rotate more' : 'Off-centre',    notReady(checks.orientation));
    applyCheck('check-body',        checks.bodyInFrame,    isSag ? 'Full body in frame (side)' : 'Full body in frame (front)', 'Full body not visible',            notReady(checks.orientation));
    applyCheck('check-distance',    checks.goodDistance,   isSag ? 'Good distance' : 'Good width coverage',      isSag ? 'Adjust distance' : 'Adjust distance', notReady(checks.orientation));
    applyCheck('check-camera-pos',  checks.cameraPosition, isSag ? 'Camera at hip height' : 'Centred & level',   isSag ? 'Adjust camera height' : 'Centre yourself', notReady(checks.orientation && checks.bodyInFrame && checks.goodDistance));
    applyCheck('check-lighting',    checks.goodLighting,   'Adequate lighting',                        'Improve lighting');

    const hintEl = document.getElementById('setup-hint');
    if (hintEl) hintEl.textContent = checks.hint;
  }

  function updateViewModeBtn(): void {
    if (selectedView === 'sagittal') {
      viewModeBtn.textContent = 'Side view';
      viewModeBtn.classList.remove('view-front', 'view-unset');
      viewModeBtn.classList.add('view-side');
    } else if (selectedView === 'frontal') {
      viewModeBtn.textContent = 'Front view';
      viewModeBtn.classList.remove('view-side', 'view-unset');
      viewModeBtn.classList.add('view-front');
    } else {
      viewModeBtn.textContent = '⚠ Choose view';
      viewModeBtn.classList.remove('view-side', 'view-front');
      viewModeBtn.classList.add('view-unset');
    }
  }

  viewModeBtn.addEventListener('click', () => {
    if (cameraState !== 'setup') return;
    selectedView = selectedView === null ? 'sagittal'
      : selectedView === 'sagittal' ? 'frontal'
        : null;
    updateViewModeBtn();
    setupConsecutiveFrames = Math.max(0, setupConsecutiveFrames - 1);
  });

  recordBtn.addEventListener('click', () => {
    if (cameraState === 'setup') startRecording();
    else if (cameraState === 'recording') stopRecording();
  });

  shareVideoBtn.addEventListener('click', async () => {
    if (!recordedBlobUrl) return;
    try {
      const blob = await fetch(recordedBlobUrl).then((r) => r.blob());
      const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
      const file = new File([blob], `runalyzr-recording.${ext}`, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Runalyzr Recording' });
      } else {
        const a = document.createElement('a');
        a.href = recordedBlobUrl;
        a.download = `runalyzr-recording.${ext}`;
        a.click();
      }
    } catch { /* share cancelled or blob revoked */ }
  });

  function startRecording(): void {
    cameraState = 'recording';
    cameraFrames.length = 0;
    recordedChunks.length = 0;
    recordBtn.classList.remove('ready');
    recordBtn.classList.add('recording');
    recordBtn.disabled = true;
    recordBtn.setAttribute('aria-label', 'Stop recording');
    viewModeBtn.style.display = 'none';
    recIndicator.style.display = 'flex';
    showLivePanel();
    recStartTime = performance.now();

    let lockSecondsLeft = 5;
    recTimerEl.textContent = `Rec ${lockSecondsLeft}s more…`;
    recTimerInterval = window.setInterval(() => {
      const elapsed = Math.floor((performance.now() - recStartTime) / 1000);
      if (lockSecondsLeft > 0) {
        lockSecondsLeft--;
        if (lockSecondsLeft > 0) {
          recTimerEl.textContent = `Rec ${lockSecondsLeft}s more…`;
        } else {
          recordBtn.disabled = false;
          recTimerEl.textContent = '0:05';
        }
      } else {
        recTimerEl.textContent =
          `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
      }
    }, 1000);

    recordingHasOverlay = false;
    if (typeof MediaRecorder !== 'undefined') {
      const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const canCaptureStream = typeof document.createElement('canvas').captureStream === 'function';
      let stream: MediaStream | null = null;
      if (canCaptureStream) {
        compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = video.videoWidth || 1280;
        compositeCanvas.height = video.videoHeight || 720;
        compositeCtx = compositeCanvas.getContext('2d');
        stream = compositeCanvas.captureStream(30);
      } else {
        stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
      }
      try {
        if (stream) {
          mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
          mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
          mediaRecorder.start(100);
          recordingHasOverlay = canCaptureStream;
        }
      } catch {
        mediaRecorder = null;
        compositeCanvas = null;
        compositeCtx = null;
      }
    }

    recIndicator.querySelector('.no-overlay-hint')?.remove();
    if (!recordingHasOverlay) {
      const hint = document.createElement('span');
      hint.className = 'no-overlay-hint';
      hint.textContent = '· no overlay';
      hint.style.cssText = 'font-size:0.65rem;opacity:0.7;margin-left:0.25rem;';
      recIndicator.appendChild(hint);
    }
  }

  function stopRecording(): void {
    const viewForAnalysis = selectedView;
    const capturedFrames = [...cameraFrames];
    cameraState = 'closed';
    cameraRunning = false;
    cancelAnimationFrame(cameraRafId);
    clearInterval(recTimerInterval);
    recIndicator.style.display = 'none';
    recordBtn.classList.remove('recording', 'ready');
    recordBtn.disabled = false;
    viewModeBtn.style.display = 'none';

    onAnalysisReady(capturedFrames, viewForAnalysis);
    if (window.innerWidth < 768) {
      document.querySelectorAll('.tab').forEach((t) =>
        (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.tab === 'results'));
      document.querySelectorAll('.tab-panel').forEach((p) =>
        (p as HTMLElement).classList.toggle('active', (p as HTMLElement).dataset.tab === 'results'));
    }

    const finalize = (blobUrl: string | null) => {
      compositeCanvas = null;
      compositeCtx = null;
      stopCamera(video);
      if (blobUrl) {
        if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
        recordedBlobUrl = blobUrl;
        video.src = blobUrl;
        video.load();
        shareVideoBtn.style.display = 'flex';
        // Switch to video file UI
        videoTopRightEl.style.display = 'flex';
        document.getElementById('camera-idle')!.style.display = 'none';
        videoContainerEl.style.display = 'block';
        document.getElementById('record-btn')!.style.display = 'none';
        document.getElementById('playback-controls')!.style.display = 'flex';
      } else {
        onBlobUrl(null);
      }
    };

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = () => {
        const blob = recordedChunks.length > 0
          ? new Blob(recordedChunks, { type: recordedChunks[0]?.type || 'video/webm' })
          : null;
        finalize(blob ? URL.createObjectURL(blob) : null);
      };
      mediaRecorder.stop();
    } else {
      finalize(null);
    }
    mediaRecorder = null;
  }

  function cameraLoop(): void {
    if (!cameraRunning) return;
    if (video.readyState >= 2) {
      const result = landmarker.detectForVideo(video, performance.now());
      if (result.landmarks.length > 0 && result.worldLandmarks.length > 0) {
        const lms = result.landmarks[0];
        lastLandmarkTime = performance.now();
        const lastResults = getLastResults();
        const statuses: Record<number, string> = {};
        if (lastResults) {
          const set = (indices: number[], status: string) =>
            indices.forEach((i) => { statuses[i] = status; });
          if (lastResults.kneeFlexionAtContact)
            set([L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
              lastResults.kneeFlexionAtContact.status);
          if (lastResults.pelvicDrop)
            set([L.LEFT_HIP, L.RIGHT_HIP], lastResults.pelvicDrop.status);
          if (lastResults.trunkLateralLean)
            set([L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
              lastResults.trunkLateralLean.status);
        }
        overlay.drawSkeleton(lms, statuses);

        if (cameraState === 'setup') {
          setupConsecutiveFrames++;
          const checks = evaluateSetupChecks(lms, setupConsecutiveFrames, selectedView);
          refreshSetupUI(checks);
          recordBtn.disabled = !checks.allPassed;
          recordBtn.classList.toggle('ready', checks.allPassed);
          const hasRed = !!document.querySelector('#setup-checklist .check-fail');
          const color = checks.allPassed ? 'green' : hasRed ? 'red' : 'grey';
          videoContainerEl.classList.remove('frame-grey', 'frame-red', 'frame-amber', 'frame-green');
          videoContainerEl.classList.add(`frame-${color}`);
          setPillColor(color as 'green' | 'red' | 'grey');
          if (checks.allPassed) showLivePanel();
          else setupOverlayEl.classList.add('visible');

          const leftKnee = angleBetweenThreePoints(
            lms[L.LEFT_HIP], lms[L.LEFT_KNEE], lms[L.LEFT_ANKLE]);
          const rightKnee = angleBetweenThreePoints(
            lms[L.RIGHT_HIP], lms[L.RIGHT_KNEE], lms[L.RIGHT_ANKLE]);
          overlay.drawAngleLabel(lms, L.LEFT_KNEE,  `${leftKnee.toFixed(0)}°`);
          overlay.drawAngleLabel(lms, L.RIGHT_KNEE, `${rightKnee.toFixed(0)}°`);
          updateLiveMetrics(null, detectCameraView(lms), 0);
        } else if (cameraState === 'recording') {
          if (cameraFrames.length < 9000) {
            cameraFrames.push({
              landmarks:      lms,
              worldLandmarks: result.worldLandmarks[0],
              timestamp:      performance.now(),
            });
          }
          if (compositeCtx && compositeCanvas) {
            compositeCtx.drawImage(video, 0, 0, compositeCanvas.width, compositeCanvas.height);
            compositeCtx.drawImage(
              document.getElementById('overlay') as HTMLCanvasElement,
              0, 0, compositeCanvas.width, compositeCanvas.height,
            );
          }
          updateLiveMetrics(null, detectCameraView(lms), 30);
        }
      } else if (cameraState === 'setup' && performance.now() - lastLandmarkTime > 500) {
        setupConsecutiveFrames = 0;
        videoContainerEl.classList.remove('frame-red', 'frame-amber', 'frame-green');
        videoContainerEl.classList.add('frame-grey');
        setPillColor('grey');
        setupOverlayEl.classList.add('visible');
      }
    }
    cameraRafId = requestAnimationFrame(cameraLoop);
  }

  return {
    async open(): Promise<void> {
      cameraState = 'setup';
      selectedView = null;
      if (recordedBlobUrl) {
        URL.revokeObjectURL(recordedBlobUrl);
        recordedBlobUrl = null;
        video.removeAttribute('src');
      }
      shareVideoBtn.style.display = 'none';
      await startCamera(video);
      overlay.syncSize();
      video.addEventListener('resize', () => overlay.syncSize(), { once: true });
      recordBtn.disabled = true;
      recordBtn.classList.remove('ready', 'recording');
      recordBtn.setAttribute('aria-label', 'Start recording');
      viewModeBtn.style.display = 'flex';
      updateViewModeBtn();
      showSetupPanel();
      setupConsecutiveFrames = 0;
      lastLandmarkTime = performance.now();
      cameraFrames.length = 0;
      cameraRunning = true;
      cameraLoop();
    },

    close(): void {
      const wasRecording = cameraState === 'recording';
      cameraState = 'closed';
      cameraRunning = false;
      cancelAnimationFrame(cameraRafId);
      recordBtn.disabled = false;
      clearInterval(recTimerInterval);
      stopCamera(video);
      recordBtn.classList.remove('ready', 'recording');
      viewModeBtn.style.display = 'none';
      recIndicator.style.display = 'none';
      if (wasRecording) onAnalysisReady([...cameraFrames], selectedView);
    },
  };
}
```

- [ ] **Step 2: Update runalyzr/src/main.ts to use the controller**

In `main.ts`, replace the camera-related state variables and the `openCamera`/`closeCamera`/`startRecording`/`stopRecording` functions + the `cameraLoop` IIFE with:

```typescript
import { initCameraController } from './ui/cameraController';
```

And in the `main()` function body, after `initVideoPlayer` is called and `overlay` is created, add:

```typescript
  const cameraController = initCameraController({
    video,
    overlay,
    landmarker,
    liveMetricsEl,
    setupOverlayEl,
    setupPanelEl,
    videoContainerEl,
    videoTopRightEl,
    recordBtn,
    viewModeBtn,
    recIndicator,
    recTimerEl,
    shareVideoBtn,
    setupToggleEl,
    setupToggleIcon: document.getElementById('setup-toggle-icon') as HTMLElement,
    onAnalysisReady: (frames, view) => runAnalysis(frames, view),
    onBlobUrl: (url) => { if (!url) showIdleUI(); },
    getLastResults: () => lastResults,
    updateLiveMetrics,
  });

  cameraOpenBtn.addEventListener('click', () => cameraController.open().catch(console.error));
  cameraCloseBtn?.addEventListener('click', () => cameraController.close());
```

Remove from `main.ts`: all the camera state variables (`cameraState`, `cameraRunning`, `cameraRafId`, `cameraFrames`, `selectedView`, `mediaRecorder`, `recordedChunks`, `recordedBlobUrl`, `compositeCanvas`, `compositeCtx`, `recordingHasOverlay`, `setupConsecutiveFrames`, `lastLandmarkTime`, `recTimerInterval`, `recStartTime`), and the functions `openCamera`, `closeCamera`, `startRecording`, `stopRecording`, `cameraLoop`, `setPillColor`, `showSetupPanel`, `showLivePanel`, `updateViewModeBtn`, `refreshSetupUI`, plus the `viewModeBtn`/`recordBtn`/`shareVideoBtn` event listeners (they're now inside the controller).

- [ ] **Step 3: Verify build and manually test camera**

```bash
cd runalyzr && npm run build 2>&1 | tail -5
```
Expected: `✓ built in Xs`. Then run `npm run dev` and verify camera open/record/stop/close still works.

- [ ] **Step 4: Commit**

```bash
git add runalyzr/src/ui/cameraController.ts runalyzr/src/main.ts
git commit -m "refactor: extract CameraController from runalyzr/src/main.ts"
```

---

## Task 11: Simplify bike/src/main.ts camera section

`bike/src/main.ts` has a simpler camera flow than runalyzr (no composite recording, no view selector in the loop) but the camera IIFE and recording state are still inline in main. Extract just the camera state + recording into a smaller closure. This is a lighter version of Task 10 — no new file needed, just tighten the structure.

**Files:**
- Modify: `bike/src/main.ts:317-444` (camera open, close, record handlers)

- [ ] **Step 1: Extract camera state into a scoped object**

Wrap the camera state variables and the camera open/close/record handlers in a `function initRideCameraSection() { ... return { open, close }; }` at the bottom of `main()`, keeping all DOM element references closed-over from outer scope. This doesn't change behaviour but makes the camera section independently reviewable.

The full extracted function (replaces the inline camera block starting at `// Camera mode for ride`):

```typescript
  function initRideCameraSection() {
    let cameraState = 'closed';
    let cameraRunning = false;
    let cameraRafId = 0;
    const cameraFrames: FrameData[] = [];
    let mediaRecorder: MediaRecorder | null = null;
    const recordedChunks: Blob[] = [];

    rideCameraOpenBtn.addEventListener('click', async () => {
      try {
        await startCamera(rideVideo);
        cameraState = 'closed';
        cameraRunning = true;
        setupBuffer.length = 0;
        rideIdle.hidden = true;
        rideVideoWrap.hidden = false;
        rideNewBtn.hidden = false;
        rideCameraOpenBtn.hidden = true;
        rideCameraCloseBtn.hidden = false;
        rideRecordBtn.hidden = false;
        rideRecordBtn.disabled = true;
        setupOverlayEl.classList.add('visible');
        setupPanelEl.classList.add('open');
        overlay.syncSize();
        rideVideo.addEventListener('resize', () => overlay.syncSize(), { once: true });

        (function cameraLoop() {
          if (!cameraRunning) return;
          if (rideVideo.readyState >= 2) {
            const result = landmarker.detectForVideo(rideVideo, performance.now());
            if (result.landmarks.length > 0) {
              const lms = result.landmarks[0] as LandmarkArray;
              overlay.drawSkeleton(lms, {});
              updateSetupChecks(lms);
              if (cameraState === 'recording' && cameraFrames.length < 9000) {
                cameraFrames.push({
                  landmarks: lms,
                  worldLandmarks: result.worldLandmarks[0] as LandmarkArray,
                  timestamp: performance.now(),
                });
              }
            } else {
              updateSetupChecks(null);
            }
          }
          cameraRafId = requestAnimationFrame(cameraLoop);
        })();
      } catch (err) {
        console.error('Camera error:', err);
      }
    });

    rideCameraCloseBtn.addEventListener('click', () => {
      cameraRunning = false;
      cancelAnimationFrame(cameraRafId);
      stopCamera(rideVideo);
      if (cameraState === 'recording' && cameraFrames.length > 0) {
        runRideAnalysis([...cameraFrames]);
      }
      cameraState = 'closed';
      rideCanvas.width = 0;
      rideCanvas.height = 0;
      rideCameraOpenBtn.hidden = false;
      rideCameraCloseBtn.hidden = true;
      rideRecordBtn.hidden = true;
      rideRecordBtn.disabled = true;
      rideRecordBtn.classList.remove('recording');
      setupOverlayEl.classList.remove('visible');
    });

    rideRecordBtn.addEventListener('click', () => {
      if (cameraState !== 'recording') {
        cameraState = 'recording';
        cameraFrames.length = 0;
        recordedChunks.length = 0;
        rideRecordBtn.classList.add('recording');
        rideRecordBtn.textContent = '⏹';
        rideRecordBtn.disabled = true;

        let lockSecondsLeft = 5;
        const lockInterval = window.setInterval(() => {
          lockSecondsLeft--;
          if (lockSecondsLeft <= 0) {
            clearInterval(lockInterval);
            rideRecordBtn.disabled = false;
          }
        }, 1000);

        if (typeof MediaRecorder !== 'undefined' && rideVideo.srcObject) {
          const mimeType = ['video/webm;codecs=vp9', 'video/webm']
            .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
          try {
            mediaRecorder = new MediaRecorder(
              rideVideo.srcObject as MediaStream,
              mimeType ? { mimeType } : {},
            );
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.start(100);
          } catch { mediaRecorder = null; }
        }
      } else {
        cameraState = 'closed';
        rideRecordBtn.classList.remove('recording');
        rideRecordBtn.textContent = '⏺';
        rideRecordBtn.disabled = false;
        if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
        mediaRecorder = null;
        runRideAnalysis([...cameraFrames]);
      }
    });
  }

  initRideCameraSection();
```

Also remove the now-duplicate `let mediaRecorder` and `const recordedChunks` declarations that were at the outer scope (lines 351–352 in the original), and remove the `resetRideVideo` reference to `mediaRecorder` by passing a stop callback instead, or move `resetRideVideo` inside `initRideCameraSection`.

Note: `resetRideVideo` references `mediaRecorder` — since it's now inside the closure, the function must also be moved inside `initRideCameraSection` or take a `stopRecording` callback. The simplest approach: move `resetRideVideo` inside the function and expose it as a return value.

- [ ] **Step 2: Verify build**

```bash
cd bike && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add bike/src/main.ts
git commit -m "refactor: encapsulate bike camera state machine in initRideCameraSection"
```

---

## Self-Review

**Spec coverage check:**

| Issue from review | Covered by task |
|---|---|
| Math.spread stack overflow (3 locations) | Task 1 |
| shared/package.json exports + peerDep | Task 2 |
| findLocalMaxima duplication | Task 3 |
| landmarker as any + no CPU fallback | Task 4 |
| bike findings as-unknown-as casts | Task 5 |
| videoPlayer keydown leak | Task 6 |
| videoPlayer URL leak (both apps) | Task 6 |
| bike 5-second recording lock | Task 7 |
| threshold boundary overlap | Task 8 |
| magic 100 comment | Task 8 |
| bike zero test coverage | Task 9 |
| runalyzr main.ts god object | Task 10 |
| bike main.ts camera section | Task 11 |
| shared/package.json peerDependency | Task 2 |

**Placeholder scan:** All code blocks are complete. No "TBD" or "similar to Task N" references.

**Type consistency:** Types used across tasks are consistent — `AnalysisResults`, `FrameData`, `CameraView`, `LandmarkArray` are all sourced from `@runalyzr/shared/types` or re-exported from `runalyzr/src/analysis/types.ts`.
