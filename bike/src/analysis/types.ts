import type { MetricResult, MetricStatus, LandmarkArray } from '@runalyzr/shared/types';
export type { CameraView, MetricStatus, MetricResult, Landmark, LandmarkArray, FrameData } from '@runalyzr/shared/types';

export type BikeView = 'sagittal' | 'rear' | 'front';

// ── Pedal cycle detection ─────────────────────────────────────────────────

export type PedalPhase = 'tdc' | 'bdc';

export interface PedalEvent {
  phase: PedalPhase;
  side: 'left' | 'right';
  frameIndex: number;
  timestamp: number;
}

export interface PedalCycle {
  side: 'left' | 'right';
  tdcFrame: number;
  bdcFrame: number;
  startFrame: number;
  endFrame: number;
}

// ── Ride analysis results ──────────────────────────────────────────────────

export interface SagittalMetrics extends Record<string, MetricResult | null> {
  kneeExtensionBDC:       MetricResult | null;
  kneeFlexionTDC:         MetricResult | null;
  hipAngleTDC:            MetricResult | null;
  hipVerticalOscillation: MetricResult | null;
  torsoAngle:             MetricResult | null;
  pelvicTilt:             MetricResult | null;
  elbowAngle:             MetricResult | null;
  shoulderAngle:          MetricResult | null;
  reachAngle:             MetricResult | null;
  wristAngle:             MetricResult | null;
  ankleAnkling:           MetricResult | null;
  cadence:                MetricResult | null;
}

export interface RearMetrics extends Record<string, MetricResult | null> {
  hipRock:           MetricResult | null;
  pelvicObliquity:   MetricResult | null;
  kneeVarusValgus:   MetricResult | null;
  heelAlignment:     MetricResult | null;
}

export interface FrontMetrics extends Record<string, MetricResult | null> {
  kneeSymmetry:       MetricResult | null;
  elbowWidthSymmetry: MetricResult | null;
  shoulderLevel:      MetricResult | null;
  lateralTrunkLean:   MetricResult | null;
  headNeckPosition:   MetricResult | null;
}

export interface RideAnalysisResults {
  sagittal: SagittalMetrics | null;
  rear:     RearMetrics | null;
  front:    FrontMetrics | null;
}

// ── Bike geometry fit ─────────────────────────────────────────────────────

export interface PlacedPoint {
  id: string;
  x: number; // 0–1 normalised within the photo (x / image width)
  y: number; // 0–1 normalised within the photo (y / image height)
}

export interface BikeAngleMeasurement {
  id: string;
  label: string;
  value: number;      // degrees, rounded to 1 dp
  normalRange: string;
  status: MetricStatus; // green inside the default band, amber outside, unknown when no band
}

export interface BikeGeometryResult {
  stepId: string;
  stepName: string;
  imageDataUrl: string;  // annotated full-resolution render (photo + dots + lines + labels)
  imageAspect: number;   // naturalWidth / naturalHeight — needed for PDF layout
  points: PlacedPoint[];
  angles: BikeAngleMeasurement[];
}

// ── Fit mode ──────────────────────────────────────────────────────────────

export interface FitMeasurement {
  label: string;
  value: number;
  unit: string;
  normalRange?: string;
  status: MetricStatus; // green inside the default band, amber outside, unknown when no band
}

export interface FitPositionResult {
  positionId: string;
  positionName: string;
  landmarks: LandmarkArray;
  worldLandmarks: LandmarkArray;
  measurements: FitMeasurement[];
  imageDataUrl: string;  // annotated full-resolution render (photo + skeleton)
  imageAspect: number;   // naturalWidth / naturalHeight — needed for PDF layout
}

export interface FitSessionResults {
  positions: FitPositionResult[];
  bikeGeometry: BikeGeometryResult[];
}

// ── Shared metric toggle state ─────────────────────────────────────────────

export type MetricKey =
  | keyof SagittalMetrics
  | keyof RearMetrics
  | keyof FrontMetrics;

export type MetricToggleState = Partial<Record<MetricKey, boolean>>;

// ── Report ────────────────────────────────────────────────────────────────

export interface BikeReportParams {
  clientName: string;
  notes: string;
  rideResults: RideAnalysisResults | null;
  fitResults: FitSessionResults | null;
  enabledMetrics: MetricToggleState;
}
