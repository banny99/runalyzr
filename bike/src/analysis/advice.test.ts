import { describe, it, expect } from 'vitest';
import type { FrameData } from '@runalyzr/shared/types';
import { makeMetricResult } from './thresholds';
import { generateSagittalFindings } from './findings';
import { calculateSagittalMetrics } from './metrics/sagittal';
import type { SagittalMetrics, PedalEvent } from './types';
import { LANDMARKS } from '../config/defaults';

// End-to-end advice checks: raw value → real THRESHOLDS table → real finding
// templates. The older findings tests set statuses by hand, which is how a
// "raise the saddle" for a too-high saddle shipped with green CI.

const L = LANDMARKS;

function sagittal(overrides: Partial<SagittalMetrics>): SagittalMetrics {
  return {
    kneeExtensionBDC: null, kneeFlexionTDC: null, hipAngleTDC: null,
    hipVerticalOscillation: null, torsoAngle: null, pelvicTilt: null,
    elbowAngle: null, shoulderAngle: null, reachAngle: null, wristAngle: null,
    ankleAnkling: null, cadence: null,
    ...overrides,
  };
}

function adviceFor(key: keyof SagittalMetrics, value: number): string[] {
  return generateSagittalFindings(sagittal({ [key]: makeMetricResult(value, key) })).map((f) => f.text);
}

describe('knee extension at BDC', () => {
  it('flags an over-extended knee (saddle too high) and advises lowering', () => {
    expect(makeMetricResult(165, 'kneeExtensionBDC').status).toBe('red');
    const [text] = adviceFor('kneeExtensionBDC', 165);
    expect(text).toMatch(/lower the saddle/i);
    expect(text).not.toMatch(/raise/i);
  });

  it('flags a bent knee (saddle too low) and advises raising', () => {
    expect(makeMetricResult(130, 'kneeExtensionBDC').status).toBe('red');
    expect(adviceFor('kneeExtensionBDC', 130)[0]).toMatch(/raise the saddle/i);
  });

  it('is green inside 145–155°', () => {
    expect(makeMetricResult(150, 'kneeExtensionBDC').status).toBe('green');
  });
});

describe('knee flexion at TDC', () => {
  it('is reported as flexion (180° − interior angle), so a normal rider is green', () => {
    // Interior hip–knee–ankle angle of 70° at TDC = 110° of flexion: typical.
    const rad = (70 * Math.PI) / 180;
    const base = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    base[L.RIGHT_HIP]   = { x: -1, y: 0, z: 0, visibility: 1 };
    base[L.RIGHT_KNEE]  = { x: 0, y: 0, z: 0, visibility: 1 };
    base[L.RIGHT_ANKLE] = { x: -Math.cos(rad), y: Math.sin(rad), z: 0, visibility: 1 };
    const frames: FrameData[] = [{ timestamp: 0, landmarks: base, worldLandmarks: base }];
    const events: PedalEvent[] = [{ phase: 'tdc', side: 'right', frameIndex: 0, timestamp: 0 }];

    const result = calculateSagittalMetrics(frames, 30, events, []).kneeFlexionTDC;
    expect(result!.value).toBeCloseTo(110, 0);
    expect(result!.status).toBe('green');
  });

  it('a very compressed knee advises raising the saddle, never lowering it', () => {
    expect(makeMetricResult(135, 'kneeFlexionTDC').status).toBe('red');
    const [text] = adviceFor('kneeFlexionTDC', 135);
    expect(text).toMatch(/raise/i);
    expect(text).not.toMatch(/lower the saddle/i);
  });

  it('an unusually open knee points at a saddle that may be too high', () => {
    expect(makeMetricResult(80, 'kneeFlexionTDC').status).toBe('red');
    expect(adviceFor('kneeFlexionTDC', 80)[0]).toMatch(/too high/i);
  });
});

describe('hip angle at TDC', () => {
  it('a closed hip never advises lowering the saddle (that closes it further)', () => {
    expect(makeMetricResult(40, 'hipAngleTDC').status).toBe('red');
    const [text] = adviceFor('hipAngleTDC', 40);
    expect(text).not.toMatch(/lower the saddle/i);
    expect(text).toMatch(/handlebar|reach/i);
  });
});

describe('elbow angle', () => {
  it('flags locked elbows instead of showing them green', () => {
    expect(makeMetricResult(175, 'elbowAngle').status).toBe('red');
    expect(makeMetricResult(165, 'elbowAngle').status).toBe('amber');
    expect(adviceFor('elbowAngle', 175)[0]).toMatch(/locked|straight/i);
  });
});
