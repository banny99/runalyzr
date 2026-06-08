# Bike Geometry Photo Fitting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Bikealyzr fit session with bike-only geometry steps where the fitter uploads a photo and taps labelled frame landmarks to compute key geometry angles (seat tube, head tube, saddle tilt, bar level).

**Architecture:** A discriminated union `FitStep = RiderStep | BikeGeometryStep` replaces the existing `FitPosition` type. The fit guide dispatches rendering based on `step.kind`. A new `bikeGeometryCanvas.ts` handles sequential tap-to-place interaction; a new `bikeGeometryMetrics.ts` computes angles from normalised coordinates — both are pure with no dependency on MediaPipe.

**Tech Stack:** TypeScript, HTML Canvas 2D, Vite, Vitest (node environment)

---

## File Map

| File | Action |
|---|---|
| `bike/src/config/defaults.ts` | Modify — add `BikePoint`, `AngleDefinition`, `RiderStep`, `BikeGeometryStep`, `FitStep`; replace `FitPosition`/`FIT_POSITIONS` with new types/`FIT_STEPS` |
| `bike/src/analysis/types.ts` | Modify — add `PlacedPoint`, `BikeAngleMeasurement`, `BikeGeometryResult`; extend `FitSessionResults` |
| `bike/src/analysis/bikeGeometryMetrics.ts` | **Create** — `computeBikeAngles()` |
| `bike/src/analysis/bikeGeometryMetrics.test.ts` | **Create** — Vitest unit tests |
| `bike/src/ui/bikeGeometryCanvas.ts` | **Create** — `initBikeGeometryCanvas()`, canvas controller |
| `bike/src/ui/fitGuide.ts` | Modify — selector redesign, step dispatch, bike step rendering, results |
| `bike/src/report/pdfGenerator.ts` | Modify — add Bike Geometry sections |
| `bike/src/main.ts` | Modify — pass `bikeGeometry` results to PDF params |

All work is inside `bike/`. Run commands from the `bike/` directory unless noted.

---

## Task 1: Extend the Data Model

**Files:**
- Modify: `bike/src/config/defaults.ts`
- Modify: `bike/src/analysis/types.ts`

- [ ] **Step 1.1 — Replace `FitPosition` with the new discriminated union types in `defaults.ts`**

  Open `bike/src/config/defaults.ts`. Remove the existing `FitPosition` interface and the `FIT_POSITIONS` export. Replace with the block below. Keep all other existing exports (`LANDMARKS`, `POSE_CONNECTIONS`, `OVERLAY_COLORS`, `FitView`, `METRIC_LABELS`, `SAGITTAL_METRICS`, `REAR_METRICS`, `FRONT_METRICS`, `APP_NAME`, `MEDIAPIPE_CDN`, `HEAVY_MODEL_URL`, `FPS_TARGET`, `FPS_SKIP_THRESHOLD`) untouched.

  ```ts
  // ── Fit step types ─────────────────────────────────────────────────────────

  export interface BikePoint {
    id: string;
    label: string;
  }

  export interface AngleDefinition {
    id: string;
    label: string;
    pointA: string;
    pointB: string;
    pointC?: string;
    reference: 'horizontal' | 'vertical' | 'ab_to_c';
    normalRange: string;
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
        { id: 'seat_tube_angle', label: 'Seat Tube Angle',          pointA: 'bb_centre',      pointB: 'seat_tube_top',    reference: 'horizontal', normalRange: '72–74°' },
        { id: 'head_tube_angle', label: 'Head Tube Angle',          pointA: 'head_tube_bottom',pointB: 'head_tube_top',   reference: 'horizontal', normalRange: '71–74°' },
        { id: 'saddle_tilt',     label: 'Saddle Tilt',              pointA: 'saddle_nose',    pointB: 'saddle_centre',    reference: 'horizontal', normalRange: '±2°' },
        { id: 'bar_drop_angle',  label: 'Bar-to-Saddle Drop Angle', pointA: 'saddle_centre',  pointB: 'handlebar_centre', reference: 'horizontal', normalRange: 'Context-dependent' },
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
    // ── Rider on bike ────────────────────────────────────────────────────────
    {
      kind: 'rider',
      id: 'side_6oclock',
      name: '6 o\'clock — Side',
      view: 'side',
      instructions: 'Position pedal straight down (6 o\'clock). Stand camera at hip height, 3–5m away, from the rider\'s right side.',
      keyMeasurements: ['Knee extension at BDC', 'Saddle height indicator'],
    },
    {
      kind: 'rider',
      id: 'side_3oclock',
      name: '3 o\'clock — Side',
      view: 'side',
      instructions: 'Position pedal forward (3 o\'clock). Keep camera position from previous step.',
      keyMeasurements: ['Knee-over-pedal stack (KOPS)', 'Hip angle'],
    },
    {
      kind: 'rider',
      id: 'side_9oclock',
      name: '9 o\'clock — Side',
      view: 'side',
      instructions: 'Position pedal back (9 o\'clock). Keep camera position from previous step.',
      keyMeasurements: ['Hip extension', 'Back angle'],
    },
    {
      kind: 'rider',
      id: 'side_neutral',
      name: 'Neutral Seated — Side',
      view: 'side',
      instructions: 'Rider sits naturally on the bike, hands on hoods or bars. Keep camera position.',
      keyMeasurements: ['Torso angle', 'Reach', 'Elbow angle'],
    },
    {
      kind: 'rider',
      id: 'side_aero',
      name: 'Aero / Drop — Side (optional)',
      view: 'side',
      instructions: 'Rider in aero position or on the drops. Skip if not applicable.',
      keyMeasurements: ['Reach in aero', 'Elbow angle', 'Back angle'],
    },
    {
      kind: 'rider',
      id: 'rear_6oclock',
      name: '6 o\'clock — Rear',
      view: 'rear',
      instructions: 'Move camera to directly behind the rider. Pedal at 6 o\'clock.',
      keyMeasurements: ['Hip levelness', 'Knee alignment L vs R'],
    },
    {
      kind: 'rider',
      id: 'rear_neutral',
      name: 'Neutral Seated — Rear',
      view: 'rear',
      instructions: 'Rider sits naturally. Camera stays behind.',
      keyMeasurements: ['Saddle tilt effect', 'Overall symmetry'],
    },
    {
      kind: 'rider',
      id: 'front_6oclock',
      name: '6 o\'clock — Front',
      view: 'front',
      instructions: 'Move camera to directly in front of the rider. Pedal at 6 o\'clock.',
      keyMeasurements: ['Knee tracking L/R', 'Shoulder level'],
    },
    {
      kind: 'rider',
      id: 'front_neutral',
      name: 'Neutral Seated — Front',
      view: 'front',
      instructions: 'Rider sits naturally. Camera stays in front.',
      keyMeasurements: ['Frontal plane symmetry', 'Head position'],
    },
  ];
  ```

- [ ] **Step 1.2 — Add new types to `types.ts`**

  Open `bike/src/analysis/types.ts`. Add the following block before the `FitMeasurement` interface. Also extend `FitSessionResults` to include `bikeGeometry`.

  ```ts
  // ── Bike geometry fit ─────────────────────────────────────────────────────

  export interface PlacedPoint {
    id: string;
    x: number; // 0–1 normalised (x / canvas.width)
    y: number; // 0–1 normalised (y / canvas.height)
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
    imageDataUrl: string; // annotated canvas snapshot (photo + dots + lines)
    points: PlacedPoint[];
    angles: BikeAngleMeasurement[];
  }
  ```

  Change `FitSessionResults`:

  ```ts
  export interface FitSessionResults {
    positions: FitPositionResult[];
    bikeGeometry: BikeGeometryResult[];
  }
  ```

- [ ] **Step 1.3 — Verify TypeScript compiles**

  Run from `bike/`:
  ```
  npx tsc --noEmit
  ```

  Expected: errors about `FIT_POSITIONS` and `FitPosition` not found — those are fixed in later tasks. If there are unexpected errors unrelated to the rename, fix them now.

- [ ] **Step 1.4 — Commit**

  ```bash
  git add bike/src/config/defaults.ts bike/src/analysis/types.ts
  git commit -m "feat(bike): add FitStep discriminated union and BikeGeometry* types"
  ```

---

## Task 2: Angle Computation (TDD)

**Files:**
- Create: `bike/src/analysis/bikeGeometryMetrics.ts`
- Create: `bike/src/analysis/bikeGeometryMetrics.test.ts`

- [ ] **Step 2.1 — Write the failing tests**

  Create `bike/src/analysis/bikeGeometryMetrics.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { computeBikeAngles } from './bikeGeometryMetrics';
  import type { PlacedPoint } from './types';
  import type { AngleDefinition } from '../config/defaults';

  const AR = 4 / 3; // typical landscape aspect ratio for tests

  describe('computeBikeAngles', () => {
    it('computes 90° for a perfectly vertical tube', () => {
      const points: PlacedPoint[] = [
        { id: 'bb_centre',     x: 0.5, y: 0.8 },
        { id: 'seat_tube_top', x: 0.5, y: 0.2 }, // same x, different y → vertical
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
        { id: 'saddle_right', x: 0.8, y: 0.5 }, // same y → horizontal
      ];
      const defs: AngleDefinition[] = [{
        id: 'saddle_level', label: 'Saddle Level',
        pointA: 'saddle_left', pointB: 'saddle_right',
        reference: 'horizontal', normalRange: '< 2°',
      }];
      const result = computeBikeAngles(points, defs, AR);
      expect(result[0].value).toBeCloseTo(0, 1);
    });

    it('returns positive saddle tilt when nose is higher than centre (nose-up)', () => {
      // saddle_nose higher in visual space = smaller canvas y value
      const points: PlacedPoint[] = [
        { id: 'saddle_nose',   x: 0.3, y: 0.38 }, // higher (nose-up)
        { id: 'saddle_centre', x: 0.5, y: 0.42 }, // lower
      ];
      const defs: AngleDefinition[] = [{
        id: 'saddle_tilt', label: 'Saddle Tilt',
        pointA: 'saddle_nose', pointB: 'saddle_centre',
        reference: 'horizontal', normalRange: '±2°',
      }];
      const result = computeBikeAngles(points, defs, AR);
      // nose-up → positive value
      expect(result[0].value).toBeGreaterThan(0);
    });

    it('omits angles where a required point is missing', () => {
      const points: PlacedPoint[] = [
        { id: 'bb_centre', x: 0.5, y: 0.8 },
        // seat_tube_top intentionally absent
      ];
      const defs: AngleDefinition[] = [{
        id: 'seat_tube_angle', label: 'Seat Tube Angle',
        pointA: 'bb_centre', pointB: 'seat_tube_top',
        reference: 'horizontal', normalRange: '72–74°',
      }];
      const result = computeBikeAngles(points, defs, AR);
      expect(result).toHaveLength(0);
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
  });
  ```

- [ ] **Step 2.2 — Run tests to confirm they fail**

  ```
  npm test -- bikeGeometryMetrics
  ```

  Expected: `Cannot find module './bikeGeometryMetrics'`

- [ ] **Step 2.3 — Implement `bikeGeometryMetrics.ts`**

  Create `bike/src/analysis/bikeGeometryMetrics.ts`:

  ```ts
  import type { AngleDefinition } from '../config/defaults';
  import type { PlacedPoint, BikeAngleMeasurement } from './types';

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
        // Canvas y=0 is top, so dy is positive going downward in the image.
        const dx = (pB.x - pA.x) * aspectRatio;
        const dy = pB.y - pA.y;

        if (def.reference === 'horizontal') {
          if (def.id === 'saddle_tilt') {
            // Signed angle: positive = nose-up (nose.y < centre.y in canvas coords,
            // so the vector nose→centre has positive dy, which maps to a downward
            // slope. We negate dy so that nose-up → positive angle).
            value = Math.atan2(-dy, Math.abs(dx)) * (180 / Math.PI);
          } else {
            // Unsigned acute angle from horizontal (0–90°)
            value = Math.atan2(Math.abs(dy), Math.abs(dx)) * (180 / Math.PI);
          }
        } else {
          // vertical: acute angle from the vertical axis
          value = Math.atan2(Math.abs(dx), Math.abs(dy)) * (180 / Math.PI);
        }
      } else {
        // ab_to_c: interior angle at B
        const pC = byId[def.pointC!];
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

- [ ] **Step 2.4 — Run tests to confirm they pass**

  ```
  npm test -- bikeGeometryMetrics
  ```

  Expected: all 6 tests pass.

- [ ] **Step 2.5 — Commit**

  ```bash
  git add bike/src/analysis/bikeGeometryMetrics.ts bike/src/analysis/bikeGeometryMetrics.test.ts
  git commit -m "feat(bike): add computeBikeAngles with aspect-ratio correction"
  ```

---

## Task 3: Point Placement Canvas

**Files:**
- Create: `bike/src/ui/bikeGeometryCanvas.ts`

No unit tests for this task — canvas interaction requires a real browser. Verified manually in Task 7.

- [ ] **Step 3.1 — Create `bikeGeometryCanvas.ts`**

  Create `bike/src/ui/bikeGeometryCanvas.ts`:

  ```ts
  import type { BikeGeometryStep } from '../config/defaults';
  import type { PlacedPoint } from '../analysis/types';

  export interface BikeGeometryCanvasController {
    getCurrentPoints: () => PlacedPoint[];
    getActiveIndex: () => number;
    reset: () => void;
    destroy: () => void;
  }

  export function initBikeGeometryCanvas(
    canvas: HTMLCanvasElement,
    img: HTMLImageElement,
    step: BikeGeometryStep,
    existingPoints: PlacedPoint[],
    onPointsChanged: (points: PlacedPoint[], activeIndex: number) => void,
  ): BikeGeometryCanvasController {
    const points: PlacedPoint[] = [...existingPoints];
    let activeIndex = points.length >= step.points.length ? step.points.length : points.length;

    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.style.cursor = 'crosshair';

    const DOT_R       = Math.max(8, Math.round(canvas.width * 0.012));
    const FONT_SIZE   = Math.max(12, DOT_R);
    const PLACED_FILL = '#22c55e';
    const ACTIVE_COL  = '#f59e0b';
    const LINE_COL    = '#60a5fa';

    // Pairs of point IDs to connect with a line, derived from angle definitions
    const linePairs: [string, string][] = step.angles.flatMap((a) =>
      a.pointC ? [[a.pointA, a.pointB], [a.pointB, a.pointC]] : [[a.pointA, a.pointB]],
    ) as [string, string][];

    function draw(cursorNx?: number, cursorNy?: number) {
      const ctx = canvas.getContext('2d')!;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0);

      const byId = Object.fromEntries(points.map((p) => [p.id, p]));

      // Connection lines
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = LINE_COL;
      ctx.globalAlpha = 0.7;
      for (const [aId, bId] of linePairs) {
        const pA = byId[aId];
        const pB = byId[bId];
        if (!pA || !pB) continue;
        ctx.beginPath();
        ctx.moveTo(pA.x * W, pA.y * H);
        ctx.lineTo(pB.x * W, pB.y * H);
        ctx.stroke();
      }
      ctx.restore();

      // Placed dots + short labels
      ctx.font = `bold ${FONT_SIZE}px sans-serif`;
      for (const p of points) {
        const px = p.x * W;
        const py = p.y * H;
        ctx.beginPath();
        ctx.arc(px, py, DOT_R, 0, Math.PI * 2);
        ctx.fillStyle = PLACED_FILL;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        const shortLabel = step.points.find((pt) => pt.id === p.id)?.label.split(' ')[0] ?? p.id;
        ctx.fillStyle = 'white';
        ctx.fillText(shortLabel, px + DOT_R + 3, py + 4);
      }

      // Cursor crosshair for active point
      if (activeIndex < step.points.length && cursorNx !== undefined && cursorNy !== undefined) {
        const cx = cursorNx * W;
        const cy = cursorNy * H;
        const r  = DOT_R;
        ctx.save();
        ctx.strokeStyle = ACTIVE_COL;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(cx - r * 2, cy); ctx.lineTo(cx + r * 2, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - r * 2); ctx.lineTo(cx, cy + r * 2); ctx.stroke();
        ctx.restore();
      }
    }

    function toNorm(clientX: number, clientY: number): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width  / rect.width;
      const sy = canvas.height / rect.height;
      return {
        x: ((clientX - rect.left) * sx) / canvas.width,
        y: ((clientY - rect.top)  * sy) / canvas.height,
      };
    }

    function snapIndex(nx: number, ny: number): number {
      const snapR = (DOT_R * 2) / canvas.width;
      for (let i = 0; i < points.length; i++) {
        const dx = points[i].x - nx;
        const dy = points[i].y - ny;
        if (Math.sqrt(dx * dx + dy * dy) < snapR) return i;
      }
      return -1;
    }

    function handleTap(nx: number, ny: number) {
      // Click near an existing dot → re-select that point for repositioning
      const snap = snapIndex(nx, ny);
      if (snap >= 0) {
        activeIndex = snap;
        draw();
        onPointsChanged([...points], activeIndex);
        return;
      }
      if (activeIndex >= step.points.length) return;

      const pointDef = step.points[activeIndex];
      const existing = points.findIndex((p) => p.id === pointDef.id);
      const placed: PlacedPoint = { id: pointDef.id, x: nx, y: ny };
      if (existing >= 0) points[existing] = placed;
      else points.push(placed);

      // Advance to next unplaced point
      let next = activeIndex + 1;
      while (next < step.points.length && points.some((p) => p.id === step.points[next].id)) next++;
      activeIndex = next;

      draw(nx, ny);
      onPointsChanged([...points], activeIndex);
    }

    let lastNx = 0.5;
    let lastNy = 0.5;

    function onClick(e: MouseEvent) {
      e.preventDefault();
      const { x, y } = toNorm(e.clientX, e.clientY);
      handleTap(x, y);
    }

    function onMouseMove(e: MouseEvent) {
      const { x, y } = toNorm(e.clientX, e.clientY);
      lastNx = x; lastNy = y;
      draw(x, y);
    }

    function onTouchStart(e: TouchEvent) {
      e.preventDefault();
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width  / rect.width;
      const sy = canvas.height / rect.height;
      handleTap(
        ((t.clientX - rect.left) * sx) / canvas.width,
        ((t.clientY - rect.top)  * sy) / canvas.height,
      );
    }

    canvas.addEventListener('click',      onClick);
    canvas.addEventListener('mousemove',  onMouseMove);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });

    draw();
    onPointsChanged([...points], activeIndex);

    return {
      getCurrentPoints: () => [...points],
      getActiveIndex:   () => activeIndex,
      reset() {
        points.length = 0;
        activeIndex   = 0;
        draw();
        onPointsChanged([], 0);
      },
      destroy() {
        canvas.removeEventListener('click',      onClick);
        canvas.removeEventListener('mousemove',  onMouseMove);
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.style.cursor = '';
      },
    };
  }
  ```

- [ ] **Step 3.2 — Confirm no TypeScript errors**

  ```
  npx tsc --noEmit
  ```

  Expected: errors about `FIT_POSITIONS`/`FitPosition` still present (from fitGuide.ts) — those are fixed next. No new errors from `bikeGeometryCanvas.ts`.

- [ ] **Step 3.3 — Commit**

  ```bash
  git add bike/src/ui/bikeGeometryCanvas.ts
  git commit -m "feat(bike): add initBikeGeometryCanvas tap-to-place controller"
  ```

---

## Task 4: Redesign the Position Selector

**Files:**
- Modify: `bike/src/ui/fitGuide.ts` (selector only)

This task updates `renderSelection` and the `start()` method to show two sections with cascading parent checkboxes. The step-dispatch changes come in Task 5.

- [ ] **Step 4.1 — Update imports and type signatures in `fitGuide.ts`**

  At the top of `bike/src/ui/fitGuide.ts`, update the import from `defaults.ts`:

  ```ts
  // Replace:
  import { FIT_POSITIONS, FitView, POSE_CONNECTIONS, OVERLAY_COLORS } from '../config/defaults';
  import type { FitPosition } from '../config/defaults';

  // With:
  import { FIT_STEPS, FitView, POSE_CONNECTIONS, OVERLAY_COLORS } from '../config/defaults';
  import type { FitStep, RiderStep, BikeGeometryStep } from '../config/defaults';
  ```

  Change the `positions` / `currentStep` local variables (inside `initFitGuide`) from using `FitPosition[]` to `FitStep[]`:

  ```ts
  // Replace:
  let positions: FitPosition[] = [];

  // With:
  let steps: FitStep[] = [];
  ```

  Rename all references to `positions` → `steps` and `positions[currentStep]` → `steps[currentStep]` throughout the function (careful not to rename `positionResults`).

- [ ] **Step 4.2 — Add `bikeGeometryResults` state**

  Inside `initFitGuide`, alongside `const positionResults: FitPositionResult[] = [];`, add:

  ```ts
  const bikeGeometryResults: BikeGeometryResult[] = [];
  // Raw photo dataUrls keyed by stepId — used to reinitialise canvas on revisit
  // without drawing onto an already-annotated snapshot.
  const bikeRawPhotos = new Map<string, string>();
  let bikeCanvasController: BikeGeometryCanvasController | null = null;
  ```

  Add the required imports at the top of the file:

  ```ts
  import type { BikeGeometryResult, PlacedPoint } from '../analysis/types';
  import { computeBikeAngles } from '../analysis/bikeGeometryMetrics';
  import { initBikeGeometryCanvas } from './bikeGeometryCanvas';
  import type { BikeGeometryCanvasController } from './bikeGeometryCanvas';
  ```

- [ ] **Step 4.3 — Replace `renderSelection` with the two-section version**

  Replace the entire `renderSelection` function with:

  ```ts
  function renderSelection(selectedIds: Set<string>) {
    elements.stepLabel.textContent = '';
    elements.positionSelectEl.innerHTML = '';

    const bikeSteps   = FIT_STEPS.filter((s) => s.kind === 'bike');
    const riderSteps  = FIT_STEPS.filter((s) => s.kind === 'rider');

    function makeSection(
      title: string,
      badge: string,
      sectionSteps: FitStep[],
      sectionClass: string,
    ): HTMLElement {
      const wrap = document.createElement('div');
      wrap.className = 'position-section';

      // Parent checkbox header
      const header = document.createElement('label');
      header.className = 'position-section-header';

      const parentCb = document.createElement('input');
      parentCb.type = 'checkbox';
      parentCb.className = `section-cb-${sectionClass}`;

      const titleSpan = document.createElement('span');
      titleSpan.textContent = title;

      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'position-section-badge';
      badgeSpan.textContent = badge;

      header.appendChild(parentCb);
      header.appendChild(titleSpan);
      header.appendChild(badgeSpan);
      wrap.appendChild(header);

      // Child checkboxes
      const childCbs: HTMLInputElement[] = [];
      const viewOrder: FitView[] = ['side', 'rear', 'front'];
      const viewLabels: Record<FitView, string> = { side: 'Side View', rear: 'Rear View', front: 'Front View' };

      for (const view of viewOrder) {
        const viewSteps = sectionSteps.filter((s) => s.view === view);
        if (viewSteps.length === 0) continue;

        const viewLabel = document.createElement('div');
        viewLabel.className = 'position-view-label';
        viewLabel.textContent = viewLabels[view];
        wrap.appendChild(viewLabel);

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
        parentCb.checked = checked === childCbs.length;
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

    elements.positionSelectEl.appendChild(
      makeSection('Bike Geometry', 'No rider needed', bikeSteps, 'bike'),
    );
    elements.positionSelectEl.appendChild(
      makeSection('Rider on Bike', 'With rider', riderSteps, 'rider'),
    );

    const beginBtn = document.createElement('button');
    beginBtn.className = 'primary-btn';
    beginBtn.textContent = 'Begin Session →';
    beginBtn.disabled = selectedIds.size === 0;
    beginBtn.addEventListener('click', () => {
      const activeSteps = FIT_STEPS.filter((s) => selectedIds.has(s.id));
      startFlow(activeSteps);
    });
    elements.positionSelectEl.appendChild(beginBtn);
  }
  ```

- [ ] **Step 4.4 — Update `startFlow` and `start()` to use `FitStep[]`**

  Replace `startFlow`:

  ```ts
  function startFlow(activeSteps: FitStep[]) {
    steps = activeSteps;
    currentStep = 0;
    positionResults.length = 0;
    bikeGeometryResults.length = 0;
    elements.positionSelectEl.hidden = true;
    elements.stepUiEl.hidden = false;
    renderStep();
  }
  ```

  Update `start()` inside the returned controller:

  ```ts
  start() {
    elements.guidePanel.hidden = false;
    elements.stepUiEl.hidden = true;
    elements.positionSelectEl.hidden = false;
    const selectedIds = new Set(FIT_STEPS.map((s) => s.id));
    renderSelection(selectedIds);
  },
  ```

- [ ] **Step 4.5 — Add minimal CSS for the two-section selector**

  Open `bike/src/ui/styles.css`. Add at the end:

  ```css
  .position-section { border: 1px solid #333; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
  .position-section-header {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; background: #1e1e2e; cursor: pointer;
    border-bottom: 1px solid #2d2d3a; font-weight: 600;
  }
  .position-section-header input[type=checkbox] { accent-color: #60a5fa; width: 16px; height: 16px; }
  .position-section-badge {
    margin-left: auto; font-size: 11px; font-weight: 400;
    color: #64748b; background: #1e293b; padding: 2px 8px; border-radius: 99px;
  }
  .position-view-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.07em;
    text-transform: uppercase; color: #475569; padding: 8px 14px 2px;
  }
  .position-toggle { padding: 6px 14px; }
  ```

- [ ] **Step 4.6 — Commit**

  ```bash
  git add bike/src/ui/fitGuide.ts bike/src/ui/styles.css
  git commit -m "feat(bike): redesign position selector with two-section cascading checkboxes"
  ```

---

## Task 5: Bike Step Rendering & Results

**Files:**
- Modify: `bike/src/ui/fitGuide.ts`

This task adds `renderStep` dispatch, `renderBikeGeometryStep`, `processBikePhoto`, and updates `renderResults` to include bike geometry sections.

- [ ] **Step 5.1 — Update `renderStep` to dispatch on `step.kind`**

  The existing `renderStep` function handles only rider steps. Replace it with:

  ```ts
  function renderStep() {
    const step = steps[currentStep];
    if (step.kind === 'bike') {
      renderBikeGeometryStep(step);
    } else {
      renderRiderStep(step as RiderStep);
    }
  }
  ```

  Rename the current `renderStep` body to `renderRiderStep(pos: RiderStep)`:

  ```ts
  function renderRiderStep(pos: RiderStep) {
    const total = steps.length;
    elements.stepLabel.textContent = `Step ${currentStep + 1} of ${total}`;
    elements.viewLabel.textContent = pos.view === 'side' ? 'Side View' : pos.view === 'rear' ? 'Rear View' : 'Front View';
    elements.positionName.textContent = pos.name;
    elements.instructions.textContent = pos.instructions;

    const hasResult = positionResults.some((r) => r.positionId === pos.id);
    elements.canvasWrap.hidden = !hasResult;
    elements.uploadArea.hidden = hasResult;
    elements.retakeBtn.hidden = !hasResult;
    elements.nextBtn.disabled = !hasResult;
    elements.prevBtn.disabled = currentStep === 0;
    elements.nextBtn.textContent = currentStep === steps.length - 1 ? 'Finish →' : 'Next →';
    elements.skipBtn.hidden = false;

    if (hasResult) {
      const result = positionResults.find((r) => r.positionId === pos.id)!;
      drawResultOnCanvas(elements.canvas, result);
    }

    // Destroy any active bike canvas controller when entering a rider step
    bikeCanvasController?.destroy();
    bikeCanvasController = null;
    elements.canvas.style.cursor = '';
  }
  ```

- [ ] **Step 5.2 — Add `renderBikeGeometryStep`**

  Add this function after `renderRiderStep`:

  ```ts
  function renderBikeGeometryStep(step: BikeGeometryStep) {
    const total = steps.length;
    elements.stepLabel.textContent  = `Step ${currentStep + 1} of ${total}`;
    elements.viewLabel.textContent  = step.view === 'side' ? 'Side View' : step.view === 'rear' ? 'Rear View' : 'Front View';
    elements.positionName.textContent = step.name;
    elements.prevBtn.disabled       = currentStep === 0;
    elements.nextBtn.textContent    = currentStep === total - 1 ? 'Finish →' : 'Next →';
    elements.skipBtn.hidden         = false;

    bikeCanvasController?.destroy();
    bikeCanvasController = null;

    const existing = bikeGeometryResults.find((r) => r.stepId === step.id);

    if (existing) {
      // Photo already captured — reinitialise canvas with existing points.
      // Use bikeRawPhotos (not existing.imageDataUrl which is the annotated snapshot)
      // to avoid drawing dots on top of an already-annotated background.
      elements.canvasWrap.hidden = false;
      elements.uploadArea.hidden = true;
      elements.retakeBtn.hidden  = false;
      elements.nextBtn.disabled  = false;

      const rawDataUrl = bikeRawPhotos.get(step.id) ?? existing.imageDataUrl;
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        bikeCanvasController = initBikeGeometryCanvas(
          elements.canvas, img, step, existing.points,
          (pts, idx) => onBikePointsChanged(step, rawDataUrl, pts, idx, aspectRatio),
        );
        updateBikePrompt(step, bikeCanvasController.getActiveIndex());
      };
      img.src = rawDataUrl;
    } else {
      elements.canvasWrap.hidden = true;
      elements.uploadArea.hidden = false;
      elements.retakeBtn.hidden  = true;
      elements.nextBtn.disabled  = true;
      elements.instructions.textContent = step.instructions;
    }
  }
  ```

- [ ] **Step 5.3 — Add `processBikePhoto`, `onBikePointsChanged`, `updateBikePrompt`**

  Add these three helpers:

  ```ts
  function processBikePhoto(file: File, step: BikeGeometryStep) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Capture raw photo as dataUrl
      const tmp = document.createElement('canvas');
      tmp.width  = img.naturalWidth;
      tmp.height = img.naturalHeight;
      tmp.getContext('2d')!.drawImage(img, 0, 0);
      const rawDataUrl = tmp.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(url);
      bikeRawPhotos.set(step.id, rawDataUrl); // store raw for canvas reinit on revisit

      const aspectRatio = img.naturalWidth / img.naturalHeight;
      const existing    = bikeGeometryResults.find((r) => r.stepId === step.id);

      bikeCanvasController?.destroy();
      bikeCanvasController = initBikeGeometryCanvas(
        elements.canvas, img, step, existing?.points ?? [],
        (pts, idx) => onBikePointsChanged(step, rawDataUrl, pts, idx, aspectRatio),
      );

      elements.canvasWrap.hidden = false;
      elements.uploadArea.hidden = true;
      elements.retakeBtn.hidden  = false;
      elements.nextBtn.disabled  = false;
      updateBikePrompt(step, bikeCanvasController.getActiveIndex());
    };
    img.src = url;
  }

  function onBikePointsChanged(
    step: BikeGeometryStep,
    rawDataUrl: string,
    pts: PlacedPoint[],
    activeIndex: number,
    aspectRatio: number,
  ) {
    const angles         = computeBikeAngles(pts, step.angles, aspectRatio);
    // Snapshot annotated canvas (photo + dots + lines)
    const annotatedDataUrl = elements.canvas.toDataURL('image/jpeg', 0.85);
    const result: BikeGeometryResult = {
      stepId: step.id, stepName: step.name,
      imageDataUrl: annotatedDataUrl, points: pts, angles,
    };
    const idx = bikeGeometryResults.findIndex((r) => r.stepId === step.id);
    if (idx >= 0) bikeGeometryResults[idx] = result;
    else bikeGeometryResults.push(result);

    updateBikePrompt(step, activeIndex);
    renderResults();
    onComplete({ positions: [...positionResults], bikeGeometry: [...bikeGeometryResults] });
  }

  function updateBikePrompt(step: BikeGeometryStep, activeIndex: number) {
    if (activeIndex >= step.points.length) {
      elements.instructions.textContent = `All ${step.points.length} points placed — click Next to continue.`;
    } else {
      const pt = step.points[activeIndex];
      elements.instructions.textContent = `Tap the ${pt.label} (${activeIndex + 1} of ${step.points.length})`;
    }
  }
  ```

- [ ] **Step 5.4 — Dispatch file input to `processBikePhoto` for bike steps**

  Find the existing `elements.fileInput.addEventListener('change', ...)` handler. Replace it:

  ```ts
  elements.fileInput.addEventListener('change', () => {
    const file = elements.fileInput.files?.[0];
    if (!file) return;
    const step = steps[currentStep];
    if (step.kind === 'bike') {
      processBikePhoto(file, step);
    } else {
      processPhoto(file);
    }
    elements.fileInput.value = '';
  });
  ```

- [ ] **Step 5.5 — Update Retake button for bike steps**

  Find `elements.retakeBtn.addEventListener('click', ...)`. Replace with:

  ```ts
  elements.retakeBtn.addEventListener('click', () => {
    const step = steps[currentStep];
    if (step.kind === 'bike') {
      bikeCanvasController?.reset();
      updateBikePrompt(step, 0);
    } else {
      elements.fileInput.click();
    }
  });
  ```

- [ ] **Step 5.6 — Update `renderResults` to prepend bike geometry sections**

  Replace the existing `renderResults` function:

  ```ts
  function renderResults() {
    elements.resultsSections.innerHTML = '';

    // Bike geometry sections first
    for (const bgResult of bikeGeometryResults) {
      const section = document.createElement('div');
      section.className = 'fit-result-section';
      section.innerHTML = `<h3>${bgResult.stepName}</h3>`;

      if (bgResult.imageDataUrl) {
        const img = document.createElement('img');
        img.src = bgResult.imageDataUrl;
        img.style.cssText = 'max-width:100%;border-radius:6px;margin-bottom:8px;display:block;';
        section.appendChild(img);
      }

      const table = document.createElement('table');
      table.className = 'metric-table';
      if (bgResult.angles.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="3" style="color:#64748b;font-style:italic">No points placed yet</td>`;
        table.appendChild(row);
      } else {
        for (const a of bgResult.angles) {
          const row = document.createElement('tr');
          row.innerHTML = `<td>${a.label}</td><td>${a.value}°</td><td class="normal-range">${a.normalRange}</td>`;
          table.appendChild(row);
        }
      }
      section.appendChild(table);
      elements.resultsSections.appendChild(section);
    }

    // Rider position sections (existing logic)
    for (const result of positionResults) {
      const section = document.createElement('div');
      section.className = 'fit-result-section';
      section.innerHTML = `<h3>${result.positionName}</h3>`;
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
    elements.resultsEmpty.hidden   = hasResults;
    elements.exportBtn.hidden      = !hasResults;
  }
  ```

- [ ] **Step 5.7 — Update `getResults` in the returned controller**

  ```ts
  getResults: () => ({ positions: [...positionResults], bikeGeometry: [...bikeGeometryResults] }),
  ```

- [ ] **Step 5.8 — Update `reset()` in the returned controller to clear bike results**

  ```ts
  reset() {
    currentStep = 0;
    positionResults.length = 0;
    bikeGeometryResults.length = 0;
    bikeRawPhotos.clear();
    bikeCanvasController?.destroy();
    bikeCanvasController = null;
    elements.guidePanel.hidden = true;
    elements.positionSelectEl.hidden = true;
    elements.stepUiEl.hidden = true;
  },
  ```

- [ ] **Step 5.9 — TypeScript compile check**

  ```
  npx tsc --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 5.10 — Commit**

  ```bash
  git add bike/src/ui/fitGuide.ts
  git commit -m "feat(bike): add bike geometry step rendering, point placement, live results"
  ```

---

## Task 6: PDF Export

**Files:**
- Modify: `bike/src/report/pdfGenerator.ts`
- Modify: `bike/src/main.ts`

- [ ] **Step 6.1 — Add bike geometry sections to `generateBikeReport`**

  In `bike/src/report/pdfGenerator.ts`, add the import:

  ```ts
  import type { BikeGeometryResult } from '../analysis/types';
  ```

  Inside `generateBikeReport`, prepend bike geometry sections before the existing ride sections:

  ```ts
  // Bike geometry sections — prepended before ride/fit sections
  if (params.fitResults?.bikeGeometry?.length) {
    for (const bgResult of params.fitResults.bikeGeometry) {
      const metricRows: ReportSection['metrics'] = bgResult.angles.map((a) => ({
        label: a.label,
        result: { value: a.value, status: 'unknown' as const, unit: '°' },
        normalRange: a.normalRange,
      }));
      sections.push({
        title: `Bike Geometry — ${bgResult.stepName}`,
        metrics: metricRows,
        findings: [],
      });
    }
  }
  ```

  Also update the `reportTitle` logic to account for bike geometry:

  ```ts
  const hasBikeGeometry = (params.fitResults?.bikeGeometry?.length ?? 0) > 0;
  const hasRiderFit     = (params.fitResults?.positions?.length ?? 0) > 0;

  const reportTitle = params.rideResults
    ? 'Bike Fit & Ride Analysis Report'
    : hasBikeGeometry && hasRiderFit
      ? 'Bike Fit Analysis Report'
      : hasBikeGeometry
        ? 'Bike Geometry Report'
        : 'Bike Fit Analysis Report';
  ```

- [ ] **Step 6.2 — Update `main.ts` to initialise `bikeGeometry` in the results**

  In `bike/src/main.ts`, find where `lastFitResults` is assigned in the `initFitGuide` callback:

  ```ts
  (results) => {
    lastFitResults = results;
  },
  ```

  This receives the full `FitSessionResults` including `bikeGeometry` automatically — no change needed here. However, verify `lastFitResults` is typed as `FitSessionResults | null` (not the old shape). If `FitSessionResults` now requires `bikeGeometry`, initialise correctly:

  The `fitGuide.ts` `reset()` already ensures both arrays start empty. The `onComplete` callback always fires with both arrays. No change needed in `main.ts` unless TypeScript reports an error.

- [ ] **Step 6.3 — TypeScript compile check**

  ```
  npx tsc --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 6.4 — Commit**

  ```bash
  git add bike/src/report/pdfGenerator.ts bike/src/main.ts
  git commit -m "feat(bike): include bike geometry in PDF export"
  ```

---

## Task 7: Build & Manual Verification

- [ ] **Step 7.1 — Run full test suite**

  ```
  npm test
  ```

  Expected: all tests pass including the new `bikeGeometryMetrics` tests.

- [ ] **Step 7.2 — Build**

  ```
  npm run build
  ```

  Expected: exits 0 with no TypeScript errors and no Rollup warnings about missing exports.

- [ ] **Step 7.3 — Start dev server and verify the selector**

  ```
  npm run dev
  ```

  Open the bike app in the browser. Navigate to Fit mode. Click "Start Fit Session". Verify:
  - Two sections appear: "Bike Geometry" and "Rider on Bike"
  - Parent checkbox for each section checks/unchecks all children
  - Partial selection makes the parent indeterminate
  - "Begin Session →" is disabled when nothing is selected
  - Deselecting everything disables the button

- [ ] **Step 7.4 — Verify bike geometry step flow**

  Start a session with only `bike_side` selected. Verify:
  - Step label shows "Step 1 of 1"
  - Instructions show the bike side view instructions
  - Upload button is visible; canvas is hidden
  - Upload a bike photo → canvas appears with the photo
  - Prompt text changes to "Tap the Bottom bracket centre (1 of 7)"
  - Tapping the canvas places a green dot and advances the prompt
  - Tapping near an existing dot re-selects it for repositioning
  - After all 7 points: prompt shows "All 7 points placed — click Next to continue."
  - Results panel (right side or phone tab) shows "Full Bike Side View" with angle values
  - Retake clears dots and restarts from point 1 (photo stays)
  - "Next →" advances (or finishes if last step)

- [ ] **Step 7.5 — Verify mixed session**

  Start a session with both bike geometry and rider steps selected. Verify:
  - Bike steps appear first in sequence
  - After completing bike steps, rider steps follow with the normal photo-upload + MediaPipe flow
  - Results panel shows bike geometry sections above rider sections
  - "Export PDF" generates a report with a "Bike Geometry" section first

- [ ] **Step 7.6 — Final commit if any fixes were made**

  ```bash
  git add -A
  git commit -m "fix(bike): address issues found during manual verification"
  ```
