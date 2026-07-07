# Runalyzr app review — 2026-07-07

Full review of the runalyzr (run-form analysis) app: correctness, architecture/consistency
with bike + shared, metrics/UX honesty, and run-verification. Tracked as GitHub issues
[#11](https://github.com/banny99/runalyzr/issues/11) (playback/upload/camera flow),
[#12](https://github.com/banny99/runalyzr/issues/12) (recording & analysis),
[#13](https://github.com/banny99/runalyzr/issues/13) (metric unit honesty),
[#14](https://github.com/banny99/runalyzr/issues/14) (dedupe/tests/dead code).

## Verification
`npx tsc --noEmit` clean · 31/31 Vitest pass · `npm run build` clean (~48 MB PWA precache).
Green CI does not cover the broken flows below — they're all in untested UI wiring.

## Correctness findings (ranked)

| # | Sev | Issue | Finding |
|---|-----|-------|---------|
| 1 | HIGH | #11 | `cameraActive` (main.ts:216) never reset by the ✕-close handler → after any camera open/close, uploads are silently ignored until reload. |
| 2 | HIGH | #11 | `videoPlayer.ts` wires `#play-pause` but the element doesn't exist in index.html → uploaded/recorded videos can never be played; the review-overlay loop (`play` → `loop.start()`) never runs. Analogue of bike PR #9. |
| 3 | MED-HIGH | #12 | `cameraController.close()` never stops the MediaRecorder mid-recording → stale recorder keeps appending to the shared `recordedChunks`; next recording can be corrupt. |
| 4 | MED-HIGH | #12 | Three timebases feed `detectForVideo` (0-based seek analysis, `performance.now()` camera, rAF loop) → MediaPipe timestamp regression; Analyse fails after camera use or on a second run. |
| 5 | MED | #11 | Global ArrowLeft/Right keydown handler pauses the live camera and blocks caret movement in report-modal inputs. |
| 6 | MED | #12 | Analyse silently no-ops on freshly recorded WebM (`duration === Infinity` Chrome quirk) — guard returns with no message. |
| 7 | LOW-MED | #11 | Camera `open()` clears stale `src` only for recorded blobs; an uploaded file's src survives the camera session (bike's `removeAttribute('src')` fix never ported). |
| 8 | LOW | #14 | `ReportParams.frameDataUrl` captured and passed but never rendered in the PDF. |

Clean: CLAUDE.md invariants (no min/max spreads, no `as any`, object-URL revoke-before-create),
threshold boundary logic ("green wins", half-open ambers), NaN guards in metric averagers.

## Metrics / UX honesty (issue #13)
- `pelvicDrop` computes **cm** (metrics.ts:86) but is banded/templated as **degrees** — bands
  effectively miscalibrated. Bike measures the analogous concept as a true angle.
- `verticalOscillation` computes **% of frame height** (image landmarks) but is labeled **cm** —
  framing-dependent; bike deliberately reports `% frame` (CLAUDE.md documents why).
- `unknown` camera view computes both sagittal and frontal metric sets → side-view videos can show
  meaningless frontal metrics.
- Estimated vs measured ground-contact time (silent 40%-of-cycle toe-off fallback) presented identically.

## Architecture (issue #14, ranked)
1. `createProcessingLoop` line-for-line duplicated in both apps (bike's `setRunningMode` fix never
   reached runalyzr) → move to shared.
2. Wire `frameDataUrl` into the PDF + adopt bike's testable `buildReportSections` split.
3. Threshold engine duplicated with subtle drift → extract to shared, tables stay app-local.
4. Findings engine duplicated (template-lookup/{value}-replace/sort) → extract.
5. `buildJointStatuses` duplicated inside runalyzr (main.ts vs cameraController.ts).
6. Three skeleton drawers across the monorepo; `POSE_CONNECTIONS` byte-identical → one shared drawer;
   cross-port letterbox `syncSize` (runalyzr→bike) and outlined labels (bike→runalyzr).
7. `setupChecks.ts` (206 lines, pure logic) has zero tests; CLAUDE.md coverage table wrongly claims
   coverage. `evaluateVideoQuality` / `detectCameraView` also untested. `runningMode.test.ts` belongs in shared.
8. Dead code: `LITE_MODEL_URL`, shared landmarker LIVE_STREAM path, bike `renderViewSelector`, over-exports.

## Where each app is ahead
- **runalyzr ahead:** deps-injected CameraController, MediaRecorder + composited overlay + share,
  letterbox-correct overlay, manual view override, post-hoc video-quality warnings.
- **bike ahead:** `setRunningMode`-aware loop, element-parameterised dashboard (testable), per-metric
  toggles, testable report sections, jsdom UI tests.

## Fix plan
- **PR A → issue #11** (this branch): playback/upload/camera-transition flow.
- **PR B → issue #12**: recording & analysis.
- **PR C → issue #13**: metric honesty (re-band + re-label, view gating).
- **PR D → issue #14**: dedupe/refactors/tests/dead code (may split further).
