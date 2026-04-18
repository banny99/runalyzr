import { describe, it, expect } from 'vitest';
import {
  calculateKneeFlexionAtContact,
  calculateTrunkLateralLean,
  calculateVerticalOscillation,
  calculateAllMetrics,
} from './metrics';
import type { FrameData, GaitEvent, Landmark } from './types';

function lm(x: number, y: number): Landmark {
  return { x, y, z: 0, visibility: 1 };
}

function makeFrame(overrides: Partial<Record<number, Landmark>>): FrameData {
  const base = Array(33).fill(null).map(() => lm(0.5, 0.5));
  Object.entries(overrides).forEach(([i, l]) => { base[Number(i)] = l!; });
  return { timestamp: 0, landmarks: base };
}

describe('calculateKneeFlexionAtContact', () => {
  it('returns null when no footstrike events', () => {
    expect(calculateKneeFlexionAtContact([], [], 'left')).toBeNull();
  });

  it('calculates knee angle at footstrike frame', () => {
    const frame = makeFrame({
      23: lm(0.5, 0.3),   // left hip
      25: lm(0.52, 0.55), // left knee
      27: lm(0.48, 0.78), // left ankle
    });
    const events: GaitEvent[] = [
      { type: 'footstrike', foot: 'left', frameIndex: 0, timestamp: 0 },
    ];
    const result = calculateKneeFlexionAtContact([frame], events, 'left');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(140);
    expect(result!).toBeLessThan(180);
  });
});

describe('calculateTrunkLateralLean', () => {
  it('returns null when no footstrike events', () => {
    expect(calculateTrunkLateralLean([], [])).toBeNull();
  });

  it('returns ~0 for a vertical trunk', () => {
    const frame = makeFrame({
      11: lm(0.4, 0.2), // left shoulder
      12: lm(0.6, 0.2), // right shoulder
      23: lm(0.4, 0.5), // left hip
      24: lm(0.6, 0.5), // right hip
    });
    const events: GaitEvent[] = [
      { type: 'footstrike', foot: 'left', frameIndex: 0, timestamp: 0 },
    ];
    const result = calculateTrunkLateralLean([frame], events);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0, 1);
  });
});

describe('calculateVerticalOscillation', () => {
  it('returns peak-to-peak hip oscillation in cm', () => {
    const frames: FrameData[] = [0.45, 0.5, 0.55, 0.5, 0.45].map((y) =>
      makeFrame({ 23: lm(0.4, y), 24: lm(0.6, y) })
    );
    const result = calculateVerticalOscillation(frames);
    // midpoint y oscillates 0.45–0.55, displacement = 0.1 × 100 = 10 cm
    expect(result).toBeCloseTo(10, 0);
  });
});

describe('calculateAllMetrics', () => {
  it('returns null for frontal-only metrics when view is sagittal', () => {
    const results = calculateAllMetrics([], [], [], 30, 'sagittal');
    expect(results.pelvicDrop).toBeNull();
    expect(results.hipAdduction).toBeNull();
  });

  it('returns null for sagittal-only metrics when view is frontal', () => {
    const results = calculateAllMetrics([], [], [], 30, 'frontal');
    expect(results.kneeFlexionAtContact).toBeNull();
    expect(results.ankleDorsiflexion).toBeNull();
  });
});
