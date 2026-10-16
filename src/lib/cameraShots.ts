// src/lib/cameraShots.ts
// 19 cinematic music-video camera shots + zero-allocation beat-matched camera sequencer.
//
// V1.5 "WIDE & SMOOTH" OVERHAUL (direct user feedback):
//  - Base FOV 42 -> 50 and every shot pulled back 25-40%: the default framing
//    is now a confident ZOOMED-OUT full-stage view ("zoom out look so cool").
//  - FOV punch halved (bass*4.5 -> bass*2.2) and hard-clamped to [46, 62] so
//    heavy bass can no longer collapse the framing into a tight zoom-in.
//  - beatPunch is now DIRECTIONAL: it pushes the camera toward the look-target
//    along the view axis instead of blindly along world -Z. The old world-Z
//    punch jerked rear-view shots (Over-the-Shoulder) BACKWARD on every beat —
//    the "camera shakes too much when it goes back" bug (BF-10).
//  - Handheld micro-shake: amplitudes cut ~55%, frequencies lowered from
//    43/57 rad/s to 21/29 rad/s (+ slow secondary sines), bass gate raised
//    0.65 -> 0.75, and wrapped in a damped attack/decay envelope (shakeEnv)
//    so shake fades in and out smoothly instead of strobing on/off.
//  - Dutch roll halved and slowed (2.5 -> 1.7 rad/s wobble).
//  - cutToShot() now snaps camera.fov to the incoming shot's bias so hard
//    cuts cut the focal length too (no zoom-smear between shots).
//  - 3 NEW wide shots (WIDE_ESTABLISHING, SLOW_PULL_BACK, HIGH_WIDE_DRIFT)
//    flagged `wide: true` which receive a +0.8 selection-score bonus so wide
//    framings dominate the rotation. Tight portrait shot made rarer.

import * as THREE from 'three';
import { AudioMetrics } from './choreographer';
import { CAMERA_SHOTS_BONUS } from './cameraShotsAppendix';
import {
  selectGroupCameraShot,
  type GroupCameraSelectHints,
} from './groupCameraShots';

export type CameraMode = 'ORBIT' | 'FRONT_STAGE' | 'HERO_LOW' | 'DJ_OVERHEAD' | 'DYNAMIC_AUTO';

export interface CameraContext {
  elapsed: number;
  dt: number;
  shotBeat: number;   // beats since this shot started
  bass: number;
  mid: number;
  high: number;
  overall: number;
  isBeat: boolean;
  beatPulse: number;
  bpm: number;
}

export interface CameraShot {
  id: string;                  // 'SLOW_DOLLY_IN'
  name: string;                // 'Slow Push-In'
  energyFit: [number, number]; // 0..1 overall energy range where this shot is used
  minBars: number;             // hold at least this long (2..8)
  /** Writes into provided scratch Vector3 pos/look. Beat-reactive. ZERO allocation. */
  frame: (pos: THREE.Vector3, look: THREE.Vector3, ctx: CameraContext) => void;
  fovBias: number;             // offset added to base 50 FOV target (e.g. -4 = tighter loom)
  rollBias?: number;           // Dutch roll amount 0..0.12
  beatPunch?: number;          // extra push toward subject on beatPulse (0..0.25)
  shake?: number;              // handheld micro-shake 0..0.02 (bass drops only)
  /** V1.5: wide establishing shots get +0.8 sequencer score so the show stays zoomed-out. */
  wide?: boolean;
}

const TWO_PI = Math.PI * 2;
const PI = Math.PI;

/** V1.5 wide-by-default optics: 50deg base (was 42) — full-body + stage breathing room. */
const BASE_FOV = 50;
/** Hard clamp so bass punch can never over-zoom (min) nor fisheye (max). */
const MIN_FOV = 46;
const MAX_FOV = 62;

// V2: the 8 bonus wide "Tour Production" shots from the Grand Show Director
// pack are appended (type-only back-import in the appendix = no runtime cycle).
export const CAMERA_SHOTS: CameraShot[] = [
  // 1. Preset 1 — FRONT_STAGE (wide crowd-facing default framing)
  {
    id: 'FRONT_STAGE', name: 'Front Stage Center', energyFit: [0.0, 0.85], minBars: 4,
    fovBias: 0, rollBias: 0.03, beatPunch: 0.07, shake: 0.0,
    frame: (pos, look, c) => {
      const omega = (c.bpm / 60) * TWO_PI; // beat angular velocity
      pos.set(
        Math.sin(c.elapsed * 0.45) * 0.7,              // slow lateral drift
        1.32 + Math.sin(omega * c.elapsed * 0.25) * 0.06, // gentle breathing height
        4.55 - c.bass * 0.22                          // bass nudges camera in (subtle)
      );
      look.set(0, 0.98, 0); // full-body framing center
    },
  },
  // 2. Preset 2 — HERO_LOW (Low-angle power framing looking up at cat)
  {
    id: 'HERO_LOW', name: 'Hero Low-Angle Power', energyFit: [0.45, 1.0], minBars: 2,
    fovBias: -2, rollBias: 0.045, beatPunch: 0.12, shake: 0.008,
    frame: (pos, look, c) => {
      const sway = Math.sin(c.shotBeat * 0.25 * PI); // 4-beat slow arc around front-low
      pos.set(sway * 0.9, 0.45 + c.bass * 0.07, 3.5 - c.beatPulse * 0.15); // knee-height lens
      look.set(0, 1.05 + c.mid * 0.06, 0); // aimed up at chest & visor
    },
  },
  // 3. Preset 3 — DJ_OVERHEAD (High stage-rig crane angle looking down)
  {
    id: 'DJ_OVERHEAD', name: 'DJ Booth High Crane', energyFit: [0.30, 0.95], minBars: 4,
    fovBias: 2, rollBias: 0.02, beatPunch: 0.08, shake: 0.0,
    frame: (pos, look, c) => {
      const orbit = Math.sin(c.shotBeat * 0.125 * PI); // 8-beat wide upper sweep
      pos.set(orbit * 1.5, 2.9 + Math.cos(c.shotBeat * 0.25 * PI) * 0.15, 3.4 - c.bass * 0.18);
      look.set(0, 0.82, 0); // centered on full body & floor footwork
    },
  },
  // 4. SLOW_DOLLY_IN — Tension-building 4-bar push toward the cat (ends wide-medium)
  {
    id: 'SLOW_DOLLY_IN', name: 'Slow Cinematic Push-In', energyFit: [0.15, 0.75], minBars: 4,
    fovBias: 1, rollBias: 0.01, beatPunch: 0.05, shake: 0.0,
    frame: (pos, look, c) => {
      const prog = Math.min(1, c.shotBeat / 16.0); // 4-bar (16-beat) dolly progression
      pos.set(Math.sin(c.shotBeat * 0.25 * PI) * 0.3, 1.2 - prog * 0.1, 4.9 - prog * 1.7 - c.bass * 0.12);
      look.set(0, 1.02 + prog * 0.12, 0); // gradually rises from chest to visor
    },
  },
  // 5. CRANE_UP_REVEAL — Sweeps from sneaker soles up to high club overview over 4 bars
  {
    id: 'CRANE_UP_REVEAL', name: 'Sneaker-to-Crown Crane Reveal', energyFit: [0.25, 0.85], minBars: 4,
    fovBias: 0, rollBias: 0.02, beatPunch: 0.07, shake: 0.0,
    frame: (pos, look, c) => {
      const rise = 0.5 - 0.5 * Math.cos(Math.min(1, c.shotBeat / 16.0) * PI); // smooth cosine S-curve rise
      pos.set(Math.sin(c.shotBeat * 0.25 * PI) * 0.7, 0.25 + rise * 2.2, 3.6 + rise * 0.6);
      look.set(0, 0.45 + rise * 0.6, 0); // tracks from sneakers up to head
    },
  },
  // 6. BEAT_360_FLYAROUND — Full 360° circular orbit locked to 4-bar phrase (16 beats)
  {
    id: 'BEAT_360_FLYAROUND', name: '360° Beat-Locked Matrix Orbit', energyFit: [0.50, 1.0], minBars: 4,
    fovBias: -1, rollBias: 0.05, beatPunch: 0.11, shake: 0.008,
    frame: (pos, look, c) => {
      const angle = (c.shotBeat / 16.0) * TWO_PI; // exact 360-deg revolution every 4 bars
      const radius = 3.85 - c.bass * 0.22; // gently tightens on heavy bass
      pos.set(Math.sin(angle) * radius, 1.25 + Math.sin(angle * 2) * 0.22, Math.cos(angle) * radius);
      look.set(0, 0.92, 0);
    },
  },
  // 7. WHIP_PAN_CUT — Fast lateral slam-in during first beat that settles onto hero framing
  {
    id: 'WHIP_PAN_CUT', name: 'Whip-Pan Lateral Slam', energyFit: [0.65, 1.0], minBars: 2,
    fovBias: -2, rollBias: 0.07, beatPunch: 0.16, shake: 0.012,
    frame: (pos, look, c) => {
      const whip = Math.exp(-c.shotBeat * 3.2); // rapid exponential decay over beat 1
      pos.set(whip * 2.6 + Math.sin(c.shotBeat * 0.5 * PI) * 0.35, 1.05 - whip * 0.3, 3.5 - c.bass * 0.22);
      look.set(-whip * 0.85, 0.96, 0); // whip lag on look-at target
    },
  },
  // 8. FLOOR_FISHEYE — Ultra-low 90s Hype Williams floor lens looking straight up through sneakers
  {
    id: 'FLOOR_FISHEYE', name: '90s Hype Floor Fisheye', energyFit: [0.70, 1.0], minBars: 2,
    fovBias: -4, rollBias: 0.08, beatPunch: 0.18, shake: 0.015,
    frame: (pos, look, c) => {
      const weave = Math.sin(c.shotBeat * 0.5 * PI); // 2-beat floor weave
      pos.set(weave * 0.5, 0.18 + c.beatPulse * 0.04, 2.5 - c.bass * 0.2);
      look.set(0, 1.05, 0); // steep upward tilt toward chin & LED visor
    },
  },
  // 9. FACE_CLOSEUP — Telephoto portrait on LED visor, ears & whiskers (V1.5: rarer + pulled back)
  {
    id: 'FACE_CLOSEUP', name: 'LED Visor & Whiskers Portrait', energyFit: [0.15, 0.55], minBars: 2,
    fovBias: -2, rollBias: 0.02, beatPunch: 0.04, shake: 0.0,
    frame: (pos, look, c) => {
      const sway = Math.sin(c.shotBeat * 0.25 * PI); // subtle portrait drift
      pos.set(sway * 0.38, 1.34 + Math.cos(c.shotBeat * 0.5 * PI) * 0.04, 2.55 - c.mid * 0.12);
      look.set(0, 1.24, 0); // locked on cat head & headphones
    },
  },
  // 10. OVER_SHOULDER_DJ — Behind-the-cat perspective showing tail whip & club stage lights
  {
    id: 'OVER_SHOULDER_DJ', name: 'Over-the-Shoulder Tail & Stage View', energyFit: [0.25, 0.85], minBars: 2,
    fovBias: -1, rollBias: 0.03, beatPunch: 0.08, shake: 0.0,
    frame: (pos, look, c) => {
      const drift = Math.sin(c.shotBeat * 0.25 * PI); // 4-beat rear drift
      pos.set(1.0 + drift * 0.4, 1.55, -3.1 + c.bass * 0.18); // behind & slightly right of cat
      look.set(0, 0.95, 0.65); // looking past cat's shoulder/tail toward front stage
    },
  },
  // 11. SILHOUETTE_PROFILE — 90-degree lateral profile showcasing spine S-curves & Moonwalk/Natta lines
  {
    id: 'SILHOUETTE_PROFILE', name: 'Neon Rim-Lit Side Profile', energyFit: [0.20, 0.85], minBars: 2,
    fovBias: 0, rollBias: 0.02, beatPunch: 0.07, shake: 0.0,
    frame: (pos, look, c) => {
      const track = Math.sin(c.shotBeat * 0.25 * PI) * 0.45; // gentle front-back profile tracking
      pos.set(3.6 - c.bass * 0.18, 0.98, track); // pure 90-deg side view
      look.set(0, 0.92, 0);
    },
  },
  // 12. SIDE_TRACKING — Parallel dolly truck sliding left-to-right across front stage
  {
    id: 'SIDE_TRACKING', name: 'Lateral Dolly Truck', energyFit: [0.30, 0.90], minBars: 4,
    fovBias: 1, rollBias: 0.035, beatPunch: 0.09, shake: 0.005,
    frame: (pos, look, c) => {
      const slide = Math.sin(c.shotBeat * 0.125 * PI) * 2.0; // wide ±2m lateral slider
      pos.set(slide, 1.08 + c.bass * 0.05, 3.7 - Math.abs(slide) * 0.22);
      look.set(slide * 0.15, 0.95, 0); // subtle lead room
    },
  },
  // 13. DUTCH_HYPE — Tilted aggressive club diagonal for high-energy drops & Bhangra/Kuthu
  {
    id: 'DUTCH_HYPE', name: 'Dutch-Tilt Bass Drop Hype', energyFit: [0.70, 1.0], minBars: 2,
    fovBias: -3, rollBias: 0.09, beatPunch: 0.16, shake: 0.016,
    frame: (pos, look, c) => {
      const bounce = Math.sin(c.shotBeat * PI); // 1-beat camera pump
      pos.set(-1.0 + bounce * 0.15, 0.82 + Math.abs(bounce) * 0.1, 3.1 - c.bass * 0.24);
      look.set(0, 0.96 + c.beatPulse * 0.06, 0);
    },
  },
  // 14. SNAP_ZOOM — Crash-zoom punch on entry beat that recoils with bass transients
  {
    id: 'SNAP_ZOOM', name: 'Crash-Zoom Beat Punch', energyFit: [0.65, 1.0], minBars: 2,
    fovBias: -2, rollBias: 0.06, beatPunch: 0.18, shake: 0.012,
    frame: (pos, look, c) => {
      const snap = Math.exp(-c.shotBeat * 2.5); // starts far (5m) and crash-zooms to 3m on beat 1
      pos.set(Math.sin(c.shotBeat * 0.5 * PI) * 0.3, 1.08, 3.0 + snap * 2.0 - c.beatPulse * 0.2);
      look.set(0, 1.02, 0);
    },
  },
  // 15. TOP_DOWN — Busby Berkeley / Mandala zenith shot for spins (Chakkar, Ghoomar, Breakdance)
  {
    id: 'TOP_DOWN', name: 'Zenith Mandala Spin View', energyFit: [0.40, 0.95], minBars: 2,
    fovBias: -2, rollBias: 0.04, beatPunch: 0.1, shake: 0.0,
    frame: (pos, look, c) => {
      const rot = c.shotBeat * 0.25 * PI; // slow counter-rotation overhead
      pos.set(Math.sin(rot) * 0.5, 3.9 - c.bass * 0.2, Math.cos(rot) * 0.5);
      look.set(0, 0.75, 0);
    },
  },
  // 16. FOOTWORK_LOW_SWEEP — Sneaker-level semi-circle spotlighting Tatkar, Shuffle, and CCs
  {
    id: 'FOOTWORK_LOW_SWEEP', name: 'Sneaker-Cam Footwork Sweep', energyFit: [0.45, 0.95], minBars: 2,
    fovBias: -1, rollBias: 0.035, beatPunch: 0.13, shake: 0.007,
    frame: (pos, look, c) => {
      const arc = Math.sin(c.shotBeat * 0.25 * PI) * 1.15; // low semi-circle around high-top sneakers
      pos.set(arc, 0.34 + c.beatPulse * 0.035, 2.9 - Math.abs(arc) * 0.22);
      look.set(0, 0.58 + c.mid * 0.12, 0); // framed on knees, ankles, and lower torso
    },
  },
  // 17. WIDE_ESTABLISHING (V1.5 NEW) — Confident zoomed-out full-stage hero shot, the
  //     "zoom out look so cool" default. Calm-to-medium energy; breathing height drift.
  {
    id: 'WIDE_ESTABLISHING', name: 'Wide Stage Establishing', energyFit: [0.0, 0.8], minBars: 4,
    fovBias: 2, rollBias: 0.01, beatPunch: 0.05, shake: 0.0, wide: true,
    frame: (pos, look, c) => {
      pos.set(
        Math.sin(c.elapsed * 0.32) * 0.45,
        1.5 + Math.sin(c.elapsed * 0.3) * 0.05,
        5.35 - c.bass * 0.15
      );
      look.set(0, 0.95, 0); // cat + EQ ring + floor all in frame
    },
  },
  // 18. SLOW_PULL_BACK (V1.5 NEW) — Reverse dolly: starts medium-close and reveals the
  //     whole club over 4 bars. Cinematic "opening up" feeling for builds & breakdowns.
  {
    id: 'SLOW_PULL_BACK', name: '4-Bar Reveal Pull-Back', energyFit: [0.1, 0.7], minBars: 4,
    fovBias: 1, rollBias: 0.015, beatPunch: 0.06, shake: 0.0, wide: true,
    frame: (pos, look, c) => {
      const prog = Math.min(1, c.shotBeat / 16.0); // 4-bar (16-beat) pull-back progression
      pos.set(
        Math.sin(c.shotBeat * 0.25 * PI) * 0.35,
        1.25 + prog * 0.2,
        3.2 + prog * 2.4 - c.bass * 0.1
      );
      look.set(0, 1.0 - prog * 0.05, 0);
    },
  },
  // 19. HIGH_WIDE_DRIFT (V1.5 NEW) — Elevated slow 100-degree arc sweep over the whole
  //     stage; big music-video energy for choruses without ever crowding the cat.
  {
    id: 'HIGH_WIDE_DRIFT', name: 'High Wide Festival Drift', energyFit: [0.25, 0.9], minBars: 4,
    fovBias: 2, rollBias: 0.01, beatPunch: 0.06, shake: 0.0, wide: true,
    frame: (pos, look, c) => {
      const angle = Math.sin(c.shotBeat * 0.125 * PI) * 0.9; // ±52-degree upper arc
      pos.set(Math.sin(angle) * 4.4, 2.85 + Math.sin(c.elapsed * 0.25) * 0.1, Math.cos(angle) * 4.4 - 0.4);
      look.set(0, 0.85, 0);
    },
  },
  ...CAMERA_SHOTS_BONUS,
];

const DROP_SHOT_IDS: readonly string[] = ['WHIP_PAN_CUT', 'SNAP_ZOOM', 'FLOOR_FISHEYE', 'DUTCH_HYPE'];

function nextShotRand(stateObj: { s: number }): number {
  let t = (stateObj.s += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface CameraSequencer {
  updateAndApply: (
    camera: THREE.PerspectiveCamera,
    mode: CameraMode,
    metrics: AudioMetrics,
    beatCount: number,
    phase: number,
    dt: number,
    elapsed: number
  ) => void;
  getActiveShotId: () => string;
  getActiveShotName: () => string;
  /** V2 group crew framing: widens FOV and pulls the camera back so 2-4
      dancers always fit the frame. n = number of dancers on stage. */
  setGroupBias: (dancerCount: number) => void;
  /** V3: while a crew of 2+ dances, shot cuts come from the 16 multi-dancer
      GROUP_CAMERA_SHOTS via the package's formation-aware pairing selector
      (garba ring → overhead mandala, duets → contact-axis two-shot, …).
      Pass null to return to the solo 27-shot pool. The hints object is a
      STABLE module-scratch the caller mutates in place (zero alloc). */
  setGroupHints: (hints: GroupCameraSelectHints | null) => void;
}

export function createCameraSequencer(seed = 7777): CameraSequencer {
  const rng = { s: seed >>> 0 };
  const recentShots: string[] = ['', '', '', '']; // recency window of 4 shots
  let recentIdx = 0;

  const frontStage = CAMERA_SHOTS[0];
  const heroLow = CAMERA_SHOTS[1];
  const djOverhead = CAMERA_SHOTS[2];

  let activeShot: CameraShot = frontStage;
  let shotStartPhase = 0;
  let plannedShotBars = 4;
  let lastShotIntBar = 0;
  // V2 group framing bias: +1.5 deg FOV and +0.45 m pull-back per extra dancer
  let groupFovBias = 0;
  let groupPullback = 0;
  // V1.5 drop detection: a "drop" is an energy JUMP above the song's own
  // slow-moving baseline — NOT absolute bass (loud 808 kicks pin the bass
  // band at 0.9-1.0 on nearly every beat of modern music, which made the old
  // `bass > 0.85` crash-cut trigger fire every single bar — the camera cut
  // spam the user reported). Pacing: crash cuts at most once per 2 bars and
  // never within the first bar of a shot.
  let dropBeats = 0; // consecutive "drop-like" beats
  let energyBaseline = 0; // slow damped baseline of overall energy
  let lastCrashBeat = -99; // beatCount at the last bass-drop crash cut
  let beatPulseVal = 0;
  // V1.5: damped shake envelope so handheld micro-shake fades in/out smoothly
  let shakeEnv = 0;
  // V3: live group hints (stable object mutated by the stage integrator)
  let groupHints: GroupCameraSelectHints | null = null;

  // Pre-allocated scratch vectors & context (ZERO per-frame allocation)
  const _camPosTarget = new THREE.Vector3(0, 1.32, 4.55);
  const _camLookTarget = new THREE.Vector3(0, 0.98, 0);
  const _punchDir = new THREE.Vector3(); // V1.5: directional beat-punch axis
  const ctx: CameraContext = {
    elapsed: 0, dt: 0.016, shotBeat: 0,
    bass: 0, mid: 0, high: 0, overall: 0,
    isBeat: false, beatPulse: 0, bpm: 120,
  };

  function isShotRecent(id: string): boolean {
    for (let i = 0; i < 4; i++) {
      if (recentShots[i] === id) return true;
    }
    return false;
  }

  function pushRecentShot(id: string): void {
    recentShots[recentIdx] = id;
    recentIdx = (recentIdx + 1) % 4;
  }

  function pickNextShot(m: AudioMetrics, isDrop: boolean): CameraShot {
    // V3 GROUP CREW: formation-aware pairing selector — 16 multi-dancer
    // shots (contact-axis two-shots, mirror-symmetry axis, canon ripple
    // truck, overhead mandala, huddle-burst snap, …).
    if (groupHints !== null) {
      return selectGroupCameraShot(groupHints);
    }
    if (isDrop) {
      for (let i = 0; i < DROP_SHOT_IDS.length; i++) {
        const idx = Math.floor(nextShotRand(rng) * DROP_SHOT_IDS.length) % DROP_SHOT_IDS.length;
        const dropId = DROP_SHOT_IDS[idx];
        if (dropId !== activeShot.id) {
          for (let j = 0; j < CAMERA_SHOTS.length; j++) {
            if (CAMERA_SHOTS[j].id === dropId) return CAMERA_SHOTS[j];
          }
        }
      }
    }

    let best: CameraShot = frontStage;
    let bestScore = -999;
    for (let i = 0; i < CAMERA_SHOTS.length; i++) {
      const s = CAMERA_SHOTS[i];
      if (s.id === activeShot.id) continue;
      let score = nextShotRand(rng) * 0.4;
      if (!isShotRecent(s.id)) score += 3.5;
      else score -= 3.5;
      if (m.overall >= s.energyFit[0] && m.overall <= s.energyFit[1]) score += 2.5;
      else score -= 2.0;
      if (s.wide) score += 0.8; // V1.5: keep the show zoomed-out by default
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  function cutToShot(next: CameraShot, phase: number, camera: THREE.PerspectiveCamera): void {
    activeShot = next;
    shotStartPhase = phase;
    plannedShotBars = next.minBars + Math.floor(nextShotRand(rng) * 5); // hold minBars .. minBars+4
    lastShotIntBar = 0;
    pushRecentShot(next.id);

    // Music-video hard cut on shot transition: snap camera position AND focal
    // length immediately to the new framing (V1.5: FOV snaps too — no zoom smear)
    ctx.shotBeat = 0;
    next.frame(_camPosTarget, _camLookTarget, ctx);
    camera.position.copy(_camPosTarget);
    camera.lookAt(_camLookTarget);
    camera.fov = THREE.MathUtils.clamp(BASE_FOV + next.fovBias, MIN_FOV, MAX_FOV);
    camera.updateProjectionMatrix();
  }

  return {
    updateAndApply(
      camera: THREE.PerspectiveCamera,
      mode: CameraMode,
      metrics: AudioMetrics,
      beatCount: number,
      phase: number,
      dt: number,
      elapsed: number
    ): void {
      // Respect user ORBIT mode completely — pause sequencer & leave camera untouched
      if (mode === 'ORBIT') return;

      if (metrics.isBeat) beatPulseVal = 1.0;
      else beatPulseVal *= Math.exp(-dt * 25.0);

      ctx.elapsed = elapsed;
      ctx.dt = dt;
      ctx.bass = metrics.bass;
      ctx.mid = metrics.mid;
      ctx.high = metrics.high;
      ctx.overall = metrics.overall;
      ctx.isBeat = metrics.isBeat;
      ctx.beatPulse = beatPulseVal;
      ctx.bpm = metrics.bpm > 0 ? metrics.bpm : 120;

      // Resolve fixed preset vs DYNAMIC_AUTO sequencer
      if (mode === 'FRONT_STAGE') activeShot = frontStage;
      else if (mode === 'HERO_LOW') activeShot = heroLow;
      else if (mode === 'DJ_OVERHEAD') activeShot = djOverhead;
      else {
        // DYNAMIC_AUTO mode: track energy-jump drops & bar boundaries
        // V1.5: baseline chases overall energy with a ~1.4 s time constant,
        // so a real drop (extra kicks/hats/energy) reads as a sustained jump
        // ABOVE the song's own recent level, while a merely-loud-but-steady
        // section converges to its baseline and stops triggering.
        energyBaseline = THREE.MathUtils.damp(
          energyBaseline,
          metrics.overall,
          0.7,
          dt
        );
        const isDropish =
          metrics.bass > 0.8 && metrics.overall > energyBaseline + 0.055;
        if (metrics.isBeat) {
          if (isDropish) dropBeats++;
          else dropBeats = 0;
        }

        const shotBeat = Math.max(0, (phase - shotStartPhase) / TWO_PI);
        const shotBar = shotBeat * 0.25;
        ctx.shotBeat = shotBeat;

        // Bass-drop crash cut — fires only when ALL pacing gates pass:
        //   1. 2+ consecutive drop-like beats (a real drop, not a transient)
        //   2. at least 4 beats (1 bar) into the current shot (anti-strobe)
        //   3. at least 8 beats (2 bars) since the last crash cut (phrase
        //      pacing — drops get ONE punctuation cut, never a strobe)
        //   V3: solo-only — group mode uses the package's pairing selector.
        if (
          groupHints === null &&
          metrics.isBeat &&
          dropBeats >= 2 &&
          shotBeat >= 4 &&
          beatCount - lastCrashBeat >= 8
        ) {
          dropBeats = 0;
          lastCrashBeat = beatCount;
          cutToShot(pickNextShot(metrics, true), phase, camera);
        } else {
          const intBar = Math.floor(shotBar);
          if (intBar > lastShotIntBar) {
            lastShotIntBar = intBar;
            if (intBar >= plannedShotBars) {
              cutToShot(pickNextShot(metrics, false), phase, camera);
            }
          }
        }
      }

      ctx.shotBeat = Math.max(0, (phase - shotStartPhase) / TWO_PI);

      // 1. Evaluate active shot into pre-allocated scratch vectors
      activeShot.frame(_camPosTarget, _camLookTarget, ctx);

      // 2. V1.5 DIRECTIONAL beat-punch: push the camera toward the subject along
      //    the view axis (old world-Z punch shoved rear shots backward every beat)
      const punch = (activeShot.beatPunch ?? 0.07) * beatPulseVal;
      if (punch > 0.0001) {
        _punchDir.subVectors(_camLookTarget, _camPosTarget);
        const axisLen = _punchDir.length() || 1;
        _punchDir.multiplyScalar(punch / axisLen);
        _camPosTarget.add(_punchDir);
      }

      // V1.5 smooth handheld micro-shake: damped envelope (attack/decay ~200ms)
      // instead of instant on/off, lower frequencies, higher bass gate.
      const shakeTarget =
        (activeShot.shake ?? 0) * Math.max(0, metrics.bass - 0.75) * 4.0;
      shakeEnv = THREE.MathUtils.damp(shakeEnv, shakeTarget, 5, dt);
      if (shakeEnv > 0.0005) {
        const sx =
          Math.sin(elapsed * 21.0) + Math.sin(elapsed * 13.7) * 0.5; // organic drift
        const sy = Math.cos(elapsed * 29.0) + Math.cos(elapsed * 17.3) * 0.5;
        _camPosTarget.x += sx * shakeEnv;
        _camPosTarget.y += sy * shakeEnv * 0.7;
      }

      // 3. Beat-reactive FOV punch (V1.5: halved + hard-clamped — no over-zoom)
      //    V2: group bias widens the whole band so the full crew stays framed.
      const targetFov = THREE.MathUtils.clamp(
        BASE_FOV + groupFovBias + activeShot.fovBias - metrics.bass * 2.2 - (metrics.isBeat ? 0.9 : 0),
        MIN_FOV + groupFovBias * 0.5,
        MAX_FOV + groupFovBias
      );
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 14, dt);
      camera.updateProjectionMatrix();

      // 3.5 V2 group pull-back: push the camera away from the look target
      //     along the view axis so multi-dancer formations always fit.
      if (groupPullback > 0.001) {
        _punchDir.subVectors(_camPosTarget, _camLookTarget);
        const pl = _punchDir.length() || 1;
        _punchDir.multiplyScalar((pl + groupPullback) / pl);
        _camPosTarget.copy(_camLookTarget).add(_punchDir);
      }

      // TEMP V5 DEBUG (remove before ship): ?divacam= locks a QA camera on
      // the solo Diva regardless of the active shot.
      if (
        typeof window !== 'undefined' &&
        window.location.search.includes('divacam')
      ) {
        if (window.location.search.includes('divacam=face')) {
          // follow the live head bone (exported by the girl component)
          const hy = (window as unknown as { __divaHeadY?: number }).__divaHeadY ?? 1.78;
          _camPosTarget.set(0.16, hy + 0.02, 0.66);
          _camLookTarget.set(0, hy, 0.1);
        } else {
          const hy = (window as unknown as { __divaHeadY?: number }).__divaHeadY ?? 1.0;
          _camPosTarget.set(0.62, hy + 0.14, 2.75);
          _camLookTarget.set(0, hy - 0.42, 0);
        }
      }

      // 4. Smooth position tracking & lookAt
      camera.position.lerp(_camPosTarget, 1 - Math.exp(-6 * dt));
      camera.lookAt(_camLookTarget);

      // 5. Subtle Dutch-angle roll on heavy bass + shot rollBias (V1.5: halved,
      //    slower wobble — flavorful, never nauseating)
      const rollAmp =
        (activeShot.rollBias ?? 0.05) +
        (metrics.overall > 0.6 ? metrics.bass * 0.03 : 0);
      const targetRoll = Math.sin(elapsed * 1.7) * rollAmp;
      camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, targetRoll, 8, dt);
    },

    getActiveShotId(): string {
      return activeShot.id;
    },

    getActiveShotName(): string {
      return activeShot.name;
    },

    setGroupBias(dancerCount: number): void {
      const extra = Math.max(0, Math.min(3, dancerCount - 1));
      groupFovBias = extra * 1.5;
      groupPullback = extra * 0.45;
    },

    setGroupHints(hints: GroupCameraSelectHints | null): void {
      groupHints = hints;
    },
  };
}
