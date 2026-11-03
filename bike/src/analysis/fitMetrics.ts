import type { Landmark, LandmarkArray } from '@runalyzr/shared/types';
import { angleBetweenThreePoints, lateralAngle, tiltFromHorizontal, midpoint } from '@runalyzr/shared/math';
import { LANDMARKS } from '../config/defaults';
import type { FitMeasurement } from './types';
import { evaluateThreshold, formatGreenRange } from '@runalyzr/shared/analysis';
import type { FitMetricId } from './fitThresholds';
import { fitThresholds } from './fitThresholds';

const L = LANDMARKS;

// All measurers receive MediaPipe *world* landmarks (metres, hip-centred
// origin). Every measurement is an angle: angles are framing-independent,
// need no calibration, and are robust to MediaPipe's absolute-scale error —
// unlike mm/cm readings, which sit below the model's noise floor.

function round1(v: number): number {
  return parseFloat(v.toFixed(1));
}

/** Build a measurement scored against the active band for its setting id. */
function entry(id: FitMetricId, label: string, value: number): FitMeasurement {
  const rounded = round1(value);
  const t = fitThresholds.entry(id);
  return {
    id, label, value: rounded, unit: '°',
    normalRange: formatGreenRange(t) ?? '—',
    status: evaluateThreshold(rounded, t),
  };
}

function angle(wlm: LandmarkArray, a: number, b: number, c: number): number {
  return angleBetweenThreePoints(wlm[a], wlm[b], wlm[c]);
}

type Side = 'left' | 'right';

const SIDE = {
  left:  { SHOULDER: L.LEFT_SHOULDER,  ELBOW: L.LEFT_ELBOW,  WRIST: L.LEFT_WRIST,
           HIP: L.LEFT_HIP,  KNEE: L.LEFT_KNEE,  ANKLE: L.LEFT_ANKLE },
  right: { SHOULDER: L.RIGHT_SHOULDER, ELBOW: L.RIGHT_ELBOW, WRIST: L.RIGHT_WRIST,
           HIP: L.RIGHT_HIP, KNEE: L.RIGHT_KNEE, ANKLE: L.RIGHT_ANKLE },
} as const;

/**
 * The side facing the camera in a side-view photo: the one MediaPipe sees
 * more clearly (far-side limbs are occluded and get low visibility). Ties —
 * including landmarks without visibility — go to the right side, which is
 * where the setup instructions place the camera.
 */
export function nearSide(wlm: LandmarkArray): Side {
  const score = (side: Side): number =>
    Object.values(SIDE[side]).reduce((sum, i) => sum + (wlm[i]?.visibility ?? 0), 0);
  return score('left') > score('right') ? 'left' : 'right';
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

/**
 * Upper-body angles captured on every side-view crank position (hands on
 * bars, so shoulder/elbow/wrist are visible regardless of pedal phase). Torso
 * and elbow reuse validated bands; Reach and the new Shoulder angle are
 * informational (no band → 'unknown' status) pending calibration on real data.
 * Returns [] when the arm/torso landmarks aren't available.
 */
export function sideUpperBody(wlm: LandmarkArray): FitMeasurement[] {
  const S = SIDE[nearSide(wlm)];
  const ls = wlm[S.SHOULDER];
  const lh = wlm[S.HIP];
  const le = wlm[S.ELBOW];
  const lw = wlm[S.WRIST];

  // Each angle is emitted independently so a missing hand (common at the
  // 9 o'clock back-pedal phase, where the forearm is often occluded) doesn't
  // drop torso lean, which needs only shoulder + hip. `lateralAngle` is the
  // lean of a segment from vertical (0° = straight down). Torso uses the band
  // shared with the ride-video torsoAngle ([35,50]); Reach and the new
  // Shoulder angle are informational (no band → 'unknown') pending calibration.
  const out: FitMeasurement[] = [];
  if (ls && lh)       out.push(entry('torsoAngle', 'Torso Angle', lateralAngle(ls, lh)));
  if (ls && le && lw) out.push(entry('elbowAngle', 'Elbow Angle', angleBetweenThreePoints(ls, le, lw)));
  if (ls && lw)       out.push(entry('reachAngle', 'Reach Angle', lateralAngle(ls, lw)));
  if (lh && ls && le) out.push(entry('shoulderAngle', 'Shoulder Angle', angleBetweenThreePoints(lh, ls, le)));
  return out;
}

export function measureSide6OClock(wlm: LandmarkArray): FitMeasurement[] {
  if (!wlm[L.LEFT_HIP] || !wlm[L.LEFT_KNEE] || !wlm[L.LEFT_ANKLE] ||
      !wlm[L.RIGHT_HIP] || !wlm[L.RIGHT_KNEE] || !wlm[L.RIGHT_ANKLE]) return [];
  // Only one crank is at 6 o'clock (the other leg is at the top of the
  // stroke), so measure the leg whose ankle is lowest — world y increases
  // downward.
  const S = wlm[L.LEFT_ANKLE].y > wlm[L.RIGHT_ANKLE].y ? SIDE.left : SIDE.right;
  return [
    entry('kneeExtensionBDC', 'Knee Extension at BDC', angle(wlm, S.HIP, S.KNEE, S.ANKLE)),
    ...sideUpperBody(wlm),
  ];
}

export function measureSide3OClock(wlm: LandmarkArray): FitMeasurement[] {
  const S = SIDE[nearSide(wlm)];
  const ls = wlm[S.SHOULDER];
  const lh = wlm[S.HIP];
  const lk = wlm[S.KNEE];
  const la = wlm[S.ANKLE];
  if (!ls || !lh || !lk || !la) return [];

  // KOPS expressed as an angle: how far the knee–ankle (shank) line leans
  // from vertical at 3 o'clock. ~10 mm of knee-over-pedal offset on a ~40 cm
  // shank ≈ 1.4°, so the classic 0–10 mm window is roughly 0–2°.
  return [
    entry('shankKops', 'Shank Angle (KOPS)', lateralAngle(lk, la)),
    entry('hipAngle3', 'Hip Angle at 3 o\'clock', angle(wlm, S.SHOULDER, S.HIP, S.KNEE)),
    ...sideUpperBody(wlm),
  ];
}

export function measureSide9OClock(wlm: LandmarkArray): FitMeasurement[] {
  const S = SIDE[nearSide(wlm)];
  if (!wlm[S.KNEE] || !wlm[S.HIP] || !wlm[S.SHOULDER]) return [];
  // Torso lean (formerly the standalone "Back Angle" here) now comes from
  // sideUpperBody, so it's reported uniformly across all side positions.
  return [
    entry('hipExtension9', 'Hip Extension at 9 o\'clock', angle(wlm, S.KNEE, S.HIP, S.SHOULDER)),
    ...sideUpperBody(wlm),
  ];
}

export function measureSideAero(wlm: LandmarkArray): FitMeasurement[] {
  const S = SIDE[nearSide(wlm)];
  const le = wlm[S.ELBOW];
  const lw = wlm[S.WRIST];
  const ls = wlm[S.SHOULDER];
  if (!le || !lw || !ls) return [];

  const reachAngle = Math.abs((Math.atan2(Math.abs(ls.x - lw.x), Math.abs(ls.y - lw.y)) * 180) / Math.PI);

  return [
    entry('elbowAngleAero', 'Elbow Angle (aero)', angle(wlm, S.SHOULDER, S.ELBOW, S.WRIST)),
    entry('reachAngleAero', 'Reach Angle', reachAngle),
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
    entry('pelvicObliquity', 'Pelvic Obliquity', tiltFromHorizontal(lh, rh)),
    entry('kneeFrontalAlignment', 'Knee Frontal Alignment (L)', kneeFrontalDeviation(lh, lk, la)),
    entry('kneeFrontalAlignment', 'Knee Frontal Alignment (R)', kneeFrontalDeviation(rh, rk, ra)),
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
    entry('kneeFrontalAlignment', 'Knee Frontal Alignment (L)', kneeFrontalDeviation(lh, lk, la)),
    entry('kneeFrontalAlignment', 'Knee Frontal Alignment (R)', kneeFrontalDeviation(rh, rk, ra)),
    entry('shoulderTilt', 'Shoulder Tilt', tiltFromHorizontal(ls, rs)),
    entry('lateralTrunkLean', 'Lateral Trunk Lean', lateralAngle(midpoint(ls, rs), midpoint(lh, rh))),
  ];
}

const POSITION_MEASURERS: Record<string, (wlm: LandmarkArray) => FitMeasurement[]> = {
  side_6oclock:  measureSide6OClock,
  side_3oclock:  measureSide3OClock,
  side_9oclock:  measureSide9OClock,
  side_aero:     measureSideAero,
  rear_6oclock:  measureRear6OClock,
  front_6oclock: measureFront6OClock,
};

export function measureFitPosition(positionId: string, worldLandmarks: LandmarkArray): FitMeasurement[] {
  const measurer = POSITION_MEASURERS[positionId];
  return measurer ? measurer(worldLandmarks) : [];
}
