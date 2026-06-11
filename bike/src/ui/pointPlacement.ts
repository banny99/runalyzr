import type { BikeGeometryStep } from '../config/defaults';
import type { PlacedPoint } from '../analysis/types';
import { anglePointPairs } from '../analysis/bikeGeometryMetrics';
import { firstUnplacedFrom } from './placementSequence';

const LOUPE_CSS_SIZE = 120; // px
const LOUPE_ZOOM = 2.5;
const LOUPE_OFFSET_Y = 90;  // px above the finger

/**
 * Fullscreen tap-to-place mode for bike geometry points.
 * Resolves with the placed points on Done, or null on Cancel.
 * Owns its DOM completely — nothing is shared with the step card.
 */
export function openPointPlacement(
  img: HTMLImageElement,
  step: BikeGeometryStep,
  existingPoints: PlacedPoint[],
): Promise<PlacedPoint[] | null> {
  return new Promise((resolve) => {
    const points: PlacedPoint[] = existingPoints.map((p) => ({ ...p }));
    const placedOrder: string[] = points.map((p) => p.id);
    const placedIds = () => new Set(points.map((p) => p.id));
    let activeIndex = firstUnplacedFrom(step.points, placedIds(), 0);

    // ── DOM ─────────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'pp-overlay';
    root.innerHTML = `
      <canvas class="pp-canvas"></canvas>
      <div class="pp-topbar">
        <span class="pp-prompt"></span>
        <button class="pp-cancel" type="button" aria-label="Cancel">✕</button>
      </div>
      <canvas class="pp-loupe" hidden></canvas>
      <div class="pp-bottombar">
        <div class="pp-chips"></div>
        <div class="pp-actions">
          <button class="pp-undo" type="button">↩ Undo</button>
          <button class="pp-skip" type="button">Skip point</button>
          <button class="pp-done" type="button">Done ✓</button>
        </div>
      </div>`;
    document.body.appendChild(root);

    const canvas   = root.querySelector('.pp-canvas')  as HTMLCanvasElement;
    const loupe    = root.querySelector('.pp-loupe')   as HTMLCanvasElement;
    const promptEl = root.querySelector('.pp-prompt')  as HTMLElement;
    const chipsEl  = root.querySelector('.pp-chips')   as HTMLElement;
    const undoBtn  = root.querySelector('.pp-undo')    as HTMLButtonElement;
    const skipBtn  = root.querySelector('.pp-skip')    as HTMLButtonElement;
    const doneBtn  = root.querySelector('.pp-done')    as HTMLButtonElement;
    const cancelBtn = root.querySelector('.pp-cancel') as HTMLButtonElement;

    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const linePairs = anglePointPairs(step.angles);

    // ── Canvas sizing + image letterbox math ────────────────────────────
    // Points are normalised to the IMAGE (0–1 of natural size), not the
    // canvas — the canvas adds letterbox offsets that change on resize.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let drawX = 0, drawY = 0, drawW = 0, drawH = 0; // image rect in canvas px

    function sizeCanvas() {
      const cssW = root.clientWidth;
      const cssH = root.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      drawW = img.naturalWidth * scale;
      drawH = img.naturalHeight * scale;
      drawX = (canvas.width - drawW) / 2;
      drawY = (canvas.height - drawH) / 2;
    }

    function clientToImageNorm(clientX: number, clientY: number): { x: number; y: number } | null {
      const rect = canvas.getBoundingClientRect();
      const cx = ((clientX - rect.left) / rect.width) * canvas.width;
      const cy = ((clientY - rect.top) / rect.height) * canvas.height;
      const nx = (cx - drawX) / drawW;
      const ny = (cy - drawY) / drawH;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
      return { x: nx, y: ny };
    }

    // ── Drawing ─────────────────────────────────────────────────────────
    const dotRadius = () => Math.max(8 * dpr, Math.round(drawW * 0.012));

    function draw(cursor?: { x: number; y: number }) {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      const byId = Object.fromEntries(points.map((p) => [p.id, p]));
      const toPx = (p: { x: number; y: number }) => ({ x: drawX + p.x * drawW, y: drawY + p.y * drawH });

      // Connection lines
      ctx.save();
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = '#60a5fa';
      ctx.globalAlpha = 0.7;
      for (const [aId, bId] of linePairs) {
        const pA = byId[aId];
        const pB = byId[bId];
        if (!pA || !pB) continue;
        const a = toPx(pA);
        const b = toPx(pB);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();

      // Placed dots + short labels
      const r = dotRadius();
      ctx.font = `bold ${Math.max(12 * dpr, r)}px sans-serif`;
      for (const p of points) {
        const { x, y } = toPx(p);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
        const shortLabel = step.points.find((pt) => pt.id === p.id)?.label.split(' ')[0] ?? p.id;
        ctx.fillStyle = 'white';
        ctx.fillText(shortLabel, x + r + 3 * dpr, y + 4 * dpr);
      }

      // Crosshair for the cursor (mouse hover or touch drag)
      if (activeIndex < step.points.length && cursor) {
        const { x, y } = toPx(cursor);
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1 * dpr;
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Loupe (touch drag magnifier) ────────────────────────────────────
    function showLoupe(norm: { x: number; y: number }, clientX: number, clientY: number) {
      const size = LOUPE_CSS_SIZE;
      loupe.hidden = false;
      loupe.width = size * dpr;
      loupe.height = size * dpr;
      loupe.style.width = `${size}px`;
      loupe.style.height = `${size}px`;
      const left = Math.max(4, Math.min(window.innerWidth - size - 4, clientX - size / 2));
      const top = Math.max(4, clientY - LOUPE_OFFSET_Y - size / 2);
      loupe.style.left = `${left}px`;
      loupe.style.top = `${top}px`;

      const ctx = loupe.getContext('2d')!;
      // Source window on the original image: the loupe shows screen pixels
      // magnified LOUPE_ZOOM×, so source size = loupe canvas px mapped to
      // image px, divided by the zoom factor.
      const imgPerCanvas = img.naturalWidth / drawW;
      const srcSize = ((size * dpr) / LOUPE_ZOOM) * imgPerCanvas;
      const sx = norm.x * img.naturalWidth - srcSize / 2;
      const sy = norm.y * img.naturalHeight - srcSize / 2;
      ctx.fillStyle = '#0b0d11';
      ctx.fillRect(0, 0, loupe.width, loupe.height);
      ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, loupe.width, loupe.height);
      // Crosshair
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.moveTo(loupe.width / 2, 0); ctx.lineTo(loupe.width / 2, loupe.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, loupe.height / 2); ctx.lineTo(loupe.width, loupe.height / 2); ctx.stroke();
    }

    function hideLoupe() { loupe.hidden = true; }

    // ── UI state ────────────────────────────────────────────────────────
    function updatePrompt() {
      if (activeIndex >= step.points.length) {
        promptEl.textContent = `All ${step.points.length} points placed — review, or tap a chip to adjust.`;
      } else {
        const pt = step.points[activeIndex];
        promptEl.innerHTML = `Tap the <b></b> <span style="opacity:.7">(${activeIndex + 1}/${step.points.length})</span>`;
        (promptEl.querySelector('b') as HTMLElement).textContent = pt.label;
      }
      undoBtn.disabled = placedOrder.length === 0;
      skipBtn.disabled = activeIndex >= step.points.length;
    }

    function updateChips() {
      chipsEl.innerHTML = '';
      const placed = placedIds();
      step.points.forEach((pt, i) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'pp-chip'
          + (placed.has(pt.id) ? ' placed' : '')
          + (i === activeIndex ? ' active' : '');
        chip.textContent = (placed.has(pt.id) ? '● ' : '○ ') + pt.label;
        chip.addEventListener('click', () => {
          activeIndex = i;
          refresh();
        });
        chipsEl.appendChild(chip);
      });
      chipsEl.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }

    function refresh(cursor?: { x: number; y: number }) {
      updatePrompt();
      updateChips();
      draw(cursor);
    }

    // ── Placement ───────────────────────────────────────────────────────
    function placeAt(norm: { x: number; y: number }) {
      if (activeIndex >= step.points.length) return;
      const def = step.points[activeIndex];
      const existing = points.findIndex((p) => p.id === def.id);
      const placed: PlacedPoint = { id: def.id, x: norm.x, y: norm.y };
      if (existing >= 0) points[existing] = placed;
      else points.push(placed);
      const orderIdx = placedOrder.indexOf(def.id);
      if (orderIdx >= 0) placedOrder.splice(orderIdx, 1);
      placedOrder.push(def.id);
      activeIndex = firstUnplacedFrom(step.points, placedIds(), activeIndex + 1);
      refresh();
    }

    // ── Pointer events ──────────────────────────────────────────────────
    // Touch: press-drag shows the loupe, release places.
    // Mouse: hover shows crosshair, click places.
    let dragging = false;
    let dragNorm: { x: number; y: number } | null = null;
    let dragPointerId: number | null = null;

    // rAF throttle state (Fix 3)
    let rafPending: number | null = null;
    let latestMoveX = 0;
    let latestMoveY = 0;
    let latestMoveType = '';

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'touch') {
        if (dragging) return; // Fix 2: ignore second touch while drag is live
        const norm = clientToImageNorm(e.clientX, e.clientY);
        if (!norm || activeIndex >= step.points.length) return;
        e.preventDefault();
        dragging = true;
        dragNorm = norm;
        dragPointerId = e.pointerId; // Fix 2: record active pointer
        canvas.setPointerCapture(e.pointerId);
        draw(norm);
        showLoupe(norm, e.clientX, e.clientY);
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerType === 'touch') {
        if (!dragging) return;
        if (e.pointerId !== dragPointerId) return; // Fix 2: ignore foreign pointers
        e.preventDefault();
      }
      // Fix 3: store latest values and coalesce via rAF
      latestMoveX = e.clientX;
      latestMoveY = e.clientY;
      latestMoveType = e.pointerType;
      if (rafPending !== null) return;
      rafPending = requestAnimationFrame(() => {
        rafPending = null;
        const norm = clientToImageNorm(latestMoveX, latestMoveY);
        if (latestMoveType === 'touch') {
          if (!dragging) return;
          if (norm) {
            dragNorm = norm;
            draw(norm);
            showLoupe(norm, latestMoveX, latestMoveY);
          }
        } else {
          draw(norm ?? undefined);
        }
      });
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerType === 'touch') {
        if (!dragging) return;
        if (e.pointerId !== dragPointerId) return; // Fix 2: ignore foreign pointers
        dragging = false;
        dragPointerId = null; // Fix 2: reset
        hideLoupe();
        if (dragNorm) placeAt(dragNorm);
        dragNorm = null;
      } else {
        const norm = clientToImageNorm(e.clientX, e.clientY);
        if (norm) placeAt(norm);
      }
    }

    // Fix 1: abort drag without placing if the browser cancels the touch
    function onPointerCancel() {
      if (!dragging) return;
      dragging = false;
      dragPointerId = null;
      dragNorm = null;
      hideLoupe();
      draw();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      if (e.key === 'Enter')  { e.preventDefault(); finish([...points]); }
    }

    function onResize() {
      sizeCanvas();
      draw();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel); // Fix 1
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);

    undoBtn.addEventListener('click', () => {
      const id = placedOrder.pop();
      if (!id) return;
      const idx = points.findIndex((p) => p.id === id);
      if (idx >= 0) points.splice(idx, 1);
      activeIndex = step.points.findIndex((pt) => pt.id === id);
      refresh();
    });

    skipBtn.addEventListener('click', () => {
      activeIndex = firstUnplacedFrom(step.points, placedIds(), activeIndex + 1);
      refresh();
    });

    doneBtn.addEventListener('click', () => finish([...points]));
    cancelBtn.addEventListener('click', () => finish(null));

    function finish(result: PlacedPoint[] | null) {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel); // Fix 1
      if (rafPending !== null) { cancelAnimationFrame(rafPending); rafPending = null; } // Fix 3
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = prevBodyOverflow;
      root.remove();
      resolve(result);
    }

    // ── Init ────────────────────────────────────────────────────────────
    sizeCanvas();
    refresh();
  });
}
