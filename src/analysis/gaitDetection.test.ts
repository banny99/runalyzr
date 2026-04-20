import { describe, it, expect } from 'vitest';
import { detectGaitEvents, calculateCadence, segmentGaitCycles } from './gaitDetection';
import type { FrameData, GaitEvent, Landmark } from './types';

function makeFrames(ankleYValues: number[], leftAnkle = true): FrameData[] {
  const ankleIdx = leftAnkle ? 27 : 28;
  return ankleYValues.map((y, i) => {
    const lms = Array(33).fill(null).map((_, li): Landmark => ({
      x: 0.5, y: li === ankleIdx ? y : 0.5, z: 0, visibility: 1,
    }));
    return { timestamp: i * (1000 / 30), landmarks: lms, worldLandmarks: lms };
  });
}

describe('detectGaitEvents', () => {
  it('detects footstrikes at local maxima of ankle y', () => {
    // Sinusoidal oscillation with clear peak at ~frame 15
    const ys = Array(60).fill(0).map((_, i) =>
      0.7 + 0.1 * Math.sin((i / 30) * Math.PI * 2 - Math.PI / 2)
    );
    const frames = makeFrames(ys);
    const events = detectGaitEvents(frames, 30);
    const footstrikes = events.filter(e => e.type === 'footstrike' && e.foot === 'left');
    expect(footstrikes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('calculateCadence', () => {
  it('returns 180 spm for 30 footstrikes over 10 seconds', () => {
    const events: GaitEvent[] = Array(30).fill(null).map((_, i) => ({
      type: 'footstrike' as const,
      foot: (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
      frameIndex: i * 10,
      timestamp: i * (10000 / 30),
    }));
    expect(calculateCadence(events, 10)).toBe(180);
  });

  it('returns 0 for zero duration', () => {
    expect(calculateCadence([], 0)).toBe(0);
  });
});

describe('segmentGaitCycles', () => {
  it('creates one cycle between two consecutive footstrikes of the same foot', () => {
    const events: GaitEvent[] = [
      { type: 'footstrike', foot: 'left', frameIndex: 0, timestamp: 0 },
      { type: 'toe_off', foot: 'left', frameIndex: 10, timestamp: 333 },
      { type: 'footstrike', foot: 'left', frameIndex: 30, timestamp: 1000 },
    ];
    const cycles = segmentGaitCycles(events);
    const leftCycles = cycles.filter(c => c.foot === 'left');
    expect(leftCycles).toHaveLength(1);
    expect(leftCycles[0].startFrame).toBe(0);
    expect(leftCycles[0].endFrame).toBe(30);
    expect(leftCycles[0].toeOffFrame).toBe(10);
  });
});
