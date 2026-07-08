import { LANDMARKS } from '../config/defaults';
import type { AnalysisResults, MetricStatus } from './types';

/**
 * Maps metric statuses onto skeleton joint indices for the overlay.
 * Single source of truth — previously duplicated verbatim in main.ts and
 * cameraController.ts, where new metrics could silently drift apart.
 */
export function buildJointStatuses(results: AnalysisResults): Partial<Record<number, MetricStatus>> {
  const s: Partial<Record<number, MetricStatus>> = {};
  const L = LANDMARKS;
  const set = (indices: number[], status: MetricStatus) =>
    indices.forEach((i) => { s[i] = status; });
  if (results.kneeFlexionAtContact)
    set([L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
      results.kneeFlexionAtContact.status);
  if (results.pelvicDrop)
    set([L.LEFT_HIP, L.RIGHT_HIP], results.pelvicDrop.status);
  if (results.trunkLateralLean)
    set([L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
      results.trunkLateralLean.status);
  return s;
}
