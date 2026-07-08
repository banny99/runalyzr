import { POSE_CONNECTIONS, OVERLAY_COLORS } from '../config/defaults';
import type { LandmarkArray, MetricStatus } from '../analysis/types';

export type JointStatuses = Partial<Record<number, MetricStatus>>;

export interface OverlayController {
  drawSkeleton: (landmarks: LandmarkArray, statuses?: JointStatuses) => void;
  drawAngleLabel: (
    landmarks: LandmarkArray,
    landmarkIndex: number,
    label: string,
  ) => void;
  clear: () => void;
  syncSize: () => void;
  syncSizeIfReady: () => void;
  setVisible: (visible: boolean) => void;
}

export function initOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): OverlayController {
  const ctx = canvas.getContext('2d')!;
  let visible = true;

  // Re-sync canvas position whenever the container is resized (orientation change, etc.)
  const ro = new ResizeObserver(() => { if (video.videoWidth > 0) syncSize(); });
  ro.observe(canvas.parentElement!);

  function syncSize() {
    if (video.videoWidth === 0) return;
    // Set canvas intrinsic resolution to match the video frame
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    // Position canvas CSS to exactly cover the rendered video content area
    // (object-fit:contain letterboxes the video — canvas must match, not fill the container)
    const cw = video.clientWidth;
    const ch = video.clientHeight;
    const videoAspect = video.videoWidth / video.videoHeight;
    const containerAspect = cw / ch;
    let renderW: number, renderH: number;
    if (videoAspect > containerAspect) {
      // pillarboxed: full width, bars top/bottom
      renderW = cw;
      renderH = cw / videoAspect;
    } else {
      // letterboxed: full height, bars left/right
      renderH = ch;
      renderW = ch * videoAspect;
    }
    const offsetX = (cw - renderW) / 2;
    const offsetY = (ch - renderH) / 2;
    canvas.style.left   = `${offsetX}px`;
    canvas.style.top    = `${offsetY}px`;
    canvas.style.width  = `${renderW}px`;
    canvas.style.height = `${renderH}px`;
  }

  function syncSizeIfReady() {
    if (video.videoWidth > 0) {
      syncSize();
    } else {
      video.addEventListener('canplay', syncSize, { once: true });
    }
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function statusToColor(status?: MetricStatus): string {
    if (status === 'green') return OVERLAY_COLORS.green;
    if (status === 'amber') return OVERLAY_COLORS.amber;
    if (status === 'red') return OVERLAY_COLORS.red;
    return OVERLAY_COLORS.neutral;
  }

  function drawSkeleton(
    landmarks: LandmarkArray,
    statuses: JointStatuses = {},
  ) {
    if (!visible) return;
    clear();
    const w = canvas.width;
    const h = canvas.height;

    // Connections
    ctx.lineWidth = 2;
    for (const [a, b] of POSE_CONNECTIONS) {
      const lmA = landmarks[a];
      const lmB = landmarks[b];
      if (!lmA || !lmB) continue;
      if ((lmA.visibility ?? 1) < 0.4 || (lmB.visibility ?? 1) < 0.4) continue;
      const color =
        statusToColor(statuses[a]) !== OVERLAY_COLORS.neutral
          ? statusToColor(statuses[a])
          : statusToColor(statuses[b]);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(lmA.x * w, lmA.y * h);
      ctx.lineTo(lmB.x * w, lmB.y * h);
      ctx.stroke();
    }

    // Landmark dots
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm || (lm.visibility ?? 1) < 0.4) continue;
      ctx.fillStyle = statusToColor(statuses[i]);
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAngleLabel(
    landmarks: LandmarkArray,
    landmarkIndex: number,
    label: string,
  ) {
    if (!visible) return;
    const lm = landmarks[landmarkIndex];
    if (!lm || (lm.visibility ?? 1) < 0.4) return;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px system-ui';
    ctx.fillText(label, lm.x * canvas.width + 6, lm.y * canvas.height - 6);
  }

  return {
    drawSkeleton,
    drawAngleLabel,
    clear,
    syncSize,
    syncSizeIfReady,
    setVisible(v) {
      visible = v;
      if (!v) clear();
    },
  };
}
