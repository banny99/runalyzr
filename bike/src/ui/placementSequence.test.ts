import { describe, it, expect } from 'vitest';
import { firstUnplacedFrom } from './placementSequence';
import type { BikePoint } from '../config/defaults';

const POINTS: BikePoint[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
];

describe('firstUnplacedFrom', () => {
  it('returns the start index when that point is unplaced', () => {
    expect(firstUnplacedFrom(POINTS, new Set(), 0)).toBe(0);
  });

  it('skips already-placed points', () => {
    expect(firstUnplacedFrom(POINTS, new Set(['a', 'b']), 0)).toBe(2);
  });

  it('scans forward from the given index', () => {
    expect(firstUnplacedFrom(POINTS, new Set(['b']), 1)).toBe(2);
  });

  it('returns points.length when everything from the index on is placed', () => {
    expect(firstUnplacedFrom(POINTS, new Set(['a', 'b', 'c']), 0)).toBe(3);
    expect(firstUnplacedFrom(POINTS, new Set(['c']), 2)).toBe(3);
  });

  it('clamps negative start indices to 0', () => {
    expect(firstUnplacedFrom(POINTS, new Set(['a']), -5)).toBe(1);
  });
});
