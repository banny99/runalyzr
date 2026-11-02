import { describe, expect, test } from 'vitest';
import type { Band, ThresholdEntry } from '../analysis/index';
import {
  applyField, barRange, barSegments, clampForDrag, editableFields, flipSign, fromPercent, parseBoundaryInput, spreadPositions, toPercent,
} from './rowModel';

const twoSided: ThresholdEntry = { green: [145, 155], amber: [135, 145], amberHigh: [155, 160], unit: '°', direction: 'two_sided' };
const lowerWorse: ThresholdEntry = { green: [80, 100], amber: [70, 80], unit: ' rpm', direction: 'lower_is_worse' };
const higherWorse: ThresholdEntry = { green: [0, 5], amber: [5, 7], unit: '°', direction: 'higher_is_worse' };
const indicative: ThresholdEntry = { green: [0, 0], amber: [0, 0], unit: '°', direction: 'higher_is_worse', indicativeOnly: true };

describe('settings row model', () => {
  test('comma decimals from European keypads', () => {
    expect(parseBoundaryInput('1,5', 'green1')).toBe(1.5);
    expect(parseBoundaryInput(' 145 ', 'green0')).toBe(145);
  });
  test('half-typed values are incomplete; empty red means no red', () => {
    for (const s of ['-', '.', '-.', 'abc']) expect(parseBoundaryInput(s, 'green0')).toBe('incomplete');
    expect(parseBoundaryInput('', 'green0')).toBe('incomplete');
    expect(parseBoundaryInput('', 'lowRedAt')).toBeNull();
    expect(parseBoundaryInput('', 'highRedAt')).toBeNull();
    expect(parseBoundaryInput('1.', 'highRedAt')).toBe(1);
    expect(parseBoundaryInput('-2', 'lowRedAt')).toBe(-2);
  });
  test('editableFields per direction', () => {
    expect(editableFields(twoSided)).toEqual(['lowRedAt', 'green0', 'green1', 'highRedAt']);
    expect(editableFields(lowerWorse)).toEqual(['lowRedAt', 'green0', 'green1']);
    expect(editableFields(higherWorse)).toEqual(['green0', 'green1', 'highRedAt']);
    expect(editableFields(indicative)).toEqual([]);
  });
  test('applyField returns a copy with one field replaced', () => {
    const b: Band = { green: [145, 155], lowRedAt: 135, highRedAt: 160 };
    expect(applyField(b, 'green0', 140)).toEqual({ green: [140, 155], lowRedAt: 135, highRedAt: 160 });
    expect(applyField(b, 'highRedAt', null)).toEqual({ green: [145, 155], lowRedAt: 135, highRedAt: null });
    expect(b.green).toEqual([145, 155]);
  });
  test('barRange pads and clamps at 0 unless signed', () => {
    expect(barRange({ green: [145, 155], lowRedAt: 135, highRedAt: 160 }, false)).toEqual([122.5, 172.5]);
    expect(barRange({ green: [0, 3], lowRedAt: null, highRedAt: null }, false)).toEqual([0, 8]);
    expect(barRange({ green: [-2, 2], lowRedAt: null, highRedAt: null }, true)).toEqual([-7, 7]);
  });
  test('fromPercent rounds to step; toPercent clamps', () => {
    expect(fromPercent(50, [0, 10])).toBe(5);
    expect(fromPercent(33, [0, 10])).toBe(3.5);
    expect(toPercent(-5, [0, 10])).toBe(0);
    expect(toPercent(15, [0, 10])).toBe(100);
    expect(toPercent(5, [0, 10])).toBe(50);
  });
  test('clampForDrag stops at neighbours', () => {
    const b = { green: [145, 155], lowRedAt: 135, highRedAt: 160 } satisfies Band;
    expect(clampForDrag(b, 'lowRedAt', 150)).toBe(145);
    expect(clampForDrag(b, 'green1', 140)).toBe(145);
    expect(clampForDrag(b, 'highRedAt', 150)).toBe(155);
    expect(clampForDrag(b, 'green0', 100)).toBe(135);
    expect(clampForDrag(b, 'green0', 150)).toBe(150);
  });
  test('clampForDrag ignores null neighbours', () => {
    const b: Band = { green: [0, 3], lowRedAt: null, highRedAt: null };
    expect(clampForDrag(b, 'green0', -50)).toBe(-50);
    expect(clampForDrag(b, 'green1', 99)).toBe(99);
    expect(clampForDrag(b, 'green1', -1)).toBe(0);
  });
  test('spreadPositions pushes overlapping boxes apart and keeps the end boxes on the bar', () => {
    expect(spreadPositions([0, 45, 50, 100], 10, 5, 95)).toEqual([5, 45, 55, 95]);
    expect(spreadPositions([0, 90, 95, 100], 10, 5, 95)).toEqual([5, 75, 85, 95]);
    expect(spreadPositions([20, 40, 60], 10, 5, 95)).toEqual([20, 40, 60]);
  });
  test('spreadPositions distributes evenly inside the bar when the boxes cannot fit', () => {
    // Four 106 px boxes on a 328 px bar: gap ≈ 33.5 %, edges ≈ 16.2 % / 83.8 %.
    const out = spreadPositions([0, 45, 55, 100], 33.5, 16.2, 83.8);
    expect(out[0]).toBeCloseTo(16.2);
    expect(out[3]).toBeCloseTo(83.8);
    for (const v of out) { expect(v).toBeGreaterThanOrEqual(16.2 - 1e-9); expect(v).toBeLessThanOrEqual(83.8 + 1e-9); }
    expect(out[1] - out[0]).toBeCloseTo(out[2] - out[1]);
    expect(spreadPositions([0], 200, 60, 40)).toEqual([50]);
  });
  test('barSegments colours each span by direction; null red runs amber to the bar end', () => {
    const r: [number, number] = [0, 100];
    expect(barSegments('two_sided', { green: [40, 60], lowRedAt: 20, highRedAt: null }, r)).toEqual([
      ['red', 0, 20], ['amber', 20, 40], ['green', 40, 60], ['amber', 60, 100],
    ]);
    expect(barSegments('lower_is_worse', { green: [40, 60], lowRedAt: 20, highRedAt: null }, r)).toEqual([
      ['red', 0, 20], ['amber', 20, 40], ['green', 40, 60], ['green', 60, 100],
    ]);
    expect(barSegments('higher_is_worse', { green: [40, 60], lowRedAt: null, highRedAt: 80 }, r)).toEqual([
      ['green', 0, 40], ['green', 40, 60], ['amber', 60, 80], ['red', 80, 100],
    ]);
  });
  test('flipSign', () => {
    expect(flipSign('2')).toBe('-2');
    expect(flipSign('-2')).toBe('2');
    expect(flipSign('')).toBe('-');
  });
});
