# Threshold Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ⚙ settings screen in each app where a fitter can drag or type every threshold band (green/amber/optional red), stored on the device, with results, dashboard and PDF following the active bands live.

**Architecture:** The default tables stay in code as `ThresholdEntry` objects. A shared `ThresholdStore` layers device-stored overrides (as a compact `Band`) on top and returns the *active* entry per metric; every status evaluation and "normal range" string reads from a store. Fit-photo and geometry bands move onto the shared engine as two-sided entries whose outer amber edges are ±Infinity (= no red). A shared DOM settings screen edits any set of stores; apps subscribe to their stores and re-score existing results in place.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom for the one screen test), vanilla DOM, `localStorage`.

**Spec:** `docs/superpowers/specs/2026-11-02-threshold-settings-design.md`

**Branch:** `feature/threshold-settings`, stacked on `fix/wrong-fit-and-gait-advice` (PR #22 — two-sided bands are a prerequisite). Rebase onto `main` once #22 merges.

## Global Constraints

- Defaults must reproduce today's statuses exactly for a user who never opens settings — including Fit and geometry staying green/amber only.
- Invalid bands are never stored; the last valid value stays in effect.
- Storage: `localStorage`, override-only, every access in try/catch, falls back to in-memory if unavailable. Keys: `runalyzr.thresholds.v1`, `bike.thresholds.ride.v1`, `bike.thresholds.fit.v1`, `bike.thresholds.geometry.v1`.
- Inputs: numeric keypad with decimal point on touch (`type="text" inputmode="decimal"` — see Review Focus 1), ≥ 44 px touch targets, ± toggle on signed rows (only `saddle_tilt` and `bar_drop_angle`), focused box scrolled into view.
- Repo invariants (`CLAUDE.md`): no `Math.max/min(...spread)`, no `as any` / `as unknown as`, new shared subpath registered in `shared/package.json` exports + both tsconfig `paths` + both Vite `alias`.
- Fit and ride-video are separate settings; within Fit one setting per measurement across positions/legs.

## Review Focus

1. **Comma decimals.** On a Danish/European phone the decimal keypad types `1,5`. Expected: read as 1.5 (a `type="number"` input would silently drop it — hence `type="text" inputmode="decimal"`). Pinned in Task 3.
2. **Half-typed values.** While typing, the box holds `-`, `.`, `` or `1.`. Expected: `-`/`.`/empty-green don't save and don't wipe the band; empty *red* box means "no red". Pinned in Task 3.
3. **Corrupt or stale storage** (not JSON, wrong shape, out-of-order band, key that no longer exists). Expected: that metric falls back to default, nothing crashes. Pinned in Task 2.
4. **Storage unavailable** (private mode, quota, blocked). Expected: settings still work for the session, in memory. Pinned in Task 2.
5. **Red cleared on a two-sided ride metric**, value far above green. Expected: amber with the *high-side* advice, never red, never low-side text. Pinned in Task 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/src/analysis/bands.ts` (new) | `Band` type; convert entry↔band; validate; format range; `greenOnly`/`noBand` table helpers; `rescoreMetrics`; generic finding text |
| `shared/src/analysis/store.ts` (new) | `createThresholdStore` — defaults + persisted overrides + subscribe |
| `shared/src/analysis/thresholds.ts` | add `suggestedGreen?` to `ThresholdBase` |
| `shared/src/analysis/findings.ts` | optional `fallback` parameter |
| `shared/src/settings/rowModel.ts` (new) | pure editing logic: fields per shape, input parsing, apply edit, bar scale, drag mapping |
| `shared/src/settings/screen.ts` (new) | DOM settings overlay (`openThresholdSettings`) incl. injected CSS |
| `runalyzr/src/settings/thresholdStore.ts` (new) | app store singleton + settings sections |
| `bike/src/settings/thresholdStores.ts` (new) | three bike stores + settings sections |
| `bike/src/analysis/fitThresholds.ts` (new) | `FitMetricId`, `FIT_THRESHOLDS` |
| `bike/src/analysis/geometryThresholds.ts` (new) | `GeometryAngleId`, `GEOMETRY_THRESHOLDS` |
| `bike/src/analysis/fitRescore.ts` (new) | `rescoreFitResults` |
| `bike/src/analysis/bands.ts` + `bands.test.ts` | deleted (replaced by shared engine) |

---

### Task 1: Shared band model

**Files:**
- Create: `shared/src/analysis/bands.ts`, `shared/src/analysis/bands.test.ts`
- Modify: `shared/src/analysis/thresholds.ts` (ThresholdBase), `shared/src/analysis/findings.ts`, `shared/src/analysis/findings.test.ts`, `shared/src/analysis/index.ts`

**Interfaces:**
- Produces (all exported from `@runalyzr/shared/analysis`):
  - `interface Band { green: [number, number]; lowRedAt: number | null; highRedAt: number | null }` — `lowRedAt`: values below it are red (null = amber forever below); `highRedAt`: values above it are red (null = amber forever above). Fields irrelevant to the entry's direction are always `null`.
  - `ThresholdBase.suggestedGreen?: [number, number]` — starting green for "Add band" on information-only entries.
  - `bandFromEntry(t: ThresholdEntry): Band | null` — `null` when `indicativeOnly`. Non-finite edges map to `null`.
  - `entryWithBand(t: ThresholdEntry, band: Band | null): ThresholdEntry` — keeps `unit` and `suggestedGreen`; `null` → `noBand(t.unit, t.suggestedGreen)`; `indicativeOnly` or `two_sided` base → `two_sided`; one-sided bases keep their direction. `null` edges become `-Infinity` / `Infinity`; amber's inner edge equals the green edge.
  - `validateBand(t: ThresholdEntry, band: Band): string | null` — checks only the fields relevant to `entryWithBand(t, band).direction`.
  - `formatGreenRange(t: ThresholdEntry | undefined): string | undefined` — `undefined` for missing/indicativeOnly; `±a${unit}` when `green[0] === -green[1]`; else `${g0}–${g1}${unit}`.
  - `greenOnly(green: [number, number], unit: string): TwoSidedThreshold` — today's Fit/geometry behaviour.
  - `noBand(unit: string, suggestedGreen?: [number, number]): ThresholdEntry` — `indicativeOnly: true`.
  - `rescoreMetrics<K extends string>(metrics: Partial<Record<K, MetricResult | null>>, entryFor: (key: K) => ThresholdEntry | undefined): void` — mutates each non-null result's `status` and `side` (deletes `side` when not flagged) to match `thresholdMetricResult(result.value, entryFor(key))`.
  - `outOfRangeText(label: string, result: MetricResult, t: ThresholdEntry | undefined): string` — exact copy: `` `${label} of ${result.value.toFixed(1)}${result.unit} is outside your set range of ${formatGreenRange(t)}.` ``
  - `findingsFromTemplates(metrics, templates, fallback?: (key: K, result: MetricResult) => string | undefined)` — fallback used only when the key has **no template**; result keeps red-first sort.

- [ ] **Step 1: Write failing tests in `bands.test.ts`**

```ts
const twoSided: ThresholdEntry = { green: [145, 155], amber: [135, 145], amberHigh: [155, 160], unit: '°', direction: 'two_sided' };
const lowerWorse: ThresholdEntry = { green: [80, 100], amber: [70, 80], unit: ' rpm', direction: 'lower_is_worse' };
const higherWorse: ThresholdEntry = { green: [0, 5], amber: [5, 7], unit: '°', direction: 'higher_is_worse' };

test('bandFromEntry keeps only the edges each direction uses', () => {
  expect(bandFromEntry(twoSided)).toEqual({ green: [145, 155], lowRedAt: 135, highRedAt: 160 });
  expect(bandFromEntry(lowerWorse)).toEqual({ green: [80, 100], lowRedAt: 70, highRedAt: null });
  expect(bandFromEntry(higherWorse)).toEqual({ green: [0, 5], lowRedAt: null, highRedAt: 7 });
  expect(bandFromEntry(greenOnly([35, 50], '°'))).toEqual({ green: [35, 50], lowRedAt: null, highRedAt: null });
  expect(bandFromEntry(noBand('°'))).toBeNull();
});

test('round-trip through a band evaluates identically', () => {
  for (const t of [twoSided, lowerWorse, higherWorse, greenOnly([35, 50], '°')]) {
    const back = entryWithBand(t, bandFromEntry(t));
    for (let v = -20; v <= 220; v += 0.5) expect(evaluateThreshold(v, back)).toBe(evaluateThreshold(v, t));
  }
});

test('greenOnly never goes red', () => {
  const t = greenOnly([35, 50], '°');
  expect(evaluateThreshold(40, t)).toBe('green');
  expect(evaluateThreshold(-1000, t)).toBe('amber');
  expect(evaluateThreshold(1000, t)).toBe('amber');
});

test('adding a red edge to a green-only entry makes values past it red', () => {
  const t = entryWithBand(greenOnly([35, 50], '°'), { green: [35, 50], lowRedAt: null, highRedAt: 60 });
  expect(evaluateThreshold(55, t)).toBe('amber');
  expect(evaluateThreshold(61, t)).toBe('red');
  expect(evaluateThreshold(10, t)).toBe('amber');
});

test('a band on an information-only entry is two-sided', () => {
  const t = entryWithBand(noBand('°', [80, 100]), { green: [80, 100], lowRedAt: null, highRedAt: null });
  expect(t.direction).toBe('two_sided');
  expect(evaluateThreshold(90, t)).toBe('green');
  expect(evaluateThreshold(70, t)).toBe('amber');
});

test('cleared red on a two-sided metric far above green is amber with high side', () => {   // Review Focus 5
  const t = entryWithBand(twoSided, { green: [145, 155], lowRedAt: 135, highRedAt: null });
  expect(thresholdMetricResult(200, t)).toEqual({ value: 200, status: 'amber', unit: '°', side: 'high' });
});

test('validateBand', () => {
  expect(validateBand(twoSided, { green: [145, 155], lowRedAt: 135, highRedAt: 160 })).toBeNull();
  expect(validateBand(lowerWorse, { green: [80, 100], lowRedAt: 85, highRedAt: null }))
    .toBe('Amber must start below green (85 is above the green start of 80).');
  expect(validateBand(twoSided, { green: [145, 155], lowRedAt: 135, highRedAt: 150 }))
    .toBe('Amber must end above green (150 is below the green end of 155).');
  expect(validateBand(twoSided, { green: [155, 145], lowRedAt: null, highRedAt: null }))
    .toBe('Green start must be below green end.');
  expect(validateBand(twoSided, { green: [145, 155], lowRedAt: 145, highRedAt: 155 })).toBeNull(); // zero-width amber allowed
  expect(validateBand(higherWorse, { green: [0, 5], lowRedAt: 99, highRedAt: 7 })).toBeNull();     // lowRedAt irrelevant here
  expect(validateBand(twoSided, { green: [NaN, 155], lowRedAt: null, highRedAt: null })).toBe('Enter a number.');
});

test('formatGreenRange', () => {
  expect(formatGreenRange(lowerWorse)).toBe('80–100 rpm');
  expect(formatGreenRange(greenOnly([-2, 2], '°'))).toBe('±2°');
  expect(formatGreenRange(noBand('°'))).toBeUndefined();
  expect(formatGreenRange(undefined)).toBeUndefined();
});

test('rescoreMetrics updates status and side in place', () => {
  const r = { knee: thresholdMetricResult(150, twoSided), gone: null };
  rescoreMetrics(r, () => entryWithBand(twoSided, { green: [160, 170], lowRedAt: 140, highRedAt: 175 }));
  expect(r.knee).toEqual({ value: 150, status: 'amber', unit: '°', side: 'low' });
  rescoreMetrics(r, () => twoSided);
  expect(r.knee).toEqual({ value: 150, status: 'green', unit: '°' });
});

test('outOfRangeText', () => {
  const t = entryWithBand(noBand('°'), { green: [80, 100], lowRedAt: null, highRedAt: null });
  expect(outOfRangeText('Shoulder Angle', { value: 72, status: 'amber', unit: '°' }, t))
    .toBe('Shoulder Angle of 72.0° is outside your set range of 80–100°.');
});
```

Add to `findings.test.ts`:

```ts
test('fallback text is used only for metrics without a template', () => {
  const metrics = { a: { value: 1, status: 'amber', unit: '' }, b: { value: 2, status: 'red', unit: '' } } as const;
  const out = findingsFromTemplates(metrics, { a: { red: 'A red', amber: 'A amber' } }, (k) => `fallback ${k}`);
  expect(out.map((f) => f.text)).toEqual(['fallback b', 'A amber']);
});
```

- [ ] **Step 2: Run** `cd shared && npx vitest run src/analysis` — Expected: FAIL (`bands` module missing, fallback ignored).
- [ ] **Step 3: Implement** `bands.ts`, add `suggestedGreen?` to `ThresholdBase`, add the `fallback` parameter to `findingsFromTemplates`, export everything from `index.ts`.
- [ ] **Step 4: Run** `cd shared && npm test && npx tsc --noEmit` — Expected: all PASS, no type errors.
- [ ] **Step 5: Commit** `feat(shared): band model for editable thresholds`

---

### Task 2: Shared threshold store

**Files:**
- Create: `shared/src/analysis/store.ts`, `shared/src/analysis/store.test.ts`
- Modify: `shared/src/analysis/index.ts`

**Interfaces:**
- Consumes: Task 1 `Band`, `bandFromEntry`, `entryWithBand`, `validateBand`.
- Produces:
  - `interface BandStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }`
  - `interface ThresholdStore<K extends string>` — **declare members with method syntax** so `ThresholdStore<'a' | 'b'>` is assignable to `ThresholdStore<string>` (the screen takes the latter):
    - `entry(key: K): ThresholdEntry | undefined` — active entry (default if no override; the default object itself, unchanged, when there's no override)
    - `band(key: K): Band | null` · `defaultBand(key: K): Band | null` · `isChanged(key: K): boolean`
    - `set(key: K, band: Band | null): string | null` — returns the validation error and changes nothing, or saves and returns `null`. Setting a value equal to the default removes the override.
    - `addBand(key: K): void` — `{ green: suggestedGreen ?? [0, 10], lowRedAt: null, highRedAt: null }`
    - `reset(key: K): void` · `resetAll(): void`
    - `subscribe(listener: () => void): () => void` — called after every successful `set`/`addBand`/`reset`/`resetAll`
  - `createThresholdStore<K extends string>(storageKey: string, defaults: Partial<Record<K, ThresholdEntry>>, storage?: BandStorage | null): ThresholdStore<K>` — `storage` omitted → `globalThis.localStorage` if accessible, else in-memory; `null` → in-memory.
  - Persisted JSON: `{ [key]: Band | null }` (JSON `null` edges = no red; a top-level `null` value = "band removed"). On load, drop entries whose key isn't in `defaults`, whose shape is wrong, or that fail `validateBand`.

- [ ] **Step 1: Write failing tests in `store.test.ts`** (use a `Map`-backed fake `BandStorage`, and one that throws on every call)

```ts
const DEFAULTS = {
  knee: { green: [145, 155], amber: [135, 145], amberHigh: [155, 160], unit: '°', direction: 'two_sided' },
  info: noBand('°', [80, 100]),
} satisfies Record<string, ThresholdEntry>;

test('no overrides returns the default entries unchanged');                 // entry('knee') === DEFAULTS.knee
test('set saves only the override and survives a new store on the same storage');
  // set('knee', {green:[140,150], lowRedAt:130, highRedAt:null}) → JSON.parse(stored) toEqual {knee:{green:[140,150], lowRedAt:130, highRedAt:null}} (no 'info' key)
  // new store → band('knee') equals it; evaluateThreshold(200, entry('knee')) === 'amber'
test('invalid set returns the message and keeps the last valid band');
  // set('knee', {green:[145,155], lowRedAt:150, highRedAt:160}) → 'Amber must start below green (150 is above the green start of 145).'; band unchanged; storage unchanged
test('setting the default value clears the override');                      // isChanged false, storage key has no 'knee'
test('addBand on an information-only metric uses suggestedGreen');          // band('info') → {green:[80,100], lowRedAt:null, highRedAt:null}; set('info', null) → isChanged false
test('reset and resetAll restore defaults and notify subscribers');         // listener call count; unsubscribe stops calls
test('corrupt storage falls back to defaults');                             // Review Focus 3
  // for each of: 'not json', '[]', '{"knee":{"green":"x"}}', '{"knee":{"green":[150,140],"lowRedAt":null,"highRedAt":null}}', '{"gone":null}'
  //   → entry('knee') === DEFAULTS.knee, no throw
test('throwing storage still works in memory for the session');             // Review Focus 4: set succeeds, band reflects it, no throw
```

- [ ] **Step 2: Run** `cd shared && npx vitest run src/analysis/store.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `store.ts`; export `createThresholdStore`, `ThresholdStore`, `BandStorage` from `index.ts`.
- [ ] **Step 4: Run** `cd shared && npm test && npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): device-stored threshold overrides`

---

### Task 3: Settings row model + `@runalyzr/shared/settings` subpath

**Files:**
- Create: `shared/src/settings/rowModel.ts`, `shared/src/settings/rowModel.test.ts`, `shared/src/settings/index.ts`
- Modify: `shared/package.json` (exports `"./settings": "./src/settings/index.ts"`), `runalyzr/tsconfig.json`, `bike/tsconfig.json` (paths), `runalyzr/vite.config.ts`, `bike/vite.config.ts` (alias) — `@runalyzr/shared/settings` → `../shared/src/settings/index.ts`

**Interfaces:**
- Consumes: Task 1 `Band`, `ThresholdEntry`.
- Produces:
  - `type BandField = 'lowRedAt' | 'green0' | 'green1' | 'highRedAt'`
  - `editableFields(t: ThresholdEntry): BandField[]` — ordered low→high on the number line: `two_sided` (also indicativeOnly-with-band, which is two-sided) → all four; `lower_is_worse` → `['lowRedAt','green0','green1']`; `higher_is_worse` → `['green0','green1','highRedAt']`.
  - `parseBoundaryInput(text: string, field: BandField): number | null | 'incomplete'` — trims; `,` read as `.`; empty → `null` for red fields, `'incomplete'` for green fields; `-`, `.`, `-.` → `'incomplete'`; `1.` → `1`; anything else non-numeric → `'incomplete'`.
  - `applyField(band: Band, field: BandField, value: number | null): Band` — pure copy with one field replaced.
  - `barRange(band: Band, signed: boolean): [number, number]` — spans all finite boundaries padded by `max(5, 0.5 × span)` each side; lower bound clamped at 0 when `!signed`. Explicit loop for min/max (no spread).
  - `toPercent(value: number, range: [number, number]): number` (0–100, clamped) · `fromPercent(pct: number, range: [number, number], step = 0.5): number` (rounded to step)
  - `clampForDrag(band: Band, field: BandField, value: number): number` — keeps order: a field can't pass its neighbours, so a drag can never produce an invalid band.
  - `flipSign(text: string): string` — `'2'`→`'-2'`, `'-2'`→`'2'`, `''`→`'-'`.

- [ ] **Step 1: Write failing tests**

```ts
test('comma decimals from European keypads', () => {                       // Review Focus 1
  expect(parseBoundaryInput('1,5', 'green1')).toBe(1.5);
  expect(parseBoundaryInput(' 145 ', 'green0')).toBe(145);
});
test('half-typed values are incomplete; empty red means no red', () => {   // Review Focus 2
  for (const s of ['-', '.', '-.', 'abc']) expect(parseBoundaryInput(s, 'green0')).toBe('incomplete');
  expect(parseBoundaryInput('', 'green0')).toBe('incomplete');
  expect(parseBoundaryInput('', 'lowRedAt')).toBeNull();
  expect(parseBoundaryInput('1.', 'highRedAt')).toBe(1);
});
test('editableFields per direction');   // two_sided → 4 fields; lower_is_worse → no highRedAt; higher_is_worse → no lowRedAt
test('barRange pads and clamps at 0 unless signed', () => {
  expect(barRange({ green: [145, 155], lowRedAt: 135, highRedAt: 160 }, false)).toEqual([122.5, 172.5]);
  expect(barRange({ green: [0, 3], lowRedAt: null, highRedAt: null }, false)).toEqual([0, 8]);
  expect(barRange({ green: [-2, 2], lowRedAt: null, highRedAt: null }, true)).toEqual([-7, 7]);
});
test('fromPercent rounds to step; toPercent clamps', () => {
  expect(fromPercent(50, [0, 10])).toBe(5);
  expect(fromPercent(33, [0, 10])).toBe(3.5);
  expect(toPercent(-5, [0, 10])).toBe(0);
});
test('clampForDrag stops at neighbours', () => {
  const b = { green: [145, 155], lowRedAt: 135, highRedAt: 160 } satisfies Band;
  expect(clampForDrag(b, 'lowRedAt', 150)).toBe(145);
  expect(clampForDrag(b, 'green1', 140)).toBe(145);
  expect(clampForDrag(b, 'highRedAt', 150)).toBe(155);
});
test('flipSign', () => { expect(flipSign('2')).toBe('-2'); expect(flipSign('-2')).toBe('2'); expect(flipSign('')).toBe('-'); });
```

- [ ] **Step 2: Run** `cd shared && npx vitest run src/settings` — Expected: FAIL.
- [ ] **Step 3: Implement** `rowModel.ts`; `index.ts` re-exports it; register the subpath in all five config files.
- [ ] **Step 4: Run** `cd shared && npm test && npx tsc --noEmit`, then `cd runalyzr && npx tsc --noEmit && npm run build`, `cd bike && npx tsc --noEmit && npm run build` — Expected: PASS / clean builds.
- [ ] **Step 5: Commit** `feat(shared): settings row model and settings subpath`

---

### Task 4: Shared settings screen

**Files:**
- Create: `shared/src/settings/screen.ts`, `shared/src/settings/screen.test.ts`
- Modify: `shared/src/settings/index.ts`, `shared/package.json` (devDependency `jsdom`, same major as runalyzr's `^29`)

**Interfaces:**
- Consumes: Task 2 `ThresholdStore<string>`; Task 3 row model.
- Produces:
  - `interface SettingsRow { key: string; label: string; covers?: string; signed?: boolean; lowLabel?: string; highLabel?: string }` — `covers` e.g. `"6, 3 & 9 o'clock"`, shown after the label; side labels default to `too low` / `good` / `too high` (one-sided rows show only their risky side + `good`).
  - `interface SettingsSection { title: string; store: ThresholdStore<string>; rows: SettingsRow[] }`
  - `openThresholdSettings(sections: SettingsSection[], opts?: { title?: string }): { close(): void }` — fullscreen overlay appended to `document.body` (own DOM, like `pointPlacement.ts`), `← Threshold settings` back button closes it, **Reset all** calls `resetAll()` on every distinct store. Injects its stylesheet once (`<style id="threshold-settings-style">`).

Behaviour per row (from the spec / approved mockup `settings-layout-v2`):
- Banded row: label + unit, "● changed" when `isChanged`, **↺ default** (`reset`), colour bar (red/amber/green segments from `barRange`), one handle per `editableFields` entry, one always-visible input under each handle, side labels under the bar. A `null` red edge renders its handle at the bar end and an empty input with placeholder `no red`.
- Information-only row (`band(key) === null`): label + "information only" + **Add band** button (`addBand`). Banded rows whose default is `null` also get **Remove band** (`set(key, null)`).
- Input: `type="text" inputmode="decimal"`, `enterkeyhint="next"`; on `input` → `parseBoundaryInput`; `'incomplete'` → do nothing (keep the box as typed, no message); number/null → `store.set(key, applyField(...))`; an error string → box gets `.err` + the message under the row, nothing saved; on valid save, clear the error. On `focus` → `scrollIntoView({ block: 'center' })`.
- Drag: pointer events on handles (`setPointerCapture`), value from `fromPercent` then `clampForDrag`, `store.set` on move; input box updates to match. Handles have an invisible hit area ≥ 44 px; inputs ≥ 44 px tall on `(pointer: coarse)`.
- Signed rows: a `±` button beside each input that applies `flipSign` to that input and re-runs the input handler.
- Re-render a row after each store change, but never replace an input that has focus (keeps the caret and the half-typed text).

- [ ] **Step 1: Write failing jsdom test** (`// @vitest-environment jsdom`, in-memory store from Task 2)

```ts
test('typing a valid value saves; an out-of-order value shows the message and does not save');
  // open with one two_sided row 'knee'; type '150' into the lowRedAt input → band unchanged, input has class 'err',
  // row text contains 'Amber must start below green (150 is above the green start of 145).'
  // type '130' → band('knee').lowRedAt === 130, no '.err'
test('clearing a red box removes red');                    // lowRedAt input '' → band('knee').lowRedAt === null
test('half-typed "-" neither saves nor shows an error');    // band unchanged, no '.err'
test('Add band turns an information-only row into a bar; Remove band reverts');
test('Reset all resets every store passed in');
test('inputs use the decimal keypad');                      // every input: type === 'text', inputMode === 'decimal'
```

- [ ] **Step 2: Run** `cd shared && npx vitest run src/settings/screen.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `screen.ts` and export it from `index.ts`. Colours: `#ef4444` / `#f59e0b` / `#22c55e` (both apps' status colours); everything else inherits from the app.
- [ ] **Step 4: Run** `cd shared && npm test && npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): threshold settings screen`

---

### Task 5: runalyzr — active bands, ⚙ screen, live re-colour

**Files:**
- Create: `runalyzr/src/settings/thresholdStore.ts`, `runalyzr/src/settings/thresholdStore.test.ts`
- Modify: `runalyzr/src/analysis/thresholds.ts`, `runalyzr/src/ui/dashboard.ts:36-42`, `runalyzr/src/report/pdfGenerator.ts:12-16`, `runalyzr/src/report/pdfGenerator.test.ts`, `runalyzr/src/main.ts`, `runalyzr/index.html` (`#app-header`), runalyzr CSS for the ⚙ button

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces:
  - `runThresholds: ThresholdStore<keyof AnalysisResults>` = `createThresholdStore('runalyzr.thresholds.v1', THRESHOLDS)`
  - `RUN_SETTINGS_SECTIONS: SettingsSection[]` — one section `"Run metrics"`, rows in `METRIC_LABELS` order; `kneeFlexionAtContact` gets `lowLabel: 'too bent'`, `highLabel: 'too straight'`.
  - `evaluateMetric` / `makeMetricResult` keep their signatures but read `runThresholds.entry(key)`. `THRESHOLDS` stays exported as the defaults table.

- [ ] **Step 1: Write failing tests** (`afterEach(() => runThresholds.resetAll())`)

```ts
test('makeMetricResult follows an override', () => {
  runThresholds.set('cadence', { green: [175, 195], lowRedAt: 165, highRedAt: null });
  expect(makeMetricResult(172, 'cadence').status).toBe('amber');
});
test('PDF normal range follows an override');   // buildReportSections(...) row for cadence has normalRange '175–195 spm'
test('every default is unchanged');             // for each key: runThresholds.entry(key) === THRESHOLDS[key]
```

- [ ] **Step 2: Run** `cd runalyzr && npx vitest run src/settings src/report` — Expected: FAIL.
- [ ] **Step 3: Implement** the store module; switch `thresholds.ts`, `dashboard.ts` (`Normal: ${formatGreenRange(entry)}` or empty) and `pdfGenerator.ts` (`formatGreenRange(runThresholds.entry(key))`) to the store. In `main.ts`: keep `lastView` beside `lastResults`; add a `⚙` button (`aria-label="Threshold settings"`) to `#app-header` that calls `openThresholdSettings(RUN_SETTINGS_SECTIONS)`; `runThresholds.subscribe(() => { if (!lastResults) return; rescoreMetrics(lastResults, (k) => runThresholds.entry(k)); renderDashboard(lastResults, generateFindings(lastResults), lastView); })`. The live overlay already reads `lastResults` statuses, so it follows.
- [ ] **Step 4: Run** `cd runalyzr && npm test && npx tsc --noEmit && npm run build` — Expected: PASS (existing advice tests unchanged).
- [ ] **Step 5: Manual check** `cd runalyzr && npm run dev`: analyse a video → open ⚙ → drag cadence green start above the measured value → card turns amber and a cadence finding appears without re-analysing; reload → setting kept; ↺ default → back. On a phone-width viewport, tapping a box opens the decimal keypad and the box stays visible.
- [ ] **Step 6: Commit** `feat(runalyzr): configurable thresholds`

---

### Task 6: bike ride — active bands + generic findings

**Files:**
- Create: `bike/src/settings/thresholdStores.ts` (ride store now; fit/geometry stores added in Tasks 7–8), `bike/src/settings/thresholdStores.test.ts`
- Modify: `bike/src/analysis/thresholds.ts`, `bike/src/analysis/findings.ts`, `bike/src/report/pdfGenerator.ts:24-28`, `bike/src/analysis/findings.test.ts`
- Modify table: `bike/src/analysis/thresholds.ts` — give `shoulderAngle` `suggestedGreen: [80, 100]`, `reachAngle` `[50, 80]`, `headNeckPosition` `[0, 5]` (placeholders; the fitter adjusts them).

**Interfaces:**
- Produces:
  - `rideThresholds: ThresholdStore<AllMetricKeys>` = `createThresholdStore('bike.thresholds.ride.v1', THRESHOLDS)`; export `type AllMetricKeys` from `thresholds.ts`.
  - The three `generate*Findings` pass a fallback: `(key, r) => THRESHOLDS[key]?.indicativeOnly ? outOfRangeText(METRIC_LABELS[key] ?? key, r, rideThresholds.entry(key)) : undefined` — only metrics that are information-only *by default* get generic text (`pelvicTilt`, `ankleAnkling`, `heelAlignment`, `elbowWidthSymmetry` are banded but template-less today and must stay silent).

- [ ] **Step 1: Write failing tests** (`afterEach(() => rideThresholds.resetAll())`)

```ts
test('ride status follows an override');                         // set kneeExtensionBDC green [140,150] → makeMetricResult(152,...).status 'amber', side 'high'
test('a band added to shoulderAngle produces the generic finding');
  // rideThresholds.addBand('shoulderAngle'); sagittal fixture with shoulderAngle 72 → finding text
  // 'Shoulder Angle of 72.0° is outside your set range of 80–100°.'
test('banded metrics without templates stay silent');            // pelvicTilt red → no finding
test('PDF normal range follows an override');
```

- [ ] **Step 2: Run** `cd bike && npx vitest run src/settings src/analysis/findings.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; `pdfGenerator.ts` uses `formatGreenRange(rideThresholds.entry(key))`.
- [ ] **Step 4: Run** `cd bike && npm test && npx tsc --noEmit` — Expected: PASS (advice tests unchanged).
- [ ] **Step 5: Commit** `feat(bike): configurable ride thresholds`

---

### Task 7: bike Fit — stable ids, shared engine, rescore

**Files:**
- Create: `bike/src/analysis/fitThresholds.ts`, `bike/src/analysis/fitRescore.ts`, `bike/src/analysis/fitRescore.test.ts`
- Modify: `bike/src/analysis/fitMetrics.ts`, `bike/src/analysis/types.ts` (`FitMeasurement`), `bike/src/analysis/fitMetrics.test.ts`, `bike/src/settings/thresholdStores.ts`
- Delete: `bike/src/analysis/bands.ts` and `bands.test.ts` once Task 8 no longer imports them (do the delete in Task 8)

**Interfaces:**
- Produces:
  - `type FitMetricId = 'torsoAngle' | 'elbowAngle' | 'reachAngle' | 'shoulderAngle' | 'kneeExtensionBDC' | 'shankKops' | 'hipAngle3' | 'hipExtension9' | 'elbowAngleAero' | 'reachAngleAero' | 'pelvicObliquity' | 'kneeFrontalAlignment' | 'shoulderTilt' | 'lateralTrunkLean'` — these strings are storage keys; never rename after release.
  - `FIT_THRESHOLDS: Record<FitMetricId, ThresholdEntry>` — `greenOnly(...)` with the spec table's greens (`'°'`); `reachAngle` = `noBand('°', [50, 80])`, `shoulderAngle` = `noBand('°', [80, 100])`.
  - `fitThresholds: ThresholdStore<FitMetricId>` = `createThresholdStore('bike.thresholds.fit.v1', FIT_THRESHOLDS)`
  - `FitMeasurement` gains `id: FitMetricId`; `normalRange` becomes `string` = `formatGreenRange(entry) ?? '—'`.
  - `fitMetrics.ts` `entry(id: FitMetricId, label: string, value: number): FitMeasurement` — status from `evaluateThreshold(rounded, fitThresholds.entry(id))`. Labels are unchanged (both knee-alignment rows → id `kneeFrontalAlignment`).
  - `rescoreFitResults(results: FitSessionResults): void` — re-derives `status` and `normalRange` for every position measurement (this task) and geometry angle (Task 8 extends it), in place.

- [ ] **Step 1: Write failing tests** (`afterEach(() => fitThresholds.resetAll())`)

```ts
test('defaults reproduce today: green inside, amber outside, never red');
  // for each banded FitMetricId: value at green midpoint → 'green'; green[0]-50 and green[1]+50 → 'amber'
test('existing fitMetrics.test.ts expectations still pass unchanged');      // run, don't edit, except adding ids
test('one torso setting moves all three side positions', () => {
  // build side 6/3/9 results from the existing fixtures (torso value > 5°); fitThresholds.set('torsoAngle', {green:[0,1], lowRedAt:null, highRedAt:5});
  // rescoreFitResults(results) → every 'Torso Angle' measurement status 'red' and normalRange '0–1°'
});
test('both knee-alignment legs, rear and front, share one setting');
test('information-only reach shows "—" until a band is added');
```

- [ ] **Step 2: Run** `cd bike && npx vitest run src/analysis/fitRescore.test.ts src/analysis/fitMetrics.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; remove the hard-coded `normalRange` strings and `Band` literals from `fitMetrics.ts`.
- [ ] **Step 4: Run** `cd bike && npm test && npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(bike): fit bands on the shared engine with stable ids`

---

### Task 8: bike geometry — shared engine, retire `bands.ts`

**Files:**
- Create: `bike/src/analysis/geometryThresholds.ts`
- Modify: `bike/src/config/defaults.ts` (`AngleDefinition`: drop `green` and `normalRange`, type `id` as `GeometryAngleId`), `bike/src/analysis/bikeGeometryMetrics.ts`, `bike/src/analysis/bikeGeometryMetrics.test.ts`, `bike/src/analysis/types.ts` (`BikeAngleMeasurement.id: GeometryAngleId`), `bike/src/analysis/fitRescore.ts` (+ test), `bike/src/settings/thresholdStores.ts`
- Delete: `bike/src/analysis/bands.ts`, `bike/src/analysis/bands.test.ts`

**Interfaces:**
- Produces:
  - `type GeometryAngleId = 'seat_tube_angle' | 'head_tube_angle' | 'saddle_tilt' | 'bar_drop_angle' | 'saddle_level' | 'bar_level'`
  - `GEOMETRY_THRESHOLDS: Record<GeometryAngleId, ThresholdEntry>` — `greenOnly` with today's greens (`[72,74]`, `[71,74]`, `[-2,2]`, `[0,2]`, `[0,2]`); `bar_drop_angle` = `noBand('°', [0, 10])`.
  - `geometryThresholds: ThresholdStore<GeometryAngleId>` = `createThresholdStore('bike.thresholds.geometry.v1', GEOMETRY_THRESHOLDS)`
  - `computeBikeAngles` keeps its signature; status from `geometryThresholds.entry(def.id)`, `normalRange` = `formatGreenRange(...) ?? '—'`. (Text change accepted: `'< 2°'` becomes `'0–2°'`, `'Context-dependent'` becomes `'—'`.)
  - `rescoreFitResults` also re-derives every `bikeGeometry[].angles[]`.

- [ ] **Step 1: Write failing tests**

```ts
test('saddle tilt defaults: ±2° green, amber beyond, never red');   // -1.5 green, 2.5 amber, -40 amber; normalRange '±2°'
test('bar drop is information only until a band is added');       // status 'unknown', normalRange '—'; addBand → value 5 'green'
test('rescoreFitResults re-colours geometry angles after a change');
```
Update the existing band-status assertions in `bikeGeometryMetrics.test.ts` that read `def.green` to use the table; keep their expected statuses.

- [ ] **Step 2: Run** `cd bike && npx vitest run src/analysis` — Expected: FAIL.
- [ ] **Step 3: Implement**; delete `bands.ts` + its test (its four cases are covered by the defaults tests in Tasks 7–8).
- [ ] **Step 4: Run** `cd bike && npm test && npx tsc --noEmit && grep -rn "bands'" src` — Expected: PASS, no remaining imports.
- [ ] **Step 5: Commit** `feat(bike): geometry bands on the shared engine`

---

### Task 9: bike — ⚙ screen and live re-colour

**Files:**
- Modify: `bike/src/settings/thresholdStores.ts` (sections), `bike/src/ui/fitGuide.ts` (controller `refresh()`), `bike/src/main.ts`, `bike/index.html` (`#app-header`), `bike/src/ui/styles.css`

**Interfaces:**
- Consumes: Tasks 4, 6, 7, 8.
- Produces:
  - `BIKE_SETTINGS_SECTIONS: SettingsSection[]` in this order: `Ride — side view` / `Ride — rear view` / `Ride — front view` (ride store; rows from `SAGITTAL_METRICS`/rear/front sets with `METRIC_LABELS`), `Fit — side view` / `Fit — aero` / `Fit — rear & front` (fit store; `covers` on torso/elbow/reach/shoulder = `"6, 3 & 9 o'clock"`, knee alignment = `"rear & front, L and R"`), `Bike geometry` (geometry store; `signed: true` on `saddle_tilt` and `bar_drop_angle`). Side labels: `kneeExtensionBDC` too bent / too straight, `hipAngleTDC` too closed.
  - `FitGuideController.refresh(): void` — `rescoreFitResults(buildResults()); renderResults();`

- [ ] **Step 1:** Add the sections and `refresh()`. In `main.ts`: ⚙ button in `#app-header` (`aria-label="Threshold settings"`) opens `openThresholdSettings(BIKE_SETTINGS_SECTIONS)`; subscribe to the ride store → rescore `lastRideResults` sagittal/rear/front (skip nulls), regenerate the three finding lists, `rerenderRideDashboard()`; subscribe to fit and geometry stores → `fitGuide.refresh()`.
- [ ] **Step 2: Run** `cd bike && npm test && npx tsc --noEmit && npm run build` — Expected: PASS, clean build.
- [ ] **Step 3: Manual check** `cd bike && npm run dev`: (a) Fit: take a 6 o'clock photo → ⚙ → set a red edge on Torso angle below the measured value → row turns red without retaking; Remove the value → amber again. (b) Geometry: saddle tilt `±` toggle types a negative boundary on a phone-width viewport. (c) Bar drop: Add band → status appears; Remove band → "—". (d) Ride: analyse a video, change a ride band, dashboard + findings update; export PDF shows the new range. (e) Reload keeps settings; Reset all restores everything in all three groups.
- [ ] **Step 4: Commit** `feat(bike): threshold settings screen`

---

### Task 10: Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1:** Update `CLAUDE.md`: add the `@runalyzr/shared/settings` subpath to the list; describe the threshold store under *Threshold evaluation* (defaults in app tables, active entry via store, `greenOnly`/`noBand`, Fit/geometry now on the shared engine, `bands.ts` gone); update test counts from real `npm test` output in all three workspaces.
- [ ] **Step 2:** `CLAUDE.md` already carries the user's **uncommitted Branching section**. Ask the user before staging it with these changes.
- [ ] **Step 3: Commit** `docs: threshold settings in CLAUDE.md`
