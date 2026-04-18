export const LANDMARKS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],          // shoulders
  [11, 23], [12, 24], // shoulder → hip
  [23, 24],          // hips
  [23, 25], [25, 27], [27, 31], // left leg
  [24, 26], [26, 28], [28, 32], // right leg
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
];

export const OVERLAY_COLORS = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  neutral: '#ffffff',
} as const;

export const METRIC_LABELS: Record<string, string> = {
  kneeFlexionAtContact: 'Knee Flexion at Contact',
  hipAdduction: 'Hip Adduction',
  pelvicDrop: 'Pelvic Drop',
  trunkLateralLean: 'Trunk Lateral Lean',
  ankleDorsiflexion: 'Ankle Dorsiflexion',
  cadence: 'Cadence',
  verticalOscillation: 'Vertical Oscillation',
  overstriding: 'Overstriding',
  strideSymmetry: 'Stride Symmetry',
  groundContactTime: 'Ground Contact Time',
};

export const APP_NAME = 'Runalyzr';

export const MEDIAPIPE_CDN = '/wasm';

export const LITE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const HEAVY_MODEL_URL = '/models/pose_landmarker_heavy.task';

export const FPS_TARGET = 30;
export const FPS_SKIP_THRESHOLD = 20;
