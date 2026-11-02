import { createThresholdStore, greenOnly, noBand } from '@runalyzr/shared/analysis';
import type { ThresholdEntry, ThresholdStore } from '@runalyzr/shared/analysis';

/**
 * Stable ids for Fit-photo measurements. These strings are storage keys for
 * device-saved band overrides — never rename one after release. One id covers
 * every position/leg that reports the measurement.
 */
export type FitMetricId =
  | 'torsoAngle' | 'elbowAngle' | 'reachAngle' | 'shoulderAngle'
  | 'kneeExtensionBDC' | 'shankKops' | 'hipAngle3' | 'hipExtension9'
  | 'elbowAngleAero' | 'reachAngleAero'
  | 'pelvicObliquity' | 'kneeFrontalAlignment' | 'shoulderTilt' | 'lateralTrunkLean';

// Fit and ride-video bands are separate settings even where they measure the
// same thing. Side reach/shoulder are information-only until a band is added.
export const FIT_THRESHOLDS: Record<FitMetricId, ThresholdEntry> = {
  torsoAngle:           greenOnly([35, 50], '°'),
  elbowAngle:           greenOnly([90, 160], '°'),
  reachAngle:           noBand('°', [50, 80]),
  shoulderAngle:        noBand('°', [80, 100]),
  kneeExtensionBDC:     greenOnly([145, 155], '°'),
  shankKops:            greenOnly([0, 2], '°'),
  hipAngle3:            greenOnly([45, 65], '°'),
  hipExtension9:        greenOnly([160, 180], '°'),
  elbowAngleAero:       greenOnly([80, 110], '°'),
  reachAngleAero:       greenOnly([15, 35], '°'),
  pelvicObliquity:      greenOnly([0, 3], '°'),
  kneeFrontalAlignment: greenOnly([0, 5], '°'),
  shoulderTilt:         greenOnly([0, 2], '°'),
  lateralTrunkLean:     greenOnly([0, 2], '°'),
};

export const fitThresholds: ThresholdStore<FitMetricId> =
  createThresholdStore('bike.thresholds.fit.v1', FIT_THRESHOLDS);
