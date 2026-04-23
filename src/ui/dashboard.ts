import { METRIC_LABELS, SAGITTAL_METRICS, FRONTAL_METRICS } from '../config/defaults';
import type { AnalysisResults, FindingItem, CameraView } from '../analysis/types';
import { THRESHOLDS } from '../analysis/thresholds';

function validMetricsForView(view: CameraView): Set<string> | null {
  if (view === 'sagittal') return SAGITTAL_METRICS;
  if (view === 'frontal')  return FRONTAL_METRICS;
  return null; // unknown → show all
}

export function renderDashboard(
  results: AnalysisResults,
  findings: FindingItem[],
  view: CameraView,
): void {
    renderSummaryCards(results, view);
    renderFindings(findings);

    const resultsEmpty   = document.getElementById('results-empty');
    const resultsContent = document.getElementById('results-content');
    if (resultsEmpty)   resultsEmpty.style.display = 'none';
    if (resultsContent) resultsContent.hidden = false;

    document.getElementById('export-pdf-btn')?.removeAttribute('disabled');
    document.getElementById('export-pdf-phone')?.removeAttribute('disabled');
}

export function renderSummaryCards(results: AnalysisResults, view: CameraView): void {
    const container = document.getElementById('summary-cards');
    if (!container) return;
    container.innerHTML = '';
    const allowedMetrics = validMetricsForView(view);
    for (const [key, result] of Object.entries(results) as [keyof AnalysisResults, typeof results[keyof AnalysisResults]][]) {
        if (!result) continue;
        if (allowedMetrics && !allowedMetrics.has(key)) continue;
        const threshold = THRESHOLDS[key];
        const card = document.createElement('div');
        card.className = `metric-card ${result.status}`;
        card.dataset.metric = key;
        const normalRange = threshold
            ? `Normal: ${threshold.green[0]}–${threshold.green[1]}${threshold.unit}`
            : '';
        card.innerHTML = `
      <div class="metric-name">${METRIC_LABELS[key] ?? key}</div>
      <div class="metric-value">${result.value.toFixed(1)}${result.unit}</div>
      <div class="metric-range">${normalRange}</div>
    `;
        container.appendChild(card);
    }
}

export function renderFindings(findings: FindingItem[]): void {
    const container = document.getElementById('findings-list');
    if (!container) return;
    container.innerHTML = '';
    if (findings.length === 0) {
        container.innerHTML = '<p class="findings-empty">No issues detected.</p>';
        return;
    }
    for (const finding of findings) {
        const item = document.createElement('div');
        item.className = `finding-item ${finding.status}`;
        item.innerHTML = `<span class="finding-dot"></span><span>${finding.text}</span>`;
        container.appendChild(item);
    }
}

export function updateLiveMetrics(
  cadence: number | null,
  view: string,
  fps: number,
): void {
  const cadenceEl = document.getElementById('cadence-display');
  const viewEl = document.getElementById('view-display');
  if (cadenceEl) cadenceEl.textContent = cadence ? `Cadence: ${cadence} spm` : 'Cadence: —';
  if (viewEl) viewEl.textContent = `View: ${view} | ${fps.toFixed(0)} fps`;
}

export function showAnalysisWarning(message: string): void {
  clearAnalysisWarning();
  const banner = document.createElement('div');
  banner.id = 'analysis-warning';
  banner.textContent = message;
  const resultsPanel = document.getElementById('results-panel');
  if (resultsPanel) resultsPanel.insertAdjacentElement('afterbegin', banner);
}

export function clearAnalysisWarning(): void {
  document.getElementById('analysis-warning')?.remove();
}

export function showQualityWarning(warnings: string[]): void {
  clearQualityWarning();
  if (warnings.length === 0) return;
  const resultsPanel = document.getElementById('results-panel');
  if (!resultsPanel) return;
  const banner = document.createElement('div');
  banner.id = 'quality-warning';

  const toggle = document.createElement('button');
  toggle.id = 'quality-warning-toggle';
  toggle.textContent = '⚠ Video quality issues may affect accuracy ▾';
  banner.appendChild(toggle);

  const list = document.createElement('ul');
  list.id = 'quality-warning-list';
  list.hidden = true;
  for (const w of warnings) {
    const li = document.createElement('li');
    li.textContent = w;
    list.appendChild(li);
  }
  banner.appendChild(list);

  toggle.addEventListener('click', () => {
    list.hidden = !list.hidden;
    toggle.textContent = list.hidden
      ? '⚠ Video quality issues may affect accuracy ▾'
      : '⚠ Video quality issues may affect accuracy ▴';
  });

  resultsPanel.insertAdjacentElement('afterbegin', banner);
}

export function clearQualityWarning(): void {
  document.getElementById('quality-warning')?.remove();
}

export function renderViewSelector(
  detectedView: CameraView,
  manualView: CameraView | null,
  onSwitch: (view: 'sagittal' | 'frontal') => void,
  onReset: () => void,
): void {
  const container = document.getElementById('view-selector');
  if (!container) return;
  container.innerHTML = '';

  const viewLabel = (v: CameraView | null): string => {
    if (v === 'sagittal') return 'Side view';
    if (v === 'frontal')  return 'Front view';
    return 'View unknown';
  };

  const activeView = manualView ?? detectedView;
  const suffix = manualView ? ' (manual)' : ' (auto)';

  const label = document.createElement('span');
  label.className = 'view-selector-label';
  label.textContent = viewLabel(activeView) + suffix;
  container.appendChild(label);

  if (manualView === null) {
    const btn = document.createElement('button');
    btn.className = 'view-selector-btn';
    btn.textContent = 'Switch';
    btn.addEventListener('click', () => {
      const next: 'sagittal' | 'frontal' =
        activeView === 'sagittal' ? 'frontal' : 'sagittal';
      onSwitch(next);
    });
    container.appendChild(btn);
  } else {
    const btn = document.createElement('button');
    btn.className = 'view-selector-reset';
    btn.textContent = 'Reset to auto';
    btn.addEventListener('click', onReset);
    container.appendChild(btn);
  }
}
