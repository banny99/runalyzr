export type { Landmark, LandmarkArray, FrameData, CameraView, MetricStatus, MetricResult } from '@runalyzr/shared/types';

import type { MetricResult } from '@runalyzr/shared/types';

export type GaitEventType = 'footstrike' | 'toe_off';
export type Foot = 'left' | 'right';

export interface GaitEvent {
  type: GaitEventType;
  foot: Foot;
  frameIndex: number;
  timestamp: number;
}

export interface GaitCycle {
  foot: Foot;
  startFrame: number;
  endFrame: number;
  footstrikeFrame: number;
  toeOffFrame: number;
}

export interface AnalysisResults {
  kneeFlexionAtContact: MetricResult | null;
  hipAdduction: MetricResult | null;
  pelvicDrop: MetricResult | null;
  trunkLateralLean: MetricResult | null;
  ankleDorsiflexion: MetricResult | null;
  cadence: MetricResult | null;
  verticalOscillation: MetricResult | null;
  overstriding: MetricResult | null;
  strideSymmetry: MetricResult | null;
  groundContactTime: MetricResult | null;
}

export interface FindingItem {
  metric: keyof AnalysisResults;
  status: 'amber' | 'red';
  text: string;
}

export interface ReportParams {
  clientName: string;
  notes: string;
  metrics: AnalysisResults;
  findings: FindingItem[];
  frameDataUrl: string | null;
}
