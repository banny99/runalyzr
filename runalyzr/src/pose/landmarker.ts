import { initLandmarker as _initLandmarker } from '@runalyzr/shared/pose';
import { MEDIAPIPE_CDN, HEAVY_MODEL_URL } from '../config/defaults';
import type { LandmarkArray } from '@runalyzr/shared/types';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';

export async function initLandmarker(
  modelUrl: string = HEAVY_MODEL_URL,
  mode: 'VIDEO' | 'LIVE_STREAM' = 'VIDEO',
  onResult?: (landmarks: LandmarkArray, timestamp: number) => void,
): Promise<PoseLandmarker> {
  return _initLandmarker(modelUrl, MEDIAPIPE_CDN, mode, onResult);
}
