export interface Landmark {
  x: number;       // normalised 0–1 (left→right)
  y: number;       // normalised 0–1 (top→bottom, increases downward)
  z: number;       // normalised depth
  visibility?: number; // 0–1
}

export type LandmarkArray = Landmark[];

export interface FrameData {
  timestamp: number; // ms, from performance.now()
  landmarks: LandmarkArray;
  worldLandmarks: LandmarkArray; // true 3D metres, origin at hip centre, rotation-normalised
}

export type GaitEventType = 'footstrike' | 'toe_off';
export type Foot = 'left' | 'right';
export type CameraView = 'sagittal' | 'frontal' | 'unknown';
export type MetricStatus = 'green' | 'amber' | 'red' | 'unknown';

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

export interface MetricResult {
  value: number;
  status: MetricStatus;
  unit: string;
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
