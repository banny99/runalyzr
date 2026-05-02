import type { LandmarkArray } from '@runalyzr/shared/types';
import { angleBetweenThreePoints, lateralAngle, midpoint } from '@runalyzr/shared/math';
import { LANDMARKS } from '../config/defaults';
import type { FitMeasurement } from './types';

const L = LANDMARKS;

function angle(lm: LandmarkArray, a: number, b: number, c: number): number {
  return angleBetweenThreePoints(lm[a], lm[b], lm[c]);
}

export function measureSide6OClock(lm: LandmarkArray): FitMeasurement[] {
  return [
    {
      label: 'Knee Extension at BDC',
      value: parseFloat(angle(lm, L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE).toFixed(1)),
      unit: '°',
      normalRange: '145–155°',
    },
    {
      label: 'Knee Extension at BDC (R)',
      value: parseFloat(angle(lm, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE).toFixed(1)),
      unit: '°',
      normalRange: '145–155°',
    },
  ];
}

export function measureSide3OClock(lm: LandmarkArray): FitMeasurement[] {
  const ls = lm[L.LEFT_SHOULDER];
  const lh = lm[L.LEFT_HIP];
  const lk = lm[L.LEFT_KNEE];
  const la = lm[L.LEFT_ANKLE];
  if (!ls || !lh || !lk || !la) return [];

  // KOPS: knee over pedal — horizontal distance of knee vs ankle at 3 o'clock
  const kopsOffset = parseFloat(((lk.x - la.x) * 100).toFixed(1));
  const hipAngleVal = parseFloat(angle(lm, L.LEFT_SHOULDER, L.LEFT_HIP, L.LEFT_KNEE).toFixed(1));

  return [
    { label: 'Knee Over Pedal (KOPS) offset', value: kopsOffset, unit: ' mm', normalRange: '0–10 mm ahead' },
    { label: 'Hip Angle at 3 o\'clock',       value: hipAngleVal,  unit: '°',    normalRange: '45–65°' },
  ];
}

export function measureSide9OClock(lm: LandmarkArray): FitMeasurement[] {
  const hipExt = parseFloat(angle(lm, L.LEFT_KNEE, L.LEFT_HIP, L.LEFT_SHOULDER).toFixed(1));
  const backAngle = (() => {
    const ls = lm[L.LEFT_SHOULDER];
    const lh = lm[L.LEFT_HIP];
    if (!ls || !lh) return 0;
    const dx = ls.x - lh.x;
    const dy = Math.abs(ls.y - lh.y);
    return parseFloat((Math.abs((Math.atan2(Math.abs(dx), dy) * 180) / Math.PI)).toFixed(1));
  })();
  return [
    { label: 'Hip Extension at 9 o\'clock', value: hipExt,    unit: '°', normalRange: '160–180°' },
    { label: 'Back Angle',                  value: backAngle, unit: '°', normalRange: '35–50°' },
  ];
}

export function measureSideNeutral(lm: LandmarkArray): FitMeasurement[] {
  const ls = lm[L.LEFT_SHOULDER];
  const lh = lm[L.LEFT_HIP];
  const le = lm[L.LEFT_ELBOW];
  const lw = lm[L.LEFT_WRIST];
  if (!ls || !lh || !le || !lw) return [];

  const torsoAngle = parseFloat((Math.abs((Math.atan2(Math.abs(ls.x - lh.x), Math.abs(ls.y - lh.y)) * 180) / Math.PI)).toFixed(1));
  const elbowAngleVal = parseFloat(angle(lm, L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST).toFixed(1));

  return [
    { label: 'Torso Angle',  value: torsoAngle,    unit: '°', normalRange: '35–45°' },
    { label: 'Elbow Angle',  value: elbowAngleVal, unit: '°', normalRange: '90–160°' },
  ];
}

export function measureSideAero(lm: LandmarkArray): FitMeasurement[] {
  const le = lm[L.LEFT_ELBOW];
  const lw = lm[L.LEFT_WRIST];
  const ls = lm[L.LEFT_SHOULDER];
  if (!le || !lw || !ls) return [];

  const elbowAngleVal = parseFloat(angle(lm, L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST).toFixed(1));
  const reachAngle = parseFloat((Math.abs((Math.atan2(Math.abs(ls.x - lw.x), Math.abs(ls.y - lw.y)) * 180) / Math.PI)).toFixed(1));

  return [
    { label: 'Elbow Angle (aero)',  value: elbowAngleVal, unit: '°', normalRange: '80–110°' },
    { label: 'Reach Angle',         value: reachAngle,    unit: '°', normalRange: '15–35°' },
  ];
}

export function measureRear6OClock(lm: LandmarkArray): FitMeasurement[] {
  const lh = lm[L.LEFT_HIP];
  const rh = lm[L.RIGHT_HIP];
  const lk = lm[L.LEFT_KNEE];
  const rk = lm[L.RIGHT_KNEE];
  if (!lh || !rh || !lk || !rk) return [];

  const hipDiff   = parseFloat((Math.abs(lh.y - rh.y) * 100).toFixed(1));
  const kneeDiff  = parseFloat((Math.abs(lk.x - rk.x) * 100).toFixed(1));

  return [
    { label: 'Hip Height Asymmetry', value: hipDiff,  unit: ' mm', normalRange: '< 5 mm' },
    { label: 'Knee Lateral Spacing', value: kneeDiff, unit: ' mm', normalRange: 'Symmetric' },
  ];
}

export function measureRearNeutral(lm: LandmarkArray): FitMeasurement[] {
  const lh = lm[L.LEFT_HIP];
  const rh = lm[L.RIGHT_HIP];
  if (!lh || !rh) return [];
  const saddleTilt = parseFloat((Math.abs(lh.y - rh.y) * 100).toFixed(1));
  return [
    { label: 'Pelvic Symmetry (neutral)', value: saddleTilt, unit: ' mm', normalRange: '< 5 mm' },
  ];
}

export function measureFront6OClock(lm: LandmarkArray): FitMeasurement[] {
  const lk = lm[L.LEFT_KNEE];
  const rk = lm[L.RIGHT_KNEE];
  const ls = lm[L.LEFT_SHOULDER];
  const rs = lm[L.RIGHT_SHOULDER];
  if (!lk || !rk || !ls || !rs) return [];

  const kneeLateral = parseFloat((Math.abs((lk.x - 0.5) - (0.5 - rk.x)) * 100).toFixed(1));
  const shoulderDiff = parseFloat((Math.abs(ls.y - rs.y) * 100).toFixed(1));

  return [
    { label: 'Knee Lateral Symmetry', value: kneeLateral,  unit: ' mm', normalRange: '< 10 mm' },
    { label: 'Shoulder Level',        value: shoulderDiff, unit: ' mm', normalRange: '< 10 mm' },
  ];
}

export function measureFrontNeutral(lm: LandmarkArray): FitMeasurement[] {
  const ls = lm[L.LEFT_SHOULDER];
  const rs = lm[L.RIGHT_SHOULDER];
  const lh = lm[L.LEFT_HIP];
  const rh = lm[L.RIGHT_HIP];
  if (!ls || !rs || !lh || !rh) return [];

  const sMid = midpoint(ls, rs);
  const hMid = midpoint(lh, rh);
  const trunkLean = parseFloat(lateralAngle(sMid, hMid).toFixed(1));
  const shoulderDiff = parseFloat((Math.abs(ls.y - rs.y) * 100).toFixed(1));

  return [
    { label: 'Lateral Trunk Lean', value: trunkLean,    unit: '°',    normalRange: '< 2°' },
    { label: 'Shoulder Level',     value: shoulderDiff, unit: ' mm', normalRange: '< 10 mm' },
  ];
}

const POSITION_MEASURERS: Record<string, (lm: LandmarkArray) => FitMeasurement[]> = {
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

export function measureFitPosition(positionId: string, lm: LandmarkArray): FitMeasurement[] {
  const measurer = POSITION_MEASURERS[positionId];
  return measurer ? measurer(lm) : [];
}
