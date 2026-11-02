import { evaluateThreshold, formatGreenRange } from '@runalyzr/shared/analysis';
import { fitThresholds } from './fitThresholds';
import { geometryThresholds } from './geometryThresholds';
import type { FitSessionResults } from './types';

/**
 * Re-derives status and normal-range text in place from the active bands — Fit
 * bands for the rider positions, geometry bands for the bike photos — so a band
 * edit applies to results that were already measured.
 */
export function rescoreFitResults(results: FitSessionResults): void {
  for (const position of results.positions) {
    for (const m of position.measurements) {
      const entry = fitThresholds.entry(m.id);
      m.status = evaluateThreshold(m.value, entry);
      m.normalRange = formatGreenRange(entry) ?? '—';
    }
  }
  for (const geometry of results.bikeGeometry) {
    for (const a of geometry.angles) {
      const entry = geometryThresholds.entry(a.id);
      a.status = evaluateThreshold(a.value, entry);
      a.normalRange = formatGreenRange(entry) ?? '—';
    }
  }
}
