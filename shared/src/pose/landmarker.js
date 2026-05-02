import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
export async function initLandmarker(modelUrl, wasmPath, mode = 'VIDEO', onResult) {
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: modelUrl,
            delegate: 'GPU',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
