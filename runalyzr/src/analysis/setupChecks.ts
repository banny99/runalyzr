import { detectCameraView } from '../pose/processing';
import { LANDMARKS } from '../config/defaults';
import type { LandmarkArray, FrameData, CameraView } from './types';

export interface SetupChecks {
  viewSelected: boolean;
  stable: boolean;
  orientation: boolean;     // turned the right way for the chosen view
  jointAlignment: boolean;  // sagittal: hip/knee/ankle stack in X; frontal: bilateral symmetry
  bodyInFrame: boolean;
  goodDistance: boolean;
  cameraPosition: boolean;  // sagittal: hip-height; frontal: centered + level
  goodLighting: boolean;
  detectedView: CameraView;
  allPassed: boolean;
  hint: string;
}

export function evaluateSetupChecks(
  landmarks: LandmarkArray,
  consecutiveFrames: number,
  selectedView: 'sagittal' | 'frontal' | null,
): SetupChecks {
  const L = LANDMARKS;
  const key = [
    L.LEFT_SHOULDER, L.RIGHT_SHOULDER,
    L.LEFT_HIP, L.RIGHT_HIP,
    L.LEFT_KNEE, L.RIGHT_KNEE,
    L.LEFT_ANKLE, L.RIGHT_ANKLE,
  ];

  // ── Stable ────────────────────────────────────────────────────────────────
  const stable = consecutiveFrames >= 15;

  // ── Shared geometry ───────────────────────────────────────────────────────
  const lShoulder = landmarks[L.LEFT_SHOULDER];
  const rShoulder = landmarks[L.RIGHT_SHOULDER];
  const lHip      = landmarks[L.LEFT_HIP];
  const rHip      = landmarks[L.RIGHT_HIP];
  const lKnee     = landmarks[L.LEFT_KNEE];
  const rKnee     = landmarks[L.RIGHT_KNEE];
  const lAnkle    = landmarks[L.LEFT_ANKLE];
  const rAnkle    = landmarks[L.RIGHT_ANKLE];

  const shoulderSpread = Math.abs(lShoulder.x - rShoulder.x);
  const hipSpread      = Math.abs(lHip.x      - rHip.x);
  const avgSpread      = (shoulderSpread + hipSpread) / 2;

  const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;
  const hipMidX      = (lHip.x      + rHip.x)      / 2;
  const hipMidY      = (lHip.y      + rHip.y)      / 2;

  const shoulderY  = Math.min(lShoulder.y, rShoulder.y);
  const ankleY     = Math.max(lAnkle.y,    rAnkle.y);
  const heightSpan = ankleY - shoulderY;

  // ── Orientation (are they facing the right way?) ──────────────────────────
  // Sagittal: joints stack in X → low spread; Frontal: joints spread in X
  const orientation =
    selectedView === null       ? true :
    selectedView === 'sagittal' ? avgSpread < 0.14 :
    /* frontal */                 avgSpread > 0.10;

  // ── Joint alignment (view-specific quality signal) ────────────────────────
  let jointAlignment = true;
  if (selectedView === 'sagittal' && orientation) {
    // Hip, knee, ankle should be roughly at the same X (person truly perpendicular).
    // Use whichever side is more visible (lower x = left side closer to camera, etc.)
    const leftAlign  = Math.max(
      Math.abs(lHip.x - lKnee.x), Math.abs(lKnee.x - lAnkle.x));
    const rightAlign = Math.max(
      Math.abs(rHip.x - rKnee.x), Math.abs(rKnee.x - rAnkle.x));
    const bestAlign = Math.min(leftAlign, rightAlign);
    jointAlignment = bestAlign < 0.18; // joints within 18% horizontal scatter
  } else if (selectedView === 'frontal' && orientation) {
    // Left and right counterparts should mirror around the body midline.
    // midline X ≈ average of all mid-points
    const midX = (shoulderMidX + hipMidX) / 2;
    const lSymmetry = Math.abs((lShoulder.x - midX) + (rShoulder.x - midX));
    const hSymmetry = Math.abs((lHip.x      - midX) + (rHip.x      - midX));
    jointAlignment = Math.max(lSymmetry, hSymmetry) < 0.12; // fairly symmetric
  }

  // ── Body in frame ─────────────────────────────────────────────────────────
  const bodyInFrame = key.every((i) => {
    const lm = landmarks[i];
    return lm && lm.x > 0.03 && lm.x < 0.97 && lm.y > 0.02 && lm.y < 0.98;
  });

  // ── Distance ──────────────────────────────────────────────────────────────
  // Sagittal: height span fills 40–88% of frame
  // Frontal:  shoulder width fills 20–60% of frame width
  const goodDistance =
    selectedView === 'frontal'
      ? shoulderSpread > 0.20 && shoulderSpread < 0.60
      : heightSpan > 0.40 && heightSpan < 0.88;

  // ── Camera position ───────────────────────────────────────────────────────
  // Sagittal: camera should be at roughly hip height → hip mid-Y near vertical centre
  // Frontal:  person centred horizontally + camera level (shoulders horizontal)
  let cameraPosition = true;
  if (selectedView === 'sagittal') {
    cameraPosition = hipMidY > 0.38 && hipMidY < 0.68;
  } else if (selectedView === 'frontal') {
    const centred = Math.abs(hipMidX - 0.5) < 0.15;
    const tilt    = Math.abs(lShoulder.y - rShoulder.y) < 0.06; // shoulders level
    cameraPosition = centred && tilt;
  }

  // ── Lighting ──────────────────────────────────────────────────────────────
  const visAvg = key.reduce((s, i) => s + (landmarks[i]?.visibility ?? 1), 0) / key.length;
  const goodLighting = visAvg > 0.50;

  // ── Detected view ─────────────────────────────────────────────────────────
  const detectedView = detectCameraView(landmarks);
  const viewSelected = selectedView !== null;

  // ── Hint (first unmet condition wins) ────────────────────────────────────
  let hint = '';
  if (!viewSelected) {
    hint = 'Tap the view button above to choose Side or Front view.';
  } else if (!stable) {
    hint = 'Hold still — detecting your pose…';
  } else if (!orientation) {
    hint = selectedView === 'sagittal'
      ? 'Turn sideways — camera should see your full profile (hip, knee, ankle in a line).'
      : 'Face the camera directly — shoulders should be level and spread.';
  } else if (!jointAlignment) {
    hint = selectedView === 'sagittal'
      ? 'Rotate a bit more — hip, knee and ankle should line up vertically.'
      : 'Centre yourself — left and right sides should mirror each other.';
  } else if (!bodyInFrame) {
    hint = selectedView === 'sagittal'
      ? 'Step back until your full body (head to feet) is visible from the side.'
      : 'Step back until your full body (head to feet) is visible facing forward.';
  } else if (selectedView === 'frontal' ? shoulderSpread < 0.20 : heightSpan < 0.40) {
    hint = 'Move closer to the camera.';
  } else if (selectedView === 'frontal' ? shoulderSpread > 0.60 : heightSpan > 0.88) {
    hint = 'Step further back — you are too close.';
  } else if (!cameraPosition) {
    hint = selectedView === 'sagittal'
      ? `Camera too ${hipMidY < 0.38 ? 'low' : 'high'} — raise or lower it to hip height.`
      : Math.abs(hipMidX - 0.5) >= 0.15
        ? `Move ${hipMidX < 0.5 ? 'right' : 'left'} — centre yourself in the frame.`
        : 'Camera is tilted — level it so shoulders appear horizontal.';
  } else if (!goodLighting) {
    hint = 'Improve lighting: face a bright light source or move outdoors.';
  } else {
    hint = selectedView === 'sagittal'
      ? 'All set — camera at hip height, 3–5 m away. Start recording when ready.'
      : 'All set — camera at chest height, 3–5 m away. Start recording when ready.';
  }

  const allPassed =
    viewSelected && stable && orientation && jointAlignment &&
    bodyInFrame && goodDistance && cameraPosition && goodLighting;

  return {
    viewSelected, stable, orientation, jointAlignment,
    bodyInFrame, goodDistance, cameraPosition, goodLighting,
    detectedView, allPassed, hint,
  };
}

export function evaluateVideoQuality(
  frames: FrameData[],
  selectedView: 'sagittal' | 'frontal' | null,
): string[] {
  const sampled = frames.filter((_, i) => i % 10 === 0);
  if (sampled.length === 0) return [];

  const counts: Record<string, number> = {
    orientation: 0,
    bodyInFrame: 0,
    goodDistance: 0,
    cameraPosition: 0,
    goodLighting: 0,
  };

  for (const frame of sampled) {
    const checks = evaluateSetupChecks(frame.landmarks, 100, selectedView);
    if (!checks.orientation)    counts.orientation++;
    if (!checks.bodyInFrame)    counts.bodyInFrame++;
    if (!checks.goodDistance)   counts.goodDistance++;
    if (!checks.cameraPosition) counts.cameraPosition++;
    if (!checks.goodLighting)   counts.goodLighting++;
  }

  const threshold = 0.3;
  const total = sampled.length;
  const warnings: string[] = [];

  if (counts.orientation    / total > threshold)
    warnings.push('Subject not facing correct direction for detected view');
  if (counts.bodyInFrame    / total > threshold)
    warnings.push('Subject not fully in frame');
  if (counts.goodDistance   / total > threshold)
    warnings.push('Subject too far or too close');
  if (counts.cameraPosition / total > threshold)
    warnings.push('Camera height/position not ideal');
  if (counts.goodLighting   / total > threshold)
    warnings.push('Poor lighting — landmark detection may be unreliable');

  return warnings;
}
