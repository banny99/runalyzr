# Runalyzr Monorepo

TypeScript monorepo: **runalyzr** (run form analysis) and **bike** (bike fitting analysis), sharing utilities via `@runalyzr/shared`.

## Workspaces

| Directory | Package | Role |
|-----------|---------|------|
| `shared/` | `@runalyzr/shared` | Math utilities, types, pose landmarker, PDF renderer |
| `runalyzr/` | — | Run form analysis web app |
| `bike/` | — | Bike fitting analysis web app |

## Commands

Always `cd` into the workspace first — there is no root-level build or test command.

```bash
# runalyzr
cd runalyzr && npm run build      # Vite build
cd runalyzr && npm run dev        # Dev server
cd runalyzr && npm test           # 31 Vitest tests

# bike
cd bike && npm run build          # Vite build
cd bike && npm run dev            # Dev server
cd bike && npm test               # 63 Vitest tests
cd bike && npx tsc --noEmit       # Type-only check (no separate build step)
```

## Module Resolution

Both apps use `moduleResolution: bundler`. `@runalyzr/shared/*` is resolved via **tsconfig `paths` + Vite `alias`** — not Node resolution. The `shared/package.json` exports (`.ts` paths) only affect non-Vite consumers.

Both tsconfigs set `"noEmit": true`. Never let `tsc` emit `.js` into `src/` — Vite resolves `.js` before `.ts`, so stale emitted files silently shadow TypeScript sources in the dev server.

Shared subpaths:
- `@runalyzr/shared/math` → math utilities + `findLocalMaxima`/`findLocalMinima`
- `@runalyzr/shared/types` → `FrameData`, `LandmarkArray`, `CameraView`
- `@runalyzr/shared/pose` → MediaPipe pose landmarker wrapper
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
function findingsFromMetricGroup<T extends Record<string, MetricResult | null>>(metrics: T)
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

### runalyzr: Threshold evaluation
`runalyzr/src/analysis/thresholds.ts`: **green wins at boundary**. Amber bands are half-open:
- Lower amber: `value >= t.amber[0] && value < t.green[0]`
- Upper amber: `value > t.green[1] && value <= t.amber[1]`

### bike: Camera section
Wrapped in `initRideCameraSection()` inside `bike/src/main.ts`. Returns `{ cameraFrames }` (array reference) since the view-button handler outside the function needs to read it.

Recording lock uses `recordingLockTimeout: ReturnType<typeof window.setTimeout> | null`. Must be cleared in **three** places: recording start (guard against double-start), stop-recording branch, and camera-close handler.

### bike: Findings generic helper
`findingsFromMetricGroup<T extends Record<string, MetricResult | null>>` in `bike/src/analysis/findings.ts`. The three metric interfaces (`SagittalMetrics`, `RearMetrics`, `FrontMetrics`) extend `Record<string, MetricResult | null>` to satisfy this constraint.

### bike: Photo source (fit steps)
`bike/src/ui/photoSource.ts` — `createPhotoSource(els, onFile)` wires a two-button still-photo picker: **Upload Photo** (`accept="image/*"`) → files/gallery, **Take Photo** (`capture="environment"`) → device camera. Uses native OS capture, not `getUserMedia` (ride mode's live camera is a separate video/MediaRecorder path). Returns `openUpload()`/`openCamera()` so `fitGuide.ts`'s nav buttons drive it programmatically (rider **Retake** → camera, **New photo** → files). This is the reusable sibling of ride mode's Upload-Video/Use-Camera buttons — don't re-inline the button→input→onFile wiring at call sites.

### bike: Point placement overlay
`bike/src/ui/pointPlacement.ts` — fullscreen, promise-based (`openPointPlacement(...): Promise<PlacedPoint[] | null>`, resolves points on Done, `null` on Cancel). Creates its own DOM under `document.body` and never shares DOM/CSS with the step card (the v1 branch failed precisely because the placement canvas lived inside the card layout). Points are normalised to the *image* (0–1 of natural size), not the canvas — the canvas letterboxes. `fitGuide.ts` awaits it for `kind: 'bike'` steps and keeps raw photos in `bikeRawPhotos` so "Edit points" re-edits the original, not the annotated render. Fit steps are a discriminated union (`FitStep = RiderStep | BikeGeometryStep`) in `bike/src/config/defaults.ts`; `AngleDefinition.pointC` only narrows under a positive `reference === 'ab_to_c'` check.

## Test Coverage

| File | Tests | What's covered |
|------|-------|----------------|
| `runalyzr/src/analysis/*.test.ts` | 31 | Gait detection, metrics, thresholds, setup checks |
| `bike/src/analysis/pedalDetection.test.ts` | 7 | BDC/TDC detection, cadence, cycle segmentation |
| `bike/src/analysis/metrics.test.ts` | 5 | hipRock, kneeSymmetry |
| `bike/src/analysis/findings.test.ts` | 10 | generateRear/Sagittal/FrontFindings |
| `bike/src/analysis/fitMetrics.test.ts` | 8 | Angle-based fit-photo measurers (obliquity, knee alignment, shank/KOPS) |
| `bike/src/pose/runningMode.test.ts` | 4 | `setRunningMode` mode tracking and dedup |
| `bike/src/analysis/bikeGeometryMetrics.test.ts` | 14 | computeBikeAngles (signed/unsigned/3-point, aspect scaling, band status), anglePointPairs |
| `bike/src/ui/placementSequence.test.ts` | 5 | firstUnplacedFrom sequencing |
| `bike/src/analysis/bands.test.ts` | 4 | bandStatus green/amber/unknown evaluation |
| `bike/src/ui/photoSource.test.ts` | 6 | createPhotoSource button→input delegation, onFile dispatch, value reset (jsdom) |

All bike metrics are **angles in degrees** (framing-independent, no calibration needed) except `hipRock` and `hipVerticalOscillation`, which are whole-body motion and reported as `% frame` — world landmarks can't measure whole-body translation because their origin travels with the hips. Fit-photo measurers receive **world landmarks**, not image landmarks.

UI is mostly untested — verify camera and recording flows manually in the browser. The one exception is `photoSource.test.ts`, a jsdom-based test of pure DOM wiring (`// @vitest-environment jsdom` per-file; `jsdom` is a bike dev dependency). Native `capture="environment"` camera behavior still can't be exercised headlessly — verify on a real phone.
