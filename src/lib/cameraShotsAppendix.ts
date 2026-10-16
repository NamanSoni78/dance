// src/lib/cameraShotsAppendix.ts
// V2 "Grand Show Director" pack — 8 bonus WIDE tour-production camera shots.
// Authored by the external choreographer AI (grandshowdirector.zip), audited:
// all shots respect the V1.5 wide-by-default laws (fovBias / directional
// beatPunch / low shake, `wide: true` selection bonus). The local
// CameraShot/CameraContext declarations from the package were replaced with a
// TYPE-ONLY import from cameraShots.ts — zero runtime import cycle.

import * as THREE from 'three';
import type { CameraShot } from './cameraShots';

// ============================================================================
// 8 BONUS WIDE CAMERA SHOTS (V2 Tour Production Appendix)
// ============================================================================

export const shotMandalaCounterOrbit: CameraShot = {
  id: 'mandala_counter_orbit',
  name: 'Symmetry Mandala Counter-Orbit',
  energyFit: [0.35, 0.9],
  minBars: 4,
  fovBias: 2.0,
  rollBias: 0.03,
  beatPunch: 0.1,
  shake: 0.004,
  wide: true,
  frame(pos, look, ctx) {
    // High overhead angle rotating counter-clockwise at 1/16 beat rate
    // Showcases the full floor pattern + EQ ring + crowd perimeter around the cat
    const angle = -ctx.shotBeat * (Math.PI / 16) + 0.35;
    const radius = 4.6;
    pos.set(Math.sin(angle) * radius, 3.85, Math.cos(angle) * radius);
    look.set(0, 0.72, 0);
  },
};

export const shotCrowdSurfDolly: CameraShot = {
  id: 'crowd_surf_dolly',
  name: 'Crowd Rim Tracking Dolly',
  energyFit: [0.45, 1.0],
  minBars: 4,
  fovBias: 1.5,
  rollBias: 0.02,
  beatPunch: 0.14,
  shake: 0.008,
  wide: true,
  frame(pos, look, ctx) {
    // Glides just above head-height along the front-side edge of the crowd line
    const sweep = Math.sin(ctx.shotBeat * (Math.PI / 8)) * 0.58;
    const radius = 4.25;
    pos.set(
      Math.sin(sweep) * radius,
      1.28 + Math.sin(ctx.shotBeat * (Math.PI / 2)) * 0.05,
      Math.cos(sweep) * radius
    );
    look.set(0, 0.98, -0.2);
  },
};

export const shotSilhouetteBacklitHero: CameraShot = {
  id: 'silhouette_backlit_hero',
  name: 'Backlit Laser Hero Wide',
  energyFit: [0.55, 1.0],
  minBars: 2,
  fovBias: 1.0,
  rollBias: 0.04,
  beatPunch: 0.16,
  shake: 0.009,
  wide: true,
  frame(pos, look, ctx) {
    // Low-front wide position looking up through the cat into the DJ laser cones & strobe sparks
    const driftX = Math.sin(ctx.shotBeat * (Math.PI / 8)) * 0.45;
    pos.set(driftX, 0.52, 3.85);
    look.set(0, 1.18, -1.2);
  },
};

export const shotAlbumCoverLocked: CameraShot = {
  id: 'album_cover_locked',
  name: '6.2m Symmetrical Album Cover',
  energyFit: [0.15, 0.85],
  minBars: 4,
  fovBias: 3.0,
  rollBias: 0.0,
  beatPunch: 0.08,
  shake: 0.002,
  wide: true,
  frame(pos, look, ctx) {
    // Ultra-wide architectural composition capturing the entire club rig + geysers + crowd
    const microFloat = Math.sin(ctx.shotBeat * (Math.PI / 4)) * 0.04;
    pos.set(0, 1.62 + microFloat, 6.2);
    look.set(0, 1.02, -0.35);
  },
};

export const shotSpiralAscender: CameraShot = {
  id: 'spiral_ascender',
  name: '4-Bar Spiral Ascender',
  energyFit: [0.4, 0.95],
  minBars: 4,
  fovBias: 1.5,
  rollBias: 0.05,
  beatPunch: 0.12,
  shake: 0.006,
  wide: true,
  frame(pos, look, ctx) {
    // Rises smoothly from floor level (0.65m) to 3.35m while orbiting 180 degrees over 16 beats
    const progress = (ctx.shotBeat % 16) / 16;
    const smoothP = 0.5 - 0.5 * Math.cos(progress * Math.PI);
    const angle = -Math.PI * 0.45 + smoothP * Math.PI * 0.9;
    const radius = 3.5 + smoothP * 1.45;
    const height = 0.65 + smoothP * 2.7;
    pos.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    look.set(0, 0.95 - smoothP * 0.15, 0);
  },
};

export const shotLowFrontDollyOut: CameraShot = {
  id: 'low_front_dolly_out',
  name: 'Low-Front Epic Pullback',
  energyFit: [0.3, 0.9],
  minBars: 4,
  fovBias: 2.0,
  rollBias: 0.0,
  beatPunch: 0.13,
  shake: 0.005,
  wide: true,
  frame(pos, look, ctx) {
    // Continuous reverse dolly from 3.35m out to 5.85m over 16 beats
    const progress = Math.min(1.0, ctx.shotBeat / 16);
    const smoothP = 1.0 - Math.pow(1.0 - progress, 2);
    const dist = 3.35 + smoothP * 2.5;
    const swayX = Math.sin(ctx.shotBeat * (Math.PI / 8)) * 0.28;
    pos.set(swayX, 0.78 + smoothP * 0.65, dist);
    look.set(0, 0.96, 0);
  },
};

export const shotSubStackCorridor: CameraShot = {
  id: 'sub_stack_corridor',
  name: 'Sub-Stack Laser Corridor',
  energyFit: [0.6, 1.0],
  minBars: 2,
  fovBias: -2.0,
  rollBias: 0.06,
  beatPunch: 0.17,
  shake: 0.011,
  wide: false,
  frame(pos, look, ctx) {
    // Framed diagonally just outside the left speaker stack looking across the stage deck
    const nod = Math.sin(ctx.shotBeat * (Math.PI / 4)) * 0.12;
    pos.set(-2.55, 1.12 + nod * 0.3, 2.35);
    look.set(0.15, 0.98, -0.25);
  },
};

export const shotBeatBreathingWide: CameraShot = {
  id: 'beat_breathing_wide',
  name: 'Bar-Locked Breathing Wide',
  energyFit: [0.25, 0.95],
  minBars: 4,
  fovBias: 0.5,
  rollBias: 0.02,
  beatPunch: 0.15,
  shake: 0.006,
  wide: true,
  frame(pos, look, ctx) {
    // Locked to 4/4 bar rate: camera distance breathes by +/- 0.32m around 4.55m
    const barPhase = ctx.shotBeat * (Math.PI / 2);
    const dist = 4.55 + Math.cos(barPhase) * 0.32;
    const arcX = Math.sin(barPhase * 0.5) * 0.85;
    pos.set(arcX, 1.42, dist);
    look.set(0, 0.95, 0);
  },
};

export const CAMERA_SHOTS_BONUS: CameraShot[] = [
  shotMandalaCounterOrbit,
  shotCrowdSurfDolly,
  shotSilhouetteBacklitHero,
  shotAlbumCoverLocked,
  shotSpiralAscender,
  shotLowFrontDollyOut,
  shotSubStackCorridor,
  shotBeatBreathingWide,
];