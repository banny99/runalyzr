import { describe, it, expect, afterEach } from 'vitest';
import { evaluateThreshold, formatGreenRange } from '@runalyzr/shared/analysis';
import { GEOMETRY_THRESHOLDS, geometryThresholds } from './geometryThresholds';
import type { GeometryAngleId } from './geometryThresholds';

afterEach(() => geometryThresholds.resetAll());

describe('geometry defaults', () => {
  it('keep today\'s green bands', () => {
    const greens = Object.fromEntries(
      (Object.keys(GEOMETRY_THRESHOLDS) as GeometryAngleId[]).map((id) => [id, geometryThresholds.band(id)?.green]),
    );
    expect(greens).toEqual({
      seat_tube_angle: [72, 74], head_tube_angle: [71, 74], saddle_tilt: [-2, 2],
      bar_drop_angle: undefined, saddle_level: [0, 2], bar_level: [0, 2],
    });
  });

  it('saddle tilt: ±2° green, amber beyond, never red', () => {
    const entry = geometryThresholds.entry('saddle_tilt');
    expect(evaluateThreshold(-1.5, entry)).toBe('green');
    expect(evaluateThreshold(2.5, entry)).toBe('amber');
    expect(evaluateThreshold(-40, entry)).toBe('amber');
    expect(formatGreenRange(entry)).toBe('±2°');
  });

  it('bar drop is information only until a band is added', () => {
    const entry = () => geometryThresholds.entry('bar_drop_angle');
    expect(evaluateThreshold(5, entry())).toBe('unknown');
    expect(formatGreenRange(entry())).toBeUndefined();
    geometryThresholds.addBand('bar_drop_angle');
    expect(evaluateThreshold(5, entry())).toBe('green');
  });
});
