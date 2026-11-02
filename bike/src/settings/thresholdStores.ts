import { rideThresholds } from '../analysis/thresholds';
import { fitThresholds } from '../analysis/fitThresholds';
import { geometryThresholds } from '../analysis/geometryThresholds';

// The stores themselves live next to their tables in analysis/ (evaluators read
// them; defining them here would create an import cycle). Re-exported here so
// UI/report code has one settings entry point.
export { rideThresholds, fitThresholds, geometryThresholds };
