import { initLandmarker as _initLandmarker } from '@runalyzr/shared/pose';
import { MEDIAPIPE_CDN, HEAVY_MODEL_URL } from '../config/defaults';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';

export async function initLandmarker(): Promise<PoseLandmarker> {
  return _initLandmarker(HEAVY_MODEL_URL, MEDIAPIPE_CDN);
}
