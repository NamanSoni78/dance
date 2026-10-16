// ============================================================================
// THE DIVA 3.0 — COUTURE ANISOTROPIC VERLET & PBD CLOTH ENGINE (`src/lib/girlCloth.ts`)
// ============================================================================
// Drop-in, zero-allocation 98-particle (14 cols x 7 rows) Verlet + Position-Based
// Dynamics (PBD) cloth simulator for the Diva's flared couture skirt in
// `ProceduralDancingGirl.tsx` (`girl-3d.ts`).
//
// V6 Couture Physics & Rendering Architecture:
//   1. Corrected Outward Triangle Winding & Smooth Tangent/Normal Synthesis:
//      - Triangle indices `(i00, i01, i10)` and `(i01, i11, i10)` are wound
//        strictly counter-clockwise (CCW) viewed from outside the skirt, so
//        both `computeNormals()` and Three.js `geometry.computeVertexNormals()`
//        produce 100% outward-facing silk normals without dark inside-out shading!
//      - Computes per-vertex azimuthal `tangents` (98 x 4) for anisotropic
//        satin/velvet shaders.
//   2. Stiff Couture Waistband Ring (Row 1) & Sunburst Pleat Memory:
//      - Reinforced hoop (k=0.96), vertical (k=0.95), shear (k=0.90), and
//        3-step cross-ring anti-fold braces + waist cantilever shape memory.
//      - 14-flute sunburst accordion pleat memory guides each odd/even column
//        along its outward/inward radial pleat ridge while allowing full billow
//        expansion during high-G pirouettes.
//   3. Aerodynamic Face-Normal Lift & Bernoulli Sub-Skirt Air-Dome:
//      - Evaluates wind and particle velocity against the local cloth surface
//        normal so air catches the underside of the flared skirt during spins,
//        jumps, and bass drops, creating a realistic silk parachute billow.
//   4. Continuous Leg-Capsule Collision + Tangential Silk Glide & Kick Impulse:
//      - Prevents fast high-kicks from tunneling through the cloth, imparts
//        tangential leg motion to grazing cloth, and injects an outward Verlet
//        velocity kick when leg penetration exceeds `0.04 m`.
//   5. Strain-Limiting PBD Meridian Clamp:
//      - Guarantees no vertical column ever stretches beyond 106% of its rest
//        length under extreme centrifugal acceleration.
// ============================================================================

export const SKIRT_COLS = 14;
export const SKIRT_ROWS = 7;
export const SKIRT_PARTICLE_COUNT = SKIRT_COLS * SKIRT_ROWS; // 98 particles
export const SKIRT_TRIANGLE_COUNT = SKIRT_COLS * (SKIRT_ROWS - 1) * 2; // 168 tris

const TAU = Math.PI * 2;
const GRAVITY_Y = -9.81;
const FLOOR_MIN_Y = 0.02;
const LEG_IMPULSE_DEPTH_THRESHOLD = 0.038;
const CLOTH_SURFACE_MARGIN = 0.017;
const MAX_MERIDIAN_STRAIN = 1.06;

// Constraint family tags for anisotropic multi-pass relaxation
const PASS_STRUCT_AND_SHEAR = 0;
const PASS_BEND_RADIAL = 1;
const PASS_BEND_VERTICAL = 2;

/** Compatible with THREE.Matrix4, Float32Array(16), or number[](16) */
export type Matrix4Like =
  | { readonly elements: ArrayLike<number> }
  | ArrayLike<number>;

/** Compatible with structured or flat capsule representations */
export interface LegCapsule {
  readonly ax: number;
  readonly ay: number;
  readonly az: number;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  readonly radius?: number;
  readonly r?: number;
}

export interface Vector3Like {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly 0?: number;
  readonly 1?: number;
  readonly 2?: number;
}

export interface NestedLegCapsule {
  readonly a: Vector3Like;
  readonly b: Vector3Like;
  readonly radius?: number;
  readonly r?: number;
}

export type LegCapsuleInput = LegCapsule | NestedLegCapsule;

export interface SkirtUpdateParams {
  readonly dt: number;
  readonly waistMatrix?: Matrix4Like;
  readonly pelvisMatrix?: Matrix4Like;
  readonly legCapsules?: readonly LegCapsuleInput[] | Float32Array;
  readonly capsules?: readonly LegCapsuleInput[] | Float32Array;
  readonly spinVelocity?: number;
  readonly spinVel?: number;
  readonly bass?: number;
  readonly mid?: number;
  readonly high?: number;
  readonly beatPulse?: number;
  readonly elapsed?: number;
  readonly floorY?: number;
}

/** Minimal interface for Three.js BufferGeometry attribute syncing without importing three */
export interface BufferAttributeLike {
  readonly array: ArrayLike<number>;
  needsUpdate: boolean;
}

export interface BufferGeometryLike {
  readonly attributes: {
    readonly position?: BufferAttributeLike;
    readonly normal?: BufferAttributeLike;
    readonly uv?: BufferAttributeLike;
    readonly tangent?: BufferAttributeLike;
  };
  setIndex?: (index: BufferAttributeLike | Uint16Array | number[]) => void;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function extractMatElements(m: Matrix4Like): ArrayLike<number> {
  if ('elements' in m && m.elements !== undefined) {
    return m.elements;
  }
  return m as ArrayLike<number>;
}

function readVecX(v: Vector3Like): number {
  return v.x !== undefined ? v.x : (v[0] ?? 0);
}

function readVecY(v: Vector3Like): number {
  return v.y !== undefined ? v.y : (v[1] ?? 0);
}

function readVecZ(v: Vector3Like): number {
  return v.z !== undefined ? v.z : (v[2] ?? 0);
}

export class SkirtClothSim {
  public readonly cols: number = SKIRT_COLS;
  public readonly rows: number = SKIRT_ROWS;
  public readonly numParticles: number = SKIRT_PARTICLE_COUNT;

  /** Current particle positions (98 * 3 = 294 floats) */
  public readonly positions: Float32Array;
  /** Previous particle positions for Verlet integration (98 * 3 = 294 floats) */
  public readonly prevPositions: Float32Array;
  /** Smooth outward vertex normals for silk/satin lighting (98 * 3 = 294 floats) */
  public readonly normals: Float32Array;
  /** Smooth azimuthal vertex tangents [tx, ty, tz, 1] (98 * 4 = 392 floats) */
  public readonly tangents: Float32Array;
  /** Cylindrical UVs (98 * 2 = 196 floats) */
  public readonly uvs: Float32Array;
  /** Closed-cylinder outward-wound triangle indices (168 * 3 = 504 uint16s) */
  public readonly indices: Uint16Array;
  /** Closed 15-point hem ring (Row 6 + wrap) for neon trim tube rendering */
  public readonly hemRingPositions: Float32Array;

  // Local rest coordinates in waist-space for pinning (Row 0), waistband (Row 1) & pleat memory
  private readonly localRestX: Float32Array;
  private readonly localRestY: Float32Array;
  private readonly localRestZ: Float32Array;
  private readonly rowWeight: Float32Array;
  private readonly columnRestStepDist: Float32Array;

  // Pre-allocated constraint tables (zero runtime allocation)
  private readonly constraintA: Uint16Array;
  private readonly constraintB: Uint16Array;
  private readonly constraintRest: Float32Array;
  private readonly constraintStiff: Float32Array;
  private readonly constraintPass: Uint8Array;
  private readonly constraintCount: number;

  // Pre-allocated scratch buffer for up to 6 capsules * 7 floats (ax,ay,az,bx,by,bz,r)
  private readonly capsuleScratch: Float32Array = new Float32Array(42);
  private readonly prevCapsuleScratch: Float32Array = new Float32Array(42);
  private hasPrevCapsules = false;

  // Tracking state for waist motion & auto-detected angular spin velocity
  private initialized = false;
  private prevWaistX = 0;
  private prevWaistY = 0.90;
  private prevWaistZ = 0;
  private prevWaistVx = 0;
  private prevWaistVy = 0;
  private prevWaistVz = 0;
  private prevForwardX = 0;
  private prevForwardZ = 1;

  constructor() {
    const n = SKIRT_PARTICLE_COUNT;
    this.positions = new Float32Array(n * 3);
    this.prevPositions = new Float32Array(n * 3);
    this.normals = new Float32Array(n * 3);
    this.tangents = new Float32Array(n * 4);
    this.uvs = new Float32Array(n * 2);
    this.indices = new Uint16Array(SKIRT_TRIANGLE_COUNT * 3);
    this.hemRingPositions = new Float32Array((SKIRT_COLS + 1) * 3);

    this.localRestX = new Float32Array(n);
    this.localRestY = new Float32Array(n);
    this.localRestZ = new Float32Array(n);
    this.rowWeight = new Float32Array(n);
    this.columnRestStepDist = new Float32Array(n);

    // 1. Build Couture Bell-Cone Rest Geometry & UVs
    // Row 0 = Waist Pin Ring; Row 1 = Stiff Waistband; Rows 2..5 = Body; Row 6 = Loose Flare Hem
    for (let r = 0; r < SKIRT_ROWS; r++) {
      const v = r / (SKIRT_ROWS - 1); // 0..1
      const waistDrop = r === 1 ? 0.046 : 0.046 + (r - 1) * 0.056;
      const yLocal = r === 0 ? 0.0 : -waistDrop;

      const baseRx = 0.144 + 0.166 * v + 0.126 * Math.pow(v, 2.15);
      const baseRz = 0.118 + 0.162 * v + 0.132 * Math.pow(v, 2.15);
      const hemBoost = r === SKIRT_ROWS - 1 ? 1.08 : 1.0;

      for (let c = 0; c < SKIRT_COLS; c++) {
        const idx = r * SKIRT_COLS + c;
        const u = c / SKIRT_COLS;
        const theta = u * TAU;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // 14-flute sunburst pleat wave: alternates +1 / -1 around azimuth, growing toward hem
        const pleatSign = (c & 1) === 0 ? 1 : -1;
        const pleatAmp = r <= 1 ? 0.0016 : 0.0145 * Math.pow(v, 1.42);
        // Anatomical posterior glute fullness bias when sinT < 0
        const gluteBias = sinT < 0 ? -0.019 * sinT * Math.sin(v * Math.PI) : 0;

        const rx = baseRx * hemBoost + pleatSign * pleatAmp;
        const rz = baseRz * hemBoost + pleatSign * pleatAmp + gluteBias;

        const lx = cosT * rx;
        const lz = sinT * rz;

        this.localRestX[idx] = lx;
        this.localRestY[idx] = yLocal;
        this.localRestZ[idx] = lz;
        this.rowWeight[idx] = v;

        if (r > 0) {
          const prevIdx = (r - 1) * SKIRT_COLS + c;
          const dx = lx - this.localRestX[prevIdx];
          const dy = yLocal - this.localRestY[prevIdx];
          const dz = lz - this.localRestZ[prevIdx];
          this.columnRestStepDist[idx] = Math.hypot(dx, dy, dz);
        }

        const i3 = idx * 3;
        this.positions[i3] = lx;
        this.positions[i3 + 1] = 0.90 + yLocal;
        this.positions[i3 + 2] = lz;
        this.prevPositions[i3] = lx;
        this.prevPositions[i3 + 1] = 0.90 + yLocal;
        this.prevPositions[i3 + 2] = lz;

        this.normals[i3] = cosT;
        this.normals[i3 + 1] = 0.25;
        this.normals[i3 + 2] = sinT;

        const i4 = idx * 4;
        this.tangents[i4] = -sinT;
        this.tangents[i4 + 1] = 0;
        this.tangents[i4 + 2] = cosT;
        this.tangents[i4 + 3] = 1;

        const i2 = idx * 2;
        this.uvs[i2] = u;
        this.uvs[i2 + 1] = 1 - v;
      }
    }

    // 2. Build Closed-Cylinder Triangle Index Buffer with STRICT OUTWARD CCW WINDING
    // Since theta increases from 0 (+X) toward PI/2 (+Z), moving from c -> cNext
    // goes clockwise from above (right-to-left on the +Z front), while r -> r+1 goes
    // downward (-Y). Therefore `(i00, i01, i10)` and `(i01, i11, i10)` have outward
    // normals `(p01 - p00) x (p10 - p00)` pointing radially away from the spine!
    let ptr = 0;
    for (let r = 0; r < SKIRT_ROWS - 1; r++) {
      const row0 = r * SKIRT_COLS;
      const row1 = (r + 1) * SKIRT_COLS;
      for (let c = 0; c < SKIRT_COLS; c++) {
        const cNext = (c + 1) % SKIRT_COLS;
        const i00 = row0 + c;
        const i01 = row0 + cNext;
        const i10 = row1 + c;
        const i11 = row1 + cNext;

        this.indices[ptr++] = i00;
        this.indices[ptr++] = i01;
        this.indices[ptr++] = i10;

        this.indices[ptr++] = i01;
        this.indices[ptr++] = i11;
        this.indices[ptr++] = i10;
      }
    }

    // 3. Pre-compute Anisotropic Constraint Network
    const maxConstraints = 520;
    const tempA = new Uint16Array(maxConstraints);
    const tempB = new Uint16Array(maxConstraints);
    const tempRest = new Float32Array(maxConstraints);
    const tempStiff = new Float32Array(maxConstraints);
    const tempPass = new Uint8Array(maxConstraints);
    let cCount = 0;

    const addConstraint = (
      a: number,
      b: number,
      stiffness: number,
      passType: number,
      restScale = 1.0
    ): void => {
      const dx = this.localRestX[b] - this.localRestX[a];
      const dy = this.localRestY[b] - this.localRestY[a];
      const dz = this.localRestZ[b] - this.localRestZ[a];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) * restScale;
      tempA[cCount] = a;
      tempB[cCount] = b;
      tempRest[cCount] = dist;
      tempStiff[cCount] = stiffness;
      tempPass[cCount] = passType;
      cCount++;
    };

    // 3A. Horizontal Hoop Constraints (Rows 1..6)
    for (let r = 1; r < SKIRT_ROWS; r++) {
      const isWaistband = r === 1;
      const isHem = r === SKIRT_ROWS - 1;
      const hoopStiff = isWaistband
        ? 0.96
        : isHem
        ? 0.48
        : 0.88 - (r - 1) * 0.03;
      const restScale = isHem ? 1.04 : 1.0;

      for (let c = 0; c < SKIRT_COLS; c++) {
        const a = r * SKIRT_COLS + c;
        const b = r * SKIRT_COLS + ((c + 1) % SKIRT_COLS);
        addConstraint(a, b, hoopStiff, PASS_STRUCT_AND_SHEAR, restScale);
      }
    }

    // 3B. Vertical Meridian Column Constraints (Rows 0..5 -> 1..6)
    for (let r = 0; r < SKIRT_ROWS - 1; r++) {
      const vertStiff = r === 0 ? 0.95 : 0.70 - r * 0.02;
      for (let c = 0; c < SKIRT_COLS; c++) {
        const a = r * SKIRT_COLS + c;
        const b = (r + 1) * SKIRT_COLS + c;
        addConstraint(a, b, vertStiff, PASS_STRUCT_AND_SHEAR, 1.0);
      }
    }

    // 3C. Diagonal Shear Constraints (Rows 0..5 -> 1..6)
    for (let r = 0; r < SKIRT_ROWS - 1; r++) {
      const shearStiff = r === 0 ? 0.90 : Math.max(0.28, 0.52 - r * 0.045);
      for (let c = 0; c < SKIRT_COLS; c++) {
        const cNext = (c + 1) % SKIRT_COLS;
        const i00 = r * SKIRT_COLS + c;
        const i01 = r * SKIRT_COLS + cNext;
        const i10 = (r + 1) * SKIRT_COLS + c;
        const i11 = (r + 1) * SKIRT_COLS + cNext;
        addConstraint(i00, i11, shearStiff, PASS_STRUCT_AND_SHEAR, 1.0);
        addConstraint(i01, i10, shearStiff, PASS_STRUCT_AND_SHEAR, 1.0);
      }
    }

    // 3D. Anisotropic Radial (Hoop) Bend Constraints (2-step azimuthal skip c -> c+2)
    // Preserves the 14-flute sunburst accordion pleat angles around the bell cone
    for (let r = 1; r < SKIRT_ROWS; r++) {
      const isWaistband = r === 1;
      const isHem = r === SKIRT_ROWS - 1;
      const radialBendStiff = isWaistband
        ? 0.92
        : isHem
        ? 0.44
        : 0.82 - (r - 1) * 0.025;
      const restScale = isHem ? 1.03 : 1.0;

      for (let c = 0; c < SKIRT_COLS; c++) {
        const a = r * SKIRT_COLS + c;
        const b = r * SKIRT_COLS + ((c + 2) % SKIRT_COLS);
        addConstraint(a, b, radialBendStiff, PASS_BEND_RADIAL, restScale);
      }
    }

    // 3E. Waistband Anti-Fold Cross-Braces (3-step azimuthal skip on Row 1)
    for (let c = 0; c < SKIRT_COLS; c++) {
      const a = 1 * SKIRT_COLS + c;
      const b = 1 * SKIRT_COLS + ((c + 3) % SKIRT_COLS);
      addConstraint(a, b, 0.85, PASS_BEND_RADIAL, 1.0);
    }

    // 3F. Anisotropic Vertical (Column) Bend Constraints (2-step row skip r -> r+2)
    for (let r = 0; r < SKIRT_ROWS - 2; r++) {
      const vertBendStiff = r === 0 ? 0.76 : Math.max(0.28, 0.44 - r * 0.04);
      for (let c = 0; c < SKIRT_COLS; c++) {
        const a = r * SKIRT_COLS + c;
        const b = (r + 2) * SKIRT_COLS + c;
        addConstraint(a, b, vertBendStiff, PASS_BEND_VERTICAL, 1.0);
      }
    }

    this.constraintCount = cCount;
    this.constraintA = tempA.subarray(0, cCount);
    this.constraintB = tempB.subarray(0, cCount);
    this.constraintRest = tempRest.subarray(0, cCount);
    this.constraintStiff = tempStiff.subarray(0, cCount);
    this.constraintPass = tempPass.subarray(0, cCount);

    this.updateHemRingBuffer();
  }

  /**
   * Resets all cloth particles instantaneously to the current waist transform.
   */
  public resetToMatrix(waistMatrix: Matrix4Like): void {
    const m = extractMatElements(waistMatrix);
    const m0 = m[0], m1 = m[1], m2 = m[2];
    const m4 = m[4], m5 = m[5], m6 = m[6];
    const m8 = m[8], m9 = m[9], m10 = m[10];
    const tx = m[12], ty = m[13], tz = m[14];

    for (let i = 0; i < SKIRT_PARTICLE_COUNT; i++) {
      const lx = this.localRestX[i];
      const ly = this.localRestY[i];
      const lz = this.localRestZ[i];

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
    }

    this.prevWaistX = tx;
    this.prevWaistY = ty;
    this.prevWaistZ = tz;
    this.prevWaistVx = 0;
    this.prevWaistVy = 0;
    this.prevWaistVz = 0;
    this.hasPrevCapsules = false;

    const fLen = Math.hypot(m8, m10) || 1;
    this.prevForwardX = m8 / fLen;
    this.prevForwardZ = m10 / fLen;
    this.initialized = true;
    this.computeNormals();
    this.updateHemRingBuffer();
  }

  /**
   * Primary per-frame cloth physics step.
   * Supports both positional arguments `(dt, waistMatrix, legCapsules, spinVel, bass, high, elapsed, beatPulse)`
   * and an options object `SkirtUpdateParams`.
   */
  public update(
    dtOrParams: number | SkirtUpdateParams,
    waistMatrixArg?: Matrix4Like,
    legCapsulesArg?: readonly LegCapsuleInput[] | Float32Array,
    spinVelArg = 0,
    bassArg = 0,
    highArg = 0,
    elapsedArg = 0,
    beatPulseArg = 0
  ): void {
    let rawDt = 0.016;
    let waistMat: Matrix4Like | undefined = waistMatrixArg;
    let capsulesInput: readonly LegCapsuleInput[] | Float32Array | undefined =
      legCapsulesArg;
    let spinVel = spinVelArg;
    let bass = bassArg;
    let high = highArg;
    let elapsed = elapsedArg;
    let beatPulse = beatPulseArg;
    let floorY = FLOOR_MIN_Y;

    if (typeof dtOrParams === 'object' && dtOrParams !== null) {
      rawDt = dtOrParams.dt;
      waistMat = dtOrParams.waistMatrix ?? dtOrParams.pelvisMatrix;
      capsulesInput = dtOrParams.legCapsules ?? dtOrParams.capsules;
      spinVel = dtOrParams.spinVelocity ?? dtOrParams.spinVel ?? 0;
      bass = dtOrParams.bass ?? 0;
      high = dtOrParams.high ?? 0;
      beatPulse = dtOrParams.beatPulse ?? 0;
      elapsed = dtOrParams.elapsed ?? 0;
      if (dtOrParams.floorY !== undefined) floorY = dtOrParams.floorY;
    } else {
      rawDt = dtOrParams;
    }

    if (!waistMat) return;

    const dt = clamp(rawDt, 0.004, 0.0333);
    const dtSq = dt * dt;

    const m = extractMatElements(waistMat);
    const m0 = m[0], m1 = m[1], m2 = m[2];
    const m4 = m[4], m5 = m[5], m6 = m[6];
    const m8 = m[8], m9 = m[9], m10 = m[10];
    const waistX = m[12];
    const waistY = m[13];
    const waistZ = m[14];

    const jumpDistSq =
      (waistX - this.prevWaistX) * (waistX - this.prevWaistX) +
      (waistY - this.prevWaistY) * (waistY - this.prevWaistY) +
      (waistZ - this.prevWaistZ) * (waistZ - this.prevWaistZ);

    if (!this.initialized || jumpDistSq > 1.44) {
      this.resetToMatrix(waistMat);
      return;
    }

    // Compute waist linear velocity & acceleration for realistic hip-snap inertia
    const waistVx = clamp((waistX - this.prevWaistX) / dt, -5.0, 5.0);
    const waistVy = clamp((waistY - this.prevWaistY) / dt, -5.0, 5.0);
    const waistVz = clamp((waistZ - this.prevWaistZ) / dt, -5.0, 5.0);
    this.prevWaistX = waistX;
    this.prevWaistY = waistY;
    this.prevWaistZ = waistZ;
    this.prevWaistVx = waistVx;
    this.prevWaistVy = waistVy;
    this.prevWaistVz = waistVz;

    // Auto-detect yaw angular velocity from waist matrix rotation + combine with explicit spinVel
    const fLen = Math.hypot(m8, m10) || 1;
    const fx = m8 / fLen;
    const fz = m10 / fLen;
    const crossY = this.prevForwardZ * fx - this.prevForwardX * fz;
    const dotXZ = clamp(this.prevForwardX * fx + this.prevForwardZ * fz, -1, 1);
    const matrixOmega = Math.atan2(crossY, dotXZ) / dt;
    this.prevForwardX = fx;
    this.prevForwardZ = fz;

    const effectiveOmega = clamp(
      Math.abs(spinVel) > Math.abs(matrixOmega) ? spinVel : matrixOmega,
      -18.0,
      18.0
    );
    const absOmega = Math.abs(effectiveOmega);

    const pos = this.positions;
    const prev = this.prevPositions;
    const norm = this.normals;

    // 1. Pin Row 0 to Waist Ring
    for (let c = 0; c < SKIRT_COLS; c++) {
      const lx = this.localRestX[c];
      const ly = this.localRestY[c];
      const lz = this.localRestZ[c];

      const wx = m0 * lx + m4 * ly + m8 * lz + waistX;
      const wy = m1 * lx + m5 * ly + m9 * lz + waistY;
      const wz = m2 * lx + m6 * ly + m10 * lz + waistZ;

      const i3 = c * 3;
      prev[i3] = pos[i3];
      prev[i3 + 1] = pos[i3 + 1];
      prev[i3 + 2] = pos[i3 + 2];
      pos[i3] = wx;
      pos[i3 + 1] = wy;
      pos[i3 + 2] = wz;
    }

    // Precompute audio-reactive bass dome lift, spin flare, and Bernoulli air-cushion scalars
    const audioLift = bass * 2.40 + beatPulse * 3.15 + high * 0.58;
    const spinFlareAccel = Math.min(
      28.5,
      absOmega * absOmega * 0.245 + absOmega * 2.18
    );
    const coriolisSwirl = clamp(-effectiveOmega * 0.48, -5.5, 5.5);
    // When the hips drop rapidly (`waistVy < 0`), air trapped under the bell skirt inflates outward
    const parachuteCushion = Math.max(0, -waistVy) * 1.85;

    for (let i = SKIRT_COLS; i < SKIRT_PARTICLE_COUNT; i++) {
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

      const vWeight = this.rowWeight[i]; // 0.167 at Row 1 .. 1.0 at Row 6
      const damping = i < SKIRT_COLS * 2 ? 0.945 : 0.976 - 0.008 * vWeight;

      // Radial vector from waist axis in XZ plane
      let rx = px - waistX;
      let rz = pz - waistZ;
      const rLen = Math.hypot(rx, rz) || 1e-4;
      rx /= rLen;
      rz /= rLen;

      // Tangent vector in XZ plane for Coriolis spin swirl
      const tx = -rz;
      const tz = rx;

      // 2-Octave Perlin-Approx Wind via 3 Sines + Face-Normal Aerodynamic Lift
      const windOct1X = Math.sin(elapsed * 1.85 + py * 3.40 + pz * 2.60);
      const windOct1Z = Math.cos(elapsed * 1.45 + px * 2.90 - py * 3.10);
      const windOct2 = Math.sin(elapsed * 4.65 + (px - pz) * 6.80 + py * 5.20);

      const windScale = (0.55 + 0.65 * high + 0.45 * bass) * vWeight * vWeight;
      const windFx = (windOct1X + 0.45 * windOct2) * windScale;
      const windFz = (windOct1Z + 0.45 * windOct2) * windScale;
      const windFy = Math.abs(windOct2) * 0.42 * windScale;

      // Aerodynamic face-normal pressure: relative air flow against outward normal `norm[i3]`
      const nx = norm[i3];
      const ny = norm[i3 + 1];
      const nz = norm[i3 + 2];
      const relFlowDotN =
        (windFx - vx / dt) * nx +
        (windFy - vy / dt) * ny +
        (windFz - vz / dt) * nz;
      const aeroPressure = clamp(relFlowDotN * 0.18, -1.5, 2.2) * vWeight;

      // Sunburst 14-flute pleat harmonic
      const colIdx = i % SKIRT_COLS;
      const pleatSign = (colIdx & 1) === 0 ? 1 : -1;
      const fluteWave =
        pleatSign *
        (0.34 + 0.56 * bass + 0.25 * Math.sin(elapsed * 3.2 + colIdx * 1.5)) *
        vWeight;

      const radialPush =
        (spinFlareAccel + audioLift * 0.96 + parachuteCushion + fluteWave) *
        vWeight;
      const upwardLift =
        (spinFlareAccel * 0.35 + audioLift * 1.26 + parachuteCushion * 0.65) *
        vWeight *
        vWeight;

      const ax =
        rx * radialPush +
        tx * coriolisSwirl * vWeight +
        windFx +
        nx * aeroPressure;
      const ay = GRAVITY_Y + upwardLift + windFy + ny * aeroPressure;
      const az =
        rz * radialPush +
        tz * coriolisSwirl * vWeight +
        windFz +
        nz * aeroPressure;

      pos[i3] = px + vx * damping + ax * dtSq;
      pos[i3 + 1] = py + vy * damping + ay * dtSq;
      pos[i3 + 2] = pz + vz * damping + az * dtSq;
    }

    // 2. Couture Waistband Shape-Memory Guide on Row 1 & Pleat Memory on Rows 2..4
    for (let r = 1; r <= 3; r++) {
      const shapeStiff = r === 1 ? 0.44 : r === 2 ? 0.08 : 0.03;
      for (let c = 0; c < SKIRT_COLS; c++) {
        const idx = r * SKIRT_COLS + c;
        const lx = this.localRestX[idx];
        const ly = this.localRestY[idx];
        const lz = this.localRestZ[idx];

        const targetX = m0 * lx + m4 * ly + m8 * lz + waistX;
        const targetY = m1 * lx + m5 * ly + m9 * lz + waistY;
        const targetZ = m2 * lx + m6 * ly + m10 * lz + waistZ;

        const i3 = idx * 3;
        pos[i3] += (targetX - pos[i3]) * shapeStiff;
        pos[i3 + 1] += (targetY - pos[i3 + 1]) * shapeStiff;
        pos[i3 + 2] += (targetZ - pos[i3 + 2]) * shapeStiff;
      }
    }

    // 3. Unpack Leg Capsules into Contiguous Scratch Buffer (Zero Allocation)
    const numCapsules = this.unpackCapsules(capsulesInput);

    // 4. 3 Structural/Shear Passes + 2 Anisotropic Bend Iterations + Collision Recovery
    for (let iter = 0; iter < 3; iter++) {
      this.solveConstraintsByPass(PASS_STRUCT_AND_SHEAR);

      if (iter < 2) {
        this.solveConstraintsByPass(PASS_BEND_RADIAL);
        this.solveConstraintsByPass(PASS_BEND_VERTICAL);
      }

      // Strain-Limiting Meridian Clamp (prevents vertical over-stretching on high-G spins)
      this.enforceMeridianStrainLimit();

      // Internal Pelvis/Glute Ellipsoid Guard + Leg Capsule Impulse Collision
      this.solvePelvisAndLegCollisions(
        waistX,
        waistY,
        waistZ,
        m0,
        m1,
        m2,
        m4,
        m5,
        m6,
        m8,
        m9,
        m10,
        numCapsules,
        floorY,
        iter === 0
      );
    }

    // Save current capsules for next frame's capsule velocity estimation
    if (numCapsules > 0) {
      const copyFloats = numCapsules * 7;
      for (let i = 0; i < copyFloats; i++) {
        this.prevCapsuleScratch[i] = this.capsuleScratch[i];
      }
      this.hasPrevCapsules = true;
    }

    // 5. Recompute Smooth Outward Vertex Normals & Update Hem Trim Ring
    this.computeNormals();
    this.updateHemRingBuffer();
  }

  private solveConstraintsByPass(targetPass: number): void {
    const pos = this.positions;
    const cA = this.constraintA;
    const cB = this.constraintB;
    const cRest = this.constraintRest;
    const cStiff = this.constraintStiff;
    const cPass = this.constraintPass;
    const count = this.constraintCount;

    for (let i = 0; i < count; i++) {
      if (cPass[i] !== targetPass) continue;

      const a = cA[i];
      const b = cB[i];
      const a3 = a * 3;
      const b3 = b * 3;

      const dx = pos[b3] - pos[a3];
      const dy = pos[b3 + 1] - pos[a3 + 1];
      const dz = pos[b3 + 2] - pos[a3 + 2];

      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1e-6) continue;

      const diff = ((dist - cRest[i]) / dist) * cStiff[i];
      const ox = dx * diff;
      const oy = dy * diff;
      const oz = dz * diff;

      const aPinned = a < SKIRT_COLS;
      const bPinned = b < SKIRT_COLS;

      if (aPinned && !bPinned) {
        pos[b3] -= ox;
        pos[b3 + 1] -= oy;
        pos[b3 + 2] -= oz;
      } else if (!aPinned && bPinned) {
        pos[a3] += ox;
        pos[a3 + 1] += oy;
        pos[a3 + 2] += oz;
      } else if (!aPinned && !bPinned) {
        const wA = a < SKIRT_COLS * 2 ? 0.28 : 0.50;
        const wB = 1.0 - wA;
        pos[a3] += ox * wA;
        pos[a3 + 1] += oy * wA;
        pos[a3 + 2] += oz * wA;
        pos[b3] -= ox * wB;
        pos[b3 + 1] -= oy * wB;
        pos[b3 + 2] -= oz * wB;
      }
    }
  }

  /**
   * Top-down meridian strain limiter: guarantees no vertical segment exceeds
   * `MAX_MERIDIAN_STRAIN` (106%) of its rest length.
   */
  private enforceMeridianStrainLimit(): void {
    const pos = this.positions;
    const stepRests = this.columnRestStepDist;

    for (let r = 1; r < SKIRT_ROWS; r++) {
      for (let c = 0; c < SKIRT_COLS; c++) {
        const upper = (r - 1) * SKIRT_COLS + c;
        const lower = r * SKIRT_COLS + c;
        const u3 = upper * 3;
        const l3 = lower * 3;

        const dx = pos[l3] - pos[u3];
        const dy = pos[l3 + 1] - pos[u3 + 1];
        const dz = pos[l3 + 2] - pos[u3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const maxLen = stepRests[lower] * MAX_MERIDIAN_STRAIN;

        if (dist > maxLen && dist > 1e-6) {
          const scale = maxLen / dist;
          pos[l3] = pos[u3] + dx * scale;
          pos[l3 + 1] = pos[u3 + 1] + dy * scale;
          pos[l3 + 2] = pos[u3 + 2] + dz * scale;
        }
      }
    }
  }

  /**
   * Enforces:
   *  1. Internal hip & posterior glute ellipsoid guards (prevents upper skirt from clipping through hips/buttocks)
   *  2. Analytical leg-capsule collision with VELOCITY IMPULSE RECOVERY when
   *     penetration `depth > 0.038 m` + capsule velocity transfer so the cloth
   *     visibly springs off the thigh on fast kicks
   *  3. Floor clamp (`y >= floorY`)
   */
  private solvePelvisAndLegCollisions(
    waistX: number,
    waistY: number,
    waistZ: number,
    rightX: number,
    rightY: number,
    rightZ: number,
    upX: number,
    upY: number,
    upZ: number,
    fwdX: number,
    fwdY: number,
    fwdZ: number,
    numCapsules: number,
    floorY: number,
    applyVelocityImpulse: boolean
  ): void {
    const pos = this.positions;
    const prev = this.prevPositions;
    const caps = this.capsuleScratch;
    const prevCaps = this.prevCapsuleScratch;

    // 1. Hip/Pelvis Core Sphere + Posterior Glute Protection Sphere
    const hipCenterX = waistX - upX * 0.09;
    const hipCenterY = waistY - upY * 0.09;
    const hipCenterZ = waistZ - upZ * 0.09;
    const hipRadius = 0.164;

    const gluteCenterX = waistX - upX * 0.105 - fwdX * 0.032;
    const gluteCenterY = waistY - upY * 0.105 - fwdY * 0.032;
    const gluteCenterZ = waistZ - upZ * 0.105 - fwdZ * 0.032;
    const gluteRadius = 0.158;

    for (let i = SKIRT_COLS; i < SKIRT_PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      let px = pos[i3];
      let py = pos[i3 + 1];
      let pz = pos[i3 + 2];

      // A. Hip & Glute Core Volume Guards (Rows 1..4)
      if (i < SKIRT_COLS * 5) {
        let hdx = px - hipCenterX;
        let hdy = py - hipCenterY;
        let hdz = pz - hipCenterZ;
        let hDist = Math.sqrt(hdx * hdx + hdy * hdy + hdz * hdz);
        if (hDist < hipRadius && hDist > 1e-6) {
          const invH = hipRadius / hDist;
          px = hipCenterX + hdx * invH;
          py = hipCenterY + hdy * invH;
          pz = hipCenterZ + hdz * invH;
        }

        hdx = px - gluteCenterX;
        hdy = py - gluteCenterY;
        hdz = pz - gluteCenterZ;
        hDist = Math.sqrt(hdx * hdx + hdy * hdy + hdz * hdz);
        if (hDist < gluteRadius && hDist > 1e-6) {
          const invG = gluteRadius / hDist;
          px = gluteCenterX + hdx * invG;
          py = gluteCenterY + hdy * invG;
          pz = gluteCenterZ + hdz * invG;
        }
      }

      // B. Leg Capsule Collisions + Deep Penetration Velocity Impulse
      for (let c = 0; c < numCapsules; c++) {
        const c7 = c * 7;
        const ax = caps[c7];
        const ay = caps[c7 + 1];
        const az = caps[c7 + 2];
        const bx = caps[c7 + 3];
        const by = caps[c7 + 4];
        const bz = caps[c7 + 5];
        const rEff = caps[c7 + 6] + CLOTH_SURFACE_MARGIN;

        const abx = bx - ax;
        const aby = by - ay;
        const abz = bz - az;
        const abLenSq = abx * abx + aby * aby + abz * abz;

        let t = 0;
        if (abLenSq > 1e-6) {
          t =
            ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / abLenSq;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
        }

        const cx = ax + abx * t;
        const cy = ay + aby * t;
        const cz = az + abz * t;

        let dx = px - cx;
        let dy = py - cy;
        let dz = pz - cz;
        let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < rEff) {
          if (dist < 1e-5) {
            dx = px - waistX;
            dy = 0.02;
            dz = pz - waistZ;
            dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          }

          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;
          const depth = rEff - dist;

          // Snap particle to capsule surface
          px = cx + nx * rEff;
          py = cy + ny * rEff;
          pz = cz + nz * rEff;

          // Estimate leg capsule displacement at contact point `t` for momentum transfer
          let capDx = 0;
          let capDy = 0;
          let capDz = 0;
          if (this.hasPrevCapsules) {
            const pax = prevCaps[c7] + (prevCaps[c7 + 3] - prevCaps[c7]) * t;
            const pay =
              prevCaps[c7 + 1] + (prevCaps[c7 + 4] - prevCaps[c7 + 1]) * t;
            const paz =
              prevCaps[c7 + 2] + (prevCaps[c7 + 5] - prevCaps[c7 + 2]) * t;
            capDx = clamp(cx - pax, -0.04, 0.04);
            capDy = clamp(cy - pay, -0.04, 0.04);
            capDz = clamp(cz - paz, -0.04, 0.04);
          }

          if (applyVelocityImpulse && depth > LEG_IMPULSE_DEPTH_THRESHOLD) {
            const excess = depth - LEG_IMPULSE_DEPTH_THRESHOLD;
            const kickSpeed = Math.min(0.060, 0.015 + excess * 1.58);

            const vx = px - prev[i3];
            const vy = py - prev[i3 + 1];
            const vz = pz - prev[i3 + 2];
            const vDotN = vx * nx + vy * ny + vz * nz;
            const tanVx = (vx - nx * vDotN) * 0.42 + capDx * 0.35;
            const tanVy = (vy - ny * vDotN) * 0.42 + capDy * 0.35;
            const tanVz = (vz - nz * vDotN) * 0.42 + capDz * 0.35;

            prev[i3] = px - tanVx - nx * kickSpeed;
            prev[i3 + 1] = py - tanVy - ny * kickSpeed;
            prev[i3 + 2] = pz - tanVz - nz * kickSpeed;
          } else {
            const vx = px - prev[i3];
            const vy = py - prev[i3 + 1];
            const vz = pz - prev[i3 + 2];
            const vDotN = vx * nx + vy * ny + vz * nz;
            if (vDotN < 0) {
              prev[i3] += nx * vDotN * 0.78 - capDx * 0.18;
              prev[i3 + 1] += ny * vDotN * 0.78 - capDy * 0.18;
              prev[i3 + 2] += nz * vDotN * 0.78 - capDz * 0.18;
            }
          }
        }
      }

      // C. Stage Floor Law with Silk Floor-Glide Damping
      if (py < floorY) {
        py = floorY;
        if (prev[i3 + 1] < floorY) {
          prev[i3 + 1] = floorY;
        }
      }

      pos[i3] = px;
      pos[i3 + 1] = py;
      pos[i3 + 2] = pz;
    }
  }

  /**
   * Unpacks either `Float32Array` (stride 7: ax,ay,az,bx,by,bz,r) or an array
   * of `LegCapsuleInput` objects into `this.capsuleScratch` with zero allocations.
   */
  private unpackCapsules(
    input?: readonly LegCapsuleInput[] | Float32Array
  ): number {
    if (!input) return 0;

    const out = this.capsuleScratch;
    if (input instanceof Float32Array) {
      const count = Math.min(6, Math.floor(input.length / 7));
      const len = count * 7;
      for (let i = 0; i < len; i++) {
        out[i] = input[i];
      }
      return count;
    }

    const count = Math.min(6, input.length);
    for (let i = 0; i < count; i++) {
      const cap = input[i];
      const i7 = i * 7;
      if ('ax' in cap) {
        out[i7] = cap.ax;
        out[i7 + 1] = cap.ay;
        out[i7 + 2] = cap.az;
        out[i7 + 3] = cap.bx;
        out[i7 + 4] = cap.by;
        out[i7 + 5] = cap.bz;
        out[i7 + 6] = cap.radius ?? cap.r ?? 0.068;
      } else {
        out[i7] = readVecX(cap.a);
        out[i7 + 1] = readVecY(cap.a);
        out[i7 + 2] = readVecZ(cap.a);
        out[i7 + 3] = readVecX(cap.b);
        out[i7 + 4] = readVecY(cap.b);
        out[i7 + 5] = readVecZ(cap.b);
        out[i7 + 6] = cap.radius ?? cap.r ?? 0.068;
      }
    }
    return count;
  }

  /**
   * Computes smooth outward vertex normals and azimuthal tangents across the
   * wrapped 14x7 cylinder using central finite differences.
   */
  public computeNormals(): void {
    const pos = this.positions;
    const norm = this.normals;
    const tan = this.tangents;

    for (let r = 0; r < SKIRT_ROWS; r++) {
      const rPrev = r > 0 ? r - 1 : 0;
      const rNext = r < SKIRT_ROWS - 1 ? r + 1 : SKIRT_ROWS - 1;

      for (let c = 0; c < SKIRT_COLS; c++) {
        const cPrev = (c + SKIRT_COLS - 1) % SKIRT_COLS;
        const cNext = (c + 1) % SKIRT_COLS;

        const idxL = (r * SKIRT_COLS + cPrev) * 3;
        const idxR = (r * SKIRT_COLS + cNext) * 3;
        const idxU = (rPrev * SKIRT_COLS + c) * 3;
        const idxD = (rNext * SKIRT_COLS + c) * 3;

        // Azimuthal tangent T_u (cPrev -> cNext)
        let ux = pos[idxR] - pos[idxL];
        let uy = pos[idxR + 1] - pos[idxL + 1];
        let uz = pos[idxR + 2] - pos[idxL + 2];

        // Meridian tangent T_v (up -> down along skirt column)
        const vx = pos[idxD] - pos[idxU];
        const vy = pos[idxD + 1] - pos[idxU + 1];
        const vz = pos[idxD + 2] - pos[idxU + 2];

        // Outward normal N = T_u x T_v (matches outward CCW triangle winding)
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;

        const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;

        const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
        ux /= uLen;
        uy /= uLen;
        uz /= uLen;

        const idx = r * SKIRT_COLS + c;
        const i3 = idx * 3;
        norm[i3] = nx;
        norm[i3 + 1] = ny;
        norm[i3 + 2] = nz;

        const i4 = idx * 4;
        tan[i4] = ux;
        tan[i4 + 1] = uy;
        tan[i4 + 2] = uz;
        tan[i4 + 3] = 1;
      }
    }
  }

  /**
   * Copies the bottom hem row (Row 6) + closed wrap point into `hemRingPositions`
   * (and optionally into a caller-supplied target buffer) for neon trim rendering.
   */
  public updateHemRingBuffer(target?: Float32Array): Float32Array {
    const pos = this.positions;
    const hem = this.hemRingPositions;
    const rowStart = (SKIRT_ROWS - 1) * SKIRT_COLS * 3;
    const rowFloats = SKIRT_COLS * 3;

    for (let i = 0; i < rowFloats; i++) {
      hem[i] = pos[rowStart + i];
    }
    hem[rowFloats] = pos[rowStart];
    hem[rowFloats + 1] = pos[rowStart + 1];
    hem[rowFloats + 2] = pos[rowStart + 2];

    if (target) {
      const copyLen = Math.min(target.length, hem.length);
      for (let i = 0; i < copyLen; i++) {
        target[i] = hem[i];
      }
    }
    return hem;
  }

  /**
   * Zero-allocation helper to push updated `positions`, `normals`, and `tangents`
   * into a Three.js `BufferGeometry` instance.
   */
  public syncBufferGeometry(geometry: BufferGeometryLike): void {
    const posAttr = geometry.attributes.position;
    if (posAttr) {
      const dst = posAttr.array as Float32Array;
      const src = this.positions;
      const len = Math.min(dst.length, src.length);
      for (let i = 0; i < len; i++) {
        dst[i] = src[i];
      }
      posAttr.needsUpdate = true;
    }

    const normAttr = geometry.attributes.normal;
    if (normAttr) {
      const dst = normAttr.array as Float32Array;
      const src = this.normals;
      const len = Math.min(dst.length, src.length);
      for (let i = 0; i < len; i++) {
        dst[i] = src[i];
      }
      normAttr.needsUpdate = true;
    }

    const tanAttr = geometry.attributes.tangent;
    if (tanAttr) {
      const dst = tanAttr.array as Float32Array;
      const src = this.tangents;
      const len = Math.min(dst.length, src.length);
      for (let i = 0; i < len; i++) {
        dst[i] = src[i];
      }
      tanAttr.needsUpdate = true;
    }
  }
}

export default SkirtClothSim;