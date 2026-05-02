import { generateReport as _generateReport } from '@runalyzr/shared/pdf';
import { METRIC_LABELS, APP_NAME } from '../config/defaults';
import { THRESHOLDS } from '../analysis/thresholds';
import type { ReportParams, AnalysisResults } from '../analysis/types';
import type { MetricResult } from '@runalyzr/shared/types';

export function generateReport(params: ReportParams): void {
  const metrics: Array<{ label: string; result: MetricResult; normalRange?: string }> = [];

  for (const [key, result] of Object.entries(params.metrics) as [keyof AnalysisResults, typeof params.metrics[keyof AnalysisResults]][]) {
    if (!result) continue;
    const threshold = THRESHOLDS[key];
    const label = METRIC_LABELS[key] ?? key;
    const normalRange = threshold
      ? `${threshold.green[0]}–${threshold.green[1]}${threshold.unit}`
      : undefined;
    metrics.push({ label, result, normalRange });
  }

  _generateReport(
    [{ title: 'Gait Metrics', metrics, findings: params.findings.map((f) => f.text) }],
    {
      title: 'Running Gait Analysis Report',
      appName: APP_NAME,
      clientName: params.clientName,
      notes: params.notes,
      date: new Date().toLocaleDateString(),
    },
  );
}
