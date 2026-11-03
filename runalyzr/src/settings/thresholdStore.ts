import type { SettingsSection } from '@runalyzr/shared/settings';
import { METRIC_LABELS } from '../config/defaults';
import { runThresholds } from '../analysis/thresholds';

// The store itself lives in analysis/thresholds.ts (evaluateMetric reads it);
// re-exported here so UI/report code has one settings entry point.
export { runThresholds };

export const RUN_SETTINGS_SECTIONS: SettingsSection[] = [{
  title: 'Run metrics',
  store: runThresholds,
  rows: Object.entries(METRIC_LABELS).map(([key, label]) => (
    key === 'kneeFlexionAtContact'
      ? { key, label, lowLabel: 'too bent', highLabel: 'too straight' }
      : { key, label }
  )),
}];
