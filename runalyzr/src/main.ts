import { initVideoPlayer } from './ui/videoPlayer';
import { initLandmarker } from './pose/landmarker';
import { createProcessingLoop, detectCameraView } from './pose/processing';
import { initOverlay } from './ui/overlay';
import { renderDashboard, updateLiveMetrics, showAnalysisWarning, clearAnalysisWarning, showQualityWarning, clearQualityWarning, renderViewSelector } from './ui/dashboard';
import { evaluateVideoQuality } from './analysis/setupChecks';
import { angleBetweenThreePoints } from './analysis/angles';
import { detectGaitEvents, segmentGaitCycles } from './analysis/gaitDetection';
import { calculateAllMetrics } from './analysis/metrics';
import { generateFindings } from './analysis/findings';
import { buildJointStatuses } from './analysis/jointStatuses';
import { LANDMARKS, POSE_CONNECTIONS, OVERLAY_COLORS } from './config/defaults';
import type { LandmarkArray, AnalysisResults, FrameData, CameraView } from './analysis/types';
import { initCameraController } from './ui/cameraController';

// Draws the pose skeleton onto an arbitrary context at the given pixel size.
// Visibility-gated on both connection endpoints and dots, matching the live
// overlay. Slightly heavier stroke/radius than the on-screen overlay because
// this renders at native video resolution for the PDF. Candidate for the
// shared skeleton drawer planned in issue #14 part 2.
function drawSkeletonInto(cx: CanvasRenderingContext2D, lms: LandmarkArray, w: number, h: number): void {
  const visible = (l: LandmarkArray[number] | undefined) => !!l && (l.visibility ?? 1) >= 0.4;
  cx.lineWidth = 3;
  cx.strokeStyle = OVERLAY_COLORS.neutral;
  cx.fillStyle = OVERLAY_COLORS.neutral;
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = lms[a];
    const lb = lms[b];
    if (!visible(la) || !visible(lb)) continue;
    cx.beginPath();
    cx.moveTo(la.x * w, la.y * h);
    cx.lineTo(lb.x * w, lb.y * h);
    cx.stroke();
  }
  for (const l of lms) {
    if (!visible(l)) continue;
    cx.beginPath();
    cx.arc(l.x * w, l.y * h, 5, 0, Math.PI * 2);
    cx.fill();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const loadingEl = document.createElement('div');
  loadingEl.id = 'loading-msg';
  loadingEl.textContent = 'Loading pose model…';
  document.body.appendChild(loadingEl);

  const video              = document.getElementById('video')              as HTMLVideoElement;
  const canvas             = document.getElementById('overlay')            as HTMLCanvasElement;
  const fileInput          = Object.assign(document.createElement('input'), { type: 'file', accept: 'video/mp4,video/quicktime', style: 'display:none' });
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

  function openFilePicker() {
    document.body.appendChild(fileInput);
    fileInput.click();
    fileInput.addEventListener('change', () => document.body.removeChild(fileInput), { once: true });
  }
  uploadBtnPhone?.addEventListener('click', openFilePicker);
  uploadBtnTablet?.addEventListener('click', openFilePicker);

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
  let lastAnalysisFrameAspect: number | null = null;
  let lastFrames: FrameData[] = [];
  let manualView: 'sagittal' | 'frontal' | null = null;

  // Composites the current video frame + skeleton at native resolution for the
  // PDF report. Drawing landmarks directly (rather than copying the overlay
  // canvas) keeps alignment exact regardless of letterboxing, and works in the
  // upload flow where the overlay was never drawn. JPEG because the shared PDF
  // renderer embeds with the JPEG codec.
  function captureAnnotatedFrame(lms: LandmarkArray): { dataUrl: string; aspect: number } | null {
    // readyState < 2: no decoded frame — drawImage would silently no-op and
    // produce a black frame (e.g. right after the camera stream is stopped).
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return null;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const cx = c.getContext('2d')!;
    cx.drawImage(video, 0, 0, c.width, c.height);
    drawSkeletonInto(cx, lms, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.85), aspect: c.width / c.height };
  }

  // Shared analysis runner (video file and camera)
  function runAnalysis(frames: FrameData[], viewOverride: 'sagittal' | 'frontal' | null = null): void {
    clearAnalysisWarning();
    clearQualityWarning();
    if (frames.length < 30) {
      showAnalysisWarning('Not enough footage to analyse — record at least 5 seconds of running.');
      return;
    }
    // View-selector re-runs pass the same frames array back in; the video may
    // have been scrubbed since, so recapturing would composite the current
    // frame with end-of-video landmarks (misaligned skeleton in the PDF).
    const isRerun = frames === lastFrames;
    lastFrames = frames;
    const durationSec = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000;
    const fps  = frames.length / durationSec;
    const detectedView: CameraView = detectCameraView(frames[frames.length - 1].landmarks);
    const view: CameraView = viewOverride ?? detectedView;
    const gaitEvents = detectGaitEvents(frames, fps);
    const gaitCycles = segmentGaitCycles(gaitEvents);
    const results    = calculateAllMetrics(frames, gaitEvents, gaitCycles, fps, view);
    const findings   = generateFindings(results);
    lastResults = results;
    if (!isRerun) {
      const captured = captureAnnotatedFrame(frames[frames.length - 1].landmarks);
      lastAnalysisFrameUrl    = captured?.dataUrl ?? null;
      lastAnalysisFrameAspect = captured?.aspect ?? null;
    }
    renderDashboard(results, findings, view);
    renderViewSelector(
      detectedView,
      manualView,
      (v) => { manualView = v; runAnalysis(lastFrames, manualView); },
      ()  => { manualView = null; runAnalysis(lastFrames, null); },
    );
    const safeView: 'sagittal' | 'frontal' | null =
      (view === 'sagittal' || view === 'frontal') ? view : null;
    const qualityWarnings = evaluateVideoQuality(frames, safeView);
    if (view === 'unknown') {
      // Metrics assume a side view in this case (frontal metrics from an
      // unidentified view would be meaningless). This changes the meaning of
      // every displayed metric, so use the always-visible analysis-warning
      // banner — not the collapsed quality list — and point at the selector.
      showAnalysisWarning('Camera view could not be detected — assuming side view. Use the Side/Front buttons in the results header to correct this.');
    }
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

  // Runs BEFORE initVideoPlayer's change listener (registration order): if the
  // camera is open when a file is picked, close it first so the live stream's
  // srcObject doesn't swallow the upload and close() doesn't wipe the new src
  // (issue #12). Also retire the Share button — it shares the previous
  // recording, not this upload.
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) {
      if (cameraActive) {
        cameraActive = false;
        cameraController.close();
      }
      // Cancel any in-flight silent analysis — videoPlayer's loader is about to
      // video.load(), whose 'emptied' event the seek loop treats as a completed
      // seek; without this it would keep analysing across two different videos.
      analysing = false;
      shareVideoBtn.style.display = 'none';
    }
  });

  // keydown cleanup — call this if video player is ever torn down (see Task 10)
  const cleanupVideoPlayer = initVideoPlayer(video, fileInput, {
    onLoadedMetadata: () => {
      manualView = null;
      overlay.syncSizeIfReady();
    },
    onPlay:   () => { overlay.syncSize(); loop.start(); },
    onPause:  () => { loop.stop(); },
    onSeeked: () => {
      overlay.syncSize();
      const lm = loop.getCurrentLandmarks();
      if (lm) overlay.drawSkeleton(lm, lastResults ? buildJointStatuses(lastResults) : {});
    },
    isBusy: () => analysing,
  });
  void cleanupVideoPlayer;

  video.addEventListener('ended', () => { loop.stop(); });

  // ── Camera mode state machine ───────────────────────────────────────────

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
  function showReviewBar(): void {
    const bar = document.getElementById('review-bar') as HTMLElement;
    const btn = document.getElementById('analyse-btn') as HTMLButtonElement;
    bar.hidden = false;
    btn.disabled = false;
  }

  function hideReviewBar(): void {
    const bar = document.getElementById('review-bar') as HTMLElement;
    bar.hidden = true;
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
    hideReviewBar();
  }
  function showVideoFileUI(showAnalyse = true): void {
    cameraIdleEl.style.display = 'none';
    videoContainerEl.style.display = 'block';
    videoTopRightEl.style.display = 'flex';
    recordBtn.style.display = 'none';
    playbackCtrlsEl.style.display = 'flex';
    if (showAnalyse) showReviewBar();
  }

  function openReportModal() {
    reportModalEl.hidden = false;
  }
  function closeReportModal() {
    reportModalEl.hidden = true;
  }

  let cameraActive = false;

  video.addEventListener('loadedmetadata', () => {
    if (!cameraActive) showVideoFileUI();
  });

  const cameraController = initCameraController({
    video,
    overlay,
    overlayCanvas: canvas,
    landmarker,
    liveMetricsEl,
    setupOverlayEl,
    setupPanelEl,
    videoContainerEl,
    recordBtn,
    viewModeBtn,
    recIndicator,
    recTimerEl,
    shareVideoBtn,
    setupToggleEl,
    setupToggleIcon: document.getElementById('setup-toggle-icon') as HTMLElement,
    onAnalysisReady: (frames, view) => { manualView = null; runAnalysis(frames, view); },
    onRecordingComplete: (blobUrl) => {
      cameraActive = false;
      if (blobUrl) {
        showVideoFileUI();
        switchTab('results');
      } else {
        showIdleUI();
      }
    },
    getLastResults: () => lastResults,
    updateLiveMetrics,
  });

  cameraOpenBtn.addEventListener('click', () => {
    cameraActive = true;
    loop.stop();
    showCameraUI();
    cameraController.open().catch(console.error);
  });
  cameraCloseBtn?.addEventListener('click', () => {
    analysing = false;
    // Re-enable the loadedmetadata → showVideoFileUI path; without this an
    // upload after any camera open/close is silently ignored (issue #11).
    cameraActive = false;
    cameraController.close();
    showIdleUI();
  });

  // ── Frame-seeking analysis (video file) ────────────────────────────────

  let analysing = false;

  async function runSilentAnalysis(): Promise<void> {
    analysing = true;

    const overlayEl  = document.getElementById('analyse-overlay') as HTMLElement;
    const pctEl      = document.getElementById('analyse-overlay-pct') as HTMLElement;
    const analyseBtn = document.getElementById('analyse-btn') as HTMLButtonElement;

    overlayEl.style.display = 'flex';
    analyseBtn.disabled = true;

    video.pause();

    const seekSettled = () => new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener('seeked',  done);
        video.removeEventListener('abort',   done);
        video.removeEventListener('emptied', done);
        resolve();
      };
      video.addEventListener('seeked',  done, { once: true });
      video.addEventListener('abort',   done, { once: true });
      video.addEventListener('emptied', done, { once: true });
    });

    let duration = video.duration;
    if (duration === Infinity) {
      // Chrome MediaRecorder WebM quirk: recorded blobs report Infinity until
      // the element is seeked past the end, which forces duration resolution.
      duration = await new Promise<number>((resolve) => {
        const timeout = window.setTimeout(() => {
          video.removeEventListener('durationchange', onDurationChange);
          resolve(NaN);
        }, 3000);
        const onDurationChange = () => {
          if (Number.isFinite(video.duration)) {
            clearTimeout(timeout);
            video.removeEventListener('durationchange', onDurationChange);
            resolve(video.duration);
          }
        };
        video.addEventListener('durationchange', onDurationChange);
        video.currentTime = Number.MAX_SAFE_INTEGER;
      });
      video.currentTime = 0;
      // Let the reset seek settle: a stale 'seeked' from the end-probe must not
      // resolve the loop's first await while the end frame is still displayed.
      await seekSettled();
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      overlayEl.style.display = 'none';
      analyseBtn.disabled = false;
      analysing = false;
      showAnalysisWarning('Could not determine the video duration — try re-recording or uploading the file again.');
      return;
    }
    const step     = 1 / 30;
    const frames: FrameData[] = [];
    let completed = false;

    try {
      for (let t = 0; t <= duration; t += step) {
        if (!analysing) break;

        video.currentTime = t;
        await seekSettled();

        if (!analysing) break;

        // MediaPipe VIDEO mode requires monotonically increasing timestamps per
        // landmarker instance. The camera loop and processing loop both stamp
        // with the performance.now() clock, so use it here too — a 0-based clock
        // would regress after camera use (or on a second Analyse) and make
        // MediaPipe reject the frame. Video time still goes into FrameData
        // below, where cadence/duration math needs it.
        const result = landmarker.detectForVideo(video, performance.now());

        if (result.landmarks.length > 0 && result.worldLandmarks.length > 0) {
          frames.push({
            landmarks:      result.landmarks[0]      as LandmarkArray,
            worldLandmarks: result.worldLandmarks[0] as LandmarkArray,
            timestamp:      t * 1000,
          });
        }

        const pct = Math.min(100, Math.round((t / duration) * 100));
        pctEl.textContent = `Analysing… ${pct}%`;
      }
      completed = analysing;
    } finally {
      // Always restore UI state — a mid-loop throw (e.g. MediaPipe rejecting a
      // source that was emptied by a new upload) must not leave the overlay
      // stuck, the Analyse button disabled, and isBusy() eating the keyboard.
      analysing = false;
      overlayEl.style.display = 'none';
      analyseBtn.disabled = false;
    }

    if (!completed) return;

    runAnalysis(frames);
    if (window.innerWidth < 768) switchTab('results');
  }

  document.getElementById('analyse-btn')!.addEventListener('click', () => {
    if (analysing) return;
    runSilentAnalysis().catch(console.error);
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
      frameAspect: lastAnalysisFrameAspect,
    });
    closeReportModal();
  });
}

main().catch(console.error);
