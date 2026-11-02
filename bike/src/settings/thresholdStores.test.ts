import { describe, it, expect, afterEach } from 'vitest';
import { rideThresholds } from './thresholdStores';
import { makeMetricResult } from '../analysis/thresholds';
import { buildReportSections } from '../report/pdfGenerator';
import type { BikeReportParams } from '../analysis/types';

describe('ride thresholds', () => {
  afterEach(() => rideThresholds.resetAll());

  it('ride status follows an override', () => {
    expect(makeMetricResult(152, 'kneeExtensionBDC').status).toBe('green');
    rideThresholds.set('kneeExtensionBDC', { green: [140, 150], lowRedAt: null, highRedAt: null });
    const r = makeMetricResult(152, 'kneeExtensionBDC');
    expect(r.status).toBe('amber');
    expect(r.side).toBe('high');
  });

  it('PDF normal range follows an override', () => {
    rideThresholds.set('kneeExtensionBDC', { green: [140, 150], lowRedAt: null, highRedAt: null });
    const params: BikeReportParams = {
      clientName: 'T', notes: '', fitResults: null, enabledMetrics: {},
      rideResults: {
        sagittal: {
          kneeExtensionBDC: makeMetricResult(152, 'kneeExtensionBDC'),
          kneeFlexionTDC: null, hipAngleTDC: null, hipVerticalOscillation: null,
          torsoAngle: null, pelvicTilt: null, elbowAngle: null, shoulderAngle: null,
          reachAngle: null, wristAngle: null, ankleAnkling: null, cadence: null,
        },
        rear: null, front: null,
      },
    };
    const row = buildReportSections(params)[0].metrics[0];
    expect(row.normalRange).toBe('140–150°');
  });
});
