import type { LandmarkArray } from '../types/index';

// Byte-identical in both apps before extraction.
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],           // shoulders
  [11, 23], [12, 24], // shoulder → hip
  [23, 24],           // hips
  [23, 25], [25, 27], [27, 31], // left leg
  [24, 26], [26, 28], [28, 32], // right leg
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
];

export interface SkeletonStyle {
  color: string;
  lineWidth?: number;     // default 2
  jointRadius?: number;   // default 4
  minVisibility?: number; // default 0.4
}

/**
 * Draws a single-colour pose skeleton onto an arbitrary 2D context at the
 * given pixel size, gating both connection endpoints and joints on landmark
 * visibility. Used for static renders (annotated photos, PDF report frames).
 * The live overlays keep their own app-local drawers — they add per-joint
 * status colours and letterbox mapping that static renders don't need.
 *
 * Note: bike's pre-extraction drawer gated only the joint dots, so its baked
 * fit photos used to draw lines through occluded landmarks. The endpoint
 * gating here is a deliberate alignment with the live overlays, not a
 * faithful port. Pass `minVisibility: 0` to reproduce the old behaviour.
 */
export function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  lms: LandmarkArray,
  w: number,
  h: number,
  { color, lineWidth = 2, jointRadius = 4, minVisibility = 0.4 }: SkeletonStyle,
): void {
  const visible = (l: LandmarkArray[number] | undefined) =>
    !!l && (l.visibility ?? 1) >= minVisibility;

  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = lms[a];
    const lb = lms[b];
    if (!visible(la) || !visible(lb)) continue;
    ctx.beginPath();
    ctx.moveTo(la.x * w, la.y * h);
    ctx.lineTo(lb.x * w, lb.y * h);
    ctx.stroke();
  }
  for (const l of lms) {
    if (!visible(l)) continue;
    ctx.beginPath();
    ctx.arc(l.x * w, l.y * h, jointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}
