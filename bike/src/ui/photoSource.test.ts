// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPhotoSource, type PhotoSourceElements } from './photoSource';

function makeElements(): PhotoSourceElements {
  document.body.innerHTML = `
    <input type="file" id="upload" accept="image/*" />
    <input type="file" id="capture" accept="image/*" capture="environment" />
    <button id="upload-btn"></button>
    <button id="camera-btn"></button>
  `;
  return {
    uploadInput: document.getElementById('upload') as HTMLInputElement,
    captureInput: document.getElementById('capture') as HTMLInputElement,
    uploadBtn: document.getElementById('upload-btn') as HTMLButtonElement,
    cameraBtn: document.getElementById('camera-btn') as HTMLButtonElement,
  };
}

/** Put a file on an input and fire a change event, as a real picker would. */
function pickFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) },
  });
  input.dispatchEvent(new Event('change'));
}

describe('createPhotoSource', () => {
  let els: PhotoSourceElements;
  beforeEach(() => {
    els = makeElements();
  });

  it('clicking the upload button opens the upload input', () => {
    const spy = vi.spyOn(els.uploadInput, 'click').mockImplementation(() => {});
    createPhotoSource(els, () => {});
    els.uploadBtn.click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('clicking the camera button opens the capture input', () => {
    const spy = vi.spyOn(els.captureInput, 'click').mockImplementation(() => {});
    createPhotoSource(els, () => {});
    els.cameraBtn.click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('fires onFile with the selected file from either input', () => {
    const onFile = vi.fn();
    createPhotoSource(els, onFile);
    const a = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const b = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    pickFile(els.uploadInput, a);
    pickFile(els.captureInput, b);
    expect(onFile).toHaveBeenNthCalledWith(1, a);
    expect(onFile).toHaveBeenNthCalledWith(2, b);
  });

  it('resets the input value after a change so re-picking the same file re-fires', () => {
    const onFile = vi.fn();
    createPhotoSource(els, onFile);
    pickFile(els.uploadInput, new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
    expect(els.uploadInput.value).toBe('');
  });

  it('does not fire onFile when no file is selected', () => {
    const onFile = vi.fn();
    createPhotoSource(els, onFile);
    els.uploadInput.dispatchEvent(new Event('change'));
    expect(onFile).not.toHaveBeenCalled();
  });

  it('exposes openUpload/openCamera that delegate to the inputs', () => {
    const up = vi.spyOn(els.uploadInput, 'click').mockImplementation(() => {});
    const cap = vi.spyOn(els.captureInput, 'click').mockImplementation(() => {});
    const src = createPhotoSource(els, () => {});
    src.openUpload();
    src.openCamera();
    expect(up).toHaveBeenCalledOnce();
    expect(cap).toHaveBeenCalledOnce();
  });
});
