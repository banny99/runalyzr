export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type LandmarkArray = Landmark[];

export interface FrameData {
  timestamp: number;
  landmarks: LandmarkArray;
  worldLandmarks: LandmarkArray;
}

export type CameraView = 'sagittal' | 'frontal' | 'rear' | 'unknown';
export type MetricStatus = 'green' | 'amber' | 'red' | 'unknown';

export interface MetricResult {
  value: number;
  status: MetricStatus;
  unit: string;
}

export interface ReportSection {
  title: string;
  metrics: Array<{ label: string; result: MetricResult; normalRange?: string }>;
  findings: string[];
  /** Optional annotated photo rendered above the metric table. */
  image?: { dataUrl: string; aspectRatio: number };
}

export interface ReportMeta {
  title: string;
  appName: string;
  clientName: string;
  notes: string;
  date: string;
}
