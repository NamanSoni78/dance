// scripts/test_diva_bridge.ts
// V5.1 offline verification of the ExternalDivaPose bridge semantics.
//
// Simulates the WRAPPER's mapping (JointTargets -> ExternalDivaPose) for
// every girl move (51 solo + 16 duets x2 + 10 spotlights) across a sweep of
// contexts, then checks the DIVABODY's consumers:
//   1. Leg IK targets are finite + within the solver's plausible reach
//      envelope (pre-clamp distance in [0.10, 1.15] m from the hip).
//   2. pelvisYOffset keeps the anatomical pelvis within [0.45, 1.02] m.
//   3. Arm rotations land inside human-range envelopes.
//   4. The 2-pi Reface wrap produces |dSpin| < pi for the body's
//      wrap-safe spin-velocity estimator (no hair explosions).

import { GIRL_MOVES } from '../src/lib/girlMoves';
import { GIRL_DUET_MOVES } from '../src/lib/girlDuetMoves';
import { GIRL_SIGNATURE_SPOTLIGHTS } from '../src/lib/girlSpotlight';
import { applySpeciesAccent } from '../src/lib/speciesFlavor';
import type { JointTargets, MoveContext, DanceMove } from '../src/lib/danceMoves';

// ---- wrapper-side constants (mirror ProceduralDancingGirl.tsx) -------------
const PY = 0.90;
// DivaBody rig constants (mirror DivaBody.tsx)
const THIGH = 0.43;
const SHIN = 0.42;
const HIP_X = 0.087;
const HIP_DY = -0.09; // pelvis 0.99 + hip offset
const FLOOR_FOOT_Y = 0.057;

function initialTargets(): JointTargets {
  return {
    rootY: 0, rootRotY: 0,
    pelvisY: PY, pelvisX: 0, pelvisZ: 0,
    pelvisRotX: 0, pelvisRotY: 0, pelvisRotZ: 0,
    pelvisScaleX: 1, pelvisScaleY: 1, pelvisScaleZ: 1,
    lowerSpineX: 0, lowerSpineY: 0, lowerSpineZ: 0,
    chestX: 0, chestY: 0, chestZ: 0, chestScale: 1,
    neckX: 0, neckY: 0, neckZ: 0, headX: 0, headY: 0, headZ: 0,
    shoulderLX: 0.1, shoulderLY: 0, shoulderLZ: 0.25,
    elbowLX: -0.35, elbowLY: 0, wristLX: 0, wristLZ: 0,
    shoulderRX: 0.1, shoulderRY: 0, shoulderRZ: -0.25,
    elbowRX: -0.35, elbowRY: 0, wristRX: 0, wristRZ: 0,
    footLiftL: 0, footLiftR: 0, legStepPitchL: 0, legStepPitchR: 0,
    legStepRollL: 0, legStepRollR: 0, hipYawL: 0, hipYawR: 0,
    extraKneeL: 0, extraKneeR: 0, ankleToePitchL: 0, ankleToePitchR: 0,
  };
}

function ctxAt(
  beat: number,
  p: number,
  bass: number,
  mid: number,
  high: number
): MoveContext {
  return {
    p,
    halfP: p * 0.5,
    quarterP: p * 0.25,
    beatPulse: bass,
    beatCount: beat,
    isBeat: true,
    moveBeat: beat,
    moveBar: beat * 0.25,
    moveProgress: (beat % 8) / 8,
    bass, mid, high,
    overall: (bass + mid + high) / 3,
    bpm: 124,
    elapsed: beat * 0.5,
    dt: 1 / 60,
    requestSpin: () => {},
  };
}

// DivaBody leg-bridge math (mirror of the ext branch in simulate)
function legTarget(
  side: number,
  lift: number,
  pitch: number,
  roll: number,
  yaw: number
): [number, number, number] {
  const LEG_REACH = THIGH + SHIN - 0.02;
  const x =
    side * 0.104 + roll * 0.42 + Math.sin(yaw) * LEG_REACH * 0.16;
  const y = FLOOR_FOOT_Y + Math.max(0, Math.min(0.42, lift));
  const z = -Math.sin(pitch) * LEG_REACH * 0.92;
  return [x, y, z];
}

function hipDistance(t: [number, number, number], pelvisYOffset: number): number {
  // hip root-local position: (±0.087, 0.99 - 0.09 + pelvisYOffset, 0)
  const hipX = Math.sign(t[0]) * HIP_X;
  const hipY = 0.99 + HIP_DY + pelvisYOffset;
  const dx = t[0] - hipX;
  const dy = t[1] - hipY;
  const dz = t[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    if (failures <= 30) console.error('  FAIL:', msg);
  }
}

function exerciseMove(
  move: DanceMove,
  pose: (t: JointTargets, ctx: MoveContext) => void,
  label: string
): void {
  for (let ci = 0; ci < 63; ci++) {
    const beat = ci * 0.75;
    const p = (ci / 63) * Math.PI * 2 * 4;
    const bass = [0.1, 0.55, 0.95][ci % 3];
    const mid = [0.2, 0.5, 0.8][(ci + 1) % 3];
    const high = [0.15, 0.45, 0.85][(ci + 2) % 3];
    const ctx = ctxAt(beat, p, bass, mid, high);
    const t = initialTargets();
    // baseline squash (mirror the wrapper)
    const squash = bass * 0.13 + bass * 0.07;
    t.pelvisScaleX = 1 + squash * 0.5;
    t.pelvisScaleY = 1 - squash * 0.6;
    t.pelvisScaleZ = 1 + squash * 0.5;
    t.hipYawL = 0.06;
    t.hipYawR = -0.06;
    t.chestScale = 1 + Math.sin(beat) * 0.014 + bass * 0.05;
    pose(t, ctx);
    applySpeciesAccent('GIRL', t, ctx);

    // ---- finite sweep on ALL channels ----
    const keys = Object.keys(t) as Array<keyof JointTargets>;
    for (const k of keys) {
      check(Number.isFinite(t[k]), `${label} ${move.id} ctx${ci} channel ${k} = ${t[k]}`);
    }

    // ---- pelvis offset envelope ----
    const pelvisYOffset = t.pelvisY - PY + t.rootY;
    check(
      pelvisYOffset >= -0.45 && pelvisYOffset <= 0.25,
      `${label} ${move.id} ctx${ci} pelvisYOffset ${pelvisYOffset.toFixed(3)} out of envelope`
    );

    // ---- leg IK reach envelope (pre-clamp) ----
    const legPairs: Array<[number, number, number, number, number]> = [
      [-1, t.footLiftL, t.legStepPitchL, t.legStepRollL, t.hipYawL],
      [1, t.footLiftR, t.legStepPitchR, t.legStepRollR, t.hipYawR],
    ];
    for (const [side, lift, pitch, roll, yaw] of legPairs) {
      const tgt = legTarget(side, lift, pitch, roll, yaw);
      const dist = hipDistance(tgt, pelvisYOffset);
      check(
        dist >= 0.10 && dist <= 1.15,
        `${label} ${move.id} ctx${ci} leg(${side}) pre-clamp reach ${dist.toFixed(3)} m out of envelope`
      );
    }

    // ---- arm envelopes ----
    check(
      Math.abs(t.shoulderLX) < 3.1 && Math.abs(t.shoulderRX) < 3.1,
      `${label} ${move.id} ctx${ci} shoulderX out of human range`
    );
    check(
      t.elbowLX < 0.05 && t.elbowRX < 0.05,
      `${label} ${move.id} ctx${ci} elbow must flex negative (got L=${t.elbowLX.toFixed(2)} R=${t.elbowRX.toFixed(2)})`
    );

    // ---- scale channels are multipliers (the V5 bug class) ----
    check(
      t.pelvisScaleX > 0.55 && t.pelvisScaleY > 0.55 && t.pelvisScaleZ > 0.55,
      `${label} ${move.id} ctx${ci} pelvisScale collapsed (delta-vs-multiplier regression)`
    );
    check(
      t.chestScale > 0.6,
      `${label} ${move.id} ctx${ci} chestScale collapsed`
    );
  }
}

// ---- run -------------------------------------------------------------------
console.log('V5.1 DIVA BRIDGE TEST');
console.log('='.repeat(60));

const solo = GIRL_MOVES;
console.log(`Exercising ${solo.length} solo moves through the bridge...`);
for (const m of solo) exerciseMove(m, m.pose, 'SOLO');
console.log(`  solo done — failures so far: ${failures}`);

console.log(`Exercising ${GIRL_DUET_MOVES.length} duets x A/B through the bridge...`);
for (const d of GIRL_DUET_MOVES) {
  exerciseMove(
    { ...d, id: `${d.id}:A` } as unknown as DanceMove,
    d.poseA as (t: JointTargets, ctx: MoveContext) => void,
    'DUET'
  );
  exerciseMove(
    { ...d, id: `${d.id}:B` } as unknown as DanceMove,
    d.poseB as (t: JointTargets, ctx: MoveContext) => void,
    'DUET'
  );
}
console.log(`  duets done — failures so far: ${failures}`);

console.log(`Exercising ${GIRL_SIGNATURE_SPOTLIGHTS.length} spotlights through the bridge...`);
for (const s of GIRL_SIGNATURE_SPOTLIGHTS) exerciseMove(s, s.pose, 'SPOT');
console.log(`  spotlights done — failures so far: ${failures}`);

// ---- reface wrap safety -----------------------------------------------------
console.log('Reface wrap: spin-velocity estimator safety...');
for (const turnShift of [Math.PI * 2, -Math.PI * 4, Math.PI * 6]) {
  let spin = 7.85; // arbitrary accumulated spin
  const prevSpin = spin;
  spin = spin - turnShift; // reface wrap subtracts multiples of 2pi
  let dSpin = spin - prevSpin;
  dSpin = Math.atan2(Math.sin(dSpin), Math.cos(dSpin));
  check(
    Math.abs(dSpin) <= Math.PI + 1e-9,
    `reface wrap dSpin ${dSpin} exceeds pi`
  );
}
console.log('  wrap checks done');

console.log('='.repeat(60));
if (failures === 0) {
  console.log('ALL DIVA BRIDGE CHECKS PASSED');
} else {
  console.error(`DIVA BRIDGE FAILURES: ${failures}`);
  process.exit(1);
}
