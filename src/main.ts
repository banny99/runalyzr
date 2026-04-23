import { initVideoPlayer, startCamera, stopCamera } from './ui/videoPlayer';
import { initLandmarker } from './pose/landmarker';
import { createProcessingLoop, detectCameraView } from './pose/processing';
import { initOverlay } from './ui/overlay';
import { renderDashboard, updateLiveMetrics, showAnalysisWarning, clearAnalysisWarning, showQualityWarning, clearQualityWarning, renderViewSelector } from './ui/dashboard';
import { evaluateSetupChecks, evaluateVideoQuality } from './analysis/setupChecks';
import type { SetupChecks } from './analysis/setupChecks';
import { angleBetweenThreePoints } from './analysis/angles';
import { detectGaitEvents, segmentGaitCycles } from './analysis/gaitDetection';
import { calculateAllMetrics } from './analysis/metrics';
import { generateFindings } from './analysis/findings';
import { LANDMARKS } from './config/defaults';
import type { LandmarkArray, AnalysisResults, MetricStatus, FrameData, CameraView } from './analysis/types';

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const loadingEl = document.createElement('div');
  loadingEl.id = 'loading-msg';
  loadingEl.textContent = 'Loading pose model…';
  document.body.appendChild(loadingEl);

  const video              = document.getElementById('video')              as HTMLVideoElement;
  const canvas             = document.getElementById('overlay')            as HTMLCanvasElement;
  const fileInput          = document.getElementById('file-input')         as HTMLInputElement;
  const toggleOverlayBtn   = document.getElementById('toggle-overlay-btn') as HTMLButtonElement;
  const exportPdfBtnTablet = document.getElementById('export-pdf-btn')     as HTMLButtonElement;
  const exportPdfBtnPhone  = document.getElementById('export-pdf-phone')   as HTMLButtonElement;
  const cameraOpenBtn      = document.getElementById('camera-open-btn')    as HTMLButtonElement;
  const cameraCloseBtn     = document.getElementById('camera-close-btn')   as HTMLButtonElement;
  const recordBtn          = document.getElementById('record-btn')         as HTMLButtonElement;
  const viewModeBtn        = document.getElementById('view-mode-btn')      as HTMLButtonElement;
  const recIndicator       = document.getElementById('rec-indicator')      as HTMLElement;
  const recTimerEl         = document.getElementById('rec-timer')          as HTMLElement;
  const liveMetricsEl      = document.getElementById('live-metrics')       as HTMLElement;
  const setupOverlayEl     = document.getElementById('setup-overlay')      as HTMLElement;
  const setupToggleEl      = document.getElementById('setup-toggle')       as HTMLButtonElement;
  const setupPanelEl       = document.getElementById('setup-panel')        as HTMLElement;
  const cameraIdleEl       = document.getElementById('camera-idle')        as HTMLElement;
  const videoContainerEl   = document.getElementById('video-container')    as HTMLElement;
  const videoTopRightEl    = document.getElementById('video-top-right')    as HTMLElement;
  const playbackCtrlsEl    = document.getElementById('playback-controls')  as HTMLElement;
  const uploadBtnPhone     = document.getElementById('upload-btn-phone')   as HTMLButtonElement;
  const uploadBtnTablet    = document.getElementById('upload-btn-tablet')  as HTMLButtonElement;
  const reportModalEl      = document.getElementById('report-modal')       as HTMLElement;
  const modalScrimEl       = document.getElementById('modal-scrim')        as HTMLElement;
  const modalCloseBtn      = document.getElementById('modal-close')        as HTMLButtonElement;
  const generatePdfBtn     = document.getElementById('generate-pdf-btn')   as HTMLButtonElement;
  const shareVideoBtn      = document.getElementById('share-video-btn')    as HTMLButtonElement;
  function switchTab(tabName: string): void {
    document.querySelectorAll('.tab').forEach(t =>
      (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.tab === tabName));
    document.querySelectorAll('.tab-panel').forEach(p =>
      (p as HTMLElement).classList.toggle('active', p.id === `${tabName}-panel`));
  }
  document.querySelectorAll('.tab').forEach(tab =>
    tab.addEventListener('click', () => switchTab((tab as HTMLElement).dataset.tab!)));

  uploadBtnPhone?.addEventListener('click', () => fileInput.click());
  uploadBtnTablet?.addEventListener('click', () => fileInput.click());

  let landmarker: Awaited<ReturnType<typeof initLandmarker>>;
  try {
    landmarker = await initLandmarker();
  } catch (err) {
    loadingEl.textContent = '⚠ Failed to load pose model. Check your connection and reload.';
    loadingEl.style.cssText += '; color:#ef4444; background:#1a1a1a; padding:1rem; border-radius:8px;';
    console.error('initLandmarker failed:', err);
    return;
  }
  loadingEl.remove();

  const overlay = initOverlay(canvas, video);
  let lastResults: AnalysisResults | null = null;
  let lastAnalysisFrameUrl: string | null = null;
  let lastFrames: FrameData[] = [];
  let manualView: 'sagittal' | 'frontal' | null = null;

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
    clearAnalysisWarning();
    clearQualityWarning();
    if (frames.length < 30) {
      showAnalysisWarning('Not enough footage to analyse — record at least 5 seconds of running.');
      return;
    }
    lastFrames = frames;
    const durationSec = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000;
    const fps  = frames.length / durationSec;
    const detectedView: CameraView = detectCameraView(frames[frames.length - 1].landmarks);
    const view: CameraView = viewOverride ?? detectedView;
    const gaitEvents = detectGaitEvents(frames, fps);
    const gaitCycles = segmentGaitCycles(gaitEvents);
    const results    = calculateAllMetrics(frames, gaitEvents, gaitCycles, fps, view);
    const findings   = generateFindings(results);
    lastResults          = results;
    lastAnalysisFrameUrl = overlay.captureDataUrl();
    renderDashboard(results, findings, view);
    renderViewSelector(
      detectedView,
      manualView,
      (v) => { manualView = v; runAnalysis(lastFrames, manualView); },
      ()  => { manualView = null; runAnalysis(lastFrames, null); },
    );
    const qualityWarnings = evaluateVideoQuality(frames, view === 'unknown' ? null : view);
    if (qualityWarnings.length > 0) showQualityWarning(qualityWarnings);
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
    onLoadedMetadata: () => {
      manualView = null;
      overlay.syncSizeIfReady();
    },
    onPlay:   () => loop.start(),
    onPause:  () => { loop.stop(); runAnalysis(loop.getFrames()); },
    onSeeked: () => {
      const lm = loop.getCurrentLandmarks();
      if (lm) overlay.drawSkeleton(lm, lastResults ? buildJointStatuses(lastResults) : {});
    },
  });

  video.addEventListener('ended', () => { loop.stop(); runAnalysis(loop.getFrames()); });

  // ── Camera mode state machine ───────────────────────────────────────────

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
  let compositeCanvas: HTMLCanvasElement | null = null;
  let compositeCtx: CanvasRenderingContext2D | null = null;
  let recordingHasOverlay = false;

  function setPillColor(color: 'grey' | 'red' | 'green'): void {
    setupToggleEl.classList.remove('pill-red', 'pill-green');
    if (color !== 'grey') setupToggleEl.classList.add(`pill-${color}`);
    document.getElementById('setup-toggle-icon')!.textContent =
      color === 'green' ? '✓' : color === 'red' ? '✗' : '⚠';
  }
  function showSetupPanel(): void {
    liveMetricsEl.style.display = 'none';
    setupOverlayEl.classList.add('visible');
    setupPanelEl.classList.add('open');
    videoContainerEl.classList.remove('frame-red', 'frame-amber', 'frame-green');
    videoContainerEl.classList.add('frame-grey');
    setPillColor('grey');
  }
  function showLivePanel(): void {
    liveMetricsEl.style.display = 'flex';
  }
  setupToggleEl.addEventListener('click', () => {
    setupPanelEl.classList.toggle('open');
  });
  function showCameraUI(): void {
    cameraIdleEl.style.display = 'none';
    videoContainerEl.style.display = 'block';
    videoTopRightEl.style.display = 'flex';
    recordBtn.style.display = 'block';
    playbackCtrlsEl.style.display = 'none';
    shareVideoBtn.style.display = 'none';
  }
  function showIdleUI(): void {
    cameraIdleEl.style.display = 'flex';
    videoContainerEl.style.display = 'none';
    videoContainerEl.classList.remove('frame-grey', 'frame-red', 'frame-amber', 'frame-green');
    videoTopRightEl.style.display = 'none';
    recordBtn.style.display = 'none';
    setupOverlayEl.classList.remove('visible');
    liveMetricsEl.style.display = 'none';
    shareVideoBtn.style.display = 'none';
  }
  function showVideoFileUI(): void {
    cameraIdleEl.style.display = 'none';
    videoContainerEl.style.display = 'block';
    videoTopRightEl.style.display = 'flex';
    recordBtn.style.display = 'none';
    playbackCtrlsEl.style.display = 'flex';
  }

  function openReportModal() {
    reportModalEl.hidden = false;
  }
  function closeReportModal() {
    reportModalEl.hidden = true;
  }

  video.addEventListener('loadedmetadata', () => {
    if (cameraState === 'closed') showVideoFileUI();
  });

  function applyCheck(id: string, pass: boolean, passText: string, failText: string,
                      pending = false): void {
    const el = document.getElementById(id)!;
    el.textContent = pass ? passText : failText;
    el.className   = pending ? 'check-pending' : (pass ? 'check-pass' : 'check-fail');
  }

  function refreshSetupUI(checks: SetupChecks): void {
    const isSag = selectedView === 'sagittal';
    const notReady = (dep: boolean) => !checks.viewSelected || !checks.stable || !dep;

    // View
    if (checks.viewSelected) {
      const label    = isSag ? 'Side view' : 'Front view';
      const mismatch = checks.detectedView !== selectedView && checks.detectedView !== 'unknown';
      const suffix   = mismatch
        ? ` (camera sees ${checks.detectedView === 'sagittal' ? 'side' : 'front'})`
        : '';
      applyCheck('check-view', !mismatch, `${label} selected${suffix}`, `${label} selected${suffix}`);
    } else {
      applyCheck('check-view', false, '', 'Choose view (tap button above)');
    }

    // Stable
    applyCheck('check-stable', checks.stable, 'Pose detected', 'Detecting pose…', !checks.stable);

    // Orientation
    applyCheck('check-orientation',
      checks.orientation,
      isSag ? 'Sideways to camera' : 'Facing camera',
      isSag ? 'Turn sideways'      : 'Face the camera',
      notReady(true));

    // Joint alignment
    applyCheck('check-alignment',
      checks.jointAlignment,
      isSag ? 'Hip–knee–ankle aligned' : 'Bilateral symmetry OK',
      isSag ? 'Rotate more — joints not aligned' : 'Off-centre or asymmetric',
      notReady(checks.orientation));

    // Body in frame
    applyCheck('check-body',
      checks.bodyInFrame,
      isSag ? 'Full body in frame (side)' : 'Full body in frame (front)',
      'Full body not visible',
      notReady(checks.orientation));

    // Distance
    applyCheck('check-distance',
      checks.goodDistance,
      isSag ? 'Good distance'        : 'Good width coverage',
      isSag ? 'Adjust distance'      : 'Adjust distance (width)',
      notReady(checks.orientation));

    // Camera position
    applyCheck('check-camera-pos',
      checks.cameraPosition,
      isSag ? 'Camera at hip height'      : 'Centred & level',
      isSag ? 'Adjust camera height'      : 'Centre yourself / level camera',
      notReady(checks.orientation && checks.bodyInFrame && checks.goodDistance));

    // Lighting
    applyCheck('check-lighting',
      checks.goodLighting, 'Adequate lighting', 'Improve lighting');

    document.getElementById('setup-hint')!.textContent = checks.hint;
  }

  async function openCamera(): Promise<void> {
    cameraState = 'setup';
    loop.stop();
    manualView = null;
    showCameraUI();

    // Clear any previously recorded video
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
      recordedBlobUrl = null;
      video.removeAttribute('src');
    }
    shareVideoBtn.style.display = 'none';

    await startCamera(video);

    // Sync canvas size now; re-sync when the stream delivers its first real dimensions
    overlay.syncSize();
    video.addEventListener('resize', () => overlay.syncSize(), { once: true });

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
        if (result.landmarks.length > 0 && result.worldLandmarks.length > 0) {
          const lms = result.landmarks[0] as LandmarkArray;
          lastLandmarkTime = performance.now();

          const statuses = lastResults ? buildJointStatuses(lastResults) : {};
          overlay.drawSkeleton(lms, statuses);

          if (cameraState === 'setup') {
            setupConsecutiveFrames++;
            const checks = evaluateSetupChecks(lms, setupConsecutiveFrames, selectedView);
            refreshSetupUI(checks);
            recordBtn.disabled = !checks.allPassed;
            recordBtn.classList.toggle('ready', checks.allPassed);
            const hasRed = !!document.querySelector('#setup-checklist .check-fail');
            const color  = checks.allPassed ? 'green' : hasRed ? 'red' : 'grey';
            videoContainerEl.classList.remove('frame-grey', 'frame-red', 'frame-amber', 'frame-green');
            videoContainerEl.classList.add(`frame-${color}`);
            setPillColor(color);
            if (checks.allPassed) showLivePanel(); else setupOverlayEl.classList.add('visible');
          } else if (cameraState === 'recording') {
            // Cap at ~5 min @ 30fps to avoid memory issues on iPad
            if (cameraFrames.length < 9000) {
              cameraFrames.push({
                landmarks: lms,
                worldLandmarks: result.worldLandmarks[0] as LandmarkArray,
                timestamp: performance.now(),
              });
            }
            // Bake video + skeleton overlay into the composite canvas for recording
            if (compositeCtx && compositeCanvas) {
              compositeCtx.drawImage(video, 0, 0, compositeCanvas.width, compositeCanvas.height);
              compositeCtx.drawImage(canvas, 0, 0, compositeCanvas.width, compositeCanvas.height);
            }
            updateLiveMetrics(null, detectCameraView(lms), 30);
          }
        } else if (cameraState === 'setup' && performance.now() - lastLandmarkTime > 500) {
          setupConsecutiveFrames = 0;
          videoContainerEl.classList.remove('frame-red', 'frame-amber', 'frame-green');
          videoContainerEl.classList.add('frame-grey');
          setPillColor('grey');
          setupOverlayEl.classList.add('visible');
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
    recordBtn.disabled = false;
    clearInterval(recTimerInterval);
    stopCamera(video);

    recordBtn.classList.remove('ready', 'recording');
    viewModeBtn.style.display = 'none';
    recIndicator.style.display = 'none';
    if (video.src) {
      showVideoFileUI();
    } else {
      showIdleUI();
    }

    if (wasRecording) runAnalysis([...cameraFrames], selectedView);
  }

  function startRecording(): void {
    cameraState = 'recording';
    cameraFrames.length = 0;
    recordedChunks.length = 0;
    recordBtn.classList.remove('ready');
    recordBtn.classList.add('recording');
    recordBtn.disabled = true;
    recordBtn.setAttribute('aria-label', 'Stop recording');
    viewModeBtn.style.display = 'none';
    recIndicator.style.display = 'flex';
    showLivePanel();

    recStartTime = performance.now();

    let lockSecondsLeft = 5;
    recTimerEl.textContent = `Rec ${lockSecondsLeft}s more…`;

    recTimerInterval = window.setInterval(() => {
      const elapsed = Math.floor((performance.now() - recStartTime) / 1000);
      if (lockSecondsLeft > 0) {
        lockSecondsLeft--;
        if (lockSecondsLeft > 0) {
          recTimerEl.textContent = `Rec ${lockSecondsLeft}s more…`;
        } else {
          recordBtn.disabled = false;
          recTimerEl.textContent = '0:05';
        }
      } else {
        recTimerEl.textContent =
          `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
      }
    }, 1000);

    recordingHasOverlay = false;

    if (typeof MediaRecorder !== 'undefined') {
      const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

      const canCaptureStream = typeof document.createElement('canvas').captureStream === 'function';

      let stream: MediaStream | null = null;
      if (canCaptureStream) {
        compositeCanvas = document.createElement('canvas');
        compositeCanvas.width  = video.videoWidth  || 1280;
        compositeCanvas.height = video.videoHeight || 720;
        compositeCtx = compositeCanvas.getContext('2d');
        stream = compositeCanvas.captureStream(30);
      } else {
        stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
      }

      try {
        if (stream) {
          mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
          mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
          mediaRecorder.start(100);
          recordingHasOverlay = canCaptureStream;
        }
      } catch {
        mediaRecorder = null;
        compositeCanvas = null;
        compositeCtx = null;
      }
    }

    recIndicator.querySelector('.no-overlay-hint')?.remove();
    if (!recordingHasOverlay) {
      const hint = document.createElement('span');
      hint.className = 'no-overlay-hint';
      hint.textContent = '· no overlay';
      hint.style.cssText = 'font-size:0.65rem;opacity:0.7;margin-left:0.25rem;';
      recIndicator.appendChild(hint);
    }
  }

  function stopRecording(): void {
    manualView = null;
    const viewForAnalysis = selectedView;
    const capturedFrames = [...cameraFrames];

    cameraState = 'closed';
    cameraRunning = false;
    cancelAnimationFrame(cameraRafId);
    clearInterval(recTimerInterval);
    recIndicator.style.display = 'none';
    recordBtn.classList.remove('recording', 'ready');
    recordBtn.disabled = false;
    viewModeBtn.style.display = 'none';

    runAnalysis(capturedFrames, viewForAnalysis);
    if (window.innerWidth < 768) switchTab('results');

    const finalize = (blobUrl: string | null): void => {
      compositeCanvas = null;
      compositeCtx = null;
      stopCamera(video);
      if (blobUrl) {
        if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
        recordedBlobUrl = blobUrl;
        video.src = blobUrl;
        video.load();
        shareVideoBtn.style.display = 'flex';
        showVideoFileUI();
      } else {
        showIdleUI();
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

  cameraOpenBtn.addEventListener('click', () => openCamera().catch(console.error));
  cameraCloseBtn?.addEventListener('click', () => closeCamera());

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

  shareVideoBtn.addEventListener('click', async () => {
    if (!recordedBlobUrl) return;
    try {
      const blob = await fetch(recordedBlobUrl).then((r) => r.blob());
      const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
      const file = new File([blob], `runalyzr-recording.${ext}`, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Runalyzr Recording' });
      } else {
        const a = document.createElement('a');
        a.href = recordedBlobUrl;
        a.download = `runalyzr-recording.${ext}`;
        a.click();
      }
    } catch {
      // Blob revoked, share cancelled, or download failed — do nothing
    }
  });

  // ── Overlay toggle & PDF export ─────────────────────────────────────────

  let overlayVisible = true;
  toggleOverlayBtn?.addEventListener('click', () => {
    overlayVisible = !overlayVisible;
    overlay.setVisible(overlayVisible);
    toggleOverlayBtn.style.opacity = overlayVisible ? '1' : '0.45';
  });

  function handleExportClick() {
    if (!lastResults) return;
    openReportModal();
  }
  exportPdfBtnTablet?.addEventListener('click', handleExportClick);
  exportPdfBtnPhone?.addEventListener('click', handleExportClick);
  modalCloseBtn?.addEventListener('click', closeReportModal);
  modalScrimEl?.addEventListener('click', closeReportModal);

  generatePdfBtn?.addEventListener('click', async () => {
    if (!lastResults) return;
    const { generateReport } = await import('./report/pdfGenerator');
    generateReport({
      clientName: (document.getElementById('client-name') as HTMLInputElement).value,
      notes: (document.getElementById('physio-notes') as HTMLTextAreaElement).value,
      metrics: lastResults,
      findings: generateFindings(lastResults),
      frameDataUrl: lastAnalysisFrameUrl,
    });
    closeReportModal();
  });
}

main().catch(console.error);
