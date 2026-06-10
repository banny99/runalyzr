import type { FrameData } from '@runalyzr/shared/types';
import { lateralAngle } from '@runalyzr/shared/math';
import { LANDMARKS } from '../../config/defaults';
import type { PedalEvent, FrontMetrics } from '../types';
import { makeMetricResult } from '../thresholds';

const L = LANDMARKS;

export function calculateFrontMetrics(
  frames: FrameData[],
  events: PedalEvent[],
): FrontMetrics {
  // Knee symmetry L/R — at BDC, each knee's lateral offset angle from the
  // vertical line through its hip; symmetric riders show matching angles.
  const kneeSymmetry = (() => {
    const offsetAngle = (frameIndex: number, side: 'left' | 'right'): number | null => {
      const f = frames[frameIndex];
      const knee = f?.worldLandmarks[side === 'left' ? L.LEFT_KNEE : L.RIGHT_KNEE];
      const hip  = f?.worldLandmarks[side === 'left' ? L.LEFT_HIP  : L.RIGHT_HIP];
      if (!knee || !hip) return null;
      return (Math.atan2(Math.abs(knee.x - hip.x), Math.abs(knee.y - hip.y)) * 180) / Math.PI;
    };
    const leftAngles = events.filter((e) => e.phase === 'bdc' && e.side === 'left')
      .map((e) => offsetAngle(e.frameIndex, 'left'))
      .filter((v): v is number => v !== null);
    const rightAngles = events.filter((e) => e.phase === 'bdc' && e.side === 'right')
      .map((e) => offsetAngle(e.frameIndex, 'right'))
      .filter((v): v is number => v !== null);
    if (leftAngles.length === 0 || rightAngles.length === 0) return null;
    const avgL = leftAngles.reduce((a, b)  => a + b, 0) / leftAngles.length;
    const avgR = rightAngles.reduce((a, b) => a + b, 0) / rightAngles.length;
    return Math.abs(avgL - avgR);
  })();

  // Elbow width symmetry — each elbow's outward angle from the vertical line
  // through its shoulder; symmetric arm positions show matching angles.
  const elbowWidthSymmetry = (() => {
    const diffs = frames.map((f) => {
      const le = f.worldLandmarks[L.LEFT_ELBOW];
      const re = f.worldLandmarks[L.RIGHT_ELBOW];
      const ls = f.worldLandmarks[L.LEFT_SHOULDER];
      const rs = f.worldLandmarks[L.RIGHT_SHOULDER];
      if (!le || !re || !ls || !rs) return null;
      const aL = (Math.atan2(Math.abs(le.x - ls.x), Math.abs(le.y - ls.y)) * 180) / Math.PI;
      const aR = (Math.atan2(Math.abs(re.x - rs.x), Math.abs(re.y - rs.y)) * 180) / Math.PI;
      return Math.abs(aL - aR);
    }).filter((v): v is number => v !== null);
    return diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
  })();

  // Shoulder level — tilt of the shoulder line away from horizontal
  const shoulderLevel = (() => {
    const tilts = frames.map((f) => {
      const ls = f.worldLandmarks[L.LEFT_SHOULDER];
      const rs = f.worldLandmarks[L.RIGHT_SHOULDER];
      if (!ls || !rs) return null;
      return (Math.atan2(Math.abs(ls.y - rs.y), Math.abs(ls.x - rs.x)) * 180) / Math.PI;
    }).filter((v): v is number => v !== null);
    return tilts.length > 0 ? tilts.reduce((a, b) => a + b, 0) / tilts.length : null;
  })();

  // Lateral trunk lean — angle of shoulder midpoint to hip midpoint from vertical
  const lateralTrunkLean = (() => {
    const leans = frames.map((f) => {
      const ls = f.worldLandmarks[L.LEFT_SHOULDER];
      const rs = f.worldLandmarks[L.RIGHT_SHOULDER];
      const lh = f.worldLandmarks[L.LEFT_HIP];
      const rh = f.worldLandmarks[L.RIGHT_HIP];
      if (!ls || !rs || !lh || !rh) return null;
      const sMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: (ls.z + rs.z) / 2 };
      const hMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: (lh.z + rh.z) / 2 };
      return lateralAngle(sMid, hMid);
    }).filter((v): v is number => v !== null);
    return leans.length > 0 ? leans.reduce((a, b) => a + b, 0) / leans.length : null;
  })();

  // Head/neck position — indicative only (no threshold), measures forward head posture
  const headNeckPosition = (() => {
    const positions = frames.map((f) => {
      const nose     = f.worldLandmarks[L.NOSE];
      const lShoulder = f.worldLandmarks[L.LEFT_SHOULDER];
      const rShoulder = f.worldLandmarks[L.RIGHT_SHOULDER];
      if (!nose || !lShoulder || !rShoulder) return null;
      const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;
      return Math.abs(nose.x - shoulderMidX) * 100;
    }).filter((v): v is number => v !== null);
    return positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
  })();

  const toResult = (v: number | null, key: keyof FrontMetrics) =>
    v !== null ? makeMetricResult(v, key) : null;

  return {
    kneeSymmetry:       toResult(kneeSymmetry,       'kneeSymmetry'),
    elbowWidthSymmetry: toResult(elbowWidthSymmetry, 'elbowWidthSymmetry'),
    shoulderLevel:      toResult(shoulderLevel,      'shoulderLevel'),
    lateralTrunkLean:   toResult(lateralTrunkLean,   'lateralTrunkLean'),
    headNeckPosition:   toResult(headNeckPosition,   'headNeckPosition'),
  };
}
