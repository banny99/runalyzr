import { describe, it, expect, vi } from 'vitest';
import { setRunningMode } from '@runalyzr/shared/pose';

function makeLandmarkerStub() {
  return { setOptions: vi.fn(() => Promise.resolve()) };
}

describe('setRunningMode', () => {
  it('applies the requested mode via setOptions', async () => {
    const lm = makeLandmarkerStub();
    await setRunningMode(lm, 'IMAGE');
    expect(lm.setOptions).toHaveBeenCalledWith({ runningMode: 'IMAGE' });
  });

  it('skips setOptions when the mode is already current', async () => {
    const lm = makeLandmarkerStub();
    await setRunningMode(lm, 'IMAGE');
    await setRunningMode(lm, 'IMAGE');
    expect(lm.setOptions).toHaveBeenCalledTimes(1);
  });

  it('switches back and forth, applying each real change', async () => {
    const lm = makeLandmarkerStub();
    await setRunningMode(lm, 'IMAGE');
    await setRunningMode(lm, 'VIDEO');
    await setRunningMode(lm, 'IMAGE');
    expect(lm.setOptions).toHaveBeenCalledTimes(3);
  });

  it('tracks mode per landmarker instance', async () => {
    const a = makeLandmarkerStub();
    const b = makeLandmarkerStub();
    await setRunningMode(a, 'IMAGE');
    await setRunningMode(b, 'IMAGE');
    expect(a.setOptions).toHaveBeenCalledTimes(1);
    expect(b.setOptions).toHaveBeenCalledTimes(1);
  });
});
