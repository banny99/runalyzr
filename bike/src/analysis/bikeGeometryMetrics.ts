import type { AngleDefinition } from '../config/defaults';
import type { PlacedPoint, BikeAngleMeasurement } from './types';
import { bandStatus } from './bands';

/** Point-id pairs to draw as connection lines, derived from angle definitions. */
export function anglePointPairs(angleDefs: AngleDefinition[]): [string, string][] {
  return angleDefs.flatMap((a): [string, string][] =>
    a.pointC !== undefined
      ? [[a.pointA, a.pointB], [a.pointB, a.pointC]]
      : [[a.pointA, a.pointB]],
  );
}

export function computeBikeAngles(
  points: PlacedPoint[],
  angleDefs: AngleDefinition[],
  aspectRatio: number, // image width / height
): BikeAngleMeasurement[] {
  const byId = Object.fromEntries(points.map((p) => [p.id, p]));
  const results: BikeAngleMeasurement[] = [];

  for (const def of angleDefs) {
    const pA = byId[def.pointA];
    const pB = byId[def.pointB];
    if (!pA || !pB) continue;

    let value: number;

    // NOTE: check 'ab_to_c' POSITIVELY first — TypeScript does not narrow
    // `pointC` to string when this variant is reached by eliminating the
    // 'horizontal' | 'vertical' variant (multi-member discriminant).
    if (def.reference === 'ab_to_c') {
      // interior angle at B
      const pC = byId[def.pointC];
      if (!pC) continue;
      const ax = (pA.x - pB.x) * aspectRatio;
      const ay = pA.y - pB.y;
      const cx = (pC.x - pB.x) * aspectRatio;
      const cy = pC.y - pB.y;
      const dot = ax * cx + ay * cy;
      const mag = Math.sqrt((ax * ax + ay * ay) * (cx * cx + cy * cy));
      value = mag === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
    } else {
      // De-normalise: scale x by aspectRatio so both axes share the same unit.
      // Canvas y=0 is the top, so dy is positive going downward in the image.
      const dx = (pB.x - pA.x) * aspectRatio;
      const dy = pB.y - pA.y;

      if (def.reference === 'horizontal') {
        if (def.signed) {
          // Signed: positive when A sits visually higher than B (saddle nose-up).
          // A higher than B → pA.y < pB.y (canvas y grows downward) → dy > 0.
          value = Math.atan2(dy, Math.abs(dx)) * (180 / Math.PI);
        } else {
          value = Math.atan2(Math.abs(dy), Math.abs(dx)) * (180 / Math.PI);
        }
      } else {
        value = Math.atan2(Math.abs(dx), Math.abs(dy)) * (180 / Math.PI);
      }
    }

    const rounded = parseFloat(value.toFixed(1));
    results.push({
      id: def.id,
      label: def.label,
      value: rounded,
      normalRange: def.normalRange,
      status: bandStatus(rounded, def.green),
    });
  }

  return results;
}
