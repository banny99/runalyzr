/** Stylesheet for the threshold settings overlay. Only the status colours are fixed; the rest inherits from the app. */
export const SETTINGS_CSS = `
.ts-overlay {
  position: fixed; inset: 0; z-index: 1000;
  overflow-y: auto; overscroll-behavior: contain;
  background: var(--bg, Canvas); color: var(--text, CanvasText);
}
.ts-overlay:focus { outline: none; }
.ts-overlay button {
  font: inherit; color: inherit; background: none; cursor: pointer;
  border: 1px solid #8886; border-radius: 6px; padding: 4px 10px; min-height: 36px;
}
.ts-overlay button:disabled { opacity: .4; cursor: default; }
.ts-header {
  position: sticky; top: 0; z-index: 2;
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: max(8px, env(safe-area-inset-top)) 12px 8px;
  border-bottom: 1px solid #8884; background: var(--bg, Canvas);
}
.ts-overlay .ts-back { border: none; font-weight: 600; padding-left: 0; }
.ts-content {
  max-width: 720px; margin: 0 auto;
  /* 22 px sides: the end handles' 44 px hit areas overhang the bar by half their width. */
  padding: 0 22px max(48px, env(safe-area-inset-bottom));
}
.ts-group {
  margin: 20px 0 4px; font-size: 12px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .05em; opacity: .6;
}
.ts-row { padding: 12px 0; border-bottom: 1px solid #8882; }
.ts-name { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; font-weight: 600; }
.ts-name > span { min-width: 0; overflow-wrap: anywhere; }
.ts-name small, .ts-covers { font-weight: 400; opacity: .6; }
.ts-changed { margin-left: 6px; font-size: 11px; font-weight: 400; color: #f59e0b; }
.ts-actions { display: flex; gap: 6px; flex-shrink: 0; }
.ts-actions button[hidden] { display: none; }
.ts-info { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; }
.ts-info > span { opacity: .65; }
.ts-track { position: relative; height: 16px; margin-top: 16px; }
.ts-bar { position: absolute; inset: 0; overflow: hidden; border-radius: 8px; background: #8883; }
.ts-seg { position: absolute; top: 0; bottom: 0; }
.ts-red { background: #ef4444; }
.ts-amber { background: #f59e0b; }
.ts-green { background: #22c55e; }
.ts-handle {
  position: absolute; top: 50%; z-index: 1;
  width: 44px; height: 44px; margin: -22px 0 0 -22px;
  touch-action: none; cursor: ew-resize;
}
.ts-handle::before {
  content: ''; position: absolute; left: 19px; top: 10px; box-sizing: border-box;
  width: 6px; height: 24px; border-radius: 3px; background: #fff; border: 1px solid #555;
}
.ts-handle.ts-dragging::before { outline: 2px solid currentColor; }
.ts-boxes { position: relative; height: 34px; margin-top: 16px; }
.ts-box { position: absolute; top: 0; display: flex; gap: 2px; transform: translateX(-50%); }
.ts-box input {
  box-sizing: border-box; width: 60px; height: 34px; padding: 4px;
  font: inherit; font-size: 16px; text-align: center;
  color: inherit; background: transparent; border: 1px solid #8886; border-radius: 4px;
}
.ts-box input.err { border-color: #ef4444; background: #ef444422; }
/* Signed rows stack ± under its box so four boxes still fit a 320 px phone. */
.ts-boxes-signed { height: 70px; }
.ts-box-signed { flex-direction: column; }
.ts-overlay .ts-sign { width: 60px; min-height: 34px; padding: 0; }
.ts-legend { display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; opacity: .65; }
.ts-msg { margin-top: 4px; font-size: 12px; color: #ef4444; }
.ts-msg:empty { display: none; }
@media (pointer: coarse) {
  .ts-overlay button { min-height: 44px; }
  .ts-boxes { height: 44px; }
  .ts-box input { height: 44px; }
  .ts-boxes-signed { height: 90px; }
  .ts-overlay .ts-sign { min-height: 44px; }
}
`;
