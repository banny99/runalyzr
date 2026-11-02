import { describe, it, expect } from 'vitest';
import { BIKE_SETTINGS_SECTIONS } from './thresholdStores';
import { THRESHOLDS } from '../analysis/thresholds';
import { FIT_THRESHOLDS } from '../analysis/fitThresholds';
import { GEOMETRY_THRESHOLDS } from '../analysis/geometryThresholds';

const tableFor = (title: string): object =>
  title.startsWith('Ride') ? THRESHOLDS : title.startsWith('Fit') ? FIT_THRESHOLDS : GEOMETRY_THRESHOLDS;

describe('BIKE_SETTINGS_SECTIONS', () => {
  it('has the seven sections in order', () => {
    expect(BIKE_SETTINGS_SECTIONS.map((s) => s.title)).toEqual([
      'Ride — side view', 'Ride — rear view', 'Ride — front view',
      'Fit — side view', 'Fit — aero', 'Fit — rear & front', 'Bike geometry',
    ]);
  });

  it('every row key exists in its section defaults table', () => {
    for (const section of BIKE_SETTINGS_SECTIONS) {
      for (const row of section.rows) {
        expect(Object.keys(tableFor(section.title)), `${section.title}: ${row.key}`).toContain(row.key);
      }
    }
  });

  it('covers every Fit and geometry id exactly once', () => {
    const keysOf = (prefix: string) =>
      BIKE_SETTINGS_SECTIONS.filter((s) => s.title.startsWith(prefix)).flatMap((s) => s.rows.map((r) => r.key));
    expect(keysOf('Fit')).toHaveLength(14);
    expect([...keysOf('Fit')].sort()).toEqual(Object.keys(FIT_THRESHOLDS).sort());
    expect(keysOf('Bike geometry')).toHaveLength(6);
    expect([...keysOf('Bike geometry')].sort()).toEqual(Object.keys(GEOMETRY_THRESHOLDS).sort());
  });

  it('marks only saddle_tilt and bar_drop_angle as signed', () => {
    const signed = BIKE_SETTINGS_SECTIONS.flatMap((s) => s.rows).filter((r) => r.signed).map((r) => r.key);
    expect(signed.sort()).toEqual(['bar_drop_angle', 'saddle_tilt']);
  });
});
