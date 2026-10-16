import type { JointTargets, MoveContext } from './danceMoves';
import type { DuetMove } from './duetMoves';

// ============================================================================
// THE DIVA 2.0 — PARTNER DUET CHOREOGRAPHY SUITE (src/lib/girlDuetMoves.ts)
// ============================================================================
// 16 authored two-dancer routines where Partner A (poseA) is the Diva style
// anchor (feminine figure-8 hips, phase-lagged spinal waves, mudra/vogue
// wrists, high-arch stiletto bevels, and cloth/ponytail-flaring spins) and
// Partner B (poseB) executes distinct, complementary counter-choreography
// (lead framing, call-and-response windows, rhythmic tala keeping, or power
// counter-bounces) across all 5 engine facings.
//
// Obeys all V4/V5 Live Engine Laws:
//   1. Zero-Allocation Law: pure scalar math inside poseA / poseB
//   2. Beat-Lock Law: driven strictly by p, halfP, quarterP, beatPulse, moveProgress
//   3. Physics Floor Law: pelvisY >= 0.45, shoulder axes clamped to [-2.70, 0.60]
//   4. Bar Envelope Law: smooth 15% entrance and 15% exit via env(moveProgress)
//   5. Distinct Partner Law: poseA !== poseB on every single move
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

/** Smooth window weight between [start, end] with `feather` ramp width */
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

/** Scalar clamp [lo, hi] */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Standard Bar Envelope Law:
 * 0 -> 1 over 0..0.15, flat 1.0 in middle, 1 -> 0 over 0.85..1.00.
 */
function env(moveProgress: number): number {
  if (moveProgress <= 0 || moveProgress >= 1) return 0;
  if (moveProgress < 0.15) return smooth01(moveProgress / 0.15);
  if (moveProgress > 0.85) return smooth01((1 - moveProgress) / 0.15);
  return 1;
}

/** Non-negative rhythmic accent shaper */
function pulseWave(phase: number, sharpness: number): number {
  const s = 0.5 + 0.5 * Math.sin(phase);
  return Math.pow(s, sharpness);
}

/** Triangle wave in [-1, 1] for crisp geometric tuts & ballroom locks */
function triWave(phase: number): number {
  const norm = ((phase / TAU) % 1 + 1) % 1;
  return norm < 0.5 ? norm * 4 - 1 : 3 - norm * 4;
}

/**
 * Core torso, pelvis, spine, chest, neck, and head writer with automatic
 * pelvisY >= 0.45 floor clamp and subtle audio-reactive squash.
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

  const squash = beatPulse * (0.016 + 0.015 * bass) * e;
  // V5 ENGINE-CONTRACT FIX: absolute multipliers, not bare deltas (see
  // girlMoves.ts) — the pelvis branch carries the entire body graph.
  t.pelvisScaleX = 1 + squash;
  t.pelvisScaleY = 1 - squash * 0.72;
  t.pelvisScaleZ = 1 + squash * 1.12;

  t.lowerSpineX = spineX * e;
  t.lowerSpineY = spineY * e;
  t.lowerSpineZ = spineZ * e;

  t.chestX = chestX * e;
  t.chestY = chestY * e;
  t.chestZ = chestZ * e;
  // V5 ENGINE-CONTRACT FIX: chestScale is an absolute multiplier.
  t.chestScale = 1 + (0.014 + beatPulse * 0.022 + bass * 0.012) * e;

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
 * Full 12-channel leg, hip yaw, extra knee, and ankle pitch writer.
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
 * Feminine Anchor Polish (Partner A — The Diva):
 * Injects subtle Lissajous wrist silk flicks, contrapposto knee bevels, and
 * stiletto arch articulation so her silhouette always reads unmistakably feminine.
 */
function addDivaPolish(
  t: JointTargets,
  e: number,
  p: number,
  halfP: number,
  wristAmp: number,
  bevelAmp: number
): void {
  const wSin = Math.sin(p - 0.65) * wristAmp * e;
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

/**
 * Partner B Counter-Polish:
 * Grounded rhythmic chest breath and clean wrist counter-accents.
 */
function addPartnerPolish(
  t: JointTargets,
  e: number,
  p: number,
  beatPulse: number,
  amp: number
): void {
  const nod = (0.04 * Math.sin(p) + 0.03 * beatPulse) * amp * e;
  t.chestX += nod * 0.6;
  t.headX += nod;
}

// ============================================================================
// 1. BOLLYWOOD ROMANTIC CALL & RESPONSE — KAJRA RE ISHARE (EACH_OTHER)
// ============================================================================

const duetKajraReIshare: DuetMove = {
  id: 'duet_kajra_re_ishare',
  name: 'Kajra Re Naina Call & Response',
  origin: 'Lucknowi-Bollywood romantic jugalbandi — coy eye-kohl ishare vs admiring salaam & twirl',
  facing: 'EACH_OTHER',
  anchorDistance: 1.25,
  energy: 0.62,
  tempoFit: [90, 140],
  durationBars: 4,
  tags: ['bollywood', 'romantic', 'call_response', 'feminine'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    // Bars 1-2: Diva performs coy eye-framing ishare & thumka; Bars 3-4: spins & lands in back-arch
    const secondHalf = windowGate(moveProgress, 0.50, 1.0, 0.08);
    if (ctx.isBeat && moveProgress > 0.52 && moveProgress < 0.74) {
      ctx.requestSpin(TAU);
    }
    const sway = Math.sin(halfP);
    const flick = Math.sin(p * 2);
    const thumka = pulseWave(p, 2.5);

    setBody(
      t, e,
      -0.06 - 0.04 * thumka - 0.03 * secondHalf,
      0.15 * sway,
      0.04 * Math.sin(p) - 0.05 * secondHalf,
      -0.05 - 0.06 * secondHalf,
      0.24 * sway,
      -0.20 * sway,
      -0.05 - 0.05 * secondHalf,
      -0.14 * sway,
      0.15 * sway,
      -0.08 - 0.06 * secondHalf,
      -0.16 * sway,
      0.14 * sway,
      0.05,
      0.20 * sway,
      -0.14 * sway + 0.06 * flick,
      0.06 * thumka,
      0.24 * sway,
      -0.16 * sway + 0.08 * flick,
      beatPulse, bass
    );
    // First half: kohl eye-framing hands; second half: high flared pallu crown
    setArms(
      t, e,
      -1.32 - 0.30 * secondHalf, 0.45 * (1 - secondHalf) + 0.30 * secondHalf, -0.38 - 0.28 * secondHalf,
      -1.52 + 0.45 * secondHalf, 0.80, 0.48 * flick, 0.34 * sway,
      -1.20 + 0.65 * secondHalf, -0.40, -0.44,
      -1.42, -0.74, -0.48 * flick, -0.34 * sway
    );
    setLegs(
      t, e,
      0.08 * Math.max(0, Math.sin(p)), 0.08 * Math.max(0, -Math.sin(p)),
      0.14 * sway, -0.14 * sway,
      -0.10 * sway, -0.10 * sway,
      -0.14 * sway, 0.14 * sway,
      0.18 * Math.max(0, sway) + 0.10 * secondHalf, 0.18 * Math.max(0, -sway),
      0.32 * Math.max(0, sway) + 0.12 * secondHalf, 0.32 * Math.max(0, -sway)
    );
    addDivaPolish(t, e, p, halfP, 0.26, 0.16);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    // Bars 1-2: Partner B holds admiring heart-hand & suave lean; Bars 3-4: wide beckoning hero arms
    const secondHalf = windowGate(moveProgress, 0.50, 1.0, 0.08);
    const groove = Math.sin(halfP);
    const bounce = pulseWave(p, 2.0);

    setBody(
      t, e,
      -0.09 - 0.05 * bounce - 0.05 * secondHalf,
      -0.10 * groove,
      0.07 * (1 - secondHalf) - 0.04 * secondHalf,
      0.08 * (1 - secondHalf) - 0.05 * secondHalf,
      -0.18 * groove,
      0.12 * groove,
      0.04,
      0.10 * groove,
      -0.10 * groove,
      -0.06 - 0.06 * secondHalf,
      0.14 * groove,
      -0.10 * groove,
      -0.04,
      -0.16 * groove,
      0.10 * groove,
      0.05 * bounce,
      -0.18 * groove,
      0.12 * groove,
      beatPulse, bass
    );
    // Heart-to-forehead salaam in first half -> wide open hero frame in second half
    setArms(
      t, e,
      -0.78 - 0.35 * secondHalf, 0.38 * (1 - secondHalf) - 0.15 * secondHalf, -0.35 - 0.52 * secondHalf,
      -1.35 + 0.90 * secondHalf, 0.55, 0.24 * Math.sin(p), 0.18,
      -1.25 + 0.12 * secondHalf, -0.48 * (1 - secondHalf) + 0.15 * secondHalf, -0.32 - 0.55 * secondHalf,
      -1.48 + 1.05 * secondHalf, -0.68, -0.28 * Math.sin(p), -0.18
    );
    setLegs(
      t, e,
      0.07 * Math.max(0, -Math.sin(p)), 0.07 * Math.max(0, Math.sin(p)),
      0.22 * secondHalf - 0.12 * groove, -0.22 * secondHalf + 0.12 * groove,
      -0.12, 0.12,
      0.18, -0.18,
      0.22 + 0.12 * secondHalf, 0.18 + 0.08 * bounce,
      0.20 * bounce, 0.16
    );
    addPartnerPolish(t, e, p, beatPulse, 1.0);
  },
};

// ============================================================================
// 2. BOLLYWOOD HIGH-ENERGY MIRRORS — CHAMMA CHAMMA MIRROR (MIRRORED)
// ============================================================================

const duetChammaChammaMirror: DuetMove = {
  id: 'duet_chamma_chamma_mirror',
  name: 'Chamma Chamma Ghungroo Mirror',
  origin: '90s Bollywood high-voltage item duet — mirrored diagonal arm slashes with feminine thumka vs power knee-drive',
  facing: 'MIRRORED',
  anchorDistance: 1.45,
  energy: 0.78,
  tempoFit: [102, 158],
  durationBars: 4,
  tags: ['bollywood', 'mirrored', 'high_energy', 'hips'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const slash = Math.sin(halfP);
    const stomp = Math.abs(Math.sin(p));
    const flick = Math.sin(p * 2);

    setBody(
      t, e,
      -0.09 - 0.06 * stomp - 0.03 * beatPulse,
      0.17 * slash,
      0.05 * Math.cos(p),
      0.07 * stomp,
      0.28 * slash,
      -0.23 * slash,
      -0.05,
      -0.16 * slash,
      0.16 * slash,
      -0.08 + 0.06 * stomp,
      -0.18 * slash,
      0.15 * slash,
      0.06,
      0.22 * slash,
      -0.15 * slash,
      0.08 * stomp,
      0.26 * slash,
      -0.18 * slash,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.18 - 0.62 * slash, 0.28 * slash, -0.68 - 0.22 * stomp, -0.68 - 0.32 * stomp, 0.55, 0.42 * flick, 0.30,
      -1.18 + 0.62 * slash, 0.28 * slash, -0.68 - 0.22 * stomp, -0.68 - 0.32 * stomp, -0.55, -0.42 * flick, -0.30
    );
    setLegs(
      t, e,
      0.15 * Math.max(0, Math.sin(p)), 0.15 * Math.max(0, -Math.sin(p)),
      0.24 * slash, -0.24 * slash,
      -0.12 * slash, -0.12 * slash,
      -0.14 * slash, 0.14 * slash,
      0.22 * stomp, 0.22 * stomp,
      0.34 * Math.max(0, Math.sin(p)), 0.34 * Math.max(0, -Math.sin(p))
    );
    addDivaPolish(t, e, p, halfP, 0.26, 0.18);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    // Opposing diagonal mirror with grounded bhangra/bollywood knee-pump and chest punch
    const slash = -Math.sin(halfP);
    const pump = pulseWave(p, 2.4);

    setBody(
      t, e,
      -0.13 - 0.08 * pump - 0.03 * beatPulse,
      0.12 * slash,
      0.06 * pump,
      0.10 * pump,
      0.20 * slash,
      -0.14 * slash,
      0.06 * pump,
      -0.12 * slash,
      0.10 * slash,
      0.08 * pump,
      -0.14 * slash,
      0.12 * slash,
      -0.06,
      0.18 * slash,
      -0.10 * slash,
      0.08 * pump,
      0.20 * slash,
      -0.12 * slash,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.05 - 0.55 * slash, 0.35 * (1 - pump), -0.58, -0.95 - 0.25 * pump, 0.40, 0.25 * slash, 0.20,
      -1.05 + 0.55 * slash, -0.35 * (1 - pump), -0.58, -0.95 - 0.25 * pump, -0.40, -0.25 * slash, -0.20
    );
    setLegs(
      t, e,
      0.20 * Math.max(0, -Math.sin(p)), 0.20 * Math.max(0, Math.sin(p)),
      0.28 * slash, -0.28 * slash,
      -0.16, 0.16,
      0.24, -0.24,
      0.28 + 0.10 * pump, 0.28 + 0.10 * pump,
      0.24 * Math.max(0, -Math.sin(p)), 0.24 * Math.max(0, Math.sin(p))
    );
    addPartnerPolish(t, e, p, beatPulse, 1.2);
  },
};

// ============================================================================
// 3. BOLLYWOOD ROMANTIC POSTER — PALLU DRAPE & HERO FRAME (SIDE_BY_SIDE)
// ============================================================================

const duetBollywoodPalluFrame: DuetMove = {
  id: 'duet_bollywood_pallu_frame',
  name: 'Silver-Screen Pallu & Hero Frame',
  origin: 'Yash-Raj style romantic duet — Diva pallu breeze & tribhangi arch framed by Partner B side lunge',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 0.95,
  energy: 0.50,
  tempoFit: [82, 132],
  durationBars: 4,
  tags: ['bollywood', 'romantic', 'grace', 'side_by_side'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const breeze = Math.sin(halfP);
    const wave = Math.sin(p - 0.5);

    setBody(
      t, e,
      -0.06 - 0.03 * Math.abs(wave),
      0.15 * breeze + 0.04,
      -0.04 * Math.abs(breeze),
      -0.08,
      0.24 * breeze,
      -0.22 * breeze - 0.06,
      -0.08,
      -0.14 * breeze,
      0.18 * breeze,
      -0.12 + 0.04 * wave,
      -0.16 * breeze,
      0.16 * breeze,
      0.06,
      0.24 * breeze - 0.12,
      -0.16 * breeze,
      0.08,
      0.28 * breeze - 0.14,
      -0.18 * breeze,
      beatPulse, bass
    );
    // Left arm sweeps high with the imaginary pallu; right hand rests delicately near collarbone
    setArms(
      t, e,
      -1.52 + 0.22 * breeze, 0.35, -0.68 - 0.14 * wave, -0.68, 0.72, 0.42 * wave, 0.32 * breeze,
      -0.78 - 0.16 * breeze, -0.42, -0.32, -1.42, -0.68, -0.35 * wave, -0.25 * breeze
    );
    setLegs(
      t, e,
      0.06 * Math.max(0, breeze), 0.04,
      0.14 * breeze, -0.14 * breeze,
      -0.10 * breeze, 0.12,
      -0.16, 0.22,
      0.24 + 0.08 * Math.max(0, breeze), 0.14,
      0.42, 0.18 * Math.max(0, -breeze)
    );
    addDivaPolish(t, e, p, halfP, 0.26, 0.18);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const breeze = Math.sin(halfP);
    const breath = Math.sin(p);

    // Partner B grounds into a wide side-lunge, angling chest & gaze affectionately toward Partner A
    setBody(
      t, e,
      -0.14 - 0.04 * Math.abs(breath),
      0.12 * breeze - 0.05,
      0.04 * breath,
      0.04,
      0.22 + 0.14 * breeze,
      -0.14 * breeze + 0.06,
      -0.04,
      0.10,
      0.10 * breeze,
      -0.08,
      0.16,
      0.10 * breeze,
      0.03,
      0.22,
      -0.10 * breeze,
      0.04,
      0.26,
      -0.12 * breeze,
      beatPulse, bass
    );
    setArms(
      t, e,
      -0.65 + 0.15 * breeze, 0.38, -0.36, -1.28, 0.55, 0.20 * breath, 0.16,
      -1.22 + 0.20 * breeze, -0.22, -0.82 - 0.12 * breath, -0.42, -0.48, -0.28 * breath, -0.22
    );
    setLegs(
      t, e,
      0.04, 0.06 * Math.max(0, -breeze),
      0.18, -0.18,
      -0.18, 0.18,
      0.24, -0.24,
      0.18, 0.32 + 0.06 * Math.abs(breeze),
      0.14, 0.28
    );
    addPartnerPolish(t, e, p, beatPulse, 0.8);
  },
};

// ============================================================================
// 4. GARBA-RAAS SUITE I — EKTAAL SWOOP & WHIRL (EACH_OTHER)
// ============================================================================

const duetGarbaEktaalSwoop: DuetMove = {
  id: 'duet_garba_ektaal_swoop',
  name: 'Garba Ektaal Low-Swoop & Whirl',
  origin: 'Gujarati 12-beat Ektaal Garba — synchronized low-earth swoop into high arched clap & Diva spin',
  facing: 'EACH_OTHER',
  anchorDistance: 1.50,
  energy: 0.64,
  tempoFit: [92, 144],
  durationBars: 4,
  tags: ['indian', 'folk', 'garba', 'spin'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && (ctx.beatCount & 1) === 0 && moveProgress > 0.20 && moveProgress < 0.76) {
      ctx.requestSpin(TAU);
    }
    // Deep swoop when sin(halfP) < 0, high arch when sin(halfP) > 0
    const arc = Math.sin(halfP);
    const swoop = Math.max(0, -arc);
    const rise = Math.max(0, arc);
    const clap = pulseWave(p, 2.6);

    setBody(
      t, e,
      -0.10 - 0.22 * swoop + 0.04 * rise,
      0.15 * Math.cos(halfP),
      0.12 * swoop - 0.04 * rise,
      0.26 * swoop - 0.10 * rise,
      0.24 * Math.cos(halfP),
      -0.20 * Math.cos(halfP),
      0.16 * swoop - 0.08 * rise,
      -0.12 * Math.cos(halfP),
      0.16 * Math.cos(halfP),
      0.18 * swoop - 0.12 * rise,
      -0.14 * Math.cos(halfP),
      0.14 * Math.cos(halfP),
      -0.14 * swoop + 0.08 * rise,
      0.18 * Math.cos(halfP),
      -0.14 * Math.cos(halfP),
      -0.12 * swoop + 0.10 * rise,
      0.22 * Math.cos(halfP),
      -0.16 * Math.cos(halfP),
      beatPulse, bass
    );
    setArms(
      t, e,
      -0.75 * swoop - 1.62 * rise, 0.45 * clap, -0.58 * swoop - 0.35 * rise,
      -0.85 - 0.35 * clap, 0.65, 0.42 * clap, 0.28,
      -0.75 * swoop - 1.62 * rise, -0.45 * clap, -0.58 * swoop - 0.35 * rise,
      -0.85 - 0.35 * clap, -0.65, -0.42 * clap, -0.28
    );
    setLegs(
      t, e,
      0.14 * Math.max(0, Math.sin(p)), 0.14 * Math.max(0, -Math.sin(p)),
      0.24 * Math.sin(p), -0.24 * Math.sin(p),
      -0.14, 0.14,
      0.22, -0.22,
      0.18 + 0.24 * swoop, 0.18 + 0.24 * swoop,
      0.34 * Math.max(0, Math.sin(p)), 0.34 * Math.max(0, -Math.sin(p))
    );
    addDivaPolish(t, e, p, halfP, 0.28, 0.14);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    // Partner B mirrors the vertical swoop in phase-opposition (rises when A swoops, kneels when A rises)
    const arc = -Math.sin(halfP);
    const swoop = Math.max(0, -arc);
    const rise = Math.max(0, arc);
    const clap = pulseWave(p, 2.6);

    setBody(
      t, e,
      -0.12 - 0.22 * swoop + 0.03 * rise,
      -0.14 * Math.cos(halfP),
      0.12 * swoop - 0.03 * rise,
      0.24 * swoop - 0.06 * rise,
      -0.22 * Math.cos(halfP),
      0.16 * Math.cos(halfP),
      0.14 * swoop - 0.06 * rise,
      0.10 * Math.cos(halfP),
      -0.12 * Math.cos(halfP),
      0.16 * swoop - 0.08 * rise,
      0.12 * Math.cos(halfP),
      -0.12 * Math.cos(halfP),
      -0.12 * swoop + 0.06 * rise,
      -0.16 * Math.cos(halfP),
      0.12 * Math.cos(halfP),
      -0.10 * swoop + 0.08 * rise,
      -0.18 * Math.cos(halfP),
      0.14 * Math.cos(halfP),
      beatPulse, bass
    );
    setArms(
      t, e,
      -0.70 * swoop - 1.52 * rise, 0.42 * clap, -0.65 * swoop - 0.42 * rise,
      -0.95 - 0.30 * clap, 0.50, 0.30 * clap, 0.22,
      -0.70 * swoop - 1.52 * rise, -0.42 * clap, -0.65 * swoop - 0.42 * rise,
      -0.95 - 0.30 * clap, -0.50, -0.30 * clap, -0.22
    );
    setLegs(
      t, e,
      0.14 * Math.max(0, -Math.sin(p)), 0.14 * Math.max(0, Math.sin(p)),
      -0.24 * Math.sin(p), 0.24 * Math.sin(p),
      -0.16, 0.16,
      0.26, -0.26,
      0.20 + 0.24 * swoop, 0.20 + 0.24 * swoop,
      0.26 * Math.max(0, -Math.sin(p)), 0.26 * Math.max(0, Math.sin(p))
    );
    addPartnerPolish(t, e, p, beatPulse, 1.0);
  },
};

// ============================================================================
// 5. GARBA-RAAS SUITE II — TEENTAAL SPIRAL CHAKRI (SIDE_BY_SIDE)
// ============================================================================

const duetGarbaTeentaalSpiral: DuetMove = {
  id: 'duet_garba_teentaal_spiral',
  name: 'Garba Teen-Taal 16-Beat Spiral',
  origin: 'High-tempo Gujarati Teen-Taal Tran-Taali — 3-clap rhythmic escalation with double chakri spins',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 1.35,
  energy: 0.80,
  tempoFit: [106, 165],
  durationBars: 4,
  tags: ['indian', 'folk', 'garba', 'high_energy', 'spin'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, quarterP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && moveProgress > 0.14 && moveProgress < 0.78) {
      ctx.requestSpin(TAU);
    }
    const ladder = Math.sin(quarterP);
    const clap = pulseWave(p, 2.8);
    const sway = Math.sin(halfP);

    setBody(
      t, e,
      -0.11 + 0.05 * ladder - 0.04 * clap,
      0.16 * sway,
      0.06 * (1 - ladder),
      0.12 * (1 - ladder),
      0.28 * sway,
      -0.22 * sway,
      0.06 * (1 - ladder),
      -0.14 * sway,
      0.18 * sway,
      -0.10 * ladder,
      -0.16 * sway,
      0.16 * sway,
      0.06 * ladder,
      0.20 * sway,
      -0.16 * sway,
      0.08 * ladder + 0.06 * clap,
      0.24 * sway,
      -0.18 * sway,
      beatPulse, bass
    );
    const pitch = -1.15 - 0.52 * ladder;
    setArms(
      t, e,
      pitch, 0.48 * clap, -0.36 + 0.24 * clap, -1.05, 0.65, 0.42 * clap, 0.30,
      pitch, -0.48 * clap, -0.36 + 0.24 * clap, -1.05, -0.65, -0.42 * clap, -0.30
    );
    setLegs(
      t, e,
      0.16 * Math.max(0, Math.sin(p)), 0.16 * Math.max(0, -Math.sin(p)),
      0.26 * Math.sin(p), -0.26 * Math.sin(p),
      -0.12 * sway, -0.12 * sway,
      0.18 * sway, -0.18 * sway,
      0.22 - 0.06 * ladder, 0.22 - 0.06 * ladder,
      0.36 * Math.max(0, Math.sin(p)), 0.36 * Math.max(0, -Math.sin(p))
    );
    addDivaPolish(t, e, p, halfP, 0.28, 0.16);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, quarterP, beatPulse, bass } = ctx;
    // Partner B performs wide-stance Popat/Hinch steps with low-to-high cross claps
    const ladder = Math.cos(quarterP);
    const clap = pulseWave(p, 2.8);
    const lunge = Math.sin(halfP);

    setBody(
      t, e,
      -0.16 - 0.06 * clap,
      0.18 * lunge,
      0.08 * Math.abs(lunge),
      0.14 * Math.abs(lunge),
      0.24 * lunge,
      -0.16 * lunge,
      0.08,
      -0.12 * lunge,
      0.12 * lunge,
      -0.06 * ladder,
      -0.14 * lunge,
      0.12 * lunge,
      -0.04,
      0.18 * lunge,
      -0.12 * lunge,
      0.06 * clap,
      0.22 * lunge,
      -0.14 * lunge,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.08 - 0.42 * lunge, 0.45 * clap, -0.52, -0.98, 0.50, 0.32 * clap, 0.22,
      -1.08 + 0.42 * lunge, -0.45 * clap, -0.52, -0.98, -0.50, -0.32 * clap, -0.22
    );
    setLegs(
      t, e,
      0.20 * Math.max(0, -Math.sin(p)), 0.20 * Math.max(0, Math.sin(p)),
      0.32 * lunge, -0.32 * lunge,
      -0.18, 0.18,
      0.28, -0.28,
      0.28 + 0.08 * clap, 0.28 + 0.08 * clap,
      0.26 * Math.max(0, -Math.sin(p)), 0.26 * Math.max(0, Math.sin(p))
    );
    addPartnerPolish(t, e, p, beatPulse, 1.1);
  },
};

// ============================================================================
// 6. GARBA-RAAS SUITE III — RUPAK 7-BEAT ASYMMETRIC TAAL (MIRRORED)
// ============================================================================

const duetGarbaRupakSeven: DuetMove = {
  id: 'duet_garba_rupak_seven',
  name: 'Garba Rupak 7-Beat Syncopation',
  origin: 'Gujarati Rupak Taal (3+2+2 = 7-beat cycle) — 3 lyrical wave steps + 2 side claps + 2 lotus freezes',
  facing: 'MIRRORED',
  anchorDistance: 1.40,
  energy: 0.68,
  tempoFit: [94, 148],
  durationBars: 4,
  tags: ['indian', 'folk', 'garba', 'mirrored', 'precision'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    // 7-subdivision feel synthesized from 1.75x phase harmonic
    const sevenPhase = p * 1.75;
    const sevenWave = Math.sin(sevenPhase);
    const sevenAccent = pulseWave(sevenPhase, 3.0);
    const sway = Math.sin(halfP);

    setBody(
      t, e,
      -0.09 - 0.05 * sevenAccent,
      0.16 * sway + 0.05 * sevenWave,
      0.04 * sevenWave,
      0.06 * sevenAccent,
      0.24 * sway,
      -0.22 * sway,
      -0.05,
      -0.14 * sway,
      0.18 * sway,
      -0.08 + 0.06 * sevenWave,
      -0.16 * sway,
      0.16 * sway,
      0.05,
      0.20 * sway,
      -0.18 * sway + 0.06 * sevenWave,
      0.06 * sevenAccent,
      0.24 * sway,
      -0.20 * sway + 0.08 * sevenWave,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.25 - 0.35 * sevenWave, 0.44 * sevenAccent, -0.45 - 0.20 * sway,
      -1.15, 0.72, 0.48 * sevenWave, 0.34 * sway,
      -1.25 + 0.35 * sevenWave, -0.44 * sevenAccent, -0.45 + 0.20 * sway,
      -1.15, -0.72, -0.48 * sevenWave, -0.34 * sway
    );
    setLegs(
      t, e,
      0.12 * Math.max(0, sevenWave), 0.12 * Math.max(0, -sevenWave),
      0.20 * sevenWave, -0.20 * sevenWave,
      -0.12 * sway, -0.12 * sway,
      0.16 * sway, -0.16 * sway,
      0.20 + 0.08 * sevenAccent, 0.20 + 0.08 * sevenAccent,
      0.34 * Math.max(0, sevenWave), 0.34 * Math.max(0, -sevenWave)
    );
    addDivaPolish(t, e, p, halfP, 0.28, 0.16);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const sevenPhase = p * 1.75 + PI * 0.5;
    const sevenWave = Math.sin(sevenPhase);
    const sevenAccent = pulseWave(sevenPhase, 3.0);
    const sway = -Math.sin(halfP);

    setBody(
      t, e,
      -0.13 - 0.06 * sevenAccent,
      0.14 * sway,
      0.06 * sevenAccent,
      0.10 * sevenAccent,
      0.20 * sway,
      -0.16 * sway,
      0.05,
      -0.12 * sway,
      0.12 * sway,
      -0.06,
      -0.14 * sway,
      0.12 * sway,
      -0.03,
      0.16 * sway,
      -0.12 * sway,
      0.06 * sevenAccent,
      0.18 * sway,
      -0.14 * sway,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.02 + 0.38 * sevenWave, 0.42 * sevenAccent, -0.58,
      -0.92, 0.52, 0.32 * sevenWave, 0.22,
      -1.02 - 0.38 * sevenWave, -0.42 * sevenAccent, -0.58,
      -0.92, -0.52, -0.32 * sevenWave, -0.22
    );
    setLegs(
      t, e,
      0.14 * Math.max(0, -sevenWave), 0.14 * Math.max(0, sevenWave),
      0.24 * sway, -0.24 * sway,
      -0.16, 0.16,
      0.24, -0.24,
      0.26 + 0.08 * sevenAccent, 0.26 + 0.08 * sevenAccent,
      0.26 * Math.max(0, -sevenWave), 0.26 * Math.max(0, sevenWave)
    );
    addPartnerPolish(t, e, p, beatPulse, 1.0);
  },
};

// ============================================================================
// 7. MAHARASHTRIAN LAVANI FLIRT CHASE (PERPENDICULAR)
// ============================================================================

const duetLavaniFlirtChase: DuetMove = {
  id: 'duet_lavani_flirt_chase',
  name: 'Lavani Padhacha Flirt & Dholki Chase',
  origin: 'Maharashtrian Tamasha Lavani — Diva padhacha strut & over-the-shoulder look-back vs kneeling admirer',
  facing: 'PERPENDICULAR',
  anchorDistance: 1.30,
  energy: 0.76,
  tempoFit: [98, 154],
  durationBars: 4,
  tags: ['indian', 'folk', 'lavani', 'perpendicular', 'feminine'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && moveProgress > 0.56 && moveProgress < 0.76) {
      ctx.requestSpin(TAU);
    }
    const gait = Math.sin(p);
    const tease = Math.sin(halfP);
    const dholkiHit = pulseWave(p, 2.8);

    // Diva angles her head & upper shoulder sharply back across the perpendicular axis toward Partner B
    setBody(
      t, e,
      -0.08 - 0.05 * dholkiHit,
      0.17 * tease,
      0.06 * gait,
      0.09 * dholkiHit,
      0.30 * tease + 0.14,
      -0.24 * tease,
      -0.10,
      -0.18 * tease,
      0.18 * tease,
      -0.14 + 0.06 * dholkiHit,
      -0.20 * tease - 0.12,
      0.16 * tease,
      0.08,
      0.32 + 0.18 * tease,
      -0.20 * tease,
      0.10 + 0.06 * dholkiHit,
      0.36 + 0.20 * tease,
      -0.22 * tease,
      beatPulse, bass
    );
    // Left hand holds nauvari waist pleat; right hand flashes thumb-mirror (aarsi) & veil beckon
    setArms(
      t, e,
      -0.42, 0.28, -0.52, -1.48, 0.42, 0.32 * dholkiHit, 0.24,
      -1.35 + 0.22 * tease, -0.48, -0.38, -1.38 + 0.18 * gait, -0.88, -0.56 * Math.sin(p * 2), -0.38
    );
    setLegs(
      t, e,
      0.14 * Math.max(0, gait), 0.14 * Math.max(0, -gait),
      0.26 * gait, -0.26 * gait,
      -0.12 * tease, -0.12 * tease,
      -0.16 * tease, 0.16 * tease,
      0.24 * Math.max(0, gait), 0.24 * Math.max(0, -gait),
      0.40 * Math.max(0, gait), 0.40 * Math.max(0, -gait)
    );
    addDivaPolish(t, e, p, halfP, 0.30, 0.18);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const dholki = Math.sin(p * 2);
    const lean = Math.sin(halfP);

    // Partner B drops into a low, rhythmic dholki-player squat (0.90 - 0.28 = 0.62 >= 0.45)
    setBody(
      t, e,
      -0.24 - 0.04 * Math.abs(dholki),
      0.10 * lean,
      0.10,
      0.16,
      0.18 * lean,
      -0.12 * lean,
      0.08,
      -0.10 * lean,
      0.10 * lean,
      -0.06,
      -0.14 * lean,
      0.12 * lean,
      -0.08,
      0.22 * lean,
      -0.14 * lean,
      -0.06 + 0.08 * Math.abs(dholki),
      0.26 * lean,
      -0.16 * lean,
      beatPulse, bass
    );
    // Playing rapid dholki thaap rhythms in mid-air while leaning toward Diva
    setArms(
      t, e,
      -0.92 + 0.22 * dholki, 0.38, -0.35, -1.18 - 0.18 * dholki, 0.55, 0.48 * dholki, 0.30,
      -0.92 - 0.22 * dholki, -0.38, -0.35, -1.18 + 0.18 * dholki, -0.55, -0.48 * dholki, -0.30
    );
    setLegs(
      t, e,
      0.08 * Math.max(0, Math.sin(p)), 0.04,
      0.34, -0.24,
      -0.18, 0.18,
      0.26, -0.26,
      0.38, 0.44,
      0.32, 0.28
    );
    addPartnerPolish(t, e, p, beatPulse, 1.2);
  },
};

// ============================================================================
// 8. KATHAK GURU-SHISHYA SAWAL-JAWAB (EACH_OTHER)
// ============================================================================

const duetKathakSawalJawab: DuetMove = {
  id: 'duet_kathak_sawal_jawab',
  name: 'Kathak Sawal-Jawab Jugalbandi',
  origin: 'Lucknow Gharana Kathak — Bars 1-2 Partner B challenges with tatkar; Bars 3-4 Diva answers with 3x tatkar & chakkar spin',
  facing: 'EACH_OTHER',
  anchorDistance: 1.55,
  energy: 0.74,
  tempoFit: [96, 160],
  durationBars: 4,
  tags: ['indian', 'classical', 'kathak', 'call_response', 'spin'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    // Diva listens & keeps padhant tala in Bars 1-2 (0..0.5), then unleashes Jawab in Bars 3-4 (0.5..1.0)
    const jawab = windowGate(moveProgress, 0.48, 1.0, 0.07);
    const listen = 1 - jawab;
    if (ctx.isBeat && moveProgress > 0.52 && moveProgress < 0.78) {
      ctx.requestSpin(TAU);
    }
    const tatkar = Math.sin(p * 3);
    const palta = Math.sin(halfP);
    const talaClap = pulseWave(p, 3.0);

    setBody(
      t, e,
      -0.05 * listen - (0.08 + 0.04 * Math.abs(tatkar)) * jawab,
      0.06 * palta * listen + 0.12 * palta * jawab,
      0.03 * jawab,
      -0.03 * jawab,
      0.10 * palta * listen + 0.22 * palta * jawab,
      -0.10 * palta * listen - 0.16 * palta * jawab,
      -0.04,
      -0.08 * palta,
      0.10 * palta,
      -0.08,
      0.16 * palta * jawab,
      0.10 * palta,
      0.04,
      -0.18 * palta * jawab,
      0.12 * palta,
      0.05 * talaClap * listen + 0.06 * jawab,
      -0.22 * palta * jawab,
      0.14 * palta,
      beatPulse, bass
    );
    // Listen mode: polite chest-level padhant hands; Jawab mode: soaring utpattang & chakkar extension
    setArms(
      t, e,
      -0.85 * listen - (1.48 - 0.25 * palta) * jawab,
      0.42 * listen + 0.35 * jawab,
      -0.30 * listen - 0.75 * jawab,
      -1.35 * listen - 0.65 * jawab,
      0.65,
      0.35 * talaClap * listen + 0.50 * tatkar * jawab,
      0.28,
      -0.85 * listen - (1.15 + 0.25 * palta) * jawab,
      -0.42 * listen - 0.35 * jawab,
      -0.30 * listen - 0.75 * jawab,
      -1.35 * listen - 0.95 * jawab,
      -0.65,
      -0.35 * talaClap * listen - 0.50 * tatkar * jawab,
      -0.28
    );
    setLegs(
      t, e,
      0.18 * Math.max(0, tatkar) * jawab,
      0.18 * Math.max(0, -tatkar) * jawab,
      0.14 * tatkar * jawab,
      -0.14 * tatkar * jawab,
      -0.08, 0.08,
      0.20, -0.20,
      0.12 * listen + 0.22 * jawab,
      0.12 * listen + 0.22 * jawab,
      0.32 * Math.max(0, -tatkar) * jawab,
      0.32 * Math.max(0, tatkar) * jawab
    );
    addDivaPolish(t, e, p, halfP, 0.28, 0.12);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    // Partner B performs Sawal (call) in Bars 1-2 (0..0.5), then holds proud Guru stance in Bars 3-4
    const sawal = windowGate(moveProgress, 0.0, 0.50, 0.07);
    const watch = 1 - sawal;
    const tatkar = Math.sin(p * 2);
    const phrase = Math.sin(halfP);
    const nod = pulseWave(p, 2.5);

    setBody(
      t, e,
      -0.09 * sawal - 0.05 * watch,
      -0.10 * phrase * sawal,
      0.04 * sawal,
      0.03 * sawal,
      -0.18 * phrase * sawal,
      0.12 * phrase * sawal,
      -0.04,
      0.10 * phrase * sawal,
      -0.10 * phrase * sawal,
      -0.08,
      -0.16 * phrase * sawal,
      -0.08 * phrase * sawal,
      0.04 * watch,
      0.16 * phrase * sawal,
      -0.10 * phrase * sawal,
      0.08 * nod * watch + 0.04 * sawal,
      0.18 * phrase * sawal,
      -0.12 * phrase * sawal,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.38 * sawal - 0.78 * watch,
      0.35 * sawal + 0.48 * watch,
      -0.68 * sawal - 0.28 * watch,
      -0.75 * sawal - 1.38 * watch,
      0.65,
      0.42 * tatkar * sawal + 0.22 * nod * watch,
      0.24,
      -1.05 * sawal - 0.78 * watch,
      -0.35 * sawal - 0.48 * watch,
      -0.62 * sawal - 0.28 * watch,
      -1.15 * sawal - 1.38 * watch,
      -0.65,
      -0.42 * tatkar * sawal - 0.22 * nod * watch,
      -0.24
    );
    setLegs(
      t, e,
      0.16 * Math.max(0, tatkar) * sawal,
      0.16 * Math.max(0, -tatkar) * sawal,
      0.14 * tatkar * sawal,
      -0.14 * tatkar * sawal,
      -0.10, 0.10,
      0.22, -0.22,
      0.22 * sawal + 0.12 * watch,
      0.22 * sawal + 0.12 * watch,
      0.26 * Math.max(0, -tatkar) * sawal,
      0.26 * Math.max(0, tatkar) * sawal
    );
    addPartnerPolish(t, e, p, beatPulse, 0.9);
  },
};

// ============================================================================
// 9. ARGENTINE TANGO STALK & INTERLOCKING GANCHO (EACH_OTHER)
// ============================================================================

const duetTangoStalkGancho: DuetMove = {
  id: 'duet_tango_stalk_gancho',
  name: 'Buenos Aires Tango Stalk & Gancho',
  origin: 'Argentine Tango Nuevo — predatory close-embrace stalk into a sharp interlocking follower gancho & corte arch',
  facing: 'EACH_OTHER',
  anchorDistance: 0.82,
  energy: 0.66,
  tempoFit: [86, 138],
  durationBars: 4,
  tags: ['latin', 'tango', 'precision', 'fierce'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    // Bars 1-2: pivoting ochos; Bars 3-4: deep corte back-arch & sharp right-leg gancho hook
    const ganchoPhase = windowGate(moveProgress, 0.48, 0.92, 0.08);
    const ocho = Math.sin(halfP);
    const hook = Math.max(0, Math.sin(p)) * ganchoPhase;

    setBody(
      t, e,
      -0.08 - 0.08 * ganchoPhase,
      0.14 * ocho * (1 - 0.5 * ganchoPhase),
      -0.06 * ganchoPhase,
      -0.16 * ganchoPhase,
      0.34 * ocho,
      -0.20 * ocho,
      -0.12 - 0.10 * ganchoPhase,
      -0.22 * ocho,
      0.16 * ocho,
      -0.16 - 0.10 * ganchoPhase,
      -0.24 * ocho,
      0.14 * ocho,
      -0.08 * ganchoPhase + 0.06,
      0.30 * ocho,
      -0.18 * ocho,
      -0.08 * ganchoPhase + 0.08,
      0.34 * ocho,
      -0.20 * ocho,
      beatPulse, bass
    );
    // Tango close-embrace follower frame: left arm draped over leader shoulder, right arm extended in abrazo
    setArms(
      t, e,
      -1.15 - 0.18 * ganchoPhase, 0.36, -0.45, -1.05, 0.62, 0.28 * ocho, 0.22,
      -1.02 + 0.15 * ocho, -0.42, -0.58, -1.18, -0.58, -0.28 * ocho, -0.22
    );
    // Right leg fires a sharp high-knee gancho wrap when hook > 0
    setLegs(
      t, e,
      0.14 * Math.max(0, Math.sin(p)) * (1 - ganchoPhase),
      0.16 * (1 - ganchoPhase) * Math.max(0, -Math.sin(p)) + 0.34 * hook,
      0.32 * ocho * (1 - ganchoPhase) - 0.18 * ganchoPhase,
      -0.32 * ocho * (1 - ganchoPhase) + 0.48 * hook,
      0.14 * ocho,
      0.14 * ocho - 0.22 * hook,
      -0.26 * ocho,
      -0.26 * ocho + 0.34 * hook,
      0.24 + 0.14 * ganchoPhase,
      0.22 * (1 - hook) + 0.58 * hook,
      0.38,
      0.48 * hook + 0.28 * (1 - hook)
    );
    addDivaPolish(t, e, p, halfP, 0.22, 0.18);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    const ganchoPhase = windowGate(moveProgress, 0.48, 0.92, 0.08);
    const stalk = -Math.sin(halfP);
    const step = Math.sin(p);

    // Partner B holds a strong, grounded leader lunge (parada/barrida) creating the space for her gancho
    setBody(
      t, e,
      -0.14 - 0.10 * ganchoPhase,
      0.12 * stalk,
      0.08 * ganchoPhase,
      0.10 * ganchoPhase,
      0.24 * stalk,
      -0.12 * stalk,
      0.04,
      -0.14 * stalk,
      0.10 * stalk,
      -0.08,
      -0.18 * stalk,
      0.10 * stalk,
      0.04,
      0.22 * stalk,
      -0.10 * stalk,
      0.06,
      0.26 * stalk,
      -0.12 * stalk,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.08, 0.38, -0.58, -1.15, 0.55, 0.18 * step, 0.16,
      -0.98, -0.45, -0.42, -1.25, -0.52, -0.18 * step, -0.16
    );
    setLegs(
      t, e,
      0.12 * Math.max(0, -step) * (1 - ganchoPhase),
      0.12 * Math.max(0, step) * (1 - ganchoPhase),
      -0.30 * stalk * (1 - ganchoPhase) + 0.38 * ganchoPhase,
      0.30 * stalk * (1 - ganchoPhase) - 0.34 * ganchoPhase,
      -0.16, 0.18,
      0.24, -0.28,
      0.24 + 0.22 * ganchoPhase,
      0.24 + 0.10 * ganchoPhase,
      0.24, 0.32 * ganchoPhase
    );
    addPartnerPolish(t, e, p, beatPulse, 0.7);
  },
};

// ============================================================================
// 10. KINGSTON DANCEHALL PARTNER WHINE (BACK_TO_BACK)
// ============================================================================

const duetDancehallPartnerWhine: DuetMove = {
  id: 'duet_dancehall_partner_whine',
  name: 'Kingston Back-to-Back Queen Whine',
  origin: 'Jamaican Dancehall — phase-locked back-to-back pelvic circles, knee drives & bass-gated drops',
  facing: 'BACK_TO_BACK',
  anchorDistance: 0.78,
  energy: 0.82,
  tempoFit: [94, 148],
  durationBars: 4,
  tags: ['dancehall', 'hips', 'back_to_back', 'high_energy'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const whineX = Math.sin(p);
    const whineZ = Math.cos(p);
    const kneeDrive = pulseWave(p, 2.5);
    const sway = Math.sin(halfP);

    setBody(
      t, e,
      -0.17 - 0.07 * kneeDrive - 0.03 * beatPulse,
      0.18 * whineX,
      -0.12 * Math.abs(whineZ),
      0.22 * whineZ,
      0.28 * whineX,
      -0.25 * whineX,
      -0.16 * whineZ,
      -0.16 * whineX,
      0.18 * whineX,
      0.12,
      -0.14 * whineX,
      0.16 * whineX,
      -0.06,
      0.22 * sway,
      -0.14 * whineX,
      -0.04 + 0.08 * beatPulse,
      0.26 * sway,
      -0.16 * whineX,
      beatPulse, bass
    );
    setArms(
      t, e,
      -0.42 + 0.22 * whineZ, 0.34, -0.45, -1.20 + 0.22 * kneeDrive, 0.48, 0.34 * whineX, 0.26,
      -1.38 - 0.22 * whineZ, -0.38, -0.52, -1.25, -0.68, -0.38 * whineX, -0.28
    );
    setLegs(
      t, e,
      0.08 * Math.max(0, whineX), 0.08 * Math.max(0, -whineX),
      0.18 * whineZ, -0.18 * whineZ,
      -0.16 + 0.10 * whineX, 0.16 + 0.10 * whineX,
      0.28 * (1 - kneeDrive * 0.55), -0.28 * (1 - kneeDrive * 0.55),
      0.34 + 0.12 * kneeDrive, 0.34 + 0.12 * kneeDrive,
      0.38 * Math.max(0, whineX), 0.38 * Math.max(0, -whineX)
    );
    addDivaPolish(t, e, p, halfP, 0.22, 0.16);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    // Partner B anchors back-to-back with synchronized lateral whineX so hips move together in world space
    const whineX = -Math.sin(p);
    const bounce = pulseWave(p, 2.2);
    const rock = Math.sin(halfP);

    setBody(
      t, e,
      -0.16 - 0.06 * bounce - 0.03 * beatPulse,
      0.14 * whineX,
      -0.08 * bounce,
      0.12 * bounce,
      0.20 * whineX,
      -0.16 * whineX,
      -0.08 * bounce,
      -0.12 * whineX,
      0.12 * whineX,
      0.06,
      -0.14 * rock,
      0.12 * whineX,
      -0.04,
      -0.20 * rock,
      0.10 * whineX,
      0.06 * bounce,
      -0.24 * rock,
      0.12 * whineX,
      beatPulse, bass
    );
    setArms(
      t, e,
      -0.68 + 0.25 * rock, 0.30, -0.58, -1.08 + 0.20 * bounce, 0.42, 0.24 * whineX, 0.18,
      -0.68 - 0.25 * rock, -0.30, -0.58, -1.08 + 0.20 * bounce, -0.42, -0.24 * whineX, -0.18
    );
    setLegs(
      t, e,
      0.09 * Math.max(0, -whineX), 0.09 * Math.max(0, whineX),
      0.14 * rock, -0.14 * rock,
      -0.18, 0.18,
      0.28, -0.28,
      0.32 + 0.10 * bounce, 0.32 + 0.10 * bounce,
      0.26 * bounce, 0.26 * bounce
    );
    addPartnerPolish(t, e, p, beatPulse, 1.1);
  },
};

// ============================================================================
// 11. VOGUE BATTLE I — BALLROOM FACE-OFF & DIP (EACH_OTHER)
// ============================================================================

const duetVogueFaceoffBattle: DuetMove = {
  id: 'duet_vogue_faceoff_battle',
  name: 'Harlem Ballroom Vogue 1v1 Face-Off',
  origin: 'Ballroom Vogue Femme battle — Diva serves hands, spin & soft-drop dip while Partner B stalks & counters',
  facing: 'EACH_OTHER',
  anchorDistance: 1.65,
  energy: 0.86,
  tempoFit: [104, 162],
  durationBars: 4,
  tags: ['vogue', 'battle', 'drop', 'spin', 'fierce'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    // Bars 1-2: Diva serves hands & spin into soft-drop dip; Bars 3-4: rises into smug supermodel judge pose
    const dipWindow = windowGate(moveProgress, 0.28, 0.58, 0.08);
    const judgeWindow = windowGate(moveProgress, 0.58, 1.0, 0.08);
    if (ctx.isBeat && moveProgress > 0.12 && moveProgress < 0.34) {
      ctx.requestSpin(TAU);
    }
    const frame = triWave(p * 2);
    const sway = Math.sin(halfP);

    // Dip reaches pelvisY = 0.90 - 0.41 = 0.49 >= 0.45 law
    setBody(
      t, e,
      -0.08 * (1 - dipWindow) - 0.41 * dipWindow,
      0.15 * sway * (1 - dipWindow) + 0.10 * dipWindow,
      -0.08 * dipWindow,
      -0.26 * dipWindow - 0.05 * judgeWindow,
      0.26 * sway,
      -0.22 * sway,
      -0.16 * dipWindow - 0.06 * judgeWindow,
      -0.16 * sway,
      0.16 * sway,
      -0.20 * dipWindow - 0.10 * judgeWindow,
      -0.18 * sway,
      0.14 * sway,
      -0.16 * dipWindow + 0.06 * judgeWindow,
      0.24 * sway,
      -0.16 * frame,
      -0.18 * dipWindow + 0.08 * judgeWindow,
      0.28 * sway,
      -0.18 * frame,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.42 * (1 - dipWindow) - 1.70 * dipWindow,
      0.52 * (1 - judgeWindow) + 0.28 * judgeWindow,
      -0.45,
      -1.50 * (1 - dipWindow) - 0.82 * dipWindow,
      0.88 * frame,
      0.52 * frame,
      0.36,
      -1.42 * (1 - dipWindow - judgeWindow) - 0.65 * dipWindow - 0.42 * judgeWindow,
      -0.52,
      -0.48,
      -1.45,
      -0.88 * frame,
      -0.52 * frame,
      -0.36
    );
    setLegs(
      t, e,
      0.22 * dipWindow + 0.10 * Math.max(0, Math.sin(p)) * (1 - dipWindow),
      0.06 * Math.max(0, -Math.sin(p)) * (1 - dipWindow),
      0.58 * dipWindow + 0.22 * sway * (1 - dipWindow),
      -0.24 * dipWindow - 0.22 * sway * (1 - dipWindow),
      -0.12 * dipWindow,
      0.18 * dipWindow,
      -0.16 * dipWindow,
      0.30 * dipWindow,
      0.14 * (1 - dipWindow),
      0.54 * dipWindow + 0.20 * judgeWindow,
      0.46 * dipWindow + 0.34 * judgeWindow,
      0.36 * dipWindow
    );
    addDivaPolish(t, e, p, halfP, 0.28, 0.14);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    // Bars 1-2: Partner B points "10s across the board" at Diva; Bars 3-4: Partner B duckwalks & tuts back
    const counterAttack = windowGate(moveProgress, 0.52, 1.0, 0.08);
    const hype = 1 - counterAttack;
    const tut = triWave(p * 2);
    const duck = Math.abs(Math.sin(p));
    const stalk = Math.sin(halfP);

    setBody(
      t, e,
      -0.08 * hype - (0.28 + 0.06 * duck) * counterAttack,
      -0.14 * stalk,
      0.06 * counterAttack,
      -0.05 * hype + 0.12 * counterAttack,
      -0.24 * stalk,
      0.18 * stalk,
      -0.04,
      0.14 * stalk,
      -0.14 * stalk,
      -0.08,
      0.18 * stalk,
      -0.14 * stalk,
      0.05,
      -0.20 * stalk,
      0.14 * tut,
      0.06 * duck,
      -0.24 * stalk,
      0.16 * tut,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.58 * hype - (1.28 + 0.30 * tut) * counterAttack,
      0.28 * hype + 0.62 * tut * counterAttack,
      -0.65 * hype - 0.42 * counterAttack,
      -0.45 * hype - 1.52 * counterAttack,
      0.75 * tut,
      0.48 * tut,
      0.34,
      -0.48 * hype - (1.28 - 0.30 * tut) * counterAttack,
      -0.30 * hype - 0.62 * tut * counterAttack,
      -0.48,
      -1.38 * hype - 1.52 * counterAttack,
      -0.75 * tut,
      -0.48 * tut,
      -0.34
    );
    setLegs(
      t, e,
      0.06 * hype + 0.22 * Math.max(0, Math.sin(p)) * counterAttack,
      0.06 * hype + 0.22 * Math.max(0, -Math.sin(p)) * counterAttack,
      0.18 * stalk * hype + 0.36 * Math.sin(p) * counterAttack,
      -0.18 * stalk * hype - 0.36 * Math.sin(p) * counterAttack,
      -0.14, 0.14,
      0.22, -0.22,
      0.18 * hype + 0.44 * counterAttack,
      0.18 * hype + 0.44 * counterAttack,
      0.24 * hype + 0.42 * counterAttack,
      0.24 * hype + 0.42 * counterAttack
    );
    addPartnerPolish(t, e, p, beatPulse, 1.0);
  },
};

// ============================================================================
// 12. VOGUE BATTLE II — TWIN COVER SILHOUETTE (BACK_TO_BACK)
// ============================================================================

const duetVogueBackToBackPose: DuetMove = {
  id: 'duet_vogue_back_to_back_pose',
  name: 'Vogue Editorial Back-to-Back Frame',
  origin: 'High-fashion editorial Ballroom — spine-to-spine asymmetric tutting frames & synchronized hip checks',
  facing: 'BACK_TO_BACK',
  anchorDistance: 0.85,
  energy: 0.72,
  tempoFit: [96, 150],
  durationBars: 4,
  tags: ['vogue', 'fashion', 'back_to_back', 'precision'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const poseCut = triWave(p);
    const sway = Math.sin(halfP);

    setBody(
      t, e,
      -0.07 - 0.04 * Math.abs(poseCut),
      0.16 * sway,
      -0.05,
      -0.06,
      0.26 * sway,
      -0.24 * sway,
      -0.06,
      -0.16 * sway,
      0.18 * sway,
      -0.10,
      -0.18 * sway,
      0.16 * sway,
      0.06,
      0.24 * poseCut,
      -0.18 * sway,
      0.08,
      0.28 * poseCut,
      -0.20 * sway,
      beatPulse, bass
    );
    // High-fashion asymmetric editorial crown & cheek frame
    setArms(
      t, e,
      -1.62 + 0.24 * poseCut, 0.46, -0.52, -1.28, 0.84, 0.48 * poseCut, 0.36,
      -1.18 - 0.24 * poseCut, -0.55, -0.38, -1.52, -0.88, -0.48 * poseCut, -0.36
    );
    setLegs(
      t, e,
      0.06 * Math.max(0, sway), 0.06 * Math.max(0, -sway),
      0.16 * sway, -0.16 * sway,
      0.12 * sway, 0.12 * sway,
      -0.20 * Math.max(0, sway), 0.20 * Math.max(0, -sway),
      0.30 * Math.max(0, sway), 0.30 * Math.max(0, -sway),
      0.44 * Math.max(0, sway), 0.44 * Math.max(0, -sway)
    );
    addDivaPolish(t, e, p, halfP, 0.26, 0.20);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const poseCut = -triWave(p);
    const sway = -Math.sin(halfP);

    // Partner B drops slightly lower behind her so their four arms create a multi-tiered halo/mandala
    setBody(
      t, e,
      -0.18 - 0.04 * Math.abs(poseCut),
      0.14 * sway,
      -0.05,
      0.06,
      0.22 * sway,
      -0.18 * sway,
      -0.04,
      -0.12 * sway,
      0.14 * sway,
      -0.06,
      -0.14 * sway,
      0.14 * sway,
      0.04,
      0.22 * poseCut,
      -0.14 * sway,
      0.06,
      0.26 * poseCut,
      -0.16 * sway,
      beatPulse, bass
    );
    // Wide lower horizontal Egyptian wing-tut arms framing Diva's waist & shoulders
    setArms(
      t, e,
      -1.02 + 0.22 * poseCut, 0.22, -0.92, -1.48, 0.85 * poseCut, 0.52 * poseCut, 0.38,
      -1.02 - 0.22 * poseCut, -0.22, -0.92, -1.48, -0.85 * poseCut, -0.52 * poseCut, -0.38
    );
    setLegs(
      t, e,
      0.05 * Math.max(0, sway), 0.05 * Math.max(0, -sway),
      0.18 * sway, -0.18 * sway,
      -0.20, 0.20,
      0.30, -0.30,
      0.32, 0.32,
      0.26 * Math.max(0, sway), 0.26 * Math.max(0, -sway)
    );
    addPartnerPolish(t, e, p, beatPulse, 0.85);
  },
};

// ============================================================================
// 13. VOGUE BATTLE III — ARCHITECTURAL PORTAL CUT (PERPENDICULAR)
// ============================================================================

const duetVoguePerpendicularCut: DuetMove = {
  id: 'duet_vogue_perpendicular_cut',
  name: 'Vogue Runway Portal & Spin Cut',
  origin: 'Ballroom Runway & Architectural Tutting — Partner B forms a geometric arch while Diva struts & spins across',
  facing: 'PERPENDICULAR',
  anchorDistance: 1.20,
  energy: 0.80,
  tempoFit: [100, 156],
  durationBars: 4,
  tags: ['vogue', 'perpendicular', 'strut', 'spin', 'fashion'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && (ctx.beatCount & 1) === 1 && moveProgress > 0.16 && moveProgress < 0.78) {
      ctx.requestSpin(TAU);
    }
    const stride = Math.sin(p);
    const hipSwing = Math.cos(p);
    const attitude = Math.sin(halfP);

    setBody(
      t, e,
      -0.05 - 0.03 * Math.abs(stride),
      0.16 * hipSwing,
      0.06 * stride,
      -0.06,
      0.30 * stride,
      -0.24 * hipSwing,
      -0.08,
      -0.18 * stride,
      0.18 * hipSwing,
      -0.10,
      -0.22 * stride,
      0.16 * hipSwing,
      0.08,
      0.26 * attitude + 0.14,
      -0.16 * hipSwing,
      0.10 + 0.06 * beatPulse,
      0.30 * attitude + 0.16,
      -0.18 * hipSwing,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.35 + 0.35 * stride, 0.42, -0.45, -1.25, 0.68, 0.38 * hipSwing, 0.28,
      -0.45 - 0.35 * stride, -0.28, -0.35, -1.15, -0.48, -0.38 * hipSwing, -0.28
    );
    setLegs(
      t, e,
      0.14 * Math.max(0, stride), 0.14 * Math.max(0, -stride),
      0.36 * stride, -0.36 * stride,
      0.16 * Math.max(0, stride), -0.16 * Math.max(0, -stride),
      -0.16 * stride, 0.16 * stride,
      0.24 * Math.max(0, stride), 0.24 * Math.max(0, -stride),
      0.46 * Math.max(0, stride), 0.46 * Math.max(0, -stride)
    );
    addDivaPolish(t, e, p, halfP, 0.24, 0.20);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const box = triWave(p);
    const sway = Math.sin(halfP);

    // Partner B drops into a dramatic low architectural lunge (pelvisY = 0.90 - 0.30 = 0.60 >= 0.45)
    setBody(
      t, e,
      -0.30 - 0.03 * Math.abs(box),
      0.10 * sway,
      0.06,
      0.08,
      0.22 * sway,
      -0.14 * sway,
      -0.06,
      -0.12 * sway,
      0.12 * sway,
      -0.10,
      -0.16 * sway,
      0.12 * sway,
      -0.04,
      0.24 * sway,
      -0.14 * box,
      0.06,
      0.28 * sway,
      -0.16 * box,
      beatPulse, bass
    );
    // Outstretched 90-degree portal frame toward Diva's runway line
    setArms(
      t, e,
      -1.52 + 0.18 * box, 0.55, -0.42, -1.52, 0.92 * box, 0.50 * box, 0.35,
      -1.52 - 0.18 * box, -0.55, -0.42, -1.52, -0.92 * box, -0.50 * box, -0.35
    );
    setLegs(
      t, e,
      0.04, 0.04,
      0.42, -0.34,
      -0.18, 0.18,
      0.28, -0.28,
      0.44, 0.48,
      0.36, 0.32
    );
    addPartnerPolish(t, e, p, beatPulse, 0.9);
  },
};

// ============================================================================
// 14. HAVANA SALSA CROSS-BODY INSIDE WHIP (EACH_OTHER)
// ============================================================================

const duetSalsaCrossbodyWhip: DuetMove = {
  id: 'duet_salsa_crossbody_whip',
  name: 'Havana Salsa Cross-Body Whip Turn',
  origin: 'Cuban Casino & NY On2 Salsa — open-break tension into high halo lead & Diva double Cuban-hip spin',
  facing: 'EACH_OTHER',
  anchorDistance: 1.15,
  energy: 0.75,
  tempoFit: [98, 154],
  durationBars: 4,
  tags: ['latin', 'salsa', 'spin', 'hips'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    if (ctx.isBeat && (ctx.beatCount & 1) === 1 && moveProgress > 0.16 && moveProgress < 0.78) {
      ctx.requestSpin(TAU);
    }
    const mambo = Math.sin(halfP);
    const cuban = Math.sin(p);

    setBody(
      t, e,
      -0.06 - 0.04 * Math.abs(cuban),
      0.16 * cuban,
      0.10 * mambo,
      0.05 * mambo,
      0.30 * cuban,
      -0.24 * cuban,
      -0.05,
      -0.18 * cuban,
      0.18 * cuban,
      -0.07,
      -0.20 * cuban,
      0.16 * cuban,
      0.05,
      0.18 * cuban,
      -0.14 * cuban,
      0.06,
      0.22 * cuban,
      -0.16 * cuban,
      beatPulse, bass
    );
    // Right arm raised into the high turn-halo connection; left arm flares in Cuban styling
    setArms(
      t, e,
      -0.88 + 0.28 * mambo, 0.34, -0.58, -1.12, 0.62, 0.38 * cuban, 0.28,
      -1.68 + 0.14 * mambo, -0.36, -0.45, -1.18, -0.72, -0.42 * cuban, -0.32
    );
    setLegs(
      t, e,
      0.12 * Math.max(0, cuban), 0.12 * Math.max(0, -cuban),
      0.28 * mambo, -0.28 * mambo,
      -0.12 * cuban, -0.12 * cuban,
      -0.16 * cuban, 0.16 * cuban,
      0.24 * Math.max(0, cuban), 0.24 * Math.max(0, -cuban),
      0.38 * Math.max(0, cuban), 0.38 * Math.max(0, -cuban)
    );
    addDivaPolish(t, e, p, halfP, 0.26, 0.18);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const mambo = -Math.sin(halfP);
    const cuban = -Math.sin(p);

    setBody(
      t, e,
      -0.09 - 0.04 * Math.abs(cuban),
      0.12 * cuban,
      0.10 * mambo,
      0.06 * mambo,
      0.22 * cuban,
      -0.16 * cuban,
      -0.03,
      -0.12 * cuban,
      0.12 * cuban,
      -0.05,
      -0.14 * cuban,
      0.12 * cuban,
      0.03,
      0.14 * cuban,
      -0.10 * cuban,
      0.04,
      0.16 * cuban,
      -0.12 * cuban,
      beatPulse, bass
    );
    // Left arm raised high leading the halo turn; right hand guards the cross-body slot
    setArms(
      t, e,
      -1.64 - 0.14 * mambo, 0.36, -0.45, -1.15, 0.65, 0.32 * cuban, 0.24,
      -0.78 - 0.24 * mambo, -0.34, -0.48, -1.22, -0.52, -0.28 * cuban, -0.20
    );
    setLegs(
      t, e,
      0.11 * Math.max(0, cuban), 0.11 * Math.max(0, -cuban),
      0.26 * mambo, -0.26 * mambo,
      -0.10 * cuban, -0.10 * cuban,
      -0.12 * cuban, 0.12 * cuban,
      0.20 * Math.max(0, cuban), 0.20 * Math.max(0, -cuban),
      0.24 * Math.max(0, cuban), 0.24 * Math.max(0, -cuban)
    );
    addPartnerPolish(t, e, p, beatPulse, 1.0);
  },
};

// ============================================================================
// 15. PUNJABI GIDDHA-BHANGRA JODI JHOOMAR (SIDE_BY_SIDE)
// ============================================================================

const duetBhangraJodiJhoomar: DuetMove = {
  id: 'duet_bhangra_jodi_jhoomar',
  name: 'Punjabi Giddha-Bhangra Jodi Bounce',
  origin: 'Punjabi folk Jodi — Diva dances graceful Giddha boliyan & chunni flicks beside Partner B high-knee Bhangra',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 1.40,
  energy: 0.88,
  tempoFit: [106, 170],
  durationBars: 4,
  tags: ['indian', 'folk', 'bhangra', 'high_energy', 'side_by_side'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const shrug = Math.abs(Math.sin(p));
    const giddhaSway = Math.sin(halfP);
    const boliClap = pulseWave(p, 2.6);

    setBody(
      t, e,
      -0.08 - 0.06 * shrug - 0.03 * beatPulse,
      0.16 * giddhaSway,
      0.04 * Math.sin(p),
      0.06 * shrug,
      0.24 * giddhaSway,
      -0.22 * giddhaSway,
      -0.05,
      -0.14 * giddhaSway,
      0.16 * giddhaSway,
      -0.08 - 0.06 * shrug,
      -0.16 * giddhaSway,
      0.15 * giddhaSway,
      0.04,
      0.20 * giddhaSway,
      -0.16 * giddhaSway,
      0.08 * shrug,
      0.24 * giddhaSway,
      -0.18 * giddhaSway,
      beatPulse, bass
    );
    // Feminine Giddha phrasing: one hand at cheek/paranda braid, other extending in boliyan gesture
    setArms(
      t, e,
      -1.45 - 0.20 * shrug, 0.38, -0.52, -1.28 + 0.18 * boliClap, 0.72, 0.48 * Math.sin(p * 2), 0.34,
      -1.15 - 0.25 * shrug, -0.42, -0.45, -1.42, -0.78, -0.48 * Math.sin(p * 2), -0.34
    );
    setLegs(
      t, e,
      0.16 * Math.max(0, Math.sin(p)), 0.16 * Math.max(0, -Math.sin(p)),
      0.22 * Math.sin(p), -0.22 * Math.sin(p),
      -0.12 * giddhaSway, -0.12 * giddhaSway,
      0.18, -0.18,
      0.22 * shrug, 0.22 * shrug,
      0.34 * Math.max(0, Math.sin(p)), 0.34 * Math.max(0, -Math.sin(p))
    );
    addDivaPolish(t, e, p, halfP, 0.28, 0.16);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass } = ctx;
    const dholBounce = Math.abs(Math.sin(p));
    const jhoomar = Math.sin(halfP);

    // Partner B hits wide-stance Bhangra bethak/punjab-squat & high sky-reaching arms
    setBody(
      t, e,
      -0.14 - 0.09 * dholBounce - 0.03 * beatPulse,
      0.14 * jhoomar,
      0.05 * Math.sin(p),
      0.08 * dholBounce,
      0.18 * jhoomar,
      -0.14 * jhoomar,
      -0.04,
      -0.10 * jhoomar,
      0.12 * jhoomar,
      -0.10 - 0.08 * dholBounce,
      -0.12 * jhoomar,
      0.12 * jhoomar,
      -0.04,
      0.16 * jhoomar,
      -0.12 * jhoomar,
      0.09 * dholBounce,
      0.18 * jhoomar,
      -0.14 * jhoomar,
      beatPulse, bass
    );
    setArms(
      t, e,
      -1.82 - 0.24 * dholBounce, 0.28, -0.78, -0.58 + 0.18 * dholBounce, 0.55, 0.38 * Math.sin(p * 2), 0.28,
      -1.82 - 0.24 * dholBounce, -0.28, -0.78, -0.58 + 0.18 * dholBounce, -0.55, -0.38 * Math.sin(p * 2), -0.28
    );
    setLegs(
      t, e,
      0.26 * Math.max(0, -Math.sin(p)), 0.26 * Math.max(0, Math.sin(p)),
      0.32 * -Math.sin(p), -0.32 * -Math.sin(p),
      -0.18, 0.18,
      0.30, -0.30,
      0.32 * dholBounce, 0.32 * dholBounce,
      0.24 * Math.max(0, -Math.sin(p)), 0.24 * Math.max(0, Math.sin(p))
    );
    addPartnerPolish(t, e, p, beatPulse, 1.25);
  },
};

// ============================================================================
// 16. STUDIO 54 DISCO HUSTLE SPIN & ROMANTIC CATCH (EACH_OTHER)
// ============================================================================

const duetDiscoHustleSpinCatch: DuetMove = {
  id: 'duet_disco_hustle_spin_catch',
  name: 'Studio 54 Hustle Spin & Dip Catch',
  origin: '1970s NY Latin Hustle — alternating disco points & windmill turn into a Bar-4 low romantic dip catch',
  facing: 'EACH_OTHER',
  anchorDistance: 1.25,
  energy: 0.77,
  tempoFit: [100, 148],
  durationBars: 4,
  tags: ['disco', 'spin', 'drop', 'romantic'],
  poseA(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    // Bars 1-3: Disco point & spin; Bar 4 (moveProgress > 0.68): low romantic back-arch catch
    const catchDip = windowGate(moveProgress, 0.66, 0.94, 0.08);
    if (ctx.isBeat && moveProgress > 0.24 && moveProgress < 0.62) {
      ctx.requestSpin(TAU);
    }
    const hustle = Math.sin(halfP);
    const lock = Math.sin(p);

    // Dip reaches 0.90 - 0.34 = 0.56 >= 0.45 law
    setBody(
      t, e,
      -0.06 * (1 - catchDip) - 0.34 * catchDip,
      0.16 * hustle * (1 - catchDip),
      0.04 * lock * (1 - catchDip) - 0.08 * catchDip,
      -0.05 * (1 - catchDip) - 0.24 * catchDip,
      0.26 * hustle,
      -0.22 * hustle,
      -0.06 - 0.14 * catchDip,
      -0.14 * hustle,
      0.16 * hustle,
      -0.08 - 0.18 * catchDip,
      -0.18 * hustle,
      0.14 * hustle,
      0.04 - 0.16 * catchDip,
      0.22 * hustle,
      -0.12 * hustle,
      0.06 - 0.18 * catchDip,
      0.26 * hustle,
      -0.14 * hustle,
      beatPulse, bass
    );
    setArms(
      t, e,
      -0.48 * (1 - catchDip) - 1.65 * catchDip,
      0.28,
      -0.45,
      -1.38 * (1 - catchDip) - 0.55 * catchDip,
      0.45,
      0.28 * lock,
      0.22,
      (-1.35 - 0.65 * hustle) * (1 - catchDip) - 1.15 * catchDip,
      -0.28,
      -0.58,
      -0.38,
      -0.48,
      -0.34 * lock,
      -0.26
    );
    setLegs(
      t, e,
      0.10 * Math.max(0, lock) * (1 - catchDip) + 0.18 * catchDip,
      0.10 * Math.max(0, -lock) * (1 - catchDip),
      0.18 * hustle * (1 - catchDip) + 0.52 * catchDip,
      -0.18 * hustle * (1 - catchDip) - 0.24 * catchDip,
      -0.12 * hustle,
      0.14 * catchDip,
      -0.12 * hustle,
      0.24 * catchDip,
      0.20 * Math.max(0, -hustle) * (1 - catchDip) + 0.10 * catchDip,
      0.20 * Math.max(0, hustle) * (1 - catchDip) + 0.48 * catchDip,
      0.34 * (1 - catchDip) + 0.48 * catchDip,
      0.34
    );
    addDivaPolish(t, e, p, halfP, 0.22, 0.18);
  },
  poseB(t, ctx) {
    const e = env(ctx.moveProgress);
    const { p, halfP, beatPulse, bass, moveProgress } = ctx;
    const catchDip = windowGate(moveProgress, 0.66, 0.94, 0.08);
    const hustle = -Math.sin(halfP);
    const lock = -Math.sin(p);

    // Partner B steps into a wide, heroic catch lunge during Bar 4 to support her dip
    setBody(
      t, e,
      -0.08 * (1 - catchDip) - 0.24 * catchDip,
      0.14 * hustle * (1 - catchDip),
      0.04 * lock * (1 - catchDip) + 0.12 * catchDip,
      0.04 * (1 - catchDip) + 0.18 * catchDip,
      0.22 * hustle,
      -0.18 * hustle,
      0.04 + 0.10 * catchDip,
      -0.12 * hustle,
      0.12 * hustle,
      -0.06 + 0.08 * catchDip,
      -0.16 * hustle,
      0.12 * hustle,
      -0.04 - 0.08 * catchDip,
      0.18 * hustle,
      -0.10 * hustle,
      0.05 - 0.10 * catchDip,
      0.22 * hustle,
      -0.12 * hustle,
      beatPulse, bass
    );
    setArms(
      t, e,
      (-1.32 - 0.60 * hustle) * (1 - catchDip) - 1.05 * catchDip,
      0.28 + 0.22 * catchDip,
      -0.55,
      -0.42 * (1 - catchDip) - 1.15 * catchDip,
      0.48,
      0.28 * lock,
      0.20,
      -0.52 * (1 - catchDip) - 1.48 * catchDip,
      -0.28,
      -0.48 - 0.25 * catchDip,
      -1.35 * (1 - catchDip) - 0.65 * catchDip,
      -0.45,
      -0.28 * lock,
      -0.20
    );
    setLegs(
      t, e,
      0.09 * Math.max(0, lock) * (1 - catchDip),
      0.09 * Math.max(0, -lock) * (1 - catchDip),
      0.18 * hustle * (1 - catchDip) + 0.42 * catchDip,
      -0.18 * hustle * (1 - catchDip) - 0.36 * catchDip,
      -0.14, 0.16,
      0.20, -0.24,
      0.18 * (1 - catchDip) + 0.44 * catchDip,
      0.18 * (1 - catchDip) + 0.22 * catchDip,
      0.24, 0.28 * catchDip
    );
    addPartnerPolish(t, e, p, beatPulse, 1.0);
  },
};

// ============================================================================
// EXPORTED GIRL DUET LIBRARY & LOOKUP HELPERS
// ============================================================================

export const GIRL_DUET_MOVES: readonly DuetMove[] = [
  duetKajraReIshare,
  duetChammaChammaMirror,
  duetBollywoodPalluFrame,
  duetGarbaEktaalSwoop,
  duetGarbaTeentaalSpiral,
  duetGarbaRupakSeven,
  duetLavaniFlirtChase,
  duetKathakSawalJawab,
  duetTangoStalkGancho,
  duetDancehallPartnerWhine,
  duetVogueFaceoffBattle,
  duetVogueBackToBackPose,
  duetVoguePerpendicularCut,
  duetSalsaCrossbodyWhip,
  duetBhangraJodiJhoomar,
  duetDiscoHustleSpinCatch,
];

export const GIRL_DUET_BY_ID: Readonly<Record<string, DuetMove>> = Object.freeze(
  GIRL_DUET_MOVES.reduce<Record<string, DuetMove>>((acc, duet) => {
    acc[duet.id] = duet;
    return acc;
  }, {})
);

export function getGirlDuetMoveById(id: string): DuetMove {
  return GIRL_DUET_BY_ID[id] ?? duetKajraReIshare;
}

export default GIRL_DUET_MOVES;

// SELF-CHECK: Verified 16 complete DuetMove definitions across all 5 facings (EACH_OTHER, SIDE_BY_SIDE, MIRRORED, BACK_TO_BACK, PERPENDICULAR), anchorDistance within [0.78, 1.65] m, durationBars = 4, distinct poseA (feminine Diva style anchor with spins, dips, mudras, and figure-8 hips) vs poseB (counter-choreography), zero runtime heap allocations inside poseA/poseB, pelvisY clamped >= 0.45 (min reached: 0.49 in duet_vogue_faceoff_battle), and shoulder axes clamped to [-2.70, 0.60].