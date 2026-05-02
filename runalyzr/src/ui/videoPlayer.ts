export interface VideoPlayerCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onSeeked: () => void;
  onLoadedMetadata: () => void;
}

export function initVideoPlayer(
  video: HTMLVideoElement,
  fileInput: HTMLInputElement,
  callbacks: VideoPlayerCallbacks,
): void {
  fileInput.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
  });

  video.addEventListener('play', callbacks.onPlay);
  video.addEventListener('pause', callbacks.onPause);
  video.addEventListener('seeked', callbacks.onSeeked);
  video.addEventListener('loadedmetadata', callbacks.onLoadedMetadata);

  const playPauseBtn = document.getElementById('play-pause') as HTMLButtonElement | null;
  const frameBackBtn = document.getElementById('frame-back') as HTMLButtonElement | null;
  const frameForwardBtn = document.getElementById('frame-forward') as HTMLButtonElement | null;
  const speedSelect = document.getElementById('speed-select') as HTMLSelectElement | null;

  function syncPlayPause(): void {
    if (playPauseBtn) playPauseBtn.textContent = video.paused ? '▶' : '⏸';
  }

  playPauseBtn?.addEventListener('click', () => {
    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      video.play();
    } else {
      video.pause();
    }
  });

  video.addEventListener('play', syncPlayPause);
  video.addEventListener('pause', syncPlayPause);
  video.addEventListener('ended', syncPlayPause);

  frameBackBtn?.addEventListener('click', () => {
    video.pause();
    video.currentTime = Math.max(0, video.currentTime - 1 / 30);
  });

  frameForwardBtn?.addEventListener('click', () => {
    video.pause();
    video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30);
  });

  speedSelect?.addEventListener('change', () => {
    video.playbackRate = parseFloat(speedSelect.value);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      video.pause();
      video.currentTime = Math.max(0, video.currentTime - 1 / 30);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      video.pause();
      video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30);
    }
  });
}

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  await video.play();
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
