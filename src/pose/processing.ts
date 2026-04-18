import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { FPS_TARGET, FPS_SKIP_THRESHOLD, LANDMARKS } from '../config/defaults';
import type { FrameData, LandmarkArray, CameraView } from '../analysis/types';

export interface ProcessingController {
  start: () => void;
  stop: () => void;
  getFrames: () => FrameData[];
  getCurrentLandmarks: () => LandmarkArray | null;
  getFps: () => number;
}

export function detectCameraView(landmarks: LandmarkArray): CameraView {
  const leftHip = landmarks[LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[LANDMARKS.RIGHT_HIP];
  if (!leftHip || !rightHip) return 'unknown';
  const hipWidth = Math.abs(leftHip.x - rightHip.x);
  if (hipWidth > 0.15) return 'frontal';
  if (hipWidth < 0.08) return 'sagittal';
  return 'unknown';
}

export function createProcessingLoop(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  onFrame: (landmarks: LandmarkArray, timestamp: number) => void,
): ProcessingController {
  let running = false;
  let rafId = 0;
  let lastProcessTime = 0;
  let currentFps = FPS_TARGET;
  const frames: FrameData[] = [];
  let currentLandmarks: LandmarkArray | null = null;

  function processFrame() {
    if (!running) return;

    const now = performance.now();
    const elapsed = now - lastProcessTime;

    if (!video.paused && !video.ended && video.readyState >= 2) {
      const targetInterval = 1000 / FPS_TARGET;
      if (elapsed >= targetInterval) {
        currentFps = elapsed > 0 ? 1000 / elapsed : FPS_TARGET;

        // Skip frame if performance is poor
        const shouldProcess =
          currentFps >= FPS_SKIP_THRESHOLD || frames.length % 2 === 0;

        if (shouldProcess) {
          const result = landmarker.detectForVideo(video, now);
          if (result.landmarks.length > 0) {
            currentLandmarks = result.landmarks[0] as LandmarkArray;
            frames.push({ timestamp: now, landmarks: currentLandmarks });
            onFrame(currentLandmarks, now);
          }
        }
        lastProcessTime = now;
      }
    }

    rafId = requestAnimationFrame(processFrame);
  }

  return {
    start() {
      running = true;
      frames.length = 0;
      currentLandmarks = null;
      lastProcessTime = 0;
      processFrame();
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    getFrames: () => frames,
    getCurrentLandmarks: () => currentLandmarks,
    getFps: () => currentFps,
  };
}
