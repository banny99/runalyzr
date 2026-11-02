import type { Band, ThresholdEntry } from '../analysis/index';

export type BandField = 'lowRedAt' | 'green0' | 'green1' | 'highRedAt';

const FIELD_ORDER: readonly BandField[] = ['lowRedAt', 'green0', 'green1', 'highRedAt'];

/** Fields the user can edit for an entry, ordered low to high on the number line. */
export function editableFields(t: ThresholdEntry): BandField[] {
  if (t.indicativeOnly) return [];
  switch (t.direction) {
    case 'two_sided': return ['lowRedAt', 'green0', 'green1', 'highRedAt'];
    case 'lower_is_worse': return ['lowRedAt', 'green0', 'green1'];
    case 'higher_is_worse': return ['green0', 'green1', 'highRedAt'];
  }
}

const NUMERIC = /^-?(\d+\.?\d*|\.\d+)$/;

/** Parse a boundary text input. Half-typed text is 'incomplete' so callers keep it as-is. */
export function parseBoundaryInput(text: string, field: BandField): number | null | 'incomplete' {
  const s = text.trim().replace(',', '.');
  if (s === '') return field === 'lowRedAt' || field === 'highRedAt' ? null : 'incomplete';
  if (!NUMERIC.test(s)) return 'incomplete';
  return Number(s);
}

export function applyField(band: Band, field: BandField, value: number | null): Band {
  const next: Band = { green: [band.green[0], band.green[1]], lowRedAt: band.lowRedAt, highRedAt: band.highRedAt };
  switch (field) {
    case 'lowRedAt': next.lowRedAt = value; break;
    case 'highRedAt': next.highRedAt = value; break;
    case 'green0': if (value !== null) next.green[0] = value; break;
    case 'green1': if (value !== null) next.green[1] = value; break;
  }
  return next;
}

export function fieldValue(band: Band, field: BandField): number | null {
  switch (field) {
    case 'lowRedAt': return band.lowRedAt;
    case 'green0': return band.green[0];
    case 'green1': return band.green[1];
    case 'highRedAt': return band.highRedAt;
  }
}

/** Visible span of the bar: all finite boundaries, padded; floored at 0 unless the metric is signed. */
export function barRange(band: Band, signed: boolean): [number, number] {
  const values = [band.green[0], band.green[1]];
  if (band.lowRedAt !== null) values.push(band.lowRedAt);
  if (band.highRedAt !== null) values.push(band.highRedAt);
  let lo = values[0], hi = values[0];
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const pad = Math.max(5, 0.5 * (hi - lo));
  lo -= pad;
  hi += pad;
  if (!signed && lo < 0) lo = 0;
  return [lo, hi];
}

export function toPercent(value: number, range: [number, number]): number {
  const span = range[1] - range[0];
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((value - range[0]) / span) * 100));
}

export function fromPercent(pct: number, range: [number, number], step = 0.5): number {
  const raw = range[0] + (pct / 100) * (range[1] - range[0]);
  return Math.round(raw / step) * step;
}

/** Keep a dragged boundary between its adjacent fields; a null neighbour imposes no limit. */
export function clampForDrag(band: Band, field: BandField, value: number): number {
  const i = FIELD_ORDER.indexOf(field);
  const below = i > 0 ? fieldValue(band, FIELD_ORDER[i - 1]) : null;
  const above = i < FIELD_ORDER.length - 1 ? fieldValue(band, FIELD_ORDER[i + 1]) : null;
  let v = value;
  if (below !== null && v < below) v = below;
  if (above !== null && v > above) v = above;
  return v;
}

export function flipSign(text: string): string {
  return text.startsWith('-') ? text.slice(1) : '-' + text;
}
