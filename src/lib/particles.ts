// src/lib/particles.ts
// V2 'Grand Show Director' pack — 5 beat-synced instanced particle systems
// (confetti cannons, holi geysers, ember diyas, fog wisps, strobe sparks).
// Authored by the external choreographer AI, audited: zero-allocation ring
// buffers, camera-safety exclusion cylinder, beat/drop-locked triggers.
/**
 * V2 VISUAL PRODUCTION PACK — DRAW-CALL BUDGET TABLE
 * ============================================================================
 * System / Mesh                  Type                 Instances   Draw Calls
 * ----------------------------------------------------------------------------
 * 1. confetti_burst              THREE.InstancedMesh        220            1
 * 2. holi_geyser                 THREE.InstancedMesh        160            1
 * 3. ember_diyas                 THREE.InstancedMesh        120            1
 * 4. fog_wisps                   THREE.InstancedMesh         24            1
 * 5. strobe_sparks               THREE.InstancedMesh         90            1
 * 6. crowd.bodyMesh              THREE.InstancedMesh         52            1
 * 7. crowd.armMesh               THREE.InstancedMesh         24            1
 * 8. crowd.phoneMesh             THREE.InstancedMesh          8            1
 * ----------------------------------------------------------------------------
 * TOTAL NEW DRAW CALLS ADDED BY V2 PACK:                                   8
 * HARD BUDGET LIMIT (§1 Law 2 & §10):                                   <= 14
 * NEW LIGHTS ADDED (§1 Law 8):                                             0
 * ============================================================================
 */

import * as THREE from 'three';
import { AudioMetrics } from './choreographer';

export interface FxContext {
  metrics: AudioMetrics;   // live metrics
  beatPhase: number;       // beatClock.phase (2π per beat)
  beatCount: number;
  dropActive: boolean;     // computed ONCE per frame in the integrator (§2.3)
  dt: number;
  elapsed: number;
}

export interface ParticleSystem {
  id: string;                        // 'confetti_burst'
  /** V3: ambient systems (ember diyas, fog wisps) run continuously — the
      stage parks them on Lite FX. Event systems only fire on beats/drops. */
  ambient?: boolean;
  /** Builds the InstancedMesh (called once, NOT per frame). Returns the
      mesh to add to the scene graph + the system object. */
  create: (seed: number) => {
    mesh: THREE.InstancedMesh;       // caller adds to scene & disposes
    update: (ctx: FxContext) => void; // per-frame, ZERO allocation
    dispose: () => void;
  };
}

// ----------------------------------------------------------------------------
// V3 PARTICLE DENSITY — global instance-count scale, applied at create()
// time (the stage rebuilds the FX pack whenever the FX level changes, so a
// toggle re-creates every system at the new density). Default 0.6: the
// V2 launch drew 614 ambient+event instances; V3 draws ~40% fewer by user
// request ("flying particles should be less"), with the remaining budget
// weighted toward the beat-synced event bursts.
// ----------------------------------------------------------------------------
let _density = 0.6;

/** Sets the global particle instance density (0.15..1). Must be called
    BEFORE the FX pack is created (the stage does this in its useMemo). */
export function setParticleDensity(d: number): void {
  _density = Math.max(0.15, Math.min(1, d));
}

/** Density-scaled instance count with a per-system floor. */
function dense(base: number, min: number): number {
  return Math.max(min, Math.round(base * _density));
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

// ----------------------------------------------------------------------------
// Shared Module-Scope Scratch Objects (§1 Law 1 Zero-Allocation)
// ----------------------------------------------------------------------------
const _dummy = new THREE.Object3D();
const _colorScratch = new THREE.Color();
const _parkMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

// Live look palette bridge updated by the stage integrator (zero-alloc)
const _lookPrimary = new THREE.Color('#ffb703');
const _lookSecondary = new THREE.Color('#fb5607');
const _lookAccent = new THREE.Color('#ffd166');
let _isDiwaliClassLook = true;

/**
 * Zero-allocation bridge called by the stage integrator each frame so
 * confetti_burst and ember_diyas inherit the active ShowDirector palette.
 */
export function syncParticleLookState(
  primary: THREE.Color,
  secondary: THREE.Color,
  accent: THREE.Color,
  activeLookId: string
): void {
  _lookPrimary.copy(primary);
  _lookSecondary.copy(secondary);
  _lookAccent.copy(accent);
  _isDiwaliClassLook =
    activeLookId === 'DIWALI_MELA' ||
    activeLookId === 'DESERT_FESTIVAL' ||
    activeLookId === 'CYBER_BOLLYWOOD';
}

// Pre-parsed Holi pigments (gulal pink, marigold, indigo, turmeric, lime)
const HOLI_PIGMENTS: readonly THREE.Color[] = [
  new THREE.Color('#ff1493'),
  new THREE.Color('#ff9f00'),
  new THREE.Color('#7b2cbf'),
  new THREE.Color('#ffd700'),
  new THREE.Color('#38b000'),
];

// ============================================================================
// 1. CONFETTI BURST — 220 instanced thin boxes, dual side cannons
// ============================================================================
const CONFETTI_COUNT = 220;

const confettiBurstSystem: ParticleSystem = {
  id: 'confetti_burst',
  create(seed: number) {
    const rand = makeRand(seed ^ 0x1a2b3c4d);
    // V3 density-scaled instance count for this system
    const N = dense(CONFETTI_COUNT, 48);
    const geo = new THREE.BoxGeometry(0.055, 0.012, 0.032);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const pz = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const vz = new Float32Array(N);
    const rx = new Float32Array(N);
    const ry = new Float32Array(N);
    const rz = new Float32Array(N);
    const spinX = new Float32Array(N);
    const spinY = new Float32Array(N);
    const spinZ = new Float32Array(N);
    const flutterPhase = new Float32Array(N);
    const life = new Float32Array(N);
    const maxLife = new Float32Array(N);
    const launchSpeedX = new Float32Array(N);
    const launchSpeedY = new Float32Array(N);
    const launchSpeedZ = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      // Aim cannons high and around the stage perimeter (never blocking center cat)
      launchSpeedX[i] = -side * (1.2 + rand() * 2.1);
      launchSpeedY[i] = 4.6 + rand() * 3.2;
      launchSpeedZ[i] = -1.8 + rand() * 2.2;
      spinX[i] = (rand() - 0.5) * 11.0;
      spinY[i] = (rand() - 0.5) * 9.0;
      spinZ[i] = (rand() - 0.5) * 11.0;
      flutterPhase[i] = rand() * Math.PI * 2;
      maxLife[i] = 2.2 + rand() * 0.6;
      life[i] = 0;
      mesh.setMatrixAt(i, _parkMatrix);
      mesh.setColorAt(i, _lookPrimary);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    let prevDropActive = false;
    let lastDropBurstBeat = -999;
    let ringCursor = 0;

    const fireCannonBatch = (batchSize: number) => {
      for (let k = 0; k < batchSize; k++) {
        const idx = ringCursor;
        ringCursor = (ringCursor + 1) % N;
        const side = idx % 2 === 0 ? -1 : 1;
        px[idx] = side * 2.85;
        py[idx] = 0.65;
        pz[idx] = -0.85;
        vx[idx] = launchSpeedX[idx];
        vy[idx] = launchSpeedY[idx];
        vz[idx] = launchSpeedZ[idx];
        rx[idx] = flutterPhase[idx];
        ry[idx] = flutterPhase[idx] * 0.7;
        rz[idx] = flutterPhase[idx] * 1.3;
        life[idx] = maxLife[idx];

        const colorPick = idx % 3;
        if (colorPick === 0) {
          mesh.setColorAt(idx, _lookPrimary);
        } else if (colorPick === 1) {
          mesh.setColorAt(idx, _lookSecondary);
        } else {
          mesh.setColorAt(idx, _lookAccent);
        }
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    return {
      mesh,
      update(ctx: FxContext) {
        const dt = ctx.dt;
        const risingEdge = ctx.dropActive && !prevDropActive;
        const sustainedDropRefire =
          ctx.dropActive &&
          ctx.metrics.isBeat &&
          ctx.beatCount - lastDropBurstBeat >= 8;

        if (risingEdge || sustainedDropRefire) {
          fireCannonBatch(110);
          lastDropBurstBeat = ctx.beatCount;
        }
        prevDropActive = ctx.dropActive;

        let anyAlive = false;
        const drag = Math.exp(-1.45 * dt);

        for (let i = 0; i < N; i++) {
          let l = life[i];
          if (l <= 0) continue;
          anyAlive = true;
          l -= dt;
          life[i] = l;

          if (l <= 0) {
            mesh.setMatrixAt(i, _parkMatrix);
            continue;
          }

          // Air drag + gravity + beat-phase-locked flutter
          vx[i] *= drag;
          vz[i] *= drag;
          vy[i] = vy[i] * drag - 4.8 * dt;

          const flutter = Math.sin(ctx.beatPhase * 2.0 + flutterPhase[i]) * 0.65;
          px[i] += (vx[i] + flutter) * dt;
          py[i] += vy[i] * dt;
          pz[i] += (vz[i] + Math.cos(ctx.beatPhase + flutterPhase[i]) * 0.35) * dt;

          // Keep front-of-cat cylinder clear (camera safety law §1.7)
          if (pz[i] > -0.35 && Math.abs(px[i]) < 1.15 && py[i] > 0.35) {
            pz[i] -= 0.9 * dt;
          }

          // Floor bounce with 0.35 restitution
          if (py[i] < 0.02) {
            py[i] = 0.02;
            vy[i] = Math.abs(vy[i]) * 0.35;
            vx[i] *= 0.65;
            vz[i] *= 0.65;
          }

          rx[i] += spinX[i] * dt;
          ry[i] += spinY[i] * dt;
          rz[i] += spinZ[i] * dt;

          const scaleFade = l < 0.35 ? l / 0.35 : 1.0;
          _dummy.position.set(px[i], py[i], pz[i]);
          _dummy.rotation.set(rx[i], ry[i], rz[i]);
          _dummy.scale.setScalar(scaleFade);
          _dummy.updateMatrix();
          mesh.setMatrixAt(i, _dummy.matrix);
        }

        if (anyAlive || risingEdge || sustainedDropRefire) {
          mesh.instanceMatrix.needsUpdate = true;
        }
      },
      dispose() {
        geo.dispose();
        mat.dispose();
      },
    };
  },
};

// ============================================================================
// 2. HOLI GEYSER — 160 instanced spheres, 3 staggered floor plumes at r ~ 2.4m
// ============================================================================
const HOLI_COUNT = 160;
const GEYSER_ANGLES = [
  (145 * Math.PI) / 180,
  (180 * Math.PI) / 180,
  (215 * Math.PI) / 180,
];
// Geyser positions at radius ~2.4m behind/around the cat (x = sin*2.4, z = cos*2.4)
const GEYSER_X = [
  Math.sin(GEYSER_ANGLES[0]) * 2.4,
  0.0,
  Math.sin(GEYSER_ANGLES[2]) * 2.4,
];
const GEYSER_Z = [
  Math.cos(GEYSER_ANGLES[0]) * 2.4,
  -2.4,
  Math.cos(GEYSER_ANGLES[2]) * 2.4,
];

const holiGeyserSystem: ParticleSystem = {
  id: 'holi_geyser',
  create(seed: number) {
    const rand = makeRand(seed ^ 0x5f6e7d8c);
    // V3 density-scaled instance count for this system
    const N = dense(HOLI_COUNT, 36);
    const geo = new THREE.SphereGeometry(0.065, 6, 5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const pz = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const vz = new Float32Array(N);
    const life = new Float32Array(N);
    const maxLife = new Float32Array(N);
    const baseDirX = new Float32Array(N);
    const baseDirZ = new Float32Array(N);
    const speedJitter = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const a = rand() * Math.PI * 2;
      const spread = 0.22 + rand() * 0.65;
      baseDirX[i] = Math.cos(a) * spread;
      baseDirZ[i] = Math.sin(a) * spread;
      speedJitter[i] = 0.78 + rand() * 0.44;
      maxLife[i] = 1.25 + rand() * 0.55;
      life[i] = 0;
      mesh.setMatrixAt(i, _parkMatrix);
      mesh.setColorAt(i, HOLI_PIGMENTS[i % 5]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    let cursor = 0;
    let pigmentCycle = 0;

    return {
      mesh,
      update(ctx: FxContext) {
        const dt = ctx.dt;
        const m = ctx.metrics;
        let spawnedThisFrame = false;

        if (m.isBeat && m.mid > 0.72) {
          const geyserIdx = Math.abs(ctx.beatCount) % 3;
          const gx = GEYSER_X[geyserIdx];
          const gz = GEYSER_Z[geyserIdx];
          const pigment = HOLI_PIGMENTS[pigmentCycle % 5];
          pigmentCycle++;

          const burstVel = (4.4 + m.mid * 3.8);
          for (let k = 0; k < 36; k++) {
            const idx = cursor;
            cursor = (cursor + 1) % N;
            px[idx] = gx + baseDirX[idx] * 0.14;
            py[idx] = 0.08;
            pz[idx] = gz + baseDirZ[idx] * 0.14;
            vx[idx] = baseDirX[idx] * (1.2 + m.mid * 1.1);
            vy[idx] = burstVel * speedJitter[idx];
            vz[idx] = baseDirZ[idx] * (1.2 + m.mid * 1.1);
            life[idx] = maxLife[idx];
            mesh.setColorAt(idx, pigment);
          }
          spawnedThisFrame = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }

        let anyAlive = false;
        const drag = Math.exp(-1.2 * dt);

        for (let i = 0; i < N; i++) {
          let l = life[i];
          if (l <= 0) continue;
          anyAlive = true;
          l -= dt;
          life[i] = l;

          if (l <= 0) {
            mesh.setMatrixAt(i, _parkMatrix);
            continue;
          }

          vx[i] *= drag;
          vz[i] *= drag;
          vy[i] = vy[i] * drag - 5.6 * dt;

          px[i] += vx[i] * dt;
          py[i] += vy[i] * dt;
          pz[i] += vz[i] * dt;

          if (py[i] < 0.04) {
            py[i] = 0.04;
            vy[i] = Math.abs(vy[i]) * 0.25;
          }

          const normAge = 1.0 - l / maxLife[i];
          // Gulal cloud puffs expand as they rise then dissolve
          const puffScale =
            normAge < 0.7
              ? 0.8 + normAge * 1.6
              : Math.max(0.01, (1.0 - normAge) * 6.4);

          _dummy.position.set(px[i], py[i], pz[i]);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.setScalar(puffScale);
          _dummy.updateMatrix();
          mesh.setMatrixAt(i, _dummy.matrix);
        }

        if (anyAlive || spawnedThisFrame) {
          mesh.instanceMatrix.needsUpdate = true;
        }
      },
      dispose() {
        geo.dispose();
        mat.dispose();
      },
    };
  },
};

// ============================================================================
// 3. EMBER DIYAS — 120 instanced floating tetrahedra around stage edge
// ============================================================================
const DIYAS_COUNT = 120;

const emberDiyasSystem: ParticleSystem = {
  id: 'ember_diyas',
  ambient: true,
  create(seed: number) {
    const rand = makeRand(seed ^ 0x9a8b7c6d);
    // V3 density-scaled instance count for this system
    const N = dense(DIYAS_COUNT, 28);
    const geo = new THREE.TetrahedronGeometry(0.052, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    const baseAngle = new Float32Array(N);
    const baseRadius = new Float32Array(N);
    const yPos = new Float32Array(N);
    const riseSpeed = new Float32Array(N);
    const phaseOffset = new Float32Array(N);
    const baseScale = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      // Distribute around the stage perimeter (2.45m..3.3m), biasing away from front center
      const rawA = rand() * Math.PI * 2;
      baseAngle[i] = rawA;
      baseRadius[i] = 2.45 + rand() * 0.85;
      yPos[i] = 0.08 + rand() * 3.5;
      riseSpeed[i] = 0.28 + rand() * 0.42;
      phaseOffset[i] = rand() * Math.PI * 2;
      baseScale[i] = 0.75 + rand() * 0.7;
    }

    return {
      mesh,
      update(ctx: FxContext) {
        const dt = ctx.dt;
        const bass = ctx.metrics.bass;
        const lookBoost = _isDiwaliClassLook ? 1.55 : 0.95;

        for (let i = 0; i < N; i++) {
          let y = yPos[i] + riseSpeed[i] * (0.7 + bass * 0.85) * dt;
          if (y > 3.6) {
            y -= 3.52;
          }
          yPos[i] = y;

          const p = phaseOffset[i];
          const swirlAngle =
            baseAngle[i] + Math.sin(ctx.beatPhase * 0.25 + p) * 0.14;
          const r = baseRadius[i] + Math.cos(ctx.beatPhase * 0.5 + p) * 0.12;
          const x = Math.sin(swirlAngle) * r;
          const z = Math.cos(swirlAngle) * r;

          // Fade out smoothly at bottom spawn & top ceiling wrap
          const heightEnv =
            y < 0.4 ? y / 0.4 : y > 3.1 ? (3.6 - y) / 0.5 : 1.0;
          const beatFlicker =
            0.75 + 0.35 * Math.sin(ctx.beatPhase + p) + bass * 0.55;
          const s = baseScale[i] * heightEnv * beatFlicker * lookBoost;

          _dummy.position.set(x, y, z);
          _dummy.rotation.set(
            ctx.beatPhase * 0.5 + p,
            ctx.beatPhase * 0.35 + p,
            p
          );
          _dummy.scale.setScalar(Math.max(0.001, s));
          _dummy.updateMatrix();
          mesh.setMatrixAt(i, _dummy.matrix);

          // Pulse color between warm diya gold and active look accent
          const glow = Math.min(1.0, (0.55 + bass * 0.45) * lookBoost);
          _colorScratch.setRGB(
            1.0 * glow,
            (0.58 + 0.28 * Math.sin(ctx.beatPhase + p)) * glow,
            0.14 * glow
          );
          mesh.setColorAt(i, _colorScratch);
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      },
      dispose() {
        geo.dispose();
        mat.dispose();
      },
    };
  },
};

// ============================================================================
// 4. FOG WISPS — 24 instanced large low-poly icosahedra (0.8–1.6m)
// ============================================================================
const FOG_COUNT = 24;

const fogWispsSystem: ParticleSystem = {
  id: 'fog_wisps',
  ambient: true,
  create(seed: number) {
    const rand = makeRand(seed ^ 0x3c4d5e6f);
    // V3 density-scaled instance count for this system
    const N = dense(FOG_COUNT, 8);
    const geo = new THREE.IcosahedronGeometry(1.0, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.11,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    const anchorX = new Float32Array(N);
    const anchorY = new Float32Array(N);
    const anchorZ = new Float32Array(N);
    const radiusScale = new Float32Array(N);
    const phaseA = new Float32Array(N);
    const phaseB = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      // Ring + rear stage placement so the cat silhouette stays crisp in front
      const angle = ((i / N) * Math.PI * 1.65) + Math.PI * 0.68;
      const dist = 2.6 + rand() * 2.1;
      anchorX[i] = Math.sin(angle) * dist;
      anchorY[i] = 0.22 + rand() * 0.38;
      anchorZ[i] = Math.cos(angle) * dist;
      radiusScale[i] = 0.8 + rand() * 0.8; // 0.8m .. 1.6m
      phaseA[i] = rand() * Math.PI * 2;
      phaseB[i] = rand() * Math.PI * 2;
    }

    return {
      mesh,
      update(ctx: FxContext) {
        const overall = ctx.metrics.overall;
        // Opacity proportional to overall energy, always-on floor haze
        mat.opacity = 0.045 + overall * 0.095;

        const slowPhase = ctx.beatPhase * 0.125;

        for (let i = 0; i < N; i++) {
          const pA = phaseA[i];
          const pB = phaseB[i];
          // Two-sine turbulence field phase-locked to musical clock
          const dx =
            Math.sin(slowPhase + pA) * 0.55 +
            Math.cos(slowPhase * 0.5 + pB) * 0.35;
          const dz =
            Math.cos(slowPhase + pB) * 0.45 +
            Math.sin(slowPhase * 0.5 + pA) * 0.3;
          const dy = Math.sin(slowPhase * 2.0 + pA) * 0.06;

          const s = radiusScale[i] * (0.9 + overall * 0.25);

          _dummy.position.set(
            anchorX[i] + dx,
            anchorY[i] + dy,
            anchorZ[i] + dz
          );
          _dummy.rotation.set(
            slowPhase * 0.3 + pA,
            slowPhase * 0.5 + pB,
            0
          );
          // Flattened wisp cloud silhouette
          _dummy.scale.set(s * 1.25, s * 0.42, s * 1.15);
          _dummy.updateMatrix();
          mesh.setMatrixAt(i, _dummy.matrix);

          // Subtle tint from active look primary/secondary
          if (i % 2 === 0) {
            _colorScratch.copy(_lookPrimary).multiplyScalar(0.45 + overall * 0.55);
          } else {
            _colorScratch.copy(_lookSecondary).multiplyScalar(0.45 + overall * 0.55);
          }
          mesh.setColorAt(i, _colorScratch);
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      },
      dispose() {
        geo.dispose();
        mat.dispose();
      },
    };
  },
};

// ============================================================================
// 5. STROBE SPARKS — 90 instanced stretched octahedra in DJ booth fan bursts
// ============================================================================
const SPARKS_COUNT = 90;

const strobeSparksSystem: ParticleSystem = {
  id: 'strobe_sparks',
  create(seed: number) {
    const rand = makeRand(seed ^ 0x7e8f9a0b);
    // V3 density-scaled instance count for this system
    const N = dense(SPARKS_COUNT, 24);
    const geo = new THREE.OctahedronGeometry(0.036, 0);
    // Stretch vertically so each spark reads as a sharp pyrotechnic needle at 4–7m
    geo.scale(0.85, 5.2, 0.85);

    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const pz = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const vz = new Float32Array(N);
    const fanAngle = new Float32Array(N);
    const fanSpeed = new Float32Array(N);
    const life = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      // Fan arc (-62 deg to +62 deg) in the DJ booth backdrop plane
      const norm = (i / (N - 1)) * 2.0 - 1.0;
      fanAngle[i] = norm * 1.08 + (rand() - 0.5) * 0.08;
      fanSpeed[i] = 5.5 + rand() * 3.8;
      life[i] = 0;
      mesh.setMatrixAt(i, _parkMatrix);
      mesh.setColorAt(i, _lookAccent);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    return {
      mesh,
      update(ctx: FxContext) {
        const dt = ctx.dt;
        const m = ctx.metrics;
        let triggered = false;

        // Fire upward fan burst from behind DJ booth on high > 0.8 beat transients
        if (m.isBeat && m.high > 0.8) {
          triggered = true;
          for (let i = 0; i < N; i++) {
            const ang = fanAngle[i];
            const spd = fanSpeed[i] * (0.85 + m.high * 0.35);
            // Spawn behind the cat's plane (z = -2.25m, camera-safe §4.5)
            px[i] = Math.sin(ang) * 0.55;
            py[i] = 1.05;
            pz[i] = -2.25 - (i % 3) * 0.12;
            vx[i] = Math.sin(ang) * spd;
            vy[i] = Math.cos(ang) * spd;
            vz[i] = -0.35;
            life[i] = 0.5;

            if (i % 2 === 0) {
              mesh.setColorAt(i, _lookAccent);
            } else {
              _colorScratch.setRGB(1.0, 1.0, 1.0);
              mesh.setColorAt(i, _colorScratch);
            }
          }
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }

        let anyAlive = false;
        for (let i = 0; i < N; i++) {
          let l = life[i];
          if (l <= 0) continue;
          anyAlive = true;
          l -= dt;
          life[i] = l;

          if (l <= 0) {
            mesh.setMatrixAt(i, _parkMatrix);
            continue;
          }

          px[i] += vx[i] * dt;
          py[i] += vy[i] * dt;
          pz[i] += vz[i] * dt;
          vy[i] -= 6.5 * dt;

          const lifeRatio = l / 0.5;
          _dummy.position.set(px[i], py[i], pz[i]);
          _dummy.rotation.set(0, 0, -fanAngle[i]);
          _dummy.scale.set(lifeRatio, 0.4 + lifeRatio * 1.1, lifeRatio);
          _dummy.updateMatrix();
          mesh.setMatrixAt(i, _dummy.matrix);
        }

        if (anyAlive || triggered) {
          mesh.instanceMatrix.needsUpdate = true;
        }
      },
      dispose() {
        geo.dispose();
        mat.dispose();
      },
    };
  },
};

export const PARTICLE_SYSTEMS: ParticleSystem[] = [
  confettiBurstSystem,   // event (drops)
  holiGeyserSystem,      // event (Holi-class looks)
  emberDiyasSystem,      // AMBIENT floaters
  fogWispsSystem,        // AMBIENT haze
  strobeSparksSystem,    // event (DJ booth bursts)
];

/** V3: true when the system is an always-on ambient floater (parked on Lite). */
export function isAmbientSystem(sys: ParticleSystem): boolean {
  return sys.ambient === true;
}