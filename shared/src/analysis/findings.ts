import type { MetricResult } from '../types/index';

export interface FindingTemplate {
  /** One-sided metrics: the risky side. Two-sided metrics: values *below* green. */
  red: string;
  amber: string;
  /** Two-sided metrics only: text for values *above* green. */
  high?: { red: string; amber: string };
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
  /** Text for a non-green metric that has no template (used only then). */
  fallback?: (key: K, result: MetricResult) => string | undefined,
): TemplatedFinding<K>[] {
  const findings: TemplatedFinding<K>[] = [];

  for (const [key, result] of Object.entries(metrics) as [K, MetricResult | null][]) {
    if (!result || result.status === 'green' || result.status === 'unknown') continue;
    const template = templates[key];
    const status = result.status as 'amber' | 'red';
    if (!template) {
      const text = fallback?.(key, result);
      if (text !== undefined) findings.push({ metric: key, status, text });
      continue;
    }
    // A value above green must get high-side advice or none at all — falling
    // back to the low-side text would tell a rider with a too-high saddle to
    // raise it.
    const texts = result.side === 'high' ? template.high : template;
    if (!texts) continue;
    findings.push({ metric: key, status, text: texts[status].replace('{value}', result.value.toFixed(1)) });
  }

  return findings.sort((a, b) =>
    (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));
}
