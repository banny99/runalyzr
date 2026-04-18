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
