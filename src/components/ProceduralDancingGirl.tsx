'use client';

// src/components/ProceduralDancingGirl.tsx
// ============================================================================
// V5.1 THE DIVA — ENGINE WRAPPER over the DivaBody ultra-realistic renderer.
//
// ARCHITECTURE (V5.1, after the user verdict "still plastic mannequin / plain"):
//   This component is now the CHOREOGRAPHY ENGINE only. It runs the exact
//   group machinery that made V3/V4 dance well — the beat clock, the
//   51-move solo library, her 16 partner duets, 10 spotlight showstoppers,
//   formations, sync modes (UNISON/CANON/MIRROR), the Reface Law spin
//   accumulator, slot travel, species accent layer, breathing — and damps
//   the full 41-channel JointTargets exactly as before.
//
//   The BODY is DivaBody (`src/components/DivaBody.tsx`, from the Diva 3.0
//   AI package, audited + integrated + improved): multi-layer SSS skin with
//   procedural pore/Langer-line textures, sculpted craniofacial anatomy
//   (brow ridge, nose, cheekbones, jaw, ears), FACS 24-action-unit face
//   with blinks/winks/saccades/viseme lip-sync, refractive cornea eyes,
//   couture corset + shorts + 98-particle Verlet skirt + anisotropic keratin
//   hair with dual physics (32 spring locks + multi-chain Verlet), soft-body
//   bust/glute springs, breathing, and analytical leg IK with soft-knee +
//   heel-ball-toe foot roll. The engine's damped channels flow into the
//   DivaBody through the ExternalDivaPose bridge each frame (zero-copy,
//   zero-allocation — one stable mutated object), and the DivaBody maps
//   them onto its own skeleton at 120 Hz while all of its anatomical
//   secondary systems keep reacting to the choreography.
//
// ENGINE CONTRACT (unchanged law): same 41-channel pose interface, same
// group machine, same Reface Law, same beat clock. Tasteful glamour:
// corset bodice + dance shorts + flared skirt + heeled boots + jewelry ON,
// explicit anatomy meshes removed at the DivaBody level.
// ============================================================================

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  type JointTargets,
  type DanceMove,
  type MoveContext,
} from '@/lib/danceMoves';
import {
  girlChoreographers,
  beatClock,
  groupDirector,
} from '@/lib/danceRuntime';
import {
  applySpeciesAccent,
  applyHypeCrewResponsePose,
} from '@/lib/speciesFlavor';
import type { DancerSlotState } from '@/lib/groupDance';
import {
  mapStyleToFamily,
  type DanceStyle,
} from '@/lib/danceStyleMapping';
import { getSpeciesPreset, type SpeciesId } from '@/lib/species';
import type { AudioMetrics } from '@/lib/choreographer';
import { DivaBody, type ExternalDivaPose, type DspAudioMetrics } from '@/components/DivaBody';
import type { HairCarriage } from '@/lib/girlHair';

// ============================================================================
// 1. TYPES & CONTRACTS
// ============================================================================

export interface ProceduralDancingGirlProps {
  getMetrics?: () => AudioMetrics;
  demoMode?: boolean;
  forcedStyle?: DanceStyle;
  showHud?: boolean;
  position?: [number, number, number];
  scale?: number;
  dancerIndex?: number;
}

/** Persona pseudo-moves for expression/carriage blending during specials. */
const DUET_PERSONA_MOVE: DanceMove = {
  id: '__PARTNER_DUET__', name: 'Partner Duet', family: 'BOLLYWOOD',
  origin: '', energy: 0.75, tempoFit: [90, 170], defaultBars: 4,
  tags: ['groove', 'arms'], faceIntent: 'joyful', tailCarriage: 'sway',
  pose: () => {},
};
const HYPE_PERSONA_MOVE: DanceMove = {
  id: '__HYPE_CREW__', name: 'Hype Crew', family: 'GLOBAL_PARTY',
  origin: '', energy: 0.55, tempoFit: [90, 170], defaultBars: 4,
  tags: ['groove'], faceIntent: 'smug', tailCarriage: 'high',
  pose: () => {},
};

/** Shared mode context (one scratch object; useFrame runs sequentially). */
const _gModeCtx: MoveContext = {
  p: 0, halfP: 0, quarterP: 0,
  beatPulse: 0, beatCount: 0, isBeat: false,
  moveBeat: 0, moveBar: 0, moveProgress: 0,
  bass: 0, mid: 0, high: 0, overall: 0,
  bpm: 120, elapsed: 0, dt: 0.016,
  requestSpin: () => {},
};

const PY = 0.90; // standing pelvis height of the shared skeleton (offset base)

/**
 * MIRROR MODE: flips a pose left/right in place (zero allocation) — true
 * mirror image for MIRROR sync + MIRRORED duets.
 */
function mirrorGirlPoseInPlace(t: JointTargets): void {
  let tmp = 0;
  t.pelvisX = -t.pelvisX;
  t.pelvisRotY = -t.pelvisRotY;
  t.pelvisRotZ = -t.pelvisRotZ;
  t.lowerSpineY = -t.lowerSpineY;
  t.lowerSpineZ = -t.lowerSpineZ;
  t.chestY = -t.chestY;
  t.chestZ = -t.chestZ;
  t.neckY = -t.neckY;
  t.neckZ = -t.neckZ;
  t.headY = -t.headY;
  t.headZ = -t.headZ;
  tmp = t.shoulderLX; t.shoulderLX = t.shoulderRX; t.shoulderRX = tmp;
  tmp = t.shoulderLY; t.shoulderLY = -t.shoulderRY; t.shoulderRY = -tmp;
  tmp = t.shoulderLZ; t.shoulderLZ = -t.shoulderRZ; t.shoulderRZ = -tmp;
  tmp = t.elbowLX; t.elbowLX = t.elbowRX; t.elbowRX = tmp;
  tmp = t.elbowLY; t.elbowLY = -t.elbowRY; t.elbowRY = -tmp;
  tmp = t.wristLX; t.wristLX = t.wristRX; t.wristRX = tmp;
  tmp = t.wristLZ; t.wristLZ = -t.wristRZ; t.wristRZ = -tmp;
  tmp = t.footLiftL; t.footLiftL = t.footLiftR; t.footLiftR = tmp;
  tmp = t.legStepPitchL; t.legStepPitchL = t.legStepPitchR; t.legStepPitchR = tmp;
  tmp = t.legStepRollL; t.legStepRollL = -t.legStepRollR; t.legStepRollR = -tmp;
  tmp = t.hipYawL; t.hipYawL = -t.hipYawR; t.hipYawR = -tmp;
  tmp = t.extraKneeL; t.extraKneeL = t.extraKneeR; t.extraKneeR = tmp;
  tmp = t.ankleToePitchL; t.ankleToePitchL = t.ankleToePitchR; t.ankleToePitchR = tmp;
}

function createInitialTargets(): JointTargets {
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

/** A fresh, complete bridge snapshot (mutated in place every frame). */
function createExternalPose(): ExternalDivaPose {
  return {
    rootRotY: 0,
    pelvisX: 0, pelvisZ: 0, pelvisYOffset: 0,
    pelvisRotX: 0, pelvisRotY: 0, pelvisRotZ: 0,
    pelvisScaleX: 1, pelvisScaleY: 1, pelvisScaleZ: 1,
    spinePitch: 0, spineYaw: 0, spineRoll: 0, chestScale: 1,
    neckX: 0, neckY: 0, neckZ: 0,
    headX: 0, headY: 0, headZ: 0,
    shoulderLX: 0.1, shoulderLY: 0, shoulderLZ: 0.25,
    elbowLX: -0.35, elbowLY: 0, wristLX: 0, wristLZ: 0,
    shoulderRX: 0.1, shoulderRY: 0, shoulderRZ: -0.25,
    elbowRX: -0.35, elbowRY: 0, wristRX: 0, wristRZ: 0,
    footLiftL: 0, footLiftR: 0,
    legStepPitchL: 0, legStepPitchR: 0,
    legStepRollL: 0, legStepRollR: 0,
    hipYawL: 0.06, hipYawR: -0.06,
    ankleToePitchL: 0, ankleToePitchR: 0,
    faceIntent: 'joyful',
    hairCarriage: 'neutral',
    partnerYaw: 0,
    isDuet: false,
  };
}

// ============================================================================
// 2. COMPONENT — the engine
// ============================================================================
export function ProceduralDancingGirl({
  getMetrics,
  demoMode = false,
  forcedStyle = 'AUTO',
  position = [0, 0, 0],
  scale = 1,
  dancerIndex = 0,
}: ProceduralDancingGirlProps) {
  const preset = getSpeciesPreset('GIRL');
  const rigScale = scale * preset.scale;
  const isLeadDancer = dancerIndex === 0;

  const requestDirectSpin = useMemo(
    () => (radians: number) => {
      girlEngRef.current.pendingDirectSpin += radians;
    },
    []
  );

  // ---- engine state --------------------------------------------------------
  const girlEngRef = useRef({
    targets: createInitialTargets(),
    phase: 0,
    barPhase: 0,
    beatCount: 0,
    lastBeatTime: -1,
    beatPulse: 0,
    spinTargetY: 0,
    refaceTimer: 0,
    spinGrace: 0,
    lastMoveIdForReface: '',
    facingYaw: 0,
    pendingDirectSpin: 0,
    lastReportedStyle: '',
    demoMetrics: {
      bass: 0,
      mid: 0,
      high: 0,
      overall: 0,
      isBeat: false,
      bpm: 128,
      isPlaying: true,
    } as AudioMetrics,
  });

  /** Stable bridge snapshot — mutated in place, read by DivaBody at 120 Hz. */
  const externalPoseRef = useRef<ExternalDivaPose | null>(createExternalPose());

  /** Live audio metrics for the DivaBody's own subsystems (FACS face, hair
   *  aerodynamics, cloth wind, soft-body) — mutated in place each frame. */
  const dspRef = useRef<DspAudioMetrics>({
    bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0,
    energy: 0, beatPulse: 0, bpm: 128, isPlaying: true,
  });

  /** Damped joint accumulators (the previous rig's per-object damping,
   *  now into flat fields that feed the bridge each frame). */
  const dampedRef = useRef(createInitialTargets());

  const slotGroupRef = useRef<THREE.Group>(null!);

  // ==========================================================================
  // REAL-TIME CHOREOGRAPHY LOOP (60-144 FPS) — identical law to the animals
  // ==========================================================================
  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const elapsed = state.clock.elapsedTime;
    const ge = girlEngRef.current;
    const t = ge.targets;
    const ext = externalPoseRef.current;
    if (!ext) return;

    // 1. METRICS (real audio, or the built-in demo-beat simulator when the
    //    browser has not unlocked audio yet)
    const externalMetrics = getMetrics ? getMetrics() : undefined;
    const useSimulator = demoMode || !externalMetrics;
    let metrics: AudioMetrics;
    if (!useSimulator && externalMetrics) {
      metrics = externalMetrics;
    } else {
      const simBpm = 128;
      const beatsPerSec = simBpm / 60;
      const prevBeatFloor = Math.floor(ge.barPhase);
      ge.barPhase += dt * beatsPerSec;
      const currentBeatFloor = Math.floor(ge.barPhase);
      const beatFract = ge.barPhase - currentBeatFloor;
      const isNewBeat = currentBeatFloor !== prevBeatFloor;
      const phraseBeat = ((currentBeatFloor % 32) + 32) % 32;
      let simBass = 0;
      let simMid = 0;
      let simHigh = 0;
      let simOverall = 0;
      if (phraseBeat < 4) {
        simBass = 0.08 * Math.exp(-beatFract * 6);
        simMid = 0.05;
        simHigh = 0.06 * Math.abs(Math.sin(beatFract * Math.PI * 4));
        simOverall = 0.07;
      } else if (phraseBeat < 12) {
        simBass = Math.pow(Math.max(0, 1 - beatFract * 3.2), 2) * 0.62;
        simMid = currentBeatFloor % 2 === 1 ? Math.pow(Math.max(0, 1 - beatFract * 2.5), 1.8) * 0.58 : 0.22;
        simHigh = 0.32 * Math.abs(Math.sin(beatFract * Math.PI * 2));
        simOverall = 0.36;
      } else if (phraseBeat < 20) {
        simBass = Math.pow(Math.max(0, 1 - beatFract * 3.0), 2) * 0.52;
        simMid = 0.68 + 0.2 * Math.sin(ge.barPhase * Math.PI);
        simHigh = 0.42 * Math.abs(Math.cos(beatFract * Math.PI * 2));
        simOverall = 0.52;
      } else if (phraseBeat < 26) {
        simBass = Math.pow(Math.max(0, 1 - beatFract * 2.8), 2) * 0.58;
        simMid = 0.64 * Math.abs(Math.sin(beatFract * Math.PI * 2));
        simHigh = 0.85 * Math.abs(Math.sin(beatFract * Math.PI * 4));
        simOverall = 0.57;
      } else {
        const kickPower = 0.94;
        simBass = Math.pow(Math.max(0, 1 - beatFract * 2.4), 1.7) * kickPower;
        simMid = currentBeatFloor % 2 === 1 ? Math.pow(Math.max(0, 1 - beatFract * 2.2), 1.6) * 0.78 : 0.38;
        simHigh = 0.90 * Math.pow(Math.abs(Math.sin(beatFract * Math.PI * 4)), 1.4);
        simOverall = 0.82;
      }
      ge.demoMetrics.bass = simBass;
      ge.demoMetrics.mid = simMid;
      ge.demoMetrics.high = simHigh;
      ge.demoMetrics.overall = simOverall;
      ge.demoMetrics.isBeat = isNewBeat && simOverall > 0.12;
      ge.demoMetrics.bpm = simBpm;
      ge.demoMetrics.isPlaying = true;
      metrics = ge.demoMetrics;
    }

    const { bass, mid, high, overall, isBeat } = metrics;
    const activeBpm = THREE.MathUtils.clamp(metrics.bpm || 120, 60, 200);

    // Feed the DivaBody's DSP consumers (5-band approximation of our 3-band
    // split — its face engine clamps + falls back gracefully).
    const dsp = dspRef.current;
    dsp.bass = bass;
    dsp.lowMid = bass * 0.45 + mid * 0.55;
    dsp.mid = mid;
    dsp.highMid = mid * 0.5 + high * 0.5;
    dsp.high = high;
    dsp.energy = overall;
    dsp.beatPulse = ge.beatPulse;
    dsp.bpm = activeBpm;
    dsp.isPlaying = true;
    const omega = (activeBpm / 60) * Math.PI * 2;
    ge.phase += omega * dt;
    if (isBeat && elapsed - ge.lastBeatTime > 0.18) {
      ge.lastBeatTime = elapsed;
      ge.beatCount += 1;
      ge.beatPulse = 1.0;
    } else {
      ge.beatPulse = THREE.MathUtils.damp(ge.beatPulse, 0, 11, dt);
    }

    if (isLeadDancer) {
      beatClock.phase = ge.phase;
      beatClock.beatCount = ge.beatCount;
    }

    // 2. BASELINE TARGETS
    t.rootY = 0;
    t.rootRotY = ge.spinTargetY;
    t.pelvisX = 0;
    t.pelvisZ = 0;
    t.pelvisRotX = 0;
    t.pelvisRotY = 0;
    t.pelvisRotZ = 0;
    const squash = (bass * 0.13 + ge.beatPulse * 0.07) * (preset.bounce ?? 1);
    t.pelvisScaleX = 1 + squash * 0.5;
    t.pelvisScaleY = 1 - squash * 0.6;
    t.pelvisScaleZ = 1 + squash * 0.5;
    t.pelvisY = PY;
    t.footLiftL = 0;
    t.footLiftR = 0;
    t.legStepPitchL = 0;
    t.legStepPitchR = 0;
    t.legStepRollL = 0;
    t.legStepRollR = 0;
    t.hipYawL = 0.06;
    t.hipYawR = -0.06;
    t.extraKneeL = 0;
    t.extraKneeR = 0;
    t.ankleToePitchL = 0;
    t.ankleToePitchR = 0;

    // 3. CHOREOGRAPHY — her OWN library through the group machine
    const choreographer = girlChoreographers[Math.max(0, Math.min(3, dancerIndex))];
    const slot = groupDirector.getSlotState(dancerIndex);
    const choreo = groupDirector.getChoreoState();
    const canonPhase = ge.phase - slot.phaseOffset;

    _gModeCtx.p = canonPhase;
    _gModeCtx.halfP = canonPhase * 0.5;
    _gModeCtx.quarterP = canonPhase * 0.25;
    _gModeCtx.beatPulse = ge.beatPulse;
    _gModeCtx.beatCount = ge.beatCount;
    _gModeCtx.isBeat = isBeat;
    _gModeCtx.bass = bass;
    _gModeCtx.mid = mid;
    _gModeCtx.high = high;
    _gModeCtx.overall = overall;
    _gModeCtx.bpm = activeBpm;
    _gModeCtx.elapsed = elapsed;
    _gModeCtx.dt = dt;
    _gModeCtx.requestSpin = requestDirectSpin;

    let activeMove: DanceMove;
    const species: SpeciesId = 'GIRL';
    let inDuet = false;

    if (
      groupDirector.getDancerCount() >= 2 &&
      choreo.mode === 'DUET_CONTACT' &&
      choreo.duet !== null &&
      slot.duetRole !== 'NONE'
    ) {
      const modeBeat = ge.beatCount - choreo.beatStart;
      const subBeatFrac = (ge.phase / (Math.PI * 2)) % 1;
      _gModeCtx.moveBeat = modeBeat;
      _gModeCtx.moveBar = modeBeat * 0.25;
      _gModeCtx.moveProgress = Math.min(
        1,
        (modeBeat + subBeatFrac) / Math.max(1, choreo.durationBeats)
      );
      const duet = choreo.duet;
      inDuet = true;
      if (slot.duetRole === 'PARTNER_A') {
        duet.poseA(t, _gModeCtx);
        applySpeciesAccent(species, t, _gModeCtx);
        activeMove = DUET_PERSONA_MOVE;
      } else if (slot.duetRole === 'PARTNER_B') {
        duet.poseB(t, _gModeCtx);
        applySpeciesAccent(species, t, _gModeCtx);
        activeMove = DUET_PERSONA_MOVE;
      } else {
        applyHypeCrewResponsePose(species, slot.slotSideSign, t, _gModeCtx);
        activeMove = HYPE_PERSONA_MOVE;
      }
    } else if (
      groupDirector.getDancerCount() >= 2 &&
      choreo.mode === 'SPECIES_SPOTLIGHT' &&
      choreo.signature !== null
    ) {
      const modeBeat = ge.beatCount - choreo.beatStart;
      const subBeatFrac = (ge.phase / (Math.PI * 2)) % 1;
      _gModeCtx.moveBeat = modeBeat;
      _gModeCtx.moveBar = modeBeat * 0.25;
      _gModeCtx.moveProgress = Math.min(
        1,
        (modeBeat + subBeatFrac) / Math.max(1, choreo.durationBeats)
      );
      if (slot.isSpotlightSoloist) {
        const useAlt =
          choreo.signatureAlt !== null &&
          modeBeat >= choreo.durationBeats * 0.5;
        const sig = useAlt
          ? (choreo.signatureAlt as DanceMove)
          : choreo.signature;
        sig.pose(t, _gModeCtx);
        applySpeciesAccent(species, t, _gModeCtx);
        activeMove = sig;
      } else {
        applyHypeCrewResponsePose(species, slot.slotSideSign, t, _gModeCtx);
        activeMove = HYPE_PERSONA_MOVE;
      }
    } else {
      choreographer.setFamily(mapStyleToFamily(forcedStyle));
      choreographer.update(metrics, ge.beatCount, canonPhase, dt, elapsed);
      choreographer.applyPose(t);
      applySpeciesAccent(species, t, _gModeCtx);
      activeMove = choreographer.getActiveMove();
    }

    if (slot.mirror) mirrorGirlPoseInPlace(t);

    // 4. SPIN ACCUMULATOR + REFACE LAW (identical to the animal engine; the
    //    2-pi wrap on reface is absorbed by the DivaBody's wrap-safe
    //    spin-velocity estimator, so hair/skirt never spike).
    const spinDelta = choreographer.consumePendingSpin();
    const groupSpin = groupDirector.consumeGroupSpin(dancerIndex);
    const spinSign = slot.mirror ? -1 : 1;
    if (spinDelta !== 0) ge.spinTargetY += spinDelta * spinSign;
    if (ge.pendingDirectSpin !== 0) {
      ge.spinTargetY += ge.pendingDirectSpin * spinSign;
      ge.pendingDirectSpin = 0;
    }
    if (groupSpin !== 0) ge.spinTargetY += groupSpin * spinSign;
    if (spinDelta !== 0 || groupSpin !== 0) ge.spinGrace = 0.65;

    if (activeMove.id !== ge.lastMoveIdForReface) {
      ge.lastMoveIdForReface = activeMove.id;
      ge.refaceTimer = 1.1;
    }
    if (ge.refaceTimer > 0) ge.refaceTimer -= dt;
    if (ge.spinGrace > 0) ge.spinGrace -= dt;
    if (ge.refaceTimer > 0 && ge.spinGrace <= 0) {
      let wrapped = ge.spinTargetY % (Math.PI * 2);
      if (wrapped > Math.PI) wrapped -= Math.PI * 2;
      else if (wrapped <= -Math.PI) wrapped += Math.PI * 2;
      ge.spinTargetY = wrapped;
      if (Math.abs(ge.spinTargetY) > 0.0001) {
        ge.spinTargetY = THREE.MathUtils.damp(ge.spinTargetY, 0, 4, dt);
      } else {
        ge.spinTargetY = 0;
      }
    }

    // 5. SLOT TRAVEL + FACING (formations / duet anchors)
    if (slotGroupRef.current) {
      slotGroupRef.current.position.x = THREE.MathUtils.damp(
        slotGroupRef.current.position.x,
        slot.targetX,
        2.2,
        dt
      );
      slotGroupRef.current.position.z = THREE.MathUtils.damp(
        slotGroupRef.current.position.z,
        slot.targetZ,
        2.2,
        dt
      );
    }
    ge.facingYaw = THREE.MathUtils.damp(ge.facingYaw, slot.targetYaw, 3, dt);
    t.rootRotY = ge.spinTargetY + ge.facingYaw;

    if (isLeadDancer) {
      groupDirector.update(metrics, ge.beatCount, ge.phase, dt);
    }

    // 6. BREATHING LAYER (the DivaBody adds its own micro thoracic wave on
    //    top — this one is the choreography-authored life layer)
    t.chestScale +=
      Math.sin(elapsed * 1.5) * 0.014 + bass * 0.05 + ge.beatPulse * 0.02;

    ge.lastReportedStyle = activeMove.id;

    // 7. DAMPED APPLICATION -> ExternalDivaPose bridge (the exact damping
    //    profile the rig used in V4/V5: fast 16 for life-critical joints,
    //    medium 12 for style joints — now writing flat fields the DivaBody
    //    consumes at its 120 Hz fixed-step).
    const cur = dampedRef.current;
    const dampFast = 16;
    const dampMed = 12;
    const damp = THREE.MathUtils.damp;

    cur.rootY = damp(cur.rootY, t.rootY, dampFast, dt);
    cur.rootRotY = damp(cur.rootRotY, t.rootRotY, 8, dt);
    cur.pelvisX = damp(cur.pelvisX, t.pelvisX, dampMed, dt);
    cur.pelvisY = damp(cur.pelvisY, t.pelvisY, dampFast, dt);
    cur.pelvisZ = damp(cur.pelvisZ, t.pelvisZ, dampMed, dt);
    cur.pelvisRotX = damp(cur.pelvisRotX, t.pelvisRotX, dampMed, dt);
    cur.pelvisRotY = damp(cur.pelvisRotY, t.pelvisRotY, dampMed, dt);
    cur.pelvisRotZ = damp(cur.pelvisRotZ, t.pelvisRotZ, dampMed, dt);
    cur.pelvisScaleX = damp(cur.pelvisScaleX, t.pelvisScaleX, dampFast, dt);
    cur.pelvisScaleY = damp(cur.pelvisScaleY, t.pelvisScaleY, dampFast, dt);
    cur.pelvisScaleZ = damp(cur.pelvisScaleZ, t.pelvisScaleZ, dampFast, dt);
    cur.lowerSpineX = damp(cur.lowerSpineX, t.lowerSpineX, dampMed, dt);
    cur.lowerSpineY = damp(cur.lowerSpineY, t.lowerSpineY, dampMed, dt);
    cur.lowerSpineZ = damp(cur.lowerSpineZ, t.lowerSpineZ, dampMed, dt);
    cur.chestX = damp(cur.chestX, t.chestX, dampFast, dt);
    cur.chestY = damp(cur.chestY, t.chestY, dampMed, dt);
    cur.chestZ = damp(cur.chestZ, t.chestZ, dampMed, dt);
    cur.chestScale = damp(cur.chestScale, t.chestScale, dampFast, dt);
    cur.neckX = damp(cur.neckX, t.neckX, dampMed, dt);
    cur.neckY = damp(cur.neckY, t.neckY, dampMed, dt);
    cur.neckZ = damp(cur.neckZ, t.neckZ, dampMed, dt);
    cur.headX = damp(cur.headX, t.headX, dampFast, dt);
    cur.headY = damp(cur.headY, t.headY, dampMed, dt);
    cur.headZ = damp(cur.headZ, t.headZ, dampMed, dt);

    cur.shoulderLX = damp(cur.shoulderLX, t.shoulderLX, dampMed, dt);
    cur.shoulderLY = damp(cur.shoulderLY, t.shoulderLY, dampMed, dt);
    cur.shoulderLZ = damp(cur.shoulderLZ, t.shoulderLZ, dampMed, dt);
    cur.elbowLX = damp(cur.elbowLX, t.elbowLX, dampFast, dt);
    cur.elbowLY = damp(cur.elbowLY, t.elbowLY, dampMed, dt);
    cur.wristLX = damp(cur.wristLX, t.wristLX, dampFast, dt);
    cur.wristLZ = damp(cur.wristLZ, t.wristLZ, dampFast, dt);
    cur.shoulderRX = damp(cur.shoulderRX, t.shoulderRX, dampMed, dt);
    cur.shoulderRY = damp(cur.shoulderRY, t.shoulderRY, dampMed, dt);
    cur.shoulderRZ = damp(cur.shoulderRZ, t.shoulderRZ, dampMed, dt);
    cur.elbowRX = damp(cur.elbowRX, t.elbowRX, dampFast, dt);
    cur.elbowRY = damp(cur.elbowRY, t.elbowRY, dampMed, dt);
    cur.wristRX = damp(cur.wristRX, t.wristRX, dampFast, dt);
    cur.wristRZ = damp(cur.wristRZ, t.wristRZ, dampFast, dt);

    cur.footLiftL = damp(cur.footLiftL, t.footLiftL, dampFast, dt);
    cur.footLiftR = damp(cur.footLiftR, t.footLiftR, dampFast, dt);
    cur.legStepPitchL = damp(cur.legStepPitchL, t.legStepPitchL, dampFast, dt);
    cur.legStepPitchR = damp(cur.legStepPitchR, t.legStepPitchR, dampFast, dt);
    cur.legStepRollL = damp(cur.legStepRollL, t.legStepRollL, dampMed, dt);
    cur.legStepRollR = damp(cur.legStepRollR, t.legStepRollR, dampMed, dt);
    cur.hipYawL = damp(cur.hipYawL, t.hipYawL, dampMed, dt);
    cur.hipYawR = damp(cur.hipYawR, t.hipYawR, dampMed, dt);
    cur.ankleToePitchL = damp(cur.ankleToePitchL, t.ankleToePitchL, dampFast, dt);
    cur.ankleToePitchR = damp(cur.ankleToePitchR, t.ankleToePitchR, dampFast, dt);

    // ---- write the bridge snapshot (zero allocation) ----------------------
    ext.rootRotY = cur.rootRotY;
    ext.pelvisX = cur.pelvisX;
    ext.pelvisZ = cur.pelvisZ;
    ext.pelvisYOffset = cur.pelvisY - PY + cur.rootY;
    ext.pelvisRotX = cur.pelvisRotX;
    ext.pelvisRotY = cur.pelvisRotY;
    ext.pelvisRotZ = cur.pelvisRotZ;
    ext.pelvisScaleX = cur.pelvisScaleX;
    ext.pelvisScaleY = cur.pelvisScaleY;
    ext.pelvisScaleZ = cur.pelvisScaleZ;
    ext.spinePitch = cur.lowerSpineX + cur.chestX;
    ext.spineYaw = cur.lowerSpineY + cur.chestY;
    ext.spineRoll = cur.lowerSpineZ + cur.chestZ;
    ext.chestScale = cur.chestScale;
    ext.neckX = cur.neckX;
    ext.neckY = cur.neckY;
    ext.neckZ = cur.neckZ;
    ext.headX = cur.headX;
    ext.headY = cur.headY;
    ext.headZ = cur.headZ;
    ext.shoulderLX = cur.shoulderLX;
    ext.shoulderLY = cur.shoulderLY;
    ext.shoulderLZ = cur.shoulderLZ;
    ext.elbowLX = cur.elbowLX;
    ext.elbowLY = cur.elbowLY;
    ext.wristLX = cur.wristLX;
    ext.wristLZ = cur.wristLZ;
    ext.shoulderRX = cur.shoulderRX;
    ext.shoulderRY = cur.shoulderRY;
    ext.shoulderRZ = cur.shoulderRZ;
    ext.elbowRX = cur.elbowRX;
    ext.elbowRY = cur.elbowRY;
    ext.wristRX = cur.wristRX;
    ext.wristRZ = cur.wristRZ;
    ext.footLiftL = cur.footLiftL;
    ext.footLiftR = cur.footLiftR;
    ext.legStepPitchL = cur.legStepPitchL;
    ext.legStepPitchR = cur.legStepPitchR;
    ext.legStepRollL = cur.legStepRollL;
    ext.legStepRollR = cur.legStepRollR;
    ext.hipYawL = cur.hipYawL;
    ext.hipYawR = cur.hipYawR;
    ext.ankleToePitchL = cur.ankleToePitchL;
    ext.ankleToePitchR = cur.ankleToePitchR;
    ext.faceIntent = activeMove.faceIntent ?? 'joyful';
    ext.hairCarriage = (activeMove.tailCarriage ?? 'neutral') as HairCarriage;
    ext.isDuet = inDuet;
    ext.partnerYaw = inDuet ? slot.targetYaw : 0;
  });

  // ==========================================================================
  // RENDER — one slot group (formations/travel) hosting the DivaBody
  // ==========================================================================
  return (
    <group ref={slotGroupRef} position={position} scale={rigScale}>
      <DivaBody
        externalPose={externalPoseRef as React.MutableRefObject<ExternalDivaPose | null>}
        audio={dspRef}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        scale={1}
        floorY={0}
        primaryCoutureColor={preset.outfitTop}
        skirtCoutureColor={preset.outfitSkirt}
        accentNeonColor={preset.outfitTrim}
        skinToneColor={preset.skin}
        hairColor={preset.furDark}
        anatomy={{
          bustVolumeScale: 1.12,
          bustFirmness: 1.0,
          hipCurveScale: 1.1,
          gluteProjectionScale: 1.08,
          waistTaperScale: 1.06,
          muscleToneScale: 1.0,
          irisColor: '#4d7c6f',
          lipTintColor: '#b44858',
          nailPolishColor: '#cf5167',
          intimateLayerColor: '#2a1524',
        }}
        wardrobe={{
          // V5.1 GLAMOUR + PERF: the intimate silk under-layer sits fully
          // beneath the couture corset bodice + dance shorts — hidden, so
          // its meshes AND its per-frame soft-body rebuilds are skipped.
          showIntimateLayer: false,
          showCorsetBodice: true,
          showDanceShorts: true,
          showFlaredSkirt: true,
          showDanceBoots: true,
          showJewelry: true,
        }}
      />
    </group>
  );
}
