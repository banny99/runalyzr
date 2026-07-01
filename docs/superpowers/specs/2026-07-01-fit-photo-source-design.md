# Fit photo source — two-button capture/upload

## Problem

In bike **fitting mode**, the single "Take / Upload Photo" button (`#fit-upload-btn`)
opens only a file input (`accept="image/*"`, no explicit source split). On the
reporter's device this surfaces the camera and offers no way to upload an existing
photo. Bike **ride mode** already solves this with two explicit buttons — "Upload
Video" + "Use Camera" — that work reliably. Fitting mode should follow the same
two-button pattern, and the picker wiring should be a reusable unit rather than
inlined per call site.

## Decision

Use **native OS capture** (a hidden file input with `capture="environment"`) for
the camera path — no `getUserMedia`. Deterministic and cross-platform; on desktop
`capture` is ignored and falls back to a file picker, which is fine because desktop
users upload anyway.

## Components

### `bike/src/ui/photoSource.ts` (new, reusable)

Owns the "pick a photo from camera or files" wiring.

```ts
export interface PhotoSourceElements {
  uploadBtn: HTMLButtonElement;
  cameraBtn: HTMLButtonElement;
  uploadInput: HTMLInputElement;   // accept="image/*"
  captureInput: HTMLInputElement;  // accept="image/*" capture="environment"
}
export function createPhotoSource(
  els: PhotoSourceElements,
  onFile: (file: File) => void,
): { openUpload(): void; openCamera(): void };
```

Behavior:
- `uploadBtn` click → `uploadInput.click()`; `cameraBtn` click → `captureInput.click()`.
- Either input's `change` → `onFile(file)` for the selected file, then reset that
  input's `value` (so re-picking the same file re-fires `change`).
- Returns `openUpload()` / `openCamera()` so nav buttons can trigger a source
  programmatically.

### `bike/index.html` — `#fit-upload-area`

Replace the single input+button with two inputs and two buttons (mirrors ride mode):

```html
<input type="file" id="fit-file-input"    accept="image/*" hidden />
<input type="file" id="fit-capture-input" accept="image/*" capture="environment" hidden />
<button id="fit-upload-btn" class="primary-btn">Upload Photo</button>
<button id="fit-camera-btn" class="primary-btn">Take Photo</button>
```

### `bike/src/ui/fitGuide.ts`

- Extend the `elements` interface: add `captureInput: HTMLInputElement` and
  `cameraBtn: HTMLButtonElement`.
- Replace the inline `change` / `uploadBtn` / `retakeBtn` / `newPhotoBtn` wiring
  with a single `createPhotoSource(...)` call. The existing `change` logic (dispatch
  to `processBikePhoto` vs `processRiderPhoto` by `step.kind`) moves verbatim into
  `onFile`.
- Nav buttons:
  - Rider **Retake** → `openCamera()` (re-shoot).
  - **New photo** → `openUpload()` (swap in a different image).
  - Bike-step **Retake** → `editBikePoints(step)` (unchanged).

### `bike/src/main.ts`

Pass the two new elements (`fit-capture-input`, `fit-camera-btn`) into
`initFitGuide`.

## Testing

- `bike/src/ui/photoSource.test.ts` (jsdom, matching `placementSequence.test.ts`
  style): button→input `.click()` delegation, `onFile` fires with the selected file,
  input `value` resets after change, `openUpload`/`openCamera` delegate correctly.
- Manual: on a phone, confirm "Upload Photo" opens files/gallery and "Take Photo"
  opens the camera, for both rider and bike steps.

## Out of scope

- No `getUserMedia` still-capture overlay.
- No change to ride mode.
- No shared-package extraction (only bike consumes still photos today — YAGNI).
