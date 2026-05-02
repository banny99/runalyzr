interface VideoPlayerCallbacks {
  onLoadedMetadata?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSeeked?: () => void;
}

export function initVideoPlayer(
  video: HTMLVideoElement,
  fileInput: HTMLInputElement,
  callbacks: VideoPlayerCallbacks,
): void {
  video.addEventListener('loadedmetadata', () => callbacks.onLoadedMetadata?.());
  video.addEventListener('play',           () => callbacks.onPlay?.());
  video.addEventListener('pause',          () => callbacks.onPause?.());
  video.addEventListener('seeked',         () => callbacks.onSeeked?.());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
  });
}

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
