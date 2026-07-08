import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { createProcessingLoop as createSharedLoop } from '@runalyzr/shared/processing';
import type { ProcessingController } from '@runalyzr/shared/processing';
import { FPS_TARGET, FPS_SKIP_THRESHOLD, LANDMARKS } from '../config/defaults';
import type { LandmarkArray, CameraView } from '@runalyzr/shared/types';
import { setRunningMode } from '@runalyzr/shared/pose';

export type { ProcessingController };

// View thresholds are app-specific (bike distinguishes rear as well, for
// trainer setups); the frame-processing loop itself is shared.
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

export async function analyzeImage(
  landmarker: PoseLandmarker,
  image: HTMLImageElement,
): Promise<{ landmarks: LandmarkArray; worldLandmarks: LandmarkArray } | null> {
  // detect() throws unless the task is in IMAGE mode (it is created in VIDEO
  // mode for ride analysis), so switch before every still-photo detection.
  await setRunningMode(landmarker, 'IMAGE');
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
  return createSharedLoop(landmarker, video, onFrame, {
    fpsTarget: FPS_TARGET,
    fpsSkipThreshold: FPS_SKIP_THRESHOLD,
  });
}
