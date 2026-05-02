import type { FrameData, GaitEvent, GaitCycle, Foot } from './types';
import { LANDMARKS } from '../config/defaults';

function findLocalMaxima(
  values: number[],
  minDistance: number,
  minProminence: number,
): number[] {
  const indices: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] <= values[i - 1] || values[i] < values[i + 1]) continue;
    if (indices.length > 0 && i - indices[indices.length - 1] < minDistance) continue;
    const windowStart = Math.max(0, i - minDistance);
    const windowEnd = Math.min(values.length - 1, i + minDistance);
    const windowMin = Math.min(...values.slice(windowStart, windowEnd + 1));
    if (values[i] - windowMin >= minProminence) indices.push(i);
  }
  return indices;
}

function findLocalMinima(
  values: number[],
  minDistance: number,
  minProminence: number,
): number[] {
  return findLocalMaxima(values.map((v) => -v), minDistance, minProminence);
}

export function detectGaitEvents(frames: FrameData[], fps: number): GaitEvent[] {
  const minFramesBetweenSteps = Math.round(fps * 0.25);
  const minProminence = 0.02;
  const events: GaitEvent[] = [];

  const ankleConfig: Array<{ index: number; foot: Foot }> = [
    { index: LANDMARKS.LEFT_ANKLE, foot: 'left' },
    { index: LANDMARKS.RIGHT_ANKLE, foot: 'right' },
  ];

  for (const { index: ankleIdx, foot } of ankleConfig) {
    const ys = frames.map((f) => f.landmarks[ankleIdx]?.y ?? 0);

    for (const fi of findLocalMaxima(ys, minFramesBetweenSteps, minProminence)) {
      events.push({ type: 'footstrike', foot, frameIndex: fi, timestamp: frames[fi].timestamp });
    }
    for (const fi of findLocalMinima(ys, minFramesBetweenSteps, minProminence)) {
      events.push({ type: 'toe_off', foot, frameIndex: fi, timestamp: frames[fi].timestamp });
    }
  }

  return events.sort((a, b) => a.frameIndex - b.frameIndex);
}

export function calculateCadence(events: GaitEvent[], totalDurationSeconds: number): number {
  if (totalDurationSeconds <= 0) return 0;
  const footstrikes = events.filter((e) => e.type === 'footstrike');
  return Math.round((footstrikes.length / totalDurationSeconds) * 60);
}

export function segmentGaitCycles(events: GaitEvent[]): GaitCycle[] {
  const cycles: GaitCycle[] = [];

  for (const foot of ['left', 'right'] as Foot[]) {
    const footstrikes = events
      .filter((e) => e.type === 'footstrike' && e.foot === foot)
      .sort((a, b) => a.frameIndex - b.frameIndex);
    const toeOffs = events
      .filter((e) => e.type === 'toe_off' && e.foot === foot)
      .sort((a, b) => a.frameIndex - b.frameIndex);

    for (let i = 0; i < footstrikes.length - 1; i++) {
      const start = footstrikes[i].frameIndex;
      const end = footstrikes[i + 1].frameIndex;
      const toeOff = toeOffs.find((t) => t.frameIndex > start && t.frameIndex < end);
      cycles.push({
        foot,
        startFrame: start,
        endFrame: end,
        footstrikeFrame: start,
        toeOffFrame: toeOff?.frameIndex ?? Math.round(start + (end - start) * 0.4),
      });
    }
  }

  return cycles.sort((a, b) => a.startFrame - b.startFrame);
}
