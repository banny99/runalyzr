import { describe, expect, test } from 'vitest';
import { createThresholdStore } from './store';
import type { BandStorage } from './store';
import { evaluateThreshold } from './thresholds';
import type { ThresholdEntry } from './thresholds';
import { noBand } from './bands';

const DEFAULTS = {
  knee: { green: [145, 155], amber: [135, 145], amberHigh: [155, 160], unit: '°', direction: 'two_sided' },
  info: noBand('°', [80, 100]),
} satisfies Record<string, ThresholdEntry>;

const KEY = 'thresholds';

function fakeStorage(initial?: Record<string, string>): BandStorage & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

const throwingStorage: BandStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};

describe('createThresholdStore', () => {
  test('no overrides returns the default entries unchanged', () => {
    const store = createThresholdStore(KEY, DEFAULTS, fakeStorage());
    expect(store.entry('knee')).toBe(DEFAULTS.knee);
    expect(store.isChanged('knee')).toBe(false);
  });

  test('set saves only the override and survives a new store on the same storage', () => {
    const storage = fakeStorage();
    const store = createThresholdStore(KEY, DEFAULTS, storage);
    const band = { green: [140, 150] as [number, number], lowRedAt: 130, highRedAt: null };
    expect(store.set('knee', band)).toBeNull();
    expect(JSON.parse(storage.map.get(KEY)!)).toEqual({ knee: band });
    const next = createThresholdStore(KEY, DEFAULTS, storage);
    expect(next.band('knee')).toEqual(band);
    expect(evaluateThreshold(200, next.entry('knee'))).toBe('amber');
  });

  test('invalid set returns the message and keeps the last valid band', () => {
    const storage = fakeStorage();
    const store = createThresholdStore(KEY, DEFAULTS, storage);
    const before = store.band('knee');
    const err = store.set('knee', { green: [145, 155], lowRedAt: 150, highRedAt: 160 });
    expect(err).toBe('Amber must start below green (150 is above the green start of 145).');
    expect(store.band('knee')).toEqual(before);
    expect(storage.map.has(KEY)).toBe(false);
  });

  test('setting the default value clears the override', () => {
    const storage = fakeStorage();
    const store = createThresholdStore(KEY, DEFAULTS, storage);
    store.set('knee', { green: [140, 150], lowRedAt: 130, highRedAt: null });
    expect(store.isChanged('knee')).toBe(true);
    store.set('knee', store.defaultBand('knee'));
    expect(store.isChanged('knee')).toBe(false);
    expect(store.entry('knee')).toBe(DEFAULTS.knee);
    expect(JSON.parse(storage.map.get(KEY) ?? '{}')).not.toHaveProperty('knee');
  });

  test('addBand on an information-only metric uses suggestedGreen', () => {
    const store = createThresholdStore(KEY, DEFAULTS, fakeStorage());
    store.addBand('info');
    expect(store.band('info')).toEqual({ green: [80, 100], lowRedAt: null, highRedAt: null });
    expect(store.isChanged('info')).toBe(true);
    expect(store.set('info', null)).toBeNull();
    expect(store.isChanged('info')).toBe(false);
  });

  test('reset and resetAll restore defaults and notify subscribers', () => {
    const store = createThresholdStore(KEY, DEFAULTS, fakeStorage());
    let calls = 0;
    const unsubscribe = store.subscribe(() => { calls++; });
    store.set('knee', { green: [140, 150], lowRedAt: 130, highRedAt: null });
    expect(calls).toBe(1);
    store.reset('knee');
    expect(calls).toBe(2);
    expect(store.isChanged('knee')).toBe(false);
    store.addBand('info');
    store.resetAll();
    expect(calls).toBe(4);
    expect(store.isChanged('info')).toBe(false);
    unsubscribe();
    store.addBand('info');
    expect(calls).toBe(4);
  });

  test('a rejected set does not notify subscribers', () => {
    const store = createThresholdStore(KEY, DEFAULTS, fakeStorage());
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.set('knee', { green: [155, 145], lowRedAt: null, highRedAt: null });
    expect(calls).toBe(0);
  });

  test.each([
    'not json',
    '[]',
    '{"knee":{"green":"x"}}',
    '{"knee":{"green":[150,140],"lowRedAt":null,"highRedAt":null}}',
    '{"gone":null}',
  ])('corrupt storage falls back to defaults: %s', (raw) => {
    const store = createThresholdStore(KEY, DEFAULTS, fakeStorage({ [KEY]: raw }));
    expect(store.entry('knee')).toBe(DEFAULTS.knee);
    expect(store.isChanged('knee')).toBe(false);
  });

  test('a stored null removes the default band', () => {
    const store = createThresholdStore(KEY, DEFAULTS, fakeStorage({ [KEY]: '{"knee":null}' }));
    expect(store.band('knee')).toBeNull();
    expect(store.isChanged('knee')).toBe(true);
  });

  test('throwing storage still works in memory for the session', () => {
    const store = createThresholdStore(KEY, DEFAULTS, throwingStorage);
    const band = { green: [140, 150] as [number, number], lowRedAt: 130, highRedAt: null };
    expect(store.set('knee', band)).toBeNull();
    expect(store.band('knee')).toEqual(band);
    store.reset('knee');
    expect(store.isChanged('knee')).toBe(false);
  });

  test('null storage and missing localStorage use memory', () => {
    const a = createThresholdStore(KEY, DEFAULTS, null);
    const b = createThresholdStore(KEY, DEFAULTS);
    for (const s of [a, b]) {
      s.addBand('info');
      expect(s.band('info')).not.toBeNull();
    }
  });
});
