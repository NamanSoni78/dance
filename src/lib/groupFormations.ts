// src/lib/groupFormations.ts
// ============================================================================
// GRAND GROUP CHOREOGRAPHER V2.5 — DELIVERABLE B: GROUP FORMATIONS & TRAVEL
// 18 deterministic, zero-allocation stage formations for 2, 3, or 4 dancers
// with bar-locked spatial travel, collision-safe Z-lane weaving, and
// camera-conscious yaw framing (Reface Law compliant).
// ============================================================================

export interface GroupFormationDef {
  id: string;                 // 'V_ARROW'
  name: string;               // 'V-Arrow Advance'
  minDancers: number;         // 2..4
  maxDancers: number;
  /** Slot position + facing yaw (rad, 0 = camera) for dancer i of n.
      PURE, zero-alloc, deterministic. */
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }) => void;
  /** Optional bar-locked slot ANIMATION (rotation, breathing spacing,
      traveling ripple) — same signature, phase = beats since formation
      started. Leave undefined for static formations. */
  animate?: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }) => void;
  energyFit: [number, number];
  tags: string[];             // 'symmetric'|'line'|'circle'|'depth'|'travel'|'solo-spot'
}

// ============================================================================
// MATHEMATICAL CONSTANTS & ZERO-ALLOCATION SPATIAL HELPERS
// ============================================================================

const PI = Math.PI;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;
const QUARTER_PI = Math.PI * 0.25;

/** Clamp scalar v into [lo, hi] with zero allocation. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Hermite smoothstep on [0, 1] for crisp bar-locked travel transitions. */
function smooth01(u: number): number {
  const c = u < 0 ? 0 : u > 1 ? 1 : u;
  return c * c * (3 - 2 * c);
}

/**
 * Normalized centered lateral index in [-1, +1] for dancer i of n.
 * For n=2: [-1, +1]; n=3: [-1, 0, +1]; n=4: [-1, -0.333, +0.333, +1].
 */
function centeredNorm(i: number, n: number): number {
  if (n <= 1) return 0;
  return (2 * i) / (n - 1) - 1;
}

/**
 * Softly wraps an angle into the Reface-Law-compliant front hemisphere [-maxYaw, +maxYaw]
 * so orbiting dancers angle stylishly into their travel path without turning their
 * backs to the camera.
 */
function cameraConeYaw(rawYaw: number, maxYaw: number): number {
  return clamp(Math.sin(rawYaw) * maxYaw, -maxYaw, maxYaw);
}

// ============================================================================
// 1. LINE_BREATHING — Classic Front Line with Bar-Locked Accordion Breathing
// ============================================================================

const FORMATION_LINE_BREATHING: GroupFormationDef = {
  id: 'LINE_BREATHING',
  name: 'Club Front Line — Accordion Breathe & Strut',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.25, 0.85],
  tags: ['symmetric', 'line'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const u = centeredNorm(i, n);
    const halfSpan = n === 2 ? 0.85 : n === 3 ? 1.35 : 1.75;
    out.x = u * halfSpan;
    out.z = 0.15;
    out.yaw = -u * 0.10;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    const u = centeredNorm(i, n);
    const halfSpan = n === 2 ? 0.85 : n === 3 ? 1.35 : 1.75;
    // 2-bar (8-beat) lateral accordion breath + 1-bar (4-beat) downstage strut pulse
    const barPhase = beatsIn * QUARTER_PI;
    const breath = 1.0 + 0.16 * Math.sin(barPhase);
    const alternatingZ = (i % 2 === 0 ? 1 : -1) * 0.18 * Math.sin(beatsIn * HALF_PI);

    out.x = u * halfSpan * breath;
    out.z = 0.15 + alternatingZ;
    out.yaw = -u * 0.12 + 0.08 * Math.cos(barPhase) * u;
  },
};

// ============================================================================
// 2. ARC_CRESCENT_SWAY — Amphitheater Crescent Arc with Pendulum Tide
// ============================================================================

const FORMATION_ARC_CRESCENT_SWAY: GroupFormationDef = {
  id: 'ARC_CRESCENT_SWAY',
  name: 'Neon Amphitheater — Crescent Arc & Tide Sway',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.20, 0.80],
  tags: ['symmetric', 'line', 'depth'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const u = centeredNorm(i, n);
    const angle = u * 0.68; // +/- 39 deg crescent
    const radius = n === 2 ? 1.35 : n === 3 ? 1.75 : 2.15;
    out.x = Math.sin(angle) * radius;
    out.z = 0.55 - Math.cos(angle) * radius * 0.45;
    out.yaw = -angle * 0.42; // Angled slightly inward toward downstage focal point
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    const u = centeredNorm(i, n);
    const swayPhase = beatsIn * QUARTER_PI;
    const swayOffset = 0.18 * Math.sin(swayPhase);
    const angle = u * 0.68 + swayOffset;
    const radius = (n === 2 ? 1.35 : n === 3 ? 1.75 : 2.15) + 0.12 * Math.cos(swayPhase * 2);

    out.x = Math.sin(angle) * radius;
    out.z = 0.55 - Math.cos(angle) * radius * 0.45 + 0.10 * Math.sin(beatsIn * HALF_PI + i);
    out.yaw = cameraConeYaw(-angle * 0.45, 0.45);
  },
};

// ============================================================================
// 3. DIAMOND_PULSE — 4-Point Diamond with Radial Expansion & Axis Shift
// ============================================================================

const FORMATION_DIAMOND_PULSE: GroupFormationDef = {
  id: 'DIAMOND_PULSE',
  name: 'Diamond Phalanx — Radial Pulse & Axis Shift',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.40, 0.95],
  tags: ['symmetric', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    if (n === 2) {
      out.x = i === 0 ? -0.65 : 0.65;
      out.z = i === 0 ? 0.55 : -0.45;
      out.yaw = i === 0 ? 0.12 : -0.12;
      return;
    }
    if (n === 3) {
      // Point-front triangle diamond
      if (i === 0) {
        out.x = 0.0;
        out.z = 0.78;
        out.yaw = 0.0;
      } else if (i === 1) {
        out.x = -1.05;
        out.z = -0.38;
        out.yaw = 0.18;
      } else {
        out.x = 1.05;
        out.z = -0.38;
        out.yaw = -0.18;
      }
      return;
    }
    // n === 4: Classic 4-point diamond (0: front, 1: left wing, 2: right wing, 3: rear anchor)
    if (i === 0) {
      out.x = 0.0;
      out.z = 0.88;
      out.yaw = 0.0;
    } else if (i === 1) {
      out.x = -1.25;
      out.z = 0.0;
      out.yaw = 0.20;
    } else if (i === 2) {
      out.x = 1.25;
      out.z = 0.0;
      out.yaw = -0.20;
    } else {
      out.x = 0.0;
      out.z = -0.88;
      out.yaw = 0.0;
    }
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    FORMATION_DIAMOND_PULSE.slot(i, n, out);
    // Bar-locked radial breathing + subtle 2-bar diamond shear
    const barCycle = beatsIn * HalfBarScale;
    const radialScale = 1.0 + 0.18 * Math.sin(beatsIn * HALF_PI);
    const shearX = 0.22 * Math.sin(barCycle) * out.z;

    out.x = out.x * radialScale + shearX;
    out.z = out.z * radialScale;
    out.yaw = clamp(out.yaw - 0.10 * Math.sin(barCycle), -0.45, 0.45);
  },
};

const HalfBarScale = Math.PI * 0.25;

// ============================================================================
// 4. CIRCLE_GARBA_RING — Circular Garba/Raas Mandala with Folk Orbit
// ============================================================================

const FORMATION_CIRCLE_GARBA_RING: GroupFormationDef = {
  id: 'CIRCLE_GARBA_RING',
  name: 'Garba Mandala Ring — Counter-Clockwise Folk Orbit',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.45, 0.95],
  tags: ['symmetric', 'circle', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const radius = n === 2 ? 0.92 : n === 3 ? 1.12 : 1.28;
    const theta = (i / n) * TAU + QUARTER_PI;
    out.x = Math.sin(theta) * radius;
    out.z = Math.cos(theta) * radius * 0.78;
    out.yaw = cameraConeYaw(-theta, 0.42);
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    const baseRadius = n === 2 ? 0.92 : n === 3 ? 1.12 : 1.28;
    // Smooth Garba circle contraction on beat 1 of each bar, expansion on beat 3
    const radius = baseRadius * (1.0 - 0.14 * Math.cos(beatsIn * HALF_PI));
    // Full orbit every 16 beats (4 bars)
    const theta = (i / n) * TAU + QUARTER_PI + beatsIn * (TAU / 16);

    out.x = Math.sin(theta) * radius;
    out.z = Math.cos(theta) * radius * 0.80;
    // Angle slightly toward center of Garba ring while staying in camera front hemisphere
    out.yaw = cameraConeYaw(-Math.sin(theta) * 0.55, 0.50);
  },
};

// ============================================================================
// 5. V_ARROW — V-Arrow Advance with Bar-Locked Downstage Thrust
// ============================================================================

const FORMATION_V_ARROW: GroupFormationDef = {
  id: 'V_ARROW',
  name: 'V-Arrow Advance — Flying Wedge & Downstage Thrust',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.55, 1.0],
  tags: ['symmetric', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    if (n === 2) {
      out.x = i === 0 ? -0.68 : 0.68;
      out.z = i === 0 ? 0.60 : -0.25;
      out.yaw = i === 0 ? 0.08 : -0.14;
      return;
    }
    if (i === 0) {
      // Point leader at downstage apex
      out.x = 0.0;
      out.z = 0.85;
      out.yaw = 0.0;
    } else if (i === 1) {
      out.x = -1.05;
      out.z = -0.10;
      out.yaw = 0.15;
    } else if (i === 2) {
      out.x = 1.05;
      out.z = -0.10;
      out.yaw = -0.15;
    } else {
      // 4th dancer forms outer-right/rear echelon wing
      out.x = 0.0;
      out.z = -0.82;
      out.yaw = 0.0;
    }
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    FORMATION_V_ARROW.slot(i, n, out);
    // 2-bar (8-beat) forward wedge surge + wing-sweep flex
    const surgePhase = beatsIn * QUARTER_PI;
    const zAdvance = 0.28 * Math.sin(surgePhase);
    const wingFlex = 1.0 + 0.14 * Math.cos(surgePhase);

    out.x = out.x * wingFlex;
    out.z = out.z + zAdvance;
    out.yaw = out.yaw * wingFlex;
  },
};

// ============================================================================
// 6. DIAGONAL_CASCADE — Staggered Runway Slash with Canon Depth Wave
// ============================================================================

const FORMATION_DIAGONAL_CASCADE: GroupFormationDef = {
  id: 'DIAGONAL_CASCADE',
  name: 'Staggered Diagonal Cascade — Runway Echelon Slash',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.35, 0.90],
  tags: ['line', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const u = centeredNorm(i, n);
    const spanX = n === 2 ? 0.85 : n === 3 ? 1.35 : 1.75;
    const spanZ = n === 2 ? 0.55 : n === 3 ? 0.80 : 0.95;
    out.x = u * spanX;
    out.z = -u * spanZ;
    out.yaw = -0.22; // Uniform echelon slash angle toward downstage-right camera axis
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    const u = centeredNorm(i, n);
    const spanX = n === 2 ? 0.85 : n === 3 ? 1.35 : 1.75;
    const spanZ = n === 2 ? 0.55 : n === 3 ? 0.80 : 0.95;
    // Flip diagonal slope smoothly every 4 bars (16 beats)
    const flipWave = Math.cos(beatsIn * (PI / 16));
    // Per-slot canon ripple along the perpendicular axis
    const ripple = 0.20 * Math.sin(beatsIn * HALF_PI - i * 0.9);

    out.x = u * spanX + ripple * 0.35;
    out.z = -u * spanZ * flipWave + ripple;
    out.yaw = -0.22 * flipWave + 0.08 * Math.sin(beatsIn * HALF_PI + i);
  },
};

// ============================================================================
// 7. INSIDE_OUT_RIPPLE_RING — Concentric Inner/Outer Ring Inversion
// ============================================================================

const FORMATION_INSIDE_OUT_RIPPLE_RING: GroupFormationDef = {
  id: 'INSIDE_OUT_RIPPLE_RING',
  name: 'Inside-Out Ripple Ring — Concentric Pulse Inversion',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.50, 0.98],
  tags: ['symmetric', 'circle', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const isOuter = i % 2 === 0;
    const r = isOuter ? 1.38 : 0.72;
    const angle = centeredNorm(i, n) * 1.15;
    out.x = Math.sin(angle) * r;
    out.z = Math.cos(angle) * r * 0.75;
    out.yaw = -angle * 0.30;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    // Every 2 bars (8 beats), odd and even dancers invert inner (0.68m) vs outer (1.45m) radii!
    const parity = i % 2 === 0 ? 1 : -1;
    const inversion = parity * Math.sin(beatsIn * QUARTER_PI);
    const r = 1.06 + 0.38 * inversion;
    // Subtle orbital sway keeps lanes separated during the pass
    const baseAngle = centeredNorm(i, n) * 1.15 + 0.18 * Math.cos(beatsIn * QUARTER_PI) * parity;

    out.x = Math.sin(baseAngle) * r;
    out.z = Math.cos(baseAngle) * r * 0.78 - 0.15 * inversion;
    out.yaw = cameraConeYaw(-baseAngle * 0.35 + 0.18 * inversion, 0.48);
  },
};

// ============================================================================
// 8. LEADER_FRONT_TRIANGLE — Apex Phalanx with Wing-Guard Swap
// ============================================================================

const FORMATION_LEADER_FRONT_TRIANGLE: GroupFormationDef = {
  id: 'LEADER_FRONT_TRIANGLE',
  name: 'Leader-Front Triangle — Apex Phalanx & Wing Swap',
  minDancers: 3,
  maxDancers: 4,
  energyFit: [0.45, 0.95],
  tags: ['symmetric', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    if (i === 0) {
      out.x = 0.0;
      out.z = 0.82;
      out.yaw = 0.0;
      return;
    }
    const wingCount = n - 1;
    const wingIdx = i - 1;
    const u = centeredNorm(wingIdx, wingCount);
    out.x = u * (wingCount === 2 ? 1.15 : 1.45);
    out.z = -0.35 - (1 - Math.abs(u)) * 0.42;
    out.yaw = -u * 0.18;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    if (i === 0) {
      // Apex leader holds downstage command with a subtle bar-locked swagger
      out.x = 0.14 * Math.sin(beatsIn * QUARTER_PI);
      out.z = 0.82 + 0.12 * Math.sin(beatsIn * HALF_PI);
      out.yaw = -0.08 * Math.sin(beatsIn * QUARTER_PI);
      return;
    }
    const wingCount = n - 1;
    const wingIdx = i - 1;
    const u = centeredNorm(wingIdx, wingCount);
    // Rear guards orbit/swap wings across a 4-bar (16-beat) cycle on separate Z arcs
    const swapPhase = beatsIn * (PI / 8);
    const cosSwap = Math.cos(swapPhase);
    const sinSwap = Math.sin(swapPhase);
    const span = wingCount === 2 ? 1.18 : 1.48;

    out.x = u * span * cosSwap;
    out.z = -0.45 + u * 0.35 * sinSwap - (1 - Math.abs(u)) * 0.35;
    out.yaw = cameraConeYaw(-out.x * 0.16, 0.40);
  },
};

// ============================================================================
// 9. ROTATING_CAROUSEL — Orbiting Stage Ring with Camera-Locked Yaw
// ============================================================================

const FORMATION_ROTATING_CAROUSEL: GroupFormationDef = {
  id: 'ROTATING_CAROUSEL',
  name: 'Rotating Carousel — 360 Stage Orbit (Camera-Locked)',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.50, 0.96],
  tags: ['symmetric', 'circle', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const r = n === 2 ? 0.95 : n === 3 ? 1.18 : 1.32;
    const angle = (i / n) * TAU + QUARTER_PI;
    out.x = Math.sin(angle) * r;
    out.z = Math.cos(angle) * r * 0.82;
    out.yaw = 0.0; // Reface Law: individuals keep facing the camera while the carousel turns!
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    const r = (n === 2 ? 0.95 : n === 3 ? 1.18 : 1.32) + 0.08 * Math.sin(beatsIn * HALF_PI);
    // 12-beat (3-bar) smooth continuous carousel revolution
    const angle = (i / n) * TAU + QUARTER_PI + beatsIn * (TAU / 12);

    out.x = Math.sin(angle) * r;
    out.z = Math.cos(angle) * r * 0.82;
    // Slight banking yaw into the tangent while strictly facing the front camera cone
    out.yaw = 0.18 * Math.cos(angle);
  },
};

// ============================================================================
// 10. WAVE_LINE_STADIUM — Horizontal Line with Traveling Sinusoidal Wave
// ============================================================================

const FORMATION_WAVE_LINE_STADIUM: GroupFormationDef = {
  id: 'WAVE_LINE_STADIUM',
  name: 'Stadium Wave Line — Sequential Traveling Ripple',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.35, 0.90],
  tags: ['symmetric', 'line', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const u = centeredNorm(i, n);
    const halfSpan = n === 2 ? 0.90 : n === 3 ? 1.40 : 1.80;
    out.x = u * halfSpan;
    out.z = 0.10;
    out.yaw = 0.0;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    const u = centeredNorm(i, n);
    const halfSpan = n === 2 ? 0.90 : n === 3 ? 1.40 : 1.80;
    // Stadium wave travels across dancer index i with a 1-beat phase lag per slot
    const wavePhase = beatsIn * HALF_PI - i * 1.05;
    const waveZ = 0.48 * Math.sin(wavePhase);
    const waveX = 0.10 * Math.cos(wavePhase);

    out.x = u * halfSpan + waveX;
    out.z = 0.10 + waveZ;
    out.yaw = 0.22 * Math.cos(wavePhase);
  },
};

// ============================================================================
// 11. HUDDLE_BURST — Tight Center Huddle Exploding into Wide Stage Burst
// ============================================================================

const FORMATION_HUDDLE_BURST: GroupFormationDef = {
  id: 'HUDDLE_BURST',
  name: 'Huddle-Burst — Tight Crew Pack & Downbeat Explosion',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.65, 1.0],
  tags: ['symmetric', 'circle', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const u = centeredNorm(i, n);
    const angle = u * 0.95;
    out.x = Math.sin(angle) * 0.85;
    out.z = Math.cos(angle) * 0.55;
    out.yaw = -angle * 0.35;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    // 16-beat (4-bar) cycle:
    // Beats 0..7 (Bars 1-2): Gather into tight collision-safe huddle (r = 0.68m) angled inward
    // Beats 8..15 (Bars 3-4): Explosive burst out to wide stadium fan (r = 1.75m) facing camera!
    const cycleBeat = beatsIn % 16;
    let burstFactor = 0;
    if (cycleBeat >= 7.0 && cycleBeat < 9.0) {
      burstFactor = smooth01((cycleBeat - 7.0) * 0.5);
    } else if (cycleBeat >= 9.0 && cycleBeat < 14.0) {
      burstFactor = 1.0;
    } else if (cycleBeat >= 14.0) {
      burstFactor = 1.0 - smooth01((cycleBeat - 14.0) * 0.5);
    }

    const u = centeredNorm(i, n);
    const spreadAngle = u * (0.85 + 0.25 * burstFactor);
    // Huddle radius >= 0.68m guarantees >= 0.78m inter-dancer spacing for n<=4
    const rX = 0.68 + 1.15 * burstFactor;
    const rZ = 0.48 + 0.42 * burstFactor;

    out.x = Math.sin(spreadAngle) * rX;
    out.z = (i % 2 === 0 ? 1 : -1) * 0.28 * (1 - burstFactor) + Math.cos(spreadAngle) * rZ * burstFactor * 0.5;
    // In huddle: cozy inward camaraderie angle; on burst: snap straight to camera!
    out.yaw = -u * (0.48 * (1 - burstFactor) + 0.12 * burstFactor);
  },
};

// ============================================================================
// 12. PROMENADE_ARCH — Pairs Form Arch & Glide Down the Center Runway
// ============================================================================

const FORMATION_PROMENADE_ARCH: GroupFormationDef = {
  id: 'PROMENADE_ARCH',
  name: 'Promenade Arch — Center Runway Peel & Pass-Through',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.45, 0.92],
  tags: ['symmetric', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const side = i % 2 === 0 ? -1 : 1;
    const row = i < 2 ? 0 : 1;
    const xSpread = row === 0 ? 0.65 : 1.25;
    out.x = side * xSpread;
    out.z = n <= 2 ? 0.20 : row === 0 ? 0.65 : -0.55;
    out.yaw = -side * 0.18;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    const side = i % 2 === 0 ? -1 : 1;
    if (n <= 2) {
      // For 2 dancers: cyclic narrow-arch meet & wide peel-apart promenade loop
      const loop = beatsIn * QUARTER_PI;
      out.x = side * (0.82 + 0.38 * Math.sin(loop));
      out.z = 0.15 + 0.45 * Math.cos(loop);
      out.yaw = -side * (0.28 - 0.18 * Math.sin(loop));
      return;
    }

    // For 3 or 4 dancers: Row 0 and Row 1 trade places every 2 bars (8 beats).
    // Whoever moves forward travels down the narrow inner runway (|x| = 0.52m),
    // while whoever peels back opens wide to form the outer arch (|x| = 1.38m)!
    const rowPhase = beatsIn * QUARTER_PI + (i < 2 ? 0 : PI);
    const zTravel = Math.cos(rowPhase); // +1 front, -1 back
    const advancing = Math.sin(rowPhase); // >0 while moving back-to-front through the arch

    const laneWidth = 0.95 - 0.42 * advancing;
    out.x = side * laneWidth;
    out.z = 0.68 * zTravel;
    out.yaw = -side * (0.15 + 0.18 * (1 - advancing));
  },
};

// ============================================================================
// 13. CORRIDOR_LANE — 2x2 Runway Columns with Row-Trade Shift
// ============================================================================

const FORMATION_CORRIDOR_LANE: GroupFormationDef = {
  id: 'CORRIDOR_LANE',
  name: 'Club Corridor — 2x2 Runway Columns & Row Trade',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.40, 0.92],
  tags: ['symmetric', 'line', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const col = i % 2 === 0 ? -1 : 1;
    const row = i < 2 ? 1 : -1;
    out.x = col * (n <= 2 ? 0.80 : row > 0 ? 0.72 : 1.18);
    out.z = n <= 2 ? 0.20 : row * 0.62;
    out.yaw = -col * 0.10;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    const col = i % 2 === 0 ? -1 : 1;
    const isFirstPair = i < 2 ? 1 : -1;
    // 2-bar (8-beat) smooth row-trade piston with staggered inner/outer X-lanes so columns never collide
    const pistonPhase = beatsIn * QUARTER_PI;
    const zPos = isFirstPair * Math.cos(pistonPhase);
    const xLaneOffset = isFirstPair * Math.sin(pistonPhase);

    out.x = col * (0.94 + 0.34 * xLaneOffset);
    out.z = n <= 2 ? 0.35 * Math.sin(pistonPhase) * col : 0.68 * zPos;
    out.yaw = -col * 0.14 + 0.08 * xLaneOffset * col;
  },
};

// ============================================================================
// 14. SOLO_SPOTLIGHT — Star Soloist Center-Front with Crew V-Backdrop
// ============================================================================

const FORMATION_SOLO_SPOTLIGHT: GroupFormationDef = {
  id: 'SOLO_SPOTLIGHT',
  name: 'Solo Spotlight — Center-Stage Star & Hypeman Backdrop',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.50, 1.0],
  tags: ['symmetric', 'depth', 'solo-spot'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    if (i === 0) {
      // Featured soloist commands downstage center spotlight
      out.x = 0.0;
      out.z = 1.05;
      out.yaw = 0.0;
      return;
    }
    // Backup crew forms a wide, deep upstage framing arc
    const crewCount = n - 1;
    const crewIdx = i - 1;
    const u = centeredNorm(crewIdx, crewCount);
    const span = crewCount === 1 ? 0.95 : crewCount === 2 ? 1.35 : 1.65;
    out.x = crewCount === 1 ? 0.95 : u * span;
    out.z = -0.78 - Math.abs(u) * 0.22;
    out.yaw = crewCount === 1 ? -0.25 : -u * 0.25;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    FORMATION_SOLO_SPOTLIGHT.slot(i, n, out);
    const barPulse = Math.sin(beatsIn * HALF_PI);
    if (i === 0) {
      // Soloist prowls the downstage spotlight apron
      out.x = 0.28 * Math.sin(beatsIn * QUARTER_PI);
      out.z = 1.05 + 0.12 * barPulse;
      out.yaw = -0.12 * Math.cos(beatsIn * QUARTER_PI);
    } else {
      // Backup crew sways in unison behind the soloist
      out.x += 0.14 * barPulse;
      out.z -= 0.08 * Math.cos(beatsIn * HALF_PI);
    }
  },
};

// ============================================================================
// 15. SWAP_WEAVE — Figure-Eight Lateral Crossover Weave
// ============================================================================

const FORMATION_SWAP_WEAVE: GroupFormationDef = {
  id: 'SWAP_WEAVE',
  name: 'Figure-Eight Swap-Weave — Braided Lateral Crossover',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.60, 1.0],
  tags: ['line', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const u = centeredNorm(i, n);
    out.x = u * (n === 2 ? 0.90 : n === 3 ? 1.35 : 1.70);
    out.z = (i % 2 === 0 ? 1 : -1) * 0.35;
    out.yaw = 0.0;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    // Pairwise Lissajous figure-eight weave:
    // Dancers (0,1) weave on downstage-biased figure-8; dancers (2,3) weave on upstage-biased figure-8.
    // Within each pair, opposite phase guarantees when X crosses 0, one is at +Z and the other at -Z!
    const pairIdx = i < 2 ? 0 : 1;
    const isRightOfPair = i % 2 === 1;
    const phase = beatsIn * QUARTER_PI + (isRightOfPair ? PI : 0) + pairIdx * HALF_PI;

    if (n === 3 && i === 2) {
      // 3rd dancer weaves a wide counter-arc around the front pair
      out.x = 1.35 * Math.sin(beatsIn * QUARTER_PI);
      out.z = -0.68 + 0.22 * Math.cos(beatsIn * HALF_PI);
      out.yaw = -0.20 * Math.cos(beatsIn * QUARTER_PI);
      return;
    }

    const xAmp = pairIdx === 0 ? 0.98 : 1.38;
    const zCenter = n <= 2 ? 0.10 : pairIdx === 0 ? 0.52 : -0.58;
    const zAmp = 0.42;

    out.x = xAmp * Math.cos(phase);
    out.z = zCenter + zAmp * Math.sin(phase);
    out.yaw = cameraConeYaw(-0.32 * Math.sin(phase), 0.42);
  },
};

// ============================================================================
// 16. EXPANDING_STAR — Kaleidoscopic Starburst with 45-Deg Phase Twist
// ============================================================================

const FORMATION_EXPANDING_STAR: GroupFormationDef = {
  id: 'EXPANDING_STAR',
  name: 'Kaleidoscope Starburst — Breathing Radial Twist',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.55, 1.0],
  tags: ['symmetric', 'circle', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    const angle = (i / n) * TAU + QUARTER_PI;
    const r = n === 2 ? 0.95 : 1.25;
    out.x = Math.sin(angle) * r;
    out.z = Math.cos(angle) * r * 0.78;
    out.yaw = -Math.sin(angle) * 0.22;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    // 2-bar (8-beat) starburst expansion/contraction coupled with a +/- 45-degree twist
    const starPhase = beatsIn * QUARTER_PI;
    const r = 0.76 + 0.68 * (0.5 + 0.5 * Math.sin(starPhase));
    const twist = QUARTER_PI * Math.cos(starPhase * 0.5);
    const angle = (i / n) * TAU + QUARTER_PI + twist;

    out.x = Math.sin(angle) * r;
    out.z = Math.cos(angle) * r * 0.78;
    out.yaw = cameraConeYaw(-Math.sin(angle) * 0.28, 0.42);
  },
};

// ============================================================================
// 17. CALL_RESPONSE_CYPHER — Street Battle Cypher with Rotating Hot-Seat
// ============================================================================

const FORMATION_CALL_RESPONSE_CYPHER: GroupFormationDef = {
  id: 'CALL_RESPONSE_CYPHER',
  name: 'Battle Cypher — Rotating Hot-Seat & Hype Arc',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.50, 0.98],
  tags: ['depth', 'travel', 'solo-spot'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    if (i === 0) {
      // Hot-seat battler downstage-left/center angled toward the cypher & camera
      out.x = -0.55;
      out.z = 0.75;
      out.yaw = -0.22;
      return;
    }
    const hypeIdx = i - 1;
    const hypeCount = n - 1;
    const u = centeredNorm(hypeIdx, hypeCount);
    out.x = 0.75 + u * 0.55;
    out.z = -0.15 + u * 0.52;
    out.yaw = 0.32;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    FORMATION_CALL_RESPONSE_CYPHER.slot(i, n, out);
    // Every 2 bars (8 beats), the cypher breathes and rocks across the battle axis
    const rock = Math.sin(beatsIn * QUARTER_PI);
    if (i === 0) {
      out.x = -0.55 + 0.35 * Math.max(0, rock);
      out.z = 0.75 + 0.15 * Math.sin(beatsIn * HALF_PI);
      out.yaw = -0.22 + 0.12 * rock;
    } else {
      out.x += 0.16 * rock;
      out.z += 0.12 * Math.cos(beatsIn * HALF_PI + i);
      out.yaw = 0.32 - 0.10 * rock;
    }
  },
};

// ============================================================================
// 18. DO_SI_DO_ORBIT — Paired Back-to-Back Spatial Do-Si-Do Loop
// ============================================================================

const FORMATION_DO_SI_DO_ORBIT: GroupFormationDef = {
  id: 'DO_SI_DO_ORBIT',
  name: 'Do-Si-Do Partner Orbit — Paired Figure-Zero Pass',
  minDancers: 2,
  maxDancers: 4,
  energyFit: [0.55, 0.95],
  tags: ['symmetric', 'circle', 'depth', 'travel'],
  slot: (i: number, n: number, out: { x: number; z: number; yaw: number }): void => {
    if (n === 3) {
      const u = centeredNorm(i, 3);
      out.x = u * 1.25;
      out.z = i === 1 ? 0.55 : -0.25;
      out.yaw = -u * 0.15;
      return;
    }
    // Pair 0: dancers (0,1); Pair 1: dancers (2,3)
    const pairIdx = i < 2 ? 0 : 1;
    const inPairSide = i % 2 === 0 ? -1 : 1;
    const pairCenterX = n <= 2 ? 0.0 : pairIdx === 0 ? -1.05 : 1.05;
    out.x = pairCenterX + inPairSide * 0.46;
    out.z = 0.15;
    out.yaw = -inPairSide * 0.12;
  },
  animate: (i: number, n: number, beatsIn: number, out: { x: number; z: number; yaw: number }): void => {
    // 8-beat (2-bar) authentic Do-Si-Do: partners advance past right shoulders,
    // slide back-to-back around each other, and retreat past left shoulders while facing front!
    const theta = beatsIn * QUARTER_PI;
    if (n === 3) {
      const trioAngle = theta + (i / 3) * TAU;
      out.x = Math.cos(trioAngle) * 1.15;
      out.z = Math.sin(trioAngle) * 0.65;
      out.yaw = 0.15 * Math.sin(trioAngle);
      return;
    }

    const pairIdx = i < 2 ? 0 : 1;
    const inPairSign = i % 2 === 0 ? -1 : 1;
    const pairCenterX = n <= 2 ? 0.0 : pairIdx === 0 ? -1.08 : 1.08;
    const orbitAngle = theta + (inPairSign < 0 ? PI : 0);

    out.x = pairCenterX + Math.cos(orbitAngle) * 0.48;
    out.z = 0.12 + Math.sin(orbitAngle) * 0.52;
    // Reface Law: dancers face camera throughout the Do-Si-Do pass with slight shoulder-lead angle
    out.yaw = 0.18 * Math.sin(orbitAngle);
  },
};

// ============================================================================
// EXPORTED FORMATION LIBRARY & ZERO-ALLOCATION SELECTOR / EVALUATOR HELPERS
// ============================================================================

export const GROUP_FORMATIONS: readonly GroupFormationDef[] = [
  FORMATION_LINE_BREATHING,
  FORMATION_ARC_CRESCENT_SWAY,
  FORMATION_DIAMOND_PULSE,
  FORMATION_CIRCLE_GARBA_RING,
  FORMATION_V_ARROW,
  FORMATION_DIAGONAL_CASCADE,
  FORMATION_INSIDE_OUT_RIPPLE_RING,
  FORMATION_LEADER_FRONT_TRIANGLE,
  FORMATION_ROTATING_CAROUSEL,
  FORMATION_WAVE_LINE_STADIUM,
  FORMATION_HUDDLE_BURST,
  FORMATION_PROMENADE_ARCH,
  FORMATION_CORRIDOR_LANE,
  FORMATION_SOLO_SPOTLIGHT,
  FORMATION_SWAP_WEAVE,
  FORMATION_EXPANDING_STAR,
  FORMATION_CALL_RESPONSE_CYPHER,
  FORMATION_DO_SI_DO_ORBIT,
];

/** O(1) lookup map keyed by GroupFormationDef.id, initialized once at module load. */
export const FORMATION_BY_ID: Readonly<Record<string, GroupFormationDef>> = (() => {
  const map: Record<string, GroupFormationDef> = {};
  for (let i = 0; i < GROUP_FORMATIONS.length; i++) {
    const f = GROUP_FORMATIONS[i];
    map[f.id] = f;
  }
  return map;
})();

/**
 * Evaluates a formation's current slot position & facing yaw for dancer `i` of `n`
 * at `beatsIn` beats since the formation started. Uses `animate` if defined,
 * falling back to `slot`. Pure, zero-allocation.
 */
export function evaluateFormationSlot(
  formation: GroupFormationDef,
  i: number,
  n: number,
  beatsIn: number,
  out: { x: number; z: number; yaw: number }
): void {
  if (formation.animate !== undefined) {
    formation.animate(i, n, beatsIn, out);
  } else {
    formation.slot(i, n, out);
  }
}

/**
 * Deterministic, zero-allocation formation selector scored by dancer count `n`,
 * song energy, optional tag filter (e.g., `'solo-spot'` or `'travel'`), and
 * recency avoidance.
 */
export function selectGroupFormation(
  n: number,
  energy: number,
  seedBeat: number,
  lastFormationId: string,
  requiredTag?: string
): GroupFormationDef {
  let bestFormation = GROUP_FORMATIONS[0];
  let bestScore = -1e9;
  const total = GROUP_FORMATIONS.length;

  for (let idx = 0; idx < total; idx++) {
    const f = GROUP_FORMATIONS[idx];

    // 1. Hard gate on dancer count
    if (n < f.minDancers || n > f.maxDancers) {
      continue;
    }

    // 2. Optional tag requirement (e.g., 'solo-spot' during call-and-response)
    if (requiredTag !== undefined && requiredTag.length > 0) {
      let hasTag = false;
      for (let t = 0; t < f.tags.length; t++) {
        if (f.tags[t] === requiredTag) {
          hasTag = true;
          break;
        }
      }
      if (!hasTag) continue;
    } else {
      // V3 AUDIT FIX: baseline group rotation (no requiredTag) must never
      // pick a 'solo-spot' formation — those layouts (SOLO_SPOTLIGHT,
      // CALL_RESPONSE_CYPHER) are reserved for SPECIES_SPOTLIGHT mode.
      let isSoloSpot = false;
      for (let t = 0; t < f.tags.length; t++) {
        if (f.tags[t] === 'solo-spot') {
          isSoloSpot = true;
          break;
        }
      }
      if (isSoloSpot) continue;
    }

    let score = 0;

    // 3. Energy fit score
    const eMin = f.energyFit[0];
    const eMax = f.energyFit[1];
    if (energy >= eMin && energy <= eMax) {
      score += 2.2;
    } else {
      const dist = energy < eMin ? eMin - energy : energy - eMax;
      score -= dist * 3.0;
    }

    // 4. Deterministic beat-seeded variety jitter
    const hash = ((seedBeat * 157 + idx * 89) % 100) * 0.015;
    score += hash;

    // 5. Recency avoidance
    if (f.id === lastFormationId) {
      score -= 10.0;
    }

    if (score > bestScore) {
      bestScore = score;
      bestFormation = f;
    }
  }

  return bestFormation;
}