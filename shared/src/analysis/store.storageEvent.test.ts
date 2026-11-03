// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest';
import { createThresholdStore } from './store';
import type { ThresholdEntry } from './thresholds';

const DEFAULTS = {
  knee: { green: [145, 155], amber: [135, 145], amberHigh: [155, 160], unit: '°', direction: 'two_sided' },
} satisfies Record<string, ThresholdEntry>;

const KEY = 'storage-event-thresholds';

function otherTabWrites(key: string, value: string | null): void {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }));
}

afterEach(() => { localStorage.clear(); });

describe('threshold store across tabs', () => {
  test("another tab's write is loaded and subscribers are notified", () => {
    const store = createThresholdStore(KEY, DEFAULTS);
    let calls = 0;
    store.subscribe(() => { calls++; });

    const band = { green: [140, 150], lowRedAt: 130, highRedAt: null };
    otherTabWrites(KEY, JSON.stringify({ knee: band }));
    expect(store.band('knee')).toEqual(band);
    expect(calls).toBe(1);

    otherTabWrites(KEY, null);
    expect(store.isChanged('knee')).toBe(false);
    expect(calls).toBe(2);
  });

  test('a later save here keeps what the other tab wrote', () => {
    const DEFS = { ...DEFAULTS, hip: DEFAULTS.knee };
    const store = createThresholdStore(KEY, DEFS);
    otherTabWrites(KEY, JSON.stringify({ knee: { green: [140, 150], lowRedAt: 130, highRedAt: null } }));
    store.set('hip', { green: [146, 154], lowRedAt: 135, highRedAt: 160 });
    expect(Object.keys(JSON.parse(localStorage.getItem(KEY) ?? '{}')).sort()).toEqual(['hip', 'knee']);
  });

  test('events for other keys are ignored', () => {
    const store = createThresholdStore(KEY, DEFAULTS);
    let calls = 0;
    store.subscribe(() => { calls++; });
    otherTabWrites('something-else', '{"knee":null}');
    expect(calls).toBe(0);
    expect(store.isChanged('knee')).toBe(false);
  });
});
