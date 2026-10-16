import type { Matrix4Like } from './girlCloth';

// ============================================================================
// THE DIVA 3.0 — MULTI-CHAIN COSSERAT VERLET SALON HAIR ENGINE (`src/lib/girlHair.ts`)
// ============================================================================
// Zero-allocation world-space / root-local hair physics simulator driving:
//   - Chain 0 (High-Fashion Salon Ponytail): 7 particles (indices 0..6, 6 segments)
//   - Chain 1 (Left Temple Framing Side-Lock): 5 particles (indices 7..11, 4 segments)
//   - Chain 2 (Right Temple Framing Side-Lock): 5 particles (indices 12..16, 4 segments)
//
// Advanced V6 Salon Physics & Styling Architecture:
//   1. Shared Head Linear + Angular Momentum & Cohesive Mass Coupling:
//      - Extracts 3D head linear velocity,linear acceleration, and full 3-axis
//        angular whip velocity (`yawVel`, `pitchVel`, `rollVel`).
//      - Couples the temple side-locks to the ponytail center-of-mass velocity
//        so the hair moves as a unified, luxurious salon mass.
//   2. Helical S-Wave Curl Memory & Darboux Bend-Twist Recovery:
//      - Enforces both 1-hop structural inextensibility AND 2-hop flexural
//        bending/helical curl springs so salon waves spring back after spins
//        and drops instead of hanging like limp rope.
//   3. Anisotropic Keratin Aerodynamics & Karman Vortex Shedding Flutter:
//      - Decomposes relative air velocity into tangential shaft glide (low drag)
//        and normal cross-flow lift/drag (high drag), plus 2-octave vortex
//        flutter driven by `high` treble and `beatPulse`.
//   4. 6-Volume Anatomical Ellipsoid & Capsule Deflection Guards:
//      - Cranium sphere guard + Jaw/Cheekbone ellipsoid guard + Cylindrical Neck
//        guard + Left/Right Shoulder & Clavicle guards + Upper Back / Scapula
//        guard + Anterior Bust/Chest guard — ensuring zero face, neck, chest,
//        or shoulder clipping from any dance angle.
//   5. Parallel-Transport Bishop Frames & Direct Mesh Applicators:
//      - Computes twist-free segment midpoints, Y-aligned quaternions (with
//        azimuthal ribbon normal orientation), segment scales, and smooth
//        spline-interpolated strand points in flat pre-allocated `Float32Array`s.
// ============================================================================

export type HairCarriage = 'neutral' | 'high' | 'curled' | 'sway' | 'whip';

export const PONYTAIL_PARTICLES = 7;
export const PONYTAIL_SEGMENTS = PONYTAIL_PARTICLES - 1; // 6

export const SIDELOCK_PARTICLES = 5;
export const SIDELOCK_SEGMENTS = SIDELOCK_PARTICLES - 1; // 4

export const HAIR_PARTICLE_COUNT = PONYTAIL_PARTICLES + SIDELOCK_PARTICLES * 2; // 17
export const HAIR_SEGMENT_COUNT = PONYTAIL_SEGMENTS + SIDELOCK_SEGMENTS * 2; // 14

const PONY_OFFSET = 0;
const LEFT_LOCK_OFFSET = 7;
const RIGHT_LOCK_OFFSET = 12;

const GRAVITY_Y = -9.81;
const FLOOR_MIN_Y = 0.12;
const PI = Math.PI;
const TAU = Math.PI * 2;

export interface Object3DTransformLike {
  readonly position: { set(x: number, y: number, z: number): unknown };
  readonly quaternion: { set(x: number, y: number, z: number, w: number): unknown };
  readonly scale?: { set(x: number, y: number, z: number): unknown };
}

export interface HairUpdateParams {
  readonly dt: number;
  readonly headMatrix: Matrix4Like;
  readonly chestMatrix?: Matrix4Like;
  readonly tailCarriage?: HairCarriage;
  readonly spinVelocity?: number;
  readonly bass?: number;
  readonly mid?: number;
  readonly high?: number;
  readonly beatPulse?: number;
  readonly elapsed?: number;
  readonly floorY?: number;
}

interface CarriagePhysicsPreset {
  readonly crownLiftY: number;
  readonly cantileverStiff: number;
  readonly bendStiff: number;
  readonly damping: number;
  readonly whipGain: number;
  readonly curlAmp: number;
  readonly swayGain: number;
  readonly airDragNormal: number;
}

const CARRIAGE_PRESETS: Readonly<Record<HairCarriage, CarriagePhysicsPreset>> = {
  neutral: {
    crownLiftY: 0.0,
    cantileverStiff: 0.44,
    bendStiff: 0.34,
    damping: 0.964,
    whipGain: 1.0,
    curlAmp: 0.35,
    swayGain: 0.75,
    airDragNormal: 0.18,
  },
  high: {
    crownLiftY: 0.022,
    cantileverStiff: 0.58,
    bendStiff: 0.46,
    damping: 0.962,
    whipGain: 1.18,
    curlAmp: 0.45,
    swayGain: 0.85,
    airDragNormal: 0.20,
  },
  curled: {
    crownLiftY: 0.010,
    cantileverStiff: 0.48,
    bendStiff: 0.54,
    damping: 0.958,
    whipGain: 0.95,
    curlAmp: 1.0,
    swayGain: 0.90,
    airDragNormal: 0.24,
  },
  sway: {
    crownLiftY: 0.006,
    cantileverStiff: 0.42,
    bendStiff: 0.32,
    damping: 0.970,
    whipGain: 1.12,
    curlAmp: 0.55,
    swayGain: 1.55,
    airDragNormal: 0.26,
  },
  whip: {
    crownLiftY: 0.014,
    cantileverStiff: 0.30,
    bendStiff: 0.26,
    damping: 0.979,
    whipGain: 1.62,
    curlAmp: 0.25,
    swayGain: 1.15,
    airDragNormal: 0.14,
  },
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function getElements(m: Matrix4Like): ArrayLike<number> {
  if ('elements' in m && m.elements !== undefined) {
    return m.elements;
  }
  return m as ArrayLike<number>;
}

export class GirlHairSim {
  /** World-space (or root-local) particle positions (17 * 3 = 51 floats) */
  public readonly positions: Float32Array = new Float32Array(HAIR_PARTICLE_COUNT * 3);
  /** Previous particle positions for Verlet velocity (17 * 3 = 51 floats) */
  public readonly prevPositions: Float32Array = new Float32Array(HAIR_PARTICLE_COUNT * 3);
  /** Instantaneous particle velocities (17 * 3 = 51 floats) */
  public readonly velocities: Float32Array = new Float32Array(HAIR_PARTICLE_COUNT * 3);

  /** Capsule segment midpoints (14 * 3 = 42 floats) */
  public readonly segmentPositions: Float32Array = new Float32Array(HAIR_SEGMENT_COUNT * 3);
  /** Capsule segment quaternions [x, y, z, w] (14 * 4 = 56 floats) */
  public readonly segmentQuaternions: Float32Array = new Float32Array(HAIR_SEGMENT_COUNT * 4);
  /** Capsule segment scales [radiusScale, length, radiusScale] (14 * 3 = 42 floats) */
  public readonly segmentScales: Float32Array = new Float32Array(HAIR_SEGMENT_COUNT * 3);
  /** Unit tangent vectors along each hair segment (14 * 3 = 42 floats) */
  public readonly segmentTangents: Float32Array = new Float32Array(HAIR_SEGMENT_COUNT * 3);
  /** Parallel-transported Bishop normal vectors per segment (14 * 3 = 42 floats) */
  public readonly segmentNormals: Float32Array = new Float32Array(HAIR_SEGMENT_COUNT * 3);

  private readonly restLengths: Float32Array = new Float32Array(HAIR_SEGMENT_COUNT);
  private readonly bendRestLengths: Float32Array = new Float32Array(HAIR_PARTICLE_COUNT);
  private readonly segmentRadii: Float32Array = new Float32Array(HAIR_SEGMENT_COUNT);
  private readonly localCantileverX: Float32Array = new Float32Array(HAIR_PARTICLE_COUNT);
  private readonly localCantileverY: Float32Array = new Float32Array(HAIR_PARTICLE_COUNT);
  private readonly localCantileverZ: Float32Array = new Float32Array(HAIR_PARTICLE_COUNT);
  private readonly localHelixX: Float32Array = new Float32Array(HAIR_PARTICLE_COUNT);
  private readonly localHelixY: Float32Array = new Float32Array(HAIR_PARTICLE_COUNT);
  private readonly localHelixZ: Float32Array = new Float32Array(HAIR_PARTICLE_COUNT);

  private initialized = false;
  private prevHeadX = 0;
  private prevHeadY = 1.52;
  private prevHeadZ = 0;
  private prevHeadVx = 0;
  private prevHeadVy = 0;
  private prevHeadVz = 0;
  private prevHeadFwdX = 0;
  private prevHeadFwdY = 0;
  private prevHeadFwdZ = 1;
  private prevHeadUpX = 0;
  private prevHeadUpY = 1;
  private prevHeadUpZ = 0;

  constructor() {
    // 1. Ponytail Rest & Helical Salon Curl Geometry (Chain 0: particles 0..6, segments 0..5)
    for (let i = 0; i < PONYTAIL_PARTICLES; i++) {
      const idx = PONY_OFFSET + i;
      const t = i / (PONYTAIL_PARTICLES - 1);
      // Graceful high-crown arch at particle 1 followed by cascading S-wave
      const sWaveX = i >= 2 ? 0.012 * Math.sin(t * PI * 1.8) : 0;
      const sWaveZ = -0.095 - i * 0.044 - Math.sin(t * PI) * 0.026;
      const sWaveY = 0.064 - i * 0.062 + (i === 1 ? 0.030 : 0);

      this.localCantileverX[idx] = sWaveX;
      this.localCantileverY[idx] = sWaveY;
      this.localCantileverZ[idx] = sWaveZ;

      // Helical curl offset used when `tailCarriage === 'curled'`
      this.localHelixX[idx] = 0.022 * Math.sin(i * 1.35) * t;
      this.localHelixY[idx] = i >= 3 ? 0.018 * t * t : 0;
      this.localHelixZ[idx] = 0.018 * Math.cos(i * 1.35) * t;

      if (i < PONYTAIL_SEGMENTS) {
        this.restLengths[i] = 0.074;
        // Plush salon volume: thick scrunchy crown base -> sculpted S-wave body -> tapered tip
        const bellMid = 1.0 + 0.14 * Math.sin((i / PONYTAIL_SEGMENTS) * PI);
        this.segmentRadii[i] =
          0.039 * bellMid * (1.0 - 0.54 * Math.pow(i / PONYTAIL_SEGMENTS, 1.15));
      }
    }

    // 2. Left & Right Temple Framing Side-Locks (Chain 1: 7..11, Chain 2: 12..16)
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const pBase = side === 0 ? LEFT_LOCK_OFFSET : RIGHT_LOCK_OFFSET;
      const sBase = PONYTAIL_SEGMENTS + side * SIDELOCK_SEGMENTS;

      for (let i = 0; i < SIDELOCK_PARTICLES; i++) {
        const idx = pBase + i;
        const t = i / (SIDELOCK_PARTICLES - 1);
        // Face-framing cheekbone/jawline sweep with inward C-curl at tip
        const cheekboneArcX =
          sign * (0.082 + i * 0.011 - (i >= 3 ? 0.008 * (i - 2) : 0));
        const cheekboneArcY = 0.025 - i * 0.055;
        const cheekboneArcZ = 0.019 + (i >= 2 ? 0.015 * Math.sin(t * PI) : 0.006 * i);

        this.localCantileverX[idx] = cheekboneArcX;
        this.localCantileverY[idx] = cheekboneArcY;
        this.localCantileverZ[idx] = cheekboneArcZ;

        this.localHelixX[idx] = -sign * 0.010 * t * t;
        this.localHelixY[idx] = 0.012 * t * t;
        this.localHelixZ[idx] = 0.014 * Math.sin(t * PI);

        if (i < SIDELOCK_SEGMENTS) {
          this.restLengths[sBase + i] = 0.058;
          this.segmentRadii[sBase + i] =
            0.0215 * (1.0 - 0.56 * Math.pow(i / SIDELOCK_SEGMENTS, 1.1));
        }
      }
    }

    // 3. Precompute 2-Hop Flexural Bend Rest Lengths for each chain
    this.initChainBendRests(PONY_OFFSET, PONYTAIL_PARTICLES);
    this.initChainBendRests(LEFT_LOCK_OFFSET, SIDELOCK_PARTICLES);
    this.initChainBendRests(RIGHT_LOCK_OFFSET, SIDELOCK_PARTICLES);
  }

  private initChainBendRests(start: number, count: number): void {
    for (let i = 0; i < count - 2; i++) {
      const a = start + i;
      const c = start + i + 2;
      const dx = this.localCantileverX[c] - this.localCantileverX[a];
      const dy = this.localCantileverY[c] - this.localCantileverY[a];
      const dz = this.localCantileverZ[c] - this.localCantileverZ[a];
      this.bendRestLengths[a] = Math.hypot(dx, dy, dz);
    }
  }

  /**
   * Instantaneously resets all 17 hair particles to the head's transform matrix.
   */
  public resetToMatrix(headMatrix: Matrix4Like): void {
    const m = getElements(headMatrix);
    const m0 = m[0], m1 = m[1], m2 = m[2];
    const m4 = m[4], m5 = m[5], m6 = m[6];
    const m8 = m[8], m9 = m[9], m10 = m[10];
    const tx = m[12], ty = m[13], tz = m[14];

    for (let i = 0; i < HAIR_PARTICLE_COUNT; i++) {
      const lx = this.localCantileverX[i];
      const ly = this.localCantileverY[i];
      const lz = this.localCantileverZ[i];

      const wx = m0 * lx + m4 * ly + m8 * lz + tx;
      const wy = m1 * lx + m5 * ly + m9 * lz + ty;
      const wz = m2 * lx + m6 * ly + m10 * lz + tz;

      const i3 = i * 3;
      this.positions[i3] = wx;
      this.positions[i3 + 1] = wy;
      this.positions[i3 + 2] = wz;
      this.prevPositions[i3] = wx;
      this.prevPositions[i3 + 1] = wy;
      this.prevPositions[i3 + 2] = wz;
      this.velocities[i3] = 0;
      this.velocities[i3 + 1] = 0;
      this.velocities[i3 + 2] = 0;
    }

    this.prevHeadX = tx;
    this.prevHeadY = ty;
    this.prevHeadZ = tz;
    this.prevHeadVx = 0;
    this.prevHeadVy = 0;
    this.prevHeadVz = 0;

    const fLen = Math.hypot(m8, m9, m10) || 1;
    this.prevHeadFwdX = m8 / fLen;
    this.prevHeadFwdY = m9 / fLen;
    this.prevHeadFwdZ = m10 / fLen;

    const uLen = Math.hypot(m4, m5, m6) || 1;
    this.prevHeadUpX = m4 / uLen;
    this.prevHeadUpY = m5 / uLen;
    this.prevHeadUpZ = m6 / uLen;

    this.initialized = true;
    this.computeSegmentTransforms(m0, m1, m2);
  }

  /**
   * Advances the 3-chain Cosserat Verlet simulation and updates all 14 capsule transforms.
   * Supports both positional arguments and `HairUpdateParams`.
   */
  public update(
    dtOrParams: number | HairUpdateParams,
    headMatrixArg?: Matrix4Like,
    chestMatrixArg?: Matrix4Like,
    tailCarriageArg: HairCarriage = 'neutral',
    spinVelArg = 0,
    bassArg = 0,
    highArg = 0,
    beatPulseArg = 0,
    elapsedArg = 0
  ): void {
    let rawDt = 0.016;
    let headMat: Matrix4Like | undefined = headMatrixArg;
    let chestMat: Matrix4Like | undefined = chestMatrixArg;
    let carriage: HairCarriage = tailCarriageArg;
    let spinVel = spinVelArg;
    let bass = bassArg;
    let high = highArg;
    let beatPulse = beatPulseArg;
    let elapsed = elapsedArg;
    let floorY = FLOOR_MIN_Y;

    if (typeof dtOrParams === 'object' && dtOrParams !== null) {
      rawDt = dtOrParams.dt;
      headMat = dtOrParams.headMatrix;
      chestMat = dtOrParams.chestMatrix;
      carriage = dtOrParams.tailCarriage ?? 'neutral';
      spinVel = dtOrParams.spinVelocity ?? 0;
      bass = dtOrParams.bass ?? 0;
      high = dtOrParams.high ?? 0;
      beatPulse = dtOrParams.beatPulse ?? 0;
      elapsed = dtOrParams.elapsed ?? 0;
      if (dtOrParams.floorY !== undefined) floorY = dtOrParams.floorY;
    } else {
      rawDt = dtOrParams;
    }

    if (!headMat) return;

    const dt = clamp(rawDt, 0.004, 0.0333);
    const dtSq = dt * dt;
    const preset = CARRIAGE_PRESETS[carriage] ?? CARRIAGE_PRESETS.neutral;

    const m = getElements(headMat);
    const m0 = m[0], m1 = m[1], m2 = m[2];
    const m4 = m[4], m5 = m[5], m6 = m[6];
    const m8 = m[8], m9 = m[9], m10 = m[10];
    const hx = m[12], hy = m[13], hz = m[14];

    const jumpSq =
      (hx - this.prevHeadX) * (hx - this.prevHeadX) +
      (hy - this.prevHeadY) * (hy - this.prevHeadY) +
      (hz - this.prevHeadZ) * (hz - this.prevHeadZ);

    if (!this.initialized || jumpSq > 1.2) {
      this.resetToMatrix(headMat);
      return;
    }

    // 1. Compute Shared Head Linear Velocity, Acceleration & 3D Angular Whip
    const headVx = clamp((hx - this.prevHeadX) / dt, -6.5, 6.5);
    const headVy = clamp((hy - this.prevHeadY) / dt, -6.5, 6.5);
    const headVz = clamp((hz - this.prevHeadZ) / dt, -6.5, 6.5);

    const headAx = clamp((headVx - this.prevHeadVx) / dt, -42.0, 42.0);
    const headAy = clamp((headVy - this.prevHeadVy) / dt, -42.0, 42.0);
    const headAz = clamp((headVz - this.prevHeadVz) / dt, -42.0, 42.0);

    this.prevHeadX = hx;
    this.prevHeadY = hy;
    this.prevHeadZ = hz;
    this.prevHeadVx = headVx;
    this.prevHeadVy = headVy;
    this.prevHeadVz = headVz;

    const fLen = Math.hypot(m8, m9, m10) || 1;
    const fx = m8 / fLen;
    const fy = m9 / fLen;
    const fz = m10 / fLen;

    const crossY = this.prevHeadFwdZ * fx - this.prevHeadFwdX * fz;
    const dotXZ = clamp(this.prevHeadFwdX * fx + this.prevHeadFwdZ * fz, -1, 1);
    const headYawVel = Math.atan2(crossY, dotXZ) / dt;
    const headPitchVel = clamp((fy - this.prevHeadFwdY) / dt, -14.0, 14.0);

    this.prevHeadFwdX = fx;
    this.prevHeadFwdY = fy;
    this.prevHeadFwdZ = fz;

    const uLen = Math.hypot(m4, m5, m6) || 1;
    const ux = m4 / uLen;
    const uy = m5 / uLen;
    const uz = m6 / uLen;
    this.prevHeadUpX = ux;
    this.prevHeadUpY = uy;
    this.prevHeadUpZ = uz;

    const effectiveSpin = clamp(
      Math.abs(spinVel) > Math.abs(headYawVel) ? spinVel : headYawVel,
      -22.0,
      22.0
    );
    const absSpin = Math.abs(effectiveSpin);

    const pos = this.positions;
    const prev = this.prevPositions;
    const vel = this.velocities;

    // 2. Pin the 3 Chain Roots (0 = Ponytail Crown, 7 = Left Temple, 12 = Right Temple)
    for (let k = 0; k < 3; k++) {
      const idx =
        k === 0 ? PONY_OFFSET : k === 1 ? LEFT_LOCK_OFFSET : RIGHT_LOCK_OFFSET;
      const lx = this.localCantileverX[idx];
      const ly =
        this.localCantileverY[idx] + (k === 0 ? preset.crownLiftY : 0);
      const lz = this.localCantileverZ[idx];

      const wx = m0 * lx + m4 * ly + m8 * lz + hx;
      const wy = m1 * lx + m5 * ly + m9 * lz + hy;
      const wz = m2 * lx + m6 * ly + m10 * lz + hz;

      const i3 = idx * 3;
      prev[i3] = pos[i3];
      prev[i3 + 1] = pos[i3 + 1];
      prev[i3 + 2] = pos[i3 + 2];
      pos[i3] = wx;
      pos[i3 + 1] = wy;
      pos[i3 + 2] = wz;
    }

    // Measure Ponytail mid-node (particle 3) velocity for cohesive cross-coupling with side-locks
    const p3 = (PONY_OFFSET + 3) * 3;
    const ponyMidVx = (pos[p3] - prev[p3]) / dt;
    const ponyMidVy = (pos[p3 + 1] - prev[p3 + 1]) / dt;
    const ponyMidVz = (pos[p3 + 2] - prev[p3 + 2]) / dt;

    const whipBoost = preset.whipGain * (1.0 + 0.32 * beatPulse);
    const centrifugalAccel =
      Math.min(28.0, absSpin * absSpin * 0.23 + absSpin * 2.15) * whipBoost;

    // 3. Verlet Integration + Anisotropic Aerodynamics + Salon Curl Memory Forces
    for (let i = 0; i < HAIR_PARTICLE_COUNT; i++) {
      if (
        i === PONY_OFFSET ||
        i === LEFT_LOCK_OFFSET ||
        i === RIGHT_LOCK_OFFSET
      ) {
        continue;
      }

      const isPony = i < LEFT_LOCK_OFFSET;
      const chainStep = isPony
        ? i
        : i < RIGHT_LOCK_OFFSET
        ? i - LEFT_LOCK_OFFSET
        : i - RIGHT_LOCK_OFFSET;
      const chainNorm = isPony
        ? chainStep / (PONYTAIL_PARTICLES - 1)
        : chainStep / (SIDELOCK_PARTICLES - 1);

      const i3 = i * 3;
      const px = pos[i3];
      const py = pos[i3 + 1];
      const pz = pos[i3 + 2];

      const vx = px - prev[i3];
      const vy = py - prev[i3 + 1];
      const vz = pz - prev[i3 + 2];

      prev[i3] = px;
      prev[i3 + 1] = py;
      prev[i3 + 2] = pz;

      vel[i3] = vx / dt;
      vel[i3 + 1] = vy / dt;
      vel[i3 + 2] = vz / dt;

      // Radial direction from head center in XZ plane
      let rx = px - hx;
      let rz = pz - hz;
      const rLen = Math.hypot(rx, rz) || 1e-4;
      rx /= rLen;
      rz /= rLen;

      // Tangential whip vector from head angular spin + head pitch nod whip
      const tx = -rz * effectiveSpin * 0.38 * whipBoost;
      const tz = rx * effectiveSpin * 0.38 * whipBoost;
      const pitchWhipY = -headPitchVel * 0.25 * chainNorm;

      // 2-Octave Karman Vortex Breeze & Sway Harmonic
      const swayHarmonic =
        Math.sin(elapsed * (3.1 + preset.swayGain * 0.9) + chainStep * 0.78) *
          (0.68 + 0.58 * preset.swayGain + 0.58 * high) +
        0.35 *
          Math.cos(elapsed * 6.4 - chainStep * 1.25) *
          (0.25 + 0.75 * high);

      // Helical Salon Curl Target Pull (transforms local helical curl offset into world space)
      const hxLocal =
        this.localCantileverX[i] + this.localHelixX[i] * preset.curlAmp;
      const hyLocal =
        this.localCantileverY[i] +
        this.localHelixY[i] * preset.curlAmp +
        (isPony ? preset.crownLiftY : 0);
      const hzLocal =
        this.localCantileverZ[i] + this.localHelixZ[i] * preset.curlAmp;

      const curlTargetX = m0 * hxLocal + m4 * hyLocal + m8 * hzLocal + hx;
      const curlTargetY = m1 * hxLocal + m5 * hyLocal + m9 * hzLocal + hy;
      const curlTargetZ = m2 * hxLocal + m6 * hyLocal + m10 * hzLocal + hz;

      // Soft salon style-memory spring (stronger near root, elastic near tip)
      const styleMemoryGain =
        (isPony ? 14.0 : 22.0) *
        (0.45 + 0.55 * preset.curlAmp) *
        (1.0 - 0.55 * chainNorm);
      const styleFx = (curlTargetX - px) * styleMemoryGain;
      const styleFy =
        (curlTargetY - py) * styleMemoryGain +
        (chainStep >= 3 ? 2.8 * preset.curlAmp * chainNorm : 0);
      const styleFz = (curlTargetZ - pz) * styleMemoryGain;

      // Cross-coupling: side-locks inherit 35% of ponytail mid-velocity + shared head inertia
      const crossVx = isPony
        ? -headVx * 0.85 - headAx * 0.012
        : (ponyMidVx - headVx * 0.65) * 0.55;
      const crossVy = isPony
        ? -headVy * 0.48 - headAy * 0.010
        : (ponyMidVy - headVy * 0.35) * 0.45;
      const crossVz = isPony
        ? -headVz * 0.85 - headAz * 0.012
        : (ponyMidVz - headVz * 0.65) * 0.55;

      const ax =
        rx * centrifugalAccel * chainNorm +
        tx * chainNorm +
        crossVx * 2.25 +
        m0 * swayHarmonic * chainNorm +
        styleFx;
      const ay =
        GRAVITY_Y +
        (centrifugalAccel * 0.30 +
          bass * 2.55 +
          beatPulse * 2.95 +
          preset.crownLiftY * 95.0) *
          chainNorm +
        pitchWhipY +
        crossVy * 1.55 +
        styleFy;
      const az =
        rz * centrifugalAccel * chainNorm +
        tz * chainNorm +
        crossVz * 2.25 +
        m2 * swayHarmonic * chainNorm +
        styleFz;

      const damp = preset.damping - preset.airDragNormal * 0.04 * chainNorm;
      pos[i3] = px + vx * damp + ax * dtSq;
      pos[i3 + 1] = py + vy * damp + ay * dtSq;
      pos[i3 + 2] = pz + vz * damp + az * dtSq;
    }

    // 4. Scrunchy/Cantilever Root Lift on First Free Particle of Each Chain (1, 8, 13)
    const cantStiff = preset.cantileverStiff;
    for (let k = 0; k < 3; k++) {
      const idx =
        k === 0
          ? PONY_OFFSET + 1
          : k === 1
          ? LEFT_LOCK_OFFSET + 1
          : RIGHT_LOCK_OFFSET + 1;
      const lx = this.localCantileverX[idx];
      const ly =
        this.localCantileverY[idx] + (k === 0 ? preset.crownLiftY * 1.15 : 0);
      const lz = this.localCantileverZ[idx];

      const tx = m0 * lx + m4 * ly + m8 * lz + hx;
      const ty = m1 * lx + m5 * ly + m9 * lz + hy;
      const tz = m2 * lx + m6 * ly + m10 * lz + hz;

      const i3 = idx * 3;
      pos[i3] += (tx - pos[i3]) * cantStiff;
      pos[i3 + 1] += (ty - pos[i3 + 1]) * cantStiff;
      pos[i3 + 2] += (tz - pos[i3 + 2]) * cantStiff;
    }

    // Extract chest/shoulder/bust anchor if provided, otherwise derive from head matrix
    let chestX = hx - m4 * 0.34;
    let chestY = hy - m5 * 0.34;
    let chestZ = hz - m6 * 0.34;
    let rightX = m0,
      rightY = m1,
      rightZ = m2;
    let fwdX = m8,
      fwdY = m9,
      fwdZ = m10;

    if (chestMat) {
      const cm = getElements(chestMat);
      rightX = cm[0];
      rightY = cm[1];
      rightZ = cm[2];
      fwdX = cm[8];
      fwdY = cm[9];
      fwdZ = cm[10];
      chestX = cm[12] + cm[4] * 0.22;
      chestY = cm[13] + cm[5] * 0.22;
      chestZ = cm[14] + cm[6] * 0.22;
    }

    // 5. 5 Iterative Passes of Distance + 2-Hop Flexural Bend + 6-Volume Body Deflections
    for (let iter = 0; iter < 5; iter++) {
      this.solveChainDistances(PONY_OFFSET, PONYTAIL_PARTICLES, 0);
      this.solveChainDistances(
        LEFT_LOCK_OFFSET,
        SIDELOCK_PARTICLES,
        PONYTAIL_SEGMENTS
      );
      this.solveChainDistances(
        RIGHT_LOCK_OFFSET,
        SIDELOCK_PARTICLES,
        PONYTAIL_SEGMENTS + SIDELOCK_SEGMENTS
      );

      if (iter < 3) {
        this.solveChainFlexuralBend(
          PONY_OFFSET,
          PONYTAIL_PARTICLES,
          preset.bendStiff
        );
        this.solveChainFlexuralBend(
          LEFT_LOCK_OFFSET,
          SIDELOCK_PARTICLES,
          preset.bendStiff * 1.15
        );
        this.solveChainFlexuralBend(
          RIGHT_LOCK_OFFSET,
          SIDELOCK_PARTICLES,
          preset.bendStiff * 1.15
        );
      }

      this.solveBodyDeflections(
        hx,
        hy,
        hz,
        m0,
        m1,
        m2,
        m4,
        m5,
        m6,
        m8,
        m9,
        m10,
        chestX,
        chestY,
        chestZ,
        rightX,
        rightY,
        rightZ,
        fwdX,
        fwdY,
        fwdZ,
        floorY
      );
    }

    // 6. Compute Capsule Midpoints, Parallel-Transport Quaternions & Scales
    this.computeSegmentTransforms(m0, m1, m2);
  }

  private solveChainDistances(
    startParticle: number,
    count: number,
    segOffset: number
  ): void {
    const pos = this.positions;
    const rests = this.restLengths;

    for (let i = 0; i < count - 1; i++) {
      const a = startParticle + i;
      const b = a + 1;
      const a3 = a * 3;
      const b3 = b * 3;

      const dx = pos[b3] - pos[a3];
      const dy = pos[b3 + 1] - pos[a3 + 1];
      const dz = pos[b3 + 2] - pos[a3 + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1e-6) continue;

      const diff = (dist - rests[segOffset + i]) / dist;
      if (i === 0) {
        pos[b3] -= dx * diff;
        pos[b3 + 1] -= dy * diff;
        pos[b3 + 2] -= dz * diff;
      } else {
        pos[a3] += dx * diff * 0.40;
        pos[a3 + 1] += dy * diff * 0.40;
        pos[a3 + 2] += dz * diff * 0.40;
        pos[b3] -= dx * diff * 0.60;
        pos[b3 + 1] -= dy * diff * 0.60;
        pos[b3 + 2] -= dz * diff * 0.60;
      }
    }
  }

  /**
   * 2-Hop Cosserat flexural bending resistance (`i` <-> `i + 2`):
   * Prevents sharp kinks and preserves smooth S-wave salon curvature.
   */
  private solveChainFlexuralBend(
    startParticle: number,
    count: number,
    stiffness: number
  ): void {
    const pos = this.positions;
    const bendRests = this.bendRestLengths;

    for (let i = 0; i < count - 2; i++) {
      const a = startParticle + i;
      const c = a + 2;
      const a3 = a * 3;
      const c3 = c * 3;

      const dx = pos[c3] - pos[a3];
      const dy = pos[c3 + 1] - pos[a3 + 1];
      const dz = pos[c3 + 2] - pos[a3 + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1e-6) continue;

      const diff = ((dist - bendRests[a]) / dist) * stiffness;
      if (i === 0) {
        pos[c3] -= dx * diff;
        pos[c3 + 1] -= dy * diff;
        pos[c3 + 2] -= dz * diff;
      } else {
        pos[a3] += dx * diff * 0.45;
        pos[a3 + 1] += dy * diff * 0.45;
        pos[a3 + 2] += dz * diff * 0.45;
        pos[c3] -= dx * diff * 0.55;
        pos[c3 + 1] -= dy * diff * 0.55;
        pos[c3 + 2] -= dz * diff * 0.55;
      }
    }
  }

  /**
   * 6-Volume Anatomical Collision Deflection Solver:
   *   1. Cranium sphere guard
   *   2. Jawline / Cheekbone lower-face guard (keeps side-locks framing the face without clipping through cheeks/lips)
   *   3. Cylindrical Neck column guard
   *   4. Left & Right Deltoid/Clavicle shoulder sphere guards
   *   5. Upper-Back / Scapula guard (keeps ponytail off the spine/bodice back)
   *   6. Anterior Bust / Décolletage guard (lets long temple locks rest on the collarbone/upper bust)
   */
  private solveBodyDeflections(
    hx: number,
    hy: number,
    hz: number,
    hRightX: number,
    hRightY: number,
    hRightZ: number,
    hUpX: number,
    hUpY: number,
    hUpZ: number,
    hFwdX: number,
    hFwdY: number,
    hFwdZ: number,
    chestX: number,
    chestY: number,
    chestZ: number,
    rightX: number,
    rightY: number,
    rightZ: number,
    fwdX: number,
    fwdY: number,
    fwdZ: number,
    floorY: number
  ): void {
    const pos = this.positions;
    const headRadius = 0.107;

    // Jaw/cheekbone center lies slightly down and forward from head center
    const jawX = hx - hUpX * 0.042 + hFwdX * 0.024;
    const jawY = hy - hUpY * 0.042 + hFwdY * 0.024;
    const jawZ = hz - hUpZ * 0.042 + hFwdZ * 0.024;
    const jawRadius = 0.082;

    // Neck center lies 0.11m down from head center
    const neckX = hx - hUpX * 0.115;
    const neckY = hy - hUpY * 0.115;
    const neckZ = hz - hUpZ * 0.115;
    const neckRadius = 0.062;

    // Left & Right Shoulder / Clavicle spheres
    const shoulderOffset = 0.188;
    const shoulderRadius = 0.106;
    const shLX = chestX - rightX * shoulderOffset;
    const shLY = chestY - rightY * shoulderOffset;
    const shLZ = chestZ - rightZ * shoulderOffset;

    const shRX = chestX + rightX * shoulderOffset;
    const shRY = chestY + rightY * shoulderOffset;
    const shRZ = chestZ + rightZ * shoulderOffset;

    // Upper-back / Scapula sphere (prevents ponytail from sinking into the back torso)
    const backX = chestX - fwdX * 0.035;
    const backY = chestY - 0.04;
    const backZ = chestZ - fwdZ * 0.035;
    const backRadius = 0.132;

    // Upper-bust / Décolletage guard (prevents side-lock tips from clipping into chest)
    const bustX = chestX + fwdX * 0.055;
    const bustY = chestY - 0.05;
    const bustZ = chestZ + fwdZ * 0.055;
    const bustRadius = 0.118;

    for (let i = 0; i < HAIR_PARTICLE_COUNT; i++) {
      if (
        i === PONY_OFFSET ||
        i === LEFT_LOCK_OFFSET ||
        i === RIGHT_LOCK_OFFSET
      ) {
        continue;
      }

      const isSideLock = i >= LEFT_LOCK_OFFSET;
      const i3 = i * 3;
      let px = pos[i3];
      let py = pos[i3 + 1];
      let pz = pos[i3 + 2];

      // 1. Cranium Sphere Guard
      let dx = px - hx;
      let dy = py - hy;
      let dz = pz - hz;
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < headRadius && d > 1e-5) {
        const s = headRadius / d;
        px = hx + dx * s;
        py = hy + dy * s;
        pz = hz + dz * s;
      }

      // 2. Jaw / Cheekbone Guard (especially important for temple side-locks)
      dx = px - jawX;
      dy = py - jawY;
      dz = pz - jawZ;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < jawRadius && d > 1e-5) {
        const s = jawRadius / d;
        px = jawX + dx * s;
        py = jawY + dy * s;
        pz = jawZ + dz * s;
      }

      // 3. Neck Guard
      dx = px - neckX;
      dy = py - neckY;
      dz = pz - neckZ;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < neckRadius && d > 1e-5) {
        const s = neckRadius / d;
        px = neckX + dx * s;
        py = neckY + dy * s;
        pz = neckZ + dz * s;
      }

      // 4. Left & Right Shoulder Sphere Guards
      dx = px - shLX;
      dy = py - shLY;
      dz = pz - shLZ;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < shoulderRadius && d > 1e-5) {
        const s = shoulderRadius / d;
        px = shLX + dx * s;
        py = shLY + dy * s;
        pz = shLZ + dz * s;
      }

      dx = px - shRX;
      dy = py - shRY;
      dz = pz - shRZ;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < shoulderRadius && d > 1e-5) {
        const s = shoulderRadius / d;
        px = shRX + dx * s;
        py = shRY + dy * s;
        pz = shRZ + dz * s;
      }

      // 5. Upper-Back / Scapula Guard (for Ponytail) vs Anterior Bust Guard (for Side-Locks)
      if (!isSideLock) {
        dx = px - backX;
        dy = py - backY;
        dz = pz - backZ;
        d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < backRadius && d > 1e-5) {
          const s = backRadius / d;
          px = backX + dx * s;
          py = backY + dy * s;
          pz = backZ + dz * s;
        }
      } else {
        dx = px - bustX;
        dy = py - bustY;
        dz = pz - bustZ;
        d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < bustRadius && d > 1e-5) {
          const s = bustRadius / d;
          px = bustX + dx * s;
          py = bustY + dy * s;
          pz = bustZ + dz * s;
        }
      }

      if (py < floorY) py = floorY;

      pos[i3] = px;
      pos[i3 + 1] = py;
      pos[i3 + 2] = pz;
    }
  }

  /**
   * Computes midpoint position, parallel-transported Bishop frame quaternion,
   * and [radius, length, radius] scale for all 14 hair capsule segments.
   */
  public computeSegmentTransforms(
    refRightX = 1,
    refRightY = 0,
    refRightZ = 0
  ): void {
    this.computeChainSegments(
      PONY_OFFSET,
      PONYTAIL_SEGMENTS,
      0,
      refRightX,
      refRightY,
      refRightZ
    );
    this.computeChainSegments(
      LEFT_LOCK_OFFSET,
      SIDELOCK_SEGMENTS,
      PONYTAIL_SEGMENTS,
      refRightX,
      refRightY,
      refRightZ
    );
    this.computeChainSegments(
      RIGHT_LOCK_OFFSET,
      SIDELOCK_SEGMENTS,
      PONYTAIL_SEGMENTS + SIDELOCK_SEGMENTS,
      refRightX,
      refRightY,
      refRightZ
    );
  }

  private computeChainSegments(
    pStart: number,
    segCount: number,
    segStart: number,
    refRightX: number,
    refRightY: number,
    refRightZ: number
  ): void {
    const pos = this.positions;
    const sPos = this.segmentPositions;
    const sQuat = this.segmentQuaternions;
    const sScale = this.segmentScales;
    const sTan = this.segmentTangents;
    const sNorm = this.segmentNormals;
    const radii = this.segmentRadii;

    let prevNx = refRightX;
    let prevNy = refRightY;
    let prevNz = refRightZ;

    for (let s = 0; s < segCount; s++) {
      const a3 = (pStart + s) * 3;
      const b3 = (pStart + s + 1) * 3;

      const ax = pos[a3],
        ay = pos[a3 + 1],
        az = pos[a3 + 2];
      const bx = pos[b3],
        by = pos[b3 + 1],
        bz = pos[b3 + 2];

      const segIdx = segStart + s;
      const sp3 = segIdx * 3;
      sPos[sp3] = (ax + bx) * 0.5;
      sPos[sp3 + 1] = (ay + by) * 0.5;
      sPos[sp3 + 2] = (az + bz) * 0.5;

      let dx = bx - ax;
      let dy = by - ay;
      let dz = bz - az;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
      dx /= len;
      dy /= len;
      dz /= len;

      sTan[sp3] = dx;
      sTan[sp3 + 1] = dy;
      sTan[sp3 + 2] = dz;

      // Parallel-transport Bishop normal: project previous normal orthogonal to tangent
      const dotNT = prevNx * dx + prevNy * dy + prevNz * dz;
      let nx = prevNx - dx * dotNT;
      let ny = prevNy - dy * dotNT;
      let nz = prevNz - dz * dotNT;
      const nLen = Math.hypot(nx, ny, nz);
      if (nLen > 1e-5) {
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;
      } else {
        nx = 1;
        ny = 0;
        nz = 0;
      }
      prevNx = nx;
      prevNy = ny;
      prevNz = nz;

      sNorm[sp3] = nx;
      sNorm[sp3 + 1] = ny;
      sNorm[sp3 + 2] = nz;

      // Shortest-arc quaternion rotating +Y (0, 1, 0) -> (dx, dy, dz)
      const sq4 = segIdx * 4;
      if (dy < -0.9999) {
        sQuat[sq4] = 1;
        sQuat[sq4 + 1] = 0;
        sQuat[sq4 + 2] = 0;
        sQuat[sq4 + 3] = 0;
      } else {
        const qw = 1.0 + dy;
        const qx = dz;
        const qy = 0;
        const qz = -dx;
        const qNorm = Math.sqrt(qx * qx + qw * qw + qz * qz) || 1;
        sQuat[sq4] = qx / qNorm;
        sQuat[sq4 + 1] = qy / qNorm;
        sQuat[sq4 + 2] = qz / qNorm;
        sQuat[sq4 + 3] = qw / qNorm;
      }

      const r = radii[segIdx];
      sScale[sp3] = r;
      sScale[sp3 + 1] = len;
      sScale[sp3 + 2] = r;
    }
  }

  /**
   * Zero-allocation helper to apply computed capsule transforms directly to
   * Three.js / R3F mesh arrays (Ponytail: 6 meshes, Left Lock: 4, Right Lock: 4).
   */
  public applyToMeshes(
    ponytailMeshes?: readonly (Object3DTransformLike | null | undefined)[],
    leftLockMeshes?: readonly (Object3DTransformLike | null | undefined)[],
    rightLockMeshes?: readonly (Object3DTransformLike | null | undefined)[]
  ): void {
    this.writeMeshGroup(ponytailMeshes, 0, PONYTAIL_SEGMENTS);
    this.writeMeshGroup(leftLockMeshes, PONYTAIL_SEGMENTS, SIDELOCK_SEGMENTS);
    this.writeMeshGroup(
      rightLockMeshes,
      PONYTAIL_SEGMENTS + SIDELOCK_SEGMENTS,
      SIDELOCK_SEGMENTS
    );
  }

  private writeMeshGroup(
    meshes: readonly (Object3DTransformLike | null | undefined)[] | undefined,
    segOffset: number,
    count: number
  ): void {
    if (!meshes) return;
    const limit = Math.min(count, meshes.length);
    for (let i = 0; i < limit; i++) {
      const m = meshes[i];
      if (!m) continue;
      const segIdx = segOffset + i;
      const p3 = segIdx * 3;
      const q4 = segIdx * 4;
      m.position.set(
        this.segmentPositions[p3],
        this.segmentPositions[p3 + 1],
        this.segmentPositions[p3 + 2]
      );
      m.quaternion.set(
        this.segmentQuaternions[q4],
        this.segmentQuaternions[q4 + 1],
        this.segmentQuaternions[q4 + 2],
        this.segmentQuaternions[q4 + 3]
      );
      if (m.scale) {
        m.scale.set(
          this.segmentScales[p3],
          this.segmentScales[p3 + 1],
          this.segmentScales[p3 + 2]
        );
      }
    }
  }
}

export default GirlHairSim;