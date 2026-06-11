import type { MetricStatus } from '@runalyzr/shared/types';

/** Inclusive [min, max] acceptance band for a fit measurement, in the
 * measurement's own unit. These are the shipped defaults; a future settings
 * feature will let fitters override them at runtime. */
export type Band = [number, number];

/** Green inside the band, amber outside, unknown when no band applies. */
export function bandStatus(value: number, band?: Band): MetricStatus {
  if (!band) return 'unknown';
  return value >= band[0] && value <= band[1] ? 'green' : 'amber';
}
