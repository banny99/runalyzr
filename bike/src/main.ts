import './ui/styles.css';
import { initLandmarker } from '@runalyzr/shared/pose';
import { MEDIAPIPE_CDN, HEAVY_MODEL_URL } from './config/defaults';
import { createProcessingLoop } from './pose/processing';
import { initOverlay } from './ui/overlay';
import { initVideoPlayer, startCamera, stopCamera } from './ui/videoPlayer';
import { initFitGuide } from './ui/fitGuide';
import { renderRideDashboard, showAnalysisWarning, clearAnalysisWarning } from './ui/dashboard';
import { detectPedalEvents, segmentPedalCycles } from './analysis/pedalDetection';
import { calculateSagittalMetrics } from './analysis/metrics/sagittal';
import { calculateRearMetrics } from './analysis/metrics/rear';
import { calculateFrontMetrics } from './analysis/metrics/front';
import { generateSagittalFindings, generateRearFindings, generateFrontFindings } from './analysis/findings';
import type { Finding } from './analysis/findings';
import type { RideAnalysisResults, FitSessionResults, MetricToggleState, MetricKey } from './analysis/types';
import { evaluateSetupChecks } from './analysis/setupChecks';
import type { FrameData, LandmarkArray } from '@runalyzr/shared/types';

async function main() {
  const loadingEl = document.getElementById('loading-msg') as HTMLElement;
  loadingEl.hidden = false;

  // ── Mode switching ──────────────────────────────────────────────────
  const fitModeEl   = document.getElementById('fit-mode')  as HTMLElement;
  const rideModeEl  = document.getElementById('ride-mode') as HTMLElement;

  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = (tab as HTMLElement).dataset.mode as 'fit' | 'ride';
      document.querySelectorAll('.mode-tab').forEach((t) =>
        (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.mode === mode));
      fitModeEl.classList.toggle('active', mode === 'fit');
      rideModeEl.classList.toggle('active', mode === 'ride');
      document.querySelectorAll('.tab').forEach((t) =>
        (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.tab === 'camera'));
      document.querySelectorAll('.tab-panel').forEach((p) =>
        (p as HTMLElement).classList.toggle('active', (p as HTMLElement).dataset.tab === 'camera'));
    });
  });

  // ── Phone tabs ──────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab!;
      document.querySelectorAll('.tab').forEach((t) =>
        (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.tab === tabName));
      document.querySelectorAll('.tab-panel').forEach((p) =>
        (p as HTMLElement).classList.toggle('active', (p as HTMLElement).dataset.tab === tabName));
    });
  });

  // ── Report modal ────────────────────────────────────────────────────
  const reportModalEl   = document.getElementById('report-modal')     as HTMLElement;
  const modalScrimEl    = document.getElementById('modal-scrim')      as HTMLElement;
  const modalCloseBtn   = document.getElementById('modal-close')      as HTMLButtonElement;
  const generatePdfBtn  = document.getElementById('generate-pdf-btn') as HTMLButtonElement;
  const clientNameInput = document.getElementById('client-name')      as HTMLInputElement;
  const sessionNotesEl  = document.getElementById('session-notes')    as HTMLTextAreaElement;

  function openReportModal()  { reportModalEl.hidden = false; }
  function closeReportModal() { reportModalEl.hidden = true; }
  modalCloseBtn.addEventListener('click', closeReportModal);
  modalScrimEl.addEventListener('click',  closeReportModal);

  // ── State ───────────────────────────────────────────────────────────
  let lastRideResults:  RideAnalysisResults | null = null;
  let lastFitResults:   FitSessionResults  | null = null;
  let currentRideView:  'sagittal' | 'rear' | 'front' = 'sagittal';
  const enabledMetrics: MetricToggleState = {};

  let lastSagFindings:   Finding[] = [];
  let lastRearFindings:  Finding[] = [];
  let lastFrontFindings: Finding[] = [];

  // ── Init MediaPipe ──────────────────────────────────────────────────
  let landmarker: Awaited<ReturnType<typeof initLandmarker>>;
  try {
    landmarker = await initLandmarker(HEAVY_MODEL_URL, MEDIAPIPE_CDN);
  } catch (err) {
    loadingEl.textContent = '⚠ Failed to load pose model. Check your connection and reload.';
    (loadingEl as HTMLElement).style.cssText +=
      '; color:#ef4444; background:#1a1a1a; padding:1rem; border-radius:8px;';
    console.error('initLandmarker failed:', err);
    return;
  }
  loadingEl.hidden = true;

  // ══════════════════════════════════════════════════════════════════
  // FIT MODE
  // ══════════════════════════════════════════════════════════════════

  const fitIdleEl         = document.getElementById('fit-idle')          as HTMLElement;
  const fitStartBtn       = document.getElementById('fit-start-btn')     as HTMLButtonElement;
  const fitDiscardBtn     = document.getElementById('fit-discard-btn')   as HTMLButtonElement;
  const fitGuidePanel     = document.getElementById('fit-guide-panel')   as HTMLElement;
  const fitResultsEmpty   = document.getElementById('fit-results-empty') as HTMLElement;
  const fitResultsContent = document.getElementById('fit-results-content') as HTMLElement;
  const fitMetricsSections = document.getElementById('fit-metrics-sections') as HTMLElement;
  const fitExportBtn      = document.getElementById('fit-export-btn')    as HTMLElement;

  const fitGuide = initFitGuide(
    landmarker,
    {
      stepLabel:        document.getElementById('fit-step-label')       as HTMLElement,
      viewLabel:        document.getElementById('fit-view-label')       as HTMLElement,
      positionName:     document.getElementById('fit-position-name')    as HTMLElement,
      instructions:     document.getElementById('fit-instructions')     as HTMLElement,
      canvasWrap:       document.getElementById('fit-canvas-wrap')      as HTMLElement,
      canvas:           document.getElementById('fit-canvas')           as HTMLCanvasElement,
      uploadArea:       document.getElementById('fit-upload-area')      as HTMLElement,
      fileInput:        document.getElementById('fit-file-input')       as HTMLInputElement,
      uploadBtn:        document.getElementById('fit-upload-btn')       as HTMLButtonElement,
      prevBtn:          document.getElementById('fit-prev-btn')         as HTMLButtonElement,
      retakeBtn:        document.getElementById('fit-retake-btn')       as HTMLButtonElement,
      nextBtn:          document.getElementById('fit-next-btn')         as HTMLButtonElement,
      skipBtn:          document.getElementById('fit-skip-btn')         as HTMLButtonElement,
      guidePanel:       fitGuidePanel,
      positionSelectEl: document.getElementById('fit-position-select')  as HTMLElement,
      stepUiEl:         document.getElementById('fit-step-ui')          as HTMLElement,
      resultsEmpty:     fitResultsEmpty,
      resultsSections:  fitMetricsSections,
      resultsContent:   fitResultsContent,
      exportBtn:        fitExportBtn,
    },
    (results) => {
      lastFitResults = results;
    },
  );

  fitStartBtn.addEventListener('click', () => {
    fitIdleEl.hidden = true;
    fitGuide.start();
  });

  fitDiscardBtn.addEventListener('click', () => {
    fitGuide.reset();
    fitIdleEl.hidden = false;
  });

  fitExportBtn.addEventListener('click', () => openReportModal());

  // ══════════════════════════════════════════════════════════════════
  // RIDE MODE
  // ══════════════════════════════════════════════════════════════════

  const rideVideo      = document.getElementById('ride-video')         as HTMLVideoElement;
  const rideCanvas     = document.getElementById('ride-overlay')       as HTMLCanvasElement;
  const rideFileInput  = document.getElementById('ride-file-input')    as HTMLInputElement;
  const rideVideoWrap  = document.getElementById('ride-video-wrap')    as HTMLElement;
  const rideIdle       = document.getElementById('ride-idle')          as HTMLElement;
  const rideRecordBtn  = document.getElementById('ride-record-btn')    as HTMLButtonElement;
  const rideCameraBtn      = document.getElementById('ride-camera-btn')      as HTMLButtonElement;
  const rideCameraOpenBtn  = document.getElementById('ride-camera-open-btn')  as HTMLButtonElement;
  const rideCameraCloseBtn = document.getElementById('ride-camera-close-btn') as HTMLButtonElement;
  const rideNewBtn     = document.getElementById('ride-new-btn')       as HTMLButtonElement;
  const rideUploadBtn  = document.getElementById('ride-upload-btn')    as HTMLButtonElement;
  const rideResultsEmpty   = document.getElementById('ride-results-empty')   as HTMLElement;
  const rideResultsContent = document.getElementById('ride-results-content') as HTMLElement;
  const rideMetricsSections = document.getElementById('ride-metrics-sections') as HTMLElement;
  const rideFindingsEl     = document.getElementById('ride-findings')        as HTMLElement;
  const rideExportBtn      = document.getElementById('ride-export-btn')      as HTMLElement;
  const setupOverlayEl     = document.getElementById('setup-overlay')        as HTMLElement;
  const setupToggleEl      = document.getElementById('setup-toggle')         as HTMLButtonElement;
  const setupToggleIconEl  = document.getElementById('setup-toggle-icon')    as HTMLElement;
  const setupPanelEl       = document.getElementById('setup-panel')          as HTMLElement;

  const overlay = initOverlay(rideCanvas, rideVideo);

  // ── Setup checks (live camera only) ────────────────────────────────────
  const setupBuffer: (LandmarkArray | null)[] = [];
  const SETUP_BUFFER = 20;

  setupToggleEl.addEventListener('click', () => {
    setupPanelEl.classList.toggle('open');
  });

  function applyCheck(id: string, pass: boolean, passText: string, failText: string,
                      pending = false): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = pass ? passText : failText;
    el.className   = pending ? 'check-pending' : (pass ? 'check-pass' : 'check-fail');
  }

  function updateSetupChecks(lms: LandmarkArray | null) {
    setupBuffer.push(lms);
    if (setupBuffer.length > SETUP_BUFFER) setupBuffer.shift();

    const checks = evaluateSetupChecks(setupBuffer, currentRideView);
    const isSag  = currentRideView === 'sagittal';

    applyCheck('check-stable',      checks.stable,         'Pose detected',              'Detecting pose…', !checks.stable);
    applyCheck('check-body-frame',  checks.bodyInFrame,    'Full body in frame',          'Move rider fully into frame', !checks.stable);
    applyCheck('check-lighting',    checks.goodLighting,   'Adequate lighting',           'Improve lighting');
    applyCheck('check-orientation', checks.orientation,
      isSag ? 'Sideways to camera'        : 'Facing camera directly',
      isSag ? 'Turn rider sideways'       : 'Face camera from behind/front',
      !checks.stable);
    applyCheck('check-distance',    checks.goodDistance,
      isSag ? 'Good distance'             : 'Good width coverage',
      isSag ? 'Adjust distance'           : 'Adjust distance',
      !checks.stable);
    applyCheck('check-camera-pos',  checks.cameraPosition,
      isSag ? 'Camera at hip height'      : 'Rider centred in frame',
      isSag ? 'Adjust camera height'      : 'Centre rider horizontally',
      !checks.stable);

    document.getElementById('setup-hint')!.textContent = checks.hint;

    setupToggleEl.classList.toggle('pill-green', checks.allPassed);
    setupToggleEl.classList.toggle('pill-red',   !checks.allPassed);
    setupToggleIconEl.textContent = checks.allPassed ? '✓' : '⚠';

    rideRecordBtn.disabled = !checks.allPassed;
  }

  // View selection for ride mode
  document.querySelectorAll('.view-btn[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentRideView = (btn as HTMLElement).dataset.view as 'sagittal' | 'rear' | 'front';
      document.querySelectorAll('.view-btn').forEach((b) =>
        (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.view === currentRideView));
      const frames = loop.getFrames().length > 0 ? loop.getFrames() : [...cameraFrames];
      if (frames.length >= 30) runRideAnalysis(frames);
    });
  });

  function rerenderRideDashboard() {
    renderRideDashboard(
      lastRideResults?.sagittal ?? null,
      lastRideResults?.rear ?? null,
      lastRideResults?.front ?? null,
      lastSagFindings,
      lastRearFindings,
      lastFrontFindings,
      enabledMetrics,
      rideMetricsSections,
      rideFindingsEl,
      rideExportBtn,
      rideResultsEmpty,
      rideResultsContent,
      (key: string) => {
        if (enabledMetrics[key as MetricKey] !== false) {
          enabledMetrics[key as MetricKey] = false;
        } else {
          delete enabledMetrics[key as MetricKey];
        }
        rerenderRideDashboard();
      },
    );
  }

  function runRideAnalysis(frames: FrameData[]): void {
    clearAnalysisWarning(rideResultsContent);
    if (frames.length < 30) {
      showAnalysisWarning('Not enough footage — record at least 5 seconds.', rideResultsContent);
      return;
    }
    const durationSec = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000;
    const fps = frames.length / durationSec;

    const events = detectPedalEvents(frames, fps);
    const cycles = segmentPedalCycles(events);

    const sagittal = currentRideView === 'sagittal'
      ? calculateSagittalMetrics(frames, fps, events, cycles)
      : null;
    const rear = currentRideView === 'rear'
      ? calculateRearMetrics(frames, events)
      : null;
    const front = currentRideView === 'front'
      ? calculateFrontMetrics(frames, events)
      : null;

    lastRideResults = { sagittal, rear, front };

    lastSagFindings   = sagittal ? generateSagittalFindings(sagittal) : [];
    lastRearFindings  = rear     ? generateRearFindings(rear)         : [];
    lastFrontFindings = front    ? generateFrontFindings(front)       : [];

    rerenderRideDashboard();

    if (window.innerWidth < 768) {
      document.querySelectorAll('.tab').forEach((t) =>
        (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.tab === 'results'));
      document.querySelectorAll('.tab-panel').forEach((p) =>
        (p as HTMLElement).classList.toggle('active', (p as HTMLElement).dataset.tab === 'results'));
    }
  }

  // Video file handling
  const loop = createProcessingLoop(landmarker, rideVideo, (landmarks: LandmarkArray) => {
    overlay.drawSkeleton(landmarks, {});
  });

  rideUploadBtn.addEventListener('click', () => rideFileInput.click());

  initVideoPlayer(rideVideo, rideFileInput, {
    onLoadedMetadata: () => {
      rideIdle.hidden = true;
      rideVideoWrap.hidden = false;
      rideCameraOpenBtn.hidden = false;
      rideNewBtn.hidden = false;
      overlay.syncSizeIfReady();
    },
    onPlay:   () => { overlay.syncSize(); loop.start(); },
    onPause:  () => { loop.stop(); runRideAnalysis(loop.getFrames()); },
    onSeeked: () => {
      overlay.syncSize();
      const lm = loop.getCurrentLandmarks();
      if (lm) overlay.drawSkeleton(lm, {});
    },
  });

  rideVideo.addEventListener('ended', () => { loop.stop(); runRideAnalysis(loop.getFrames()); });

  // Camera mode for ride
  let cameraState: string = 'closed';
  let cameraRunning = false;
  let cameraRafId = 0;
  const cameraFrames: FrameData[] = [];

  function resetRideVideo() {
    loop.stop();
    if (cameraRunning) {
      cameraRunning = false;
      cancelAnimationFrame(cameraRafId);
      stopCamera(rideVideo);
      rideCameraOpenBtn.hidden = false;
      rideCameraCloseBtn.hidden = true;
      rideRecordBtn.hidden = true;
      rideRecordBtn.disabled = true;
      rideRecordBtn.classList.remove('recording');
      setupBuffer.length = 0;
      cameraState = 'closed';
    }
    if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
    mediaRecorder = null;
    cameraFrames.length = 0;
    rideVideo.removeAttribute('src');
    rideVideo.load();
    rideCameraOpenBtn.hidden = true;
    setupOverlayEl.classList.remove('visible');
    rideIdle.hidden = false;
    rideVideoWrap.hidden = true;
    rideNewBtn.hidden = true;
  }

  rideNewBtn.addEventListener('click', resetRideVideo);
  rideCameraBtn.addEventListener('click', () => rideCameraOpenBtn.click());
  let mediaRecorder: MediaRecorder | null = null;
  const recordedChunks: Blob[] = [];
  let recordingLockTimeout: ReturnType<typeof window.setTimeout> | null = null;

  rideCameraOpenBtn.addEventListener('click', async () => {
    try {
      await startCamera(rideVideo);
      cameraState = 'closed';
      cameraRunning = true;
      setupBuffer.length = 0;
      rideIdle.hidden = true;
      rideVideoWrap.hidden = false;
      rideNewBtn.hidden = false;
      rideCameraOpenBtn.hidden = true;
      rideCameraCloseBtn.hidden = false;
      rideRecordBtn.hidden = false;
      rideRecordBtn.disabled = true;
      setupOverlayEl.classList.add('visible');
      setupPanelEl.classList.add('open');
      overlay.syncSize();
      rideVideo.addEventListener('resize', () => overlay.syncSize(), { once: true });

      (function cameraLoop() {
        if (!cameraRunning) return;
        if (rideVideo.readyState >= 2) {
          const result = landmarker.detectForVideo(rideVideo, performance.now());
          if (result.landmarks.length > 0) {
            const lms = result.landmarks[0] as LandmarkArray;
            overlay.drawSkeleton(lms, {});
            updateSetupChecks(lms);
            if (cameraState === 'recording' && cameraFrames.length < 9000) {
              cameraFrames.push({
                landmarks: lms,
                worldLandmarks: result.worldLandmarks[0] as LandmarkArray,
                timestamp: performance.now(),
              });
            }
          } else {
            updateSetupChecks(null);
          }
        }
        cameraRafId = requestAnimationFrame(cameraLoop);
      })();
    } catch (err) {
      console.error('Camera error:', err);
    }
  });

  rideCameraCloseBtn.addEventListener('click', () => {
    cameraRunning = false;
    cancelAnimationFrame(cameraRafId);
    stopCamera(rideVideo);
    if (cameraState === 'recording' && cameraFrames.length > 0) {
      runRideAnalysis([...cameraFrames]);
    }
    cameraState = 'closed';
    if (recordingLockTimeout) {
      clearTimeout(recordingLockTimeout);
      recordingLockTimeout = null;
    }
    rideCanvas.width = 0;
    rideCanvas.height = 0;
    rideCameraOpenBtn.hidden = false;
    rideCameraCloseBtn.hidden = true;
    rideRecordBtn.hidden = true;
    rideRecordBtn.disabled = true;
    rideRecordBtn.classList.remove('recording');
    setupOverlayEl.classList.remove('visible');
  });

  rideRecordBtn.addEventListener('click', () => {
    if (cameraState !== 'recording') {
      cameraState = 'recording';
      cameraFrames.length = 0;
      recordedChunks.length = 0;
      rideRecordBtn.classList.add('recording');
      rideRecordBtn.textContent = '⏹';

      rideRecordBtn.disabled = true;
      if (recordingLockTimeout) clearTimeout(recordingLockTimeout);
      recordingLockTimeout = window.setTimeout(() => {
        recordingLockTimeout = null;
        rideRecordBtn.disabled = false;
      }, 5000);

      if (typeof MediaRecorder !== 'undefined' && rideVideo.srcObject) {
        const mimeType = ['video/webm;codecs=vp9', 'video/webm']
          .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
        try {
          mediaRecorder = new MediaRecorder(rideVideo.srcObject as MediaStream,
            mimeType ? { mimeType } : {});
          mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
          mediaRecorder.start(100);
        } catch { mediaRecorder = null; }
      }
    } else {
      cameraState = 'closed';
      rideRecordBtn.classList.remove('recording');
      rideRecordBtn.textContent = '⏺';
      if (recordingLockTimeout) {
        clearTimeout(recordingLockTimeout);
        recordingLockTimeout = null;
      }
      rideRecordBtn.disabled = false;
      if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
      mediaRecorder = null;
      runRideAnalysis([...cameraFrames]);
    }
  });

  rideExportBtn.addEventListener('click', () => openReportModal());

  // ── PDF generation ──────────────────────────────────────────────────
  generatePdfBtn.addEventListener('click', async () => {
    const { generateBikeReport } = await import('./report/pdfGenerator');
    generateBikeReport({
      clientName: clientNameInput.value,
      notes: sessionNotesEl.value,
      rideResults: lastRideResults,
      fitResults: lastFitResults,
      enabledMetrics,
    });
    closeReportModal();
  });
}

main().catch(console.error);
