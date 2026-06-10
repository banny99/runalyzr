import { generateReport as _generateReport } from '@runalyzr/shared/pdf';
import type { ReportSection } from '@runalyzr/shared/types';
import { METRIC_LABELS, APP_NAME } from '../config/defaults';
import { THRESHOLDS } from '../analysis/thresholds';
import type {
  BikeReportParams,
  MetricToggleState,
  MetricKey,
} from '../analysis/types';
import type { MetricResult } from '@runalyzr/shared/types';

function buildSection(
  title: string,
  metrics: Record<string, MetricResult | null>,
  findings: string[],
  enabledMetrics: MetricToggleState,
): ReportSection {
  const metricRows: ReportSection['metrics'] = [];
  for (const [key, result] of Object.entries(metrics) as [MetricKey, MetricResult | null][]) {
    if (enabledMetrics[key] === false) continue;
    if (!result) continue;
    const threshold = THRESHOLDS[key];
    const label = METRIC_LABELS[key] ?? key;
    const normalRange = threshold
      ? `${threshold.green[0]}–${threshold.green[1]}${threshold.unit}`
      : undefined;
    metricRows.push({ label, result, normalRange });
  }
  return { title, metrics: metricRows, findings };
}

export function generateBikeReport(params: BikeReportParams): void {
  const sections: ReportSection[] = [];

  // Ride sections
  if (params.rideResults) {
    const { sagittal, rear, front } = params.rideResults;
    if (sagittal) {
      sections.push(buildSection('Sagittal (Side) View', sagittal, [], params.enabledMetrics));
    }
    if (rear) {
      sections.push(buildSection('Rear View', rear, [], params.enabledMetrics));
    }
    if (front) {
      sections.push(buildSection('Front View', front, [], params.enabledMetrics));
    }
  }

  // Fit sections — one per completed position
  if (params.fitResults) {
    for (const position of params.fitResults.positions) {
      const metricRows: ReportSection['metrics'] = position.measurements.map((m) => ({
        label: m.label,
        result: { value: m.value, status: 'unknown' as const, unit: m.unit },
        normalRange: m.normalRange,
      }));
      sections.push({
        title: `Fit — ${position.positionName}`,
        metrics: metricRows,
        findings: [],
      });
    }
  }

  const reportTitle = params.rideResults && params.fitResults
    ? 'Bike Fit & Ride Analysis Report'
    : params.fitResults
      ? 'Bike Fit Analysis Report'
      : 'Bike Ride Analysis Report';

  _generateReport(sections, {
    title: reportTitle,
    appName: APP_NAME,
    clientName: params.clientName,
    notes: params.notes,
    date: new Date().toLocaleDateString(),
  });
}
