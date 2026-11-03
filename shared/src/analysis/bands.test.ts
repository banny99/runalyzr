import { describe, it, expect } from 'vitest';
import { evaluateThreshold, thresholdMetricResult } from './thresholds';
import type { ThresholdEntry } from './thresholds';
import {
  bandFromEntry, entryWithBand, validateBand, formatGreenRange,
  greenOnly, noBand, rescoreMetrics, outOfRangeText,
} from './bands';

const twoSided: ThresholdEntry = { green: [145, 155], amber: [135, 145], amberHigh: [155, 160], unit: '°', direction: 'two_sided' };
const lowerWorse: ThresholdEntry = { green: [80, 100], amber: [70, 80], unit: ' rpm', direction: 'lower_is_worse' };
const higherWorse: ThresholdEntry = { green: [0, 5], amber: [5, 7], unit: '°', direction: 'higher_is_worse' };

describe('band model', () => {
  it('bandFromEntry keeps only the edges each direction uses', () => {
    expect(bandFromEntry(twoSided)).toEqual({ green: [145, 155], lowRedAt: 135, highRedAt: 160 });
    expect(bandFromEntry(lowerWorse)).toEqual({ green: [80, 100], lowRedAt: 70, highRedAt: null });
    expect(bandFromEntry(higherWorse)).toEqual({ green: [0, 5], lowRedAt: null, highRedAt: 7 });
    expect(bandFromEntry(greenOnly([35, 50], '°'))).toEqual({ green: [35, 50], lowRedAt: null, highRedAt: null });
    expect(bandFromEntry(noBand('°'))).toBeNull();
  });

  it('round-trip through a band evaluates identically', () => {
    for (const t of [twoSided, lowerWorse, higherWorse, greenOnly([35, 50], '°')]) {
      const back = entryWithBand(t, bandFromEntry(t));
      for (let v = -20; v <= 220; v += 0.5) expect(evaluateThreshold(v, back)).toBe(evaluateThreshold(v, t));
    }
  });

  it('greenOnly never goes red', () => {
    const t = greenOnly([35, 50], '°');
    expect(evaluateThreshold(40, t)).toBe('green');
    expect(evaluateThreshold(-1000, t)).toBe('amber');
    expect(evaluateThreshold(1000, t)).toBe('amber');
  });

  it('adding a red edge to a green-only entry makes values past it red', () => {
    const t = entryWithBand(greenOnly([35, 50], '°'), { green: [35, 50], lowRedAt: null, highRedAt: 60 });
    expect(evaluateThreshold(55, t)).toBe('amber');
    expect(evaluateThreshold(61, t)).toBe('red');
    expect(evaluateThreshold(10, t)).toBe('amber');
  });

  it('a band on an information-only entry is two-sided', () => {
    const t = entryWithBand(noBand('°', [80, 100]), { green: [80, 100], lowRedAt: null, highRedAt: null });
    expect(t.direction).toBe('two_sided');
    expect(evaluateThreshold(90, t)).toBe('green');
    expect(evaluateThreshold(70, t)).toBe('amber');
  });

  it('a null band returns an information-only entry keeping unit and suggestedGreen', () => {
    const t = entryWithBand(noBand('°', [80, 100]), null);
    expect(t.indicativeOnly).toBe(true);
    expect(t.unit).toBe('°');
    expect(t.suggestedGreen).toEqual([80, 100]);
    expect(evaluateThreshold(90, entryWithBand(twoSided, null))).toBe('unknown');
  });

  it('cleared red on a two-sided metric far above green is amber with high side', () => {
    const t = entryWithBand(twoSided, { green: [145, 155], lowRedAt: 135, highRedAt: null });
    expect(thresholdMetricResult(200, t)).toEqual({ value: 200, status: 'amber', unit: '°', side: 'high' });
  });

  it('validateBand', () => {
    expect(validateBand(twoSided, { green: [145, 155], lowRedAt: 135, highRedAt: 160 })).toBeNull();
    expect(validateBand(lowerWorse, { green: [80, 100], lowRedAt: 85, highRedAt: null }))
      .toBe('Amber must start below green (85 is above the green start of 80).');
    expect(validateBand(twoSided, { green: [145, 155], lowRedAt: 135, highRedAt: 150 }))
      .toBe('Amber must end above green (150 is below the green end of 155).');
    expect(validateBand(twoSided, { green: [155, 145], lowRedAt: null, highRedAt: null }))
      .toBe('Green start must be below green end.');
    expect(validateBand(twoSided, { green: [145, 155], lowRedAt: 145, highRedAt: 155 })).toBeNull();
    expect(validateBand(higherWorse, { green: [0, 5], lowRedAt: 99, highRedAt: 7 })).toBeNull();
    expect(validateBand(twoSided, { green: [NaN, 155], lowRedAt: null, highRedAt: null })).toBe('Enter a number.');
  });

  it('formatGreenRange', () => {
    expect(formatGreenRange(lowerWorse)).toBe('80–100 rpm');
    expect(formatGreenRange(greenOnly([-2, 2], '°'))).toBe('±2°');
    expect(formatGreenRange(noBand('°'))).toBeUndefined();
    expect(formatGreenRange(undefined)).toBeUndefined();
  });

  it('rescoreMetrics updates status and side in place', () => {
    const r = { knee: thresholdMetricResult(150, twoSided), gone: null };
    rescoreMetrics(r, () => entryWithBand(twoSided, { green: [160, 170], lowRedAt: 140, highRedAt: 175 }));
    expect(r.knee).toEqual({ value: 150, status: 'amber', unit: '°', side: 'low' });
    rescoreMetrics(r, () => twoSided);
    expect(r.knee).toEqual({ value: 150, status: 'green', unit: '°' });
  });

  it('outOfRangeText', () => {
    const t = entryWithBand(noBand('°'), { green: [80, 100], lowRedAt: null, highRedAt: null });
    expect(outOfRangeText('Shoulder Angle', { value: 72, status: 'amber', unit: '°' }, t))
      .toBe('Shoulder Angle of 72.0° is outside your set range of 80–100°.');
  });
});
