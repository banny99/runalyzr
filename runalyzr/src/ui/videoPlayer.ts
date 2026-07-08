export interface VideoPlayerCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onSeeked: () => void;
  onLoadedMetadata: () => void;
  /** When true, keyboard frame-stepping is suppressed (e.g. during the
   *  silent-analysis seek loop, where a user seek would corrupt a frame). */
  isBusy?: () => boolean;
}

export function initVideoPlayer(
  video: HTMLVideoElement,
  fileInput: HTMLInputElement,
  callbacks: VideoPlayerCallbacks,
): () => void {
  let currentObjectUrl: string | null = null;

  fileInput.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    video.src = currentObjectUrl;
    video.load();
  });

  video.addEventListener('play', callbacks.onPlay);
  video.addEventListener('pause', callbacks.onPause);
  video.addEventListener('seeked', callbacks.onSeeked);
  video.addEventListener('loadedmetadata', callbacks.onLoadedMetadata);

  const playPauseBtn    = document.getElementById('play-pause')    as HTMLButtonElement | null;
  const frameBackBtn    = document.getElementById('frame-back')    as HTMLButtonElement | null;
  const frameForwardBtn = document.getElementById('frame-forward') as HTMLButtonElement | null;
  const speedSelect     = document.getElementById('speed-select')  as HTMLSelectElement | null;

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

  function onKeydown(e: KeyboardEvent): void {
    // Frame-stepping only applies to file review: skip while the live camera
    // is active (pausing a stream-backed element freezes preview + recording)
    // and while typing in form fields (the report modal needs its caret keys).
    if (video.srcObject) return;
    if (callbacks.isBusy?.()) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      video.pause();
      video.currentTime = Math.max(0, video.currentTime - 1 / 30);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      video.pause();
      video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30);
    }
  }
  document.addEventListener('keydown', onKeydown);

  return () => document.removeEventListener('keydown', onKeydown);
}

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  // Drop any uploaded file src so it can't resurface when the camera stops and
  // srcObject is cleared — otherwise the browser falls back to it. (Same fix
  // as bike's videoPlayer.)
  video.removeAttribute('src');
  video.srcObject = stream;
  await video.play();
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
