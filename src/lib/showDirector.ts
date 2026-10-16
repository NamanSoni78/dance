// src/lib/showDirector.ts
// V2 'Grand Show Director' pack — energy-matched stage-look sequencer: rotates
// looks every 32-64 beats (16-beat grid), crash-cuts to hype looks on real
// energy-jump drops, 2-bar exponential palette crossfade, seeded mulberry32.
import * as THREE from 'three';
import { AudioMetrics } from './choreographer';
import { STAGE_LOOKS, StageLook } from './stageLooks';

export interface ShowDirector {
  /** Per frame. Advances look rotation on 32–64 beat boundaries and on
      big energy transitions; crossfades look parameters over ~2 bars. */
  update: (
    metrics: AudioMetrics,
    beatCount: number,
    phase: number,
    dt: number,
    elapsed: number
  ) => void;
  /** Current (blended) look parameters for the integrator to apply.
      All values are smoothly crossfaded between looks — never snap. */
  getActiveLookId: () => string;
  getActiveLookName: () => string;
  /** Blended palette targets the integrator can copy into scratch colors. */
  getBlendedPalette: (out: {
    primary: THREE.Color; secondary: THREE.Color;
    accent: THREE.Color; base: THREE.Color;
    spotL: THREE.Color; spotR: THREE.Color; rim: THREE.Color;
  }) => void;
  /** 0..1 progress of the current crossfade (for optional HUD display). */
  getBlendProgress: () => number;
  forceLook: (id: string) => void;
}

// ----------------------------------------------------------------------------
// Seeded RNG (§2.4 Determinism Law — mulberry32)
// ----------------------------------------------------------------------------
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ParsedLookColors {
  look: StageLook;
  primary: THREE.Color;
  secondary: THREE.Color;
  accent: THREE.Color;
  base: THREE.Color;
  spotL: THREE.Color;
  spotR: THREE.Color;
  rim: THREE.Color;
  ambient: THREE.Color;
  isHype: boolean;
  idealEnergy: number;
}

/**
 * Helper to retrieve full non-color metadata (floorPattern, signatureFx, fovMoodBias)
 * for any look id in O(1) without allocating.
 */
export function getStageLookById(id: string): StageLook {
  for (let i = 0; i < STAGE_LOOKS.length; i++) {
    if (STAGE_LOOKS[i].id === id) return STAGE_LOOKS[i];
  }
  return STAGE_LOOKS[0];
}

export function createShowDirector(config?: {
  seed?: number;
  minHoldBeats?: number;   // default 32
  maxHoldBeats?: number;   // default 64
}): ShowDirector {
  const seed = config?.seed ?? 0x2026c0de;
  const minHoldBeats = config?.minHoldBeats ?? 32;
  const maxHoldBeats = config?.maxHoldBeats ?? 64;
  const rand = makeRand(seed);

  // Pre-parse all hex colors once at creation (§12 Performance Target: zero string ops per frame)
  const parsedLooks: ParsedLookColors[] = STAGE_LOOKS.map((look) => {
    const isHype = look.fovMoodBias >= 2.0;
    // Map fovMoodBias (-2..+3) to ideal overall song energy (0.25..0.85)
    const idealEnergy = Math.max(
      0.2,
      Math.min(0.9, 0.48 + look.fovMoodBias * 0.12)
    );
    return {
      look,
      primary: new THREE.Color(look.primary),
      secondary: new THREE.Color(look.secondary),
      accent: new THREE.Color(look.accent),
      base: new THREE.Color(look.base),
      spotL: new THREE.Color(look.spotLColor),
      spotR: new THREE.Color(look.spotRColor),
      rim: new THREE.Color(look.rimColor),
      ambient: new THREE.Color(look.ambientTint),
      isHype,
      idealEnergy,
    };
  });

  // Recency ring buffer of size 4 (§7 rule)
  const recentIndices = new Int32Array(4);
  recentIndices[0] = 0;
  recentIndices[1] = -1;
  recentIndices[2] = -1;
  recentIndices[3] = -1;
  let recentCursor = 1;

  let activeIdx = 0;
  let beatsSinceSwitch = 0;
  let nextHoldTarget = 32;
  let lastBeatCount = -1;
  let blendProgress = 1.0;

  // Internal drop detector (§2.3 & §7)
  let energyBaseline = 0;
  let dropBeats = 0;
  let prevDropActive = false;

  // Live blended palette channels (mutated in-place every frame)
  const curPrimary = parsedLooks[0].primary.clone();
  const curSecondary = parsedLooks[0].secondary.clone();
  const curAccent = parsedLooks[0].accent.clone();
  const curBase = parsedLooks[0].base.clone();
  const curSpotL = parsedLooks[0].spotL.clone();
  const curSpotR = parsedLooks[0].spotR.clone();
  const curRim = parsedLooks[0].rim.clone();

  const isRecentlyUsed = (idx: number): boolean => {
    return (
      recentIndices[0] === idx ||
      recentIndices[1] === idx ||
      recentIndices[2] === idx ||
      recentIndices[3] === idx
    );
  };

  const commitSwitch = (nextIdx: number) => {
    if (nextIdx === activeIdx) return;
    activeIdx = nextIdx;
    recentIndices[recentCursor] = nextIdx;
    recentCursor = (recentCursor + 1) & 3;
    beatsSinceSwitch = 0;
    blendProgress = 0.0;

    // Pick next hold duration on a 16-beat (4-bar) grid between minHoldBeats and maxHoldBeats
    const span = Math.max(0, maxHoldBeats - minHoldBeats);
    const rawBeats = minHoldBeats + Math.floor(rand() * (span + 1));
    nextHoldTarget = Math.max(
      minHoldBeats,
      Math.round(rawBeats / 16) * 16
    );
  };

  const selectNextLook = (energy: number, requireHype: boolean): number => {
    let bestIdx = (activeIdx + 1) % parsedLooks.length;
    let bestScore = -999;

    for (let i = 0; i < parsedLooks.length; i++) {
      if (i === activeIdx || isRecentlyUsed(i)) continue;
      const candidate = parsedLooks[i];
      if (requireHype && !candidate.isHype) continue;

      const energyDist = Math.abs(candidate.idealEnergy - energy);
      let score = 1.0 - energyDist * 1.4 + rand() * 0.35;
      if (requireHype && candidate.isHype) {
        score += 0.75;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  return {
    update(
      metrics: AudioMetrics,
      beatCount: number,
      _phase: number,
      dt: number,
      _elapsed: number
    ) {
      // 1. Reconstruct drop detector locally (§2.3 law)
      energyBaseline +=
        (metrics.overall - energyBaseline) * (1.0 - Math.exp(-0.7 * dt));
      const isDropish =
        metrics.bass > 0.8 && metrics.overall > energyBaseline + 0.055;

      if (metrics.isBeat && beatCount !== lastBeatCount) {
        lastBeatCount = beatCount;
        beatsSinceSwitch++;

        if (isDropish) {
          dropBeats++;
        } else {
          dropBeats = 0;
        }
      }

      const dropActive = dropBeats >= 2;
      const dropEntered = dropActive && !prevDropActive;
      prevDropActive = dropActive;

      // 2. Trigger rotation on scheduled 32-64 beat boundary OR early hype drop
      const currentIsHype = parsedLooks[activeIdx].isHype;
      if (dropEntered && !currentIsHype && beatsSinceSwitch >= 8) {
        const hypeIdx = selectNextLook(metrics.overall, true);
        commitSwitch(hypeIdx);
      } else if (
        beatsSinceSwitch >= nextHoldTarget &&
        beatCount % 16 === 0 &&
        metrics.isBeat
      ) {
        const nextIdx = selectNextLook(metrics.overall, dropActive);
        commitSwitch(nextIdx);
      }

      // 3. Smooth exponential damping crossfade (lambda = 2.2 -> ~2 bars to settle)
      const alpha = 1.0 - Math.exp(-2.2 * dt);
      const target = parsedLooks[activeIdx];

      curPrimary.lerp(target.primary, alpha);
      curSecondary.lerp(target.secondary, alpha);
      curAccent.lerp(target.accent, alpha);
      curBase.lerp(target.base, alpha);
      curSpotL.lerp(target.spotL, alpha);
      curSpotR.lerp(target.spotR, alpha);
      curRim.lerp(target.rim, alpha);

      blendProgress = Math.min(1.0, blendProgress + (1.0 - blendProgress) * alpha);
    },

    getActiveLookId() {
      return parsedLooks[activeIdx].look.id;
    },

    getActiveLookName() {
      return parsedLooks[activeIdx].look.name;
    },

    getBlendedPalette(out) {
      out.primary.copy(curPrimary);
      out.secondary.copy(curSecondary);
      out.accent.copy(curAccent);
      out.base.copy(curBase);
      out.spotL.copy(curSpotL);
      out.spotR.copy(curSpotR);
      out.rim.copy(curRim);
    },

    getBlendProgress() {
      return blendProgress;
    },

    forceLook(id: string) {
      for (let i = 0; i < parsedLooks.length; i++) {
        if (parsedLooks[i].look.id === id) {
          commitSwitch(i);
          return;
        }
      }
    },
  };
}
// ----------------------------------------------------------------------------
// V2 UI BRIDGE: the page's "Vibe" pills request a look change; the stage's
// useFrame consumes the request (once) and forwards it to its director
// instance. Keeps the director per-mount while the UI stays decoupled.
// ----------------------------------------------------------------------------
let _pendingForcedLook: string | null = null;

export function requestStageLook(id: string): void {
  _pendingForcedLook = id;
}

export function consumeRequestedStageLook(): string | null {
  const id = _pendingForcedLook;
  _pendingForcedLook = null;
  return id;
}
