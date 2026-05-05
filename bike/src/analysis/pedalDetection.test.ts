import { describe, it, expect } from 'vitest';
import { detectPedalEvents, segmentPedalCycles, calculateCadence } from './pedalDetection';
import type { FrameData } from '@runalyzr/shared/types';
import { LANDMARKS } from '../config/defaults';

const L = LANDMARKS;

function makeFrame(
  kneeAngle: number,
  timestamp: number,
): FrameData {
  const rad = (kneeAngle * Math.PI) / 180;
  const lms = Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const wlms = Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  wlms[L.LEFT_HIP]   = { x: 0,                        y: 0,                        z: 0, visibility: 1 };
  wlms[L.LEFT_KNEE]  = { x: 0,                        y: 1,                        z: 0, visibility: 1 };
  wlms[L.LEFT_ANKLE] = { x: Math.sin(Math.PI - rad),  y: 1 + Math.cos(Math.PI - rad), z: 0, visibility: 1 };
  wlms[L.RIGHT_HIP]   = { x: 0,                       y: 0,                        z: 0, visibility: 1 };
  wlms[L.RIGHT_KNEE]  = { x: 0,                       y: 1,                        z: 0, visibility: 1 };
  wlms[L.RIGHT_ANKLE] = { x: Math.sin(Math.PI - rad), y: 1 + Math.cos(Math.PI - rad), z: 0, visibility: 1 };
  return { timestamp, landmarks: lms as any, worldLandmarks: wlms as any };
}

describe('detectPedalEvents', () => {
  it('detects BDC events at knee angle peaks', () => {
    const angles = [100, 120, 140, 155, 160, 155, 140, 120, 100, 120, 140, 160];
    const frames = angles.map((a, i) => makeFrame(a, i * 33));
    const events = detectPedalEvents(frames, 30);
    const bdcs = events.filter((e) => e.phase === 'bdc');
    expect(bdcs.length).toBeGreaterThanOrEqual(1);
  });

  it('detects TDC events at knee angle troughs', () => {
    const angles = [100, 120, 140, 160, 140, 120, 100, 120, 140, 160];
    const frames = angles.map((a, i) => makeFrame(a, i * 33));
    const events = detectPedalEvents(frames, 30);
    const tdcs = events.filter((e) => e.phase === 'tdc');
    expect(tdcs.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for flat (no movement) frames', () => {
    const frames = Array(20).fill(null).map((_, i) => makeFrame(140, i * 33));
    const events = detectPedalEvents(frames, 30);
    expect(events).toHaveLength(0);
  });
});

describe('calculateCadence', () => {
  it('computes rpm from BDC event count', () => {
    const events = [
      { phase: 'bdc' as const, side: 'left'  as const, frameIndex: 0,  timestamp: 0    },
      { phase: 'bdc' as const, side: 'right' as const, frameIndex: 30, timestamp: 1000 },
      { phase: 'bdc' as const, side: 'left'  as const, frameIndex: 60, timestamp: 2000 },
      { phase: 'bdc' as const, side: 'right' as const, frameIndex: 90, timestamp: 3000 },
    ];
    // 4 BDC events / 2 sides / 2 s * 60 = 60 rpm
    expect(calculateCadence(events, 2)).toBe(60);
  });

  it('returns 0 for zero duration', () => {
    expect(calculateCadence([], 0)).toBe(0);
  });
});

describe('segmentPedalCycles', () => {
  it('pairs consecutive same-side BDC events into cycles', () => {
    const events = [
      { phase: 'bdc' as const, side: 'left' as const, frameIndex: 0,  timestamp: 0    },
      { phase: 'bdc' as const, side: 'left' as const, frameIndex: 30, timestamp: 1000 },
    ];
    const cycles = segmentPedalCycles(events);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].startFrame).toBe(0);
    expect(cycles[0].endFrame).toBe(30);
  });
});
