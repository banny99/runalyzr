import { describe, it, expect } from 'vitest';
import { buildReportSections } from './pdfGenerator';
import type { ReportParams, AnalysisResults } from '../analysis/types';

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

function params(overrides: Partial<ReportParams> = {}): ReportParams {
  return {
    clientName: 'Test',
    notes: '',
    metrics: {
      ...emptyResults,
      cadence: { value: 178, status: 'green', unit: ' spm' },
    },
    findings: [{ metric: 'cadence', status: 'amber', text: 'finding text' }],
    frameDataUrl: null,
    frameAspect: null,
    ...overrides,
  };
}

describe('buildReportSections', () => {
  it('builds metric rows with labels, ranges and findings', () => {
    const [section] = buildReportSections(params());
    expect(section.title).toBe('Gait Metrics');
    expect(section.metrics).toHaveLength(1);
    expect(section.metrics[0].label).toBe('Cadence');
    expect(section.metrics[0].normalRange).toContain('170');
    expect(section.findings).toEqual(['finding text']);
  });

  it('includes the annotated analysis frame when captured', () => {
    const [section] = buildReportSections(
      params({ frameDataUrl: 'data:image/jpeg;base64,FRAME', frameAspect: 1.78 }),
    );
    expect(section.image).toEqual({ dataUrl: 'data:image/jpeg;base64,FRAME', aspectRatio: 1.78 });
  });

  it('omits the image when no frame was captured', () => {
    const [section] = buildReportSections(params());
    expect(section.image).toBeUndefined();
  });
});
