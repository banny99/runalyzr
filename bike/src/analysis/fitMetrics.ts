import type { Landmark, LandmarkArray } from '@runalyzr/shared/types';
import { angleBetweenThreePoints, lateralAngle, midpoint } from '@runalyzr/shared/math';
import { LANDMARKS } from '../config/defaults';
import type { FitMeasurement } from './types';

const L = LANDMARKS;

// All measurers receive MediaPipe *world* landmarks (metres, hip-centred
// origin). Every measurement is an angle: angles are framing-independent,
// need no calibration, and are robust to MediaPipe's absolute-scale error —
// unlike mm/cm readings, which sit below the model's noise floor.

function round1(v: number): number {
  return parseFloat(v.toFixed(1));
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
    {
      label: 'Knee Extension at BDC',
      value: round1(angle(wlm, L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE)),
      unit: '°',
      normalRange: '145–155°',
    },
    {
      label: 'Knee Extension at BDC (R)',
      value: round1(angle(wlm, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE)),
      unit: '°',
      normalRange: '145–155°',
    },
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
  const shankAngle = round1(lateralAngle(lk, la));
  const hipAngleVal = round1(angle(wlm, L.LEFT_SHOULDER, L.LEFT_HIP, L.LEFT_KNEE));

  return [
    { label: 'Shank Angle (KOPS)',        value: shankAngle,  unit: '°', normalRange: '0–2°' },
    { label: 'Hip Angle at 3 o\'clock',   value: hipAngleVal, unit: '°', normalRange: '45–65°' },
  ];
}

export function measureSide9OClock(wlm: LandmarkArray): FitMeasurement[] {
  if (!wlm[L.LEFT_KNEE] || !wlm[L.LEFT_HIP] || !wlm[L.LEFT_SHOULDER]) return [];
  const hipExt = round1(angle(wlm, L.LEFT_KNEE, L.LEFT_HIP, L.LEFT_SHOULDER));
  const backAngle = (() => {
    const ls = wlm[L.LEFT_SHOULDER];
    const lh = wlm[L.LEFT_HIP];
    if (!ls || !lh) return 0;
    const dx = ls.x - lh.x;
    const dy = Math.abs(ls.y - lh.y);
    return round1(Math.abs((Math.atan2(Math.abs(dx), dy) * 180) / Math.PI));
  })();
  return [
    { label: 'Hip Extension at 9 o\'clock', value: hipExt,    unit: '°', normalRange: '160–180°' },
    { label: 'Back Angle',                  value: backAngle, unit: '°', normalRange: '35–50°' },
  ];
}

export function measureSideNeutral(wlm: LandmarkArray): FitMeasurement[] {
  const ls = wlm[L.LEFT_SHOULDER];
  const lh = wlm[L.LEFT_HIP];
  const le = wlm[L.LEFT_ELBOW];
  const lw = wlm[L.LEFT_WRIST];
  if (!ls || !lh || !le || !lw) return [];

  const torsoAngle = round1(Math.abs((Math.atan2(Math.abs(ls.x - lh.x), Math.abs(ls.y - lh.y)) * 180) / Math.PI));
  const elbowAngleVal = round1(angle(wlm, L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST));

  return [
    { label: 'Torso Angle',  value: torsoAngle,    unit: '°', normalRange: '35–45°' },
    { label: 'Elbow Angle',  value: elbowAngleVal, unit: '°', normalRange: '90–160°' },
  ];
}

export function measureSideAero(wlm: LandmarkArray): FitMeasurement[] {
  const le = wlm[L.LEFT_ELBOW];
  const lw = wlm[L.LEFT_WRIST];
  const ls = wlm[L.LEFT_SHOULDER];
  if (!le || !lw || !ls) return [];

  const elbowAngleVal = round1(angle(wlm, L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST));
  const reachAngle = round1(Math.abs((Math.atan2(Math.abs(ls.x - lw.x), Math.abs(ls.y - lw.y)) * 180) / Math.PI));

  return [
    { label: 'Elbow Angle (aero)',  value: elbowAngleVal, unit: '°', normalRange: '80–110°' },
    { label: 'Reach Angle',         value: reachAngle,    unit: '°', normalRange: '15–35°' },
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
    { label: 'Pelvic Obliquity',            value: round1(tiltFromHorizontal(lh, rh)),        unit: '°', normalRange: '< 3°' },
    { label: 'Knee Frontal Alignment (L)',  value: round1(kneeFrontalDeviation(lh, lk, la)),  unit: '°', normalRange: '< 5°' },
    { label: 'Knee Frontal Alignment (R)',  value: round1(kneeFrontalDeviation(rh, rk, ra)),  unit: '°', normalRange: '< 5°' },
  ];
}

export function measureRearNeutral(wlm: LandmarkArray): FitMeasurement[] {
  const lh = wlm[L.LEFT_HIP];
  const rh = wlm[L.RIGHT_HIP];
  if (!lh || !rh) return [];
  return [
    { label: 'Pelvic Obliquity (neutral)', value: round1(tiltFromHorizontal(lh, rh)), unit: '°', normalRange: '< 3°' },
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
    { label: 'Knee Frontal Alignment (L)', value: round1(kneeFrontalDeviation(lh, lk, la)), unit: '°', normalRange: '< 5°' },
    { label: 'Knee Frontal Alignment (R)', value: round1(kneeFrontalDeviation(rh, rk, ra)), unit: '°', normalRange: '< 5°' },
    { label: 'Shoulder Tilt',              value: round1(tiltFromHorizontal(ls, rs)),       unit: '°', normalRange: '< 2°' },
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
    { label: 'Lateral Trunk Lean', value: round1(lateralAngle(sMid, hMid)),   unit: '°', normalRange: '< 2°' },
    { label: 'Shoulder Tilt',      value: round1(tiltFromHorizontal(ls, rs)), unit: '°', normalRange: '< 2°' },
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
