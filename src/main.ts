import { initVideoPlayer, startCamera, stopCamera } from './ui/videoPlayer';
import { initLandmarker } from './pose/landmarker';
import { createProcessingLoop, detectCameraView } from './pose/processing';
import { initOverlay } from './ui/overlay';
import { renderDashboard, updateLiveMetrics } from './ui/dashboard';
import { angleBetweenThreePoints } from './analysis/angles';
import { detectGaitEvents, segmentGaitCycles } from './analysis/gaitDetection';
import { calculateAllMetrics } from './analysis/metrics';
import { generateFindings } from './analysis/findings';
import { LANDMARKS } from './config/defaults';
import type { LandmarkArray, AnalysisResults, MetricStatus, FrameData, CameraView } from './analysis/types';

// ── Setup-check helpers (pure, module-level) ────────────────────────────────

interface SetupChecks {
  bodyInFrame: boolean;
  goodDistance: boolean;
  goodLighting: boolean;
  stable: boolean;
  view: CameraView;
  allPassed: boolean;
  hint: string;
}

function evaluateSetupChecks(landmarks: LandmarkArray, consecutiveFrames: number): SetupChecks {
  const L = LANDMARKS;
  const key = [
    L.LEFT_SHOULDER, L.RIGHT_SHOULDER,
    L.LEFT_HIP, L.RIGHT_HIP,
    L.LEFT_KNEE, L.RIGHT_KNEE,
    L.LEFT_ANKLE, L.RIGHT_ANKLE,
  ];

  // All key joints clearly inside frame (not clipped to edge)
  const bodyInFrame = key.every((i) => {
    const lm = landmarks[i];
    return lm && lm.x > 0.03 && lm.x < 0.97 && lm.y > 0.02 && lm.y < 0.98;
  });

  // Body should fill 40–90 % of frame height (shoulder-to-ankle span)
  const shoulderY = Math.min(landmarks[L.LEFT_SHOULDER].y, landmarks[L.RIGHT_SHOULDER].y);
  const ankleY   = Math.max(landmarks[L.LEFT_ANKLE].y,    landmarks[L.RIGHT_ANKLE].y);
  const span = ankleY - shoulderY;
  const goodDistance = span > 0.40 && span < 0.90;

  // Lighting: average landmark visibility (MediaPipe provides 0–1 per landmark)
  const visAvg = key.reduce((s, i) => s + (landmarks[i]?.visibility ?? 1), 0) / key.length;
  const goodLighting = visAvg > 0.50;

  // Stable: landmark detected in ≥ 15 consecutive frames (~0.5 s at 30 fps)
  const stable = consecutiveFrames >= 15;

  const view = detectCameraView(landmarks);

  let hint = '';
  if (!stable)             hint = 'Hold still — detecting your pose…';
  else if (!bodyInFrame)   hint = 'Step back until your head and feet are fully visible.';
  else if (span < 0.40)    hint = 'Move closer to the camera.';
  else if (span > 0.90)    hint = 'Step further back — you are too close.';
  else if (!goodLighting)  hint = 'Improve lighting: face a window or bright light source.';

  return {
    bodyInFrame,
    goodDistance,
    goodLighting,
    stable,
    view,
    allPassed: bodyInFrame && goodDistance && goodLighting && stable,
    hint,
  };
}

/** Draw a dashed framing guide on the canvas (called after drawSkeleton). */
function drawSetupGuide(canvasEl: HTMLCanvasElement, ready: boolean): void {
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvasEl;

  ctx.save();
  ctx.strokeStyle = ready ? '#22c55e' : 'rgba(255,255,255,0.28)';
  ctx.lineWidth   = Math.max(2, w * 0.003);
  ctx.setLineDash([10, 5]);
  ctx.strokeRect(w * 0.18, h * 0.03, w * 0.64, h * 0.94);
  ctx.setLineDash([]);

  if (!ready) {
    ctx.fillStyle    = 'rgba(255,255,255,0.50)';
    ctx.font         = `${Math.max(11, Math.round(w * 0.022))}px system-ui, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Stand inside the guide — full body visible', w / 2, h - 6);
  }
  ctx.restore();
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const loadingEl = document.createElement('div');
  loadingEl.id = 'loading-msg';
  loadingEl.textContent = 'Loading pose model…';
  document.body.appendChild(loadingEl);

  const video            = document.getElementById('video')          as HTMLVideoElement;
  const canvas           = document.getElementById('overlay')        as HTMLCanvasElement;
  const fileInput        = document.getElementById('file-input')     as HTMLInputElement;
  const toggleOverlayBtn = document.getElementById('toggle-overlay') as HTMLButtonElement;
  const exportPdfBtn     = document.getElementById('export-pdf')     as HTMLButtonElement;
  const cameraOpenBtn    = document.getElementById('camera-open-btn') as HTMLButtonElement;
  const recordBtn        = document.getElementById('record-btn')     as HTMLButtonElement;
  const recIndicator     = document.getElementById('rec-indicator')  as HTMLElement;
  const recTimerEl       = document.getElementById('rec-timer')      as HTMLElement;
  const liveMetricsEl    = document.getElementById('live-metrics')   as HTMLElement;
  const setupGuidanceEl  = document.getElementById('setup-guidance') as HTMLElement;

  const landmarker = await initLandmarker();
  loadingEl.remove();

  const overlay = initOverlay(canvas, video);
  let lastResults: AnalysisResults | null = null;
  let lastAnalysisFrameUrl: string | null = null;

  function buildJointStatuses(results: AnalysisResults): Partial<Record<number, MetricStatus>> {
    const s: Partial<Record<number, MetricStatus>> = {};
    const L = LANDMARKS;
    const set = (indices: number[], status: MetricStatus) =>
      indices.forEach((i) => { s[i] = status; });
    if (results.kneeFlexionAtContact)
      set([L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
        results.kneeFlexionAtContact.status);
    if (results.pelvicDrop)
      set([L.LEFT_HIP, L.RIGHT_HIP], results.pelvicDrop.status);
    if (results.trunkLateralLean)
      set([L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
        results.trunkLateralLean.status);
    return s;
  }

  // Shared analysis runner (video file and camera)
  function runAnalysis(frames: FrameData[]): void {
    if (frames.length < 30) return;
    const durationSec = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000;
    const fps  = frames.length / durationSec;
    const view = detectCameraView(frames[frames.length - 1].landmarks);
    const gaitEvents = detectGaitEvents(frames, fps);
    const gaitCycles = segmentGaitCycles(gaitEvents);
    const results    = calculateAllMetrics(frames, gaitEvents, gaitCycles, fps, view);
    const findings   = generateFindings(results);
    lastResults          = results;
    lastAnalysisFrameUrl = overlay.captureDataUrl();
    renderDashboard(results, findings);
    updateLiveMetrics(results.cadence?.value ?? null, view, fps);
  }

  // Video file loop
  const loop = createProcessingLoop(landmarker, video, (landmarks: LandmarkArray) => {
    const statuses = lastResults ? buildJointStatuses(lastResults) : {};
    overlay.drawSkeleton(landmarks, statuses);
    const leftKnee  = angleBetweenThreePoints(
      landmarks[LANDMARKS.LEFT_HIP], landmarks[LANDMARKS.LEFT_KNEE], landmarks[LANDMARKS.LEFT_ANKLE]);
    const rightKnee = angleBetweenThreePoints(
      landmarks[LANDMARKS.RIGHT_HIP], landmarks[LANDMARKS.RIGHT_KNEE], landmarks[LANDMARKS.RIGHT_ANKLE]);
    overlay.drawAngleLabel(landmarks, LANDMARKS.LEFT_KNEE,  `${leftKnee.toFixed(0)}°`);
    overlay.drawAngleLabel(landmarks, LANDMARKS.RIGHT_KNEE, `${rightKnee.toFixed(0)}°`);
    updateLiveMetrics(null, detectCameraView(landmarks), loop.getFps());
  });

  initVideoPlayer(video, fileInput, {
    onLoadedMetadata: () => overlay.syncSize(),
    onPlay:           () => loop.start(),
    onPause:          () => { loop.stop(); runAnalysis(loop.getFrames()); },
    onSeeked:         () => {
      const lm = loop.getCurrentLandmarks();
      if (lm) overlay.drawSkeleton(lm, lastResults ? buildJointStatuses(lastResults) : {});
    },
  });

  video.addEventListener('ended', () => { loop.stop(); runAnalysis(loop.getFrames()); });

  // ── Camera mode state machine ───────────────────────────────────────────

  type CameraState = 'closed' | 'setup' | 'recording';
  let cameraState: CameraState = 'closed';
  let cameraRunning = false;            // separate flag so the rAF loop can exit cleanly
  let cameraLandmarker: Awaited<ReturnType<typeof initLandmarker>> | null = null;
  let cameraRafId = 0;
  let setupConsecutiveFrames = 0;
  let lastLandmarkTime = 0;
  let recTimerInterval = 0;
  let recStartTime = 0;
  const cameraFrames: FrameData[] = [];

  function showSetupPanel(): void {
    liveMetricsEl.style.display   = 'none';
    setupGuidanceEl.style.display = 'block';
  }
  function showLivePanel(): void {
    liveMetricsEl.style.display   = 'block';
    setupGuidanceEl.style.display = 'none';
  }

  function applyCheck(id: string, pass: boolean, passText: string, failText: string,
                      pending = false): void {
    const el = document.getElementById(id)!;
    el.textContent = pass ? passText : failText;
    el.className   = pending ? 'check-pending' : (pass ? 'check-pass' : 'check-fail');
  }

  function refreshSetupUI(checks: SetupChecks): void {
    applyCheck('check-stable',   checks.stable,       'Pose detected',        'Detecting pose…',    !checks.stable);
    applyCheck('check-body',     checks.bodyInFrame,  'Full body in frame',   'Full body not visible');
    applyCheck('check-distance', checks.goodDistance, 'Good distance',        'Adjust distance');
    applyCheck('check-lighting', checks.goodLighting, 'Adequate lighting',    'Improve lighting');
    const viewLabel = checks.view === 'sagittal' ? 'Side view (sagittal)'
                    : checks.view === 'frontal'  ? 'Front view (frontal)'
                    : 'Detecting view…';
    document.getElementById('check-view')!.textContent = `View: ${viewLabel}`;
    document.getElementById('setup-hint')!.textContent = checks.hint;
  }

  async function openCamera(): Promise<void> {
    cameraState = 'setup';
    cameraOpenBtn.textContent = 'Close Camera';
    loop.stop();

    await startCamera(video);
    overlay.syncSize();

    recordBtn.style.display = 'flex';
    recordBtn.disabled = true;
    recordBtn.classList.remove('ready', 'recording');
    recordBtn.setAttribute('aria-label', 'Start recording');
    showSetupPanel();

    setupConsecutiveFrames = 0;
    lastLandmarkTime = performance.now();
    cameraFrames.length = 0;
    cameraRunning = true;

    cameraLandmarker = await initLandmarker(undefined, 'LIVE_STREAM', (landmarks: LandmarkArray) => {
      if (!cameraRunning) return;

      lastLandmarkTime = performance.now();
      const statuses = lastResults ? buildJointStatuses(lastResults) : {};
      overlay.drawSkeleton(landmarks, statuses);

      if (cameraState === 'setup') {
        setupConsecutiveFrames++;
        const checks = evaluateSetupChecks(landmarks, setupConsecutiveFrames);
        refreshSetupUI(checks);
        drawSetupGuide(canvas, checks.allPassed);
        recordBtn.disabled = !checks.allPassed;
        recordBtn.classList.toggle('ready', checks.allPassed);

      } else if (cameraState === 'recording') {
        cameraFrames.push({ landmarks, timestamp: performance.now() });
        updateLiveMetrics(null, detectCameraView(landmarks), 30);
      }
    });

    (function cameraLoop() {
      if (!cameraRunning) return;
      // If detection is lost for > 500 ms, reset stability counter
      if (cameraState === 'setup' && performance.now() - lastLandmarkTime > 500) {
        setupConsecutiveFrames = 0;
      }
      if (video.readyState >= 2) {
        cameraLandmarker!.detectForVideo(video, performance.now());
      }
      cameraRafId = requestAnimationFrame(cameraLoop);
    })();
  }

  function closeCamera(): void {
    const wasRecording = cameraState === 'recording';
    cameraState = 'closed';
    cameraRunning = false;
    cancelAnimationFrame(cameraRafId);
    clearInterval(recTimerInterval);
    stopCamera(video);
    cameraLandmarker?.close();
    cameraLandmarker = null;

    cameraOpenBtn.textContent = 'Camera';
    recordBtn.style.display = 'none';
    recordBtn.classList.remove('ready', 'recording');
    recIndicator.style.display = 'none';
    showLivePanel();

    if (wasRecording) runAnalysis([...cameraFrames]);
  }

  function startRecording(): void {
    cameraState = 'recording';
    cameraFrames.length = 0;
    recordBtn.classList.remove('ready');
    recordBtn.classList.add('recording');
    recordBtn.disabled = false;
    recordBtn.setAttribute('aria-label', 'Stop recording');
    recIndicator.style.display = 'flex';
    showLivePanel();

    recStartTime = performance.now();
    recTimerInterval = window.setInterval(() => {
      const elapsed = Math.floor((performance.now() - recStartTime) / 1000);
      recTimerEl.textContent =
        `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    }, 1000);
  }

  function stopRecording(): void {
    cameraState = 'setup';
    clearInterval(recTimerInterval);
    recIndicator.style.display = 'none';
    recordBtn.classList.remove('recording', 'ready');
    recordBtn.disabled = true;
    recordBtn.setAttribute('aria-label', 'Start recording');
    setupConsecutiveFrames = 0;
    lastLandmarkTime = performance.now();
    showSetupPanel();

    runAnalysis([...cameraFrames]);
  }

  cameraOpenBtn.addEventListener('click', () => {
    if (cameraState === 'closed') openCamera().catch(console.error);
    else closeCamera();
  });

  recordBtn.addEventListener('click', () => {
    if (cameraState === 'setup')     startRecording();
    else if (cameraState === 'recording') stopRecording();
  });

  // ── Overlay toggle & PDF export ─────────────────────────────────────────

  toggleOverlayBtn.addEventListener('click', () => {
    const isVisible = canvas.style.display !== 'none';
    overlay.setVisible(!isVisible);
    canvas.style.display = isVisible ? 'none' : '';
  });

  exportPdfBtn.addEventListener('click', async () => {
    if (!lastResults) return;
    const { generateReport } = await import('./report/pdfGenerator');
    const clientName = (document.getElementById('client-name') as HTMLInputElement).value;
    const notes      = (document.getElementById('physio-notes') as HTMLTextAreaElement).value;
    generateReport({
      clientName,
      notes,
      metrics:     lastResults,
      findings:    generateFindings(lastResults),
      frameDataUrl: lastAnalysisFrameUrl,
    });
  });
}

main().catch(console.error);
