# Bike Geometry Photo Fitting — Design Spec

**Date:** 2026-06-08  
**Status:** Approved  
**Scope:** Bikealyzr (`bike/`) only

---

## Overview

Add a bike-geometry-only photo fitting flow to the existing Fit session. The fitter uploads photos of the bike without a rider, then manually taps key anatomical points on the frame. The app draws overlays and computes geometry angles. This runs before the rider-on-bike steps in the same session and appears in the same results panel and PDF export.

Distances are out of scope for now; angles only. The tap-to-place UI is designed so that automatic point detection (e.g. via a future OpenCV.js or custom ML model) can pre-populate the points without changing any downstream logic.

---

## 1. Position Picker

`fitGuide.ts` → `renderSelection()` gains two collapsible sections with cascading parent checkboxes.

**Section: Bike Geometry** *(badge: "No rider needed")*
- Full Bike Side View — seat tube angle, head tube angle, saddle tilt, bar-to-saddle drop
- Bike Rear View — saddle level (L/R), bar level (L/R)

**Section: Rider on Bike** *(existing 9 positions, unchanged)*
- All existing side / rear / front rider positions

### Parent checkbox behaviour
- All children checked → parent checked
- Some children checked → parent indeterminate
- None checked → parent unchecked
- Clicking parent when unchecked/indeterminate → checks all children
- Clicking parent when all checked → unchecks all children

Session ordering: bike geometry steps run first, rider steps after. Begin button disabled when zero steps selected.

---

## 2. Data Model

### Step type discriminated union

```ts
// bike/src/config/defaults.ts (extended)

export type FitView = 'side' | 'rear' | 'front';

export interface BikePoint {
  id: string;    // e.g. 'bb_centre'
  label: string; // e.g. 'Bottom bracket centre'
}

export interface AngleDefinition {
  id: string;         // e.g. 'seat_tube_angle'
  label: string;      // e.g. 'Seat Tube Angle'
  pointA: string;     // BikePoint.id
  pointB: string;     // BikePoint.id
  pointC?: string;    // optional third point (for 3-point angle)
  reference: 'horizontal' | 'vertical' | 'ab_to_c'; // what to measure against
  normalRange: string; // e.g. '72–74°'
}

export interface RiderStep {
  kind: 'rider';
  id: string;
  name: string;
  view: FitView;
  instructions: string;
  keyMeasurements: string[];
}

export interface BikeGeometryStep {
  kind: 'bike';
  id: string;
  name: string;
  view: FitView;
  instructions: string;
  points: BikePoint[];
  angles: AngleDefinition[];
}

export type FitStep = RiderStep | BikeGeometryStep;
```

Existing `FitPosition` is replaced by `RiderStep`. `FIT_POSITIONS` becomes `FIT_STEPS: FitStep[]`.

### Bike geometry steps defined in `defaults.ts`

**`bike_side`** — Full Bike Side View
- Points (7): `bb_centre`, `seat_tube_top`, `head_tube_top`, `head_tube_bottom`, `handlebar_centre`, `saddle_nose`, `saddle_centre`
- Angles:
  - Seat tube angle — bb_centre→seat_tube_top vs horizontal — 72–74°
  - Head tube angle — head_tube_bottom→head_tube_top vs horizontal — 71–74°
  - Saddle tilt — saddle_nose→saddle_centre vs horizontal — ±2° (negative = nose-down)
  - Bar-to-saddle drop angle — saddle_centre→handlebar_centre vs horizontal — context-dependent

**`bike_rear`** — Bike Rear View
- Points (4): `saddle_left`, `saddle_right`, `bar_left`, `bar_right`
- Angles:
  - Saddle level — saddle_left→saddle_right vs horizontal — < 2°
  - Bar level — bar_left→bar_right vs horizontal — < 2°

### Result types

```ts
// bike/src/analysis/types.ts (additions)

export interface PlacedPoint {
  id: string;
  x: number; // 0–1 normalised canvas coordinate
  y: number;
}

export interface BikeAngleMeasurement {
  id: string;
  label: string;
  value: number;   // degrees
  normalRange: string;
}

export interface BikeGeometryResult {
  stepId: string;
  stepName: string;
  imageDataUrl: string;
  points: PlacedPoint[];
  angles: BikeAngleMeasurement[];
}

// FitSessionResults extended:
export interface FitSessionResults {
  positions: FitPositionResult[];      // existing rider results
  bikeGeometry: BikeGeometryResult[];  // new
}
```

---

## 3. Point Placement Canvas (`bikeGeometryCanvas.ts` — new file)

`bike/src/ui/bikeGeometryCanvas.ts` owns the tap-to-place interaction for a single bike geometry step.

### API

```ts
export function initBikeGeometryCanvas(
  canvas: HTMLCanvasElement,
  imageDataUrl: string,
  step: BikeGeometryStep,
  existingPoints: PlacedPoint[],
  onComplete: (result: BikeGeometryResult) => void,
): BikeGeometryCanvasController

export interface BikeGeometryCanvasController {
  getCurrentPoints: () => PlacedPoint[];
  reset: () => void;         // clears all points, restarts from point 0
  goTo: (index: number) => void; // jump to a specific point prompt
}
```

### Sequential prompt flow

1. Image is drawn onto the canvas at natural resolution (CSS-scaled to fit).
2. Prompt bar above canvas: `"Tap the {point.label} ({n} of {total})"` — amber pulsing crosshair follows cursor/finger.
3. On tap:
   - Point recorded as normalised coordinates `(tapX / canvas.width, tapY / canvas.height)`.
   - Green dot + label drawn at tap position.
   - Line(s) connecting related points drawn in blue (`#60a5fa`, 1px dashed) as each new point is placed.
   - Advance to next point prompt automatically.
4. After all points placed: angles computed, `onComplete` called with the result.
5. Navigation:
   - **Prev** — go back one point (removes the last placed dot, re-prompts).
   - **Skip** — advance without placing this point (angle requiring it will be omitted).
   - **Retake** — clears all points, re-prompts from point 1 (photo stays).
   - Already-placed points remain visible as green dots while navigating.

### Coordinate handling

Tap events use `canvas.getBoundingClientRect()` to map screen coords to canvas coords, then normalise to 0–1. This makes stored coordinates resolution-independent and future-proof for auto-detection (a detector would emit the same 0–1 format).

---

## 4. Angle Calculation (`bikeGeometryMetrics.ts` — new file)

`bike/src/analysis/bikeGeometryMetrics.ts` — pure functions, no DOM dependency.

```ts
export function computeBikeAngles(
  points: PlacedPoint[],
  angleDefs: AngleDefinition[],
  imageAspectRatio: number,
): BikeAngleMeasurement[]
```

- Coordinates are de-normalised using the image aspect ratio before angle computation so that perspective distortion from non-square images is corrected.
- `reference: 'horizontal'` — acute angle (0–90°) between the A→B vector and the horizontal axis; sign applied separately where direction matters (e.g. saddle tilt uses signed value: positive = nose-up).
- `reference: 'vertical'` — acute angle (0–90°) between the A→B vector and the vertical axis.
- `reference: 'ab_to_c'` — interior angle at B between A, B, C (standard 3-point angle, same as existing `angleBetweenThreePoints`).
- If any required point is missing (skipped), that angle is omitted from results rather than erroring.

---

## 5. `fitGuide.ts` — Integration

`initFitGuide` is updated to handle `FitStep[]` instead of `FitPosition[]`.

### Step rendering dispatch

```ts
function renderStep() {
  const step = steps[currentStep];
  if (step.kind === 'bike') {
    renderBikeGeometryStep(step);
  } else {
    renderRiderStep(step); // existing logic, unchanged
  }
}
```

`renderBikeGeometryStep` shows the upload area, then on photo load initialises `initBikeGeometryCanvas`. Navigation buttons (prev/next/skip/retake) are wired through the canvas controller.

`BikeGeometryResult` objects accumulate in a `bikeGeometryResults: BikeGeometryResult[]` array alongside the existing `positionResults`.

`onComplete` fires with the updated `FitSessionResults` including both arrays.

### Position selector

`renderSelection` is refactored to render two labelled sections (Bike Geometry, Rider on Bike) with cascading parent checkboxes. The `FIT_STEPS` array is filtered by selected IDs to produce the active step list, preserving the existing ordering (bike first, rider second).

---

## 6. Results Panel

`fitGuide.ts` → `renderResults()` prepends a **Bike Geometry** section above the existing rider position sections.

Each `BikeGeometryResult` renders as:
- Section heading: step name (e.g. "Full Bike Side View")
- The annotated photo (canvas snapshot with dots and lines) at reduced size
- Metric table: angle label | value° | normal range (same `.metric-table` class)

No new CSS classes required; reuses existing `.fit-result-section` and `.metric-table`.

---

## 7. PDF Export

`pdfGenerator.ts` — `generateBikeReport` receives the extended `FitSessionResults`. It renders a "Bike Geometry" section before the rider sections, including the annotated photo and angle table for each bike step.

---

## 8. Files Changed

| File | Change |
|---|---|
| `bike/src/config/defaults.ts` | Add `BikePoint`, `AngleDefinition`, `RiderStep`, `BikeGeometryStep`, `FitStep`; replace `FIT_POSITIONS: FitPosition[]` with `FIT_STEPS: FitStep[]`; add `bike_side` and `bike_rear` step definitions |
| `bike/src/analysis/types.ts` | Add `PlacedPoint`, `BikeAngleMeasurement`, `BikeGeometryResult`; extend `FitSessionResults` |
| `bike/src/analysis/bikeGeometryMetrics.ts` | **New** — `computeBikeAngles()` |
| `bike/src/ui/bikeGeometryCanvas.ts` | **New** — `initBikeGeometryCanvas()`, `BikeGeometryCanvasController` |
| `bike/src/ui/fitGuide.ts` | Handle `FitStep[]`; dispatch rider vs bike rendering; update `renderSelection` with two sections + cascading checkboxes; accumulate `bikeGeometryResults` |
| `bike/src/report/pdfGenerator.ts` | Add Bike Geometry section to report |
| `bike/src/main.ts` | Update `initFitGuide` call signature; pass extended results to PDF generator |

---

## 9. Out of Scope

- Distance / length measurements (deferred — requires scale reference)
- Automatic bike landmark detection (deferred — no production-ready browser model exists; architecture is open-ended to add this by pre-populating `PlacedPoint[]`)
- Ride mode changes
- New CSS (reuses existing classes throughout)
