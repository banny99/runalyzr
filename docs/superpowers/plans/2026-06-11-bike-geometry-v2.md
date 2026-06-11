# Bike Geometry Photo Fitting v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bike-only geometry photo measurement (tap points on a bike photo, get frame angles) to the Bikealyzr fit session, with a fullscreen point-placement mode incl. magnifier loupe.

**Architecture:** Pure angle math + step config ported from the abandoned `feature/bike-geometry` branch; a brand-new self-contained fullscreen overlay component (`pointPlacement.ts`) that owns its DOM and never shares layout with the step card; `fitGuide.ts` dispatches rider vs bike steps and awaits the overlay's promise. Annotated photos are rendered offscreen at full resolution for results and PDF.

**Tech Stack:** TypeScript, Vite 8, Vitest 4, Canvas 2D, jsPDF 4 (via `@runalyzr/shared/pdf`). No new dependencies.

**Branch:** `feature/bike-geometry-v2` (already created, spec committed). Work from repo root; all test/build commands run inside `bike/` unless noted.

**Spec:** `docs/superpowers/specs/2026-06-11-bike-geometry-redo-design.md`

**Reference code from the old branch** (read-only, do not check out): view with `git show feature/bike-geometry:bike/src/<path>`.

---

### Task 1: Step config types + `FIT_STEPS` in defaults.ts

The discriminated union for fit steps and the two bike-geometry step definitions. `FIT_POSITIONS` stays in place for now (fitGuide still uses it); it is removed in Task 8.

**Files:**
- Modify: `bike/src/config/defaults.ts` (insert after the `OVERLAY_COLORS` block, before the existing `// ── Fit positions ──` section)

- [ ] **Step 1: Add the new types and `FIT_STEPS`**

Insert this block into `bike/src/config/defaults.ts` immediately after the `OVERLAY_COLORS` const:

```ts
// ── Fit step types ─────────────────────────────────────────────────────────

export interface BikePoint {
  id: string;
  label: string;
}

export type AngleDefinition =
  | { id: string; label: string; pointA: string; pointB: string; pointC?: never; reference: 'horizontal' | 'vertical'; signed?: true; normalRange: string }
  | { id: string; label: string; pointA: string; pointB: string; pointC: string; reference: 'ab_to_c'; normalRange: string };

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

export const FIT_STEPS: FitStep[] = [
  // ── Bike geometry (no rider) ─────────────────────────────────────────────
  {
    kind: 'bike',
    id: 'bike_side',
    name: 'Full Bike Side View',
    view: 'side',
    instructions: 'Place the bike on a trainer or lean it against a wall. Stand 3–5 m away at hub height, pure side-on. The full bike should be visible.',
    points: [
      { id: 'bb_centre',        label: 'Bottom bracket centre' },
      { id: 'seat_tube_top',    label: 'Seat tube top (saddle clamp)' },
      { id: 'head_tube_top',    label: 'Head tube top (stem clamp)' },
      { id: 'head_tube_bottom', label: 'Head tube bottom (fork crown)' },
      { id: 'handlebar_centre', label: 'Handlebar centre' },
      { id: 'saddle_nose',      label: 'Saddle nose' },
      { id: 'saddle_centre',    label: 'Saddle centre' },
    ],
    angles: [
      { id: 'seat_tube_angle', label: 'Seat Tube Angle',          pointA: 'bb_centre',        pointB: 'seat_tube_top',    reference: 'horizontal', normalRange: '72–74°' },
      { id: 'head_tube_angle', label: 'Head Tube Angle',          pointA: 'head_tube_bottom', pointB: 'head_tube_top',    reference: 'horizontal', normalRange: '71–74°' },
      { id: 'saddle_tilt',     label: 'Saddle Tilt',              pointA: 'saddle_nose',      pointB: 'saddle_centre',    reference: 'horizontal', signed: true, normalRange: '±2°' },
      { id: 'bar_drop_angle',  label: 'Bar-to-Saddle Drop Angle', pointA: 'saddle_centre',    pointB: 'handlebar_centre', reference: 'horizontal', normalRange: 'Context-dependent' },
    ],
  },
  {
    kind: 'bike',
    id: 'bike_rear',
    name: 'Bike Rear View',
    view: 'rear',
    instructions: 'Move camera to directly behind the bike. Keep the bike upright and centred in frame.',
    points: [
      { id: 'saddle_left',  label: 'Saddle left rail end' },
      { id: 'saddle_right', label: 'Saddle right rail end' },
      { id: 'bar_left',     label: 'Handlebar left end' },
      { id: 'bar_right',    label: 'Handlebar right end' },
    ],
    angles: [
      { id: 'saddle_level', label: 'Saddle Level', pointA: 'saddle_left', pointB: 'saddle_right', reference: 'horizontal', normalRange: '< 2°' },
      { id: 'bar_level',    label: 'Bar Level',    pointA: 'bar_left',    pointB: 'bar_right',    reference: 'horizontal', normalRange: '< 2°' },
    ],
  },
  // ── Rider on bike (mirrors FIT_POSITIONS; FIT_POSITIONS removed in Task 8) ─
  { kind: 'rider', id: 'side_6oclock',  name: '6 o\'clock — Side',           view: 'side',  instructions: 'Position pedal straight down (6 o\'clock). Stand camera at hip height, 3–5m away, from the rider\'s right side.', keyMeasurements: ['Knee extension at BDC', 'Saddle height indicator'] },
  { kind: 'rider', id: 'side_3oclock',  name: '3 o\'clock — Side',           view: 'side',  instructions: 'Position pedal forward (3 o\'clock). Keep camera position from previous step.',  keyMeasurements: ['Knee-over-pedal stack (KOPS)', 'Hip angle'] },
  { kind: 'rider', id: 'side_9oclock',  name: '9 o\'clock — Side',           view: 'side',  instructions: 'Position pedal back (9 o\'clock). Keep camera position from previous step.',     keyMeasurements: ['Hip extension', 'Back angle'] },
  { kind: 'rider', id: 'side_neutral',  name: 'Neutral Seated — Side',       view: 'side',  instructions: 'Rider sits naturally on the bike, hands on hoods or bars. Keep camera position.', keyMeasurements: ['Torso angle', 'Reach', 'Elbow angle'] },
  { kind: 'rider', id: 'side_aero',     name: 'Aero / Drop — Side (optional)', view: 'side', instructions: 'Rider in aero position or on the drops. Skip if not applicable.',                keyMeasurements: ['Reach in aero', 'Elbow angle', 'Back angle'] },
  { kind: 'rider', id: 'rear_6oclock',  name: '6 o\'clock — Rear',           view: 'rear',  instructions: 'Move camera to directly behind the rider. Pedal at 6 o\'clock.',                  keyMeasurements: ['Hip levelness', 'Knee alignment L vs R'] },
  { kind: 'rider', id: 'rear_neutral',  name: 'Neutral Seated — Rear',       view: 'rear',  instructions: 'Rider sits naturally. Camera stays behind.',                                     keyMeasurements: ['Saddle tilt effect', 'Overall symmetry'] },
  { kind: 'rider', id: 'front_6oclock', name: '6 o\'clock — Front',          view: 'front', instructions: 'Move camera to directly in front of the rider. Pedal at 6 o\'clock.',             keyMeasurements: ['Knee tracking L/R', 'Shoulder level'] },
  { kind: 'rider', id: 'front_neutral', name: 'Neutral Seated — Front',      view: 'front', instructions: 'Rider sits naturally. Camera stays in front.',                                    keyMeasurements: ['Frontal plane symmetry', 'Head position'] },
];
```

Note: `FitView` already exists in this file (`export type FitView = 'side' | 'rear' | 'front';` inside the `// ── Fit positions ──` section). Do NOT redeclare it — the new block must come after it, or move the existing `FitView` declaration up to the top of the new block and delete the old one. Either way there must be exactly one `FitView` declaration.

- [ ] **Step 2: Type-check**

Run: `cd bike && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run existing tests**

Run: `cd bike && npm test`
Expected: 34 tests pass (no behavior changed).

- [ ] **Step 4: Commit**

```bash
git add bike/src/config/defaults.ts
git commit -m "feat(bike): add FitStep discriminated union and FIT_STEPS with bike geometry steps"
```

---

### Task 2: Result types + `FitSessionResults` extension

**Files:**
- Modify: `bike/src/analysis/types.ts` (the `// ── Fit mode ──` section)
- Modify: `bike/src/ui/fitGuide.ts` (only the three `FitSessionResults` construction sites)
- Modify: `bike/src/main.ts` (no change expected — verify only)

- [ ] **Step 1: Add result types**

In `bike/src/analysis/types.ts`, insert before the `// ── Fit mode ──` section:

```ts
// ── Bike geometry fit ──────────────────────────────────────────────────────

export interface PlacedPoint {
  id: string;
  x: number; // 0–1 normalised within the photo (x / image width)
  y: number; // 0–1 normalised within the photo (y / image height)
}

export interface BikeAngleMeasurement {
  id: string;
  label: string;
  value: number;      // degrees, rounded to 1 dp
  normalRange: string;
}

export interface BikeGeometryResult {
  stepId: string;
  stepName: string;
  imageDataUrl: string;  // annotated full-resolution render (photo + dots + lines + labels)
  imageAspect: number;   // naturalWidth / naturalHeight — needed for PDF layout
  points: PlacedPoint[];
  angles: BikeAngleMeasurement[];
}
```

And change `FitSessionResults` to:

```ts
export interface FitSessionResults {
  positions: FitPositionResult[];
  bikeGeometry: BikeGeometryResult[];
}
```

- [ ] **Step 2: Fix the construction sites in fitGuide.ts**

`bike/src/ui/fitGuide.ts` builds `FitSessionResults` in three places (two identical blocks in the `nextBtn`/`skipBtn` listeners and one in `getResults`). Update each:

```ts
// nextBtn and skipBtn listeners:
const results: FitSessionResults = { positions: [...positionResults], bikeGeometry: [] };
// getResults:
getResults: () => ({ positions: [...positionResults], bikeGeometry: [] }),
```

- [ ] **Step 3: Type-check both apps** (shared types untouched, but be thorough)

Run: `cd bike && npx tsc --noEmit`
Expected: no errors. (`main.ts` only reads `fitResults.positions` via the PDF path — adding a field is compile-safe.)

- [ ] **Step 4: Run tests**

Run: `cd bike && npm test`
Expected: 34 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bike/src/analysis/types.ts bike/src/ui/fitGuide.ts
git commit -m "feat(bike): add bike geometry result types, extend FitSessionResults"
```

---

### Task 3: `bikeGeometryMetrics.ts` — angle math (TDD, ported)

**Files:**
- Create: `bike/src/analysis/bikeGeometryMetrics.test.ts`
- Create: `bike/src/analysis/bikeGeometryMetrics.ts`

- [ ] **Step 1: Write the failing tests** (ported from the old branch + one new test for `anglePointPairs`)

Create `bike/src/analysis/bikeGeometryMetrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeBikeAngles, anglePointPairs } from './bikeGeometryMetrics';
import type { PlacedPoint } from './types';
import type { AngleDefinition } from '../config/defaults';

const AR = 4 / 3; // typical landscape aspect ratio for tests

describe('computeBikeAngles', () => {
  it('computes 90° for a perfectly vertical tube', () => {
    const points: PlacedPoint[] = [
      { id: 'bb_centre',     x: 0.5, y: 0.8 },
      { id: 'seat_tube_top', x: 0.5, y: 0.2 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'seat_tube_angle', label: 'Seat Tube Angle',
      pointA: 'bb_centre', pointB: 'seat_tube_top',
      reference: 'horizontal', normalRange: '72–74°',
    }];
    const result = computeBikeAngles(points, defs, AR);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBeCloseTo(90, 0);
    expect(result[0].id).toBe('seat_tube_angle');
  });

  it('computes 0° for a perfectly horizontal tube', () => {
    const points: PlacedPoint[] = [
      { id: 'saddle_left',  x: 0.2, y: 0.5 },
      { id: 'saddle_right', x: 0.8, y: 0.5 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'saddle_level', label: 'Saddle Level',
      pointA: 'saddle_left', pointB: 'saddle_right',
      reference: 'horizontal', normalRange: '< 2°',
    }];
    expect(computeBikeAngles(points, defs, AR)[0].value).toBeCloseTo(0, 1);
  });

  it('returns positive signed tilt when nose is higher than centre (nose-up)', () => {
    const points: PlacedPoint[] = [
      { id: 'saddle_nose',   x: 0.3, y: 0.38 }, // higher (smaller y)
      { id: 'saddle_centre', x: 0.5, y: 0.42 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'saddle_tilt', label: 'Saddle Tilt',
      pointA: 'saddle_nose', pointB: 'saddle_centre',
      reference: 'horizontal', signed: true, normalRange: '±2°',
    }];
    expect(computeBikeAngles(points, defs, AR)[0].value).toBeGreaterThan(0);
  });

  it('returns negative signed tilt when nose is lower than centre (nose-down)', () => {
    const points: PlacedPoint[] = [
      { id: 'saddle_nose',   x: 0.3, y: 0.46 }, // lower (bigger y)
      { id: 'saddle_centre', x: 0.5, y: 0.42 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'saddle_tilt', label: 'Saddle Tilt',
      pointA: 'saddle_nose', pointB: 'saddle_centre',
      reference: 'horizontal', signed: true, normalRange: '±2°',
    }];
    expect(computeBikeAngles(points, defs, AR)[0].value).toBeLessThan(0);
  });

  it('omits angles where a required point is missing', () => {
    const points: PlacedPoint[] = [{ id: 'bb_centre', x: 0.5, y: 0.8 }];
    const defs: AngleDefinition[] = [{
      id: 'seat_tube_angle', label: 'Seat Tube Angle',
      pointA: 'bb_centre', pointB: 'seat_tube_top',
      reference: 'horizontal', normalRange: '72–74°',
    }];
    expect(computeBikeAngles(points, defs, AR)).toHaveLength(0);
  });

  it('returns empty array when points array is empty', () => {
    const defs: AngleDefinition[] = [{
      id: 'seat_tube_angle', label: 'Seat Tube Angle',
      pointA: 'bb_centre', pointB: 'seat_tube_top',
      reference: 'horizontal', normalRange: '72–74°',
    }];
    expect(computeBikeAngles([], defs, AR)).toHaveLength(0);
  });

  it('values are rounded to 1 decimal place', () => {
    const points: PlacedPoint[] = [
      { id: 'a', x: 0.1, y: 0.9 },
      { id: 'b', x: 0.4, y: 0.2 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'test', label: 'Test', pointA: 'a', pointB: 'b',
      reference: 'horizontal', normalRange: '—',
    }];
    const result = computeBikeAngles(points, defs, AR);
    expect(result[0].value).toBe(parseFloat(result[0].value.toFixed(1)));
  });

  it('computes 0° for a perfectly vertical tube using vertical reference', () => {
    const points: PlacedPoint[] = [
      { id: 'ht_bottom', x: 0.5, y: 0.7 },
      { id: 'ht_top',    x: 0.5, y: 0.2 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'head_tube_angle', label: 'Head Tube Angle',
      pointA: 'ht_bottom', pointB: 'ht_top',
      reference: 'vertical', normalRange: '71–74°',
    }];
    expect(computeBikeAngles(points, defs, AR)[0].value).toBeCloseTo(0, 1);
  });

  it('computes the interior angle for ab_to_c reference', () => {
    // Right angle: A above B, C to the right of B (square aspect for easy math)
    const points: PlacedPoint[] = [
      { id: 'a', x: 0.5, y: 0.2 },
      { id: 'b', x: 0.5, y: 0.5 },
      { id: 'c', x: 0.8, y: 0.5 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'corner', label: 'Corner', pointA: 'a', pointB: 'b', pointC: 'c',
      reference: 'ab_to_c', normalRange: '—',
    }];
    expect(computeBikeAngles(points, defs, 1)[0].value).toBeCloseTo(90, 0);
  });
});

describe('anglePointPairs', () => {
  it('derives connection pairs from two-point and three-point definitions', () => {
    const defs: AngleDefinition[] = [
      { id: 'x', label: 'X', pointA: 'a', pointB: 'b', reference: 'horizontal', normalRange: '—' },
      { id: 'y', label: 'Y', pointA: 'p', pointB: 'q', pointC: 'r', reference: 'ab_to_c', normalRange: '—' },
    ];
    expect(anglePointPairs(defs)).toEqual([['a', 'b'], ['p', 'q'], ['q', 'r']]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bike && npx vitest run src/analysis/bikeGeometryMetrics.test.ts`
Expected: FAIL — cannot resolve `./bikeGeometryMetrics`.

- [ ] **Step 3: Create the implementation** (ported; `anglePointPairs` is new — it centralizes the line-pair derivation that both the placement overlay and the annotated render need)

Create `bike/src/analysis/bikeGeometryMetrics.ts`:

```ts
import type { AngleDefinition } from '../config/defaults';
import type { PlacedPoint, BikeAngleMeasurement } from './types';

/** Point-id pairs to draw as connection lines, derived from angle definitions. */
export function anglePointPairs(angleDefs: AngleDefinition[]): [string, string][] {
  return angleDefs.flatMap((a): [string, string][] =>
    a.pointC !== undefined
      ? [[a.pointA, a.pointB], [a.pointB, a.pointC]]
      : [[a.pointA, a.pointB]],
  );
}

export function computeBikeAngles(
  points: PlacedPoint[],
  angleDefs: AngleDefinition[],
  aspectRatio: number, // image width / height
): BikeAngleMeasurement[] {
  const byId = Object.fromEntries(points.map((p) => [p.id, p]));
  const results: BikeAngleMeasurement[] = [];

  for (const def of angleDefs) {
    const pA = byId[def.pointA];
    const pB = byId[def.pointB];
    if (!pA || !pB) continue;

    let value: number;

    if (def.reference === 'horizontal' || def.reference === 'vertical') {
      // De-normalise: scale x by aspectRatio so both axes share the same unit.
      // Canvas y=0 is the top, so dy is positive going downward in the image.
      const dx = (pB.x - pA.x) * aspectRatio;
      const dy = pB.y - pA.y;

      if (def.reference === 'horizontal') {
        if (def.signed) {
          // Signed: positive when A sits visually higher than B (saddle nose-up).
          // A higher than B → pA.y < pB.y (canvas y grows downward) → dy > 0.
          value = Math.atan2(dy, Math.abs(dx)) * (180 / Math.PI);
        } else {
          value = Math.atan2(Math.abs(dy), Math.abs(dx)) * (180 / Math.PI);
        }
      } else {
        value = Math.atan2(Math.abs(dx), Math.abs(dy)) * (180 / Math.PI);
      }
    } else {
      // ab_to_c: interior angle at B
      const pC = byId[def.pointC];
      if (!pC) continue;
      const ax = (pA.x - pB.x) * aspectRatio;
      const ay = pA.y - pB.y;
      const cx = (pC.x - pB.x) * aspectRatio;
      const cy = pC.y - pB.y;
      const dot = ax * cx + ay * cy;
      const mag = Math.sqrt((ax * ax + ay * ay) * (cx * cx + cy * cy));
      value = mag === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
    }

    results.push({
      id: def.id,
      label: def.label,
      value: parseFloat(value.toFixed(1)),
      normalRange: def.normalRange,
    });
  }

  return results;
}
```

The two nose-up/nose-down tests in Step 1 are the source of truth for the sign convention — if they fail, fix the formula, not the tests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bike && npx vitest run src/analysis/bikeGeometryMetrics.test.ts`
Expected: 10 tests PASS. If the signed tests fail, flip the sign per the note above — the tests define correctness.

- [ ] **Step 5: Run the full suite + type-check**

Run: `cd bike && npm test && npx tsc --noEmit`
Expected: 44 tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add bike/src/analysis/bikeGeometryMetrics.ts bike/src/analysis/bikeGeometryMetrics.test.ts
git commit -m "feat(bike): port computeBikeAngles with signed-angle tests, add anglePointPairs"
```

---

### Task 4: `placementSequence.ts` — active-point sequencing (TDD)

Tiny pure helper so the overlay's "which point is next" logic is unit-tested.

**Files:**
- Create: `bike/src/ui/placementSequence.test.ts`
- Create: `bike/src/ui/placementSequence.ts`

- [ ] **Step 1: Write the failing tests**

Create `bike/src/ui/placementSequence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { firstUnplacedFrom } from './placementSequence';
import type { BikePoint } from '../config/defaults';

const POINTS: BikePoint[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
];

describe('firstUnplacedFrom', () => {
  it('returns the start index when that point is unplaced', () => {
    expect(firstUnplacedFrom(POINTS, new Set(), 0)).toBe(0);
  });

  it('skips already-placed points', () => {
    expect(firstUnplacedFrom(POINTS, new Set(['a', 'b']), 0)).toBe(2);
  });

  it('scans forward from the given index', () => {
    expect(firstUnplacedFrom(POINTS, new Set(['b']), 1)).toBe(2);
  });

  it('returns points.length when everything from the index on is placed', () => {
    expect(firstUnplacedFrom(POINTS, new Set(['a', 'b', 'c']), 0)).toBe(3);
    expect(firstUnplacedFrom(POINTS, new Set(['c']), 2)).toBe(3);
  });

  it('clamps negative start indices to 0', () => {
    expect(firstUnplacedFrom(POINTS, new Set(['a']), -5)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd bike && npx vitest run src/ui/placementSequence.test.ts`
Expected: FAIL — cannot resolve `./placementSequence`.

- [ ] **Step 3: Implement**

Create `bike/src/ui/placementSequence.ts`:

```ts
import type { BikePoint } from '../config/defaults';

/**
 * Index of the first point at or after `from` that has not been placed yet.
 * Returns `stepPoints.length` when none remain (the "all placed" state).
 */
export function firstUnplacedFrom(
  stepPoints: BikePoint[],
  placedIds: Set<string>,
  from: number,
): number {
  for (let i = Math.max(0, from); i < stepPoints.length; i++) {
    if (!placedIds.has(stepPoints[i].id)) return i;
  }
  return stepPoints.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bike && npx vitest run src/ui/placementSequence.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add bike/src/ui/placementSequence.ts bike/src/ui/placementSequence.test.ts
git commit -m "feat(bike): add firstUnplacedFrom placement sequencing helper"
```

---

### Task 5: `annotatedBikePhoto.ts` — full-resolution annotated render

Canvas/DOM code — no unit test (repo convention); verified visually in Task 8.

**Files:**
- Create: `bike/src/ui/annotatedBikePhoto.ts`

- [ ] **Step 1: Implement**

Create `bike/src/ui/annotatedBikePhoto.ts`:

```ts
import type { BikeGeometryStep } from '../config/defaults';
import type { PlacedPoint, BikeAngleMeasurement } from '../analysis/types';
import { anglePointPairs } from '../analysis/bikeGeometryMetrics';

/**
 * Draws the photo with placed points, connection lines and an angle summary
 * box at the image's natural resolution. Returns a JPEG data URL used by the
 * results panel and PDF. (v1 snapshotted the small on-screen canvas instead —
 * its result images were unusably low-res.)
 */
export function renderAnnotatedBikePhoto(
  img: HTMLImageElement,
  step: BikeGeometryStep,
  points: PlacedPoint[],
  angles: BikeAngleMeasurement[],
): string {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const dotR = Math.max(6, Math.round(W * 0.008));
  const fontPx = Math.max(16, Math.round(W * 0.018));
  const byId = Object.fromEntries(points.map((p) => [p.id, p]));

  // Connection lines
  ctx.save();
  ctx.setLineDash([dotR, dotR * 0.7]);
  ctx.lineWidth = Math.max(2, W * 0.002);
  ctx.strokeStyle = '#60a5fa';
  ctx.globalAlpha = 0.8;
  for (const [aId, bId] of anglePointPairs(step.angles)) {
    const pA = byId[aId];
    const pB = byId[bId];
    if (!pA || !pB) continue;
    ctx.beginPath();
    ctx.moveTo(pA.x * W, pA.y * H);
    ctx.lineTo(pB.x * W, pB.y * H);
    ctx.stroke();
  }
  ctx.restore();

  // Dots + short labels
  ctx.font = `bold ${fontPx}px sans-serif`;
  for (const p of points) {
    const px = p.x * W;
    const py = p.y * H;
    ctx.beginPath();
    ctx.arc(px, py, dotR, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = Math.max(2, dotR * 0.25);
    ctx.stroke();
    const shortLabel = step.points.find((pt) => pt.id === p.id)?.label.split(' ')[0] ?? p.id;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = Math.max(2, fontPx * 0.15);
    ctx.strokeText(shortLabel, px + dotR + 4, py + fontPx * 0.35);
    ctx.fillText(shortLabel, px + dotR + 4, py + fontPx * 0.35);
  }

  // Angle summary box (top-left)
  if (angles.length > 0) {
    const pad = fontPx * 0.6;
    const lineH = fontPx * 1.35;
    const lines = angles.map((a) => `${a.label}: ${a.value}°`);
    let boxW = 0;
    for (const line of lines) boxW = Math.max(boxW, ctx.measureText(line).width);
    ctx.fillStyle = 'rgba(10, 12, 16, 0.75)';
    ctx.fillRect(pad, pad, boxW + pad * 2, lines.length * lineH + pad * 1.5);
    ctx.fillStyle = '#e2e8f0';
    lines.forEach((line, i) => {
      ctx.fillText(line, pad * 2, pad * 1.6 + (i + 0.6) * lineH);
    });
  }

  return canvas.toDataURL('image/jpeg', 0.85);
}
```

- [ ] **Step 2: Type-check**

Run: `cd bike && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add bike/src/ui/annotatedBikePhoto.ts
git commit -m "feat(bike): full-resolution annotated bike photo renderer"
```

---

### Task 6: CSS — placement overlay, badges, progress bar, selection sections

**Files:**
- Modify: `bike/src/ui/styles.css` (append at end of file)

- [ ] **Step 1: Append the new styles**

```css
/* ── Fullscreen point placement ─────────────────────────────────────── */
.pp-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #0b0d11;
}
.pp-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}
.pp-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px;
  padding: 10px 14px;
  background: rgba(10, 12, 16, 0.85);
  border-radius: 10px;
  color: #e2e8f0;
}
.pp-prompt { flex: 1; font-size: 0.95rem; }
.pp-prompt b { color: #f59e0b; }
.pp-cancel {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.1rem;
  padding: 4px 8px;
  cursor: pointer;
}
.pp-loupe {
  position: fixed;
  z-index: 3;
  border: 2px solid #f59e0b;
  border-radius: 50%;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  background: #0b0d11;
}
.pp-bottombar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: 10px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background: rgba(10, 12, 16, 0.85);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pp-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.pp-chip {
  white-space: nowrap;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 0.8rem;
  background: #1d2330;
  color: #94a3b8;
  border: 1px solid transparent;
  cursor: pointer;
}
.pp-chip.placed { background: #14532d; color: #bbf7d0; }
.pp-chip.active { border-color: #f59e0b; color: #fcd34d; background: #2a2412; }
.pp-actions { display: flex; gap: 8px; }
.pp-actions button {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: none;
  background: #1d2330;
  color: #e2e8f0;
  font-size: 0.9rem;
  cursor: pointer;
}
.pp-actions .pp-done { flex: 2; background: #14532d; font-weight: 600; }
.pp-actions button:disabled { opacity: 0.4; cursor: default; }

/* ── Step header polish ─────────────────────────────────────────────── */
.step-badge {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 999px;
  margin-left: 8px;
  vertical-align: middle;
}
.step-badge-bike { background: #1e3a5f; color: #7dd3fc; }
.step-badge-rider { background: #14321f; color: #86efac; }
.fit-progress {
  height: 4px;
  background: #1d2330;
  border-radius: 2px;
  margin: 6px 0 10px;
  overflow: hidden;
}
#fit-progress-fill {
  height: 100%;
  width: 0;
  background: #22c55e;
  border-radius: 2px;
  transition: width 0.25s ease;
}

/* ── Selection sections ─────────────────────────────────────────────── */
.position-section {
  border: 1px solid #232a35;
  border-radius: 10px;
  margin-bottom: 10px;
  overflow: hidden;
}
.position-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: #161a22;
  font-weight: 600;
  cursor: pointer;
}
.position-section-badge {
  margin-left: auto;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: #1e3a5f;
  color: #7dd3fc;
}
.position-section-badge.rider { background: #14321f; color: #86efac; }
.position-view-label {
  padding: 6px 12px 2px;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  color: #64748b;
  text-transform: uppercase;
}
.position-section .position-toggle { padding-left: 12px; padding-right: 12px; }
```

Before committing, open the existing `styles.css` and check `.position-toggle`'s current padding — if it already includes horizontal padding, drop the last rule.

- [ ] **Step 2: Build to verify CSS parses**

Run: `cd bike && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add bike/src/ui/styles.css
git commit -m "feat(bike): styles for placement overlay, step badges, selection sections"
```

---

### Task 7: `pointPlacement.ts` — fullscreen placement overlay

The core new component. Self-contained: builds its own DOM under `document.body`, locks scroll, returns a promise. Tap to place; touch press-drag shows a magnifier loupe and places on release; chips jump between points; Undo/Skip/Done/Cancel; Escape/Enter; window resize redraw.

**Files:**
- Create: `bike/src/ui/pointPlacement.ts`

- [ ] **Step 1: Implement the component**

Create `bike/src/ui/pointPlacement.ts`:

```ts
import type { BikeGeometryStep } from '../config/defaults';
import type { PlacedPoint } from '../analysis/types';
import { anglePointPairs } from '../analysis/bikeGeometryMetrics';
import { firstUnplacedFrom } from './placementSequence';

const LOUPE_CSS_SIZE = 120; // px
const LOUPE_ZOOM = 2.5;
const LOUPE_OFFSET_Y = 90;  // px above the finger

/**
 * Fullscreen tap-to-place mode for bike geometry points.
 * Resolves with the placed points on Done, or null on Cancel.
 * Owns its DOM completely — nothing is shared with the step card.
 */
export function openPointPlacement(
  img: HTMLImageElement,
  step: BikeGeometryStep,
  existingPoints: PlacedPoint[],
): Promise<PlacedPoint[] | null> {
  return new Promise((resolve) => {
    const points: PlacedPoint[] = existingPoints.map((p) => ({ ...p }));
    const placedOrder: string[] = points.map((p) => p.id);
    const placedIds = () => new Set(points.map((p) => p.id));
    let activeIndex = firstUnplacedFrom(step.points, placedIds(), 0);

    // ── DOM ─────────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'pp-overlay';
    root.innerHTML = `
      <canvas class="pp-canvas"></canvas>
      <div class="pp-topbar">
        <span class="pp-prompt"></span>
        <button class="pp-cancel" type="button" aria-label="Cancel">✕</button>
      </div>
      <canvas class="pp-loupe" hidden></canvas>
      <div class="pp-bottombar">
        <div class="pp-chips"></div>
        <div class="pp-actions">
          <button class="pp-undo" type="button">↩ Undo</button>
          <button class="pp-skip" type="button">Skip point</button>
          <button class="pp-done" type="button">Done ✓</button>
        </div>
      </div>`;
    document.body.appendChild(root);

    const canvas   = root.querySelector('.pp-canvas')  as HTMLCanvasElement;
    const loupe    = root.querySelector('.pp-loupe')   as HTMLCanvasElement;
    const promptEl = root.querySelector('.pp-prompt')  as HTMLElement;
    const chipsEl  = root.querySelector('.pp-chips')   as HTMLElement;
    const undoBtn  = root.querySelector('.pp-undo')    as HTMLButtonElement;
    const skipBtn  = root.querySelector('.pp-skip')    as HTMLButtonElement;
    const doneBtn  = root.querySelector('.pp-done')    as HTMLButtonElement;
    const cancelBtn = root.querySelector('.pp-cancel') as HTMLButtonElement;

    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const linePairs = anglePointPairs(step.angles);

    // ── Canvas sizing + image letterbox math ────────────────────────────
    // Points are normalised to the IMAGE (0–1 of natural size), not the
    // canvas — the canvas adds letterbox offsets that change on resize.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let drawX = 0, drawY = 0, drawW = 0, drawH = 0; // image rect in canvas px

    function sizeCanvas() {
      const cssW = root.clientWidth;
      const cssH = root.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      drawW = img.naturalWidth * scale;
      drawH = img.naturalHeight * scale;
      drawX = (canvas.width - drawW) / 2;
      drawY = (canvas.height - drawH) / 2;
    }

    function clientToImageNorm(clientX: number, clientY: number): { x: number; y: number } | null {
      const rect = canvas.getBoundingClientRect();
      const cx = ((clientX - rect.left) / rect.width) * canvas.width;
      const cy = ((clientY - rect.top) / rect.height) * canvas.height;
      const nx = (cx - drawX) / drawW;
      const ny = (cy - drawY) / drawH;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
      return { x: nx, y: ny };
    }

    // ── Drawing ─────────────────────────────────────────────────────────
    const DOT_R = () => Math.max(8 * dpr, Math.round(drawW * 0.012));

    function draw(cursor?: { x: number; y: number }) {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      const byId = Object.fromEntries(points.map((p) => [p.id, p]));
      const toPx = (p: { x: number; y: number }) => ({ x: drawX + p.x * drawW, y: drawY + p.y * drawH });

      // Connection lines
      ctx.save();
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = '#60a5fa';
      ctx.globalAlpha = 0.7;
      for (const [aId, bId] of linePairs) {
        const pA = byId[aId];
        const pB = byId[bId];
        if (!pA || !pB) continue;
        const a = toPx(pA);
        const b = toPx(pB);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();

      // Placed dots + short labels
      const r = DOT_R();
      ctx.font = `bold ${Math.max(12 * dpr, r)}px sans-serif`;
      for (const p of points) {
        const { x, y } = toPx(p);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
        const shortLabel = step.points.find((pt) => pt.id === p.id)?.label.split(' ')[0] ?? p.id;
        ctx.fillStyle = 'white';
        ctx.fillText(shortLabel, x + r + 3 * dpr, y + 4 * dpr);
      }

      // Crosshair for the cursor (mouse hover or touch drag)
      if (activeIndex < step.points.length && cursor) {
        const { x, y } = toPx(cursor);
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1 * dpr;
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Loupe (touch drag magnifier) ────────────────────────────────────
    function showLoupe(norm: { x: number; y: number }, clientX: number, clientY: number) {
      const size = LOUPE_CSS_SIZE;
      loupe.hidden = false;
      loupe.width = size * dpr;
      loupe.height = size * dpr;
      loupe.style.width = `${size}px`;
      loupe.style.height = `${size}px`;
      const left = Math.max(4, Math.min(window.innerWidth - size - 4, clientX - size / 2));
      const top = Math.max(4, clientY - LOUPE_OFFSET_Y - size / 2);
      loupe.style.left = `${left}px`;
      loupe.style.top = `${top}px`;

      const ctx = loupe.getContext('2d')!;
      // Source window on the original image: loupe shows screen pixels zoomed
      // LOUPE_ZOOM×, so source size = (loupe css px → canvas px → image px) / zoom.
      const imgPerCanvas = img.naturalWidth / drawW;
      const srcSize = ((size * dpr) / LOUPE_ZOOM) * imgPerCanvas;
      const sx = norm.x * img.naturalWidth - srcSize / 2;
      const sy = norm.y * img.naturalHeight - srcSize / 2;
      ctx.fillStyle = '#0b0d11';
      ctx.fillRect(0, 0, loupe.width, loupe.height);
      ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, loupe.width, loupe.height);
      // Crosshair
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.moveTo(loupe.width / 2, 0); ctx.lineTo(loupe.width / 2, loupe.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, loupe.height / 2); ctx.lineTo(loupe.width, loupe.height / 2); ctx.stroke();
    }

    function hideLoupe() { loupe.hidden = true; }

    // ── UI state ────────────────────────────────────────────────────────
    function updatePrompt() {
      if (activeIndex >= step.points.length) {
        promptEl.innerHTML = `All ${step.points.length} points placed — review, or tap a chip to adjust.`;
      } else {
        const pt = step.points[activeIndex];
        promptEl.innerHTML = `Tap the <b></b> <span style="opacity:.7">(${activeIndex + 1}/${step.points.length})</span>`;
        (promptEl.querySelector('b') as HTMLElement).textContent = pt.label;
      }
      undoBtn.disabled = placedOrder.length === 0;
      skipBtn.disabled = activeIndex >= step.points.length;
    }

    function updateChips() {
      chipsEl.innerHTML = '';
      const placed = placedIds();
      step.points.forEach((pt, i) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'pp-chip'
          + (placed.has(pt.id) ? ' placed' : '')
          + (i === activeIndex ? ' active' : '');
        chip.textContent = (placed.has(pt.id) ? '● ' : '○ ') + pt.label;
        chip.addEventListener('click', () => {
          activeIndex = i;
          refresh();
        });
        chipsEl.appendChild(chip);
      });
      chipsEl.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }

    function refresh(cursor?: { x: number; y: number }) {
      updatePrompt();
      updateChips();
      draw(cursor);
    }

    // ── Placement ───────────────────────────────────────────────────────
    function placeAt(norm: { x: number; y: number }) {
      if (activeIndex >= step.points.length) return;
      const def = step.points[activeIndex];
      const existing = points.findIndex((p) => p.id === def.id);
      const placed: PlacedPoint = { id: def.id, x: norm.x, y: norm.y };
      if (existing >= 0) points[existing] = placed;
      else points.push(placed);
      const orderIdx = placedOrder.indexOf(def.id);
      if (orderIdx >= 0) placedOrder.splice(orderIdx, 1);
      placedOrder.push(def.id);
      activeIndex = firstUnplacedFrom(step.points, placedIds(), activeIndex + 1);
      refresh();
    }

    // ── Pointer events ──────────────────────────────────────────────────
    // Touch: press-drag shows the loupe, release places.
    // Mouse: hover shows crosshair, click places.
    let dragging = false;
    let dragNorm: { x: number; y: number } | null = null;

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'touch') {
        const norm = clientToImageNorm(e.clientX, e.clientY);
        if (!norm || activeIndex >= step.points.length) return;
        e.preventDefault();
        dragging = true;
        dragNorm = norm;
        canvas.setPointerCapture(e.pointerId);
        draw(norm);
        showLoupe(norm, e.clientX, e.clientY);
      }
    }

    function onPointerMove(e: PointerEvent) {
      const norm = clientToImageNorm(e.clientX, e.clientY);
      if (e.pointerType === 'touch') {
        if (!dragging) return;
        e.preventDefault();
        if (norm) {
          dragNorm = norm;
          draw(norm);
          showLoupe(norm, e.clientX, e.clientY);
        }
      } else {
        draw(norm ?? undefined);
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerType === 'touch') {
        if (!dragging) return;
        dragging = false;
        hideLoupe();
        if (dragNorm) placeAt(dragNorm);
        dragNorm = null;
      } else {
        const norm = clientToImageNorm(e.clientX, e.clientY);
        if (norm) placeAt(norm);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      if (e.key === 'Enter')  { e.preventDefault(); finish([...points]); }
    }

    function onResize() {
      sizeCanvas();
      draw();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);

    undoBtn.addEventListener('click', () => {
      const id = placedOrder.pop();
      if (!id) return;
      const idx = points.findIndex((p) => p.id === id);
      if (idx >= 0) points.splice(idx, 1);
      activeIndex = step.points.findIndex((pt) => pt.id === id);
      refresh();
    });

    skipBtn.addEventListener('click', () => {
      activeIndex = firstUnplacedFrom(step.points, placedIds(), activeIndex + 1);
      refresh();
    });

    doneBtn.addEventListener('click', () => finish([...points]));
    cancelBtn.addEventListener('click', () => finish(null));

    function finish(result: PlacedPoint[] | null) {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = prevBodyOverflow;
      root.remove();
      resolve(result);
    }

    // ── Init ────────────────────────────────────────────────────────────
    sizeCanvas();
    refresh();
  });
}
```

- [ ] **Step 2: Type-check**

Run: `cd bike && npx tsc --noEmit`
Expected: no errors. (`noUnusedLocals` is on — make sure everything declared is used.)

- [ ] **Step 3: Run the full test suite**

Run: `cd bike && npm test`
Expected: 49 tests pass (44 from Task 3 state + 5 from Task 4).

- [ ] **Step 4: Commit**

```bash
git add bike/src/ui/pointPlacement.ts
git commit -m "feat(bike): fullscreen point placement overlay with magnifier loupe"
```

---

### Task 8: Integration — fitGuide.ts rewrite, index.html, main.ts

This wires everything together: `FIT_STEPS` replaces `FIT_POSITIONS`, the step renderer dispatches on `kind`, bike photos flow through the overlay, the selector gets two sections, results show bike geometry first.

**Files:**
- Modify: `bike/index.html` (step header + nav)
- Modify: `bike/src/ui/fitGuide.ts` (full rewrite, complete code below)
- Modify: `bike/src/main.ts` (element wiring)
- Modify: `bike/src/config/defaults.ts` (delete `FIT_POSITIONS` and `FitPosition`)

- [ ] **Step 1: index.html — add progress bar, badge, New Photo button**

In `bike/index.html`:

Replace:
```html
              <div id="fit-position-header">
                <span id="fit-view-label">Side View</span>
              </div>
```
with:
```html
              <div id="fit-position-header">
                <span id="fit-view-label">Side View</span>
                <span id="fit-step-badge" class="step-badge" hidden></span>
              </div>
              <div id="fit-progress" class="fit-progress"><div id="fit-progress-fill"></div></div>
```

Replace:
```html
                <button id="fit-retake-btn" hidden>Retake</button>
```
with:
```html
                <button id="fit-retake-btn" hidden>Retake</button>
                <button id="fit-newphoto-btn" hidden>New photo</button>
```

- [ ] **Step 2: Rewrite `bike/src/ui/fitGuide.ts`**

Replace the entire file with:

```ts
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { FIT_STEPS, POSE_CONNECTIONS, OVERLAY_COLORS } from '../config/defaults';
import type { FitStep, FitView, RiderStep, BikeGeometryStep } from '../config/defaults';
import { analyzeImage } from '../pose/processing';
import { measureFitPosition } from '../analysis/fitMetrics';
import { computeBikeAngles } from '../analysis/bikeGeometryMetrics';
import { renderAnnotatedBikePhoto } from './annotatedBikePhoto';
import { openPointPlacement } from './pointPlacement';
import type { FitPositionResult, FitSessionResults, BikeGeometryResult, PlacedPoint } from '../analysis/types';

export interface FitGuideController {
  start: () => void;
  reset: () => void;
  getResults: () => FitSessionResults;
}

export function initFitGuide(
  landmarker: PoseLandmarker,
  elements: {
    stepLabel: HTMLElement;
    stepBadge: HTMLElement;
    progressFill: HTMLElement;
    viewLabel: HTMLElement;
    positionName: HTMLElement;
    instructions: HTMLElement;
    canvasWrap: HTMLElement;
    canvas: HTMLCanvasElement;
    uploadArea: HTMLElement;
    fileInput: HTMLInputElement;
    uploadBtn: HTMLButtonElement;
    prevBtn: HTMLButtonElement;
    retakeBtn: HTMLButtonElement;
    newPhotoBtn: HTMLButtonElement;
    nextBtn: HTMLButtonElement;
    skipBtn: HTMLButtonElement;
    guidePanel: HTMLElement;
    positionSelectEl: HTMLElement;
    stepUiEl: HTMLElement;
    resultsEmpty: HTMLElement;
    resultsSections: HTMLElement;
    resultsContent: HTMLElement;
    exportBtn: HTMLElement;
  },
  onComplete: (results: FitSessionResults) => void,
): FitGuideController {
  let steps: FitStep[] = [];
  let currentStep = 0;
  const positionResults: FitPositionResult[] = [];
  const bikeGeometryResults: BikeGeometryResult[] = [];
  // Raw (un-annotated) photos so "Edit points" re-edits on the original image
  const bikeRawPhotos = new Map<string, string>();

  const viewText = (view: FitView) =>
    view === 'side' ? 'Side View' : view === 'rear' ? 'Rear View' : 'Front View';

  // ── Step rendering ────────────────────────────────────────────────────

  function renderStepHeader(step: FitStep) {
    const total = steps.length;
    elements.stepLabel.textContent = `Step ${currentStep + 1} of ${total}`;
    elements.progressFill.style.width = `${Math.round(((currentStep + 1) / total) * 100)}%`;
    elements.viewLabel.textContent = viewText(step.view);
    elements.stepBadge.hidden = false;
    elements.stepBadge.textContent = step.kind === 'bike' ? 'bike only' : 'with rider';
    elements.stepBadge.className =
      `step-badge ${step.kind === 'bike' ? 'step-badge-bike' : 'step-badge-rider'}`;
    elements.positionName.textContent = step.name;
    elements.prevBtn.disabled = currentStep === 0;
    elements.nextBtn.textContent = currentStep === total - 1 ? 'Finish →' : 'Next →';
  }

  function renderStep() {
    const step = steps[currentStep];
    renderStepHeader(step);
    if (step.kind === 'bike') renderBikeStep(step);
    else renderRiderStep(step);
  }

  function renderRiderStep(pos: RiderStep) {
    elements.instructions.textContent = pos.instructions;
    const hasResult = positionResults.some((r) => r.positionId === pos.id);
    elements.canvasWrap.hidden = !hasResult;
    elements.uploadArea.hidden = hasResult;
    elements.retakeBtn.hidden = !hasResult;
    elements.retakeBtn.textContent = 'Retake';
    elements.newPhotoBtn.hidden = true;
    elements.nextBtn.disabled = !hasResult;

    if (hasResult) {
      const result = positionResults.find((r) => r.positionId === pos.id)!;
      drawRiderResultOnCanvas(elements.canvas, result);
    }
  }

  function renderBikeStep(step: BikeGeometryStep) {
    const result = bikeGeometryResults.find((r) => r.stepId === step.id);
    elements.instructions.textContent = result
      ? 'Review the angles below — Edit points to adjust, or continue.'
      : step.instructions;
    elements.canvasWrap.hidden = !result;
    elements.uploadArea.hidden = !!result;
    elements.retakeBtn.hidden = !result;
    elements.retakeBtn.textContent = 'Edit points';
    elements.newPhotoBtn.hidden = !result;
    elements.nextBtn.disabled = !result;

    if (result) drawDataUrlOnCanvas(elements.canvas, result.imageDataUrl);
  }

  function drawDataUrlOnCanvas(canvas: HTMLCanvasElement, dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  }

  function drawRiderResultOnCanvas(canvas: HTMLCanvasElement, result: FitPositionResult) {
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      const w = canvas.width;
      const h = canvas.height;
      const lm = result.landmarks;

      ctx.lineWidth = 2;
      for (const [a, b] of POSE_CONNECTIONS) {
        const lmA = lm[a];
        const lmB = lm[b];
        if (!lmA || !lmB) continue;
        ctx.strokeStyle = OVERLAY_COLORS.neutral;
        ctx.beginPath();
        ctx.moveTo(lmA.x * w, lmA.y * h);
        ctx.lineTo(lmB.x * w, lmB.y * h);
        ctx.stroke();
      }
      for (const l of lm) {
        if (!l || (l.visibility ?? 1) < 0.4) continue;
        ctx.fillStyle = OVERLAY_COLORS.neutral;
        ctx.beginPath();
        ctx.arc(l.x * w, l.y * h, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    img.src = result.imageDataUrl;
  }

  // ── Results panel ─────────────────────────────────────────────────────

  function renderResults() {
    elements.resultsSections.innerHTML = '';

    for (const bg of bikeGeometryResults) {
      const section = document.createElement('div');
      section.className = 'fit-result-section';
      const heading = document.createElement('h3');
      heading.textContent = bg.stepName;
      section.appendChild(heading);

      if (bg.imageDataUrl) {
        const img = document.createElement('img');
        img.src = bg.imageDataUrl;
        img.alt = bg.stepName;
        img.style.cssText = 'max-width:100%;border-radius:6px;margin-bottom:8px;display:block;';
        section.appendChild(img);
      }

      const table = document.createElement('table');
      table.className = 'metric-table';
      if (bg.angles.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="3" style="color:#64748b;font-style:italic">No points placed yet</td>';
        table.appendChild(row);
      } else {
        for (const a of bg.angles) {
          const row = document.createElement('tr');
          row.innerHTML = `<td>${a.label}</td><td>${a.value}°</td><td class="normal-range">${a.normalRange}</td>`;
          table.appendChild(row);
        }
      }
      section.appendChild(table);
      elements.resultsSections.appendChild(section);
    }

    for (const result of positionResults) {
      const section = document.createElement('div');
      section.className = 'fit-result-section';
      const heading = document.createElement('h3');
      heading.textContent = result.positionName;
      section.appendChild(heading);
      const table = document.createElement('table');
      table.className = 'metric-table';
      for (const m of result.measurements) {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${m.label}</td><td>${m.value}${m.unit}</td><td class="normal-range">${m.normalRange ?? '—'}</td>`;
        table.appendChild(row);
      }
      section.appendChild(table);
      elements.resultsSections.appendChild(section);
    }

    const hasResults = bikeGeometryResults.length > 0 || positionResults.length > 0;
    elements.resultsContent.hidden = !hasResults;
    elements.resultsEmpty.hidden = hasResults;
    elements.exportBtn.hidden = !hasResults;
  }

  // ── Selection screen ──────────────────────────────────────────────────

  function renderSelection(selectedIds: Set<string>) {
    elements.stepLabel.textContent = '';
    elements.stepBadge.hidden = true;
    elements.progressFill.style.width = '0%';
    elements.positionSelectEl.innerHTML = '';

    let beginBtn: HTMLButtonElement;

    function makeSection(title: string, badge: string, badgeClass: string, sectionSteps: FitStep[]): HTMLElement {
      const wrap = document.createElement('div');
      wrap.className = 'position-section';

      const header = document.createElement('label');
      header.className = 'position-section-header';

      const parentCb = document.createElement('input');
      parentCb.type = 'checkbox';

      const titleSpan = document.createElement('span');
      titleSpan.textContent = title;

      const badgeSpan = document.createElement('span');
      badgeSpan.className = `position-section-badge ${badgeClass}`;
      badgeSpan.textContent = badge;

      header.appendChild(parentCb);
      header.appendChild(titleSpan);
      header.appendChild(badgeSpan);
      wrap.appendChild(header);

      const childCbs: HTMLInputElement[] = [];
      const viewOrder: FitView[] = ['side', 'rear', 'front'];

      for (const view of viewOrder) {
        const viewSteps = sectionSteps.filter((s) => s.view === view);
        if (viewSteps.length === 0) continue;

        if (sectionSteps.some((s) => s.view !== viewSteps[0].view)) {
          const viewLabel = document.createElement('div');
          viewLabel.className = 'position-view-label';
          viewLabel.textContent = viewText(view);
          wrap.appendChild(viewLabel);
        }

        for (const step of viewSteps) {
          const label = document.createElement('label');
          label.className = 'position-toggle';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = step.id;
          cb.checked = selectedIds.has(step.id);
          childCbs.push(cb);

          cb.addEventListener('change', () => {
            if (cb.checked) selectedIds.add(step.id);
            else selectedIds.delete(step.id);
            syncParent();
            beginBtn.disabled = selectedIds.size === 0;
          });

          label.appendChild(cb);
          label.appendChild(document.createTextNode(step.name));
          wrap.appendChild(label);
        }
      }

      function syncParent() {
        const checked = childCbs.filter((c) => c.checked).length;
        parentCb.checked = checked === childCbs.length && childCbs.length > 0;
        parentCb.indeterminate = checked > 0 && checked < childCbs.length;
      }

      parentCb.addEventListener('change', () => {
        childCbs.forEach((c) => {
          c.checked = parentCb.checked;
          if (parentCb.checked) selectedIds.add(c.value);
          else selectedIds.delete(c.value);
        });
        beginBtn.disabled = selectedIds.size === 0;
      });

      syncParent();
      return wrap;
    }

    const bikeSteps  = FIT_STEPS.filter((s) => s.kind === 'bike');
    const riderSteps = FIT_STEPS.filter((s) => s.kind === 'rider');
    elements.positionSelectEl.appendChild(makeSection('Bike Geometry', 'no rider', '', bikeSteps));
    elements.positionSelectEl.appendChild(makeSection('Rider on Bike', 'with rider', 'rider', riderSteps));

    beginBtn = document.createElement('button');
    beginBtn.className = 'primary-btn';
    beginBtn.textContent = 'Begin Session →';
    beginBtn.disabled = selectedIds.size === 0;
    beginBtn.addEventListener('click', () => {
      startFlow(FIT_STEPS.filter((s) => selectedIds.has(s.id)));
    });
    elements.positionSelectEl.appendChild(beginBtn);
  }

  function startFlow(activeSteps: FitStep[]) {
    steps = activeSteps;
    currentStep = 0;
    positionResults.length = 0;
    bikeGeometryResults.length = 0;
    bikeRawPhotos.clear();
    elements.positionSelectEl.hidden = true;
    elements.stepUiEl.hidden = false;
    renderStep();
  }

  // ── Rider photo flow (unchanged behaviour) ────────────────────────────

  function processRiderPhoto(file: File, pos: RiderStep) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Could not load this image. Please try a different photo.');
    };
    img.onload = async () => {
      let result: Awaited<ReturnType<typeof analyzeImage>>;
      try {
        result = await analyzeImage(landmarker, img);
      } catch (e) {
        console.error('Photo analysis failed:', e);
        URL.revokeObjectURL(url);
        alert('Photo analysis failed. Please try again.');
        return;
      }
      if (!result) {
        alert('No pose detected in this photo. Please retake.');
        URL.revokeObjectURL(url);
        return;
      }

      // Capture the image as data URL for the PDF
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.naturalWidth;
      tempCanvas.height = img.naturalHeight;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.drawImage(img, 0, 0);
      const imageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
      URL.revokeObjectURL(url);

      const measurements = measureFitPosition(pos.id, result.worldLandmarks);

      const fitResult: FitPositionResult = {
        positionId:    pos.id,
        positionName:  pos.name,
        landmarks:     result.landmarks,
        worldLandmarks: result.worldLandmarks,
        measurements,
        imageDataUrl,
      };

      const idx = positionResults.findIndex((r) => r.positionId === pos.id);
      if (idx >= 0) positionResults[idx] = fitResult;
      else positionResults.push(fitResult);

      renderStep();
      renderResults();
    };
    img.src = url;
  }

  // ── Bike photo flow ───────────────────────────────────────────────────

  function processBikePhoto(file: File, step: BikeGeometryStep) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Could not load this image. Please try a different photo.');
    };
    img.onload = async () => {
      // Keep the raw photo so Edit points re-edits the original
      const tmp = document.createElement('canvas');
      tmp.width = img.naturalWidth;
      tmp.height = img.naturalHeight;
      tmp.getContext('2d')!.drawImage(img, 0, 0);
      bikeRawPhotos.set(step.id, tmp.toDataURL('image/jpeg', 0.85));
      URL.revokeObjectURL(url);

      const existing = bikeGeometryResults.find((r) => r.stepId === step.id);
      const pts = await openPointPlacement(img, step, existing?.points ?? []);
      if (pts !== null) storeBikeResult(step, img, pts);
      renderStep();
    };
    img.src = url;
  }

  function editBikePoints(step: BikeGeometryStep) {
    const raw = bikeRawPhotos.get(step.id);
    const existing = bikeGeometryResults.find((r) => r.stepId === step.id);
    if (!raw) {
      elements.fileInput.click();
      return;
    }
    const img = new Image();
    img.onerror = () => alert('Could not reload the photo. Take a new one.');
    img.onload = async () => {
      const pts = await openPointPlacement(img, step, existing?.points ?? []);
      if (pts !== null) storeBikeResult(step, img, pts);
      renderStep();
    };
    img.src = raw;
  }

  function storeBikeResult(step: BikeGeometryStep, img: HTMLImageElement, pts: PlacedPoint[]) {
    const imageAspect = img.naturalWidth / img.naturalHeight;
    const angles = computeBikeAngles(pts, step.angles, imageAspect);
    const imageDataUrl = renderAnnotatedBikePhoto(img, step, pts, angles);
    const result: BikeGeometryResult = {
      stepId: step.id,
      stepName: step.name,
      imageDataUrl,
      imageAspect,
      points: pts,
      angles,
    };
    const idx = bikeGeometryResults.findIndex((r) => r.stepId === step.id);
    if (idx >= 0) bikeGeometryResults[idx] = result;
    else bikeGeometryResults.push(result);
    renderResults();
  }

  // ── Session navigation ────────────────────────────────────────────────

  function buildResults(): FitSessionResults {
    return { positions: [...positionResults], bikeGeometry: [...bikeGeometryResults] };
  }

  function finishSession() {
    onComplete(buildResults());
    elements.stepUiEl.hidden = true;
    elements.positionSelectEl.hidden = false;
    renderResults();
    renderSelection(new Set(FIT_STEPS.map((s) => s.id)));
    // On phones, jump to the results tab (desktop shows both panels; the
    // active classes are ignored by the desktop layout)
    document.querySelectorAll<HTMLElement>('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === 'results'));
    document.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) =>
      p.classList.toggle('active', p.dataset.tab === 'results'));
  }

  function advance() {
    if (currentStep < steps.length - 1) {
      currentStep++;
      renderStep();
    } else {
      finishSession();
    }
  }

  // ── Event wiring ──────────────────────────────────────────────────────

  elements.fileInput.addEventListener('change', () => {
    const file = elements.fileInput.files?.[0];
    if (file) {
      const step = steps[currentStep];
      if (step.kind === 'bike') processBikePhoto(file, step);
      else processRiderPhoto(file, step);
    }
    elements.fileInput.value = '';
  });

  elements.uploadBtn.addEventListener('click', () => elements.fileInput.click());

  elements.retakeBtn.addEventListener('click', () => {
    const step = steps[currentStep];
    if (step.kind === 'bike') editBikePoints(step);
    else elements.fileInput.click();
  });

  elements.newPhotoBtn.addEventListener('click', () => elements.fileInput.click());

  elements.prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  });

  elements.nextBtn.addEventListener('click', advance);
  elements.skipBtn.addEventListener('click', advance);

  return {
    start() {
      elements.guidePanel.hidden = false;
      elements.stepUiEl.hidden = true;
      elements.positionSelectEl.hidden = false;
      renderSelection(new Set(FIT_STEPS.map((s) => s.id)));
    },
    reset() {
      currentStep = 0;
      positionResults.length = 0;
      bikeGeometryResults.length = 0;
      bikeRawPhotos.clear();
      elements.guidePanel.hidden = true;
      elements.positionSelectEl.hidden = true;
      elements.stepUiEl.hidden = true;
      renderResults();
    },
    getResults: buildResults,
  };
}
```

- [ ] **Step 3: Update `bike/src/main.ts` element wiring + PDF fallback**

In the `initFitGuide(...)` call, add the three new elements (keep the others as they are):

```ts
      stepLabel:        document.getElementById('fit-step-label')       as HTMLElement,
      stepBadge:        document.getElementById('fit-step-badge')       as HTMLElement,
      progressFill:     document.getElementById('fit-progress-fill')    as HTMLElement,
      // ... existing entries unchanged ...
      retakeBtn:        document.getElementById('fit-retake-btn')       as HTMLButtonElement,
      newPhotoBtn:      document.getElementById('fit-newphoto-btn')     as HTMLButtonElement,
```

Also in `main.ts`, the `generatePdfBtn` click handler's mid-session fallback currently only checks `positions` — a bike-only session would export an empty PDF. Change it to:

```ts
    const liveFitResults = fitGuide.getResults();
    const hasLiveResults =
      liveFitResults.positions.length > 0 || liveFitResults.bikeGeometry.length > 0;
    const fitResults = lastFitResults ?? (hasLiveResults ? liveFitResults : null);
```

- [ ] **Step 4: Delete `FIT_POSITIONS` and `FitPosition` from defaults.ts**

In `bike/src/config/defaults.ts`, delete the old `export interface FitPosition { ... }` and `export const FIT_POSITIONS: FitPosition[] = [ ... ]` block (the rider data now lives in `FIT_STEPS`). Keep `FitView`. Confirm nothing else references them:

Run (PowerShell, from repo root): `Get-ChildItem bike\src -Recurse -Filter *.ts | Select-String -Pattern "FIT_POSITIONS|\bFitPosition\b"`
Expected: no matches. (`FitPositionResult` is a different type and must keep working.)

- [ ] **Step 5: Type-check + tests**

Run: `cd bike && npx tsc --noEmit && npm test`
Expected: no type errors, 49 tests pass.

- [ ] **Step 6: Manual browser smoke test (desktop)**

Run: `cd bike && npm run dev`, open `http://localhost:5173/runalyzr/bike/` (set `sessionStorage.setItem('runalyzr-auth','1')` if redirected — should not be needed on localhost).

Verify:
1. Start Fit Session → two sections appear (Bike Geometry badge "no rider", Rider on Bike badge "with rider"); parent checkboxes cascade (uncheck parent → all children clear; check one child → parent indeterminate).
2. Begin Session with everything checked → Step 1 of 11 is "Full Bike Side View" with badge "bike only" and progress bar.
3. Upload any photo → fullscreen overlay opens: prompt names "Bottom bracket centre", chips show 7 points, mouse hover draws a crosshair.
4. Click 7 locations → prompt advances each time; dots and dashed lines appear; after the last point the prompt reads "All 7 points placed…".
5. Click a chip → it becomes active; click a new location → that point moves.
6. Undo removes the last point; Skip moves past a point; Escape cancels without losing the step's prior state; Done closes and the step card shows the annotated photo + "Edit points" + "New photo", Next enabled.
7. Results panel shows the Bike Geometry section with annotated image and 4 angle rows (Saddle Tilt signed).
8. Edit points reopens the overlay with the dots intact on the *original* (un-annotated) photo.
9. Rider steps still work end-to-end (upload person photo → measurements appear).

- [ ] **Step 7: Commit**

```bash
git add bike/index.html bike/src/ui/fitGuide.ts bike/src/main.ts bike/src/config/defaults.ts
git commit -m "feat(bike): integrate bike geometry steps - selection sections, overlay flow, results"
```

---

### Task 9: PDF export — bike geometry sections with images

**Files:**
- Modify: `shared/src/types/index.ts` (`ReportSection`)
- Modify: `shared/src/pdf/renderer.ts` (render section images)
- Modify: `bike/src/report/pdfGenerator.ts` (emit bike sections)

- [ ] **Step 1: Extend `ReportSection`**

In `shared/src/types/index.ts` change:

```ts
export interface ReportSection {
  title: string;
  metrics: Array<{ label: string; result: MetricResult; normalRange?: string }>;
  findings: string[];
  /** Optional annotated photo rendered above the metric table. */
  image?: { dataUrl: string; aspectRatio: number };
}
```

- [ ] **Step 2: Render the image in `shared/src/pdf/renderer.ts`**

Inside the `for (const section of sections)` loop, immediately after the section title is drawn (`doc.text(section.title, margin, y); y += 7;`), insert:

```ts
    if (section.image) {
      const imgW = Math.min(contentWidth, 120);
      const imgH = imgW / section.image.aspectRatio;
      checkPage(imgH + 6);
      doc.addImage(section.image.dataUrl, 'JPEG', margin, y - 3, imgW, imgH);
      y += imgH + 4;
    }
```

- [ ] **Step 3: Emit bike geometry sections in `bike/src/report/pdfGenerator.ts`**

In `generateBikeReport`, inside the `if (params.fitResults)` block, **before** the existing per-position loop, add:

```ts
    for (const bg of params.fitResults.bikeGeometry) {
      sections.push({
        title: `Bike Geometry — ${bg.stepName}`,
        metrics: bg.angles.map((a) => ({
          label: a.label,
          result: { value: a.value, status: 'unknown' as const, unit: '°' },
          normalRange: a.normalRange,
        })),
        findings: [],
        image: { dataUrl: bg.imageDataUrl, aspectRatio: bg.imageAspect },
      });
    }
```

Also update the report-title logic so a bike-geometry-only session counts as a fit session — the existing `params.fitResults` checks already cover this since `fitResults` is the whole object; no change needed, but verify the `reportTitle` ternary still reads correctly.

- [ ] **Step 4: Type-check all three workspaces' consumers**

Run: `cd bike && npx tsc --noEmit; cd ../runalyzr && npx tsc --noEmit`
Expected: no errors in either (the new `image` field is optional).

- [ ] **Step 5: Run both test suites**

Run: `cd bike && npm test; cd ../runalyzr && npm test`
Expected: 49 + 31 pass.

- [ ] **Step 6: Manual PDF check**

In the dev server: complete the bike side step with a few points, Export PDF → Generate. Open the downloaded PDF: the "Bike Geometry — Full Bike Side View" section appears first with the annotated image and the angle table.

- [ ] **Step 7: Commit**

```bash
git add shared/src/types/index.ts shared/src/pdf/renderer.ts bike/src/report/pdfGenerator.ts
git commit -m "feat(bike): bike geometry sections with annotated images in PDF export"
```

---

### Task 10: Final verification + docs

**Files:**
- Modify: `CLAUDE.md` (test counts + new test rows)

- [ ] **Step 1: Full verification**

```bash
cd bike && npm test && npx tsc --noEmit && npm run build
cd ../runalyzr && npm test && npx tsc --noEmit && npm run build
```
Expected: 49 + 31 tests pass, both builds succeed, and **no `.js` files appear under any `src/`** (`noEmit` guards this — verify with a glob if paranoid).

- [ ] **Step 2: End-to-end browser pass**

Full session in the dev server: select only the two bike steps → place points on both → finish → results tab shows both sections → export PDF. Then a mixed session (bike + one rider step). Then verify on a phone via `npm run dev -- --host` (LAN): loupe drag works, scroll is locked in the overlay, chips scroll horizontally, Done/Cancel reachable.

- [ ] **Step 3: Update CLAUDE.md**

In the Test Coverage table add/adjust:

```markdown
| `bike/src/analysis/bikeGeometryMetrics.test.ts` | 10 | computeBikeAngles (signed/unsigned/3-point), anglePointPairs |
| `bike/src/ui/placementSequence.test.ts` | 5 | firstUnplacedFrom sequencing |
```

Update the bike test count in the Commands section (`# 34 Vitest tests` → `# 49 Vitest tests`).

Add a short subsection under "Key Architecture":

```markdown
### bike: Point placement overlay
`bike/src/ui/pointPlacement.ts` — fullscreen, promise-based (`openPointPlacement(...): Promise<PlacedPoint[] | null>`). Creates its own DOM under `document.body`; never shares DOM/CSS with the step card. Points are normalised to the *image* (not the canvas — the canvas letterboxes). `fitGuide.ts` awaits it for bike steps and stores raw photos in `bikeRawPhotos` so Edit points re-edits the original image.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: bike geometry v2 test coverage and architecture notes"
```

---

## Notes for the implementer

- **Never let `tsc` emit into `src/`** — both tsconfigs have `noEmit: true`; don't remove it (stale `.js` files shadow `.ts` in Vite dev — this burned us badly once).
- **`noUnusedLocals`/`noUnusedParameters` are on** — remove anything you don't use.
- No `as any` / `as unknown as` casts (repo invariant). No `Math.min/max(...spread)` on potentially large arrays.
- The dev auth gate skips localhost/LAN hostnames automatically.
- The old `feature/bike-geometry` branch is reference-only. After this plan ships and is verified, the branch can be deleted (`git branch -D feature/bike-geometry && git push origin --delete feature/bike-geometry` — ask the user first).
