// Two-source photo picker: an "Upload" button that opens files/gallery and a
// "Take Photo" button that opens the device camera via a native capture input.
// Wiring lives here so call sites don't re-implement the button→input→onFile
// dance. Ride mode uses the same two-button idea for video; this is its still-
// photo sibling.

export interface PhotoSourceElements {
  /** Opens files/gallery. */
  uploadBtn: HTMLButtonElement;
  /** Opens the device camera. */
  cameraBtn: HTMLButtonElement;
  /** accept="image/*" — no capture attribute. */
  uploadInput: HTMLInputElement;
  /** accept="image/*" capture="environment". */
  captureInput: HTMLInputElement;
}

export interface PhotoSource {
  /** Programmatically open the files/gallery picker. */
  openUpload(): void;
  /** Programmatically open the camera. */
  openCamera(): void;
}

export function createPhotoSource(
  els: PhotoSourceElements,
  onFile: (file: File) => void,
): PhotoSource {
  function handleChange(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Reset first so picking the same file again still fires `change`.
    input.value = '';
    if (file) onFile(file);
  }

  els.uploadBtn.addEventListener('click', () => els.uploadInput.click());
  els.cameraBtn.addEventListener('click', () => els.captureInput.click());
  els.uploadInput.addEventListener('change', () => handleChange(els.uploadInput));
  els.captureInput.addEventListener('change', () => handleChange(els.captureInput));

  return {
    openUpload: () => els.uploadInput.click(),
    openCamera: () => els.captureInput.click(),
  };
}
