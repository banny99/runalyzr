import { copyBand, sameBand } from '../analysis/index';
import type { Band, ThresholdEntry, ThresholdStore } from '../analysis/index';
import {
  applyEdit, barRange, barSegments, clampForDrag, editableFields, FIELD_ORDER, fieldValue, fixedField, flipSign, fromPercent,
  parseBoundaryInput, spreadPositions, toPercent,
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

function sideLabels(direction: ThresholdEntry['direction'], row: SettingsRow): string[] {
  const low = row.lowLabel ?? 'too low';
  const high = row.highLabel ?? 'too high';
  if (direction === 'lower_is_worse') return [low, 'good'];
  if (direction === 'higher_is_worse') return ['good', high];
  return [low, 'good', high];
}

const formatValue = (v: number | null): string => (v === null ? '' : String(v));

/** `force` re-lays out the row even when its band is unchanged (resize, blur, drag end). */
interface RowView { root: HTMLElement; update(force?: boolean): void }

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
  // Read-only safe-side green edge of a one-sided entry: shown at its position, never edited.
  let fixed: { field: BandField; box: HTMLElement } | null = null;
  // What the bar and boxes were last laid out for; an unchanged row skips the layout reads.
  let rendered: { band: Band; range: [number, number] } | null = null;

  function setError(next: typeof error): void {
    if (error && error.field !== next?.field) boxes.get(error.field)?.input.classList.remove('err');
    error = next;
    if (error) boxes.get(error.field)?.input.classList.add('err');
    msg.textContent = error?.message ?? '';
  }

  function save(field: BandField, value: number | null): void {
    const band = store.band(key);
    if (!band) return;
    const entry = store.entry(key);
    if (!entry) return;
    const message = store.set(key, applyEdit(entry, band, field, value));
    setError(message ? { field, message } : null);
  }

  function onInput(field: BandField, input: HTMLInputElement): void {
    const parsed = parseBoundaryInput(input.value, field);
    if (parsed === 'incomplete') return;
    save(field, parsed);
  }

  function onDrag(field: BandField, e: PointerEvent): void {
    const band = store.band(key);
    const entry = store.entry(key);
    const rect = track.getBoundingClientRect();
    if (!band || !entry || !dragRange || rect.width <= 0) return;
    const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    // Dragging a red edge all the way to its end of the bar removes red, like clearing its box.
    const toEnd = (field === 'lowRedAt' && pct <= 0) || (field === 'highRedAt' && pct >= 100);
    const value = toEnd ? null : clampForDrag(band, field, fromPercent(pct, dragRange), editableFields(entry));
    if (value === fieldValue(band, field)) return;
    const message = store.set(key, applyEdit(entry, band, field, value));
    if (!message) setError(null);
  }

  function buildHandle(field: BandField): HTMLElement {
    const handle = el('div', 'ts-handle');
    handle.setAttribute('aria-hidden', 'true');
    handle.addEventListener('pointerdown', (e) => {
      const band = store.band(key);
      if (!band) return;
      e.preventDefault();
      overlay.focus({ preventScroll: true }); // a focused box must let go so it can follow the drag
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
      update(true);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
    return handle;
  }

  function buildBox(field: BandField): { box: HTMLElement; input: HTMLInputElement } {
    const box = el('div', signed ? 'ts-box ts-box-signed' : 'ts-box');
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
    input.addEventListener('blur', () => { if (error?.field !== field) update(true); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const all = [...overlay.querySelectorAll('input')];
      const next = all[all.indexOf(input) + 1];
      if (next) next.focus();
      else overlay.focus({ preventScroll: true });
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

  function rebuild(entry: ThresholdEntry | undefined, fields: BandField[], fixedAt: BandField | null): void {
    root.replaceChildren();
    error = null;
    handles = new Map();
    boxes = new Map();
    fixed = null;
    rendered = null;

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
    boxesEl = el('div', signed ? 'ts-boxes ts-boxes-signed' : 'ts-boxes');
    for (const field of FIELD_ORDER) {
      if (field === fixedAt) {
        fixed = { field, box: el('div', 'ts-box ts-fixed') };
        boxesEl.appendChild(fixed.box);
        continue;
      }
      if (!fields.includes(field)) continue;
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

  function update(force = false): void {
    const entry = store.entry(key);
    const band = store.band(key);
    const fields = entry && band ? editableFields(entry) : [];
    const fixedAt = entry && band ? fixedField(entry) : null;
    const nextShape = entry ? `${fields.join(',')}|${fixedAt ?? ''}` : 'missing';
    if (nextShape !== shape) {
      shape = nextShape;
      rebuild(entry, fields, fixedAt);
    }
    const changed = store.isChanged(key);
    changedEl.textContent = changed ? '● changed' : '';
    resetBtn.disabled = !changed;
    removeBtn.hidden = !(band !== null && store.defaultBand(key) === null);
    if (!entry || !band) return;

    const range = dragRange ?? barRange(band, signed);
    // Every store change reaches every row of that store; only rows whose band moved need laying out.
    // A shown error still re-runs so a reset can clear it.
    if (!force && !error && rendered && sameBand(rendered.band, band)
      && rendered.range[0] === range[0] && rendered.range[1] === range[1]) return;
    rendered = { band: copyBand(band), range };

    bar.replaceChildren(...barSegments(entry.direction, band, range).map(([colour, from, to]) => {
      const seg = el('div', `ts-seg ts-${colour}`);
      const left = toPercent(from, range);
      seg.style.left = `${left}%`;
      seg.style.width = `${toPercent(to, range) - left}%`;
      return seg;
    }));

    // Every box on the row, editable or read-only, low to high — they share the spreading below.
    const placedBoxes: HTMLElement[] = [];
    const pcts: number[] = [];
    for (const field of FIELD_ORDER) {
      const value = fieldValue(band, field);
      const pct = value === null ? (field === 'lowRedAt' ? 0 : 100) : toPercent(value, range);
      if (fixed?.field === field) {
        fixed.box.textContent = formatValue(value);
        placedBoxes.push(fixed.box);
        pcts.push(pct);
        continue;
      }
      if (!fields.includes(field)) continue;
      pcts.push(pct);
      const handle = handles.get(field);
      if (handle) handle.style.left = `${pct}%`;
      const b = boxes.get(field);
      // Never touch the box being typed in: it keeps its caret and half-typed text.
      if (b && b.input !== document.activeElement) {
        b.input.value = formatValue(value);
        if (error?.field === field) setError(null);
      }
      if (b) placedBoxes.push(b.box);
    }

    const width = boxesEl.clientWidth;
    let boxWidth = 0;
    for (const box of placedBoxes) if (box.offsetWidth > boxWidth) boxWidth = box.offsetWidth;
    const placed = width > 0 && boxWidth > 0
      ? spreadPositions(pcts, ((boxWidth + 4) / width) * 100, (boxWidth / 2 / width) * 100, 100 - (boxWidth / 2 / width) * 100)
      : pcts;
    placedBoxes.forEach((box, i) => { box.style.left = `${placed[i]}%`; });
  }

  update(true);
  return { root, update };
}

/** Fullscreen threshold editor appended to `document.body`; owns its DOM entirely. */
export function openThresholdSettings(sections: SettingsSection[], opts: { title?: string } = {}): { close(): void } {
  injectStyle();
  const title = opts.title ?? 'Threshold settings';

  // Focus goes back here on close (normally the settings button that opened the overlay).
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = el('div', 'ts-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  overlay.tabIndex = -1;

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
  for (const view of allViews) view.update(true);
  overlay.focus({ preventScroll: true });

  const unsubscribes = [...viewsByStore].map(([store, views]) =>
    store.subscribe(() => { for (const v of views) v.update(); }));

  resetAll.addEventListener('click', () => { for (const store of viewsByStore.keys()) store.resetAll(); });

  const onResize = (): void => { for (const v of allViews) v.update(true); };
  window.addEventListener('resize', onResize);
  let closed = false;
  // Modal: keys pressed here must not reach the app's own shortcuts (e.g. Space toggling the video underneath).
  overlay.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'Tab') trapTab(e);
  });
  overlay.addEventListener('keyup', (e) => e.stopPropagation());
  // Keep focus inside the overlay so keys keep landing here after a box loses focus.
  overlay.addEventListener('focusout', (e) => {
    if (!closed && e.relatedTarget === null) overlay.focus({ preventScroll: true });
  });

  /** Tab / Shift+Tab wrap at the ends instead of leaving for the page underneath. */
  function trapTab(e: KeyboardEvent): void {
    const focusable = [...overlay.querySelectorAll<HTMLElement>('button, input')]
      .filter((node) => !(node instanceof HTMLButtonElement && node.disabled) && !node.closest('[hidden]'));
    if (focusable.length === 0) { e.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const target = e.shiftKey
      ? (active === first || active === overlay ? last : null)
      : (active === last ? first : null);
    if (!target) return;
    e.preventDefault();
    target.focus();
  }

  function close(): void {
    if (closed) return;
    closed = true;
    for (const unsubscribe of unsubscribes) unsubscribe();
    window.removeEventListener('resize', onResize);
    overlay.remove();
    document.body.style.overflow = prevBodyOverflow;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
  back.addEventListener('click', close);

  return { close };
}
