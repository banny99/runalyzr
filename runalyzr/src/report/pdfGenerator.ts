import { generateReport as _generateReport } from '@runalyzr/shared/pdf';
import type { ReportSection } from '@runalyzr/shared/types';
import { METRIC_LABELS, APP_NAME } from '../config/defaults';
import { runThresholds } from '../settings/thresholdStore';
import { formatGreenRange } from '@runalyzr/shared/analysis';
import type { ReportParams, AnalysisResults } from '../analysis/types';

export function buildReportSections(params: ReportParams): ReportSection[] {
  const metrics: ReportSection['metrics'] = [];

  for (const [key, result] of Object.entries(params.metrics) as [keyof AnalysisResults, typeof params.metrics[keyof AnalysisResults]][]) {
    if (!result) continue;
    const label = METRIC_LABELS[key] ?? key;
    const normalRange = formatGreenRange(runThresholds.entry(key));
    metrics.push({ label, result, normalRange });
  }

  return [{
    title: 'Gait Metrics',
    metrics,
    findings: params.findings.map((f) => f.text),
    ...(params.frameDataUrl && params.frameAspect
      ? { image: { dataUrl: params.frameDataUrl, aspectRatio: params.frameAspect } }
      : {}),
  }];
}

export function generateReport(params: ReportParams): void {
  _generateReport(buildReportSections(params), {
    title: 'Running Gait Analysis Report',
    appName: APP_NAME,
    clientName: params.clientName,
    notes: params.notes,
    date: new Date().toLocaleDateString(),
  });
}
