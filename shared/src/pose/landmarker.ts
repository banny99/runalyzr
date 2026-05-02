import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { LandmarkArray } from '../types/index';

export async function initLandmarker(
  modelUrl: string,
  wasmPath: string,
  mode: 'VIDEO' | 'LIVE_STREAM' = 'VIDEO',
  onResult?: (landmarks: LandmarkArray, timestamp: number) => void,
): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(wasmPath);

  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate: 'GPU',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runningMode: mode as any,
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
