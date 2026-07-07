import { describe, it, expect } from 'vitest';
import {
  measureRear6OClock,
  measureFront6OClock,
  measureSide3OClock,
  sideUpperBody,
} from './fitMetrics';
import { LANDMARKS } from '../config/defaults';
import type { LandmarkArray } from '@runalyzr/shared/types';

const L = LANDMARKS;

function lm(x: number, y: number, z = 0) {
  return { x, y, z, visibility: 1 };
}

// World landmarks: metres, hip-centred origin, y increases downward.
function world(overrides: Partial<Record<number, ReturnType<typeof lm>>> = {}): LandmarkArray {
  const base: LandmarkArray = Array(33).fill(null).map(() => lm(0, 0));
  for (const [idx, val] of Object.entries(overrides)) {
    base[Number(idx)] = val!;
  }
  return base;
}

// A symmetric rider: level hips/shoulders, legs tracking straight down, arms
// on the bars (elbow/wrist populated so upper-body angles are measurable).
function symmetricRider(): LandmarkArray {
  return world({
    [L.LEFT_SHOULDER]:  lm(-0.2, -0.5),
    [L.RIGHT_SHOULDER]: lm(0.2, -0.5),
    [L.LEFT_ELBOW]:     lm(0, -0.3),
    [L.RIGHT_ELBOW]:    lm(0.4, -0.3),
    [L.LEFT_WRIST]:     lm(0.1, -0.1),
    [L.RIGHT_WRIST]:    lm(0.5, -0.1),
    [L.LEFT_HIP]:       lm(-0.1, 0),
    [L.RIGHT_HIP]:      lm(0.1, 0),
    [L.LEFT_KNEE]:      lm(-0.1, 0.4),
    [L.RIGHT_KNEE]:     lm(0.1, 0.4),
    [L.LEFT_ANKLE]:     lm(-0.1, 0.8),
    [L.RIGHT_ANKLE]:    lm(0.1, 0.8),
  });
}

describe('sideUpperBody — torso / elbow / reach / shoulder', () => {
  // Clean left-side geometry with right-angle joints for exact expectations.
  const sideRider = world({
    [L.LEFT_SHOULDER]: lm(0, -0.5),
    [L.LEFT_HIP]:      lm(0, 0),      // torso straight down → 0° from vertical
    [L.LEFT_ELBOW]:    lm(0.5, -0.5), // shoulder→elbow→wrist right angle
    [L.LEFT_WRIST]:    lm(0.5, 0),    // shoulder→wrist at 45° from vertical
  });

  it('reports the four upper-body angles with expected values', () => {
    const r = sideUpperBody(sideRider);
    const by = (label: string) => r.find((m) => m.label === label)!;
    expect(r.map((m) => m.label)).toEqual(['Torso Angle', 'Elbow Angle', 'Reach Angle', 'Shoulder Angle']);
    expect(by('Torso Angle').value).toBeCloseTo(0, 1);
    expect(by('Elbow Angle').value).toBeCloseTo(90, 1);
    expect(by('Reach Angle').value).toBeCloseTo(45, 1);
    expect(by('Shoulder Angle').value).toBeCloseTo(90, 1);
  });

  it('marks Torso/Elbow with a band status but Reach/Shoulder informational', () => {
    const r = sideUpperBody(sideRider);
    const by = (label: string) => r.find((m) => m.label === label)!;
    expect(by('Torso Angle').status).not.toBe('unknown'); // has a band
    expect(by('Reach Angle').status).toBe('unknown');     // informational
    expect(by('Shoulder Angle').status).toBe('unknown');  // informational
  });

  it('still reports torso lean when the hand/elbow is occluded (shoulder+hip only)', () => {
    // Sparse array: only shoulder + hip present, elbow/wrist absent (undefined),
    // as happens when the near-side hand is occluded at 9 o'clock.
    const wlm: LandmarkArray = [];
    wlm[L.LEFT_SHOULDER] = lm(0, -0.5);
    wlm[L.LEFT_HIP] = lm(0, 0);
    const r = sideUpperBody(wlm);
    expect(r.map((m) => m.label)).toEqual(['Torso Angle']);
    expect(r[0].value).toBeCloseTo(0, 1);
  });

  it('returns [] when no upper-body landmarks are available', () => {
    expect(sideUpperBody([])).toHaveLength(0);
  });
});

describe('side crank positions include upper-body angles', () => {
  it('measureSide3OClock now reports elbow/reach/shoulder alongside KOPS', () => {
    const labels = measureSide3OClock(symmetricRider()).map((m) => m.label);
    expect(labels).toContain('Shank Angle (KOPS)');
    expect(labels).toContain('Elbow Angle');
    expect(labels).toContain('Reach Angle');
    expect(labels).toContain('Shoulder Angle');
  });
});

describe('measureRear6OClock — knee frontal alignment', () => {
  it('reports 0° deviation when each knee sits on its hip–ankle line', () => {
    const result = measureRear6OClock(symmetricRider());
    expect(result).toHaveLength(3);
    expect(result[1].value).toBeCloseTo(0, 1); // left knee
    expect(result[2].value).toBeCloseTo(0, 1); // right knee
  });

  it('detects a laterally deviated knee', () => {
    const wlm = symmetricRider();
    wlm[L.LEFT_KNEE] = lm(-0.2, 0.4); // 0.1 m outward at 0.4 m below hip
    const result = measureRear6OClock(wlm);
    // hip→knee direction is atan2(-0.1, 0.4) ≈ 14° off the hip→ankle line
    expect(result[1].value).toBeCloseTo(14, 0);
    expect(result[2].value).toBeCloseTo(0, 1);
  });

  it('returns empty when landmarks are missing', () => {
    expect(measureRear6OClock([])).toHaveLength(0);
  });
});

describe('measureFront6OClock — shoulder tilt', () => {
  it('reports the shoulder line tilt in degrees', () => {
    const wlm = symmetricRider();
    wlm[L.LEFT_SHOULDER]  = lm(-0.2, -0.5);
    wlm[L.RIGHT_SHOULDER] = lm(0.2, -0.45); // 0.05 m drop over 0.4 m span ≈ 7.1°
    const result = measureFront6OClock(wlm);
    const shoulderTilt = result.find((m) => m.label === 'Shoulder Tilt')!;
    expect(shoulderTilt.value).toBeCloseTo(7.1, 1);
  });

  it('includes lateral trunk lean (0° when the trunk is centred)', () => {
    const result = measureFront6OClock(symmetricRider());
    const lean = result.find((m) => m.label === 'Lateral Trunk Lean');
    expect(lean).toBeDefined();
    expect(lean!.value).toBeCloseTo(0, 1);
  });
});

describe('measureSide3OClock — shank angle (KOPS)', () => {
  it('reports 0° when the knee is directly above the ankle', () => {
    const result = measureSide3OClock(symmetricRider());
    const shank = result.find((m) => m.label === 'Shank Angle (KOPS)')!;
    expect(shank.value).toBeCloseTo(0, 1);
  });

  it('reports the forward lean of the shank', () => {
    const wlm = symmetricRider();
    wlm[L.LEFT_KNEE] = lm(-0.05, 0.4); // knee 0.05 m forward of ankle, 0.4 m up ≈ 7.1°
    const result = measureSide3OClock(wlm);
    const shank = result.find((m) => m.label === 'Shank Angle (KOPS)')!;
    expect(shank.value).toBeCloseTo(7.1, 1);
  });
});
