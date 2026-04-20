import type {
  FrameData, GaitEvent, GaitCycle, AnalysisResults,
  MetricResult, CameraView, Foot,
} from './types';
import { LANDMARKS } from '../config/defaults';
import { angleBetweenThreePoints, lateralAngle, midpoint } from './angles';
import { makeMetricResult } from './thresholds';

export function calculateKneeFlexionAtContact(
  frames: FrameData[],
  events: GaitEvent[],
  side: Foot,
): number | null {
  const L = LANDMARKS;
  const hipIdx = side === 'left' ? L.LEFT_HIP : L.RIGHT_HIP;
  const kneeIdx = side === 'left' ? L.LEFT_KNEE : L.RIGHT_KNEE;
  const ankleIdx = side === 'left' ? L.LEFT_ANKLE : L.RIGHT_ANKLE;

  const footstrikes = events.filter((e) => e.type === 'footstrike' && e.foot === side);
  if (footstrikes.length === 0) return null;

  const angles = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) =>
      angleBetweenThreePoints(f.worldLandmarks[hipIdx], f.worldLandmarks[kneeIdx], f.worldLandmarks[ankleIdx])
    );
  return angles.reduce((a, b) => a + b, 0) / angles.length;
}

export function calculateAnkleDorsiflexion(
  frames: FrameData[],
  events: GaitEvent[],
  side: Foot,
): number | null {
  const L = LANDMARKS;
  const kneeIdx = side === 'left' ? L.LEFT_KNEE : L.RIGHT_KNEE;
  const ankleIdx = side === 'left' ? L.LEFT_ANKLE : L.RIGHT_ANKLE;
  const footIdx = side === 'left' ? L.LEFT_FOOT_INDEX : L.RIGHT_FOOT_INDEX;

  const footstrikes = events.filter((e) => e.type === 'footstrike' && e.foot === side);
  if (footstrikes.length === 0) return null;

  const angles = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) =>
      angleBetweenThreePoints(f.worldLandmarks[kneeIdx], f.worldLandmarks[ankleIdx], f.worldLandmarks[footIdx])
    );
  const avg = angles.reduce((a, b) => a + b, 0) / angles.length;
  return 180 - avg; // supplementary angle = dorsiflexion degrees
}

export function calculateTrunkLateralLean(
  frames: FrameData[],
  events: GaitEvent[],
): number | null {
  const L = LANDMARKS;
  const footstrikes = events.filter((e) => e.type === 'footstrike');
  if (footstrikes.length === 0) return null;

  const leans = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) => {
      const shoulderMid = midpoint(f.worldLandmarks[L.LEFT_SHOULDER], f.worldLandmarks[L.RIGHT_SHOULDER]);
      const hipMid = midpoint(f.worldLandmarks[L.LEFT_HIP], f.worldLandmarks[L.RIGHT_HIP]);
      return lateralAngle(shoulderMid, hipMid);
    });
  return leans.reduce((a, b) => a + b, 0) / leans.length;
}

export function calculatePelvicDrop(
  frames: FrameData[],
  events: GaitEvent[],
): number | null {
  const footstrikes = events.filter((e) => e.type === 'footstrike');
  if (footstrikes.length < 2) return null;

  const drops = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) => {
      const lh = f.worldLandmarks[LANDMARKS.LEFT_HIP];
      const rh = f.worldLandmarks[LANDMARKS.RIGHT_HIP];
      return Math.abs(lh.y - rh.y) * 100;
    });
  return drops.reduce((a, b) => a + b, 0) / drops.length;
}

export function calculateHipAdduction(
  frames: FrameData[],
  events: GaitEvent[],
  side: Foot,
): number | null {
  const L = LANDMARKS;
  const stanceHipIdx = side === 'left' ? L.LEFT_HIP : L.RIGHT_HIP;
  const kneeIdx = side === 'left' ? L.LEFT_KNEE : L.RIGHT_KNEE;
  const otherHipIdx = side === 'left' ? L.RIGHT_HIP : L.LEFT_HIP;

  const footstrikes = events.filter((e) => e.type === 'footstrike' && e.foot === side);
  if (footstrikes.length === 0) return null;

  const angles = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) =>
      angleBetweenThreePoints(
        f.worldLandmarks[otherHipIdx],
        f.worldLandmarks[stanceHipIdx],
        f.worldLandmarks[kneeIdx],
      )
    )
    .map((a) => Math.abs(90 - a));
  return angles.reduce((a, b) => a + b, 0) / angles.length;
}

export function calculateVerticalOscillation(frames: FrameData[]): number | null {
  if (frames.length < 2) return null;
  const L = LANDMARKS;
  const midYs = frames
    .map((f) => {
      const lh = f.landmarks[L.LEFT_HIP];
      const rh = f.landmarks[L.RIGHT_HIP];
      if (!lh || !rh) return null;
      return (lh.y + rh.y) / 2;
    })
    .filter((y): y is number => y !== null && y > 0);
  if (midYs.length < 2) return null;
  return (Math.max(...midYs) - Math.min(...midYs)) * 100;
}

export function calculateOverstriding(
  frames: FrameData[],
  events: GaitEvent[],
  side: Foot,
): number | null {
  const L = LANDMARKS;
  const hipIdx = side === 'left' ? L.LEFT_HIP : L.RIGHT_HIP;
  const ankleIdx = side === 'left' ? L.LEFT_ANKLE : L.RIGHT_ANKLE;

  const footstrikes = events.filter((e) => e.type === 'footstrike' && e.foot === side);
  if (footstrikes.length === 0) return null;

  const distances = footstrikes
    .map((e) => frames[e.frameIndex])
    .filter(Boolean)
    .map((f) => (f.worldLandmarks[ankleIdx].x - f.worldLandmarks[hipIdx].x) * 100);
  return distances.reduce((a, b) => a + b, 0) / distances.length;
}

export function calculateStrideSymmetry(
  leftVal: number | null,
  rightVal: number | null,
): number | null {
  if (leftVal === null || rightVal === null) return null;
  const avg = (Math.abs(leftVal) + Math.abs(rightVal)) / 2;
  if (avg === 0) return 0;
  return (Math.abs(Math.abs(leftVal) - Math.abs(rightVal)) / avg) * 100;
}

export function calculateGroundContactTime(
  cycles: GaitCycle[],
  fps: number,
): number | null {
  if (cycles.length === 0) return null;
  const times = cycles.map((c) => ((c.toeOffFrame - c.footstrikeFrame) / fps) * 1000);
  return times.reduce((a, b) => a + b, 0) / times.length;
}

function toResult(value: number | null, key: keyof AnalysisResults): MetricResult | null {
  if (value === null) return null;
  return makeMetricResult(Math.abs(value), key);
}

function cadenceValue(events: GaitEvent[], durationSeconds: number): number | null {
  if (durationSeconds <= 0) return null;
  const count = events.filter((e) => e.type === 'footstrike').length;
  if (count === 0) return null;
  return Math.round((count / durationSeconds) * 60);
}

export function calculateAllMetrics(
  frames: FrameData[],
  events: GaitEvent[],
  cycles: GaitCycle[],
  fps: number,
  cameraView: CameraView,
): AnalysisResults {
  const isSagittal = cameraView === 'sagittal' || cameraView === 'unknown';
  const isFrontal = cameraView === 'frontal' || cameraView === 'unknown';

  const leftKnee = isSagittal ? calculateKneeFlexionAtContact(frames, events, 'left') : null;
  const rightKnee = isSagittal ? calculateKneeFlexionAtContact(frames, events, 'right') : null;
  const avgKnee = leftKnee !== null && rightKnee !== null
    ? (leftKnee + rightKnee) / 2
    : (leftKnee ?? rightKnee);

  const leftAnkle = isSagittal ? calculateAnkleDorsiflexion(frames, events, 'left') : null;
  const rightAnkle = isSagittal ? calculateAnkleDorsiflexion(frames, events, 'right') : null;
  const avgAnkle = leftAnkle !== null && rightAnkle !== null
    ? (leftAnkle + rightAnkle) / 2
    : (leftAnkle ?? rightAnkle);

  const leftOver = isSagittal ? calculateOverstriding(frames, events, 'left') : null;
  const rightOver = isSagittal ? calculateOverstriding(frames, events, 'right') : null;
  const avgOver = leftOver !== null && rightOver !== null
    ? (Math.abs(leftOver) + Math.abs(rightOver)) / 2
    : leftOver !== null ? Math.abs(leftOver) : rightOver !== null ? Math.abs(rightOver) : null;

  const leftHipAdd = isFrontal ? calculateHipAdduction(frames, events, 'left') : null;
  const rightHipAdd = isFrontal ? calculateHipAdduction(frames, events, 'right') : null;
  const avgHipAdd = leftHipAdd !== null && rightHipAdd !== null
    ? (leftHipAdd + rightHipAdd) / 2
    : (leftHipAdd ?? rightHipAdd);

  const durationSeconds = frames.length > 0
    ? (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000
    : 0;

  // Stride symmetry: average of all available bilateral metric pairs
  const symmetryValues = [
    calculateStrideSymmetry(leftKnee, rightKnee),
    calculateStrideSymmetry(leftAnkle, rightAnkle),
    calculateStrideSymmetry(leftOver, rightOver),
  ].filter((v): v is number => v !== null);
  const symmetry = symmetryValues.length > 0
    ? symmetryValues.reduce((a, b) => a + b, 0) / symmetryValues.length
    : null;

  return {
    kneeFlexionAtContact: toResult(avgKnee, 'kneeFlexionAtContact'),
    hipAdduction: toResult(avgHipAdd, 'hipAdduction'),
    pelvicDrop: isFrontal ? toResult(calculatePelvicDrop(frames, events), 'pelvicDrop') : null,
    trunkLateralLean: isFrontal ? toResult(calculateTrunkLateralLean(frames, events), 'trunkLateralLean') : null,
    ankleDorsiflexion: toResult(avgAnkle, 'ankleDorsiflexion'),
    cadence: toResult(cadenceValue(events, durationSeconds), 'cadence'),
    verticalOscillation: toResult(calculateVerticalOscillation(frames), 'verticalOscillation'),
    overstriding: toResult(avgOver, 'overstriding'),
    strideSymmetry: toResult(symmetry, 'strideSymmetry'),
    groundContactTime: toResult(calculateGroundContactTime(cycles, fps), 'groundContactTime'),
  };
}
