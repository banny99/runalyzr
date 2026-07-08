import type { MetricStatus, MetricResult, AnalysisResults } from './types';
import { evaluateThreshold, thresholdMetricResult } from '@runalyzr/shared/analysis';
import type { ThresholdEntry } from '@runalyzr/shared/analysis';

// The evaluation engine (green wins at the boundary, half-open amber bands)
// lives in @runalyzr/shared/analysis — only the table is app-specific.
export const THRESHOLDS: Record<keyof AnalysisResults, ThresholdEntry> = {
  kneeFlexionAtContact:  { green: [155, 170], amber: [145, 155], unit: '°',    direction: 'lower_is_worse' },
  cadence:               { green: [170, 195], amber: [160, 170], unit: ' spm', direction: 'lower_is_worse' },
  pelvicDrop:            { green: [0, 5],     amber: [5, 7],     unit: '°',    direction: 'higher_is_worse' },
  trunkLateralLean:      { green: [0, 5],     amber: [5, 8],     unit: '°',    direction: 'higher_is_worse' },
  hipAdduction:          { green: [0, 10],    amber: [10, 15],   unit: '°',    direction: 'higher_is_worse' },
  ankleDorsiflexion:     { green: [8, 20],    amber: [4, 8],     unit: '°',    direction: 'lower_is_worse' },
  // % of frame height, not cm — image landmarks are framing-dependent and
  // honest cm would need a calibration reference (same reasoning as bike's
  // hipVerticalOscillation). Bands are provisional: derived from typical
  // 6–10 cm oscillation at a full-body framing (~1 cm ≈ 0.4 % frame);
  // recalibrate against real sessions.
  verticalOscillation:   { green: [0, 4],     amber: [4, 6],     unit: '% frame', direction: 'higher_is_worse' },
  overstriding:          { green: [0, 8],     amber: [8, 15],    unit: ' cm',  direction: 'higher_is_worse' },
  strideSymmetry:        { green: [0, 5],     amber: [5, 10],    unit: '%',    direction: 'higher_is_worse' },
  groundContactTime:     { green: [200, 260], amber: [260, 300], unit: ' ms',  direction: 'higher_is_worse' },
};

export function evaluateMetric(
  value: number,
  key: keyof typeof THRESHOLDS,
): MetricStatus {
  return evaluateThreshold(value, THRESHOLDS[key]);
}

export function makeMetricResult(
  value: number,
  key: keyof typeof THRESHOLDS,
): MetricResult {
  return thresholdMetricResult(value, THRESHOLDS[key]);
}
