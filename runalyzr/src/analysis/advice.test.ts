import { describe, it, expect } from 'vitest';
import { makeMetricResult } from './thresholds';
import { generateFindings } from './findings';
import { calculateAnkleDorsiflexion } from './metrics';
import type { AnalysisResults, FrameData, GaitEvent, Landmark } from './types';
import { LANDMARKS } from '../config/defaults';

// End-to-end advice checks: raw value → real THRESHOLDS → real templates.

const L = LANDMARKS;

function results(overrides: Partial<AnalysisResults>): AnalysisResults {
  return {
    kneeFlexionAtContact: null, cadence: null, pelvicDrop: null,
    trunkLateralLean: null, hipAdduction: null, ankleDorsiflexion: null,
    verticalOscillation: null, overstriding: null, strideSymmetry: null,
    groundContactTime: null,
    ...overrides,
  };
}

function kneeAdvice(value: number): string[] {
  return generateFindings(results({ kneeFlexionAtContact: makeMetricResult(value, 'kneeFlexionAtContact') }))
    .map((f) => f.text);
}

describe('knee angle at contact', () => {
  it('flags a near-straight knee instead of showing it green', () => {
    expect(makeMetricResult(178, 'kneeFlexionAtContact').status).toBe('red');
    expect(makeMetricResult(172, 'kneeFlexionAtContact').status).toBe('amber');
    expect(kneeAdvice(178)[0]).toMatch(/nearly fully extended/i);
  });

  it('never calls a well-bent knee "extended"', () => {
    expect(makeMetricResult(140, 'kneeFlexionAtContact').status).toBe('red');
    const [text] = kneeAdvice(140);
    expect(text).not.toMatch(/extended/i);
    expect(text).toMatch(/flexed/i);
  });
});

describe('ankle dorsiflexion', () => {
  const p = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 1 });

  // World coords, y increases downward. Shank vertical (knee straight above
  // the ankle); the sole runs heel → toe.
  function ankleAt(soleRiseDeg: number): number | null {
    const base = Array.from({ length: 33 }, () => p(0, 0));
    const rise = Math.tan((soleRiseDeg * Math.PI) / 180) * 0.2;
    base[L.LEFT_KNEE]       = p(0, -0.4);
    base[L.LEFT_ANKLE]      = p(0, 0);
    base[L.LEFT_HEEL]       = p(-0.05, 0.05);
    base[L.LEFT_FOOT_INDEX] = p(0.15, 0.05 - rise);
    const frames: FrameData[] = [{ timestamp: 0, landmarks: base, worldLandmarks: base }];
    const events: GaitEvent[] = [{ type: 'footstrike', foot: 'left', frameIndex: 0, timestamp: 0 }];
    return calculateAnkleDorsiflexion(frames, events, 'left');
  }

  it('reads a neutral ankle (flat foot under a vertical shank) as ~0°, not ~90°', () => {
    expect(ankleAt(0)).toBeCloseTo(0, 0);
  });

  it('reads toes lifted 10° as 10° of dorsiflexion', () => {
    expect(ankleAt(10)).toBeCloseTo(10, 0);
  });
});
