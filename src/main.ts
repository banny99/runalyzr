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
  viewSelected: boolean;
  orientation: boolean;   // person is turned the right way for the chosen view
  bodyInFrame: boolean;
  goodDistance: boolean;
  goodLighting: boolean;
  stable: boolean;
  detectedView: CameraView;
  allPassed: boolean;
  hint: string;
}

function evaluateSetupChecks(
  landmarks: LandmarkArray,
  consecutiveFrames: number,
  selectedView: 'sagittal' | 'frontal' | null,
): SetupChecks {
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

  // Orientation: are left/right joint pairs stacked (sagittal) or spread (frontal)?
  // Use shoulder and hip spread as the signal.
  const shoulderSpread = Math.abs(landmarks[L.LEFT_SHOULDER].x - landmarks[L.RIGHT_SHOULDER].x);
  const hipSpread      = Math.abs(landmarks[L.LEFT_HIP].x      - landmarks[L.RIGHT_HIP].x);
  const avgSpread = (shoulderSpread + hipSpread) / 2;
  // Sagittal: joints stack → spread < 0.12; Frontal: joints spread → spread > 0.12
  const orientation =
    selectedView === null       ? true :
    selectedView === 'sagittal' ? avgSpread < 0.14 :
    /* frontal */                 avgSpread > 0.10;

  // Distance:
  //   Sagittal — shoulder-to-ankle height should fill 40–85 % of frame
  //   Frontal  — shoulder width should fill 20–60 % of frame width
  const shoulderY = Math.min(landmarks[L.LEFT_SHOULDER].y, landmarks[L.RIGHT_SHOULDER].y);
  const ankleY    = Math.max(landmarks[L.LEFT_ANKLE].y,    landmarks[L.RIGHT_ANKLE].y);
  const heightSpan = ankleY - shoulderY;
  let goodDistance: boolean;
  if (selectedView === 'frontal') {
    goodDistance = shoulderSpread > 0.20 && shoulderSpread < 0.60;
  } else {
    // sagittal or unset — use height span
    goodDistance = heightSpan > 0.40 && heightSpan < 0.90;
  }

  // Lighting: average landmark visibility (MediaPipe provides 0–1 per landmark)
  const visAvg = key.reduce((s, i) => s + (landmarks[i]?.visibility ?? 1), 0) / key.length;
  const goodLighting = visAvg > 0.50;

  // Stable: landmark detected in ≥ 15 consecutive frames (~0.5 s at 30 fps)
  const stable = consecutiveFrames >= 15;

  const detectedView = detectCameraView(landmarks);
  const viewSelected = selectedView !== null;

  // Build the most actionable hint (first unmet condition wins)
  let hint = '';
  if (!viewSelected) {
    hint = 'Tap the view button above to choose Side or Front view.';
  } else if (!stable) {
    hint = 'Hold still — detecting your pose…';
  } else if (!orientation) {
    hint = selectedView === 'sagittal'
      ? 'Turn sideways — camera should see your full profile (hip, knee, ankle in a line).'
      : 'Face the camera directly — shoulders should be level and spread.';
  } else if (!bodyInFrame) {
    hint = selectedView === 'sagittal'
      ? 'Step back until your full body (head to feet) is visible from the side.'
      : 'Step back until your full body (head to feet) is visible facing the camera.';
  } else if (selectedView === 'frontal' && shoulderSpread < 0.20) {
    hint = 'Move closer — shoulder width should fill more of the frame.';
  } else if (selectedView === 'frontal' && shoulderSpread > 0.60) {
    hint = 'Step further back — you are too close to the camera.';
  } else if (heightSpan < 0.40 && selectedView !== 'frontal') {
    hint = 'Move closer to the camera.';
  } else if (heightSpan > 0.90) {
    hint = 'Step further back — you are too close.';
  } else if (!goodLighting) {
    hint = 'Improve lighting: face a bright light source or move outdoors.';
  } else {
    hint = selectedView === 'sagittal'
      ? 'All set! Camera at hip height, 3–5 m away. Start recording when ready.'
      : 'All set! Camera at chest height, 3–5 m away. Start recording when ready.';
  }

  return {
    viewSelected,
    orientation,
    bodyInFrame,
    goodDistance,
    goodLighting,
    stable,
    detectedView,
    allPassed: viewSelected && orientation && bodyInFrame && goodDistance && goodLighting && stable,
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
  const cameraOpenBtn    = document.getElementById('camera-open-btn')  as HTMLButtonElement;
  const recordBtn        = document.getElementById('record-btn')       as HTMLButtonElement;
  const viewModeBtn      = document.getElementById('view-mode-btn')    as HTMLButtonElement;
  const recIndicator     = document.getElementById('rec-indicator')    as HTMLElement;
  const recTimerEl       = document.getElementById('rec-timer')        as HTMLElement;
  const liveMetricsEl    = document.getElementById('live-metrics')     as HTMLElement;
  const setupGuidanceEl  = document.getElementById('setup-guidance')   as HTMLElement;

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
  function runAnalysis(frames: FrameData[], viewOverride: 'sagittal' | 'frontal' | null = null): void {
    if (frames.length < 30) return;
    const durationSec = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000;
    const fps  = frames.length / durationSec;
    const view: CameraView = viewOverride ?? detectCameraView(frames[frames.length - 1].landmarks);
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
    onLoadedMetadata: () => { overlay.syncSize(); cameraColumnEl.style.display = 'flex'; },
    onPlay:           () => loop.start(),
    onPause:          () => { loop.stop(); runAnalysis(loop.getFrames()); },
    onSeeked:         () => {
      const lm = loop.getCurrentLandmarks();
      if (lm) overlay.drawSkeleton(lm, lastResults ? buildJointStatuses(lastResults) : {});
    },
  });

  video.addEventListener('ended', () => { loop.stop(); runAnalysis(loop.getFrames()); });

  // ── Camera mode state machine ───────────────────────────────────────────

  const cameraColumnEl = document.getElementById('camera-column') as HTMLElement;

  type CameraState = 'closed' | 'setup' | 'recording';
  let cameraState: CameraState = 'closed';
  let selectedView: 'sagittal' | 'frontal' | null = null; // null = auto-detect
  let cameraRunning = false;            // separate flag so the rAF loop can exit cleanly
  let cameraRafId = 0;
  let setupConsecutiveFrames = 0;
  let lastLandmarkTime = 0;
  let recTimerInterval = 0;
  let recStartTime = 0;
  const cameraFrames: FrameData[] = [];
  let mediaRecorder: MediaRecorder | null = null;
  const recordedChunks: Blob[] = [];
  let recordedBlobUrl: string | null = null;

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
    // View check: pass once selected, with detected-view context
    if (checks.viewSelected) {
      const label = selectedView === 'sagittal' ? 'Side view' : 'Front view';
      const mismatch = checks.detectedView !== selectedView && checks.detectedView !== 'unknown';
      const detected = mismatch
        ? ` (camera sees ${checks.detectedView === 'sagittal' ? 'side' : 'front'})`
        : '';
      applyCheck('check-view', !mismatch, `${label} selected${detected}`, `${label} selected${detected}`);
    } else {
      applyCheck('check-view', false, '', 'Choose view (tap button above)');
    }

    applyCheck('check-stable', checks.stable, 'Pose detected', 'Detecting pose…', !checks.stable);

    // Orientation: label depends on chosen view
    const orientPass = selectedView === 'sagittal' ? 'Sideways to camera'   : 'Facing camera';
    const orientFail = selectedView === 'sagittal' ? 'Turn sideways'         : 'Face the camera';
    applyCheck('check-orientation', checks.orientation, orientPass, orientFail,
               !checks.viewSelected || !checks.stable);

    // Body in frame: label depends on chosen view
    const bodyPass = selectedView === 'frontal' ? 'Full body visible (front)' : 'Full body in frame';
    const bodyFail = selectedView === 'frontal' ? 'Full body not visible'     : 'Full body not visible';
    applyCheck('check-body', checks.bodyInFrame, bodyPass, bodyFail);

    // Distance: label depends on chosen view
    const distPass = selectedView === 'frontal' ? 'Good width coverage' : 'Good distance';
    const distFail = selectedView === 'frontal' ? 'Adjust distance (width)' : 'Adjust distance';
    applyCheck('check-distance', checks.goodDistance, distPass, distFail);

    applyCheck('check-lighting', checks.goodLighting, 'Adequate lighting', 'Improve lighting');

    document.getElementById('setup-hint')!.textContent = checks.hint;
  }

  async function openCamera(): Promise<void> {
    cameraState = 'setup';
    cameraOpenBtn.textContent = 'Close Camera';
    loop.stop();
    (document.getElementById('playback-controls') as HTMLElement).style.display = 'none';
    cameraColumnEl.style.display = 'flex';

    // Clear any previously recorded video
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
      recordedBlobUrl = null;
      video.removeAttribute('src');
    }

    await startCamera(video);

    // Sync canvas size now; re-sync when the stream delivers its first real dimensions
    overlay.syncSize();
    video.addEventListener('resize', () => overlay.syncSize(), { once: true });

    recordBtn.style.display = 'flex';
    recordBtn.disabled = true;
    recordBtn.classList.remove('ready', 'recording');
    recordBtn.setAttribute('aria-label', 'Start recording');
    viewModeBtn.style.display = 'flex';
    updateViewModeBtn();
    showSetupPanel();

    setupConsecutiveFrames = 0;
    lastLandmarkTime = performance.now();
    cameraFrames.length = 0;
    cameraRunning = true;

    // Reuse the existing VIDEO-mode landmarker synchronously — no second model load.
    (function cameraLoop() {
      if (!cameraRunning) return;

      if (video.readyState >= 2) {
        const result = landmarker.detectForVideo(video, performance.now());
        if (result.landmarks.length > 0) {
          const lms = result.landmarks[0] as LandmarkArray;
          lastLandmarkTime = performance.now();

          const statuses = lastResults ? buildJointStatuses(lastResults) : {};
          overlay.drawSkeleton(lms, statuses);

          if (cameraState === 'setup') {
            setupConsecutiveFrames++;
            const checks = evaluateSetupChecks(lms, setupConsecutiveFrames, selectedView);
            refreshSetupUI(checks);
            drawSetupGuide(canvas, checks.allPassed);
            recordBtn.disabled = !checks.allPassed;
            recordBtn.classList.toggle('ready', checks.allPassed);
          } else if (cameraState === 'recording') {
            cameraFrames.push({ landmarks: lms, timestamp: performance.now() });
            updateLiveMetrics(null, detectCameraView(lms), 30);
          }
        } else if (cameraState === 'setup' && performance.now() - lastLandmarkTime > 500) {
          // Person left frame — reset stability counter
          setupConsecutiveFrames = 0;
        }
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

    cameraOpenBtn.textContent = 'Camera';
    // Restore playback controls if a video file is loaded
    if (video.src) (document.getElementById('playback-controls') as HTMLElement).style.display = 'flex';
    recordBtn.style.display = 'none';
    recordBtn.classList.remove('ready', 'recording');
    viewModeBtn.style.display = 'none';
    recIndicator.style.display = 'none';
    showLivePanel();

    if (wasRecording) runAnalysis([...cameraFrames], selectedView);
  }

  function startRecording(): void {
    cameraState = 'recording';
    cameraFrames.length = 0;
    recordedChunks.length = 0;
    recordBtn.classList.remove('ready');
    recordBtn.classList.add('recording');
    recordBtn.disabled = false;
    recordBtn.setAttribute('aria-label', 'Stop recording');
    viewModeBtn.style.display = 'none';
    recIndicator.style.display = 'flex';
    showLivePanel();

    recStartTime = performance.now();
    recTimerInterval = window.setInterval(() => {
      const elapsed = Math.floor((performance.now() - recStartTime) / 1000);
      recTimerEl.textContent =
        `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    }, 1000);

    // Start capturing the camera stream
    const stream = video.srcObject as MediaStream | null;
    if (stream && typeof MediaRecorder !== 'undefined') {
      const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      try {
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.start(100);
      } catch {
        mediaRecorder = null;
      }
    }
  }

  function stopRecording(): void {
    const viewForAnalysis = selectedView;
    const capturedFrames = [...cameraFrames];

    cameraState = 'closed';
    cameraRunning = false;
    cancelAnimationFrame(cameraRafId);
    clearInterval(recTimerInterval);
    recIndicator.style.display = 'none';
    recordBtn.classList.remove('recording', 'ready');
    recordBtn.style.display = 'none';
    viewModeBtn.style.display = 'none';
    cameraOpenBtn.textContent = 'Camera';
    showLivePanel();

    runAnalysis(capturedFrames, viewForAnalysis);

    const finalize = (blobUrl: string | null): void => {
      stopCamera(video);
      if (blobUrl) {
        if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
        recordedBlobUrl = blobUrl;
        video.src = blobUrl;
        video.load();
        (document.getElementById('playback-controls') as HTMLElement).style.display = 'flex';
      }
    };

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = () => {
        const blob = recordedChunks.length > 0
          ? new Blob(recordedChunks, { type: recordedChunks[0]?.type || 'video/webm' })
          : null;
        finalize(blob ? URL.createObjectURL(blob) : null);
      };
      mediaRecorder.stop();
    } else {
      finalize(null);
    }
    mediaRecorder = null;
  }

  cameraOpenBtn.addEventListener('click', () => {
    if (cameraState === 'closed') openCamera().catch(console.error);
    else closeCamera();
  });

  function updateViewModeBtn(): void {
    if (selectedView === 'sagittal') {
      viewModeBtn.textContent = 'Side view';
      viewModeBtn.classList.remove('view-front', 'view-unset');
      viewModeBtn.classList.add('view-side');
    } else if (selectedView === 'frontal') {
      viewModeBtn.textContent = 'Front view';
      viewModeBtn.classList.remove('view-side', 'view-unset');
      viewModeBtn.classList.add('view-front');
    } else {
      viewModeBtn.textContent = '⚠ Choose view';
      viewModeBtn.classList.remove('view-side', 'view-front');
      viewModeBtn.classList.add('view-unset');
    }
  }

  viewModeBtn.addEventListener('click', () => {
    if (cameraState !== 'setup') return;
    // Cycle: null → sagittal → frontal → null
    selectedView = selectedView === null ? 'sagittal'
                 : selectedView === 'sagittal' ? 'frontal'
                 : null;
    updateViewModeBtn();
    // Immediately refresh checklist so the view check updates without waiting for next frame
    setupConsecutiveFrames = Math.max(0, setupConsecutiveFrames - 1); // force re-evaluation
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
