import type { LandmarkArray } from '@runalyzr/shared/types';

export interface SetupChecks {
  bodyInFrame: boolean;
  goodDistance: boolean;
  cameraPosition: boolean;
  orientation: boolean;
  goodLighting: boolean;
  stable: boolean;
  allPassed: boolean;
  hint: string;
}

const L_SHOULDER = 11, R_SHOULDER = 12;
const L_HIP = 23,      R_HIP = 24;
const L_ANKLE = 27,    R_ANKLE = 28;
const KEY_INDICES = [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP, 25, 26, L_ANKLE, R_ANKLE];

export function evaluateSetupChecks(
  recentLandmarks: (LandmarkArray | null)[],
  view: 'sagittal' | 'rear' | 'front',
  stableThreshold = 10,
): SetupChecks {
  const lm = recentLandmarks[recentLandmarks.length - 1];

  if (!lm || lm.length === 0) {
    return nopose();
  }

  const keyLms = KEY_INDICES.map(i => lm[i]).filter(Boolean);

  const avgVis = KEY_INDICES.reduce((s, i) => s + (lm[i]?.visibility ?? 0), 0) / KEY_INDICES.length;
  const goodLighting = avgVis > 0.45;

  const bodyInFrame = keyLms.length >= 6 &&
    keyLms.every(l => l.x > 0.03 && l.x < 0.97 && l.y > 0.02 && l.y < 0.98);

  let goodDistance = false;
  if (view === 'sagittal') {
    const topY    = Math.min(lm[L_SHOULDER]?.y ?? 1, lm[R_SHOULDER]?.y ?? 1);
    const bottomY = Math.max(lm[L_ANKLE]?.y   ?? 0, lm[R_ANKLE]?.y   ?? 0);
    const span = bottomY - topY;
    goodDistance = span >= 0.38 && span <= 0.88;
  } else {
    const sw = Math.abs((lm[L_SHOULDER]?.x ?? 0) - (lm[R_SHOULDER]?.x ?? 0));
    goodDistance = sw >= 0.18 && sw <= 0.58;
  }

  let cameraPosition = false;
  if (view === 'sagittal') {
    const hipY = ((lm[L_HIP]?.y ?? 0) + (lm[R_HIP]?.y ?? 0)) / 2;
    cameraPosition = hipY >= 0.35 && hipY <= 0.70;
  } else {
    const cx = ((lm[L_SHOULDER]?.x ?? 0.5) + (lm[R_SHOULDER]?.x ?? 0.5)) / 2;
    cameraPosition = Math.abs(cx - 0.5) < 0.22;
  }

  const hipSpread = Math.abs((lm[L_HIP]?.x ?? 0) - (lm[R_HIP]?.x ?? 0));
  const orientation = view === 'sagittal' ? hipSpread < 0.15 : hipSpread >= 0.12;

  const stable = recentLandmarks.length >= stableThreshold &&
    recentLandmarks.slice(-stableThreshold).filter(f => f && f.length > 0).length >= stableThreshold;

  const allPassed = bodyInFrame && goodLighting && goodDistance && cameraPosition && orientation && stable;

  let hint = 'All set — press record when ready.';
  if (!bodyInFrame) {
    hint = 'Ensure the full rider is visible in frame.';
  } else if (!goodLighting) {
    hint = 'Improve lighting — move to a brighter area or face a light source.';
  } else if (!orientation) {
    hint = view === 'sagittal'
      ? 'Turn the rider sideways — camera should capture a full side profile.'
      : 'Position the camera directly behind or in front of the rider.';
  } else if (!goodDistance) {
    const topY    = Math.min(lm[L_SHOULDER]?.y ?? 1, lm[R_SHOULDER]?.y ?? 1);
    const bottomY = Math.max(lm[L_ANKLE]?.y   ?? 0, lm[R_ANKLE]?.y   ?? 0);
    hint = (bottomY - topY) < 0.38
      ? 'Move camera closer — rider and bike should fill more of the frame.'
      : 'Move camera further back — full rider and bike should be visible.';
  } else if (!cameraPosition) {
    if (view === 'sagittal') {
      const hipY = ((lm[L_HIP]?.y ?? 0) + (lm[R_HIP]?.y ?? 0)) / 2;
      hint = hipY < 0.35 ? 'Camera too high — lower to hip height.' : 'Camera too low — raise to hip height.';
    } else {
      hint = 'Centre the rider in frame horizontally.';
    }
  } else if (!stable) {
    hint = 'Hold still — waiting for stable pose detection…';
  }

  return { bodyInFrame, goodDistance, cameraPosition, orientation, goodLighting, stable, allPassed, hint };
}

function nopose(): SetupChecks {
  return {
    bodyInFrame: false, goodDistance: false, cameraPosition: false,
    orientation: false, goodLighting: false, stable: false,
    allPassed: false, hint: 'Point camera at the rider.',
  };
}
