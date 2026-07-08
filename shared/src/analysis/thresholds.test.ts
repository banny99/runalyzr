import { describe, it, expect } from 'vitest';
import { evaluateThreshold, thresholdMetricResult } from './thresholds';
import type { ThresholdEntry } from './thresholds';

const lowerWorse: ThresholdEntry = {
  green: [170, 195], amber: [160, 170], unit: ' spm', direction: 'lower_is_worse',
};
const higherWorse: ThresholdEntry = {
  green: [0, 5], amber: [5, 7], unit: '°', direction: 'higher_is_worse',
};

describe('evaluateThreshold', () => {
  it('green wins at the shared boundary (amber touches green)', () => {
    // The documented invariant: green is checked FIRST, so a value sitting on
    // both bands' edge is green. A reorder of the two checks breaks these.
    expect(evaluateThreshold(170, lowerWorse)).toBe('green');  // green[0] == amber[1]
    expect(evaluateThreshold(5, higherWorse)).toBe('green');   // green[1] == amber[0]
  });

  it('classifies inside each band and the direction fall-throughs', () => {
    expect(evaluateThreshold(165, lowerWorse)).toBe('amber');
    expect(evaluateThreshold(150, lowerWorse)).toBe('red');    // below amber, risky side
    expect(evaluateThreshold(200, lowerWorse)).toBe('green');  // above green, safe side
    expect(evaluateThreshold(6, higherWorse)).toBe('amber');
    expect(evaluateThreshold(8, higherWorse)).toBe('red');
  });

  it('returns unknown for indicativeOnly entries and missing entries', () => {
    const indicative: ThresholdEntry = { ...higherWorse, indicativeOnly: true };
    expect(evaluateThreshold(3, indicative)).toBe('unknown'); // in-green value still unknown
    expect(evaluateThreshold(3, undefined)).toBe('unknown');
  });

  it('a gap between amber and green falls through to direction, not amber', () => {
    // Pins the intended semantics: bands are expected to be adjacent; values
    // in an accidental gap are judged by direction (here: risky side → red).
    const gapped: ThresholdEntry = {
      green: [10, 20], amber: [0, 5], unit: '', direction: 'lower_is_worse',
    };
    expect(evaluateThreshold(7, gapped)).toBe('red');
  });
});

describe('thresholdMetricResult', () => {
  it('carries the value, evaluated status and unit', () => {
    expect(thresholdMetricResult(165, lowerWorse)).toEqual({ value: 165, status: 'amber', unit: ' spm' });
  });

  it('falls back to an empty unit for missing entries', () => {
    expect(thresholdMetricResult(1, undefined)).toEqual({ value: 1, status: 'unknown', unit: '' });
  });
});
