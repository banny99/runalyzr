// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest';
import { createThresholdStore, noBand } from '../analysis/index';
import type { ThresholdEntry } from '../analysis/index';
import { openThresholdSettings } from './screen';
import type { SettingsSection } from './screen';

const DEFAULTS = {
  knee: { green: [145, 155], amber: [135, 145], amberHigh: [155, 160], unit: '°', direction: 'two_sided' },
  hip: { green: [40, 50], amber: [30, 40], amberHigh: [50, 60], unit: '°', direction: 'two_sided' },
  cadence: { green: [80, 100], amber: [70, 80], unit: ' rpm', direction: 'lower_is_worse' },
  drop: { green: [0, 5], amber: [5, 7], unit: '°', direction: 'higher_is_worse' },
  info: noBand('°', [80, 100]),
} satisfies Record<string, ThresholdEntry>;

type Key = keyof typeof DEFAULTS;

function makeStore() {
  return createThresholdStore<Key>('test-thresholds', DEFAULTS, null);
}

let screen: { close(): void } | null = null;
afterEach(() => {
  screen?.close();
  screen = null;
});

function open(sections: SettingsSection[]) {
  screen = openThresholdSettings(sections);
}

function row(key: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-key="${key}"]`);
  if (!el) throw new Error(`row ${key} not rendered`);
  return el;
}

function input(key: string, field: string): HTMLInputElement {
  const el = row(key).querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
  if (!el) throw new Error(`input ${key}.${field} not rendered`);
  return el;
}

function type(el: HTMLInputElement, text: string): void {
  el.focus();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function button(scope: ParentNode, text: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  if (!found) throw new Error(`button "${text}" not found`);
  return found;
}

describe('threshold settings screen', () => {
  test('typing a valid value saves; an out-of-order value shows the message and does not save', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee extension' }] }]);
    const before = store.band('knee');

    type(input('knee', 'lowRedAt'), '150');
    expect(store.band('knee')).toEqual(before);
    expect(input('knee', 'lowRedAt').classList.contains('err')).toBe(true);
    expect(row('knee').textContent).toContain('Amber must start below green (150 is above the green start of 145).');

    type(input('knee', 'lowRedAt'), '130');
    expect(store.band('knee')?.lowRedAt).toBe(130);
    expect(row('knee').querySelector('.err')).toBeNull();
    expect(row('knee').textContent).not.toContain('Amber must start below green');
  });

  test('clearing a red box removes red', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee extension' }] }]);
    type(input('knee', 'lowRedAt'), '');
    expect(store.band('knee')?.lowRedAt).toBeNull();
    expect(input('knee', 'lowRedAt').placeholder).toBe('no red');
  });

  test('half-typed "-" neither saves nor shows an error', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee extension' }] }]);
    const before = store.band('knee');
    type(input('knee', 'green0'), '-');
    expect(store.band('knee')).toEqual(before);
    expect(row('knee').querySelector('.err')).toBeNull();
    expect(input('knee', 'green0').value).toBe('-');
  });

  test('Add band turns an information-only row into a bar; Remove band reverts', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'info', label: 'Shoulder angle' }] }]);
    expect(row('info').textContent).toContain('information only');
    expect(row('info').querySelectorAll('input')).toHaveLength(0);

    button(row('info'), 'Add band').click();
    expect(store.band('info')).not.toBeNull();
    expect(row('info').querySelectorAll('input')).toHaveLength(4);
    expect(row('info').querySelector('.ts-bar')).not.toBeNull();

    button(row('info'), 'Remove band').click();
    expect(store.band('info')).toBeNull();
    expect(row('info').textContent).toContain('information only');
    expect(row('info').querySelectorAll('input')).toHaveLength(0);
  });

  test('Reset all resets every store passed in', () => {
    const a = makeStore();
    const b = makeStore();
    a.set('knee', { green: [140, 155], lowRedAt: 130, highRedAt: 160 });
    b.addBand('info');
    open([
      { title: 'A', store: a, rows: [{ key: 'knee', label: 'Knee' }] },
      { title: 'B', store: b, rows: [{ key: 'info', label: 'Info' }] },
    ]);
    expect(row('knee').textContent).toContain('● changed');

    button(document, 'Reset all').click();
    expect(a.isChanged('knee')).toBe(false);
    expect(b.isChanged('info')).toBe(false);
    expect(row('knee').textContent).not.toContain('● changed');
    expect(input('knee', 'green0').value).toBe('145');
  });

  test('a store change never replaces the box being typed in', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee' }] }]);
    const box = input('knee', 'green0');
    type(box, '140.');
    expect(store.band('knee')?.green[0]).toBe(140);
    expect(input('knee', 'green0')).toBe(box);
    expect(box.value).toBe('140.');
    box.blur();
    expect(box.value).toBe('140');
  });

  test('± flips the sign of its box and saves', () => {
    const store = makeStore();
    store.addBand('info');
    open([{ title: 'Ride', store, rows: [{ key: 'info', label: 'Tilt', signed: true }] }]);
    const box = input('info', 'green0');
    box.focus();
    button(box.parentElement ?? document, '±').click();
    expect(store.band('info')?.green[0]).toBe(-80);
  });

  test('↺ default resets one row and shows the changed marker only while changed', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee', covers: "6, 3 & 9 o'clock" }] }]);
    expect(row('knee').textContent).toContain("6, 3 & 9 o'clock");
    expect(row('knee').textContent).not.toContain('● changed');
    type(input('knee', 'highRedAt'), '170');
    expect(row('knee').textContent).toContain('● changed');
    button(row('knee'), '↺ default').click();
    expect(store.isChanged('knee')).toBe(false);
    expect(row('knee').textContent).not.toContain('● changed');
  });

  test('side labels default per direction and can be overridden', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee', lowLabel: 'too bent' }] }]);
    const labels = [...row('knee').querySelectorAll('.ts-legend span')].map((s) => s.textContent);
    expect(labels).toEqual(['too bent', 'good', 'too high']);
  });

  test('back button and Escape close the overlay; the stylesheet is injected once', () => {
    const store = makeStore();
    const rows = [{ key: 'knee', label: 'Knee' }];
    const first = openThresholdSettings([{ title: 'Ride', store, rows }]);
    button(document, '← Threshold settings').click();
    expect(document.querySelector('.ts-overlay')).toBeNull();
    first.close(); // idempotent

    open([{ title: 'Ride', store, rows }]);
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.ts-overlay')).toBeNull();
    expect(document.querySelectorAll('#threshold-settings-style')).toHaveLength(1);
  });

  test('keys pressed in the overlay never reach the app underneath; Escape still closes', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee' }] }]);
    const overlay = document.querySelector<HTMLElement>('.ts-overlay');
    expect(document.activeElement).toBe(overlay);
    const seen: string[] = [];
    const appShortcut = (e: KeyboardEvent) => { seen.push(e.key); };
    document.addEventListener('keydown', appShortcut);
    try {
      const resetAll = button(document, 'Reset all');
      resetAll.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      input('knee', 'green0').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(seen).toEqual([]);
      // A box losing focus hands it back to the overlay, not to the page underneath.
      input('knee', 'green0').focus();
      input('knee', 'green0').blur();
      expect(document.activeElement).toBe(overlay);
      resetAll.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.querySelector('.ts-overlay')).toBeNull();
      expect(seen).toEqual([]);
    } finally {
      document.removeEventListener('keydown', appShortcut);
    }
  });

  test('dragging a handle saves the clamped value and updates its box', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee' }] }]);
    // Bar range for 135/145/155/160 is [122.5, 172.5]; give the track a 500 px width.
    const track = row('knee').querySelector<HTMLElement>('.ts-track');
    if (!track) throw new Error('no track');
    track.getBoundingClientRect = () => new DOMRect(0, 0, 500, 16);
    const handle = row('knee').querySelectorAll<HTMLElement>('.ts-handle')[0];
    handle.setPointerCapture = () => {};
    const pointer = (type: string, clientX: number) =>
      handle.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX }));

    pointer('pointerdown', 50);
    pointer('pointermove', 50); // 10 % → 127.5
    expect(store.band('knee')?.lowRedAt).toBe(127.5);
    expect(input('knee', 'lowRedAt').value).toBe('127.5');
    pointer('pointermove', 400); // past green start → clamped to 145
    expect(store.band('knee')?.lowRedAt).toBe(145);
    pointer('pointermove', 0); // bar end → no red
    expect(store.band('knee')?.lowRedAt).toBeNull();
    pointer('pointerup', 0);
  });

  test('inputs use the decimal keypad', () => {
    const store = makeStore();
    store.addBand('info');
    open([{
      title: 'Ride', store,
      rows: [{ key: 'knee', label: 'Knee' }, { key: 'info', label: 'Info', signed: true }],
    }]);
    const inputs = [...document.querySelectorAll<HTMLInputElement>('.ts-overlay input')];
    expect(inputs.length).toBe(8);
    for (const el of inputs) {
      expect(el.type).toBe('text');
      expect(el.inputMode).toBe('decimal');
    }
  });

  test('one-sided rows edit only the edges that change a status; the safe green edge is a read-only label', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'cadence', label: 'Cadence' }, { key: 'drop', label: 'Pelvic drop' }] }]);
    const fields = (key: string) => [...row(key).querySelectorAll<HTMLInputElement>('input')].map((i) => i.dataset.field);
    const fixed = (key: string) => row(key).querySelector<HTMLElement>('.ts-fixed');

    expect(fields('cadence')).toEqual(['lowRedAt', 'green0']);
    expect(row('cadence').querySelectorAll('.ts-handle')).toHaveLength(2);
    expect(fixed('cadence')?.textContent).toBe('100');
    expect(fixed('cadence')?.querySelector('input, button')).toBeNull();

    expect(fields('drop')).toEqual(['green1', 'highRedAt']);
    expect(row('drop').querySelectorAll('.ts-handle')).toHaveLength(2);
    expect(fixed('drop')?.textContent).toBe('0');

    // Moving green past the read-only edge carries it along instead of failing validation.
    type(input('cadence', 'green0'), '105');
    expect(store.band('cadence')?.green).toEqual([105, 125]);
    expect(row('cadence').querySelector('.err')).toBeNull();
    expect(fixed('cadence')?.textContent).toBe('125');
  });

  test('two-sided rows have no read-only label', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee' }] }]);
    expect(row('knee').querySelector('.ts-fixed')).toBeNull();
    expect(row('knee').querySelectorAll('input')).toHaveLength(4);
  });

  test('a store change does not re-measure rows whose band did not change', () => {
    const store = makeStore();
    open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee' }, { key: 'hip', label: 'Hip' }] }]);
    let reads = 0;
    const spy = (node: HTMLElement, prop: 'offsetWidth' | 'clientWidth') =>
      Object.defineProperty(node, prop, { configurable: true, get() { reads++; return 0; } });
    const watch = (key: string) => {
      const boxes = row(key).querySelector<HTMLElement>('.ts-boxes');
      if (!boxes) throw new Error('no boxes');
      spy(boxes, 'clientWidth');
      for (const box of row(key).querySelectorAll<HTMLElement>('.ts-box')) spy(box, 'offsetWidth');
    };
    watch('hip');
    type(input('knee', 'green0'), '140');
    expect(store.band('knee')?.green[0]).toBe(140);
    expect(reads).toBe(0);

    watch('knee');
    type(input('knee', 'green0'), '141');
    expect(reads).toBeGreaterThan(0);
  });

  test('closing returns focus to the element focused before opening', () => {
    const opener = document.createElement('button');
    opener.textContent = 'settings';
    document.body.appendChild(opener);
    try {
      opener.focus();
      const store = makeStore();
      open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee' }] }]);
      expect(document.activeElement).toBe(document.querySelector('.ts-overlay'));
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.querySelector('.ts-overlay')).toBeNull();
      expect(document.activeElement).toBe(opener);
    } finally {
      opener.remove();
    }
  });

  test('Tab and Shift+Tab wrap around inside the overlay', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      const store = makeStore();
      open([{ title: 'Ride', store, rows: [{ key: 'knee', label: 'Knee' }] }]);
      const overlay = document.querySelector<HTMLElement>('.ts-overlay');
      if (!overlay) throw new Error('no overlay');
      const tab = (shiftKey: boolean) => {
        const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
        document.activeElement?.dispatchEvent(e);
        return e.defaultPrevented;
      };
      const first = button(overlay, '← Threshold settings');
      const last = input('knee', 'highRedAt');

      last.focus();
      expect(tab(false)).toBe(true);
      expect(document.activeElement).toBe(first);

      expect(tab(true)).toBe(true);
      expect(document.activeElement).toBe(last);

      overlay.focus();
      expect(tab(true)).toBe(true);
      expect(document.activeElement).toBe(last);

      // In the middle, the browser moves focus as usual.
      input('knee', 'green0').focus();
      expect(tab(false)).toBe(false);
    } finally {
      outside.remove();
    }
  });
});
