import type { FrameData } from '@runalyzr/shared/types';
import { angleBetweenThreePoints, midpoint, verticalDisplacement } from '@runalyzr/shared/math';
import { LANDMARKS } from '../../config/defaults';
import type { PedalEvent, PedalCycle, SagittalMetrics } from '../types';
import { makeMetricResult } from '../thresholds';
import { calculateCadence } from '../pedalDetection';

const L = LANDMARKS;

function kneeAngleAt(frames: FrameData[], events: PedalEvent[], phase: 'bdc' | 'tdc', side: 'left' | 'right'): number | null {
  const hipIdx   = side === 'left' ? L.LEFT_HIP   : L.RIGHT_HIP;
  const kneeIdx  = side === 'left' ? L.LEFT_KNEE  : L.RIGHT_KNEE;
  const ankleIdx = side === 'left' ? L.LEFT_ANKLE : L.RIGHT_ANKLE;
  const targets  = events.filter((e) => e.phase === phase && e.side === side);
  if (targets.length === 0) return null;
  const angles = targets
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) => angleBetweenThreePoints(f.worldLandmarks[hipIdx], f.worldLandmarks[kneeIdx], f.worldLandmarks[ankleIdx]));
  return angles.reduce((a, b) => a + b, 0) / angles.length;
}

function hipAngleAt(frames: FrameData[], events: PedalEvent[], phase: 'tdc', side: 'left' | 'right'): number | null {
  const shoulderIdx = side === 'left' ? L.LEFT_SHOULDER : L.RIGHT_SHOULDER;
  const hipIdx      = side === 'left' ? L.LEFT_HIP      : L.RIGHT_HIP;
  const kneeIdx     = side === 'left' ? L.LEFT_KNEE     : L.RIGHT_KNEE;
  const targets     = events.filter((e) => e.phase === phase && e.side === side);
  if (targets.length === 0) return null;
  const angles = targets
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) => angleBetweenThreePoints(f.worldLandmarks[shoulderIdx], f.worldLandmarks[hipIdx], f.worldLandmarks[kneeIdx]));
  return angles.reduce((a, b) => a + b, 0) / angles.length;
}

export function calculateSagittalMetrics(
  frames: FrameData[],
  _fps: number,
  events: PedalEvent[],
  _cycles: PedalCycle[],
): SagittalMetrics {
  const durationSec = frames.length > 0
    ? (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000
    : 0;

  // Knee extension at BDC — average left and right
  const leftBDC  = kneeAngleAt(frames, events, 'bdc', 'left');
  const rightBDC = kneeAngleAt(frames, events, 'bdc', 'right');
  const avgBDC   = leftBDC !== null && rightBDC !== null ? (leftBDC + rightBDC) / 2 : (leftBDC ?? rightBDC);

  // Knee flexion at TDC — average left and right
  const leftTDC  = kneeAngleAt(frames, events, 'tdc', 'left');
  const rightTDC = kneeAngleAt(frames, events, 'tdc', 'right');
  const avgTDC   = leftTDC !== null && rightTDC !== null ? (leftTDC + rightTDC) / 2 : (leftTDC ?? rightTDC);

  // Hip angle at TDC
  const leftHip  = hipAngleAt(frames, events, 'tdc', 'left');
  const rightHip = hipAngleAt(frames, events, 'tdc', 'right');
  const avgHip   = leftHip !== null && rightHip !== null ? (leftHip + rightHip) / 2 : (leftHip ?? rightHip);

  // Hip vertical oscillation (image landmarks — world y is always ~0 at hip centre)
  const hipOscillation = (() => {
    const hipMidYs = frames.map((f) => {
      const lh = f.landmarks[L.LEFT_HIP];
      const rh = f.landmarks[L.RIGHT_HIP];
      if (!lh || !rh) return null;
      return (lh.y + rh.y) / 2;
    }).filter((y): y is number => y !== null);
    if (hipMidYs.length < 2) return null;
    return (Math.max(...hipMidYs) - Math.min(...hipMidYs)) * 100;
  })();

  // Torso angle — shoulder mid to hip mid, relative to horizontal
  const torsoAngle = (() => {
    if (frames.length === 0) return null;
    const angles = frames.map((f) => {
      const ls = f.worldLandmarks[L.LEFT_SHOULDER];
      const rs = f.worldLandmarks[L.RIGHT_SHOULDER];
      const lh = f.worldLandmarks[L.LEFT_HIP];
      const rh = f.worldLandmarks[L.RIGHT_HIP];
      if (!ls || !rs || !lh || !rh) return null;
      const sMid = midpoint(ls, rs);
      const hMid = midpoint(lh, rh);
      const dx = sMid.x - hMid.x;
      const dy = sMid.y - hMid.y;
      return Math.abs((Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI);
    }).filter((v): v is number => v !== null);
    return angles.length > 0 ? angles.reduce((a, b) => a + b, 0) / angles.length : null;
  })();

  // Pelvic tilt — forward lean approximated as hip-shoulder anterior/posterior
  const pelvicTilt = (() => {
    if (frames.length === 0) return null;
    const tilts = frames.map((f) => {
      const lh = f.worldLandmarks[L.LEFT_HIP];
      const rh = f.worldLandmarks[L.RIGHT_HIP];
      const ls = f.worldLandmarks[L.LEFT_SHOULDER];
      const rs = f.worldLandmarks[L.RIGHT_SHOULDER];
      if (!lh || !rh || !ls || !rs) return null;
      const hMid = midpoint(lh, rh);
      const sMid = midpoint(ls, rs);
      // z-axis difference approximates A/P tilt in world coords
      return (sMid.z - hMid.z) * 100;
    }).filter((v): v is number => v !== null);
    if (tilts.length === 0) return null;
    return Math.abs(tilts.reduce((a, b) => a + b, 0) / tilts.length);
  })();

  // Elbow angle — average across all frames
  const elbowAngle = (() => {
    const angles = frames.map((f) => {
      const ls = f.worldLandmarks[L.LEFT_SHOULDER];
      const le = f.worldLandmarks[L.LEFT_ELBOW];
      const lw = f.worldLandmarks[L.LEFT_WRIST];
      const rs = f.worldLandmarks[L.RIGHT_SHOULDER];
      const re = f.worldLandmarks[L.RIGHT_ELBOW];
      const rw = f.worldLandmarks[L.RIGHT_WRIST];
      if (!ls || !le || !lw || !rs || !re || !rw) return null;
      return (angleBetweenThreePoints(ls, le, lw) + angleBetweenThreePoints(rs, re, rw)) / 2;
    }).filter((v): v is number => v !== null);
    return angles.length > 0 ? angles.reduce((a, b) => a + b, 0) / angles.length : null;
  })();

  // Wrist angle — elbow–wrist–midknuckle approximated as deviation from neutral
  const wristAngle = (() => {
    const angles = frames.map((f) => {
      const le = f.worldLandmarks[L.LEFT_ELBOW];
      const lw = f.worldLandmarks[L.LEFT_WRIST];
      const re = f.worldLandmarks[L.RIGHT_ELBOW];
      const rw = f.worldLandmarks[L.RIGHT_WRIST];
      if (!le || !lw || !re || !rw) return null;
      // Approximate: angle at wrist = deviation of wrist from elbow-hand line
      // Use elbow→wrist direction vs straight arm direction
      const lAngle = Math.abs(angleBetweenThreePoints(le, lw, { x: lw.x, y: lw.y - 0.1, z: lw.z, visibility: 1 }) - 90);
      const rAngle = Math.abs(angleBetweenThreePoints(re, rw, { x: rw.x, y: rw.y - 0.1, z: rw.z, visibility: 1 }) - 90);
      return (lAngle + rAngle) / 2;
    }).filter((v): v is number => v !== null);
    return angles.length > 0 ? angles.reduce((a, b) => a + b, 0) / angles.length : null;
  })();

  // Ankle ankling pattern — range of motion across stroke
  const ankleAnkling = (() => {
    const leftRange  = verticalDisplacement(L.LEFT_FOOT_INDEX, frames);
    const rightRange = verticalDisplacement(L.RIGHT_FOOT_INDEX, frames);
    const avg = (leftRange + rightRange) / 2;
    return avg > 0 ? avg : null;
  })();

  // Cadence
  const cadenceValue = calculateCadence(events, durationSec);

  const toResult = (v: number | null, key: keyof SagittalMetrics) =>
    v !== null ? makeMetricResult(v, key) : null;

  return {
    kneeExtensionBDC:       toResult(avgBDC,         'kneeExtensionBDC'),
    kneeFlexionTDC:         toResult(avgTDC,         'kneeFlexionTDC'),
    hipAngleTDC:            toResult(avgHip,         'hipAngleTDC'),
    hipVerticalOscillation: toResult(hipOscillation, 'hipVerticalOscillation'),
    torsoAngle:             toResult(torsoAngle,     'torsoAngle'),
    pelvicTilt:             toResult(pelvicTilt,     'pelvicTilt'),
    elbowAngle:             toResult(elbowAngle,     'elbowAngle'),
    wristAngle:             toResult(wristAngle,     'wristAngle'),
    ankleAnkling:           toResult(ankleAnkling,   'ankleAnkling'),
    cadence:                cadenceValue > 0 ? makeMetricResult(cadenceValue, 'cadence') : null,
  };
}
