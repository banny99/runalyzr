import type { BikeGeometryStep } from '../config/defaults';
import type { BikeAngleMeasurement, BikeGeometryResult, PlacedPoint } from '../analysis/types';

export interface GeometryPhotoRefreshDeps<Img> {
  /** The live results; a result no longer in here when its image loads is left alone. */
  results: () => readonly BikeGeometryResult[];
  /** The un-annotated photo kept for "Edit points"; without one the old render is kept. */
  rawPhoto: (stepId: string) => string | undefined;
  step: (stepId: string) => BikeGeometryStep | undefined;
  loadImage: (src: string) => Promise<Img>;
  render: (img: Img, step: BikeGeometryStep, points: PlacedPoint[], angles: BikeAngleMeasurement[]) => string;
  /** Called once after a run that re-rendered at least one photo. */
  onDone: () => void;
  /** Quiet time after the last change before re-rendering (default 200 ms). */
  delayMs?: number;
}

export interface GeometryPhotoRefresh {
  /** Re-render every geometry photo once band changes have settled; supersedes any earlier run. */
  schedule(): void;
  cancel(): void;
}

/**
 * The annotated geometry photo bakes each angle's status colour into its JPEG,
 * so a band edit must re-render it. Re-rendering a full-resolution photo is the
 * expensive part of a band change, so it is debounced well past the per-frame
 * table update and an older run never overwrites a newer one.
 */
export function createGeometryPhotoRefresh<Img>(deps: GeometryPhotoRefreshDeps<Img>): GeometryPhotoRefresh {
  const delayMs = deps.delayMs ?? 200;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  async function run(gen: number): Promise<void> {
    let rendered = false;
    for (const result of [...deps.results()]) {
      const raw = deps.rawPhoto(result.stepId);
      const step = deps.step(result.stepId);
      if (!raw || !step) continue;
      let img: Img;
      try {
        img = await deps.loadImage(raw);
      } catch {
        continue; // keep the old render
      }
      if (gen !== generation) return;
      if (!deps.results().includes(result)) continue;
      result.imageDataUrl = deps.render(img, step, result.points, result.angles);
      rendered = true;
    }
    if (rendered && gen === generation) deps.onDone();
  }

  function cancel(): void {
    generation++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  return {
    schedule() {
      cancel();
      const gen = generation;
      timer = setTimeout(() => {
        timer = null;
        void run(gen);
      }, delayMs);
    },
    cancel,
  };
}
