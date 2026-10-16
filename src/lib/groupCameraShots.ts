// src/lib/groupCameraShots.ts
// ============================================================================
// GRAND GROUP CHOREOGRAPHER V2.5 — DELIVERABLE D: GROUP CAMERA DIRECTOR SHOTS
// 16 zero-allocation multi-dancer camera shots designed for 2-to-4-dancer
// formations, contact duets, call-and-response cyphers, and finale tableaux.
// Preserves V1.5 wide-smooth DNA: generous FOV headroom, low shake, and
// beat-locked dolly/crane arcs driven by ctx.shotBeat.
// ============================================================================

import type * as THREE from 'three';

export interface CameraContext {
  elapsed: number;
  dt: number;
  shotBeat: number; // beats since cut
  bass: number;
  mid: number;
  high: number;
  overall: number;
  isBeat: boolean;
  beatPulse: number;
  bpm: number;
}

export interface CameraShot {
  id: string;
  name: string;
  energyFit: [number, number];
  minBars: number;             // 2..8
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext) => void;
  fovBias: number;             // added to base FOV 50; wide stays king
  rollBias?: number;           // 0..0.09
  beatPunch?: number;          // 0..0.18
  shake?: number;              // 0..0.015
  wide?: boolean;              // +0.8 selection bonus — SET TRUE on most
}

// ============================================================================
// MATHEMATICAL CONSTANTS & ZERO-ALLOCATION CINEMATIC HELPERS
// ============================================================================

const PI = Math.PI;
const HALF_PI = Math.PI * 0.5;
const QUARTER_PI = Math.PI * 0.25;
const EIGHTH_PI = Math.PI * 0.125;

/** Clamp scalar v into [lo, hi] with zero allocation. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Hermite smoothstep on [0, 1] for silk-smooth camera transitions. */
function smooth01(u: number): number {
  const c = u < 0 ? 0 : u > 1 ? 1 : u;
  return c * c * (3 - 2 * c);
}

// ============================================================================
// 1. TWO-SHOT DUET FRAMING — Locked-Off Pair Portrait on the Contact Axis
// ============================================================================

const SHOT_TWO_SHOT_DUET_FRAMING: CameraShot = {
  id: 'GROUP_DUET_TWO_SHOT_LOCK',
  name: 'Two-Shot Duet Portrait — Contact Axis Lock',
  energyFit: [0.30, 0.90],
  minBars: 4,
  fovBias: 4,
  rollBias: 0.015,
  beatPunch: 0.06,
  shake: 0.004,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Subtle 2-bar (8-beat) breathing arc centered on the contact strike plane (y = 0.96m)
    const barPhase = ctx.shotBeat * QUARTER_PI;
    const microDriftX = 0.18 * Math.sin(barPhase * 0.5) + 0.04 * Math.sin(ctx.elapsed * 0.45);
    const zBreath = 3.55 - 0.16 * Math.sin(barPhase) - 0.05 * ctx.beatPulse;
    const yPedestal = 1.08 + 0.05 * Math.cos(barPhase);

    pos.set(microDriftX, yPedestal, zBreath);
    look.set(microDriftX * 0.25, 0.96 + 0.02 * ctx.bass, 0.10);
  },
};

// ============================================================================
// 2. MIRROR-SYMMETRY CENTER LINE — Dead-Center Wes-Anderson Symmetry Axis
// ============================================================================

const SHOT_MIRROR_SYMMETRY_CENTER: CameraShot = {
  id: 'GROUP_MIRROR_SYMMETRY_AXIS',
  name: 'Mirror-Symmetry Center Line — Dead-Zero Optical Axis',
  energyFit: [0.35, 0.95],
  minBars: 4,
  fovBias: 6,
  rollBias: 0.0, // Zero roll preserves razor-sharp vertical and horizontal symmetry
  beatPunch: 0.08,
  shake: 0.003,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Locked strictly on X = 0.0 so MIRROR-mode pairs/quads reflect across the exact frame bisector
    const phrasePhase = ctx.shotBeat * EIGHTH_PI;
    const zDolly = 3.85 - 0.28 * Math.sin(phrasePhase) - 0.06 * ctx.beatPulse;
    const yHeight = 1.12 + 0.06 * Math.cos(phrasePhase) + 0.015 * Math.sin(ctx.elapsed * 0.6);

    pos.set(0.0, yHeight, zDolly);
    look.set(0.0, 0.95 + 0.02 * ctx.beatPulse, 0.08);
  },
};

// ============================================================================
// 3. CANON RIPPLE TRUCK — Lateral Dolly Tracking the Sequential Ripple
// ============================================================================

const SHOT_CANON_RIPPLE_TRUCK: CameraShot = {
  id: 'GROUP_CANON_RIPPLE_TRUCK',
  name: 'Canon Ripple Truck — Lateral Line Tracking Dolly',
  energyFit: [0.40, 0.92],
  minBars: 4,
  fovBias: 7,
  rollBias: 0.03,
  beatPunch: 0.07,
  shake: 0.005,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // 2-bar (8-beat) lateral dolly sweep across the full 4-dancer stage width
    const ripplePhase = ctx.shotBeat * QUARTER_PI;
    const truckX = 1.65 * Math.sin(ripplePhase);
    const leadLookX = 0.55 * Math.sin(ripplePhase + 0.35);
    const zArc = 4.05 - 0.20 * Math.cos(ripplePhase * 2);

    pos.set(truckX, 1.15 + 0.05 * Math.sin(ctx.elapsed * 0.5), zArc);
    look.set(leadLookX, 0.94, 0.12);
  },
};

// ============================================================================
// 4. CAROUSEL ORBIT — Sweeping Front-Hemisphere Crane Matching Orbiting Rings
// ============================================================================

const SHOT_CAROUSEL_ORBIT: CameraShot = {
  id: 'GROUP_CAROUSEL_ORBIT_SYNC',
  name: 'Carousel Orbit — Synchronized 110-Deg Front-Arc Crane',
  energyFit: [0.45, 0.96],
  minBars: 4,
  fovBias: 8,
  rollBias: 0.045,
  beatPunch: 0.08,
  shake: 0.006,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Orbits across [-0.95, +0.95] rad in front of the stage, matched to the 12-beat carousel period
    const orbitAngle = 0.92 * Math.sin(ctx.shotBeat * (PI / 8));
    const radius = 4.15 - 0.18 * Math.cos(ctx.shotBeat * HALF_PI);
    const camX = Math.sin(orbitAngle) * radius;
    const camZ = Math.cos(orbitAngle) * radius;
    const camY = 1.38 + 0.22 * Math.cos(orbitAngle) + 0.04 * Math.sin(ctx.elapsed * 0.5);

    pos.set(camX, camY, camZ);
    look.set(-0.18 * Math.sin(orbitAngle), 0.92, 0.05);
  },
};

// ============================================================================
// 5. WAVE LINE PAN — Sinusoidal Pedestal & Pan Riding the Stadium Wave
// ============================================================================

const SHOT_WAVE_LINE_PAN: CameraShot = {
  id: 'GROUP_WAVE_LINE_PAN',
  name: 'Stadium Wave Pan — Sinusoidal Crest Tracker',
  energyFit: [0.35, 0.90],
  minBars: 4,
  fovBias: 8,
  rollBias: 0.035,
  beatPunch: 0.06,
  shake: 0.005,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Follows the traveling stadium wave crest with a synchronized pedestal wave
    const wavePhase = ctx.shotBeat * QUARTER_PI;
    const panX = 1.25 * Math.sin(wavePhase);
    const crestY = 1.18 + 0.24 * Math.sin(wavePhase * 2);
    const zDist = 4.10 + 0.18 * Math.cos(wavePhase);

    pos.set(panX * 0.75, crestY, zDist);
    look.set(panX * 0.45, 0.92 + 0.10 * Math.sin(wavePhase * 2), 0.15);
  },
};

// ============================================================================
// 6. OVERHEAD MANDALA — High-Angle Kaleidoscope Top-Down Formation Shot
// ============================================================================

const SHOT_OVERHEAD_MANDALA: CameraShot = {
  id: 'GROUP_OVERHEAD_MANDALA',
  name: 'Overhead Mandala — High-Crane Kaleidoscope Top-Down',
  energyFit: [0.50, 1.0],
  minBars: 4,
  fovBias: 10,
  rollBias: 0.05,
  beatPunch: 0.09,
  shake: 0.004,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // High-angle crane (y = 4.55m, z = 1.85m) so Garba rings, diamonds & stars read as a mandala
    // while keeping visors and sneakers visible in 3/4 overhead perspective
    const orbit = ctx.shotBeat * EIGHTH_PI;
    const camX = 0.55 * Math.sin(orbit);
    const camY = 4.55 - 0.20 * Math.cos(ctx.shotBeat * HALF_PI) - 0.08 * ctx.beatPulse;
    const camZ = 1.85 + 0.25 * Math.cos(orbit);

    pos.set(camX, camY, camZ);
    look.set(0.0, 0.62, 0.05);
  },
};

// ============================================================================
// 7. LEADER SPOTLIGHT PUSH — Dolly Push to Center Soloist with Crew Backdrop
// ============================================================================

const SHOT_LEADER_SPOTLIGHT_PUSH: CameraShot = {
  id: 'GROUP_LEADER_SPOTLIGHT_PUSH',
  name: 'Leader Spotlight Push — Soloist Dolly & Hype-Crew Frame',
  energyFit: [0.45, 1.0],
  minBars: 4,
  fovBias: 5,
  rollBias: 0.02,
  beatPunch: 0.10,
  shake: 0.005,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Smooth 4-bar (16-beat) dolly push toward the downstage center soloist at (0, y, 1.05)
    // Angle stays slightly low and wide so the backup V-crew remains framed behind the soloist's shoulders
    const pushProgress = smooth01((ctx.shotBeat % 16) / 16);
    const zPush = 3.95 - 0.72 * Math.sin(pushProgress * PI) - 0.06 * ctx.beatPulse;
    const xSway = 0.28 * Math.sin(ctx.shotBeat * QUARTER_PI);
    const yLow = 0.98 - 0.10 * Math.sin(pushProgress * PI);

    pos.set(xSway, yLow, zPush);
    look.set(0.06 * xSway, 0.96 + 0.03 * ctx.beatPulse, 0.65);
  },
};

// ============================================================================
// 8. CROWD-POV WIDE — Festival Anthem Frame from Behind Crowd Silhouettes
// ============================================================================

const SHOT_CROWD_POV_WIDE: CameraShot = {
  id: 'GROUP_CROWD_POV_WIDE',
  name: 'Crowd-POV Wide — Festival Pit Silhouettes & Phones Up',
  energyFit: [0.35, 1.0],
  minBars: 4,
  fovBias: 11,
  rollBias: 0.025,
  beatPunch: 0.07,
  shake: 0.009,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Positioned at Z = 5.45m behind the front crowd row so raised phones & heads frame the bottom edge
    const sway = ctx.shotBeat * EIGHTH_PI;
    const pitBounce = 0.035 * Math.abs(Math.sin(ctx.shotBeat * PI)) * (0.5 + 0.5 * ctx.bass);
    const camX = 0.65 * Math.sin(sway) + 0.05 * Math.sin(ctx.elapsed * 0.7);
    const camY = 1.46 + pitBounce + 0.04 * Math.cos(sway);
    const camZ = 5.45 - 0.20 * Math.sin(sway * 2);

    pos.set(camX, camY, camZ);
    look.set(camX * 0.15, 1.08 + 0.02 * ctx.beatPulse, 0.0);
  },
};

// ============================================================================
// 9. LOW HERO TRIO / CREW — Stage-Lip Worm's-Eye Silhouette Against Lasers
// ============================================================================

const SHOT_LOW_HERO_TRIO: CameraShot = {
  id: 'GROUP_LOW_HERO_TRIO',
  name: 'Low Hero Trio — Stage-Lip Silhouette Against Lasers',
  energyFit: [0.55, 1.0],
  minBars: 4,
  fovBias: 9,
  rollBias: 0.04,
  beatPunch: 0.12,
  shake: 0.006,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Low stage-lip angle (y = 0.44m) looking up through the dancers' torsos into the overhead laser rig
    const sweep = ctx.shotBeat * QUARTER_PI;
    const camX = 0.72 * Math.sin(sweep * 0.5);
    const camY = 0.44 + 0.04 * Math.cos(sweep);
    const camZ = 3.05 - 0.14 * Math.sin(sweep) - 0.06 * ctx.beatPulse;

    pos.set(camX, camY, camZ);
    look.set(camX * 0.20, 1.18 + 0.04 * ctx.bass, 0.05);
  },
};

// ============================================================================
// 10. DO-SI-DO CORRIDOR — Elevated 3/4 Diagonal Pass-Through Corridor
// ============================================================================

const SHOT_DO_SI_DO_CORRIDOR: CameraShot = {
  id: 'GROUP_DO_SI_DO_CORRIDOR',
  name: 'Do-Si-Do Corridor — Elevated 3/4 Swap-Lane Angle',
  energyFit: [0.45, 0.95],
  minBars: 4,
  fovBias: 8,
  rollBias: 0.03,
  beatPunch: 0.07,
  shake: 0.005,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Alternates smoothly between left-corridor and right-corridor 3/4 vantage every 4 bars
    const sideWave = Math.cos(ctx.shotBeat * (PI / 16));
    const camX = 1.65 * sideWave;
    const camY = 1.72 + 0.10 * Math.sin(ctx.shotBeat * QUARTER_PI);
    const camZ = 3.70 - 0.18 * Math.sin(ctx.shotBeat * HALF_PI);

    pos.set(camX, camY, camZ);
    look.set(0.15 * sideWave, 0.90, 0.05);
  },
};

// ============================================================================
// 11. HUDDLE-BURST SNAP — Tight Huddle Push & Beat-8 Wide Snap-Zoom
// ============================================================================

const SHOT_HUDDLE_BURST_SNAP: CameraShot = {
  id: 'GROUP_HUDDLE_BURST_SNAP',
  name: 'Huddle-Burst Snap — Center Pack Creep & Explosion Pullback',
  energyFit: [0.60, 1.0],
  minBars: 4,
  fovBias: 8,
  rollBias: 0.04,
  beatPunch: 0.14,
  shake: 0.008,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Locked to the 16-beat HUDDLE_BURST cycle:
    // Beats 0..7: creeps in tight on the center huddle (z = 2.75m)
    // Beats 7..9: snaps back rapidly to stadium wide (z = 4.45m) as the crew bursts apart!
    const cycleBeat = ctx.shotBeat % 16;
    let burstPull = 0;
    if (cycleBeat >= 7.0 && cycleBeat < 8.5) {
      burstPull = smooth01((cycleBeat - 7.0) / 1.5);
    } else if (cycleBeat >= 8.5 && cycleBeat < 14.5) {
      burstPull = 1.0;
    } else if (cycleBeat >= 14.5) {
      burstPull = 1.0 - smooth01((cycleBeat - 14.5) / 1.5);
    }

    const camX = 0.25 * Math.sin(ctx.shotBeat * QUARTER_PI) * (1 - 0.4 * burstPull);
    const camY = 1.02 + 0.32 * burstPull;
    const camZ = 2.78 + 1.65 * burstPull - 0.08 * ctx.beatPulse;

    pos.set(camX, camY, camZ);
    look.set(0.0, 0.94 + 0.04 * burstPull, 0.08);
  },
};

// ============================================================================
// 12. FAREWELL BOW WIDE — Grand Ascending Crane Curtain-Call Tableau
// ============================================================================

const SHOT_FAREWELL_BOW_WIDE: CameraShot = {
  id: 'GROUP_FAREWELL_BOW_WIDE',
  name: 'Farewell Bow Wide — Ascending Curtain-Call Crane',
  energyFit: [0.0, 0.65],
  minBars: 4,
  fovBias: 10,
  rollBias: 0.01,
  beatPunch: 0.03,
  shake: 0.002,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Majestic slow crane rise & pullback over 32 beats (8 bars)
    const rise = smooth01(clamp(ctx.shotBeat / 32, 0, 1));
    const camX = 0.35 * Math.sin(ctx.shotBeat * EIGHTH_PI);
    const camY = 1.22 + 1.15 * rise + 0.03 * Math.sin(ctx.elapsed * 0.4);
    const camZ = 3.90 + 1.35 * rise;

    pos.set(camX, camY, camZ);
    look.set(0.0, 0.96 - 0.08 * rise, 0.0);
  },
};

// ============================================================================
// 13. DANDIYA STRIKE DIAGONAL — 25-Deg Off-Axis Partner Strike Clear-Line
// ============================================================================

const SHOT_DANDIYA_STRIKE_DIAGONAL: CameraShot = {
  id: 'GROUP_DANDIYA_STRIKE_DIAGONAL',
  name: 'Dandiya Strike Diagonal — 25-Deg Partner Clash Clear-Line',
  energyFit: [0.50, 0.98],
  minBars: 4,
  fovBias: 6,
  rollBias: 0.035,
  beatPunch: 0.10,
  shake: 0.005,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // 25-degree off-center angle ensures EACH_OTHER partners never eclipse each other
    // while keeping the central stick/palm strike point dead-center in the lens
    const sideSwitch = Math.sin(ctx.shotBeat * (PI / 16)) >= 0 ? 1 : -1;
    const barWave = Math.sin(ctx.shotBeat * QUARTER_PI);
    const camX = sideSwitch * (1.18 + 0.18 * barWave);
    const camY = 1.10 + 0.06 * Math.cos(ctx.shotBeat * HALF_PI);
    const camZ = 3.38 - 0.12 * barWave - 0.06 * ctx.beatPulse;

    pos.set(camX, camY, camZ);
    look.set(0.0, 0.98 + 0.03 * ctx.beatPulse, 0.10);
  },
};

// ============================================================================
// 14. DIAGONAL CASCADE RUNWAY — Echelon Perspective Stack Tracking Shot
// ============================================================================

const SHOT_DIAGONAL_CASCADE_RUNWAY: CameraShot = {
  id: 'GROUP_DIAGONAL_RUNWAY_SLASH',
  name: 'Diagonal Cascade Runway — Echelon Depth Stack',
  energyFit: [0.35, 0.92],
  minBars: 4,
  fovBias: 7,
  rollBias: 0.04,
  beatPunch: 0.07,
  shake: 0.005,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Tracks along the diagonal echelon axis so all 4 dancers stack in clean depth layers
    const glide = Math.sin(ctx.shotBeat * EIGHTH_PI);
    const camX = -1.75 + 0.45 * glide;
    const camY = 0.88 + 0.12 * Math.cos(ctx.shotBeat * QUARTER_PI);
    const camZ = 3.55 + 0.22 * glide;

    pos.set(camX, camY, camZ);
    look.set(0.18 * glide, 0.94, -0.05);
  },
};

// ============================================================================
// 15. BATTLE CYPHER HOT-SEAT — Asymmetric Over-Shoulder Battle Framing
// ============================================================================

const SHOT_BATTLE_CYPHER_HOT_SEAT: CameraShot = {
  id: 'GROUP_CYPHER_HOT_SEAT',
  name: 'Battle Cypher Hot-Seat — Battler & Hype-Arc Frame',
  energyFit: [0.50, 0.98],
  minBars: 4,
  fovBias: 7,
  rollBias: 0.05,
  beatPunch: 0.11,
  shake: 0.007,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Frames the downstage-left hot-seat battler (-0.55, 0.75) in the left third
    // and the responding hype-crew arc (+0.75, -0.15) across the right two-thirds
    const cypherRock = Math.sin(ctx.shotBeat * QUARTER_PI);
    const camX = -0.95 + 0.25 * cypherRock;
    const camY = 1.04 + 0.06 * Math.cos(ctx.shotBeat * HALF_PI);
    const camZ = 3.35 - 0.15 * cypherRock - 0.06 * ctx.beatPulse;

    pos.set(camX, camY, camZ);
    look.set(0.12, 0.92 + 0.02 * ctx.bass, 0.22);
  },
};

// ============================================================================
// 16. SENTAI PYRAMID HERO LOCK — Extra-Headroom Two-Tier Lift & Pogo Frame
// ============================================================================

const SHOT_SENTAI_PYRAMID_HERO: CameraShot = {
  id: 'GROUP_SENTAI_PYRAMID_HERO',
  name: 'Sentai Pyramid Hero — Two-Tier Lift & High-Jump Frame',
  energyFit: [0.65, 1.0],
  minBars: 4,
  fovBias: 9,
  rollBias: 0.02,
  beatPunch: 0.11,
  shake: 0.006,
  wide: true,
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext): void => {
    // Lower pedestal (y = 0.76m) aimed higher (look.y = 1.06m) with +9 FOV bias
    // so airborne lifts (rootY = +0.21m) and raised arms never clip the top border
    const barArc = Math.sin(ctx.shotBeat * QUARTER_PI);
    const camX = 0.22 * barArc;
    const camY = 0.76 + 0.05 * Math.cos(ctx.shotBeat * HALF_PI);
    const camZ = 3.48 - 0.14 * Math.abs(barArc) - 0.06 * ctx.beatPulse;

    pos.set(camX, camY, camZ);
    look.set(0.0, 1.06 + 0.04 * ctx.beatPulse, 0.12);
  },
};

// ============================================================================
// EXPORTED GROUP CAMERA SHOT LIBRARY & SMART DIRECTOR SELECTOR
// ============================================================================

export const GROUP_CAMERA_SHOTS: readonly CameraShot[] = [
  SHOT_TWO_SHOT_DUET_FRAMING,
  SHOT_MIRROR_SYMMETRY_CENTER,
  SHOT_CANON_RIPPLE_TRUCK,
  SHOT_CAROUSEL_ORBIT,
  SHOT_WAVE_LINE_PAN,
  SHOT_OVERHEAD_MANDALA,
  SHOT_LEADER_SPOTLIGHT_PUSH,
  SHOT_CROWD_POV_WIDE,
  SHOT_LOW_HERO_TRIO,
  SHOT_DO_SI_DO_CORRIDOR,
  SHOT_HUDDLE_BURST_SNAP,
  SHOT_FAREWELL_BOW_WIDE,
  SHOT_DANDIYA_STRIKE_DIAGONAL,
  SHOT_DIAGONAL_CASCADE_RUNWAY,
  SHOT_BATTLE_CYPHER_HOT_SEAT,
  SHOT_SENTAI_PYRAMID_HERO,
];

/** O(1) lookup map keyed by CameraShot.id, initialized once at module load. */
export const GROUP_SHOT_BY_ID: Readonly<Record<string, CameraShot>> = (() => {
  const map: Record<string, CameraShot> = {};
  for (let i = 0; i < GROUP_CAMERA_SHOTS.length; i++) {
    const s = GROUP_CAMERA_SHOTS[i];
    map[s.id] = s;
  }
  return map;
})();

/**
 * Context hints passed from `groupDirector` into `selectGroupCameraShot`
 * so the camera automatically picks the ideal lens & trajectory for the active
 * formation, duet facing, or call-and-response spotlight.
 */
export interface GroupCameraSelectHints {
  energy: number;
  seedBeat: number;
  lastShotId: string;
  formationId?: string;
  duetFacing?: string;
  isDuetActive?: boolean;
  isMirrorMode?: boolean;
  isCanonMode?: boolean;
  isSoloSpot?: boolean;
  isSongEnding?: boolean;
}

/**
 * Deterministic, zero-allocation group camera shot selector that pairs
 * choreographic state (duets, formations, mirror/canon modes, solo-spots)
 * with its bespoke camera shot while honoring the V1.5 wide bonus (+0.8).
 */
export function selectGroupCameraShot(hints: GroupCameraSelectHints): CameraShot {
  let bestShot = GROUP_CAMERA_SHOTS[0];
  let bestScore = -1e9;
  const n = GROUP_CAMERA_SHOTS.length;
  const energy = hints.energy;

  for (let i = 0; i < n; i++) {
    const s = GROUP_CAMERA_SHOTS[i];
    let score = 0;

    // 1. V1.5 wide-shot preference bonus (+0.8)
    if (s.wide === true) {
      score += 0.8;
    }

    // 2. Energy fit score
    const eMin = s.energyFit[0];
    const eMax = s.energyFit[1];
    if (energy >= eMin && energy <= eMax) {
      score += 2.0;
    } else {
      const dist = energy < eMin ? eMin - energy : energy - eMax;
      score -= dist * 3.0;
    }

    // 3. Choreographic synergy bonuses (matches camera movement to stage geometry)
    if (hints.isSongEnding === true && s.id === 'GROUP_FAREWELL_BOW_WIDE') {
      score += 4.5;
    }
    if (hints.isDuetActive === true) {
      if (s.id === 'GROUP_DUET_TWO_SHOT_LOCK') score += 2.2;
      if (hints.duetFacing === 'EACH_OTHER' && s.id === 'GROUP_DANDIYA_STRIKE_DIAGONAL') {
        score += 2.6;
      }
      if (hints.duetFacing === 'MIRRORED' && s.id === 'GROUP_MIRROR_SYMMETRY_AXIS') {
        score += 2.8;
      }
      if (hints.duetFacing === 'SIDE_BY_SIDE' && s.id === 'GROUP_SENTAI_PYRAMID_HERO' && energy > 0.82) {
        score += 2.4;
      }
    }
    if (hints.isMirrorMode === true && s.id === 'GROUP_MIRROR_SYMMETRY_AXIS') {
      score += 2.4;
    }
    if (hints.isCanonMode === true && s.id === 'GROUP_CANON_RIPPLE_TRUCK') {
      score += 2.5;
    }
    if (hints.isSoloSpot === true) {
      if (s.id === 'GROUP_LEADER_SPOTLIGHT_PUSH') score += 2.8;
      if (hints.formationId === 'CALL_RESPONSE_CYPHER' && s.id === 'GROUP_CYPHER_HOT_SEAT') {
        score += 3.2;
      }
    }

    // 4. Specific formation-to-camera pairing bonuses
    const fId = hints.formationId;
    if (fId !== undefined) {
      if (
        (fId === 'CIRCLE_GARBA_RING' || fId === 'EXPANDING_STAR' || fId === 'INSIDE_OUT_RIPPLE_RING') &&
        s.id === 'GROUP_OVERHEAD_MANDALA'
      ) {
        score += 2.9;
      }
      if (fId === 'ROTATING_CAROUSEL' && s.id === 'GROUP_CAROUSEL_ORBIT_SYNC') {
        score += 3.0;
      }
      if (fId === 'WAVE_LINE_STADIUM' && s.id === 'GROUP_WAVE_LINE_PAN') {
        score += 3.0;
      }
      if (fId === 'HUDDLE_BURST' && s.id === 'GROUP_HUDDLE_BURST_SNAP') {
        score += 3.4;
      }
      if (
        (fId === 'DO_SI_DO_ORBIT' || fId === 'PROMENADE_ARCH' || fId === 'CORRIDOR_LANE') &&
        s.id === 'GROUP_DO_SI_DO_CORRIDOR'
      ) {
        score += 2.7;
      }
      if (fId === 'DIAGONAL_CASCADE' && s.id === 'GROUP_DIAGONAL_RUNWAY_SLASH') {
        score += 2.8;
      }
    }

    // 5. Deterministic beat-seeded variety jitter
    const hash = ((hints.seedBeat * 163 + i * 83) % 100) * 0.016;
    score += hash;

    // 6. Recency avoidance
    if (s.id === hints.lastShotId) {
      score -= 10.0;
    }

    if (score > bestScore) {
      bestScore = score;
      bestShot = s;
    }
  }

  return bestShot;
}