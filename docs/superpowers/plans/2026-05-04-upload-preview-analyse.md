# Upload Preview & Silent Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace implicit auto-analysis-on-pause with an explicit three-state flow: upload preview → silent frame-seeking analysis → results.

**Architecture:** New HTML elements (`#analyse-overlay`, `#review-bar`) are shown/hidden by new helper functions in `main.ts`. A `runSilentAnalysis()` async function seeks through the video frame-by-frame, calls `landmarker.detectForVideo()` at each step, and calls the existing `runAnalysis()` when done. Auto-analysis on pause/end is removed.

**Tech Stack:** TypeScript, vanilla DOM, MediaPipe PoseLandmarker (VIDEO mode)

---

## File Map

| File | Change |
|---|---|
| `runalyzr/index.html` | Add `#analyse-overlay` inside `#video-container`; add `#review-bar` after `#video-container` |
| `runalyzr/src/ui/styles.css` | Add styles for `#review-bar`, `#analyse-btn`, `#analyse-overlay` |
| `runalyzr/src/main.ts` | Remove auto-analysis; add `analysing` flag, `showReviewBar`, `hideReviewBar`, `runSilentAnalysis`; wire button |

---

### Task 1: Add HTML elements

**Files:**
- Modify: `runalyzr/index.html`

- [ ] **Step 1: Add `#analyse-overlay` inside `#video-container`**

  In `runalyzr/index.html`, find `#playback-controls` (the last element inside `#video-container`) and add the overlay immediately after it, still inside `#video-container`:

  ```html
        <!-- Analysis progress overlay -->
        <div id="analyse-overlay">
          <span id="analyse-overlay-pct">Analysing… 0%</span>
        </div>

      </div><!-- /video-container -->
  ```

  The complete tail of `#video-container` should now read:

  ```html
        <!-- Bottom bar: playback controls (video review only) -->
        <div id="playback-controls">
          <button id="frame-back">← Frame</button>
          <button id="frame-forward">Frame →</button>
          <select id="speed-select">
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="1" selected>1×</option>
          </select>
        </div>

        <!-- Analysis progress overlay -->
        <div id="analyse-overlay">
          <span id="analyse-overlay-pct">Analysing… 0%</span>
        </div>

      </div><!-- /video-container -->
  ```

- [ ] **Step 2: Add `#review-bar` after `#video-container`**

  Immediately after the closing `</div><!-- /video-container -->` and before `<!-- Setup overlay -->`, add:

  ```html
      <!-- Review bar: shown when a video file is loaded, hidden otherwise -->
      <div id="review-bar" hidden>
        <button id="analyse-btn">Analyse</button>
      </div>
  ```

- [ ] **Step 3: Verify HTML structure**

  Open `runalyzr/index.html` and confirm the order inside `#camera-panel` is:
  1. `#camera-idle`
  2. `#video-container` (contains `#analyse-overlay` as last child)
  3. `#review-bar` (hidden)
  4. `#setup-overlay`
  5. `#live-metrics`

- [ ] **Step 4: Commit**

  ```bash
  git add runalyzr/index.html
  git commit -m "feat: add analyse overlay and review bar HTML elements"
  ```

---

### Task 2: Add CSS

**Files:**
- Modify: `runalyzr/src/ui/styles.css`

- [ ] **Step 1: Add `#review-bar` and `#analyse-btn` styles**

  Append to the end of `runalyzr/src/ui/styles.css`:

  ```css
  /* ── Review bar (shown when video file loaded) ───────────── */
  #review-bar {
    padding: 0.75rem 1rem;
    background: var(--surface);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  #review-bar[hidden] { display: none; }
  #analyse-btn {
    width: 100%;
    padding: 0.75rem;
    background: var(--accent);
    color: #000;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    font-size: var(--font-sm);
    cursor: pointer;
  }
  #analyse-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Analyse progress overlay (covers video during silent analysis) ── */
  #analyse-overlay {
    display: none;
    position: absolute;
    inset: 0;
    background: rgba(10, 10, 10, 0.92);
    align-items: center;
    justify-content: center;
    z-index: 30;
    font-size: var(--font-sm);
    color: var(--text-secondary);
  }
  ```

- [ ] **Step 2: Verify visually**

  Run `cd runalyzr && npm run dev` and open `http://localhost:5173/runalyzr/` in a browser. Set `sessionStorage.setItem('runalyzr-auth','1')` in the console, reload. Upload a video. The review bar with "Analyse" button should appear below the video. (The overlay won't be visible yet — that comes in Task 4.)

- [ ] **Step 3: Commit**

  ```bash
  git add runalyzr/src/ui/styles.css
  git commit -m "feat: add review bar and analyse overlay CSS"
  ```

---

### Task 3: Update state management in main.ts

**Files:**
- Modify: `runalyzr/src/main.ts`

This task removes auto-analysis and wires the review bar into the existing UI state helpers. No new analysis logic yet — that's Task 4.

- [ ] **Step 1: Add `analysing` flag and review bar helpers**

  In `runalyzr/src/main.ts`, find the block of `let` declarations near the camera state machine (around line 160 — after `let mediaRecorder`). Add after the existing declarations:

  ```ts
  let analysing = false;
  ```

  Then find `function showIdleUI()` and add two new helper functions immediately before it:

  ```ts
  function showReviewBar(): void {
    const bar = document.getElementById('review-bar') as HTMLElement;
    const btn = document.getElementById('analyse-btn') as HTMLButtonElement;
    bar.hidden = false;
    btn.disabled = false;
  }

  function hideReviewBar(): void {
    const bar = document.getElementById('review-bar') as HTMLElement;
    bar.hidden = true;
  }
  ```

- [ ] **Step 2: Call `showReviewBar()` from `showVideoFileUI()`**

  Find `function showVideoFileUI()`:

  ```ts
  function showVideoFileUI(): void {
    cameraIdleEl.style.display = 'none';
    videoContainerEl.style.display = 'block';
    videoTopRightEl.style.display = 'flex';
    recordBtn.style.display = 'none';
    playbackCtrlsEl.style.display = 'flex';
  }
  ```

  Add `showReviewBar()` at the end:

  ```ts
  function showVideoFileUI(): void {
    cameraIdleEl.style.display = 'none';
    videoContainerEl.style.display = 'block';
    videoTopRightEl.style.display = 'flex';
    recordBtn.style.display = 'none';
    playbackCtrlsEl.style.display = 'flex';
    showReviewBar();
  }
  ```

- [ ] **Step 3: Call `hideReviewBar()` from `showIdleUI()`**

  Find `function showIdleUI()` and add `hideReviewBar()` at the end:

  ```ts
  function showIdleUI(): void {
    cameraIdleEl.style.display = 'flex';
    videoContainerEl.style.display = 'none';
    videoContainerEl.classList.remove('frame-grey', 'frame-red', 'frame-amber', 'frame-green');
    videoTopRightEl.style.display = 'none';
    recordBtn.style.display = 'none';
    setupOverlayEl.classList.remove('visible');
    liveMetricsEl.style.display = 'none';
    shareVideoBtn.style.display = 'none';
    hideReviewBar();
  }
  ```

- [ ] **Step 4: Set `analysing = false` at the start of `closeCamera()`**

  Find `function closeCamera()` and add `analysing = false;` as the very first line:

  ```ts
  function closeCamera(): void {
    analysing = false;
    const wasRecording = cameraState === 'recording';
    // ... rest unchanged
  ```

- [ ] **Step 5: Remove auto-analysis from `onPause` and `video.ended`**

  Find the `initVideoPlayer` call (around line 141). Change the `onPause` callback from:

  ```ts
    onPause:  () => { loop.stop(); runAnalysis(loop.getFrames()); },
  ```

  to:

  ```ts
    onPause:  () => { loop.stop(); },
  ```

  Then find the `video.addEventListener('ended', ...)` line and change it from:

  ```ts
  video.addEventListener('ended', () => { loop.stop(); runAnalysis(loop.getFrames()); });
  ```

  to:

  ```ts
  video.addEventListener('ended', () => { loop.stop(); });
  ```

- [ ] **Step 6: Verify state management manually**

  Run `cd runalyzr && npm run dev`. Set auth in console, reload, upload a video. Confirm:
  - Review bar with "Analyse" button appears below video
  - Clicking ✕ (top right) dismisses the video and hides the review bar
  - Playing and pausing the video does NOT trigger analysis or show results

- [ ] **Step 7: Commit**

  ```bash
  git add runalyzr/src/main.ts
  git commit -m "feat: add review bar state management, remove auto-analysis on pause/end"
  ```

---

### Task 4: Implement silent analysis

**Files:**
- Modify: `runalyzr/src/main.ts`

- [ ] **Step 1: Add `runSilentAnalysis()` function**

  In `runalyzr/src/main.ts`, add the following function immediately before the `cameraOpenBtn.addEventListener` line:

  ```ts
  async function runSilentAnalysis(): Promise<void> {
    analysing = true;

    const overlayEl  = document.getElementById('analyse-overlay') as HTMLElement;
    const pctEl      = document.getElementById('analyse-overlay-pct') as HTMLElement;
    const analyseBtn = document.getElementById('analyse-btn') as HTMLButtonElement;

    overlayEl.style.display = 'flex';
    analyseBtn.disabled = true;

    video.pause();

    const duration = video.duration;
    const step     = 1 / 30;
    const frames: FrameData[] = [];
    let   ts = 0; // monotonically increasing timestamp in ms

    for (let t = 0; t <= duration; t += step) {
      if (!analysing) break;

      video.currentTime = t;
      await new Promise<void>(resolve => {
        video.addEventListener('seeked', () => resolve(), { once: true });
      });

      if (!analysing) break;

      const result = landmarker.detectForVideo(video, ts);
      ts += Math.round(step * 1000);

      if (result.landmarks.length > 0 && result.worldLandmarks.length > 0) {
        frames.push({
          landmarks:      result.landmarks[0]      as LandmarkArray,
          worldLandmarks: result.worldLandmarks[0] as LandmarkArray,
          timestamp:      t * 1000,
        });
      }

      const pct = Math.min(100, Math.round((t / duration) * 100));
      pctEl.textContent = `Analysing… ${pct}%`;
    }

    overlayEl.style.display = 'none';
    analyseBtn.disabled = false;

    if (!analysing) return; // cancelled by ✕

    analysing = false;
    runAnalysis(frames);
    if (window.innerWidth < 768) switchTab('results');
  }
  ```

- [ ] **Step 2: Wire `analyse-btn` click handler**

  Find the `cameraOpenBtn.addEventListener('click', ...)` line. Immediately before it, add:

  ```ts
  document.getElementById('analyse-btn')!.addEventListener('click', () => {
    runSilentAnalysis().catch(console.error);
  });
  ```

- [ ] **Step 3: Verify end-to-end manually**

  Run `cd runalyzr && npm run dev`. Set auth in console, reload.

  **Happy path:**
  1. Click "Upload Video", select a short running video (5–15 seconds)
  2. Video appears in player with "Analyse" button below
  3. Click "Analyse"
  4. Video area is covered by "Analysing… N%" overlay, percentage climbs
  5. When done, overlay disappears and results panel shows metrics + findings
  6. On mobile width, results tab is auto-selected

  **Cancel path:**
  1. Upload video, click "Analyse"
  2. While "Analysing…" is shown, click ✕ (top-right)
  3. App returns to idle, no results shown

  **Wrong video path:**
  1. Upload video, click ✕ immediately
  2. App returns to idle

- [ ] **Step 4: Commit**

  ```bash
  git add runalyzr/src/main.ts
  git commit -m "feat: implement silent frame-seeking analysis with progress overlay"
  ```
