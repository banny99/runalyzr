import { describe, expect, test } from 'vitest';
import type { Band, ThresholdEntry } from '../analysis/index';
import {
  applyField, barRange, clampForDrag, editableFields, flipSign, fromPercent, parseBoundaryInput, toPercent,
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
  test('flipSign', () => {
    expect(flipSign('2')).toBe('-2');
    expect(flipSign('-2')).toBe('2');
    expect(flipSign('')).toBe('-');
  });
});
