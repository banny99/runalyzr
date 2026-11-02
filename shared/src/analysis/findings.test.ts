import { describe, it, expect } from 'vitest';
import { findingsFromTemplates } from './findings';
import type { MetricResult } from '../types/index';

const r = (value: number, status: MetricResult['status']): MetricResult =>
  ({ value, status, unit: '°' });

const templates = {
  a: { red: 'A red {value}', amber: 'A amber {value}' },
  b: { red: 'B red {value}', amber: 'B amber {value}' },
};

describe('findingsFromTemplates', () => {
  it('substitutes {value} at 1 dp and skips green/unknown/null metrics', () => {
    const findings = findingsFromTemplates(
      { a: r(12.345, 'amber'), b: r(1, 'green'), c: r(2, 'unknown'), d: null },
      { ...templates, c: { red: 'x', amber: 'x' }, d: { red: 'x', amber: 'x' } },
    );
    expect(findings).toEqual([{ metric: 'a', status: 'amber', text: 'A amber 12.3' }]);
  });

  it('skips metrics with no template', () => {
    expect(findingsFromTemplates({ nope: r(9, 'red') }, templates)).toHaveLength(0);
  });

  it('uses the high-side text for a two-sided metric flagged above green', () => {
    const twoSided = {
      knee: {
        red: 'Too bent {value}', amber: 'Bit bent {value}',
        high: { red: 'Too straight {value}', amber: 'Bit straight {value}' },
      },
    };
    const findings = findingsFromTemplates(
      { knee: { value: 165, status: 'red', unit: '°', side: 'high' } }, twoSided,
    );
    expect(findings.map((f) => f.text)).toEqual(['Too straight 165.0']);
  });

  it('never shows low-side advice for a high-side value when no high text exists', () => {
    // Showing "raise the saddle" for a saddle that is too high is the bug this guards.
    const findings = findingsFromTemplates(
      { a: { value: 9, status: 'red', unit: '°', side: 'high' } }, templates,
    );
    expect(findings).toHaveLength(0);
  });

  it('sorts red before amber, keeping insertion order within a status', () => {
    const findings = findingsFromTemplates(
      { a: r(1, 'amber'), b: r(2, 'red') },
      templates,
    );
    expect(findings.map((f) => f.metric)).toEqual(['b', 'a']);
  });

  it('fallback text is used only for metrics without a template', () => {
    const metrics: Record<'a' | 'b', MetricResult> = { a: r(1, 'amber'), b: r(2, 'red') };
    const out = findingsFromTemplates(metrics, { a: { red: 'A red', amber: 'A amber' } }, (k) => `fallback ${k}`);
    expect(out.map((f) => f.text)).toEqual(['fallback b', 'A amber']);
  });
});
