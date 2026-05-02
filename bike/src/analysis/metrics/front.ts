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
  // Knee symmetry L/R — at BDC, difference in lateral knee position
  const kneeSymmetry = (() => {
    const bdcLeft  = events.filter((e) => e.phase === 'bdc' && e.side === 'left');
    const bdcRight = events.filter((e) => e.phase === 'bdc' && e.side === 'right');
    if (bdcLeft.length === 0 || bdcRight.length === 0) return null;
    const leftX  = bdcLeft.map((e)  => frames[e.frameIndex]?.landmarks[L.LEFT_KNEE]?.x  ?? 0).filter(Boolean);
    const rightX = bdcRight.map((e) => frames[e.frameIndex]?.landmarks[L.RIGHT_KNEE]?.x ?? 0).filter(Boolean);
    const avgL = leftX.reduce((a, b)  => a + b, 0) / leftX.length;
    const avgR = rightX.reduce((a, b) => a + b, 0) / rightX.length;
    // Symmetric if left and right are equidistant from midline (0.5)
    const lDev = Math.abs(avgL - 0.5);
    const rDev = Math.abs(avgR - 0.5);
    return Math.abs(lDev - rDev) * 100;
  })();

  // Elbow width symmetry — left-right elbow distance from midline
  const elbowWidthSymmetry = (() => {
    const diffs = frames.map((f) => {
      const le = f.landmarks[L.LEFT_ELBOW];
      const re = f.landmarks[L.RIGHT_ELBOW];
      if (!le || !re) return null;
      const mid = (le.x + re.x) / 2;
      return Math.abs(Math.abs(le.x - mid) - Math.abs(re.x - mid)) * 100;
    }).filter((v): v is number => v !== null);
    return diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
  })();

  // Shoulder level — height asymmetry
  const shoulderLevel = (() => {
    const diffs = frames.map((f) => {
      const ls = f.worldLandmarks[L.LEFT_SHOULDER];
      const rs = f.worldLandmarks[L.RIGHT_SHOULDER];
      if (!ls || !rs) return null;
      return Math.abs(ls.y - rs.y) * 100;
    }).filter((v): v is number => v !== null);
    return diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
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
