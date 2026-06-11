import type { BikePoint } from '../config/defaults';

/**
 * Index of the first point at or after `from` that has not been placed yet.
 * Returns `stepPoints.length` when none remain (the "all placed" state).
 */
export function firstUnplacedFrom(
  stepPoints: BikePoint[],
  placedIds: Set<string>,
  from: number,
): number {
  for (let i = Math.max(0, from); i < stepPoints.length; i++) {
    if (!placedIds.has(stepPoints[i].id)) return i;
  }
  return stepPoints.length;
}
