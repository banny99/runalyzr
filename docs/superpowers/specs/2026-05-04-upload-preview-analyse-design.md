# Upload Preview & Silent Analysis Design

**Date:** 2026-05-04

## Goal

Replace the implicit "play video → analysis auto-runs on pause/end" flow with an explicit three-state flow: **preview → analysing → results**. The user can discard the wrong video before analysis starts, and analysis runs silently in the background without requiring the user to watch the video play.

---

## States

### 1. Upload Preview

Entered when a video file is selected via the upload button.

- Video player is visible — user can play, pause, and scrub to confirm the right video was loaded
- **✕ button** (existing, top-right of video) — discards the video and returns to idle; no change to existing behaviour
- **"Analyse" button** — new; appears in a bar below the video; clicking transitions to the Analysing state
- Auto-analysis on `pause` and `video ended` is **removed** — pausing or scrubbing does not trigger analysis

### 2. Analysing (silent processing)

Entered when the user clicks "Analyse".

- Video area is covered by a full-size overlay showing "Analysing… N%" (no video visible)
- The Analyse button is hidden; the progress overlay takes its place in the bar below the video
- **✕ button** remains active — clicking it cancels analysis, revokes the video URL, and returns to idle
- Under the hood:
  1. `video.pause()` — stop any playback
  2. Seek `video.currentTime` from `0` to `video.duration` in `1/30` s steps
  3. At each step, wait for the `seeked` event, then call `landmarker.detectForVideo(video, currentTime * 1000)`
  4. If landmarks are detected, push `{ landmarks, worldLandmarks, timestamp: currentTime * 1000 }` to a frames array
  5. Progress percentage = `currentTime / duration * 100`, updated after each frame
  6. When seeking is complete, call `runAnalysis(frames)` — same function as before

### 3. Results

No change from the current behaviour — results panel renders metrics, findings, export button.

---

## New Elements

### HTML (`runalyzr/index.html`)

A **progress overlay** inside `#video-container`, covers the video during analysis:

```html
<!-- inside #video-container, after #playback-controls -->
<div id="analyse-overlay">
  <span id="analyse-overlay-pct">Analysing… 0%</span>
</div>
```

A **review bar** div below `#video-container`, shown only in Upload Preview and Analysing states:

```html
<div id="review-bar">
  <button id="analyse-btn">Analyse</button>
</div>
```

### CSS (`runalyzr/src/ui/styles.css`)

```css
#review-bar {
  display: none; /* shown when a video file is loaded */
  padding: 0.75rem 1rem;
  background: var(--surface);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
#analyse-btn {
  width: 100%;
  padding: 0.75rem;
  background: var(--accent);
  color: #000;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  font-size: var(--font-sm);
}
#analyse-progress { text-align: center; font-size: var(--font-sm); color: var(--text-secondary); }
```

A **progress overlay** inside `#video-container`, covers the video during analysis:

```css
#analyse-overlay {
  display: none; /* flex during analysing state */
  position: absolute;
  inset: 0;
  background: rgba(10,10,10,0.92);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 30;
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
```

### JS (`runalyzr/src/main.ts`)

**Removed:** `runAnalysis` calls from `onPause` callback and `video.ended` listener.

**Added:**

- `showReviewBar()` — shows `#review-bar`, hides progress, shows Analyse button
- `hideReviewBar()` — hides `#review-bar`
- `runSilentAnalysis()` — async function that executes the seek loop, updates progress, calls `runAnalysis(frames)` on completion
- `analyseBtn.addEventListener('click', () => runSilentAnalysis())`
- `#analyse-overlay` shown/hidden by `runSilentAnalysis()`

**Modified:** `showVideoFileUI()` calls `showReviewBar()`. `showIdleUI()` calls `hideReviewBar()`.

---

## Constraints

- `landmarker.detectForVideo()` requires monotonically increasing timestamps — satisfied because we seek forward only (0 → duration)
- Frame step is `1/30` s regardless of original video frame rate — consistent with the existing recording capture rate
- If the user cancels mid-analysis (✕ button), the seek loop must stop — use a module-level flag `let analysing = false`; `runSilentAnalysis()` sets it to `true` before the loop and checks it after each `await seeked`; `closeCamera()` sets it to `false` to break the loop before calling `showIdleUI()`

---

## Out of Scope

- Progress bar (just percentage text for now)
- Cancellable progress with animated indicator
- Changing the bike app (separate codebase)
