import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FIT_STEPS } from '../config/defaults';
import type { BikeGeometryStep } from '../config/defaults';
import type { BikeGeometryResult } from '../analysis/types';
import { createGeometryPhotoRefresh } from './geometryPhotoRefresh';

const STEP = FIT_STEPS.find((s): s is BikeGeometryStep => s.kind === 'bike');
if (!STEP) throw new Error('no bike geometry step in FIT_STEPS');
const step: BikeGeometryStep = STEP;

function result(stepId = step.id): BikeGeometryResult {
  return {
    stepId,
    stepName: step.name,
    imageDataUrl: 'old-render',
    imageAspect: 1.5,
    points: [],
    angles: [{ id: step.angles[0].id, label: 'Seat tube', value: 73, normalRange: '72–74°', status: 'green' }],
  };
}

/** Image loads that resolve only when the test says so, to model a slow decode. */
function deferredLoads() {
  const pending: { src: string; resolve: (img: string) => void }[] = [];
  return {
    load: (src: string) => new Promise<string>((resolve) => { pending.push({ src, resolve }); }),
    pending,
    resolveAll: () => { for (const p of pending.splice(0)) p.resolve(`img:${p.src}`); },
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('geometry photo re-render after a band change', () => {
  test('bursts of changes re-render each photo once, from the raw photo, with the current statuses', async () => {
    const r = result();
    const loads = deferredLoads();
    const renders: string[] = [];
    let done = 0;
    const refresh = createGeometryPhotoRefresh({
      results: () => [r],
      rawPhoto: (id) => (id === step.id ? 'raw-photo' : undefined),
      step: (id) => (id === step.id ? step : undefined),
      loadImage: loads.load,
      render: (img, s, _points, angles) => {
        const out = `${img}|${s.id}|${angles.map((a) => a.status).join(',')}`;
        renders.push(out);
        return out;
      },
      onDone: () => { done++; },
    });

    refresh.schedule();
    r.angles[0].status = 'amber';
    refresh.schedule();
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(150);
    expect(loads.pending).toHaveLength(0); // still waiting for the changes to settle

    await vi.advanceTimersByTimeAsync(200);
    expect(loads.pending.map((p) => p.src)).toEqual(['raw-photo']);
    loads.resolveAll();
    await vi.runAllTimersAsync();
    expect(renders).toEqual([`img:raw-photo|${step.id}|amber`]);
    expect(r.imageDataUrl).toBe(`img:raw-photo|${step.id}|amber`);
    expect(done).toBe(1);
  });

  test('a photo without a raw original keeps its old render', async () => {
    const r = result();
    let done = 0;
    const refresh = createGeometryPhotoRefresh({
      results: () => [r],
      rawPhoto: () => undefined,
      step: () => step,
      loadImage: async (src: string) => src,
      render: () => 'new-render',
      onDone: () => { done++; },
    });
    refresh.schedule();
    await vi.runAllTimersAsync();
    expect(r.imageDataUrl).toBe('old-render');
    expect(done).toBe(0);
  });

  test('a newer change supersedes a render that is still loading', async () => {
    const r = result();
    const loads = deferredLoads();
    let n = 0;
    const refresh = createGeometryPhotoRefresh({
      results: () => [r],
      rawPhoto: () => 'raw-photo',
      step: () => step,
      loadImage: loads.load,
      render: () => `render-${++n}`,
      onDone: () => {},
    });
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(250);
    const stale = loads.pending.splice(0);
    expect(stale).toHaveLength(1);

    refresh.schedule();
    stale[0].resolve('stale-img'); // the old load finishes after the newer change
    await vi.advanceTimersByTimeAsync(0);
    expect(r.imageDataUrl).toBe('old-render');

    await vi.advanceTimersByTimeAsync(250);
    loads.resolveAll();
    await vi.runAllTimersAsync();
    expect(r.imageDataUrl).toBe('render-1');
  });

  test('a result replaced or cleared while loading is not written', async () => {
    const r = result();
    let current: BikeGeometryResult[] = [r];
    const loads = deferredLoads();
    const refresh = createGeometryPhotoRefresh({
      results: () => current,
      rawPhoto: () => 'raw-photo',
      step: () => step,
      loadImage: loads.load,
      render: () => 'new-render',
      onDone: () => {},
    });
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(250);
    current = [];
    loads.resolveAll();
    await vi.runAllTimersAsync();
    expect(r.imageDataUrl).toBe('old-render');
  });

  test('cancel drops a pending re-render', async () => {
    const r = result();
    const refresh = createGeometryPhotoRefresh({
      results: () => [r],
      rawPhoto: () => 'raw-photo',
      step: () => step,
      loadImage: async (src: string) => src,
      render: () => 'new-render',
      onDone: () => {},
    });
    refresh.schedule();
    refresh.cancel();
    await vi.runAllTimersAsync();
    expect(r.imageDataUrl).toBe('old-render');
  });
});
