import { describe, expect, test } from 'vitest';
import { oncePerFrame } from './schedule';

function fakeFrames() {
  const queue: (() => void)[] = [];
  return {
    request: (cb: () => void) => { queue.push(cb); },
    flush: () => { for (const cb of queue.splice(0)) cb(); },
    get pending() { return queue.length; },
  };
}

describe('oncePerFrame', () => {
  test('many calls in one frame run the work once, on the frame', () => {
    const frames = fakeFrames();
    let runs = 0;
    const schedule = oncePerFrame(() => { runs++; }, frames.request);
    schedule(); schedule(); schedule();
    expect(runs).toBe(0);
    expect(frames.pending).toBe(1);
    frames.flush();
    expect(runs).toBe(1);
  });

  test('a call after the frame ran schedules the next frame', () => {
    const frames = fakeFrames();
    let runs = 0;
    const schedule = oncePerFrame(() => { runs++; }, frames.request);
    schedule();
    frames.flush();
    schedule();
    frames.flush();
    expect(runs).toBe(2);
  });

  test('work that throws still lets later calls schedule', () => {
    const frames = fakeFrames();
    let runs = 0;
    const schedule = oncePerFrame(() => { runs++; if (runs === 1) throw new Error('boom'); }, frames.request);
    schedule();
    expect(() => frames.flush()).toThrow('boom');
    schedule();
    frames.flush();
    expect(runs).toBe(2);
  });
});
