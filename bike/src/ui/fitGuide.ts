import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { FIT_POSITIONS, FitView, POSE_CONNECTIONS, OVERLAY_COLORS } from '../config/defaults';
import type { FitPosition } from '../config/defaults';
import { analyzeImage } from '../pose/processing';
import { measureFitPosition } from '../analysis/fitMetrics';
import type { FitPositionResult, FitSessionResults } from '../analysis/types';

export interface FitGuideController {
  start: () => void;
  reset: () => void;
  getResults: () => FitSessionResults;
}

export function initFitGuide(
  landmarker: PoseLandmarker,
  elements: {
    stepLabel: HTMLElement;
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
  let positions: FitPosition[] = [];
  let currentStep = 0;
  const positionResults: FitPositionResult[] = [];

  function renderStep() {
    const pos = positions[currentStep];
    const total = positions.length;
    elements.stepLabel.textContent = `Step ${currentStep + 1} of ${total}`;
    elements.viewLabel.textContent = pos.view === 'side' ? 'Side View' : pos.view === 'rear' ? 'Rear View' : 'Front View';
    elements.positionName.textContent = pos.name;
    elements.instructions.textContent = pos.instructions;

    const hasResult = positionResults.some((r) => r.positionId === pos.id);
    elements.canvasWrap.hidden = !hasResult;
    elements.uploadArea.hidden = hasResult;
    elements.retakeBtn.hidden = !hasResult;
    elements.nextBtn.disabled = !hasResult;
    elements.prevBtn.disabled = currentStep === 0;
    elements.nextBtn.textContent = currentStep === total - 1 ? 'Finish →' : 'Next →';

    if (hasResult) {
      const result = positionResults.find((r) => r.positionId === pos.id)!;
      drawResultOnCanvas(elements.canvas, result);
    }
  }

  function drawResultOnCanvas(canvas: HTMLCanvasElement, result: FitPositionResult) {
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

  function renderResults() {
    elements.resultsSections.innerHTML = '';
    for (const result of positionResults) {
      const section = document.createElement('div');
      section.className = 'fit-result-section';
      section.innerHTML = `<h3>${result.positionName}</h3>`;
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
    elements.resultsContent.hidden = false;
    elements.resultsEmpty.hidden = true;
    elements.exportBtn.hidden = false;
  }

  function renderSelection(selectedIds: Set<string>) {
    elements.stepLabel.textContent = '';
    elements.positionSelectEl.innerHTML = '';

    const viewOrder: FitView[] = ['side', 'rear', 'front'];
    const viewLabels: Record<FitView, string> = { side: 'Side View', rear: 'Rear View', front: 'Front View' };

    for (const view of viewOrder) {
      const viewPositions = FIT_POSITIONS.filter((p) => p.view === view);
      if (viewPositions.length === 0) continue;

      const group = document.createElement('div');
      group.className = 'position-group';

      const heading = document.createElement('h4');
      heading.textContent = viewLabels[view];
      group.appendChild(heading);

      for (const pos of viewPositions) {
        const label = document.createElement('label');
        label.className = 'position-toggle';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = pos.id;
        checkbox.checked = selectedIds.has(pos.id);

        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            selectedIds.add(pos.id);
          } else {
            selectedIds.delete(pos.id);
          }
          beginBtn.disabled = selectedIds.size === 0;
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(pos.name));
        group.appendChild(label);
      }

      elements.positionSelectEl.appendChild(group);
    }

    const beginBtn = document.createElement('button');
    beginBtn.className = 'primary-btn';
    beginBtn.textContent = 'Begin Session →';
    beginBtn.disabled = selectedIds.size === 0;
    beginBtn.addEventListener('click', () => {
      const activePositions = FIT_POSITIONS.filter((p) => selectedIds.has(p.id));
      startFlow(activePositions);
    });

    elements.positionSelectEl.appendChild(beginBtn);
  }

  function startFlow(activePositions: FitPosition[]) {
    positions = activePositions;
    currentStep = 0;
    positionResults.length = 0;
    elements.positionSelectEl.hidden = true;
    elements.stepUiEl.hidden = false;
    renderStep();
  }

  function processPhoto(file: File) {
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
      const pos = positions[currentStep];

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

      // Replace or add
      const idx = positionResults.findIndex((r) => r.positionId === pos.id);
      if (idx >= 0) positionResults[idx] = fitResult;
      else positionResults.push(fitResult);

      renderStep();
      renderResults();
    };
    img.src = url;
  }

  elements.fileInput.addEventListener('change', () => {
    const file = elements.fileInput.files?.[0];
    if (file) processPhoto(file);
    elements.fileInput.value = '';
  });

  elements.uploadBtn.addEventListener('click', () => elements.fileInput.click());
  elements.retakeBtn.addEventListener('click', () => elements.fileInput.click());

  elements.prevBtn.addEventListener('click', () => {
    if (currentStep > 0) { currentStep--; renderStep(); }
  });

  elements.nextBtn.addEventListener('click', () => {
    if (currentStep < positions.length - 1) {
      currentStep++;
      renderStep();
    } else {
      const results: FitSessionResults = { positions: [...positionResults], bikeGeometry: [] };
      onComplete(results);
    }
  });

  elements.skipBtn.addEventListener('click', () => {
    if (currentStep < positions.length - 1) {
      currentStep++;
      renderStep();
    } else {
      const results: FitSessionResults = { positions: [...positionResults], bikeGeometry: [] };
      onComplete(results);
    }
  });

  return {
    start() {
      elements.guidePanel.hidden = false;
      elements.stepUiEl.hidden = true;
      elements.positionSelectEl.hidden = false;
      const selectedIds = new Set(FIT_POSITIONS.map((p) => p.id));
      renderSelection(selectedIds);
    },
    reset() {
      currentStep = 0;
      positionResults.length = 0;
      elements.guidePanel.hidden = true;
      elements.positionSelectEl.hidden = true;
      elements.stepUiEl.hidden = true;
    },
    getResults: () => ({ positions: [...positionResults], bikeGeometry: [] }),
  };
}
