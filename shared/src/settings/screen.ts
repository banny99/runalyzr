import type { Band, ThresholdEntry, ThresholdStore } from '../analysis/index';
import {
  applyField, barRange, clampForDrag, editableFields, fieldValue, flipSign, fromPercent, parseBoundaryInput, toPercent,
} from './rowModel';
import type { BandField } from './rowModel';
import { SETTINGS_CSS } from './screenStyles';

export interface SettingsRow {
  key: string;
  label: string;
  /** Which positions/views the setting affects, e.g. "6, 3 & 9 o'clock". */
  covers?: string;
  /** Band can be negative: adds a ± button beside each box (iOS decimal keypads have no minus). */
  signed?: boolean;
  lowLabel?: string;
  highLabel?: string;
}

export interface SettingsSection {
  title: string;
  store: ThresholdStore<string>;
  rows: SettingsRow[];
}

const STYLE_ID = 'threshold-settings-style';

const FIELD_NAMES: Record<BandField, string> = {
  lowRedAt: 'red below', green0: 'green from', green1: 'green to', highRedAt: 'red above',
};

type SegmentColour = 'red' | 'amber' | 'green';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = el('style');
  style.id = STYLE_ID;
  style.textContent = SETTINGS_CSS;
  document.head.appendChild(style);
}

/** Coloured spans of the bar, low to high, in metric units. */
function segments(direction: ThresholdEntry['direction'], band: Band, range: [number, number]): [SegmentColour, number, number][] {
  const [lo, hi] = range;
  const [g0, g1] = band.green;
  const out: [SegmentColour, number, number][] = [];
  if (direction === 'higher_is_worse') {
    out.push(['green', lo, g0]);
  } else {
    if (band.lowRedAt !== null) out.push(['red', lo, band.lowRedAt]);
    out.push(['amber', band.lowRedAt ?? lo, g0]);
  }
  out.push(['green', g0, g1]);
  if (direction === 'lower_is_worse') {
    out.push(['green', g1, hi]);
  } else {
    out.push(['amber', g1, band.highRedAt ?? hi]);
    if (band.highRedAt !== null) out.push(['red', band.highRedAt, hi]);
  }
  return out;
}

/** Push box centres (percent, ascending) apart so neighbours never overlap, keeping them on the bar. */
function spreadPositions(pcts: number[], gap: number, min: number, max: number): number[] {
  const out = [...pcts];
  for (let i = 0; i < out.length; i++) {
    const floor = i === 0 ? min : out[i - 1] + gap;
    if (out[i] < floor) out[i] = floor;
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const ceil = i === out.length - 1 ? max : out[i + 1] - gap;
    if (out[i] > ceil) out[i] = ceil;
  }
  return out;
}

function sideLabels(direction: ThresholdEntry['direction'], row: SettingsRow): string[] {
  const low = row.lowLabel ?? 'too low';
  const high = row.highLabel ?? 'too high';
  if (direction === 'lower_is_worse') return [low, 'good'];
  if (direction === 'higher_is_worse') return ['good', high];
  return [low, 'good', high];
}

const formatValue = (v: number | null): string => (v === null ? '' : String(v));

interface RowView { root: HTMLElement; update(): void }

function createRow(store: ThresholdStore<string>, row: SettingsRow, overlay: HTMLElement): RowView {
  const { key, signed = false } = row;
  const root = el('div', 'ts-row');
  root.dataset.key = key;

  let shape: string | null = null;
  let dragField: BandField | null = null;
  let dragRange: [number, number] | null = null;
  let error: { field: BandField; message: string } | null = null;

  // Rebuilt whenever the row's shape (its editable fields) changes.
  let changedEl = el('span');
  let resetBtn = button('', '');
  let removeBtn = button('', '');
  let track = el('div');
  let bar = el('div');
  let boxesEl = el('div');
  let legend = el('div');
  let msg = el('div');
  let handles = new Map<BandField, HTMLElement>();
  let boxes = new Map<BandField, { box: HTMLElement; input: HTMLInputElement }>();

  function setError(next: typeof error): void {
    if (error && error.field !== next?.field) boxes.get(error.field)?.input.classList.remove('err');
    error = next;
    if (error) boxes.get(error.field)?.input.classList.add('err');
    msg.textContent = error?.message ?? '';
  }

  function save(field: BandField, value: number | null): void {
    const band = store.band(key);
    if (!band) return;
    const message = store.set(key, applyField(band, field, value));
    setError(message ? { field, message } : null);
  }

  function onInput(field: BandField, input: HTMLInputElement): void {
    const parsed = parseBoundaryInput(input.value, field);
    if (parsed === 'incomplete') return;
    save(field, parsed);
  }

  function onDrag(field: BandField, e: PointerEvent): void {
    const band = store.band(key);
    const rect = track.getBoundingClientRect();
    if (!band || !dragRange || rect.width <= 0) return;
    const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    // Dragging a red edge all the way to its end of the bar removes red, like clearing its box.
    const toEnd = (field === 'lowRedAt' && pct <= 0) || (field === 'highRedAt' && pct >= 100);
    const value = toEnd ? null : clampForDrag(band, field, fromPercent(pct, dragRange));
    if (value === fieldValue(band, field)) return;
    const message = store.set(key, applyField(band, field, value));
    if (!message) setError(null);
  }

  function buildHandle(field: BandField): HTMLElement {
    const handle = el('div', 'ts-handle');
    handle.setAttribute('aria-hidden', 'true');
    handle.addEventListener('pointerdown', (e) => {
      const band = store.band(key);
      if (!band) return;
      e.preventDefault();
      const active = document.activeElement;
      if (active instanceof HTMLElement && overlay.contains(active)) active.blur();
      handle.setPointerCapture(e.pointerId);
      dragField = field;
      dragRange = barRange(band, signed);
      handle.classList.add('ts-dragging');
    });
    handle.addEventListener('pointermove', (e) => { if (dragField === field) onDrag(field, e); });
    const end = (): void => {
      if (dragField !== field) return;
      dragField = null;
      dragRange = null;
      handle.classList.remove('ts-dragging');
      update();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
    return handle;
  }

  function buildBox(field: BandField): { box: HTMLElement; input: HTMLInputElement } {
    const box = el('div', 'ts-box');
    const input = el('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.setAttribute('enterkeyhint', 'next');
    input.autocomplete = 'off';
    input.dataset.field = field;
    input.setAttribute('aria-label', `${row.label}: ${FIELD_NAMES[field]}`);
    if (field === 'lowRedAt' || field === 'highRedAt') input.placeholder = 'no red';
    input.addEventListener('input', () => onInput(field, input));
    input.addEventListener('focus', () => {
      if (typeof input.scrollIntoView === 'function') input.scrollIntoView({ block: 'center' });
    });
    // Leaving a half-typed box shows the saved value again; an invalid one stays visible until fixed.
    input.addEventListener('blur', () => { if (error?.field !== field) update(); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const all = [...overlay.querySelectorAll('input')];
      const next = all[all.indexOf(input) + 1];
      if (next) next.focus();
      else input.blur();
    });
    box.appendChild(input);
    if (signed) {
      const sign = button('ts-sign', '±');
      sign.setAttribute('aria-label', `${row.label}: flip sign of ${FIELD_NAMES[field]}`);
      sign.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the keypad open
      sign.addEventListener('click', () => {
        input.value = flipSign(input.value);
        onInput(field, input);
      });
      box.appendChild(sign);
    }
    return { box, input };
  }

  function rebuild(entry: ThresholdEntry | undefined, fields: BandField[]): void {
    root.replaceChildren();
    error = null;
    handles = new Map();
    boxes = new Map();

    const name = el('div', 'ts-name');
    const title = el('span', '', row.label);
    const unit = entry?.unit.trim();
    if (unit) title.append(' ', el('small', '', unit));
    if (row.covers) title.append(' ', el('span', 'ts-covers', `· ${row.covers}`));
    changedEl = el('span', 'ts-changed');
    title.appendChild(changedEl);
    const actions = el('div', 'ts-actions');
    removeBtn = button('ts-remove', 'Remove band');
    removeBtn.addEventListener('click', () => { store.set(key, null); });
    resetBtn = button('ts-reset', '↺ default');
    resetBtn.addEventListener('click', () => store.reset(key));
    actions.append(removeBtn, resetBtn);
    name.append(title, actions);
    root.appendChild(name);

    msg = el('div', 'ts-msg');
    if (!entry || fields.length === 0) {
      const info = el('div', 'ts-info');
      info.appendChild(el('span', '', 'information only'));
      if (entry) {
        const add = button('ts-add', 'Add band');
        add.addEventListener('click', () => store.addBand(key));
        info.appendChild(add);
      }
      root.append(info, msg);
      return;
    }

    track = el('div', 'ts-track');
    bar = el('div', 'ts-bar');
    track.appendChild(bar);
    boxesEl = el('div', 'ts-boxes');
    for (const field of fields) {
      const handle = buildHandle(field);
      handles.set(field, handle);
      track.appendChild(handle);
      const b = buildBox(field);
      boxes.set(field, b);
      boxesEl.appendChild(b.box);
    }
    legend = el('div', 'ts-legend');
    for (const text of sideLabels(entry.direction, row)) legend.appendChild(el('span', '', text));
    root.append(track, boxesEl, legend, msg);
  }

  function update(): void {
    const entry = store.entry(key);
    const band = store.band(key);
    const fields = entry && band ? editableFields(entry) : [];
    const nextShape = entry ? fields.join(',') : 'missing';
    if (nextShape !== shape) {
      shape = nextShape;
      rebuild(entry, fields);
    }
    const changed = store.isChanged(key);
    changedEl.textContent = changed ? '● changed' : '';
    resetBtn.disabled = !changed;
    removeBtn.hidden = !(band !== null && store.defaultBand(key) === null);
    if (!entry || !band) return;

    const range = dragRange ?? barRange(band, signed);
    bar.replaceChildren(...segments(entry.direction, band, range).map(([colour, from, to]) => {
      const seg = el('div', `ts-seg ts-${colour}`);
      const left = toPercent(from, range);
      seg.style.left = `${left}%`;
      seg.style.width = `${toPercent(to, range) - left}%`;
      return seg;
    }));

    const pcts: number[] = [];
    for (const field of fields) {
      const value = fieldValue(band, field);
      const pct = value === null ? (field === 'lowRedAt' ? 0 : 100) : toPercent(value, range);
      pcts.push(pct);
      const handle = handles.get(field);
      if (handle) handle.style.left = `${pct}%`;
      const b = boxes.get(field);
      // Never touch the box being typed in: it keeps its caret and half-typed text.
      if (b && b.input !== document.activeElement) {
        b.input.value = formatValue(value);
        if (error?.field === field) setError(null);
      }
    }

    const width = boxesEl.clientWidth;
    let boxWidth = 0;
    for (const { box } of boxes.values()) if (box.offsetWidth > boxWidth) boxWidth = box.offsetWidth;
    const placed = width > 0 && boxWidth > 0
      ? spreadPositions(pcts, ((boxWidth + 4) / width) * 100, (boxWidth / 2 / width) * 100, 100 - (boxWidth / 2 / width) * 100)
      : pcts;
    fields.forEach((field, i) => {
      const b = boxes.get(field);
      if (b) b.box.style.left = `${placed[i]}%`;
    });
  }

  update();
  return { root, update };
}

/** Fullscreen threshold editor appended to `document.body`; owns its DOM entirely. */
export function openThresholdSettings(sections: SettingsSection[], opts: { title?: string } = {}): { close(): void } {
  injectStyle();
  const title = opts.title ?? 'Threshold settings';

  const overlay = el('div', 'ts-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  const header = el('div', 'ts-header');
  const back = button('ts-back', `← ${title}`);
  const resetAll = button('ts-reset-all', 'Reset all');
  header.append(back, resetAll);
  const content = el('div', 'ts-content');
  overlay.append(header, content);
  document.body.appendChild(overlay);

  const prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const viewsByStore = new Map<ThresholdStore<string>, RowView[]>();
  const allViews: RowView[] = [];
  for (const section of sections) {
    content.appendChild(el('h2', 'ts-group', section.title));
    const views = viewsByStore.get(section.store) ?? [];
    viewsByStore.set(section.store, views);
    for (const row of section.rows) {
      const view = createRow(section.store, row, overlay);
      content.appendChild(view.root);
      views.push(view);
      allViews.push(view);
    }
  }
  // Rows were first laid out off-document; place them again now the bar has a width.
  for (const view of allViews) view.update();

  const unsubscribes = [...viewsByStore].map(([store, views]) =>
    store.subscribe(() => { for (const v of views) v.update(); }));

  resetAll.addEventListener('click', () => { for (const store of viewsByStore.keys()) store.resetAll(); });

  const onResize = (): void => { for (const v of allViews) v.update(); };
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKey);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    for (const unsubscribe of unsubscribes) unsubscribe();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    document.body.style.overflow = prevBodyOverflow;
  }
  back.addEventListener('click', close);

  return { close };
}
