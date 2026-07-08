import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { createProcessingLoop as createSharedLoop } from '@runalyzr/shared/processing';
import type { ProcessingController } from '@runalyzr/shared/processing';
import { FPS_TARGET, FPS_SKIP_THRESHOLD, LANDMARKS } from '../config/defaults';
import type { LandmarkArray, CameraView } from '../analysis/types';


// View thresholds are app-specific (runalyzr distinguishes only frontal vs
// sagittal for running form); the frame-processing loop itself is shared.
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
  return createSharedLoop(landmarker, video, onFrame, {
    fpsTarget: FPS_TARGET,
    fpsSkipThreshold: FPS_SKIP_THRESHOLD,
  });
}
