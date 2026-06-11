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

// ── Fit step types ─────────────────────────────────────────────────────────

export type FitView = 'side' | 'rear' | 'front';

export interface BikePoint {
  id: string;
  label: string;
}

export type AngleDefinition =
  | { id: string; label: string; pointA: string; pointB: string; pointC?: never; reference: 'horizontal' | 'vertical'; signed?: true; normalRange: string; green?: [number, number] }
  | { id: string; label: string; pointA: string; pointB: string; pointC: string; reference: 'ab_to_c'; normalRange: string; green?: [number, number] };

export interface RiderStep {
  kind: 'rider';
  id: string;
  name: string;
  view: FitView;
  instructions: string;
  keyMeasurements: string[];
}

export interface BikeGeometryStep {
  kind: 'bike';
  id: string;
  name: string;
  view: FitView;
  instructions: string;
  points: BikePoint[];
  angles: AngleDefinition[];
}

export type FitStep = RiderStep | BikeGeometryStep;

export const FIT_STEPS: FitStep[] = [
  // ── Bike geometry (no rider) ─────────────────────────────────────────────
  {
    kind: 'bike',
    id: 'bike_side',
    name: 'Full Bike Side View',
    view: 'side',
    instructions: 'Place the bike on a trainer or lean it against a wall. Stand 3–5 m away at hub height, pure side-on. The full bike should be visible.',
    points: [
      { id: 'bb_centre',        label: 'Bottom bracket centre' },
      { id: 'seat_tube_top',    label: 'Seat tube top (saddle clamp)' },
      { id: 'head_tube_top',    label: 'Head tube top (stem clamp)' },
      { id: 'head_tube_bottom', label: 'Head tube bottom (fork crown)' },
      { id: 'handlebar_centre', label: 'Handlebar centre' },
      { id: 'saddle_nose',      label: 'Saddle nose' },
      { id: 'saddle_centre',    label: 'Saddle centre' },
    ],
    angles: [
      { id: 'seat_tube_angle', label: 'Seat Tube Angle',          pointA: 'bb_centre',        pointB: 'seat_tube_top',    reference: 'horizontal', normalRange: '72–74°', green: [72, 74] },
      { id: 'head_tube_angle', label: 'Head Tube Angle',          pointA: 'head_tube_bottom', pointB: 'head_tube_top',    reference: 'horizontal', normalRange: '71–74°', green: [71, 74] },
      { id: 'saddle_tilt',     label: 'Saddle Tilt',              pointA: 'saddle_nose',      pointB: 'saddle_centre',    reference: 'horizontal', signed: true, normalRange: '±2°', green: [-2, 2] },
      // signed: positive = bars below the saddle (drop), negative = bars above (rise).
      // No green band — acceptable drop depends entirely on the rider/discipline.
      { id: 'bar_drop_angle',  label: 'Bar-to-Saddle Drop Angle', pointA: 'saddle_centre',    pointB: 'handlebar_centre', reference: 'horizontal', signed: true, normalRange: 'Context-dependent' },
    ],
  },
  {
    kind: 'bike',
    id: 'bike_rear',
    name: 'Bike Rear View',
    view: 'rear',
    instructions: 'Move camera to directly behind the bike. Keep the bike upright and centred in frame.',
    points: [
      { id: 'saddle_left',  label: 'Saddle left rail end' },
      { id: 'saddle_right', label: 'Saddle right rail end' },
      { id: 'bar_left',     label: 'Handlebar left end' },
      { id: 'bar_right',    label: 'Handlebar right end' },
    ],
    angles: [
      { id: 'saddle_level', label: 'Saddle Level', pointA: 'saddle_left', pointB: 'saddle_right', reference: 'horizontal', normalRange: '< 2°', green: [0, 2] },
      { id: 'bar_level',    label: 'Bar Level',    pointA: 'bar_left',    pointB: 'bar_right',    reference: 'horizontal', normalRange: '< 2°', green: [0, 2] },
    ],
  },
  // ── Rider on bike ────────────────────────────────────────────────────────────
  { kind: 'rider', id: 'side_6oclock',  name: '6 o\'clock — Side',           view: 'side',  instructions: 'Position pedal straight down (6 o\'clock). Stand camera at hip height, 3–5m away, from the rider\'s right side.', keyMeasurements: ['Knee extension at BDC', 'Saddle height indicator'] },
  { kind: 'rider', id: 'side_3oclock',  name: '3 o\'clock — Side',           view: 'side',  instructions: 'Position pedal forward (3 o\'clock). Keep camera position from previous step.',  keyMeasurements: ['Knee-over-pedal stack (KOPS)', 'Hip angle'] },
  { kind: 'rider', id: 'side_9oclock',  name: '9 o\'clock — Side',           view: 'side',  instructions: 'Position pedal back (9 o\'clock). Keep camera position from previous step.',     keyMeasurements: ['Hip extension', 'Back angle'] },
  { kind: 'rider', id: 'side_neutral',  name: 'Neutral Seated — Side',       view: 'side',  instructions: 'Rider sits naturally on the bike, hands on hoods or bars. Keep camera position.', keyMeasurements: ['Torso angle', 'Reach', 'Elbow angle'] },
  { kind: 'rider', id: 'side_aero',     name: 'Aero / Drop — Side (optional)', view: 'side', instructions: 'Rider in aero position or on the drops. Skip if not applicable.',                keyMeasurements: ['Reach in aero', 'Elbow angle', 'Back angle'] },
  { kind: 'rider', id: 'rear_6oclock',  name: '6 o\'clock — Rear',           view: 'rear',  instructions: 'Move camera to directly behind the rider. Pedal at 6 o\'clock.',                  keyMeasurements: ['Hip levelness', 'Knee alignment L vs R'] },
  { kind: 'rider', id: 'rear_neutral',  name: 'Neutral Seated — Rear',       view: 'rear',  instructions: 'Rider sits naturally. Camera stays behind.',                                     keyMeasurements: ['Saddle tilt effect', 'Overall symmetry'] },
  { kind: 'rider', id: 'front_6oclock', name: '6 o\'clock — Front',          view: 'front', instructions: 'Move camera to directly in front of the rider. Pedal at 6 o\'clock.',             keyMeasurements: ['Knee tracking L/R', 'Shoulder level'] },
  { kind: 'rider', id: 'front_neutral', name: 'Neutral Seated — Front',      view: 'front', instructions: 'Rider sits naturally. Camera stays in front.',                                    keyMeasurements: ['Frontal plane symmetry', 'Head position'] },
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
