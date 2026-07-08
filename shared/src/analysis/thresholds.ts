import type { MetricStatus, MetricResult } from '../types/index';

export type MetricDirection = 'lower_is_worse' | 'higher_is_worse';

export interface ThresholdEntry {
  green: [number, number];
  amber: [number, number];
  unit: string;
  direction: MetricDirection;
  /** Shown as a value only — never banded green/amber/red. */
  indicativeOnly?: boolean;
}

/**
 * Single threshold engine for both apps (tables stay app-local).
 *
 * Green is checked first, so **green wins at the boundary** — amber bands
 * that touch green are effectively half-open. Values beyond amber on the
 * "safe" side of `direction` are green; beyond amber on the risky side, red.
 */
export function evaluateThreshold(value: number, t: ThresholdEntry | undefined): MetricStatus {
  if (!t || t.indicativeOnly) return 'unknown';
  if (value >= t.green[0] && value <= t.green[1]) return 'green';
  if (value >= t.amber[0] && value <= t.amber[1]) return 'amber';
  if (t.direction === 'higher_is_worse' && value < t.green[0]) return 'green';
  if (t.direction === 'lower_is_worse'  && value > t.green[1]) return 'green';
  return 'red';
}

export function thresholdMetricResult(value: number, t: ThresholdEntry | undefined): MetricResult {
  return { value, status: evaluateThreshold(value, t), unit: t?.unit ?? '' };
}
