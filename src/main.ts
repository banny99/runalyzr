import { initVideoPlayer } from './ui/videoPlayer';
import { initLandmarker } from './pose/landmarker';
import { createProcessingLoop, detectCameraView } from './pose/processing';
import { initOverlay } from './ui/overlay';
import type { LandmarkArray } from './analysis/types';
import { angleBetweenThreePoints } from './analysis/angles';
import { LANDMARKS } from './config/defaults';

async function main() {
  // Show loading indicator while MediaPipe initialises
  const loadingEl = document.createElement('div');
  loadingEl.id = 'loading-msg';
  loadingEl.textContent = 'Loading pose model…';
  document.body.appendChild(loadingEl);

  const video = document.getElementById('video') as HTMLVideoElement;
  const canvas = document.getElementById('overlay') as HTMLCanvasElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const toggleOverlayBtn = document.getElementById('toggle-overlay') as HTMLButtonElement;
  const viewDisplay = document.getElementById('view-display') as HTMLParagraphElement;

  const landmarker = await initLandmarker();
  loadingEl.remove();

  const overlay = initOverlay(canvas, video);

  const loop = createProcessingLoop(landmarker, video, (landmarks: LandmarkArray) => {
    overlay.drawSkeleton(landmarks);

    // Left knee angle
    const leftKneeAngle = angleBetweenThreePoints(
      landmarks[LANDMARKS.LEFT_HIP],
      landmarks[LANDMARKS.LEFT_KNEE],
      landmarks[LANDMARKS.LEFT_ANKLE],
    );
    overlay.drawAngleLabel(landmarks, LANDMARKS.LEFT_KNEE, `${leftKneeAngle.toFixed(0)}°`);

    // Right knee angle
    const rightKneeAngle = angleBetweenThreePoints(
      landmarks[LANDMARKS.RIGHT_HIP],
      landmarks[LANDMARKS.RIGHT_KNEE],
      landmarks[LANDMARKS.RIGHT_ANKLE],
    );
    overlay.drawAngleLabel(landmarks, LANDMARKS.RIGHT_KNEE, `${rightKneeAngle.toFixed(0)}°`);

    const view = detectCameraView(landmarks);
    viewDisplay.textContent = `View: ${view}`;
  });

  initVideoPlayer(video, fileInput, {
    onLoadedMetadata: () => overlay.syncSize(),
    onPlay: () => loop.start(),
    onPause: () => loop.stop(),
    onSeeked: () => {
      const lm = loop.getCurrentLandmarks();
      if (lm) overlay.drawSkeleton(lm);
    },
  });

  toggleOverlayBtn.addEventListener('click', () => {
    const isVisible = canvas.style.display !== 'none';
    overlay.setVisible(!isVisible);
    canvas.style.display = isVisible ? 'none' : '';
  });
}

main().catch(console.error);
