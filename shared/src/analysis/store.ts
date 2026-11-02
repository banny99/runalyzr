import type { ThresholdEntry } from './thresholds';
import { bandFromEntry, entryWithBand, validateBand } from './bands';
import type { Band } from './bands';

export interface BandStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ThresholdStore<K extends string> {
  /** Active entry: the default object itself when there is no override. */
  entry(key: K): ThresholdEntry | undefined;
  band(key: K): Band | null;
  defaultBand(key: K): Band | null;
  isChanged(key: K): boolean;
  /** Returns the validation error (nothing changes) or saves and returns null. */
  set(key: K, band: Band | null): string | null;
  addBand(key: K): void;
  reset(key: K): void;
  resetAll(): void;
  subscribe(listener: () => void): () => void;
}

type Overrides = Record<string, Band | null>;

function defaultStorage(): BandStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const isEdge = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v));

function parseBand(raw: unknown): Band | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { green, lowRedAt, highRedAt } = raw as Record<string, unknown>;
  if (!Array.isArray(green) || green.length !== 2
    || typeof green[0] !== 'number' || typeof green[1] !== 'number'
    || !Number.isFinite(green[0]) || !Number.isFinite(green[1])) return undefined;
  if (!isEdge(lowRedAt) || !isEdge(highRedAt)) return undefined;
  return { green: [green[0], green[1]], lowRedAt, highRedAt };
}

const sameBand = (a: Band | null, b: Band | null): boolean => {
  if (!a || !b) return a === b;
  return a.green[0] === b.green[0] && a.green[1] === b.green[1]
    && a.lowRedAt === b.lowRedAt && a.highRedAt === b.highRedAt;
};

export function createThresholdStore<K extends string>(
  storageKey: string,
  defaults: Partial<Record<K, ThresholdEntry>>,
  storage?: BandStorage | null,
): ThresholdStore<K> {
  const backing = storage === undefined ? defaultStorage() : storage;
  const listeners = new Set<() => void>();
  const overrides: Overrides = {};
  const defaultFor = (key: K): ThresholdEntry | undefined => defaults[key];

  function load(): void {
    if (!backing) return;
    let parsed: unknown;
    try {
      const raw = backing.getItem(storageKey);
      if (raw === null) return;
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
    for (const [key, value] of Object.entries(parsed)) {
      const def = defaultFor(key as K);
      if (!def) continue;
      const band = parseBand(value);
      if (band === undefined) continue;
      if (band && validateBand(def, band) !== null) continue;
      overrides[key] = band;
    }
  }

  load();

  function persist(): void {
    if (!backing) return;
    try {
      if (Object.keys(overrides).length === 0) backing.removeItem(storageKey);
      else backing.setItem(storageKey, JSON.stringify(overrides));
    } catch {
      // Storage unavailable or full: keep the in-memory state for this session.
    }
  }

  const notify = (): void => { for (const l of [...listeners]) l(); };

  function commit(): void {
    persist();
    notify();
  }

  const band = (key: K): Band | null => {
    const def = defaultFor(key);
    if (!def) return null;
    return key in overrides ? overrides[key] : bandFromEntry(def);
  };
  const defaultBand = (key: K): Band | null => {
    const def = defaultFor(key);
    return def ? bandFromEntry(def) : null;
  };
  /** Compare in the entry's own terms so fields irrelevant to its direction don't count. */
  const normalised = (def: ThresholdEntry, b: Band | null): Band | null => bandFromEntry(entryWithBand(def, b));

  return {
    entry(key) {
      const def = defaultFor(key);
      if (!def || !(key in overrides)) return def;
      return entryWithBand(def, overrides[key]);
    },
    band,
    defaultBand,
    isChanged(key) {
      const def = defaultFor(key);
      if (!def) return false;
      return !sameBand(normalised(def, band(key)), bandFromEntry(def));
    },
    set(key, next) {
      const def = defaultFor(key);
      if (!def) return null;
      if (next) {
        const error = validateBand(def, next);
        if (error) return error;
      }
      if (sameBand(normalised(def, next), bandFromEntry(def))) delete overrides[key];
      else overrides[key] = next;
      commit();
      return null;
    },
    addBand(key) {
      const def = defaultFor(key);
      if (!def) return;
      overrides[key] = { green: def.suggestedGreen ?? [0, 10], lowRedAt: null, highRedAt: null };
      commit();
    },
    reset(key) {
      delete overrides[key];
      commit();
    },
    resetAll() {
      for (const key of Object.keys(overrides)) delete overrides[key];
      commit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
