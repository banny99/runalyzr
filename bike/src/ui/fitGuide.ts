import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { FIT_STEPS, POSE_CONNECTIONS, OVERLAY_COLORS } from '../config/defaults';
import type { FitStep, FitView, RiderStep, BikeGeometryStep } from '../config/defaults';
import { analyzeImage } from '../pose/processing';
import { measureFitPosition } from '../analysis/fitMetrics';
import { computeBikeAngles } from '../analysis/bikeGeometryMetrics';
import { renderAnnotatedBikePhoto } from './annotatedBikePhoto';
import { openPointPlacement } from './pointPlacement';
import type { FitPositionResult, FitSessionResults, BikeGeometryResult, PlacedPoint } from '../analysis/types';

export interface FitGuideController {
  start: () => void;
  reset: () => void;
  getResults: () => FitSessionResults;
}

export function initFitGuide(
  landmarker: PoseLandmarker,
  elements: {
    stepLabel: HTMLElement;
    stepBadge: HTMLElement;
    progressFill: HTMLElement;
    viewLabel: HTMLElement;
    positionName: HTMLElement;
    instructions: HTMLElement;
    canvasWrap: HTMLElement;
    canvas: HTMLCanvasElement;
    uploadArea: HTMLElement;
    fileInput: HTMLInputElement;
    uploadBtn: HTMLButtonElement;
    prevBtn: HTMLButtonElement;
    retakeBtn: HTMLButtonElement;
    newPhotoBtn: HTMLButtonElement;
    nextBtn: HTMLButtonElement;
    skipBtn: HTMLButtonElement;
    guidePanel: HTMLElement;
    positionSelectEl: HTMLElement;
    stepUiEl: HTMLElement;
    resultsEmpty: HTMLElement;
    resultsSections: HTMLElement;
    resultsContent: HTMLElement;
    exportBtn: HTMLElement;
  },
  onComplete: (results: FitSessionResults) => void,
): FitGuideController {
  let steps: FitStep[] = [];
  let currentStep = 0;
  const positionResults: FitPositionResult[] = [];
  const bikeGeometryResults: BikeGeometryResult[] = [];
  // Raw (un-annotated) photos so "Edit points" re-edits on the original image
  const bikeRawPhotos = new Map<string, string>();

  const viewText = (view: FitView) =>
    view === 'side' ? 'Side View' : view === 'rear' ? 'Rear View' : 'Front View';

  // ── Step rendering ────────────────────────────────────────────────────

  function renderStepHeader(step: FitStep) {
    const total = steps.length;
    elements.stepLabel.textContent = `Step ${currentStep + 1} of ${total}`;
    elements.progressFill.style.width = `${Math.round(((currentStep + 1) / total) * 100)}%`;
    elements.viewLabel.textContent = viewText(step.view);
    elements.stepBadge.hidden = false;
    elements.stepBadge.textContent = step.kind === 'bike' ? 'bike only' : 'with rider';
    elements.stepBadge.className =
      `step-badge ${step.kind === 'bike' ? 'step-badge-bike' : 'step-badge-rider'}`;
    elements.positionName.textContent = step.name;
    elements.prevBtn.disabled = currentStep === 0;
    elements.nextBtn.textContent = currentStep === total - 1 ? 'Finish →' : 'Next →';
  }

  function renderStep() {
    const step = steps[currentStep];
    renderStepHeader(step);
    if (step.kind === 'bike') renderBikeStep(step);
    else renderRiderStep(step);
  }

  function renderRiderStep(pos: RiderStep) {
    elements.instructions.textContent = pos.instructions;
    const hasResult = positionResults.some((r) => r.positionId === pos.id);
    elements.canvasWrap.hidden = !hasResult;
    elements.uploadArea.hidden = hasResult;
    elements.retakeBtn.hidden = !hasResult;
    elements.retakeBtn.textContent = 'Retake';
    elements.newPhotoBtn.hidden = true;
    elements.nextBtn.disabled = !hasResult;

    if (hasResult) {
      const result = positionResults.find((r) => r.positionId === pos.id)!;
      drawRiderResultOnCanvas(elements.canvas, result);
    }
  }

  function renderBikeStep(step: BikeGeometryStep) {
    const result = bikeGeometryResults.find((r) => r.stepId === step.id);
    elements.instructions.textContent = result
      ? 'Review the angles below — Edit points to adjust, or continue.'
      : step.instructions;
    elements.canvasWrap.hidden = !result;
    elements.uploadArea.hidden = !!result;
    elements.retakeBtn.hidden = !result;
    elements.retakeBtn.textContent = 'Edit points';
    elements.newPhotoBtn.hidden = !result;
    elements.nextBtn.disabled = !result;

    if (result) drawDataUrlOnCanvas(elements.canvas, result.imageDataUrl);
  }

  function drawDataUrlOnCanvas(canvas: HTMLCanvasElement, dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  }

  function drawRiderResultOnCanvas(canvas: HTMLCanvasElement, result: FitPositionResult) {
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      const w = canvas.width;
      const h = canvas.height;
      const lm = result.landmarks;

      ctx.lineWidth = 2;
      for (const [a, b] of POSE_CONNECTIONS) {
        const lmA = lm[a];
        const lmB = lm[b];
        if (!lmA || !lmB) continue;
        ctx.strokeStyle = OVERLAY_COLORS.neutral;
        ctx.beginPath();
        ctx.moveTo(lmA.x * w, lmA.y * h);
        ctx.lineTo(lmB.x * w, lmB.y * h);
        ctx.stroke();
      }
      for (const l of lm) {
        if (!l || (l.visibility ?? 1) < 0.4) continue;
        ctx.fillStyle = OVERLAY_COLORS.neutral;
        ctx.beginPath();
        ctx.arc(l.x * w, l.y * h, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    img.src = result.imageDataUrl;
  }

  // ── Results panel ─────────────────────────────────────────────────────

  function renderResults() {
    elements.resultsSections.innerHTML = '';

    for (const bg of bikeGeometryResults) {
      const section = document.createElement('div');
      section.className = 'fit-result-section';
      const heading = document.createElement('h3');
      heading.textContent = bg.stepName;
      section.appendChild(heading);

      if (bg.imageDataUrl) {
        const img = document.createElement('img');
        img.src = bg.imageDataUrl;
        img.alt = bg.stepName;
        img.style.cssText = 'max-width:100%;border-radius:6px;margin-bottom:8px;display:block;';
        section.appendChild(img);
      }

      const table = document.createElement('table');
      table.className = 'metric-table';
      if (bg.angles.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="3" style="color:#64748b;font-style:italic">No points placed yet</td>';
        table.appendChild(row);
      } else {
        for (const a of bg.angles) {
          const row = document.createElement('tr');
          row.innerHTML = `<td>${a.label}</td><td>${a.value}°</td><td class="normal-range">${a.normalRange}</td>`;
          table.appendChild(row);
        }
      }
      section.appendChild(table);
      elements.resultsSections.appendChild(section);
    }

    for (const result of positionResults) {
      const section = document.createElement('div');
      section.className = 'fit-result-section';
      const heading = document.createElement('h3');
      heading.textContent = result.positionName;
      section.appendChild(heading);
      const table = document.createElement('table');
      table.className = 'metric-table';
      for (const m of result.measurements) {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${m.label}</td><td>${m.value}${m.unit}</td><td class="normal-range">${m.normalRange ?? '—'}</td>`;
        table.appendChild(row);
      }
      section.appendChild(table);
      elements.resultsSections.appendChild(section);
    }

    const hasResults = bikeGeometryResults.length > 0 || positionResults.length > 0;
    elements.resultsContent.hidden = !hasResults;
    elements.resultsEmpty.hidden = hasResults;
    elements.exportBtn.hidden = !hasResults;
  }

  // ── Selection screen ──────────────────────────────────────────────────

  function renderSelection(selectedIds: Set<string>) {
    elements.stepLabel.textContent = '';
    elements.stepBadge.hidden = true;
    elements.progressFill.style.width = '0%';
    elements.positionSelectEl.innerHTML = '';

    let beginBtn: HTMLButtonElement;

    function makeSection(title: string, badge: string, badgeClass: string, sectionSteps: FitStep[]): HTMLElement {
      const wrap = document.createElement('div');
      wrap.className = 'position-section';

      const header = document.createElement('label');
      header.className = 'position-section-header';

      const parentCb = document.createElement('input');
      parentCb.type = 'checkbox';

      const titleSpan = document.createElement('span');
      titleSpan.textContent = title;

      const badgeSpan = document.createElement('span');
      badgeSpan.className = `position-section-badge ${badgeClass}`;
      badgeSpan.textContent = badge;

      header.appendChild(parentCb);
      header.appendChild(titleSpan);
      header.appendChild(badgeSpan);
      wrap.appendChild(header);

      const childCbs: HTMLInputElement[] = [];
      const viewOrder: FitView[] = ['side', 'rear', 'front'];

      for (const view of viewOrder) {
        const viewSteps = sectionSteps.filter((s) => s.view === view);
        if (viewSteps.length === 0) continue;

        if (sectionSteps.some((s) => s.view !== viewSteps[0].view)) {
          const viewLabel = document.createElement('div');
          viewLabel.className = 'position-view-label';
          viewLabel.textContent = viewText(view);
          wrap.appendChild(viewLabel);
        }

        for (const step of viewSteps) {
          const label = document.createElement('label');
          label.className = 'position-toggle';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = step.id;
          cb.checked = selectedIds.has(step.id);
          childCbs.push(cb);

          cb.addEventListener('change', () => {
            if (cb.checked) selectedIds.add(step.id);
            else selectedIds.delete(step.id);
            syncParent();
            beginBtn.disabled = selectedIds.size === 0;
          });

          label.appendChild(cb);
          label.appendChild(document.createTextNode(step.name));
          wrap.appendChild(label);
        }
      }

      function syncParent() {
        const checked = childCbs.filter((c) => c.checked).length;
        parentCb.checked = checked === childCbs.length && childCbs.length > 0;
        parentCb.indeterminate = checked > 0 && checked < childCbs.length;
      }

      parentCb.addEventListener('change', () => {
        childCbs.forEach((c) => {
          c.checked = parentCb.checked;
          if (parentCb.checked) selectedIds.add(c.value);
          else selectedIds.delete(c.value);
        });
        beginBtn.disabled = selectedIds.size === 0;
      });

      syncParent();
      return wrap;
    }

    const bikeSteps  = FIT_STEPS.filter((s) => s.kind === 'bike');
    const riderSteps = FIT_STEPS.filter((s) => s.kind === 'rider');
    elements.positionSelectEl.appendChild(makeSection('Bike Geometry', 'no rider', '', bikeSteps));
    elements.positionSelectEl.appendChild(makeSection('Rider on Bike', 'with rider', 'rider', riderSteps));

    beginBtn = document.createElement('button');
    beginBtn.className = 'primary-btn';
    beginBtn.textContent = 'Begin Session →';
    beginBtn.disabled = selectedIds.size === 0;
    beginBtn.addEventListener('click', () => {
      startFlow(FIT_STEPS.filter((s) => selectedIds.has(s.id)));
    });
    elements.positionSelectEl.appendChild(beginBtn);
  }

  function startFlow(activeSteps: FitStep[]) {
    steps = activeSteps;
    currentStep = 0;
    positionResults.length = 0;
    bikeGeometryResults.length = 0;
    bikeRawPhotos.clear();
    elements.positionSelectEl.hidden = true;
    elements.stepUiEl.hidden = false;
    renderStep();
  }

  // ── Rider photo flow (unchanged behaviour) ────────────────────────────

  function processRiderPhoto(file: File, pos: RiderStep) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Could not load this image. Please try a different photo.');
    };
    img.onload = async () => {
      let result: Awaited<ReturnType<typeof analyzeImage>>;
      try {
        result = await analyzeImage(landmarker, img);
      } catch (e) {
        console.error('Photo analysis failed:', e);
        URL.revokeObjectURL(url);
        alert('Photo analysis failed. Please try again.');
        return;
      }
      if (!result) {
        alert('No pose detected in this photo. Please retake.');
        URL.revokeObjectURL(url);
        return;
      }

      // Capture the image as data URL for the PDF
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.naturalWidth;
      tempCanvas.height = img.naturalHeight;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.drawImage(img, 0, 0);
      const imageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
      URL.revokeObjectURL(url);

      const measurements = measureFitPosition(pos.id, result.worldLandmarks);

      const fitResult: FitPositionResult = {
        positionId:    pos.id,
        positionName:  pos.name,
        landmarks:     result.landmarks,
        worldLandmarks: result.worldLandmarks,
        measurements,
        imageDataUrl,
      };

      const idx = positionResults.findIndex((r) => r.positionId === pos.id);
      if (idx >= 0) positionResults[idx] = fitResult;
      else positionResults.push(fitResult);

      renderStep();
      renderResults();
    };
    img.src = url;
  }

  // ── Bike photo flow ───────────────────────────────────────────────────

  function processBikePhoto(file: File, step: BikeGeometryStep) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Could not load this image. Please try a different photo.');
    };
    img.onload = async () => {
      // Keep the raw photo so Edit points re-edits the original
      const tmp = document.createElement('canvas');
      tmp.width = img.naturalWidth;
      tmp.height = img.naturalHeight;
      tmp.getContext('2d')!.drawImage(img, 0, 0);
      bikeRawPhotos.set(step.id, tmp.toDataURL('image/jpeg', 0.85));
      URL.revokeObjectURL(url);

      const existing = bikeGeometryResults.find((r) => r.stepId === step.id);
      const pts = await openPointPlacement(img, step, existing?.points ?? []);
      if (pts !== null) storeBikeResult(step, img, pts);
      renderStep();
    };
    img.src = url;
  }

  function editBikePoints(step: BikeGeometryStep) {
    const raw = bikeRawPhotos.get(step.id);
    const existing = bikeGeometryResults.find((r) => r.stepId === step.id);
    if (!raw) {
      elements.fileInput.click();
      return;
    }
    const img = new Image();
    img.onerror = () => alert('Could not reload the photo. Take a new one.');
    img.onload = async () => {
      const pts = await openPointPlacement(img, step, existing?.points ?? []);
      if (pts !== null) storeBikeResult(step, img, pts);
      renderStep();
    };
    img.src = raw;
  }

  function storeBikeResult(step: BikeGeometryStep, img: HTMLImageElement, pts: PlacedPoint[]) {
    const imageAspect = img.naturalWidth / img.naturalHeight;
    const angles = computeBikeAngles(pts, step.angles, imageAspect);
    const imageDataUrl = renderAnnotatedBikePhoto(img, step, pts, angles);
    const result: BikeGeometryResult = {
      stepId: step.id,
      stepName: step.name,
      imageDataUrl,
      imageAspect,
      points: pts,
      angles,
    };
    const idx = bikeGeometryResults.findIndex((r) => r.stepId === step.id);
    if (idx >= 0) bikeGeometryResults[idx] = result;
    else bikeGeometryResults.push(result);
    renderResults();
  }

  // ── Session navigation ────────────────────────────────────────────────

  function buildResults(): FitSessionResults {
    return { positions: [...positionResults], bikeGeometry: [...bikeGeometryResults] };
  }

  function finishSession() {
    onComplete(buildResults());
    elements.stepUiEl.hidden = true;
    elements.positionSelectEl.hidden = false;
    renderResults();
    renderSelection(new Set(FIT_STEPS.map((s) => s.id)));
    // On phones, jump to the results tab (desktop shows both panels; the
    // active classes are ignored by the desktop layout)
    document.querySelectorAll<HTMLElement>('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === 'results'));
    document.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) =>
      p.classList.toggle('active', p.dataset.tab === 'results'));
  }

  function advance() {
    if (currentStep < steps.length - 1) {
      currentStep++;
      renderStep();
    } else {
      finishSession();
    }
  }

  // ── Event wiring ──────────────────────────────────────────────────────

  elements.fileInput.addEventListener('change', () => {
    const file = elements.fileInput.files?.[0];
    if (file) {
      const step = steps[currentStep];
      if (step.kind === 'bike') processBikePhoto(file, step);
      else processRiderPhoto(file, step);
    }
    elements.fileInput.value = '';
  });

  elements.uploadBtn.addEventListener('click', () => elements.fileInput.click());

  elements.retakeBtn.addEventListener('click', () => {
    const step = steps[currentStep];
    if (step.kind === 'bike') editBikePoints(step);
    else elements.fileInput.click();
  });

  elements.newPhotoBtn.addEventListener('click', () => elements.fileInput.click());

  elements.prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  });

  elements.nextBtn.addEventListener('click', advance);
  elements.skipBtn.addEventListener('click', advance);

  return {
    start() {
      elements.guidePanel.hidden = false;
      elements.stepUiEl.hidden = true;
      elements.positionSelectEl.hidden = false;
      renderSelection(new Set(FIT_STEPS.map((s) => s.id)));
    },
    reset() {
      currentStep = 0;
      positionResults.length = 0;
      bikeGeometryResults.length = 0;
      bikeRawPhotos.clear();
      elements.guidePanel.hidden = true;
      elements.positionSelectEl.hidden = true;
      elements.stepUiEl.hidden = true;
      renderResults();
    },
    getResults: buildResults,
  };
}
