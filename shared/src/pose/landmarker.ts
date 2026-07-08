import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export type RunningMode = 'VIDEO' | 'IMAGE';

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
  await landmarker.setOptions({ runningMode: mode });
  currentModes.set(landmarker, mode);
}

async function buildLandmarker(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  modelUrl: string,
  mode: RunningMode,
  delegate: 'GPU' | 'CPU',
): Promise<PoseLandmarker> {
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode: mode,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export async function initLandmarker(
  modelUrl: string,
  wasmPath: string,
  mode: RunningMode = 'VIDEO',
): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  let landmarker: PoseLandmarker;
  try {
    landmarker = await buildLandmarker(vision, modelUrl, mode, 'GPU');
  } catch {
    landmarker = await buildLandmarker(vision, modelUrl, mode, 'CPU');
  }
  currentModes.set(landmarker, mode);
  return landmarker;
}
