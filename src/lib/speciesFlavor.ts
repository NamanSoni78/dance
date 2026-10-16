// src/lib/speciesFlavor.ts
// ============================================================================
// GRAND GROUP CHOREOGRAPHER V2.5 — DELIVERABLE C: SPECIES PERSONALITY & SOLOS
// Additive per-frame species accent layers, 15 signature solo moves (5 each for
// CAT, DOG, MOUSE), and zero-allocation call-and-response hype-crew routines.
// ============================================================================

import type { JointTargets, MoveContext, DanceMove } from './danceMoves';
import type { SpeciesId } from './species';
import { GIRL_SIGNATURE_SPOTLIGHTS } from './girlSpotlight';

export interface SpeciesFlavor {
  species: SpeciesId;
  /** Additive zero-alloc accent layered on EVERY pose this species dances
      (e.g. dog: weight-shift lag + head bob; mouse: 1.3x hop snap on
      beatPulse + whisker-flick ear twitches; cat: liquid shoulder
      isolations on halfP). Keep additions SMALL (they stack on any move). */
  accentLayer: (t: JointTargets, ctx: MoveContext) => void;
  /** 4-6 signature SOLO DanceMove objects per species (full interface
      from danceMoves.ts) — the move the crowd remembers them by. */
  signatureMoves: DanceMove[];
  /** One-line personality brief for the HUD ("The Cat — precise, smug,
      liquid"). */
  persona: string;
}

// ============================================================================
// MATHEMATICAL CONSTANTS & ZERO-ALLOCATION WRITER / CLAMP HELPERS
// ============================================================================

const PI = Math.PI;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;
const PELVIS_REST_Y = 0.90;

/** Clamp scalar v into [lo, hi] with zero allocation. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Type-safe zero-overhead cast for DanceFamily union compatibility. */
function asDanceFamily(familyName: string): DanceMove['family'] {
  return familyName as unknown as DanceMove['family'];
}

/** Bar-locked entrance/exit envelope (0->1 by 15%, flat, ->0 by 100%). */
function env(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 0;
  if (progress < 0.15) {
    const u = progress / 0.15;
    return u * u * (3 - 2 * u);
  }
  if (progress > 0.85) {
    const u = (1 - progress) / 0.15;
    return u * u * (3 - 2 * u);
  }
  return 1;
}

/**
 * Gaussian-like beat window peaking at 1.0 when (barBeat - targetBeat) == 0.
 * Pure, zero-allocation helper for surgical beat accents within a 4-beat bar.
 */
function beatWindow(barBeat: number, targetBeat: number, sharpness: number): number {
  let d = barBeat - targetBeat;
  if (d > 2) d -= 4;
  if (d < -2) d += 4;
  const x = d * sharpness;
  const v = 1 - x * x;
  return v > 0 ? v * v : 0;
}

/**
 * Enforces Physics Law across all clamped channels after an additive accent layer
 * or hype-crew modification is applied.
 */
function clampPhysicsInPlace(t: JointTargets): void {
  if (t.pelvisY < 0.45) t.pelvisY = 0.45;
  t.shoulderLX = clamp(t.shoulderLX, -2.7, 0.6);
  t.shoulderRX = clamp(t.shoulderRX, -2.7, 0.6);
  t.elbowLX = clamp(t.elbowLX, -2.4, 0);
  t.elbowRX = clamp(t.elbowRX, -2.4, 0);
  t.footLiftL = clamp(t.footLiftL, 0, 0.22);
  t.footLiftR = clamp(t.footLiftR, 0, 0.22);
}

/** Writes the 20 core torso/pelvis/spine/chest/neck/head channels. */
function setBody(
  t: JointTargets,
  rootY: number,
  pY: number,
  pX: number,
  pZ: number,
  pRX: number,
  pRY: number,
  pRZ: number,
  spX: number,
  spY: number,
  spZ: number,
  chX: number,
  chY: number,
  chZ: number,
  chS: number,
  nkX: number,
  nkY: number,
  nkZ: number,
  hdX: number,
  hdY: number,
  hdZ: number
): void {
  t.rootY = rootY;
  t.pelvisY = pY < 0.45 ? 0.45 : pY;
  t.pelvisX = pX;
  t.pelvisZ = pZ;
  t.pelvisRotX = pRX;
  t.pelvisRotY = pRY;
  t.pelvisRotZ = pRZ;
  t.lowerSpineX = spX;
  t.lowerSpineY = spY;
  t.lowerSpineZ = spZ;
  t.chestX = chX;
  t.chestY = chY;
  t.chestZ = chZ;
  t.chestScale = chS;
  t.neckX = nkX;
  t.neckY = nkY;
  t.neckZ = nkZ;
  t.headX = hdX;
  t.headY = hdY;
  t.headZ = hdZ;
}

/** Writes all 14 upper-limb channels with anatomical clamping. */
function setArms(
  t: JointTargets,
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
  t.shoulderLX = clamp(sLX, -2.7, 0.6);
  t.shoulderLY = sLY;
  t.shoulderLZ = sLZ;
  t.elbowLX = clamp(eLX, -2.4, 0);
  t.elbowLY = eLY;
  t.wristLX = wLX;
  t.wristLZ = wLZ;
  t.shoulderRX = clamp(sRX, -2.7, 0.6);
  t.shoulderRY = sRY;
  t.shoulderRZ = sRZ;
  t.elbowRX = clamp(eRX, -2.4, 0);
  t.elbowRY = eRY;
  t.wristRX = wRX;
  t.wristRZ = wRZ;
}

/** Writes all 12 lower-limb IK & articulation channels with footLift clamping. */
function setLegs(
  t: JointTargets,
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
  t.footLiftL = clamp(liftL, 0, 0.22);
  t.footLiftR = clamp(liftR, 0, 0.22);
  t.legStepPitchL = pitchL;
  t.legStepPitchR = pitchR;
  t.legStepRollL = rollL;
  t.legStepRollR = rollR;
  t.hipYawL = yawL;
  t.hipYawR = yawR;
  t.extraKneeL = kneeL;
  t.extraKneeR = kneeR;
  t.ankleToePitchL = toeL;
  t.ankleToePitchR = toeR;
}

// ============================================================================
// SPECIES 1: THE CAT ('CAT') — PRECISE, SMUG, LIQUID
// Scale 1.0 | Navy fur | Pointy ears | Slit pupils | Whip tail
// ============================================================================

/**
 * Cat Additive Accent Layer:
 * - Liquid alternating shoulder roll & ribcage isolation on `halfP`
 * - Slinky S-curve counter-rotation between pelvis and chest
 * - Smug slightly-elevated chin (`headX -= 0.035`) with feline ear-tilt (`headZ`)
 * - Delicate claw-wrist articulation on high-frequency hats (`ctx.high`)
 */
function catAccentLayer(t: JointTargets, ctx: MoveContext): void {
  const sHalf = Math.sin(ctx.halfP);
  const cHalf = Math.cos(ctx.halfP);
  const s1 = Math.sin(ctx.p);

  // Liquid feline spine S-wave (hips sway one way, ribcage slides counter)
  t.pelvisX += 0.022 * sHalf;
  t.pelvisRotZ -= 0.030 * sHalf;
  t.lowerSpineZ += 0.025 * sHalf;
  t.chestZ += 0.032 * cHalf;
  t.chestY -= 0.028 * sHalf;

  // Smug chin-up poise + subtle feline ear-cock on quarter-bar
  t.neckX -= 0.020;
  t.headX -= 0.035 - 0.018 * ctx.beatPulse;
  t.headZ += 0.038 * Math.sin(ctx.quarterP);
  t.headY += 0.024 * sHalf;

  // Liquid shoulder figure-eight isolations + claw-wrist curl on hi-hats
  const clawFlick = (0.04 + 0.05 * ctx.high) * s1;
  t.shoulderLX += 0.035 * sHalf;
  t.shoulderLZ += 0.025 * cHalf;
  t.shoulderRX -= 0.035 * sHalf;
  t.shoulderRZ += 0.025 * cHalf;
  t.wristLX += clawFlick;
  t.wristRX -= clawFlick;

  // Pointed feline toe-grace when feet lift off the floor
  if (t.footLiftL > 0.02) t.ankleToePitchL += 0.08;
  if (t.footLiftR > 0.02) t.ankleToePitchR += 0.08;

  clampPhysicsInPlace(t);
}

/**
 * CAT SIGNATURE 1: CAT_MOONWALK_STRUT
 * Smooth-Criminal / Bill-Bailey backslide illusion with dead-level pelvis height,
 * high-heel ankle-toe pitch pop on the weighted foot, liquid chest isolation,
 * and a single smug hand tipping the LED visor brim.
 */
const CAT_MOONWALK_STRUT: DanceMove = {
  id: 'CAT_MOONWALK_STRUT',
  name: 'Cat Signature — Velvet Moonwalk & Visor Tip',
  family: asDanceFamily('POPPING'),
  origin: '1983 Motown 25 Backslide & Parisian Runway Catwalk',
  energy: 0.78,
  tempoFit: [92, 136],
  defaultBars: 4,
  tags: ['footwork', 'isolation', 'groove'],
  faceIntent: 'smug',
  tailCarriage: 'whip',
  accentMove: true,
  pose: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);
    const s2 = Math.sin(ctx.halfP);

    // Dead-level pelvis height creates the floating glide illusion
    const chestSlideZ = 0.09 * s1 * e;
    setBody(
      t,
      0.008 * ctx.beatPulse * e,
      PELVIS_REST_Y - 0.06 * e,
      0.04 * s2 * e,
      -0.06 * c1 * e,
      0.06 * e,
      0.26 * e + 0.08 * s2 * e, // Angled 15-deg profile so the crowd sees the moonwalk footwork!
      -0.05 * s1 * e,
      -0.04 * e,
      0.10 * e,
      0,
      (-0.08 + chestSlideZ) * e,
      0.14 * e,
      0.05 * s1 * e,
      1 + 0.04 * ctx.beatPulse * e,
      0.12 * e,
      -0.32 * e, // Head turned back toward camera over the lead shoulder
      0.06 * s2 * e,
      (0.14 - 0.06 * ctx.beatPulse) * e,
      -0.36 * e,
      0.08 * c1 * e
    );

    // Right hand pinched at LED visor brim; Left arm slick at side with sharp wrist-pop
    setArms(
      t,
      (-0.32 + 0.28 * s1) * e,
      0.14 * e,
      0.22 * e,
      (-0.45 - 0.20 * Math.abs(c1)) * e,
      0.15 * e,
      0.32 * c1 * e,
      0.18 * e,
      (-1.58 - 0.08 * ctx.beatPulse) * e,
      0.38 * e,
      -0.22 * e,
      -1.88 * e,
      -0.42 * e,
      0.35 * e,
      -0.22 * e
    );

    // Moonwalk mechanics: as L leg slides back (pitchL < 0), R foot pops onto high toe (toeR > 0), then swap!
    const lPop = Math.max(0, s1);
    const rPop = Math.max(0, -s1);
    setLegs(
      t,
      0.09 * lPop * e,
      0.09 * rPop * e,
      -0.38 * s1 * e,
      0.38 * s1 * e,
      0.04 * e,
      -0.04 * e,
      0.12 * e,
      -0.12 * e,
      0.28 * lPop * e,
      0.28 * rPop * e,
      0.42 * lPop * e,
      0.42 * rPop * e
    );
  },
};

/**
 * CAT SIGNATURE 2: CAT_SMUG_VISOR_FLIP
 * Slinky 2-beat feline prowl that locks on Beat 3 into a two-finger LED visor
 * flip-up, a sharp ribcage pop, and a smug Beat-4 camera freeze with one hip cocked.
 */
const CAT_SMUG_VISOR_FLIP: DanceMove = {
  id: 'CAT_SMUG_VISOR_FLIP',
  name: 'Cat Signature — Smug Visor-Flip & Hip-Cock Freeze',
  family: asDanceFamily('HIPHOP'),
  origin: 'Harlem Ballroom Runway Attitude & Anime Visor-Flash Trope',
  energy: 0.72,
  tempoFit: [85, 132],
  defaultBars: 2,
  tags: ['pose', 'isolation', 'arms'],
  faceIntent: 'smug',
  tailCarriage: 'curled',
  accentMove: true,
  pose: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Beat 1-2: liquid feline prowl; Beat 3 (barBeat 2.0): visor flip; Beat 4 (barBeat 3.1): smug freeze!
    const flipBeat = beatWindow(barBeat, 2.0, 2.4) * e;
    const smugHold = beatWindow(barBeat, 3.1, 1.8) * e;
    const poseWeight = clamp(flipBeat + smugHold, 0, 1);
    const prowl = (1 - poseWeight) * e;
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.02 * flipBeat,
      PELVIS_REST_Y - (0.09 * prowl + 0.05 * poseWeight),
      0.16 * poseWeight + 0.10 * s1 * prowl,
      0.06 * poseWeight,
      -0.08 * poseWeight + 0.08 * prowl,
      -0.22 * poseWeight + 0.14 * s1 * prowl,
      -0.18 * poseWeight - 0.08 * s1 * prowl, // Sharp smug hip-cock on poseWeight
      -0.06 * poseWeight,
      -0.14 * poseWeight,
      0.12 * poseWeight,
      -0.14 * poseWeight - 0.08 * flipBeat,
      -0.18 * poseWeight,
      0.10 * poseWeight,
      1 + 0.06 * flipBeat,
      -0.10 * smugHold + 0.08 * flipBeat,
      0.20 * poseWeight,
      -0.12 * smugHold,
      -0.16 * smugHold + 0.10 * flipBeat, // Chin snaps up as visor flips!
      0.24 * poseWeight,
      -0.14 * smugHold
    );

    // Left hand rests sassy on cocked left hip; Right hand reaches to visor on flipBeat then flicks out on smugHold
    setArms(
      t,
      -0.48 * poseWeight - (0.75 + 0.20 * s1) * prowl,
      -0.38 * poseWeight,
      0.54 * poseWeight + 0.28 * prowl,
      -1.42 * poseWeight - 0.95 * prowl,
      0.28 * poseWeight,
      0.25 * poseWeight,
      0.22 * poseWeight,
      -1.72 * flipBeat - 1.35 * smugHold - (0.75 - 0.20 * s1) * prowl,
      0.35 * flipBeat - 0.28 * smugHold,
      -0.18 * flipBeat - 0.55 * smugHold - 0.28 * prowl,
      -1.95 * flipBeat - 0.55 * smugHold - 0.95 * prowl,
      -0.38 * flipBeat,
      -0.42 * flipBeat + 0.38 * smugHold,
      -0.25 * smugHold
    );

    setLegs(
      t,
      0.08 * Math.max(0, s1) * prowl,
      0.08 * Math.max(0, -s1) * prowl + 0.06 * poseWeight,
      0.18 * s1 * prowl + 0.08 * poseWeight,
      -0.18 * s1 * prowl - 0.12 * poseWeight,
      0.14 * poseWeight,
      0.14 * poseWeight,
      0.18 * e,
      -0.28 * poseWeight - 0.18 * prowl,
      0.06 * poseWeight + 0.14 * prowl,
      0.26 * poseWeight + 0.14 * prowl,
      0.08 * prowl,
      0.32 * poseWeight
    );
  },
};

/**
 * CAT SIGNATURE 3: CAT_TAIL_WHIP_SPIN
 * High-speed aerodynamic 360 feline whip-spin (`ctx.requestSpin(TAU)`) on Beat 1
 * of every 2-bar phrase, pulling arms into a tight vertical needle before slashing
 * out into a fierce double-claw frame on Beats 3 & 4.
 */
const CAT_TAIL_WHIP_SPIN: DanceMove = {
  id: 'CAT_TAIL_WHIP_SPIN',
  name: 'Cat Signature — Tail-Whip Pirouette & Claw Slash',
  family: asDanceFamily('DISCO'),
  origin: 'Classical Jazz Pirouette & Shaolin Tiger-Claw Forms',
  energy: 0.88,
  tempoFit: [100, 148],
  defaultBars: 4,
  tags: ['spin', 'arms', 'pose'],
  faceIntent: 'fierce',
  tailCarriage: 'whip',
  accentMove: true,
  pose: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    if (ctx.isBeat && barBeatInt === 0) {
      ctx.requestSpin(TAU);
    }

    const spinTuck = (beatWindow(barBeat, 0.25, 2.0) + beatWindow(barBeat, 1.0, 2.0)) * 0.75 * e;
    const tuck = clamp(spinTuck, 0, 1);
    const clawSlash = (1 - tuck) * e;
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.03 * tuck + 0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.04 * tuck + 0.18 * clawSlash),
      0.12 * s1 * clawSlash,
      0.08 * clawSlash,
      (0.16 * clawSlash - 0.04 * tuck),
      0.24 * s1 * clawSlash,
      -0.10 * s1 * clawSlash,
      0.10 * clawSlash,
      0.18 * s1 * clawSlash,
      0,
      0.12 * clawSlash - 0.06 * tuck,
      0.22 * s1 * clawSlash,
      0,
      1 + 0.05 * clawSlash * ctx.beatPulse,
      -0.08 * clawSlash,
      -0.18 * s1 * clawSlash,
      0,
      -0.12 * clawSlash,
      -0.22 * s1 * clawSlash,
      0.14 * s1 * clawSlash
    );

    // During tuck: high vertical needle arms (-2.35); During clawSlash: asymmetrical tiger-claw frame!
    setArms(
      t,
      -2.32 * tuck - (1.28 + 0.22 * s1) * clawSlash,
      -0.20 * tuck + 0.28 * clawSlash,
      0.12 * tuck + 0.42 * clawSlash,
      -0.35 * tuck - 1.15 * clawSlash,
      0.32 * clawSlash,
      0.48 * clawSlash, // Fierce flexed claw wrist
      0.24 * clawSlash,
      -2.32 * tuck - (0.92 - 0.22 * s1) * clawSlash,
      0.20 * tuck - 0.35 * clawSlash,
      -0.12 * tuck - 0.38 * clawSlash,
      -0.35 * tuck - 1.35 * clawSlash,
      -0.32 * clawSlash,
      0.48 * clawSlash,
      -0.24 * clawSlash
    );

    // Passé knee-lift during spin tuck, wide predator lunge on clawSlash
    setLegs(
      t,
      0.20 * tuck + 0.08 * Math.max(0, s1) * clawSlash,
      0.08 * Math.max(0, -s1) * clawSlash,
      0.18 * tuck + 0.22 * clawSlash,
      -0.22 * clawSlash,
      0.18 * clawSlash,
      -0.18 * clawSlash,
      0.28 * e,
      -0.28 * e,
      0.38 * tuck + 0.24 * clawSlash,
      0.08 * tuck + 0.24 * clawSlash,
      0.35 * tuck,
      0.20 * tuck + 0.15 * clawSlash
    );
  },
};

/**
 * CAT SIGNATURE 4: CAT_LIQUID_TUTTING_CATWALK
 * Precision Egyptian/Vogue 90-degree geometric forearm box-tutting around the
 * cat's pointed ears and LED visor while stepping a crossed-paw runway walk.
 */
const CAT_LIQUID_TUTTING_CATWALK: DanceMove = {
  id: 'CAT_LIQUID_TUTTING_CATWALK',
  name: 'Cat Signature — Pharaoh Box-Tutting & Cross-Paw Catwalk',
  family: asDanceFamily('POPPING'),
  origin: 'West Coast King-Tutting & Milan High-Fashion Runway',
  energy: 0.76,
  tempoFit: [94, 138],
  defaultBars: 4,
  tags: ['arms', 'isolation', 'footwork', 'pose'],
  faceIntent: 'intense',
  tailCarriage: 'high',
  pose: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const stepBeat = ctx.moveBeat % 4;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);
    // Quantized 4-state geometric tutting angles per beat of the bar
    const tutState = stepBeat === 0 ? 1 : stepBeat === 1 ? -1 : stepBeat === 2 ? 0.5 : -0.5;
    const snap = 0.35 + 0.65 * (1 - 0.5 * ctx.beatPulse);

    setBody(
      t,
      0.015 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.05 + 0.04 * Math.abs(s1)) * e,
      0.11 * s1 * e,
      0.04 * c1 * e,
      -0.04 * e,
      0.18 * s1 * e,
      -0.14 * s1 * e, // Runway hip-sway
      -0.04 * e,
      -0.12 * s1 * e,
      0.10 * s1 * e,
      -0.06 * e,
      -0.14 * s1 * e,
      0.08 * s1 * e,
      1 + 0.03 * ctx.beatPulse * e,
      0,
      0.14 * tutState * snap * e,
      -0.08 * tutState * snap * e,
      -0.05 * e,
      0.18 * tutState * snap * e,
      0.10 * tutState * snap * e
    );

    // 90-degree elbow (-1.57 rad) and wrist box-tut geometry shifting sharply on every beat
    setArms(
      t,
      (-1.35 - 0.25 * tutState * snap) * e,
      (-0.32 * tutState * snap) * e,
      (0.38 + 0.18 * Math.abs(tutState)) * e,
      -1.57 * e,
      0.38 * tutState * snap * e,
      0.45 * tutState * snap * e,
      0.25 * e,
      (-1.35 + 0.25 * tutState * snap) * e,
      (0.32 * tutState * snap) * e,
      (-0.38 - 0.18 * Math.abs(tutState)) * e,
      -1.57 * e,
      -0.38 * tutState * snap * e,
      -0.45 * tutState * snap * e,
      -0.25 * e
    );

    // Crossed-paw catwalk: when L foot steps forward, legStepRollL crosses slightly inward (-0.08)
    const liftL = Math.max(0, s1) * 0.14 * e;
    const liftR = Math.max(0, -s1) * 0.14 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.24 * s1 * e,
      -0.24 * s1 * e,
      -0.09 * lStepCross(s1) * e,
      0.09 * lStepCross(-s1) * e,
      0.10 * e,
      -0.10 * e,
      0.14 * liftL + 0.06 * e,
      0.14 * liftR + 0.06 * e,
      0.25 * liftL,
      0.25 * liftR
    );
  },
};

function lStepCross(s: number): number {
  return s > 0 ? s : 0;
}

/**
 * CAT SIGNATURE 5: CAT_VELVET_POUNCE_ISOLATION
 * Slinky low feline crouch (`pelvisY = 0.56`) with hypnotic figure-eight
 * ribcage/neck snake waves and delicate paw-grooming ear brushes.
 */
const CAT_VELVET_POUNCE_ISOLATION: DanceMove = {
  id: 'CAT_VELVET_POUNCE_ISOLATION',
  name: 'Cat Signature — Velvet Crouch & Feline Ear-Brush Wave',
  family: asDanceFamily('HIPHOP'),
  origin: 'Contemporary Floor-Fusion & Feline Pantomime Isolation',
  energy: 0.70,
  tempoFit: [84, 128],
  defaultBars: 4,
  tags: ['floor', 'isolation', 'groove', 'arms'],
  faceIntent: 'serene',
  tailCarriage: 'sway',
  pose: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);
    const s2 = Math.sin(ctx.halfP);
    const c2 = Math.cos(ctx.halfP);

    // Deep slinky feline crouch (pelvisY = 0.56, well above 0.45 floor)
    setBody(
      t,
      0.02 * Math.max(0, s1) * e,
      PELVIS_REST_Y - (0.32 + 0.04 * c1) * e,
      0.16 * s2 * e,
      0.06 * c2 * e,
      0.22 * e,
      0.20 * s2 * e,
      -0.14 * c2 * e,
      0.14 * e,
      -0.16 * s2 * e,
      0.16 * s1 * e,
      0.16 * e,
      -0.20 * s2 * e,
      0.20 * c1 * e, // Hypnotic ribcage circle
      1 + 0.03 * ctx.bass * e,
      -0.14 * e,
      0.18 * s2 * e,
      0.14 * s1 * e,
      -0.18 * e,
      0.22 * s2 * e,
      0.18 * c1 * e
    );

    // Alternating paw-grooming brush past the pointed ears
    const lGroom = 0.5 + 0.5 * s2;
    const rGroom = 0.5 - 0.5 * s2;
    setArms(
      t,
      (-1.10 - 0.65 * lGroom) * e,
      0.28 * lGroom * e,
      (0.32 - 0.14 * lGroom) * e,
      (-1.05 - 0.65 * lGroom) * e,
      0.30 * lGroom * e,
      (0.38 * s1 * lGroom) * e,
      0.22 * e,
      (-1.10 - 0.65 * rGroom) * e,
      -0.28 * rGroom * e,
      (-0.32 + 0.14 * rGroom) * e,
      (-1.05 - 0.65 * rGroom) * e,
      -0.30 * rGroom * e,
      (-0.38 * s1 * rGroom) * e,
      -0.22 * e
    );

    setLegs(
      t,
      0.08 * Math.max(0, s1) * e,
      0.08 * Math.max(0, -s1) * e,
      0.14 * s2 * e,
      -0.14 * s2 * e,
      0.22 * e,
      -0.22 * e,
      0.30 * e,
      -0.30 * e,
      0.38 * e,
      0.38 * e,
      0.24 * e,
      0.24 * e
    );
  },
};

// ============================================================================
// SPECIES 2: THE DIVA ('GIRL') — SMOOTH, EXPRESSIVE, MAGNETIC
// V4: replaces the dog. A realistic human diva on the shared biped rig —
// warm skin, natural face, high ponytail (verlet chain physics in the
// renderer) and a verlet-cloth skirt that flares on her spins. 0.92 groove:
// feminine figure-8 isolations, never robotic.
// ============================================================================

/**
 * Girl (Diva) Additive Accent Layer:
 * - Liquid figure-8 hip micro-roll on halfP (the feminine engine under every
 *   pose she dances — solo, duet or hype)
 * - Chest breath on the beat glow + 2-and-4 weight shift
 * - Charm head-tilt on the backbeat; wrist-flick micro-articulations
 * Kept SMALL — it stacks on top of any authored pose.
 */
function girlAccentLayer(t: JointTargets, ctx: MoveContext): void {
  const sway = Math.sin(ctx.halfP);
  const backbeat = Math.sin(ctx.p * 0.5); // 2-and-4 weight transfer
  const s1 = Math.sin(ctx.p);

  // Figure-8 hip isolation + lateral weight transfer
  t.pelvisRotZ += 0.022 * sway;
  t.pelvisRotY += 0.018 * s1;
  t.pelvisX += 0.006 * backbeat;
  t.pelvisY -= 0.010 * (0.5 + 0.5 * ctx.bass);

  // Chest breath on the beat glow
  t.chestScale += 0.014 * ctx.beatPulse + 0.008 * ctx.bass;
  t.chestZ += 0.014 * sway;

  // Charm head tilt on the backbeat (the "diva listen" micro-move)
  t.headZ += 0.020 * backbeat;
  t.neckZ += 0.012 * backbeat;

  // Wrist flick micro-articulations
  t.wristLZ += 0.03 * s1;
  t.wristRZ -= 0.03 * s1;

  clampPhysicsInPlace(t);
}

// ============================================================================
// SPECIES 3: THE MOUSE ('MOUSE') — HYPER-KINETIC, BOUNCY, ELECTRIC
// Scale 0.74 | Grey fur | Huge round ears | Buck teeth | Thin tail | 1.3x bounce
// ============================================================================

/**
 * Mouse Additive Accent Layer:
 * - 1.3x spring-loaded hop snap on `beatPulse` (`rootY` & `footLift` micro-boost
 *   so the 0.74-scale mouse reads with electric vertical pop on stage)
 * - Rapid whisker-flick & huge-round-ear twitches (`headZ` / `neckY` on `ctx.p * 2`)
 * - Quick nimble knee-spring articulation
 */
function mouseAccentLayer(t: JointTargets, ctx: MoveContext): void {
  const fastSin = Math.sin(ctx.p * 2);
  const fastCos = Math.cos(ctx.p * 2);
  const hopSnap = ctx.beatPulse * 0.30; // 1.3x bounce multiplier feel

  // Spring-loaded 1.3x vertical pop on every beat transient
  t.rootY += 0.032 * hopSnap;
  t.pelvisY += 0.018 * hopSnap;
  t.pelvisScaleY += 0.035 * ctx.beatPulse;
  t.pelvisScaleX -= 0.016 * ctx.beatPulse;
  t.pelvisScaleZ -= 0.016 * ctx.beatPulse;

  // Hyper-alert whisker-flick & round-ear head twitches
  t.neckY += 0.035 * fastSin * (0.4 + 0.6 * ctx.high);
  t.headY += 0.048 * fastSin * (0.4 + 0.6 * ctx.high);
  t.headZ += 0.052 * fastCos * ctx.beatPulse;
  t.headX -= 0.025 * ctx.beatPulse;

  // Nimble paw-wrist flutter
  t.wristLX += 0.055 * fastSin;
  t.wristRX -= 0.055 * fastSin;

  // Extra foot-lift snap so the tiny sneakers pop off the floor
  if (t.footLiftL > 0.01) t.footLiftL += 0.025 * ctx.beatPulse;
  if (t.footLiftR > 0.01) t.footLiftR += 0.025 * ctx.beatPulse;

  clampPhysicsInPlace(t);
}

/**
 * MOUSE SIGNATURE 1: MOUSE_SQUEAK_HOP_COMBO
 * Hyper-elastic 1.3x Squeak-Hop Pogo Combo! Rapid side-to-side pogo hops with
 * cute tucked mouse-paws at the chest on Beats 1-2, exploding into a double
 * ear-framing V-pose on Beats 3-4.
 */
const MOUSE_SQUEAK_HOP_COMBO: DanceMove = {
  id: 'MOUSE_SQUEAK_HOP_COMBO',
  name: 'Mouse Signature — 1.3x Squeak-Hop Pogo & Ear Frame',
  family: asDanceFamily('HOUSE'),
  origin: '90s Rave Pogo Bounce & Classic Cartoon Mouse Hop',
  energy: 0.90,
  tempoFit: [105, 165],
  defaultBars: 4,
  tags: ['jump', 'footwork', 'arms', 'groove'],
  faceIntent: 'joyful',
  tailCarriage: 'high',
  accentMove: true,
  pose: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const earFrame = (beatWindow(barBeat, 2.0, 2.2) + beatWindow(barBeat, 3.0, 2.2)) * 0.75 * e;
    const frame = clamp(earFrame, 0, 1);
    const pogo = (1 - frame) * e;
    const hop = Math.abs(Math.sin(ctx.p * 2));
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      (0.085 * hop + 0.035 * ctx.beatPulse) * e, // High 1.3x mouse pogo!
      PELVIS_REST_Y - (0.06 + 0.08 * (1 - hop)) * e,
      0.20 * s1 * e,
      0.05 * frame,
      (0.10 * pogo - 0.08 * frame),
      0.20 * c1 * e,
      -0.16 * s1 * e,
      0.06 * pogo,
      0.14 * c1 * e,
      -0.10 * s1 * e,
      -0.10 * frame,
      0.16 * c1 * e,
      -0.10 * s1 * e,
      1 + 0.06 * ctx.beatPulse * e,
      -0.08 * frame,
      -0.14 * c1 * e,
      0.14 * s1 * e,
      -0.12 * frame,
      -0.18 * c1 * e,
      0.20 * s1 * e // Big round ears bobbing side to side!
    );

    // Pogo phase: cute tucked mouse-paws in front of chest; Frame phase: peace-paws framing giant round ears!
    setArms(
      t,
      -0.88 * pogo - 1.95 * frame,
      -0.38 * pogo + 0.25 * frame,
      0.14 * pogo + 0.58 * frame,
      -1.85 * pogo - 0.65 * frame,
      0.30 * e,
      0.48 * pogo + 0.30 * s1 * frame, // Droopy cute mouse-paw wrists in pogo
      0.20 * e,
      -0.88 * pogo - 1.95 * frame,
      0.38 * pogo - 0.25 * frame,
      -0.14 * pogo - 0.58 * frame,
      -1.85 * pogo - 0.65 * frame,
      -0.30 * e,
      0.48 * pogo - 0.30 * s1 * frame,
      -0.20 * e
    );

    const liftL = (0.16 * hop + 0.05 * Math.max(0, s1)) * e;
    const liftR = (0.16 * hop + 0.05 * Math.max(0, -s1)) * e;
    setLegs(
      t,
      clamp(liftL, 0, 0.22),
      clamp(liftR, 0, 0.22),
      0.18 * s1 * e,
      -0.18 * s1 * e,
      0.14 * s1 * e,
      0.14 * s1 * e,
      0.20 * e,
      -0.20 * e,
      0.24 * (1 - hop) * e,
      0.24 * (1 - hop) * e,
      0.28 * hop * e,
      0.28 * hop * e
    );
  },
};

/**
 * MOUSE SIGNATURE 2: MOUSE_POPCORN_FREAKOUT_BURST
 * Explosive Popcorn Freakout! Ultra-fast 4x-per-bar foot-patter shuffles alternating
 * with mid-air star-burst jumps and a lightning 360 spin on Beat 4!
 */
const MOUSE_POPCORN_FREAKOUT_BURST: DanceMove = {
  id: 'MOUSE_POPCORN_FREAKOUT_BURST',
  name: 'Mouse Signature — Popcorn Skillet Freakout & Star-Jump',
  family: asDanceFamily('HOUSE'),
  origin: 'Chicago Footwork Juke & Cartoon Skillet-Pop Frenzy',
  energy: 0.98,
  tempoFit: [115, 175],
  defaultBars: 4,
  tags: ['footwork', 'jump', 'spin', 'arms'],
  faceIntent: 'intense',
  tailCarriage: 'whip',
  accentMove: true,
  pose: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    if (ctx.isBeat && barBeatInt === 3) {
      ctx.requestSpin(TAU);
    }

    // Star-pop bursts on Beat 2 and Beat 4 (barBeat 1.0 and 3.0)
    const starPop = (beatWindow(barBeat, 1.0, 2.6) + beatWindow(barBeat, 3.0, 2.6)) * e;
    const patter = (1 - starPop) * e;
    // Ultra-fast juke foot-patter at 2x beat frequency
    const fastSin = Math.sin(ctx.p * 2);
    const fastCos = Math.cos(ctx.p * 2);

    setBody(
      t,
      0.11 * starPop + 0.03 * patter * Math.abs(fastSin),
      PELVIS_REST_Y - (0.14 * patter - 0.04 * starPop),
      0.12 * fastSin * patter,
      0.04 * starPop,
      0.18 * patter - 0.12 * starPop,
      0.22 * fastCos * patter,
      -0.14 * fastSin * patter,
      0.12 * patter,
      0.16 * fastCos * patter,
      0,
      0.14 * patter - 0.16 * starPop,
      0.18 * fastCos * patter,
      0,
      1 + 0.08 * starPop,
      -0.10 * starPop,
      -0.18 * fastCos * patter,
      0.12 * fastSin * patter,
      -0.16 * starPop,
      -0.22 * fastCos * patter,
      0.16 * fastSin * patter
    );

    // Wide airborne X-star arms on starPop; rapid piston elbows during patter
    setArms(
      t,
      (-0.95 + 0.35 * fastSin) * patter - 2.15 * starPop,
      0.25 * fastCos * patter + 0.25 * starPop,
      0.32 * patter + 0.72 * starPop,
      -1.25 * patter - 0.20 * starPop,
      0.25 * e,
      0.40 * fastSin * patter,
      0.20 * e,
      (-0.95 - 0.35 * fastSin) * patter - 2.15 * starPop,
      -0.25 * fastCos * patter - 0.25 * starPop,
      -0.32 * patter - 0.72 * starPop,
      -1.25 * patter - 0.20 * starPop,
      -0.25 * e,
      -0.40 * fastSin * patter,
      -0.20 * e
    );

    const liftL = Math.max(0, fastSin) * 0.20 * patter + 0.22 * starPop;
    const liftR = Math.max(0, -fastSin) * 0.20 * patter + 0.22 * starPop;
    setLegs(
      t,
      clamp(liftL, 0, 0.22),
      clamp(liftR, 0, 0.22),
      0.32 * fastSin * patter,
      -0.32 * fastSin * patter,
      0.28 * starPop + 0.12 * fastCos * patter,
      -0.28 * starPop + 0.12 * fastCos * patter,
      0.26 * e,
      -0.26 * e,
      0.26 * patter,
      0.26 * patter,
      0.32 * starPop,
      0.32 * starPop
    );
  },
};

/**
 * MOUSE SIGNATURE 3: MOUSE_TINY_WAVES_CROWD_MOMENT
 * Adorable Front-Row Crowd Moment! Because the Mouse is 0.74x scale, it stretches
 * all the way up onto high tip-toes (`pelvisY` raised + `ankleToePitch = 0.38`),
 * leans eagerly toward the camera, and waves both tiny paws overhead in rapid
 * synchronized windshield-wiper arcs!
 */
const MOUSE_TINY_WAVES_CROWD_MOMENT: DanceMove = {
  id: 'MOUSE_TINY_WAVES_CROWD_MOMENT',
  name: 'Mouse Signature — Tip-Toe Stretch & Double-Paw Crowd Wave',
  family: asDanceFamily('DISCO'),
  origin: 'Mascot Stadium Fan-Service & Festival Front-Row Wave',
  energy: 0.76,
  tempoFit: [86, 140],
  defaultBars: 2,
  tags: ['arms', 'pose', 'groove'],
  faceIntent: 'joyful',
  tailCarriage: 'sway',
  accentMove: true,
  pose: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    // Double-speed windshield-wiper wave so the tiny paws are impossible to miss!
    const waveSin = Math.sin(ctx.p * 2);
    const s1 = Math.sin(ctx.p);
    const bounce = Math.abs(s1);

    setBody(
      t,
      (0.05 * bounce + 0.03 * ctx.beatPulse) * e,
      PELVIS_REST_Y + 0.02 * e, // Stretched tall on tip-toes!
      0.12 * s1 * e,
      0.12 * e, // Eager forward lean toward the audience
      0.14 * e,
      0.10 * s1 * e,
      -0.12 * s1 * e,
      0.08 * e,
      0.08 * s1 * e,
      -0.08 * waveSin * e,
      -0.06 * e,
      0.10 * s1 * e,
      -0.10 * waveSin * e,
      1 + 0.05 * ctx.beatPulse * e,
      -0.14 * e, // Looking eagerly up into the camera lens
      0.08 * s1 * e,
      0.14 * waveSin * e,
      -0.18 * e,
      0.10 * s1 * e,
      0.18 * waveSin * e
    );

    // Both arms stretched high overhead waving in synchronized windshield-wiper arcs
    setArms(
      t,
      -2.25 * e,
      0.20 * waveSin * e,
      (0.42 + 0.28 * waveSin) * e,
      (-0.35 + 0.15 * waveSin) * e,
      0.25 * e,
      0.35 * waveSin * e,
      0.42 * waveSin * e,
      -2.25 * e,
      0.20 * waveSin * e,
      (-0.42 + 0.28 * waveSin) * e,
      (-0.35 - 0.15 * waveSin) * e,
      -0.25 * e,
      0.35 * waveSin * e,
      0.42 * waveSin * e
    );

    const liftL = (0.08 + 0.10 * Math.max(0, s1)) * e;
    const liftR = (0.08 + 0.10 * Math.max(0, -s1)) * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.08 * s1 * e,
      -0.08 * s1 * e,
      0.10 * s1 * e,
      0.10 * s1 * e,
      0.18 * e,
      -0.18 * e,
      0.04 * e,
      0.04 * e,
      0.38 * e, // High tip-toe extension!
      0.38 * e
    );
  },
};

/**
 * MOUSE SIGNATURE 4: MOUSE_WHISKER_TWITCH_LOCKING
 * Campbellock Funk-Locking tailored for the Mouse's lightning speed:
 * Beats 1-2: Double-time overhead wrist-twirls (twirlers); Beat 3: Sharp
 * "Uncle Sam" point-freeze left; Beat 4: Snap point-freeze right with knee-drop!
 */
const MOUSE_WHISKER_TWITCH_LOCKING: DanceMove = {
  id: 'MOUSE_WHISKER_TWITCH_LOCKING',
  name: 'Mouse Signature — Whisker-Twitch Wrist-Twirl & Lock Point',
  family: asDanceFamily('POPPING'),
  origin: '1970s LA Soul Train Campbellocking (Don Campbell Style)',
  energy: 0.86,
  tempoFit: [96, 145],
  defaultBars: 4,
  tags: ['arms', 'pose', 'isolation', 'groove'],
  faceIntent: 'smug',
  tailCarriage: 'curled',
  pose: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const pointLeft = beatWindow(barBeat, 2.0, 2.6) * e;
    const pointRight = beatWindow(barBeat, 3.0, 2.6) * e;
    const twirlPhase = clamp(1 - pointLeft - pointRight, 0, 1) * e;
    const twirlSin = Math.sin(ctx.p * 3);
    const twirlCos = Math.cos(ctx.p * 3);
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.04 * twirlPhase * Math.abs(s1),
      PELVIS_REST_Y - (0.08 * twirlPhase + 0.16 * pointLeft + 0.22 * pointRight),
      (-0.12 * pointLeft + 0.12 * pointRight) * e,
      0.06 * (pointLeft + pointRight),
      0.14 * (pointLeft + pointRight),
      (0.28 * pointLeft - 0.28 * pointRight) * e,
      (-0.12 * pointLeft + 0.12 * pointRight) * e,
      0.08 * (pointLeft + pointRight),
      0.20 * (pointLeft - pointRight),
      0,
      -0.10 * (pointLeft + pointRight),
      0.24 * (pointLeft - pointRight),
      0,
      1 + 0.06 * (pointLeft + pointRight),
      -0.06 * e,
      (-0.30 * pointLeft + 0.30 * pointRight) * e,
      0,
      -0.08 * e,
      (-0.36 * pointLeft + 0.36 * pointRight) * e,
      0.14 * (pointLeft - pointRight)
    );

    // TwirlPhase: high wrist-twirlers by ears; pointLeft/pointRight: laser-straight locking point!
    setArms(
      t,
      -1.65 * twirlPhase - 1.05 * pointLeft - 0.55 * pointRight,
      0.30 * twirlSin * twirlPhase + 0.32 * pointLeft - 0.35 * pointRight,
      0.45 * twirlPhase + 0.42 * pointLeft + 0.48 * pointRight,
      -1.45 * twirlPhase - 0.12 * pointLeft - 1.35 * pointRight,
      0.40 * twirlCos * twirlPhase,
      0.55 * twirlSin * twirlPhase,
      0.35 * twirlCos * twirlPhase,
      -1.65 * twirlPhase - 0.55 * pointLeft - 1.05 * pointRight,
      -0.30 * twirlSin * twirlPhase + 0.35 * pointLeft - 0.32 * pointRight,
      -0.45 * twirlPhase - 0.48 * pointLeft - 0.42 * pointRight,
      -1.45 * twirlPhase - 1.35 * pointLeft - 0.12 * pointRight,
      -0.40 * twirlCos * twirlPhase,
      -0.55 * twirlSin * twirlPhase,
      -0.35 * twirlCos * twirlPhase
    );

    const liftL = Math.max(0, s1) * 0.18 * twirlPhase + 0.10 * pointLeft;
    const liftR = Math.max(0, -s1) * 0.18 * twirlPhase + 0.10 * pointRight;
    setLegs(
      t,
      liftL,
      liftR,
      0.20 * s1 * twirlPhase + 0.18 * pointLeft,
      -0.20 * s1 * twirlPhase + 0.18 * pointRight,
      0.16 * e,
      -0.16 * e,
      0.24 * e,
      -0.24 * e,
      0.18 * twirlPhase + 0.28 * (pointLeft + pointRight),
      0.18 * twirlPhase + 0.28 * (pointLeft + pointRight),
      0.24 * (pointLeft + pointRight),
      0.24 * (pointLeft + pointRight)
    );
  },
};

/**
 * MOUSE SIGNATURE 5: MOUSE_CHEESE_HEIST_BREAK_SPIN
 * Cartoon Cheese-Heist Sneak & Low-Gravity Helicopter Spin!
 * Beats 1-2: Ultra-low tiptoe burglar sneak (`pelvisY = 0.52`); Beat 3: Snatches
 * an invisible wedge of cheese and holds it overhead in triumph; Beat 4: Spins
 * (`requestSpin(-TAU)`) in a low B-boy helicopter crouch!
 */
const MOUSE_CHEESE_HEIST_BREAK_SPIN: DanceMove = {
  id: 'MOUSE_CHEESE_HEIST_BREAK_SPIN',
  name: 'Mouse Signature — Cheese-Heist Sneak & Helicopter Spin',
  family: asDanceFamily('BREAK'),
  origin: 'Tex Avery Cartoon Burglar Strut & B-Boy Zulu Spin',
  energy: 0.88,
  tempoFit: [95, 150],
  defaultBars: 4,
  tags: ['floor', 'spin', 'pose', 'footwork'],
  faceIntent: 'smug',
  tailCarriage: 'whip',
  pose: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    if (ctx.isBeat && barBeatInt === 3) {
      ctx.requestSpin(-TAU);
    }

    const victoryHoist = beatWindow(barBeat, 2.0, 2.2) * e;
    const spinCrouch = beatWindow(barBeat, 3.1, 2.0) * e;
    const sneak = clamp(1 - victoryHoist - spinCrouch, 0, 1) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    // Strictly obeys pelvisY >= 0.45 (rests at 0.52 during sneak & spinCrouch, pops tall on victoryHoist)
    setBody(
      t,
      0.09 * victoryHoist + 0.02 * sneak * Math.abs(s1),
      PELVIS_REST_Y - (0.36 * sneak + 0.38 * spinCrouch - 0.02 * victoryHoist),
      0.16 * s1 * sneak,
      0.10 * sneak,
      0.28 * sneak + 0.24 * spinCrouch - 0.14 * victoryHoist,
      0.24 * c1 * sneak,
      -0.12 * s1 * sneak,
      0.20 * (sneak + spinCrouch) - 0.10 * victoryHoist,
      0.16 * c1 * sneak,
      0,
      0.22 * (sneak + spinCrouch) - 0.16 * victoryHoist,
      0.20 * c1 * sneak,
      0,
      1 + 0.07 * victoryHoist,
      -0.18 * (sneak + spinCrouch) - 0.20 * victoryHoist,
      -0.28 * c1 * sneak, // Darting lookout eyes left and right during sneak!
      0,
      -0.22 * (sneak + spinCrouch) - 0.24 * victoryHoist,
      -0.34 * c1 * sneak,
      0.12 * s1 * sneak
    );

    // Sneak: creepy-crawly burglar fingers in front; victoryHoist: both hands hoist prize overhead; spinCrouch: wide helicopter wing arms!
    setArms(
      t,
      -1.10 * sneak - 2.30 * victoryHoist - 1.05 * spinCrouch,
      0.22 * s1 * sneak - 0.25 * victoryHoist,
      0.25 * sneak + 0.18 * victoryHoist + 0.72 * spinCrouch,
      -1.25 * sneak - 0.25 * victoryHoist - 0.30 * spinCrouch,
      0.25 * e,
      0.45 * c1 * sneak,
      0.20 * e,
      -1.10 * sneak - 2.30 * victoryHoist - 1.05 * spinCrouch,
      -0.22 * s1 * sneak + 0.25 * victoryHoist,
      -0.25 * sneak - 0.18 * victoryHoist - 0.72 * spinCrouch,
      -1.25 * sneak - 0.25 * victoryHoist - 0.30 * spinCrouch,
      -0.25 * e,
      -0.45 * c1 * sneak,
      -0.20 * e
    );

    const liftL = Math.max(0, s1) * 0.20 * sneak + 0.16 * victoryHoist;
    const liftR = Math.max(0, -s1) * 0.20 * sneak + 0.16 * victoryHoist;
    setLegs(
      t,
      clamp(liftL, 0, 0.22),
      clamp(liftR, 0, 0.22),
      0.28 * s1 * sneak + 0.30 * spinCrouch,
      -0.28 * s1 * sneak - 0.30 * spinCrouch,
      0.18 * sneak + 0.26 * spinCrouch,
      -0.18 * sneak - 0.26 * spinCrouch,
      0.28 * e,
      -0.28 * e,
      0.40 * (sneak + spinCrouch),
      0.40 * (sneak + spinCrouch),
      0.32 * e,
      0.32 * e
    );
  },
};

// ============================================================================
// EXPORTED SPECIES_FLAVOR RECORD (EXACT CONTRACT)
// ============================================================================

export const SPECIES_FLAVOR: Record<SpeciesId, SpeciesFlavor> = {
  CAT: {
    species: 'CAT',
    accentLayer: catAccentLayer,
    signatureMoves: [
      CAT_MOONWALK_STRUT,
      CAT_SMUG_VISOR_FLIP,
      CAT_TAIL_WHIP_SPIN,
      CAT_LIQUID_TUTTING_CATWALK,
      CAT_VELVET_POUNCE_ISOLATION,
    ],
    persona: 'The Cat — precise, smug, liquid',
  },
  GIRL: {
    species: 'GIRL',
    accentLayer: girlAccentLayer,
    // V5: the Diva's signature suite is now her authored 10-routine
    // spotlight library (5 preserved V4 showstoppers + 5 new physics
    // showcases) from girlSpotlight.ts. groupDance routes GIRL spotlights
    // through the dedicated AI selectors; this array is the fallback pool.
    signatureMoves: [...GIRL_SIGNATURE_SPOTLIGHTS],
    persona: 'The Diva — smooth, expressive, magnetic',
  },
  MOUSE: {
    species: 'MOUSE',
    accentLayer: mouseAccentLayer,
    signatureMoves: [
      MOUSE_SQUEAK_HOP_COMBO,
      MOUSE_POPCORN_FREAKOUT_BURST,
      MOUSE_TINY_WAVES_CROWD_MOMENT,
      MOUSE_WHISKER_TWITCH_LOCKING,
      MOUSE_CHEESE_HEIST_BREAK_SPIN,
    ],
    persona: 'The Mouse — hyper-kinetic, bouncy, electric',
  },
};

// ============================================================================
// ZERO-ALLOCATION CALL-AND-RESPONSE & SIGNATURE SELECTOR HELPERS
// ============================================================================

/**
 * Convenience wrapper to layer a dancer's species-specific accent onto `t`
 * after their primary Solo, Duet, or Hype-Crew pose has been written.
 */
export function applySpeciesAccent(
  species: SpeciesId,
  t: JointTargets,
  ctx: MoveContext
): void {
  SPECIES_FLAVOR[species].accentLayer(t, ctx);
}

/**
 * Deterministic, zero-allocation selector for a species' signature solo move,
 * scored by BPM fit, energy proximity, and recency avoidance.
 */
export function selectSignatureMove(
  species: SpeciesId,
  bpm: number,
  energy: number,
  seedBeat: number,
  lastMoveId: string
): DanceMove {
  const moves = SPECIES_FLAVOR[species].signatureMoves;
  let bestMove = moves[0];
  let bestScore = -1e9;
  const n = moves.length;

  for (let i = 0; i < n; i++) {
    const m = moves[i];
    let score = 0;

    // 1. Tempo fit
    const minBpm = m.tempoFit[0];
    const maxBpm = m.tempoFit[1];
    if (bpm >= minBpm && bpm <= maxBpm) {
      score += 2.0;
    } else {
      const dist = bpm < minBpm ? minBpm - bpm : bpm - maxBpm;
      score -= dist * 0.04;
    }

    // 2. Energy proximity
    const eDiff = Math.abs(m.energy - energy);
    score += (1.0 - eDiff) * 2.5;

    // 3. Deterministic beat-seeded variety
    const hash = ((seedBeat * 149 + i * 73) % 100) * 0.015;
    score += hash;

    // 4. Recency penalty
    if (m.id === lastMoveId) {
      score -= 10.0;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }

  return bestMove;
}

/**
 * Zero-allocation Call-and-Response Hype-Crew Backup Pose:
 * Used for non-soloist crew members (`slotIndex > 0`) during `'solo-spot'` formations
 * (`SOLO_SPOTLIGHT` or `CALL_RESPONSE_CYPHER`) so the background crew grooves at
 * ~45% reduced amplitude, nods on the beat, and points/hypes toward the downstage soloist!
 */
export function applyHypeCrewResponsePose(
  species: SpeciesId,
  slotSideSign: number, // -1 if standing left of soloist, +1 if standing right
  t: JointTargets,
  ctx: MoveContext
): void {
  const e = env(ctx.moveProgress);
  const s1 = Math.sin(ctx.p);
  const c1 = Math.cos(ctx.p);
  const s2 = Math.sin(ctx.halfP);
  const barBeat = (ctx.quarterP / HALF_PI) % 4;
  // On Beat 3 of each bar, hype crew points / salutes inward toward the center-front soloist!
  const hypePoint = beatWindow(barBeat, 2.0, 2.0) * e;

  // V4: DOG retired; the diva grooves smooth and low
  const crouchBase = species === 'GIRL' ? 0.08 : species === 'CAT' ? 0.07 : 0.09;
  const bounceAmp = species === 'MOUSE' ? 0.045 : species === 'GIRL' ? 0.026 : 0.020;

  setBody(
    t,
    bounceAmp * Math.abs(s1) * e,
    PELVIS_REST_Y - (crouchBase + 0.04 * (1 - Math.abs(s1))) * e,
    0.07 * s2 * e,
    0.03 * hypePoint,
    0.06 * e,
    -slotSideSign * (0.18 + 0.10 * hypePoint) * e, // Angled inward toward center-front soloist
    0.05 * s2 * e,
    0.04 * e,
    -slotSideSign * 0.12 * e,
    0,
    0.04 * e,
    -slotSideSign * 0.14 * e,
    0,
    1 + 0.04 * ctx.beatPulse * e,
    0.06 * ctx.beatPulse * e,
    -slotSideSign * 0.18 * e,
    0,
    0.10 * ctx.beatPulse * e,
    -slotSideSign * 0.22 * e,
    0.06 * c1 * e
  );

  // Inner arm (toward soloist) extends in a supportive cypher point on
  // hypePoint; outer arm grooves low.
  // V4 VARIETY: bar-parity alternation — even bars keep the classic cypher
  // point & low groove; odd bars lift BOTH hands into a raised wave. The
  // hype crew no longer loops one static pattern for a whole mode (the
  // "they just repeat the same move" complaint).
  const pointLeft = slotSideSign > 0 ? hypePoint : 0;
  const pointRight = slotSideSign < 0 ? hypePoint : 0;
  const barVar = Math.floor(ctx.moveBar) % 2;
  const upWave = barVar * e; // 0 on even bars, e on odd bars

  setArms(
    t,
    (-0.55 - 0.65 * pointLeft - 0.15 * Math.abs(s1) - 0.50 * upWave) * e,
    -0.28 * pointLeft + 0.20 * upWave,
    (0.26 - 0.12 * pointLeft + 0.28 * upWave) * e,
    (-1.05 + 0.70 * pointLeft + 0.55 * upWave) * e,
    0.20 * e,
    0.22 * s1 * e + 0.30 * upWave * Math.sin(ctx.p),
    0.15 * e,
    (-0.55 - 0.65 * pointRight - 0.15 * Math.abs(s1) - 0.50 * upWave) * e,
    0.28 * pointRight - 0.20 * upWave,
    (-0.26 + 0.12 * pointRight - 0.28 * upWave) * e,
    (-1.05 + 0.70 * pointRight + 0.55 * upWave) * e,
    -0.20 * e,
    -0.22 * s1 * e - 0.30 * upWave * Math.sin(ctx.p),
    -0.15 * e
  );

  setLegs(
    t,
    0.05 * Math.max(0, s1) * e,
    0.05 * Math.max(0, -s1) * e,
    0.08 * s2 * e,
    -0.08 * s2 * e,
    0.10 * e,
    -0.10 * e,
    0.20 * e,
    -0.20 * e,
    0.14 * e,
    0.14 * e,
    0.08 * e,
    0.08 * e
  );

  // Layer the species' innate micro-flavor on top of the hype-crew groove
  SPECIES_FLAVOR[species].accentLayer(t, ctx);
}