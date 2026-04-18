import { initVideoPlayer } from './ui/videoPlayer';
import { initLandmarker } from './pose/landmarker';
import { createProcessingLoop, detectCameraView } from './pose/processing';
import { initOverlay } from './ui/overlay';
import type { LandmarkArray } from './analysis/types';

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
