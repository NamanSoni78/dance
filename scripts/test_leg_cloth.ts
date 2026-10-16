// scripts/test_leg_cloth.ts
// V6 BF-30 offline verification of the leg-vs-skirt collision contract.
//
// PART A — CAPSULE COVERAGE INVARIANT: reconstructs the DivaBody thigh/shin
// mesh radius envelopes (makeThighSurface / makeShinSurface dominant terms,
// including the quadriceps/calf flex scales from solveLeg and the boot
// shaft offset) and asserts the cloth collision capsules (+ the solver's
// CLOTH_SURFACE_MARGIN) fully enclose the worst-case flexed leg surface.
// The old 0.079 m thigh capsule cleared the flexed mesh by ~2 mm — this
// test pins the new 0.083 m contract.
//
// PART B — FAST-KICK CLOTH DRILL: drives SkirtClothSim through 3.5 s of
// aggressive choreography (alternating 0.2 s fast kicks, a deep squat, a
// 2-pi/s spin) with FRESH per-step capsules (the post-BF-30 runtime
// behavior) and asserts that after every solve no cloth particle sits
// deeper than 2.5 mm inside any leg capsule, the hem stays a sane flared
// cone, and nothing NaNs.

import { SkirtClothSim, SKIRT_COLS, SKIRT_ROWS, SKIRT_PARTICLE_COUNT } from '../src/lib/girlCloth';

const THIGH = 0.43;
const SHIN = 0.42;
const HIP_X = 0.087;
const HIP_DY = -0.09;
const CLOTH_SURFACE_MARGIN = 0.017;
const THIGH_CAPSULE_R = 0.086; // BF-30 (was 0.079)
const SHIN_CAPSULE_R = 0.054;
const HIP_BALL_R = 0.095; // BF-30 (was 0.088)
const THIGH_FLEX_MAX = 1.045; // solveLeg: 1 + kneeBendFactor * 0.045
const CALF_FLEX_MAX = 1.06; // 1 + kneeBend*0.035 + footPitch(0.38)*0.06
const BOOT_OFFSET = 0.0048; // boot shaft rides 4.8 mm off the shin surface

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    console.error(`  FAIL  ${msg}`);
  }
}

function bell(v: number, c: number, w: number): number {
  const t = (v - c) / w;
  return Math.exp(-0.5 * t * t);
}

// ---- PART A: capsule coverage invariant ------------------------------------

function thighMeshMaxRadius(): number {
  // rx = base + vmo + vastusLateralis + adductor (all lateral/medial, peak
  // at disjoint v so per-v max = base + largest single bulge)
  // rz = base * 1.05 + rectusFemoris + hamstring
  let max = 0;
  let maxAt = 0;
  for (let i = 0; i <= 400; i++) {
    const v = i / 400;
    const base =
      0.047 + 0.032 * Math.pow(v, 0.82) + 0.005 * bell(v, 0.66, 0.22);
    const bulges = [
      0.0052 * bell(v, 0.24, 0.13), // VMO teardrop
      0.0058 * bell(v, 0.58, 0.24), // vastus lateralis
      0.0065 * bell(v, 0.78, 0.22), // adductor fullness
    ];
    const rx = base + Math.max(...bulges);
    const rz = base * 1.05 + 0.0075 * Math.sin(v * Math.PI) + 0.0092 * bell(v, 0.56, 0.25);
    const r = Math.max(rx, rz);
    if (r > max) {
      max = r;
      maxAt = v;
    }
  }
  return max;
}

function shinMeshMaxRadius(): number {
  let max = 0;
  for (let i = 0; i <= 400; i++) {
    const v = i / 400;
    const base =
      0.0265 + 0.0175 * Math.pow(v, 0.88) + 0.0075 * bell(v, 0.66, 0.18);
    const gastroc = 0.0145 * bell(v, 0.64, 0.17);
    const r = base + gastroc;
    if (r > max) max = r;
  }
  return max;
}

function bootShaftMaxRadius(): number {
  // boot shaft = shin surface over v in [0, 0.44] + BOOT_OFFSET, scaled by
  // the calf flex
  let max = 0;
  for (let i = 0; i <= 200; i++) {
    const v = (i / 200) * 0.44;
    const base =
      0.0265 + 0.0175 * Math.pow(v, 0.88) + 0.0075 * bell(v, 0.66, 0.18);
    const gastroc = 0.0145 * bell(v, 0.64, 0.17);
    const r = base + gastroc + BOOT_OFFSET;
    if (r > max) max = r;
  }
  return max;
}

console.log('PART A — capsule coverage invariant (BF-30)');
{
  const thighWorst = thighMeshMaxRadius() * THIGH_FLEX_MAX;
  const thighClear = THIGH_CAPSULE_R + CLOTH_SURFACE_MARGIN - thighWorst;
  console.log(
    `  thigh mesh worst-case radius x flex = ${thighWorst.toFixed(4)} m; capsule+margin = ${(
      THIGH_CAPSULE_R + CLOTH_SURFACE_MARGIN
    ).toFixed(4)} m; clearance = ${(thighClear * 1000).toFixed(1)} mm`
  );
  check(
    thighClear >= 0.005,
    `thigh capsule must clear the flexed mesh by >= 5 mm (got ${(thighClear * 1000).toFixed(1)} mm)`
  );

  const shinWorst = shinMeshMaxRadius() * CALF_FLEX_MAX;
  const shinClear = SHIN_CAPSULE_R + CLOTH_SURFACE_MARGIN - shinWorst;
  console.log(
    `  shin mesh worst-case radius x flex = ${shinWorst.toFixed(4)} m; capsule+margin = ${(
      SHIN_CAPSULE_R + CLOTH_SURFACE_MARGIN
    ).toFixed(4)} m; clearance = ${(shinClear * 1000).toFixed(1)} mm`
  );
  check(
    shinClear >= 0.003,
    `shin capsule must clear the flexed calf by >= 3 mm (got ${(shinClear * 1000).toFixed(1)} mm)`
  );

  const bootWorst = bootShaftMaxRadius() * CALF_FLEX_MAX;
  const bootClear = SHIN_CAPSULE_R + CLOTH_SURFACE_MARGIN - bootWorst;
  console.log(
    `  boot shaft worst-case radius x flex = ${bootWorst.toFixed(4)} m; clearance = ${(
      bootClear * 1000
    ).toFixed(1)} mm`
  );
  check(
    bootClear >= 0.003,
    `shin capsule must clear the boot shaft by >= 3 mm (got ${(bootClear * 1000).toFixed(1)} mm)`
  );

  const hipBallClear = HIP_BALL_R - THIGH_CAPSULE_R;
  check(
    hipBallClear >= 0.005,
    'hip ball must be wider than the thigh capsule (upper-thigh coverage)'
  );
}

// ---- PART B: fast-kick cloth drill with fresh capsules ----------------------

// Column-major 4x4 waist matrix (translation + Y rotation only — matches the
// girlCloth Matrix4Like contract).
function waistMatrix(x: number, y: number, z: number, rotY: number): Float32Array {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const m = new Float32Array(16);
  m[0] = c; m[1] = 0; m[2] = -s; m[3] = 0;
  m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
  m[8] = s; m[9] = 0; m[10] = c; m[11] = 0;
  m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
  return m;
}

function distToSegment(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (lenSq > 1e-9) {
    t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
  return Math.hypot(px - cx, py - cy, pz - cz);
}

console.log('PART B — fast-kick cloth drill (fresh capsules, 120 Hz)');
{
  const sim = new SkirtClothSim();
  const capsules = new Float32Array(42);
  const PELVIS_BASE_Y = 0.99;
  const dt = 1 / 120;
  const steps = Math.round(3.5 / dt);

  let worstPenetration = 0;
  let worstStep = -1;
  let maxHemY = 0;
  let minHemY = Infinity;
  let maxHemRadius = 0;

  // Two-link leg pose from scripted channels (mirrors the bridge math).
  const legPose = (side: number, t: number) => {
    // Alternating fast kicks: 0.2 s swing to 1.15 rad and back
    const kickCycle = (t * 2.5) % 1; // 0.4 s period per leg pair
    const legPhase = kickCycle + (side < 0 ? 0.5 : 0);
    const swing = legPhase % 1;
    const kick =
      swing < 0.5
        ? Math.sin((swing / 0.5) * Math.PI) ** 1.6
        : 0;
    const thighPitch = kick * 1.15; // rad from vertical
    // Knee bends as the thigh swings up (soft-knee behavior)
    const kneeBend = kick * 1.5;
    const abduction = 0.06 + kick * 0.10;
    // Deep squat overlay between t=1.2..2.2
    const squat =
      t > 1.2 && t < 2.2 ? Math.sin(((t - 1.2) / 1.0) * Math.PI) * 0.17 : 0;
    return { thighPitch, kneeBend, abduction, squat, kick };
  };

  for (let step = 0; step < steps; step++) {
    const t = step * dt;
    const spin = t < 1.2 ? 0 : Math.min((t - 1.2) * 2.5, 6.283); // 2-pi/s spin after 1.2 s
    const c = Math.cos(spin);
    const s = Math.sin(spin);

    // Waist / pelvis (spin + squat lives in pelvis Y)
    const squatNow =
      t > 1.2 && t < 2.2 ? Math.sin(((t - 1.2) / 1.0) * Math.PI) * 0.17 : 0;
    const pelvisY = PELVIS_BASE_Y - squatNow;
    const waist = waistMatrix(0, pelvisY, 0, spin);

    for (let legIdx = 0; legIdx < 2; legIdx++) {
      const side = legIdx === 0 ? 1 : -1;
      const pose = legPose(side, t);

      // Hip in world (pelvis unrotated locally; spin rotates the whole rig)
      const hxLocal = side * HIP_X;
      const hyLocal = pelvisY + HIP_DY;
      const hipX = hxLocal * c;
      const hipY = hyLocal;
      const hipZ = -hxLocal * s;

      // Thigh direction: pitch forward + abduction, then spin-rotated
      const tp = pose.thighPitch;
      const ab = pose.abduction;
      const thighDirLocal = new Float32Array([
        Math.sin(ab),
        -Math.cos(tp) * Math.cos(ab),
        Math.sin(tp) * Math.cos(ab),
      ]);
      // Spin rotation about Y of the local direction vector
      const kx = thighDirLocal[0] * c + thighDirLocal[2] * s;
      const ky = thighDirLocal[1];
      const kz = -thighDirLocal[0] * s + thighDirLocal[2] * c;
      const kneeXr = hipX + kx * THIGH;
      const kneeYr = hipY + ky * THIGH;
      const kneeZr = hipZ + kz * THIGH;

      // Shin direction: knee bends the shin backward relative to the thigh
      const kb = pose.kneeBend;
      const shinPitchLocal = tp - kb;
      const shinDirLocal = new Float32Array([
        thighDirLocal[0] * 0.5,
        -Math.cos(shinPitchLocal) * 0.87,
        Math.sin(shinPitchLocal) * 0.87,
      ]);
      const ax = shinDirLocal[0] * c + shinDirLocal[2] * s;
      const ay = shinDirLocal[1];
      const az = -shinDirLocal[0] * s + shinDirLocal[2] * c;
      const ankleX = kneeXr + ax * SHIN;
      const ankleY = kneeYr + ay * SHIN;
      const ankleZ = kneeZr + az * SHIN;

      const o = legIdx * 21;
      capsules[o] = hipX; capsules[o + 1] = hipY; capsules[o + 2] = hipZ;
      capsules[o + 3] = kneeXr; capsules[o + 4] = kneeYr; capsules[o + 5] = kneeZr;
      capsules[o + 6] = THIGH_CAPSULE_R;
      capsules[o + 7] = kneeXr; capsules[o + 8] = kneeYr; capsules[o + 9] = kneeZr;
      capsules[o + 10] = ankleX; capsules[o + 11] = ankleY; capsules[o + 12] = ankleZ;
      capsules[o + 13] = SHIN_CAPSULE_R;
      capsules[o + 14] = hipX; capsules[o + 15] = hipY; capsules[o + 16] = hipZ;
      capsules[o + 17] = hipX; capsules[o + 18] = hipY; capsules[o + 19] = hipZ;
      capsules[o + 20] = HIP_BALL_R;
    }

    sim.update(
      dt,
      waist,
      capsules,
      t > 1.2 ? 6.283 : 0, // spin velocity for centrifugal flare
      0.5, // bass
      0.4, // high
      t,
      0.5 // beat pulse
    );

    // Post-solve penetration audit. Steps 0-1 are skipped: the very first
    // update() early-returns on resetToMatrix (particles still at the rest
    // cone, which legitimately starts inside the hip guards) and the second
    // is the first real solve — auditing from step 2 measures the steady
    // solver contract, not the initialization transient.
    if (step < 2) continue;
    const pos = sim.positions;
    for (let i = SKIRT_COLS; i < SKIRT_PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      for (let capIdx = 0; capIdx < 6; capIdx++) {
        const c7 = capIdx * 7;
        const dist = distToSegment(
          pos[i3], pos[i3 + 1], pos[i3 + 2],
          capsules[c7], capsules[c7 + 1], capsules[c7 + 2],
          capsules[c7 + 3], capsules[c7 + 4], capsules[c7 + 5]
        );
        const pen = capsules[c7 + 6] + CLOTH_SURFACE_MARGIN - dist;
        if (pen > worstPenetration) {
          worstPenetration = pen;
          worstStep = step;
        }
      }
    }

    // Hem sanity (row 6)
    for (let col = 0; col < SKIRT_COLS; col++) {
      const i3 = ((SKIRT_ROWS - 1) * SKIRT_COLS + col) * 3;
      const y = pos[i3 + 1];
      const r = Math.hypot(pos[i3] - waist[12], pos[i3 + 2] - waist[14]);
      if (y > maxHemY) maxHemY = y;
      if (y < minHemY) minHemY = y;
      if (r > maxHemRadius) maxHemRadius = r;
      if (!Number.isFinite(y) || !Number.isFinite(r)) {
        failures++;
        console.error(`  FAIL  NaN in hem at step ${step}`);
        break;
      }
    }
  }

  console.log(
    `  worst post-solve penetration: ${(worstPenetration * 1000).toFixed(2)} mm (step ${worstStep}); hem y in [${minHemY.toFixed(2)}, ${maxHemY.toFixed(
      2
    )}] m; max hem radius ${maxHemRadius.toFixed(2)} m`
  );
  check(
    worstPenetration <= 0.0025,
    `post-solve capsule penetration must stay <= 2.5 mm (got ${(worstPenetration * 1000).toFixed(2)} mm)`
  );
  check(minHemY >= 0.02, 'hem must stay above the floor clamp');
  check(maxHemY < 0.95, 'hem must stay below the waist (no collapse)');
  check(
    maxHemRadius > 0.25 && maxHemRadius < 0.85,
    'hem must hold a sane flared cone radius'
  );
}

if (failures > 0) {
  console.error(`\nLEG-CLOTH TEST: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nLEG-CLOTH TEST: ALL CHECKS PASS');
