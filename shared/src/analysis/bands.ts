import type { MetricResult } from '../types/index';
import { thresholdMetricResult } from './thresholds';
import type { ThresholdEntry, TwoSidedThreshold } from './thresholds';

/**
 * Editable view of a threshold entry. `lowRedAt`: values below it are red
 * (null = amber forever below). `highRedAt`: values above it are red
 * (null = amber forever above). Fields irrelevant to the entry's direction
 * are always null.
 */
export interface Band {
  green: [number, number];
  lowRedAt: number | null;
  highRedAt: number | null;
}

const finiteOrNull = (n: number): number | null => (Number.isFinite(n) ? n : null);

export const copyBand = (b: Band): Band => ({ green: [b.green[0], b.green[1]], lowRedAt: b.lowRedAt, highRedAt: b.highRedAt });

export function sameBand(a: Band | null, b: Band | null): boolean {
  if (!a || !b) return a === b;
  return a.green[0] === b.green[0] && a.green[1] === b.green[1]
    && a.lowRedAt === b.lowRedAt && a.highRedAt === b.highRedAt;
}

/** Green band with amber on both sides running forever — never red. */
export function greenOnly(green: [number, number], unit: string): TwoSidedThreshold {
  return {
    green,
    amber: [-Infinity, green[0]],
    amberHigh: [green[1], Infinity],
    unit,
    direction: 'two_sided',
  };
}

/** Information-only entry: shown as a value, never banded. */
export function noBand(unit: string, suggestedGreen?: [number, number]): ThresholdEntry {
  const t: ThresholdEntry = {
    green: [0, 0], amber: [0, 0], unit, direction: 'higher_is_worse', indicativeOnly: true,
  };
  if (suggestedGreen) t.suggestedGreen = suggestedGreen;
  return t;
}

export function bandFromEntry(t: ThresholdEntry): Band | null {
  if (t.indicativeOnly) return null;
  const green: [number, number] = [t.green[0], t.green[1]];
  switch (t.direction) {
    case 'two_sided':
      return { green, lowRedAt: finiteOrNull(t.amber[0]), highRedAt: finiteOrNull(t.amberHigh[1]) };
    case 'lower_is_worse':
      return { green, lowRedAt: finiteOrNull(t.amber[0]), highRedAt: null };
    case 'higher_is_worse':
      return { green, lowRedAt: null, highRedAt: finiteOrNull(t.amber[1]) };
  }
}

export function entryWithBand(t: ThresholdEntry, band: Band | null): ThresholdEntry {
  if (!band) return noBand(t.unit, t.suggestedGreen);
  const { lowRedAt, highRedAt } = band;
  const green: [number, number] = [band.green[0], band.green[1]];
  const low = lowRedAt ?? -Infinity;
  const high = highRedAt ?? Infinity;
  const extra = t.suggestedGreen ? { suggestedGreen: t.suggestedGreen } : {};
  if (t.indicativeOnly || t.direction === 'two_sided') {
    return { green, amber: [low, green[0]], amberHigh: [green[1], high], unit: t.unit, direction: 'two_sided', ...extra };
  }
  if (t.direction === 'lower_is_worse') {
    return { green, amber: [low, green[0]], unit: t.unit, direction: 'lower_is_worse', ...extra };
  }
  return { green, amber: [green[1], high], unit: t.unit, direction: 'higher_is_worse', ...extra };
}

/** Returns an error message, or null when the band is valid. */
export function validateBand(t: ThresholdEntry, band: Band): string | null {
  const { green, lowRedAt, highRedAt } = band;
  const { direction } = entryWithBand(t, band);
  const useLow = direction !== 'higher_is_worse';
  const useHigh = direction !== 'lower_is_worse';
  const bad = (n: number | null) => n !== null && !Number.isFinite(n);
  if (!Number.isFinite(green[0]) || !Number.isFinite(green[1])
    || (useLow && bad(lowRedAt)) || (useHigh && bad(highRedAt))) return 'Enter a number.';
  if (green[0] >= green[1]) return 'Green start must be below green end.';
  if (useLow && lowRedAt !== null && lowRedAt > green[0]) {
    return `Amber must start below green (${lowRedAt} is above the green start of ${green[0]}).`;
  }
  if (useHigh && highRedAt !== null && highRedAt < green[1]) {
    return `Amber must end above green (${highRedAt} is below the green end of ${green[1]}).`;
  }
  return null;
}

export function formatGreenRange(t: ThresholdEntry | undefined): string | undefined {
  if (!t || t.indicativeOnly) return undefined;
  const [g0, g1] = t.green;
  return g0 === -g1 ? `±${g1}${t.unit}` : `${g0}–${g1}${t.unit}`;
}

/** Re-evaluates each non-null metric in place against the entry returned for its key. */
export function rescoreMetrics<K extends string>(
  metrics: Partial<Record<K, MetricResult | null>>,
  entryFor: (key: K) => ThresholdEntry | undefined,
): void {
  for (const [key, result] of Object.entries(metrics) as [K, MetricResult | null][]) {
    if (!result) continue;
    const next = thresholdMetricResult(result.value, entryFor(key));
    result.status = next.status;
    if (next.side) result.side = next.side;
    else delete result.side;
  }
}

export function outOfRangeText(label: string, result: MetricResult, t: ThresholdEntry | undefined): string {
  return `${label} of ${result.value.toFixed(1)}${result.unit} is outside your set range of ${formatGreenRange(t)}.`;
}
