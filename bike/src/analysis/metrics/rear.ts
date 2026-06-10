import type { FrameData } from '@runalyzr/shared/types';
import { LANDMARKS } from '../../config/defaults';
import type { PedalEvent, RearMetrics } from '../types';
import { makeMetricResult } from '../thresholds';

const L = LANDMARKS;

export function calculateRearMetrics(
  frames: FrameData[],
  events: PedalEvent[],
): RearMetrics {
  // Hip rock — lateral hip displacement peak-to-peak. Whole-body motion can't
  // be measured in world coords (origin travels with the hips), so this stays
  // in normalized image coords and is reported as % of frame width.
  const hipRock = (() => {
    const hipXs = frames.map((f) => {
      const lh = f.landmarks[L.LEFT_HIP];
      const rh = f.landmarks[L.RIGHT_HIP];
      if (!lh || !rh) return null;
      return (lh.x + rh.x) / 2;
    }).filter((x): x is number => x !== null);
    if (hipXs.length < 2) return null;
    let lo = hipXs[0], hi = hipXs[0];
    for (const x of hipXs) { if (x < lo) lo = x; if (x > hi) hi = x; }
    return (hi - lo) * 100;
  })();

  // Pelvic obliquity — average tilt of the hip line away from horizontal
  const pelvicObliquity = (() => {
    const tilts = frames.map((f) => {
      const lh = f.worldLandmarks[L.LEFT_HIP];
      const rh = f.worldLandmarks[L.RIGHT_HIP];
      if (!lh || !rh) return null;
      return (Math.atan2(Math.abs(lh.y - rh.y), Math.abs(lh.x - rh.x)) * 180) / Math.PI;
    }).filter((v): v is number => v !== null);
    return tilts.length > 0 ? tilts.reduce((a, b) => a + b, 0) / tilts.length : null;
  })();

  // Knee varus/valgus — at BDC, frontal-plane (x–y) angle between the
  // hip→knee and hip→ankle directions. 0° = knee tracks the hip–ankle line;
  // flexion lives in the depth axis so it doesn't pollute this.
  const kneeVarusValgus = (() => {
    const bdcEvents = events.filter((e) => e.phase === 'bdc');
    if (bdcEvents.length === 0) return null;
    const deviations = bdcEvents.map((e) => {
      const f = frames[e.frameIndex];
      if (!f) return null;
      const side = e.side;
      const hipIdx   = side === 'left' ? L.LEFT_HIP   : L.RIGHT_HIP;
      const kneeIdx  = side === 'left' ? L.LEFT_KNEE  : L.RIGHT_KNEE;
      const ankleIdx = side === 'left' ? L.LEFT_ANKLE : L.RIGHT_ANKLE;
      const hip   = f.worldLandmarks[hipIdx];
      const knee  = f.worldLandmarks[kneeIdx];
      const ankle = f.worldLandmarks[ankleIdx];
      if (!hip || !knee || !ankle) return null;
      const a1 = Math.atan2(knee.x - hip.x, knee.y - hip.y);
      const a2 = Math.atan2(ankle.x - hip.x, ankle.y - hip.y);
      let d = (Math.abs(a1 - a2) * 180) / Math.PI;
      if (d > 180) d = 360 - d;
      return d;
    }).filter((v): v is number => v !== null);
    return deviations.length > 0 ? deviations.reduce((a, b) => a + b, 0) / deviations.length : null;
  })();

  // Foot rotation at BDC — toe-in/toe-out angle of the heel→toe axis against
  // the depth (z) axis in the horizontal plane. This is what cleat rotation
  // actually changes; the old heel-vs-ankle lateral offset barely measured it.
  const heelAlignment = (() => {
    const bdcEvents = events.filter((e) => e.phase === 'bdc');
    if (bdcEvents.length === 0) return null;
    const devs = bdcEvents.map((e) => {
      const f = frames[e.frameIndex];
      if (!f) return null;
      const side    = e.side;
      const heelIdx = side === 'left' ? L.LEFT_HEEL       : L.RIGHT_HEEL;
      const toeIdx  = side === 'left' ? L.LEFT_FOOT_INDEX : L.RIGHT_FOOT_INDEX;
      const heel    = f.worldLandmarks[heelIdx];
      const toe     = f.worldLandmarks[toeIdx];
      if (!heel || !toe) return null;
      return (Math.atan2(Math.abs(toe.x - heel.x), Math.abs(toe.z - heel.z)) * 180) / Math.PI;
    }).filter((v): v is number => v !== null);
    return devs.length > 0 ? devs.reduce((a, b) => a + b, 0) / devs.length : null;
  })();

  const toResult = (v: number | null, key: keyof RearMetrics) =>
    v !== null ? makeMetricResult(v, key) : null;

  return {
    hipRock:          toResult(hipRock,          'hipRock'),
    pelvicObliquity:  toResult(pelvicObliquity,  'pelvicObliquity'),
    kneeVarusValgus:  toResult(kneeVarusValgus,  'kneeVarusValgus'),
    heelAlignment:    toResult(heelAlignment,    'heelAlignment'),
  };
}
