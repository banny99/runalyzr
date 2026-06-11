import { describe, it, expect } from 'vitest';
import { computeBikeAngles, anglePointPairs } from './bikeGeometryMetrics';
import type { PlacedPoint } from './types';
import type { AngleDefinition } from '../config/defaults';

const AR = 4 / 3; // typical landscape aspect ratio for tests

describe('computeBikeAngles', () => {
  it('computes 90° for a perfectly vertical tube', () => {
    const points: PlacedPoint[] = [
      { id: 'bb_centre',     x: 0.5, y: 0.8 },
      { id: 'seat_tube_top', x: 0.5, y: 0.2 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'seat_tube_angle', label: 'Seat Tube Angle',
      pointA: 'bb_centre', pointB: 'seat_tube_top',
      reference: 'horizontal', normalRange: '72–74°',
    }];
    const result = computeBikeAngles(points, defs, AR);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBeCloseTo(90, 0);
    expect(result[0].id).toBe('seat_tube_angle');
  });

  it('computes 0° for a perfectly horizontal tube', () => {
    const points: PlacedPoint[] = [
      { id: 'saddle_left',  x: 0.2, y: 0.5 },
      { id: 'saddle_right', x: 0.8, y: 0.5 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'saddle_level', label: 'Saddle Level',
      pointA: 'saddle_left', pointB: 'saddle_right',
      reference: 'horizontal', normalRange: '< 2°',
    }];
    expect(computeBikeAngles(points, defs, AR)[0].value).toBeCloseTo(0, 1);
  });

  it('returns positive signed tilt when nose is higher than centre (nose-up)', () => {
    const points: PlacedPoint[] = [
      { id: 'saddle_nose',   x: 0.3, y: 0.38 }, // higher (smaller y)
      { id: 'saddle_centre', x: 0.5, y: 0.42 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'saddle_tilt', label: 'Saddle Tilt',
      pointA: 'saddle_nose', pointB: 'saddle_centre',
      reference: 'horizontal', signed: true, normalRange: '±2°',
    }];
    expect(computeBikeAngles(points, defs, AR)[0].value).toBeGreaterThan(0);
  });

  it('returns negative signed tilt when nose is lower than centre (nose-down)', () => {
    const points: PlacedPoint[] = [
      { id: 'saddle_nose',   x: 0.3, y: 0.46 }, // lower (bigger y)
      { id: 'saddle_centre', x: 0.5, y: 0.42 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'saddle_tilt', label: 'Saddle Tilt',
      pointA: 'saddle_nose', pointB: 'saddle_centre',
      reference: 'horizontal', signed: true, normalRange: '±2°',
    }];
    expect(computeBikeAngles(points, defs, AR)[0].value).toBeLessThan(0);
  });

  it('omits angles where a required point is missing', () => {
    const points: PlacedPoint[] = [{ id: 'bb_centre', x: 0.5, y: 0.8 }];
    const defs: AngleDefinition[] = [{
      id: 'seat_tube_angle', label: 'Seat Tube Angle',
      pointA: 'bb_centre', pointB: 'seat_tube_top',
      reference: 'horizontal', normalRange: '72–74°',
    }];
    expect(computeBikeAngles(points, defs, AR)).toHaveLength(0);
  });

  it('returns empty array when points array is empty', () => {
    const defs: AngleDefinition[] = [{
      id: 'seat_tube_angle', label: 'Seat Tube Angle',
      pointA: 'bb_centre', pointB: 'seat_tube_top',
      reference: 'horizontal', normalRange: '72–74°',
    }];
    expect(computeBikeAngles([], defs, AR)).toHaveLength(0);
  });

  it('values are rounded to 1 decimal place', () => {
    const points: PlacedPoint[] = [
      { id: 'a', x: 0.1, y: 0.9 },
      { id: 'b', x: 0.4, y: 0.2 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'test', label: 'Test', pointA: 'a', pointB: 'b',
      reference: 'horizontal', normalRange: '—',
    }];
    const result = computeBikeAngles(points, defs, AR);
    expect(result[0].value).toBe(parseFloat(result[0].value.toFixed(1)));
  });

  it('computes 0° for a perfectly vertical tube using vertical reference', () => {
    const points: PlacedPoint[] = [
      { id: 'ht_bottom', x: 0.5, y: 0.7 },
      { id: 'ht_top',    x: 0.5, y: 0.2 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'head_tube_angle', label: 'Head Tube Angle',
      pointA: 'ht_bottom', pointB: 'ht_top',
      reference: 'vertical', normalRange: '71–74°',
    }];
    expect(computeBikeAngles(points, defs, AR)[0].value).toBeCloseTo(0, 1);
  });

  it('computes the interior angle for ab_to_c reference', () => {
    // Right angle: A above B, C to the right of B (square aspect for easy math)
    const points: PlacedPoint[] = [
      { id: 'a', x: 0.5, y: 0.2 },
      { id: 'b', x: 0.5, y: 0.5 },
      { id: 'c', x: 0.8, y: 0.5 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'corner', label: 'Corner', pointA: 'a', pointB: 'b', pointC: 'c',
      reference: 'ab_to_c', normalRange: '—',
    }];
    expect(computeBikeAngles(points, defs, 1)[0].value).toBeCloseTo(90, 0);
  });

  it('applies aspect-ratio scaling in the ab_to_c branch', () => {
    // A above B, C diagonally off B. AR doubles the x-deltas:
    // BA = (0, -0.3); BC = (0.3*2, 0.3) = (0.6, 0.3)
    // cos θ = (0*0.6 + (-0.3)*0.3) / (0.3 * sqrt(0.6²+0.3²)) = -0.4472 → 116.6°
    // At AR=1 the same points give 135° — confirming the scaling is exercised.
    const points: PlacedPoint[] = [
      { id: 'a', x: 0.5, y: 0.2 },
      { id: 'b', x: 0.5, y: 0.5 },
      { id: 'c', x: 0.8, y: 0.8 },
    ];
    const defs: AngleDefinition[] = [{
      id: 'corner', label: 'Corner', pointA: 'a', pointB: 'b', pointC: 'c',
      reference: 'ab_to_c', normalRange: '—',
    }];
    expect(computeBikeAngles(points, defs, 2)[0].value).toBeCloseTo(116.6, 1);
  });
});

describe('computeBikeAngles — status from green band', () => {
  const defWithBand = (green?: [number, number]): AngleDefinition[] => [{
    id: 'seat_tube_angle', label: 'Seat Tube Angle',
    pointA: 'bb_centre', pointB: 'seat_tube_top',
    reference: 'horizontal', normalRange: '72–74°', green,
  }];
  // ~73° tube at AR=1: dx=0.1, |dy|=0.327 → atan2(0.327, 0.1) ≈ 73°
  const points: PlacedPoint[] = [
    { id: 'bb_centre',     x: 0.5, y: 0.8 },
    { id: 'seat_tube_top', x: 0.6, y: 0.473 },
  ];

  it('marks values inside the band green', () => {
    expect(computeBikeAngles(points, defWithBand([72, 74]), 1)[0].status).toBe('green');
  });

  it('marks values outside the band amber', () => {
    expect(computeBikeAngles(points, defWithBand([74, 76]), 1)[0].status).toBe('amber');
  });

  it('marks values without a band unknown', () => {
    expect(computeBikeAngles(points, defWithBand(undefined), 1)[0].status).toBe('unknown');
  });
});

describe('anglePointPairs', () => {
  it('derives connection pairs from two-point and three-point definitions', () => {
    const defs: AngleDefinition[] = [
      { id: 'x', label: 'X', pointA: 'a', pointB: 'b', reference: 'horizontal', normalRange: '—' },
      { id: 'y', label: 'Y', pointA: 'p', pointB: 'q', pointC: 'r', reference: 'ab_to_c', normalRange: '—' },
    ];
    expect(anglePointPairs(defs)).toEqual([['a', 'b'], ['p', 'q'], ['q', 'r']]);
  });
});
