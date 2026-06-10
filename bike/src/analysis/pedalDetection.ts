import type { FrameData } from '@runalyzr/shared/types';
import { angleBetweenThreePoints, findLocalMaxima, findLocalMinima } from '@runalyzr/shared/math';
import { LANDMARKS } from '../config/defaults';
import type { PedalEvent, PedalCycle } from './types';

export function detectPedalEvents(frames: FrameData[], fps: number): PedalEvent[] {
  const minFrames = Math.round(fps * 0.2);
  const minProminence = 2; // degrees
  const events: PedalEvent[] = [];

  const config: Array<{ side: 'left' | 'right'; hipIdx: number; kneeIdx: number; ankleIdx: number }> = [
    { side: 'left',  hipIdx: LANDMARKS.LEFT_HIP,  kneeIdx: LANDMARKS.LEFT_KNEE,  ankleIdx: LANDMARKS.LEFT_ANKLE },
    { side: 'right', hipIdx: LANDMARKS.RIGHT_HIP, kneeIdx: LANDMARKS.RIGHT_KNEE, ankleIdx: LANDMARKS.RIGHT_ANKLE },
  ];

  for (const { side, hipIdx, kneeIdx, ankleIdx } of config) {
    // Use world landmarks for more accurate angle — knee angle is highest at TDC, lowest at BDC
    const angles = frames.map((f) => {
      const hip   = f.worldLandmarks[hipIdx];
      const knee  = f.worldLandmarks[kneeIdx];
      const ankle = f.worldLandmarks[ankleIdx];
      if (!hip || !knee || !ankle) return 0;
      return angleBetweenThreePoints(hip, knee, ankle);
    });

    // TDC = peak knee angle (most flexed — smallest extension angle actually means most flexion)
    // In MediaPipe world coords, knee angle at TDC (top) is SMALLER (more bent)
    // and at BDC (bottom) it is LARGER (more extended).
    // So: TDC = local minima of knee angle, BDC = local maxima
    for (const fi of findLocalMaxima(angles, minFrames, minProminence)) {
      events.push({ phase: 'bdc', side, frameIndex: fi, timestamp: frames[fi].timestamp });
    }
    for (const fi of findLocalMinima(angles, minFrames, minProminence)) {
      events.push({ phase: 'tdc', side, frameIndex: fi, timestamp: frames[fi].timestamp });
    }
  }

  return events.sort((a, b) => a.frameIndex - b.frameIndex);
}

export function segmentPedalCycles(events: PedalEvent[]): PedalCycle[] {
  const cycles: PedalCycle[] = [];

  for (const side of ['left', 'right'] as const) {
    const bdcEvents = events.filter((e) => e.phase === 'bdc' && e.side === side);
    const tdcEvents = events.filter((e) => e.phase === 'tdc' && e.side === side);

    for (let i = 0; i < bdcEvents.length - 1; i++) {
      const start = bdcEvents[i].frameIndex;
      const end   = bdcEvents[i + 1].frameIndex;
      const tdc   = tdcEvents.find((t) => t.frameIndex > start && t.frameIndex < end);
      cycles.push({
        side,
        startFrame: start,
        endFrame: end,
        tdcFrame: tdc?.frameIndex ?? Math.round(start + (end - start) * 0.5),
        bdcFrame: start,
      });
    }
  }

  return cycles.sort((a, b) => a.startFrame - b.startFrame);
}

export function calculateCadence(events: PedalEvent[], durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  const bdcCount = events.filter((e) => e.phase === 'bdc').length;
  // Each BDC = 1 half-revolution per side, so full revolutions = bdcCount / 2
  return Math.round((bdcCount / 2 / durationSeconds) * 60);
}
