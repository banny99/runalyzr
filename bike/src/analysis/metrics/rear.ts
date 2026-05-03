import type { FrameData } from '@runalyzr/shared/types';
import { LANDMARKS } from '../../config/defaults';
import type { PedalEvent, RearMetrics } from '../types';
import { makeMetricResult } from '../thresholds';

const L = LANDMARKS;

export function calculateRearMetrics(
  frames: FrameData[],
  events: PedalEvent[],
): RearMetrics {
  // Hip rock — lateral hip displacement peak-to-peak
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

  // Pelvic obliquity — average absolute left-right hip height asymmetry
  const pelvicObliquity = (() => {
    const diffs = frames.map((f) => {
      const lh = f.worldLandmarks[L.LEFT_HIP];
      const rh = f.worldLandmarks[L.RIGHT_HIP];
      if (!lh || !rh) return null;
      return Math.abs(lh.y - rh.y) * 100;
    }).filter((v): v is number => v !== null);
    return diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
  })();

  // Knee varus/valgus — at BDC, measure knee lateral deviation relative to hip-foot line
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
      const hip   = f.landmarks[hipIdx];
      const knee  = f.landmarks[kneeIdx];
      const ankle = f.landmarks[ankleIdx];
      if (!hip || !knee || !ankle) return null;
      // Lateral deviation: knee x vs expected line from hip to ankle
      const expectedKneeX = hip.x + (ankle.x - hip.x) * ((knee.y - hip.y) / (ankle.y - hip.y));
      return Math.abs(knee.x - expectedKneeX) * 100;
    }).filter((v): v is number => v !== null);
    return deviations.length > 0 ? deviations.reduce((a, b) => a + b, 0) / deviations.length : null;
  })();

  // Heel alignment at BDC — how much the heel deviates laterally from ankle
  const heelAlignment = (() => {
    const bdcEvents = events.filter((e) => e.phase === 'bdc');
    if (bdcEvents.length === 0) return null;
    const devs = bdcEvents.map((e) => {
      const f = frames[e.frameIndex];
      if (!f) return null;
      const side     = e.side;
      const ankleIdx = side === 'left' ? L.LEFT_ANKLE : L.RIGHT_ANKLE;
      const heelIdx  = side === 'left' ? L.LEFT_HEEL  : L.RIGHT_HEEL;
      const ankle    = f.landmarks[ankleIdx];
      const heel     = f.landmarks[heelIdx];
      if (!ankle || !heel) return null;
      return Math.abs(heel.x - ankle.x) * 100;
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
