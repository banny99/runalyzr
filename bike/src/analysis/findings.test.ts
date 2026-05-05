import { describe, it, expect } from 'vitest';
import { generateRearFindings, generateSagittalFindings } from './findings';
import type { RearMetrics, SagittalMetrics } from './types';

function makeRearMetrics(overrides: Partial<RearMetrics> = {}): RearMetrics {
  return {
    hipRock:          null,
    pelvicObliquity:  null,
    kneeVarusValgus:  null,
    heelAlignment:    null,
    ...overrides,
  };
}

describe('generateRearFindings', () => {
  it('returns empty array when all metrics are null', () => {
    expect(generateRearFindings(makeRearMetrics())).toHaveLength(0);
  });

  it('returns empty array when all metrics are green', () => {
    const metrics = makeRearMetrics({
      hipRock: { value: 1, status: 'green', unit: ' cm' },
    });
    expect(generateRearFindings(metrics)).toHaveLength(0);
  });

  it('generates a finding for a red hipRock metric', () => {
    const metrics = makeRearMetrics({
      hipRock: { value: 5, status: 'red', unit: ' cm' },
    });
    const findings = generateRearFindings(metrics);
    expect(findings).toHaveLength(1);
    expect(findings[0].metric).toBe('hipRock');
    expect(findings[0].status).toBe('red');
    expect(findings[0].text).toContain('5.0');
  });

  it('sorts red findings before amber findings', () => {
    const metrics = makeRearMetrics({
      hipRock:         { value: 5,   status: 'red',   unit: ' cm' },
      pelvicObliquity: { value: 1.5, status: 'amber', unit: ' cm' },
    });
    const findings = generateRearFindings(metrics);
    expect(findings[0].status).toBe('red');
    expect(findings[1].status).toBe('amber');
  });
});

describe('generateSagittalFindings', () => {
  function makeSagittal(overrides: Partial<SagittalMetrics> = {}): SagittalMetrics {
    return {
      kneeExtensionBDC:       null,
      kneeFlexionTDC:         null,
      hipAngleTDC:            null,
      hipVerticalOscillation: null,
      torsoAngle:             null,
      pelvicTilt:             null,
      elbowAngle:             null,
      wristAngle:             null,
      ankleAnkling:           null,
      cadence:                null,
      ...overrides,
    };
  }

  it('returns empty array when all metrics are null', () => {
    expect(generateSagittalFindings(makeSagittal())).toHaveLength(0);
  });

  it('generates finding text with interpolated value', () => {
    const metrics = makeSagittal({
      cadence: { value: 55, status: 'red', unit: ' rpm' },
    });
    const findings = generateSagittalFindings(metrics);
    expect(findings).toHaveLength(1);
    expect(findings[0].metric).toBe('cadence');
    expect(findings[0].status).toBe('red');
    expect(findings[0].text).toContain('55.0');
  });

  it('sorts red findings before amber findings', () => {
    const metrics = makeSagittal({
      cadence:    { value: 55,  status: 'red',   unit: ' rpm' },
      elbowAngle: { value: 75,  status: 'amber', unit: '°'   },
    });
    const findings = generateSagittalFindings(metrics);
    expect(findings[0].status).toBe('red');
    expect(findings[1].status).toBe('amber');
  });
});
