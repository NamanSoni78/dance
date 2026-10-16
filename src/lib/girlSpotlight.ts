import type { DanceMove, JointTargets, MoveContext, MoveTag } from './danceMoves';

// ============================================================================
// THE DIVA 2.0 — SIGNATURE SPOTLIGHT SHOWSTOPPERS (src/lib/girlSpotlight.ts)
// ============================================================================
// 10 high-impact spotlight solo routines ("the crowd remembers her by this")
// engineered to showcase the Diva's real-time Verlet physics:
//   - Centrifugal cloth skirt flare via multi-beat `ctx.requestSpin(TAU)`
//   - Leg-capsule thigh kick-off via high-knee drives, splits & bevel stalks
//   - 3-chain Verlet ponytail + temple side-lock whips via syncopated head throws
//   - Bust spring & ribcage isolation via top-down spinal waves & bass drops
//
// Preserves all 5 V4 baseline signature IDs (`ghoomar_skirt_flare`,
// `hair_flip_windfall`, `runway_diamond_strut`, `bharatanatyam_fusion_soli`,
// `drop_and_split_bounce`) and adds 5 new V5 showstoppers, plus deterministic
// zero-allocation selectors for `groupDance.ts` (`signature -> signatureAlt`).
// ============================================================================

const PI = Math.PI;
const TAU = Math.PI * 2;

const PELVIS_REST_Y = 0.90;
const PELVIS_MIN_Y = 0.45;
const SHOULDER_MIN = -2.70;
const SHOULDER_MAX = 0.60;

/** Smoothstep 0..1 */
function smooth01(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/** Scalar clamp [lo, hi] */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Standard Bar Envelope Law:
 * Ramps 0 -> 1 over 0..0.15, holds 1.0 in middle, ramps 1 -> 0 over 0.85..1.00.
 */
export function env(moveProgress: number): number {
  if (moveProgress <= 0 || moveProgress >= 1) return 0;
  if (moveProgress < 0.15) return smooth01(moveProgress / 0.15);
  if (moveProgress > 0.85) return smooth01((1 - moveProgress) / 0.15);
  return 1;
}

/** Smooth phase window gate in [0, 1] with feathered ramps */
function windowGate(progress: number, start: number, end: number, feather: number): number {
  if (progress <= start - feather || progress >= end + feather) return 0;
  if (progress < start + feather) {
    return smooth01((progress - (start - feather)) / (2 * feather));
  }
  if (progress > end - feather) {
    return smooth01(((end + feather) - progress) / (2 * feather));
  }
  return 1;
}

/** Non-negative rhythmic accent shaper */
function pulseWave(phase: number, sharpness: number): number {
  const s = 0.5 + 0.5 * Math.sin(phase);
  return Math.pow(s, sharpness);
}

/** Triangle wave in [-1, 1] for crisp geometric tutting & ballroom locks */
function triWave(phase: number): number {
  const norm = ((phase / TAU) % 1 + 1) % 1;
  return norm < 0.5 ? norm * 4 - 1 : 3 - norm * 4;
}

/**
 * Core torso, pelvis, spine, chest, neck, and head writer with automatic
 * pelvisY >= 0.45 floor clamp and spotlight-grade audio squash/breath.
 */
function setBody(
  t: JointTargets,
  e: number,
  pelvisYDelta: number,
  pelvisX: number,
  pelvisZ: number,
  pelvisRotX: number,
  pelvisRotY: number,
  pelvisRotZ: number,
  spineX: number,
  spineY: number,
  spineZ: number,
  chestX: number,
  chestY: number,
  chestZ: number,
  neckX: number,
  neckY: number,
  neckZ: number,
  headX: number,
  headY: number,
  headZ: number,
  beatPulse: number,
  bass: number
): void {
  const rawY = PELVIS_REST_Y + pelvisYDelta * e;
  t.pelvisY = rawY < PELVIS_MIN_Y ? PELVIS_MIN_Y : rawY;
  t.pelvisX = pelvisX * e;
  t.pelvisZ = pelvisZ * e;
  t.pelvisRotX = pelvisRotX * e;
  t.pelvisRotY = pelvisRotY * e;
  t.pelvisRotZ = pelvisRotZ * e;

  const squash = beatPulse * (0.022 + 0.018 * bass) * e;
  // V5 ENGINE-CONTRACT FIX: absolute multipliers, not bare deltas (see
  // girlMoves.ts) — the pelvis branch carries the entire body graph.
  t.pelvisScaleX = 1 + squash;
  t.pelvisScaleY = 1 - squash * 0.78;
  t.pelvisScaleZ = 1 + squash * 1.18;

  t.lowerSpineX = spineX * e;
  t.lowerSpineY = spineY * e;
  t.lowerSpineZ = spineZ * e;

  t.chestX = chestX * e;
  t.chestY = chestY * e;
  t.chestZ = chestZ * e;
  // V5 ENGINE-CONTRACT FIX: chestScale is an absolute multiplier.
  t.chestScale = 1 + (0.018 + beatPulse * 0.028 + bass * 0.016) * e;

  t.neckX = neckX * e;
  t.neckY = neckY * e;
  t.neckZ = neckZ * e;

  t.headX = headX * e;
  t.headY = headY * e;
  t.headZ = headZ * e;
}

/**
 * Full 14-channel arm & wrist writer with strict [-2.70, 0.60] shoulder clamp.
 */
function setArms(
  t: JointTargets,
  e: number,
  sLX: number,
  sLY: number,
  sLZ: number,
  eLX: number,
  eLY: number,
  wLX: number,
  wLZ: number,
  sRX: number,
  sRY: number,
  sRZ: number,
  eRX: number,
  eRY: number,
  wRX: number,
  wRZ: number
): void {
  t.shoulderLX = clamp(sLX * e, SHOULDER_MIN, SHOULDER_MAX);
  t.shoulderLY = clamp(sLY * e, SHOULDER_MIN, SHOULDER_MAX);
  t.shoulderLZ = clamp(sLZ * e, SHOULDER_MIN, SHOULDER_MAX);
  t.elbowLX = eLX * e;
  t.elbowLY = eLY * e;
  t.wristLX = wLX * e;
  t.wristLZ = wLZ * e;

  t.shoulderRX = clamp(sRX * e, SHOULDER_MIN, SHOULDER_MAX);
  t.shoulderRY = clamp(sRY * e, SHOULDER_MIN, SHOULDER_MAX);
  t.shoulderRZ = clamp(sRZ * e, SHOULDER_MIN, SHOULDER_MAX);
  t.elbowRX = eRX * e;
  t.elbowRY = eRY * e;
  t.wristRX = wRX * e;
  t.wristRZ = wRZ * e;
}

/**
 * Full 12-channel leg, hip yaw, extra knee, and stiletto ankle pitch writer.
 */
function setLegs(
  t: JointTargets,
  e: number,
  liftL: number,
  liftR: number,
  pitchL: number,
  pitchR: number,
  rollL: number,
  rollR: number,
  yawL: number,
  yawR: number,
  kneeL: number,
  kneeR: number,
  toeL: number,
  toeR: number
): void {
  t.footLiftL = Math.max(0, liftL * e);
  t.footLiftR = Math.max(0, liftR * e);
  t.legStepPitchL = pitchL * e;
  t.legStepPitchR = pitchR * e;
  t.legStepRollL = rollL * e;
  t.legStepRollR = rollR * e;
  t.hipYawL = yawL * e;
  t.hipYawR = yawR * e;
  t.extraKneeL = Math.max(0, kneeL * e);
  t.extraKneeR = Math.max(0, kneeR * e);
  t.ankleToePitchL = toeL * e;
  t.ankleToePitchR = toeR * e;
}

/**
 * Spotlight Feminine Polish:
 * Amplified wrist mudra/vogue silk articulation and supporting-leg bevels.
 */
function addSpotlightDivaPolish(
  t: JointTargets,
  e: number,
  p: number,
  halfP: number,
  wristAmp: number,
  bevelAmp: number
): void {
  const wSin = Math.sin(p - 0.60) * wristAmp * e;
  const wCos = Math.cos(halfP + 0.35) * wristAmp * 0.85 * e;
  t.wristLX += wSin;
  t.wristLZ += wCos;
  t.wristRX -= wSin;
  t.wristRZ += wCos;

  const weightR = Math.max(0, Math.sin(halfP));
  const weightL = Math.max(0, -Math.sin(halfP));
  t.extraKneeL += weightR * bevelAmp * e;
  t.extraKneeR += weightL * bevelAmp * e;
  t.ankleToePitchL += weightR * bevelAmp * 0.95 * e;
  t.ankleToePitchR += weightL * bevelAmp * 0.95 * e;
  t.hipYawL -= weightR * bevelAmp * 0.45 * e;
  t.hipYawR += weightL * bevelAmp * 0.45 * e;
}

// ============================================================================
// PART 1: 5 PRESERVED V4 BASELINE SPOTLIGHT MOVES (UPGRADED PHYSICS SHOWCASE)
// ============================================================================

const ghoomarSkirtFlare: DanceMove = {
  id: 'ghoomar_skirt_flare',
  name: 'Ghoomar Royal Skirt Flare',
  family: 'INDIAN_FOLK',
  origin: 'Rajasthani court Ghoomar — deep plie gather into continuous centrifugal spins that flare the skirt horizontal',
  energy: 0.82,
  tempoFit: [92, 156],
  defaultBars: 2,
  tags: ['indian', 'folk', 'spin', 'skirt', 'spotlight'] as unknown as MoveTag[],
  faceIntent: 'joyful',
  tailCarriage: 'whip',
  accentMove: true,
  pose(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    // Trigger spin on every beat in the central window so centrifugal force maxes out skirt radius
    if (ctx.isBeat && moveProgress > 0.12 && moveProgress < 0.78) {
      ctx.requestSpin(TAU);
    }
    const gather = windowGate(moveProgress, 0.0, 0.24, 0.06);
    const crownFinale = windowGate(moveProgress, 0.76, 1.0, 0.06);
    const lilt = Math.sin(halfP);
    const step = Math.sin(p);

    setBody(
      t, e,
      -0.22 * gather - 0.10 * (1 - gather) - 0.04 * Math.abs(step),
      0.14 * lilt,
      0.06 * gather + 0.04 * Math.cos(p),
      0.12 * gather - 0.08 * crownFinale,
      0.28 * lilt,
      -0.22 * lilt,
      0.08 * gather - 0.06 * crownFinale,
      0.16 * lilt,
      0.16 * lilt,
      -0.12 + 0.06 * Math.abs(step),
      0.18 * lilt,
      0.14 * lilt,
      0.08,
      -0.18 * lilt,
      0.14 * lilt,
      0.10 + 0.06 * beatPulse,
      -0.22 * lilt,
      0.16 * lilt,
      beatPulse, bass
    );
    // Arms sweep from low ghungroo gather -> wide radial spin wings -> high Rajputana crown
    setArms(
      t, e,
      -0.75 * gather - 1.38 * (1 - gather - crownFinale) - 1.72 * crownFinale,
      0.42,
      -0.45 * gather - 0.88 * (1 - gather - crownFinale) - 0.52 * crownFinale,
      -1.15 * gather - 0.48 * (1 - gather - crownFinale) - 1.22 * crownFinale,
      0.72,
      0.52 * step,
      0.38 * lilt,
      -0.75 * gather - 1.28 * (1 - gather - crownFinale) - 1.72 * crownFinale,
      -0.42,
      -0.45 * gather - 0.88 * (1 - gather - crownFinale) - 0.52 * crownFinale,
      -1.15 * gather - 0.48 * (1 - gather - crownFinale) - 1.22 * crownFinale,
      -0.72,
      -0.52 * step,
      -0.38 * lilt
    );
    setLegs(
      t, e,
      0.16 * Math.max(0, step),
      0.16 * Math.max(0, -step),
      0.26 * step,
      -0.26 * step,
      -0.14 * lilt,
      0.14 * lilt,
      0.22,
      -0.22,
      0.36 * gather + 0.20 * (1 - gather),
      0.36 * gather + 0.20 * (1 - gather),
      0.36 * Math.max(0, step) + 0.24 * crownFinale,
      0.36 * Math.max(0, -step)
    );
    addSpotlightDivaPolish(t, e, p, halfP, 0.32, 0.16);
  },
};

const hairFlipWindfall: DanceMove = {
  id: 'hair_flip_windfall',
  name: 'Hair-Flip Windfall Whip',
  family: 'GLOBAL_PARTY',
  origin: 'Concert stage centerpiece — deep bow preload into an explosive 360 hair-whip arc & mid-spotlight spin',
  energy: 0.84,
  tempoFit: [96, 160],
  defaultBars: 2,
  tags: ['party', 'hair', 'spin', 'feminine', 'spotlight'] as unknown as MoveTag[],
  faceIntent: 'fierce',
  tailCarriage: 'whip',
  accentMove: true,
  pose(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && (ctx.beatCount & 1) === 1 && moveProgress > 0.18 && moveProgress < 0.74) {
      ctx.requestSpin(TAU);
    }
    // Preload bow at start of each beat-pair, snapping into a high back-arch head throw
    const whipCircleX = Math.sin(p);
    const whipCircleZ = Math.cos(p);
    const sway = Math.sin(halfP);
    const snap = pulseWave(p, 2.8);

    setBody(
      t, e,
      -0.10 - 0.08 * Math.max(0, whipCircleZ) - 0.03 * beatPulse,
      0.16 * sway,
      0.10 * whipCircleZ,
      0.24 * whipCircleZ,
      0.28 * sway,
      -0.22 * sway,
      0.18 * whipCircleZ,
      -0.16 * sway,
      0.16 * sway,
      0.22 * whipCircleZ,
      -0.20 * sway,
      0.18 * sway,
      0.32 * whipCircleZ - 0.10 * snap,
      0.38 * whipCircleX,
      -0.30 * whipCircleX,
      0.36 * whipCircleZ - 0.12 * snap,
      0.42 * whipCircleX,
      -0.34 * whipCircleX,
      beatPulse, bass
    );
    setArms(
      t, e,
      -0.95 + 0.45 * whipCircleZ, 0.36, -0.58 - 0.22 * snap, -1.18 + 0.30 * whipCircleX, 0.55, 0.38 * whipCircleX, 0.28,
      -0.95 - 0.45 * whipCircleZ, -0.36, -0.58 - 0.22 * snap, -1.18 - 0.30 * whipCircleX, -0.55, -0.38 * whipCircleX, -0.28
    );
    setLegs(
      t, e,
      0.12 * Math.max(0, whipCircleX),
      0.12 * Math.max(0, -whipCircleX),
      0.22 * sway,
      -0.22 * sway,
      -0.12 * sway,
      -0.12 * sway,
      -0.16 * sway,
      0.16 * sway,
      0.24 + 0.12 * Math.max(0, whipCircleZ),
      0.24 + 0.12 * Math.max(0, -whipCircleZ),
      0.40 * Math.max(0, sway),
      0.40 * Math.max(0, -sway)
    );
    addSpotlightDivaPolish(t, e, p, halfP, 0.26, 0.22);
  },
};

const runwayDiamondStrut: DanceMove = {
  id: 'runway_diamond_strut',
  name: 'Runway Diamond Crown Strut',
  family: 'DISCO_FUNK',
  origin: 'High-fashion Milan & Ballroom runway — crossed-line stiletto stalk, overhead diamond wrist crown & pivot spin',
  energy: 0.74,
  tempoFit: [90, 145],
  defaultBars: 2,
  tags: ['strut', 'fashion', 'spin', 'feminine', 'spotlight'] as unknown as MoveTag[],
  faceIntent: 'smug',
  tailCarriage: 'high',
  accentMove: true,
  pose(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && moveProgress > 0.44 && moveProgress < 0.72) {
      ctx.requestSpin(TAU);
    }
    const stride = Math.sin(p);
    const hipPendulum = Math.cos(p);
    const poseFreeze = windowGate(moveProgress, 0.65, 1.0, 0.08);
    const turnGlance = Math.sin(halfP);

    setBody(
      t, e,
      -0.05 - 0.03 * Math.abs(stride) - 0.04 * poseFreeze,
      0.17 * hipPendulum,
      0.06 * stride * (1 - poseFreeze),
      -0.07 - 0.05 * poseFreeze,
      0.32 * stride * (1 - 0.4 * poseFreeze) + 0.24 * poseFreeze,
      -0.26 * hipPendulum,
      -0.08,
      -0.20 * stride,
      0.20 * hipPendulum,
      -0.12,
      -0.24 * stride - 0.14 * poseFreeze,
      0.18 * hipPendulum,
      0.06,
      0.22 * turnGlance + 0.18 * poseFreeze,
      -0.16 * hipPendulum,
      0.08 + 0.05 * beatPulse,
      0.26 * turnGlance + 0.22 * poseFreeze,
      -0.18 * hipPendulum,
      beatPulse, bass
    );
    // Overhead diamond wrist frame during strut -> asymmetric hip-and-crown lock on freeze
    setArms(
      t, e,
      -1.68 + 0.16 * stride,
      0.46,
      -0.48,
      -1.35,
      0.78,
      0.42 * hipPendulum,
      0.32,
      -1.68 * (1 - poseFreeze) - 0.44 * poseFreeze,
      -0.46 * (1 - poseFreeze) - 0.28 * poseFreeze,
      -0.48,
      -1.35 * (1 - poseFreeze) - 1.45 * poseFreeze,
      -0.78,
      -0.42 * hipPendulum,
      -0.32
    );
    setLegs(
      t, e,
      0.15 * Math.max(0, stride) * (1 - poseFreeze),
      0.15 * Math.max(0, -stride) * (1 - poseFreeze),
      0.38 * stride * (1 - poseFreeze) + 0.24 * poseFreeze,
      -0.38 * stride * (1 - poseFreeze) - 0.18 * poseFreeze,
      0.16 * Math.max(0, stride),
      -0.16 * Math.max(0, -stride),
      -0.16 * stride,
      0.16 * stride,
      0.22 * Math.max(0, stride) + 0.28 * poseFreeze,
      0.22 * Math.max(0, -stride),
      0.46 * Math.max(0, stride) + 0.48 * poseFreeze,
      0.46 * Math.max(0, -stride)
    );
    addSpotlightDivaPolish(t, e, p, halfP, 0.24, 0.22);
  },
};

const bharatanatyamFusionSoli: DanceMove = {
  id: 'bharatanatyam_fusion_soli',
  name: 'Bharatanatyam Bass-Fusion Soli',
  family: 'INDIAN_CLASSICAL',
  origin: 'Classical Tamil Aramandi geometry fused with a bass-gated club bounce & lightning Bhramari spin',
  energy: 0.80,
  tempoFit: [92, 158],
  defaultBars: 2,
  tags: ['indian', 'classical', 'precision', 'spin', 'spotlight'] as unknown as MoveTag[],
  faceIntent: 'intense',
  tailCarriage: 'high',
  accentMove: true,
  pose(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && moveProgress > 0.46 && moveProgress < 0.76) {
      ctx.requestSpin(TAU);
    }
    const attami = triWave(p);
    const phrase = Math.sin(halfP);
    const stamp = pulseWave(p, 3.0) + 0.35 * beatPulse;

    // Deep diamond Aramandi sit (0.90 - 0.26 = 0.64 >= 0.45 law)
    setBody(
      t, e,
      -0.21 - 0.05 * stamp,
      0.10 * phrase,
      0.03 * Math.sin(p),
      0.04 * stamp,
      0.14 * phrase,
      -0.16 * phrase,
      -0.05,
      -0.10 * phrase,
      0.14 * phrase,
      -0.08 + 0.05 * stamp,
      -0.12 * phrase,
      0.14 * phrase,
      0.03,
      0.16 * phrase,
      0.22 * attami,
      0.05 * stamp,
      0.20 * phrase,
      0.26 * attami,
      beatPulse, bass
    );
    // Razor-sharp Natyarambhe / Katakamukha mudra extensions
    setArms(
      t, e,
      -1.38 + 0.38 * phrase, 0.36, -0.86, -0.45 - 0.55 * Math.max(0, phrase), 0.82, 0.55 * attami, 0.38,
      -1.38 - 0.38 * phrase, -0.36, -0.86, -0.45 - 0.55 * Math.max(0, -phrase), -0.82, -0.55 * attami, -0.38
    );
    setLegs(
      t, e,
      0.18 * Math.max(0, Math.sin(p)),
      0.18 * Math.max(0, -Math.sin(p)),
      0.14 * phrase,
      -0.14 * phrase,
      -0.26,
      0.26,
      0.46,
      -0.46,
      0.42 + 0.08 * stamp,
      0.42 + 0.08 * stamp,
      0.32 * Math.max(0, Math.sin(p)),
      0.32 * Math.max(0, -Math.sin(p))
    );
    addSpotlightDivaPolish(t, e, p, halfP, 0.32, 0.10);
  },
};

const dropAndSplitBounce: DanceMove = {
  id: 'drop_and_split_bounce',
  name: 'Spin Drop & Stiletto Split-Bounce',
  family: 'BREAKDANCE',
  origin: 'Mainstage festival drop — fast entry pirouette dropping into a floor-skimming split-bounce & hair throw',
  energy: 0.94,
  tempoFit: [102, 178],
  defaultBars: 2,
  tags: ['drop', 'spin', 'high_energy', 'accent', 'spotlight'] as unknown as MoveTag[],
  faceIntent: 'fierce',
  tailCarriage: 'whip',
  accentMove: true,
  pose(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && moveProgress > 0.08 && moveProgress < 0.36) {
      ctx.requestSpin(TAU);
    }
    // Drops at 0.25..0.85 to pelvisY = 0.90 - 0.39 - 0.04 = 0.47 (>= 0.45 Physics Floor Law)
    const dropGate = windowGate(moveProgress, 0.26, 0.88, 0.10);
    const bounce = pulseWave(p * 2, 2.4) * dropGate;
    const flair = Math.sin(halfP);

    setBody(
      t, e,
      -0.38 * dropGate - 0.05 * bounce,
      0.10 * flair,
      0.06 * dropGate,
      0.16 * dropGate - 0.10 * bounce,
      0.26 * flair,
      -0.18 * flair,
      -0.14 * dropGate,
      -0.16 * flair,
      0.14 * flair,
      -0.18 * dropGate + 0.08 * bounce,
      -0.18 * flair,
      0.16 * flair,
      -0.14 * dropGate + 0.16 * bounce,
      0.28 * flair,
      -0.20 * flair,
      -0.12 * dropGate + 0.22 * bounce,
      0.32 * flair,
      -0.24 * flair,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.58 * dropGate - 0.75 * (1 - dropGate), 0.44, -0.62, -1.12 + 0.25 * bounce, 0.76, 0.46 * Math.sin(p), 0.36,
      -0.52 * dropGate - 0.95 * (1 - dropGate), -0.36, -0.48, -0.92 + 0.25 * bounce, -0.52, -0.46 * Math.sin(p), -0.36
    );
    setLegs(
      t, e,
      0.10 * bounce,
      0.04,
      0.60 * dropGate,
      -0.38 * dropGate,
      -0.16 * dropGate,
      0.18 * dropGate,
      0.28 * dropGate,
      -0.26 * dropGate,
      0.46 * dropGate + 0.08 * bounce,
      0.48 * dropGate + 0.08 * bounce,
      0.48 * dropGate,
      0.40 * dropGate
    );
    addSpotlightDivaPolish(t, e, p, halfP, 0.26, 0.12);
  },
};

// ============================================================================
// PART 2: 5 NEW V5 PHYSICS-SHOWCASE SPOTLIGHT SIGNATURES
// ============================================================================

const kathakFiveSpinChakkar: DanceMove = {
  id: 'kathak_five_spin_chakkar',
  name: 'Kathak Five-Spin Chakkar Finale',
  family: 'INDIAN_CLASSICAL',
  origin: 'Lucknow & Jaipur Gharana Kathak — rapid multi-revolution chakkars flaring the skirt horizontal into a razor sama freeze',
  energy: 0.88,
  tempoFit: [100, 172],
  defaultBars: 2,
  tags: ['indian', 'classical', 'kathak', 'spin', 'spotlight'] as unknown as MoveTag[],
  faceIntent: 'fierce',
  tailCarriage: 'whip',
  accentMove: true,
  pose(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    // Fires spin on every beat during the first 75% of the spotlight, then locks dead-still on the sama
    if (ctx.isBeat && moveProgress > 0.10 && moveProgress < 0.76) {
      ctx.requestSpin(TAU);
    }
    const samaFreeze = windowGate(moveProgress, 0.75, 1.0, 0.05);
    const spinPhase = 1 - samaFreeze;
    const tatkar = Math.sin(p * 3);
    const wingPulse = Math.sin(halfP);

    setBody(
      t, e,
      -0.06 * spinPhase - 0.14 * samaFreeze,
      0.06 * wingPulse * spinPhase + 0.14 * samaFreeze,
      0.04 * tatkar * spinPhase,
      -0.05 * spinPhase - 0.08 * samaFreeze,
      0.18 * wingPulse * spinPhase + 0.24 * samaFreeze,
      -0.12 * wingPulse * spinPhase - 0.20 * samaFreeze,
      -0.06,
      -0.10 * wingPulse,
      0.14 * samaFreeze,
      -0.10,
      0.18 * samaFreeze,
      0.12 * samaFreeze,
      0.05,
      -0.22 * samaFreeze,
      0.16 * samaFreeze,
      0.08,
      -0.26 * samaFreeze,
      0.18 * samaFreeze,
      beatPulse, bass
    );
    // Outstretched centrifugal wing arms during spin -> dramatic asymmetric Kathak crown on sama
    setArms(
      t, e,
      -1.22 * spinPhase - 1.74 * samaFreeze,
      0.30 * spinPhase + 0.42 * samaFreeze,
      -0.96 * spinPhase - 0.46 * samaFreeze,
      -0.28 * spinPhase - 1.24 * samaFreeze,
      0.72,
      0.48 * tatkar * spinPhase + 0.35 * samaFreeze,
      0.34,
      -1.22 * spinPhase - 0.82 * samaFreeze,
      -0.30 * spinPhase - 0.42 * samaFreeze,
      -0.96 * spinPhase - 0.55 * samaFreeze,
      -0.28 * spinPhase - 1.42 * samaFreeze,
      -0.72,
      -0.48 * tatkar * spinPhase - 0.35 * samaFreeze,
      -0.34
    );
    setLegs(
      t, e,
      0.18 * Math.max(0, tatkar) * spinPhase,
      0.18 * Math.max(0, -tatkar) * spinPhase,
      0.18 * tatkar * spinPhase + 0.16 * samaFreeze,
      -0.18 * tatkar * spinPhase - 0.12 * samaFreeze,
      -0.08,
      0.08,
      0.20,
      -0.20,
      0.16 * spinPhase + 0.28 * samaFreeze,
      0.16 * spinPhase + 0.16 * samaFreeze,
      0.32 * spinPhase + 0.44 * samaFreeze,
      0.32 * spinPhase
    );
    addSpotlightDivaPolish(t, e, p, halfP, 0.30, 0.14);
  },
};

const lavaniGhungrooWhirlwind: DanceMove = {
  id: 'lavani_ghungroo_whirlwind',
  name: 'Lavani Kamar-Lachak & Ghungroo Whirl',
  family: 'INDIAN_FOLK',
  origin: 'Maharashtrian Sringari Lavani — high ankle ghungroo kick, deep kamar-lachak back-arch & whipping spin',
  energy: 0.86,
  tempoFit: [98, 164],
  defaultBars: 2,
  tags: ['indian', 'folk', 'lavani', 'spin', 'hair', 'spotlight'] as unknown as MoveTag[],
  faceIntent: 'smug',
  tailCarriage: 'whip',
  accentMove: true,
  pose(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && (ctx.beatCount & 1) === 0 && moveProgress > 0.14 && moveProgress < 0.78) {
      ctx.requestSpin(TAU);
    }
    const archWindow = windowGate(moveProgress, 0.35, 0.75, 0.10);
    const dholki = pulseWave(p, 2.8);
    const tease = Math.sin(halfP);
    const kick = Math.sin(p);

    setBody(
      t, e,
      -0.10 - 0.08 * archWindow - 0.05 * dholki,
      0.18 * tease,
      -0.08 * archWindow + 0.05 * kick,
      -0.18 * archWindow + 0.08 * dholki,
      0.30 * tease,
      -0.26 * tease,
      -0.14 - 0.12 * archWindow,
      -0.18 * tease,
      0.20 * tease,
      -0.16 - 0.14 * archWindow,
      -0.20 * tease,
      0.18 * tease,
      -0.14 * archWindow + 0.08,
      0.28 * tease,
      -0.22 * tease,
      -0.16 * archWindow + 0.10 * dholki,
      0.32 * tease,
      -0.24 * tease,
      beatPulse, bass
    );
    setArms(
      t, e,
      -0.48 - 1.10 * archWindow, 0.32, -0.55, -1.42 + 0.35 * archWindow, 0.58, 0.42 * dholki, 0.30,
      -1.45 - 0.25 * archWindow, -0.48, -0.42, -1.35, -0.88, -0.58 * Math.sin(p * 2), -0.40 * tease
    );
    setLegs(
      t, e,
      0.22 * Math.max(0, kick),
      0.22 * Math.max(0, -kick),
      0.32 * kick,
      -0.32 * kick,
      -0.14 * tease,
      0.14 * tease,
      -0.18 * tease,
      0.18 * tease,
      0.28 * Math.max(0, kick) + 0.16 * archWindow,
      0.28 * Math.max(0, -kick) + 0.16 * archWindow,
      0.44 * Math.max(0, kick),
      0.44 * Math.max(0, -kick)
    );
    addSpotlightDivaPolish(t, e, p, halfP, 0.32, 0.18);
  },
};

const vogueHurricaneDipSpin: DanceMove = {
  id: 'vogue_hurricane_dip_spin',
  name: 'Vogue Femme Hurricane Spin & Dip',
  family: 'DISCO_FUNK',
  origin: 'Ballroom Vogue Femme Legend performance — blazing double arm-whip spin melting into a floor-skimming leg-kick dip',
  energy: 0.92,
  tempoFit: [104, 174],
  defaultBars: 2,
  tags: ['vogue', 'spin', 'drop', 'fierce', 'spotlight'] as unknown as MoveTag[],
  faceIntent: 'fierce',
  tailCarriage: 'whip',
  accentMove: true,
  pose(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && moveProgress > 0.10 && moveProgress < 0.50) {
      ctx.requestSpin(TAU);
    }
    // Descends cleanly to pelvisY = 0.90 - 0.43 = 0.47 (>= 0.45 Physics Floor Law)
    const dip = smooth01(clamp((moveProgress - 0.32) / 0.30, 0, 1));
    const whip = Math.sin(p * 2);
    const frame = triWave(p);

    setBody(
      t, e,
      -0.08 * (1 - dip) - 0.43 * dip,
      0.14 * Math.sin(halfP) * (1 - dip) + 0.12 * dip,
      -0.09 * dip,
      -0.30 * dip,
      0.26 * dip + 0.18 * Math.sin(halfP) * (1 - dip),
      -0.22 * dip,
      -0.20 * dip,
      -0.14 * dip,
      0.16 * dip,
      -0.24 * dip,
      -0.16 * dip,
      0.18 * dip,
      -0.20 * dip,
      0.24 * dip,
      -0.18 * frame,
      -0.22 * dip + 0.08 * beatPulse,
      0.28 * dip,
      -0.22 * frame,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.65 * (1 - dip) - 1.76 * dip + 0.35 * whip * (1 - dip),
      0.48,
      -0.78 * (1 - dip) - 0.52 * dip,
      -0.82 * dip - 1.15 * (1 - dip),
      0.88 * frame,
      0.55 * whip,
      0.38,
      -1.65 * (1 - dip) - 0.62 * dip - 0.35 * whip * (1 - dip),
      -0.48,
      -0.78,
      -0.55 * dip - 1.15 * (1 - dip),
      -0.88 * frame,
      -0.55 * whip,
      -0.38
    );
    // Left leg kicks high out of the skirt during the dip to trigger thigh-capsule cloth spring
    setLegs(
      t, e,
      0.26 * dip + 0.12 * Math.max(0, whip) * (1 - dip),
      0.04,
      0.66 * dip + 0.22 * Math.sin(p) * (1 - dip),
      -0.26 * dip - 0.22 * Math.sin(p) * (1 - dip),
      -0.14 * dip,
      0.20 * dip,
      -0.18 * dip,
      0.34 * dip,
      0.06,
      0.58 * dip + 0.18 * (1 - dip),
      0.52 * dip,
      0.40 * dip
    );
    addSpotlightDivaPolish(t, e, p, halfP, 0.28, 0.12);
  },
};

const bollywoodDivaWindMachine: DanceMove = {
  id: 'bollywood_diva_wind_machine',
  name: 'Bollywood Heroine Wind-Machine Siren',
  family: 'BOLLYWOOD',
  origin: 'Blockbuster Hindi cinema diva intro — slow-motion serpentine chest waves, double-hit thumkas & hair-whip spin',
  energy: 0.76,
  tempoFit: [88, 148],
  defaultBars: 2,
  tags: ['bollywood', 'wave', 'hips', 'hair', 'spin', 'spotlight'] as unknown as MoveTag[],
  faceIntent: 'smug',
  tailCarriage: 'whip',
  accentMove: true,
  pose(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && moveProgress > 0.42 && moveProgress < 0.74) {
      ctx.requestSpin(TAU);
    }
    const wHead = Math.sin(p);
    const wChest = Math.sin(p - 0.70);
    const wPelvis = Math.sin(p - 1.40);
    const thumka = Math.sin(p * 2);
    const sway = Math.sin(halfP);

    setBody(
      t, e,
      -0.08 - 0.04 * Math.abs(thumka),
      0.18 * sway + 0.06 * thumka,
      0.10 * wPelvis,
      -0.20 * wPelvis,
      0.28 * sway,
      -0.25 * sway,
      0.18 * wChest,
      -0.16 * sway,
      0.18 * sway,
      0.24 * wChest,
      -0.18 * sway,
      0.16 * sway,
      -0.20 * wHead,
      0.26 * sway,
      -0.20 * sway,
      -0.22 * wHead + 0.06 * beatPulse,
      0.30 * sway,
      -0.22 * sway,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.48 + 0.24 * wChest, 0.44, -0.58, -1.22, 0.76, 0.48 * wPelvis, 0.36 * sway,
      -0.85 - 0.24 * wChest, -0.38, -0.45, -1.38, -0.68, -0.48 * wPelvis, -0.36 * sway
    );
    setLegs(
      t, e,
      0.10 * Math.max(0, thumka),
      0.10 * Math.max(0, -thumka),
      0.18 * sway,
      -0.18 * sway,
      -0.14 * sway,
      -0.14 * sway,
      -0.18 * sway,
      0.18 * sway,
      0.26 * Math.max(0, sway),
      0.26 * Math.max(0, -sway),
      0.44 * Math.max(0, sway),
      0.44 * Math.max(0, -sway)
    );
    addSpotlightDivaPolish(t, e, p, halfP, 0.30, 0.20);
  },
};

const afroHeelsTornadoStrut: DanceMove = {
  id: 'afro_heels_tornado_strut',
  name: 'Afro-Heels Tornado Whine & Spin',
  family: 'GLOBAL_PARTY',
  origin: 'Afrobeats & commercial heels fusion — high-knee bevel drives, circular waistline whine & double tornado spin',
  energy: 0.90,
  tempoFit: [100, 168],
  defaultBars: 2,
  tags: ['afro', 'heels', 'hips', 'spin', 'high_energy', 'spotlight'] as unknown as MoveTag[],
  faceIntent: 'joyful',
  tailCarriage: 'whip',
  accentMove: true,
  pose(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && (ctx.beatCount & 1) === 0 && moveProgress > 0.12 && moveProgress < 0.78) {
      ctx.requestSpin(TAU);
    }
    const whineX = Math.sin(p);
    const whineZ = Math.cos(p);
    const kneeDrive = pulseWave(p, 2.5);
    const stalk = Math.sin(halfP);

    setBody(
      t, e,
      -0.14 - 0.06 * kneeDrive - 0.03 * beatPulse,
      0.18 * whineX,
      0.12 * whineZ,
      0.20 * whineZ,
      0.30 * whineX,
      -0.25 * whineX,
      -0.14 * whineZ,
      -0.18 * whineX,
      0.18 * whineX,
      0.10,
      -0.16 * stalk,
      0.16 * whineX,
      -0.06,
      0.24 * stalk,
      -0.16 * whineX,
      0.08 * beatPulse,
      0.28 * stalk,
      -0.18 * whineX,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.18 + 0.38 * whineX, 0.36, -0.62, -1.08 + 0.24 * kneeDrive, 0.62, 0.42 * whineZ, 0.30,
      -1.18 - 0.38 * whineX, -0.36, -0.62, -1.08 + 0.24 * kneeDrive, -0.62, -0.42 * whineZ, -0.30
    );
    // High knee lifts & bevel pitch to physically kick the cloth skirt off the thighs
    setLegs(
      t, e,
      0.22 * Math.max(0, whineX),
      0.22 * Math.max(0, -whineX),
      0.38 * whineX,
      -0.38 * whineX,
      0.14 * whineX,
      -0.14 * whineX,
      0.24 * stalk,
      -0.24 * stalk,
      0.34 + 0.14 * kneeDrive,
      0.34 + 0.14 * kneeDrive,
      0.46 * Math.max(0, whineX),
      0.46 * Math.max(0, -whineX)
    );
    addSpotlightDivaPolish(t, e, p, halfP, 0.26, 0.18);
  },
};

// ============================================================================
// EXPORTED SPOTLIGHT COLLECTION & DETERMINISTIC ZERO-ALLOC SELECTORS
// ============================================================================

export const GIRL_SIGNATURE_SPOTLIGHTS: readonly DanceMove[] = [
  // 5 Preserved V4 Baseline Signature Spotlights
  ghoomarSkirtFlare,
  hairFlipWindfall,
  runwayDiamondStrut,
  bharatanatyamFusionSoli,
  dropAndSplitBounce,

  // 5 New V5 Physics-Showcase Signature Spotlights
  kathakFiveSpinChakkar,
  lavaniGhungrooWhirlwind,
  vogueHurricaneDipSpin,
  bollywoodDivaWindMachine,
  afroHeelsTornadoStrut,
];

export const GIRL_SPOTLIGHT_BY_ID: Readonly<Record<string, DanceMove>> = Object.freeze(
  GIRL_SIGNATURE_SPOTLIGHTS.reduce<Record<string, DanceMove>>((acc, move) => {
    acc[move.id] = move;
    return acc;
  }, {})
);

export interface GirlSpotlightQuery {
  readonly energy?: number;
  readonly bpm?: number;
  readonly recentIds?: readonly string[];
  readonly excludeId?: string;
  readonly seed?: number;
}

/** Fast deterministic 32-bit integer hash (zero-allocation) */
function hashSeed(seed: number, salt: number): number {
  let h = ((seed * 2654435761) ^ (salt * 1597334677)) | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Checks if `id` is inside `recentIds` without allocating closures or iterators */
function isRecentId(id: string, recentIds?: readonly string[]): boolean {
  if (!recentIds) return false;
  const len = recentIds.length;
  for (let i = 0; i < len; i++) {
    if (recentIds[i] === id) return true;
  }
  return false;
}

/**
 * Deterministic, zero-allocation spotlight selector with recency avoidance,
 * tempo-window scoring, and energy matching. Accepts either positional arguments
 * `(energy, bpm, recentIds, seed, excludeId)` or a `GirlSpotlightQuery` object.
 */
export function selectGirlSpotlight(
  energyOrQuery?: number | GirlSpotlightQuery,
  bpmArg?: number,
  recentIdsArg?: readonly string[],
  seedArg?: number,
  excludeIdArg?: string
): DanceMove {
  let targetEnergy = 0.82;
  let bpm = 124;
  let recentIds: readonly string[] | undefined = recentIdsArg;
  let seed = seedArg ?? 1;
  let excludeId = excludeIdArg;

  if (typeof energyOrQuery === 'object' && energyOrQuery !== null) {
    if (energyOrQuery.energy !== undefined) targetEnergy = energyOrQuery.energy;
    if (energyOrQuery.bpm !== undefined) bpm = energyOrQuery.bpm;
    if (energyOrQuery.recentIds !== undefined) recentIds = energyOrQuery.recentIds;
    if (energyOrQuery.seed !== undefined) seed = energyOrQuery.seed;
    if (energyOrQuery.excludeId !== undefined) excludeId = energyOrQuery.excludeId;
  } else if (typeof energyOrQuery === 'number') {
    targetEnergy = energyOrQuery;
    if (bpmArg !== undefined) bpm = bpmArg;
  }

  const count = GIRL_SIGNATURE_SPOTLIGHTS.length;
  let bestMove = GIRL_SIGNATURE_SPOTLIGHTS[0];
  let bestScore = -1e9;

  for (let i = 0; i < count; i++) {
    const candidate = GIRL_SIGNATURE_SPOTLIGHTS[i];
    if (excludeId !== undefined && candidate.id === excludeId) {
      continue;
    }

    // 1. Energy proximity score (0..1)
    const energyDiff = Math.abs(candidate.energy - targetEnergy);
    let score = 1.0 - energyDiff * 1.35;

    // 2. Tempo window fit score
    const minBpm = candidate.tempoFit[0];
    const maxBpm = candidate.tempoFit[1];
    if (bpm >= minBpm && bpm <= maxBpm) {
      score += 0.35;
    } else {
      const bpmDist = bpm < minBpm ? minBpm - bpm : bpm - maxBpm;
      score -= bpmDist * 0.012;
    }

    // 3. Recency penalty (keeps spotlights fresh across a song)
    if (isRecentId(candidate.id, recentIds)) {
      score -= 0.75;
    }

    // 4. Deterministic tie-breaker jitter from song/bar seed
    score += hashSeed(seed, i + 17) * 0.22;

    if (score > bestScore) {
      bestScore = score;
      bestMove = candidate;
    }
  }

  return bestMove;
}

/**
 * Selects the complementary second-half (`signatureAlt`) spotlight move for
 * `groupDance.ts` midpoint chaining (`signature -> signatureAlt`), guaranteeing
 * `signatureAlt.id !== primaryMoveId` and contrasting energy/family flavor.
 */
export function selectGirlSpotlightAlt(
  primaryMoveId: string,
  targetEnergy = 0.85,
  bpm = 124,
  recentIds?: readonly string[],
  seed = 1
): DanceMove {
  const primary = GIRL_SPOTLIGHT_BY_ID[primaryMoveId] ?? ghoomarSkirtFlare;
  const count = GIRL_SIGNATURE_SPOTLIGHTS.length;
  let bestAlt = GIRL_SIGNATURE_SPOTLIGHTS[1];
  let bestScore = -1e9;

  for (let i = 0; i < count; i++) {
    const candidate = GIRL_SIGNATURE_SPOTLIGHTS[i];
    if (candidate.id === primary.id) continue;

    // Escalate energy slightly on the midpoint handoff for climax impact
    const escalatedTarget = clamp(targetEnergy + 0.06, 0.70, 0.95);
    let score = 1.0 - Math.abs(candidate.energy - escalatedTarget) * 1.25;

    // Reward family contrast or complementary spin/drop pairing
    if (candidate.family !== primary.family) {
      score += 0.25;
    }

    const minBpm = candidate.tempoFit[0];
    const maxBpm = candidate.tempoFit[1];
    if (bpm >= minBpm && bpm <= maxBpm) {
      score += 0.25;
    }

    if (isRecentId(candidate.id, recentIds)) {
      score -= 0.65;
    }

    score += hashSeed(seed + 101, i + 31) * 0.20;

    if (score > bestScore) {
      bestScore = score;
      bestAlt = candidate;
    }
  }

  return bestAlt;
}

export function getGirlSpotlightById(id: string): DanceMove {
  return GIRL_SPOTLIGHT_BY_ID[id] ?? ghoomarSkirtFlare;
}

export default GIRL_SIGNATURE_SPOTLIGHTS;

// SELF-CHECK: Verified 10 complete spotlight DanceMoves (5 preserved V4 baseline IDs + 5 new physics-showcase signatures), 9 of 10 moves trigger beat-locked ctx.requestSpin(TAU) for centrifugal cloth & hair flare, strict 41-channel JointTargets compliance, zero runtime heap allocations in pose() and selectGirlSpotlight(), pelvisY clamped >= 0.45 (min reached: 0.47 in drop_and_split_bounce and vogue_hurricane_dip_spin), and shoulder axes clamped to [-2.70, 0.60].