import { describe, it, expect } from 'vitest';
import { generateFindings } from './findings';
import type { AnalysisResults } from './types';

const emptyResults: AnalysisResults = {
  kneeFlexionAtContact: null,
  hipAdduction: null,
  pelvicDrop: null,
  trunkLateralLean: null,
  ankleDorsiflexion: null,
  cadence: null,
  verticalOscillation: null,
  overstriding: null,
  strideSymmetry: null,
  groundContactTime: null,
};

describe('generateFindings', () => {
  it('returns empty array when all metrics are null', () => {
    expect(generateFindings(emptyResults)).toHaveLength(0);
  });

  it('returns empty array when all metrics are green', () => {
    const results: AnalysisResults = {
      ...emptyResults,
      cadence: { value: 180, status: 'green', unit: ' spm' },
    };
    expect(generateFindings(results)).toHaveLength(0);
  });

  it('generates a finding for a red metric with formatted value', () => {
    const results: AnalysisResults = {
      ...emptyResults,
      cadence: { value: 150, status: 'red', unit: ' spm' },
    };
    const findings = generateFindings(results);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe('red');
    expect(findings[0].text).toContain('150');
    expect(findings[0].metric).toBe('cadence');
  });

  it('generates an amber finding for amber metric', () => {
    const results: AnalysisResults = {
      ...emptyResults,
      pelvicDrop: { value: 6, status: 'amber', unit: '°' },
    };
    const findings = generateFindings(results);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe('amber');
  });

  it('sorts red findings before amber findings', () => {
    const results: AnalysisResults = {
      ...emptyResults,
      cadence: { value: 150, status: 'red', unit: ' spm' },
      pelvicDrop: { value: 6, status: 'amber', unit: '°' },
    };
    const findings = generateFindings(results);
    expect(findings[0].status).toBe('red');
    expect(findings[1].status).toBe('amber');
  });
});
