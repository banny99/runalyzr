import { METRIC_LABELS } from '../config/defaults';
import { THRESHOLDS, rideThresholds } from './thresholds';
import type { SagittalMetrics, RearMetrics, FrontMetrics } from './types';
import { findingsFromTemplates, outOfRangeText } from '@runalyzr/shared/analysis';
import type { MetricResult } from '@runalyzr/shared/types';
import type { FindingTemplate, TemplatedFinding } from '@runalyzr/shared/analysis';

type Finding = TemplatedFinding;

const TEMPLATES: Partial<Record<string, FindingTemplate>> = {
  kneeExtensionBDC: {
    red:   'Knee extension at BDC is {value}° — the knee stays too bent at the bottom of the stroke. The saddle is likely too low: raise the saddle, or check cleat position.',
    amber: 'Knee extension at BDC is {value}° — slightly too bent at the bottom of the stroke. A small saddle raise may help.',
    high: {
      red:   'Knee extension at BDC is {value}° — the leg is nearly straight at the bottom of the stroke. The saddle is likely too high: lower the saddle, and watch for hip rocking or toes reaching down.',
      amber: 'Knee extension at BDC is {value}° — slightly over-extended at the bottom of the stroke. A small saddle drop may help.',
    },
  },
  kneeFlexionTDC: {
    red:   'Knee flexion at TDC is only {value}° — the knee is unusually open at the top of the stroke. Check that the saddle is not too high (compare with knee extension at BDC).',
    amber: 'Knee flexion at TDC is {value}° — slightly open at the top of the stroke.',
    high: {
      red:   'Knee flexion at TDC is {value}° — very compressed at the top of the stroke. The saddle may be too low (raise it, checking knee extension at BDC) or the cranks too long.',
      amber: 'Knee flexion at TDC is {value}° — slightly tight at the top of the stroke.',
    },
  },
  hipAngleTDC: {
    red:   'Hip angle at TDC is {value}° — the hip closes too tightly at the top of the stroke. Raise the handlebars or shorten the reach, and check the saddle is not too low.',
    amber: 'Hip angle at TDC is {value}° — hip is slightly restricted at top of stroke.',
  },
  hipVerticalOscillation: {
    red:   'Hip vertical oscillation of {value}% of frame height is excessive, indicating significant saddle height issues or poor technique.',
    amber: 'Hip vertical oscillation of {value}% of frame height is slightly elevated.',
  },
  torsoAngle: {
    red:   'Torso angle of {value}° is outside optimal range. Review handlebar height and stem length.',
    amber: 'Torso angle of {value}° is slightly outside optimal range.',
  },
  elbowAngle: {
    red:   'Elbow angle of {value}° is very bent — the cockpit may be too short or low. Review stem length and handlebar position.',
    amber: 'Elbow angle of {value}° is slightly more bent than optimal.',
    high: {
      red:   'Elbow angle of {value}° — arms are nearly locked. Reach is likely too long: consider a shorter stem or higher bars, and keep a slight bend in the elbows.',
      amber: 'Elbow angle of {value}° — arms are close to straight. Keep a slight bend in the elbows.',
    },
  },
  wristAngle: {
    red:   'Wrist deviation of {value}° is significant — review handlebar width and brake lever position.',
    amber: 'Mild wrist deviation of {value}° detected.',
  },
  cadence: {
    red:   'Cadence of {value} rpm is below optimal range. Low cadence increases joint stress and fatigue.',
    amber: 'Cadence of {value} rpm is slightly low.',
  },
  hipRock: {
    red:   'Hip rock of {value}% of frame width per stroke is excessive. Check saddle height, saddle tilt, and cleat float.',
    amber: 'Hip rock of {value}% of frame width per stroke is slightly elevated.',
  },
  pelvicObliquity: {
    red:   'Pelvic obliquity of {value}° indicates significant L/R asymmetry. Check leg length discrepancy and cleat position.',
    amber: 'Mild pelvic obliquity of {value}° detected.',
  },
  kneeVarusValgus: {
    red:   'Knee varus/valgus deviation of {value}° at BDC is significant. Review cleat alignment and q-factor.',
    amber: 'Mild knee varus/valgus deviation of {value}° detected.',
  },
  kneeSymmetry: {
    red:   'Knee tracking asymmetry of {value}° L vs R — check cleat position and saddle tilt.',
    amber: 'Mild knee tracking asymmetry of {value}° detected.',
  },
  shoulderLevel: {
    red:   'Shoulder tilt of {value}° indicates lateral asymmetry — check saddle tilt and cleat wedges.',
    amber: 'Mild shoulder tilt of {value}° detected.',
  },
  lateralTrunkLean: {
    red:   'Lateral trunk lean of {value}° is excessive — may indicate leg length discrepancy or hip weakness.',
    amber: 'Mild lateral trunk lean of {value}° detected.',
  },
};

// Generic text only for metrics that are information-only *by default* and
// have since been given a band by the fitter. Banded-but-template-less metrics
// (pelvicTilt, ankleAnkling, ...) stay silent, as before.
function fallback(key: string, result: MetricResult): string | undefined {
  if (!THRESHOLDS[key]?.indicativeOnly) return undefined;
  const entry = rideThresholds.entry(key);
  if (!entry || entry.indicativeOnly) return undefined;
  return outOfRangeText(METRIC_LABELS[key] ?? key, result, entry);
}

// The template-substitution/sorting engine lives in @runalyzr/shared/analysis
// (red-first sort included — previously copy-pasted across three wrappers);
// only the template table above is app-specific.
export function generateSagittalFindings(metrics: SagittalMetrics): Finding[] {
  return findingsFromTemplates(metrics, TEMPLATES, fallback);
}

export function generateRearFindings(metrics: RearMetrics): Finding[] {
  return findingsFromTemplates(metrics, TEMPLATES, fallback);
}

export function generateFrontFindings(metrics: FrontMetrics): Finding[] {
  return findingsFromTemplates(metrics, TEMPLATES, fallback);
}

export type { Finding };
