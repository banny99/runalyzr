import type { MetricResult } from '../types/index';

export interface FindingTemplate {
  red: string;
  amber: string;
}

export interface TemplatedFinding<K extends string = string> {
  metric: K;
  status: 'amber' | 'red';
  text: string;
}

/**
 * Single findings engine for both apps: looks up a template per non-green
 * metric, substitutes `{value}` (1 dp), and sorts red before amber.
 * Template tables stay app-local — they're the domain content.
 */
export function findingsFromTemplates<K extends string>(
  metrics: Partial<Record<K, MetricResult | null>>,
  templates: Partial<Record<K, FindingTemplate>>,
): TemplatedFinding<K>[] {
  const findings: TemplatedFinding<K>[] = [];

  for (const [key, result] of Object.entries(metrics) as [K, MetricResult | null][]) {
    if (!result || result.status === 'green' || result.status === 'unknown') continue;
    const template = templates[key];
    if (!template) continue;
    const status = result.status as 'amber' | 'red';
    findings.push({ metric: key, status, text: template[status].replace('{value}', result.value.toFixed(1)) });
  }

  return findings.sort((a, b) =>
    (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));
}
