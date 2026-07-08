# Runalyzr Monorepo

TypeScript monorepo: **runalyzr** (run form analysis) and **bike** (bike fitting analysis), sharing utilities via `@runalyzr/shared`.

## Workspaces

| Directory | Package | Role |
|-----------|---------|------|
| `shared/` | `@runalyzr/shared` | Math utilities, types, pose landmarker, frame-processing loop, skeleton drawer, threshold/findings engines, PDF renderer |
| `runalyzr/` | — | Run form analysis web app |
| `bike/` | — | Bike fitting analysis web app |

## Commands

Always `cd` into the workspace first — there is no root-level build or test command.

```bash
# runalyzr
cd runalyzr && npm run build      # Vite build
cd runalyzr && npm run dev        # Dev server
cd runalyzr && npm test           # 59 Vitest tests

# bike
cd bike && npm run build          # Vite build
cd bike && npm run dev            # Dev server
cd bike && npm test               # 60 Vitest tests
cd bike && npx tsc --noEmit       # Type-only check (no separate build step)

# shared
cd shared && npm test             # 13 Vitest tests (setRunningMode, threshold + findings engines)
```

## Module Resolution

Both apps use `moduleResolution: bundler`. `@runalyzr/shared/*` is resolved via **tsconfig `paths` + Vite `alias`** — not Node resolution. The `shared/package.json` exports (`.ts` paths) only affect non-Vite consumers.

Both tsconfigs set `"noEmit": true`. Never let `tsc` emit `.js` into `src/` — Vite resolves `.js` before `.ts`, so stale emitted files silently shadow TypeScript sources in the dev server.

Shared subpaths (each new subpath must be added in **three** places: `shared/package.json` exports, both apps' tsconfig `paths`, both apps' Vite `alias` — deliberately non-nested names so Vite's prefix-alias matching can't misroute them):
- `@runalyzr/shared/math` → math utilities + `findLocalMaxima`/`findLocalMinima`, `tiltFromHorizontal`
- `@runalyzr/shared/types` → `FrameData`, `LandmarkArray`, `CameraView`
- `@runalyzr/shared/pose` → MediaPipe pose landmarker wrapper (`initLandmarker`, `setRunningMode`)
- `@runalyzr/shared/processing` → `createProcessingLoop` (VFC/rAF frame loop; apps pass fps options and keep their own `detectCameraView`)
- `@runalyzr/shared/skeleton` → `POSE_CONNECTIONS` + `drawPoseSkeleton` (single-colour static renders; the live overlays stay app-local for status colours/letterboxing)
- `@runalyzr/shared/analysis` → threshold engine (`evaluateThreshold`, "green wins at boundary", `indicativeOnly`) + findings engine (`findingsFromTemplates`); the threshold/template **tables** stay app-local
- `@runalyzr/shared/pdf` → jsPDF report renderer

## Non-Negotiable Invariants

### No `Math.max/min(...array)` spreads
Throws `RangeError` on Safari when arrays exceed ~65 K elements. At 30 fps × 9 000 frame cap, landmark arrays hit this. Use explicit loops everywhere:
```typescript
let lo = arr[0], hi = arr[0];
for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
```
This applies inside `findLocalMaxima` too — use `.reduce()` for the window min, not `Math.min(...slice)`.

### Always revoke Object URLs before creating new ones
```typescript
if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
currentObjectUrl = URL.createObjectURL(file);
```
Both videoPlayer.ts files follow this pattern.

### No type escape hatches
Avoid `as any` and `as unknown as T`. Use generic constraints:
```typescript
// ✅
function findingsFromTemplates<K extends string>(metrics: Partial<Record<K, MetricResult | null>>, ...)
// ❌
metrics as unknown as Record<string, MetricResult | null>
```

## Key Architecture

### Analysis pipeline
```
Camera / Video → MediaPipe PoseLandmarker → FrameData[]
  → metrics functions → MetricResult (value + status + unit)
  → findings (amber/red only) → PDF report
```

`FrameData = { timestamp: number; landmarks: LandmarkArray; worldLandmarks: LandmarkArray }`

### Pose landmarker (shared)
`shared/src/pose/landmarker.ts` tries GPU delegate first, falls back to CPU automatically. Callers just `await initLandmarker(modelUrl, wasmPath, mode)` — no GPU handling needed at call sites.

### findLocalMaxima / findLocalMinima (shared)
Live in `@runalyzr/shared/math` (`shared/src/math/angles.ts`). Do not define them in app-level files — they were extracted from both apps to eliminate duplication.

### runalyzr: CameraController
`runalyzr/src/ui/cameraController.ts` — deps-injection pattern, returns `{ open(), close() }`.

- All camera state (`cameraState`, `cameraRunning`, frames, mediaRecorder, etc.) is internal to the controller.
- `main.ts` owns a `cameraActive: boolean` flag that guards the `loadedmetadata` listener — prevents `showVideoFileUI()` firing during camera-originated `video.load()` calls.
- Recording completion is signalled via the `onRecordingComplete(blobUrl)` callback in `CameraControllerDeps`, not inline DOM manipulation.
- `initVideoPlayer()` returns a `() => void` keydown cleanup — stored as `cleanupVideoPlayer` for future use when CameraController is torn down.

### Threshold evaluation (shared engine)
`shared/src/analysis/thresholds.ts` (`evaluateThreshold`): **green wins at boundary** — green is checked first, so amber bands that touch green are effectively half-open. `indicativeOnly` entries always evaluate to `unknown`. Both apps' `thresholds.ts` are thin wrappers holding only their metric tables. The findings engine (`findingsFromTemplates`: template lookup, `{value}` substitution, red-first sort) is shared the same way — template tables stay app-local.

### bike: Camera section
Wrapped in `initRideCameraSection()` inside `bike/src/main.ts`. Returns `{ cameraFrames }` (array reference) since the view-button handler outside the function needs to read it.

Recording lock uses `recordingLockTimeout: ReturnType<typeof window.setTimeout> | null`. Must be cleared in **three** places: recording start (guard against double-start), stop-recording branch, and camera-close handler.

**Ride video upload** relies on the video's **native `controls`**: `videoPlayer.ts` sets `video.controls = true` when a file is loaded and `false` in `startCamera`/`stopCamera` (camera uses the app's own record button). Playback is what drives frame collection — `onPlay → loop.start()` (which sets the landmarker to VIDEO mode), analysis runs on `pause`/`ended`. Without controls there is no way to play an uploaded video, so don't remove them. The `#ride-overlay` skeleton canvas is `pointer-events: none`, so native controls stay clickable underneath.

### bike: Findings metric-interface constraint
bike's findings go through the shared `findingsFromTemplates<K extends string>(metrics: Partial<Record<K, MetricResult | null>>, templates)` engine. The three metric interfaces (`SagittalMetrics`, `RearMetrics`, `FrontMetrics`) extend `Record<string, MetricResult | null>` — still load-bearing: it's what makes them assignable to the engine's parameter without casts.

### bike: Point placement overlay
`bike/src/ui/pointPlacement.ts` — fullscreen, promise-based (`openPointPlacement(...): Promise<PlacedPoint[] | null>`, resolves points on Done, `null` on Cancel). Creates its own DOM under `document.body` and never shares DOM/CSS with the step card (the v1 branch failed precisely because the placement canvas lived inside the card layout). Points are normalised to the *image* (0–1 of natural size), not the canvas — the canvas letterboxes. `fitGuide.ts` awaits it for `kind: 'bike'` steps and keeps raw photos in `bikeRawPhotos` so "Edit points" re-edits the original, not the annotated render. Fit steps are a discriminated union (`FitStep = RiderStep | BikeGeometryStep`) in `bike/src/config/defaults.ts`; `AngleDefinition.pointC` only narrows under a positive `reference === 'ab_to_c'` check.

## Test Coverage

| File | Tests | What's covered |
|------|-------|----------------|
| `runalyzr/src/analysis/*.test.ts` | 48 | Gait detection (incl. estimated toe-off), metrics (incl. pelvic-drop degrees, GCT honesty, view gating), thresholds, findings, angles, setup checks + video quality |
| `runalyzr/src/report/pdfGenerator.test.ts` | 3 | buildReportSections rows/ranges/findings + annotated-frame image |
| `runalyzr/src/ui/videoPlayer.test.ts` | 8 | Play/pause wiring, keydown guards (inputs, live camera, isBusy), cleanup, startCamera src-clearing (jsdom) |
| `bike/src/analysis/pedalDetection.test.ts` | 7 | BDC/TDC detection, cadence, cycle segmentation |
| `bike/src/analysis/metrics.test.ts` | 5 | hipRock, kneeSymmetry |
| `bike/src/analysis/findings.test.ts` | 10 | generateRear/Sagittal/FrontFindings |
| `bike/src/analysis/fitMetrics.test.ts` | 12 | Angle-based fit-photo measurers (obliquity, knee alignment, shank/KOPS) + per-position upper-body angles (`sideUpperBody`, incl. graceful degradation) and front lateral trunk lean |
| `shared/src/pose/runningMode.test.ts` | 4 | `setRunningMode` mode tracking and dedup (lives with the code it tests) |
| `shared/src/analysis/thresholds.test.ts` | 6 | evaluateThreshold: green-wins-at-boundary invariant, direction fall-throughs, indicativeOnly/missing → unknown, gap-band semantics |
| `shared/src/analysis/findings.test.ts` | 3 | findingsFromTemplates: {value} substitution, green/unknown/null skips, red-first stable sort |
| `bike/src/analysis/bikeGeometryMetrics.test.ts` | 14 | computeBikeAngles (signed/unsigned/3-point, aspect scaling, band status), anglePointPairs |
| `bike/src/ui/placementSequence.test.ts` | 5 | firstUnplacedFrom sequencing |
| `bike/src/analysis/bands.test.ts` | 4 | bandStatus green/amber/unknown evaluation |
| `bike/src/report/pdfGenerator.test.ts` | 3 | buildReportSections includes rider + bike-geometry photos as section images |

All bike metrics are **angles in degrees** (framing-independent, no calibration needed) except `hipRock` and `hipVerticalOscillation`, which are whole-body motion and reported as `% frame` — world landmarks can't measure whole-body translation because their origin travels with the hips. Fit-photo measurers receive **world landmarks**, not image landmarks.

The same honesty rule applies in runalyzr: `verticalOscillation` is `% frame` (image landmarks, framing-dependent — its bands are provisional pending calibration) and `pelvicDrop` is a true hip-line tilt in degrees (`tiltFromHorizontal` in `@runalyzr/shared/math`). Ground-contact time averages only cycles with a *detected* toe-off (`GaitCycle.toeOffEstimated`); an `unknown` camera view computes sagittal metrics only, with a dashboard warning pointing to the view selector.

**Upper-body fit angles** (torso, elbow, reach, shoulder) are captured **per side crank position** via `sideUpperBody(wlm)` in `fitMetrics.ts` (appended to `measureSide6OClock`/`3`/`9`) — the old dedicated "Neutral Seated" steps were removed as vague/duplicative. Torso and elbow use validated bands; **Reach and Shoulder are informational** (no band → `status: 'unknown'`) pending calibration. The ride video mirrors this: `shoulderAngle` and `reachAngle` are averaged across frames in `metrics/sagittal.ts` and flagged `indicativeOnly` in `thresholds.ts`.

No UI tests — verify camera and recording flows manually in the browser.
