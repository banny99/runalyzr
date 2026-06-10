import { describe, it, expect } from 'vitest';
import {
  measureRear6OClock,
  measureRearNeutral,
  measureFront6OClock,
  measureSide3OClock,
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

// A symmetric rider: level hips/shoulders, legs tracking straight down.
function symmetricRider(): LandmarkArray {
  return world({
    [L.LEFT_SHOULDER]:  lm(-0.2, -0.5),
    [L.RIGHT_SHOULDER]: lm(0.2, -0.5),
    [L.LEFT_HIP]:       lm(-0.1, 0),
    [L.RIGHT_HIP]:      lm(0.1, 0),
    [L.LEFT_KNEE]:      lm(-0.1, 0.4),
    [L.RIGHT_KNEE]:     lm(0.1, 0.4),
    [L.LEFT_ANKLE]:     lm(-0.1, 0.8),
    [L.RIGHT_ANKLE]:    lm(0.1, 0.8),
  });
}

describe('measureRearNeutral — pelvic obliquity', () => {
  it('reports 0° for level hips', () => {
    const result = measureRearNeutral(symmetricRider());
    expect(result).toHaveLength(1);
    expect(result[0].value).toBeCloseTo(0, 1);
    expect(result[0].unit).toBe('°');
  });

  it('reports 45° when hip line rises as much as it spans', () => {
    const wlm = world({
      [L.LEFT_HIP]:  lm(-0.1, -0.1),
      [L.RIGHT_HIP]: lm(0.1, 0.1),
    });
    const result = measureRearNeutral(wlm);
    expect(result[0].value).toBeCloseTo(45, 1);
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
