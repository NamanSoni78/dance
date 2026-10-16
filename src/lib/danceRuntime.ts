// src/lib/danceRuntime.ts
// Shared client-side runtime singletons for the Grand Choreographer system.
//
// WHY THIS EXISTS:
//  - The lead dancer component (writer) advances the beat clock each frame;
//    the stage camera sequencer and the HUD (readers) need the same
//    accumulated phase so bar-boundary cuts land exactly on the musical bars.
//    A module-scope singleton is the cheapest zero-prop way to share it
//    without re-renders.
//  - The choreographers and camera sequencer instances must be THE SAME
//    objects for the 3D scene (useFrame) and the 2D HUD (DOM rAF readout),
//    so both import from here.
//
// V2 (GROUP DANCE CREW):
//  - One choreographer instance PER DANCER (max 4). In UNISON / CANON /
//    MIRROR every instance shares the same seed, so identical inputs
//    (metrics, beatCount, phase) deterministically produce the identical move
//    stream — the crew stays perfectly in sync with zero per-frame
//    coordination. FREESTYLE gives each dancer a divergent seed.
//  - groupDirector owns formations, sync modes and interactions.
//  - showState feeds the stage-look ("Vibe") HUD readout.
//
// All objects are created once and mutated in place — zero allocation per frame.

import { createChoreographer, type Choreographer } from './choreographer';
import { createCameraSequencer } from './cameraShots';
import { GIRL_MOVES } from './girlMoves';
import type { DanceMove } from './danceMoves';
import {
  createGroupDirector,
  type GroupDirector,
  type SyncMode,
} from './groupDance';

export const MAX_DANCERS = 4;

/**
 * Shared musical clock. The LEAD dancer's useFrame (dancer index 0) is the
 * SINGLE WRITER (it owns eng.phase / eng.beatCount); the stage camera
 * director, follower dancers and the HUD are readers. Reading one frame
 * stale (16 ms) is imperceptible, and avoids duplicate phase integration
 * drift.
 */
export const beatClock = {
  /** Continuous beat phase: advances exactly 2*PI per musical beat. */
  phase: 0,
  /** Integer count of detected kick-transient beats since audio start. */
  beatCount: 0,
};

/**
 * V2 stage-look state, written by ProceduralClubStage's show-director
 * integration each frame and read by the page HUD's rAF loop (zero-re-render
 * "Vibe" readout).
 */
export const showState = {
  lookId: 'DIWALI_MELA',
  lookName: 'Diwali Mela — Golden Night Market',
};

// ----------------------------------------------------------------------------
// Per-dancer choreographers
// ----------------------------------------------------------------------------

const BASE_SEED = 20261014;
const SEED_STRIDE = 0x9e3779b9; // golden-ratio hash stride per dancer

function makeSeed(dancerIndex: number, sync: SyncMode): number {
  // Synced modes: identical seeds => identical deterministic move streams.
  // FREESTYLE: divergent seeds per dancer (lead keeps the base for continuity).
  if (sync !== 'FREESTYLE' || dancerIndex === 0) return BASE_SEED;
  return (BASE_SEED ^ Math.imul(dancerIndex, SEED_STRIDE)) >>> 0;
}

function buildDancerChoreographers(
  sync: SyncMode,
  moves?: readonly DanceMove[]
): Choreographer[] {
  const list: Choreographer[] = [];
  for (let i = 0; i < MAX_DANCERS; i++) {
    list.push(
      createChoreographer({
        maxHoldBars: 4,
        minHoldBars: 2,
        recencyWindow: 6,
        seed: makeSeed(i, sync),
        // V4: the Diva runs her own move library through the SAME sequencer
        // laws — identical seeds keep her switch TIMING in sync with the
        // animals in UNISON/CANON/MIRROR (same index cadence, her own steps).
        ...(moves ? { moves } : {}),
      })
    );
  }
  return list;
}

/**
 * One choreographer per dancer slot (0 = lead). Rebuilt whenever the
 * EFFECTIVE sync mode changes (groupDirector fires the callback, including
 * on AUTO rotation switches).
 */
export let dancerChoreographers: Choreographer[] =
  buildDancerChoreographers('UNISON');

/**
 * V4: parallel array for GIRL dancers — same seeds + sequencer laws, but
 * running the Diva's own move library (girlMoves.ts). A girl slot picks
 * her choreographer from here; animal slots use dancerChoreographers.
 */
export let girlChoreographers: Choreographer[] =
  buildDancerChoreographers('UNISON', GIRL_MOVES);

function rebuildChoreographers(sync: SyncMode): void {
  dancerChoreographers = buildDancerChoreographers(sync);
  girlChoreographers = buildDancerChoreographers(sync, GIRL_MOVES);
}

/**
 * The V2 group dance director — formations, sync modes and interactions for
 * 1-4 dancers. The lead dancer is the single caller of update().
 */
export const groupDirector: GroupDirector = createGroupDirector(20261015);

// Wire sync-mode changes (UI or AUTO rotation) to choreographer seed rebuilds
groupDirector.setOnSyncModeChange((sync) => {
  rebuildChoreographers(groupDirector.getActiveSyncMode());
  // The callback receives the pill value ('AUTO' included); the EFFECTIVE
  // mode comes from the director. Rebuild uses the effective mode above.
  void sync;
});

/**
 * The cinematic camera director (27 music-video shots — V2 wide-by-default +
 * 8 bonus tour shots — bar-boundary hard cuts, bass-drop crash cuts,
 * directional beat-punch, smoothed shake + roll, group-crew framing bias).
 * Only drives the camera in DYNAMIC_AUTO / preset modes — ORBIT remains
 * user-owned.
 */
export const cameraSequencer = createCameraSequencer(7777);

/**
 * Convenience accessor for the HUD: the lead dancer's choreographer drives
 * the "Now dancing" readout.
 */
export function getLeadChoreographer(): Choreographer {
  return dancerChoreographers[0];
}
