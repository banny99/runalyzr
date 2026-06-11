import type { BikeGeometryStep } from '../config/defaults';
import type { PlacedPoint, BikeAngleMeasurement } from '../analysis/types';
import { anglePointPairs } from '../analysis/bikeGeometryMetrics';

/**
 * Draws the photo with placed points, connection lines and an angle summary
 * box at the image's natural resolution. Returns a JPEG data URL used by the
 * results panel and PDF. (v1 snapshotted the small on-screen canvas instead —
 * its result images were unusably low-res.)
 */
export function renderAnnotatedBikePhoto(
  img: HTMLImageElement,
  step: BikeGeometryStep,
  points: PlacedPoint[],
  angles: BikeAngleMeasurement[],
): string {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const dotR = Math.max(6, Math.round(W * 0.008));
  const fontPx = Math.max(16, Math.round(W * 0.018));
  const byId = Object.fromEntries(points.map((p) => [p.id, p]));

  // Connection lines
  ctx.save();
  ctx.setLineDash([dotR, dotR * 0.7]);
  ctx.lineWidth = Math.max(2, W * 0.002);
  ctx.strokeStyle = '#60a5fa';
  ctx.globalAlpha = 0.8;
  for (const [aId, bId] of anglePointPairs(step.angles)) {
    const pA = byId[aId];
    const pB = byId[bId];
    if (!pA || !pB) continue;
    ctx.beginPath();
    ctx.moveTo(pA.x * W, pA.y * H);
    ctx.lineTo(pB.x * W, pB.y * H);
    ctx.stroke();
  }
  ctx.restore();

  // Dots + short labels
  ctx.font = `bold ${fontPx}px sans-serif`;
  for (const p of points) {
    const px = p.x * W;
    const py = p.y * H;
    ctx.beginPath();
    ctx.arc(px, py, dotR, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = Math.max(2, dotR * 0.25);
    ctx.stroke();
    const shortLabel = step.points.find((pt) => pt.id === p.id)?.label.split(' ')[0] ?? p.id;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = Math.max(2, fontPx * 0.15);
    ctx.strokeText(shortLabel, px + dotR + 4, py + fontPx * 0.35);
    ctx.fillText(shortLabel, px + dotR + 4, py + fontPx * 0.35);
  }

  // Angle summary box (top-left)
  if (angles.length > 0) {
    const pad = fontPx * 0.6;
    const lineH = fontPx * 1.35;
    const lines = angles.map((a) => `${a.label}: ${a.value}°`);
    let boxW = 0;
    for (const line of lines) boxW = Math.max(boxW, ctx.measureText(line).width);
    ctx.fillStyle = 'rgba(10, 12, 16, 0.75)';
    ctx.fillRect(pad, pad, boxW + pad * 2, lines.length * lineH + pad * 1.5);
    ctx.fillStyle = '#e2e8f0';
    lines.forEach((line, i) => {
      ctx.fillText(line, pad * 2, pad * 1.6 + (i + 0.6) * lineH);
    });
  }

  return canvas.toDataURL('image/jpeg', 0.85);
}
