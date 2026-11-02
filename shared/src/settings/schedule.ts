/**
 * Runs `fn` at most once per animation frame however often the returned function is
 * called — for store subscribers, which fire on every typed character or drag step.
 */
export function oncePerFrame(
  fn: () => void,
  requestFrame: (cb: () => void) => unknown = (cb) => requestAnimationFrame(cb),
): () => void {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestFrame(() => {
      pending = false;
      fn();
    });
  };
}
