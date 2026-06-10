import type { SagittalMetrics, RearMetrics, FrontMetrics } from './types';
import type { MetricResult } from '@runalyzr/shared/types';

interface Finding {
  metric: string;
  status: 'amber' | 'red';
  text: string;
}

type FindingTemplate = { red: string; amber: string };

const TEMPLATES: Partial<Record<string, FindingTemplate>> = {
  kneeExtensionBDC: {
    red:   'Knee extension at BDC is {value}° — significantly beyond normal range. Raise the saddle to allow more extension, or check cleat position.',
    amber: 'Knee extension at BDC is {value}° — slightly outside normal range. Minor saddle height adjustment may help.',
  },
  kneeFlexionTDC: {
    red:   'Knee flexion at TDC is {value}° — very compressed at top of stroke. Lower the saddle or adjust fore/aft position.',
    amber: 'Knee flexion at TDC is {value}° — slightly tight at top of stroke.',
  },
  hipAngleTDC: {
    red:   'Hip angle at TDC is {value}° — hip is closing too tightly. Lower the saddle or increase saddle setback.',
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
    red:   'Elbow angle of {value}° suggests reach issues. Review stem length and handlebar position.',
    amber: 'Elbow angle of {value}° is slightly outside optimal range.',
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

function findingsFromMetricGroup<T extends Record<string, MetricResult | null>>(
  metrics: T,
): Finding[] {
  const findings: Finding[] = [];
  for (const [key, result] of Object.entries(metrics) as [string, MetricResult | null][]) {
    if (!result || result.status === 'green' || result.status === 'unknown') continue;
    const template = TEMPLATES[key];
    if (!template) continue;
    findings.push({
      metric: key,
      status: result.status as 'amber' | 'red',
      text: template[result.status as 'red' | 'amber'].replace('{value}', result.value.toFixed(1)),
    });
  }
  return findings;
}

export function generateSagittalFindings(metrics: SagittalMetrics): Finding[] {
  return findingsFromMetricGroup(metrics).sort((a, b) =>
    (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));
}

export function generateRearFindings(metrics: RearMetrics): Finding[] {
  return findingsFromMetricGroup(metrics).sort((a, b) =>
    (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));
}

export function generateFrontFindings(metrics: FrontMetrics): Finding[] {
  return findingsFromMetricGroup(metrics).sort((a, b) =>
    (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));
}

export type { Finding };
