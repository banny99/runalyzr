import type { MetricStatus, MetricResult } from '@runalyzr/shared/types';
import { evaluateThreshold, thresholdMetricResult } from '@runalyzr/shared/analysis';
import type { ThresholdEntry } from '@runalyzr/shared/analysis';
import type { SagittalMetrics, RearMetrics, FrontMetrics } from './types';

type AllMetricKeys = keyof SagittalMetrics | keyof RearMetrics | keyof FrontMetrics;

// The evaluation engine (green wins at the boundary, indicativeOnly support)
// lives in @runalyzr/shared/analysis — only the table is app-specific.
export const THRESHOLDS: Partial<Record<AllMetricKeys, ThresholdEntry>> = {
  // Sagittal
  kneeExtensionBDC:       { green: [145, 155], amber: [135, 145], unit: '°',     direction: 'lower_is_worse' },
  kneeFlexionTDC:         { green: [100, 120], amber: [85,  100], unit: '°',     direction: 'lower_is_worse' },
  hipAngleTDC:            { green: [60,  90],  amber: [45,  60],  unit: '°',     direction: 'lower_is_worse' },
  hipVerticalOscillation: { green: [0,   1.5], amber: [1.5, 3],   unit: '% frame', direction: 'higher_is_worse' },
  torsoAngle:             { green: [35,  50],  amber: [25,  35],  unit: '°',     direction: 'lower_is_worse' },
  pelvicTilt:             { green: [0,   3],   amber: [3,   6],   unit: ' cm',   direction: 'higher_is_worse' },
  elbowAngle:             { green: [90,  160], amber: [70,  90],  unit: '°',     direction: 'lower_is_worse' },
  shoulderAngle:          { green: [0, 999],   amber: [0,   0],   unit: '°',     direction: 'higher_is_worse', indicativeOnly: true },
  reachAngle:             { green: [0, 999],   amber: [0,   0],   unit: '°',     direction: 'higher_is_worse', indicativeOnly: true },
  wristAngle:             { green: [0,   10],  amber: [10,  20],  unit: '°',     direction: 'higher_is_worse' },
  ankleAnkling:           { green: [3,   10],  amber: [1,   3],   unit: ' cm',   direction: 'lower_is_worse' },
  cadence:                { green: [80,  100], amber: [70,  80],  unit: ' rpm',  direction: 'lower_is_worse' },
  // Rear
  hipRock:                { green: [0,   2],   amber: [2,   4],   unit: '% frame', direction: 'higher_is_worse' },
  pelvicObliquity:        { green: [0,   2],   amber: [2,   4],   unit: '°',     direction: 'higher_is_worse' },
  kneeVarusValgus:        { green: [0,   5],   amber: [5,   10],  unit: '°',     direction: 'higher_is_worse' },
  heelAlignment:          { green: [0,   10],  amber: [10,  20],  unit: '°',     direction: 'higher_is_worse' },
  // Front
  kneeSymmetry:           { green: [0,   3],   amber: [3,   6],   unit: '°',     direction: 'higher_is_worse' },
  elbowWidthSymmetry:     { green: [0,   3],   amber: [3,   6],   unit: '°',     direction: 'higher_is_worse' },
  shoulderLevel:          { green: [0,   2],   amber: [2,   4],   unit: '°',     direction: 'higher_is_worse' },
  lateralTrunkLean:       { green: [0,   2],   amber: [2,   4],   unit: '°',     direction: 'higher_is_worse' },
  headNeckPosition:       { green: [0, 999],   amber: [0,   0],   unit: ' cm',   direction: 'higher_is_worse', indicativeOnly: true },
};

export function evaluateMetric(value: number, key: AllMetricKeys): MetricStatus {
  return evaluateThreshold(value, THRESHOLDS[key]);
}

export function makeMetricResult(value: number, key: AllMetricKeys): MetricResult {
  return thresholdMetricResult(value, THRESHOLDS[key]);
}
