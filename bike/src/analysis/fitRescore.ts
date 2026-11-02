import { evaluateThreshold, formatGreenRange } from '@runalyzr/shared/analysis';
import { fitThresholds } from './fitThresholds';
import type { FitSessionResults } from './types';

/**
 * Re-derives status and normal-range text from the active Fit bands, in place,
 * so a band edit applies to results that were already measured.
 */
export function rescoreFitResults(results: FitSessionResults): void {
  for (const position of results.positions) {
    for (const m of position.measurements) {
      const entry = fitThresholds.entry(m.id);
      m.status = evaluateThreshold(m.value, entry);
      m.normalRange = formatGreenRange(entry) ?? '—';
    }
  }
}
