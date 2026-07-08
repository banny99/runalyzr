import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { FrameData, LandmarkArray } from '../types/index';
import { setRunningMode } from './landmarker';

// requestVideoFrameCallback (Safari 15.4+, Chrome 83+) fires exactly once per
// decoded video frame — avoids processing duplicate frames. Falls back to
// requestAnimationFrame with interval gating.
//
// Extracted from runalyzr and bike, whose copies were line-for-line identical
// apart from bike's IMAGE→VIDEO mode reset (kept here: it's a no-op for apps
// that never leave VIDEO mode). App-specific view detection stays app-local.

export interface ProcessingController {
  start: () => void;
  stop: () => void;
  getFrames: () => FrameData[];
  getCurrentLandmarks: () => LandmarkArray | null;
  getFps: () => number;
}

export interface ProcessingLoopOptions {
  fpsTarget: number;
  fpsSkipThreshold: number;
}

export function createProcessingLoop(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  onFrame: (landmarks: LandmarkArray, timestamp: number) => void,
  { fpsTarget, fpsSkipThreshold }: ProcessingLoopOptions,
): ProcessingController {
  let running = false;
  let rafId = 0;
  let lastProcessTime = 0;
  let currentFps = fpsTarget;
  const frames: FrameData[] = [];
  let currentLandmarks: LandmarkArray | null = null;

  const useVFC = typeof video.requestVideoFrameCallback === 'function';

  function processFrame(now: DOMHighResTimeStamp) {
    if (!running) return;

    if (!video.paused && !video.ended && video.readyState >= 2) {
      const elapsed = now - lastProcessTime;
      // With VFC every callback is a new frame, so no interval gating needed.
      // With rAF we still gate at fpsTarget to avoid over-processing.
      const ready = useVFC || elapsed >= 1000 / fpsTarget;

      if (ready) {
        currentFps = elapsed > 0 ? 1000 / elapsed : fpsTarget;
        // Skip every other frame when below threshold (helps very slow devices).
        const shouldProcess =
          currentFps >= fpsSkipThreshold || frames.length % 2 === 0;

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
      // A still-photo flow may have left the landmarker in IMAGE mode; switch
      // back before the first detectForVideo call (no-op when already VIDEO).
      void setRunningMode(landmarker, 'VIDEO').then(() => {
        if (!running) return;
        if (useVFC) {
          rafId = video.requestVideoFrameCallback!(processFrame);
        } else {
          rafId = requestAnimationFrame(processFrame);
        }
      });
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
