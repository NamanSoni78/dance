// src/lib/choreographer.ts
// Non-repetitive, beat-locked, zero-allocation move sequencer & 0.25s pose crossfader.

import {
  DANCE_MOVES,
  DanceFamily,
  DanceMove,
  JointTargets,
  MoveContext,
  PELVIS_REST_Y,
} from './danceMoves';

export interface AudioMetrics {
  bass: number;
  mid: number;
  high: number;
  overall: number;
  isBeat: boolean;
  bpm: number;
  isPlaying: boolean;
}

export interface ChoreographerConfig {
  maxHoldBars: number;    // default 4 — HARD CAP, never hold a move longer
  minHoldBars: number;    // default 2
  recencyWindow: number;  // default 6 — a move can't repeat until 6 others played
  seed: number;           // deterministic per song
  /** V4: alternate move library (the Diva runs GIRL_MOVES). Defaults to the
      classic 42-move library — identical behavior when omitted. */
  moves?: readonly DanceMove[];
}

export interface Choreographer {
  update: (metrics: AudioMetrics, beatCount: number, phase: number, dt: number, elapsed: number) => void;
  applyPose: (t: JointTargets) => void;
  setFamily: (family: DanceFamily | 'AUTO') => void;
  forceMove: (id: string) => void;
  getActiveMoveId: () => string;
  getActiveMove: () => DanceMove;
  getRecentMoveIds: (out: string[]) => void;
  consumePendingSpin: () => number;
}

/** Fixed tuple of JointTargets keys written by moves (excludes rootRotY & pelvisScale pre-bake). */
const POSE_KEYS: readonly (keyof JointTargets)[] = [
  'rootY', 'pelvisY', 'pelvisX', 'pelvisZ', 'pelvisRotX', 'pelvisRotY', 'pelvisRotZ',
  'lowerSpineX', 'lowerSpineY', 'lowerSpineZ',
  'chestX', 'chestY', 'chestZ', 'chestScale',
  'neckX', 'neckY', 'neckZ', 'headX', 'headY', 'headZ',
  'shoulderLX', 'shoulderLY', 'shoulderLZ', 'elbowLX', 'elbowLY', 'wristLX', 'wristLZ',
  'shoulderRX', 'shoulderRY', 'shoulderRZ', 'elbowRX', 'elbowRY', 'wristRX', 'wristRZ',
  'footLiftL', 'footLiftR', 'legStepPitchL', 'legStepPitchR',
  'legStepRollL', 'legStepRollR', 'hipYawL', 'hipYawR',
  'extraKneeL', 'extraKneeR', 'ankleToePitchL', 'ankleToePitchR',
];

const NON_IDLE_FAMILIES: readonly DanceFamily[] = [
  'HIP_HOP', 'SHUFFLE', 'DISCO_FUNK', 'BREAKDANCE',
  'INDIAN_CLASSICAL', 'INDIAN_FOLK', 'BOLLYWOOD', 'GLOBAL_PARTY',
];

function createEmptyTargets(): JointTargets {
  return {
    rootY: 0, rootRotY: 0,
    pelvisY: PELVIS_REST_Y, pelvisX: 0, pelvisZ: 0,
    pelvisRotX: 0, pelvisRotY: 0, pelvisRotZ: 0,
    pelvisScaleX: 1, pelvisScaleY: 1, pelvisScaleZ: 1,
    lowerSpineX: 0, lowerSpineY: 0, lowerSpineZ: 0,
    chestX: 0, chestY: 0, chestZ: 0, chestScale: 1,
    neckX: 0, neckY: 0, neckZ: 0, headX: 0, headY: 0, headZ: 0,
    shoulderLX: 0.1, shoulderLY: 0, shoulderLZ: 0.25, elbowLX: -0.35, elbowLY: 0, wristLX: 0, wristLZ: 0,
    shoulderRX: 0.1, shoulderRY: 0, shoulderRZ: -0.25, elbowRX: -0.35, elbowRY: 0, wristRX: 0, wristRZ: 0,
    footLiftL: 0, footLiftR: 0, legStepPitchL: 0, legStepPitchR: 0,
    legStepRollL: 0, legStepRollR: 0, hipYawL: 0, hipYawR: 0,
    extraKneeL: 0, extraKneeR: 0, ankleToePitchL: 0, ankleToePitchR: 0,
  };
}

/** Deterministic mulberry32 PRNG — zero allocation, reproducible per seed. */
function nextRand(stateObj: { s: number }): number {
  let t = (stateObj.s += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const CROSSFADE_SEC = 0.25; // 250 ms smooth pose blend between outgoing and incoming moves
const TWO_PI = Math.PI * 2;

export function createChoreographer(config?: Partial<ChoreographerConfig>): Choreographer {
  const maxHoldBars = Math.min(4, Math.max(2, config?.maxHoldBars ?? 4)); // Hard-capped at 4 bars
  const minHoldBars = Math.min(maxHoldBars, Math.max(1, config?.minHoldBars ?? 2));
  const recencyWindow = Math.max(1, Math.min(12, config?.recencyWindow ?? 6));
  const baseSeed = config?.seed ?? 1337;
  const rng = { s: baseSeed >>> 0 };

  // V4: library-agnostic sequencer — same laws (recency, 4-bar cap, energy
  // matching) over any compliant move library.
  const MOVES = config?.moves ?? DANCE_MOVES;

  // Pre-allocated scratch buffers (ZERO per-frame heap allocation)
  const scratchOut = createEmptyTargets();
  const recentRing: string[] = new Array<string>(recencyWindow).fill('');
  let recentHead = 0;
  let recentCount = 0;

  const idleMove = MOVES.find((m) => m.family === 'IDLE') ?? MOVES[0];
  let activeMove: DanceMove = idleMove;
  let prevMove: DanceMove = idleMove;

  let modeFamily: DanceFamily | 'AUTO' = 'AUTO';
  let autoTargetFamily: DanceFamily = 'HIP_HOP';
  let nextFamilySwitchBeat = 32;
  let sameFamilyStreak = 0;

  let moveStartPhase = 0;
  let prevMoveStartPhase = 0;
  let plannedHoldBars = 4;
  let prevPlannedHoldBars = 4;
  let lastIntegerBar = 0;
  let crossfadeTimer = 0; // counts down from CROSSFADE_SEC to 0

  // V1.5 drop detection: an accent-worthy "drop" is an energy JUMP above the
  // song's own slow baseline — NOT absolute bass. Loud modern mixes pin the
  // bass band at 0.9-1.0 on nearly every kick, which made the old
  // `bass > 0.85` trigger fire on every 2nd beat — constantly interrupting
  // non-accent moves after 2 beats and flooding the show with accent moves.
  // The baseline (inline exponential damp, ~1.4 s time constant) keeps this
  // lib dependency-free; only REAL drops (extra energy vs. recent level)
  // trigger the accent switch now.
  let energyBaseline = 0;
  let dropBeats = 0;
  let lastTrackedBpm = 0;
  let pendingSpinRad = 0;
  let beatPulseVal = 0;

  // Pre-allocated MoveContext mutated in place each frame
  const ctx: MoveContext = {
    p: 0, halfP: 0, quarterP: 0,
    beatPulse: 0, beatCount: 0, isBeat: false,
    moveBeat: 0, moveBar: 0, moveProgress: 0,
    bass: 0, mid: 0, high: 0, overall: 0,
    bpm: 120, elapsed: 0, dt: 0.016,
    requestSpin: (radians: number) => {
      pendingSpinRad += radians;
    },
  };

  function pushRecent(id: string): void {
    recentRing[recentHead] = id;
    recentHead = (recentHead + 1) % recencyWindow;
    if (recentCount < recencyWindow) recentCount++;
  }

  function isRecentlyPlayed(id: string): boolean {
    for (let i = 0; i < recentCount; i++) {
      if (recentRing[i] === id) return true;
    }
    return false;
  }

  function pickAutoFamily(m: AudioMetrics): DanceFamily {
    // Weighted band-energy family selection every 32-64 beats
    const r = nextRand(rng);
    if (m.bass > 0.72 && m.bass >= m.mid) {
      return r < 0.5 ? 'BREAKDANCE' : 'INDIAN_FOLK';
    }
    if (m.high > 0.65 && m.high >= m.mid) {
      return r < 0.5 ? 'SHUFFLE' : 'INDIAN_CLASSICAL';
    }
    if (m.mid > 0.62) {
      return r < 0.5 ? 'BOLLYWOOD' : 'DISCO_FUNK';
    }
    const idx = Math.floor(r * NON_IDLE_FAMILIES.length) % NON_IDLE_FAMILIES.length;
    return NON_IDLE_FAMILIES[idx];
  }

  function selectNextMove(m: AudioMetrics, wantAccent: boolean): DanceMove {
    const targetEnergy = Math.min(1.0, m.overall + m.bass * 0.4);
    const bpm = m.bpm > 0 ? m.bpm : 120;

    // Determine desired family (forced = 80% target family / 20% spice; AUTO = rotated family)
    const desiredFamily: DanceFamily =
      modeFamily === 'AUTO'
        ? autoTargetFamily
        : nextRand(rng) < 0.80
        ? modeFamily
        : NON_IDLE_FAMILIES[Math.floor(nextRand(rng) * NON_IDLE_FAMILIES.length)];

    let bestMove: DanceMove = activeMove;
    let bestScore = -9999;

    for (let i = 0; i < MOVES.length; i++) {
      const cand = MOVES[i];
      if (cand.family === 'IDLE') continue;
      if (cand.id === activeMove.id) continue;

      let score = nextRand(rng) * 0.35; // deterministic tie-break jitter

      // 1. Recency constraint
      if (!isRecentlyPlayed(cand.id)) score += 4.0;
      else score -= 4.0;

      // 2. Family streak constraint (max 2 back-to-back in AUTO mode)
      if (modeFamily === 'AUTO' && cand.family === activeMove.family && sameFamilyStreak >= 2) {
        score -= 3.5;
      } else if (cand.family === desiredFamily) {
        score += 2.2;
      }

      // 3. Tempo fit constraint
      if (bpm >= cand.tempoFit[0] && bpm <= cand.tempoFit[1]) {
        score += 2.0;
      } else {
        score -= 1.5;
      }

      // 4. Energy match (within ±0.25 of targetEnergy)
      const eDiff = Math.abs(cand.energy - targetEnergy);
      if (eDiff <= 0.25) score += (0.25 - eDiff) * 8.0;
      else score -= eDiff * 3.0;

      // 5. Accent move gating (drops / sustained bass > 0.85)
      if (wantAccent) {
        if (cand.accentMove) score += 5.0;
      } else if (cand.accentMove) {
        score -= 3.0;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = cand;
      }
    }
    return bestMove;
  }

  function transitionTo(next: DanceMove, currentPhase: number): void {
    if (next.id === activeMove.id) return;
    prevMove = activeMove;
    prevMoveStartPhase = moveStartPhase;
    prevPlannedHoldBars = plannedHoldBars;

    if (next.family === activeMove.family) sameFamilyStreak++;
    else sameFamilyStreak = 1;

    activeMove = next;
    moveStartPhase = currentPhase;
    crossfadeTimer = CROSSFADE_SEC;

    // Hold duration random 2..4 bars weighted by move.defaultBars, HARD-CAPPED at maxHoldBars (4)
    const rawBars = Math.round(next.defaultBars + (nextRand(rng) - 0.5) * 1.5);
    plannedHoldBars = Math.max(minHoldBars, Math.min(maxHoldBars, rawBars));
    lastIntegerBar = 0;
    pushRecent(next.id);
  }

  return {
    update(metrics: AudioMetrics, beatCount: number, phase: number, dt: number, elapsed: number): void {
      // Re-seed deterministically when a new song BPM locks in
      const roundedBpm = Math.round(metrics.bpm);
      if (roundedBpm > 0 && Math.abs(roundedBpm - lastTrackedBpm) >= 2) {
        lastTrackedBpm = roundedBpm;
        rng.s = (baseSeed ^ (roundedBpm * 2654435761)) >>> 0;
      }

      // Exponential beatPulse decay (~90 ms time constant)
      if (metrics.isBeat) beatPulseVal = 1.0;
      else beatPulseVal *= Math.exp(-dt * 25.0);

      if (crossfadeTimer > 0) {
        crossfadeTimer = Math.max(0, crossfadeTimer - dt);
      }

      // Populate zero-allocation MoveContext
      ctx.p = phase;
      ctx.halfP = phase * 0.5;
      ctx.quarterP = phase * 0.25;
      ctx.beatPulse = beatPulseVal;
      ctx.beatCount = beatCount;
      ctx.isBeat = metrics.isBeat;
      ctx.bass = metrics.bass;
      ctx.mid = metrics.mid;
      ctx.high = metrics.high;
      ctx.overall = metrics.overall;
      ctx.bpm = metrics.bpm;
      ctx.elapsed = elapsed;
      ctx.dt = dt;

      // 8. IDLE fallback when paused or near-silent
      if (!metrics.isPlaying || metrics.overall < 0.12 || modeFamily === 'IDLE') {
        if (activeMove.family !== 'IDLE') {
          transitionTo(idleMove, phase);
        }
        const beats = Math.max(0, (phase - moveStartPhase) / TWO_PI);
        ctx.moveBeat = beats;
        ctx.moveBar = beats * 0.25;
        ctx.moveProgress = Math.min(1, ctx.moveBar / plannedHoldBars);
        return;
      }

      // Wake up immediately from IDLE when audio starts playing
      if (activeMove.family === 'IDLE') {
        transitionTo(selectNextMove(metrics, false), phase);
      }

      // Rotate AUTO family preference every 32-64 beats
      if (beatCount >= nextFamilySwitchBeat) {
        autoTargetFamily = pickAutoFamily(metrics);
        nextFamilySwitchBeat = beatCount + 32 + Math.floor(nextRand(rng) * 33);
      }

      // V1.5 energy-jump drop tracking (see declaration comment above)
      energyBaseline +=
        (metrics.overall - energyBaseline) * (1 - Math.exp(-0.7 * dt));
      const isDropish =
        metrics.bass > 0.8 && metrics.overall > energyBaseline + 0.055;
      if (metrics.isBeat) {
        if (isDropish) dropBeats++;
        else dropBeats = 0;
      }

      const moveBeat = Math.max(0, (phase - moveStartPhase) / TWO_PI);
      const moveBar = moveBeat * 0.25;
      ctx.moveBeat = moveBeat;
      ctx.moveBar = moveBar;
      ctx.moveProgress = Math.min(1.0, moveBar / plannedHoldBars);

      // Early accent switch on a real energy-jump drop (exact beat boundary)
      if (metrics.isBeat && dropBeats >= 2 && !activeMove.accentMove) {
        dropBeats = 0;
        transitionTo(selectNextMove(metrics, true), phase);
        ctx.moveBeat = 0;
        ctx.moveBar = 0;
        ctx.moveProgress = 0;
        return;
      }

      // Standard bar-boundary switch (when moveBar crosses plannedHoldBars integer)
      const currentIntBar = Math.floor(moveBar);
      if (currentIntBar > lastIntegerBar) {
        lastIntegerBar = currentIntBar;
        if (currentIntBar >= plannedHoldBars) {
          transitionTo(selectNextMove(metrics, false), phase);
          ctx.moveBeat = 0;
          ctx.moveBar = 0;
          ctx.moveProgress = 0;
        }
      }
    },

    applyPose(t: JointTargets): void {
      // Evaluate active move into `t`
      activeMove.pose(t, ctx);

      // If crossfading, evaluate outgoing move into pre-allocated `scratchOut` and lerp
      if (crossfadeTimer > 0 && prevMove.id !== activeMove.id) {
        const alpha = 1.0 - crossfadeTimer / CROSSFADE_SEC; // 0 -> 1 over 0.25s
        const savedBeat = ctx.moveBeat;
        const savedBar = ctx.moveBar;
        const savedProg = ctx.moveProgress;
        const prevBeats = Math.max(0, (ctx.p - prevMoveStartPhase) / TWO_PI);
        ctx.moveBeat = prevBeats;
        ctx.moveBar = prevBeats * 0.25;
        // INTEGRATION FIX (neutral-dip bug): the outgoing move must HOLD its
        // full-energy pose (env() == 1) throughout the crossfade. Clamping at
        // 0.849 keeps moveProgress inside env()'s flat region — the original
        // `Math.min(1.0, ...)` let env() fall to 0 at progress 1.0, collapsing
        // the outgoing pose to neutral and causing a visible "power dip" on
        // every single move transition.
        ctx.moveProgress = Math.min(0.849, ctx.moveBar / prevPlannedHoldBars);

        // Suppress spin triggers from outgoing move during crossfade
        const savedSpin = pendingSpinRad;
        prevMove.pose(scratchOut, ctx);
        pendingSpinRad = savedSpin;

        ctx.moveBeat = savedBeat;
        ctx.moveBar = savedBar;
        ctx.moveProgress = savedProg;

        for (let i = 0; i < POSE_KEYS.length; i++) {
          const k = POSE_KEYS[i];
          t[k] = scratchOut[k] + (t[k] - scratchOut[k]) * alpha;
        }
      }
    },

    setFamily(family: DanceFamily | 'AUTO'): void {
      if (modeFamily === family) return;
      modeFamily = family;
      if (family === 'IDLE') {
        transitionTo(idleMove, ctx.p);
      } else if (family !== 'AUTO' && activeMove.family !== family) {
        autoTargetFamily = family;
        // Queue switch on next bar boundary by capping plannedHoldBars to next bar
        plannedHoldBars = Math.max(1, Math.floor(ctx.moveBar) + 1);
      }
    },

    forceMove(id: string): void {
      for (let i = 0; i < MOVES.length; i++) {
        if (MOVES[i].id === id) {
          transitionTo(MOVES[i], ctx.p);
          return;
        }
      }
    },

    getActiveMoveId(): string {
      return activeMove.id;
    },

    getActiveMove(): DanceMove {
      return activeMove;
    },

    getRecentMoveIds(out: string[]): void {
      out.length = 0;
      for (let i = 0; i < recentCount; i++) {
        const idx = (recentHead - 1 - i + recencyWindow) % recencyWindow;
        out[i] = recentRing[idx];
      }
    },

    consumePendingSpin(): number {
      const s = pendingSpinRad;
      pendingSpinRad = 0;
      return s;
    },
  };
}

