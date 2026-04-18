import { initVideoPlayer } from './ui/videoPlayer';
import { initLandmarker } from './pose/landmarker';
import { createProcessingLoop, detectCameraView } from './pose/processing';
import { initOverlay } from './ui/overlay';
import { renderDashboard, updateLiveMetrics } from './ui/dashboard';
import { angleBetweenThreePoints } from './analysis/angles';
import { detectGaitEvents, segmentGaitCycles } from './analysis/gaitDetection';
import { calculateAllMetrics } from './analysis/metrics';
import { generateFindings } from './analysis/findings';
import { LANDMARKS } from './config/defaults';
import type { LandmarkArray, AnalysisResults, MetricStatus } from './analysis/types';

async function main() {
  const loadingEl = document.createElement('div');
  loadingEl.id = 'loading-msg';
  loadingEl.textContent = 'Loading pose model…';
  document.body.appendChild(loadingEl);

  const video = document.getElementById('video') as HTMLVideoElement;
  const canvas = document.getElementById('overlay') as HTMLCanvasElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const toggleOverlayBtn = document.getElementById('toggle-overlay') as HTMLButtonElement;
  const exportPdfBtn = document.getElementById('export-pdf') as HTMLButtonElement;

  const landmarker = await initLandmarker();
  loadingEl.remove();

  const overlay = initOverlay(canvas, video);
  let lastResults: AnalysisResults | null = null;
  let lastAnalysisFrameUrl: string | null = null;

  function buildJointStatuses(results: AnalysisResults): Partial<Record<number, MetricStatus>> {
    const s: Partial<Record<number, MetricStatus>> = {};
    const L = LANDMARKS;

    const set = (indices: number[], status: MetricStatus) => {
      indices.forEach((i) => { s[i] = status; });
    };

    if (results.kneeFlexionAtContact) {
      set([L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
        results.kneeFlexionAtContact.status);
    }
    if (results.pelvicDrop) {
      set([L.LEFT_HIP, L.RIGHT_HIP], results.pelvicDrop.status);
    }
    if (results.trunkLateralLean) {
      set([L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
        results.trunkLateralLean.status);
    }

    return s;
  }

  const loop = createProcessingLoop(landmarker, video, (landmarks: LandmarkArray) => {
    const statuses = lastResults ? buildJointStatuses(lastResults) : {};
    overlay.drawSkeleton(landmarks, statuses);

    const leftKneeAngle = angleBetweenThreePoints(
      landmarks[LANDMARKS.LEFT_HIP],
      landmarks[LANDMARKS.LEFT_KNEE],
      landmarks[LANDMARKS.LEFT_ANKLE],
    );
    const rightKneeAngle = angleBetweenThreePoints(
      landmarks[LANDMARKS.RIGHT_HIP],
      landmarks[LANDMARKS.RIGHT_KNEE],
      landmarks[LANDMARKS.RIGHT_ANKLE],
    );
    overlay.drawAngleLabel(landmarks, LANDMARKS.LEFT_KNEE, `${leftKneeAngle.toFixed(0)}°`);
    overlay.drawAngleLabel(landmarks, LANDMARKS.RIGHT_KNEE, `${rightKneeAngle.toFixed(0)}°`);

    const view = detectCameraView(landmarks);
    updateLiveMetrics(null, view, loop.getFps());
  });

  function runAnalysis() {
    const frames = loop.getFrames();
    if (frames.length < 30) return;

    const durationSec = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000;
    const fps = frames.length / durationSec;
    const view = detectCameraView(frames[frames.length - 1].landmarks);

    const gaitEvents = detectGaitEvents(frames, fps);
    const gaitCycles = segmentGaitCycles(gaitEvents);
    const results = calculateAllMetrics(frames, gaitEvents, gaitCycles, fps, view);
    const findings = generateFindings(results);

    lastResults = results;
    lastAnalysisFrameUrl = overlay.captureDataUrl();

    renderDashboard(results, findings);
    updateLiveMetrics(results.cadence?.value ?? null, view, fps);
  }

  initVideoPlayer(video, fileInput, {
    onLoadedMetadata: () => overlay.syncSize(),
    onPlay: () => loop.start(),
    onPause: () => { loop.stop(); runAnalysis(); },
    onSeeked: () => {
      const lm = loop.getCurrentLandmarks();
      if (lm) overlay.drawSkeleton(lm, lastResults ? buildJointStatuses(lastResults) : {});
    },
  });

  video.addEventListener('ended', () => { loop.stop(); runAnalysis(); });

  toggleOverlayBtn.addEventListener('click', () => {
    const isVisible = canvas.style.display !== 'none';
    overlay.setVisible(!isVisible);
    canvas.style.display = isVisible ? 'none' : '';
  });

  exportPdfBtn.addEventListener('click', async () => {
    if (!lastResults) return;
    const { generateReport } = await import('./report/pdfGenerator');
    const clientName = (document.getElementById('client-name') as HTMLInputElement).value;
    const notes = (document.getElementById('physio-notes') as HTMLTextAreaElement).value;
    generateReport({
      clientName,
      notes,
      metrics: lastResults,
      findings: generateFindings(lastResults),
      frameDataUrl: lastAnalysisFrameUrl,
    });
  });
}

main().catch(console.error);
