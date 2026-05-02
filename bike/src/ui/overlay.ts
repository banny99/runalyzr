import type { LandmarkArray } from '@runalyzr/shared/types';
import type { MetricStatus } from '@runalyzr/shared/types';
import { POSE_CONNECTIONS, OVERLAY_COLORS } from '../config/defaults';

export interface Overlay {
  syncSize: () => void;
  syncSizeIfReady: () => void;
  drawSkeleton: (landmarks: LandmarkArray, statuses: Partial<Record<number, MetricStatus>>) => void;
  drawAngleLabel: (landmarks: LandmarkArray, landmarkIndex: number, label: string) => void;
  setVisible: (v: boolean) => void;
  captureDataUrl: () => string | null;
}

export function initOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement): Overlay {
  const ctx = canvas.getContext('2d')!;
  let visible = true;

  function syncSize() {
    canvas.width  = video.videoWidth  || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
  }

  return {
    syncSize,
    syncSizeIfReady() {
      if (video.videoWidth > 0) syncSize();
    },
    drawSkeleton(landmarks, statuses) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!visible) return;

      const w = canvas.width;
      const h = canvas.height;

      // Connections
      ctx.lineWidth = 2;
      for (const [a, b] of POSE_CONNECTIONS) {
        const lmA = landmarks[a];
        const lmB = landmarks[b];
        if (!lmA || !lmB) continue;
        const status = statuses[a] ?? statuses[b] ?? 'unknown';
        ctx.strokeStyle = OVERLAY_COLORS[status === 'unknown' ? 'neutral' : status] ?? OVERLAY_COLORS.neutral;
        ctx.beginPath();
        ctx.moveTo(lmA.x * w, lmA.y * h);
        ctx.lineTo(lmB.x * w, lmB.y * h);
        ctx.stroke();
      }

      // Joints
      for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (!lm || (lm.visibility ?? 1) < 0.4) continue;
        const status = statuses[i] ?? 'unknown';
        ctx.fillStyle = OVERLAY_COLORS[status === 'unknown' ? 'neutral' : status] ?? OVERLAY_COLORS.neutral;
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    drawAngleLabel(landmarks, landmarkIndex, label) {
      if (!visible) return;
      const lm = landmarks[landmarkIndex];
      if (!lm) return;
      const x = lm.x * canvas.width;
      const y = lm.y * canvas.height;
      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 3;
      ctx.strokeText(label, x + 6, y - 6);
      ctx.fillText(label, x + 6, y - 6);
    },
    setVisible(v) { visible = v; },
    captureDataUrl() {
      try { return canvas.toDataURL('image/png'); } catch { return null; }
    },
  };
}
