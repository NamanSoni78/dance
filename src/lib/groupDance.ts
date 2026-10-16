// src/lib/groupDance.ts
// V3 GROUP DANCE CREW — the Grand Group Choreographer V2.5 mode machine.
//
// ARCHITECTURE (V3 — external AI package integrated, audited + adapted):
//  - The LEAD dancer (index 0) is the single writer of the shared beatClock
//    and the only caller of groupDirector.update() — followers read their
//    DancerSlotState one frame later (16 ms, imperceptible, same pattern as
//    the camera sequencer).
//  - Three CHOREOGRAPHIC MODES rotate on bar-locked phrase boundaries:
//      FORMATION_GROUP    — crew runs the 42-move choreographer in one of 18
//                           animated formations (LINE/ARC/DIAMOND/CIRCLE pills
//                           map into the library; AUTO rotates all 18), with
//                           UNISON / CANON / MIRROR flavor.
//      DUET_CONTACT       — a pair runs a fully authored 41-channel partner
//                           choreography (32 duets: Dandiya 4-taal suite,
//                           lifts, high-five chains, comedy scale-duets).
//                           n=2 → pair (0,1) center · n=3 → rotating pair +
//                           upstage hype backdrop · n=4 → double-duet ±1.22 m.
//      SPECIES_SPOTLIGHT  — call-and-response cypher: the featured species
//                           runs one of its 5 signature moves at the downstage
//                           apex while the crew runs hype-response poses.
//  - Scheduling laws (from the package's integration guide, verified):
//      1. Never trigger mid-bar (beatCount % 4 === 0 only).
//      2. phaseOffset forced to 0 during duets/spotlights (contact sync).
//      3. Legacy envelope interactions disabled during duets (authored
//         contact coordinates would be corrupted) — the V2 envelope system
//         is retired; duets + spotlights ARE the interaction system now.
//
// ZERO-ALLOCATION LAW: every per-frame path below is scalar math on
// pre-allocated state objects — no new, no closures, no arrays.

import type { AudioMetrics } from './choreographer';
import type { DanceMove } from './danceMoves';
import type { SpeciesId } from './species';
import type { DuetMove, DuetFacing } from './duetMoves';
import {
  GROUP_FORMATIONS,
  FORMATION_BY_ID,
  evaluateFormationSlot,
  selectGroupFormation,
  type GroupFormationDef,
} from './groupFormations';
import { selectDuetMove } from './duetMoves';
import { selectSignatureMove } from './speciesFlavor';
import { GIRL_DUET_MOVES } from './girlDuetMoves';
import {
  selectGirlSpotlight,
  selectGirlSpotlightAlt,
} from './girlSpotlight';

// ----------------------------------------------------------------------------
// V5 — Diva duet selection: when the dancing pair contains the GIRL, the
// duet comes from her authored 16-routine suite (poseA = feminine anchor,
// poseB = counter-choreography), and the GIRL is always assigned PARTNER_A
// so she dances the feminine anchor line. Deterministic scoring mirrors
// selectDuetMove (tempo fit + energy proximity + beat-seeded jitter +
// recency penalty) — zero allocation, no closures.
// ----------------------------------------------------------------------------
function selectGirlDuetMove(
  bpm: number,
  energy: number,
  seedBeat: number,
  lastMoveId: string
): DuetMove {
  let bestMove = GIRL_DUET_MOVES[0];
  let bestScore = -1e9;
  const n = GIRL_DUET_MOVES.length;

  for (let i = 0; i < n; i++) {
    const m = GIRL_DUET_MOVES[i];
    let score = 0;

    const minBpm = m.tempoFit[0];
    const maxBpm = m.tempoFit[1];
    if (bpm >= minBpm && bpm <= maxBpm) {
      score += 2.0;
    } else {
      const dist = bpm < minBpm ? minBpm - bpm : bpm - maxBpm;
      score -= dist * 0.04;
    }

    const eDiff = Math.abs(m.energy - energy);
    score += (1.0 - eDiff) * 2.5;

    const hash = ((seedBeat * 131 + i * 97) % 100) * 0.012;
    score += hash;

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

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type Formation = 'AUTO' | 'LINE' | 'ARC' | 'DIAMOND' | 'CIRCLE';
export type SyncMode = 'AUTO' | 'UNISON' | 'CANON' | 'MIRROR' | 'FREESTYLE';
export type InteractionId = 'NONE'; // legacy — envelope interactions retired in V3
export type ChoreoMode = 'FORMATION_GROUP' | 'DUET_CONTACT' | 'SPECIES_SPOTLIGHT';
export type DuetRole = 'NONE' | 'PARTNER_A' | 'PARTNER_B' | 'HYPE_BACKDROP';

export interface DancerSlotState {
  /** Stage-space slot target the engine damps its outer group toward. */
  targetX: number;
  targetZ: number;
  /** Facing yaw target (0 = toward the camera / +Z). Added to spin yaw. */
  targetYaw: number;
  /** Beat-phase offset (rad) fed ONLY into this dancer's choreographer (CANON). */
  phaseOffset: number;
  /** Mirror the pose left/right (MIRROR mode / MIRRORED duets). */
  mirror: boolean;
  /** Legacy V2 envelope interaction channel — permanently NONE in V3. */
  interaction: InteractionId;
  interIntensity: number;
  leanDir: number;
  /** Pending synchronized spin radians (consumed by the engine each frame). */
  pendingGroupSpin: number;
  // ---- V3 (Group Choreographer V2.5) ----
  duetRole: DuetRole;
  isSpotlightSoloist: boolean;
  /** -1 left of stage center, +1 right (drives hype-crew pointing). */
  slotSideSign: number;
}

/** Stable, mutated-in-place snapshot the engines + camera read every frame. */
export interface ChoreoState {
  mode: ChoreoMode;
  duet: DuetMove | null;
  signature: DanceMove | null;
  /** V4: second signature for the same spotlight — the soloist chains
      signature -> signatureAlt at the mode's midpoint so a 4-bar spotlight
      shows TWO different signature moves instead of one repeated loop
      (the "they just repeat the same move" V3 complaint). */
  signatureAlt: DanceMove | null;
  spotlightIndex: number;
  formationId: string;
  isMirror: boolean;
  isCanon: boolean;
  /** beatCount when the current mode started (mode-locked moveBeat base). */
  beatStart: number;
  /** Planned mode duration in beats (duet = durationBars * 4). */
  durationBeats: number;
}

export interface GroupDirector {
  update: (metrics: AudioMetrics, beatCount: number, phase: number, dt: number) => void;
  setDancerCount: (n: number) => void;
  getDancerCount: () => number;
  setFormation: (f: Formation) => void;
  getFormation: () => Formation;
  setSync: (s: SyncMode) => void;
  getSync: () => SyncMode;
  getActiveSyncMode: () => Exclude<SyncMode, 'AUTO'>;
  /** V3: crew species list (drives spotlight signature selection). */
  setCrewSpecies: (species: readonly SpeciesId[]) => void;
  /** V3: stable choreography state snapshot (engines + camera hints). */
  getChoreoState: () => ChoreoState;
  /** Stable per-dancer state reference (mutated in place). */
  getSlotState: (i: number) => DancerSlotState;
  /** Initial [x, z] for a dancer's mount position. */
  getInitialSlot: (i: number) => [number, number];
  /** Drains this dancer's pending synchronized spin. */
  consumeGroupSpin: (i: number) => number;
  /** Fired whenever the EFFECTIVE sync mode changes (AUTO rotation included)
      so danceRuntime can rebuild the choreographer seeds. */
  setOnSyncModeChange: (cb: (mode: SyncMode) => void) => void;
  /** HUD summary ("Duet · Dandiya Raas", "4 · Line Breathing · Canon"), written
      into a reused object. */
  getSummary: (out: { text: string }) => void;
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const MAX_DANCERS = 4;
const TWO_PI = Math.PI * 2;
const BEAT = TWO_PI; // one beat of accumulated choreographer phase

/** UI formation pills → V2.5 formation library ids. */
const FORMATION_PILL_MAP: Record<Exclude<Formation, 'AUTO'>, string> = {
  LINE: 'LINE_BREATHING',
  ARC: 'ARC_CRESCENT_SWAY',
  DIAMOND: 'DIAMOND_PULSE',
  CIRCLE: 'CIRCLE_GARBA_RING',
};

const DEFAULT_FORMATION = FORMATION_BY_ID['LINE_BREATHING'] ?? GROUP_FORMATIONS[0];

// ----------------------------------------------------------------------------
// Director factory
// ----------------------------------------------------------------------------

export function createGroupDirector(seed = 20261015): GroupDirector {
  const rng = { s: seed >>> 0 };

  function rand(): number {
    let t = (rng.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---- persistent state -----------------------------------------------------
  let dancerCount = 1;
  let formation: Formation = 'AUTO';
  let forcedFormation: GroupFormationDef | null = null; // non-null when a pill is picked
  let syncMode: SyncMode = 'AUTO';
  let activeSync: Exclude<SyncMode, 'AUTO'> = 'UNISON';
  let onSyncModeChange: ((m: SyncMode) => void) | null = null;

  // Crew species (V3 — page keeps this in sync with the dancer list)
  const crewSpecies: SpeciesId[] = ['CAT', 'CAT', 'CAT', 'CAT'];

  // Mode machine state
  let mode: ChoreoMode = 'FORMATION_GROUP';
  let modeStartBeat = 0;
  let modeDurationBeats = 24;
  let activeFormation: GroupFormationDef = DEFAULT_FORMATION;
  let formationStartBeat = 0;
  let activeDuet: DuetMove | null = null;
  let lastDuetId = '';
  let trioOddOutIndex = 2;
  // V5: true while the active duet is one of the Diva's authored routines —
  // drives girl-first PARTNER_A assignment in driveDuetSlots.
  let duetGirlLeads = false;
  let spotlightDancerIndex = 0;
  let activeSignature: DanceMove | null = null;
  let signatureAlt: DanceMove | null = null;
  let lastSignatureId = '';
  let isMirrorMode = false;
  let isCanonMode = false;
  // V3 mode rotation memory: alternates duet / spotlight so the show cycles
  // through BOTH special modes instead of repeating one
  let lastSpecialMode: ChoreoMode = 'FORMATION_GROUP';
  let nextSyncSwitchBeat = 96;
  let initialized = false;

  // Stable snapshot for engines + camera (mutated in place)
  const choreoState: ChoreoState = {
    mode: 'FORMATION_GROUP',
    duet: null,
    signature: null,
    signatureAlt: null,
    spotlightIndex: 0,
    formationId: DEFAULT_FORMATION.id,
    isMirror: false,
    isCanon: false,
    beatStart: 0,
    durationBeats: 24,
  };

  // Per-dancer states (stable references, mutated in place)
  const slots: DancerSlotState[] = [];
  for (let i = 0; i < MAX_DANCERS; i++) {
    slots.push({
      targetX: 0, targetZ: 0, targetYaw: 0,
      phaseOffset: 0, mirror: false,
      interaction: 'NONE', interIntensity: 0, leanDir: 1,
      pendingGroupSpin: 0,
      duetRole: 'NONE', isSpotlightSoloist: false, slotSideSign: 1,
    });
  }

  // Scratch formation slot (avoids per-frame allocation)
  const slotScratch = { x: 0, z: 0, yaw: 0 };

  // ---- helpers ---------------------------------------------------------------

  function applySyncFlavor(): void {
    // Mirror / canon flags in FORMATION_GROUP come from the effective sync
    // mode. Explicit pills override; AUTO uses the deterministic flavor roll.
    for (let i = 0; i < MAX_DANCERS; i++) {
      slots[i].phaseOffset = 0;
      slots[i].mirror = false;
    }
    if (syncMode !== 'AUTO') {
      if (activeSync === 'CANON') {
        for (let i = 1; i < dancerCount; i++) slots[i].phaseOffset = i * 0.52;
        isCanonMode = true;
        isMirrorMode = false;
      } else if (activeSync === 'MIRROR') {
        for (let i = 0; i < dancerCount; i++) slots[i].mirror = i >= (dancerCount >> 1);
        isMirrorMode = true;
        isCanonMode = false;
      } else {
        isMirrorMode = false;
        isCanonMode = false;
      }
      return;
    }
    // AUTO flavor roll (their deterministic toggle): rotates every mode cycle
    const flavorRoll = (modeStartBeat * 37) % 10;
    isMirrorMode = flavorRoll < 3;
    isCanonMode = !isMirrorMode && flavorRoll >= 3 && flavorRoll < 6;
    if (isMirrorMode) {
      for (let i = 0; i < dancerCount; i++) slots[i].mirror = i >= (dancerCount >> 1);
    } else if (isCanonMode) {
      for (let i = 1; i < dancerCount; i++) slots[i].phaseOffset = i * 0.52;
    }
  }

  function clearRoles(): void {
    for (let i = 0; i < MAX_DANCERS; i++) {
      slots[i].duetRole = 'NONE';
      slots[i].isSpotlightSoloist = false;
      slots[i].slotSideSign = 1;
    }
  }

  /**
   * Duet pair anchor solver (package geometry, verbatim laws): exact world
   * slots + mirror flags for Partner A / B given facing & anchorDistance.
   */
  function assignDuetPairSlots(
    slotA: DancerSlotState,
    slotB: DancerSlotState,
    centerX: number,
    centerZ: number,
    facing: DuetFacing,
    anchorDistance: number
  ): void {
    const halfDist = anchorDistance * 0.5;

    slotA.duetRole = 'PARTNER_A';
    slotB.duetRole = 'PARTNER_B';
    slotA.isSpotlightSoloist = false;
    slotB.isSpotlightSoloist = false;
    slotA.phaseOffset = 0.0; // Law 2: zero phase offset during contact duets
    slotB.phaseOffset = 0.0;
    slotA.mirror = false;
    slotB.mirror = false;

    if (facing === 'EACH_OTHER') {
      // 68° inward so sticks/palms meet on the centerline while both visors
      // stay visible to the camera.
      slotA.targetX = centerX - halfDist;
      slotA.targetZ = centerZ;
      slotA.targetYaw = 1.18;
      slotA.slotSideSign = -1;
      slotB.targetX = centerX + halfDist;
      slotB.targetZ = centerZ;
      slotB.targetYaw = -1.18;
      slotB.slotSideSign = 1;
    } else if (facing === 'MIRRORED') {
      // Side-by-side facing camera; engine mirrors Partner B's L/R channels.
      slotA.targetX = centerX - halfDist;
      slotA.targetZ = centerZ;
      slotA.targetYaw = 0.08;
      slotA.slotSideSign = -1;
      slotB.targetX = centerX + halfDist;
      slotB.targetZ = centerZ;
      slotB.targetYaw = -0.08;
      slotB.mirror = true;
      slotB.slotSideSign = 1;
    } else if (facing === 'BACK_TO_BACK') {
      slotA.targetX = centerX - halfDist;
      slotA.targetZ = centerZ;
      slotA.targetYaw = -0.68;
      slotA.slotSideSign = -1;
      slotB.targetX = centerX + halfDist;
      slotB.targetZ = centerZ;
      slotB.targetYaw = 0.68;
      slotB.slotSideSign = 1;
    } else if (facing === 'PERPENDICULAR') {
      // Cuban-salsa / cross-body L-frame
      slotA.targetX = centerX - halfDist;
      slotA.targetZ = centerZ - 0.12;
      slotA.targetYaw = 0.78;
      slotA.slotSideSign = -1;
      slotB.targetX = centerX + halfDist;
      slotB.targetZ = centerZ + 0.12;
      slotB.targetYaw = -0.38;
      slotB.slotSideSign = 1;
    } else {
      // SIDE_BY_SIDE
      slotA.targetX = centerX - halfDist;
      slotA.targetZ = centerZ;
      slotA.targetYaw = 0.0;
      slotA.slotSideSign = -1;
      slotB.targetX = centerX + halfDist;
      slotB.targetZ = centerZ;
      slotB.targetYaw = 0.0;
      slotB.slotSideSign = 1;
    }
  }

  /** Resets to the baseline group mode (also the safe state on crew changes). */
  function enterFormationGroup(beatCount: number, energy: number, pickNew: boolean): void {
    mode = 'FORMATION_GROUP';
    modeStartBeat = beatCount;
    // V4 VARIETY OVERHAUL: 6-10 bars (24-40 beats) instead of 4-8. The
    // FORMATION_GROUP window is where the 42-move non-repetitive sequencer
    // actually lives — it needs room to cycle 3-5 moves per window or the
    // whole show reads as "they just repeat the same move". Specials (duet /
    // spotlight, 4 bars each) now bookend longer free-dance passages, so the
    // time-share is roughly half sequencer showcase, half authored contact
    // choreography. First cycle stays short (4 bars) so the first duet still
    // lands within ~10-20 s of song start.
    modeDurationBeats = modeStartBeat < 32 ? 16 : 24 + (rand() < 0.4 ? 16 : 0);
    activeDuet = null;
    activeSignature = null;
    clearRoles();
    if (forcedFormation !== null) {
      activeFormation = forcedFormation;
    } else if (pickNew) {
      activeFormation = selectGroupFormation(
        dancerCount, energy, beatCount, activeFormation.id
      );
    }
    formationStartBeat = beatCount;
    applySyncFlavor();
  }

  // ---- per-frame slot driving ------------------------------------------------

  function driveDuetSlots(): void {
    const d = activeDuet as DuetMove;
    // V5: girl-first ordering — when the active duet is one of the Diva's
    // authored routines, any GIRL in a pair takes PARTNER_A (the feminine
    // anchor line poseA was choreographed for); her partner takes poseB.
    // (Plain booleans — no closures, no tuples: zero allocation per frame.)
    if (dancerCount === 2) {
      const swap =
        duetGirlLeads &&
        crewSpecies[1] === 'GIRL' &&
        crewSpecies[0] !== 'GIRL';
      assignDuetPairSlots(
        swap ? slots[1] : slots[0],
        swap ? slots[0] : slots[1],
        0.0, 0.15, d.facing, d.anchorDistance
      );
    } else if (dancerCount === 3) {
      const odd = trioOddOutIndex % 3;
      const idxA = (odd + 1) % 3;
      const idxB = (odd + 2) % 3;
      const swap =
        duetGirlLeads &&
        crewSpecies[idxB] === 'GIRL' &&
        crewSpecies[idxA] !== 'GIRL';
      assignDuetPairSlots(
        swap ? slots[idxB] : slots[idxA],
        swap ? slots[idxA] : slots[idxB],
        0.0, 0.32, d.facing, d.anchorDistance
      );
      // 3rd dancer anchors upstage center as the hype backdrop
      const oddSlot = slots[odd];
      oddSlot.duetRole = 'HYPE_BACKDROP';
      oddSlot.isSpotlightSoloist = false;
      oddSlot.targetX = 0.0;
      oddSlot.targetZ = -0.82;
      oddSlot.targetYaw = 0.0;
      oddSlot.phaseOffset = 0.0;
      oddSlot.mirror = false;
      oddSlot.slotSideSign = 1;
    } else {
      // n === 4: dual synchronized duets Stage Left / Stage Right
      const swap1 =
        duetGirlLeads &&
        crewSpecies[1] === 'GIRL' &&
        crewSpecies[0] !== 'GIRL';
      const swap2 =
        duetGirlLeads &&
        crewSpecies[3] === 'GIRL' &&
        crewSpecies[2] !== 'GIRL';
      assignDuetPairSlots(
        swap1 ? slots[1] : slots[0],
        swap1 ? slots[0] : slots[1],
        -1.22, 0.15, d.facing, d.anchorDistance
      );
      assignDuetPairSlots(
        swap2 ? slots[3] : slots[2],
        swap2 ? slots[2] : slots[3],
        1.22, 0.15, d.facing, d.anchorDistance
      );
    }
  }

  function driveFormationSlots(beatCount: number, phase: number): void {
    const n = Math.max(1, dancerCount);
    const beatsInFormation =
      beatCount - formationStartBeat + (phase / TWO_PI) % 1;
    const leadIdx = spotlightDancerIndex % n;
    for (let i = 0; i < n; i++) {
      const slot = slots[i];
      slot.duetRole = 'NONE';
      // Spotlight mode maps the featured dancer to formation slot 0
      // (downstage apex) and shifts the others outward.
      const formationSlotIndex =
        mode === 'SPECIES_SPOTLIGHT'
          ? i === leadIdx ? 0 : i < leadIdx ? i + 1 : i
          : i;
      evaluateFormationSlot(activeFormation, formationSlotIndex, n, beatsInFormation, slotScratch);
      slot.targetX = slotScratch.x;
      slot.targetZ = slotScratch.z;
      slot.targetYaw = slotScratch.yaw;
      slot.slotSideSign = slotScratch.x < 0 ? -1 : 1;
      slot.isSpotlightSoloist = mode === 'SPECIES_SPOTLIGHT' && i === leadIdx;
      if (mode === 'SPECIES_SPOTLIGHT') {
        slot.phaseOffset = 0.0;
        slot.mirror = false;
      }
      // (FORMATION_GROUP keeps the mirror/canon flavor from applySyncFlavor)
    }
  }

  // ---- public API -----------------------------------------------------------

  const api: GroupDirector = {
    update(metrics, beatCount, phase, dt): void {
      void dt;
      if (!initialized) {
        initialized = true;
        enterFormationGroup(beatCount, 0.5, true);
        nextSyncSwitchBeat = beatCount + 96;
      }

      const n = dancerCount;
      const beatsInMode = beatCount - modeStartBeat;

      // ---- mode transitions: strictly on a bar downbeat, never mid-bar ----
      // V3 design (adapted from the package's phrase law): the strict
      // phraseIndex arithmetic proved too rigid in simulation — transitions
      // that landed on phrase-2 boundaries always coincided with the intro's
      // low-energy beat, so spotlights could NEVER fire. The rotation is now
      // deterministic alternation: FORMATION → duet → FORMATION → spotlight →
      // … with energy gates (duet ≥ 0.30, spotlight ≥ 0.35) that fall back
      // to the other special mode (or the baseline) when energy doesn't fit.
      // ---- mode transitions: strictly on a bar downbeat, never mid-bar ----
      // V4 VARIETY OVERHAUL (the real "repeat same move" fix): the V3 machine
      // chained specials back-to-back (duet -> spotlight -> duet ...), so a
      // crew spent ~92% of the show inside authored fixed loops and the
      // 42-move non-repetitive sequencer almost never danced. Now a special
      // NEVER chains into the next special: every duet/spotlight is followed
      // by a baseline FORMATION_GROUP passage (6-10 bars) where the
      // sequencer cycles 3-5 moves, and the next special fires from there
      // (energy gates: duet >= 0.30, spotlight >= 0.35; alternation still
      // picks WHICH special so both rotate).
      if (metrics.isBeat && beatCount % 4 === 0 && beatsInMode >= modeDurationBeats) {
        const energy = metrics.overall;
        const energyOkDuet = energy >= 0.30;
        const energyOkSpot = energy >= 0.35;
        const inSpecial = mode === 'DUET_CONTACT' || mode === 'SPECIES_SPOTLIGHT';

        if (inSpecial) {
          // Special just ended -> ALWAYS back to the baseline.
          enterFormationGroup(beatCount, energy, true);
        } else if (n >= 2 && metrics.isPlaying && (energyOkDuet || energyOkSpot)) {
          let useSpotlight = lastSpecialMode === 'DUET_CONTACT';
          if (useSpotlight && !energyOkSpot) useSpotlight = false;
          else if (!useSpotlight && !energyOkDuet) useSpotlight = true;

          if (!useSpotlight) {
            // -> DUET_CONTACT: authored 41-channel partner choreography
            mode = 'DUET_CONTACT';
            modeStartBeat = beatCount;
            // V5: rotate the trio odd-out FIRST so the pair that will actually
            // dance is known before the duet library is chosen.
            trioOddOutIndex = (trioOddOutIndex + 1) % 3;
            // V5 DIVA SUITE: if the pair that is about to dance contains the
            // GIRL, pick from her 16 authored partner routines and mark the
            // duet girl-led so driveDuetSlots assigns her PARTNER_A (poseA is
            // her feminine anchor line; poseB is the counter-choreography).
            let pairA = 0;
            let pairB = 1;
            if (n === 3) {
              pairA = (trioOddOutIndex + 1) % 3;
              pairB = (trioOddOutIndex + 2) % 3;
            }
            const girlInPair =
              crewSpecies[pairA] === 'GIRL' || crewSpecies[pairB] === 'GIRL';
            duetGirlLeads = girlInPair;
            activeDuet = girlInPair
              ? selectGirlDuetMove(metrics.bpm, energy, beatCount, lastDuetId)
              : selectDuetMove(metrics.bpm, energy, beatCount, lastDuetId);
            lastDuetId = activeDuet.id;
            modeDurationBeats = activeDuet.durationBars * 4;
            activeSignature = null;
            signatureAlt = null;
            clearRoles();
            isMirrorMode = activeDuet.facing === 'MIRRORED';
            isCanonMode = false;
            lastSpecialMode = 'DUET_CONTACT';
          } else {
            // -> SPECIES_SPOTLIGHT: call-and-response cypher
            mode = 'SPECIES_SPOTLIGHT';
            modeStartBeat = beatCount;
            modeDurationBeats = 16; // 4 bars per spotlight
            activeDuet = null;
            signatureAlt = null;
            spotlightDancerIndex = (spotlightDancerIndex + 1) % n;
            const leadSpecies = crewSpecies[spotlightDancerIndex % MAX_DANCERS] ?? 'CAT';
            // V5 DIVA: her spotlight showstoppers come from her own authored
            // 10-routine suite via the deterministic AI selectors (recency +
            // tempo-window + energy matching), replacing the generic species
            // signature picker for the GIRL.
            if (leadSpecies === 'GIRL') {
              activeSignature = selectGirlSpotlight(
                energy,
                metrics.bpm,
                undefined,
                beatCount,
                lastSignatureId || undefined
              );
              signatureAlt = selectGirlSpotlightAlt(
                activeSignature.id,
                energy,
                metrics.bpm,
                undefined,
                beatCount + 7
              );
            } else {
              activeSignature = selectSignatureMove(
                leadSpecies, metrics.bpm, energy, beatCount, lastSignatureId
              );
              // V4: pick a genuinely different second signature for the mode's
              // midpoint hand-off (seeded +7 beats so the deterministic hash
              // explores a different pick; lastMoveId excludes the first).
              signatureAlt = selectSignatureMove(
                leadSpecies, metrics.bpm, energy, beatCount + 7, activeSignature.id
              );
            }
            lastSignatureId = activeSignature.id;
            clearRoles();
            // Pick a 'solo-spot' tagged formation (SOLO_SPOTLIGHT /
            // CALL_RESPONSE_CYPHER) unless the user forced a formation pill
            if (forcedFormation === null) {
              activeFormation = selectGroupFormation(
                n, energy, beatCount, activeFormation.id, 'solo-spot'
              );
              formationStartBeat = beatCount;
            }
            isMirrorMode = false;
            isCanonMode = false;
            lastSpecialMode = 'SPECIES_SPOTLIGHT';
          }
        } else {
          // -> FORMATION_GROUP baseline
          enterFormationGroup(beatCount, metrics.overall, true);
        }
      }

      // ---- per-frame slot targets for the current mode ----
      if (mode === 'DUET_CONTACT' && activeDuet !== null && n >= 2) {
        driveDuetSlots();
      } else {
        driveFormationSlots(beatCount, phase);
      }

      // ---- Sync AUTO rotation (explicit pills freeze the mode) ----
      if (syncMode === 'AUTO' && beatCount >= nextSyncSwitchBeat) {
        const cycle: Exclude<SyncMode, 'AUTO'>[] = ['UNISON', 'CANON', 'MIRROR', 'FREESTYLE'];
        const idx = (cycle.indexOf(activeSync) + 1) % cycle.length;
        activeSync = cycle[idx];
        nextSyncSwitchBeat =
          beatCount + 64 + Math.floor(rand() * 64);
        if (mode === 'FORMATION_GROUP') applySyncFlavor();
        if (onSyncModeChange) onSyncModeChange(syncMode);
      }

      // ---- publish the stable snapshot ----
      choreoState.mode = n >= 2 ? mode : 'FORMATION_GROUP';
      choreoState.duet = choreoState.mode === 'DUET_CONTACT' ? activeDuet : null;
      choreoState.signature =
        choreoState.mode === 'SPECIES_SPOTLIGHT' ? activeSignature : null;
      choreoState.signatureAlt =
        choreoState.mode === 'SPECIES_SPOTLIGHT' ? signatureAlt : null;
      choreoState.spotlightIndex = spotlightDancerIndex;
      choreoState.formationId = activeFormation.id;
      choreoState.isMirror = isMirrorMode;
      choreoState.isCanon = isCanonMode;
      choreoState.beatStart = modeStartBeat;
      choreoState.durationBeats = modeDurationBeats;
    },

    setDancerCount(nCount: number): void {
      const n = Math.max(1, Math.min(MAX_DANCERS, Math.floor(nCount)));
      if (n === dancerCount) return;
      dancerCount = n;
      // Crew changed: reset to the safe baseline so no stale duet roles or
      // spotlight flags point at dancers that no longer exist.
      activeDuet = null;
      activeSignature = null;
      clearRoles();
      enterFormationGroup(modeStartBeat, 0.5, true);
    },

    getDancerCount(): number {
      return dancerCount;
    },

    setCrewSpecies(species: readonly SpeciesId[]): void {
      for (let i = 0; i < MAX_DANCERS; i++) {
        crewSpecies[i] = species[i] ?? species[species.length - 1] ?? 'CAT';
      }
    },

    getChoreoState(): ChoreoState {
      return choreoState;
    },

    setFormation(f: Formation): void {
      formation = f;
      if (f === 'AUTO') {
        forcedFormation = null;
      } else {
        forcedFormation =
          FORMATION_BY_ID[FORMATION_PILL_MAP[f]] ?? DEFAULT_FORMATION;
        activeFormation = forcedFormation;
        // A formation pill interrupts any duet/spotlight cleanly at the next
        // bar — snap to the baseline group mode immediately for responsiveness.
        activeDuet = null;
        activeSignature = null;
        clearRoles();
        mode = 'FORMATION_GROUP';
        formationStartBeat = modeStartBeat;
      }
    },

    getFormation(): Formation {
      return formation;
    },

    setSync(s: SyncMode): void {
      syncMode = s;
      if (s !== 'AUTO') {
        activeSync = s;
        if (mode === 'FORMATION_GROUP') applySyncFlavor();
        if (onSyncModeChange) onSyncModeChange(syncMode);
      }
    },

    getSync(): SyncMode {
      return syncMode;
    },

    getActiveSyncMode(): Exclude<SyncMode, 'AUTO'> {
      return activeSync;
    },

    getSlotState(i: number): DancerSlotState {
      return slots[Math.max(0, Math.min(MAX_DANCERS - 1, i))];
    },

    getInitialSlot(i: number): [number, number] {
      const idx = Math.max(0, Math.min(MAX_DANCERS - 1, i));
      const f = forcedFormation ?? activeFormation;
      slotScratch.x = 0; slotScratch.z = 0; slotScratch.yaw = 0;
      f.slot(idx, Math.max(1, dancerCount), slotScratch);
      return [slotScratch.x, slotScratch.z];
    },

    consumeGroupSpin(i: number): number {
      const idx = Math.max(0, Math.min(MAX_DANCERS - 1, i));
      const s = slots[idx].pendingGroupSpin;
      slots[idx].pendingGroupSpin = 0;
      return s;
    },

    setOnSyncModeChange(cb): void {
      onSyncModeChange = cb;
    },

    getSummary(out: { text: string }): void {
      const n = dancerCount;
      if (n < 2) {
        out.text = 'Solo';
        return;
      }
      if (choreoState.mode === 'DUET_CONTACT' && activeDuet !== null) {
        // "Duet · Dandiya Raas" — first segment of the authored name
        let name = activeDuet.name;
        const dash = name.indexOf(' — ');
        if (dash > 0) name = name.slice(0, dash);
        const emDash = name.indexOf(' — ');
        if (emDash > 0) name = name.slice(0, emDash);
        out.text = `${n} · Duet · ${name}`;
        return;
      }
      if (choreoState.mode === 'SPECIES_SPOTLIGHT' && activeSignature !== null) {
        let name = activeSignature.name;
        const dash = name.indexOf(' — ');
        if (dash > 0) name = name.slice(0, dash);
        out.text = `${n} · Spotlight · ${name}`;
        return;
      }
      let formName = activeFormation.name;
      const dash = formName.indexOf(' — ');
      if (dash > 0) formName = formName.slice(0, dash);
      const flavor = isMirrorMode ? 'Mirror' : isCanonMode ? 'Canon' : activeSync;
      out.text = `${n} · ${formName} · ${flavor}`;
    },
  };

  return api;
}
