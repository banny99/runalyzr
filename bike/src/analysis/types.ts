import type { MetricResult, LandmarkArray } from '@runalyzr/shared/types';
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

export interface SagittalMetrics {
  kneeExtensionBDC:       MetricResult | null;
  kneeFlexionTDC:         MetricResult | null;
  hipAngleTDC:            MetricResult | null;
  hipVerticalOscillation: MetricResult | null;
  torsoAngle:             MetricResult | null;
  pelvicTilt:             MetricResult | null;
  elbowAngle:             MetricResult | null;
  wristAngle:             MetricResult | null;
  ankleAnkling:           MetricResult | null;
  cadence:                MetricResult | null;
}

export interface RearMetrics {
  hipRock:           MetricResult | null;
  pelvicObliquity:   MetricResult | null;
  kneeVarusValgus:   MetricResult | null;
  heelAlignment:     MetricResult | null;
}

export interface FrontMetrics {
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

// ── Fit mode ──────────────────────────────────────────────────────────────

export interface FitMeasurement {
  label: string;
  value: number;
  unit: string;
  normalRange?: string;
}

export interface FitPositionResult {
  positionId: string;
  positionName: string;
  landmarks: LandmarkArray;
  worldLandmarks: LandmarkArray;
  measurements: FitMeasurement[];
  imageDataUrl: string;
}

export interface FitSessionResults {
  positions: FitPositionResult[];
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
