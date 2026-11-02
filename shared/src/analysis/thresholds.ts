import type { MetricStatus, MetricResult } from '../types/index';

export type MetricDirection = 'lower_is_worse' | 'higher_is_worse';

interface ThresholdBase {
  green: [number, number];
  /** One-sided: the band on the risky side. Two-sided: the band *below* green. */
  amber: [number, number];
  unit: string;
  /** Shown as a value only — never banded green/amber/red. */
  indicativeOnly?: boolean;
  /** Starting green for "Add band" on information-only entries. */
  suggestedGreen?: [number, number];
}

/** Only one side of green is a fault; beyond amber on the safe side is green. */
export interface OneSidedThreshold extends ThresholdBase {
  direction: MetricDirection;
}

/** Both sides of green are faults (e.g. a saddle can be too low *or* too high). */
export interface TwoSidedThreshold extends ThresholdBase {
  direction: 'two_sided';
  /** The band *above* green; values beyond it are red. */
  amberHigh: [number, number];
}

export type ThresholdEntry = OneSidedThreshold | TwoSidedThreshold;

/**
 * Single threshold engine for both apps (tables stay app-local).
 *
 * Green is checked first, so **green wins at the boundary** — amber bands
 * that touch green are effectively half-open. One-sided entries: values
 * beyond amber on the "safe" side of `direction` are green; beyond amber on
 * the risky side, red. Two-sided entries flag both sides of green.
 */
export function evaluateThreshold(value: number, t: ThresholdEntry | undefined): MetricStatus {
  if (!t || t.indicativeOnly) return 'unknown';
  if (value >= t.green[0] && value <= t.green[1]) return 'green';
  if (t.direction === 'two_sided') {
    if (value > t.green[1]) return value <= t.amberHigh[1] ? 'amber' : 'red';
    return value >= t.amber[0] ? 'amber' : 'red';
  }
  if (value >= t.amber[0] && value <= t.amber[1]) return 'amber';
  if (t.direction === 'higher_is_worse' && value < t.green[0]) return 'green';
  if (t.direction === 'lower_is_worse'  && value > t.green[1]) return 'green';
  return 'red';
}

export function thresholdMetricResult(value: number, t: ThresholdEntry | undefined): MetricResult {
  const status = evaluateThreshold(value, t);
  const result: MetricResult = { value, status, unit: t?.unit ?? '' };
  // Two-sided metrics need side-specific advice ("raise" vs "lower" the saddle).
  if (t?.direction === 'two_sided' && (status === 'amber' || status === 'red')) {
    result.side = value > t.green[1] ? 'high' : 'low';
  }
  return result;
}
