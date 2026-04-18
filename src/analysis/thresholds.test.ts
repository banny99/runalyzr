import { describe, it, expect } from 'vitest';
import { evaluateMetric } from './thresholds';

describe('evaluateMetric', () => {
  it('returns green for cadence in green range', () => {
    expect(evaluateMetric(180, 'cadence')).toBe('green');
  });

  it('returns amber for cadence in amber range', () => {
    expect(evaluateMetric(165, 'cadence')).toBe('amber');
  });

  it('returns red for cadence below amber (lower_is_worse)', () => {
    expect(evaluateMetric(150, 'cadence')).toBe('red');
  });

  it('returns green for cadence above green max (lower_is_worse — too high is fine)', () => {
    expect(evaluateMetric(200, 'cadence')).toBe('green');
  });

  it('returns green for pelvicDrop in green range', () => {
    expect(evaluateMetric(3, 'pelvicDrop')).toBe('green');
  });

  it('returns amber for pelvicDrop in amber range', () => {
    expect(evaluateMetric(6, 'pelvicDrop')).toBe('amber');
  });

  it('returns red for pelvicDrop above amber max (higher_is_worse)', () => {
    expect(evaluateMetric(9, 'pelvicDrop')).toBe('red');
  });

  it('returns green for pelvicDrop at 0 (higher_is_worse — too low is fine)', () => {
    expect(evaluateMetric(0, 'pelvicDrop')).toBe('green');
  });
});
