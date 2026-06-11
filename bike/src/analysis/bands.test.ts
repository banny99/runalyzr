import { describe, it, expect } from 'vitest';
import { bandStatus } from './bands';

describe('bandStatus', () => {
  it('returns green inside the band (inclusive bounds)', () => {
    expect(bandStatus(73, [72, 74])).toBe('green');
    expect(bandStatus(72, [72, 74])).toBe('green');
    expect(bandStatus(74, [72, 74])).toBe('green');
  });

  it('returns amber outside the band', () => {
    expect(bandStatus(71.9, [72, 74])).toBe('amber');
    expect(bandStatus(74.1, [72, 74])).toBe('amber');
  });

  it('handles signed bands', () => {
    expect(bandStatus(-1.5, [-2, 2])).toBe('green');
    expect(bandStatus(-2.5, [-2, 2])).toBe('amber');
  });

  it('returns unknown when no band is defined', () => {
    expect(bandStatus(42, undefined)).toBe('unknown');
  });
});
