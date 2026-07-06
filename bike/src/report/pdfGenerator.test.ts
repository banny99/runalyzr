import { describe, it, expect } from 'vitest';
import { buildReportSections } from './pdfGenerator';
import type { BikeReportParams } from '../analysis/types';

function paramsWith(fit: BikeReportParams['fitResults']): BikeReportParams {
  return {
    clientName: 'Test',
    notes: '',
    rideResults: null,
    enabledMetrics: {},
    fitResults: fit,
  };
}

const riderPosition = {
  positionId: 'saddle',
  positionName: 'Saddle height',
  landmarks: [],
  worldLandmarks: [],
  measurements: [
    { label: 'Knee angle', value: 145, unit: '°', normalRange: '140–150', status: 'green' as const },
  ],
  imageDataUrl: 'data:image/jpeg;base64,RIDER',
  imageAspect: 1.5,
};

const bikeGeometry = {
  stepId: 'cockpit',
  stepName: 'Cockpit',
  imageDataUrl: 'data:image/jpeg;base64,BIKE',
  imageAspect: 0.75,
  points: [],
  angles: [
    { id: 'drop', label: 'Bar drop', value: 5, normalRange: '0–10', status: 'green' as const },
  ],
};

describe('buildReportSections', () => {
  it('includes the annotated rider photo as the section image', () => {
    const sections = buildReportSections(
      paramsWith({ positions: [riderPosition], bikeGeometry: [] }),
    );
    const rider = sections.find((s) => s.title.includes('Saddle height'));
    expect(rider).toBeDefined();
    expect(rider!.image).toEqual({ dataUrl: 'data:image/jpeg;base64,RIDER', aspectRatio: 1.5 });
    // metrics still present
    expect(rider!.metrics).toHaveLength(1);
    expect(rider!.metrics[0].label).toBe('Knee angle');
  });

  it('still includes the bike-geometry photo (regression)', () => {
    const sections = buildReportSections(
      paramsWith({ positions: [], bikeGeometry: [bikeGeometry] }),
    );
    const geo = sections.find((s) => s.title.includes('Cockpit'));
    expect(geo).toBeDefined();
    expect(geo!.image).toEqual({ dataUrl: 'data:image/jpeg;base64,BIKE', aspectRatio: 0.75 });
  });

  it('emits both a bike-geometry and a rider section when both exist', () => {
    const sections = buildReportSections(
      paramsWith({ positions: [riderPosition], bikeGeometry: [bikeGeometry] }),
    );
    expect(sections.filter((s) => s.image).length).toBe(2);
  });
});
