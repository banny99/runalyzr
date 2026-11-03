import { afterEach, describe, expect, test } from 'vitest';
import { runThresholds, RUN_SETTINGS_SECTIONS } from './thresholdStore';
import { THRESHOLDS, makeMetricResult, evaluateMetric } from '../analysis/thresholds';
import { METRIC_LABELS } from '../config/defaults';
import type { AnalysisResults } from '../analysis/types';

afterEach(() => runThresholds.resetAll());

describe('runThresholds', () => {
  test('makeMetricResult follows an override', () => {
    runThresholds.set('cadence', { green: [175, 195], lowRedAt: 165, highRedAt: null });
    expect(makeMetricResult(172, 'cadence').status).toBe('amber');
    expect(evaluateMetric(172, 'cadence')).toBe('amber');
  });

  test('every default is unchanged', () => {
    for (const key of Object.keys(THRESHOLDS) as (keyof AnalysisResults)[]) {
      expect(runThresholds.entry(key)).toBe(THRESHOLDS[key]);
    }
  });

  test('settings section lists every metric in label order', () => {
    expect(RUN_SETTINGS_SECTIONS).toHaveLength(1);
    const [section] = RUN_SETTINGS_SECTIONS;
    expect(section.title).toBe('Run metrics');
    expect(section.rows.map((r) => r.key)).toEqual(Object.keys(METRIC_LABELS));
    const knee = section.rows.find((r) => r.key === 'kneeFlexionAtContact');
    expect(knee?.lowLabel).toBe('too bent');
    expect(knee?.highLabel).toBe('too straight');
  });
});
