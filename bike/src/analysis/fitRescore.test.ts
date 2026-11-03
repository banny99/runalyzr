import { describe, it, expect, afterEach } from 'vitest';
import { FIT_THRESHOLDS, fitThresholds } from './fitThresholds';
import type { FitMetricId } from './fitThresholds';
import { geometryThresholds } from './geometryThresholds';
import { rescoreFitResults } from './fitRescore';
import { measureSide3OClock, measureSide6OClock, measureSide9OClock, measureRear6OClock, measureFront6OClock } from './fitMetrics';
import { evaluateThreshold } from '@runalyzr/shared/analysis';
import { LANDMARKS } from '../config/defaults';
import type { LandmarkArray } from '@runalyzr/shared/types';
import type { BikeGeometryResult, FitMeasurement, FitPositionResult, FitSessionResults } from './types';

const L = LANDMARKS;
const lm = (x: number, y: number) => ({ x, y, z: 0, visibility: 1 });

// Torso leans ~22° from vertical (outside a 0–1° band), legs straight.
function rider(): LandmarkArray {
  const base: LandmarkArray = Array(33).fill(null).map(() => lm(0, 0));
  const set: Record<number, ReturnType<typeof lm>> = {
    [L.LEFT_SHOULDER]: lm(-0.2, -0.5), [L.RIGHT_SHOULDER]: lm(0.2, -0.5),
    [L.LEFT_ELBOW]: lm(0, -0.3), [L.RIGHT_ELBOW]: lm(0.4, -0.3),
    [L.LEFT_WRIST]: lm(0.1, -0.1), [L.RIGHT_WRIST]: lm(0.5, -0.1),
    [L.LEFT_HIP]: lm(-0.1, 0), [L.RIGHT_HIP]: lm(0.1, 0),
    [L.LEFT_KNEE]: lm(-0.1, 0.4), [L.RIGHT_KNEE]: lm(0.1, 0.4),
    [L.LEFT_ANKLE]: lm(-0.1, 0.8), [L.RIGHT_ANKLE]: lm(0.1, 0.8),
  };
  for (const [i, v] of Object.entries(set)) base[Number(i)] = v;
  return base;
}

function position(id: string, measurements: FitMeasurement[]): FitPositionResult {
  return {
    positionId: id, positionName: id, landmarks: [], worldLandmarks: [],
    measurements, imageDataUrl: '', imageAspect: 1,
  };
}

afterEach(() => { fitThresholds.resetAll(); geometryThresholds.resetAll(); });

describe('fit defaults', () => {
  it('reproduce today: green inside, amber outside, never red', () => {
    for (const id of Object.keys(FIT_THRESHOLDS) as FitMetricId[]) {
      const band = fitThresholds.band(id)?.green;
      if (!band) continue;
      const entry = fitThresholds.entry(id);
      expect(evaluateThreshold((band[0] + band[1]) / 2, entry)).toBe('green');
      expect(evaluateThreshold(band[0] - 50, entry)).toBe('amber');
      expect(evaluateThreshold(band[1] + 50, entry)).toBe('amber');
    }
  });
});

describe('rescoreFitResults', () => {
  function sideResults(): FitSessionResults {
    const wlm = rider();
    return {
      bikeGeometry: [],
      positions: [
        position('side_6oclock', measureSide6OClock(wlm)),
        position('side_3oclock', measureSide3OClock(wlm)),
        position('side_9oclock', measureSide9OClock(wlm)),
      ],
    };
  }

  it('one torso setting moves all three side positions', () => {
    const results = sideResults();
    fitThresholds.set('torsoAngle', { green: [0, 1], lowRedAt: null, highRedAt: 5 });
    rescoreFitResults(results);
    const torsos = results.positions.flatMap((p) => p.measurements).filter((m) => m.label === 'Torso Angle');
    expect(torsos).toHaveLength(3);
    for (const m of torsos) {
      expect(m.value).toBeGreaterThan(5);
      expect(m.status).toBe('red');
      expect(m.normalRange).toBe('0–1°');
    }
  });

  it('both knee-alignment legs, rear and front, share one setting', () => {
    const wlm = rider();
    wlm[L.LEFT_KNEE] = lm(-0.2, 0.4);
    const results: FitSessionResults = {
      bikeGeometry: [],
      positions: [position('rear_6oclock', measureRear6OClock(wlm)), position('front_6oclock', measureFront6OClock(wlm))],
    };
    const knees = results.positions.flatMap((p) => p.measurements).filter((m) => m.label.startsWith('Knee Frontal'));
    expect(knees).toHaveLength(4);
    expect(new Set(knees.map((m) => m.id))).toEqual(new Set(['kneeFrontalAlignment']));
    fitThresholds.set('kneeFrontalAlignment', { green: [0, 20], lowRedAt: null, highRedAt: null });
    rescoreFitResults(results);
    for (const m of knees) {
      expect(m.status).toBe('green');
      expect(m.normalRange).toBe('0–20°');
    }
  });

  it('information-only reach shows "—" until a band is added', () => {
    const results = sideResults();
    const reach = () => results.positions.flatMap((p) => p.measurements).filter((m) => m.id === 'reachAngle');
    rescoreFitResults(results);
    expect(reach()).toHaveLength(3);
    for (const m of reach()) { expect(m.status).toBe('unknown'); expect(m.normalRange).toBe('—'); }
    fitThresholds.set('reachAngle', { green: [0, 90], lowRedAt: null, highRedAt: null });
    rescoreFitResults(results);
    for (const m of reach()) { expect(m.status).toBe('green'); expect(m.normalRange).toBe('0–90°'); }
  });
});

describe('rescoreFitResults — bike geometry', () => {
  it('re-colours geometry angles after a change', () => {
    const geo: BikeGeometryResult = {
      stepId: 'bike_side', stepName: 'Full Bike Side View', imageDataUrl: '', imageAspect: 1, points: [],
      angles: [
        { id: 'seat_tube_angle', label: 'Seat Tube Angle', value: 73, normalRange: '72–74°', status: 'green' },
        { id: 'bar_drop_angle', label: 'Bar Drop', value: 5, normalRange: '—', status: 'unknown' },
      ],
    };
    const results: FitSessionResults = { positions: [], bikeGeometry: [geo] };
    geometryThresholds.set('seat_tube_angle', { green: [60, 65], lowRedAt: null, highRedAt: 70 });
    geometryThresholds.addBand('bar_drop_angle');
    rescoreFitResults(results);
    expect(geo.angles[0].status).toBe('red');
    expect(geo.angles[0].normalRange).toBe('60–65°');
    expect(geo.angles[1].status).toBe('green');
    expect(geo.angles[1].normalRange).toBe('0–10°');
  });
});
