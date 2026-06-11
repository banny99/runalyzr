# Bike Geometry Photo Fitting v2 — Redo Design

**Date:** 2026-06-11
**Status:** Approved
**Scope:** Bikealyzr (`bike/`) only
**Supersedes:** `2026-06-08-bike-geometry-photo-fitting-design.md` and the `feature/bike-geometry` branch

---

## Background

The 2026-06-08 implementation (`feature/bike-geometry`, 16 commits) proved the concept but ran aground on UI integration: the point-placement canvas lived inside the step card's DOM and CSS, capped at 260 px tall on mobile, and a day of debugging produced layered band-aids (checklist relocated three times, canary logs, CSS-order fixes) without a satisfying result. Meanwhile `main` moved substantially (world-landmark angle metrics, async photo analysis, running-mode switching).

Decision: **redo on a fresh branch off current `main`**, porting only the proven modules. The old branch remains as reference until merged work supersedes it, then gets deleted.

### Ported from the old branch (proven, conflict-free)

| Source | What |
|---|---|
| `bike/src/analysis/bikeGeometryMetrics.ts` + tests | `computeBikeAngles()` — pure angle math (horizontal/vertical/3-point references, signed angles, aspect-ratio correction) |
| `bike/src/config/defaults.ts` | `FitStep` discriminated union (`RiderStep` \| `BikeGeometryStep`), `BikePoint`, `AngleDefinition` (incl. `signed?: boolean`), `FIT_STEPS` with `bike_side` (7 points, 4 angles) and `bike_rear` (4 points, 2 angles) definitions |
| `bike/src/analysis/types.ts` | `PlacedPoint`, `BikeAngleMeasurement`, `BikeGeometryResult`, extended `FitSessionResults` |
| `bike/src/ui/fitGuide.ts` | The two-section cascading-checkbox selector logic (rendering approach only) |
| `bike/src/ui/bikeGeometryCanvas.ts` | Drawing logic (dots, dashed connection lines, crosshair) reused inside the new fullscreen component |

### Deliberately not ported

- The inline-panel placement layout and its CSS band-aids
- `updateBikePrompt` writing the checklist into `#fit-instructions`
- The 260 px canvas height cap
- Debug console.logs, canary markers, Vite polling-watcher config

---

## UX Flow (4 screens)

### 1. Selection screen
Two card-styled sections with cascading parent checkboxes:
- **Bike Geometry** *(badge: "no rider")* — Full Bike Side View, Bike Rear View
- **Rider on Bike** *(badge: "with rider")* — the existing 9 rider positions, grouped by view

Parent checkbox: checked / indeterminate / unchecked mirrors children; clicking it toggles all children. Begin disabled at zero selections. Session order: bike steps first, then rider steps.

### 2. Step card (bike step)
Header: "Step n of N" + step-type badge + thin progress bar. Body: step name, photo-taking instructions, a large "Take / Upload Photo" target with a hint of how many points follow. Nav: Back / Skip / Next (Next disabled until the step has a result).

Choosing a photo opens fullscreen placement. After completion the card shows the annotated photo preview, the angle table for the step, and two affordances: **Edit points** (reopens placement on the original photo with existing points) and **New photo** (discards points, reopens the camera/gallery picker).

### 3. Fullscreen placement mode (new component)
The photo fills the viewport (letterboxed, `object-fit: contain` semantics), dark backdrop, page scroll locked.

- **Top floating bar:** "Tap the *{point label}* (n/total)" + cancel ✕.
- **Placement:** tap places the active point. Press-and-drag shows a **magnifier loupe** offset above the finger with a zoomed crosshair; release places. Mouse gets a full-canvas crosshair cursor.
- **Placed points:** green dots with short labels; dashed blue connection lines derived from angle definitions; active point amber.
- **Bottom bar:** horizontally scrollable **point chips** (placed = green, active = amber outline, unplaced = dim); tapping a chip makes that point active for (re)placement. Buttons: **Undo** (clears last placed), **Skip point**, **Done ✓**.
- **Done** is always enabled; angles whose points are missing are omitted (per v1 spec). Done computes angles, renders the annotated image, stores the result, closes the overlay.
- **Cancel ✕** closes without changing stored state (existing result, if any, survives).

### 4. Results panel & PDF
Bike Geometry sections render **first**: annotated photo + table (angle | value° | normal range). Rider sections follow unchanged. The PDF mirrors this: a Bike Geometry section per step with the embedded annotated image and angle table, before rider sections.

---

## Architecture

### New: `bike/src/ui/pointPlacement.ts`
Self-contained fullscreen overlay component.

```ts
export function openPointPlacement(
  image: HTMLImageElement,          // fully loaded
  step: BikeGeometryStep,
  existingPoints: PlacedPoint[],
): Promise<PlacedPoint[] | null>;   // points on Done, null on Cancel
```

- Creates its own DOM (appended to `document.body`), injects nothing into the step card; removes everything and unlocks scroll on close. **No shared DOM/CSS with the panel layout** — the structural fix for the v1 failure mode.
- Canvas sized to the actual viewport (device-pixel-ratio aware), not a fixed cap.
- Stores points as normalized 0–1 coordinates (auto-detection-ready, unchanged from v1 spec).
- Keyboard: Escape = cancel, Enter = done (desktop convenience).

### New: `bike/src/ui/annotatedBikePhoto.ts`
`renderAnnotatedBikePhoto(img, step, points, angles): string` — offscreen canvas at the image's natural resolution; draws dots, connection lines, and angle value labels; returns a JPEG data URL. Used for the results panel and PDF. (v1 snapshotted the small on-screen canvas — thumbnails of thumbnails.)

### Integration: `bike/src/ui/fitGuide.ts`
- `renderStep()` dispatches on `step.kind` (v1 spec pattern).
- Bike step flow: photo file → load image → `await openPointPlacement(...)` → `computeBikeAngles(...)` → `renderAnnotatedBikePhoto(...)` → upsert `BikeGeometryResult` → `renderStep()` + `renderResults()`.
- Raw photos kept in a `Map<stepId, dataUrl>` so Retake re-edits points on the original image, not the annotated one (carried over from v1 branch).
- `FitSessionResults` = `{ positions, bikeGeometry }`; `getResults()` and `onComplete` include both (main.ts PDF wiring already consumes `getResults()`).

### `bike/src/report/pdfGenerator.ts`
Adds bike geometry sections using `doc.addImage` for the annotated photo plus the standard metric-row table.

### Light polish (scope b)
- Selection sections as cards with headers + badges (CSS from the v1 branch, cleaned).
- Step header progress bar + step-type badge for **all** steps (rider steps included).
- Results sections share one card style.
- No changes to rider photo analysis logic (just stabilized on `main`).

---

## Error handling

| Case | Behaviour |
|---|---|
| Image fails to load | Alert, stay on upload state |
| Cancel placement | No state change |
| Skipped/missing points | Dependent angles omitted from results (no error) |
| Zero angles computable | Result stored with empty angle list; results table shows "No points placed yet" |
| Re-entering a completed step | Placement reopens with existing points editable |

## Testing

- Port the 10 `bikeGeometryMetrics` tests; extend for `signed` angles if not already covered.
- New unit tests for pure helpers extracted from the placement component (active-point sequencing: advance past placed points, undo, skip).
- Placement overlay, loupe, and scroll-lock verified manually in browser + on phone (repo convention: no UI tests).

## Out of scope (unchanged from v1)

- Distance/length measurements (needs scale calibration)
- Automatic bike landmark detection (architecture stays compatible via normalized `PlacedPoint[]`)
- Ride mode changes
