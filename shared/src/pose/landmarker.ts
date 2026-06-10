import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import type { LandmarkArray } from '../types/index';

/** Superset of mediapipe's RunningMode — includes LIVE_STREAM which the package typedefs omit. */
export type RunningMode = 'VIDEO' | 'IMAGE' | 'LIVE_STREAM';

/** The slice of PoseLandmarker that mode switching needs — keeps tests stub-friendly. */
export type ModeSwitchable = Pick<PoseLandmarker, 'setOptions'>;

const currentModes = new WeakMap<ModeSwitchable, RunningMode>();

/**
 * Switch a landmarker's running mode, skipping the (expensive) graph rebuild
 * when the mode is already current. detect() requires IMAGE mode while
 * detectForVideo() requires VIDEO mode — call this before switching API styles.
 */
export async function setRunningMode(
  landmarker: ModeSwitchable,
  mode: RunningMode,
): Promise<void> {
  if (currentModes.get(landmarker) === mode) return;
  await landmarker.setOptions({ runningMode: mode as 'VIDEO' | 'IMAGE' });
  currentModes.set(landmarker, mode);
}

async function buildLandmarker(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  modelUrl: string,
  mode: RunningMode,
  delegate: 'GPU' | 'CPU',
  onResult?: (landmarks: LandmarkArray, timestamp: number) => void,
): Promise<PoseLandmarker> {
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelUrl, delegate },
    // mediapipe typedefs only list "IMAGE"|"VIDEO" but the runtime also accepts "LIVE_STREAM"
    runningMode: mode as 'VIDEO' | 'IMAGE',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    ...(mode === 'LIVE_STREAM' && onResult
      ? {
          resultListener: (result: PoseLandmarkerResult, _: unknown, timestamp: number) => {
            if (result.landmarks.length > 0) {
              onResult(result.landmarks[0] as LandmarkArray, timestamp);
            }
          },
        }
      : {}),
  });
}

export async function initLandmarker(
  modelUrl: string,
  wasmPath: string,
  mode: RunningMode = 'VIDEO',
  onResult?: (landmarks: LandmarkArray, timestamp: number) => void,
): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  let landmarker: PoseLandmarker;
  try {
    landmarker = await buildLandmarker(vision, modelUrl, mode, 'GPU', onResult);
  } catch {
    landmarker = await buildLandmarker(vision, modelUrl, mode, 'CPU', onResult);
  }
  currentModes.set(landmarker, mode);
  return landmarker;
}
