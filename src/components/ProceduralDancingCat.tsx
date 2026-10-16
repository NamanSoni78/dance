'use client';

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, Html, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import {
  FACE_INTENT_OVERRIDES,
  TAIL_CARRIAGE_OFFSETS,
  type JointTargets,
  type DanceMove,
  type MoveContext,
} from '@/lib/danceMoves';
import {
  dancerChoreographers,
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
  DANCE_STYLE_PILLS,
  type DanceStyle,
} from '@/lib/danceStyleMapping';
import { getSpeciesPreset, type SpeciesId } from '@/lib/species';

// ============================================================================
// 1. PUBLIC INTERFACES & TYPES
// ============================================================================

export interface AudioMetrics {
  bass: number;      // 0.0 to 1.0 (Kick drum / Sub-bass: 20-140 Hz)
  mid: number;       // 0.0 to 1.0 (Snare / Vocals / Groove: 140-900 Hz)
  high: number;      // 0.0 to 1.0 (Hi-hats / Treble: 1.5k-6k Hz)
  overall: number;   // 0.0 to 1.0 (Smoothed RMS energy)
  isBeat: boolean;   // True on the exact frame a kick drum transient hits
  bpm: number;       // Detected song tempo (e.g., 90 to 175 BPM)
  isPlaying: boolean;
}

export type { DanceStyle };

export interface ProceduralDancingCatProps {
  /** Called at 60-144 FPS inside useFrame with zero heap allocations */
  getMetrics?: () => AudioMetrics;
  /** Forces the internal Demo Beat Simulator even if getMetrics is provided */
  demoMode?: boolean;
  /** Override automatic choreography selection */
  forcedStyle?: DanceStyle;
  /** Toggle built-in interactive debug HUD */
  showHud?: boolean;
  /** Initial position of the character root */
  position?: [number, number, number];
  /** Uniform character scale (V2: overridden by the species preset) */
  scale?: number;
  /** V2 GROUP CREW: which animal this rig is (drives silhouette + materials) */
  species?: SpeciesId;
  /** V2 GROUP CREW: crew slot index (0 = lead / beat-clock writer) */
  dancerIndex?: number;
}

// ============================================================================
// 2. PRE-ALLOCATED SCRATCH OBJECTS & CONSTANTS (ZERO GC OVERHEAD)
// ============================================================================

const LEG_SEGMENT_LENGTH = 0.39; // Thigh = 0.39m, Shin = 0.39m
const TWO_LEG_LENGTH = LEG_SEGMENT_LENGTH * 2; // 0.78m
const SNEAKER_SOLE_HEIGHT = 0.12; // 0.78m + 0.12m = 0.90m Pelvis Rest Height
const PELVIS_REST_Y = TWO_LEG_LENGTH + SNEAKER_SOLE_HEIGHT;

const _scratchColorA = new THREE.Color();
const _scratchColorB = new THREE.Color();
const _neonCyan = new THREE.Color('#00f5ff');
const _neonMagenta = new THREE.Color('#ff007f');
const _neonLime = new THREE.Color('#39ff14');
const _neonGold = new THREE.Color('#ffaa00');

/**
 * Engine-extended joint targets: the lib's JointTargets covers every channel
 * dance moves may write; the engine ADDS the face channels it owns and
 * auto-drives AFTER the choreographer applies its pose (jaw, ears, pupils,
 * visor). CatJointTargets is a structural superset, so it flows into
 * choreographer.applyPose(t) without adaptation.
 */
interface CatJointTargets extends JointTargets {
  jawX: number;
  earLX: number;
  earLZ: number;
  earRX: number;
  earRZ: number;
  pupilScale: number;
  visorRotX: number;
  visorY: number;
}

/**
 * V2 MIRROR MODE: flips a pose left/right IN PLACE (zero allocation).
 * Sagittal rotations (X) keep their sign; yaw/roll (Y/Z) and lateral
 * positions (X) flip; every left/right channel pair is swapped. The result
 * is a true mirror image, so two dancers facing the camera mirror each
 * other perfectly in MIRROR sync mode.
 */
function mirrorPoseInPlace(t: CatJointTargets): void {
  let tmp = 0;
  // Pelvis / spine / chest / neck / head lateral channels
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
  // Arms: swap L/R pairs (Y/Z flip inside the swap)
  tmp = t.shoulderLX; t.shoulderLX = t.shoulderRX; t.shoulderRX = tmp;
  tmp = t.shoulderLY; t.shoulderLY = -t.shoulderRY; t.shoulderRY = -tmp;
  tmp = t.shoulderLZ; t.shoulderLZ = -t.shoulderRZ; t.shoulderRZ = -tmp;
  tmp = t.elbowLX; t.elbowLX = t.elbowRX; t.elbowRX = tmp;
  tmp = t.elbowLY; t.elbowLY = -t.elbowRY; t.elbowRY = -tmp;
  tmp = t.wristLX; t.wristLX = t.wristRX; t.wristRX = tmp;
  tmp = t.wristLZ; t.wristLZ = -t.wristRZ; t.wristRZ = -tmp;
  // Legs: swap L/R pairs
  tmp = t.footLiftL; t.footLiftL = t.footLiftR; t.footLiftR = tmp;
  tmp = t.legStepPitchL; t.legStepPitchL = t.legStepPitchR; t.legStepPitchR = tmp;
  tmp = t.legStepRollL; t.legStepRollL = -t.legStepRollR; t.legStepRollR = -tmp;
  tmp = t.hipYawL; t.hipYawL = -t.hipYawR; t.hipYawR = -tmp;
  tmp = t.extraKneeL; t.extraKneeL = t.extraKneeR; t.extraKneeR = tmp;
  tmp = t.ankleToePitchL; t.ankleToePitchL = t.ankleToePitchR; t.ankleToePitchR = tmp;
}

// ----------------------------------------------------------------------------
// V3 GROUP CHOREOGRAPHER (V2.5 package) — mode-persona pseudo-moves + the
// shared per-frame mode context.
//
// DuetMove / hype poses don't carry faceIntent / tailCarriage / family the
// way solo DanceMoves do, so the engine blends these personas for expression,
// tail carriage and family emissive palettes during DUET_CONTACT /
// SPECIES_SPOTLIGHT hype roles. (The spotlight soloist uses its real
// signature DanceMove.)
// ----------------------------------------------------------------------------
const DUET_PERSONA_MOVE: DanceMove = {
  id: '__PARTNER_DUET__',
  name: 'Partner Duet',
  family: 'BOLLYWOOD',
  origin: '',
  energy: 0.75,
  tempoFit: [90, 170],
  defaultBars: 4,
  tags: ['groove', 'arms'],
  faceIntent: 'joyful',
  tailCarriage: 'sway',
  pose: () => {}, // persona only — the duet's poseA/poseB runs instead
};

const HYPE_PERSONA_MOVE: DanceMove = {
  id: '__HYPE_CREW__',
  name: 'Hype Crew',
  family: 'GLOBAL_PARTY',
  origin: '',
  energy: 0.55,
  tempoFit: [90, 170],
  defaultBars: 4,
  tags: ['groove'],
  faceIntent: 'smug',
  tailCarriage: 'high',
  pose: () => {}, // persona only — the hype pose runs instead
};

/**
 * Shared mode context — built and consumed within a single useFrame call
 * (useFrame runs sequentially per dancer, so one scratch object is safe).
 * `requestSpin` is patched to the CURRENT dancer's stable buffer callback
 * before the pose is evaluated — duet moves spin through the same Reface-Law
 * accumulator as solo spins.
 */
const _modeCtx: MoveContext = {
  p: 0, halfP: 0, quarterP: 0,
  beatPulse: 0, beatCount: 0, isBeat: false,
  moveBeat: 0, moveBar: 0, moveProgress: 0,
  bass: 0, mid: 0, high: 0, overall: 0,
  bpm: 120, elapsed: 0, dt: 0.016,
  requestSpin: () => {},
};

function createInitialTargets(): CatJointTargets {
  return {
    rootY: 0,
    rootRotY: 0,
    pelvisY: PELVIS_REST_Y,
    pelvisX: 0,
    pelvisZ: 0,
    pelvisRotX: 0,
    pelvisRotY: 0,
    pelvisRotZ: 0,
    pelvisScaleX: 1,
    pelvisScaleY: 1,
    pelvisScaleZ: 1,
    lowerSpineX: 0,
    lowerSpineY: 0,
    lowerSpineZ: 0,
    chestX: 0,
    chestY: 0,
    chestZ: 0,
    chestScale: 1,
    neckX: 0,
    neckY: 0,
    neckZ: 0,
    headX: 0,
    headY: 0,
    headZ: 0,
    jawX: 0.04,
    earLX: 0,
    earLZ: 0.18,
    earRX: 0,
    earRZ: -0.18,
    pupilScale: 1,
    visorRotX: -0.55,
    visorY: 0.16,
    shoulderLX: 0.1,
    shoulderLY: 0,
    shoulderLZ: 0.25,
    elbowLX: -0.35,
    elbowLY: 0,
    wristLX: 0,
    wristLZ: 0,
    shoulderRX: 0.1,
    shoulderRY: 0,
    shoulderRZ: -0.25,
    elbowRX: -0.35,
    elbowRY: 0,
    wristRX: 0,
    wristRZ: 0,
    footLiftL: 0,
    footLiftR: 0,
    legStepPitchL: 0,
    legStepPitchR: 0,
    legStepRollL: 0,
    legStepRollR: 0,
    hipYawL: 0.06,
    hipYawR: -0.06,
    extraKneeL: 0,
    extraKneeR: 0,
    ankleToePitchL: 0,
    ankleToePitchR: 0,
  };
}

// ============================================================================
// 3. MAIN COMPONENT
// ============================================================================

export const ProceduralDancingCat: React.FC<ProceduralDancingCatProps> = ({
  getMetrics,
  demoMode = false,
  forcedStyle = 'AUTO',
  showHud = true,
  position = [0, 0, 0],
  scale = 1,
  species = 'CAT',
  dancerIndex = 0,
}) => {
  // V2 species preset — silhouette, materials and accent multipliers.
  // The 24-joint rig itself is IDENTICAL for every species, so all 42 dance
  // moves work unchanged for the whole crew.
  const preset = useMemo(() => getSpeciesPreset(species), [species]);
  const isLeadDancer = dancerIndex === 0;
  // V3: stable zero-identity-change callback the shared mode context uses
  // for duet/spotlight requestSpin — buffers into the engine spin accumulator
  // (same Reface-Law path as choreographer spins). The closure resolves
  // engineRef lazily, so declaring it before the ref is safe.
  const requestDirectSpin = useMemo(
    () => (radians: number) => {
      engineRef.current.pendingDirectSpin += radians;
    },
    []
  );
  // UI State for Interactive HUD (only updates when user clicks a HUD button)
  const [hudStyle, setHudStyle] = useState<DanceStyle>(forcedStyle);
  const [hudDemo, setHudDemo] = useState<boolean>(demoMode);
  const [hudBpm, setHudBpm] = useState<number>(128);
  const [visorDown, setVisorDown] = useState<boolean>(false);
  const [activeStateLabel, setActiveStateLabel] = useState<string>('IDLE');

  useEffect(() => {
    setHudStyle(forcedStyle);
  }, [forcedStyle]);

  useEffect(() => {
    setHudDemo(demoMode);
  }, [demoMode]);

  // --------------------------------------------------------------------------
  // 24+ HIERARCHICAL SKELETAL JOINT REFS
  // --------------------------------------------------------------------------
  const rootRef = useRef<THREE.Group>(null!);
  const pelvisRef = useRef<THREE.Group>(null!);

  // 3-Segment Spine
  const lowerSpineRef = useRef<THREE.Group>(null!);
  const chestRef = useRef<THREE.Group>(null!);
  const neckRef = useRef<THREE.Group>(null!);

  // Expressive Head, Jaw, Eyes, Ears, Whiskers, Visor
  const headRef = useRef<THREE.Group>(null!);
  const jawRef = useRef<THREE.Group>(null!);
  const eyeLRef = useRef<THREE.Group>(null!);
  const eyeRRef = useRef<THREE.Group>(null!);
  const pupilLRef = useRef<THREE.Mesh>(null!);
  const pupilRRef = useRef<THREE.Mesh>(null!);
  const earLRef = useRef<THREE.Group>(null!);
  const earRRef = useRef<THREE.Group>(null!);
  const whiskerLRef = useRef<THREE.Group>(null!);
  const whiskerRRef = useRef<THREE.Group>(null!);
  const visorRef = useRef<THREE.Group>(null!);

  // Left Arm Chain
  const shoulderLRef = useRef<THREE.Group>(null!);
  const elbowLRef = useRef<THREE.Group>(null!);
  const wristLRef = useRef<THREE.Group>(null!);

  // Right Arm Chain
  const shoulderRRef = useRef<THREE.Group>(null!);
  const elbowRRef = useRef<THREE.Group>(null!);
  const wristRRef = useRef<THREE.Group>(null!);

  // Left Leg Chain
  const hipLRef = useRef<THREE.Group>(null!);
  const kneeLRef = useRef<THREE.Group>(null!);
  const ankleLRef = useRef<THREE.Group>(null!);

  // Right Leg Chain
  const hipRRef = useRef<THREE.Group>(null!);
  const kneeRRef = useRef<THREE.Group>(null!);
  const ankleRRef = useRef<THREE.Group>(null!);

  // 5-Segment Kinematic Whip Tail
  const tail0Ref = useRef<THREE.Group>(null!);
  const tail1Ref = useRef<THREE.Group>(null!);
  const tail2Ref = useRef<THREE.Group>(null!);
  const tail3Ref = useRef<THREE.Group>(null!);
  const tail4Ref = useRef<THREE.Group>(null!);
  const tailRefs = useMemo(
    () => [tail0Ref, tail1Ref, tail2Ref, tail3Ref, tail4Ref],
    []
  );

  // Reactive Floor Ring Ref
  const floorRingRef = useRef<THREE.Mesh>(null!);

  // V2 GROUP CREW: outer slot group — damps toward the group director's
  // formation slot target each frame (the rig inside keeps its local floor
  // lock, so dancers just "moonwalk-glide" between slots, which reads great).
  const slotGroupRef = useRef<THREE.Group>(null!);

  // --------------------------------------------------------------------------
  // SHARED PROCEDURAL MATERIALS (PRE-ALLOCATED)
  // --------------------------------------------------------------------------
  const materials = useMemo(() => {
    // V1.5 Cat Model 2.0: sheen-velvet fur + patent-leather sneaker clearcoat.
    // (MeshPhysicalMaterial sheen gives a cheap velvet rim-light under the
    // club neon without any extra light sources or textures.)
    // V2: every color is driven by the SPECIES preset — cat, dog and mouse
    // share the exact same material graph.
    // Baked pupil geometry: the engine's uniform pupilScale dilation
    // multiplies on top cleanly because the slit lives in the geometry.
    const pupilGeo = new THREE.CircleGeometry(0.032, 18);
    if (preset.pupilStyle === 'SLIT') {
      pupilGeo.scale(0.62, 1, 1); // vertical cat-slit pupil
    } else {
      pupilGeo.scale(0.88, 0.88, 1); // big round puppy / mouse pupil
    }

    return {
      pupilGeo,
      darkFur: new THREE.MeshPhysicalMaterial({
        color: preset.furDark,
        roughness: 0.62,
        metalness: 0.05,
        sheen: 0.55,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color(preset.sheenColor),
      }),
      creamFur: new THREE.MeshPhysicalMaterial({
        color: preset.furCream,
        roughness: 0.66,
        metalness: 0.04,
        sheen: 0.4,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color('#ffe3c4'),
      }),
      pinkSkin: new THREE.MeshStandardMaterial({
        color: preset.skinPink,
        roughness: 0.4,
        metalness: 0.05,
      }),
      mouthInterior: new THREE.MeshStandardMaterial({
        color: '#6b1d2f',
        roughness: 0.7,
      }),
      hoodieMat: new THREE.MeshStandardMaterial({
        color: '#25293e',
        roughness: 0.45,
        metalness: 0.15,
      }),
      chromeMat: new THREE.MeshStandardMaterial({
        color: '#d8e2ef',
        roughness: 0.18,
        metalness: 0.88,
      }),
      visorGlass: new THREE.MeshPhysicalMaterial({
        color: '#070b19',
        emissive: '#00f5ff',
        emissiveIntensity: 0.65,
        roughness: 0.1,
        metalness: 0.9,
        clearcoat: 1.0,
      }),
      eyeSclera: new THREE.MeshStandardMaterial({
        color: '#10131d',
        roughness: 0.15,
      }),
      eyeIris: new THREE.MeshStandardMaterial({
        color: '#00f5ff',
        emissive: '#00d9ff',
        emissiveIntensity: 1.2,
        roughness: 0.2,
      }),
      eyePupil: new THREE.MeshBasicMaterial({
        color: '#050508',
      }),
      eyeCatchlight: new THREE.MeshBasicMaterial({
        color: '#ffffff',
      }),
      neonPulse: new THREE.MeshStandardMaterial({
        color: '#00f5ff',
        emissive: '#00f5ff',
        emissiveIntensity: 1.5,
        roughness: 0.2,
      }),
      sneakerBody: new THREE.MeshPhysicalMaterial({
        color: '#f4f6fb',
        roughness: 0.32,
        metalness: 0.08,
        clearcoat: 0.55,
        clearcoatRoughness: 0.35,
      }),
      sneakerAccent: new THREE.MeshStandardMaterial({
        color: preset.sneakerAccent,
        roughness: 0.3,
        metalness: 0.2,
      }),
      whiskerMat: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#a2f2ff',
        emissiveIntensity: 0.3,
        roughness: 0.3,
      }),
      floorRingMat: new THREE.MeshBasicMaterial({
        color: '#00f5ff',
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      }),
    };
  }, [preset]);

  // V1.5 GPU hygiene: dispose the shared materials + baked pupil geometry
  useEffect(() => {
    return () => {
      (
        Object.values(materials) as (THREE.Material | THREE.BufferGeometry)[]
      ).forEach((asset) => asset.dispose());
    };
  }, [materials]);

  // --------------------------------------------------------------------------
  // ZERO-ALLOCATION ENGINE STATE (MUTATED INSIDE useFrame)
  // --------------------------------------------------------------------------
  const engineRef = useRef({
    targets: createInitialTargets(),
    phase: 0, // Continuous beat phase (radians, 2π per beat)
    tailPhase: 0, // Continuous phase for 5-segment travelling wave
    beatCount: 0, // Total beats elapsed
    barPhase: 0, // Sub-beat accumulator for Demo Simulator
    lastBeatTime: -1,
    beatPulse: 0, // Decaying impulse [0..1] triggered on isBeat
    spinTargetY: 0, // Accumulated 360-degree spin angle in radians
    // V2 BF-15 REFACE LAW: spin residue must never leave the dancer facing
    // the back wall for a whole song. On every move transition a 1.1 s
    // reface window arms; once any in-flight spin has settled (spinGrace),
    // the accumulator is wrapped into (-PI, PI] and damped to 0 (front).
    refaceTimer: 0,
    spinGrace: 0,
    lastMoveIdForReface: '',
    // V2 GROUP CREW: slot travel + facing (separate from the spin accumulator
    // so spins and formation turns compose cleanly)
    facingYaw: 0,
    // V3: duet/spotlight moves call ctx.requestSpin through a stable
    // per-instance callback that buffers here (consumed right after the
    // pose is evaluated — same Reface-Law accumulator as solo spins)
    pendingDirectSpin: 0,
    nextBlinkTime: 2.4,
    blinkDuration: 0.13,
    isBlinking: false,
    earTwitchL: 0,
    earTwitchR: 0,
    lastReportedStyle: '',
    // Grand Choreographer blend state: damped toward the active move's face
    // intent + tail carriage so move switches never snap the expression.
    faceJawBias: 0,
    facePupilBias: 0,
    faceEarPitch: 0,
    faceEarRoll: 0,
    faceVisorDrop: 0,
    tailBasePitch: 0.15,
    tailCurl: 0.05,
    tailAmpScale: 1.0,
    tailSpeedScale: 1.0,
    // V2 species accent multipliers (mounted once per rig from the preset)
    speciesWag: 1.0,
    speciesBounce: 1.0,
    speciesEarTwitch: 1.0,
    speciesTailBasePitch: 0.0,
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

  // V2: mount the species accent multipliers onto the engine state once.
  useEffect(() => {
    const eng = engineRef.current;
    eng.speciesWag = preset.tailWagSpeed;
    eng.speciesBounce = preset.bounce;
    eng.speciesEarTwitch = preset.earTwitch;
    eng.speciesTailBasePitch = preset.tailBasePitch;
  }, [preset]);

  // --------------------------------------------------------------------------
  // REAL-TIME CHOREOGRAPHY & KINEMATIC LOOP (60 - 144 FPS)
  // --------------------------------------------------------------------------
  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const elapsed = state.clock.elapsedTime;
    const eng = engineRef.current;
    const t = eng.targets;

    // 1. OBTAIN AUDIO METRICS OR SYNTHESIZE DEMO BEAT
    //    (The silent demo simulator only runs while `demoMode` is active —
    //     e.g. before the browser unlocks audio. When real audio is paused
    //     or ends, the cat cleanly falls back to the IDLE breathing state.)
    const externalMetrics = getMetrics ? getMetrics() : undefined;
    const useSimulator = hudDemo || !externalMetrics;

    let metrics: AudioMetrics;

    if (!useSimulator && externalMetrics) {
      metrics = externalMetrics;
    } else {
      // Built-in Zero-Allocation Demo Beat Simulator
      // Cycles through a 32-beat musical arrangement so all 5 states can be observed in AUTO mode
      const simBpm = hudBpm;
      const beatsPerSec = simBpm / 60;
      const prevBeatFloor = Math.floor(eng.barPhase);
      eng.barPhase += dt * beatsPerSec;
      const currentBeatFloor = Math.floor(eng.barPhase);
      const beatFract = eng.barPhase - currentBeatFloor;
      const isNewBeat = currentBeatFloor !== prevBeatFloor;

      // 32-beat arrangement cycle:
      // Beats 0..3: Idle Intro | 4..11: Hip-Hop Groove | 12..19: Disco Funk
      // 20..25: Melbourne Shuffle | 26..31: Bass Drop Breakdance
      const phraseBeat = ((currentBeatFloor % 32) + 32) % 32;

      let simBass = 0;
      let simMid = 0;
      let simHigh = 0;
      let simOverall = 0;

      if (phraseBeat < 4 && hudStyle === 'AUTO') {
        // Low-energy intro
        simBass = 0.08 * Math.exp(-beatFract * 6);
        simMid = 0.05;
        simHigh = 0.06 * Math.abs(Math.sin(beatFract * Math.PI * 4));
        simOverall = 0.07;
      } else if (phraseBeat < 12 && hudStyle === 'AUTO') {
        // Hip-Hop Groove (Medium energy, crisp kick & snare)
        simBass = Math.pow(Math.max(0, 1 - beatFract * 3.2), 2) * 0.62;
        simMid =
          currentBeatFloor % 2 === 1
            ? Math.pow(Math.max(0, 1 - beatFract * 2.5), 1.8) * 0.58
            : 0.22;
        simHigh = 0.32 * Math.abs(Math.sin(beatFract * Math.PI * 2));
        simOverall = 0.36;
      } else if (phraseBeat < 20 && hudStyle === 'AUTO') {
        // Disco Funk (Strong melodic mid-groove)
        simBass = Math.pow(Math.max(0, 1 - beatFract * 3.0), 2) * 0.52;
        simMid = 0.68 + 0.2 * Math.sin(eng.barPhase * Math.PI);
        simHigh = 0.42 * Math.abs(Math.cos(beatFract * Math.PI * 2));
        simOverall = 0.52;
      } else if (phraseBeat < 26 && hudStyle === 'AUTO') {
        // Melbourne Shuffle (High treble/hi-hat energy + fast mid)
        simBass = Math.pow(Math.max(0, 1 - beatFract * 2.8), 2) * 0.58;
        simMid = 0.64 * Math.abs(Math.sin(beatFract * Math.PI * 2));
        simHigh = 0.85 * Math.abs(Math.sin(beatFract * Math.PI * 4));
        simOverall = 0.57;
      } else {
        // Bass Drop / High-intensity generator (also used when manual style is selected)
        const isBassDropForced =
          hudStyle === 'BASS_DROP_BREAKDANCE' ||
          (hudStyle === 'AUTO' && phraseBeat >= 26);
        const kickPower = isBassDropForced ? 0.94 : 0.65;
        simBass = Math.pow(Math.max(0, 1 - beatFract * 2.4), 1.7) * kickPower;
        simMid =
          currentBeatFloor % 2 === 1
            ? Math.pow(Math.max(0, 1 - beatFract * 2.2), 1.6) * 0.78
            : 0.38;
        simHigh =
          (0.45 + (isBassDropForced ? 0.45 : 0.2)) *
          Math.pow(Math.abs(Math.sin(beatFract * Math.PI * 4)), 1.4);
        simOverall = isBassDropForced ? 0.82 : 0.52;
      }

      eng.demoMetrics.bass = simBass;
      eng.demoMetrics.mid = simMid;
      eng.demoMetrics.high = simHigh;
      eng.demoMetrics.overall = simOverall;
      eng.demoMetrics.isBeat = isNewBeat && simOverall > 0.12;
      eng.demoMetrics.bpm = simBpm;
      eng.demoMetrics.isPlaying = true;
      metrics = eng.demoMetrics;
    }

    const { bass, mid, high, overall, isBeat } = metrics;
    const activeBpm = THREE.MathUtils.clamp(metrics.bpm || 120, 60, 200);
    const omega = (activeBpm / 60) * Math.PI * 2; // 1 full cycle (2π) per beat

    // Advance continuous phase accumulators (tail speed scaled by the active
    // move's carriage blend — a one-frame lag is imperceptible)
    eng.phase += omega * dt;
    eng.tailPhase += omega * (0.75 + overall * 0.85) * eng.tailSpeedScale * dt;

    // Handle beat transient impulse (360-degree spins are now requested by
    // individual moves through ctx.requestSpin, not by the engine state)
    if (isBeat && elapsed - eng.lastBeatTime > 0.18) {
      eng.lastBeatTime = elapsed;
      eng.beatCount += 1;
      eng.beatPulse = 1.0;
    } else {
      eng.beatPulse = THREE.MathUtils.damp(eng.beatPulse, 0, 11, dt);
    }

    // Publish the shared musical clock so the stage camera sequencer cuts on
    // exactly the bar boundaries the crew dances to (single writer = LEAD
    // dancer only; followers and the camera are readers)
    if (isLeadDancer) {
      beatClock.phase = eng.phase;
      beatClock.beatCount = eng.beatCount;
    }

    // 3. RESET BASELINE TARGETS BEFORE STYLE LAYERING
    const p = eng.phase; // continuous beat phase (2*PI per beat)

    t.rootY = 0;
    t.rootRotY = eng.spinTargetY;
    t.pelvisX = 0;
    t.pelvisZ = 0;
    t.pelvisRotX = 0;
    t.pelvisRotY = 0;
    t.pelvisRotZ = 0;

    // Squash-and-stretch driven by kick drum transient
    // V2: species bounce multiplier — the mouse pops quicker, the dog heavier
    const squash = (bass * 0.14 + eng.beatPulse * 0.08) * eng.speciesBounce;
    t.pelvisScaleX = 1 + squash * 0.55;
    t.pelvisScaleY = 1 - squash * 0.65;
    t.pelvisScaleZ = 1 + squash * 0.55;

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

    // ------------------------------------------------------------------------
    // 3.5 GRAND CHOREOGRAPHER — 42-move non-repetitive sequencer
    //     (hard 4-bar hold cap, bar-boundary switches, 6-move recency window,
    //      energy matching, 0.25 s pose crossfade, seeded per-song RNG —
    //      the "same move for a whole minute" problem is now impossible)
    //
    //     V2 GROUP CREW: every dancer runs its OWN choreographer instance
    //     (dancerChoreographers[dancerIndex]). Synced modes seed them
    //     identically, so identical inputs deterministically produce the
    //     identical move stream — perfect unison with zero coordination.
    //     CANON shifts this dancer's choreographer clock by the director's
    //     phase offset; MIRROR flips the applied pose L/R afterwards.
    //
    //     V3 GROUP CHOREOGRAPHER (V2.5 package): the group director rotates
    //     three choreographic modes on bar-locked phrase boundaries —
    //       DUET_CONTACT      → authored 41-channel partner choreographies
    //                           (poseA / poseB / hype-backdrop), which
    //                           REPLACE the choreographer for their duration
    //       SPECIES_SPOTLIGHT → featured species runs a signature move at
    //                           the downstage apex, crew runs hype poses
    //       FORMATION_GROUP   → the classic choreographer path below
    //     The species accent layer (dog weight-shift, mouse hop snap, cat
    //     shoulder isolations) stacks on every non-hype pose.
    // ------------------------------------------------------------------------
    const choreographer = dancerChoreographers[
      Math.max(0, Math.min(3, dancerIndex))
    ];
    const slot = groupDirector.getSlotState(dancerIndex);
    const choreo = groupDirector.getChoreoState();
    const canonPhase = eng.phase - slot.phaseOffset;

    // Build the shared mode context for this dancer's frame (zero alloc).
    _modeCtx.p = canonPhase;
    _modeCtx.halfP = canonPhase * 0.5;
    _modeCtx.quarterP = canonPhase * 0.25;
    _modeCtx.beatPulse = eng.beatPulse;
    _modeCtx.beatCount = eng.beatCount;
    _modeCtx.isBeat = isBeat;
    _modeCtx.bass = bass;
    _modeCtx.mid = mid;
    _modeCtx.high = high;
    _modeCtx.overall = overall;
    _modeCtx.bpm = activeBpm;
    _modeCtx.elapsed = elapsed;
    _modeCtx.dt = dt;
    _modeCtx.requestSpin = requestDirectSpin;

    let activeMove: DanceMove;

    if (
      groupDirector.getDancerCount() >= 2 &&
      choreo.mode === 'DUET_CONTACT' &&
      choreo.duet !== null &&
      slot.duetRole !== 'NONE'
    ) {
      // ---- DUET_CONTACT: authored partner choreography --------------------
      // Mode-locked progress (Law 2: phaseOffset is 0 here, and move time is
      // measured from the mode's start beat so the authored envelope spans
      // exactly the duet's durationBars).
      const modeBeat = eng.beatCount - choreo.beatStart;
      const subBeatFrac = (eng.phase / (Math.PI * 2)) % 1;
      _modeCtx.moveBeat = modeBeat;
      _modeCtx.moveBar = modeBeat * 0.25;
      _modeCtx.moveProgress = Math.min(
        1,
        (modeBeat + subBeatFrac) / Math.max(1, choreo.durationBeats)
      );
      const duet = choreo.duet;
      if (slot.duetRole === 'PARTNER_A') {
        duet.poseA(t, _modeCtx);
        applySpeciesAccent(species, t, _modeCtx);
        activeMove = DUET_PERSONA_MOVE;
      } else if (slot.duetRole === 'PARTNER_B') {
        duet.poseB(t, _modeCtx);
        applySpeciesAccent(species, t, _modeCtx);
        activeMove = DUET_PERSONA_MOVE;
      } else {
        // HYPE_BACKDROP (3rd dancer while a pair duets) — accent built in
        applyHypeCrewResponsePose(species, slot.slotSideSign, t, _modeCtx);
        activeMove = HYPE_PERSONA_MOVE;
      }
      // The choreographer stays frozen during duets; it resumes cleanly from
      // the shared beatCount when the mode returns to FORMATION_GROUP.
      if (slot.mirror) mirrorPoseInPlace(t);
    } else if (
      groupDirector.getDancerCount() >= 2 &&
      choreo.mode === 'SPECIES_SPOTLIGHT' &&
      choreo.signature !== null
    ) {
      // ---- SPECIES_SPOTLIGHT: call-and-response cypher ---------------------
      const modeBeat = eng.beatCount - choreo.beatStart;
      const subBeatFrac = (eng.phase / (Math.PI * 2)) % 1;
      _modeCtx.moveBeat = modeBeat;
      _modeCtx.moveBar = modeBeat * 0.25;
      _modeCtx.moveProgress = Math.min(
        1,
        (modeBeat + subBeatFrac) / Math.max(1, choreo.durationBeats)
      );
      if (slot.isSpotlightSoloist) {
        // V4 VARIETY OVERHAUL: chain signature -> signatureAlt at the mode
        // midpoint so a 4-bar spotlight shows TWO different signature moves
        // instead of one repeated loop (the "just repeat the same move"
        // complaint).
        const useAlt =
          choreo.signatureAlt !== null &&
          modeBeat >= choreo.durationBeats * 0.5;
        const sig = useAlt
          ? (choreo.signatureAlt as DanceMove)
          : choreo.signature;
        sig.pose(t, _modeCtx);
        applySpeciesAccent(species, t, _modeCtx);
        activeMove = sig;
      } else {
        applyHypeCrewResponsePose(species, slot.slotSideSign, t, _modeCtx);
        activeMove = HYPE_PERSONA_MOVE;
      }
      if (slot.mirror) mirrorPoseInPlace(t);
    } else {
      // ---- FORMATION_GROUP: the classic choreographer path ----------------
      choreographer.setFamily(mapStyleToFamily(hudStyle));
      choreographer.update(metrics, eng.beatCount, canonPhase, dt, elapsed);
      choreographer.applyPose(t);
      applySpeciesAccent(species, t, _modeCtx); // V3 species personality
      if (slot.mirror) mirrorPoseInPlace(t);
      activeMove = choreographer.getActiveMove();
    }

    // Feed spin requests from spin moves (Kathak Chakkar, Ghoomar, Dandiya,
    // B-Boy freeze hops, legacy bass-drop 360s) into the yaw accumulator.
    // V2: mirrored dancers spin the opposite way; group interactions can
    // broadcast synchronized 360s to the whole crew.
    // V3: duet/spotlight moves buffered their requestSpin calls into
    // pendingDirectSpin — drain them through the same accumulator.
    const spinDelta = choreographer.consumePendingSpin();
    const groupSpin = groupDirector.consumeGroupSpin(dancerIndex);
    const spinSign = slot.mirror ? -1 : 1;
    if (spinDelta !== 0) eng.spinTargetY += spinDelta * spinSign;
    if (eng.pendingDirectSpin !== 0) {
      eng.spinTargetY += eng.pendingDirectSpin * spinSign;
      eng.pendingDirectSpin = 0;
    }
    if (groupSpin !== 0) eng.spinTargetY += groupSpin * spinSign;
    if (spinDelta !== 0 || groupSpin !== 0 || eng.spinGrace > 0.55) {
      // Let the exponential damp finish animating the turn (~99% by 0.65 s)
      if (spinDelta !== 0 || groupSpin !== 0) eng.spinGrace = 0.65;
    }

    // ----------------------------------------------------------------------
    // V2 BF-15 REFACE LAW — the dancer may only face away from the camera
    // for as long as the ACTIVE MOVE says so. Whenever the move changes, a
    // 1.1 s reface window arms: after any in-flight spin has settled, the
    // spin accumulator wraps into (-PI, PI] (the live root rotation shifts
    // by the same whole turns, so nothing snaps) and damps to 0 (front).
    // Root cause this kills: Dandiya Raas requests a 180° partner turn on
    // beat 4; if the sequencer switched moves right after it, the residue
    // stayed at PI forever — the "dances the whole song facing back" bug.
    // ----------------------------------------------------------------------
    if (activeMove.id !== eng.lastMoveIdForReface) {
      eng.lastMoveIdForReface = activeMove.id;
      eng.refaceTimer = 1.1;
    }
    if (eng.refaceTimer > 0) eng.refaceTimer -= dt;
    if (eng.spinGrace > 0) eng.spinGrace -= dt;
    if (eng.refaceTimer > 0 && eng.spinGrace <= 0) {
      let wrapped = eng.spinTargetY % (Math.PI * 2);
      if (wrapped > Math.PI) wrapped -= Math.PI * 2;
      else if (wrapped <= -Math.PI) wrapped += Math.PI * 2;
      const turnShift = eng.spinTargetY - wrapped;
      if (turnShift !== 0) {
        eng.spinTargetY = wrapped;
        if (rootRef.current) rootRef.current.rotation.y -= turnShift;
      }
      if (Math.abs(eng.spinTargetY) > 0.0001) {
        eng.spinTargetY = THREE.MathUtils.damp(eng.spinTargetY, 0, 4, dt);
      } else {
        eng.spinTargetY = 0;
      }
    }

    // ----------------------------------------------------------------------
    // V2 GROUP CREW — slot travel + facing.
    // The outer group glides toward the director's slot target; the facing
    // yaw accumulator composes with the spin accumulator on the root joint.
    // (V3: the V2 envelope interactions are retired — authored duets and
    //  spotlight cyphers ARE the interaction system now.)
    // ----------------------------------------------------------------------
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
    eng.facingYaw = THREE.MathUtils.damp(
      eng.facingYaw,
      slot.targetYaw,
      3,
      dt
    );

    t.rootRotY = eng.spinTargetY + eng.facingYaw; // engine-owned channel

    // V2: the LEAD dancer is the group director's single writer — formations,
    // sync-mode rotation and interactions advance on the shared beat clock.
    if (isLeadDancer) {
      groupDirector.update(metrics, eng.beatCount, eng.phase, dt);
    }

    // V1.5 engine breathing layer: gentle chest inflation on top of whatever
    // the active move wrote, so the cat keeps breathing between beats even
    // when a move holds chestScale perfectly still (BF-13).
    t.chestScale +=
      Math.sin(elapsed * 1.5) * 0.012 + bass * 0.05 + eng.beatPulse * 0.02;

    const activeMoveName = activeMove.name;
    const highEnergy = activeMove.energy > 0.88;

    if (showHud && eng.lastReportedStyle !== activeMove.id) {
      eng.lastReportedStyle = activeMove.id;
      setActiveStateLabel(activeMoveName);
    }

    // Damp-blend the move's face intent onto the engine face layer so move
    // transitions flow instead of snapping (Kathakali fierce vs Odissi serene)
    const faceOv = activeMove.faceIntent
      ? FACE_INTENT_OVERRIDES[activeMove.faceIntent]
      : null;
    eng.faceJawBias = THREE.MathUtils.damp(
      eng.faceJawBias,
      faceOv ? faceOv.jawBias : 0,
      6,
      dt
    );
    eng.facePupilBias = THREE.MathUtils.damp(
      eng.facePupilBias,
      faceOv ? faceOv.pupilBias : 0,
      6,
      dt
    );
    eng.faceEarPitch = THREE.MathUtils.damp(
      eng.faceEarPitch,
      faceOv ? faceOv.earPitch : 0,
      6,
      dt
    );
    eng.faceEarRoll = THREE.MathUtils.damp(
      eng.faceEarRoll,
      faceOv ? faceOv.earRoll : 0,
      6,
      dt
    );
    eng.faceVisorDrop = THREE.MathUtils.damp(
      eng.faceVisorDrop,
      faceOv ? faceOv.visorDrop : 0,
      6,
      dt
    );

    // Damp-blend the move's tail carriage (Bhangra proud-high vs Odissi curled)
    // V2: species accents ride on top — dog wags ~2x faster with a proud
    // raised base pitch, mouse drags a thin tail, cat keeps the whip.
    const tailOv = activeMove.tailCarriage
      ? TAIL_CARRIAGE_OFFSETS[activeMove.tailCarriage]
      : null;
    eng.tailBasePitch = THREE.MathUtils.damp(
      eng.tailBasePitch,
      (tailOv ? tailOv.basePitch : 0.15) + eng.speciesTailBasePitch,
      5,
      dt
    );
    eng.tailCurl = THREE.MathUtils.damp(
      eng.tailCurl,
      tailOv ? tailOv.curlAdd : 0.05,
      5,
      dt
    );
    eng.tailAmpScale = THREE.MathUtils.damp(
      eng.tailAmpScale,
      tailOv ? tailOv.waveAmpScale : 1.0,
      5,
      dt
    );
    eng.tailSpeedScale = THREE.MathUtils.damp(
      eng.tailSpeedScale,
      (tailOv ? tailOv.waveSpeedScale : 1.0) * eng.speciesWag,
      5,
      dt
    );

    // ------------------------------------------------------------------------
    // 4. EXPRESSIVE HEAD DETAILS: JAW, EARS, EYES, WHISKERS, VISOR
    // ------------------------------------------------------------------------
    // Jaw opens on heavy bass drops + high-energy moves, shaped by the
    // active move's face intent (intense/fierce wider, serene softer)
    const bassDropJaw =
      highEnergy
        ? 0.48 + bass * 0.38 + eng.faceJawBias * 0.6
        : bass > 0.55
        ? (bass - 0.5) * 1.1 + eng.faceJawBias * 0.6
        : 0.05 + mid * 0.12 + eng.faceJawBias * 0.6;
    t.jawX = THREE.MathUtils.clamp(bassDropJaw, 0.04, 0.85);

    // Pupils dilate on bass drops; joyful widens, fierce narrows
    t.pupilScale =
      1.0 + bass * 0.42 + eng.facePupilBias + (highEnergy ? 0.18 : 0);

    // Independent Multi-Axis Ear Twitching driven by high-frequency hi-hats
    // V2: species multiplier — mouse ears twitch hardest, dog floppies swing
    if (high > 0.62 && Math.sin(elapsed * 47.0) > 0.7) {
      eng.earTwitchL =
        (Math.sin(elapsed * 91.0) * 0.5 + 0.5) * 0.48 * eng.speciesEarTwitch;
    } else {
      eng.earTwitchL = THREE.MathUtils.damp(eng.earTwitchL, 0, 12, dt);
    }

    if (high > 0.55 && Math.cos(elapsed * 53.0) > 0.7) {
      eng.earTwitchR =
        (Math.cos(elapsed * 79.0) * 0.5 + 0.5) * 0.48 * eng.speciesEarTwitch;
    } else {
      eng.earTwitchR = THREE.MathUtils.damp(eng.earTwitchR, 0, 12, dt);
    }

    const foldBack =
      (highEnergy ? 0.32 : bass * 0.18) - eng.faceEarPitch * 0.5;
    t.earLX = -foldBack - eng.earTwitchL * 0.5;
    t.earLZ = 0.18 + eng.earTwitchL + high * 0.22 + eng.faceEarRoll;
    t.earRX = -foldBack - eng.earTwitchR * 0.5;
    t.earRZ = -0.18 - eng.earTwitchR - high * 0.22 - eng.faceEarRoll;

    // Futuristic LED Club Visor: Flips down over eyes during Bass Drop or manual toggle
    const shouldVisorFlipDown =
      visorDown || highEnergy || eng.faceVisorDrop >= 0.8;
    t.visorRotX = shouldVisorFlipDown ? 0.04 : -0.58;
    t.visorY = shouldVisorFlipDown ? 0.045 : 0.165;

    // Natural Automatic Eye Blinking every 3 to 5 seconds
    if (!eng.isBlinking && elapsed >= eng.nextBlinkTime) {
      eng.isBlinking = true;
    }
    let eyeBlinkScaleY = 1.0;
    if (eng.isBlinking) {
      const blinkProgress = (elapsed - eng.nextBlinkTime) / eng.blinkDuration;
      if (blinkProgress >= 1.0) {
        eng.isBlinking = false;
        // Deterministic pseudo-random interval in [2.8s, 4.8s]
        eng.nextBlinkTime =
          elapsed + 2.8 + Math.abs(Math.sin(elapsed * 19.7)) * 2.0;
      } else {
        eyeBlinkScaleY = Math.max(
          0.06,
          Math.abs(Math.cos(blinkProgress * Math.PI))
        );
      }
    }

    // ------------------------------------------------------------------------
    // 5. ANALYTICAL KNEE-BEND INVERSE COMPENSATION (FLOOR LOCK AT Y = 0)
    // ------------------------------------------------------------------------
    // Compute how far each ankle needs to reach down from the current pelvis height
    const crouchDepth = Math.max(0, PELVIS_REST_Y - t.pelvisY);

    // Left Leg IK Compensation
    const effDistL = THREE.MathUtils.clamp(
      TWO_LEG_LENGTH - crouchDepth - t.footLiftL,
      0.24,
      TWO_LEG_LENGTH
    );
    const cosL = THREE.MathUtils.clamp(effDistL / TWO_LEG_LENGTH, -1, 1);
    const ikAngleL = Math.acos(cosL);

    const targetHipPitchL = -ikAngleL + t.legStepPitchL;
    const targetKneePitchL = ikAngleL * 2.0 + t.extraKneeL;
    const targetAnklePitchL =
      -ikAngleL - t.pelvisRotX + t.ankleToePitchL - t.extraKneeL * 0.5;

    // Right Leg IK Compensation
    const effDistR = THREE.MathUtils.clamp(
      TWO_LEG_LENGTH - crouchDepth - t.footLiftR,
      0.24,
      TWO_LEG_LENGTH
    );
    const cosR = THREE.MathUtils.clamp(effDistR / TWO_LEG_LENGTH, -1, 1);
    const ikAngleR = Math.acos(cosR);

    const targetHipPitchR = -ikAngleR + t.legStepPitchR;
    const targetKneePitchR = ikAngleR * 2.0 + t.extraKneeR;
    const targetAnklePitchR =
      -ikAngleR - t.pelvisRotX + t.ankleToePitchR - t.extraKneeR * 0.5;

    // ------------------------------------------------------------------------
    // 6. APPLY FRAME-RATE INDEPENDENT DAMPING TO ALL 24+ JOINTS
    // ------------------------------------------------------------------------
    const dampFast = 16;
    const dampMed = 12;
    const dampSmooth = 9;

    // Root & Pelvis
    rootRef.current.position.y = THREE.MathUtils.damp(
      rootRef.current.position.y,
      t.rootY,
      dampFast,
      dt
    );
    rootRef.current.rotation.y = THREE.MathUtils.damp(
      rootRef.current.rotation.y,
      t.rootRotY,
      8,
      dt
    );

    pelvisRef.current.position.x = THREE.MathUtils.damp(
      pelvisRef.current.position.x,
      t.pelvisX,
      dampMed,
      dt
    );
    pelvisRef.current.position.y = THREE.MathUtils.damp(
      pelvisRef.current.position.y,
      t.pelvisY,
      dampFast,
      dt
    );
    pelvisRef.current.position.z = THREE.MathUtils.damp(
      pelvisRef.current.position.z,
      t.pelvisZ,
      dampMed,
      dt
    );
    pelvisRef.current.rotation.x = THREE.MathUtils.damp(
      pelvisRef.current.rotation.x,
      t.pelvisRotX,
      dampMed,
      dt
    );
    pelvisRef.current.rotation.y = THREE.MathUtils.damp(
      pelvisRef.current.rotation.y,
      t.pelvisRotY,
      dampMed,
      dt
    );
    pelvisRef.current.rotation.z = THREE.MathUtils.damp(
      pelvisRef.current.rotation.z,
      t.pelvisRotZ,
      dampMed,
      dt
    );
    pelvisRef.current.scale.set(
      THREE.MathUtils.damp(
        pelvisRef.current.scale.x,
        t.pelvisScaleX,
        dampFast,
        dt
      ),
      THREE.MathUtils.damp(
        pelvisRef.current.scale.y,
        t.pelvisScaleY,
        dampFast,
        dt
      ),
      THREE.MathUtils.damp(
        pelvisRef.current.scale.z,
        t.pelvisScaleZ,
        dampFast,
        dt
      )
    );

    // 3-Segment Spine
    lowerSpineRef.current.rotation.x = THREE.MathUtils.damp(
      lowerSpineRef.current.rotation.x,
      t.lowerSpineX,
      dampMed,
      dt
    );
    lowerSpineRef.current.rotation.y = THREE.MathUtils.damp(
      lowerSpineRef.current.rotation.y,
      t.lowerSpineY,
      dampMed,
      dt
    );
    lowerSpineRef.current.rotation.z = THREE.MathUtils.damp(
      lowerSpineRef.current.rotation.z,
      t.lowerSpineZ,
      dampMed,
      dt
    );

    chestRef.current.rotation.x = THREE.MathUtils.damp(
      chestRef.current.rotation.x,
      t.chestX,
      dampFast,
      dt
    );
    chestRef.current.rotation.y = THREE.MathUtils.damp(
      chestRef.current.rotation.y,
      t.chestY,
      dampMed,
      dt
    );
    chestRef.current.rotation.z = THREE.MathUtils.damp(
      chestRef.current.rotation.z,
      t.chestZ,
      dampMed,
      dt
    );
    const dampedChestScale = THREE.MathUtils.damp(
      chestRef.current.scale.x,
      t.chestScale,
      dampFast,
      dt
    );
    chestRef.current.scale.set(dampedChestScale, 1, dampedChestScale);

    neckRef.current.rotation.x = THREE.MathUtils.damp(
      neckRef.current.rotation.x,
      t.neckX,
      dampMed,
      dt
    );
    neckRef.current.rotation.y = THREE.MathUtils.damp(
      neckRef.current.rotation.y,
      t.neckY,
      dampMed,
      dt
    );
    neckRef.current.rotation.z = THREE.MathUtils.damp(
      neckRef.current.rotation.z,
      t.neckZ,
      dampMed,
      dt
    );

    // Head, Jaw, Eyes, Ears, Whiskers, Visor
    headRef.current.rotation.x = THREE.MathUtils.damp(
      headRef.current.rotation.x,
      t.headX,
      dampFast,
      dt
    );
    headRef.current.rotation.y = THREE.MathUtils.damp(
      headRef.current.rotation.y,
      t.headY,
      dampMed,
      dt
    );
    headRef.current.rotation.z = THREE.MathUtils.damp(
      headRef.current.rotation.z,
      t.headZ,
      dampMed,
      dt
    );

    jawRef.current.rotation.x = THREE.MathUtils.damp(
      jawRef.current.rotation.x,
      t.jawX,
      18,
      dt
    );

    earLRef.current.rotation.x = THREE.MathUtils.damp(
      earLRef.current.rotation.x,
      t.earLX,
      20,
      dt
    );
    earLRef.current.rotation.z = THREE.MathUtils.damp(
      earLRef.current.rotation.z,
      t.earLZ,
      20,
      dt
    );
    earRRef.current.rotation.x = THREE.MathUtils.damp(
      earRRef.current.rotation.x,
      t.earRX,
      20,
      dt
    );
    earRRef.current.rotation.z = THREE.MathUtils.damp(
      earRRef.current.rotation.z,
      t.earRZ,
      20,
      dt
    );

    eyeLRef.current.scale.y = THREE.MathUtils.damp(
      eyeLRef.current.scale.y,
      eyeBlinkScaleY,
      28,
      dt
    );
    eyeRRef.current.scale.y = THREE.MathUtils.damp(
      eyeRRef.current.scale.y,
      eyeBlinkScaleY,
      28,
      dt
    );

    const pScale = THREE.MathUtils.damp(
      pupilLRef.current.scale.x,
      t.pupilScale,
      16,
      dt
    );
    pupilLRef.current.scale.set(pScale, pScale, 1);
    pupilRRef.current.scale.set(pScale, pScale, 1);

    // High-frequency treble whisker vibration.
    // BF-18: species without whiskers (DOG) never mount these meshes —
    // the refs stay null, and an unconditional deref froze the whole UI
    // in a per-frame TypeError. Guard before touching the refs.
    const whiskerLMesh = whiskerLRef.current;
    const whiskerRMesh = whiskerRRef.current;
    if (whiskerLMesh && whiskerRMesh) {
      const whiskerVib = Math.sin(elapsed * 65.0) * high * 0.16;
      whiskerLMesh.rotation.z = whiskerVib;
      whiskerRMesh.rotation.z = -whiskerVib;
      whiskerLMesh.rotation.y = 0.15 + Math.cos(elapsed * 52.0) * high * 0.08;
      whiskerRMesh.rotation.y = -0.15 - Math.cos(elapsed * 52.0) * high * 0.08;
    }

    visorRef.current.rotation.x = THREE.MathUtils.damp(
      visorRef.current.rotation.x,
      t.visorRotX,
      12,
      dt
    );
    visorRef.current.position.y = THREE.MathUtils.damp(
      visorRef.current.position.y,
      t.visorY,
      12,
      dt
    );

    // Left & Right Articulated Arms
    shoulderLRef.current.rotation.x = THREE.MathUtils.damp(
      shoulderLRef.current.rotation.x,
      t.shoulderLX,
      dampMed,
      dt
    );
    shoulderLRef.current.rotation.y = THREE.MathUtils.damp(
      shoulderLRef.current.rotation.y,
      t.shoulderLY,
      dampMed,
      dt
    );
    shoulderLRef.current.rotation.z = THREE.MathUtils.damp(
      shoulderLRef.current.rotation.z,
      t.shoulderLZ,
      dampMed,
      dt
    );
    elbowLRef.current.rotation.x = THREE.MathUtils.damp(
      elbowLRef.current.rotation.x,
      t.elbowLX,
      dampFast,
      dt
    );
    elbowLRef.current.rotation.y = THREE.MathUtils.damp(
      elbowLRef.current.rotation.y,
      t.elbowLY,
      dampMed,
      dt
    );
    wristLRef.current.rotation.x = THREE.MathUtils.damp(
      wristLRef.current.rotation.x,
      t.wristLX,
      dampFast,
      dt
    );
    wristLRef.current.rotation.z = THREE.MathUtils.damp(
      wristLRef.current.rotation.z,
      t.wristLZ,
      dampFast,
      dt
    );

    shoulderRRef.current.rotation.x = THREE.MathUtils.damp(
      shoulderRRef.current.rotation.x,
      t.shoulderRX,
      dampMed,
      dt
    );
    shoulderRRef.current.rotation.y = THREE.MathUtils.damp(
      shoulderRRef.current.rotation.y,
      t.shoulderRY,
      dampMed,
      dt
    );
    shoulderRRef.current.rotation.z = THREE.MathUtils.damp(
      shoulderRRef.current.rotation.z,
      t.shoulderRZ,
      dampMed,
      dt
    );
    elbowRRef.current.rotation.x = THREE.MathUtils.damp(
      elbowRRef.current.rotation.x,
      t.elbowRX,
      dampFast,
      dt
    );
    elbowRRef.current.rotation.y = THREE.MathUtils.damp(
      elbowRRef.current.rotation.y,
      t.elbowRY,
      dampMed,
      dt
    );
    wristRRef.current.rotation.x = THREE.MathUtils.damp(
      wristRRef.current.rotation.x,
      t.wristRX,
      dampFast,
      dt
    );
    wristRRef.current.rotation.z = THREE.MathUtils.damp(
      wristRRef.current.rotation.z,
      t.wristRZ,
      dampFast,
      dt
    );

    // Left & Right Articulated Legs
    hipLRef.current.rotation.x = THREE.MathUtils.damp(
      hipLRef.current.rotation.x,
      targetHipPitchL,
      dampFast,
      dt
    );
    hipLRef.current.rotation.y = THREE.MathUtils.damp(
      hipLRef.current.rotation.y,
      t.hipYawL,
      dampMed,
      dt
    );
    hipLRef.current.rotation.z = THREE.MathUtils.damp(
      hipLRef.current.rotation.z,
      t.legStepRollL - t.pelvisRotZ * 0.65,
      dampMed,
      dt
    );
    kneeLRef.current.rotation.x = THREE.MathUtils.damp(
      kneeLRef.current.rotation.x,
      targetKneePitchL,
      dampFast,
      dt
    );
    ankleLRef.current.rotation.x = THREE.MathUtils.damp(
      ankleLRef.current.rotation.x,
      targetAnklePitchL,
      dampFast,
      dt
    );
    ankleLRef.current.rotation.z = THREE.MathUtils.damp(
      ankleLRef.current.rotation.z,
      -t.legStepRollL * 0.5,
      dampMed,
      dt
    );

    hipRRef.current.rotation.x = THREE.MathUtils.damp(
      hipRRef.current.rotation.x,
      targetHipPitchR,
      dampFast,
      dt
    );
    hipRRef.current.rotation.y = THREE.MathUtils.damp(
      hipRRef.current.rotation.y,
      t.hipYawR,
      dampMed,
      dt
    );
    hipRRef.current.rotation.z = THREE.MathUtils.damp(
      hipRRef.current.rotation.z,
      t.legStepRollR - t.pelvisRotZ * 0.65,
      dampMed,
      dt
    );
    kneeRRef.current.rotation.x = THREE.MathUtils.damp(
      kneeRRef.current.rotation.x,
      targetKneePitchR,
      dampFast,
      dt
    );
    ankleRRef.current.rotation.x = THREE.MathUtils.damp(
      ankleRRef.current.rotation.x,
      targetAnklePitchR,
      dampFast,
      dt
    );
    ankleRRef.current.rotation.z = THREE.MathUtils.damp(
      ankleRRef.current.rotation.z,
      -t.legStepRollR * 0.5,
      dampMed,
      dt
    );

    // ------------------------------------------------------------------------
    // 7. 5-SEGMENT KINEMATIC WHIP TAIL: θ_i(t) = A * sin(ωt - i * 0.55)
    // ------------------------------------------------------------------------
    const tailAmp =
      (0.14 + overall * 0.28 + (highEnergy ? 0.16 : 0)) * eng.tailAmpScale;

    for (let i = 0; i < 5; i++) {
      const seg = tailRefs[i].current;
      if (!seg) continue;
      const waveAngleZ = tailAmp * Math.sin(eng.tailPhase - i * 0.55);
      const waveAngleX =
        (i === 0 ? 0.42 : 0.12) +
        eng.tailBasePitch * (i === 0 ? 1.0 : 0.55) +
        eng.tailCurl * (0.3 + i * 0.18) +
        tailAmp * 0.45 * Math.cos(eng.tailPhase * 0.5 - i * 0.55);

      seg.rotation.z = THREE.MathUtils.damp(
        seg.rotation.z,
        waveAngleZ,
        dampSmooth + i * 2,
        dt
      );
      seg.rotation.x = THREE.MathUtils.damp(
        seg.rotation.x,
        waveAngleX,
        dampSmooth + i * 2,
        dt
      );
    }

    // ------------------------------------------------------------------------
    // 8. AUDIO-REACTIVE NEON EMISSIVES (HEADPHONES, VISOR, SNEAKERS, FLOOR)
    // ------------------------------------------------------------------------
    const fam = activeMove.family;
    if (fam === 'BREAKDANCE') {
      _scratchColorA.copy(_neonMagenta).lerp(_neonCyan, Math.sin(p) * 0.5 + 0.5);
    } else if (fam === 'DISCO_FUNK') {
      _scratchColorA.copy(_neonGold).lerp(_neonMagenta, mid);
    } else if (fam === 'SHUFFLE') {
      _scratchColorA.copy(_neonLime).lerp(_neonCyan, high);
    } else if (fam === 'INDIAN_CLASSICAL') {
      // Temple-gold <-> cyan strobe for classical adavus
      _scratchColorA.copy(_neonGold).lerp(_neonCyan, Math.sin(p) * 0.5 + 0.5);
    } else if (fam === 'INDIAN_FOLK') {
      // Festive lime <-> magenta for Bhangra / Garba / Lavani
      _scratchColorA.copy(_neonLime).lerp(_neonMagenta, Math.sin(p) * 0.5 + 0.5);
    } else if (fam === 'BOLLYWOOD') {
      // Filmi magenta <-> gold glamour
      _scratchColorA.copy(_neonMagenta).lerp(_neonGold, mid);
    } else {
      _scratchColorA.copy(_neonCyan).lerp(_neonMagenta, bass * 0.65);
    }

    materials.neonPulse.color.copy(_scratchColorA);
    materials.neonPulse.emissive.copy(_scratchColorA);
    materials.neonPulse.emissiveIntensity =
      0.9 + bass * 2.8 + eng.beatPulse * 1.4 + (highEnergy ? 1.2 : 0);

    materials.visorGlass.emissive.copy(_scratchColorA);
    materials.visorGlass.emissiveIntensity =
      0.5 + high * 1.4 + eng.beatPulse * 0.8;

    if (floorRingRef.current) {
      const ringScale = 1.0 + bass * 0.35 + eng.beatPulse * 0.18;
      floorRingRef.current.scale.set(ringScale, ringScale, 1);
      materials.floorRingMat.color.copy(_scratchColorA);
      materials.floorRingMat.opacity = 0.18 + bass * 0.45;
    }
  });

  // --------------------------------------------------------------------------
  // HELPER RENDERERS FOR SYMMETRICAL PAWS & HIGH-TOP SNEAKERS
  // --------------------------------------------------------------------------
  const renderPawWithToeBeans = (isLeft: boolean) => {
    const side = isLeft ? 1 : -1;
    return (
      <group>
        {/* Main Rounded Paw Mit */}
        <RoundedBox
          args={[0.11, 0.11, 0.085]}
          radius={0.038}
          smoothness={4}
          position={[0, -0.055, 0.01]}
          material={materials.creamFur}
          castShadow
        />
        {/* Thumb Puff */}
        <mesh
          position={[side * 0.052, -0.045, 0.02]}
          rotation={[0, 0, side * 0.4]}
          material={materials.creamFur}
          castShadow
        >
          <capsuleGeometry args={[0.022, 0.03, 8, 12]} />
        </mesh>
        {/* Central Pink Metacarpal Pad */}
        <mesh
          position={[0, -0.055, 0.052]}
          scale={[1.1, 0.9, 0.5]}
          material={materials.pinkSkin}
        >
          <sphereGeometry args={[0.024, 12, 12]} />
        </mesh>
        {/* 4 Cute Pink Toe Beans */}
        {[-0.03, -0.01, 0.01, 0.03].map((xOffset, idx) => {
          const arcY = -0.085 + Math.abs(idx - 1.5) * 0.008;
          return (
            <mesh
              key={idx}
              position={[xOffset, arcY, 0.05]}
              scale={[0.85, 1.1, 0.55]}
              material={materials.pinkSkin}
            >
              <sphereGeometry args={[0.011, 10, 10]} />
            </mesh>
          );
        })}
      </group>
    );
  };

  const renderHighTopSneaker = () => {
    return (
      <group>
        {/* Ankle Collar */}
        <mesh
          position={[0, -0.02, 0]}
          material={materials.sneakerAccent}
          castShadow
        >
          <cylinderGeometry args={[0.082, 0.09, 0.07, 16]} />
        </mesh>
        {/* Main Sneaker Upper */}
        <RoundedBox
          args={[0.165, 0.085, 0.27]}
          radius={0.035}
          smoothness={4}
          position={[0, -0.06, 0.045]}
          material={materials.sneakerBody}
          castShadow
          receiveShadow
        />
        {/* Puffy Sneaker Tongue */}
        <RoundedBox
          args={[0.095, 0.08, 0.04]}
          radius={0.015}
          smoothness={3}
          position={[0, -0.01, 0.075]}
          rotation={[-0.35, 0, 0]}
          material={materials.sneakerAccent}
        />
        {/* Sneaker Laces */}
        {[0.02, 0.05, 0.08].map((zOff, i) => (
          <RoundedBox
            key={i}
            args={[0.11, 0.014, 0.016]}
            radius={0.005}
            position={[0, -0.022 - i * 0.008, zOff]}
            material={materials.creamFur}
          />
        ))}
        {/* Audio-Reactive Glowing LED Midsole (Bottom sits at y = -0.12) */}
        <RoundedBox
          args={[0.18, 0.036, 0.29]}
          radius={0.014}
          smoothness={4}
          position={[0, -0.102, 0.045]}
          material={materials.neonPulse}
        />
      </group>
    );
  };

  // ------------------------------------------------------------------------
  // V2 SPECIES RENDERERS — silhouette variants on the SAME joint refs.
  // The ear/jaw groups keep their refs, so the auto-layer twitching, jaw
  // bass-drops and blink systems drive every species identically.
  // ------------------------------------------------------------------------

  /** Pointy cat cones / floppy dog flaps / round mouse discs. */
  const renderSpeciesEar = (isLeft: boolean) => {
    const side = isLeft ? 1 : -1;

    if (preset.earStyle === 'FLOPPY') {
      // DOG: long rounded flaps hanging from the head sides. The ear twitch
      // auto-layer swings them — floppy physics for free.
      return (
        <group>
          <mesh
            position={[side * 0.02, -0.13, 0]}
            scale={[1, 1, 0.62]}
            material={materials.darkFur}
            castShadow
          >
            <capsuleGeometry args={[0.062, 0.24, 8, 12]} />
          </mesh>
          <mesh
            position={[side * 0.028, -0.12, 0.028]}
            scale={[0.62, 0.85, 0.4]}
            material={materials.pinkSkin}
          >
            <capsuleGeometry args={[0.05, 0.18, 8, 10]} />
          </mesh>
        </group>
      );
    }

    if (preset.earStyle === 'ROUND') {
      // MOUSE: big round radar discs with pink inner faces.
      return (
        <group>
          <mesh
            position={[0, 0.13, 0]}
            scale={[1, 1, 0.28]}
            material={materials.darkFur}
            castShadow
          >
            <sphereGeometry args={[0.155, 20, 16]} />
          </mesh>
          <mesh
            position={[0, 0.13, 0.035]}
            scale={[0.78, 0.78, 0.2]}
            material={materials.pinkSkin}
          >
            <sphereGeometry args={[0.155, 18, 14]} />
          </mesh>
        </group>
      );
    }

    // CAT: the classic pointy cone + pink inner + rounded tip + tuft
    return (
      <group>
        <mesh
          position={[0, 0.11, 0]}
          scale={[1, 1, 0.65]}
          material={materials.darkFur}
          castShadow
        >
          <coneGeometry args={[0.115, 0.25, 16]} />
        </mesh>
        <mesh
          position={[0, 0.1, 0.032]}
          scale={[0.68, 0.78, 0.35]}
          material={materials.pinkSkin}
        >
          <coneGeometry args={[0.1, 0.22, 12]} />
        </mesh>
        <mesh position={[0, 0.245, 0]} material={materials.darkFur} castShadow>
          <sphereGeometry args={[0.036, 12, 12]} />
        </mesh>
        <mesh
          position={[0, 0.13, 0.05]}
          rotation={[0.35, 0, 0]}
          material={materials.creamFur}
        >
          <coneGeometry args={[0.028, 0.07, 8]} />
        </mesh>
      </group>
    );
  };

  /** Species muzzle/snout add-ons layered onto the shared cheek geometry. */
  const renderSpeciesSnout = () => {
    if (preset.snoutStyle === 'LONG') {
      // DOG: forward muzzle box + bigger nose + jowls
      return (
        <group>
          <RoundedBox
            args={[0.19, 0.13, 0.2]}
            radius={0.05}
            smoothness={4}
            position={[0, 0.075, 0.24]}
            material={materials.creamFur}
            castShadow
          />
          <mesh
            position={[0, 0.105, 0.345]}
            scale={[1.35, 1.0, 0.9]}
            material={materials.mouthInterior}
          >
            <sphereGeometry args={[0.032, 12, 12]} />
          </mesh>
          <mesh
            position={[-0.055, 0.05, 0.315]}
            scale={[0.9, 0.7, 0.6]}
            material={materials.pinkSkin}
          >
            <sphereGeometry args={[0.028, 10, 10]} />
          </mesh>
          <mesh
            position={[0.055, 0.05, 0.315]}
            scale={[0.9, 0.7, 0.6]}
            material={materials.pinkSkin}
          >
            <sphereGeometry args={[0.028, 10, 10]} />
          </mesh>
        </group>
      );
    }

    if (preset.snoutStyle === 'TINY') {
      // MOUSE: small pointed snout + two buck teeth under the nose
      return (
        <group>
          <mesh
            position={[0, 0.085, 0.24]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.8, 1, 0.8]}
            material={materials.creamFur}
            castShadow
          >
            <coneGeometry args={[0.075, 0.16, 12]} />
          </mesh>
          {preset.buckTeeth && (
            <group position={[0, 0.045, 0.29]}>
              <mesh position={[-0.016, 0, 0]} material={materials.eyeCatchlight}>
                <boxGeometry args={[0.02, 0.035, 0.012]} />
              </mesh>
              <mesh position={[0.016, 0, 0]} material={materials.eyeCatchlight}>
                <boxGeometry args={[0.02, 0.035, 0.012]} />
              </mesh>
            </group>
          )}
        </group>
      );
    }

    // CAT: no extra geometry — the cream muzzle pads + pink nose in the main
    // head JSX already define the flat feline muzzle.
    return null;
  };

  return (
    <group ref={slotGroupRef} position={position} scale={scale * preset.scale}>
      {/* ====================================================================
          OPTIONAL INTERACTIVE CHOREOGRAPHY HUD
      ==================================================================== */}
      {showHud && (
        <Html position={[0, 2.35, 0]} center distanceFactor={6}>
          <div
            style={{
              background: 'rgba(11, 14, 26, 0.88)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(0, 245, 255, 0.35)',
              borderRadius: '12px',
              padding: '10px 14px',
              color: '#f0f6ff',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: '11px',
              width: '320px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                paddingBottom: '6px',
              }}
            >
              <span style={{ fontWeight: 700, color: '#00f5ff' }}>
                PROCEDURAL B-BOY CAT RIG
              </span>
              <span
                style={{
                  background: 'rgba(255, 0, 127, 0.25)',
                  border: '1px solid #ff007f',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 600,
                }}
              >
                {activeStateLabel}
              </span>
            </div>

            {/* Style Switcher */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '4px',
                marginBottom: '8px',
              }}
            >
              {DANCE_STYLE_PILLS.map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setHudStyle(pill.id)}
                  style={{
                    background:
                      hudStyle === pill.id
                        ? 'linear-gradient(135deg, #00f5ff, #0088ff)'
                        : 'rgba(255,255,255,0.07)',
                    color: hudStyle === pill.id ? '#050811' : '#d6e2ff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Demo Beat Simulator & Visor Controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <button
                onClick={() => setHudDemo((v) => !v)}
                style={{
                  background: hudDemo ? '#39ff14' : 'rgba(255,255,255,0.1)',
                  color: hudDemo ? '#050a05' : '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {hudDemo ? 'Demo Synth: ON' : 'Demo Synth: AUTO'}
              </button>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10px',
                }}
              >
                <span>{hudBpm} BPM</span>
                <input
                  type="range"
                  min={90}
                  max={175}
                  value={hudBpm}
                  onChange={(e) => setHudBpm(Number(e.target.value))}
                  style={{ width: '70px', accentColor: '#00f5ff' }}
                />
              </label>

              <button
                onClick={() => setVisorDown((v) => !v)}
                style={{
                  background: visorDown ? '#ff007f' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Visor
              </button>
            </div>
          </div>
        </Html>
      )}

      {/* ====================================================================
          REACTIVE DANCEFLOOR RING & CONTACT SHADOWS AT Y = 0
      ==================================================================== */}
      <mesh
        ref={floorRingRef}
        position={[0, 0.003, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials.floorRingMat}
      >
        <ringGeometry args={[0.52, 0.62, 48]} />
      </mesh>
      {/* V2: ONE contact-shadow catcher for the whole crew (it renders every
          object above its plane anyway) — mounted only on the lead dancer so
          a 4-animal crew still costs exactly one shadow render pass. */}
      {isLeadDancer && (
        <ContactShadows
          position={[0, 0.001, 0]}
          opacity={0.5}
          scale={6.5}
          blur={1.9}
          far={2.2}
        />
      )}

      {/* ====================================================================
          1. ROOT & PELVIS HIERARCHY
      ==================================================================== */}
      <group ref={rootRef} position={[0, 0, 0]}>
        <group ref={pelvisRef} position={[0, PELVIS_REST_Y, 0]}>
          {/* Pelvis / Streetwear Jogger Shorts Waistband */}
          <RoundedBox
            args={[0.42, 0.2, 0.28]}
            radius={0.08}
            smoothness={4}
            position={[0, 0.02, 0]}
            material={materials.hoodieMat}
            castShadow
            receiveShadow
          />
          {/* Glowing Streetwear Belt Stripe */}
          <RoundedBox
            args={[0.43, 0.03, 0.29]}
            radius={0.01}
            position={[0, 0.09, 0]}
            material={materials.neonPulse}
          />

          {/* V1.5 Chubby Hip Fluff (rounder feline rump under the joggers) */}
          <mesh
            position={[-0.2, -0.06, 0]}
            rotation={[0, 0, 0.28]}
            material={materials.darkFur}
            castShadow
          >
            <capsuleGeometry args={[0.085, 0.1, 10, 14]} />
          </mesh>
          <mesh
            position={[0.2, -0.06, 0]}
            rotation={[0, 0, -0.28]}
            material={materials.darkFur}
            castShadow
          >
            <capsuleGeometry args={[0.085, 0.1, 10, 14]} />
          </mesh>

          {/* ================================================================
              2. 3-SEGMENT FLEXIBLE SPINE (lowerSpine -> chest -> neck)
          ================================================================ */}
          <group ref={lowerSpineRef} position={[0, 0.1, 0]}>
            {/* Lower Spine / Abdomen Mesh */}
            <mesh
              position={[0, 0.11, 0]}
              material={materials.darkFur}
              castShadow
            >
              <cylinderGeometry args={[0.18, 0.19, 0.24, 16]} />
            </mesh>
            {/* Cream Belly Patch (Lower) */}
            <mesh
              position={[0, 0.11, 0.055]}
              scale={[0.82, 0.9, 0.75]}
              material={materials.creamFur}
            >
              <cylinderGeometry args={[0.15, 0.16, 0.22, 16]} />
            </mesh>

            {/* CHEST / RIBCAGE SEGMENT */}
            <group ref={chestRef} position={[0, 0.24, 0]}>
              {/* Cropped Street-Dancer Puff Vest / Chest */}
              <RoundedBox
                args={[0.48, 0.32, 0.31]}
                radius={0.11}
                smoothness={4}
                position={[0, 0.15, 0]}
                material={materials.hoodieMat}
                castShadow
                receiveShadow
              />
              {/* Cream Chest Fur V-Neck Patch */}
              <mesh
                position={[0, 0.18, 0.13]}
                scale={[0.85, 0.95, 0.5]}
                material={materials.creamFur}
              >
                <sphereGeometry args={[0.14, 16, 16]} />
              </mesh>
              {/* Glowing Neon Vest Trim */}
              <mesh
                position={[0, 0.28, 0.01]}
                rotation={[Math.PI / 2, 0, 0]}
                material={materials.neonPulse}
              >
                <torusGeometry args={[0.16, 0.016, 12, 28]} />
              </mesh>

              {/* V1.5 Fluffy Chest Tuft (poking out of the vest neckline) */}
              <mesh
                position={[-0.045, 0.29, 0.1]}
                material={materials.creamFur}
                castShadow
              >
                <sphereGeometry args={[0.052, 12, 12]} />
              </mesh>
              <mesh
                position={[0.045, 0.29, 0.1]}
                material={materials.creamFur}
                castShadow
              >
                <sphereGeometry args={[0.052, 12, 12]} />
              </mesh>
              <mesh
                position={[0, 0.318, 0.088]}
                material={materials.creamFur}
                castShadow
              >
                <sphereGeometry args={[0.046, 12, 12]} />
              </mesh>

              {/* ============================================================
                  3. NECK & EXPRESSIVE HEAD HIERARCHY
              ============================================================ */}
              <group ref={neckRef} position={[0, 0.3, 0]}>
                {/* Neck Cylinder */}
                <mesh
                  position={[0, 0.04, 0]}
                  material={materials.darkFur}
                  castShadow
                >
                  <cylinderGeometry args={[0.11, 0.13, 0.12, 16]} />
                </mesh>
                {/* V1.5 Fluffy Neck Ruff (fur collar where head meets vest) */}
                <mesh
                  position={[0, 0.01, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                  scale={[1, 1, 0.62]}
                  material={materials.creamFur}
                  castShadow
                >
                  <torusGeometry args={[0.138, 0.052, 12, 24]} />
                </mesh>

                {/* HEAD PIVOT */}
                <group ref={headRef} position={[0, 0.08, 0]}>
                  {/* Main Rounded Stylized Cat Cranium */}
                  <RoundedBox
                    args={[0.56, 0.45, 0.46]}
                    radius={0.19}
                    smoothness={5}
                    position={[0, 0.18, 0]}
                    material={materials.darkFur}
                    castShadow
                    receiveShadow
                  />

                  {/* Cute Chubby Cheek Puffs (Left & Right) */}
                  <mesh
                    position={[-0.22, 0.1, 0.12]}
                    scale={[1.1, 0.85, 0.95]}
                    material={materials.darkFur}
                    castShadow
                  >
                    <sphereGeometry args={[0.12, 16, 16]} />
                  </mesh>
                  <mesh
                    position={[0.22, 0.1, 0.12]}
                    scale={[1.1, 0.85, 0.95]}
                    material={materials.darkFur}
                    castShadow
                  >
                    <sphereGeometry args={[0.12, 16, 16]} />
                  </mesh>

                {/* V1.5 Cheek Fur Tufts (fluffy sideburn spikes — cat & mouse) */}
                {preset.earStyle !== 'FLOPPY' && (
                  <>
                    <mesh
                      position={[-0.275, 0.1, 0.015]}
                      rotation={[0.25, -0.45, Math.PI / 2 + 0.4]}
                      material={materials.darkFur}
                      castShadow
                    >
                      <coneGeometry args={[0.048, 0.13, 10]} />
                    </mesh>
                    <mesh
                      position={[0.275, 0.1, 0.015]}
                      rotation={[0.25, 0.45, -(Math.PI / 2 + 0.4)]}
                      material={materials.darkFur}
                      castShadow
                    >
                      <coneGeometry args={[0.048, 0.13, 10]} />
                    </mesh>
                  </>
                )}

                  {/* Cream Muzzle Pads (CAT only — dog/mouse get their own
                      species snout geometry so the pads never poke through) */}
                  {preset.snoutStyle === 'FLAT' && (
                    <>
                      <mesh
                        position={[-0.065, 0.1, 0.215]}
                        scale={[1.15, 0.85, 0.65]}
                        material={materials.creamFur}
                      >
                        <sphereGeometry args={[0.075, 14, 14]} />
                      </mesh>
                      <mesh
                        position={[0.065, 0.1, 0.215]}
                        scale={[1.15, 0.85, 0.65]}
                        material={materials.creamFur}
                      >
                        <sphereGeometry args={[0.075, 14, 14]} />
                      </mesh>
                    </>
                  )}
                  {renderSpeciesSnout()}

                  {/* Cute Pink Triangular Nose (CAT — dog/mouse snouts carry
                      their own nose geometry) */}
                  {preset.snoutStyle === 'FLAT' && (
                    <mesh
                      position={[0, 0.145, 0.265]}
                      rotation={[Math.PI, 0, 0]}
                      scale={[1.2, 0.85, 0.75]}
                      material={materials.pinkSkin}
                    >
                      <coneGeometry args={[0.036, 0.042, 3]} />
                    </mesh>
                  )}

                  {/* ARTICULATED JAW (Opens on heavy bass drops) */}
                  <group ref={jawRef} position={[0, 0.075, 0.14]}>
                    {/* Lower Jaw Chin */}
                    <RoundedBox
                      args={[0.21, 0.065, 0.16]}
                      radius={0.028}
                      smoothness={4}
                      position={[0, -0.02, 0.04]}
                      material={materials.creamFur}
                      castShadow
                    />
                    {/* Mouth Cavity & Pink Tongue */}
                    <mesh
                      position={[0, 0.008, 0.045]}
                      material={materials.mouthInterior}
                    >
                      <boxGeometry args={[0.14, 0.025, 0.1]} />
                    </mesh>
                    <mesh
                      position={[0, 0.015, 0.055]}
                      scale={[1.0, 0.4, 1.2]}
                      material={materials.pinkSkin}
                    >
                      <sphereGeometry args={[0.045, 12, 12]} />
                    </mesh>
                    {/* V2 SPECIES: dog pants with a flat tongue out on the beat */}
                    {preset.tongue && (
                      <mesh
                        position={[0, -0.015, 0.115]}
                        rotation={[0.5, 0, 0]}
                        scale={[1, 1, 1.6]}
                        material={materials.pinkSkin}
                      >
                        <capsuleGeometry args={[0.022, 0.07, 8, 10]} />
                      </mesh>
                    )}
                    {/* Tiny Cute Cat Fangs */}
                    <mesh
                      position={[-0.045, 0.035, 0.085]}
                      rotation={[Math.PI, 0, 0]}
                      material={materials.eyeCatchlight}
                    >
                      <coneGeometry args={[0.01, 0.028, 8]} />
                    </mesh>
                    <mesh
                      position={[0.045, 0.035, 0.085]}
                      rotation={[Math.PI, 0, 0]}
                      material={materials.eyeCatchlight}
                    >
                      <coneGeometry args={[0.01, 0.028, 8]} />
                    </mesh>
                  </group>

                  {/* EXPRESSIVE EYES WITH DILATING SLIT PUPILS & BLINKING
                      (V1.5: bigger glossy eyes + vertical cat-slit pupils) */}
                  <group ref={eyeLRef} position={[-0.135, 0.21, 0.22]}>
                    <mesh
                      scale={[1, 1.12, 0.45]}
                      material={materials.eyeSclera}
                    >
                      <sphereGeometry args={[0.082, 20, 20]} />
                    </mesh>
                    <mesh
                      position={[0, 0, 0.018]}
                      scale={[1, 1.1, 0.4]}
                      material={materials.eyeIris}
                    >
                      <sphereGeometry args={[0.064, 18, 18]} />
                    </mesh>
                    <mesh
                      ref={pupilLRef}
                      position={[0, 0, 0.038]}
                      scale={[1, 1, 1]}
                      material={materials.eyePupil}
                      geometry={materials.pupilGeo}
                    />
                    <mesh
                      position={[-0.022, 0.026, 0.044]}
                      material={materials.eyeCatchlight}
                    >
                      <circleGeometry args={[0.015, 12]} />
                    </mesh>
                  </group>

                  <group ref={eyeRRef} position={[0.135, 0.21, 0.22]}>
                    <mesh
                      scale={[1, 1.12, 0.45]}
                      material={materials.eyeSclera}
                    >
                      <sphereGeometry args={[0.082, 20, 20]} />
                    </mesh>
                    <mesh
                      position={[0, 0, 0.018]}
                      scale={[1, 1.1, 0.4]}
                      material={materials.eyeIris}
                    >
                      <sphereGeometry args={[0.064, 18, 18]} />
                    </mesh>
                    <mesh
                      ref={pupilRRef}
                      position={[0, 0, 0.038]}
                      scale={[1, 1, 1]}
                      material={materials.eyePupil}
                      geometry={materials.pupilGeo}
                    />
                    <mesh
                      position={[-0.022, 0.026, 0.044]}
                      material={materials.eyeCatchlight}
                    >
                      <circleGeometry args={[0.015, 12]} />
                    </mesh>
                  </group>

                  {/* 6 VIBRATING WHISKERS (3 PER SIDE) */}
                  {/* Whiskers (V2: species-driven — dog has none, mouse's are
                      35% longer than the cat's) */}
                  {preset.whiskers && (
                    <group
                      ref={whiskerLRef}
                      position={[-0.24, 0.11, 0.18]}
                      rotation={[0, 0.15, 0]}
                      scale={[preset.whiskerLength, 1, 1]}
                    >
                      {[0.14, 0, -0.14].map((angle, idx) => (
                        <mesh
                          key={idx}
                          position={[-0.09, (1 - idx) * 0.02, 0]}
                          rotation={[0, 0, Math.PI / 2 + angle]}
                          material={materials.whiskerMat}
                        >
                          <cylinderGeometry args={[0.0035, 0.0015, 0.2, 6]} />
                        </mesh>
                      ))}
                    </group>
                  )}
                  {preset.whiskers && (
                    <group
                      ref={whiskerRRef}
                      position={[0.24, 0.11, 0.18]}
                      rotation={[0, -0.15, 0]}
                      scale={[preset.whiskerLength, 1, 1]}
                    >
                      {[-0.14, 0, 0.14].map((angle, idx) => (
                        <mesh
                          key={idx}
                          position={[0.09, (1 - idx) * 0.02, 0]}
                          rotation={[0, 0, -Math.PI / 2 + angle]}
                          material={materials.whiskerMat}
                        >
                          <cylinderGeometry args={[0.0035, 0.0015, 0.2, 6]} />
                        </mesh>
                      ))}
                    </group>
                  )}

                  {/* ========================================================
                      4. INDEPENDENT MULTI-AXIS EARS (Left & Right)
                      V2 SPECIES: pointy cat cones / floppy dog flaps / round
                      mouse discs — same refs, so twitch drives them all.
                  ======================================================== */}
                  <group
                    ref={earLRef}
                    position={[-0.21, preset.earStyle === 'FLOPPY' ? 0.35 : 0.38, -0.01]}
                    rotation={[
                      0,
                      0,
                      preset.earStyle === 'FLOPPY' ? 0.55 : preset.earStyle === 'ROUND' ? 0.3 : 0.18,
                    ]}
                  >
                    {renderSpeciesEar(true)}
                  </group>

                  <group
                    ref={earRRef}
                    position={[0.21, preset.earStyle === 'FLOPPY' ? 0.35 : 0.38, -0.01]}
                    rotation={[
                      0,
                      0,
                      preset.earStyle === 'FLOPPY' ? -0.55 : preset.earStyle === 'ROUND' ? -0.3 : -0.18,
                    ]}
                  >
                    {renderSpeciesEar(false)}
                  </group>

                  {/* FUTURISTIC LED CLUB VISOR SUNGLASSES (Forehead / Eyes) */}
                  <group
                    ref={visorRef}
                    position={[0, 0.165, 0.02]}
                    rotation={[-0.58, 0, 0]}
                  >
                    <RoundedBox
                      args={[0.56, 0.12, 0.14]}
                      radius={0.04}
                      smoothness={4}
                      position={[0, 0.17, 0.22]}
                      material={materials.visorGlass}
                    />
                    {/* Glowing Cyber Visor Top Strip */}
                    <RoundedBox
                      args={[0.57, 0.022, 0.145]}
                      radius={0.008}
                      position={[0, 0.225, 0.22]}
                      material={materials.neonPulse}
                    />
                  </group>

                  {/* DJ OVER-EAR HEADPHONES WITH PULSING NEON EARCUPS
                      (V2: species-scaled — the mouse wears tiny cans) */}
                  <group
                    position={[0, 0.19, -0.01]}
                    scale={preset.headphoneScale}
                  >
                    {/* Headband Arc */}
                    <mesh material={materials.chromeMat} castShadow>
                      <torusGeometry
                        args={[0.31, 0.024, 14, 36, Math.PI * 1.05]}
                      />
                    </mesh>
                    {/* Left Earcup */}
                    <group position={[-0.31, -0.01, 0.01]}>
                      <mesh
                        rotation={[0, 0, Math.PI / 2]}
                        material={materials.hoodieMat}
                        castShadow
                      >
                        <cylinderGeometry args={[0.105, 0.105, 0.08, 20]} />
                      </mesh>
                      <mesh
                        position={[-0.042, 0, 0]}
                        rotation={[0, Math.PI / 2, 0]}
                        material={materials.neonPulse}
                      >
                        <torusGeometry args={[0.078, 0.014, 12, 24]} />
                      </mesh>
                      {/* V1.5 Fur-Lined Cushion Rim */}
                      <mesh
                        position={[-0.062, 0, 0]}
                        rotation={[0, Math.PI / 2, 0]}
                        material={materials.creamFur}
                      >
                        <torusGeometry args={[0.086, 0.03, 12, 20]} />
                      </mesh>
                    </group>
                    {/* Right Earcup */}
                    <group position={[0.31, -0.01, 0.01]}>
                      <mesh
                        rotation={[0, 0, Math.PI / 2]}
                        material={materials.hoodieMat}
                        castShadow
                      >
                        <cylinderGeometry args={[0.105, 0.105, 0.08, 20]} />
                      </mesh>
                      <mesh
                        position={[0.042, 0, 0]}
                        rotation={[0, Math.PI / 2, 0]}
                        material={materials.neonPulse}
                      >
                        <torusGeometry args={[0.078, 0.014, 12, 24]} />
                      </mesh>
                      {/* V1.5 Fur-Lined Cushion Rim */}
                      <mesh
                        position={[0.062, 0, 0]}
                        rotation={[0, Math.PI / 2, 0]}
                        material={materials.creamFur}
                      >
                        <torusGeometry args={[0.086, 0.03, 12, 20]} />
                      </mesh>
                    </group>
                  </group>
                </group>
              </group>

              {/* ============================================================
                  5. FULLY ARTICULATED ARMS (Shoulder -> Elbow -> Wrist/Paw)
              ============================================================ */}
              {/* LEFT ARM */}
              <group ref={shoulderLRef} position={[-0.27, 0.25, 0]}>
                {/* Shoulder Puff Sleeve */}
                <mesh
                  position={[0, -0.06, 0]}
                  material={materials.hoodieMat}
                  castShadow
                >
                  <capsuleGeometry args={[0.075, 0.1, 10, 16]} />
                </mesh>
                {/* Upper Arm */}
                <mesh
                  position={[0, -0.14, 0]}
                  material={materials.darkFur}
                  castShadow
                >
                  <capsuleGeometry args={[0.055, 0.18, 10, 16]} />
                </mesh>

                {/* Left Elbow Pivot */}
                <group ref={elbowLRef} position={[0, -0.26, 0]}>
                  {/* Forearm */}
                  <mesh
                    position={[0, -0.12, 0]}
                    material={materials.darkFur}
                    castShadow
                  >
                    <capsuleGeometry args={[0.05, 0.16, 10, 16]} />
                  </mesh>
                  {/* Glowing Neon Wristband */}
                  <mesh
                    position={[0, -0.21, 0]}
                    material={materials.neonPulse}
                  >
                    <cylinderGeometry args={[0.056, 0.056, 0.035, 16]} />
                  </mesh>

                  {/* Left Wrist & Paw with Toe Beans */}
                  <group ref={wristLRef} position={[0, -0.24, 0]}>
                    {renderPawWithToeBeans(true)}
                  </group>
                </group>
              </group>

              {/* RIGHT ARM */}
              <group ref={shoulderRRef} position={[0.27, 0.25, 0]}>
                {/* Shoulder Puff Sleeve */}
                <mesh
                  position={[0, -0.06, 0]}
                  material={materials.hoodieMat}
                  castShadow
                >
                  <capsuleGeometry args={[0.075, 0.1, 10, 16]} />
                </mesh>
                {/* Upper Arm */}
                <mesh
                  position={[0, -0.14, 0]}
                  material={materials.darkFur}
                  castShadow
                >
                  <capsuleGeometry args={[0.055, 0.18, 10, 16]} />
                </mesh>

                {/* Right Elbow Pivot */}
                <group ref={elbowRRef} position={[0, -0.26, 0]}>
                  {/* Forearm */}
                  <mesh
                    position={[0, -0.12, 0]}
                    material={materials.darkFur}
                    castShadow
                  >
                    <capsuleGeometry args={[0.05, 0.16, 10, 16]} />
                  </mesh>
                  {/* Glowing Neon Wristband */}
                  <mesh
                    position={[0, -0.21, 0]}
                    material={materials.neonPulse}
                  >
                    <cylinderGeometry args={[0.056, 0.056, 0.035, 16]} />
                  </mesh>

                  {/* Right Wrist & Paw with Toe Beans */}
                  <group ref={wristRRef} position={[0, -0.24, 0]}>
                    {renderPawWithToeBeans(false)}
                  </group>
                </group>
              </group>
            </group>
          </group>

          {/* ================================================================
              6. ARTICULATED LEGS WITH IK COMPENSATION (Hip -> Knee -> Ankle)
          ================================================================ */}
          {/* LEFT LEG */}
          <group ref={hipLRef} position={[-0.16, 0, 0]}>
            {/* Baggy Streetwear Short Leg + Thigh */}
            <mesh
              position={[0, -0.11, 0]}
              material={materials.hoodieMat}
              castShadow
            >
              <cylinderGeometry args={[0.1, 0.115, 0.2, 16]} />
            </mesh>
            <mesh
              position={[0, -LEG_SEGMENT_LENGTH * 0.5, 0]}
              material={materials.darkFur}
              castShadow
            >
              <capsuleGeometry args={[0.068, 0.26, 10, 16]} />
            </mesh>

            {/* Left Knee Pivot */}
            <group ref={kneeLRef} position={[0, -LEG_SEGMENT_LENGTH, 0]}>
              <mesh
                position={[0, -LEG_SEGMENT_LENGTH * 0.5, 0]}
                material={materials.darkFur}
                castShadow
              >
                <capsuleGeometry args={[0.058, 0.26, 10, 16]} />
              </mesh>

              {/* Left Ankle & High-Top Sneaker */}
              <group ref={ankleLRef} position={[0, -LEG_SEGMENT_LENGTH, 0]}>
                {renderHighTopSneaker()}
              </group>
            </group>
          </group>

          {/* RIGHT LEG */}
          <group ref={hipRRef} position={[0.16, 0, 0]}>
            {/* Baggy Streetwear Short Leg + Thigh */}
            <mesh
              position={[0, -0.11, 0]}
              material={materials.hoodieMat}
              castShadow
            >
              <cylinderGeometry args={[0.1, 0.115, 0.2, 16]} />
            </mesh>
            <mesh
              position={[0, -LEG_SEGMENT_LENGTH * 0.5, 0]}
              material={materials.darkFur}
              castShadow
            >
              <capsuleGeometry args={[0.068, 0.26, 10, 16]} />
            </mesh>

            {/* Right Knee Pivot */}
            <group ref={kneeRRef} position={[0, -LEG_SEGMENT_LENGTH, 0]}>
              <mesh
                position={[0, -LEG_SEGMENT_LENGTH * 0.5, 0]}
                material={materials.darkFur}
                castShadow
              >
                <capsuleGeometry args={[0.058, 0.26, 10, 16]} />
              </mesh>

              {/* Right Ankle & High-Top Sneaker */}
              <group ref={ankleRRef} position={[0, -LEG_SEGMENT_LENGTH, 0]}>
                {renderHighTopSneaker()}
              </group>
            </group>
          </group>

          {/* ================================================================
              7. 5-SEGMENT KINEMATIC WHIP TAIL (Nested Chain 0 -> 1 -> 2 -> 3 -> 4)
              V2 SPECIES TAIL: segment groups scale by the preset — dog gets a
              short thick wagging tail, mouse a long thin drag, cat the whip.
              (Joint hierarchy untouched — only mesh/transform parameters.)
          ================================================================ */}
          <group ref={tail0Ref} position={[0, 0.02, -0.14]}>
            <mesh
              position={[0, 0, -0.08]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[preset.tailRadius, preset.tailLength, preset.tailRadius]}
              material={materials.darkFur}
              castShadow
            >
              <capsuleGeometry args={[0.044, 0.12, 8, 12]} />
            </mesh>
            {/* V1.5 Tail Base Fluff Poof (covers the rump seam) */}
            <mesh
              position={[0, 0.01, -0.02]}
              scale={Math.max(0.8, preset.tailRadius)}
              material={materials.darkFur}
              castShadow
            >
              <sphereGeometry args={[0.064, 12, 12]} />
            </mesh>

            <group ref={tail1Ref} position={[0, 0, -0.15 * preset.tailLength]}>
              <mesh
                position={[0, 0, -0.08]}
                rotation={[Math.PI / 2, 0, 0]}
                scale={[preset.tailRadius, preset.tailLength, preset.tailRadius]}
                material={materials.darkFur}
                castShadow
              >
                <capsuleGeometry args={[0.04, 0.12, 8, 12]} />
              </mesh>

              <group ref={tail2Ref} position={[0, 0, -0.15 * preset.tailLength]}>
                <mesh
                  position={[0, 0, -0.08]}
                  rotation={[Math.PI / 2, 0, 0]}
                  scale={[preset.tailRadius, preset.tailLength, preset.tailRadius]}
                  material={materials.darkFur}
                  castShadow
                >
                  <capsuleGeometry args={[0.036, 0.12, 8, 12]} />
                </mesh>

                <group ref={tail3Ref} position={[0, 0, -0.15 * preset.tailLength]}>
                  <mesh
                    position={[0, 0, -0.08]}
                    rotation={[Math.PI / 2, 0, 0]}
                    scale={[preset.tailRadius, preset.tailLength, preset.tailRadius]}
                    material={materials.darkFur}
                    castShadow
                  >
                    <capsuleGeometry args={[0.033, 0.12, 8, 12]} />
                  </mesh>

                  {/* Cream-Tipped Tail Segment 4 */}
                  <group ref={tail4Ref} position={[0, 0, -0.15 * preset.tailLength]}>
                    <mesh
                      position={[0, 0, -0.08]}
                      rotation={[Math.PI / 2, 0, 0]}
                      scale={[preset.tailRadius, preset.tailLength, preset.tailRadius]}
                      material={materials.creamFur}
                      castShadow
                    >
                      <capsuleGeometry args={[0.032, 0.13, 8, 12]} />
                    </mesh>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};

export default ProceduralDancingCat;