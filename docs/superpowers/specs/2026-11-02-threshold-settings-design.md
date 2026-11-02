# Threshold Settings — Design

**Date:** 2026-11-02
**Status:** Draft (awaiting approval)
**Scope:** both apps (`runalyzr/`, `bike/`) plus `@runalyzr/shared`

---

## Intent

Every green/amber/red band in both apps is hard-coded today. The user works
with a professional (bike fitter / running coach) and wants to sit down with
them and set the bands to what that professional considers right — e.g. hip
angle at TDC, which the user explicitly deferred to "settings, with the
professional" during the PR #22 advice fixes. Results, the dashboard and the
PDF report should then reflect those bands.

Success: a fitter can open a settings screen on a phone or tablet, adjust any
band by dragging or typing, and immediately see existing results re-coloured
against the new bands — without a developer touching code.

## Goals

- **Every threshold is configurable** (user decision). That covers:
  - runalyzr run table — `runalyzr/src/analysis/thresholds.ts` (10 metrics)
  - bike ride-video table — `bike/src/analysis/thresholds.ts` (21 metrics, 3 of
    them information-only today)
  - bike Fit-photo measurements — inline `entry(...)` calls in
    `bike/src/analysis/fitMetrics.ts` (14 settings after grouping, 2 of them
    information-only today — see *Setting identity*)
  - bike geometry angles — `AngleDefinition`s in `bike/src/config/defaults.ts`
    (6, of which `bar_drop_angle` is information-only today)
- Metrics with no band today can be **given one, and have it removed again**
  (user decision — see *Metrics without a band*).
- **Global settings**, not per client (user decision).
- **Stored on this device only** — browser storage, no login, no sync (user
  decision; cross-device sync is explicitly deferred, not rejected).
- **Reset to default** per metric, and **Reset all** (user decision).
- **Each app has its own settings screen** (my proposal, user accepted).
- **Dashboard and PDF "normal range" text comes from the active bands**, not
  the defaults (my proposal, user accepted).
- **Changing a band re-colours results already on screen** without
  re-running pose analysis (my proposal, user accepted).

## Non-goals

- Per-client profiles, named presets, import/export of settings.
- Sync across devices, accounts, backend.
- Editing finding/advice *text*. Only band numbers change; the existing
  templates keep being selected by status and side.
- Changing what a metric measures or how it is computed.
- Fixing the known-broken bike metrics (`pelvicTilt`, `ankleAnkling`,
  `wristAngle`, cadence counting). They stay listed and editable as-is.

## Anti-goals (would make this a failure even if it works)

- A settings change that silently does nothing somewhere (e.g. dashboard
  re-colours but the PDF still prints the old range).
- Invalid bands (overlapping / out of order) getting saved and producing
  nonsense colours.
- Any change to today's results for a user who never opens settings.
  Defaults must reproduce current behaviour exactly — including Fit and
  geometry staying green/amber only.

## Screen (decided with the user via mockups)

Layout is mockup **option B, with typing built in** (user picked B and asked
that typing be easy):

- Opened from a **⚙ button in each app's header** (`#app-header`) (my
  proposal, accepted).
- Metrics **grouped the way the app already groups them** (my proposal,
  accepted): bike → Ride side / rear / front, Fit positions, Bike geometry;
  runalyzr → its metric list.
- One row per metric: name + unit, a **colour bar** (red/amber/green
  segments), a **drag handle at each boundary**, and an **always-visible
  number box under each handle**. Dragging updates the box; typing moves the
  handle.
- Plain-language labels under the bar for what each side means (e.g. *too
  bent / good / too straight*). Wording per metric is left to the builder.
- **"● changed"** marker on metrics that differ from default; **↺ default**
  per row; **Reset all** in the header.
- **Saves as you type**, no Save button (my proposal, accepted). Invalid
  input is flagged on the box with a short message and is **not saved** until
  fixed; the last valid value stays in effect.

### Touch / phone (user asked for proper number input)

- Boxes open the **numeric keypad with a decimal point** on phone/tablet
  (decimals are needed: e.g. 1.5 % frame, 1.5°). `type="number"` or
  `inputmode="decimal"` — builder's choice, but the keypad must appear.
- iOS's decimal keypad has no minus key, so metrics whose band can be
  negative get a small **± toggle** next to their boxes. Today that is only
  `saddle_tilt` (default −2…+2°). *(My call.)*
- Touch targets at least **44 px** for boxes and handles; handles get an
  enlarged invisible grab area. *(My call.)*
- When the keypad opens, the focused box is scrolled into view. *(My call.)*
- Dragging still works on touch (user confirmed they want both).

## Band model

### Ride-video tables (runalyzr + bike `THRESHOLDS`)

Unchanged semantics: the shared `ThresholdEntry` engine
(`shared/src/analysis/thresholds.ts`) — one-sided (`lower_is_worse` /
`higher_is_worse`) or `two_sided` with `amberHigh`, green wins at the
boundary, red beyond the amber edge. The user edits the boundary numbers;
direction is fixed per metric (not user-editable).

### Fit-photo and geometry bands — red becomes optional

Today these use `bandStatus` (`bike/src/analysis/bands.ts`): green inside,
amber everywhere outside, never red. The user agreed they should be able to
have red, and accepted my proposal for how:

- Fit and geometry move onto the **same shared engine** as the ride tables,
  so every metric in the app is evaluated one way. `bandStatus`/`bands.ts`
  is retired (or becomes a thin adapter) — builder's choice.
- **Red is optional per metric.** Default = today's behaviour: green band,
  amber all the way out on both sides, no red. The user adds red by dragging
  an outer amber handle in, or typing a value into its box; **clearing that
  box removes red again** on that side.
- With no settings touched, every Fit and geometry result must be identical
  to today. *(Keeping today's colours as defaults was my proposal; user said
  "do as you suggest".)*

This implies the shared engine needs a way to express "amber is unbounded on
this side" (no red). How to model that (optional amber edges, `Infinity`,
etc.) is left to the builder, as long as existing `ThresholdEntry` tables
and their tests keep their current behaviour.

### Validation

A band is valid only if its boundaries are in order on the number line
(red edge ≤ amber edge ≤ green start ≤ green end ≤ amber-high edge…). The
specific rule set, and whether equal boundaries are allowed, is the
builder's call — but anything the engine would evaluate nonsensically must be
rejected in the UI and never stored.

## Storage

*(My calls — none of these were discussed.)*

- `localStorage`, one key per app (e.g. `runalyzr.thresholds.v1`,
  `bike.thresholds.v1`).
- Store **only overrides** (metrics the user changed), keyed by a stable
  metric id. Defaults stay in code. So if a default is changed in a future
  release, users who never touched that metric get the new default; users
  who did keep theirs.
- Every read/write wrapped in try/catch; unreadable, unparseable or invalid
  stored data falls back to defaults for that metric (never crashes, never
  blocks analysis).
- Versioned key so a future schema change can migrate or discard cleanly.

## Setting identity (which results one setting controls)

**User decision:** within Fit, **one setting per measurement**, however many
positions or legs report it; **Fit and ride video are separate settings**
even where they measure the same thing (a still photo at one crank position
vs an average over the pedal stroke — the fitter may want different limits).

Ride tables are already keyed (`runalyzr` `AnalysisResults` keys, bike
`AllMetricKeys`). Geometry already has `AngleDefinition.id`. Fit rows are
identified only by `label` today, so the builder must give each fit
measurement a stable id; ids become storage keys and must not change once
shipped. The fit settings are:

| Fit setting | Default green | Reported in |
|---|---|---|
| Torso angle | 35–50° | side 6, 3, 9 o'clock |
| Elbow angle | 90–160° | side 6, 3, 9 o'clock |
| Reach angle (side) | none | side 6, 3, 9 o'clock |
| Shoulder angle | none | side 6, 3, 9 o'clock |
| Knee extension at BDC | 145–155° | side 6 o'clock |
| Shank angle (KOPS) | 0–2° | side 3 o'clock |
| Hip angle at 3 o'clock | 45–65° | side 3 o'clock |
| Hip extension at 9 o'clock | 160–180° | side 9 o'clock |
| Elbow angle (aero) | 80–110° | aero |
| Reach angle (aero) | 15–35° | aero |
| Pelvic obliquity | 0–3° | rear 6 o'clock |
| Knee frontal alignment | 0–5° | rear + front 6 o'clock, L and R |
| Shoulder tilt | 0–2° | front 6 o'clock |
| Lateral trunk lean | 0–2° | front 6 o'clock |

Aero elbow/reach stay separate from the side-view elbow/reach: they are
different positions and aero reach uses a different formula. *(My call.)*
Fit "Torso angle" and ride `torsoAngle` are separate settings even though
they share a default (user decision above); same for elbow and knee
extension at BDC.

Fit rows that cover several positions must say which ones they affect
(e.g. "Torso angle — 6, 3 & 9 o'clock"), so an edit never looks like it
"did nothing" to a position the user didn't expect. Exact wording is the
builder's.

## Metrics without a band

**User decision (my suggestion, accepted):** information-only metrics can be
given a band and have it removed again.

Applies to: ride `shoulderAngle`, `reachAngle`, `headNeckPosition`
(`indicativeOnly` today); Fit side reach angle and shoulder angle; geometry
`bar_drop_angle`.

- Default state is **"no band — information only"**, shown as a row with an
  **Add band** button instead of a bar. Status stays `unknown`, exactly as
  today.
- Adding a band gives the same shape as Fit/geometry: a **green range, amber
  on both sides, red optional** on each side. This sidesteps choosing a
  direction for metrics that never had one. The builder picks a sensible
  starting green range around typical values; the user then adjusts it.
- **Remove band** returns the metric to information-only. ↺ default does the
  same (the default *is* no band).
- Advice: these metrics have no finding text. When flagged, the ride-video
  findings/PDF show a **generic line** stating the value is outside the set
  range (e.g. "Shoulder angle of 72° is outside your set range of 80–100°"),
  with no specific advice. Fit photos and geometry have no findings today and
  stay that way — colour only. *(Generic wording is the builder's.)*
- `indicativeOnly` in the shared engine stays as the representation of "no
  band" or is replaced — builder's choice, but the default behaviour must be
  unchanged.

## Where the active bands must be used

Everything that reads a band today must read the active (default + override)
band instead:

- status evaluation: both apps' `makeMetricResult` / `evaluateMetric`,
  `fitMetrics.ts` `entry(...)`, `bikeGeometryMetrics.ts`
- "normal range" text: `runalyzr/src/ui/dashboard.ts:41`,
  `runalyzr/src/report/pdfGenerator.ts:15`,
  `bike/src/report/pdfGenerator.ts:25`, and the hard-coded `normalRange`
  strings in `fitMetrics.ts` and `defaults.ts`
- live overlays that colour by status (e.g. `runalyzr/src/ui/overlay.ts`)
- findings, which are chosen by status/side — they follow automatically once
  status is re-evaluated.

### Re-colouring existing results

Results currently store a computed `status`. To re-colour without
re-analysing, results must keep the raw value plus metric id, and status
(and normal-range text, and findings) must be re-derived from the active
bands when settings change. Whether status is stored-and-refreshed or always
derived on render is the builder's choice. A PDF generated after a change
uses the new bands.

## Constraints

- Static site on GitHub Pages; no backend.
- Vanilla TypeScript + Vite, Vitest. No UI framework.
- Repo invariants in `CLAUDE.md`: work on a branch, squash-merge PR; no
  `Math.max/min(...spread)`; no `as any` / `as unknown as`.
- New shared code goes in an existing `@runalyzr/shared` subpath where it
  fits (`analysis`); a new subpath must be registered in all three places
  `CLAUDE.md` lists.
- No UI tests exist; engine, validation, storage and override-merging logic
  must be unit-tested; the screen itself is verified manually in the browser.

## Left to the builder

- Exact engine shape for optional red; adapter vs removal of `bands.ts`.
- Bar scale per metric (how far the bar extends past the outermost
  boundary), handle snapping/step size.
- Wording of the per-metric side labels.
- Validation rule details.
- Settings screen as overlay/modal vs separate view, as long as it opens
  from the header ⚙ and returns to where the user was.
- Whether shared UI code for the settings screen lives in `shared/` or is
  duplicated per app.

## Open questions

None. The builder check raised two (setting identity; metrics without a
band); both were answered by the user and are recorded above.
