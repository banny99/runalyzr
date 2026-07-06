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
  let currentObjectUrl: string | null = null;

  video.addEventListener('loadedmetadata', () => callbacks.onLoadedMetadata?.());
  video.addEventListener('play',           () => callbacks.onPlay?.());
  video.addEventListener('pause',          () => callbacks.onPause?.());
  video.addEventListener('seeked',         () => callbacks.onSeeked?.());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    video.src = currentObjectUrl;
    // Native controls so an uploaded video can be played/scrubbed — playback is
    // what drives frame collection and analysis. Disabled again for camera mode.
    video.controls = true;
    video.load();
  });
}

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.controls = false; // live camera uses the app's own record UI, not native controls
  video.srcObject = stream;
  await video.play();
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  video.controls = false;
}
