import { rideThresholds } from '../analysis/thresholds';

// The store itself lives in analysis/thresholds.ts (evaluateMetric reads it);
// re-exported here so UI/report code has one settings entry point.
export { rideThresholds };
