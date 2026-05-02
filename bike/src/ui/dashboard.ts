import type { SagittalMetrics, RearMetrics, FrontMetrics, MetricToggleState, MetricKey } from '../analysis/types';
import type { MetricResult } from '@runalyzr/shared/types';
import { METRIC_LABELS } from '../config/defaults';
import type { Finding } from '../analysis/findings';

interface ViewSection {
  title: string;
  metrics: Record<string, MetricResult | null>;
  findings: Finding[];
}

export function renderRideDashboard(
  sagittal: SagittalMetrics | null,
  rear: RearMetrics | null,
  front: FrontMetrics | null,
  sagittalFindings: Finding[],
  rearFindings: Finding[],
  frontFindings: Finding[],
  toggleState: MetricToggleState,
  metricsSectionsEl: HTMLElement,
  findingsEl: HTMLElement,
  exportBtn: HTMLElement,
  resultsEmpty: HTMLElement,
  resultsContent: HTMLElement,
  onToggle?: (key: string) => void,
): void {
  metricsSectionsEl.innerHTML = '';
  findingsEl.innerHTML = '';

  const sections: ViewSection[] = [];
  if (sagittal) sections.push({ title: 'Sagittal (Side) View', metrics: sagittal as unknown as Record<string, MetricResult | null>, findings: sagittalFindings });
  if (rear)     sections.push({ title: 'Rear View',            metrics: rear     as unknown as Record<string, MetricResult | null>, findings: rearFindings });
  if (front)    sections.push({ title: 'Front View',           metrics: front    as unknown as Record<string, MetricResult | null>, findings: frontFindings });

  if (sections.length === 0) return;

  for (const section of sections) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'metric-section';
    const heading = document.createElement('h3');
    heading.textContent = section.title;
    sectionEl.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'metric-grid';

    for (const [key, result] of Object.entries(section.metrics)) {
      const enabled = toggleState[key as MetricKey] !== false;
      const card = createMetricCard(key, result, enabled, onToggle);
      grid.appendChild(card);
    }

    sectionEl.appendChild(grid);
    metricsSectionsEl.appendChild(sectionEl);
  }

  // Findings — filter by enabled metrics
  const allFindings = [...sagittalFindings, ...rearFindings, ...frontFindings]
    .filter((f) => toggleState[f.metric as MetricKey] !== false)
    .filter((f) => f.status === 'red' || f.status === 'amber')
    .sort((a, b) => (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));

  if (allFindings.length > 0) {
    const heading = document.createElement('h3');
    heading.textContent = 'Clinical Findings';
    findingsEl.appendChild(heading);
    for (const f of allFindings) {
      const el = document.createElement('div');
      el.className = `finding finding-${f.status}`;
      el.textContent = f.text;
      findingsEl.appendChild(el);
    }
  }

  resultsEmpty.hidden = true;
  resultsContent.hidden = false;
  exportBtn.hidden = false;
}

function createMetricCard(key: string, result: MetricResult | null, enabled: boolean, onToggle?: (key: string) => void): HTMLElement {
  const card = document.createElement('div');
  const status = result?.status ?? 'unknown';
  card.className = `metric-card metric-${status}${enabled ? '' : ' metric-card--disabled'}`;

  if (onToggle) {
    card.addEventListener('click', () => onToggle(key));
  }

  const label = document.createElement('div');
  label.className = 'metric-label';
  label.textContent = METRIC_LABELS[key] ?? key;

  const value = document.createElement('div');
  value.className = 'metric-value';
  value.textContent = result ? `${result.value.toFixed(1)}${result.unit}` : '—';

  const dot = document.createElement('div');
  dot.className = `metric-dot metric-dot-${status}`;

  card.appendChild(dot);
  card.appendChild(label);
  card.appendChild(value);
  return card;
}

export function renderViewSelector(
  availableViews: Array<'sagittal' | 'rear' | 'front'>,
  currentView: 'sagittal' | 'rear' | 'front' | null,
  onSelect: (v: 'sagittal' | 'rear' | 'front') => void,
  containerEl: HTMLElement,
): void {
  containerEl.innerHTML = '';
  const labels: Record<string, string> = { sagittal: 'Side', rear: 'Rear', front: 'Front' };
  for (const view of availableViews) {
    const btn = document.createElement('button');
    btn.className = `view-tab${view === currentView ? ' active' : ''}`;
    btn.textContent = labels[view] ?? view;
    btn.addEventListener('click', () => onSelect(view));
    containerEl.appendChild(btn);
  }
}

export function showAnalysisWarning(msg: string, containerEl: HTMLElement): void {
  const el = document.createElement('div');
  el.className = 'analysis-warning';
  el.textContent = msg;
  containerEl.prepend(el);
}

export function clearAnalysisWarning(containerEl: HTMLElement): void {
  containerEl.querySelector('.analysis-warning')?.remove();
}
