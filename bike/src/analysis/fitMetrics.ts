import type { Landmark, LandmarkArray } from '@runalyzr/shared/types';
import { angleBetweenThreePoints, lateralAngle, midpoint } from '@runalyzr/shared/math';
import { LANDMARKS } from '../config/defaults';
import type { FitMeasurement } from './types';
import type { Band } from './bands';
import { bandStatus } from './bands';

const L = LANDMARKS;

// All measurers receive MediaPipe *world* landmarks (metres, hip-centred
// origin). Every measurement is an angle: angles are framing-independent,
// need no calibration, and are robust to MediaPipe's absolute-scale error —
// unlike mm/cm readings, which sit below the model's noise floor.

function round1(v: number): number {
  return parseFloat(v.toFixed(1));
}

/** Build a measurement with its status evaluated against the default band. */
function entry(label: string, value: number, normalRange: string, band?: Band): FitMeasurement {
  const rounded = round1(value);
  return { label, value: rounded, unit: '°', normalRange, status: bandStatus(rounded, band) };
}

function angle(wlm: LandmarkArray, a: number, b: number, c: number): number {
  return angleBetweenThreePoints(wlm[a], wlm[b], wlm[c]);
}

/** Tilt of the line a–b away from horizontal, in degrees (0° = level). */
function tiltFromHorizontal(a: Landmark, b: Landmark): number {
  return (Math.atan2(Math.abs(a.y - b.y), Math.abs(a.x - b.x)) * 180) / Math.PI;
}

/**
 * Frontal-plane (x–y) deviation of the knee from the hip–ankle line, in
 * degrees (0° = neutral). Knee flexion lives in the depth axis, so this
 * isolates varus/valgus at any pedal phase.
 */
function kneeFrontalDeviation(hip: Landmark, knee: Landmark, ankle: Landmark): number {
  const a1 = Math.atan2(knee.x - hip.x, knee.y - hip.y);
  const a2 = Math.atan2(ankle.x - hip.x, ankle.y - hip.y);
  let d = (Math.abs(a1 - a2) * 180) / Math.PI;
  if (d > 180) d = 360 - d;
  return d;
}

export function measureSide6OClock(wlm: LandmarkArray): FitMeasurement[] {
  if (!wlm[L.LEFT_HIP] || !wlm[L.LEFT_KNEE] || !wlm[L.LEFT_ANKLE] ||
      !wlm[L.RIGHT_HIP] || !wlm[L.RIGHT_KNEE] || !wlm[L.RIGHT_ANKLE]) return [];
  return [
    entry('Knee Extension at BDC',     angle(wlm, L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE),    '145–155°', [145, 155]),
    entry('Knee Extension at BDC (R)', angle(wlm, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE), '145–155°', [145, 155]),
  ];
}

export function measureSide3OClock(wlm: LandmarkArray): FitMeasurement[] {
  const ls = wlm[L.LEFT_SHOULDER];
  const lh = wlm[L.LEFT_HIP];
  const lk = wlm[L.LEFT_KNEE];
  const la = wlm[L.LEFT_ANKLE];
  if (!ls || !lh || !lk || !la) return [];

  // KOPS expressed as an angle: how far the knee–ankle (shank) line leans
  // from vertical at 3 o'clock. ~10 mm of knee-over-pedal offset on a ~40 cm
  // shank ≈ 1.4°, so the classic 0–10 mm window is roughly 0–2°.
  return [
    entry('Shank Angle (KOPS)',      lateralAngle(lk, la),                                 '0–2°',   [0, 2]),
    entry('Hip Angle at 3 o\'clock', angle(wlm, L.LEFT_SHOULDER, L.LEFT_HIP, L.LEFT_KNEE), '45–65°', [45, 65]),
  ];
}

export function measureSide9OClock(wlm: LandmarkArray): FitMeasurement[] {
  if (!wlm[L.LEFT_KNEE] || !wlm[L.LEFT_HIP] || !wlm[L.LEFT_SHOULDER]) return [];
  const backAngle = (() => {
    const ls = wlm[L.LEFT_SHOULDER];
    const lh = wlm[L.LEFT_HIP];
    if (!ls || !lh) return 0;
    const dx = ls.x - lh.x;
    const dy = Math.abs(ls.y - lh.y);
    return Math.abs((Math.atan2(Math.abs(dx), dy) * 180) / Math.PI);
  })();
  return [
    entry('Hip Extension at 9 o\'clock', angle(wlm, L.LEFT_KNEE, L.LEFT_HIP, L.LEFT_SHOULDER), '160–180°', [160, 180]),
    entry('Back Angle',                  backAngle,                                            '35–50°',   [35, 50]),
  ];
}

export function measureSideNeutral(wlm: LandmarkArray): FitMeasurement[] {
  const ls = wlm[L.LEFT_SHOULDER];
  const lh = wlm[L.LEFT_HIP];
  const le = wlm[L.LEFT_ELBOW];
  const lw = wlm[L.LEFT_WRIST];
  if (!ls || !lh || !le || !lw) return [];

  const torsoAngle = Math.abs((Math.atan2(Math.abs(ls.x - lh.x), Math.abs(ls.y - lh.y)) * 180) / Math.PI);

  return [
    entry('Torso Angle', torsoAngle,                                              '35–45°',  [35, 45]),
    entry('Elbow Angle', angle(wlm, L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST), '90–160°', [90, 160]),
  ];
}

export function measureSideAero(wlm: LandmarkArray): FitMeasurement[] {
  const le = wlm[L.LEFT_ELBOW];
  const lw = wlm[L.LEFT_WRIST];
  const ls = wlm[L.LEFT_SHOULDER];
  if (!le || !lw || !ls) return [];

  const reachAngle = Math.abs((Math.atan2(Math.abs(ls.x - lw.x), Math.abs(ls.y - lw.y)) * 180) / Math.PI);

  return [
    entry('Elbow Angle (aero)', angle(wlm, L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST), '80–110°', [80, 110]),
    entry('Reach Angle',        reachAngle,                                              '15–35°',  [15, 35]),
  ];
}

export function measureRear6OClock(wlm: LandmarkArray): FitMeasurement[] {
  const lh = wlm[L.LEFT_HIP];
  const rh = wlm[L.RIGHT_HIP];
  const lk = wlm[L.LEFT_KNEE];
  const rk = wlm[L.RIGHT_KNEE];
  const la = wlm[L.LEFT_ANKLE];
  const ra = wlm[L.RIGHT_ANKLE];
  if (!lh || !rh || !lk || !rk || !la || !ra) return [];

  return [
    entry('Pelvic Obliquity',           tiltFromHorizontal(lh, rh),       '< 3°', [0, 3]),
    entry('Knee Frontal Alignment (L)', kneeFrontalDeviation(lh, lk, la), '< 5°', [0, 5]),
    entry('Knee Frontal Alignment (R)', kneeFrontalDeviation(rh, rk, ra), '< 5°', [0, 5]),
  ];
}

export function measureRearNeutral(wlm: LandmarkArray): FitMeasurement[] {
  const lh = wlm[L.LEFT_HIP];
  const rh = wlm[L.RIGHT_HIP];
  if (!lh || !rh) return [];
  return [
    entry('Pelvic Obliquity (neutral)', tiltFromHorizontal(lh, rh), '< 3°', [0, 3]),
  ];
}

export function measureFront6OClock(wlm: LandmarkArray): FitMeasurement[] {
  const lh = wlm[L.LEFT_HIP];
  const rh = wlm[L.RIGHT_HIP];
  const lk = wlm[L.LEFT_KNEE];
  const rk = wlm[L.RIGHT_KNEE];
  const la = wlm[L.LEFT_ANKLE];
  const ra = wlm[L.RIGHT_ANKLE];
  const ls = wlm[L.LEFT_SHOULDER];
  const rs = wlm[L.RIGHT_SHOULDER];
  if (!lh || !rh || !lk || !rk || !la || !ra || !ls || !rs) return [];

  return [
    entry('Knee Frontal Alignment (L)', kneeFrontalDeviation(lh, lk, la), '< 5°', [0, 5]),
    entry('Knee Frontal Alignment (R)', kneeFrontalDeviation(rh, rk, ra), '< 5°', [0, 5]),
    entry('Shoulder Tilt',              tiltFromHorizontal(ls, rs),       '< 2°', [0, 2]),
  ];
}

export function measureFrontNeutral(wlm: LandmarkArray): FitMeasurement[] {
  const ls = wlm[L.LEFT_SHOULDER];
  const rs = wlm[L.RIGHT_SHOULDER];
  const lh = wlm[L.LEFT_HIP];
  const rh = wlm[L.RIGHT_HIP];
  if (!ls || !rs || !lh || !rh) return [];

  const sMid = midpoint(ls, rs);
  const hMid = midpoint(lh, rh);

  return [
    entry('Lateral Trunk Lean', lateralAngle(sMid, hMid),   '< 2°', [0, 2]),
    entry('Shoulder Tilt',      tiltFromHorizontal(ls, rs), '< 2°', [0, 2]),
  ];
}

const POSITION_MEASURERS: Record<string, (wlm: LandmarkArray) => FitMeasurement[]> = {
  side_6oclock:  measureSide6OClock,
  side_3oclock:  measureSide3OClock,
  side_9oclock:  measureSide9OClock,
  side_neutral:  measureSideNeutral,
  side_aero:     measureSideAero,
  rear_6oclock:  measureRear6OClock,
  rear_neutral:  measureRearNeutral,
  front_6oclock: measureFront6OClock,
  front_neutral: measureFrontNeutral,
};

export function measureFitPosition(positionId: string, worldLandmarks: LandmarkArray): FitMeasurement[] {
  const measurer = POSITION_MEASURERS[positionId];
  return measurer ? measurer(worldLandmarks) : [];
}
