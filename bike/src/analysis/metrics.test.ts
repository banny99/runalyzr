import { describe, it, expect } from 'vitest';
import { calculateRearMetrics } from './metrics/rear';
import { calculateFrontMetrics } from './metrics/front';
import type { FrameData } from '@runalyzr/shared/types';
import type { PedalEvent } from './types';
import { LANDMARKS } from '../config/defaults';

const L = LANDMARKS;

function lm(x: number, y: number, z = 0) {
  return { x, y, z, visibility: 1 };
}

function makeFrame(overrides: Partial<Record<number, ReturnType<typeof lm>>> = {}): FrameData {
  const base = Array(33).fill(null).map(() => lm(0.5, 0.5));
  for (const [idx, val] of Object.entries(overrides)) {
    base[Number(idx)] = val!;
  }
  return { timestamp: 0, landmarks: base, worldLandmarks: base };
}

describe('calculateRearMetrics — hipRock', () => {
  it('returns null when fewer than 2 frames have valid bilateral hip landmarks', () => {
    const frames = [makeFrame()];
    const result = calculateRearMetrics(frames, []);
    expect(result.hipRock).toBeNull();
  });

  it('computes hip rock from lateral hip displacement', () => {
    // hipRock = (max - min) of hip midX * 100
    // Frame 1: midX = (0.35 + 0.45) / 2 = 0.40
    // Frame 2: midX = (0.55 + 0.65) / 2 = 0.60
    // delta = 0.20, * 100 = 20
    const frames = [
      makeFrame({ [L.LEFT_HIP]: lm(0.35, 0.5), [L.RIGHT_HIP]: lm(0.45, 0.5) }),
      makeFrame({ [L.LEFT_HIP]: lm(0.55, 0.5), [L.RIGHT_HIP]: lm(0.65, 0.5) }),
    ];
    const result = calculateRearMetrics(frames, []);
    expect(result.hipRock).not.toBeNull();
    expect(result.hipRock!.value).toBeCloseTo(20, 0);
  });
});

describe('calculateFrontMetrics — kneeSymmetry', () => {
  it('returns null when no left BDC events', () => {
    const frames = [makeFrame(), makeFrame()];
    const result = calculateFrontMetrics(frames, []);
    expect(result.kneeSymmetry).toBeNull();
  });

  it('returns null when no right BDC events', () => {
    const frames = [makeFrame()];
    const events: PedalEvent[] = [
      { phase: 'bdc', side: 'left', frameIndex: 0, timestamp: 0 },
    ];
    const result = calculateFrontMetrics(frames, events);
    expect(result.kneeSymmetry).toBeNull();
  });

  it('reports near-zero asymmetry when knees are equidistant from midline', () => {
    // left knee at 0.45 (lDev=0.05), right knee at 0.55 (rDev=0.05)
    // symmetry = |0.05 - 0.05| * 100 = 0
    const frame = makeFrame({
      [L.LEFT_KNEE]:  lm(0.45, 0.6),
      [L.RIGHT_KNEE]: lm(0.55, 0.6),
    });
    const events: PedalEvent[] = [
      { phase: 'bdc', side: 'left',  frameIndex: 0, timestamp: 0 },
      { phase: 'bdc', side: 'right', frameIndex: 0, timestamp: 0 },
    ];
    const frames = [frame];
    const result = calculateFrontMetrics(frames, events);
    expect(result.kneeSymmetry).not.toBeNull();
    expect(result.kneeSymmetry!.value).toBeCloseTo(0, 5);
  });
});
