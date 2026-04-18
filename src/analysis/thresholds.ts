import type { MetricStatus, MetricResult, AnalysisResults } from './types';

interface ThresholdEntry {
  green: [number, number];
  amber: [number, number];
  unit: string;
  direction: 'lower_is_worse' | 'higher_is_worse';
}

export const THRESHOLDS: Record<keyof AnalysisResults, ThresholdEntry> = {
  kneeFlexionAtContact:  { green: [155, 170], amber: [145, 155], unit: '°',    direction: 'lower_is_worse' },
  cadence:               { green: [170, 195], amber: [160, 170], unit: ' spm', direction: 'lower_is_worse' },
  pelvicDrop:            { green: [0, 5],     amber: [5, 7],     unit: '°',    direction: 'higher_is_worse' },
  trunkLateralLean:      { green: [0, 5],     amber: [5, 8],     unit: '°',    direction: 'higher_is_worse' },
  hipAdduction:          { green: [0, 10],    amber: [10, 15],   unit: '°',    direction: 'higher_is_worse' },
  ankleDorsiflexion:     { green: [8, 20],    amber: [4, 8],     unit: '°',    direction: 'lower_is_worse' },
  verticalOscillation:   { green: [6, 10],    amber: [10, 13],   unit: ' cm',  direction: 'higher_is_worse' },
  overstriding:          { green: [0, 8],     amber: [8, 15],    unit: ' cm',  direction: 'higher_is_worse' },
  strideSymmetry:        { green: [0, 5],     amber: [5, 10],    unit: '%',    direction: 'higher_is_worse' },
  groundContactTime:     { green: [200, 260], amber: [260, 300], unit: ' ms',  direction: 'higher_is_worse' },
};

export function evaluateMetric(
  value: number,
  key: keyof typeof THRESHOLDS,
): MetricStatus {
  const t = THRESHOLDS[key];
  if (!t) return 'unknown';

  if (value >= t.green[0] && value <= t.green[1]) return 'green';
  if (value >= t.amber[0] && value <= t.amber[1]) return 'amber';

  // Values better than the optimal bound are still green
  if (t.direction === 'higher_is_worse' && value < t.green[0]) return 'green';
  if (t.direction === 'lower_is_worse' && value > t.green[1]) return 'green';

  return 'red';
}

export function makeMetricResult(
  value: number,
  key: keyof typeof THRESHOLDS,
): MetricResult {
  return {
    value,
    status: evaluateMetric(value, key),
    unit: THRESHOLDS[key].unit,
  };
}
