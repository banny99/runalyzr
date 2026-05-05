import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
async function buildLandmarker(vision, modelUrl, mode, delegate, onResult) {
    return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        // mediapipe typedefs only list "IMAGE"|"VIDEO" but the runtime also accepts "LIVE_STREAM"
        runningMode: mode,
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        ...(mode === 'LIVE_STREAM' && onResult
            ? {
                resultListener: (result, _, timestamp) => {
                    if (result.landmarks.length > 0) {
                        onResult(result.landmarks[0], timestamp);
                    }
                },
            }
            : {}),
    });
}
export async function initLandmarker(modelUrl, wasmPath, mode = 'VIDEO', onResult) {
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    try {
        return await buildLandmarker(vision, modelUrl, mode, 'GPU', onResult);
    }
    catch {
        return buildLandmarker(vision, modelUrl, mode, 'CPU', onResult);
    }
}
