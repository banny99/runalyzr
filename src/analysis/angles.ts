import type { Landmark, FrameData } from './types';

export function angleBetweenThreePoints(
  a: Landmark,
  b: Landmark,
  c: Landmark,
): number {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magBa = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
  const magBc = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);
  if (magBa === 0 || magBc === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBa * magBc)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

export function lateralAngle(top: Landmark, bottom: Landmark): number {
  const dx = top.x - bottom.x;
  const dy = Math.abs(top.y - bottom.y);
  return Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
}

export function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

/**
 * Returns peak-to-peak vertical displacement of a landmark across frames, in cm.
 * Approximation: normalised y × 100 ≈ cm (assumes runner fills ~1m of frame height).
 */
export function verticalDisplacement(
  landmarkIndex: number,
  frames: FrameData[],
): number {
  const ys = frames
    .map((f) => f.landmarks[landmarkIndex]?.y ?? 0)
    .filter((y) => y > 0);
  if (ys.length < 2) return 0;
  return (Math.max(...ys) - Math.min(...ys)) * 100;
}
