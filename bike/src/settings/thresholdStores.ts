import { rideThresholds } from '../analysis/thresholds';
import { fitThresholds } from '../analysis/fitThresholds';
import { geometryThresholds } from '../analysis/geometryThresholds';
import type { SettingsRow, SettingsSection } from '@runalyzr/shared/settings';
import { FIT_STEPS, METRIC_LABELS, SAGITTAL_METRICS, REAR_METRICS, FRONT_METRICS } from '../config/defaults';

// The stores themselves live next to their tables in analysis/ (evaluators read
// them; defining them here would create an import cycle). Re-exported here so
// UI/report code has one settings entry point.
export { rideThresholds, fitThresholds, geometryThresholds };

const SIDE_LABELS: Record<string, { lowLabel?: string; highLabel?: string }> = {
  kneeExtensionBDC: { lowLabel: 'too bent', highLabel: 'too straight' },
  hipAngleTDC:      { lowLabel: 'too closed' },
};

function rideRows(keys: ReadonlySet<string>): SettingsRow[] {
  return Object.entries(METRIC_LABELS)
    .filter(([key]) => keys.has(key))
    .map(([key, label]) => ({ key, label, ...SIDE_LABELS[key] }));
}

const ALL_POSITIONS = "6, 3 & 9 o'clock";
const REAR_AND_FRONT = 'rear & front, L and R';

const FIT_SIDE_ROWS: SettingsRow[] = [
  { key: 'torsoAngle',       label: 'Torso angle',        covers: ALL_POSITIONS },
  { key: 'elbowAngle',       label: 'Elbow angle',        covers: ALL_POSITIONS },
  { key: 'reachAngle',       label: 'Reach angle (side)', covers: ALL_POSITIONS },
  { key: 'shoulderAngle',    label: 'Shoulder angle',     covers: ALL_POSITIONS },
  { key: 'kneeExtensionBDC', label: 'Knee extension at BDC', lowLabel: 'too bent', highLabel: 'too straight' },
  { key: 'shankKops',        label: 'Shank angle (KOPS)' },
  { key: 'hipAngle3',        label: "Hip angle (3 o'clock)" },
  { key: 'hipExtension9',    label: "Hip extension (9 o'clock)" },
];

const FIT_AERO_ROWS: SettingsRow[] = [
  { key: 'elbowAngleAero', label: 'Elbow angle (aero)' },
  { key: 'reachAngleAero', label: 'Reach angle (aero)' },
];

const FIT_REAR_FRONT_ROWS: SettingsRow[] = [
  { key: 'pelvicObliquity',      label: 'Pelvic obliquity' },
  { key: 'kneeFrontalAlignment', label: 'Knee alignment', covers: REAR_AND_FRONT },
  { key: 'shoulderTilt',         label: 'Shoulder tilt' },
  { key: 'lateralTrunkLean',     label: 'Lateral trunk lean' },
];

const GEOMETRY_ROWS: SettingsRow[] = FIT_STEPS.flatMap((step) =>
  step.kind === 'bike'
    ? step.angles.map((a): SettingsRow => (
        a.reference !== 'ab_to_c' && a.signed
          ? { key: a.id, label: a.label, signed: true }
          : { key: a.id, label: a.label }
      ))
    : [],
);

export const BIKE_SETTINGS_SECTIONS: SettingsSection[] = [
  { title: 'Ride — side view',   store: rideThresholds,     rows: rideRows(SAGITTAL_METRICS) },
  { title: 'Ride — rear view',   store: rideThresholds,     rows: rideRows(REAR_METRICS) },
  { title: 'Ride — front view',  store: rideThresholds,     rows: rideRows(FRONT_METRICS) },
  { title: 'Fit — side view',    store: fitThresholds,      rows: FIT_SIDE_ROWS },
  { title: 'Fit — aero',         store: fitThresholds,      rows: FIT_AERO_ROWS },
  { title: 'Fit — rear & front', store: fitThresholds,      rows: FIT_REAR_FRONT_ROWS },
  { title: 'Bike geometry',      store: geometryThresholds, rows: GEOMETRY_ROWS },
];
