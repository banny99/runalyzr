import { createThresholdStore, greenOnly, noBand } from '@runalyzr/shared/analysis';
import type { ThresholdEntry, ThresholdStore } from '@runalyzr/shared/analysis';

/**
 * Stable ids for bike-geometry angles. These strings are storage keys for
 * device-saved band overrides — never rename one after release.
 */
export type GeometryAngleId =
  | 'seat_tube_angle' | 'head_tube_angle' | 'saddle_tilt'
  | 'bar_drop_angle' | 'saddle_level' | 'bar_level';

// Bar drop depends on rider/discipline, so it is information-only until a band is added.
export const GEOMETRY_THRESHOLDS: Record<GeometryAngleId, ThresholdEntry> = {
  seat_tube_angle: greenOnly([72, 74], '°'),
  head_tube_angle: greenOnly([71, 74], '°'),
  saddle_tilt:     greenOnly([-2, 2], '°'),
  bar_drop_angle:  noBand('°', [0, 10]),
  saddle_level:    greenOnly([0, 2], '°'),
  bar_level:       greenOnly([0, 2], '°'),
};

export const geometryThresholds: ThresholdStore<GeometryAngleId> =
  createThresholdStore('bike.thresholds.geometry.v1', GEOMETRY_THRESHOLDS);
