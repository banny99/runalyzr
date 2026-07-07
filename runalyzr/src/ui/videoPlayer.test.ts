// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initVideoPlayer, startCamera } from './videoPlayer';

function setupDom() {
  document.body.innerHTML = `
    <video id="video"></video>
    <input type="file" id="file-input" />
    <div id="playback-controls">
      <button id="play-pause">▶</button>
      <button id="frame-back">← Frame</button>
      <button id="frame-forward">Frame →</button>
      <select id="speed-select"><option value="1" selected>1×</option></select>
    </div>
    <input type="text" id="client-name" />
  `;
  const video = document.getElementById('video') as HTMLVideoElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  return { video, fileInput };
}

const noopCallbacks = {
  onPlay: () => {},
  onPause: () => {},
  onSeeked: () => {},
  onLoadedMetadata: () => {},
};

describe('initVideoPlayer — playback controls', () => {
  let video: HTMLVideoElement;
  let fileInput: HTMLInputElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ video, fileInput } = setupDom());
    cleanup = initVideoPlayer(video, fileInput, noopCallbacks);
  });

  it('play/pause button starts playback when paused', () => {
    const play = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    (document.getElementById('play-pause') as HTMLButtonElement).click();
    expect(play).toHaveBeenCalledOnce();
    cleanup();
  });

  it('play/pause button pauses playback when playing', () => {
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    (document.getElementById('play-pause') as HTMLButtonElement).click();
    expect(pause).toHaveBeenCalledOnce();
    cleanup();
  });

  it('arrow keys frame-step the video during file review', () => {
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.currentTime = 5;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(pause).toHaveBeenCalled();
    cleanup();
  });

  it('arrow keys are ignored while typing in a text input (report modal)', () => {
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    const input = document.getElementById('client-name') as HTMLInputElement;
    input.focus();
    const ev = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(pause).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false); // caret movement must survive
    cleanup();
  });

  it('arrow keys are ignored while the live camera is active (srcObject set)', () => {
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    Object.defineProperty(video, 'srcObject', { configurable: true, value: {} });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(pause).not.toHaveBeenCalled();
    cleanup();
  });

  it('cleanup removes the keydown handler', () => {
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    cleanup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(pause).not.toHaveBeenCalled();
  });
});

describe('startCamera — upload → camera transition', () => {
  it('clears a stale uploaded src so it cannot resurface after stopCamera', async () => {
    const { video } = setupDom();
    video.src = 'blob:http://localhost/stale-upload';
    const play = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({}) },
    });
    Object.defineProperty(video, 'srcObject', { configurable: true, writable: true, value: null });
    await startCamera(video);
    expect(video.getAttribute('src')).toBeNull();
    expect(play).toHaveBeenCalled();
  });
});
