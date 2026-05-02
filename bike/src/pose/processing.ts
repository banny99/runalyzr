import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { FPS_TARGET, FPS_SKIP_THRESHOLD, LANDMARKS } from '../config/defaults';
import type { FrameData, LandmarkArray, CameraView } from '@runalyzr/shared/types';

// requestVideoFrameCallback (Safari 15.4+, Chrome 83+) fires exactly once per
// decoded video frame — avoids processing duplicate frames.

export interface ProcessingController {
  start: () => void;
  stop: () => void;
  getFrames: () => FrameData[];
  getCurrentLandmarks: () => LandmarkArray | null;
  getFps: () => number;
}

export function detectCameraView(landmarks: LandmarkArray): CameraView {
  const leftHip  = landmarks[LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[LANDMARKS.RIGHT_HIP];
  if (!leftHip || !rightHip) return 'unknown';
  const hipWidth = Math.abs(leftHip.x - rightHip.x);
  if (hipWidth > 0.15) return 'frontal';
  if (hipWidth < 0.05) return 'rear';
  if (hipWidth < 0.10) return 'sagittal';
  return 'unknown';
}

export function analyzeImage(
  landmarker: PoseLandmarker,
  image: HTMLImageElement,
): { landmarks: LandmarkArray; worldLandmarks: LandmarkArray } | null {
  const result = landmarker.detect(image);
  if (result.landmarks.length === 0) return null;
  return {
    landmarks: result.landmarks[0] as LandmarkArray,
    worldLandmarks: result.worldLandmarks[0] as LandmarkArray,
  };
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

  const useVFC = typeof video.requestVideoFrameCallback === 'function';

  function processFrame(now: DOMHighResTimeStamp) {
    if (!running) return;

    if (!video.paused && !video.ended && video.readyState >= 2) {
      const elapsed = now - lastProcessTime;
      const ready = useVFC || elapsed >= 1000 / FPS_TARGET;

      if (ready) {
        currentFps = elapsed > 0 ? 1000 / elapsed : FPS_TARGET;
        const shouldProcess =
          currentFps >= FPS_SKIP_THRESHOLD || frames.length % 2 === 0;

        if (shouldProcess) {
          const result = landmarker.detectForVideo(video, now);
          if (result.landmarks.length > 0 && result.worldLandmarks.length > 0) {
            currentLandmarks = result.landmarks[0] as LandmarkArray;
            frames.push({
              timestamp: now,
              landmarks: currentLandmarks,
              worldLandmarks: result.worldLandmarks[0] as LandmarkArray,
            });
            onFrame(currentLandmarks, now);
          }
        }
        lastProcessTime = now;
      }
    }

    if (useVFC) {
      rafId = video.requestVideoFrameCallback!(processFrame);
    } else {
      rafId = requestAnimationFrame(processFrame);
    }
  }

  return {
    start() {
      running = true;
      frames.length = 0;
      currentLandmarks = null;
      lastProcessTime = 0;
      if (useVFC) {
        rafId = video.requestVideoFrameCallback!(processFrame);
      } else {
        rafId = requestAnimationFrame(processFrame);
      }
    },
    stop() {
      running = false;
      if (useVFC) {
        video.cancelVideoFrameCallback?.(rafId);
      } else {
        cancelAnimationFrame(rafId);
      }
    },
    getFrames: () => frames,
    getCurrentLandmarks: () => currentLandmarks,
    getFps: () => currentFps,
  };
}
