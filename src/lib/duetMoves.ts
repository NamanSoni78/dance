// src/lib/duetMoves.ts
// ============================================================================
// GRAND GROUP CHOREOGRAPHER V2.5 — DELIVERABLE A: DUET CHOREOGRAPHY LIBRARY
// 32 full 41-channel partner choreographies with synchronized contact beats,
// multi-taal Indian folk cycles, global street/partner forms, and species-scale
// aware slapstick duets. Zero-allocation, beat-locked, strict TypeScript.
// ============================================================================

import type { JointTargets, MoveContext } from './danceMoves';

export type DuetFacing =
  | 'EACH_OTHER'
  | 'SIDE_BY_SIDE'
  | 'MIRRORED'
  | 'BACK_TO_BACK'
  | 'PERPENDICULAR';

export interface DuetMove {
  id: string;                     // 'DUET_DANDIYA_STRIKES'
  name: string;                   // 'Dandiya Stick Strikes — Partner Raas'
  origin: string;                 // cultural credit, one line
  facing: DuetFacing;             // how the pair is anchored relative to each other
  anchorDistance: number;         // 0.7..2.2 meters between the two pelvises
  energy: number;                 // 0..1
  tempoFit: [number, number];     // BPM range
  durationBars: number;           // 2..8 — duets may hold longer than solo moves
  tags: string[];
  /** FULL 41-channel choreography for partner A (runs on dancer A's rig). */
  poseA: (t: JointTargets, ctx: MoveContext) => void;
  /** FULL 41-channel choreography for partner B — a DIFFERENT body, not a copy
      of A (unless facing is MIRRORED, where B = the engine-mirrored A). */
  poseB: (t: JointTargets, ctx: MoveContext) => void;
}

// ============================================================================
// MATHEMATICAL CONSTANTS & ZERO-ALLOCATION WRITER HELPERS
// ============================================================================

const PI = Math.PI;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;
const PELVIS_REST_Y = 0.90;

/** Clamp scalar v into [lo, hi] with zero allocation. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Bar-locked entrance/exit envelope (0->1 by 15%, flat, ->0 by 100%). */
export function env(progress: number): number {
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
 * Gaussian-like beat window peaking at 1.0 when (beatPhase0to4 - targetBeat) == 0.
 * Pure, zero-allocation helper for surgical contact-beat strikes within a 4-beat bar.
 */
function strikeWindow(barBeat: number, targetBeat: number, sharpness: number): number {
  let d = barBeat - targetBeat;
  if (d > 2) d -= 4;
  if (d < -2) d += 4;
  const x = d * sharpness;
  const v = 1 - x * x;
  return v > 0 ? v * v : 0;
}

/**
 * Writes the 20 core torso/pelvis/spine/chest/neck/head channels.
 * Preserves engine-owned rootRotY and additive pelvisScale* channels.
 * Enforces Physics Law: pelvisY >= 0.45.
 */
export function setBody(
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

/**
 * Writes all 14 upper-limb channels (L/R shoulder XYZ, elbow XY, wrist XZ)
 * with anatomical safety clamping on shoulderX [-2.7, 0.6] and elbowX [-2.4, 0].
 */
export function setArms(
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

/**
 * Writes all 12 lower-limb IK & articulation channels
 * with anatomical safety clamping on footLift [0, 0.22].
 */
export function setLegs(
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

/** Adds subtle squash-and-stretch impulse on top of engine bass squash. */
function addSquash(t: JointTargets, verticalDelta: number): void {
  t.pelvisScaleY += verticalDelta;
  t.pelvisScaleX -= verticalDelta * 0.45;
  t.pelvisScaleZ -= verticalDelta * 0.45;
}

// ============================================================================
// SECTION 1: INDIAN PARTNER & FOLK FORMS (13 MOVES)
// ============================================================================

/**
 * 1. DUET_DANDIYA_PAANCH_TAAL
 * Choreography Note: Classic 5-strike Paanchiya Raas fit into a 4-beat bar
 * (strikes on beats 0.0, 0.75, 1.5, 2.5, 3.25). Crowd sees crisp cross-stick
 * clashes at chest height (species-safe for Cat/Dog/Mouse) with folk side-lunges.
 */
const DUET_DANDIYA_PAANCH_TAAL: DuetMove = {
  id: 'DUET_DANDIYA_PAANCH_TAAL',
  name: 'Dandiya Raas — Paanchiya 5-Strike Cycle',
  origin: 'Saurashtra Navratri Dandiya Raas (Gujarat)',
  facing: 'EACH_OTHER',
  anchorDistance: 1.15,
  energy: 0.78,
  tempoFit: [100, 145],
  durationBars: 4,
  tags: ['indian', 'dandiya', 'arms', 'contact', 'folk'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);
    const s2 = Math.sin(ctx.halfP);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;

    // 5-strike windows across the 4-beat bar:
    // CONTACT: beat 0.0 (right-to-right cross), beat 0.75 (left-to-left),
    // beat 1.5 (overhead double clash), beat 2.5 (low right sweep), beat 3.25 (chest X-lock)
    const k1 = strikeWindow(barBeat, 0.0, 2.6);
    const k2 = strikeWindow(barBeat, 0.75, 2.6);
    const k3 = strikeWindow(barBeat, 1.5, 2.6);
    const k4 = strikeWindow(barBeat, 2.5, 2.6);
    const k5 = strikeWindow(barBeat, 3.25, 2.6);
    const strikeSnap = (k1 + k2 + k3 + k4 + k5) * e;

    const dip = (0.06 * Math.abs(s1) + 0.05 * k4 + 0.03 * ctx.beatPulse) * e;
    const swayX = 0.14 * s2 * e;

    setBody(
      t,
      0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - 0.08 * e - dip,
      swayX,
      (0.06 * (k1 + k3 + k5) - 0.04 * k2) * e,
      (0.08 + 0.10 * k4) * e,
      (0.24 * (k1 - k2) + 0.12 * s2) * e,
      -0.08 * s2 * e,
      0.06 * e,
      0.16 * (k1 - k2) * e,
      -0.06 * s2 * e,
      (0.10 * strikeSnap - 0.08 * k3) * e,
      0.22 * (k1 - k2) * e,
      0.08 * s2 * e,
      1 + 0.04 * strikeSnap,
      -0.05 * k3 * e,
      -0.12 * (k1 - k2) * e,
      0.06 * s1 * e,
      (-0.08 * k3 + 0.08 * k4 - 0.05 * ctx.beatPulse) * e,
      -0.14 * (k1 - k2) * e,
      0.10 * c1 * e
    );

    // Right stick strikes on k1 (chest cross), k3 (high), k4 (low), k5 (double X)
    const sRX = -0.75 - 0.35 * k1 - 0.95 * k3 - 0.10 * k4 - 0.45 * k5 + 0.15 * k2;
    const sRY = 0.38 * k1 - 0.25 * k2 + 0.18 * k4 + 0.42 * k5;
    const sRZ = -0.32 + 0.28 * (k1 + k5) - 0.22 * k3;
    const eRX = -1.05 + 0.45 * (k1 + k3 + k4 + k5) - 0.25 * k2;

    // Left stick strikes on k2 (chest cross), k3 (high), k5 (double X)
    const sLX = -0.75 - 0.35 * k2 - 0.95 * k3 + 0.15 * k1 - 0.45 * k5 + 0.10 * k4;
    const sLY = -0.38 * k2 + 0.25 * k1 - 0.42 * k5;
    const sLZ = 0.32 - 0.28 * (k2 + k5) + 0.22 * k3;
    const eLX = -1.05 + 0.45 * (k2 + k3 + k5) - 0.25 * (k1 + k4);

    setArms(
      t,
      sLX * e,
      sLY * e,
      sLZ * e,
      eLX * e,
      0.22 * (k2 + k5) * e,
      (0.35 * (k2 + k3 + k5) - 0.20 * s1) * e,
      0.18 * k2 * e,
      sRX * e,
      sRY * e,
      sRZ * e,
      eRX * e,
      -0.22 * (k1 + k5) * e,
      (0.35 * (k1 + k3 + k4 + k5) + 0.20 * s1) * e,
      -0.18 * k1 * e
    );

    const liftL = Math.max(0, s1) * 0.12 * e;
    const liftR = Math.max(0, -s1) * 0.12 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.18 * s1 * e,
      -0.18 * s1 * e,
      0.10 * s2 * e,
      0.10 * s2 * e,
      0.20 * e,
      -0.20 * e,
      0.16 * (k4 + 0.3) * e,
      0.16 * (k4 + 0.3) * e,
      0.18 * liftL,
      0.18 * liftR
    );
    addSquash(t, 0.04 * strikeSnap);
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);
    const s2 = Math.sin(ctx.halfP);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;

    // Partner B meets A on the exact 5 contact beats in complementary planes:
    // CONTACT: beat 0.0 (R-to-R), beat 0.75 (L-to-L), beat 1.5 (overhead), beat 2.5 (low R), beat 3.25 (chest X)
    const k1 = strikeWindow(barBeat, 0.0, 2.6);
    const k2 = strikeWindow(barBeat, 0.75, 2.6);
    const k3 = strikeWindow(barBeat, 1.5, 2.6);
    const k4 = strikeWindow(barBeat, 2.5, 2.6);
    const k5 = strikeWindow(barBeat, 3.25, 2.6);
    const strikeSnap = (k1 + k2 + k3 + k4 + k5) * e;

    const dip = (0.06 * Math.abs(c1) + 0.05 * k4 + 0.03 * ctx.beatPulse) * e;
    const swayX = -0.14 * s2 * e;

    setBody(
      t,
      0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - 0.11 * e - dip, // Slightly deeper stance for visual lock across species heights
      swayX,
      (0.06 * (k1 + k3 + k5) - 0.04 * k2) * e,
      (0.09 + 0.10 * k4) * e,
      (0.24 * (k1 - k2) - 0.12 * s2) * e,
      0.08 * s2 * e,
      0.06 * e,
      0.16 * (k1 - k2) * e,
      0.06 * s2 * e,
      (0.10 * strikeSnap - 0.08 * k3) * e,
      0.22 * (k1 - k2) * e,
      -0.08 * s2 * e,
      1 + 0.04 * strikeSnap,
      -0.05 * k3 * e,
      -0.12 * (k1 - k2) * e,
      -0.06 * s1 * e,
      (-0.08 * k3 + 0.08 * k4 - 0.05 * ctx.beatPulse) * e,
      -0.14 * (k1 - k2) * e,
      -0.10 * c1 * e
    );

    const sRX = -0.82 - 0.35 * k1 - 0.92 * k3 - 0.12 * k4 - 0.45 * k5 + 0.15 * k2;
    const sRY = 0.38 * k1 - 0.25 * k2 + 0.18 * k4 + 0.42 * k5;
    const sRZ = -0.30 + 0.28 * (k1 + k5) - 0.22 * k3;
    const eRX = -1.02 + 0.45 * (k1 + k3 + k4 + k5) - 0.25 * k2;

    const sLX = -0.82 - 0.35 * k2 - 0.92 * k3 + 0.15 * k1 - 0.45 * k5 + 0.10 * k4;
    const sLY = -0.38 * k2 + 0.25 * k1 - 0.42 * k5;
    const sLZ = 0.30 - 0.28 * (k2 + k5) + 0.22 * k3;
    const eLX = -1.02 + 0.45 * (k2 + k3 + k5) - 0.25 * (k1 + k4);

    setArms(
      t,
      sLX * e,
      sLY * e,
      sLZ * e,
      eLX * e,
      0.22 * (k2 + k5) * e,
      (0.35 * (k2 + k3 + k5) + 0.20 * s1) * e,
      0.18 * k2 * e,
      sRX * e,
      sRY * e,
      sRZ * e,
      eRX * e,
      -0.22 * (k1 + k5) * e,
      (0.35 * (k1 + k3 + k4 + k5) - 0.20 * s1) * e,
      -0.18 * k1 * e
    );

    const liftL = Math.max(0, -s1) * 0.12 * e;
    const liftR = Math.max(0, s1) * 0.12 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.18 * s1 * e,
      0.18 * s1 * e,
      -0.10 * s2 * e,
      -0.10 * s2 * e,
      0.22 * e,
      -0.22 * e,
      0.18 * (k4 + 0.3) * e,
      0.18 * (k4 + 0.3) * e,
      0.18 * liftL,
      0.18 * liftR
    );
    addSquash(t, 0.04 * strikeSnap);
  },
};

/**
 * 2. DUET_DANDIYA_SAAT_TAAL
 * Choreography Note: Saptataal 7-point diagonal high-low Dandiya pattern across
 * a 2-bar (8-beat) phrase where beats 1..7 strike high/low diagonals and beat 8
 * is a flourish spin-snap.
 */
const DUET_DANDIYA_SAAT_TAAL: DuetMove = {
  id: 'DUET_DANDIYA_SAAT_TAAL',
  name: 'Dandiya Raas — Saptataal 7-Strike Diagonal',
  origin: 'Vadodara & Rajkot Classical Navratri Raas',
  facing: 'EACH_OTHER',
  anchorDistance: 1.2,
  energy: 0.84,
  tempoFit: [105, 150],
  durationBars: 4,
  tags: ['indian', 'dandiya', 'arms', 'spin', 'contact', 'folk'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const phraseBeat = ctx.moveBeat % 8;
    const isSeventh = phraseBeat === 6;
    const isEighthTurn = phraseBeat === 7;
    if (ctx.isBeat && isEighthTurn) {
      ctx.requestSpin(TAU);
    }

    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);
    const sHalf = Math.sin(ctx.halfP);
    // Alternating high (+1) and low (-1) diagonal strikes on beats 0..6
    const highLow = isEighthTurn ? 0 : (phraseBeat % 2 === 0 ? 1 : -1);
    // CONTACT: Every beat 0..6 of the 8-beat cycle hits a diagonal strike on beatPulse
    const contactHit = isEighthTurn ? 0 : ctx.beatPulse;

    const crouch = (highLow < 0 ? 0.16 : 0.05) * e;
    setBody(
      t,
      (isEighthTurn ? 0.07 : 0.025) * ctx.beatPulse * e,
      PELVIS_REST_Y - 0.06 * e - crouch,
      0.16 * sHalf * e,
      0.07 * contactHit * e,
      (0.08 - 0.12 * highLow) * e,
      0.28 * s1 * e,
      -0.09 * c1 * e,
      -0.06 * highLow * e,
      0.20 * s1 * e,
      -0.06 * c1 * e,
      (-0.10 * highLow + 0.08 * contactHit) * e,
      0.24 * s1 * e,
      0.07 * c1 * e,
      1 + 0.05 * contactHit,
      -0.08 * highLow * e,
      -0.14 * s1 * e,
      0.05 * c1 * e,
      (-0.12 * highLow - 0.06 * contactHit) * e,
      -0.16 * s1 * e,
      0.08 * sHalf * e
    );

    // High strikes reach -1.55 rad, low strikes sweep down to -0.55 rad
    const strikeElevation = -1.05 - 0.48 * highLow;
    const rActive = s1 >= 0 ? 1 : 0.25;
    const lActive = s1 < 0 ? 1 : 0.25;

    setArms(
      t,
      (strikeElevation * lActive - 0.55 * (1 - lActive) - (isSeventh ? 0.45 : 0)) * e,
      (-0.35 * lActive - 0.25 * contactHit) * e,
      (0.38 - 0.24 * contactHit) * e,
      (-0.95 + 0.45 * contactHit * lActive) * e,
      0.20 * highLow * e,
      0.38 * contactHit * e,
      0.15 * s1 * e,
      (strikeElevation * rActive - 0.55 * (1 - rActive) - (isSeventh ? 0.45 : 0)) * e,
      (0.35 * rActive + 0.25 * contactHit) * e,
      (-0.38 + 0.24 * contactHit) * e,
      (-0.95 + 0.45 * contactHit * rActive) * e,
      -0.20 * highLow * e,
      0.38 * contactHit * e,
      -0.15 * s1 * e
    );

    const liftL = Math.max(0, s1) * 0.14 * e;
    const liftR = Math.max(0, -s1) * 0.14 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.22 * s1 * e,
      -0.22 * s1 * e,
      0.12 * c1 * e,
      0.12 * c1 * e,
      0.22 * e,
      -0.22 * e,
      (0.14 + (highLow < 0 ? 0.18 : 0)) * e,
      (0.14 + (highLow < 0 ? 0.18 : 0)) * e,
      0.20 * liftL,
      0.20 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const phraseBeat = ctx.moveBeat % 8;
    const isSeventh = phraseBeat === 6;
    const isEighthTurn = phraseBeat === 7;
    if (ctx.isBeat && isEighthTurn) {
      ctx.requestSpin(-TAU);
    }

    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);
    const sHalf = Math.sin(ctx.halfP);
    // Partner B matches the exact same high/low plane so sticks collide cleanly
    // CONTACT: Every beat 0..6 of the 8-beat cycle at shared high/low elevation
    const highLow = isEighthTurn ? 0 : (phraseBeat % 2 === 0 ? 1 : -1);
    const contactHit = isEighthTurn ? 0 : ctx.beatPulse;

    const crouch = (highLow < 0 ? 0.14 : 0.08) * e;
    setBody(
      t,
      (isEighthTurn ? 0.07 : 0.025) * ctx.beatPulse * e,
      PELVIS_REST_Y - 0.08 * e - crouch,
      -0.16 * sHalf * e,
      0.07 * contactHit * e,
      (0.08 - 0.12 * highLow) * e,
      0.28 * s1 * e,
      0.09 * c1 * e,
      -0.06 * highLow * e,
      0.20 * s1 * e,
      0.06 * c1 * e,
      (-0.10 * highLow + 0.08 * contactHit) * e,
      0.24 * s1 * e,
      -0.07 * c1 * e,
      1 + 0.05 * contactHit,
      -0.08 * highLow * e,
      -0.14 * s1 * e,
      -0.05 * c1 * e,
      (-0.12 * highLow - 0.06 * contactHit) * e,
      -0.16 * s1 * e,
      -0.08 * sHalf * e
    );

    const strikeElevation = -1.08 - 0.46 * highLow;
    const rActive = s1 >= 0 ? 1 : 0.25;
    const lActive = s1 < 0 ? 1 : 0.25;

    setArms(
      t,
      (strikeElevation * lActive - 0.55 * (1 - lActive) - (isSeventh ? 0.45 : 0)) * e,
      (-0.35 * lActive - 0.25 * contactHit) * e,
      (0.36 - 0.24 * contactHit) * e,
      (-0.92 + 0.45 * contactHit * lActive) * e,
      0.20 * highLow * e,
      0.38 * contactHit * e,
      0.15 * s1 * e,
      (strikeElevation * rActive - 0.55 * (1 - rActive) - (isSeventh ? 0.45 : 0)) * e,
      (0.35 * rActive + 0.25 * contactHit) * e,
      (-0.36 + 0.24 * contactHit) * e,
      (-0.92 + 0.45 * contactHit * rActive) * e,
      -0.20 * highLow * e,
      0.38 * contactHit * e,
      -0.15 * s1 * e
    );

    const liftL = Math.max(0, -s1) * 0.14 * e;
    const liftR = Math.max(0, s1) * 0.14 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.22 * s1 * e,
      0.22 * s1 * e,
      -0.12 * c1 * e,
      -0.12 * c1 * e,
      0.22 * e,
      -0.22 * e,
      (0.14 + (highLow < 0 ? 0.18 : 0)) * e,
      (0.14 + (highLow < 0 ? 0.18 : 0)) * e,
      0.20 * liftL,
      0.20 * liftR
    );
  },
};

/**
 * 3. DUET_DANDIYA_EKTAAL_DO_TAALI
 * Choreography Note: Crisp 2/4 Ektaal Raas alternating a deep earthward own-palm
 * taali on odd beats (beats 1 & 3) with a ringing partner cross-stick strike on
 * even beats (beats 2 & 4).
 */
const DUET_DANDIYA_EKTAAL_DO_TAALI: DuetMove = {
  id: 'DUET_DANDIYA_EKTAAL_DO_TAALI',
  name: 'Garba-Raas — 2/4 Ektaal Sweep & Strike',
  origin: 'Ahmedabad Sheri Garba & Ektaal Raas',
  facing: 'EACH_OTHER',
  anchorDistance: 1.1,
  energy: 0.72,
  tempoFit: [95, 138],
  durationBars: 4,
  tags: ['indian', 'dandiya', 'garba', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Odd beats (0.0, 2.0 in 0-indexed bar) = low earthward taali
    // Even beats (1.0, 3.0 in 0-indexed bar) = high partner stick strike
    const ownTaali = (strikeWindow(barBeat, 0.0, 2.2) + strikeWindow(barBeat, 2.0, 2.2)) * e;
    // CONTACT: beat 2 and beat 4 of every bar (barBeat 1.0 and 3.0)
    const partnerStrike = (strikeWindow(barBeat, 1.0, 2.4) + strikeWindow(barBeat, 3.0, 2.4)) * e;
    const s2 = Math.sin(ctx.halfP);

    setBody(
      t,
      0.03 * partnerStrike,
      PELVIS_REST_Y - (0.06 + 0.16 * ownTaali) * e,
      0.12 * s2 * e,
      (0.08 * partnerStrike - 0.05 * ownTaali) * e,
      (0.24 * ownTaali - 0.04 * partnerStrike) * e,
      0.18 * s2 * e,
      -0.10 * ownTaali * s2,
      0.18 * ownTaali,
      0.14 * s2 * e,
      -0.08 * s2 * e,
      0.20 * ownTaali - 0.08 * partnerStrike,
      0.16 * s2 * e,
      0.06 * s2 * e,
      1 + 0.04 * (ownTaali + partnerStrike),
      0.14 * ownTaali - 0.08 * partnerStrike,
      -0.10 * s2 * e,
      0,
      0.16 * ownTaali - 0.10 * partnerStrike,
      -0.12 * s2 * e,
      0.08 * s2 * e
    );

    setArms(
      t,
      (-0.65 - 0.20 * ownTaali - 0.72 * partnerStrike) * e,
      (-0.42 * ownTaali - 0.28 * partnerStrike) * e,
      (0.32 - 0.26 * (ownTaali + partnerStrike)) * e,
      (-1.15 + 0.40 * partnerStrike) * e,
      0.25 * ownTaali,
      0.30 * partnerStrike,
      0.20 * ownTaali,
      (-0.65 - 0.20 * ownTaali - 0.78 * partnerStrike) * e,
      (0.42 * ownTaali + 0.36 * partnerStrike) * e,
      (-0.32 + 0.26 * (ownTaali + partnerStrike)) * e,
      (-1.15 + 0.45 * partnerStrike) * e,
      -0.25 * ownTaali,
      0.35 * partnerStrike,
      -0.20 * ownTaali
    );

    const step = Math.sin(ctx.p);
    const liftL = Math.max(0, step) * 0.13 * e;
    const liftR = Math.max(0, -step) * 0.13 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.16 * step * e,
      -0.16 * step * e,
      0.10 * s2 * e,
      0.10 * s2 * e,
      0.24 * e,
      -0.24 * e,
      (0.12 + 0.22 * ownTaali) * e,
      (0.12 + 0.22 * ownTaali) * e,
      0.16 * liftL,
      0.16 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const ownTaali = (strikeWindow(barBeat, 0.0, 2.2) + strikeWindow(barBeat, 2.0, 2.2)) * e;
    // CONTACT: beat 2 and beat 4 of every bar (barBeat 1.0 and 3.0)
    const partnerStrike = (strikeWindow(barBeat, 1.0, 2.4) + strikeWindow(barBeat, 3.0, 2.4)) * e;
    const s2 = Math.sin(ctx.halfP);

    setBody(
      t,
      0.03 * partnerStrike,
      PELVIS_REST_Y - (0.09 + 0.15 * ownTaali) * e,
      -0.12 * s2 * e,
      (0.08 * partnerStrike - 0.05 * ownTaali) * e,
      (0.24 * ownTaali - 0.04 * partnerStrike) * e,
      -0.18 * s2 * e,
      0.10 * ownTaali * s2,
      0.18 * ownTaali,
      -0.14 * s2 * e,
      0.08 * s2 * e,
      0.20 * ownTaali - 0.08 * partnerStrike,
      -0.16 * s2 * e,
      -0.06 * s2 * e,
      1 + 0.04 * (ownTaali + partnerStrike),
      0.14 * ownTaali - 0.08 * partnerStrike,
      0.10 * s2 * e,
      0,
      0.16 * ownTaali - 0.10 * partnerStrike,
      0.12 * s2 * e,
      -0.08 * s2 * e
    );

    setArms(
      t,
      (-0.70 - 0.20 * ownTaali - 0.72 * partnerStrike) * e,
      (-0.42 * ownTaali - 0.28 * partnerStrike) * e,
      (0.32 - 0.26 * (ownTaali + partnerStrike)) * e,
      (-1.12 + 0.40 * partnerStrike) * e,
      0.25 * ownTaali,
      0.30 * partnerStrike,
      0.20 * ownTaali,
      (-0.70 - 0.20 * ownTaali - 0.78 * partnerStrike) * e,
      (0.42 * ownTaali + 0.36 * partnerStrike) * e,
      (-0.32 + 0.26 * (ownTaali + partnerStrike)) * e,
      (-1.12 + 0.45 * partnerStrike) * e,
      -0.25 * ownTaali,
      0.35 * partnerStrike,
      -0.20 * ownTaali
    );

    const step = Math.sin(ctx.p);
    const liftL = Math.max(0, -step) * 0.13 * e;
    const liftR = Math.max(0, step) * 0.13 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.16 * step * e,
      0.16 * step * e,
      -0.10 * s2 * e,
      -0.10 * s2 * e,
      0.24 * e,
      -0.24 * e,
      (0.14 + 0.22 * ownTaali) * e,
      (0.14 + 0.22 * ownTaali) * e,
      0.16 * liftL,
      0.16 * liftR
    );
  },
};

/**
 * 4. DUET_DANDIYA_DRUT_FINALE
 * Choreography Note: High-energy Drut-Laya (double-speed) finale! Rapid 2x-per-beat
 * figure-eight wrist crosses on beats 1..3, exploding into a synchronized spin and
 * overhead X-stick sama lock on beat 4 of every bar.
 */
const DUET_DANDIYA_DRUT_FINALE: DuetMove = {
  id: 'DUET_DANDIYA_DRUT_FINALE',
  name: 'Dandiya Raas — Drut Double-Speed Tornado Finale',
  origin: 'Navratri Midnight Climax (Drut Laya Raas)',
  facing: 'EACH_OTHER',
  anchorDistance: 1.05,
  energy: 0.96,
  tempoFit: [118, 165],
  durationBars: 4,
  tags: ['indian', 'dandiya', 'spin', 'arms', 'contact', 'jump'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const isBeat4 = barBeat >= 3.0;
    if (ctx.isBeat && (ctx.moveBeat % 8 === 3 || ctx.moveBeat % 8 === 7)) {
      ctx.requestSpin(TAU);
    }

    // Double-speed oscillation (2 cycles per beat)
    const fastSin = Math.sin(ctx.p * 2);
    const fastCos = Math.cos(ctx.p * 2);
    // CONTACT: Continuous rapid 8th-note clashes during beats 0..3, plus locked overhead X-strike on beat 3.5
    const lockStrike = strikeWindow(barBeat, 3.5, 2.8) * e;
    const flurry = (isBeat4 ? 0.2 : 1.0) * e;

    setBody(
      t,
      (0.04 * ctx.beatPulse + 0.06 * lockStrike) * e,
      PELVIS_REST_Y - (0.09 + 0.05 * Math.abs( Math.sin(ctx.p) ) - 0.04 * lockStrike) * e,
      0.10 * Math.sin(ctx.p) * e,
      0.08 * lockStrike,
      (0.06 - 0.10 * lockStrike) * e,
      0.26 * fastSin * flurry,
      -0.08 * fastCos * flurry,
      0.05 * e,
      0.22 * fastSin * flurry,
      -0.06 * fastCos * flurry,
      (0.08 - 0.14 * lockStrike) * e,
      0.28 * fastSin * flurry,
      0.06 * fastCos * flurry,
      1 + 0.06 * ctx.beatPulse * e,
      -0.08 * lockStrike,
      -0.15 * fastSin * flurry,
      0,
      -0.12 * lockStrike - 0.05 * ctx.beatPulse * e,
      -0.18 * fastSin * flurry,
      0.08 * fastSin * flurry
    );

    setArms(
      t,
      (-1.10 + 0.32 * fastSin * flurry - 0.65 * lockStrike) * e,
      (-0.36 * fastCos * flurry - 0.35 * lockStrike) * e,
      (0.28 - 0.22 * lockStrike) * e,
      (-1.05 + 0.35 * Math.abs(fastSin) * flurry + 0.55 * lockStrike) * e,
      0.30 * fastSin * flurry,
      0.45 * fastCos * flurry,
      0.22 * lockStrike,
      (-1.10 - 0.32 * fastSin * flurry - 0.65 * lockStrike) * e,
      (-0.36 * fastCos * flurry + 0.35 * lockStrike) * e,
      (-0.28 + 0.22 * lockStrike) * e,
      (-1.05 + 0.35 * Math.abs(fastCos) * flurry + 0.55 * lockStrike) * e,
      -0.30 * fastSin * flurry,
      -0.45 * fastCos * flurry,
      -0.22 * lockStrike
    );

    const s1 = Math.sin(ctx.p);
    const liftL = (Math.max(0, s1) * 0.16 + 0.05 * lockStrike) * e;
    const liftR = (Math.max(0, -s1) * 0.16 + 0.05 * lockStrike) * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.24 * s1 * e,
      -0.24 * s1 * e,
      0.10 * fastCos * flurry,
      0.10 * fastCos * flurry,
      0.20 * e,
      -0.20 * e,
      0.16 * e,
      0.16 * e,
      0.22 * liftL,
      0.22 * liftR
    );
    addSquash(t, 0.05 * lockStrike);
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const isBeat4 = barBeat >= 3.0;
    if (ctx.isBeat && (ctx.moveBeat % 8 === 3 || ctx.moveBeat % 8 === 7)) {
      ctx.requestSpin(-TAU);
    }

    const fastSin = Math.sin(ctx.p * 2);
    const fastCos = Math.cos(ctx.p * 2);
    // CONTACT: Continuous rapid 8th-note clashes during beats 0..3, plus locked overhead X-strike on beat 3.5
    const lockStrike = strikeWindow(barBeat, 3.5, 2.8) * e;
    const flurry = (isBeat4 ? 0.2 : 1.0) * e;

    setBody(
      t,
      (0.04 * ctx.beatPulse + 0.06 * lockStrike) * e,
      PELVIS_REST_Y - (0.11 + 0.05 * Math.abs(Math.sin(ctx.p)) - 0.04 * lockStrike) * e,
      -0.10 * Math.sin(ctx.p) * e,
      0.08 * lockStrike,
      (0.06 - 0.10 * lockStrike) * e,
      0.26 * fastSin * flurry,
      0.08 * fastCos * flurry,
      0.05 * e,
      0.22 * fastSin * flurry,
      0.06 * fastCos * flurry,
      (0.08 - 0.14 * lockStrike) * e,
      0.28 * fastSin * flurry,
      -0.06 * fastCos * flurry,
      1 + 0.06 * ctx.beatPulse * e,
      -0.08 * lockStrike,
      -0.15 * fastSin * flurry,
      0,
      -0.12 * lockStrike - 0.05 * ctx.beatPulse * e,
      -0.18 * fastSin * flurry,
      -0.08 * fastSin * flurry
    );

    setArms(
      t,
      (-1.14 + 0.32 * fastSin * flurry - 0.62 * lockStrike) * e,
      (-0.36 * fastCos * flurry - 0.35 * lockStrike) * e,
      (0.28 - 0.22 * lockStrike) * e,
      (-1.02 + 0.35 * Math.abs(fastSin) * flurry + 0.55 * lockStrike) * e,
      0.30 * fastSin * flurry,
      0.45 * fastCos * flurry,
      0.22 * lockStrike,
      (-1.14 - 0.32 * fastSin * flurry - 0.62 * lockStrike) * e,
      (-0.36 * fastCos * flurry + 0.35 * lockStrike) * e,
      (-0.28 + 0.22 * lockStrike) * e,
      (-1.02 + 0.35 * Math.abs(fastCos) * flurry + 0.55 * lockStrike) * e,
      -0.30 * fastSin * flurry,
      -0.45 * fastCos * flurry,
      -0.22 * lockStrike
    );

    const s1 = Math.sin(ctx.p);
    const liftL = (Math.max(0, -s1) * 0.16 + 0.05 * lockStrike) * e;
    const liftR = (Math.max(0, s1) * 0.16 + 0.05 * lockStrike) * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.24 * s1 * e,
      0.24 * s1 * e,
      -0.10 * fastCos * flurry,
      -0.10 * fastCos * flurry,
      0.20 * e,
      -0.20 * e,
      0.18 * e,
      0.18 * e,
      0.22 * liftL,
      0.22 * liftR
    );
    addSquash(t, 0.05 * lockStrike);
  },
};

/**
 * 5. DUET_GARBA_DODHIYU_SWIRL
 * Choreography Note: Classic Teen-Taali Dodhiyu Garba in MIRRORED side-by-side
 * alignment. Deep sweeping lunge inward with low taali on beat 1, mid taali on
 * beat 2, high blossoming lotus clap on beat 3, and suspended pause-arch on beat 4.
 */
const DUET_GARBA_DODHIYU_SWIRL: DuetMove = {
  id: 'DUET_GARBA_DODHIYU_SWIRL',
  name: 'Dodhiyu Garba — Three-Clap Lotus Swirl',
  origin: 'Saurashtra & Kutch Traditional Teen-Taali Garba',
  facing: 'MIRRORED',
  anchorDistance: 1.35,
  energy: 0.70,
  tempoFit: [92, 132],
  durationBars: 4,
  tags: ['indian', 'garba', 'groove', 'arms', 'folk'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Synchronized Teen-Taali claps on beats 1, 2, 3 (barBeat 0.0, 1.0, 2.0)
    const cLow = strikeWindow(barBeat, 0.0, 2.2) * e;
    const cMid = strikeWindow(barBeat, 1.0, 2.2) * e;
    const cHigh = strikeWindow(barBeat, 2.0, 2.2) * e;
    const archHold = strikeWindow(barBeat, 3.0, 1.8) * e;
    const qSin = Math.sin(ctx.quarterP);
    const qCos = Math.cos(ctx.quarterP);

    setBody(
      t,
      0.03 * (cHigh + archHold),
      PELVIS_REST_Y - (0.06 + 0.18 * cLow + 0.08 * cMid - 0.02 * archHold) * e,
      0.18 * qSin * e,
      0.06 * qCos * e,
      (0.28 * cLow + 0.10 * cMid - 0.14 * archHold) * e,
      (0.24 * qSin + 0.18 * cLow) * e,
      -0.14 * qSin * e,
      (0.20 * cLow - 0.12 * archHold) * e,
      0.18 * qSin * e,
      -0.10 * qSin * e,
      (0.22 * cLow - 0.16 * (cHigh + archHold)) * e,
      0.20 * qSin * e,
      0.08 * qCos * e,
      1 + 0.04 * (cLow + cMid + cHigh),
      (0.15 * cLow - 0.12 * archHold) * e,
      -0.12 * qSin * e,
      0.06 * qSin * e,
      (0.18 * cLow - 0.14 * (cHigh + archHold)) * e,
      -0.14 * qSin * e,
      0.10 * qSin * e
    );

    const clapPinch = cLow + cMid + cHigh;
    const armElev = -0.58 * cLow - 1.05 * cMid - 1.75 * cHigh - 1.45 * archHold - 0.45 * (1 - clapPinch - archHold);
    const spread = 0.65 * archHold + 0.12 * (1 - clapPinch);

    setArms(
      t,
      armElev * e,
      (-0.38 * clapPinch + 0.30 * archHold) * e,
      (spread + 0.15 * (1 - clapPinch)) * e,
      (-1.20 * clapPinch - 0.45 * archHold - 0.65 * (1 - clapPinch - archHold)) * e,
      0.25 * clapPinch,
      0.30 * clapPinch - 0.25 * archHold,
      0.18 * cLow,
      armElev * e,
      (0.38 * clapPinch - 0.30 * archHold) * e,
      (-spread - 0.15 * (1 - clapPinch)) * e,
      (-1.20 * clapPinch - 0.45 * archHold - 0.65 * (1 - clapPinch - archHold)) * e,
      -0.25 * clapPinch,
      0.30 * clapPinch - 0.25 * archHold,
      -0.18 * cLow
    );

    const s1 = Math.sin(ctx.p);
    const liftL = Math.max(0, s1) * 0.14 * e;
    const liftR = Math.max(0, -s1) * 0.14 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.20 * qSin * e,
      -0.20 * qSin * e,
      0.14 * qCos * e,
      0.14 * qCos * e,
      0.25 * e,
      -0.25 * e,
      (0.14 + 0.24 * cLow) * e,
      (0.14 + 0.24 * cLow) * e,
      0.20 * liftL,
      0.20 * liftR
    );
  },
  // MIRRORED facing: engine mirrors B after poseB runs, so poseB uses A's exact channel trajectory
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    DUET_GARBA_DODHIYU_SWIRL.poseA(t, ctx);
  },
};

/**
 * 6. DUET_BHANGRA_JODI_BOUNCE
 * Choreography Note: Infectious Punjabi Jodi Bhangra! Both dancers ride a deep
 * dhol-driven knee-hop bounce (`p`) with high-pitched shoulders, trading an inward
 * partner high-five slap on Beat 2 and Beat 4 while holding the classic Bhangra
 * L-arm skyward thumb-pinch with the outer hand.
 */
const DUET_BHANGRA_JODI_BOUNCE: DuetMove = {
  id: 'DUET_BHANGRA_JODI_BOUNCE',
  name: 'Bhangra Jodi — Dhamaal Shoulder Bounce & Slap',
  origin: 'Majha & Malwa Punjabi Bhangra Jodi (Punjab)',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 1.15,
  energy: 0.90,
  tempoFit: [96, 145],
  durationBars: 4,
  tags: ['indian', 'bhangra', 'jump', 'arms', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 2 and Beat 4 (barBeat 1.0 and 3.0) inner-hand partner slap (A's Right meets B's Left)
    const slap = (strikeWindow(barBeat, 1.0, 2.5) + strikeWindow(barBeat, 3.0, 2.5)) * e;
    const bounce = Math.abs(s1);
    const shrug = (0.5 + 0.5 * Math.sin(ctx.p * 2)) * e;

    setBody(
      t,
      (0.055 * bounce + 0.03 * ctx.beatPulse) * e,
      PELVIS_REST_Y - (0.08 + 0.07 * (1 - bounce)) * e,
      0.08 * s1 * e,
      0.03 * slap,
      -0.06 * e,
      (-0.18 * slap + 0.12 * s1) * e,
      (0.10 * s1 - 0.08 * slap) * e,
      -0.05 * e,
      -0.14 * slap,
      0.08 * s1 * e,
      (-0.10 - 0.06 * ctx.beatPulse) * e,
      -0.18 * slap,
      -0.08 * s1 * e,
      1 + 0.06 * ctx.beatPulse * e,
      -0.06 * e,
      0.16 * slap,
      -0.10 * c1 * e,
      (-0.08 + 0.10 * ctx.beatPulse) * e,
      0.20 * slap,
      0.14 * s1 * e
    );

    // A is on the left: Left (outer) arm pumps skyward Bhangra bulb; Right (inner) arm slaps right toward B
    setArms(
      t,
      (-1.85 - 0.30 * shrug) * e,
      0.20 * s1 * e,
      (0.52 + 0.12 * shrug) * e,
      (-0.85 + 0.20 * shrug) * e,
      0.35 * e,
      0.28 * s1 * e,
      0.22 * e,
      (-0.98 - 0.35 * slap - 0.45 * (1 - slap) * shrug) * e,
      (-0.48 * slap + 0.15 * (1 - slap)) * e,
      (-0.68 * slap - 0.38 * (1 - slap)) * e,
      (-0.40 * slap - 1.10 * (1 - slap)) * e,
      -0.30 * slap,
      0.40 * slap,
      -0.25 * slap
    );

    // Classic Bhangra alternating high-knee dhamaal kick
    const liftL = Math.max(0, s1) * 0.20 * e;
    const liftR = Math.max(0, -s1) * 0.20 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.28 * liftL,
      0.28 * liftR,
      0.12 * e,
      -0.12 * e,
      0.28 * e,
      -0.28 * e,
      0.22 * (1 - bounce) * e,
      0.22 * (1 - bounce) * e,
      -0.15 * liftL,
      -0.15 * liftR
    );
    addSquash(t, 0.05 * ctx.beatPulse * e);
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 2 and Beat 4 (barBeat 1.0 and 3.0) inner-hand partner slap (B's Left meets A's Right)
    const slap = (strikeWindow(barBeat, 1.0, 2.5) + strikeWindow(barBeat, 3.0, 2.5)) * e;
    const bounce = Math.abs(s1);
    const shrug = (0.5 + 0.5 * Math.sin(ctx.p * 2)) * e;

    setBody(
      t,
      (0.055 * bounce + 0.03 * ctx.beatPulse) * e,
      PELVIS_REST_Y - (0.10 + 0.07 * (1 - bounce)) * e,
      -0.08 * s1 * e,
      0.03 * slap,
      -0.06 * e,
      (0.18 * slap - 0.12 * s1) * e,
      (-0.10 * s1 + 0.08 * slap) * e,
      -0.05 * e,
      0.14 * slap,
      -0.08 * s1 * e,
      (-0.10 - 0.06 * ctx.beatPulse) * e,
      0.18 * slap,
      0.08 * s1 * e,
      1 + 0.06 * ctx.beatPulse * e,
      -0.06 * e,
      -0.16 * slap,
      0.10 * c1 * e,
      (-0.08 + 0.10 * ctx.beatPulse) * e,
      -0.20 * slap,
      -0.14 * s1 * e
    );

    // B is on the right: Left (inner) arm slaps left toward A; Right (outer) arm pumps skyward Bhangra bulb
    setArms(
      t,
      (-1.02 - 0.35 * slap - 0.45 * (1 - slap) * shrug) * e,
      (0.48 * slap - 0.15 * (1 - slap)) * e,
      (0.68 * slap + 0.38 * (1 - slap)) * e,
      (-0.40 * slap - 1.10 * (1 - slap)) * e,
      0.30 * slap,
      0.40 * slap,
      0.25 * slap,
      (-1.85 - 0.30 * shrug) * e,
      -0.20 * s1 * e,
      (-0.52 - 0.12 * shrug) * e,
      (-0.85 + 0.20 * shrug) * e,
      -0.35 * e,
      -0.28 * s1 * e,
      -0.22 * e
    );

    const liftL = Math.max(0, -s1) * 0.20 * e;
    const liftR = Math.max(0, s1) * 0.20 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.28 * liftL,
      0.28 * liftR,
      0.12 * e,
      -0.12 * e,
      0.28 * e,
      -0.28 * e,
      0.22 * (1 - bounce) * e,
      0.22 * (1 - bounce) * e,
      -0.15 * liftL,
      -0.15 * liftR
    );
    addSquash(t, 0.05 * ctx.beatPulse * e);
  },
};

/**
 * 7. DUET_BHANGRA_GIDDHA_TAALI
 * Choreography Note: High-speed Giddha & Bhangra Chonki squat-and-clap sequence!
 * Dancers face each other closely (`anchorDistance: 0.95`), dropping into a
 * Punjabi chonki squat on beats 1 & 2 for rapid low partner claps, then springing
 * upright on beats 3 & 4 for rapid overhead double-palm partner strikes.
 */
const DUET_BHANGRA_GIDDHA_TAALI: DuetMove = {
  id: 'DUET_BHANGRA_GIDDHA_TAALI',
  name: 'Giddha & Chonki — Rapid Partner Taali Duel',
  origin: 'Punjabi Giddha Boliyan & Malwai Giddha',
  facing: 'EACH_OTHER',
  anchorDistance: 0.95,
  energy: 0.88,
  tempoFit: [102, 150],
  durationBars: 4,
  tags: ['indian', 'bhangra', 'contact', 'arms', 'floor'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Beats 0..2 = deep chonki squat with low partner claps; Beats 2..4 = upright high claps
    const isLowPhase = barBeat < 2.0 ? 1 : 0;
    // CONTACT: Double-time partner palm claps on every half-beat (8 contacts per bar)
    const doublePulse = 0.5 + 0.5 * Math.cos(ctx.p * 2);
    const s1 = Math.sin(ctx.p);

    const squatDepth = (isLowPhase ? 0.32 : 0.06) * e;
    setBody(
      t,
      (1 - isLowPhase) * 0.04 * ctx.beatPulse * e,
      PELVIS_REST_Y - squatDepth - 0.04 * doublePulse * e,
      0.08 * s1 * e,
      0.08 * doublePulse * e,
      (0.22 * isLowPhase - 0.06 * (1 - isLowPhase)) * e,
      0.12 * s1 * e,
      -0.08 * s1 * e,
      0.14 * isLowPhase * e,
      0.10 * s1 * e,
      -0.06 * s1 * e,
      (0.16 * isLowPhase - 0.10 * (1 - isLowPhase)) * e,
      0.12 * s1 * e,
      0.06 * s1 * e,
      1 + 0.05 * doublePulse * e,
      0.10 * isLowPhase * e,
      -0.08 * s1 * e,
      0,
      (0.12 * isLowPhase - 0.10 * (1 - isLowPhase) - 0.06 * doublePulse) * e,
      -0.10 * s1 * e,
      0.09 * s1 * e
    );

    const pitch = isLowPhase ? -0.82 - 0.25 * doublePulse : -1.42 - 0.28 * doublePulse;
    setArms(
      t,
      pitch * e,
      -0.30 * doublePulse * e,
      (0.32 - 0.24 * doublePulse) * e,
      (-1.05 + 0.55 * doublePulse) * e,
      0.20 * e,
      0.38 * doublePulse * e,
      0.12 * s1 * e,
      pitch * e,
      0.30 * doublePulse * e,
      (-0.32 + 0.24 * doublePulse) * e,
      (-1.05 + 0.55 * doublePulse) * e,
      -0.20 * e,
      0.38 * doublePulse * e,
      -0.12 * s1 * e
    );

    const liftL = (1 - isLowPhase) * Math.max(0, s1) * 0.15 * e;
    const liftR = (1 - isLowPhase) * Math.max(0, -s1) * 0.15 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.12 * s1 * e,
      -0.12 * s1 * e,
      0.08 * e,
      -0.08 * e,
      0.32 * e,
      -0.32 * e,
      (0.15 + 0.35 * isLowPhase) * e,
      (0.15 + 0.35 * isLowPhase) * e,
      0.22 * isLowPhase * e,
      0.22 * isLowPhase * e
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const isLowPhase = barBeat < 2.0 ? 1 : 0;
    // CONTACT: Double-time partner palm claps on every half-beat matching A's exact elevation
    const doublePulse = 0.5 + 0.5 * Math.cos(ctx.p * 2);
    const s1 = Math.sin(ctx.p);

    const squatDepth = (isLowPhase ? 0.30 : 0.08) * e;
    setBody(
      t,
      (1 - isLowPhase) * 0.04 * ctx.beatPulse * e,
      PELVIS_REST_Y - squatDepth - 0.04 * doublePulse * e,
      -0.08 * s1 * e,
      0.08 * doublePulse * e,
      (0.22 * isLowPhase - 0.06 * (1 - isLowPhase)) * e,
      -0.12 * s1 * e,
      0.08 * s1 * e,
      0.14 * isLowPhase * e,
      -0.10 * s1 * e,
      0.06 * s1 * e,
      (0.16 * isLowPhase - 0.10 * (1 - isLowPhase)) * e,
      -0.12 * s1 * e,
      -0.06 * s1 * e,
      1 + 0.05 * doublePulse * e,
      0.10 * isLowPhase * e,
      0.08 * s1 * e,
      0,
      (0.12 * isLowPhase - 0.10 * (1 - isLowPhase) - 0.06 * doublePulse) * e,
      0.10 * s1 * e,
      -0.09 * s1 * e
    );

    const pitch = isLowPhase ? -0.85 - 0.25 * doublePulse : -1.45 - 0.28 * doublePulse;
    setArms(
      t,
      pitch * e,
      -0.30 * doublePulse * e,
      (0.32 - 0.24 * doublePulse) * e,
      (-1.05 + 0.55 * doublePulse) * e,
      0.20 * e,
      0.38 * doublePulse * e,
      -0.12 * s1 * e,
      pitch * e,
      0.30 * doublePulse * e,
      (-0.32 + 0.24 * doublePulse) * e,
      (-1.05 + 0.55 * doublePulse) * e,
      -0.20 * e,
      0.38 * doublePulse * e,
      0.12 * s1 * e
    );

    const liftL = (1 - isLowPhase) * Math.max(0, -s1) * 0.15 * e;
    const liftR = (1 - isLowPhase) * Math.max(0, s1) * 0.15 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.12 * s1 * e,
      0.12 * s1 * e,
      0.08 * e,
      -0.08 * e,
      0.32 * e,
      -0.32 * e,
      (0.15 + 0.35 * isLowPhase) * e,
      (0.15 + 0.35 * isLowPhase) * e,
      0.22 * isLowPhase * e,
      0.22 * isLowPhase * e
    );
  },
};

/**
 * 8. DUET_KATHAK_CHAKKAR_SHADOW
 * Choreography Note: Classical Lucknow/Jaipur Gharana Kathak Shadow-Spin!
 * Partner A initiates a razor-sharp Chakkar spin on Beat 1; Partner B spins
 * on Beat 2 (1-beat canon lag); on Beats 3 & 4 both resolve into a geometric
 * Tihai Sama freeze with inner wrists touching in Utpatti mudra.
 */
const DUET_KATHAK_CHAKKAR_SHADOW: DuetMove = {
  id: 'DUET_KATHAK_CHAKKAR_SHADOW',
  name: 'Kathak Jugalbandi — Chakkar Shadow-Spin & Tihai',
  origin: 'Lucknow & Jaipur Gharana Classical Kathak',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 1.25,
  energy: 0.82,
  tempoFit: [95, 142],
  durationBars: 4,
  tags: ['indian', 'kathak', 'spin', 'pose', 'contact', 'arms'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Partner A spins on Beat 0 of every bar
    if (ctx.isBeat && barBeatInt === 0) {
      ctx.requestSpin(TAU);
    }
    // CONTACT: Beat 3.0..3.8 (barBeat >= 2.8) Sama Tihai inner-wrist touch
    const samaLock = strikeWindow(barBeat, 3.2, 2.0) * e;
    const spinPhase = strikeWindow(barBeat, 0.3, 2.2) * e;
    const tatkar = Math.sin(ctx.p * 2);

    setBody(
      t,
      0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.04 + 0.05 * samaLock) * e,
      0.05 * samaLock,
      0.04 * samaLock,
      -0.04 * e,
      -0.22 * samaLock,
      0.08 * samaLock,
      -0.04 * e,
      -0.16 * samaLock,
      0.06 * samaLock,
      (-0.08 - 0.06 * samaLock) * e,
      -0.20 * samaLock,
      -0.06 * samaLock,
      1 + 0.04 * samaLock,
      -0.04 * e,
      0.24 * samaLock,
      -0.08 * samaLock,
      -0.06 * e,
      0.28 * samaLock,
      0.10 * samaLock
    );

    // During spinPhase: right arm overhead vertical axis (-2.25), left arm horizontal (-1.0)
    // During samaLock: right (inner) arm extends right to touch B's left wrist; left arm frames crown
    setArms(
      t,
      (-1.05 - 0.95 * samaLock - 0.20 * spinPhase) * e,
      (0.32 * samaLock - 0.20 * spinPhase) * e,
      (0.55 - 0.25 * samaLock + 0.30 * spinPhase) * e,
      (-0.65 - 0.65 * samaLock + 0.35 * spinPhase) * e,
      0.30 * samaLock,
      -0.35 * samaLock,
      0.25 * samaLock,
      (-2.20 * spinPhase - 1.08 * samaLock - 0.85 * (1 - spinPhase - samaLock)) * e,
      (-0.42 * samaLock + 0.15 * spinPhase) * e,
      (-0.65 * samaLock - 0.18 * spinPhase - 0.35 * (1 - spinPhase - samaLock)) * e,
      (-0.30 * samaLock - 0.45 * spinPhase - 1.15 * (1 - spinPhase - samaLock)) * e,
      -0.25 * samaLock,
      0.42 * samaLock,
      -0.30 * samaLock
    );

    // Rapid ghungroo tatkar foot-stamps during non-sama beats, frozen tribhangi on sama
    const stampL = (1 - samaLock) * Math.max(0, tatkar) * 0.11 * e;
    const stampR = (1 - samaLock) * Math.max(0, -tatkar) * 0.11 * e;
    setLegs(
      t,
      stampL,
      stampR + 0.06 * samaLock,
      0.10 * samaLock,
      -0.12 * samaLock,
      0.06 * samaLock,
      -0.08 * samaLock,
      0.26 * e,
      -0.26 * e,
      0.12 * e,
      (0.12 + 0.14 * samaLock) * e,
      -0.20 * stampL,
      -0.20 * stampR + 0.25 * samaLock
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Partner B spins 1 beat AFTER Partner A (on Beat 1 of every bar)
    if (ctx.isBeat && barBeatInt === 1) {
      ctx.requestSpin(-TAU);
    }
    // CONTACT: Beat 3.0..3.8 Sama Tihai inner-wrist touch (B's Left wrist meets A's Right wrist)
    const samaLock = strikeWindow(barBeat, 3.2, 2.0) * e;
    const spinPhase = strikeWindow(barBeat, 1.3, 2.2) * e;
    const tatkar = Math.sin(ctx.p * 2);

    setBody(
      t,
      0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.06 + 0.05 * samaLock) * e,
      -0.05 * samaLock,
      0.04 * samaLock,
      -0.04 * e,
      0.22 * samaLock,
      -0.08 * samaLock,
      -0.04 * e,
      0.16 * samaLock,
      -0.06 * samaLock,
      (-0.08 - 0.06 * samaLock) * e,
      0.20 * samaLock,
      0.06 * samaLock,
      1 + 0.04 * samaLock,
      -0.04 * e,
      -0.24 * samaLock,
      0.08 * samaLock,
      -0.06 * e,
      -0.28 * samaLock,
      -0.10 * samaLock
    );

    setArms(
      t,
      (-2.20 * spinPhase - 1.12 * samaLock - 0.85 * (1 - spinPhase - samaLock)) * e,
      (0.42 * samaLock - 0.15 * spinPhase) * e,
      (0.65 * samaLock + 0.18 * spinPhase + 0.35 * (1 - spinPhase - samaLock)) * e,
      (-0.30 * samaLock - 0.45 * spinPhase - 1.15 * (1 - spinPhase - samaLock)) * e,
      0.25 * samaLock,
      0.42 * samaLock,
      0.30 * samaLock,
      (-1.05 - 0.95 * samaLock - 0.20 * spinPhase) * e,
      (-0.32 * samaLock + 0.20 * spinPhase) * e,
      (-0.55 + 0.25 * samaLock - 0.30 * spinPhase) * e,
      (-0.65 - 0.65 * samaLock + 0.35 * spinPhase) * e,
      -0.30 * samaLock,
      -0.35 * samaLock,
      -0.25 * samaLock
    );

    const stampL = (1 - samaLock) * Math.max(0, -tatkar) * 0.11 * e;
    const stampR = (1 - samaLock) * Math.max(0, tatkar) * 0.11 * e;
    setLegs(
      t,
      stampL + 0.06 * samaLock,
      stampR,
      -0.12 * samaLock,
      0.10 * samaLock,
      0.08 * samaLock,
      -0.06 * samaLock,
      0.26 * e,
      -0.26 * e,
      (0.12 + 0.14 * samaLock) * e,
      0.12 * e,
      0.25 * samaLock - 0.20 * stampL,
      -0.20 * stampR
    );
  },
};

/**
 * 9. DUET_KATHAK_SAMA_DIALOGUE
 * Choreography Note: Call-and-response Sawal-Jawab Kathak dialogue facing each
 * other. Bar 1 (beats 0..1): A performs rapid tatkar & hastak while B holds a
 * regal listener mudra; Beats 2..3: B answers with double-time tatkar while A
 * holds; Beat 4 (barBeat 3.0..3.8): both strike a locked palm-to-palm Sama freeze!
 */
const DUET_KATHAK_SAMA_DIALOGUE: DuetMove = {
  id: 'DUET_KATHAK_SAMA_DIALOGUE',
  name: 'Kathak Sawal-Jawab — Tatkar & Sama Freeze Dialogue',
  origin: 'Benaras & Lucknow Gharana Sawal-Jawab Jugalbandi',
  facing: 'EACH_OTHER',
  anchorDistance: 1.05,
  energy: 0.76,
  tempoFit: [90, 138],
  durationBars: 4,
  tags: ['indian', 'kathak', 'footwork', 'pose', 'contact'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const aActive = barBeat < 1.5 ? 1 : 0;
    // CONTACT: Beat 4 of each bar (barBeat 3.0..3.8) synchronized dual-palm Sama press
    const sama = strikeWindow(barBeat, 3.25, 2.2) * e;
    const tatkar = Math.sin(ctx.p * 2);
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.025 * aActive * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.05 + 0.06 * sama + 0.04 * aActive * Math.abs(s1)) * e,
      0.06 * aActive * s1 * e,
      0.09 * sama,
      (-0.05 + 0.08 * sama) * e,
      0.16 * aActive * s1 * e,
      -0.06 * aActive * s1 * e,
      -0.04 * e,
      0.14 * aActive * s1 * e,
      0,
      (-0.08 - 0.06 * sama) * e,
      0.18 * aActive * s1 * e,
      0.05 * aActive * s1 * e,
      1 + 0.04 * sama,
      -0.05 * sama,
      -0.12 * aActive * s1 * e,
      0.06 * sama,
      (-0.06 - 0.06 * sama) * e,
      -0.14 * aActive * s1 * e,
      0.08 * aActive * tatkar * e
    );

    setArms(
      t,
      (-0.85 - 0.55 * aActive * (0.5 + 0.5 * s1) - 0.30 * sama) * e,
      (-0.35 * sama + 0.25 * aActive * s1) * e,
      (0.32 - 0.20 * sama + 0.22 * aActive) * e,
      (-1.10 + 0.45 * sama + 0.30 * aActive * s1) * e,
      0.20 * e,
      0.45 * sama + 0.25 * aActive * tatkar * e,
      0.15 * e,
      (-0.85 - 0.55 * aActive * (0.5 - 0.5 * s1) - 0.30 * sama) * e,
      (0.35 * sama - 0.25 * aActive * s1) * e,
      (-0.32 + 0.20 * sama - 0.22 * aActive) * e,
      (-1.10 + 0.45 * sama - 0.30 * aActive * s1) * e,
      -0.20 * e,
      0.45 * sama - 0.25 * aActive * tatkar * e,
      -0.15 * e
    );

    const liftL = aActive * Math.max(0, tatkar) * 0.14 * e;
    const liftR = aActive * Math.max(0, -tatkar) * 0.14 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.10 * sama,
      -0.10 * sama,
      0.05 * e,
      -0.05 * e,
      0.28 * e,
      -0.28 * e,
      0.14 * e,
      0.14 * e,
      -0.22 * liftL,
      -0.22 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const bActive = barBeat >= 1.5 && barBeat < 3.0 ? 1 : 0;
    // CONTACT: Beat 4 of each bar (barBeat 3.0..3.8) synchronized dual-palm Sama press
    const sama = strikeWindow(barBeat, 3.25, 2.2) * e;
    const tatkar = Math.sin(ctx.p * 2);
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.025 * bActive * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.07 + 0.06 * sama + 0.04 * bActive * Math.abs(s1)) * e,
      -0.06 * bActive * s1 * e,
      0.09 * sama,
      (-0.05 + 0.08 * sama) * e,
      -0.16 * bActive * s1 * e,
      0.06 * bActive * s1 * e,
      -0.04 * e,
      -0.14 * bActive * s1 * e,
      0,
      (-0.08 - 0.06 * sama) * e,
      -0.18 * bActive * s1 * e,
      -0.05 * bActive * s1 * e,
      1 + 0.04 * sama,
      -0.05 * sama,
      0.12 * bActive * s1 * e,
      -0.06 * sama,
      (-0.06 - 0.06 * sama) * e,
      0.14 * bActive * s1 * e,
      -0.08 * bActive * tatkar * e
    );

    setArms(
      t,
      (-0.88 - 0.55 * bActive * (0.5 + 0.5 * s1) - 0.30 * sama) * e,
      (-0.35 * sama + 0.25 * bActive * s1) * e,
      (0.32 - 0.20 * sama + 0.22 * bActive) * e,
      (-1.08 + 0.45 * sama + 0.30 * bActive * s1) * e,
      0.20 * e,
      0.45 * sama + 0.25 * bActive * tatkar * e,
      0.15 * e,
      (-0.88 - 0.55 * bActive * (0.5 - 0.5 * s1) - 0.30 * sama) * e,
      (0.35 * sama - 0.25 * bActive * s1) * e,
      (-0.32 + 0.20 * sama - 0.22 * bActive) * e,
      (-1.08 + 0.45 * sama - 0.30 * bActive * s1) * e,
      -0.20 * e,
      0.45 * sama - 0.25 * bActive * tatkar * e,
      -0.15 * e
    );

    const liftL = bActive * Math.max(0, -tatkar) * 0.14 * e;
    const liftR = bActive * Math.max(0, tatkar) * 0.14 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.10 * sama,
      0.10 * sama,
      0.05 * e,
      -0.05 * e,
      0.28 * e,
      -0.28 * e,
      0.15 * e,
      0.15 * e,
      -0.22 * liftL,
      -0.22 * liftR
    );
  },
};

/**
 * 10. DUET_BOLLY_ROMANTIC_WALTZ
 * Choreography Note: Sweeping Yash Chopra / Filmi romantic ballroom turn & dip!
 * Beats 1 & 2: Joined high right hands guide Partner B through an under-arm
 * pirouette; Beats 3 & 4: both lock into a lush counter-balanced romantic dip
 * looking straight into each other's visors.
 */
const DUET_BOLLY_ROMANTIC_WALTZ: DuetMove = {
  id: 'DUET_BOLLY_ROMANTIC_WALTZ',
  name: 'Bollywood Romantic — Under-Arm Turn & Counter-Dip',
  origin: 'Classic Mumbai Filmi Romantic Duet Choreography',
  facing: 'EACH_OTHER',
  anchorDistance: 0.92,
  energy: 0.64,
  tempoFit: [80, 128],
  durationBars: 4,
  tags: ['indian', 'bollywood', 'spin', 'pose', 'contact'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 1 (barBeat 0.5) overhead joined-hand arch; Beat 3.2 (barBeat 3.2) waist-support dip
    const archPhase = strikeWindow(barBeat, 0.75, 1.6) * e;
    const dipPhase = strikeWindow(barBeat, 2.85, 1.5) * e;
    const qSin = Math.sin(ctx.quarterP);
    void barBeatInt;

    // Partner A lunges forward & supports B during dipPhase
    setBody(
      t,
      0.015 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.06 + 0.16 * dipPhase) * e,
      0.08 * qSin * e,
      0.12 * dipPhase,
      (0.18 * dipPhase - 0.05 * archPhase) * e,
      (-0.18 * dipPhase + 0.12 * qSin) * e,
      0.10 * dipPhase,
      0.12 * dipPhase,
      -0.14 * dipPhase,
      0.06 * dipPhase,
      (0.14 * dipPhase - 0.08 * archPhase) * e,
      -0.16 * dipPhase,
      -0.06 * dipPhase,
      1 + 0.03 * dipPhase,
      0.12 * dipPhase,
      0.14 * dipPhase,
      -0.08 * dipPhase,
      0.16 * dipPhase - 0.08 * archPhase,
      0.18 * dipPhase,
      -0.10 * dipPhase
    );

    // A's Right arm forms high arch on archPhase (-1.85), sweeps wide on dipPhase; Left arm cradles B's waist on dip
    setArms(
      t,
      (-0.65 - 0.55 * dipPhase - 0.30 * archPhase) * e,
      (-0.42 * dipPhase + 0.15 * archPhase) * e,
      (0.28 - 0.18 * dipPhase) * e,
      (-0.85 - 0.35 * dipPhase) * e,
      0.25 * dipPhase,
      0.20 * dipPhase,
      0.12 * e,
      (-1.82 * archPhase - 1.15 * dipPhase - 0.85 * (1 - archPhase - dipPhase)) * e,
      (0.28 * archPhase - 0.35 * dipPhase) * e,
      (-0.22 * archPhase - 0.68 * dipPhase - 0.35 * (1 - archPhase - dipPhase)) * e,
      (-0.55 * archPhase - 0.35 * dipPhase - 0.90 * (1 - archPhase - dipPhase)) * e,
      -0.20 * archPhase,
      -0.25 * dipPhase,
      -0.15 * e
    );

    setLegs(
      t,
      0.06 * Math.max(0, qSin) * e,
      0.06 * Math.max(0, -qSin) * e,
      0.28 * dipPhase,
      -0.26 * dipPhase,
      0.08 * qSin * e,
      0.08 * qSin * e,
      0.18 * e,
      -0.18 * e,
      0.26 * dipPhase,
      0.10 * dipPhase,
      0.10 * dipPhase,
      0.24 * dipPhase
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Partner B executes the under-arm spin on Beat 0 of each bar
    if (ctx.isBeat && barBeatInt === 0) {
      ctx.requestSpin(-TAU);
    }
    // CONTACT: Beat 1 (barBeat 0.75) overhead hand-touch; Beat 3 (barBeat 2.85) cambré back-arch dip
    const archPhase = strikeWindow(barBeat, 0.75, 1.6) * e;
    const dipPhase = strikeWindow(barBeat, 2.85, 1.5) * e;
    const qSin = Math.sin(ctx.quarterP);

    // Partner B arches back into a dramatic Bollywood cambré dip on dipPhase
    setBody(
      t,
      0.015 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.08 + 0.14 * dipPhase) * e,
      -0.08 * qSin * e,
      0.10 * dipPhase,
      (-0.26 * dipPhase - 0.06 * archPhase) * e,
      (0.18 * dipPhase - 0.12 * qSin) * e,
      -0.10 * dipPhase,
      -0.22 * dipPhase,
      0.14 * dipPhase,
      -0.06 * dipPhase,
      (-0.24 * dipPhase - 0.10 * archPhase) * e,
      0.16 * dipPhase,
      0.06 * dipPhase,
      1 + 0.04 * dipPhase,
      -0.18 * dipPhase,
      -0.14 * dipPhase,
      0.08 * dipPhase,
      -0.22 * dipPhase - 0.08 * archPhase,
      -0.18 * dipPhase,
      0.12 * dipPhase
    );

    setArms(
      t,
      (-1.82 * archPhase - 1.55 * dipPhase - 0.85 * (1 - archPhase - dipPhase)) * e,
      (-0.28 * archPhase + 0.25 * dipPhase) * e,
      (0.22 * archPhase + 0.58 * dipPhase + 0.35 * (1 - archPhase - dipPhase)) * e,
      (-0.55 * archPhase - 0.30 * dipPhase - 0.90 * (1 - archPhase - dipPhase)) * e,
      0.20 * archPhase,
      -0.30 * dipPhase,
      0.18 * dipPhase,
      (-0.75 - 0.45 * dipPhase - 0.35 * archPhase) * e,
      (0.38 * dipPhase - 0.15 * archPhase) * e,
      (-0.28 + 0.18 * dipPhase) * e,
      (-0.85 - 0.30 * dipPhase) * e,
      -0.25 * dipPhase,
      0.20 * dipPhase,
      -0.12 * e
    );

    setLegs(
      t,
      0.18 * dipPhase + 0.06 * Math.max(0, -qSin) * (1 - dipPhase) * e,
      0.06 * Math.max(0, qSin) * (1 - dipPhase) * e,
      0.34 * dipPhase,
      -0.18 * dipPhase,
      -0.08 * qSin * e,
      -0.08 * qSin * e,
      0.18 * e,
      -0.18 * e,
      0.12 * dipPhase,
      0.26 * dipPhase,
      0.30 * dipPhase,
      0.10 * dipPhase
    );
  },
};

/**
 * 11. DUET_BOLLY_HERO_ENTRY_LIFT
 * Choreography Note: Masala blockbuster Hero-Entry Counter-Lift!
 * Beats 1 & 2: Synchronized swagger walk-in with collar-pop; Beats 3 & 4:
 * Partner A drops into a rock-solid low warrior lunge (`pelvisY = 0.58`)
 * bracing upward while Partner B vaults to an airborne hero pose (`rootY = 0.20`).
 */
const DUET_BOLLY_HERO_ENTRY_LIFT: DuetMove = {
  id: 'DUET_BOLLY_HERO_ENTRY_LIFT',
  name: 'Masala Blockbuster — Hero Entry & Power Lift Pose',
  origin: 'South & Mumbai Mass-Action Cinema Entry Numbers',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 0.85,
  energy: 0.92,
  tempoFit: [95, 148],
  durationBars: 4,
  tags: ['indian', 'bollywood', 'jump', 'pose', 'contact'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beats 2.2..3.8 (barBeat >= 2.0) Partner A braces B's waist/hip in power lift
    const liftHold = (strikeWindow(barBeat, 2.5, 1.5) + strikeWindow(barBeat, 3.3, 1.8)) * 0.75 * e;
    const clampLift = clamp(liftHold, 0, 1);
    const swagger = (1 - clampLift) * Math.sin(ctx.p) * e;

    // A drops to pelvisY >= 0.56 warrior base during liftHold
    setBody(
      t,
      0.02 * (1 - clampLift) * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.06 + 0.28 * clampLift) * e,
      0.08 * swagger,
      0.06 * clampLift,
      (0.14 * clampLift - 0.06 * (1 - clampLift)) * e,
      (-0.22 * clampLift + 0.14 * swagger) * e,
      0.08 * swagger,
      0.08 * clampLift,
      -0.16 * clampLift,
      0.06 * swagger,
      (-0.12 * clampLift - 0.08 * (1 - clampLift)) * e,
      -0.18 * clampLift,
      -0.06 * swagger,
      1 + 0.06 * clampLift,
      -0.14 * clampLift,
      0.18 * clampLift,
      0,
      -0.18 * clampLift - 0.05 * ctx.beatPulse * e,
      0.22 * clampLift,
      0.08 * swagger
    );

    // A's Right (inner) arm braces high upward under B's hip/torso; Left arm punches skyward V
    setArms(
      t,
      (-1.95 * clampLift - 0.75 * (1 - clampLift)) * e,
      0.20 * swagger,
      (0.55 * clampLift + 0.28 * (1 - clampLift)) * e,
      (-0.45 * clampLift - 1.15 * (1 - clampLift)) * e,
      0.25 * e,
      0.20 * swagger,
      0.15 * e,
      (-1.45 * clampLift - 0.75 * (1 - clampLift)) * e,
      (-0.45 * clampLift - 0.20 * swagger) * e,
      (-0.48 * clampLift - 0.28 * (1 - clampLift)) * e,
      (-0.65 * clampLift - 1.15 * (1 - clampLift)) * e,
      -0.25 * clampLift,
      0.35 * clampLift,
      -0.20 * clampLift
    );

    const liftL = (1 - clampLift) * Math.max(0, swagger) * 0.15;
    const liftR = (1 - clampLift) * Math.max(0, -swagger) * 0.15;
    setLegs(
      t,
      liftL,
      liftR,
      0.32 * clampLift + 0.16 * swagger,
      -0.28 * clampLift - 0.16 * swagger,
      0.12 * clampLift,
      -0.12 * clampLift,
      0.25 * e,
      -0.25 * e,
      0.32 * clampLift + 0.12 * (1 - clampLift) * e,
      0.28 * clampLift + 0.12 * (1 - clampLift) * e,
      0.12 * clampLift,
      0.22 * clampLift
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beats 2.2..3.8 Partner B vaults up onto A's braced right shoulder/arm
    const liftHold = (strikeWindow(barBeat, 2.5, 1.5) + strikeWindow(barBeat, 3.3, 1.8)) * 0.75 * e;
    const clampLift = clamp(liftHold, 0, 1);
    const swagger = (1 - clampLift) * Math.sin(ctx.p) * e;

    setBody(
      t,
      0.21 * clampLift + 0.02 * (1 - clampLift) * ctx.beatPulse * e,
      PELVIS_REST_Y + (0.05 * clampLift - 0.06 * (1 - clampLift)) * e,
      -0.08 * swagger,
      0.05 * clampLift,
      -0.10 * clampLift,
      (0.18 * clampLift - 0.14 * swagger) * e,
      -0.12 * clampLift,
      -0.08 * clampLift,
      0.12 * clampLift,
      -0.08 * clampLift,
      -0.14 * clampLift,
      0.16 * clampLift,
      0.06 * swagger,
      1 + 0.05 * clampLift,
      -0.06 * clampLift,
      -0.14 * clampLift,
      0.06 * clampLift,
      -0.08 * clampLift - 0.05 * ctx.beatPulse * e,
      -0.18 * clampLift,
      -0.08 * swagger
    );

    // B's Left (inner) hand presses down on A's shoulder; Right arm salutes the stadium skyward
    setArms(
      t,
      (-0.95 * clampLift - 0.75 * (1 - clampLift)) * e,
      (0.42 * clampLift - 0.20 * swagger) * e,
      (0.52 * clampLift + 0.28 * (1 - clampLift)) * e,
      (-0.60 * clampLift - 1.15 * (1 - clampLift)) * e,
      0.25 * clampLift,
      0.35 * clampLift,
      0.20 * clampLift,
      (-2.15 * clampLift - 0.75 * (1 - clampLift)) * e,
      0.20 * swagger,
      (-0.55 * clampLift - 0.28 * (1 - clampLift)) * e,
      (-0.35 * clampLift - 1.15 * (1 - clampLift)) * e,
      -0.25 * e,
      -0.20 * swagger,
      -0.15 * e
    );

    const liftL = 0.18 * clampLift + (1 - clampLift) * Math.max(0, -swagger) * 0.15;
    const liftR = 0.22 * clampLift + (1 - clampLift) * Math.max(0, swagger) * 0.15;
    setLegs(
      t,
      liftL,
      liftR,
      0.26 * clampLift - 0.16 * swagger,
      -0.18 * clampLift + 0.16 * swagger,
      0.14 * clampLift,
      -0.22 * clampLift,
      0.24 * e,
      -0.24 * e,
      0.28 * clampLift,
      0.38 * clampLift,
      0.28 * clampLift,
      0.32 * clampLift
    );
  },
};

/**
 * 12. DUET_LAVANI_KOLI_INTERPLAY
 * Choreography Note: Maharashtrian Koli fisherfolk oar-rowing & Lavani hip-flick
 * interplay! Beats 1..3: Synchronized swaying boat-oar pulls across the deck;
 * Beat 4: Sassy Lavani kamar-jhatka (hip-bump & shoulder-shimmy) with chin-flick!
 */
const DUET_LAVANI_KOLI_INTERPLAY: DuetMove = {
  id: 'DUET_LAVANI_KOLI_INTERPLAY',
  name: 'Lavani & Koli — Oar-Row Pull & Kamar-Jhatka Bump',
  origin: 'Konkan Koli Fisherfolk & Maharashtrian Lavani Tamasha',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 0.90,
  energy: 0.80,
  tempoFit: [96, 142],
  durationBars: 4,
  tags: ['indian', 'folk', 'isolation', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 4 (barBeat 3.0..3.7) synchronized inner-hip & shoulder Lavani bump
    const bump = strikeWindow(barBeat, 3.2, 2.4) * e;
    const rowPhase = (1 - bump) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      0.03 * bump,
      PELVIS_REST_Y - (0.09 + 0.06 * Math.max(0, s1) * rowPhase) * e,
      (0.14 * s1 * rowPhase + 0.16 * bump) * e,
      0.10 * c1 * rowPhase,
      (0.18 * c1 * rowPhase - 0.06 * bump) * e,
      (0.16 * s1 * rowPhase - 0.20 * bump) * e,
      (-0.12 * s1 * rowPhase + 0.18 * bump) * e,
      0.14 * c1 * rowPhase,
      0.12 * s1 * rowPhase - 0.14 * bump,
      -0.10 * bump,
      (0.12 * c1 * rowPhase - 0.10 * bump) * e,
      0.14 * s1 * rowPhase - 0.16 * bump,
      -0.12 * bump,
      1 + 0.05 * bump,
      0.08 * c1 * rowPhase,
      0.22 * bump,
      -0.10 * bump,
      (0.10 * c1 * rowPhase - 0.12 * bump) * e,
      0.26 * bump,
      0.14 * bump
    );

    // Rowing diagonal pull during rowPhase; hand-on-waist + chin/temple nakhra on bump
    setArms(
      t,
      (-0.95 - 0.35 * c1) * rowPhase - 1.45 * bump,
      (0.28 * s1 * rowPhase + 0.35 * bump),
      0.30 * rowPhase + 0.42 * bump,
      (-0.85 + 0.40 * c1) * rowPhase - 1.35 * bump,
      0.20 * e,
      0.25 * c1 * rowPhase + 0.35 * bump,
      0.15 * e,
      (-0.95 - 0.35 * c1) * rowPhase - 0.45 * bump,
      (0.28 * s1 * rowPhase - 0.40 * bump),
      -0.25 * rowPhase - 0.52 * bump,
      (-0.85 + 0.40 * c1) * rowPhase - 1.25 * bump,
      -0.20 * e,
      0.25 * c1 * rowPhase,
      -0.25 * bump
    );

    const liftL = Math.max(0, s1) * 0.12 * rowPhase;
    const liftR = Math.max(0, -s1) * 0.12 * rowPhase + 0.10 * bump;
    setLegs(
      t,
      liftL,
      liftR,
      0.18 * c1 * rowPhase,
      -0.18 * c1 * rowPhase,
      0.12 * s1 * rowPhase - 0.14 * bump,
      0.12 * s1 * rowPhase - 0.14 * bump,
      0.22 * e,
      -0.22 * e,
      0.16 * e,
      0.16 * e + 0.14 * bump,
      0.15 * liftL,
      0.25 * bump
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 4 (barBeat 3.0..3.7) synchronized inner-hip & shoulder Lavani bump
    const bump = strikeWindow(barBeat, 3.2, 2.4) * e;
    const rowPhase = (1 - bump) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      0.03 * bump,
      PELVIS_REST_Y - (0.10 + 0.06 * Math.max(0, s1) * rowPhase) * e,
      (0.14 * s1 * rowPhase - 0.16 * bump) * e,
      0.10 * c1 * rowPhase,
      (0.18 * c1 * rowPhase - 0.06 * bump) * e,
      (0.16 * s1 * rowPhase + 0.20 * bump) * e,
      (-0.12 * s1 * rowPhase - 0.18 * bump) * e,
      0.14 * c1 * rowPhase,
      0.12 * s1 * rowPhase + 0.14 * bump,
      0.10 * bump,
      (0.12 * c1 * rowPhase - 0.10 * bump) * e,
      0.14 * s1 * rowPhase + 0.16 * bump,
      0.12 * bump,
      1 + 0.05 * bump,
      0.08 * c1 * rowPhase,
      -0.22 * bump,
      0.10 * bump,
      (0.10 * c1 * rowPhase - 0.12 * bump) * e,
      -0.26 * bump,
      -0.14 * bump
    );

    setArms(
      t,
      (-0.95 - 0.35 * c1) * rowPhase - 0.45 * bump,
      (0.28 * s1 * rowPhase + 0.40 * bump),
      0.25 * rowPhase + 0.52 * bump,
      (-0.85 + 0.40 * c1) * rowPhase - 1.25 * bump,
      0.20 * e,
      0.25 * c1 * rowPhase,
      0.25 * bump,
      (-0.95 - 0.35 * c1) * rowPhase - 1.45 * bump,
      (0.28 * s1 * rowPhase - 0.35 * bump),
      -0.30 * rowPhase - 0.42 * bump,
      (-0.85 + 0.40 * c1) * rowPhase - 1.35 * bump,
      -0.20 * e,
      0.25 * c1 * rowPhase + 0.35 * bump,
      -0.15 * e
    );

    const liftL = Math.max(0, s1) * 0.12 * rowPhase + 0.10 * bump;
    const liftR = Math.max(0, -s1) * 0.12 * rowPhase;
    setLegs(
      t,
      liftL,
      liftR,
      0.18 * c1 * rowPhase,
      -0.18 * c1 * rowPhase,
      0.12 * s1 * rowPhase + 0.14 * bump,
      0.12 * s1 * rowPhase + 0.14 * bump,
      0.22 * e,
      -0.22 * e,
      0.16 * e + 0.14 * bump,
      0.16 * e,
      0.25 * bump,
      0.15 * liftR
    );
  },
};

/**
 * 13. DUET_GHOOMAR_ORBIT_SWIRL
 * Choreography Note: Regal Rajasthani Ghoomar veiled swirl! Flowing torso-wave
 * figure-eights on `halfP`, synchronized counter-rotating spins every 2 bars,
 * and a serene Anjali/Namaste palm-touch pass on Beat 2 of each bar.
 */
const DUET_GHOOMAR_ORBIT_SWIRL: DuetMove = {
  id: 'DUET_GHOOMAR_ORBIT_SWIRL',
  name: 'Rajasthani Ghoomar — Veiled Orbit & Namaste Swirl',
  origin: 'Mewar & Marwar Royal Courtyard Ghoomar (Rajasthan)',
  facing: 'EACH_OTHER',
  anchorDistance: 1.15,
  energy: 0.68,
  tempoFit: [84, 130],
  durationBars: 4,
  tags: ['indian', 'folk', 'spin', 'arms', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    if (ctx.isBeat && ctx.moveBeat % 4 === 2) {
      ctx.requestSpin(TAU);
    }
    // CONTACT: Beat 2 (barBeat 1.0) graceful forward wrist/palm brush at chest level
    const brush = strikeWindow(barBeat, 1.0, 2.0) * e;
    const sHalf = Math.sin(ctx.halfP);
    const cHalf = Math.cos(ctx.halfP);
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.015 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.07 + 0.05 * Math.abs(s1)) * e,
      0.14 * sHalf * e,
      0.07 * brush,
      (0.08 * cHalf + 0.06 * brush) * e,
      0.24 * sHalf * e,
      -0.12 * cHalf * e,
      0.06 * cHalf * e,
      0.20 * sHalf * e,
      -0.10 * cHalf * e,
      (0.06 * cHalf - 0.06 * brush) * e,
      0.24 * sHalf * e,
      0.08 * cHalf * e,
      1 + 0.03 * brush,
      0.08 * e,
      -0.12 * sHalf * e,
      0.08 * cHalf * e,
      0.10 * e,
      -0.14 * sHalf * e,
      0.10 * cHalf * e
    );

    // Flowing Ghoomar ghoonghat/veil hands sweeping from crown to chest brush
    setArms(
      t,
      (-1.25 - 0.30 * cHalf - 0.15 * brush) * e,
      (-0.28 * sHalf - 0.25 * brush) * e,
      (0.38 - 0.22 * brush + 0.15 * sHalf) * e,
      (-0.95 + 0.30 * brush + 0.20 * cHalf) * e,
      0.25 * sHalf * e,
      0.30 * cHalf * e,
      0.18 * s1 * e,
      (-1.25 + 0.30 * cHalf - 0.15 * brush) * e,
      (-0.28 * sHalf + 0.25 * brush) * e,
      (-0.38 + 0.22 * brush + 0.15 * sHalf) * e,
      (-0.95 + 0.30 * brush - 0.20 * cHalf) * e,
      -0.25 * sHalf * e,
      -0.30 * cHalf * e,
      -0.18 * s1 * e
    );

    const liftL = Math.max(0, s1) * 0.11 * e;
    const liftR = Math.max(0, -s1) * 0.11 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.14 * s1 * e,
      -0.14 * s1 * e,
      0.10 * sHalf * e,
      0.10 * sHalf * e,
      0.22 * e,
      -0.22 * e,
      0.14 * e,
      0.14 * e,
      0.18 * liftL,
      0.18 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    if (ctx.isBeat && ctx.moveBeat % 4 === 2) {
      ctx.requestSpin(-TAU);
    }
    // CONTACT: Beat 2 (barBeat 1.0) graceful forward wrist/palm brush at chest level
    const brush = strikeWindow(barBeat, 1.0, 2.0) * e;
    const sHalf = Math.sin(ctx.halfP);
    const cHalf = Math.cos(ctx.halfP);
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.015 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.09 + 0.05 * Math.abs(s1)) * e,
      -0.14 * sHalf * e,
      0.07 * brush,
      (0.08 * cHalf + 0.06 * brush) * e,
      -0.24 * sHalf * e,
      0.12 * cHalf * e,
      0.06 * cHalf * e,
      -0.20 * sHalf * e,
      0.10 * cHalf * e,
      (0.06 * cHalf - 0.06 * brush) * e,
      -0.24 * sHalf * e,
      -0.08 * cHalf * e,
      1 + 0.03 * brush,
      0.08 * e,
      0.12 * sHalf * e,
      -0.08 * cHalf * e,
      0.10 * e,
      0.14 * sHalf * e,
      -0.10 * cHalf * e
    );

    setArms(
      t,
      (-1.28 + 0.30 * cHalf - 0.15 * brush) * e,
      (0.28 * sHalf - 0.25 * brush) * e,
      (0.38 - 0.22 * brush - 0.15 * sHalf) * e,
      (-0.95 + 0.30 * brush - 0.20 * cHalf) * e,
      -0.25 * sHalf * e,
      -0.30 * cHalf * e,
      0.18 * s1 * e,
      (-1.28 - 0.30 * cHalf - 0.15 * brush) * e,
      (0.28 * sHalf + 0.25 * brush) * e,
      (-0.38 + 0.22 * brush - 0.15 * sHalf) * e,
      (-0.95 + 0.30 * brush + 0.20 * cHalf) * e,
      0.25 * sHalf * e,
      0.30 * cHalf * e,
      -0.18 * s1 * e
    );

    const liftL = Math.max(0, -s1) * 0.11 * e;
    const liftR = Math.max(0, s1) * 0.11 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.14 * s1 * e,
      0.14 * s1 * e,
      -0.10 * sHalf * e,
      -0.10 * sHalf * e,
      0.22 * e,
      -0.22 * e,
      0.15 * e,
      0.15 * e,
      0.18 * liftL,
      0.18 * liftR
    );
  },
};

// ============================================================================
// SECTION 2: GLOBAL PARTNER FORMS (12 MOVES)
// ============================================================================

/**
 * 14. DUET_HIPHOP_BACK_TO_BACK_LEAN
 * Choreography Note: Classic 90s Golden-Era Hip-Hop back-to-back lean!
 * Anchored in `BACK_TO_BACK` at `anchorDistance: 0.72` so upper backs press
 * together in a shared counter-weight lean, riding a heavy boom-bap knee bounce
 * and locking into a crossed-arm B-Boy stance on Beat 4.
 */
const DUET_HIPHOP_BACK_TO_BACK_LEAN: DuetMove = {
  id: 'DUET_HIPHOP_BACK_TO_BACK_LEAN',
  name: '90s Boom-Bap — Back-to-Back Counter-Lean & Cross',
  origin: 'NYC 1990s Golden-Era Hip-Hop Video Duet Stance',
  facing: 'BACK_TO_BACK',
  anchorDistance: 0.72,
  energy: 0.74,
  tempoFit: [82, 118],
  durationBars: 4,
  tags: ['hiphop', 'groove', 'pose', 'contact'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Continuous upper-back counter-lean (pelvisZ -0.08 + negative spine pitch)
    // with extra B-boy freeze lock on Beat 4 (barBeat 3.0..3.8)
    const freeze = strikeWindow(barBeat, 3.2, 2.0) * e;
    const s1 = Math.sin(ctx.p);
    const bounce = Math.abs(s1) * (1 - 0.7 * freeze);

    setBody(
      t,
      0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.10 + 0.08 * bounce + 0.06 * freeze) * e,
      0.08 * s1 * (1 - freeze) * e,
      -0.09 * e, // Lean back into partner B's spine
      (-0.14 - 0.06 * freeze) * e,
      0.14 * s1 * (1 - freeze) * e,
      -0.06 * s1 * e,
      -0.10 * e,
      0.10 * s1 * (1 - freeze) * e,
      0,
      (-0.12 + 0.06 * bounce) * e,
      0.14 * s1 * (1 - freeze) * e,
      0.05 * s1 * e,
      1 + 0.05 * (ctx.beatPulse + freeze) * e,
      0.16 * e,
      -0.18 * freeze - 0.10 * s1 * e,
      0,
      (0.18 + 0.10 * ctx.beatPulse) * e,
      -0.24 * freeze - 0.12 * s1 * e,
      0.08 * freeze
    );

    // Crossed-arm B-boy lock on freeze, rhythmic down-bounce pump on beats 1..3
    setArms(
      t,
      (-0.85 - 0.25 * freeze - 0.20 * bounce) * e,
      (-0.48 * freeze - 0.18 * (1 - freeze)) * e,
      (0.22 - 0.16 * freeze) * e,
      (-1.35 * freeze - 1.05 * (1 - freeze) + 0.25 * bounce) * e,
      0.30 * freeze,
      0.20 * bounce,
      0.15 * e,
      (-0.85 - 0.25 * freeze - 0.20 * bounce) * e,
      (0.48 * freeze + 0.18 * (1 - freeze)) * e,
      (-0.22 + 0.16 * freeze) * e,
      (-1.35 * freeze - 1.05 * (1 - freeze) + 0.25 * bounce) * e,
      -0.30 * freeze,
      -0.20 * bounce,
      -0.15 * e
    );

    setLegs(
      t,
      0.06 * Math.max(0, s1) * (1 - freeze) * e,
      0.06 * Math.max(0, -s1) * (1 - freeze) * e,
      0.16 * e,
      0.08 * e,
      0.12 * e,
      -0.12 * e,
      0.24 * e,
      -0.24 * e,
      (0.18 + 0.12 * bounce) * e,
      (0.18 + 0.12 * bounce) * e,
      0.10 * e,
      0.10 * e
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Continuous upper-back counter-lean against Partner A + Beat 4 B-boy freeze
    const freeze = strikeWindow(barBeat, 3.2, 2.0) * e;
    const s1 = Math.sin(ctx.p);
    const bounce = Math.abs(s1) * (1 - 0.7 * freeze);

    setBody(
      t,
      0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.11 + 0.08 * bounce + 0.06 * freeze) * e,
      -0.08 * s1 * (1 - freeze) * e,
      -0.09 * e,
      (-0.14 - 0.06 * freeze) * e,
      -0.14 * s1 * (1 - freeze) * e,
      0.06 * s1 * e,
      -0.10 * e,
      -0.10 * s1 * (1 - freeze) * e,
      0,
      (-0.12 + 0.06 * bounce) * e,
      -0.14 * s1 * (1 - freeze) * e,
      -0.05 * s1 * e,
      1 + 0.05 * (ctx.beatPulse + freeze) * e,
      0.16 * e,
      0.18 * freeze + 0.10 * s1 * e,
      0,
      (0.18 + 0.10 * ctx.beatPulse) * e,
      0.24 * freeze + 0.12 * s1 * e,
      -0.08 * freeze
    );

    setArms(
      t,
      (-0.88 - 0.25 * freeze - 0.20 * bounce) * e,
      (-0.48 * freeze - 0.18 * (1 - freeze)) * e,
      (0.22 - 0.16 * freeze) * e,
      (-1.35 * freeze - 1.05 * (1 - freeze) + 0.25 * bounce) * e,
      0.30 * freeze,
      0.20 * bounce,
      0.15 * e,
      (-0.88 - 0.25 * freeze - 0.20 * bounce) * e,
      (0.48 * freeze + 0.18 * (1 - freeze)) * e,
      (-0.22 + 0.16 * freeze) * e,
      (-1.35 * freeze - 1.05 * (1 - freeze) + 0.25 * bounce) * e,
      -0.30 * freeze,
      -0.20 * bounce,
      -0.15 * e
    );

    setLegs(
      t,
      0.06 * Math.max(0, -s1) * (1 - freeze) * e,
      0.06 * Math.max(0, s1) * (1 - freeze) * e,
      0.16 * e,
      0.08 * e,
      0.12 * e,
      -0.12 * e,
      0.24 * e,
      -0.24 * e,
      (0.18 + 0.12 * bounce) * e,
      (0.18 + 0.12 * bounce) * e,
      0.10 * e,
      0.10 * e
    );
  },
};

/**
 * 15. DUET_HIPHOP_MIRROR_CHALLENGE
 * Choreography Note: Electric Boogaloo / Popping Wave Transfer!
 * On Beat 1: A pops chest and sends an arm-wave forward; on Beat 2 (contact!):
 * A's fingertips meet B's fingertips at mid-space; on Beat 3: the wave surges
 * through B's chest into a back-arch pop; on Beat 4: both hit a double-pop!
 */
const DUET_HIPHOP_MIRROR_CHALLENGE: DuetMove = {
  id: 'DUET_HIPHOP_MIRROR_CHALLENGE',
  name: 'Popping Cypher — Energy Wave Transfer & Double Pop',
  origin: 'West Coast Electric Boogaloo & Street Popping Duets',
  facing: 'EACH_OTHER',
  anchorDistance: 1.15,
  energy: 0.78,
  tempoFit: [86, 128],
  durationBars: 4,
  tags: ['hiphop', 'isolation', 'arms', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const sendWave = strikeWindow(barBeat, 0.5, 2.2) * e;
    // CONTACT: Beat 2 (barBeat 1.25) fingertip-to-fingertip wave handoff at mid-chest
    const handoff = strikeWindow(barBeat, 1.25, 2.5) * e;
    const doublePop = strikeWindow(barBeat, 3.0, 2.6) * e;
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.02 * doublePop,
      PELVIS_REST_Y - (0.07 + 0.06 * handoff + 0.05 * doublePop) * e,
      0.06 * s1 * e,
      (0.08 * handoff - 0.04 * sendWave) * e,
      (0.10 * handoff - 0.12 * (sendWave + doublePop)) * e,
      0.12 * s1 * e,
      -0.08 * s1 * e,
      (-0.14 * (sendWave + doublePop) + 0.08 * handoff) * e,
      0.10 * s1 * e,
      0,
      (-0.20 * (sendWave + doublePop) + 0.12 * handoff) * e,
      0.12 * s1 * e,
      0,
      1 + 0.08 * (sendWave + doublePop),
      0.10 * (sendWave + doublePop),
      -0.08 * s1 * e,
      0,
      0.12 * (sendWave + doublePop) - 0.08 * handoff,
      -0.10 * s1 * e,
      0.06 * doublePop
    );

    setArms(
      t,
      (-0.75 - 0.45 * handoff - 0.35 * doublePop) * e,
      (-0.22 * handoff + 0.25 * doublePop) * e,
      (0.35 - 0.22 * handoff + 0.20 * doublePop) * e,
      (-1.15 + 0.70 * handoff - 0.20 * doublePop) * e,
      0.25 * sendWave,
      0.45 * sendWave - 0.30 * handoff,
      0.15 * e,
      (-0.75 - 0.48 * handoff - 0.35 * doublePop) * e,
      (0.22 * handoff - 0.25 * doublePop) * e,
      (-0.35 + 0.22 * handoff - 0.20 * doublePop) * e,
      (-1.15 + 0.70 * handoff - 0.20 * doublePop) * e,
      -0.25 * sendWave,
      0.45 * sendWave - 0.30 * handoff,
      -0.15 * e
    );

    setLegs(
      t,
      0.05 * doublePop,
      0.05 * doublePop,
      0.12 * handoff,
      -0.12 * handoff,
      0.08 * s1 * e,
      0.08 * s1 * e,
      0.20 * e,
      -0.20 * e,
      (0.14 + 0.12 * (handoff + doublePop)) * e,
      (0.14 + 0.12 * (handoff + doublePop)) * e,
      0.12 * doublePop,
      0.12 * doublePop
    );
    addSquash(t, 0.06 * (sendWave + doublePop));
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 2 (barBeat 1.25) fingertip-to-fingertip wave catch at mid-chest
    const handoff = strikeWindow(barBeat, 1.25, 2.5) * e;
    const receiveWave = strikeWindow(barBeat, 2.1, 2.2) * e;
    const doublePop = strikeWindow(barBeat, 3.0, 2.6) * e;
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.02 * doublePop,
      PELVIS_REST_Y - (0.09 + 0.06 * handoff + 0.05 * doublePop) * e,
      -0.06 * s1 * e,
      (0.08 * handoff - 0.06 * receiveWave) * e,
      (0.10 * handoff - 0.14 * (receiveWave + doublePop)) * e,
      -0.12 * s1 * e,
      0.08 * s1 * e,
      (-0.16 * (receiveWave + doublePop) + 0.08 * handoff) * e,
      -0.10 * s1 * e,
      0,
      (-0.22 * (receiveWave + doublePop) + 0.12 * handoff) * e,
      -0.12 * s1 * e,
      0,
      1 + 0.08 * (receiveWave + doublePop),
      0.12 * (receiveWave + doublePop),
      0.08 * s1 * e,
      0,
      0.14 * (receiveWave + doublePop) - 0.08 * handoff,
      0.10 * s1 * e,
      -0.06 * doublePop
    );

    setArms(
      t,
      (-0.78 - 0.45 * handoff - 0.35 * doublePop) * e,
      (-0.22 * handoff + 0.25 * doublePop) * e,
      (0.35 - 0.22 * handoff + 0.20 * doublePop) * e,
      (-1.12 + 0.70 * handoff - 0.20 * doublePop) * e,
      0.25 * receiveWave,
      -0.30 * handoff + 0.45 * receiveWave,
      0.15 * e,
      (-0.78 - 0.48 * handoff - 0.35 * doublePop) * e,
      (0.22 * handoff - 0.25 * doublePop) * e,
      (-0.35 + 0.22 * handoff - 0.20 * doublePop) * e,
      (-1.12 + 0.70 * handoff - 0.20 * doublePop) * e,
      -0.25 * receiveWave,
      -0.30 * handoff + 0.45 * receiveWave,
      -0.15 * e
    );

    setLegs(
      t,
      0.05 * doublePop,
      0.05 * doublePop,
      0.12 * handoff,
      -0.12 * handoff,
      -0.08 * s1 * e,
      -0.08 * s1 * e,
      0.20 * e,
      -0.20 * e,
      (0.15 + 0.12 * (handoff + doublePop)) * e,
      (0.15 + 0.12 * (handoff + doublePop)) * e,
      0.12 * doublePop,
      0.12 * doublePop
    );
    addSquash(t, 0.06 * (receiveWave + doublePop));
  },
};

/**
 * 16. DUET_BREAK_UPROCK_FACEOFF
 * Choreography Note: Classic 1973 Bronx Apache Line Uprock!
 * Rhythmic salsa-stride rock-steps on every beat, alternating "burn" gestures:
 * on Beat 2 A lunges with a bow-and-arrow burn while B snaps into a matrix
 * dodge; on Beat 4 B fires back while A ducks, with forearm-block contact on Beat 3!
 */
const DUET_BREAK_UPROCK_FACEOFF: DuetMove = {
  id: 'DUET_BREAK_UPROCK_FACEOFF',
  name: 'Bronx Uprock — Apache Line Burn & Dodge Face-Off',
  origin: '1970s Bronx & Brooklyn B-Boy Uprock (Rock Dance)',
  facing: 'EACH_OTHER',
  anchorDistance: 1.15,
  energy: 0.88,
  tempoFit: [98, 142],
  durationBars: 4,
  tags: ['breakdance', 'footwork', 'arms', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const aAttack = strikeWindow(barBeat, 1.0, 2.2) * e;
    // CONTACT: Beat 3 (barBeat 2.0) crossed-forearm parry clash in the center
    const forearmClash = strikeWindow(barBeat, 2.0, 2.5) * e;
    const aDodge = strikeWindow(barBeat, 3.0, 2.2) * e;
    const s1 = Math.sin(ctx.p);

    // On aDodge, A drops low (pelvisY ~ 0.56) and leans back
    setBody(
      t,
      0.03 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.09 + 0.10 * aAttack + 0.24 * aDodge + 0.08 * forearmClash) * e,
      0.12 * s1 * e,
      (0.12 * aAttack + 0.08 * forearmClash - 0.10 * aDodge) * e,
      (0.16 * aAttack + 0.08 * forearmClash - 0.20 * aDodge) * e,
      (0.24 * aAttack - 0.20 * aDodge + 0.14 * s1) * e,
      -0.10 * s1 * e,
      (0.12 * aAttack - 0.16 * aDodge) * e,
      0.18 * aAttack - 0.14 * aDodge,
      0,
      (0.14 * aAttack - 0.18 * aDodge) * e,
      0.22 * aAttack - 0.16 * aDodge,
      0,
      1 + 0.05 * (aAttack + forearmClash),
      0.10 * aDodge,
      -0.18 * aAttack + 0.14 * aDodge,
      0,
      0.12 * aDodge - 0.08 * aAttack,
      -0.22 * aAttack + 0.16 * aDodge,
      0.08 * s1 * e
    );

    setArms(
      t,
      (-1.15 * aAttack - 1.05 * forearmClash - 0.65 * aDodge - 0.85 * (1 - aAttack - forearmClash - aDodge)) * e,
      (-0.15 * aAttack - 0.42 * forearmClash + 0.30 * aDodge) * e,
      (0.20 + 0.25 * aDodge - 0.15 * forearmClash) * e,
      (-0.25 * aAttack - 1.15 * forearmClash - 1.35 * aDodge - 0.95 * (1 - aAttack - forearmClash - aDodge)) * e,
      0.25 * forearmClash,
      0.30 * aAttack,
      0.15 * e,
      (-0.95 * aAttack - 1.05 * forearmClash - 0.65 * aDodge - 0.85 * (1 - aAttack - forearmClash - aDodge)) * e,
      (0.35 * aAttack + 0.42 * forearmClash - 0.30 * aDodge) * e,
      (-0.35 - 0.25 * aDodge + 0.15 * forearmClash) * e,
      (-1.45 * aAttack - 1.15 * forearmClash - 1.35 * aDodge - 0.95 * (1 - aAttack - forearmClash - aDodge)) * e,
      -0.25 * forearmClash,
      -0.30 * aAttack,
      -0.15 * e
    );

    const liftL = Math.max(0, s1) * 0.16 * e;
    const liftR = Math.max(0, -s1) * 0.16 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.28 * s1 * e + 0.18 * aAttack,
      -0.28 * s1 * e - 0.18 * aAttack,
      0.12 * e,
      -0.12 * e,
      0.22 * e,
      -0.22 * e,
      (0.16 + 0.24 * aDodge) * e,
      (0.16 + 0.24 * aDodge) * e,
      0.18 * liftL,
      0.18 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Partner B dodges on Beat 2 (when A attacks), clashes forearms on Beat 3, attacks on Beat 4!
    const bDodge = strikeWindow(barBeat, 1.0, 2.2) * e;
    // CONTACT: Beat 3 (barBeat 2.0) crossed-forearm parry clash in the center
    const forearmClash = strikeWindow(barBeat, 2.0, 2.5) * e;
    const bAttack = strikeWindow(barBeat, 3.0, 2.2) * e;
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.03 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.10 + 0.10 * bAttack + 0.24 * bDodge + 0.08 * forearmClash) * e,
      -0.12 * s1 * e,
      (0.12 * bAttack + 0.08 * forearmClash - 0.10 * bDodge) * e,
      (0.16 * bAttack + 0.08 * forearmClash - 0.20 * bDodge) * e,
      (0.24 * bAttack - 0.20 * bDodge - 0.14 * s1) * e,
      0.10 * s1 * e,
      (0.12 * bAttack - 0.16 * bDodge) * e,
      0.18 * bAttack - 0.14 * bDodge,
      0,
      (0.14 * bAttack - 0.18 * bDodge) * e,
      0.22 * bAttack - 0.16 * bDodge,
      0,
      1 + 0.05 * (bAttack + forearmClash),
      0.10 * bDodge,
      -0.18 * bAttack + 0.14 * bDodge,
      0,
      0.12 * bDodge - 0.08 * bAttack,
      -0.22 * bAttack + 0.16 * bDodge,
      -0.08 * s1 * e
    );

    setArms(
      t,
      (-1.15 * bAttack - 1.05 * forearmClash - 0.65 * bDodge - 0.85 * (1 - bAttack - forearmClash - bDodge)) * e,
      (-0.15 * bAttack - 0.42 * forearmClash + 0.30 * bDodge) * e,
      (0.20 + 0.25 * bDodge - 0.15 * forearmClash) * e,
      (-0.25 * bAttack - 1.15 * forearmClash - 1.35 * bDodge - 0.95 * (1 - bAttack - forearmClash - bDodge)) * e,
      0.25 * forearmClash,
      0.30 * bAttack,
      0.15 * e,
      (-0.95 * bAttack - 1.05 * forearmClash - 0.65 * bDodge - 0.85 * (1 - bAttack - forearmClash - bDodge)) * e,
      (0.35 * bAttack + 0.42 * forearmClash - 0.30 * bDodge) * e,
      (-0.35 - 0.25 * bDodge + 0.15 * forearmClash) * e,
      (-1.45 * bAttack - 1.15 * forearmClash - 1.35 * bDodge - 0.95 * (1 - bAttack - forearmClash - bDodge)) * e,
      -0.25 * forearmClash,
      -0.30 * bAttack,
      -0.15 * e
    );

    const liftL = Math.max(0, -s1) * 0.16 * e;
    const liftR = Math.max(0, s1) * 0.16 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.28 * s1 * e + 0.18 * bAttack,
      0.28 * s1 * e - 0.18 * bAttack,
      -0.12 * e,
      0.12 * e,
      0.22 * e,
      -0.22 * e,
      (0.16 + 0.24 * bDodge) * e,
      (0.16 + 0.24 * bDodge) * e,
      0.18 * liftL,
      0.18 * liftR
    );
  },
};

/**
 * 17. DUET_BREAK_FREEZE_TAG
 * Choreography Note: B-Boy Freeze-Tag Kinetic Chain!
 * Beats 1 & 2: Partner A drops into a low, tilted knee/side-freeze (`pelvisY = 0.50`)
 * while Partner B circles upright; on Beat 2.5 (Contact!): B taps A's shoulder
 * to "unfreeze" A and immediately drops into an opposing freeze for Beats 3 & 4!
 */
const DUET_BREAK_FREEZE_TAG: DuetMove = {
  id: 'DUET_BREAK_FREEZE_TAG',
  name: 'B-Boy Cypher — Freeze-Tag Kinetic Swap',
  origin: 'International Breakdance Crew Battle Routines',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 1.05,
  energy: 0.86,
  tempoFit: [95, 140],
  durationBars: 4,
  tags: ['breakdance', 'floor', 'pose', 'contact'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const aFrozen = barBeat < 2.0 ? 1 : 0;
    // CONTACT: Beat 2.0 (barBeat 2.0) Partner B taps A's right shoulder; Beat 4.0 (barBeat 0.0) A taps B's left shoulder
    const tagTap = (strikeWindow(barBeat, 2.0, 2.8) + strikeWindow(barBeat, 0.0, 2.8)) * e;
    const s1 = Math.sin(ctx.p);

    // When frozen, pelvisY = 0.50 (strictly >= 0.45) with dramatic lateral B-boy tilt
    setBody(
      t,
      0.03 * (1 - aFrozen) * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.38 * aFrozen + 0.08 * (1 - aFrozen)) * e,
      (-0.14 * aFrozen + 0.08 * (1 - aFrozen) * s1) * e,
      0.06 * aFrozen,
      (0.22 * aFrozen + 0.08 * tagTap) * e,
      (-0.20 * aFrozen - 0.22 * tagTap) * e,
      (-0.32 * aFrozen + 0.06 * s1 * (1 - aFrozen)) * e,
      0.14 * aFrozen,
      -0.14 * tagTap,
      -0.18 * aFrozen,
      0.16 * aFrozen,
      -0.18 * tagTap,
      -0.20 * aFrozen,
      1 + 0.05 * tagTap,
      -0.12 * aFrozen,
      0.20 * aFrozen + 0.16 * tagTap,
      0.15 * aFrozen,
      -0.16 * aFrozen,
      0.24 * aFrozen + 0.20 * tagTap,
      0.18 * aFrozen
    );

    setArms(
      t,
      (-0.55 * aFrozen - 0.85 * (1 - aFrozen)) * e,
      0.25 * aFrozen,
      (0.45 * aFrozen + 0.28 * (1 - aFrozen)) * e,
      (-1.25 * aFrozen - 0.95 * (1 - aFrozen)) * e,
      0.20 * e,
      0.35 * aFrozen,
      0.20 * e,
      (-1.65 * aFrozen - 1.15 * tagTap - 0.80 * (1 - aFrozen - tagTap * 0.5)) * e,
      (-0.42 * tagTap + 0.20 * aFrozen) * e,
      (-0.62 * tagTap - 0.48 * aFrozen - 0.30 * (1 - aFrozen)) * e,
      (-0.35 * (aFrozen + tagTap) - 1.05 * (1 - aFrozen)) * e,
      -0.25 * tagTap,
      0.35 * tagTap,
      -0.20 * e
    );

    setLegs(
      t,
      0.20 * aFrozen + (1 - aFrozen) * Math.max(0, s1) * 0.14 * e,
      (1 - aFrozen) * Math.max(0, -s1) * 0.14 * e,
      0.32 * aFrozen + 0.16 * (1 - aFrozen) * s1 * e,
      -0.24 * aFrozen - 0.16 * (1 - aFrozen) * s1 * e,
      -0.20 * aFrozen,
      0.18 * aFrozen,
      0.28 * e,
      -0.28 * e,
      (0.38 * aFrozen + 0.14 * (1 - aFrozen)) * e,
      (0.42 * aFrozen + 0.14 * (1 - aFrozen)) * e,
      0.28 * aFrozen,
      0.15 * aFrozen
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const bFrozen = barBeat >= 2.0 ? 1 : 0;
    // CONTACT: Beat 2.0 (barBeat 2.0) B reaches left hand to tap A; Beat 4.0 (barBeat 0.0) A taps B
    const tagTap = (strikeWindow(barBeat, 2.0, 2.8) + strikeWindow(barBeat, 0.0, 2.8)) * e;
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.03 * (1 - bFrozen) * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.38 * bFrozen + 0.09 * (1 - bFrozen)) * e,
      (0.14 * bFrozen - 0.08 * (1 - bFrozen) * s1) * e,
      0.06 * bFrozen,
      (0.22 * bFrozen + 0.08 * tagTap) * e,
      (0.20 * bFrozen + 0.22 * tagTap) * e,
      (0.32 * bFrozen - 0.06 * s1 * (1 - bFrozen)) * e,
      0.14 * bFrozen,
      0.14 * tagTap,
      0.18 * bFrozen,
      0.16 * bFrozen,
      0.18 * tagTap,
      0.20 * bFrozen,
      1 + 0.05 * tagTap,
      -0.12 * bFrozen,
      -0.20 * bFrozen - 0.16 * tagTap,
      -0.15 * bFrozen,
      -0.16 * bFrozen,
      -0.24 * bFrozen - 0.20 * tagTap,
      -0.18 * bFrozen
    );

    setArms(
      t,
      (-1.65 * bFrozen - 1.15 * tagTap - 0.80 * (1 - bFrozen - tagTap * 0.5)) * e,
      (0.42 * tagTap - 0.20 * bFrozen) * e,
      (0.62 * tagTap + 0.48 * bFrozen + 0.30 * (1 - bFrozen)) * e,
      (-0.35 * (bFrozen + tagTap) - 1.05 * (1 - bFrozen)) * e,
      0.25 * tagTap,
      0.35 * tagTap,
      0.20 * e,
      (-0.55 * bFrozen - 0.85 * (1 - bFrozen)) * e,
      -0.25 * bFrozen,
      (-0.45 * bFrozen - 0.28 * (1 - bFrozen)) * e,
      (-1.25 * bFrozen - 0.95 * (1 - bFrozen)) * e,
      -0.20 * e,
      0.35 * bFrozen,
      -0.20 * e
    );

    setLegs(
      t,
      (1 - bFrozen) * Math.max(0, -s1) * 0.14 * e,
      0.20 * bFrozen + (1 - bFrozen) * Math.max(0, s1) * 0.14 * e,
      -0.24 * bFrozen - 0.16 * (1 - bFrozen) * s1 * e,
      0.32 * bFrozen + 0.16 * (1 - bFrozen) * s1 * e,
      -0.18 * bFrozen,
      0.20 * bFrozen,
      0.28 * e,
      -0.28 * e,
      (0.42 * bFrozen + 0.14 * (1 - bFrozen)) * e,
      (0.38 * bFrozen + 0.14 * (1 - bFrozen)) * e,
      0.15 * bFrozen,
      0.28 * bFrozen
    );
  },
};

/**
 * 18. DUET_LINDY_CIRCLE_SWINGOUT
 * Choreography Note: Harlem Savoy Ballroom Lindy Hop Swing-Out!
 * Beat 1: Elastic rock-step apart with joined lead-follow hand tension;
 * Beat 2: Triple-step inward catch (Contact!); Beat 3: Whip-turn release where
 * Partner B spins out; Beat 4: Syncopated jazz-kick recovery.
 */
const DUET_LINDY_CIRCLE_SWINGOUT: DuetMove = {
  id: 'DUET_LINDY_CIRCLE_SWINGOUT',
  name: 'Savoy Lindy Hop — Rock-Step & Whip Swing-Out',
  origin: '1930s Harlem Savoy Ballroom Lindy Hop (Frankie Manning Style)',
  facing: 'EACH_OTHER',
  anchorDistance: 1.05,
  energy: 0.82,
  tempoFit: [108, 160],
  durationBars: 4,
  tags: ['disco', 'lindy', 'footwork', 'spin', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const rockBack = strikeWindow(barBeat, 0.25, 2.0) * e;
    // CONTACT: Beat 1 (barBeat 0.25) joined Left-to-Right tension grip; Beat 2 (barBeat 1.5) closed waist catch
    const closedCatch = strikeWindow(barBeat, 1.5, 2.0) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      0.03 * Math.abs(s1) * e,
      PELVIS_REST_Y - (0.11 + 0.05 * Math.abs(c1)) * e,
      0.12 * s1 * e,
      (-0.10 * rockBack + 0.10 * closedCatch) * e,
      (0.18 + 0.06 * rockBack) * e, // Athletic Lindy forward athletic hinge
      (0.18 * closedCatch - 0.12 * rockBack + 0.10 * s1) * e,
      -0.08 * s1 * e,
      0.10 * e,
      0.14 * closedCatch,
      -0.06 * s1 * e,
      0.12 * e,
      0.18 * closedCatch,
      0.06 * s1 * e,
      1 + 0.04 * ctx.beatPulse * e,
      -0.08 * e,
      -0.12 * closedCatch,
      0,
      -0.10 * e,
      -0.14 * closedCatch,
      0.08 * s1 * e
    );

    // Lead's Left hand holds Follow's Right hand in rockBack & closedCatch; Lead's Right hand catches Follow's back on closedCatch
    setArms(
      t,
      (-0.92 - 0.25 * rockBack - 0.15 * closedCatch) * e,
      (-0.28 * rockBack - 0.18 * closedCatch) * e,
      (0.24 - 0.16 * rockBack) * e,
      (-0.55 * rockBack - 0.95 * (1 - rockBack)) * e,
      0.20 * e,
      0.25 * s1 * e,
      0.15 * e,
      (-0.78 - 0.35 * closedCatch) * e,
      (0.38 * closedCatch - 0.20 * rockBack) * e,
      (-0.35 + 0.22 * closedCatch) * e,
      (-0.85 - 0.25 * closedCatch) * e,
      -0.20 * e,
      -0.25 * s1 * e,
      -0.15 * e
    );

    const liftL = (Math.max(0, s1) * 0.16 + 0.06 * rockBack) * e;
    const liftR = Math.max(0, -s1) * 0.16 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.26 * rockBack + 0.20 * s1 * (1 - rockBack) * e,
      0.14 * rockBack - 0.20 * s1 * (1 - rockBack) * e,
      0.10 * c1 * e,
      0.10 * c1 * e,
      0.20 * e,
      -0.20 * e,
      0.22 * e,
      0.22 * e,
      0.20 * liftL,
      0.20 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Follow spins out on Beat 3 (barBeatInt === 2)
    if (ctx.isBeat && barBeatInt === 2) {
      ctx.requestSpin(-TAU);
    }
    const rockBack = strikeWindow(barBeat, 0.25, 2.0) * e;
    // CONTACT: Beat 1 joined Right-to-Left tension grip; Beat 2 closed waist catch
    const closedCatch = strikeWindow(barBeat, 1.5, 2.0) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      0.03 * Math.abs(s1) * e,
      PELVIS_REST_Y - (0.12 + 0.05 * Math.abs(c1)) * e,
      -0.12 * s1 * e,
      (-0.10 * rockBack + 0.10 * closedCatch) * e,
      (0.16 + 0.06 * rockBack) * e,
      (-0.18 * closedCatch + 0.12 * rockBack - 0.10 * s1) * e,
      0.08 * s1 * e,
      0.10 * e,
      -0.14 * closedCatch,
      0.06 * s1 * e,
      0.12 * e,
      -0.18 * closedCatch,
      -0.06 * s1 * e,
      1 + 0.04 * ctx.beatPulse * e,
      -0.08 * e,
      0.12 * closedCatch,
      0,
      -0.10 * e,
      0.14 * closedCatch,
      -0.08 * s1 * e
    );

    setArms(
      t,
      (-0.78 - 0.35 * closedCatch) * e,
      (-0.38 * closedCatch + 0.20 * rockBack) * e,
      (0.35 - 0.22 * closedCatch) * e,
      (-0.85 - 0.25 * closedCatch) * e,
      0.20 * e,
      0.25 * s1 * e,
      0.15 * e,
      (-0.92 - 0.25 * rockBack - 0.15 * closedCatch) * e,
      (0.28 * rockBack + 0.18 * closedCatch) * e,
      (-0.24 + 0.16 * rockBack) * e,
      (-0.55 * rockBack - 0.95 * (1 - rockBack)) * e,
      -0.20 * e,
      -0.25 * s1 * e,
      -0.15 * e
    );

    const liftL = Math.max(0, -s1) * 0.16 * e;
    const liftR = (Math.max(0, s1) * 0.16 + 0.06 * rockBack) * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.14 * rockBack - 0.20 * s1 * (1 - rockBack) * e,
      -0.26 * rockBack + 0.20 * s1 * (1 - rockBack) * e,
      -0.10 * c1 * e,
      -0.10 * c1 * e,
      0.20 * e,
      -0.20 * e,
      0.22 * e,
      0.22 * e,
      0.20 * liftL,
      0.20 * liftR
    );
  },
};

/**
 * 19. DUET_DISCO_FEVER_HANDOFF
 * Choreography Note: Studio 54 Saturday-Night-Fever Point Hand-Off!
 * Beats 1 & 2: Partner A hits the skyward disco finger-point and sweeps down to
 * touch Partner B's inner hand on Beat 2.5 (Contact!); Beats 3 & 4: Partner B
 * catches the "spark" and shoots their outer arm skyward while A hits a low hip-cock!
 */
const DUET_DISCO_FEVER_HANDOFF: DuetMove = {
  id: 'DUET_DISCO_FEVER_HANDOFF',
  name: 'Studio 54 Disco — Fever Point Hand-Off & Hustle',
  origin: '1977 Brooklyn & Manhattan Disco Hustle Partner Routines',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 1.20,
  energy: 0.76,
  tempoFit: [104, 136],
  durationBars: 4,
  tags: ['disco', 'arms', 'pose', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const aSkyPoint = strikeWindow(barBeat, 0.6, 1.8) * e;
    // CONTACT: Beat 2.5 (barBeat 1.8) center-stage disco palm/finger spark hand-off
    const sparkPass = strikeWindow(barBeat, 1.8, 2.5) * e;
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.07 + 0.08 * sparkPass) * e,
      (0.14 * aSkyPoint - 0.10 * sparkPass + 0.06 * s1) * e,
      0.04 * sparkPass,
      -0.06 * aSkyPoint,
      (0.22 * aSkyPoint - 0.24 * sparkPass) * e,
      (-0.14 * aSkyPoint + 0.10 * sparkPass) * e,
      -0.05 * aSkyPoint,
      0.16 * aSkyPoint - 0.18 * sparkPass,
      -0.08 * aSkyPoint,
      (-0.10 * aSkyPoint + 0.08 * sparkPass) * e,
      0.20 * aSkyPoint - 0.22 * sparkPass,
      -0.08 * aSkyPoint,
      1 + 0.05 * (aSkyPoint + sparkPass),
      -0.08 * aSkyPoint,
      -0.16 * aSkyPoint + 0.22 * sparkPass,
      0,
      -0.12 * aSkyPoint + 0.08 * sparkPass,
      -0.20 * aSkyPoint + 0.26 * sparkPass,
      0.08 * aSkyPoint
    );

    // A's Left (outer) arm shoots high diagonal point on aSkyPoint; Right (inner) arm passes spark to B on sparkPass
    setArms(
      t,
      (-2.15 * aSkyPoint - 0.55 * (1 - aSkyPoint)) * e,
      0.25 * aSkyPoint,
      (0.55 * aSkyPoint + 0.35 * (1 - aSkyPoint)) * e,
      (-0.18 * aSkyPoint - 1.25 * (1 - aSkyPoint)) * e,
      0.20 * e,
      -0.20 * aSkyPoint,
      0.25 * (1 - aSkyPoint) * e,
      (-1.05 * sparkPass - 0.55 * (1 - sparkPass)) * e,
      (-0.45 * sparkPass + 0.20 * aSkyPoint) * e,
      (-0.68 * sparkPass - 0.32 * (1 - sparkPass)) * e,
      (-0.25 * sparkPass - 1.25 * (1 - sparkPass)) * e,
      -0.25 * sparkPass,
      0.35 * sparkPass,
      -0.25 * (1 - sparkPass) * e
    );

    setLegs(
      t,
      0.06 * Math.max(0, s1) * e,
      0.06 * Math.max(0, -s1) * e,
      0.12 * s1 * e,
      -0.12 * s1 * e,
      0.16 * aSkyPoint - 0.12 * sparkPass,
      0.16 * aSkyPoint - 0.12 * sparkPass,
      0.24 * e,
      -0.24 * e,
      0.10 * (1 - aSkyPoint) * e,
      0.18 * sparkPass + 0.10 * e,
      0.12 * e,
      0.18 * sparkPass
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 2.5 (barBeat 1.8) B catches the spark with Left (inner) hand
    const sparkPass = strikeWindow(barBeat, 1.8, 2.5) * e;
    const bSkyPoint = strikeWindow(barBeat, 3.0, 1.8) * e;
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.08 + 0.08 * sparkPass) * e,
      (-0.14 * bSkyPoint + 0.10 * sparkPass - 0.06 * s1) * e,
      0.04 * sparkPass,
      -0.06 * bSkyPoint,
      (-0.22 * bSkyPoint + 0.24 * sparkPass) * e,
      (0.14 * bSkyPoint - 0.10 * sparkPass) * e,
      -0.05 * bSkyPoint,
      -0.16 * bSkyPoint + 0.18 * sparkPass,
      0.08 * bSkyPoint,
      (-0.10 * bSkyPoint + 0.08 * sparkPass) * e,
      -0.20 * bSkyPoint + 0.22 * sparkPass,
      0.08 * bSkyPoint,
      1 + 0.05 * (bSkyPoint + sparkPass),
      -0.08 * bSkyPoint,
      0.16 * bSkyPoint - 0.22 * sparkPass,
      0,
      -0.12 * bSkyPoint + 0.08 * sparkPass,
      0.20 * bSkyPoint - 0.26 * sparkPass,
      -0.08 * bSkyPoint
    );

    setArms(
      t,
      (-1.05 * sparkPass - 0.55 * (1 - sparkPass)) * e,
      (0.45 * sparkPass - 0.20 * bSkyPoint) * e,
      (0.68 * sparkPass + 0.32 * (1 - sparkPass)) * e,
      (-0.25 * sparkPass - 1.25 * (1 - sparkPass)) * e,
      0.25 * sparkPass,
      0.35 * sparkPass,
      0.25 * (1 - sparkPass) * e,
      (-2.15 * bSkyPoint - 0.55 * (1 - bSkyPoint)) * e,
      -0.25 * bSkyPoint,
      (-0.55 * bSkyPoint - 0.35 * (1 - bSkyPoint)) * e,
      (-0.18 * bSkyPoint - 1.25 * (1 - bSkyPoint)) * e,
      -0.20 * e,
      0.20 * bSkyPoint,
      -0.25 * (1 - bSkyPoint) * e
    );

    setLegs(
      t,
      0.06 * Math.max(0, -s1) * e,
      0.06 * Math.max(0, s1) * e,
      -0.12 * s1 * e,
      0.12 * s1 * e,
      -0.16 * bSkyPoint + 0.12 * sparkPass,
      -0.16 * bSkyPoint + 0.12 * sparkPass,
      0.24 * e,
      -0.24 * e,
      0.18 * sparkPass + 0.10 * e,
      0.10 * (1 - bSkyPoint) * e,
      0.18 * sparkPass,
      0.12 * e
    );
  },
};

/**
 * 20. DUET_SALSA_DILE_QUE_NO
 * Choreography Note: Cuban Casino Salsa Dile Que No (Cross-Body Lead)!
 * Sensual Cuban hip-cubanito figure-eight (`pelvisRotZ` + `pelvisX`), open break
 * on Beat 1, closed shoulder-blade guide on Beat 2 (Contact!), and cross-body
 * inside turn on Beat 3.
 */
const DUET_SALSA_DILE_QUE_NO: DuetMove = {
  id: 'DUET_SALSA_DILE_QUE_NO',
  name: 'Cuban Casino Salsa — Dile Que No Cross-Body Lead',
  origin: 'Havana Casino Rueda & Cuban Son Partner Salsa',
  facing: 'PERPENDICULAR',
  anchorDistance: 0.95,
  energy: 0.78,
  tempoFit: [92, 138],
  durationBars: 4,
  tags: ['disco', 'salsa', 'isolation', 'spin', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 2 (barBeat 1.2) Lead's right hand guides Follow's shoulder blade
    const guideContact = strikeWindow(barBeat, 1.2, 2.0) * e;
    const openBreak = strikeWindow(barBeat, 0.2, 2.0) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      0.015 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.06 + 0.05 * Math.abs(s1)) * e,
      0.14 * s1 * e,
      (0.08 * guideContact - 0.08 * openBreak) * e,
      0.06 * guideContact,
      (0.22 * guideContact - 0.14 * openBreak + 0.14 * c1) * e,
      0.16 * s1 * e, // Cuban hip figure-eight roll
      0.04 * e,
      0.14 * c1 * e,
      -0.10 * s1 * e,
      0.05 * e,
      0.18 * guideContact + 0.10 * c1 * e,
      -0.08 * s1 * e,
      1 + 0.03 * ctx.beatPulse * e,
      0,
      -0.14 * guideContact,
      0.05 * s1 * e,
      -0.04 * e,
      -0.18 * guideContact,
      0.06 * s1 * e
    );

    setArms(
      t,
      (-1.05 - 0.35 * guideContact) * e,
      (-0.25 * guideContact + 0.18 * s1) * e,
      (0.26 - 0.14 * guideContact) * e,
      (-1.10 + 0.35 * guideContact) * e,
      0.20 * e,
      0.25 * c1 * e,
      0.15 * e,
      (-0.98 - 0.28 * guideContact) * e,
      (0.36 * guideContact - 0.18 * s1) * e,
      (-0.32 + 0.18 * guideContact) * e,
      (-0.95 + 0.30 * guideContact) * e,
      -0.20 * e,
      -0.25 * c1 * e,
      -0.15 * e
    );

    const liftL = Math.max(0, s1) * 0.13 * e;
    const liftR = Math.max(0, -s1) * 0.13 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.20 * s1 * e - 0.18 * openBreak,
      -0.20 * s1 * e + 0.14 * openBreak,
      0.12 * c1 * e,
      0.12 * c1 * e,
      0.18 * e,
      -0.18 * e,
      0.18 * liftL + 0.08 * e,
      0.18 * liftR + 0.08 * e,
      0.20 * liftL,
      0.20 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    if (ctx.isBeat && barBeatInt === 2) {
      ctx.requestSpin(TAU);
    }
    // CONTACT: Beat 2 (barBeat 1.2) Follow connects left hand & back with Lead's guide
    const guideContact = strikeWindow(barBeat, 1.2, 2.0) * e;
    const openBreak = strikeWindow(barBeat, 0.2, 2.0) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      0.015 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.07 + 0.05 * Math.abs(s1)) * e,
      -0.14 * s1 * e,
      (0.08 * guideContact - 0.08 * openBreak) * e,
      0.04 * guideContact,
      (-0.22 * guideContact + 0.14 * openBreak - 0.14 * c1) * e,
      -0.18 * s1 * e,
      0.04 * e,
      -0.14 * c1 * e,
      0.10 * s1 * e,
      -0.06 * e,
      -0.18 * guideContact - 0.10 * c1 * e,
      0.08 * s1 * e,
      1 + 0.03 * ctx.beatPulse * e,
      -0.04 * e,
      0.14 * guideContact,
      -0.05 * s1 * e,
      -0.06 * e,
      0.18 * guideContact,
      -0.06 * s1 * e
    );

    setArms(
      t,
      (-1.02 - 0.30 * guideContact) * e,
      (-0.32 * guideContact + 0.18 * s1) * e,
      (0.32 - 0.18 * guideContact) * e,
      (-0.95 + 0.30 * guideContact) * e,
      0.20 * e,
      0.28 * c1 * e,
      0.18 * e,
      (-1.15 - 0.45 * (1 - guideContact)) * e,
      0.22 * s1 * e,
      (-0.42 - 0.18 * c1) * e,
      -0.85 * e,
      -0.25 * e,
      -0.30 * c1 * e,
      -0.20 * e
    );

    const liftL = Math.max(0, -s1) * 0.14 * e;
    const liftR = Math.max(0, s1) * 0.14 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.20 * s1 * e + 0.14 * openBreak,
      0.20 * s1 * e - 0.18 * openBreak,
      -0.12 * c1 * e,
      -0.12 * c1 * e,
      0.20 * e,
      -0.20 * e,
      0.18 * liftL + 0.08 * e,
      0.18 * liftR + 0.08 * e,
      0.22 * liftL,
      0.22 * liftR
    );
  },
};

/**
 * 21. DUET_SHUFFLE_MELBOURNE_CROSS
 * Choreography Note: High-velocity Melbourne Shuffle & Cutting Shapes Partner Cross!
 * Relentless Running-Man high-knee glides on `p`, punctuated on Beat 2 and Beat 4
 * by an inward scissor-kick & low inner-hand ankle-tap pass!
 */
const DUET_SHUFFLE_MELBOURNE_CROSS: DuetMove = {
  id: 'DUET_SHUFFLE_MELBOURNE_CROSS',
  name: 'Melbourne Shuffle — Running-Man & Scissor Ankle-Tap',
  origin: 'Melbourne Underground Rave Shuffle & UK Cutting Shapes',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 1.25,
  energy: 0.92,
  tempoFit: [115, 155],
  durationBars: 4,
  tags: ['footwork', 'jump', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 2 and Beat 4 (barBeat 1.0 and 3.0) inward scissor kick + low inner-palm slap
    const scissorSlap = (strikeWindow(barBeat, 1.0, 2.5) + strikeWindow(barBeat, 3.0, 2.5)) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      (0.05 * Math.abs(s1) + 0.03 * ctx.beatPulse) * e,
      PELVIS_REST_Y - (0.07 + 0.07 * (1 - Math.abs(s1)) + 0.08 * scissorSlap) * e,
      (0.14 * c1 + 0.10 * scissorSlap) * e,
      0.04 * s1 * e,
      (0.08 + 0.14 * scissorSlap) * e,
      (-0.20 * scissorSlap + 0.12 * s1) * e,
      0.08 * c1 * e,
      0.10 * scissorSlap,
      -0.14 * scissorSlap,
      0,
      (0.12 * scissorSlap + 0.04) * e,
      -0.18 * scissorSlap + 0.10 * s1 * e,
      0,
      1 + 0.05 * ctx.beatPulse * e,
      0.08 * scissorSlap,
      0.16 * scissorSlap,
      0,
      0.10 * scissorSlap,
      0.20 * scissorSlap,
      0.06 * s1 * e
    );

    setArms(
      t,
      (-0.75 + 0.35 * s1 - 0.45 * scissorSlap) * e,
      0.20 * e,
      (0.32 + 0.20 * scissorSlap) * e,
      (-1.10 + 0.30 * Math.abs(s1)) * e,
      0.20 * e,
      0.25 * s1 * e,
      0.15 * e,
      (-0.75 - 0.35 * s1 - 0.25 * scissorSlap) * e,
      -0.45 * scissorSlap,
      (-0.32 - 0.35 * scissorSlap) * e,
      (-1.10 + 0.65 * scissorSlap) * e,
      -0.25 * scissorSlap,
      0.35 * scissorSlap,
      -0.20 * scissorSlap
    );

    const liftL = Math.max(0, s1) * 0.21 * e;
    const liftR = (Math.max(0, -s1) * 0.21 + 0.08 * scissorSlap) * e;
    setLegs(
      t,
      liftL,
      clamp(liftR, 0, 0.22),
      0.36 * s1 * e,
      -0.36 * s1 * e + 0.25 * scissorSlap,
      0.14 * c1 * e,
      0.14 * c1 * e - 0.22 * scissorSlap,
      (0.24 * c1 + 0.15) * e,
      (-0.24 * c1 - 0.15) * e,
      0.28 * liftL + 0.10 * e,
      0.28 * liftR + 0.10 * e,
      -0.18 * liftL,
      0.24 * scissorSlap - 0.18 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 2 and Beat 4 (barBeat 1.0 and 3.0) inward scissor kick + low inner-palm slap
    const scissorSlap = (strikeWindow(barBeat, 1.0, 2.5) + strikeWindow(barBeat, 3.0, 2.5)) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      (0.05 * Math.abs(s1) + 0.03 * ctx.beatPulse) * e,
      PELVIS_REST_Y - (0.08 + 0.07 * (1 - Math.abs(s1)) + 0.08 * scissorSlap) * e,
      (-0.14 * c1 - 0.10 * scissorSlap) * e,
      0.04 * s1 * e,
      (0.08 + 0.14 * scissorSlap) * e,
      (0.20 * scissorSlap - 0.12 * s1) * e,
      -0.08 * c1 * e,
      0.10 * scissorSlap,
      0.14 * scissorSlap,
      0,
      (0.12 * scissorSlap + 0.04) * e,
      0.18 * scissorSlap - 0.10 * s1 * e,
      0,
      1 + 0.05 * ctx.beatPulse * e,
      0.08 * scissorSlap,
      -0.16 * scissorSlap,
      0,
      0.10 * scissorSlap,
      -0.20 * scissorSlap,
      -0.06 * s1 * e
    );

    setArms(
      t,
      (-0.75 - 0.35 * s1 - 0.25 * scissorSlap) * e,
      0.45 * scissorSlap,
      (0.32 + 0.35 * scissorSlap) * e,
      (-1.10 + 0.65 * scissorSlap) * e,
      0.25 * scissorSlap,
      0.35 * scissorSlap,
      0.20 * scissorSlap,
      (-0.75 + 0.35 * s1 - 0.45 * scissorSlap) * e,
      -0.20 * e,
      (-0.32 - 0.20 * scissorSlap) * e,
      (-1.10 + 0.30 * Math.abs(s1)) * e,
      -0.20 * e,
      -0.25 * s1 * e,
      -0.15 * e
    );

    const liftL = (Math.max(0, -s1) * 0.21 + 0.08 * scissorSlap) * e;
    const liftR = Math.max(0, s1) * 0.21 * e;
    setLegs(
      t,
      clamp(liftL, 0, 0.22),
      liftR,
      -0.36 * s1 * e + 0.25 * scissorSlap,
      0.36 * s1 * e,
      -0.14 * c1 * e + 0.22 * scissorSlap,
      -0.14 * c1 * e,
      (-0.24 * c1 + 0.15) * e,
      (0.24 * c1 - 0.15) * e,
      0.28 * liftL + 0.10 * e,
      0.28 * liftR + 0.10 * e,
      0.24 * scissorSlap - 0.18 * liftL,
      -0.18 * liftR
    );
  },
};

/**
 * 22. DUET_HOUSE_JACK_CONVERSATION
 * Choreography Note: Chicago/NYC Loft House Spine-Jack & Skate Dialogue!
 * Continuous undulating spine-jack wave (`pelvisRotX` -> `lowerSpineX` -> `chestX`
 * with phase lag), cross-stepping heel-toe skates, and a floating overhead
 * dual-palm graze on Beat 3 of every bar.
 */
const DUET_HOUSE_JACK_CONVERSATION: DuetMove = {
  id: 'DUET_HOUSE_JACK_CONVERSATION',
  name: 'Chicago House Loft — Spine-Jack & Skate Conversation',
  origin: 'Chicago Warehouse & NYC Sound Factory House Cyphers',
  facing: 'EACH_OTHER',
  anchorDistance: 1.10,
  energy: 0.80,
  tempoFit: [112, 136],
  durationBars: 4,
  tags: ['footwork', 'isolation', 'groove', 'contact'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 3 (barBeat 2.0) overhead house-loft palm graze as both jack forward
    const palmGraze = strikeWindow(barBeat, 2.0, 2.0) * e;
    // Travelling spine-jack wave with phase delay up the vertebral column
    const jackPelvis = Math.sin(ctx.p);
    const jackSpine = Math.sin(ctx.p - 0.65);
    const jackChest = Math.sin(ctx.p - 1.30);
    const skate = Math.sin(ctx.halfP);

    setBody(
      t,
      0.025 * Math.max(0, jackPelvis) * e,
      PELVIS_REST_Y - (0.08 + 0.06 * (1 - jackPelvis) * 0.5) * e,
      0.16 * skate * e,
      (0.06 * jackPelvis + 0.06 * palmGraze) * e,
      0.18 * jackPelvis * e,
      0.16 * skate * e,
      -0.10 * skate * e,
      0.18 * jackSpine * e,
      0.12 * skate * e,
      -0.08 * skate * e,
      (0.20 * jackChest - 0.08 * palmGraze) * e,
      0.14 * skate * e,
      0.06 * skate * e,
      1 + 0.04 * ctx.beatPulse * e,
      0.14 * Math.sin(ctx.p - 1.8) * e,
      -0.10 * skate * e,
      0,
      0.16 * Math.sin(ctx.p - 2.1) * e,
      -0.12 * skate * e,
      0.08 * skate * e
    );

    setArms(
      t,
      (-0.78 - 0.72 * palmGraze - 0.20 * jackChest) * e,
      (-0.28 * palmGraze + 0.20 * skate) * e,
      (0.36 - 0.20 * palmGraze) * e,
      (-0.95 + 0.45 * palmGraze) * e,
      0.20 * jackSpine * e,
      0.25 * jackChest * e,
      0.15 * e,
      (-0.78 - 0.72 * palmGraze + 0.20 * jackChest) * e,
      (0.28 * palmGraze + 0.20 * skate) * e,
      (-0.36 + 0.20 * palmGraze) * e,
      (-0.95 + 0.45 * palmGraze) * e,
      -0.20 * jackSpine * e,
      -0.25 * jackChest * e,
      -0.15 * e
    );

    const liftL = Math.max(0, jackPelvis) * 0.14 * e;
    const liftR = Math.max(0, -jackPelvis) * 0.14 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.20 * jackPelvis * e,
      -0.20 * jackPelvis * e,
      0.16 * skate * e,
      0.16 * skate * e,
      0.22 * skate * e,
      -0.22 * skate * e,
      0.16 * e,
      0.16 * e,
      0.22 * liftL,
      0.22 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 3 (barBeat 2.0) overhead house-loft palm graze
    const palmGraze = strikeWindow(barBeat, 2.0, 2.0) * e;
    const jackPelvis = Math.sin(ctx.p);
    const jackSpine = Math.sin(ctx.p - 0.65);
    const jackChest = Math.sin(ctx.p - 1.30);
    const skate = Math.sin(ctx.halfP);

    setBody(
      t,
      0.025 * Math.max(0, jackPelvis) * e,
      PELVIS_REST_Y - (0.09 + 0.06 * (1 - jackPelvis) * 0.5) * e,
      -0.16 * skate * e,
      (0.06 * jackPelvis + 0.06 * palmGraze) * e,
      0.18 * jackPelvis * e,
      -0.16 * skate * e,
      0.10 * skate * e,
      0.18 * jackSpine * e,
      -0.12 * skate * e,
      0.08 * skate * e,
      (0.20 * jackChest - 0.08 * palmGraze) * e,
      -0.14 * skate * e,
      -0.06 * skate * e,
      1 + 0.04 * ctx.beatPulse * e,
      0.14 * Math.sin(ctx.p - 1.8) * e,
      0.10 * skate * e,
      0,
      0.16 * Math.sin(ctx.p - 2.1) * e,
      0.12 * skate * e,
      -0.08 * skate * e
    );

    setArms(
      t,
      (-0.80 - 0.72 * palmGraze + 0.20 * jackChest) * e,
      (-0.28 * palmGraze - 0.20 * skate) * e,
      (0.36 - 0.20 * palmGraze) * e,
      (-0.95 + 0.45 * palmGraze) * e,
      0.20 * jackSpine * e,
      0.25 * jackChest * e,
      0.15 * e,
      (-0.80 - 0.72 * palmGraze - 0.20 * jackChest) * e,
      (0.28 * palmGraze - 0.20 * skate) * e,
      (-0.36 + 0.20 * palmGraze) * e,
      (-0.95 + 0.45 * palmGraze) * e,
      -0.20 * jackSpine * e,
      -0.25 * jackChest * e,
      -0.15 * e
    );

    const liftL = Math.max(0, -jackPelvis) * 0.14 * e;
    const liftR = Math.max(0, jackPelvis) * 0.14 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.20 * jackPelvis * e,
      0.20 * jackPelvis * e,
      -0.16 * skate * e,
      -0.16 * skate * e,
      -0.22 * skate * e,
      0.22 * skate * e,
      0.16 * e,
      0.16 * e,
      0.22 * liftL,
      0.22 * liftR
    );
  },
};

/**
 * 23. DUET_JAZZ_HIGH_FIVE_CHAIN
 * Choreography Note: Street-Jazz 4-Beat Percussive Hand-Slap Ladder!
 * Every single beat in the bar hits a distinct synchronized contact target:
 * Beat 1: High Right-to-Right five; Beat 2: Low crouch Left-to-Left five;
 * Beat 3: Mid-chest Cross-Double slap; Beat 4: Airborne Jump-Ten slap!
 */
const DUET_JAZZ_HIGH_FIVE_CHAIN: DuetMove = {
  id: 'DUET_JAZZ_HIGH_FIVE_CHAIN',
  name: 'Street Jazz — Four-Tier High-Low-Cross-Jump Five Chain',
  origin: 'Broadway & LA Commercial Street-Jazz Partner Combos',
  facing: 'EACH_OTHER',
  anchorDistance: 0.98,
  energy: 0.86,
  tempoFit: [96, 142],
  durationBars: 4,
  tags: ['arms', 'contact', 'jump', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT:
    // Beat 1 (barBeat 0.0): High Right-to-Right
    // Beat 2 (barBeat 1.0): Low Left-to-Left (with deep crouch so Dog/Cat/Mouse meet!)
    // Beat 3 (barBeat 2.0): Mid Cross-Double
    // Beat 4 (barBeat 3.0): Airborne Jump-Ten
    const b1HighR = strikeWindow(barBeat, 0.0, 2.5) * e;
    const b2LowL = strikeWindow(barBeat, 1.0, 2.5) * e;
    const b3Cross = strikeWindow(barBeat, 2.0, 2.5) * e;
    const b4JumpTen = strikeWindow(barBeat, 3.0, 2.5) * e;

    setBody(
      t,
      0.07 * b4JumpTen,
      PELVIS_REST_Y - (0.06 + 0.24 * b2LowL + 0.06 * b3Cross - 0.03 * b4JumpTen) * e,
      (0.10 * b1HighR - 0.10 * b2LowL) * e,
      0.08 * (b1HighR + b2LowL + b3Cross + b4JumpTen),
      (0.22 * b2LowL - 0.08 * b4JumpTen) * e,
      (0.24 * b1HighR - 0.24 * b2LowL) * e,
      -0.08 * (b1HighR - b2LowL),
      0.16 * b2LowL,
      0.18 * (b1HighR - b2LowL),
      0,
      (0.18 * b2LowL - 0.12 * (b1HighR + b4JumpTen)) * e,
      0.22 * (b1HighR - b2LowL),
      0,
      1 + 0.05 * (b1HighR + b2LowL + b3Cross + b4JumpTen),
      (0.12 * b2LowL - 0.10 * b4JumpTen) * e,
      -0.12 * (b1HighR - b2LowL),
      0,
      (0.14 * b2LowL - 0.12 * (b1HighR + b4JumpTen)) * e,
      -0.15 * (b1HighR - b2LowL),
      0.08 * b3Cross
    );

    setArms(
      t,
      (-0.65 - 0.25 * b2LowL - 0.55 * b3Cross - 1.05 * b4JumpTen) * e,
      (-0.32 * b2LowL - 0.45 * b3Cross - 0.22 * b4JumpTen) * e,
      (0.30 - 0.22 * (b2LowL + b3Cross + b4JumpTen)) * e,
      (-1.10 + 0.65 * (b2LowL + b3Cross + b4JumpTen)) * e,
      0.25 * b3Cross,
      0.38 * (b2LowL + b3Cross + b4JumpTen),
      0.15 * e,
      (-0.65 - 0.85 * b1HighR - 0.55 * b3Cross - 1.05 * b4JumpTen) * e,
      (0.32 * b1HighR + 0.45 * b3Cross + 0.22 * b4JumpTen) * e,
      (-0.30 + 0.22 * (b1HighR + b3Cross + b4JumpTen)) * e,
      (-1.10 + 0.65 * (b1HighR + b3Cross + b4JumpTen)) * e,
      -0.25 * b3Cross,
      0.38 * (b1HighR + b3Cross + b4JumpTen),
      -0.15 * e
    );

    setLegs(
      t,
      0.16 * b4JumpTen + 0.08 * b1HighR,
      0.16 * b4JumpTen + 0.08 * b2LowL,
      0.16 * (b1HighR - b2LowL),
      -0.16 * (b1HighR - b2LowL),
      0.10 * e,
      -0.10 * e,
      0.20 * e,
      -0.20 * e,
      (0.14 + 0.28 * b2LowL) * e,
      (0.14 + 0.28 * b2LowL) * e,
      0.25 * b4JumpTen,
      0.25 * b4JumpTen
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Matches A's 4-beat high-R, low-L, cross-double, jump-ten ladder
    const b1HighR = strikeWindow(barBeat, 0.0, 2.5) * e;
    const b2LowL = strikeWindow(barBeat, 1.0, 2.5) * e;
    const b3Cross = strikeWindow(barBeat, 2.0, 2.5) * e;
    const b4JumpTen = strikeWindow(barBeat, 3.0, 2.5) * e;

    setBody(
      t,
      0.07 * b4JumpTen,
      PELVIS_REST_Y - (0.08 + 0.22 * b2LowL + 0.06 * b3Cross - 0.03 * b4JumpTen) * e,
      (0.10 * b1HighR - 0.10 * b2LowL) * e,
      0.08 * (b1HighR + b2LowL + b3Cross + b4JumpTen),
      (0.22 * b2LowL - 0.08 * b4JumpTen) * e,
      (0.24 * b1HighR - 0.24 * b2LowL) * e,
      -0.08 * (b1HighR - b2LowL),
      0.16 * b2LowL,
      0.18 * (b1HighR - b2LowL),
      0,
      (0.18 * b2LowL - 0.12 * (b1HighR + b4JumpTen)) * e,
      0.22 * (b1HighR - b2LowL),
      0,
      1 + 0.05 * (b1HighR + b2LowL + b3Cross + b4JumpTen),
      (0.12 * b2LowL - 0.10 * b4JumpTen) * e,
      -0.12 * (b1HighR - b2LowL),
      0,
      (0.14 * b2LowL - 0.12 * (b1HighR + b4JumpTen)) * e,
      -0.15 * (b1HighR - b2LowL),
      -0.08 * b3Cross
    );

    setArms(
      t,
      (-0.68 - 0.25 * b2LowL - 0.55 * b3Cross - 1.05 * b4JumpTen) * e,
      (-0.32 * b2LowL - 0.45 * b3Cross - 0.22 * b4JumpTen) * e,
      (0.30 - 0.22 * (b2LowL + b3Cross + b4JumpTen)) * e,
      (-1.08 + 0.65 * (b2LowL + b3Cross + b4JumpTen)) * e,
      0.25 * b3Cross,
      0.38 * (b2LowL + b3Cross + b4JumpTen),
      0.15 * e,
      (-0.68 - 0.85 * b1HighR - 0.55 * b3Cross - 1.05 * b4JumpTen) * e,
      (0.32 * b1HighR + 0.45 * b3Cross + 0.22 * b4JumpTen) * e,
      (-0.30 + 0.22 * (b1HighR + b3Cross + b4JumpTen)) * e,
      (-1.08 + 0.65 * (b1HighR + b3Cross + b4JumpTen)) * e,
      -0.25 * b3Cross,
      0.38 * (b1HighR + b3Cross + b4JumpTen),
      -0.15 * e
    );

    setLegs(
      t,
      0.16 * b4JumpTen + 0.08 * b1HighR,
      0.16 * b4JumpTen + 0.08 * b2LowL,
      0.16 * (b1HighR - b2LowL),
      -0.16 * (b1HighR - b2LowL),
      0.10 * e,
      -0.10 * e,
      0.20 * e,
      -0.20 * e,
      (0.15 + 0.28 * b2LowL) * e,
      (0.15 + 0.28 * b2LowL) * e,
      0.25 * b4JumpTen,
      0.25 * b4JumpTen
    );
  },
};

/**
 * 24. DUET_JAZZ_ELBOW_HOOK_SWAP
 * Choreography Note: Linked-Elbow Dosey-Doe Centrifugal Spin!
 * Anchored at close `anchorDistance: 0.76` in `EACH_OTHER`, both dancers hook
 * right elbows on Beats 1..2 (`elbowRX = -1.65`), lean away centrifugally, and
 * trigger a synchronized spin on Beat 3 while waving their free outer hand at the crowd!
 */
const DUET_JAZZ_ELBOW_HOOK_SWAP: DuetMove = {
  id: 'DUET_JAZZ_ELBOW_HOOK_SWAP',
  name: 'Street Jazz — Hooked-Elbow Dosey-Doe Spin Swap',
  origin: 'American Barn-Dance Hoedown & Broadway Jazz Partnering',
  facing: 'EACH_OTHER',
  anchorDistance: 0.76,
  energy: 0.85,
  tempoFit: [100, 152],
  durationBars: 4,
  tags: ['spin', 'arms', 'contact', 'jump', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    if (ctx.isBeat && barBeatInt === 2) {
      ctx.requestSpin(TAU);
    }
    // CONTACT: Continuous linked Right-to-Right elbow hook across Beats 1..3
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      0.04 * Math.abs(s1) * e,
      PELVIS_REST_Y - (0.08 + 0.05 * (1 - Math.abs(s1))) * e,
      -0.12 * e, // Centrifugal pull away from linked right elbow
      0.06 * e,
      0.06 * e,
      0.22 * e,
      0.14 * e,
      0.04 * e,
      0.16 * e,
      0.10 * e,
      -0.06 * e,
      0.20 * e,
      0.12 * e,
      1 + 0.04 * ctx.beatPulse * e,
      0,
      -0.16 * e,
      -0.08 * e,
      -0.06 * e,
      -0.20 * e,
      0.10 * s1 * e
    );

    // Right arm tightly hooked at elbow (-1.65); Left arm waves high overhead
    setArms(
      t,
      (-1.90 - 0.25 * s1) * e,
      0.25 * c1 * e,
      (0.58 + 0.16 * s1) * e,
      (-0.45 + 0.15 * c1) * e,
      0.25 * e,
      0.35 * s1 * e,
      0.20 * c1 * e,
      -0.78 * e,
      0.38 * e,
      -0.12 * e,
      -1.68 * e,
      -0.35 * e,
      0.20 * e,
      -0.25 * e
    );

    const liftL = Math.max(0, s1) * 0.18 * e;
    const liftR = Math.max(0, -s1) * 0.18 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.24 * s1 * e,
      -0.24 * s1 * e,
      0.10 * e,
      -0.10 * e,
      0.20 * e,
      -0.20 * e,
      0.20 * liftL + 0.10 * e,
      0.20 * liftR + 0.10 * e,
      0.22 * liftL,
      0.22 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    if (ctx.isBeat && barBeatInt === 2) {
      ctx.requestSpin(TAU);
    }
    // CONTACT: Continuous linked Right-to-Right elbow hook matching Partner A
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      0.04 * Math.abs(s1) * e,
      PELVIS_REST_Y - (0.09 + 0.05 * (1 - Math.abs(s1))) * e,
      -0.12 * e,
      0.06 * e,
      0.06 * e,
      0.22 * e,
      0.14 * e,
      0.04 * e,
      0.16 * e,
      0.10 * e,
      -0.06 * e,
      0.20 * e,
      0.12 * e,
      1 + 0.04 * ctx.beatPulse * e,
      0,
      -0.16 * e,
      -0.08 * e,
      -0.06 * e,
      -0.20 * e,
      -0.10 * s1 * e
    );

    setArms(
      t,
      (-1.90 + 0.25 * s1) * e,
      -0.25 * c1 * e,
      (0.58 - 0.16 * s1) * e,
      (-0.45 - 0.15 * c1) * e,
      0.25 * e,
      -0.35 * s1 * e,
      -0.20 * c1 * e,
      -0.80 * e,
      0.38 * e,
      -0.12 * e,
      -1.68 * e,
      -0.35 * e,
      0.20 * e,
      -0.25 * e
    );

    const liftL = Math.max(0, -s1) * 0.18 * e;
    const liftR = Math.max(0, s1) * 0.18 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.24 * s1 * e,
      0.24 * s1 * e,
      0.10 * e,
      -0.10 * e,
      0.20 * e,
      -0.20 * e,
      0.20 * liftL + 0.10 * e,
      0.20 * liftR + 0.10 * e,
      0.22 * liftL,
      0.22 * liftR
    );
  },
};

/**
 * 25. DUET_WAACKING_VOGUE_FRAME
 * Choreography Note: Punk-Waacking Overhead Arm-Roll & Vogue Box-Frame!
 * Beats 1 & 2: Blazing double-time overhead waacking arm-circles;
 * Beats 3 & 4: Both snap into a razor-sharp 90-degree geometric Vogue box-frame
 * with inner forearms touching to frame both LED visors!
 */
const DUET_WAACKING_VOGUE_FRAME: DuetMove = {
  id: 'DUET_WAACKING_VOGUE_FRAME',
  name: 'Waacking & Vogue — Overhead Roll & Dual Visor Box-Frame',
  origin: 'LA 70s Club Waacking & Harlem Ballroom Vogue Femme',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 0.96,
  energy: 0.84,
  tempoFit: [105, 142],
  durationBars: 4,
  tags: ['disco', 'arms', 'pose', 'contact', 'isolation'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beats 3 & 4 (barBeat 2.2..3.6) inner right forearm connects with B's left forearm in Vogue frame
    const frameLock = (strikeWindow(barBeat, 2.4, 2.0) + strikeWindow(barBeat, 3.2, 2.0)) * 0.72 * e;
    const lock = clamp(frameLock, 0, 1);
    const rollSin = Math.sin(ctx.p * 2);
    const rollCos = Math.cos(ctx.p * 2);

    setBody(
      t,
      0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.07 + 0.08 * lock) * e,
      0.12 * lock,
      0.04 * lock,
      -0.06 * e,
      (-0.18 * lock + 0.14 * (1 - lock) * rollSin) * e,
      -0.14 * lock,
      -0.06 * e,
      -0.12 * lock,
      -0.10 * lock,
      -0.10 * e,
      -0.16 * lock,
      -0.10 * lock,
      1 + 0.05 * lock,
      -0.05 * e,
      0.18 * lock,
      0.10 * lock,
      -0.06 * e,
      0.22 * lock,
      0.12 * lock
    );

    // During (1 - lock): overhead waack circles; During lock: horizontal 90-deg box frame
    setArms(
      t,
      ((-1.75 + 0.45 * rollSin) * (1 - lock) - 1.45 * lock) * e,
      (0.35 * rollCos * (1 - lock) - 0.35 * lock) * e,
      (0.45 * (1 - lock) + 0.22 * lock) * e,
      (-1.25 * (1 - lock) - 1.55 * lock) * e,
      0.30 * lock,
      0.35 * lock,
      0.20 * e,
      ((-1.75 - 0.45 * rollSin) * (1 - lock) - 1.10 * lock) * e,
      (-0.35 * rollCos * (1 - lock) - 0.48 * lock) * e,
      (-0.45 * (1 - lock) - 0.58 * lock) * e,
      (-1.25 * (1 - lock) - 1.55 * lock) * e,
      -0.30 * lock,
      0.35 * lock,
      -0.20 * e
    );

    const s1 = Math.sin(ctx.p);
    setLegs(
      t,
      0.06 * (1 - lock) * Math.max(0, s1) * e,
      0.06 * (1 - lock) * Math.max(0, -s1) * e,
      0.10 * lock,
      -0.10 * lock,
      0.14 * lock,
      0.14 * lock,
      0.24 * e,
      -0.24 * e,
      0.12 * e,
      0.22 * lock + 0.10 * e,
      0.10 * e,
      0.24 * lock
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beats 3 & 4 inner left forearm connects with A's right forearm in Vogue frame
    const frameLock = (strikeWindow(barBeat, 2.4, 2.0) + strikeWindow(barBeat, 3.2, 2.0)) * 0.72 * e;
    const lock = clamp(frameLock, 0, 1);
    const rollSin = Math.sin(ctx.p * 2);
    const rollCos = Math.cos(ctx.p * 2);

    setBody(
      t,
      0.02 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.08 + 0.08 * lock) * e,
      -0.12 * lock,
      0.04 * lock,
      -0.06 * e,
      (0.18 * lock - 0.14 * (1 - lock) * rollSin) * e,
      0.14 * lock,
      -0.06 * e,
      0.12 * lock,
      0.10 * lock,
      -0.10 * e,
      0.16 * lock,
      0.10 * lock,
      1 + 0.05 * lock,
      -0.05 * e,
      -0.18 * lock,
      -0.10 * lock,
      -0.06 * e,
      -0.22 * lock,
      -0.12 * lock
    );

    setArms(
      t,
      ((-1.75 + 0.45 * rollSin) * (1 - lock) - 1.10 * lock) * e,
      (0.35 * rollCos * (1 - lock) + 0.48 * lock) * e,
      (0.45 * (1 - lock) + 0.58 * lock) * e,
      (-1.25 * (1 - lock) - 1.55 * lock) * e,
      0.30 * lock,
      0.35 * lock,
      0.20 * e,
      ((-1.75 - 0.45 * rollSin) * (1 - lock) - 1.45 * lock) * e,
      (-0.35 * rollCos * (1 - lock) + 0.35 * lock) * e,
      (-0.45 * (1 - lock) - 0.22 * lock) * e,
      (-1.25 * (1 - lock) - 1.55 * lock) * e,
      -0.30 * lock,
      0.35 * lock,
      -0.20 * e
    );

    const s1 = Math.sin(ctx.p);
    setLegs(
      t,
      0.06 * (1 - lock) * Math.max(0, -s1) * e,
      0.06 * (1 - lock) * Math.max(0, s1) * e,
      -0.10 * lock,
      0.10 * lock,
      -0.14 * lock,
      -0.14 * lock,
      0.24 * e,
      -0.24 * e,
      0.22 * lock + 0.10 * e,
      0.12 * e,
      0.24 * lock,
      0.10 * e
    );
  },
};


// ============================================================================
// SECTION 3: CUTE ANIMAL COMEDY DUETS (7 MOVES — MOVES 26..32)
// ============================================================================

/**
 * 26. DUET_COMEDY_CAT_MOUSE_CHASE
 * Choreography Note: Classic Tom-and-Jerry / Cat-and-Mouse Circle Chase!
 * Bars 1..2 (moveBeat 0..7): Partner A prowls forward with sneaky pouncing claws
 * chasing Partner B around a tight orbit; on Beat 4 of Bar 2 (Contact!) B boops A's
 * nose, spins 180, and Bars 3..4 (moveBeat 8..15) B chases a startled A!
 */
const DUET_COMEDY_CAT_MOUSE_CHASE: DuetMove = {
  id: 'DUET_COMEDY_CAT_MOUSE_CHASE',
  name: 'Cat & Mouse — Pounce Orbit & Nose-Boop Role Swap',
  origin: 'Golden-Age Slapstick Cartoon Chase Pantomime',
  facing: 'EACH_OTHER',
  anchorDistance: 1.05,
  energy: 0.88,
  tempoFit: [100, 152],
  durationBars: 4,
  tags: ['comedy', 'footwork', 'spin', 'contact', 'jump'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const isChaser = (ctx.moveBeat % 16) < 8 ? 1 : 0;
    if (ctx.isBeat && (ctx.moveBeat % 8 === 7)) {
      ctx.requestSpin(TAU);
    }
    // CONTACT: Beat 4 of every 2nd bar (barBeat 3.2) nose-boop / paw-tag swap!
    const boopSwap = strikeWindow(barBeat, 3.2, 2.5) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);
    const orbitX = 0.24 * Math.sin(ctx.quarterP) * e;
    const orbitZ = 0.14 * Math.cos(ctx.quarterP) * e;

    // When A is chaser: low predatory sneak crouch (pelvisY ~ 0.64); when chased: high startled hops!
    const crouch = isChaser ? 0.24 : 0.06;
    const hop = (1 - isChaser) * Math.abs(s1) * 0.08 * e;

    setBody(
      t,
      hop + 0.04 * boopSwap,
      PELVIS_REST_Y - crouch * e,
      orbitX,
      orbitZ + 0.08 * boopSwap,
      (0.26 * isChaser - 0.12 * (1 - isChaser)) * e,
      0.24 * c1 * e,
      -0.12 * s1 * e,
      (0.18 * isChaser - 0.10 * (1 - isChaser)) * e,
      0.16 * c1 * e,
      -0.08 * s1 * e,
      (0.20 * isChaser - 0.14 * (1 - isChaser) - 0.10 * boopSwap) * e,
      0.20 * c1 * e,
      0.08 * s1 * e,
      1 + 0.06 * (boopSwap + ctx.beatPulse * e),
      (-0.14 * isChaser + 0.12 * (1 - isChaser)) * e,
      -0.16 * c1 * e,
      0,
      (-0.16 * isChaser + 0.14 * (1 - isChaser) + 0.12 * boopSwap) * e,
      -0.20 * c1 * e,
      0.12 * s1 * e
    );

    // Chaser: sneaky pouncing monster-paws in front; Chased: hands up by cheeks in cartoon panic!
    setArms(
      t,
      (-1.15 * isChaser - 1.55 * (1 - isChaser) - 0.20 * s1 - 0.30 * boopSwap) * e,
      (-0.20 * isChaser + 0.35 * (1 - isChaser) - 0.25 * boopSwap) * e,
      (0.28 * isChaser + 0.45 * (1 - isChaser) - 0.18 * boopSwap) * e,
      (-0.95 * isChaser - 1.45 * (1 - isChaser) + 0.45 * boopSwap) * e,
      0.30 * isChaser * e,
      (0.45 * isChaser * s1 + 0.35 * boopSwap) * e,
      0.20 * e,
      (-1.15 * isChaser - 1.55 * (1 - isChaser) + 0.20 * s1 - 0.35 * boopSwap) * e,
      (0.20 * isChaser - 0.35 * (1 - isChaser) + 0.25 * boopSwap) * e,
      (-0.28 * isChaser - 0.45 * (1 - isChaser) + 0.18 * boopSwap) * e,
      (-0.95 * isChaser - 1.45 * (1 - isChaser) + 0.55 * boopSwap) * e,
      -0.30 * isChaser * e,
      (-0.45 * isChaser * s1 + 0.40 * boopSwap) * e,
      -0.20 * e
    );

    const liftL = Math.max(0, s1) * 0.20 * e;
    const liftR = Math.max(0, -s1) * 0.20 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.32 * s1 * e,
      -0.32 * s1 * e,
      0.12 * c1 * e,
      0.12 * c1 * e,
      0.22 * isChaser * e,
      -0.22 * isChaser * e,
      (0.32 * isChaser + 0.14 * (1 - isChaser)) * e,
      (0.32 * isChaser + 0.14 * (1 - isChaser)) * e,
      0.24 * liftL,
      0.24 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Partner B starts as the chased mouse in Bars 1..2, then becomes the chaser in Bars 3..4!
    const isChaser = (ctx.moveBeat % 16) >= 8 ? 1 : 0;
    if (ctx.isBeat && (ctx.moveBeat % 8 === 7)) {
      ctx.requestSpin(-TAU);
    }
    // CONTACT: Beat 4 (barBeat 3.2) low-to-mid nose-boop paw strike
    const boopSwap = strikeWindow(barBeat, 3.2, 2.5) * e;
    const s1 = Math.sin(ctx.p + PI);
    const c1 = Math.cos(ctx.p + PI);
    const orbitX = -0.24 * Math.sin(ctx.quarterP) * e;
    const orbitZ = -0.14 * Math.cos(ctx.quarterP) * e;

    const crouch = isChaser ? 0.24 : 0.06;
    const hop = (1 - isChaser) * Math.abs(s1) * 0.08 * e;

    setBody(
      t,
      hop + 0.04 * boopSwap,
      PELVIS_REST_Y - crouch * e,
      orbitX,
      orbitZ + 0.08 * boopSwap,
      (0.26 * isChaser - 0.12 * (1 - isChaser)) * e,
      -0.24 * c1 * e,
      0.12 * s1 * e,
      (0.18 * isChaser - 0.10 * (1 - isChaser)) * e,
      -0.16 * c1 * e,
      0.08 * s1 * e,
      (0.20 * isChaser - 0.14 * (1 - isChaser) - 0.10 * boopSwap) * e,
      -0.20 * c1 * e,
      -0.08 * s1 * e,
      1 + 0.06 * (boopSwap + ctx.beatPulse * e),
      (-0.14 * isChaser + 0.12 * (1 - isChaser)) * e,
      0.16 * c1 * e,
      0,
      (-0.16 * isChaser + 0.14 * (1 - isChaser) + 0.12 * boopSwap) * e,
      0.20 * c1 * e,
      -0.12 * s1 * e
    );

    setArms(
      t,
      (-1.15 * isChaser - 1.55 * (1 - isChaser) - 0.20 * s1 - 0.35 * boopSwap) * e,
      (-0.20 * isChaser + 0.35 * (1 - isChaser) - 0.25 * boopSwap) * e,
      (0.28 * isChaser + 0.45 * (1 - isChaser) - 0.18 * boopSwap) * e,
      (-0.95 * isChaser - 1.45 * (1 - isChaser) + 0.55 * boopSwap) * e,
      0.30 * isChaser * e,
      (0.45 * isChaser * s1 + 0.40 * boopSwap) * e,
      0.20 * e,
      (-1.15 * isChaser - 1.55 * (1 - isChaser) + 0.20 * s1 - 0.30 * boopSwap) * e,
      (0.20 * isChaser - 0.35 * (1 - isChaser) + 0.25 * boopSwap) * e,
      (-0.28 * isChaser - 0.45 * (1 - isChaser) + 0.18 * boopSwap) * e,
      (-0.95 * isChaser - 1.45 * (1 - isChaser) + 0.45 * boopSwap) * e,
      -0.30 * isChaser * e,
      (-0.45 * isChaser * s1 + 0.35 * boopSwap) * e,
      -0.20 * e
    );

    const liftL = Math.max(0, s1) * 0.20 * e;
    const liftR = Math.max(0, -s1) * 0.20 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.32 * s1 * e,
      -0.32 * s1 * e,
      -0.12 * c1 * e,
      -0.12 * c1 * e,
      0.22 * isChaser * e,
      -0.22 * isChaser * e,
      (0.32 * isChaser + 0.14 * (1 - isChaser)) * e,
      (0.32 * isChaser + 0.14 * (1 - isChaser)) * e,
      0.24 * liftL,
      0.24 * liftR
    );
  },
};

/**
 * 27. DUET_COMEDY_TALL_AND_SMALL
 * Choreography Note: Extreme Species-Scale Slapstick Contrast!
 * Partner A (the "Big Dog" role) towers upright in a wide colossus straddle
 * (`legStepRoll` wide, looking down between their own knees), while Partner B
 * (the "Tiny Mouse" role) crouches to `pelvisY = 0.48` weaving side-to-side
 * underneath, popping up on Beat 4 for a low-altitude double paw-five!
 */
const DUET_COMEDY_TALL_AND_SMALL: DuetMove = {
  id: 'DUET_COMEDY_TALL_AND_SMALL',
  name: 'Tall & Small — Colossus Straddle & Under-Bridge Weave',
  origin: 'Vaudeville & Circus Acrobatic Size-Contrast Slapstick',
  facing: 'EACH_OTHER',
  anchorDistance: 0.82,
  energy: 0.84,
  tempoFit: [92, 140],
  durationBars: 4,
  tags: ['comedy', 'floor', 'jump', 'contact', 'isolation'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 4 (barBeat 3.0) Partner A crouches low to meet Partner B's upward jump-five!
    const lowFive = strikeWindow(barBeat, 3.0, 2.4) * e;
    const weaveLook = Math.sin(ctx.halfP) * (1 - lowFive);
    const s1 = Math.sin(ctx.p);

    // A towers tall (pelvisY = 0.90 + rootY lift) during beats 1..3, then crouches to 0.56 on Beat 4 so Mouse can reach!
    setBody(
      t,
      0.03 * (1 - lowFive) * Math.abs(s1) * e,
      PELVIS_REST_Y - 0.34 * lowFive * e,
      0.06 * weaveLook * e,
      0.08 * lowFive,
      (0.28 * (1 - lowFive) + 0.32 * lowFive) * e, // Tilted forward peering down at small partner
      0.20 * weaveLook * e,
      -0.10 * weaveLook * e,
      0.20 * e,
      0.14 * weaveLook * e,
      0,
      0.22 * e,
      0.16 * weaveLook * e,
      0,
      1 + 0.05 * lowFive,
      0.24 * e, // Neck pitched sharply down to watch partner weaving below
      -0.25 * weaveLook * e,
      0,
      0.28 * e,
      -0.30 * weaveLook * e,
      0.14 * weaveLook * e
    );

    // Hands on hips while towering and looking down; low extended double-palm target on lowFive
    setArms(
      t,
      (-0.45 * (1 - lowFive) - 0.72 * lowFive) * e,
      (-0.35 * (1 - lowFive) - 0.32 * lowFive) * e,
      (0.55 * (1 - lowFive) + 0.18 * lowFive) * e,
      (-1.35 * (1 - lowFive) - 0.55 * lowFive) * e,
      0.25 * e,
      0.35 * lowFive,
      0.20 * e,
      (-0.45 * (1 - lowFive) - 0.72 * lowFive) * e,
      (0.35 * (1 - lowFive) + 0.32 * lowFive) * e,
      (-0.55 * (1 - lowFive) - 0.18 * lowFive) * e,
      (-1.35 * (1 - lowFive) - 0.55 * lowFive) * e,
      -0.25 * e,
      0.35 * lowFive,
      -0.20 * e
    );

    // Wide colossus straddle (legStepRoll +/- 0.28, hipYaw +/- 0.32)
    setLegs(
      t,
      0.08 * Math.max(0, s1) * (1 - lowFive) * e,
      0.08 * Math.max(0, -s1) * (1 - lowFive) * e,
      0.06 * e,
      0.06 * e,
      0.28 * e,
      -0.28 * e,
      0.32 * e,
      -0.32 * e,
      0.36 * lowFive + 0.06 * e,
      0.36 * lowFive + 0.06 * e,
      0.18 * lowFive,
      0.18 * lowFive
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 4 (barBeat 3.0) Partner B springs up from deep duck-walk to slap A's lowered palms!
    const lowFive = strikeWindow(barBeat, 3.0, 2.4) * e;
    const weaveX = Math.sin(ctx.halfP) * (1 - lowFive);
    const s1 = Math.sin(ctx.p);

    // B ducks ultra-low (pelvisY = 0.48, strictly >= 0.45) weaving left-right, then hops to rootY = 0.14 on lowFive!
    setBody(
      t,
      0.14 * lowFive + 0.03 * (1 - lowFive) * Math.abs(s1) * e,
      PELVIS_REST_Y - (0.42 * (1 - lowFive) + 0.04 * lowFive) * e,
      0.24 * weaveX * e,
      (0.12 * Math.cos(ctx.halfP) * (1 - lowFive) + 0.08 * lowFive) * e,
      (0.24 * (1 - lowFive) - 0.10 * lowFive) * e,
      -0.26 * weaveX * e,
      0.14 * weaveX * e,
      0.16 * (1 - lowFive) * e,
      -0.18 * weaveX * e,
      0,
      (0.18 * (1 - lowFive) - 0.14 * lowFive) * e,
      -0.20 * weaveX * e,
      0,
      1 + 0.06 * lowFive,
      -0.22 * e, // Looking up at towering Partner A!
      0.20 * weaveX * e,
      0,
      -0.26 * e,
      0.24 * weaveX * e,
      -0.12 * weaveX * e
    );

    // Sneaky low paddle-paws during weave; high overhead reach on lowFive to meet A's lowered hands!
    setArms(
      t,
      (-0.85 * (1 - lowFive) - 1.75 * lowFive) * e,
      (0.25 * weaveX - 0.28 * lowFive) * e,
      (0.38 * (1 - lowFive) + 0.18 * lowFive) * e,
      (-1.25 * (1 - lowFive) - 0.35 * lowFive) * e,
      0.25 * e,
      0.40 * lowFive + 0.25 * s1 * (1 - lowFive) * e,
      0.15 * e,
      (-0.85 * (1 - lowFive) - 1.75 * lowFive) * e,
      (0.25 * weaveX + 0.28 * lowFive) * e,
      (-0.38 * (1 - lowFive) - 0.18 * lowFive) * e,
      (-1.25 * (1 - lowFive) - 0.35 * lowFive) * e,
      -0.25 * e,
      0.40 * lowFive - 0.25 * s1 * (1 - lowFive) * e,
      -0.15 * e
    );

    const liftL = (0.18 * lowFive + 0.16 * (1 - lowFive) * Math.max(0, s1)) * e;
    const liftR = (0.18 * lowFive + 0.16 * (1 - lowFive) * Math.max(0, -s1)) * e;
    setLegs(
      t,
      clamp(liftL, 0, 0.22),
      clamp(liftR, 0, 0.22),
      0.24 * s1 * (1 - lowFive) * e,
      -0.24 * s1 * (1 - lowFive) * e,
      0.16 * weaveX * e,
      0.16 * weaveX * e,
      0.28 * e,
      -0.28 * e,
      0.42 * (1 - lowFive) * e,
      0.42 * (1 - lowFive) * e,
      0.26 * e,
      0.26 * e
    );
  },
};

/**
 * 28. DUET_COMEDY_COPYCAT_CANON
 * Choreography Note: The Copycat Mockery Canon!
 * Beats 1..2: Partner A performs a flashy groove while Partner B shamelessly
 * mimes A exactly 1 beat behind (`ctx.p - HALF_PI`); on Beat 3: A stops dead,
 * hands on hips, glaring sideways at B while B accidentally keeps dancing;
 * on Beat 4 (Contact!): playful mutual chest-shove / shoulder-bump reset!
 */
const DUET_COMEDY_COPYCAT_CANON: DuetMove = {
  id: 'DUET_COMEDY_COPYCAT_CANON',
  name: 'Copycat Canon — One-Beat Mime & Offended Double-Take',
  origin: 'Silent-Film & Cartoon Mirror-Gag Comedy',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 1.05,
  energy: 0.78,
  tempoFit: [94, 138],
  durationBars: 4,
  tags: ['comedy', 'isolation', 'pose', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Beat 3 (barBeat 2.0..2.9): A freezes in offended "excuse me?!" hands-on-hips glare
    const offendedGlare = strikeWindow(barBeat, 2.2, 2.0) * e;
    // CONTACT: Beat 4 (barBeat 3.25) playful side-by-side shoulder-bump / nudge
    const nudgeBump = strikeWindow(barBeat, 3.25, 2.6) * e;
    const danceActive = clamp(1 - offendedGlare - nudgeBump, 0, 1) * e;
    const s1 = Math.sin(ctx.p);
    const c1 = Math.cos(ctx.p);

    setBody(
      t,
      0.04 * danceActive * Math.abs(s1),
      PELVIS_REST_Y - (0.08 * danceActive + 0.04 * offendedGlare + 0.08 * nudgeBump),
      0.14 * s1 * danceActive + 0.16 * nudgeBump,
      0,
      -0.06 * offendedGlare,
      0.20 * c1 * danceActive - 0.25 * offendedGlare,
      -0.12 * s1 * danceActive + 0.14 * nudgeBump,
      -0.05 * offendedGlare,
      0.16 * c1 * danceActive - 0.20 * offendedGlare,
      0.10 * nudgeBump,
      -0.08 * offendedGlare,
      0.20 * c1 * danceActive - 0.24 * offendedGlare,
      0.12 * nudgeBump,
      1 + 0.05 * nudgeBump,
      -0.06 * offendedGlare,
      0.38 * offendedGlare + 0.20 * nudgeBump, // Glaring right at Partner B!
      -0.12 * offendedGlare,
      -0.08 * offendedGlare,
      0.42 * offendedGlare + 0.24 * nudgeBump,
      -0.14 * offendedGlare
    );

    // Flashy disco waves during danceActive; hands locked on hips during offendedGlare; inner-arm nudge on nudgeBump
    setArms(
      t,
      (-1.55 + 0.45 * s1) * danceActive - 0.45 * offendedGlare - 0.75 * nudgeBump,
      0.25 * c1 * danceActive - 0.38 * offendedGlare,
      0.45 * danceActive + 0.52 * offendedGlare + 0.25 * nudgeBump,
      -0.85 * danceActive - 1.38 * offendedGlare - 1.05 * nudgeBump,
      0.20 * e,
      0.30 * s1 * danceActive,
      0.15 * e,
      (-1.55 - 0.45 * s1) * danceActive - 0.45 * offendedGlare - 1.05 * nudgeBump,
      -0.25 * c1 * danceActive + 0.38 * offendedGlare - 0.42 * nudgeBump,
      -0.45 * danceActive - 0.52 * offendedGlare - 0.62 * nudgeBump,
      -0.85 * danceActive - 1.38 * offendedGlare - 0.55 * nudgeBump,
      -0.20 * e,
      -0.30 * s1 * danceActive + 0.35 * nudgeBump,
      -0.15 * e
    );

    const liftL = Math.max(0, s1) * 0.16 * danceActive;
    const liftR = Math.max(0, -s1) * 0.16 * danceActive + 0.08 * offendedGlare;
    setLegs(
      t,
      liftL,
      liftR,
      0.20 * s1 * danceActive,
      -0.20 * s1 * danceActive,
      0.12 * c1 * danceActive - 0.14 * nudgeBump,
      0.12 * c1 * danceActive - 0.14 * nudgeBump,
      0.22 * e,
      -0.22 * e,
      0.16 * danceActive,
      0.16 * danceActive + 0.18 * offendedGlare,
      0.20 * liftL,
      0.25 * offendedGlare
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // Partner B dances 1 beat behind A (so B is STILL dancing on Beat 3 while A glares at them!)
    // CONTACT: Beat 4 (barBeat 3.25) playful side-by-side shoulder-bump / nudge
    const nudgeBump = strikeWindow(barBeat, 3.25, 2.6) * e;
    const oopsFreeze = strikeWindow(barBeat, 2.8, 2.6) * e;
    const danceActive = clamp(1 - nudgeBump - oopsFreeze * 0.6, 0, 1) * e;
    // 1-beat phase lag (ctx.p - HALF_PI)
    const sLag = Math.sin(ctx.p - HALF_PI);
    const cLag = Math.cos(ctx.p - HALF_PI);

    setBody(
      t,
      0.04 * danceActive * Math.abs(sLag),
      PELVIS_REST_Y - (0.09 * danceActive + 0.12 * oopsFreeze + 0.08 * nudgeBump),
      0.14 * sLag * danceActive - 0.16 * nudgeBump,
      0,
      0.08 * oopsFreeze,
      0.20 * cLag * danceActive + 0.22 * oopsFreeze,
      -0.12 * sLag * danceActive - 0.14 * nudgeBump,
      0.06 * oopsFreeze,
      0.16 * cLag * danceActive + 0.16 * oopsFreeze,
      -0.10 * nudgeBump,
      0.08 * oopsFreeze,
      0.20 * cLag * danceActive + 0.20 * oopsFreeze,
      -0.12 * nudgeBump,
      1 + 0.05 * nudgeBump,
      0.08 * oopsFreeze,
      -0.36 * oopsFreeze - 0.20 * nudgeBump, // Sheepish look left at glaring Partner A!
      0.10 * oopsFreeze,
      0.10 * oopsFreeze,
      -0.40 * oopsFreeze - 0.24 * nudgeBump,
      0.12 * oopsFreeze
    );

    setArms(
      t,
      (-1.55 + 0.45 * sLag) * danceActive - 1.35 * oopsFreeze - 1.05 * nudgeBump,
      0.25 * cLag * danceActive - 0.35 * oopsFreeze + 0.42 * nudgeBump,
      0.45 * danceActive + 0.20 * oopsFreeze + 0.62 * nudgeBump,
      -0.85 * danceActive - 1.45 * oopsFreeze - 0.55 * nudgeBump,
      0.20 * e,
      0.30 * sLag * danceActive + 0.35 * nudgeBump,
      0.15 * e,
      (-1.55 - 0.45 * sLag) * danceActive - 1.35 * oopsFreeze - 0.75 * nudgeBump,
      -0.25 * cLag * danceActive + 0.35 * oopsFreeze,
      -0.45 * danceActive - 0.20 * oopsFreeze - 0.25 * nudgeBump,
      -0.85 * danceActive - 1.45 * oopsFreeze - 1.05 * nudgeBump,
      -0.20 * e,
      -0.30 * sLag * danceActive,
      -0.15 * e
    );

    const liftL = Math.max(0, sLag) * 0.16 * danceActive;
    const liftR = Math.max(0, -sLag) * 0.16 * danceActive;
    setLegs(
      t,
      liftL,
      liftR,
      0.20 * sLag * danceActive,
      -0.20 * sLag * danceActive,
      0.12 * cLag * danceActive + 0.14 * nudgeBump,
      0.12 * cLag * danceActive + 0.14 * nudgeBump,
      0.22 * e,
      -0.22 * e,
      0.16 * danceActive + 0.16 * oopsFreeze,
      0.16 * danceActive + 0.16 * oopsFreeze,
      0.20 * liftL,
      0.20 * liftR
    );
  },
};

/**
 * 29. DUET_COMEDY_TUG_OF_WAR
 * Choreography Note: Mime Rope Tug-of-War & Recoil Boing!
 * Beats 1..3: Both dancers grip an invisible heavy rope in front of their chests,
 * heaving backward in alternating rhythmic tugs (`halfP`); on Beat 4 (Contact!):
 * the invisible rope "snaps" and both tumble forward into a startled nose-to-nose
 * palm-catch!
 */
const DUET_COMEDY_TUG_OF_WAR: DuetMove = {
  id: 'DUET_COMEDY_TUG_OF_WAR',
  name: 'Tug-of-War Groove — Rope Heave & Snap-Forward Catch',
  origin: 'Marcel Marceau Mime & Street-Locking Rope Illusion',
  facing: 'EACH_OTHER',
  anchorDistance: 1.25,
  energy: 0.84,
  tempoFit: [92, 140],
  durationBars: 4,
  tags: ['comedy', 'arms', 'contact', 'groove', 'pose'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 4 (barBeat 3.15) rope snaps and both lunge forward into a dual-palm catch!
    const snapCatch = strikeWindow(barBeat, 3.15, 2.3) * e;
    const tugPhase = (1 - snapCatch) * e;
    // A pulls back hard when sHalf > 0, gets pulled forward when sHalf < 0
    const sHalf = Math.sin(ctx.halfP);
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.03 * snapCatch,
      PELVIS_REST_Y - (0.14 * tugPhase + 0.18 * snapCatch),
      0.06 * s1 * tugPhase,
      (-0.14 * sHalf * tugPhase + 0.16 * snapCatch),
      (-0.24 * sHalf * tugPhase + 0.24 * snapCatch),
      0.16 * s1 * tugPhase,
      -0.08 * s1 * tugPhase,
      (-0.18 * sHalf * tugPhase + 0.16 * snapCatch),
      0.12 * s1 * tugPhase,
      0,
      (-0.20 * sHalf * tugPhase + 0.18 * snapCatch),
      0.14 * s1 * tugPhase,
      0,
      1 + 0.05 * (Math.abs(sHalf) * tugPhase + snapCatch),
      (0.14 * sHalf * tugPhase - 0.12 * snapCatch),
      -0.10 * s1 * tugPhase,
      0,
      (0.16 * sHalf * tugPhase - 0.14 * snapCatch),
      -0.12 * s1 * tugPhase,
      0.08 * snapCatch
    );

    // Both hands grip the center line rope during tugPhase; shoot forward to palm-catch on snapCatch
    const pullArm = -0.95 + 0.25 * sHalf;
    setArms(
      t,
      pullArm * tugPhase - 1.25 * snapCatch,
      -0.28 * tugPhase - 0.30 * snapCatch,
      0.16 * tugPhase + 0.18 * snapCatch,
      (-1.15 - 0.25 * sHalf) * tugPhase - 0.40 * snapCatch,
      0.25 * e,
      0.30 * tugPhase + 0.45 * snapCatch,
      0.18 * e,
      (pullArm - 0.12) * tugPhase - 1.25 * snapCatch,
      0.28 * tugPhase + 0.30 * snapCatch,
      -0.16 * tugPhase - 0.18 * snapCatch,
      (-1.05 - 0.25 * sHalf) * tugPhase - 0.40 * snapCatch,
      -0.25 * e,
      0.30 * tugPhase + 0.45 * snapCatch,
      -0.18 * e
    );

    const liftL = Math.max(0, s1) * 0.14 * tugPhase;
    const liftR = Math.max(0, -s1) * 0.14 * tugPhase;
    setLegs(
      t,
      liftL,
      liftR,
      0.28 * tugPhase + 0.26 * snapCatch,
      -0.28 * tugPhase - 0.22 * snapCatch,
      0.10 * e,
      -0.10 * e,
      0.20 * e,
      -0.20 * e,
      0.24 * tugPhase + 0.28 * snapCatch,
      0.24 * tugPhase + 0.20 * snapCatch,
      0.22 * tugPhase,
      0.18 * snapCatch
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beat 4 (barBeat 3.15) rope snaps and both lunge forward into a dual-palm catch!
    const snapCatch = strikeWindow(barBeat, 3.15, 2.3) * e;
    const tugPhase = (1 - snapCatch) * e;
    // When A pulls back (sHalf > 0), B gets yanked forward (-sHalf), and vice-versa!
    const sHalf = -Math.sin(ctx.halfP);
    const s1 = Math.sin(ctx.p + PI);

    setBody(
      t,
      0.03 * snapCatch,
      PELVIS_REST_Y - (0.15 * tugPhase + 0.18 * snapCatch),
      0.06 * s1 * tugPhase,
      (-0.14 * sHalf * tugPhase + 0.16 * snapCatch),
      (-0.24 * sHalf * tugPhase + 0.24 * snapCatch),
      0.16 * s1 * tugPhase,
      -0.08 * s1 * tugPhase,
      (-0.18 * sHalf * tugPhase + 0.16 * snapCatch),
      0.12 * s1 * tugPhase,
      0,
      (-0.20 * sHalf * tugPhase + 0.18 * snapCatch),
      0.14 * s1 * tugPhase,
      0,
      1 + 0.05 * (Math.abs(sHalf) * tugPhase + snapCatch),
      (0.14 * sHalf * tugPhase - 0.12 * snapCatch),
      -0.10 * s1 * tugPhase,
      0,
      (0.16 * sHalf * tugPhase - 0.14 * snapCatch),
      -0.12 * s1 * tugPhase,
      -0.08 * snapCatch
    );

    const pullArm = -0.95 + 0.25 * sHalf;
    setArms(
      t,
      pullArm * tugPhase - 1.25 * snapCatch,
      -0.28 * tugPhase - 0.30 * snapCatch,
      0.16 * tugPhase + 0.18 * snapCatch,
      (-1.15 - 0.25 * sHalf) * tugPhase - 0.40 * snapCatch,
      0.25 * e,
      0.30 * tugPhase + 0.45 * snapCatch,
      0.18 * e,
      (pullArm - 0.12) * tugPhase - 1.25 * snapCatch,
      0.28 * tugPhase + 0.30 * snapCatch,
      -0.16 * tugPhase - 0.18 * snapCatch,
      (-1.05 - 0.25 * sHalf) * tugPhase - 0.40 * snapCatch,
      -0.25 * e,
      0.30 * tugPhase + 0.45 * snapCatch,
      -0.18 * e
    );

    const liftL = Math.max(0, s1) * 0.14 * tugPhase;
    const liftR = Math.max(0, -s1) * 0.14 * tugPhase;
    setLegs(
      t,
      liftL,
      liftR,
      0.28 * tugPhase + 0.26 * snapCatch,
      -0.28 * tugPhase - 0.22 * snapCatch,
      0.10 * e,
      -0.10 * e,
      0.20 * e,
      -0.20 * e,
      0.24 * tugPhase + 0.28 * snapCatch,
      0.24 * tugPhase + 0.20 * snapCatch,
      0.22 * tugPhase,
      0.18 * snapCatch
    );
  },
};

/**
 * 30. DUET_COMEDY_DOUBLE_TAKE
 * Choreography Note: Cartoon Double-Take & Visor-Adjust Dap!
 * Beat 1: Both strut in looking coolly away from each other; Beat 2: Synchronized
 * cartoon "Double-Take" head-whip toward each other (`neckY` + `headY` snap);
 * Beat 3: Synchronized LED visor-tap with outer hand; Beat 4 (Contact!): Smooth
 * no-look inner-hand low-five dap while looking straight into the camera!
 */
const DUET_COMEDY_DOUBLE_TAKE: DuetMove = {
  id: 'DUET_COMEDY_DOUBLE_TAKE',
  name: 'Cartoon Double-Take — Head-Whip & No-Look Visor Dap',
  origin: 'Tex Avery Double-Take & Hip-Hop No-Look Handshake',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 1.12,
  energy: 0.74,
  tempoFit: [88, 135],
  durationBars: 4,
  tags: ['comedy', 'pose', 'isolation', 'contact', 'groove'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const lookAway = strikeWindow(barBeat, 0.25, 2.2) * e;
    const doubleTake = strikeWindow(barBeat, 1.25, 2.6) * e;
    const visorAdjust = strikeWindow(barBeat, 2.15, 2.4) * e;
    // CONTACT: Beat 4 (barBeat 3.15) no-look low inner-hand dap while facing camera
    const noLookDap = strikeWindow(barBeat, 3.15, 2.5) * e;
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.03 * doubleTake,
      PELVIS_REST_Y - (0.06 + 0.08 * doubleTake + 0.06 * noLookDap) * e,
      (-0.10 * doubleTake + 0.08 * noLookDap) * e,
      0.04 * doubleTake,
      (-0.12 * doubleTake - 0.06 * noLookDap) * e,
      (0.18 * lookAway - 0.24 * doubleTake) * e,
      0.10 * doubleTake,
      -0.08 * doubleTake,
      0.12 * lookAway - 0.18 * doubleTake,
      0,
      (-0.14 * doubleTake - 0.08 * noLookDap) * e,
      0.14 * lookAway - 0.22 * doubleTake,
      0,
      1 + 0.06 * (doubleTake + noLookDap),
      -0.10 * doubleTake,
      (-0.32 * lookAway + 0.44 * doubleTake) * e, // Whip neck from outer to inner!
      -0.12 * doubleTake,
      (-0.12 * doubleTake + 0.08 * visorAdjust) * e,
      (-0.36 * lookAway + 0.48 * doubleTake) * e,
      0.14 * visorAdjust
    );

    // Outer (Left) hand salutes/adjusts LED visor on visorAdjust; Inner (Right) hand shoots sideways for noLookDap
    setArms(
      t,
      (-0.65 - 1.15 * visorAdjust - 0.45 * doubleTake) * e,
      (-0.42 * visorAdjust + 0.20 * doubleTake) * e,
      (0.32 + 0.25 * doubleTake - 0.15 * visorAdjust) * e,
      (-0.95 - 0.85 * visorAdjust - 0.35 * doubleTake) * e,
      0.35 * visorAdjust,
      0.30 * visorAdjust,
      0.15 * e,
      (-0.65 - 0.35 * noLookDap - 0.45 * doubleTake) * e,
      (-0.38 * noLookDap - 0.20 * doubleTake) * e,
      (-0.32 - 0.48 * noLookDap - 0.25 * doubleTake) * e,
      (-0.95 + 0.55 * noLookDap - 0.35 * doubleTake) * e,
      -0.25 * noLookDap,
      0.38 * noLookDap,
      -0.20 * noLookDap
    );

    setLegs(
      t,
      0.06 * Math.max(0, s1) * e + 0.08 * doubleTake,
      0.06 * Math.max(0, -s1) * e,
      0.10 * s1 * e,
      -0.10 * s1 * e,
      0.12 * doubleTake,
      0.12 * doubleTake,
      0.22 * e,
      -0.22 * e,
      0.16 * (doubleTake + noLookDap) + 0.08 * e,
      0.16 * (doubleTake + noLookDap) + 0.08 * e,
      0.18 * doubleTake,
      0.12 * noLookDap
    );
    addSquash(t, 0.07 * doubleTake);
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    const lookAway = strikeWindow(barBeat, 0.25, 2.2) * e;
    const doubleTake = strikeWindow(barBeat, 1.25, 2.6) * e;
    const visorAdjust = strikeWindow(barBeat, 2.15, 2.4) * e;
    // CONTACT: Beat 4 (barBeat 3.15) no-look low inner-hand dap (B's Left meets A's Right)
    const noLookDap = strikeWindow(barBeat, 3.15, 2.5) * e;
    const s1 = Math.sin(ctx.p);

    setBody(
      t,
      0.03 * doubleTake,
      PELVIS_REST_Y - (0.07 + 0.08 * doubleTake + 0.06 * noLookDap) * e,
      (0.10 * doubleTake - 0.08 * noLookDap) * e,
      0.04 * doubleTake,
      (-0.12 * doubleTake - 0.06 * noLookDap) * e,
      (-0.18 * lookAway + 0.24 * doubleTake) * e,
      -0.10 * doubleTake,
      -0.08 * doubleTake,
      -0.12 * lookAway + 0.18 * doubleTake,
      0,
      (-0.14 * doubleTake - 0.08 * noLookDap) * e,
      -0.14 * lookAway + 0.22 * doubleTake,
      0,
      1 + 0.06 * (doubleTake + noLookDap),
      -0.10 * doubleTake,
      (0.32 * lookAway - 0.44 * doubleTake) * e,
      0.12 * doubleTake,
      (-0.12 * doubleTake + 0.08 * visorAdjust) * e,
      (0.36 * lookAway - 0.48 * doubleTake) * e,
      -0.14 * visorAdjust
    );

    setArms(
      t,
      (-0.65 - 0.35 * noLookDap - 0.45 * doubleTake) * e,
      (0.38 * noLookDap + 0.20 * doubleTake) * e,
      (0.32 + 0.48 * noLookDap + 0.25 * doubleTake) * e,
      (-0.95 + 0.55 * noLookDap - 0.35 * doubleTake) * e,
      0.25 * noLookDap,
      0.38 * noLookDap,
      0.20 * noLookDap,
      (-0.65 - 1.15 * visorAdjust - 0.45 * doubleTake) * e,
      (0.42 * visorAdjust - 0.20 * doubleTake) * e,
      (-0.32 - 0.25 * doubleTake + 0.15 * visorAdjust) * e,
      (-0.95 - 0.85 * visorAdjust - 0.35 * doubleTake) * e,
      -0.35 * visorAdjust,
      0.30 * visorAdjust,
      -0.15 * e
    );

    setLegs(
      t,
      0.06 * Math.max(0, -s1) * e,
      0.06 * Math.max(0, s1) * e + 0.08 * doubleTake,
      -0.10 * s1 * e,
      0.10 * s1 * e,
      -0.12 * doubleTake,
      -0.12 * doubleTake,
      0.22 * e,
      -0.22 * e,
      0.16 * (doubleTake + noLookDap) + 0.08 * e,
      0.16 * (doubleTake + noLookDap) + 0.08 * e,
      0.12 * noLookDap,
      0.18 * doubleTake
    );
    addSquash(t, 0.07 * doubleTake);
  },
};

/**
 * 31. DUET_COMEDY_PATTY_CAKE_TURBO
 * Choreography Note: Slapstick Turbo Patty-Cake Frenzy!
 * Starts with classic knee-slap -> own-clap -> right-cross -> left-cross -> both-palms
 * patty-cake across Beats 1..3, accelerating into a frantic double-time blur on Beat 3
 * and a celebratory synchronized jump-spin on Beat 4!
 */
const DUET_COMEDY_PATTY_CAKE_TURBO: DuetMove = {
  id: 'DUET_COMEDY_PATTY_CAKE_TURBO',
  name: 'Turbo Patty-Cake — Playground Slap-Frenzy & Jump Spin',
  origin: 'Playground Hand-Clap Games & Cartoon Slapstick',
  facing: 'EACH_OTHER',
  anchorDistance: 0.92,
  energy: 0.90,
  tempoFit: [100, 156],
  durationBars: 4,
  tags: ['comedy', 'arms', 'contact', 'spin', 'jump'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    if (ctx.isBeat && barBeatInt === 3) {
      ctx.requestSpin(TAU);
    }
    // CONTACT:
    // Beat 1.0 (barBeat 0.8): Right-to-Right cross slap
    // Beat 1.7 (barBeat 1.5): Left-to-Left cross slap
    // Beat 2.5 (barBeat 2.4): Turbo 4x rapid double-palm patty-cake flurry!
    const kneeSlap = strikeWindow(barBeat, 0.15, 2.8) * e;
    const rCross = strikeWindow(barBeat, 0.85, 2.8) * e;
    const lCross = strikeWindow(barBeat, 1.55, 2.8) * e;
    const turboFlurry = strikeWindow(barBeat, 2.45, 1.9) * e;
    const fastOsc = Math.sin(ctx.p * 4);

    setBody(
      t,
      0.04 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.08 + 0.20 * kneeSlap + 0.06 * turboFlurry) * e,
      0.08 * fastOsc * turboFlurry,
      0.09 * (rCross + lCross + turboFlurry),
      (0.28 * kneeSlap + 0.08 * turboFlurry) * e,
      (0.22 * rCross - 0.22 * lCross + 0.14 * fastOsc * turboFlurry) * e,
      0,
      0.18 * kneeSlap,
      0.16 * (rCross - lCross),
      0,
      0.20 * kneeSlap + 0.08 * turboFlurry,
      0.20 * (rCross - lCross),
      0,
      1 + 0.06 * (rCross + lCross + turboFlurry),
      0.14 * kneeSlap,
      -0.12 * (rCross - lCross),
      0,
      0.16 * kneeSlap - 0.06 * turboFlurry,
      -0.14 * (rCross - lCross),
      0.10 * fastOsc * turboFlurry
    );

    setArms(
      t,
      (-0.55 * kneeSlap - 1.15 * lCross - (1.20 + 0.25 * fastOsc) * turboFlurry - 0.80 * (1 - kneeSlap - lCross - turboFlurry)) * e,
      (-0.35 * lCross - 0.28 * turboFlurry) * e,
      (0.22 - 0.16 * (lCross + turboFlurry)) * e,
      (-0.45 * kneeSlap - 0.55 * (lCross + turboFlurry) - 1.15 * (1 - kneeSlap - lCross - turboFlurry)) * e,
      0.25 * lCross,
      0.40 * (lCross + turboFlurry),
      0.15 * e,
      (-0.55 * kneeSlap - 1.15 * rCross - (1.20 - 0.25 * fastOsc) * turboFlurry - 0.80 * (1 - kneeSlap - rCross - turboFlurry)) * e,
      (0.35 * rCross + 0.28 * turboFlurry) * e,
      (-0.22 + 0.16 * (rCross + turboFlurry)) * e,
      (-0.45 * kneeSlap - 0.55 * (rCross + turboFlurry) - 1.15 * (1 - kneeSlap - rCross - turboFlurry)) * e,
      -0.25 * rCross,
      0.40 * (rCross + turboFlurry),
      -0.15 * e
    );

    const s1 = Math.sin(ctx.p);
    const liftL = Math.max(0, s1) * 0.15 * e;
    const liftR = Math.max(0, -s1) * 0.15 * e;
    setLegs(
      t,
      liftL,
      liftR,
      0.14 * s1 * e,
      -0.14 * s1 * e,
      0.08 * e,
      -0.08 * e,
      0.24 * e,
      -0.24 * e,
      (0.14 + 0.26 * kneeSlap) * e,
      (0.14 + 0.26 * kneeSlap) * e,
      0.20 * liftL,
      0.20 * liftR
    );
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeatInt = ctx.moveBeat % 4;
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    if (ctx.isBeat && barBeatInt === 3) {
      ctx.requestSpin(-TAU);
    }
    // CONTACT: Matches A's exact R-cross (0.85), L-cross (1.55), and Turbo Flurry (2.45)!
    const kneeSlap = strikeWindow(barBeat, 0.15, 2.8) * e;
    const rCross = strikeWindow(barBeat, 0.85, 2.8) * e;
    const lCross = strikeWindow(barBeat, 1.55, 2.8) * e;
    const turboFlurry = strikeWindow(barBeat, 2.45, 1.9) * e;
    const fastOsc = Math.sin(ctx.p * 4);

    setBody(
      t,
      0.04 * ctx.beatPulse * e,
      PELVIS_REST_Y - (0.10 + 0.18 * kneeSlap + 0.06 * turboFlurry) * e,
      -0.08 * fastOsc * turboFlurry,
      0.09 * (rCross + lCross + turboFlurry),
      (0.28 * kneeSlap + 0.08 * turboFlurry) * e,
      (0.22 * rCross - 0.22 * lCross - 0.14 * fastOsc * turboFlurry) * e,
      0,
      0.18 * kneeSlap,
      0.16 * (rCross - lCross),
      0,
      0.20 * kneeSlap + 0.08 * turboFlurry,
      0.20 * (rCross - lCross),
      0,
      1 + 0.06 * (rCross + lCross + turboFlurry),
      0.14 * kneeSlap,
      -0.12 * (rCross - lCross),
      0,
      0.16 * kneeSlap - 0.06 * turboFlurry,
      -0.14 * (rCross - lCross),
      -0.10 * fastOsc * turboFlurry
    );

    setArms(
      t,
      (-0.55 * kneeSlap - 1.18 * lCross - (1.22 + 0.25 * fastOsc) * turboFlurry - 0.82 * (1 - kneeSlap - lCross - turboFlurry)) * e,
      (-0.35 * lCross - 0.28 * turboFlurry) * e,
      (0.22 - 0.16 * (lCross + turboFlurry)) * e,
      (-0.45 * kneeSlap - 0.55 * (lCross + turboFlurry) - 1.15 * (1 - kneeSlap - lCross - turboFlurry)) * e,
      0.25 * lCross,
      0.40 * (lCross + turboFlurry),
      0.15 * e,
      (-0.55 * kneeSlap - 1.18 * rCross - (1.22 - 0.25 * fastOsc) * turboFlurry - 0.82 * (1 - kneeSlap - rCross - turboFlurry)) * e,
      (0.35 * rCross + 0.28 * turboFlurry) * e,
      (-0.22 + 0.16 * (rCross + turboFlurry)) * e,
      (-0.45 * kneeSlap - 0.55 * (rCross + turboFlurry) - 1.15 * (1 - kneeSlap - rCross - turboFlurry)) * e,
      -0.25 * rCross,
      0.40 * (rCross + turboFlurry),
      -0.15 * e
    );

    const s1 = Math.sin(ctx.p);
    const liftL = Math.max(0, -s1) * 0.15 * e;
    const liftR = Math.max(0, s1) * 0.15 * e;
    setLegs(
      t,
      liftL,
      liftR,
      -0.14 * s1 * e,
      0.14 * s1 * e,
      0.08 * e,
      -0.08 * e,
      0.24 * e,
      -0.24 * e,
      (0.15 + 0.26 * kneeSlap) * e,
      (0.15 + 0.26 * kneeSlap) * e,
      0.20 * liftL,
      0.20 * liftR
    );
  },
};

/**
 * 32. DUET_COMEDY_PILE_UP_FINALE
 * Choreography Note: Sentai / Cartoon Pyramid Pile-Up Finale!
 * Beats 1..2: Synchronized hype wind-up hops; Beats 3..4 (Contact!):
 * Partner A drops into a rock-solid wide Sentai base crouch (`pelvisY = 0.54`)
 * with arms spread in low Jazz-hands while Partner B leaps upward (`rootY = 0.20`)
 * leaning an elbow onto A's shoulder for a triumphant two-tier photo-finish!
 */
const DUET_COMEDY_PILE_UP_FINALE: DuetMove = {
  id: 'DUET_COMEDY_PILE_UP_FINALE',
  name: 'Cartoon Pile-Up — Two-Tier Sentai Pyramid Finale',
  origin: 'Super Sentai Team Pose & Mascot Slapstick Finale',
  facing: 'SIDE_BY_SIDE',
  anchorDistance: 0.80,
  energy: 0.94,
  tempoFit: [95, 150],
  durationBars: 4,
  tags: ['comedy', 'pose', 'jump', 'contact', 'floor'],
  poseA: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beats 2.2..3.8 (barBeat >= 2.0) Partner A forms the low pyramid base while B perches on A's right shoulder!
    const pyramidRaw = (strikeWindow(barBeat, 2.5, 1.5) + strikeWindow(barBeat, 3.3, 1.8)) * 0.78 * e;
    const pyramid = clamp(pyramidRaw, 0, 1);
    const windup = (1 - pyramid) * e;
    const s1 = Math.sin(ctx.p);

    // Base crouch strictly respects pelvisY >= 0.45 (rests at 0.54 during pyramid)
    setBody(
      t,
      0.04 * windup * Math.abs(s1),
      PELVIS_REST_Y - (0.36 * pyramid + 0.08 * windup),
      0.08 * pyramid,
      0.08 * pyramid,
      (0.22 * pyramid + 0.06 * windup),
      -0.14 * pyramid + 0.12 * s1 * windup,
      -0.08 * pyramid,
      0.14 * pyramid,
      -0.10 * pyramid,
      0,
      0.16 * pyramid,
      -0.12 * pyramid,
      0,
      1 + 0.06 * pyramid,
      -0.18 * pyramid, // Chin tilted up toward camera while body is low!
      0.14 * pyramid,
      0,
      -0.22 * pyramid,
      0.18 * pyramid,
      0.10 * pyramid
    );

    // Wide low jazz-hands heroic frame during pyramid
    setArms(
      t,
      -1.15 * pyramid - (0.85 + 0.25 * s1) * windup,
      0.30 * pyramid,
      0.65 * pyramid + 0.28 * windup,
      -0.45 * pyramid - 1.10 * windup,
      0.35 * pyramid,
      -0.30 * pyramid,
      0.25 * pyramid,
      -1.35 * pyramid - (0.85 - 0.25 * s1) * windup,
      -0.38 * pyramid,
      -0.55 * pyramid - 0.28 * windup,
      -0.75 * pyramid - 1.10 * windup,
      -0.35 * pyramid,
      0.30 * pyramid,
      -0.25 * pyramid
    );

    const liftL = Math.max(0, s1) * 0.16 * windup;
    const liftR = Math.max(0, -s1) * 0.16 * windup;
    setLegs(
      t,
      liftL,
      liftR,
      0.24 * pyramid + 0.16 * s1 * windup,
      -0.20 * pyramid - 0.16 * s1 * windup,
      0.24 * pyramid,
      -0.24 * pyramid,
      0.30 * e,
      -0.30 * e,
      0.40 * pyramid + 0.14 * windup,
      0.38 * pyramid + 0.14 * windup,
      0.20 * pyramid,
      0.24 * pyramid
    );
    addSquash(t, -0.05 * pyramid);
  },
  poseB: (t: JointTargets, ctx: MoveContext): void => {
    const e = env(ctx.moveProgress);
    const barBeat = (ctx.quarterP / HALF_PI) % 4;
    // CONTACT: Beats 2.2..3.8 Partner B vaults up (`rootY = 0.20`) and props left elbow on A's right shoulder!
    const pyramidRaw = (strikeWindow(barBeat, 2.5, 1.5) + strikeWindow(barBeat, 3.3, 1.8)) * 0.78 * e;
    const pyramid = clamp(pyramidRaw, 0, 1);
    const windup = (1 - pyramid) * e;
    const s1 = Math.sin(ctx.p + PI);

    setBody(
      t,
      0.20 * pyramid + 0.04 * windup * Math.abs(s1),
      PELVIS_REST_Y + 0.04 * pyramid - 0.08 * windup,
      -0.12 * pyramid,
      0.04 * pyramid,
      -0.08 * pyramid,
      0.16 * pyramid - 0.12 * s1 * windup,
      0.14 * pyramid, // Sassy lean toward A's shoulder
      -0.06 * pyramid,
      0.12 * pyramid,
      0.10 * pyramid,
      -0.12 * pyramid,
      0.14 * pyramid,
      0.10 * pyramid,
      1 + 0.06 * pyramid,
      -0.06 * pyramid,
      -0.16 * pyramid,
      -0.10 * pyramid,
      -0.08 * pyramid,
      -0.20 * pyramid,
      -0.12 * pyramid
    );

    // Left (inner) elbow propped smugly on A's shoulder; Right (outer) arm throws high peace/V-sign overhead!
    setArms(
      t,
      -0.98 * pyramid - (0.85 + 0.25 * s1) * windup,
      0.45 * pyramid,
      0.58 * pyramid + 0.28 * windup,
      -1.35 * pyramid - 1.10 * windup,
      0.30 * pyramid,
      0.35 * pyramid,
      0.20 * pyramid,
      -2.20 * pyramid - (0.85 - 0.25 * s1) * windup,
      -0.25 * pyramid,
      -0.55 * pyramid - 0.28 * windup,
      -0.28 * pyramid - 1.10 * windup,
      -0.25 * pyramid,
      -0.25 * pyramid,
      -0.25 * pyramid
    );

    const liftL = 0.16 * pyramid + Math.max(0, s1) * 0.16 * windup;
    const liftR = 0.22 * pyramid + Math.max(0, -s1) * 0.16 * windup;
    setLegs(
      t,
      clamp(liftL, 0, 0.22),
      clamp(liftR, 0, 0.22),
      0.20 * pyramid + 0.16 * s1 * windup,
      -0.24 * pyramid - 0.16 * s1 * windup,
      0.12 * pyramid,
      -0.26 * pyramid, // Flirty kicked-up outer heel in pyramid pose!
      0.24 * e,
      -0.24 * e,
      0.24 * pyramid + 0.14 * windup,
      0.42 * pyramid + 0.14 * windup,
      0.26 * pyramid,
      0.34 * pyramid
    );
  },
};

// ============================================================================
// EXPORTED DUET LIBRARY & ZERO-ALLOCATION SELECTOR HELPERS
// ============================================================================

export const DUET_MOVES: readonly DuetMove[] = [
  // Indian Partner & Folk Forms (13)
  DUET_DANDIYA_PAANCH_TAAL,
  DUET_DANDIYA_SAAT_TAAL,
  DUET_DANDIYA_EKTAAL_DO_TAALI,
  DUET_DANDIYA_DRUT_FINALE,
  DUET_GARBA_DODHIYU_SWIRL,
  DUET_BHANGRA_JODI_BOUNCE,
  DUET_BHANGRA_GIDDHA_TAALI,
  DUET_KATHAK_CHAKKAR_SHADOW,
  DUET_KATHAK_SAMA_DIALOGUE,
  DUET_BOLLY_ROMANTIC_WALTZ,
  DUET_BOLLY_HERO_ENTRY_LIFT,
  DUET_LAVANI_KOLI_INTERPLAY,
  DUET_GHOOMAR_ORBIT_SWIRL,

  // Global Partner Forms (12)
  DUET_HIPHOP_BACK_TO_BACK_LEAN,
  DUET_HIPHOP_MIRROR_CHALLENGE,
  DUET_BREAK_UPROCK_FACEOFF,
  DUET_BREAK_FREEZE_TAG,
  DUET_LINDY_CIRCLE_SWINGOUT,
  DUET_DISCO_FEVER_HANDOFF,
  DUET_SALSA_DILE_QUE_NO,
  DUET_SHUFFLE_MELBOURNE_CROSS,
  DUET_HOUSE_JACK_CONVERSATION,
  DUET_JAZZ_HIGH_FIVE_CHAIN,
  DUET_JAZZ_ELBOW_HOOK_SWAP,
  DUET_WAACKING_VOGUE_FRAME,

  // Cute Animal Comedy Duets (7)
  DUET_COMEDY_CAT_MOUSE_CHASE,
  DUET_COMEDY_TALL_AND_SMALL,
  DUET_COMEDY_COPYCAT_CANON,
  DUET_COMEDY_TUG_OF_WAR,
  DUET_COMEDY_DOUBLE_TAKE,
  DUET_COMEDY_PATTY_CAKE_TURBO,
  DUET_COMEDY_PILE_UP_FINALE,
];

/** O(1) lookup map keyed by DuetMove.id, initialized once at module load. */
export const DUET_MOVE_BY_ID: Readonly<Record<string, DuetMove>> = (() => {
  const map: Record<string, DuetMove> = {};
  for (let i = 0; i < DUET_MOVES.length; i++) {
    const m = DUET_MOVES[i];
    map[m.id] = m;
  }
  return map;
})();

/**
 * Deterministic, zero-allocation duet selector scored by BPM fit, energy proximity,
 * and recency avoidance. Safe to call on bar transitions in the hot loop.
 */
export function selectDuetMove(
  bpm: number,
  energy: number,
  seedBeat: number,
  lastMoveId: string
): DuetMove {
  let bestMove = DUET_MOVES[0];
  let bestScore = -1e9;
  const n = DUET_MOVES.length;

  for (let i = 0; i < n; i++) {
    const m = DUET_MOVES[i];
    let score = 0;

    // 1. Tempo fit score
    const minBpm = m.tempoFit[0];
    const maxBpm = m.tempoFit[1];
    if (bpm >= minBpm && bpm <= maxBpm) {
      score += 2.0;
    } else {
      const dist = bpm < minBpm ? minBpm - bpm : bpm - maxBpm;
      score -= dist * 0.04;
    }

    // 2. Energy proximity score
    const eDiff = Math.abs(m.energy - energy);
    score += (1.0 - eDiff) * 2.5;

    // 3. Deterministic hash jitter from seedBeat so equal-energy moves rotate cleanly
    const hash = ((seedBeat * 131 + i * 97) % 100) * 0.012;
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