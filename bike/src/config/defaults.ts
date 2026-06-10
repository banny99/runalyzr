export const LANDMARKS = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],           // shoulders
  [11, 23], [12, 24], // shoulder → hip
  [23, 24],           // hips
  [23, 25], [25, 27], [27, 31], // left leg
  [24, 26], [26, 28], [28, 32], // right leg
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
];

export const OVERLAY_COLORS = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  neutral: '#60a5fa',
} as const;

// ── Fit positions ──────────────────────────────────────────────────────────

export type FitView = 'side' | 'rear' | 'front';

export interface FitPosition {
  id: string;
  name: string;
  view: FitView;
  instructions: string;
  keyMeasurements: string[];
}

export const FIT_POSITIONS: FitPosition[] = [
  {
    id: 'side_6oclock',
    name: '6 o\'clock — Side',
    view: 'side',
    instructions: 'Position pedal straight down (6 o\'clock). Stand camera at hip height, 3–5m away, from the rider\'s right side.',
    keyMeasurements: ['Knee extension at BDC', 'Saddle height indicator'],
  },
  {
    id: 'side_3oclock',
    name: '3 o\'clock — Side',
    view: 'side',
    instructions: 'Position pedal forward (3 o\'clock). Keep camera position from previous step.',
    keyMeasurements: ['Knee-over-pedal stack (KOPS)', 'Hip angle'],
  },
  {
    id: 'side_9oclock',
    name: '9 o\'clock — Side',
    view: 'side',
    instructions: 'Position pedal back (9 o\'clock). Keep camera position from previous step.',
    keyMeasurements: ['Hip extension', 'Back angle'],
  },
  {
    id: 'side_neutral',
    name: 'Neutral Seated — Side',
    view: 'side',
    instructions: 'Rider sits naturally on the bike, hands on hoods or bars. Keep camera position.',
    keyMeasurements: ['Torso angle', 'Reach', 'Elbow angle'],
  },
  {
    id: 'side_aero',
    name: 'Aero / Drop — Side (optional)',
    view: 'side',
    instructions: 'Rider in aero position or on the drops. Skip if not applicable.',
    keyMeasurements: ['Reach in aero', 'Elbow angle', 'Back angle'],
  },
  {
    id: 'rear_6oclock',
    name: '6 o\'clock — Rear',
    view: 'rear',
    instructions: 'Move camera to directly behind the rider. Pedal at 6 o\'clock.',
    keyMeasurements: ['Hip levelness', 'Knee alignment L vs R'],
  },
  {
    id: 'rear_neutral',
    name: 'Neutral Seated — Rear',
    view: 'rear',
    instructions: 'Rider sits naturally. Camera stays behind.',
    keyMeasurements: ['Saddle tilt effect', 'Overall symmetry'],
  },
  {
    id: 'front_6oclock',
    name: '6 o\'clock — Front',
    view: 'front',
    instructions: 'Move camera to directly in front of the rider. Pedal at 6 o\'clock.',
    keyMeasurements: ['Knee tracking L/R', 'Shoulder level'],
  },
  {
    id: 'front_neutral',
    name: 'Neutral Seated — Front',
    view: 'front',
    instructions: 'Rider sits naturally. Camera stays in front.',
    keyMeasurements: ['Frontal plane symmetry', 'Head position'],
  },
];

// ── Ride metric labels ─────────────────────────────────────────────────────

export const METRIC_LABELS: Record<string, string> = {
  // Sagittal
  kneeExtensionBDC:        'Knee Extension at BDC',
  kneeFlexionTDC:          'Knee Flexion at TDC',
  hipAngleTDC:             'Hip Angle at TDC',
  hipVerticalOscillation:  'Hip Vertical Oscillation',
  torsoAngle:              'Torso Angle',
  pelvicTilt:              'Pelvic Tilt',
  elbowAngle:              'Elbow Angle',
  wristAngle:              'Wrist Angle',
  ankleAnkling:            'Ankle Ankling Pattern',
  cadence:                 'Cadence',
  // Rear
  hipRock:                 'Hip Rock (Lateral Sway)',
  pelvicObliquity:         'Pelvic Obliquity',
  kneeVarusValgus:         'Knee Varus / Valgus',
  heelAlignment:           'Foot Rotation at BDC',
  // Front
  kneeSymmetry:            'Knee Symmetry L/R',
  elbowWidthSymmetry:      'Elbow Width Symmetry',
  shoulderLevel:           'Shoulder Level',
  lateralTrunkLean:        'Lateral Trunk Lean',
  headNeckPosition:        'Head / Neck Position',
};

export const SAGITTAL_METRICS = new Set([
  'kneeExtensionBDC', 'kneeFlexionTDC', 'hipAngleTDC', 'hipVerticalOscillation',
  'torsoAngle', 'pelvicTilt', 'elbowAngle', 'wristAngle', 'ankleAnkling', 'cadence',
]);

export const REAR_METRICS = new Set([
  'hipRock', 'pelvicObliquity', 'kneeVarusValgus', 'heelAlignment',
]);

export const FRONT_METRICS = new Set([
  'kneeSymmetry', 'elbowWidthSymmetry', 'shoulderLevel', 'lateralTrunkLean', 'headNeckPosition',
]);

export const APP_NAME = 'Bikealyzr';

export const MEDIAPIPE_CDN = `${import.meta.env.BASE_URL}wasm`;
export const HEAVY_MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_heavy.task`;

export const FPS_TARGET = 30;
export const FPS_SKIP_THRESHOLD = 20;
