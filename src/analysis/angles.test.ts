import { describe, it, expect } from 'vitest';
import {
  angleBetweenThreePoints,
  lateralAngle,
  verticalDisplacement,
  midpoint,
} from './angles';
import type { Landmark, FrameData } from './types';

const lm = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 1 });

describe('angleBetweenThreePoints', () => {
  it('returns 90° for a right angle', () => {
    expect(angleBetweenThreePoints(lm(0, 0), lm(1, 0), lm(1, 1))).toBeCloseTo(90, 1);
  });

  it('returns 180° for a straight line', () => {
    expect(angleBetweenThreePoints(lm(0, 0), lm(1, 0), lm(2, 0))).toBeCloseTo(180, 1);
  });

  it('returns >140° and <180° for a slightly bent knee', () => {
    const hip = lm(0.5, 0.3);
    const knee = lm(0.52, 0.55);
    const ankle = lm(0.48, 0.78);
    const angle = angleBetweenThreePoints(hip, knee, ankle);
    expect(angle).toBeGreaterThan(140);
    expect(angle).toBeLessThan(180);
  });
});

describe('lateralAngle', () => {
  it('returns 0° for a perfectly vertical line', () => {
    expect(lateralAngle(lm(0.5, 0.2), lm(0.5, 0.8))).toBeCloseTo(0, 1);
  });

  it('returns ~45° for a 45° lean', () => {
    expect(lateralAngle(lm(0.3, 0.2), lm(0.7, 0.6))).toBeCloseTo(45, 1);
  });
});

describe('midpoint', () => {
  it('returns midpoint of two landmarks', () => {
    const m = midpoint(lm(0.2, 0.4), lm(0.6, 0.8));
    expect(m.x).toBeCloseTo(0.4);
    expect(m.y).toBeCloseTo(0.6);
  });
});

describe('verticalDisplacement', () => {
  it('returns peak-to-peak y displacement × 100 in cm', () => {
    const makeFrame = (y: number): FrameData => {
      const lms = Array(33).fill(null).map((_, i) =>
        i === 23 ? lm(0.5, y) : lm(0.5, 0.5)
      );
      return { timestamp: 0, landmarks: lms, worldLandmarks: lms };
    };
    const frames: FrameData[] = [
      makeFrame(0.4), makeFrame(0.5), makeFrame(0.6),
      makeFrame(0.5), makeFrame(0.4),
    ];
    // peak-to-peak = 0.6 - 0.4 = 0.2 × 100 = 20 cm
    expect(verticalDisplacement(23, frames)).toBeCloseTo(20, 1);
  });
});
