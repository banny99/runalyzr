import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { FrameData, CameraView, AnalysisResults, MetricStatus } from '../analysis/types';
import { LANDMARKS } from '../config/defaults';
import { detectCameraView } from '../pose/processing';
import { evaluateSetupChecks } from '../analysis/setupChecks';
import { angleBetweenThreePoints } from '../analysis/angles';
import { startCamera, stopCamera } from './videoPlayer';
import type { initOverlay } from './overlay';

type OverlayHandle = ReturnType<typeof initOverlay>;

export interface CameraControllerDeps {
  video: HTMLVideoElement;
  overlay: OverlayHandle;
  landmarker: PoseLandmarker;
  liveMetricsEl: HTMLElement;
  setupOverlayEl: HTMLElement;
  setupPanelEl: HTMLElement;
  videoContainerEl: HTMLElement;
  videoTopRightEl: HTMLElement;
  recordBtn: HTMLButtonElement;
  viewModeBtn: HTMLButtonElement;
  recIndicator: HTMLElement;
  recTimerEl: HTMLElement;
  shareVideoBtn: HTMLButtonElement;
  setupToggleEl: HTMLElement;
  setupToggleIcon: HTMLElement;
  onAnalysisReady: (frames: FrameData[], view: 'sagittal' | 'frontal' | null) => void;
  onBlobUrl: (url: string | null) => void;
  getLastResults: () => AnalysisResults | null;
  updateLiveMetrics: (cadence: number | null, view: CameraView, fps: number) => void;
}

function applyCheck(
  id: string,
  pass: boolean,
  passText: string,
  failText: string,
  pending = false,
): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = pass ? passText : failText;
  el.className = pending ? 'check-pending' : (pass ? 'check-pass' : 'check-fail');
}

export function initCameraController(deps: CameraControllerDeps) {
  const {
    video, overlay, landmarker,
    liveMetricsEl, setupOverlayEl, setupPanelEl, videoContainerEl, videoTopRightEl,
    recordBtn, viewModeBtn, recIndicator, recTimerEl, shareVideoBtn,
    setupToggleEl, setupToggleIcon,
    onAnalysisReady, onBlobUrl, getLastResults, updateLiveMetrics,
  } = deps;

  let cameraState: 'closed' | 'setup' | 'recording' = 'closed';
  let cameraRunning = false;
  let cameraRafId = 0;
  let setupConsecutiveFrames = 0;
  let lastLandmarkTime = 0;
  let recTimerInterval = 0;
  let recStartTime = 0;
  let selectedView: 'sagittal' | 'frontal' | null = null;
  let recordedBlobUrl: string | null = null;
  let compositeCanvas: HTMLCanvasElement | null = null;
  let compositeCtx: CanvasRenderingContext2D | null = null;
  let recordingHasOverlay = false;
  let mediaRecorder: MediaRecorder | null = null;
  const recordedChunks: Blob[] = [];
  const cameraFrames: FrameData[] = [];

  const L = LANDMARKS;

  function setPillColor(color: 'green' | 'red' | 'grey'): void {
    setupToggleEl.classList.remove('pill-red', 'pill-green');
    if (color !== 'grey') setupToggleEl.classList.add(`pill-${color}`);
    setupToggleIcon.textContent = color === 'green' ? '✓' : color === 'red' ? '✗' : '⚠';
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

  function refreshSetupUI(checks: ReturnType<typeof evaluateSetupChecks>): void {
    const isSag = selectedView === 'sagittal';
    const notReady = (dep: boolean) => !checks.viewSelected || !checks.stable || !dep;

    if (checks.viewSelected) {
      const label = isSag ? 'Side view' : 'Front view';
      const mismatch = checks.detectedView !== selectedView && checks.detectedView !== 'unknown';
      const suffix = mismatch
        ? ` (camera sees ${checks.detectedView === 'sagittal' ? 'side' : 'front'})`
        : '';
      applyCheck('check-view', !mismatch, `${label} selected${suffix}`, `${label} selected${suffix}`);
    } else {
      applyCheck('check-view', false, '', 'Choose view (tap button above)');
    }
    applyCheck('check-stable',      checks.stable,         'Pose detected',                            'Detecting pose…',               !checks.stable);
    applyCheck('check-orientation', checks.orientation,    isSag ? 'Sideways to camera' : 'Facing camera',        isSag ? 'Turn sideways' : 'Face the camera', notReady(true));
    applyCheck('check-alignment',   checks.jointAlignment, isSag ? 'Hip–knee–ankle aligned' : 'Bilateral symmetry OK', isSag ? 'Rotate more' : 'Off-centre',    notReady(checks.orientation));
    applyCheck('check-body',        checks.bodyInFrame,    isSag ? 'Full body in frame (side)' : 'Full body in frame (front)', 'Full body not visible',            notReady(checks.orientation));
    applyCheck('check-distance',    checks.goodDistance,   isSag ? 'Good distance' : 'Good width coverage',      isSag ? 'Adjust distance' : 'Adjust distance', notReady(checks.orientation));
    applyCheck('check-camera-pos',  checks.cameraPosition, isSag ? 'Camera at hip height' : 'Centred & level',   isSag ? 'Adjust camera height' : 'Centre yourself', notReady(checks.orientation && checks.bodyInFrame && checks.goodDistance));
    applyCheck('check-lighting',    checks.goodLighting,   'Adequate lighting',                        'Improve lighting');

    const hintEl = document.getElementById('setup-hint');
    if (hintEl) hintEl.textContent = checks.hint;
  }

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
    selectedView = selectedView === null ? 'sagittal'
      : selectedView === 'sagittal' ? 'frontal'
        : null;
    updateViewModeBtn();
    setupConsecutiveFrames = Math.max(0, setupConsecutiveFrames - 1);
  });

  recordBtn.addEventListener('click', () => {
    if (cameraState === 'setup') startRecording();
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
    } catch { /* share cancelled or blob revoked */ }
  });

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
        compositeCanvas.width = video.videoWidth || 1280;
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

    onAnalysisReady(capturedFrames, viewForAnalysis);
    if (window.innerWidth < 768) {
      document.querySelectorAll('.tab').forEach((t) =>
        (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.tab === 'results'));
      document.querySelectorAll('.tab-panel').forEach((p) =>
        (p as HTMLElement).classList.toggle('active', (p as HTMLElement).dataset.tab === 'results'));
    }

    const finalize = (blobUrl: string | null) => {
      compositeCanvas = null;
      compositeCtx = null;
      stopCamera(video);
      if (blobUrl) {
        if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
        recordedBlobUrl = blobUrl;
        video.src = blobUrl;
        video.load();
        shareVideoBtn.style.display = 'flex';
        // Switch to video file UI
        videoTopRightEl.style.display = 'flex';
        document.getElementById('camera-idle')!.style.display = 'none';
        videoContainerEl.style.display = 'block';
        document.getElementById('record-btn')!.style.display = 'none';
        document.getElementById('playback-controls')!.style.display = 'flex';
      } else {
        onBlobUrl(null);
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

  function cameraLoop(): void {
    if (!cameraRunning) return;
    if (video.readyState >= 2) {
      const result = landmarker.detectForVideo(video, performance.now());
      if (result.landmarks.length > 0 && result.worldLandmarks.length > 0) {
        const lms = result.landmarks[0];
        lastLandmarkTime = performance.now();
        const lastResults = getLastResults();
        const statuses: Partial<Record<number, MetricStatus>> = {};
        if (lastResults) {
          const set = (indices: number[], status: MetricStatus) =>
            indices.forEach((i) => { statuses[i] = status; });
          if (lastResults.kneeFlexionAtContact)
            set([L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
              lastResults.kneeFlexionAtContact.status);
          if (lastResults.pelvicDrop)
            set([L.LEFT_HIP, L.RIGHT_HIP], lastResults.pelvicDrop.status);
          if (lastResults.trunkLateralLean)
            set([L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
              lastResults.trunkLateralLean.status);
        }
        overlay.drawSkeleton(lms, statuses);

        if (cameraState === 'setup') {
          setupConsecutiveFrames++;
          const checks = evaluateSetupChecks(lms, setupConsecutiveFrames, selectedView);
          refreshSetupUI(checks);
          recordBtn.disabled = !checks.allPassed;
          recordBtn.classList.toggle('ready', checks.allPassed);
          const hasRed = !!document.querySelector('#setup-checklist .check-fail');
          const color = checks.allPassed ? 'green' : hasRed ? 'red' : 'grey';
          videoContainerEl.classList.remove('frame-grey', 'frame-red', 'frame-amber', 'frame-green');
          videoContainerEl.classList.add(`frame-${color}`);
          setPillColor(color as 'green' | 'red' | 'grey');
          if (checks.allPassed) showLivePanel();
          else setupOverlayEl.classList.add('visible');

          const leftKnee = angleBetweenThreePoints(
            lms[L.LEFT_HIP], lms[L.LEFT_KNEE], lms[L.LEFT_ANKLE]);
          const rightKnee = angleBetweenThreePoints(
            lms[L.RIGHT_HIP], lms[L.RIGHT_KNEE], lms[L.RIGHT_ANKLE]);
          overlay.drawAngleLabel(lms, L.LEFT_KNEE,  `${leftKnee.toFixed(0)}°`);
          overlay.drawAngleLabel(lms, L.RIGHT_KNEE, `${rightKnee.toFixed(0)}°`);
          updateLiveMetrics(null, detectCameraView(lms), 0);
        } else if (cameraState === 'recording') {
          if (cameraFrames.length < 9000) {
            cameraFrames.push({
              landmarks:      lms,
              worldLandmarks: result.worldLandmarks[0],
              timestamp:      performance.now(),
            });
          }
          if (compositeCtx && compositeCanvas) {
            compositeCtx.drawImage(video, 0, 0, compositeCanvas.width, compositeCanvas.height);
            compositeCtx.drawImage(
              document.getElementById('overlay') as HTMLCanvasElement,
              0, 0, compositeCanvas.width, compositeCanvas.height,
            );
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
  }

  return {
    async open(): Promise<void> {
      cameraState = 'setup';
      selectedView = null;
      if (recordedBlobUrl) {
        URL.revokeObjectURL(recordedBlobUrl);
        recordedBlobUrl = null;
        video.removeAttribute('src');
      }
      shareVideoBtn.style.display = 'none';
      await startCamera(video);
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
      cameraLoop();
    },

    close(): void {
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
      if (wasRecording) onAnalysisReady([...cameraFrames], selectedView);
    },
  };
}
