// V3 offline verification of the duet/spotlight POSE path — exercises every
// duet's poseA + poseB, every species signature move, every hype pose and
// every accent layer across a full progress sweep, asserting the physics
// laws (finite channels, pelvis floor, anatomical clamps) that the engine
// relies on. This is coverage the 0.3fps headless browser cannot reach.
import { DUET_MOVES, selectDuetMove } from '../src/lib/duetMoves';
import { GIRL_DUET_MOVES } from '../src/lib/girlDuetMoves';
import { GIRL_MOVES } from '../src/lib/girlMoves';
import { GIRL_SIGNATURE_SPOTLIGHTS, selectGirlSpotlight, selectGirlSpotlightAlt } from '../src/lib/girlSpotlight';
import {
  applySpeciesAccent,
  applyHypeCrewResponsePose,
  selectSignatureMove,
  SPECIES_FLAVOR,
} from '../src/lib/speciesFlavor';
import type { JointTargets, MoveContext, DanceMove } from '../src/lib/danceMoves';
import type { SpeciesId } from '../src/lib/species';

function makeTargets(): JointTargets & Record<string, number> {
  const t: Record<string, number> = {};
  // Every JointTargets channel + engine face channels
  const channels = [
    'rootY', 'rootRotY', 'pelvisY', 'pelvisX', 'pelvisZ',
    'pelvisRotX', 'pelvisRotY', 'pelvisRotZ',
    'pelvisScaleX', 'pelvisScaleY', 'pelvisScaleZ',
    'lowerSpineX', 'lowerSpineY', 'lowerSpineZ',
    'chestX', 'chestY', 'chestZ', 'chestScale',
    'neckX', 'neckY', 'neckZ', 'headX', 'headY', 'headZ',
    'shoulderLX', 'shoulderLY', 'shoulderLZ',
    'elbowLX', 'elbowLY', 'wristLX', 'wristLZ',
    'shoulderRX', 'shoulderRY', 'shoulderRZ',
    'elbowRX', 'elbowRY', 'wristRX', 'wristRZ',
    'footLiftL', 'footLiftR',
    'legStepPitchL', 'legStepPitchR',
    'legStepRollL', 'legStepRollR',
    'hipYawL', 'hipYawR', 'extraKneeL', 'extraKneeR',
    'ankleToePitchL', 'ankleToePitchR',
  ];
  for (const c of channels) t[c] = 0;
  t.pelvisY = 0.9;
  return t as JointTargets & Record<string, number>;
}

const ctx: MoveContext = {
  p: 0, halfP: 0, quarterP: 0,
  beatPulse: 0.8, beatCount: 8, isBeat: false,
  moveBeat: 0, moveBar: 0, moveProgress: 0,
  bass: 0.7, mid: 0.5, high: 0.4, overall: 0.6,
  bpm: 128, elapsed: 10, dt: 0.016,
  requestSpin: (r: number) => { spinAccum += r; },
};

let spinAccum = 0;
const t = makeTargets();
let failures = 0;

function assertLaws(label: string): void {
  // 1. Every channel must be a finite number
  for (const key of Object.keys(t)) {
    const v = t[key];
    if (!Number.isFinite(v)) {
      console.log(`!!! FAIL [${label}] channel ${key} = ${v} (non-finite)`);
      failures++;
    }
  }
  // 2. Physics floor (engine IK relies on this)
  if (t.pelvisY < 0.45) {
    console.log(`!!! FAIL [${label}] pelvisY ${t.pelvisY.toFixed(3)} < 0.45`);
    failures++;
  }
  // 3. Anatomical clamps
  if (t.shoulderLX < -2.71 || t.shoulderLX > 0.61 || t.shoulderRX < -2.71 || t.shoulderRX > 0.61) {
    console.log(`!!! FAIL [${label}] shoulder clamp breached L=${t.shoulderLX.toFixed(2)} R=${t.shoulderRX.toFixed(2)}`);
    failures++;
  }
  if (t.elbowLX < -2.41 || t.elbowLX > 0.01 || t.elbowRX < -2.41 || t.elbowRX > 0.01) {
    console.log(`!!! FAIL [${label}] elbow clamp breached L=${t.elbowLX.toFixed(2)} R=${t.elbowRX.toFixed(2)}`);
    failures++;
  }
}

// Sweep: phase across a full beat cycle, progress across a full move
const PROGRESS_STEPS = [0, 0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95, 1];
const PHASE_STEPS = [0, 0.8, 1.6, 2.4, 3.2, 4.0, 5.2];

console.log(`Exercising ${DUET_MOVES.length} duets x 2 partners x ${PROGRESS_STEPS.length * PHASE_STEPS.length} ctx points...`);
for (const duet of DUET_MOVES) {
  for (const prog of PROGRESS_STEPS) {
    for (const ph of PHASE_STEPS) {
      ctx.p = ph;
      ctx.halfP = ph * 0.5;
      ctx.quarterP = ph * 0.25;
      ctx.moveProgress = prog;
      ctx.moveBeat = prog * duet.durationBars * 4;
      ctx.moveBar = ctx.moveBeat * 0.25;
      duet.poseA(t, ctx);
      assertLaws(`${duet.id}:A p=${prog}`);
      duet.poseB(t, ctx);
      assertLaws(`${duet.id}:B p=${prog}`);
    }
  }
}
console.log(`duets done, failures so far: ${failures}`);

// V5: the Diva's 16 authored partner duets — poseA is HER feminine anchor
// line (runs on the girl rig), poseB is the counter-choreography (runs on the
// partner animal rig) — both must obey the physics laws on the shared rig.
console.log(`Exercising ${GIRL_DUET_MOVES.length} GIRL duets x 2 partners x ${PROGRESS_STEPS.length * PHASE_STEPS.length} ctx points...`);
for (const duet of GIRL_DUET_MOVES) {
  for (const prog of PROGRESS_STEPS) {
    for (const ph of PHASE_STEPS) {
      ctx.p = ph;
      ctx.halfP = ph * 0.5;
      ctx.quarterP = ph * 0.25;
      ctx.moveProgress = prog;
      ctx.moveBeat = prog * duet.durationBars * 4;
      ctx.moveBar = ctx.moveBeat * 0.25;
      duet.poseA(t, ctx);
      assertLaws(`girl-duet:${duet.id}:A p=${prog}`);
      duet.poseB(t, ctx);
      assertLaws(`girl-duet:${duet.id}:B p=${prog}`);
    }
  }
}
console.log(`girl duets done, failures so far: ${failures}`);

// V5: her full 51-move solo library through the same physics sweep
console.log(`Exercising ${GIRL_MOVES.length} GIRL solo moves x ${PROGRESS_STEPS.length * PHASE_STEPS.length} ctx points...`);
for (const move of GIRL_MOVES) {
  for (const prog of PROGRESS_STEPS) {
    for (const ph of PHASE_STEPS) {
      ctx.p = ph;
      ctx.halfP = ph * 0.5;
      ctx.quarterP = ph * 0.25;
      ctx.moveProgress = prog;
      ctx.moveBeat = prog * move.defaultBars * 4;
      ctx.moveBar = ctx.moveBeat * 0.25;
      move.pose(t, ctx);
      assertLaws(`girl-move:${move.id} p=${prog}`);
    }
  }
}
console.log(`girl solo moves done, failures so far: ${failures}`);

// V5: her 10 spotlight showstoppers (also under the accent stack)
console.log(`Exercising ${GIRL_SIGNATURE_SPOTLIGHTS.length} GIRL spotlights x accent stack...`);
for (const sig of GIRL_SIGNATURE_SPOTLIGHTS) {
  for (const prog of PROGRESS_STEPS) {
    for (const ph of PHASE_STEPS) {
      ctx.p = ph;
      ctx.halfP = ph * 0.5;
      ctx.quarterP = ph * 0.25;
      ctx.moveProgress = prog;
      ctx.moveBeat = prog * sig.defaultBars * 4;
      ctx.moveBar = ctx.moveBeat * 0.25;
      sig.pose(t, ctx);
      applySpeciesAccent('GIRL', t, ctx);
      assertLaws(`girl-spot:${sig.id} p=${prog}`);
    }
  }
}
console.log(`girl spotlights done, failures so far: ${failures}`);

// Species accents on a neutral pose (stacked like the engine does)
const speciesList: SpeciesId[] = ['CAT', 'GIRL', 'MOUSE'];
for (const sp of speciesList) {
  for (const ph of PHASE_STEPS) {
    ctx.p = ph; ctx.halfP = ph * 0.5; ctx.quarterP = ph * 0.25;
    ctx.moveProgress = 0.5;
    applySpeciesAccent(sp, t, ctx);
    assertLaws(`accent:${sp} ph=${ph.toFixed(1)}`);
  }
}
console.log('accents done');

// Hype crew poses for every species + both sides
for (const sp of speciesList) {
  for (const side of [-1, 1]) {
    for (const prog of PROGRESS_STEPS) {
      ctx.moveProgress = prog;
      applyHypeCrewResponsePose(sp, side, t, ctx);
      assertLaws(`hype:${sp}:${side} p=${prog}`);
    }
  }
}
console.log('hype poses done');

// Signature moves: all species, full progress sweep, spin requests must resolve
for (const sp of speciesList) {
  const flavor = SPECIES_FLAVOR[sp];
  console.log(`${sp} persona: "${flavor.persona}" — ${flavor.signatureMoves.length} signature moves`);
  for (const sig of flavor.signatureMoves as DanceMove[]) {
    for (const prog of PROGRESS_STEPS) {
      for (const ph of PHASE_STEPS) {
        ctx.p = ph; ctx.halfP = ph * 0.5; ctx.quarterP = ph * 0.25;
        ctx.moveProgress = prog;
        sig.pose(t, ctx);
        assertLaws(`sig:${sig.id} p=${prog}`);
      }
    }
  }
  // Selector sanity: deterministic + rotates with lastMoveId
  const s1 = selectSignatureMove(sp, 128, 0.6, 100, '');
  const s2 = selectSignatureMove(sp, 128, 0.6, 100, '');
  if (s1.id !== s2.id) { console.log(`!!! FAIL signature selector non-deterministic for ${sp}`); failures++; }
}
console.log(`signature moves done — spin requests buffered: ${spinAccum.toFixed(1)} rad`);

// V5 girl spotlight selector sanity: deterministic + excludes primary in alt
const g1 = selectGirlSpotlight(0.6, 128, undefined, 100);
const g2 = selectGirlSpotlight(0.6, 128, undefined, 100);
if (g1.id !== g2.id) { console.log('!!! FAIL girl spotlight selector non-deterministic'); failures++; }
const gAlt = selectGirlSpotlightAlt(g1.id, 0.6, 128, undefined, 107);
if (gAlt.id === g1.id) { console.log('!!! FAIL girl spotlight alt same as primary'); failures++; }
const gEx = selectGirlSpotlight(0.6, 128, undefined, 100, g1.id);
if (gEx.id === g1.id) { console.log('!!! FAIL girl spotlight selector ignored excludeId'); failures++; }
console.log('girl spotlight selectors done');

// Duet selector sanity: rotation + determinism
const d1 = selectDuetMove(128, 0.6, 100, '');
const d2 = selectDuetMove(128, 0.6, 100, '');
if (d1.id !== d2.id) { console.log('!!! FAIL duet selector non-deterministic'); failures++; }
const d3 = selectDuetMove(128, 0.6, 100, d1.id);
if (d3.id === d1.id) { console.log('!!! FAIL duet selector ignored lastMoveId recency'); failures++; }

console.log(`\n${failures === 0 ? 'ALL POSE-PATH CHECKS PASSED' : `FAILURES: ${failures}`}`);
process.exitCode = failures === 0 ? 0 : 1;
