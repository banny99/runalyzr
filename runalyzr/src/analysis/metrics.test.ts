import { describe, it, expect } from 'vitest';
import {
  calculateKneeFlexionAtContact,
  calculateTrunkLateralLean,
  calculateVerticalOscillation,
  calculatePelvicDrop,
  calculateGroundContactTime,
  calculateAllMetrics,
} from './metrics';
import type { FrameData, GaitEvent, GaitCycle, Landmark } from './types';

function lm(x: number, y: number): Landmark {
  return { x, y, z: 0, visibility: 1 };
}

function makeFrame(overrides: Partial<Record<number, Landmark>>): FrameData {
  const base = Array(33).fill(null).map(() => lm(0.5, 0.5));
  Object.entries(overrides).forEach(([i, l]) => { base[Number(i)] = l!; });
  return { timestamp: 0, landmarks: [...base], worldLandmarks: [...base] };
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
  it('returns peak-to-peak hip oscillation as % of frame height', () => {
    const frames: FrameData[] = [0.45, 0.5, 0.55, 0.5, 0.45].map((y) =>
      makeFrame({ 23: lm(0.4, y), 24: lm(0.6, y) })
    );
    const result = calculateVerticalOscillation(frames);
    // image-landmark midpoint y oscillates 0.45–0.55 of frame height,
    // displacement = 0.1 × 100 = 10 % of frame (framing-dependent — honest cm
    // would need a calibration reference; same reasoning as bike's CLAUDE.md)
    expect(result).toBeCloseTo(10, 0);
  });
});

describe('calculatePelvicDrop', () => {
  const events: GaitEvent[] = [
    { type: 'footstrike', foot: 'left',  frameIndex: 0, timestamp: 0 },
    { type: 'footstrike', foot: 'right', frameIndex: 0, timestamp: 100 },
  ];

  it('reports 0° for a level hip line', () => {
    const frame = makeFrame({ 23: lm(0.4, 0.5), 24: lm(0.6, 0.5) });
    expect(calculatePelvicDrop([frame], events)).toBeCloseTo(0, 1);
  });

  it('reports the hip-line tilt in degrees (45° when drop equals span)', () => {
    // hips 0.2 apart horizontally with a 0.2 vertical offset → 45° tilt
    const frame = makeFrame({ 23: lm(0.4, 0.4), 24: lm(0.6, 0.6) });
    expect(calculatePelvicDrop([frame], events)).toBeCloseTo(45, 1);
  });
});

describe('calculateGroundContactTime', () => {
  const cycle = (footstrike: number, toeOff: number, estimated: boolean): GaitCycle => ({
    foot: 'left',
    startFrame: footstrike,
    endFrame: footstrike + 30,
    footstrikeFrame: footstrike,
    toeOffFrame: toeOff,
    toeOffEstimated: estimated,
  });

  it('averages only cycles with a measured toe-off', () => {
    // measured: (10-0)/30fps = 333ms; the estimated 20-frame cycle must not skew it
    const result = calculateGroundContactTime([cycle(0, 10, false), cycle(30, 50, true)], 30);
    expect(result).toBeCloseTo(333, 0);
  });

  it('returns null when every toe-off is estimated (would be fiction)', () => {
    expect(calculateGroundContactTime([cycle(0, 12, true)], 30)).toBeNull();
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

  it('does not fabricate frontal metrics when the view is unknown (assumes sagittal)', () => {
    const frame = makeFrame({ 23: lm(0.4, 0.4), 24: lm(0.6, 0.6) });
    const events: GaitEvent[] = [
      { type: 'footstrike', foot: 'left',  frameIndex: 0, timestamp: 0 },
      { type: 'footstrike', foot: 'right', frameIndex: 0, timestamp: 100 },
    ];
    const results = calculateAllMetrics([frame], events, [], 30, 'unknown');
    expect(results.pelvicDrop).toBeNull();
    expect(results.hipAdduction).toBeNull();
    expect(results.trunkLateralLean).toBeNull();
    // ...and DOES compute the sagittal set (unknown assumes side view)
    expect(results.kneeFlexionAtContact).not.toBeNull();
  });
});
