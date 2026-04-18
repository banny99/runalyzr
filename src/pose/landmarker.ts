import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_CDN, LITE_MODEL_URL } from '../config/defaults';
import type { LandmarkArray } from '../analysis/types';

export async function initLandmarker(
  modelUrl: string = LITE_MODEL_URL,
  mode: 'VIDEO' | 'LIVE_STREAM' = 'VIDEO',
  onResult?: (landmarks: LandmarkArray, timestamp: number) => void,
): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);

  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate: 'GPU',
    },
    runningMode: mode,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    ...(mode === 'LIVE_STREAM' && onResult
      ? {
          resultListener: (result: { landmarks: LandmarkArray[] }, _: unknown, timestamp: number) => {
            if (result.landmarks.length > 0) {
              onResult(result.landmarks[0], timestamp);
            }
          },
        }
      : {}),
  });
}
