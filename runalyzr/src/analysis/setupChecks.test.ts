import { describe, it, expect } from 'vitest';
import { evaluateSetupChecks, evaluateVideoQuality } from './setupChecks';
import { LANDMARKS } from '../config/defaults';
import type { FrameData, Landmark, LandmarkArray } from './types';

const L = LANDMARKS;

function lm(x: number, y: number, visibility = 1): Landmark {
  return { x, y, z: 0, visibility };
}

/** A well-framed sagittal runner: joints stacked in x, hip at mid-height,
 *  shoulder→ankle spanning ~60 % of the frame. */
function goodSagittal(overrides: Partial<Record<number, Landmark>> = {}): LandmarkArray {
  const base = Array(33).fill(null).map(() => lm(0.5, 0.5));
  base[L.LEFT_SHOULDER]  = lm(0.50, 0.20);
  base[L.RIGHT_SHOULDER] = lm(0.52, 0.20);
  base[L.LEFT_HIP]       = lm(0.50, 0.50);
  base[L.RIGHT_HIP]      = lm(0.52, 0.50);
  base[L.LEFT_KNEE]      = lm(0.50, 0.65);
  base[L.RIGHT_KNEE]     = lm(0.52, 0.65);
  base[L.LEFT_ANKLE]     = lm(0.50, 0.80);
  base[L.RIGHT_ANKLE]    = lm(0.52, 0.80);
  Object.entries(overrides).forEach(([i, l]) => { base[Number(i)] = l!; });
  return base;
}

describe('evaluateSetupChecks', () => {
  it('passes all checks for a well-framed, stable sagittal setup', () => {
    const checks = evaluateSetupChecks(goodSagittal(), 20, 'sagittal');
    expect(checks.allPassed).toBe(true);
    expect(checks.hint).toContain('All set');
  });

  it('requires a selected view before anything can pass', () => {
    const checks = evaluateSetupChecks(goodSagittal(), 20, null);
    expect(checks.viewSelected).toBe(false);
    expect(checks.allPassed).toBe(false);
    expect(checks.hint).toContain('choose Side or Front');
  });

  it('is unstable until 15 consecutive detected frames', () => {
    const checks = evaluateSetupChecks(goodSagittal(), 5, 'sagittal');
    expect(checks.stable).toBe(false);
    expect(checks.hint).toContain('Hold still');
  });

  it('fails orientation when a frontal-facing body is used for a sagittal view', () => {
    // wide shoulder/hip spread = facing the camera
    const wlm = goodSagittal({
      [L.LEFT_SHOULDER]:  lm(0.30, 0.20),
      [L.RIGHT_SHOULDER]: lm(0.70, 0.20),
      [L.LEFT_HIP]:       lm(0.35, 0.50),
      [L.RIGHT_HIP]:      lm(0.65, 0.50),
    });
    const checks = evaluateSetupChecks(wlm, 20, 'sagittal');
    expect(checks.orientation).toBe(false);
    expect(checks.hint).toContain('Turn sideways');
  });

  it('asks the user to move closer when the body span is too small', () => {
    const wlm = goodSagittal({
      [L.LEFT_SHOULDER]:  lm(0.50, 0.40),
      [L.RIGHT_SHOULDER]: lm(0.52, 0.40),
      [L.LEFT_HIP]:       lm(0.50, 0.50),
      [L.RIGHT_HIP]:      lm(0.52, 0.50),
      [L.LEFT_KNEE]:      lm(0.50, 0.55),
      [L.RIGHT_KNEE]:     lm(0.52, 0.55),
      [L.LEFT_ANKLE]:     lm(0.50, 0.62),
      [L.RIGHT_ANKLE]:    lm(0.52, 0.62),
    });
    const checks = evaluateSetupChecks(wlm, 20, 'sagittal');
    expect(checks.goodDistance).toBe(false);
    expect(checks.hint).toContain('Move closer');
  });

  it('fails lighting when landmark visibility is poor', () => {
    const wlm = goodSagittal();
    [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP,
     L.LEFT_KNEE, L.RIGHT_KNEE, L.LEFT_ANKLE, L.RIGHT_ANKLE].forEach((i) => {
      wlm[i] = lm(wlm[i].x, wlm[i].y, 0.2);
    });
    const checks = evaluateSetupChecks(wlm, 20, 'sagittal');
    expect(checks.goodLighting).toBe(false);
  });
});

describe('evaluateVideoQuality', () => {
  const frame = (lms: LandmarkArray, i: number): FrameData =>
    ({ timestamp: i * 33, landmarks: lms, worldLandmarks: lms });

  it('returns no warnings for a consistently good video', () => {
    const frames = Array(50).fill(null).map((_, i) => frame(goodSagittal(), i));
    expect(evaluateVideoQuality(frames, 'sagittal')).toHaveLength(0);
  });

  it('warns when more than 30 % of sampled frames have the subject out of frame', () => {
    // evaluateVideoQuality samples every 10th frame (0,10,20,30,40); making
    // frames bad at i % 20 === 0 puts 3 of the 5 samples (60 %) over the
    // 30 % threshold without being all-bad.
    const outOfFrame = goodSagittal({ [L.LEFT_ANKLE]: lm(0.5, 0.999), [L.RIGHT_ANKLE]: lm(0.52, 0.999) });
    const frames = Array(50).fill(null).map((_, i) => frame(i % 20 === 0 ? outOfFrame : goodSagittal(), i));
    const warnings = evaluateVideoQuality(frames, 'sagittal');
    expect(warnings.some((w) => w.includes('not fully in frame'))).toBe(true);
  });

  it('stays quiet when only a small fraction of sampled frames are bad', () => {
    // Only sample index 0 is bad → 1 of 5 (20 %) is under the 30 % threshold.
    const outOfFrame = goodSagittal({ [L.LEFT_ANKLE]: lm(0.5, 0.999), [L.RIGHT_ANKLE]: lm(0.52, 0.999) });
    const frames = Array(50).fill(null).map((_, i) => frame(i === 0 ? outOfFrame : goodSagittal(), i));
    expect(evaluateVideoQuality(frames, 'sagittal')).toHaveLength(0);
  });

  it('returns empty for an empty video', () => {
    expect(evaluateVideoQuality([], 'sagittal')).toHaveLength(0);
  });
});
