// %%writefile /content/diva3d/src/components/ProceduralDancingGirl.tsx
import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three-stdlib';
import {
  SkirtClothSim,
  SKIRT_COLS,
  SKIRT_ROWS,
} from '../lib/girlCloth';
import {
  GirlHairSim,
  PONYTAIL_SEGMENTS,
  SIDELOCK_SEGMENTS,
  type HairCarriage,
} from '../lib/girlHair';
import {
  updateGirlFace,
  MAX_JAW_OPEN_RAD,
  type GirlFaceSlot,
  type FaceIntent,
} from '../lib/girlFace';

// ============================================================================
// DIVA 3.0 — ULTRA-REALISTIC PROCEDURAL ADULT DANCER (`girl-3d.ts`)
// ============================================================================
// 100% Procedural Three.js / React Three Fiber Character Engine
// Zero external .glb/.gltf models or external image textures required.
// Coordinate System: +Z forward, +Y up, +X character left; units in meters (~1.71m tall).
//
// Major Architectural Systems:
//   1. Complete Continuous Adult Female Anatomy:
//      - Seamless sculpted neck, clavicles, sternocleidomastoid, ribcage,
//        linea alba, navel/umbilicus, scapulae, lumbar dimples of Venus,
//        and full tear-drop mammary/bust anatomy (including areola, Montgomery
//        tubercles, nipple projection, and inframammary crease) with dynamic
//        3-DOF soft-body vertex deformation.
//      - Complete anatomical pelvis, iliac crests, gluteus maximus/medius,
//        intergluteal cleft, infragluteal fold, mons pubis, inguinal creases,
//        and anatomically closed pudendal/labial & perineal geometry underneath
//        the multi-layer wardrobe.
//      - Sculpted thighs, patellar knees, gastrocnemius/soleus calves, malleoli
//        ankles, Achilles tendons, deltoids, biceps/triceps, forearms, 5-finger
//        3-phalange articulated hands with glossy fingernails, and sculpted
//        5-toed anatomical feet inside fitted couture dance boots.
//   2. Multi-Channel Procedural PBR & Subsurface Scattering Textures:
//      - CPU-synthesized DataTextures for cellular skin pores & Langer lines,
//        melanin/hemoglobin subsurface vascularity, T-zone roughness/sebum,
//        subsurface translucency thickness, radial fibrous iris stroma,
//        episcleral veins, anisotropic keratin hair strands, and satin weave.
//   3. Craniofacial Micro-Sculpting, Multi-Layer Eyes, Oral Cavity & FACS:
//      - Sculpted brow ridge, nasal bridge/nostrils, philtrum, Cupid's bow,
//        malar cheekbones, mandible/chin, 3D anatomical ears with earrings,
//        refractive cornea dome over concave iris & dilating pupil, caruncle,
//        tear meniscus, 28 curved 3D eyelashes per eye, articulated lips,
//        upper/lower teeth arches, tongue, and full `updateGirlFace` integration.
//   4. Multi-Layer Couture Wardrobe & Dual Physics Integration:
//      - Layer 1: Fitted silk-satin intimate bralette & high-cut dance briefs
//        conforming directly over the anatomical bust and pelvis.
//      - Layer 2: Structured sweetheart couture corset bodice with gold boning.
//      - Layer 3: Tailored high-waisted dance shorts & sculpted medallion belt.
//      - Layer 4: 98-particle Verlet flared skirt (`SkirtClothSim`) + neon hem.
//      - Layer 5: Multi-chain Verlet ponytail & temple locks (`GirlHairSim`)
//        combined with 32 secondary spring-physics hair locks & baby-hair wisps.
//   5. 16-Move Biomechanical DSP Choreography & Cat Companion Duet Engine:
//      - Beat-locked phrase state machine, analytical 2-bone leg IK with soft-knee
//        damping, heel-ball-toe foot-roll solver, clavicle auto-shrug, and
//        interactive duet spotting with the dancing cat companion.
// ============================================================================

// V5: fields are MUTABLE — hosts share one snapshot object through a ref and
// update it in place every frame (zero-allocation law); the component copies
// what it needs into its own internal `input` each frame.
export interface DspAudioMetrics {
  bass?: number;
  subBass?: number;
  lowMid?: number;
  mid?: number;
  highMid?: number;
  high?: number;
  brilliance?: number;
  energy?: number;
  beatPulse?: number;
  onset?: number;
  spectralCentroid?: number;
  spectralFlux?: number;
  bpm?: number;
  isPlaying?: boolean;
  catPosition?: readonly [number, number, number];
  partnerYaw?: number;
  faceIntent?: FaceIntent;
  tailCarriage?: HairCarriage;
}

export interface AnatomyCalibrationConfig {
  readonly bustVolumeScale?: number;
  readonly bustFirmness?: number;
  readonly hipCurveScale?: number;
  readonly gluteProjectionScale?: number;
  readonly waistTaperScale?: number;
  readonly muscleToneScale?: number;
  readonly irisColor?: string;
  readonly lipTintColor?: string;
  readonly nailPolishColor?: string;
  readonly intimateLayerColor?: string;
}

export interface WardrobeVisibilityConfig {
  readonly showIntimateLayer?: boolean;
  readonly showCorsetBodice?: boolean;
  readonly showDanceShorts?: boolean;
  readonly showFlaredSkirt?: boolean;
  readonly showDanceBoots?: boolean;
  readonly showJewelry?: boolean;
}

// ============================================================================
// V5 EXTERNAL POSE BRIDGE — the live engine's choreography contract.
//
// When `externalPose.current` is non-null, `simulate()` drives the Diva's
// skeleton from the HOST ENGINE's damped 41-channel JointTargets instead of
// the built-in 16-move glamour synthesizer. The host engine (our
// ProceduralDancingGirl wrapper) keeps the FULL group machinery: 51-move
// solo library, 16 partner duets, 10 spotlights, formations, sync modes,
// Reface-Law spin, slot travel. The DivaBody keeps EVERYTHING anatomical:
// SSS skin, couture wardrobe, FACS face, dual hair physics, soft-body
// bust/glute springs, breathing, leg IK with soft-knee + foot roll.
//
// SEMANTIC CHANNELS (host-authored, body-agnostic — mapped to this rig
// inside simulate): pelvisYOffset (crouch delta vs PELVIS_REST), footLift
// (meters), legStepPitch (rad, + = foot swings back), legStepRoll (lateral
// weight shift), ankleToePitch (rad, + = pointe/toe-down).
// ============================================================================
export interface ExternalDivaPose {
  // --- root / pelvis -------------------------------------------------------
  rootRotY: number;            // spin + facing (their state.spin equivalent)
  pelvisX: number;             // lateral sway offset (m)
  pelvisZ: number;             // fore/aft offset (m)
  pelvisYOffset: number;       // crouch delta vs standing rest (m, - = lower)
  pelvisRotX: number;          // pitch (fwd+)
  pelvisRotY: number;          // hip twist offset ADDED to rootRotY
  pelvisRotZ: number;          // hip roll
  pelvisScaleX: number;
  pelvisScaleY: number;
  pelvisScaleZ: number;
  // --- torso (lowerSpine + chest sum onto the single loft spine) ----------
  spinePitch: number;
  spineYaw: number;
  spineRoll: number;
  chestScale: number;
  // --- head ----------------------------------------------------------------
  neckX: number; neckY: number; neckZ: number;
  headX: number; headY: number; headZ: number;
  // --- arms: two chains. "L" = the rig's -X chain, "R" = +X chain.
  // Values are ALREADY host-damped; the body applies light 120 Hz smoothing.
  shoulderLX: number; shoulderLY: number; shoulderLZ: number;
  elbowLX: number; elbowLY: number;
  wristLX: number; wristLZ: number;
  shoulderRX: number; shoulderRY: number; shoulderRZ: number;
  elbowRX: number; elbowRY: number;
  wristRX: number; wristRZ: number;
  // --- legs (semantic channels — fed to the analytical IK) -----------------
  footLiftL: number; footLiftR: number;        // m of sole raise
  legStepPitchL: number; legStepPitchR: number; // rad, + = foot swings back
  legStepRollL: number; legStepRollR: number;   // lateral weight shift
  hipYawL: number; hipYawR: number;
  ankleToePitchL: number; ankleToePitchR: number; // rad, + = pointe / toe-down
  // --- expression / carriage ----------------------------------------------
  faceIntent?: FaceIntent;
  hairCarriage?: HairCarriage;
  /** Yaw (rad) the face solver should look toward (duet partner). */
  partnerYaw?: number;
  /** True while an authored partner duet is active (gaze + duet face). */
  isDuet: boolean;
}

export interface ProceduralDancingGirlProps {
  readonly audio?:
    | DspAudioMetrics
    | React.MutableRefObject<DspAudioMetrics>;
  readonly bass?: number;
  readonly mid?: number;
  readonly high?: number;
  readonly energy?: number;
  readonly beatPulse?: number;
  readonly bpm?: number;
  readonly isPlaying?: boolean;
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly scale?: number;
  readonly floorY?: number;
  readonly catPosition?: readonly [number, number, number];
  readonly primaryCoutureColor?: string;
  /** V6 GLAM-2: skirt couture color (defaults to deep plum) — lets the gown
   *  read as a two-tone look (wine corset over plum ombré sequin skirt). */
  readonly skirtCoutureColor?: string;
  readonly accentNeonColor?: string;
  readonly skinToneColor?: string;
  readonly hairColor?: string;
  readonly anatomy?: AnatomyCalibrationConfig;
  readonly wardrobe?: WardrobeVisibilityConfig;
  /** Host-engine pose bridge (see ExternalDivaPose). null/absent = built-in. */
  readonly externalPose?: React.MutableRefObject<ExternalDivaPose | null>;
}

// ============================================================================
// SECTION 1: MATHEMATICAL KERNEL, SPLINES, HARMONICS & NOISE ENGINE
// ============================================================================

const PI = Math.PI;
const HALF_PI = Math.PI * 0.5;
const TAU = Math.PI * 2;
const DEG2RAD = Math.PI / 180;
const STEP = 1 / 120;
const THIGH = 0.43;
const SHIN = 0.42;
const UPPER_ARM = 0.278;
const FOREARM = 0.246;
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const RIGHT = new THREE.Vector3(1, 0, 0);
const ZERO_POSITION = [0, 0, 0] as const;
const DEFAULT_CAT_POSITION = [0.68, 0, 0.42] as const;

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

function saturate(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function finite(x: number | undefined, fallback = 0): number {
  return x !== undefined && Number.isFinite(x) ? x : fallback;
}

function unit(x: number | undefined, fallback = 0): number {
  return clamp(finite(x, fallback), 0, 1);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function inverseLerp(a: number, b: number, v: number): number {
  if (Math.abs(b - a) < 1e-8) return 0;
  return clamp((v - a) / (b - a), 0, 1);
}

function smooth(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function smootherstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function bell(x: number, center: number, width: number): number {
  const d = (x - center) / Math.max(1e-6, width);
  return Math.exp(-0.5 * d * d);
}

function asymmetricBell(
  x: number,
  center: number,
  widthLeft: number,
  widthRight: number
): number {
  const w = x < center ? widthLeft : widthRight;
  const d = (x - center) / Math.max(1e-6, w);
  return Math.exp(-0.5 * d * d);
}

function superGaussian(
  x: number,
  center: number,
  width: number,
  power = 4
): number {
  const d = Math.abs((x - center) / Math.max(1e-6, width));
  return Math.exp(-0.5 * Math.pow(d, power));
}

function wendlandC2(distance: number, radius: number): number {
  if (distance >= radius || radius <= 1e-6) return 0;
  const q = distance / radius;
  const omq = 1 - q;
  return omq * omq * omq * omq * (4 * q + 1);
}

function angularBell(theta: number, centerAngle: number, width: number): number {
  let diff = (theta - centerAngle + PI) % TAU;
  if (diff < 0) diff += TAU;
  diff -= PI;
  const d = diff / Math.max(1e-6, width);
  return Math.exp(-0.5 * d * d);
}

function bilateralAngularBell(
  theta: number,
  offsetFromFront: number,
  width: number
): number {
  const left = HALF_PI - offsetFromFront;
  const right = HALF_PI + offsetFromFront;
  return angularBell(theta, left, width) + angularBell(theta, right, width);
}

function bilateralBackAngularBell(
  theta: number,
  offsetFromBack: number,
  width: number
): number {
  const backCenter = 1.5 * PI;
  return (
    angularBell(theta, backCenter - offsetFromBack, width) +
    angularBell(theta, backCenter + offsetFromBack, width)
  );
}

function wrapAngle(angle: number): number {
  let a = (angle + PI) % TAU;
  if (a < 0) a += TAU;
  return a - PI;
}

function dampAngle(
  current: number,
  target: number,
  lambda: number,
  dt: number
): number {
  const delta = wrapAngle(target - current);
  return wrapAngle(current + delta * (1 - Math.exp(-lambda * dt)));
}

function cubicHermite(
  p0: number,
  m0: number,
  p1: number,
  m1: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
}

function catmullRom1D(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function evaluateProfileSpline(knots: readonly number[], tNorm: number): number {
  const n = knots.length;
  if (n === 0) return 0;
  if (n === 1) return knots[0];
  const scaled = clamp(tNorm, 0, 1) * (n - 1);
  const idx = Math.min(n - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const p0 = knots[Math.max(0, idx - 1)];
  const p1 = knots[idx];
  const p2 = knots[idx + 1];
  const p3 = knots[Math.min(n - 1, idx + 2)];
  return catmullRom1D(p0, p1, p2, p3, frac);
}

// ============================================================================
// DETERMINISTIC PRNG & MULTI-OCTAVE PROCEDURAL NOISE SYNTHESIZER
// ============================================================================

class DeterministicRng {
  private state: number;

  constructor(seed = 0x44495641) {
    this.state = seed >>> 0 || 1;
  }

  public nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  public nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  public nextSigned(): number {
    return this.nextFloat() * 2 - 1;
  }

  public range(min: number, max: number): number {
    return min + (max - min) * this.nextFloat();
  }
}

class ProceduralNoiseField {
  private readonly perm: Uint8Array = new Uint8Array(512);
  private readonly gradX: Float32Array = new Float32Array(256);
  private readonly gradY: Float32Array = new Float32Array(256);
  private readonly gradZ: Float32Array = new Float32Array(256);
  private readonly cellX: Float32Array = new Float32Array(256);
  private readonly cellY: Float32Array = new Float32Array(256);

  constructor(seed = 13379421) {
    const rng = new DeterministicRng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
      const theta = rng.nextFloat() * TAU;
      const z = rng.nextSigned();
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      this.gradX[i] = Math.cos(theta) * r;
      this.gradY[i] = Math.sin(theta) * r;
      this.gradZ[i] = z;
      this.cellX[i] = rng.nextFloat();
      this.cellY[i] = rng.nextFloat();
    }
    for (let i = 255; i > 0; i--) {
      const j = rng.nextUint32() % (i + 1);
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private hash2(ix: number, iy: number): number {
    return this.perm[(ix & 255) + this.perm[iy & 255]];
  }

  private hash3(ix: number, iy: number, iz: number): number {
    return this.perm[(ix & 255) + this.perm[(iy & 255) + this.perm[iz & 255]]];
  }

  public perlin2(x: number, y: number, periodX = 256, periodY = 256): number {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const u = x - fx;
    const v = y - fy;

    const ix0 = ((fx % periodX) + periodX) % periodX;
    const iy0 = ((fy % periodY) + periodY) % periodY;
    const ix1 = (ix0 + 1) % periodX;
    const iy1 = (iy0 + 1) % periodY;

    const sx = u * u * u * (u * (u * 6 - 15) + 10);
    const sy = v * v * v * (v * (v * 6 - 15) + 10);

    const h00 = this.hash2(ix0, iy0);
    const h10 = this.hash2(ix1, iy0);
    const h01 = this.hash2(ix0, iy1);
    const h11 = this.hash2(ix1, iy1);

    const n00 = this.gradX[h00] * u + this.gradY[h00] * v;
    const n10 = this.gradX[h10] * (u - 1) + this.gradY[h10] * v;
    const n01 = this.gradX[h01] * u + this.gradY[h01] * (v - 1);
    const n11 = this.gradX[h11] * (u - 1) + this.gradY[h11] * (v - 1);

    const nx0 = lerp(n00, n10, sx);
    const nx1 = lerp(n01, n11, sx);
    return lerp(nx0, nx1, sy);
  }

  public perlin3(x: number, y: number, z: number): number {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);

    const u = x - fx;
    const v = y - fy;
    const w = z - fz;

    const sx = u * u * (3 - 2 * u);
    const sy = v * v * (3 - 2 * v);
    const sz = w * w * (3 - 2 * w);

    const h000 = this.hash3(fx, fy, fz);
    const h100 = this.hash3(fx + 1, fy, fz);
    const h010 = this.hash3(fx, fy + 1, fz);
    const h110 = this.hash3(fx + 1, fy + 1, fz);
    const h001 = this.hash3(fx, fy, fz + 1);
    const h101 = this.hash3(fx + 1, fy, fz + 1);
    const h011 = this.hash3(fx, fy + 1, fz + 1);
    const h111 = this.hash3(fx + 1, fy + 1, fz + 1);

    const dot = (h: number, dx: number, dy: number, dz: number) =>
      this.gradX[h] * dx + this.gradY[h] * dy + this.gradZ[h] * dz;

    const n00 = lerp(dot(h000, u, v, w), dot(h100, u - 1, v, w), sx);
    const n10 = lerp(dot(h010, u, v - 1, w), dot(h110, u - 1, v - 1, w), sx);
    const n01 = lerp(dot(h001, u, v, w - 1), dot(h101, u - 1, v, w - 1), sx);
    const n11 = lerp(
      dot(h011, u, v - 1, w - 1),
      dot(h111, u - 1, v - 1, w - 1),
      sx
    );

    return lerp(lerp(n00, n10, sy), lerp(n01, n11, sy), sz);
  }

  public fbm2(
    x: number,
    y: number,
    octaves = 4,
    lacunarity = 2.0,
    gain = 0.5,
    basePeriod = 16
  ): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const p = Math.max(2, Math.round(basePeriod * freq));
      sum += amp * this.perlin2(x * freq, y * freq, p, p);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }

  /**
   * Cellular Worley F1 & F2 distances on a toroidal grid for realistic skin pores,
   * sweat glands, and iris crypt micro-cavities.
   */
  public worley2(
    x: number,
    y: number,
    periodX = 32,
    periodY = 32
  ): { f1: number; f2: number; edge: number } {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    let d1 = 1e9;
    let d2 = 1e9;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = (((ix + dx) % periodX) + periodX) % periodX;
        const cy = (((iy + dy) % periodY) + periodY) % periodY;
        const h = this.hash2(cx, cy);
        const px = dx + this.cellX[h] - fx;
        const py = dy + this.cellY[h] - fy;
        const distSq = px * px + py * py;
        if (distSq < d1) {
          d2 = d1;
          d1 = distSq;
        } else if (distSq < d2) {
          d2 = distSq;
        }
      }
    }

    const f1 = Math.sqrt(d1);
    const f2 = Math.sqrt(d2);
    return { f1, f2, edge: clamp(f2 - f1, 0, 1) };
  }
}

const SHARED_NOISE = new ProceduralNoiseField(918273645);

// ============================================================================
// SECTION 2: MULTI-CHANNEL PROCEDURAL PBR & SUBSURFACE TEXTURE SYNTHESIZER
// ============================================================================
// Generates high-resolution, tileable Three.js DataTextures on CPU startup:
//   - Skin Micro-Pore & Langer Line Normal Map (RGBA)
//   - Skin Subsurface Chromophore Albedo Map (Melanin + Hemoglobin Blush/Vascularity)
//   - Skin Roughness & Sebum Specular Map
//   - Skin Subsurface Scattering Thickness / Translucency Map
//   - Eye Iris Fibrous Stroma, Collarette & Limbal Ring Texture
//   - Sclera Episcleral Capillary Texture
//   - Hair Keratin Anisotropic Strand Texture
//   - Couture Satin Twill Weave & Micro-Sequin Normal/Roughness Texture
// ============================================================================

export interface CharacterTextureBundle {
  readonly skinNormalMap: THREE.DataTexture;
  readonly skinBumpMap: THREE.DataTexture;
  readonly skinSubsurfaceMap: THREE.DataTexture;
  readonly skinRoughnessMap: THREE.DataTexture;
  readonly skinThicknessMap: THREE.DataTexture;
  readonly irisMap: THREE.DataTexture;
  readonly irisBumpMap: THREE.DataTexture;
  readonly scleraMap: THREE.DataTexture;
  readonly hairStrandMap: THREE.DataTexture;
  readonly hairNormalMap: THREE.DataTexture;
  readonly fabricNormalMap: THREE.DataTexture;
  readonly fabricRoughnessMap: THREE.DataTexture;
  disposeAll: () => void;
}

function finalizeDataTexture(
  data: Uint8Array,
  width: number,
  height: number,
  repeatX = 1,
  repeatY = 1,
  isSRGB = false
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  if (isSRGB) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

// ============================================================================
// V6 GLAM-2 — PROCEDURAL SEQUIN COUTURE MAPS
// ============================================================================
// One 256x256 tileable atlas per garment drives three material slots at once:
//   albedo (SRGB, RGB) : base fabric + champagne-gold paillette discs + ombré
//   roughness (G chan) : satin body matte vs mirror-polished discs
//   metalness (B chan) : dielectric satin vs metallic gold paillettes
// The discs use deterministic per-cell hashes (no RNG state — the pattern is
// stable across reloads) and the grid divides the tile exactly (32/64 across)
// so the RepeatWrapping seam is invisible. `hemDust` ramps disc density up
// toward texture y = 0 — the skirt's hem — for the classic ombré sequin gown.

interface SequinMaps {
  albedoMap: THREE.DataTexture;
  roughnessMetalMap: THREE.DataTexture;
}

function makeSequinMaps(
  base: THREE.Color,
  opts: {
    dotsAcross: number;
    dotRadius: number;
    goldIntensity: number;
    hemDust: number;
    brightJitter: number;
  }
): SequinMaps {
  const size = 256;
  const albedo = new Uint8Array(size * size * 4);
  const roughMetal = new Uint8Array(size * size * 4);
  const pitch = size / opts.dotsAcross;

  const champagne = new THREE.Color('#f2cf94');
  const roseGold = new THREE.Color('#e0a273');
  const dotTint = new THREE.Color();
  const px = new THREE.Color();

  for (let y = 0; y < size; y++) {
    // Ombré: 0 at the waist (texture top) -> hemDust at the hem (texture y=0)
    const hemMix = Math.pow(1 - y / size, 1.6) * opts.hemDust;
    for (let x = 0; x < size; x++) {
      const gx = x / pitch;
      const gy = y / pitch;
      const cellX = Math.floor(gx);
      const cellY = Math.floor(gy);

      // Deterministic per-cell hashes (stable, seam-safe)
      const h1 = Math.abs(Math.sin(cellX * 127.1 + cellY * 311.7) * 0.8501) % 1;
      const h2 = Math.abs(Math.sin(cellX * 269.5 + cellY * 183.3) * 0.6503) % 1;

      // Slight per-cell center jitter so the grid never reads as rigid
      const jx = (h1 - 0.5) * 0.22;
      const jy = (h2 - 0.5) * 0.22;
      const fx = gx - cellX - 0.5 - jx;
      const fy = gy - cellY - 0.5 - jy;
      const dist = Math.sqrt(fx * fx + fy * fy) / opts.dotRadius;

      // Soft disc with a sparkling core; some cells rest (organic variation,
      // fewer near the waist where the satin body should dominate)
      const restGate = 0.86 - hemMix * 0.45;
      const disc = h1 > restGate ? 0 : Math.pow(saturate(1 - dist), 1.35);
      const a = disc * opts.goldIntensity;

      // Albedo: ombré-warmed base blended toward the gold paillette tone
      px.copy(base).lerp(champagne, 0.05 + hemMix * 0.10);
      dotTint
        .copy(champagne)
        .lerp(roseGold, h2)
        .multiplyScalar(1 - opts.brightJitter * 0.5 + h1 * opts.brightJitter);
      px.lerp(dotTint, a);

      const idx = (y * size + x) * 4;
      albedo[idx] = Math.round(saturate(px.r) * 255);
      albedo[idx + 1] = Math.round(saturate(px.g) * 255);
      albedo[idx + 2] = Math.round(saturate(px.b) * 255);
      albedo[idx + 3] = 255;

      // G = roughness (satin 0.42 -> mirror disc 0.10), B = metalness
      const g = 0.42 - 0.32 * a;
      const b = 0.05 + 0.88 * a;
      roughMetal[idx] = 0;
      roughMetal[idx + 1] = Math.round(g * 255);
      roughMetal[idx + 2] = Math.round(b * 255);
      roughMetal[idx + 3] = 255;
    }
  }

  return {
    albedoMap: finalizeDataTexture(albedo, size, size, 1, 1, true),
    roughnessMetalMap: finalizeDataTexture(roughMetal, size, size, 1, 1, false),
  };
}

function buildCharacterTextures(
  baseSkinHex: string,
  baseIrisHex: string,
  baseHairHex: string
): CharacterTextureBundle {
  const skinBaseColor = new THREE.Color(baseSkinHex);
  const irisBaseColor = new THREE.Color(baseIrisHex);
  const hairBaseColor = new THREE.Color(baseHairHex);

  // 1. Skin Micro-Pore Normal Map + Height Bump Map + Roughness Map (128x128 tileable)
  const skinSize = 128;
  const heightField = new Float32Array(skinSize * skinSize);
  const bumpBytes = new Uint8Array(skinSize * skinSize * 4);
  const normalBytes = new Uint8Array(skinSize * skinSize * 4);
  const roughBytes = new Uint8Array(skinSize * skinSize * 4);

  for (let y = 0; y < skinSize; y++) {
    const v = y / skinSize;
    for (let x = 0; x < skinSize; x++) {
      const u = x / skinSize;
      const worley = SHARED_NOISE.worley2(u * 24, v * 24, 24, 24);
      const microWorley = SHARED_NOISE.worley2(u * 48, v * 48, 48, 48);

      // Epidermal pore cavity depression + polygonal skin plateau (cristae cutis)
      const porePit = Math.exp(-worley.f1 * worley.f1 * 14.0);
      const microFurrow = 1.0 - smooth(0.0, 0.22, microWorley.edge);
      // Anisotropic diagonal Langer cleavage lines (sulci cutis)
      const langerWaveA = Math.sin((u * 18 + v * 14) * TAU) * 0.5 + 0.5;
      const langerWaveB = Math.sin((u * 14 - v * 18) * TAU) * 0.5 + 0.5;
      const langerGroove = (langerWaveA * 0.5 + langerWaveB * 0.5) * 0.14;
      const macroNoise = SHARED_NOISE.fbm2(u * 8, v * 8, 3, 2.0, 0.5, 8) * 0.18;

      const h = clamp(
        0.65 - porePit * 0.42 - microFurrow * 0.18 - langerGroove + macroNoise,
        0,
        1
      );
      const idx = y * skinSize + x;
      heightField[idx] = h;

      const bVal = Math.round(h * 255);
      const p4 = idx * 4;
      bumpBytes[p4] = bVal;
      bumpBytes[p4 + 1] = bVal;
      bumpBytes[p4 + 2] = bVal;
      bumpBytes[p4 + 3] = 255;

      // Roughness: pore interiors are slightly more sebaceous/glossy; plateaus are velvety
      const rVal = clamp(0.46 + (h - 0.5) * 0.22 - porePit * 0.10, 0.24, 0.78);
      const rByte = Math.round(rVal * 255);
      roughBytes[p4] = rByte;
      roughBytes[p4 + 1] = rByte;
      roughBytes[p4 + 2] = rByte;
      roughBytes[p4 + 3] = 255;
    }
  }

  // Sobel normal extraction from heightField
  const normalStrength = 2.6;
  for (let y = 0; y < skinSize; y++) {
    const yPrev = (y + skinSize - 1) % skinSize;
    const yNext = (y + 1) % skinSize;
    for (let x = 0; x < skinSize; x++) {
      const xPrev = (x + skinSize - 1) % skinSize;
      const xNext = (x + 1) % skinSize;

      const hL = heightField[y * skinSize + xPrev];
      const hR = heightField[y * skinSize + xNext];
      const hD = heightField[yPrev * skinSize + x];
      const hU = heightField[yNext * skinSize + x];

      let nx = (hL - hR) * normalStrength;
      let ny = (hD - hU) * normalStrength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const p4 = (y * skinSize + x) * 4;
      normalBytes[p4] = Math.round((nx * 0.5 + 0.5) * 255);
      normalBytes[p4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalBytes[p4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalBytes[p4 + 3] = 255;
    }
  }

  // 2. Skin Subsurface Chromophore Albedo & Thickness Maps (128x128 UV-space)
  const subBytes = new Uint8Array(skinSize * skinSize * 4);
  const thickBytes = new Uint8Array(skinSize * skinSize * 4);
  const hemoglobinRed = new THREE.Color('#d95b58');
  const melaninWarm = new THREE.Color('#b57c5e');
  const tempColor = new THREE.Color();

  for (let y = 0; y < skinSize; y++) {
    const v = y / skinSize;
    for (let x = 0; x < skinSize; x++) {
      const u = x / skinSize;
      const vascularNoise =
        SHARED_NOISE.fbm2(u * 6, v * 6, 3, 2.0, 0.5, 6) * 0.5 + 0.5;
      // Subtle anatomical vascular zones (cheeks/chest/joints/palms)
      const blushZone =
        0.22 * bell(v, 0.52, 0.16) +
        0.18 * bell(v, 0.44, 0.12) +
        0.14 * (vascularNoise - 0.5);
      const melaninZone =
        0.12 * bell(v, 0.25, 0.20) + 0.08 * (1 - vascularNoise);

      tempColor
        .copy(skinBaseColor)
        .lerp(hemoglobinRed, clamp(blushZone, 0, 0.28))
        .lerp(melaninWarm, clamp(melaninZone, 0, 0.18));

      const p4 = (y * skinSize + x) * 4;
      subBytes[p4] = Math.round(clamp(tempColor.r, 0, 1) * 255);
      subBytes[p4 + 1] = Math.round(clamp(tempColor.g, 0, 1) * 255);
      subBytes[p4 + 2] = Math.round(clamp(tempColor.b, 0, 1) * 255);
      subBytes[p4 + 3] = 255;

      // Subsurface thickness: thinner on extremities & facial features for warm back-scattering
      const translucency = clamp(
        0.58 + 0.25 * Math.sin(v * PI) + 0.12 * (vascularNoise - 0.5),
        0.15,
        0.95
      );
      const tByte = Math.round(translucency * 255);
      thickBytes[p4] = tByte;
      thickBytes[p4 + 1] = Math.round(translucency * 210);
      thickBytes[p4 + 2] = Math.round(translucency * 185);
      thickBytes[p4 + 3] = 255;
    }
  }

  // 3. High-Resolution Iris Fibrous Stroma, Collarette & Limbal Ring Texture (128x128)
  const irisSize = 128;
  const irisBytes = new Uint8Array(irisSize * irisSize * 4);
  const irisBumpBytes = new Uint8Array(irisSize * irisSize * 4);
  const amberCollarette = new THREE.Color('#b8894a');
  const limbalDark = new THREE.Color('#182224');
  const pupilBlack = new THREE.Color('#07080a');

  for (let y = 0; y < irisSize; y++) {
    const ny = (y / (irisSize - 1)) * 2 - 1;
    for (let x = 0; x < irisSize; x++) {
      const nx = (x / (irisSize - 1)) * 2 - 1;
      const r = Math.hypot(nx, ny);
      const theta = Math.atan2(ny, nx);
      const normTheta = (theta + PI) / TAU;

      // Radial trabecular fibers + Fuchs crypts
      const fiberLow = Math.sin(theta * 38 + SHARED_NOISE.perlin2(normTheta * 16, r * 6, 16, 16) * 2.4);
      const fiberHigh = Math.sin(theta * 84 - SHARED_NOISE.perlin2(normTheta * 32, r * 10, 32, 32) * 1.8);
      const radialFibers = 0.5 + 0.30 * fiberLow + 0.20 * fiberHigh;

      // Collarette zig-zag ring around r = 0.42
      const collaretteRadius = 0.42 + 0.04 * Math.sin(theta * 14);
      const collaretteMask = bell(r, collaretteRadius, 0.095);
      const limbalMask = smooth(0.76, 0.98, r);
      const pupilMask = 1.0 - smooth(0.18, 0.25, r);

      tempColor
        .copy(irisBaseColor)
        .multiplyScalar(0.72 + radialFibers * 0.52)
        .lerp(amberCollarette, collaretteMask * 0.58)
        .lerp(limbalDark, limbalMask * 0.88)
        .lerp(pupilBlack, pupilMask);

      const p4 = (y * irisSize + x) * 4;
      irisBytes[p4] = Math.round(clamp(tempColor.r, 0, 1) * 255);
      irisBytes[p4 + 1] = Math.round(clamp(tempColor.g, 0, 1) * 255);
      irisBytes[p4 + 2] = Math.round(clamp(tempColor.b, 0, 1) * 255);
      irisBytes[p4 + 3] = 255;

      const bumpH = clamp(0.5 + radialFibers * 0.35 + collaretteMask * 0.25 - pupilMask * 0.5, 0, 1);
      const ib = Math.round(bumpH * 255);
      irisBumpBytes[p4] = ib;
      irisBumpBytes[p4 + 1] = ib;
      irisBumpBytes[p4 + 2] = ib;
      irisBumpBytes[p4 + 3] = 255;
    }
  }

  // 4. Sclera Vascular Capillary Texture (128x128)
  const scleraBytes = new Uint8Array(irisSize * irisSize * 4);
  const scleraBase = new THREE.Color('#f4efe8');
  const scleraEdgeWarm = new THREE.Color('#e6c8c2');
  const capillaryRed = new THREE.Color('#c85a5a');

  for (let y = 0; y < irisSize; y++) {
    const v = y / irisSize;
    for (let x = 0; x < irisSize; x++) {
      const u = x / irisSize;
      const veinField = Math.abs(SHARED_NOISE.fbm2(u * 12, v * 12, 3, 2.2, 0.5, 12));
      const veinLine = Math.exp(-veinField * 36.0) * smooth(0.35, 0.85, Math.abs(v - 0.5) * 2);
      const cornerWarmth = smooth(0.25, 0.95, Math.abs(u - 0.5) * 2) * 0.32;

      tempColor
        .copy(scleraBase)
        .lerp(scleraEdgeWarm, cornerWarmth)
        .lerp(capillaryRed, clamp(veinLine * 0.35, 0, 0.35));

      const p4 = (y * irisSize + x) * 4;
      scleraBytes[p4] = Math.round(clamp(tempColor.r, 0, 1) * 255);
      scleraBytes[p4 + 1] = Math.round(clamp(tempColor.g, 0, 1) * 255);
      scleraBytes[p4 + 2] = Math.round(clamp(tempColor.b, 0, 1) * 255);
      scleraBytes[p4 + 3] = 255;
    }
  }

  // 5. Anisotropic Hair Strand Albedo & Normal Map (128x128)
  const hairSize = 128;
  const hairBytes = new Uint8Array(hairSize * hairSize * 4);
  const hairNormBytes = new Uint8Array(hairSize * hairSize * 4);
  const hairTipWarm = hairBaseColor.clone().lerp(new THREE.Color('#a87454'), 0.28);

  for (let y = 0; y < hairSize; y++) {
    const v = y / hairSize;
    for (let x = 0; x < hairSize; x++) {
      const u = x / hairSize;
      const strandFine = Math.sin(u * 64 * TAU + SHARED_NOISE.perlin2(u * 16, v * 4, 16, 4) * 1.5);
      const strandClump = Math.sin(u * 14 * TAU + SHARED_NOISE.perlin2(u * 8, v * 2, 8, 2));
      const strandVal = 0.5 + 0.28 * strandFine + 0.22 * strandClump;

      // Subtle root-to-tip ombre + individual strand melanin variation
      const rootDarken = smooth(0.0, 0.18, v);
      tempColor
        .copy(hairBaseColor)
        .lerp(hairTipWarm, Math.pow(1 - v, 1.6) * 0.45)
        .multiplyScalar((0.68 + 0.52 * strandVal) * (0.75 + 0.25 * rootDarken));

      const p4 = (y * hairSize + x) * 4;
      hairBytes[p4] = Math.round(clamp(tempColor.r, 0, 1) * 255);
      hairBytes[p4 + 1] = Math.round(clamp(tempColor.g, 0, 1) * 255);
      hairBytes[p4 + 2] = Math.round(clamp(tempColor.b, 0, 1) * 255);
      hairBytes[p4 + 3] = 255;

      const nx = Math.cos(u * 64 * TAU) * 0.45;
      const ny = -0.12;
      const nz = Math.sqrt(Math.max(0.1, 1 - nx * nx - ny * ny));
      hairNormBytes[p4] = Math.round((nx * 0.5 + 0.5) * 255);
      hairNormBytes[p4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      hairNormBytes[p4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      hairNormBytes[p4 + 3] = 255;
    }
  }

  // 6. Couture Satin Twill Weave & Micro-Sequin Normal / Roughness Map (128x128)
  const fabSize = 128;
  const fabNormBytes = new Uint8Array(fabSize * fabSize * 4);
  const fabRoughBytes = new Uint8Array(fabSize * fabSize * 4);

  for (let y = 0; y < fabSize; y++) {
    const v = y / fabSize;
    for (let x = 0; x < fabSize; x++) {
      const u = x / fabSize;
      const warp = Math.sin(u * 48 * TAU);
      const weft = Math.sin((v * 48 + u * 16) * TAU);
      const nx = warp * 0.28;
      const ny = weft * 0.22;
      const nz = Math.sqrt(Math.max(0.2, 1 - nx * nx - ny * ny));

      const p4 = (y * fabSize + x) * 4;
      fabNormBytes[p4] = Math.round((nx * 0.5 + 0.5) * 255);
      fabNormBytes[p4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      fabNormBytes[p4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      fabNormBytes[p4 + 3] = 255;

      const sheenVar = clamp(0.32 + 0.12 * (warp * weft), 0.18, 0.55);
      const rb = Math.round(sheenVar * 255);
      fabRoughBytes[p4] = rb;
      fabRoughBytes[p4 + 1] = rb;
      fabRoughBytes[p4 + 2] = rb;
      fabRoughBytes[p4 + 3] = 255;
    }
  }

  const skinNormalMap = finalizeDataTexture(normalBytes, skinSize, skinSize, 6, 6, false);
  const skinBumpMap = finalizeDataTexture(bumpBytes, skinSize, skinSize, 6, 6, false);
  const skinSubsurfaceMap = finalizeDataTexture(subBytes, skinSize, skinSize, 1, 1, true);
  const skinRoughnessMap = finalizeDataTexture(roughBytes, skinSize, skinSize, 6, 6, false);
  const skinThicknessMap = finalizeDataTexture(thickBytes, skinSize, skinSize, 1, 1, false);
  const irisMap = finalizeDataTexture(irisBytes, irisSize, irisSize, 1, 1, true);
  const irisBumpMap = finalizeDataTexture(irisBumpBytes, irisSize, irisSize, 1, 1, false);
  const scleraMap = finalizeDataTexture(scleraBytes, irisSize, irisSize, 1, 1, true);
  const hairStrandMap = finalizeDataTexture(hairBytes, hairSize, hairSize, 3, 1, true);
  const hairNormalMap = finalizeDataTexture(hairNormBytes, hairSize, hairSize, 3, 1, false);
  const fabricNormalMap = finalizeDataTexture(fabNormBytes, fabSize, fabSize, 8, 8, false);
  const fabricRoughnessMap = finalizeDataTexture(fabRoughBytes, fabSize, fabSize, 8, 8, false);

  return {
    skinNormalMap,
    skinBumpMap,
    skinSubsurfaceMap,
    skinRoughnessMap,
    skinThicknessMap,
    irisMap,
    irisBumpMap,
    scleraMap,
    hairStrandMap,
    hairNormalMap,
    fabricNormalMap,
    fabricRoughnessMap,
    disposeAll: () => {
      skinNormalMap.dispose();
      skinBumpMap.dispose();
      skinSubsurfaceMap.dispose();
      skinRoughnessMap.dispose();
      skinThicknessMap.dispose();
      irisMap.dispose();
      irisBumpMap.dispose();
      scleraMap.dispose();
      hairStrandMap.dispose();
      hairNormalMap.dispose();
      fabricNormalMap.dispose();
      fabricRoughnessMap.dispose();
    },
  };
}
// ============================================================================
// SECTION 3: PARAMETRIC LOFTING ENGINE & COMPLETE FEMALE BODY ANATOMY
// ============================================================================
// High-density anatomical surface evaluators with welded cylindrical seams,
// analytical tangent/bitangent smoothing, and complete adult female anatomical
// landmarks (clavicles, sternum, mammary glands with areola/nipple projection,
// ribcage, linea alba, umbilicus, scapulae, spinal furrow, sacral dimples,
// iliac crests, gluteus maximus/medius, infragluteal fold, mons pubis,
// inguinal creases, and complete labial/perineal anatomical closure).
// ============================================================================

type Surface = (
  v: number,
  theta: number,
  out: THREE.Vector3
) => void;

interface AnatomicalCalibrationState {
  readonly bustVolumeScale: number;
  readonly bustFirmness: number;
  readonly hipCurveScale: number;
  readonly gluteProjectionScale: number;
  readonly waistTaperScale: number;
  readonly muscleToneScale: number;
}

const DEFAULT_ANATOMY_CALIBRATION: AnatomicalCalibrationState = {
  bustVolumeScale: 1.0,
  bustFirmness: 1.0,
  hipCurveScale: 1.0,
  gluteProjectionScale: 1.0,
  waistTaperScale: 1.0,
  muscleToneScale: 1.0,
};

function loft(
  radial: number,
  vertical: number,
  evaluate: Surface,
  capped = true
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const stride = radial + 1;

  for (let row = 0; row <= vertical; row++) {
    const v = row / vertical;
    for (let col = 0; col <= radial; col++) {
      const theta = ((col % radial) / radial) * TAU;
      evaluate(v, theta, point);
      positions.push(point.x, point.y, point.z);
      uv.push(col / radial, v);
    }
  }

  for (let row = 0; row < vertical; row++) {
    for (let col = 0; col < radial; col++) {
      const a = row * stride + col;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  if (capped) {
    for (let end = 0; end < 2; end++) {
      const row = end === 0 ? 0 : vertical;
      let cx = 0;
      let cy = 0;
      let cz = 0;

      for (let col = 0; col < radial; col++) {
        const i = (row * stride + col) * 3;
        cx += positions[i];
        cy += positions[i + 1];
        cz += positions[i + 2];
      }

      const centerIndex = positions.length / 3;
      positions.push(cx / radial, cy / radial, cz / radial);
      uv.push(0.5, 0.5);

      const edgeStart = positions.length / 3;

      for (let col = 0; col <= radial; col++) {
        const i = (row * stride + col) * 3;
        positions.push(positions[i], positions[i + 1], positions[i + 2]);

        const angle = (col / radial) * TAU;
        uv.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
      }

      for (let col = 0; col < radial; col++) {
        if (end === 0) {
          indices.push(centerIndex, edgeStart + col, edgeStart + col + 1);
        } else {
          indices.push(centerIndex, edgeStart + col + 1, edgeStart + col);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Average both sides of the cylindrical UV seam for seamless lighting.
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;

  for (let row = 0; row <= vertical; row++) {
    const a = row * stride;
    const b = a + radial;

    point
      .set(
        normals.getX(a) + normals.getX(b),
        normals.getY(a) + normals.getY(b),
        normals.getZ(a) + normals.getZ(b)
      )
      .normalize();

    normals.setXYZ(a, point.x, point.y, point.z);
    normals.setXYZ(b, point.x, point.y, point.z);
  }

  return geometry;
}

/**
 * Recomputes smooth normals on a cylindrical loft whose vertices are mutated
 * dynamically at runtime (such as soft-body torso/bust and pelvis/glutes).
 */
function recomputeLoftSeamNormals(
  geometry: THREE.BufferGeometry,
  radial: number,
  vertical: number
): void {
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const stride = radial + 1;
  for (let row = 0; row <= vertical; row++) {
    const a = row * stride;
    const b = a + radial;
    const nx = normals.getX(a) + normals.getX(b);
    const ny = normals.getY(a) + normals.getY(b);
    const nz = normals.getZ(a) + normals.getZ(b);
    const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
    normals.setXYZ(a, nx * inv, ny * inv, nz * inv);
    normals.setXYZ(b, nx * inv, ny * inv, nz * inv);
  }
  normals.needsUpdate = true;
}

// ============================================================================
// 3.1 COMPLETE ANATOMICAL TORSO, NECK & MAMMARY / BUST EVALUATOR
// ============================================================================
// Vertical parameter `v` in [0, 1] spans from lower waist junction (y = 0.0)
// through the navel (v ~ 0.14), narrowest waist (v ~ 0.24), ribcage & xiphoid
// (v ~ 0.42), full bust/mammary glands (v ~ 0.50..0.64), clavicles & deltoid
// yoke (v ~ 0.72), up to the cylindrical neck column (v = 0.76..1.0, y = 0.455m).
// Azimuth `theta` in [0, 2*PI):
//   - theta = PI/2  (+Z): anterior midline (sternum, linea alba, navel)
//   - theta = 0     (+X): left lateral flank
//   - theta = PI    (-X): right lateral flank
//   - theta = 3PI/2 (-Z): posterior midline (spinal furrow)
// ============================================================================

export interface BustSoftBodyOffset {
  leftDx: number;
  leftDy: number;
  leftDz: number;
  rightDx: number;
  rightDy: number;
  rightDz: number;
  breathExpansion: number;
}

const ZERO_BUST_OFFSET: BustSoftBodyOffset = {
  leftDx: 0,
  leftDy: 0,
  leftDz: 0,
  rightDx: 0,
  rightDy: 0,
  rightDz: 0,
  breathExpansion: 0,
};

function evaluateAnatomicalTorso(
  v: number,
  theta: number,
  out: THREE.Vector3,
  cal: AnatomicalCalibrationState = DEFAULT_ANATOMY_CALIBRATION,
  softOffset: BustSoftBodyOffset = ZERO_BUST_OFFSET
): void {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const neckBlend = smooth(0.745, 0.905, v);
  const bodyMask = 1.0 - neckBlend;

  // 1. Coronal & Sagittal Macroeconomic Silhouette Splines
  const waistNarrowing = (0.022 * cal.waistTaperScale) * bell(v, 0.22, 0.14);
  const ribcageWidth = 0.021 * bell(v, 0.54, 0.19);
  const shoulderYokeWidth = 0.026 * asymmetricBell(v, 0.71, 0.095, 0.055);
  const lowerHipFlare = 0.012 * bell(v, 0.03, 0.08);

  const baseWidth =
    0.145 -
    waistNarrowing +
    ribcageWidth +
    shoulderYokeWidth +
    lowerHipFlare +
    softOffset.breathExpansion * 0.004 * bell(v, 0.52, 0.18);

  const baseDepth =
    0.111 -
    0.017 * bell(v, 0.22, 0.17) +
    0.012 * bell(v, 0.52, 0.19) +
    softOffset.breathExpansion * 0.005 * bell(v, 0.50, 0.18);

  // Neck cylinder with trapezius flare at base and sternocleidomastoid V-columns
  const scmColumn =
    neckBlend *
    0.0032 *
    bilateralAngularBell(theta, 0.42 + (1 - v) * 0.35, 0.28);
  const trapeziusSlope =
    smooth(0.68, 0.84, v) *
    (1 - smooth(0.84, 0.96, v)) *
    0.014 *
    Math.pow(Math.abs(c), 1.4);

  const rx = lerp(baseWidth, 0.0445, neckBlend) + trapeziusSlope;
  let rz = lerp(baseDepth, 0.0475, neckBlend) + scmColumn;
  let extraX = 0;
  let extraY = 0;

  // 2. Anterior Anatomy (s > 0: Chest, Mammary Glands, Nipple/Areola, Ribcage, Abdomen, Navel)
  if (s > 0) {
    // 2A. Complete Tear-Drop Anatomical Mammary Glands (Left: c > 0, Right: c < 0)
    // Natural female breast sits roughly between 2nd and 6th ribs (v in 0.40..0.68),
    // with gentle upper-pole slope, fuller lower-lateral pole, and defined inframammary crease.
    const leftBreastAngle = HALF_PI - 0.50;
    const rightBreastAngle = HALF_PI + 0.50;

    const leftAngWeight = angularBell(theta, leftBreastAngle, 0.36);
    const rightAngWeight = angularBell(theta, rightBreastAngle, 0.36);

    // Tear-drop vertical profile: fuller lower pole (v ~ 0.49), sloped upper pole (v ~ 0.58)
    const lowerPoleV = asymmetricBell(v, 0.505, 0.062, 0.115);
    const upperPoleV = bell(v, 0.585, 0.085) * 0.42;
    const breastVerticalEnv = (lowerPoleV + upperPoleV) * bodyMask;

    // Inframammary fold (IMF) sharp anatomical under-crease at v ~ 0.425
    const imfCrease =
      -0.0068 *
      bell(v, 0.422, 0.022) *
      (leftAngWeight + rightAngWeight) *
      bodyMask;

    // Sternum / Cleavage valley depression along midline (theta = PI/2)
    const sternumValley =
      -0.0075 *
      angularBell(theta, HALF_PI, 0.16) *
      bell(v, 0.52, 0.11) *
      bodyMask;

    // Axillary tail of Spence (graceful blend toward lateral pectoralis/deltoid)
    const spenceTail =
      0.0095 *
      bilateralAngularBell(theta, 0.82, 0.24) *
      bell(v, 0.62, 0.065) *
      bodyMask;

    const bustAmp = 0.048 * cal.bustVolumeScale;
    const leftMound = bustAmp * leftAngWeight * breastVerticalEnv;
    const rightMound = bustAmp * rightAngWeight * breastVerticalEnv;

    // Natural slight outward cant of mammary globes + dynamic soft-body jiggle
    rz += leftMound + rightMound + imfCrease + sternumValley + spenceTail;
    extraX +=
      leftMound * (0.18 + softOffset.leftDx) -
      rightMound * (0.18 - softOffset.rightDx);
    extraY +=
      (leftMound * (-0.06 + softOffset.leftDy) +
        rightMound * (-0.06 + softOffset.rightDy)) *
      (2.0 - cal.bustFirmness);
    rz +=
      leftAngWeight * breastVerticalEnv * softOffset.leftDz +
      rightAngWeight * breastVerticalEnv * softOffset.rightDz;

    // 2B. Sculpted Areola Dome, Montgomery Tubercles & Nipple Papilla
    // Centered near the apex of each mammary mound (v = 0.492, theta = PI/2 +- 0.53)
    const nippleV = 0.492;
    const leftNipAngle = HALF_PI - 0.53;
    const rightNipAngle = HALF_PI + 0.53;

    const dLeftAreola = Math.hypot(
      (v - nippleV) / 0.036,
      wrapAngle(theta - leftNipAngle) / 0.165
    );
    const dRightAreola = Math.hypot(
      (v - nippleV) / 0.036,
      wrapAngle(theta - rightNipAngle) / 0.165
    );
    const dAreola = Math.min(dLeftAreola, dRightAreola);

    if (dAreola < 1.35) {
      // Soft slightly raised areolar dome
      const areolaDome = 0.0026 * wendlandC2(dAreola, 1.25) * bodyMask;
      // Central cylindrical/conical nipple papilla projection with tiny lactiferous pit
      const nippleProjection =
        0.0052 * Math.exp(-dAreola * dAreola * 11.5) * bodyMask -
        0.0009 * Math.exp(-dAreola * dAreola * 64.0) * bodyMask;
      // Subtle ring of Montgomery glands around dAreola ~ 0.65
      const montgomeryRing =
        0.00045 *
        bell(dAreola, 0.65, 0.14) *
        (0.5 + 0.5 * Math.cos(theta * 28));

      const sideSign = dLeftAreola < dRightAreola ? 1 : -1;
      const totalApex = (areolaDome + nippleProjection + montgomeryRing) * cal.bustVolumeScale;
      rz += totalApex;
      extraX += sideSign * totalApex * 0.22;
    }

    // 2C. Clavicle (Collarbone) Ridge & Suprasternal Jugular Notch (v ~ 0.715)
    const clavicleV = 0.715 + 0.012 * Math.abs(c);
    const clavicleRidge =
      0.0048 *
      bell(v, clavicleV, 0.022) *
      bilateralAngularBell(theta, 0.48, 0.34) *
      bodyMask;
    const jugularNotch =
      -0.0042 *
      bell(v, 0.712, 0.024) *
      angularBell(theta, HALF_PI, 0.14);
    rz += clavicleRidge + jugularNotch;

    // 2D. Thoracic Costal Arch, Linea Alba, Rectus Abdominis & External Obliques
    const tone = cal.muscleToneScale;
    const lineaAlba =
      -0.0028 *
      tone *
      angularBell(theta, HALF_PI, 0.085) *
      smooth(0.14, 0.24, v) *
      (1 - smooth(0.42, 0.50, v));
    const semilunarisGroove =
      -0.0022 *
      tone *
      bilateralAngularBell(theta, 0.44, 0.11) *
      bell(v, 0.28, 0.13);
    const rectusPad =
      0.0024 *
      tone *
      bilateralAngularBell(theta, 0.22, 0.14) *
      bell(v, 0.29, 0.12) *
      (0.75 + 0.25 * Math.cos((v - 0.16) * 28.0));
    const lowerBellyCurve =
      0.0052 *
      bell(v, 0.095, 0.075) *
      angularBell(theta, HALF_PI, 0.48);

    // 2E. Sculpted Navel / Umbilicus Depression with Superior Hood (v = 0.145, theta = PI/2)
    const dNavel = Math.hypot(
      (v - 0.145) / 0.024,
      wrapAngle(theta - HALF_PI) / 0.095
    );
    const navelPit = -0.0068 * Math.exp(-dNavel * dNavel * 2.8);
    const navelHood =
      0.0018 *
      bell(v, 0.164, 0.014) *
      angularBell(theta, HALF_PI, 0.09);

    rz += lineaAlba + semilunarisGroove + rectusPad + lowerBellyCurve + navelPit + navelHood;
  } else {
    // 3. Posterior Anatomy (s < 0: Scapulae, Erector Spinae, Median Spinal Furrow, Dimples of Venus)
    const backMidAngle = 1.5 * PI;

    // Deep median longitudinal spinal furrow
    const spinalFurrow =
      -0.0065 *
      angularBell(theta, backMidAngle, 0.14) *
      smooth(0.05, 0.18, v) *
      bodyMask;

    // Paravertebral erector spinae columns flanking the spine
    const erectorColumns =
      0.0058 *
      bilateralBackAngularBell(theta, 0.24, 0.18) *
      bell(v, 0.34, 0.24) *
      bodyMask;

    // Scapula (shoulder blade) wings & scapular spine ridge
    const scapulaWing =
      0.0075 *
      bilateralBackAngularBell(theta, 0.48, 0.26) *
      bell(v, 0.58, 0.11) *
      bodyMask;

    // Sacral Dimples of Venus at lower lumbar junction (v ~ 0.045)
    const venusDimples =
      -0.0034 *
      bilateralBackAngularBell(theta, 0.26, 0.11) *
      bell(v, 0.048, 0.028);

    rz += spinalFurrow + erectorColumns + scapulaWing + venusDimples;
  }

  // Natural S-curve thoracic kyphosis / lumbar lordosis sagittal spine offset
  const sagittalSpineZ =
    0.0095 * Math.sin(v * PI) -
    0.0055 * bell(v, 0.20, 0.13) +
    0.0040 * bell(v, 0.88, 0.10);

  out.set(
    c * rx + extraX,
    v * 0.455 + extraY,
    s * rz + sagittalSpineZ
  );
}

function torsoSurface(
  v: number,
  theta: number,
  out: THREE.Vector3
): void {
  evaluateAnatomicalTorso(v, theta, out, DEFAULT_ANATOMY_CALIBRATION, ZERO_BUST_OFFSET);
}

// ============================================================================
// 3.2 COMPLETE ANATOMICAL PELVIS, GLUTEAL, GROIN & PERINEAL EVALUATOR
// ============================================================================
// Vertical parameter `v` in [0, 1] spans from the anatomical perineal/crotch
// apex (v = 0, y = -0.182m) through the subgluteal fold (v ~ 0.22), maximum
// gluteal/trochanteric projection (v ~ 0.48),mons pubis & inguinal creases
// (v ~ 0.35..0.65), up to the iliac crest / lower waist join (v = 1, y = 0.0m).
// Provides a 100% closed, anatomically realistic female pelvis underneath the
// intimate underwear, dance shorts, and Verlet skirt.
// ============================================================================

export interface GluteSoftBodyOffset {
  leftDy: number;
  leftDz: number;
  rightDy: number;
  rightDz: number;
}

const ZERO_GLUTE_OFFSET: GluteSoftBodyOffset = {
  leftDy: 0,
  leftDz: 0,
  rightDy: 0,
  rightDz: 0,
};

function evaluateAnatomicalPelvis(
  v: number,
  theta: number,
  out: THREE.Vector3,
  cal: AnatomicalCalibrationState = DEFAULT_ANATOMY_CALIBRATION,
  gluteOffset: GluteSoftBodyOffset = ZERO_GLUTE_OFFSET
): void {
  const c = Math.cos(theta);
  const s = Math.sin(theta);

  // Smooth anatomical closure at the perineal floor (v -> 0) and seamless waist match (v -> 1)
  const crotchClosure = smooth(0.0, 0.14, v);
  const hipCurve = Math.sin(v * PI);
  const trochanterShelf =
    0.034 * cal.hipCurveScale * asymmetricBell(v, 0.52, 0.28, 0.24);
  const iliacCrestFlare =
    0.0085 * bell(v, 0.84, 0.11) * Math.pow(Math.abs(c), 1.6);

  // Base coronal width and sagittal depth matching torso bottom at v = 1
  const rxBase = lerp(0.036, 0.145, Math.pow(v, 0.58)) + trochanterShelf + iliacCrestFlare;
  let rz = lerp(0.052, 0.111, Math.pow(v, 0.62)) + 0.018 * hipCurve;
  let extraY = 0;

  if (s > 0) {
    // Anterior Pelvis: ASIS hip points, inguinal creases, mons pubis & labial/pudendal contour
    const asisProminence =
      0.0042 *
      bilateralAngularBell(theta, 0.62, 0.18) *
      bell(v, 0.76, 0.09);

    // Oblique inguinal ligament groove separating thigh root from lower abdomen/mons
    const inguinalV = 0.26 + 0.38 * Math.abs(c);
    const inguinalGroove =
      -0.0055 *
      bell(v, inguinalV, 0.045) *
      bilateralAngularBell(theta, 0.52, 0.28);

    // Mons pubis soft anatomical cushion (v in 0.18..0.58 around anterior midline)
    const monsPubis =
      0.0145 *
      asymmetricBell(v, 0.34, 0.16, 0.19) *
      angularBell(theta, HALF_PI, 0.34);

    // Paired labia majora fullness flanking the median pudendal cleft (v in 0.02..0.28)
    const labialFullness =
      0.0068 *
      bell(v, 0.13, 0.095) *
      bilateralAngularBell(theta, 0.14, 0.11);
    const pudendalCleft =
      -0.0054 *
      bell(v, 0.11, 0.095) *
      angularBell(theta, HALF_PI, 0.055);

    rz += asisProminence + inguinalGroove + monsPubis + labialFullness + pudendalCleft;
  } else {
    // Posterior Pelvis: Gluteus Maximus hemispheres, Intergluteal Cleft & Infragluteal Crease
    const backMid = 1.5 * PI;
    const leftGluteWeight = angularBell(theta, backMid + 0.44, 0.38);
    const rightGluteWeight = angularBell(theta, backMid - 0.44, 0.38);

    const gluteVerticalEnv = asymmetricBell(v, 0.44, 0.19, 0.25);
    const gluteAmp = 0.038 * cal.gluteProjectionScale;

    const leftGlute = gluteAmp * leftGluteWeight * gluteVerticalEnv;
    const rightGlute = gluteAmp * rightGluteWeight * gluteVerticalEnv;

    // Deep intergluteal (natal) cleft along posterior midline
    const natalCleft =
      -0.0165 *
      angularBell(theta, backMid, 0.13) *
      smooth(0.04, 0.16, v) *
      (1.0 - smooth(0.76, 0.94, v));

    // Distinct infragluteal fold (under-buttock crease) at v ~ 0.19
    const infraglutealFold =
      -0.0085 *
      bell(v, 0.185, 0.032) *
      (leftGluteWeight + rightGluteWeight);

    rz +=
      leftGlute +
      rightGlute +
      natalCleft +
      infraglutealFold +
      leftGluteWeight * gluteVerticalEnv * gluteOffset.leftDz +
      rightGluteWeight * gluteVerticalEnv * gluteOffset.rightDz;

    extraY +=
      leftGluteWeight * gluteVerticalEnv * gluteOffset.leftDy +
      rightGluteWeight * gluteVerticalEnv * gluteOffset.rightDy;
  }

  // Perineal saddle arch between the left and right thigh roots at v -> 0
  const thighNotchArch =
    0.012 * (1 - crotchClosure) * Math.pow(Math.abs(c), 1.5);

  out.set(
    c * rxBase,
    -0.182 + v * 0.182 + thighNotchArch + extraY,
    s * rz
  );
}

function pelvisSurface(
  v: number,
  theta: number,
  out: THREE.Vector3
): void {
  evaluateAnatomicalPelvis(v, theta, out, DEFAULT_ANATOMY_CALIBRATION, ZERO_GLUTE_OFFSET);
}
// ============================================================================
// 3.3 MULTI-LAYER INTIMATE UNDERWEAR & COUTURE WARDROBE SURFACES
// ============================================================================
// Every garment layer is mathematically derived from the exact underlying
// anatomical surface (`evaluateAnatomicalTorso` / `evaluateAnatomicalPelvis`)
// plus a controlled outward normal offset so clothing fits like tailored couture
// while cleanly covering the anatomical bust and pelvic private regions.
// ============================================================================

/**
 * Layer 1A: Intimate Silk-Satin Bralette / Demi-Cup Under-Layer
 * Closely hugs the anatomical mammary mounds (`v` in [0.415, 0.635]) with a
 * plunging center gore and delicate back band.
 */
function intimateBraletteSurface(
  v: number,
  theta: number,
  out: THREE.Vector3,
  cal: AnatomicalCalibrationState = DEFAULT_ANATOMY_CALIBRATION,
  softOffset: BustSoftBodyOffset = ZERO_BUST_OFFSET
): void {
  const s = Math.sin(theta);
  const frontPlunge =
    s > 0 ? 0.048 * angularBell(theta, HALF_PI, 0.17) : 0;
  const bottomV = 0.412 + frontPlunge * 0.25;
  const topV =
    s > 0
      ? 0.638 - frontPlunge + 0.024 * bilateralAngularBell(theta, 0.50, 0.28)
      : 0.545;

  const mappedV = lerp(bottomV, topV, v);
  evaluateAnatomicalTorso(mappedV, theta, out, cal, softOffset);

  // 2.1 mm outward normal offset over skin so the bralette never z-fights
  const offset = 0.0021;
  out.x += Math.cos(theta) * offset;
  out.z += Math.sin(theta) * offset;
}

/**
 * Layer 1B: Intimate High-Cut Silk-Satin Dance Briefs / Panty Under-Layer
 * Conforms directly over the anatomical pelvis, mons pubis, labial/perineal
 * floor, and gluteal crease with French-cut leg openings.
 */
function intimateBriefsSurface(
  v: number,
  theta: number,
  out: THREE.Vector3,
  cal: AnatomicalCalibrationState = DEFAULT_ANATOMY_CALIBRATION,
  gluteOffset: GluteSoftBodyOffset = ZERO_GLUTE_OFFSET
): void {
  const c = Math.cos(theta);
  // High-cut French leg arch on the lateral hips (`|cos(theta)|` near 1)
  const lateralLegArch = 0.36 * Math.pow(Math.abs(c), 2.2);
  const bottomV = clamp(0.002 + lateralLegArch, 0.002, 0.48);
  const topV = 0.68 - 0.06 * Math.pow(Math.sin(theta), 2);

  const mappedV = lerp(bottomV, topV, v);
  evaluateAnatomicalPelvis(mappedV, theta, out, cal, gluteOffset);

  const offset = 0.0020;
  out.x += Math.cos(theta) * offset;
  out.z += Math.sin(theta) * offset;
  if (v < 0.08) {
    out.y -= 0.0015 * (1 - v / 0.08);
  }
}

/**
 * Layer 2: Structured Sweetheart Couture Corset Bodice
 * Derived directly from `evaluateAnatomicalTorso` with a sculpted sweetheart
 * neckline, contoured princess seams, and Basque waist dip.
 */
function bodiceSurface(
  v: number,
  theta: number,
  out: THREE.Vector3,
  cal: AnatomicalCalibrationState = DEFAULT_ANATOMY_CALIBRATION,
  softOffset: BustSoftBodyOffset = ZERO_BUST_OFFSET
): void {
  const s = Math.sin(theta);
  // Basque V-waist dip at anterior midline
  const basqueDip = s > 0 ? -0.032 * angularBell(theta, HALF_PI, 0.28) : 0;
  const bottom = 0.135 + basqueDip;

  // Sweetheart neckline curve across the upper bust cups
  const sweetheartCleft =
    s > 0 ? -0.052 * angularBell(theta, HALF_PI, 0.18) : 0;
  const cupArch =
    s > 0 ? 0.028 * bilateralAngularBell(theta, 0.48, 0.28) : 0;
  const top =
    s > 0
      ? 0.695 + cupArch + sweetheartCleft
      : 0.635 - 0.035 * angularBell(theta, 1.5 * PI, 0.38);

  const mappedV = lerp(bottom, top, v);
  evaluateAnatomicalTorso(mappedV, theta, out, cal, softOffset);

  // Subtle vertical corset boning ridges (8 channels around torso)
  const boningRidge = 0.0007 * Math.pow(Math.cos(theta * 4), 8);
  const offset = 0.0046 + boningRidge;
  out.x += Math.cos(theta) * offset;
  out.z += Math.sin(theta) * offset;
}

/**
 * Layer 3: Tailored High-Waisted Couture Dance Shorts
 * Conforms over the complete anatomical pelvis and intimate briefs.
 */
function shortsPelvisSurface(
  v: number,
  theta: number,
  out: THREE.Vector3,
  cal: AnatomicalCalibrationState = DEFAULT_ANATOMY_CALIBRATION,
  gluteOffset: GluteSoftBodyOffset = ZERO_GLUTE_OFFSET
): void {
  evaluateAnatomicalPelvis(v, theta, out, cal, gluteOffset);
  const seamWelt = 0.0006 * angularBell(Math.abs(Math.cos(theta)), 1.0, 0.08);
  const offset = 0.0044 + seamWelt;
  out.x += Math.cos(theta) * offset;
  out.z += Math.sin(theta) * offset;
  if (v < 0.05) {
    out.y -= 0.0025 * (1 - v / 0.05);
  }
}

// ============================================================================
// 3.4 ANATOMICAL LOWER & UPPER LIMB SURFACE EVALUATORS
// ============================================================================
// Side-aware evaluators sculpting asymmetric medial/lateral muscle bellies:
//   - Thigh: Vastus medialis (VMO teardrop), rectus femoris, vastus lateralis
//     sweep, sartorius groove, adductor magnus, and hamstring bellies.
//   - Shin/Calf: Gastrocnemius medial (lower/fuller) and lateral heads, soleus,
//     anterior tibial crest, medial/lateral malleoli (ankle bones), and Achilles.
//   - Upper Arm & Forearm: Deltoid cap, biceps brachii, triceps horseshoe,
//     brachioradialis, extensor carpi, and ulnar styloid wrist prominence.
// ============================================================================

function makeThighSurface(side = 1): Surface {
  return (v, theta, out) => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // Medial (+1 when pointing toward body midline, -1 when lateral)
    const medial = -side * c;

    // Base conical taper from hip root (v=1) to knee epicondyles (v=0)
    const baseRadius =
      0.047 +
      0.032 * Math.pow(v, 0.82) +
      0.005 * bell(v, 0.66, 0.22);

    // Vastus Medialis Obliquus (VMO) teardrop just above medial knee (v ~ 0.24)
    const vmoTeardrop =
      medial > 0 && s > -0.2
        ? 0.0052 * Math.pow(medial, 1.4) * Math.max(0, s + 0.2) * bell(v, 0.24, 0.13)
        : 0;

    // Vastus Lateralis outer sweep along middle-upper lateral thigh (v ~ 0.58)
    const vastusLateralis =
      medial < 0
        ? 0.0058 * Math.pow(-medial, 1.5) * bell(v, 0.58, 0.24)
        : 0;

    // Rectus femoris anterior bow
    const rectusFemoris =
      s > 0 ? 0.0075 * Math.pow(s, 1.6) * Math.sin(v * PI) : 0;

    // Adductor magnus upper inner thigh fullness (prevents robotic gap)
    const adductorFullness =
      medial > 0
        ? 0.0065 * Math.pow(medial, 1.3) * asymmetricBell(v, 0.78, 0.22, 0.16)
        : 0;

    // Hamstring (biceps femoris / semitendinosus) posterior fullness & popliteal hollow
    const hamstring =
      s < 0
        ? 0.0092 * Math.pow(-s, 1.4) * bell(v, 0.56, 0.25) -
          0.0042 * Math.pow(-s, 2.2) * bell(v, 0.08, 0.07)
        : 0;

    const rx = baseRadius + vmoTeardrop + vastusLateralis + adductorFullness;
    const rz = baseRadius * 1.05 + rectusFemoris + hamstring;

    // Slight natural femoral carrying angle & anterior bow
    const antBowZ = 0.0042 * Math.sin(v * PI);

    out.set(
      c * rx,
      -THIGH * (1 - v),
      s * rz + antBowZ
    );
  };
}

function thighSurface(
  v: number,
  theta: number,
  out: THREE.Vector3
): void {
  makeThighSurface(1)(v, theta, out);
}

function makeShinSurface(side = 1): Surface {
  return (v, theta, out) => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const medial = -side * c;

    // Base radius from ankle (v=0) up to tibial plateau (v=1)
    const baseRadius =
      0.0265 +
      0.0175 * Math.pow(v, 0.88) +
      0.0075 * bell(v, 0.66, 0.18);

    // Gastrocnemius medial head (sits slightly lower & projects deeper) vs lateral head
    const gastrocMedial =
      s < 0 && medial > -0.2
        ? 0.0145 * Math.pow(-s, 1.5) * clamp(medial + 0.35, 0, 1) * bell(v, 0.64, 0.17)
        : 0;
    const gastrocLateral =
      s < 0 && medial < 0.2
        ? 0.0122 * Math.pow(-s, 1.5) * clamp(-medial + 0.35, 0, 1) * bell(v, 0.69, 0.16)
        : 0;

    // Soleus lower calf taper & Achilles tendon cord narrowing near v ~ 0.12..0.28
    const achillesPinch =
      s < 0
        ? -0.0038 * Math.abs(c) * Math.pow(-s, 1.2) * bell(v, 0.16, 0.09) +
          0.0028 * Math.pow(-s, 6.0) * bell(v, 0.14, 0.10)
        : 0;

    // Anterior tibial crest (shinbone ridge) & tibial tuberosity below knee
    const tibialCrest =
      s > 0
        ? 0.0026 * Math.pow(s, 8.0) * smooth(0.18, 0.88, v) +
          0.0032 * Math.pow(s, 4.0) * bell(v, 0.88, 0.06)
        : 0;

    // Medial Malleolus (higher, v ~ 0.065) & Lateral Malleolus (lower, v ~ 0.045) ankle bones
    const medialMalleolus =
      medial > 0.5
        ? 0.0052 * Math.pow((medial - 0.5) * 2, 2) * bell(v, 0.065, 0.032)
        : 0;
    const lateralMalleolus =
      medial < -0.5
        ? 0.0048 * Math.pow((-medial - 0.5) * 2, 2) * bell(v, 0.046, 0.030)
        : 0;

    const rx =
      baseRadius +
      medialMalleolus +
      lateralMalleolus +
      (gastrocMedial + gastrocLateral) * 0.28 +
      achillesPinch;
    const rz =
      baseRadius +
      gastrocMedial +
      gastrocLateral +
      tibialCrest;

    out.set(
      c * rx,
      -SHIN * (1 - v),
      s * rz - 0.0032 * Math.sin(v * PI)
    );
  };
}

function shinSurface(
  v: number,
  theta: number,
  out: THREE.Vector3
): void {
  makeShinSurface(1)(v, theta, out);
}

/**
 * Sculpted anatomical knee joint (patella shield, patellar ligament, condyles,
 * and posterior popliteal fossa).
 */
function kneeJointSurface(
  v: number,
  theta: number,
  out: THREE.Vector3
): void {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const env = Math.sin(v * PI);
  const rx = 0.0465 * Math.pow(env, 0.42) * (1 + 0.06 * Math.pow(c, 2));
  let rz = 0.0475 * Math.pow(env, 0.42);

  if (s > 0) {
    // Patella (kneecap) shield prominence
    rz += 0.0055 * Math.pow(s, 3.0) * bell(v, 0.54, 0.22);
  } else {
    // Popliteal fossa (back-of-knee hollow between hamstring tendons)
    rz -= 0.0045 * Math.pow(-s, 3.5) * bell(v, 0.50, 0.24);
  }

  out.set(c * rx, (v - 0.5) * 0.088, s * rz);
}

/**
 * Sculpted anatomical upper arm (deltoid insertion, biceps brachii belly,
 * triceps lateral/long head, brachial groove, humeral epicondyles).
 */
function makeUpperArmSurface(side = 1): Surface {
  return (v, theta, out) => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const lateral = side * c;

    const baseRadius =
      lerp(0.0275, 0.0385, Math.pow(v, 0.85)) +
      0.0038 * bell(v, 0.62, 0.22);

    // Deltoid lateral sweep on upper third (v ~ 0.68..0.96)
    const deltoidCap =
      lateral > 0
        ? 0.0052 * Math.pow(lateral, 1.3) * asymmetricBell(v, 0.78, 0.18, 0.14)
        : 0;

    // Biceps brachii anterior fusiform belly (v ~ 0.46)
    const bicepsBelly =
      s > 0 ? 0.0046 * Math.pow(s, 1.8) * bell(v, 0.46, 0.21) : 0;

    // Triceps brachii posterior contour (v ~ 0.56)
    const tricepsBelly =
      s < 0 ? 0.0048 * Math.pow(-s, 1.6) * bell(v, 0.58, 0.22) : 0;

    const rx = baseRadius + deltoidCap;
    const rz = baseRadius * 1.04 + bicepsBelly + tricepsBelly;

    out.set(c * rx, -UPPER_ARM * (1 - v), s * rz);
  };
}

/**
 * Sculpted anatomical forearm (brachioradialis, pronator teres, flexor/extensor
 * bellies tapering to a slender oval wrist with ulnar styloid bone).
 */
function makeForearmSurface(side = 1): Surface {
  return (v, theta, out) => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const radialSide = -side * c;

    const baseRadius =
      lerp(0.0172, 0.0282, Math.pow(v, 0.78)) +
      0.0042 * bell(v, 0.68, 0.20);

    // Brachioradialis upper radial contour
    const brachioradialis =
      radialSide > 0
        ? 0.0036 * Math.pow(radialSide, 1.4) * bell(v, 0.70, 0.18)
        : 0;

    // Ulnar styloid prominence at the outer wrist (v ~ 0.06)
    const ulnarStyloid =
      radialSide < -0.5
        ? 0.0024 * Math.pow((-radialSide - 0.5) * 2, 2) * bell(v, 0.06, 0.035)
        : 0;

    // Flattened oval wrist cross-section near v -> 0
    const wristFlatten = 1.0 - 0.22 * (1 - smooth(0.0, 0.35, v));
    const rx = baseRadius * (1 + 0.12 * (1 - v)) + brachioradialis + ulnarStyloid;
    const rz = baseRadius * wristFlatten;

    out.set(c * rx, -FOREARM * (1 - v), s * rz);
  };
}

// ============================================================================
// 3.5 ARTICULATED 5-FINGER ANATOMICAL HAND & FINGERNAIL BUILDER
// ============================================================================
// Builds a realistic female hand per wrist pivot:
//   - Sculpted metacarpal palm loft with thenar (thumb base) & hypothenar pads,
//     central palmar hollow, dorsal extensor tendons, and 4 MCP knuckle domes.
//   - 5 fully articulated digits (Thumb, Index, Middle, Ring, Pinky), each with
//     3 hierarchical bone groups (`mcp`, `pip`, `dip`) so fingers curl in natural
//     logarithmic spirals during dance gestures.
//   - Sculpted nail beds and glossy curved French-manicure fingernails on all
//     10 fingers.
// ============================================================================

export interface FingerChainRig {
  readonly mcp: THREE.Group;
  readonly pip: THREE.Group;
  readonly dip: THREE.Group;
  readonly isThumb: boolean;
  readonly fingerIndex: number;
}

function createPalmSurface(side: number): Surface {
  return (v, theta, out) => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const radial = -side * c; // +1 toward thumb side, -1 toward pinky side

    // v = 1 at wrist root (y = 0), v = 0 at MCP knuckle line (y = -0.064)
    const widthEnv = lerp(0.0305, 0.0215, Math.pow(v, 0.85));
    const depthEnv = lerp(0.0095, 0.0128, v);

    // Thenar eminence (fleshy thumb pad on palmar-radial side)
    const thenarPad =
      s > 0 && radial > 0
        ? 0.0048 * Math.pow(s, 1.3) * Math.pow(radial, 1.2) * bell(v, 0.58, 0.26)
        : 0;

    // Hypothenar eminence (pinky-side palmar pad)
    const hypothenarPad =
      s > 0 && radial < 0
        ? 0.0034 * Math.pow(s, 1.3) * Math.pow(-radial, 1.4) * bell(v, 0.52, 0.28)
        : 0;

    // Central palmar hollow (cup of the palm)
    const palmarHollow =
      s > 0
        ? -0.0022 * Math.pow(s, 2.5) * bell(c, 0, 0.42) * bell(v, 0.44, 0.22)
        : 0;

    // 4 Dorsal MCP knuckle prominences near v = 0.08
    const knuckleWave =
      s < 0
        ? 0.0018 *
          Math.pow(-s, 2.0) *
          bell(v, 0.08, 0.06) *
          (0.5 + 0.5 * Math.cos(c * PI * 3.8))
        : 0;

    const rx = widthEnv + (radial > 0 ? 0.0028 * bell(v, 0.55, 0.25) : 0);
    const rz = depthEnv + thenarPad + hypothenarPad + palmarHollow + knuckleWave;

    // Slight natural palmar arch across the metacarpals
    const archZ = 0.0018 * (1 - c * c) * (1 - v);

    out.set(c * rx, -0.064 * (1 - v), s * rz + archZ);
  };
}

function createPhalanxGeometry(
  length: number,
  radiusProximal: number,
  radiusDistal: number,
  isDistalTip: boolean
): THREE.BufferGeometry {
  return loft(16, 12, (v, theta, out) => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // v = 1 at proximal joint (y = 0), v = 0 at distal tip (y = -length)
    const tipRound = isDistalTip ? Math.pow(smooth(0.0, 0.22, v), 0.55) : 1.0;
    const rBase = lerp(radiusDistal, radiusProximal, v) * tipRound;

    // Slightly flatter on dorsal side, soft pad belly on palmar side (+Z)
    const palmarPad =
      s > 0
        ? 0.0009 * Math.pow(s, 1.5) * bell(v, 0.48, 0.28)
        : -0.0004 * Math.pow(-s, 2.0) * (isDistalTip ? bell(v, 0.30, 0.22) : 0);

    // Subtle PIP/DIP knuckle joint swell near v = 0.90
    const jointSwell = 0.00045 * bell(v, 0.90, 0.08);

    const rx = rBase + jointSwell;
    const rz = rBase * 0.92 + palmarPad + jointSwell * 0.7;

    out.set(c * rx, -length * (1 - v), s * rz);
  });
}

function createFingernailGeometry(
  width: number,
  length: number
): THREE.BufferGeometry {
  return loft(14, 10, (v, theta, out) => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // Curved almond/oval nail plate shell
    const archEnv = Math.pow(Math.sin(v * PI), 0.35);
    const w = width * archEnv * (1 - 0.18 * (1 - v));
    const thickness = 0.00045 * Math.sin(v * PI);
    const transverseCurve = -0.0011 * (1 - c * c);

    out.set(
      c * w,
      -length * (1 - v),
      s * thickness + transverseCurve
    );
  });
}

// ============================================================================
// 3.6 SCULPTED ANATOMICAL FOOT, TOES & COUTURE DANCE BOOT BUILDER
// ============================================================================
// Builds both the complete anatomical foot (calcaneus heel, medial longitudinal
// plantar arch, metatarsal ball, and 5 sculpted toes with toenails) AND the
// tailored high-fashion ankle dance boot worn over it.
// ============================================================================

function anatomicalFootSurface(
  v: number,
  theta: number,
  out: THREE.Vector3,
  side = 1
): void {
  // v = 0 at heel back (z = -0.048), v = 1 at toe-box front (z = +0.118)
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const medial = -side * c;
  const env = Math.pow(Math.sin(v * PI), 0.42);

  // Foot width widens from heel (0.027) to metatarsal ball (v ~ 0.74, width 0.041)
  const width =
    lerp(0.027, 0.041, smooth(0.15, 0.75, v)) *
    (1 - 0.22 * smooth(0.78, 1.0, v)) *
    env;

  // Instep dorsal arch height vs plantar arch hollow
  const instepHeight =
    s > 0
      ? (0.034 * (1 - 0.62 * smooth(0.20, 0.85, v)) +
          0.008 * bell(v, 0.32, 0.18)) *
        env
      : (0.016 -
          (medial > 0 ? 0.0065 * bell(v, 0.48, 0.18) : 0)) *
        env;

  // Slight hallux (big toe) medial bias
  const medialBias = side * (-0.0045 * smooth(0.45, 0.90, v));

  out.set(
    c * width + medialBias,
    -0.036 + s * instepHeight - 0.012 * smooth(0.25, 0.80, v),
    -0.048 + v * 0.162
  );
}

function coutureBootUpperSurface(
  v: number,
  theta: number,
  out: THREE.Vector3,
  side = 1
): void {
  anatomicalFootSurface(v, theta, out, side);
  out.x += Math.cos(theta) * 0.0032;
  out.y += Math.sin(theta) * 0.0032;
  out.z += (v - 0.5) * 0.004;
}
// ============================================================================
// SECTION 4: CRANIOFACIAL MICRO-SCULPTING, EYES, ORAL CAVITY & HAIR
// ============================================================================
// High-resolution parametric head evaluator (`96 x 72` tessellation) with
// anatomical facial landmarks:
//   - Supraorbital brow ridge, glabella, nasion depression, nasal dorsum bridge,
//     rounded nasal tip (pronasale), sculpted alar wings, and nostril cavities.
//   - Malar / zygomatic cheekbone prominence, infraorbital tear trough,
//     buccal cheek contour, philtrum ridges, Cupid's bow depression,
//     labiomental groove, and feminine oval mandible / mental chin contour.
// ============================================================================

function headSurface(
  v: number,
  theta: number,
  out: THREE.Vector3
): void {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const envelope = Math.pow(Math.max(0, Math.sin(v * PI)), 0.56);

  // Feminine heart/oval jaw taper from chin (v ~ 0.05) to zygomatic arch (v ~ 0.46)
  const jawTaper = lerp(0.68, 1.0, smooth(0.03, 0.45, v));
  const templeTaper = 1.0 - 0.045 * bell(v, 0.62, 0.11) * Math.pow(Math.abs(c), 1.6);

  // Mandibular angle (gonial corner) & cheekbone width expansion
  const malarWidth =
    s > -0.15
      ? 0.0048 * bell(v, 0.44, 0.095) * Math.pow(Math.abs(c), 1.4)
      : 0;
  const gonialAngle =
    0.0022 * bell(v, 0.24, 0.065) * Math.pow(Math.abs(c), 1.8);

  const rx = (0.0765 * envelope * jawTaper * templeTaper) + malarWidth + gonialAngle;
  let rz = 0.0875 * envelope;

  if (s > 0) {
    // 1. Zygomatic / Malar Cheek Fullness & Orbital Socket Recess
    const malarCheek =
      0.0064 *
      bell(v, 0.425, 0.098) *
      bilateralAngularBell(theta, 0.46, 0.26);

    const orbitalSocket =
      -0.0046 *
      bell(v, 0.555, 0.064) *
      bilateralAngularBell(theta, 0.34, 0.20);

    // 2. Supraorbital Brow Ridge & Glabella Prominence (v ~ 0.615)
    const browArc =
      0.0032 *
      bell(v, 0.618, 0.038) *
      bilateralAngularBell(theta, 0.32, 0.22);
    const glabella =
      0.0022 *
      bell(v, 0.605, 0.032) *
      angularBell(theta, HALF_PI, 0.11);

    // 3. Nasion Root, Nasal Bridge (Dorsum), Supratip Break, Pronasale Tip & Alar Wings
    const nasalCenterMask = Math.pow(s, 62);
    const nasionRoot = -0.0018 * bell(v, 0.568, 0.022) * nasalCenterMask;
    const nasalBridge = 0.0115 * bell(v, 0.485, 0.068) * nasalCenterMask;
    const nasalTip = 0.0188 * asymmetricBell(v, 0.402, 0.028, 0.038) * nasalCenterMask;

    // Lateral nasal alae (nostril wings) flanking the nasal tip at v ~ 0.392
    const alarWing =
      0.0056 *
      bell(v, 0.392, 0.026) *
      bilateralAngularBell(theta, 0.145, 0.065);

    // Subtle nostril sill cavities underneath the alar wings (v ~ 0.372)
    const nostrilCavity =
      -0.0028 *
      bell(v, 0.372, 0.014) *
      bilateralAngularBell(theta, 0.095, 0.042);

    // 4. Philtrum Columns, Philtral Dimple, Oral Barrel & Labiomental Chin Groove
    const philtrumDimple =
      -0.0018 *
      bell(v, 0.335, 0.024) *
      angularBell(theta, HALF_PI, 0.045);
    const philtrumColumns =
      0.0016 *
      bell(v, 0.332, 0.026) *
      bilateralAngularBell(theta, 0.065, 0.035);
    const oralMuzzle =
      0.0038 *
      bell(v, 0.285, 0.055) *
      angularBell(theta, HALF_PI, 0.26);
    const labiomentalFold =
      -0.0028 *
      bell(v, 0.215, 0.026) *
      angularBell(theta, HALF_PI, 0.19);

    // 5. Mental Protuberance (Sculpted Feminine Chin Cushion, v ~ 0.135)
    const chinCushion =
      0.0058 *
      bell(v, 0.138, 0.052) *
      angularBell(theta, HALF_PI, 0.24);

    rz +=
      malarCheek +
      orbitalSocket +
      browArc +
      glabella +
      nasionRoot +
      nasalBridge +
      nasalTip +
      alarWing +
      nostrilCavity +
      philtrumDimple +
      philtrumColumns +
      oralMuzzle +
      labiomentalFold +
      chinCushion;
  } else {
    // Posterior Cranium: Occipital Bun & Suboccipital Nuchal Hollow
    const occipitalCurve = 0.0072 * bell(v, 0.62, 0.21);
    const nuchalHollow = -0.0038 * bell(v, 0.18, 0.11) * Math.pow(-s, 2.0);
    rz += occipitalCurve + nuchalHollow;
  }

  out.set(
    c * rx,
    -0.110 + v * 0.235,
    s * rz
  );
}

// ============================================================================
// 4.2 SCULPTED 3D ANATOMICAL EAR (HELIX, ANTIHELIX, CONCHA, TRAGUS, LOBULE)
// ============================================================================

function createAnatomicalEarGeometry(side: number): THREE.BufferGeometry {
  return loft(28, 22, (v, theta, out) => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // v = 0 at ear lobule bottom, v = 1 at superior helix apex
    const env = Math.pow(Math.sin(v * PI), 0.44);

    // Outer ear width (anterior-posterior) and thickness (medial-lateral)
    const earDepth = (0.0115 + 0.0035 * smooth(0.25, 0.78, v)) * env;
    let earThickness = 0.0052 * env;

    // Rolled outer helix rim along posterior/superior margin
    const helixRim =
      c * side > 0
        ? 0.0024 * bell(Math.abs(c), 0.85, 0.22) * smooth(0.20, 0.95, v)
        : 0;

    // Deep concha bowl depression in central anterior ear
    const conchaBowl =
      s > 0
        ? -0.0028 * bell(v, 0.48, 0.19) * bell(c, 0, 0.45)
        : 0;

    // Antihelix Y-ridge & tragus prominence
    const antihelix =
      s > 0
        ? 0.0016 * bell(v, 0.56, 0.18) * bell(Math.abs(c), 0.48, 0.18)
        : 0;
    const lobuleFlesh =
      0.0022 * bell(v, 0.14, 0.10) * Math.pow(Math.max(0, s), 1.2);

    earThickness += helixRim + conchaBowl + antihelix + lobuleFlesh;

    // Cant the pinna outward ~22 degrees from the temporal skull
    const rawX = side * earThickness;
    const rawY = -0.022 + v * 0.044;
    const rawZ = c * earDepth - 0.0035 * Math.sin(v * PI);

    out.set(
      rawX + side * Math.max(0, -c) * 0.0045 * env,
      rawY,
      rawZ
    );
  });
}

// ============================================================================
// 4.3 MULTI-LAYER PHOTOREALISTIC EYE, CORNEA, EYELIDS & 3D EYELASHES
// ============================================================================
// Eyelid shells follow an ellipsoidal eyeball with:
//   - Upper tarsal crease fold (supratarsal sulcus)
//   - Independent medial-to-lateral Duchenne lower-lid squint lift
//   - 18 curved 3D upper eyelashes & 10 lower eyelashes anchored directly to
//     the animated lid margin so lashes sweep naturally during blinks!
// ============================================================================

const LID_COLS = 28;
const LID_ROWS = 9;
const EYE_RX = 0.0128;
const EYE_RY = 0.0092;
const EYE_RZ = 0.0123;

function makeLidGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const count = (LID_COLS + 1) * (LID_ROWS + 1);

  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(count * 3), 3)
      .setUsage(THREE.DynamicDrawUsage)
  );
  geometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array(count * 3), 3)
      .setUsage(THREE.DynamicDrawUsage)
  );

  const uvs = new Float32Array(count * 2);
  for (let r = 0; r <= LID_ROWS; r++) {
    for (let c = 0; c <= LID_COLS; c++) {
      const i2 = (r * (LID_COLS + 1) + c) * 2;
      uvs[i2] = c / LID_COLS;
      uvs[i2 + 1] = r / LID_ROWS;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  const indices: number[] = [];

  for (let r = 0; r < LID_ROWS; r++) {
    for (let c = 0; c < LID_COLS; c++) {
      const a = r * (LID_COLS + 1) + c;
      const b = a + LID_COLS + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  geometry.setIndex(indices);
  return geometry;
}

function updateLid(
  geometry: THREE.BufferGeometry,
  closure: number,
  upper: boolean,
  squint = 0,
  lashFanGroup?: THREE.Group
): void {
  const p = geometry.getAttribute('position') as THREE.BufferAttribute;
  const n = geometry.getAttribute('normal') as THREE.BufferAttribute;

  const baseOpen = upper ? 0.68 : -0.49;
  const squintLift = !upper ? squint * 0.24 : -squint * 0.05;
  const opening = clamp((baseOpen + squintLift) * (1 - closure), -0.95, 0.95);
  const edge = Math.asin(opening);
  const pole = upper ? HALF_PI : -HALF_PI;

  for (let row = 0; row <= LID_ROWS; row++) {
    const vRow = row / LID_ROWS;
    const angle = lerp(edge, pole, vRow);

    // Supratarsal double-eyelid crease fold at vRow ~ 0.38 on the upper lid
    const tarsalLip =
      upper && vRow < 0.14
        ? 0.00055 * (1 - vRow / 0.14)
        : 0;
    const tarsalFold =
      upper
        ? -0.00045 * bell(vRow, 0.38, 0.09) * (1 - closure * 0.65)
        : 0;

    for (let col = 0; col <= LID_COLS; col++) {
      const uNorm = col / LID_COLS;
      const u = -HALF_PI + uNorm * PI;
      const cross = Math.cos(u);

      // Almond canthal tilt: lateral canthus sits slightly higher than medial canthus
      const almondArch = Math.sin(uNorm * PI) * (tarsalLip + tarsalFold);

      const x = Math.sin(u) * EYE_RX;
      const y = cross * Math.sin(angle) * EYE_RY;
      const z = cross * Math.cos(angle) * (EYE_RZ + almondArch);

      let nx = x / (EYE_RX * EYE_RX);
      let ny = y / (EYE_RY * EYE_RY);
      let nz = z / (EYE_RZ * EYE_RZ);
      const length = Math.hypot(nx, ny, nz) || 1;

      nx /= length;
      ny /= length;
      nz /= length;

      const i = row * (LID_COLS + 1) + col;
      p.setXYZ(i, x, y, z);
      n.setXYZ(i, nx, ny, nz);
    }
  }

  p.needsUpdate = true;
  n.needsUpdate = true;

  if (lashFanGroup) {
    // Rotate eyelash fan downward with upper lid closure so lashes sweep gracefully
    lashFanGroup.rotation.x = upper
      ? (closure * 0.88 - 0.12)
      : (-closure * 0.35 + squint * 0.18);
  }
}

/**
 * Builds a single multi-strand curved 3D eyelash fan (18 upper lashes or 10 lower lashes)
 * merged into one draw call per eyelid for high performance and close-up realism.
 */
function createEyelashFanGeometry(
  side: number,
  upper: boolean
): THREE.BufferGeometry {
  const lashCount = upper ? 18 : 10;
  const segsPerLash = 6;
  const radialSides = 5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const baseAngle = Math.asin(upper ? 0.64 : -0.46);

  for (let l = 0; l < lashCount; l++) {
    const tLash = l / (lashCount - 1); // 0..1 from medial to lateral canthus
    // Lashes are shorter near medial tear duct, longest toward outer 70% lateral flare
    const uAngle = lerp(-1.12, 1.18, tLash) * side;
    const cross = Math.cos(uAngle);

    const rootX = Math.sin(uAngle) * EYE_RX;
    const rootY = cross * Math.sin(baseAngle) * EYE_RY;
    const rootZ = cross * Math.cos(baseAngle) * EYE_RZ + 0.0003;

    const lengthScale =
      (upper ? 0.0044 : 0.0022) *
      (0.45 + 0.72 * Math.pow(Math.sin(tLash * PI * 0.88), 0.75));
    const baseRadius = upper ? 0.00024 : 0.00015;
    const splayX = side * (tLash - 0.35) * (upper ? 0.0022 : 0.0012);

    const vertOffset = positions.length / 3;
    const ringStride = radialSides + 1;

    for (let s = 0; s <= segsPerLash; s++) {
      const v = s / segsPerLash;
      // Natural upward curl on upper lashes, downward curl on lower lashes
      const forwardDist = v * lengthScale;
      const curlLift = upper
        ? (-0.25 * v + 0.95 * v * v) * lengthScale * 0.85
        : (-0.55 * v - 0.45 * v * v) * lengthScale * 0.65;

      const cx = rootX + splayX * v * v;
      const cy = rootY + curlLift;
      const cz = rootZ + forwardDist;

      const r = baseRadius * (1.0 - 0.88 * Math.pow(v, 0.85));

      for (let k = 0; k <= radialSides; k++) {
        const phi = (k / radialSides) * TAU;
        const ox = Math.cos(phi);
        const oy = Math.sin(phi);

        positions.push(cx + ox * r, cy + oy * r, cz);
        normals.push(ox, oy, 0.35);
        uvs.push(k / radialSides, v);
      }
    }

    for (let s = 0; s < segsPerLash; s++) {
      for (let k = 0; k < radialSides; k++) {
        const a = vertOffset + s * ringStride + k;
        const b = a + ringStride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// ============================================================================
// 4.4 SCULPTED 3D VERMILION LIPS, DENTAL ARCHES & TONGUE GEOMETRY
// ============================================================================
// Replaces primitive lip spheres with continuous anatomical vermilion lip
// lofts featuring a defined Cupid's bow, medial tubercle, lateral commissure
// taper, plus upper/lower dental arches and tongue inside the oral cavity.
// ============================================================================

function createUpperLipGeometry(
  mouthZFn: (x: number, y: number) => number,
  mouthY: number
): THREE.BufferGeometry {
  return loft(36, 16, (v, theta, out) => {
    // v in [0, 1] spans from left commissure (-0.0205) to right commissure (+0.0205)
    const u = (v - 0.5) * 2; // -1..+1 across mouth width
    const x = u * 0.0205;
    const cornerTaper = Math.pow(Math.max(0, 1 - u * u), 0.62);

    // Cupid's bow double-peak on superior border + central vermilion tubercle
    const cupidsBow =
      0.0014 * bell(Math.abs(u), 0.24, 0.16) -
      0.0009 * bell(u, 0, 0.09);
    const medialTubercle = 0.0008 * bell(u, 0, 0.18);

    const thicknessY = (0.0031 * cornerTaper + Math.max(0, Math.sin(theta)) * cupidsBow);
    const thicknessZ = 0.0036 * cornerTaper + medialTubercle;

    const baseZ = mouthZFn(x, mouthY);
    const yCenter = mouthY + 0.0014 * cornerTaper - 0.0008 * u * u;

    out.set(
      x,
      yCenter + Math.sin(theta) * thicknessY,
      baseZ + 0.0016 + Math.cos(theta) * thicknessZ
    );
  });
}

function createLowerLipGeometry(
  mouthZFn: (x: number, y: number) => number,
  mouthY: number
): THREE.BufferGeometry {
  return loft(36, 16, (v, theta, out) => {
    const u = (v - 0.5) * 2;
    const x = u * 0.0198;
    const cornerTaper = Math.pow(Math.max(0, 1 - u * u), 0.58);

    // Fuller plush lower lip cushion with subtle central cleavage groove
    const plushness =
      0.0038 * cornerTaper * (1 + 0.12 * bell(Math.abs(u), 0.22, 0.18));
    const centralDepression = -0.00035 * bell(u, 0, 0.08);

    const baseZ = mouthZFn(x, mouthY - 0.0045);
    const yCenter = mouthY - 0.0042 * cornerTaper + 0.0012 * u * u;

    out.set(
      x,
      yCenter + Math.sin(theta) * plushness * 0.92,
      baseZ + 0.0018 + Math.cos(theta) * (plushness + centralDepression)
    );
  });
}

function createDentalArchGeometry(upper: boolean): THREE.BufferGeometry {
  return loft(28, 10, (v, theta, out) => {
    // Horseshoe dental arch spanning 8 visible anterior teeth (central/lateral incisors, canines, premolars)
    const u = (v - 0.5) * 2; // -1..+1
    const archAngle = u * 1.15;
    const archRx = 0.0145;
    const archRz = 0.0115;

    // Individual tooth crown scallop modulation (8 teeth across arch)
    const toothScallop = 0.00055 * Math.abs(Math.cos(u * PI * 4.0));
    const rTube = 0.0016 + toothScallop;

    const cx = Math.sin(archAngle) * archRx;
    const cz = Math.cos(archAngle) * archRz - archRz;
    const cy = (upper ? 0.0018 : -0.0022) + Math.sin(theta) * rTube;

    out.set(
      cx + Math.sin(archAngle) * Math.cos(theta) * 0.0012,
      cy,
      cz + Math.cos(archAngle) * Math.cos(theta) * 0.0012
    );
  });
}
// ============================================================================
// 4.5 HIGH-GLAMOUR COSMETIC DETAILS: BABY-HAIR EDGES, TEAR MENISCUS,
//     CHEEKBONE HIGHLIGHTER SHELLS, NAVEL GEM & CORSET BAROQUE FILIGREE
// ============================================================================

/**
 * Builds 16 delicate swirled "baby-hair" temple/forehead wisps along the
 * anterior hairline so the transition from forehead skin to scalp hair looks
 * soft, feminine, and editorial rather than a sharp geometric boundary.
 */
function createBabyHairWispsGeometry(
  headSurfaceFn: Surface
): THREE.BufferGeometry {
  const wispCount = 16;
  const segs = 8;
  const radialSides = 4;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const probe = new THREE.Vector3();

  for (let w = 0; w < wispCount; w++) {
    const uWisp = w / (wispCount - 1); // 0..1 across left-to-right temple arc
    const thetaRoot = lerp(0.18, PI - 0.18, uWisp);
    const front = Math.max(0, Math.sin(thetaRoot));
    const templeWave = 0.04 * Math.cos(thetaRoot * 2);
    const rootV = 0.35 + (0.42 + templeWave) * Math.pow(front, 2.2);

    const sideSign = Math.cos(thetaRoot) >= 0 ? 1 : -1;
    const vertOffset = positions.length / 3;
    const stride = radialSides + 1;

    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      // Swirl downward and laterally in a delicate S-curl onto the temple/forehead
      const vCur = rootV - t * (0.042 + 0.018 * Math.abs(Math.cos(thetaRoot)));
      const thetaCur =
        thetaRoot +
        sideSign * (t * 0.11 - Math.sin(t * PI) * 0.065);

      headSurfaceFn(clamp(vCur, 0.1, 0.95), thetaCur, probe);
      const lift = 0.0012 * (1 - t * 0.5);
      const cx = probe.x + Math.cos(thetaCur) * lift;
      const cy = probe.y;
      const cz = probe.z + Math.sin(thetaCur) * lift;

      const r = 0.0011 * (1 - 0.85 * Math.pow(t, 0.8));

      for (let k = 0; k <= radialSides; k++) {
        const phi = (k / radialSides) * TAU;
        const ox = Math.cos(phi);
        const oy = Math.sin(phi);
        positions.push(cx + ox * r, cy + oy * r, cz + 0.0004);
        normals.push(Math.cos(thetaCur), oy * 0.3, Math.sin(thetaCur));
        uvs.push(k / radialSides, t);
      }
    }

    for (let s = 0; s < segs; s++) {
      for (let k = 0; k < radialSides; k++) {
        const a = vertOffset + s * stride + k;
        const b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Builds a glistening wet lacrimal tear-meniscus strip along the lower eyelid
 * margin for realistic stage-light eye catchlights.
 */
function createTearMeniscusGeometry(): THREE.BufferGeometry {
  const pathPts: THREE.Vector3[] = [];
  const edgeAngle = Math.asin(-0.46);
  for (let i = 0; i <= 16; i++) {
    const u = -HALF_PI * 0.82 + (i / 16) * PI * 0.82;
    const cross = Math.cos(u);
    pathPts.push(
      new THREE.Vector3(
        Math.sin(u) * EYE_RX,
        cross * Math.sin(edgeAngle) * EYE_RY + 0.0003,
        cross * Math.cos(edgeAngle) * EYE_RZ + 0.0006
      )
    );
  }
  const curvePath = new THREE.CatmullRomCurve3(pathPts, false);
  return new THREE.TubeGeometry(curvePath, 20, 0.00032, 6, false);
}

/**
 * Builds translucent malar cheekbone blush & champagne highlighter shells
 * that conform strictly to `headSurface` over the zygomatic arches.
 */
function createCheekBlushPatchGeometry(
  side: number,
  headSurfaceFn: Surface
): THREE.BufferGeometry {
  const rows = 12;
  const cols = 14;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const pt = new THREE.Vector3();

  const vMin = 0.35;
  const vMax = 0.51;
  const thCenter = side > 0 ? HALF_PI - 0.48 : HALF_PI + 0.48;
  const thHalfSpan = 0.32;

  for (let r = 0; r <= rows; r++) {
    const vr = r / rows;
    const v = lerp(vMin, vMax, vr);
    for (let c = 0; c <= cols; c++) {
      const uc = c / cols;
      const theta = thCenter + (uc - 0.5) * 2 * thHalfSpan;
      headSurfaceFn(v, theta, pt);

      const radialLen = Math.hypot(pt.x, pt.z) || 1;
      const nx = pt.x / radialLen;
      const nz = pt.z / radialLen;

      // Feather towards edges, slightly proud in center (0.4 mm offset)
      const edgeMask = Math.sin(vr * PI) * Math.sin(uc * PI);
      const offset = 0.00045 * edgeMask;

      positions.push(pt.x + nx * offset, pt.y, pt.z + nz * offset);
      normals.push(nx, 0.08, nz);
      uvs.push(uc, vr);
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * stride + c;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// ============================================================================
// 4.6 16-MOVE BIOMECHANICAL GLAMOUR CHOREOGRAPHY SYNTHESIZER
// ============================================================================
// Provides a rich library of 16 distinct, musical dance moves so the girl
// performs authentic Latin salsa, high-fashion catwalk struts, pirouettes,
// body waves, Charleston kicks, playful cat-duet grooves, arabesques,
// snare pop-locks, samba shimmies, sultry waist winds, and vogue framing!
// ============================================================================

export type GlamourMoveId =
  | 'LATIN_HIP_SWAY'
  | 'DIVA_PIROUETTE_SPIN'
  | 'BASS_DROP_BODY_WAVE'
  | 'HIGH_FASHION_STRUT'
  | 'SHUFFLE_KICK_STEP'
  | 'CAT_DUET_PLAYFUL_GROOVE'
  | 'ARABESQUE_EXTENSION'
  | 'POP_LOCK_ISOLATION'
  | 'SAMBA_BATUCADA_BOUNCE'
  | 'SULTRY_SLOW_WIND'
  | 'EUPHORIC_JUMP_SPIN'
  | 'VOGUE_HAND_PERFORMANCE'
  | 'SALSA_CROSS_BODY_LEAD'
  | 'AFROBEAT_SHOULDER_WINE'
  | 'DISCO_POINT_FEVER'
  | 'FINALE_POSE_FLOURISH';

export interface SynthesizedDancePose {
  pelvisX: number;
  pelvisYOffset: number;
  pelvisZ: number;
  pelvisPitch: number;
  pelvisYawOffset: number;
  pelvisRoll: number;
  spinePitch: number;
  spineYaw: number;
  spineRoll: number;
  spinRateTarget: number;
  leftShoulderX: number;
  leftShoulderY: number;
  leftShoulderZ: number;
  rightShoulderX: number;
  rightShoulderY: number;
  rightShoulderZ: number;
  leftElbowX: number;
  leftElbowY: number;
  leftElbowZ: number;
  rightElbowX: number;
  rightElbowY: number;
  rightElbowZ: number;
  leftWristX: number;
  leftWristY: number;
  leftWristZ: number;
  rightWristX: number;
  rightWristY: number;
  rightWristZ: number;
  leftFootX: number;
  leftFootYLift: number;
  leftFootZ: number;
  leftFootPitch: number;
  rightFootX: number;
  rightFootYLift: number;
  rightFootZ: number;
  rightFootPitch: number;
  catAttentionWeight: number;
  faceIntent: FaceIntent;
  tailCarriage: HairCarriage;
}

const GLAMOUR_MOVE_SEQUENCE: readonly GlamourMoveId[] = [
  'LATIN_HIP_SWAY',
  'DIVA_PIROUETTE_SPIN',
  'BASS_DROP_BODY_WAVE',
  'CAT_DUET_PLAYFUL_GROOVE',
  'HIGH_FASHION_STRUT',
  'VOGUE_HAND_PERFORMANCE',
  'SHUFFLE_KICK_STEP',
  'SAMBA_BATUCADA_BOUNCE',
  'SULTRY_SLOW_WIND',
  'POP_LOCK_ISOLATION',
  'SALSA_CROSS_BODY_LEAD',
  'EUPHORIC_JUMP_SPIN',
  'AFROBEAT_SHOULDER_WINE',
  'ARABESQUE_EXTENSION',
  'DISCO_POINT_FEVER',
  'FINALE_POSE_FLOURISH',
];

function evaluateSingleGlamourMove(
  moveIndex: number,
  phase: number,
  activity: number,
  bass: number,
  mid: number,
  high: number,
  beat: number,
  out: SynthesizedDancePose
): void {
  const moveId = GLAMOUR_MOVE_SEQUENCE[((moveIndex % 16) + 16) % 16];
  const s1 = Math.sin(phase);
  const c1 = Math.cos(phase);
  const s2 = Math.sin(phase * 2);
  const c2 = Math.cos(phase * 2);
  const sHalf = Math.sin(phase * 0.5);
  const cHalf = Math.cos(phase * 0.5);

  const liftL = Math.max(0, s1);
  const liftR = Math.max(0, -s1);

  // Baseline contrapposto defaults
  out.pelvisX = s1 * (0.016 + activity * 0.036);
  out.pelvisYOffset = -activity * 0.020 * s1 * s1 - beat * 0.014;
  out.pelvisZ = s2 * activity * 0.012;
  out.pelvisPitch = 0.020 + s2 * activity * 0.035;
  out.pelvisYawOffset = c1 * activity * 0.14;
  out.pelvisRoll = -s1 * (0.045 + activity * 0.095);

  out.spinePitch = -0.018 + Math.sin(phase * 2 - 0.6) * activity * 0.035;
  out.spineYaw = -c1 * activity * 0.11;
  out.spineRoll = s1 * (0.035 + activity * 0.078);
  out.spinRateTarget = 0;

  out.leftShoulderX = -0.18 + s1 * activity * 0.42;
  out.leftShoulderY = 0.12 + c1 * activity * 0.14;
  out.leftShoulderZ = 0.16 + activity * 0.16 + liftL * high * 0.22;

  out.rightShoulderX = -0.18 - s1 * activity * 0.42;
  out.rightShoulderY = -0.12 - c1 * activity * 0.14;
  out.rightShoulderZ = -(0.16 + activity * 0.16 + liftR * high * 0.22);

  out.leftElbowX = -0.34 - activity * (0.45 + s1 * 0.25);
  out.leftElbowY = 0.09;
  out.leftElbowZ = -0.08;

  out.rightElbowX = -0.34 - activity * (0.45 - s1 * 0.25);
  out.rightElbowY = -0.09;
  out.rightElbowZ = 0.08;

  out.leftWristX = Math.sin(phase * 1.5) * activity * 0.15;
  out.leftWristY = activity * 0.09;
  out.leftWristZ = Math.cos(phase * 1.5) * activity * 0.14;

  out.rightWristX = -Math.sin(phase * 1.5) * activity * 0.15;
  out.rightWristY = -activity * 0.09;
  out.rightWristZ = -Math.cos(phase * 1.5) * activity * 0.14;

  out.leftFootX = 0.104;
  out.leftFootYLift = liftL * liftL * activity * 0.055;
  out.leftFootZ = liftL * activity * 0.060 + c1 * activity * 0.024;
  out.leftFootPitch = liftL * activity * 0.22;

  out.rightFootX = -0.104;
  out.rightFootYLift = liftR * liftR * activity * 0.055;
  out.rightFootZ = liftR * activity * 0.060 - c1 * activity * 0.024;
  out.rightFootPitch = liftR * activity * 0.22;

  out.catAttentionWeight = 0;
  out.faceIntent = 'joyful';
  out.tailCarriage = 'sway';

  switch (moveId) {
    case 'LATIN_HIP_SWAY': {
      // Deep Cuban figure-8 hip motion + sensual ribcage counter-isolation
      out.pelvisX = s1 * (0.024 + activity * 0.052);
      out.pelvisZ = s2 * activity * 0.026;
      out.pelvisRoll = -s1 * (0.065 + activity * 0.125);
      out.pelvisYawOffset = c1 * activity * 0.22;
      out.spineYaw = -c1 * activity * 0.18;
      out.spineRoll = s1 * (0.055 + activity * 0.105);
      out.faceIntent = 'joyful';
      out.tailCarriage = 'sway';
      break;
    }

    case 'DIVA_PIROUETTE_SPIN': {
      // High-G pirouette spin with overhead port-de-bras crown arms
      out.spinRateTarget = activity * (2.4 + bass * 3.4);
      out.leftShoulderX = -1.85 + s2 * 0.08;
      out.rightShoulderX = -1.85 - s2 * 0.08;
      out.leftShoulderZ = 0.46;
      out.rightShoulderZ = -0.46;
      out.leftElbowX = -0.78;
      out.rightElbowX = -0.78;
      out.faceIntent = 'smug';
      out.tailCarriage = 'whip';
      break;
    }

    case 'BASS_DROP_BODY_WAVE': {
      // Cranial-to-pelvic sinusoidal spinal body roll + deep knee groove
      const waveA = Math.sin(phase * 2);
      const waveB = Math.sin(phase * 2 - 1.1);
      out.pelvisYOffset = -activity * 0.078 * (0.5 + 0.5 * waveA) - beat * 0.022;
      out.pelvisPitch = 0.06 + waveA * activity * 0.14;
      out.spinePitch = -0.04 + waveB * activity * 0.22;
      out.leftShoulderX = -0.45 + waveB * 0.35;
      out.rightShoulderX = -0.45 + waveB * 0.35;
      out.faceIntent = 'fierce';
      out.tailCarriage = 'high';
      break;
    }

    case 'CAT_DUET_PLAYFUL_GROOVE': {
      // Playful lean & finger wave toward her dancing cat companion!
      out.catAttentionWeight = 0.92;
      out.pelvisX = 0.035 + s1 * 0.038;
      out.pelvisYOffset = -activity * 0.035 * s1 * s1;
      out.spinePitch = 0.085 + s2 * 0.035;
      out.spineYaw = -0.18 + cHalf * 0.12;
      // Right arm waves/beckons toward the cat while left hand rests near hip
      out.rightShoulderX = -0.78 + s2 * 0.25;
      out.rightShoulderY = -0.35;
      out.rightShoulderZ = -0.38;
      out.rightElbowX = -0.92 + c2 * 0.28;
      out.leftShoulderX = -0.12;
      out.leftShoulderZ = 0.36;
      out.leftElbowX = -1.15;
      out.faceIntent = 'joyful';
      out.tailCarriage = 'curled';
      break;
    }

    case 'HIGH_FASHION_STRUT': {
      // Cross-over runway model catwalk step with shoulder swagger
      out.pelvisX = s1 * 0.044;
      out.pelvisRoll = -s1 * 0.135;
      out.pelvisYawOffset = c1 * 0.24;
      out.spinePitch = -0.045;
      out.spineYaw = -c1 * 0.22;
      out.leftFootX = 0.055 - liftL * 0.035;
      out.rightFootX = -0.055 + liftR * 0.035;
      out.leftFootZ = c1 * activity * 0.095;
      out.rightFootZ = -c1 * activity * 0.095;
      out.faceIntent = 'smug';
      out.tailCarriage = 'high';
      break;
    }

    case 'VOGUE_HAND_PERFORMANCE': {
      // Intricate Vogue face-framing hands around cheekbones & crown
      const vSin = Math.sin(phase * 2);
      out.leftShoulderX = -1.25 + s1 * 0.28;
      out.rightShoulderX = -1.25 - s1 * 0.28;
      out.leftShoulderY = 0.48 + c1 * 0.22;
      out.rightShoulderY = -0.48 + c1 * 0.22;
      out.leftShoulderZ = 0.42;
      out.rightShoulderZ = -0.42;
      out.leftElbowX = -1.32 + vSin * 0.22;
      out.rightElbowX = -1.32 - vSin * 0.22;
      out.leftWristZ = 0.42 * s2;
      out.rightWristZ = -0.42 * s2;
      out.faceIntent = 'fierce';
      out.tailCarriage = 'curled';
      break;
    }

    case 'SHUFFLE_KICK_STEP': {
      // High-energy syncopated front/diagonal kicks & arm pumps
      const kickL = Math.pow(liftL, 1.65) * activity;
      const kickR = Math.pow(liftR, 1.65) * activity;
      out.leftFootX = 0.108 + kickL * 0.052;
      out.leftFootYLift = kickL * 0.34;
      out.leftFootZ = kickL * 0.35;
      out.leftFootPitch = kickL * 0.44;

      out.rightFootX = -0.108 - kickR * 0.052;
      out.rightFootYLift = kickR * 0.34;
      out.rightFootZ = kickR * 0.35;
      out.rightFootPitch = kickR * 0.44;

      out.leftShoulderX = -0.55 - kickR * 0.65;
      out.rightShoulderX = -0.55 - kickL * 0.65;
      out.faceIntent = 'joyful';
      out.tailCarriage = 'whip';
      break;
    }

    case 'SAMBA_BATUCADA_BOUNCE': {
      // Double-time Brazilian Samba pelvic whisks + carnival crown arm
      const fastSin = Math.sin(phase * 2);
      const fastCos = Math.cos(phase * 2);
      out.pelvisX = fastSin * activity * 0.042;
      out.pelvisRoll = -fastSin * activity * 0.115;
      out.pelvisYawOffset = fastCos * activity * 0.19;
      out.leftShoulderX = -1.65;
      out.leftShoulderZ = 0.48;
      out.leftElbowX = -0.85;
      out.rightShoulderX = -0.35 + s1 * 0.25;
      out.rightShoulderZ = -0.45;
      out.faceIntent = 'joyful';
      out.tailCarriage = 'whip';
      break;
    }

    case 'SULTRY_SLOW_WIND': {
      // Smooth sensual circular waist wind + hair caress arm
      out.pelvisX = sHalf * 0.046;
      out.pelvisZ = cHalf * 0.034;
      out.pelvisRoll = -sHalf * 0.105;
      out.pelvisPitch = 0.035 + cHalf * 0.055;
      out.spinePitch = -0.028 - cHalf * 0.048;
      out.spineRoll = sHalf * 0.092;
      // Left hand glides behind neck / hair crown
      out.leftShoulderX = -1.48 + sHalf * 0.15;
      out.leftShoulderZ = 0.38;
      out.leftElbowX = -1.42;
      out.faceIntent = 'serene';
      out.tailCarriage = 'sway';
      break;
    }

    case 'POP_LOCK_ISOLATION': {
      // Snappy quantized chest pops & robotic wrist locks on the beat
      const pop = Math.pow(beat, 0.7) * (mid > 0.35 ? 1 : 0.6);
      out.spinePitch = -0.055 - pop * 0.14;
      out.pelvisYOffset = -pop * 0.032 - activity * 0.025 * s1 * s1;
      out.leftShoulderX = -0.75 - pop * 0.35;
      out.rightShoulderX = -0.75 - pop * 0.35;
      out.leftElbowX = -1.05;
      out.rightElbowX = -1.05;
      out.faceIntent = 'intense';
      out.tailCarriage = 'high';
      break;
    }

    case 'SALSA_CROSS_BODY_LEAD': {
      // Dynamic lateral salsa break steps + rapid shoulder shimmy
      const shimmy = Math.sin(phase * 4) * activity * 0.085;
      out.pelvisX = s1 * 0.055;
      out.spineYaw = -c1 * 0.18 + shimmy;
      out.leftShoulderX = -0.42 + shimmy * 1.8;
      out.rightShoulderX = -0.42 - shimmy * 1.8;
      out.leftFootX = 0.115 + Math.max(0, s1) * 0.045;
      out.rightFootX = -0.115 - Math.max(0, -s1) * 0.045;
      out.faceIntent = 'joyful';
      out.tailCarriage = 'sway';
      break;
    }

    case 'EUPHORIC_JUMP_SPIN': {
      // Celebratory chorus turn with lifted heels & V-victory arms
      out.spinRateTarget = activity * (1.8 + bass * 2.5);
      const hop = Math.max(0, Math.sin(phase * 2)) * activity * 0.038;
      out.pelvisYOffset = hop - 0.018;
      out.leftShoulderX = -2.05 + s2 * 0.12;
      out.rightShoulderX = -2.05 + s2 * 0.12;
      out.leftShoulderZ = 0.58;
      out.rightShoulderZ = -0.58;
      out.leftElbowX = -0.28;
      out.rightElbowX = -0.28;
      out.faceIntent = 'joyful';
      out.tailCarriage = 'whip';
      break;
    }

    case 'AFROBEAT_SHOULDER_WINE': {
      // Grounded wide-stance groove with poly-rhythmic shoulder & hip wine
      out.pelvisYOffset = -0.048 - activity * 0.028 * s2 * s2;
      out.pelvisX = s1 * 0.048;
      out.pelvisRoll = -s1 * 0.11;
      out.spinePitch = 0.065 + s2 * 0.055;
      out.leftFootX = 0.135;
      out.rightFootX = -0.135;
      out.leftShoulderZ = 0.35 + s2 * 0.18;
      out.rightShoulderZ = -0.35 + s2 * 0.18;
      out.faceIntent = 'smug';
      out.tailCarriage = 'curled';
      break;
    }

    case 'ARABESQUE_EXTENSION': {
      // Graceful balletic balance & swan-like port de bras + cat glance
      out.catAttentionWeight = 0.55;
      out.spinePitch = -0.045;
      out.leftShoulderX = -1.15 + sHalf * 0.22;
      out.rightShoulderX = -0.65 - sHalf * 0.22;
      out.leftShoulderZ = 0.62;
      out.rightShoulderZ = -0.68;
      out.leftElbowX = -0.32;
      out.rightElbowX = -0.32;
      out.rightFootYLift = 0.08 + liftR * 0.14;
      out.rightFootZ = -0.12 - liftR * 0.14;
      out.rightFootPitch = 0.42;
      out.faceIntent = 'serene';
      out.tailCarriage = 'high';
      break;
    }

    case 'DISCO_POINT_FEVER': {
      // Iconic diagonal cross-body sky point + hip thrust
      const pointCycle = sHalf;
      out.pelvisX = -pointCycle * 0.045;
      out.pelvisRoll = pointCycle * 0.115;
      out.rightShoulderX = -1.15 - pointCycle * 0.85;
      out.rightShoulderY = -0.25 + pointCycle * 0.45;
      out.rightShoulderZ = -0.45 - Math.max(0, pointCycle) * 0.35;
      out.rightElbowX = -0.25 - Math.max(0, -pointCycle) * 0.85;
      out.leftShoulderX = -0.22;
      out.leftShoulderZ = 0.32;
      out.leftElbowX = -1.18;
      out.faceIntent = 'smug';
      out.tailCarriage = 'whip';
      break;
    }

    case 'FINALE_POSE_FLOURISH': {
      // Glamorous diva contrapposto pose with kiss/wave flourish toward audience & cat
      out.catAttentionWeight = 0.65;
      out.pelvisX = 0.038 * sHalf;
      out.pelvisRoll = -0.11 * sHalf;
      out.spinePitch = -0.038;
      out.spineRoll = 0.085 * sHalf;
      out.leftShoulderX = -1.55 + c1 * 0.18;
      out.leftShoulderZ = 0.44;
      out.leftElbowX = -0.65;
      out.rightShoulderX = -0.88 + s1 * 0.22;
      out.rightShoulderY = -0.38;
      out.rightShoulderZ = -0.32;
      out.rightElbowX = -1.05;
      out.faceIntent = 'joyful';
      out.tailCarriage = 'curled';
      break;
    }
  }
}

const POSE_SCRATCH_A: SynthesizedDancePose = {
  pelvisX: 0,
  pelvisYOffset: 0,
  pelvisZ: 0,
  pelvisPitch: 0,
  pelvisYawOffset: 0,
  pelvisRoll: 0,
  spinePitch: 0,
  spineYaw: 0,
  spineRoll: 0,
  spinRateTarget: 0,
  leftShoulderX: 0,
  leftShoulderY: 0,
  leftShoulderZ: 0,
  rightShoulderX: 0,
  rightShoulderY: 0,
  rightShoulderZ: 0,
  leftElbowX: 0,
  leftElbowY: 0,
  leftElbowZ: 0,
  rightElbowX: 0,
  rightElbowY: 0,
  rightElbowZ: 0,
  leftWristX: 0,
  leftWristY: 0,
  leftWristZ: 0,
  rightWristX: 0,
  rightWristY: 0,
  rightWristZ: 0,
  leftFootX: 0.104,
  leftFootYLift: 0,
  leftFootZ: 0,
  leftFootPitch: 0,
  rightFootX: -0.104,
  rightFootYLift: 0,
  rightFootZ: 0,
  rightFootPitch: 0,
  catAttentionWeight: 0,
  faceIntent: 'joyful',
  tailCarriage: 'sway',
};

const POSE_SCRATCH_B: SynthesizedDancePose = { ...POSE_SCRATCH_A };
const POSE_BLENDED: SynthesizedDancePose = { ...POSE_SCRATCH_A };

/**
 * Evaluates the current 8-beat phrase and smoothly cross-fades between
 * consecutive moves in `GLAMOUR_MOVE_SEQUENCE` with zero heap allocations.
 */
function synthesizeBlendedGlamourPose(
  beatCount: number,
  phase: number,
  activity: number,
  bass: number,
  mid: number,
  high: number,
  beat: number
): SynthesizedDancePose {
  const phraseBeats = 8;
  const currentMoveIdx = Math.floor(beatCount / phraseBeats) % 16;
  const prevMoveIdx = (currentMoveIdx + 15) % 16;
  const phraseProgress = (beatCount % phraseBeats) / phraseBeats;

  // Smooth 1.2-beat cross-fade at the beginning of each 8-beat phrase
  const blend = smootherstep(0, 0.15, phraseProgress);

  evaluateSingleGlamourMove(
    currentMoveIdx,
    phase,
    activity,
    bass,
    mid,
    high,
    beat,
    POSE_SCRATCH_B
  );

  if (blend >= 0.999) {
    return POSE_SCRATCH_B;
  }

  evaluateSingleGlamourMove(
    prevMoveIdx,
    phase,
    activity,
    bass,
    mid,
    high,
    beat,
    POSE_SCRATCH_A
  );

  const a = POSE_SCRATCH_A;
  const b = POSE_SCRATCH_B;
  const out = POSE_BLENDED;

  out.pelvisX = lerp(a.pelvisX, b.pelvisX, blend);
  out.pelvisYOffset = lerp(a.pelvisYOffset, b.pelvisYOffset, blend);
  out.pelvisZ = lerp(a.pelvisZ, b.pelvisZ, blend);
  out.pelvisPitch = lerp(a.pelvisPitch, b.pelvisPitch, blend);
  out.pelvisYawOffset = lerp(a.pelvisYawOffset, b.pelvisYawOffset, blend);
  out.pelvisRoll = lerp(a.pelvisRoll, b.pelvisRoll, blend);
  out.spinePitch = lerp(a.spinePitch, b.spinePitch, blend);
  out.spineYaw = lerp(a.spineYaw, b.spineYaw, blend);
  out.spineRoll = lerp(a.spineRoll, b.spineRoll, blend);
  out.spinRateTarget = lerp(a.spinRateTarget, b.spinRateTarget, blend);

  out.leftShoulderX = lerp(a.leftShoulderX, b.leftShoulderX, blend);
  out.leftShoulderY = lerp(a.leftShoulderY, b.leftShoulderY, blend);
  out.leftShoulderZ = lerp(a.leftShoulderZ, b.leftShoulderZ, blend);
  out.rightShoulderX = lerp(a.rightShoulderX, b.rightShoulderX, blend);
  out.rightShoulderY = lerp(a.rightShoulderY, b.rightShoulderY, blend);
  out.rightShoulderZ = lerp(a.rightShoulderZ, b.rightShoulderZ, blend);

  out.leftElbowX = lerp(a.leftElbowX, b.leftElbowX, blend);
  out.leftElbowY = lerp(a.leftElbowY, b.leftElbowY, blend);
  out.leftElbowZ = lerp(a.leftElbowZ, b.leftElbowZ, blend);
  out.rightElbowX = lerp(a.rightElbowX, b.rightElbowX, blend);
  out.rightElbowY = lerp(a.rightElbowY, b.rightElbowY, blend);
  out.rightElbowZ = lerp(a.rightElbowZ, b.rightElbowZ, blend);

  out.leftWristX = lerp(a.leftWristX, b.leftWristX, blend);
  out.leftWristY = lerp(a.leftWristY, b.leftWristY, blend);
  out.leftWristZ = lerp(a.leftWristZ, b.leftWristZ, blend);
  out.rightWristX = lerp(a.rightWristX, b.rightWristX, blend);
  out.rightWristY = lerp(a.rightWristY, b.rightWristY, blend);
  out.rightWristZ = lerp(a.rightWristZ, b.rightWristZ, blend);

  out.leftFootX = lerp(a.leftFootX, b.leftFootX, blend);
  out.leftFootYLift = lerp(a.leftFootYLift, b.leftFootYLift, blend);
  out.leftFootZ = lerp(a.leftFootZ, b.leftFootZ, blend);
  out.leftFootPitch = lerp(a.leftFootPitch, b.leftFootPitch, blend);

  out.rightFootX = lerp(a.rightFootX, b.rightFootX, blend);
  out.rightFootYLift = lerp(a.rightFootYLift, b.rightFootYLift, blend);
  out.rightFootZ = lerp(a.rightFootZ, b.rightFootZ, blend);
  out.rightFootPitch = lerp(a.rightFootPitch, b.rightFootPitch, blend);

  out.catAttentionWeight = lerp(a.catAttentionWeight, b.catAttentionWeight, blend);
  out.faceIntent = blend > 0.5 ? b.faceIntent : a.faceIntent;
  out.tailCarriage = blend > 0.5 ? b.tailCarriage : a.tailCarriage;

  return out;
}
// ============================================================================
// SECTION 5: GLAMOUR MAKEUP, JEWELRY, RIG BUILDER & SOFT-BODY DYNAMICS
// ============================================================================
// Constructs the complete hierarchical Three.js character rig with:
//   - Multi-layer Subsurface Scattering Skin, Satin Couture, Intimate Silk,
//     Refractive Cornea, Velvet Lip Gloss, Anisotropic Hair, and 24K Gold /
//     Crystal Diamond Materials.
//   - Dynamic vertex-deforming Anatomical Torso (with 3-DOF breast soft-body
//     oscillation) and Anatomical Pelvis (with gluteal soft-body oscillation).
//   - Multi-layer Couture Wardrobe: Intimate Bralette & Briefs -> Sweetheart
//     Boned Corset Bodice -> High-Waisted Shorts -> Medallion Chain Belt ->
//     98-Particle Verlet Skirt -> 12-Sided Neon Hem.
//   - Articulated 5-Finger Hands with French-Manicure Nails, Sculpted 5-Toe
//     Feet inside Strappy Couture Dance Boots, Winged Eyeliner, Eyeshadow,
//     3D Eyelashes, Oral Cavity, 32 Wavy Hair Locks + `GirlHairSim` Ponytail.
// ============================================================================

interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  toePivot: THREE.Group;
  thighMesh: THREE.Mesh;
  calfMesh: THREE.Mesh;
  side: number;
}

interface ArmRig {
  clavicle: THREE.Group;
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  fingers: FingerChainRig[];
  upperArmMesh: THREE.Mesh;
  forearmMesh: THREE.Mesh;
  side: number;
}

interface EyeRig {
  socket: THREE.Group;
  gaze: THREE.Group;
  pupil: THREE.Mesh;
  cornea: THREE.Mesh;
  upper: THREE.BufferGeometry;
  lower: THREE.BufferGeometry;
  upperLashGroup: THREE.Group;
  lowerLashGroup: THREE.Group;
  browGroup: THREE.Group;
  side: number;
}

interface HairLockRig {
  upper: THREE.Group;
  lower: THREE.Group;
  tip: THREE.Group;
  angle: number;
  basePitch: number;
  pitch: number;
  roll: number;
  vx: number;
  vz: number;
  isFraming: boolean;
}

interface SoftBodySpring3D {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface Palette {
  skin: string;
  fabric: string;
  skirt: string;
  accent: string;
  hair: string;
  iris: string;
  lip: string;
  nail: string;
  intimate: string;
}

const TORSO_RADIAL = 72;
const TORSO_VERTICAL = 52;
const BODICE_RADIAL = 72;
const BODICE_VERTICAL = 36;
const PELVIS_RADIAL = 64;
const PELVIS_VERTICAL = 32;

function updateDynamicTorsoAndGarments(
  torsoGeom: THREE.BufferGeometry,
  braletteGeom: THREE.BufferGeometry,
  bodiceGeom: THREE.BufferGeometry,
  cal: AnatomicalCalibrationState,
  softOffset: BustSoftBodyOffset
): void {
  const pt = new THREE.Vector3();

  // 1. Update Anatomical Torso + Bust vertices
  const torsoPos = torsoGeom.getAttribute('position') as THREE.BufferAttribute;
  const torsoStride = TORSO_RADIAL + 1;
  for (let row = 0; row <= TORSO_VERTICAL; row++) {
    const v = row / TORSO_VERTICAL;
    for (let col = 0; col <= TORSO_RADIAL; col++) {
      const theta = ((col % TORSO_RADIAL) / TORSO_RADIAL) * TAU;
      evaluateAnatomicalTorso(v, theta, pt, cal, softOffset);
      torsoPos.setXYZ(row * torsoStride + col, pt.x, pt.y, pt.z);
    }
  }
  torsoPos.needsUpdate = true;
  recomputeLoftSeamNormals(torsoGeom, TORSO_RADIAL, TORSO_VERTICAL);

  // 2. Update Intimate Bralette vertices (skipped when the under-layer is
  //    hidden — V5.1 PERF: it sits fully beneath the couture bodice)
  if ((braletteGeom as THREE.BufferGeometry & { __divaVisible?: boolean }).__divaVisible !== false) {
    const braPos = braletteGeom.getAttribute('position') as THREE.BufferAttribute;
    const braRows = 20;
    const braCols = 56;
    const braStride = braCols + 1;
    for (let row = 0; row <= braRows; row++) {
      const v = row / braRows;
      for (let col = 0; col <= braCols; col++) {
        const theta = ((col % braCols) / braCols) * TAU;
        intimateBraletteSurface(v, theta, pt, cal, softOffset);
        braPos.setXYZ(row * braStride + col, pt.x, pt.y, pt.z);
      }
    }
    braPos.needsUpdate = true;
    recomputeLoftSeamNormals(braletteGeom, braCols, braRows);
  }

  // 3. Update Couture Corset Bodice vertices
  const bodPos = bodiceGeom.getAttribute('position') as THREE.BufferAttribute;
  const bodStride = BODICE_RADIAL + 1;
  for (let row = 0; row <= BODICE_VERTICAL; row++) {
    const v = row / BODICE_VERTICAL;
    for (let col = 0; col <= BODICE_RADIAL; col++) {
      const theta = ((col % BODICE_RADIAL) / BODICE_RADIAL) * TAU;
      bodiceSurface(v, theta, pt, cal, softOffset);
      bodPos.setXYZ(row * bodStride + col, pt.x, pt.y, pt.z);
    }
  }
  bodPos.needsUpdate = true;
  recomputeLoftSeamNormals(bodiceGeom, BODICE_RADIAL, BODICE_VERTICAL);
}

function updateDynamicPelvisAndGarments(
  pelvisGeom: THREE.BufferGeometry,
  briefsGeom: THREE.BufferGeometry,
  shortsGeom: THREE.BufferGeometry,
  cal: AnatomicalCalibrationState,
  gluteOffset: GluteSoftBodyOffset
): void {
  const pt = new THREE.Vector3();
  const stride = PELVIS_RADIAL + 1;

  const pelPos = pelvisGeom.getAttribute('position') as THREE.BufferAttribute;
  const shPos = shortsGeom.getAttribute('position') as THREE.BufferAttribute;

  for (let row = 0; row <= PELVIS_VERTICAL; row++) {
    const v = row / PELVIS_VERTICAL;
    for (let col = 0; col <= PELVIS_RADIAL; col++) {
      const theta = ((col % PELVIS_RADIAL) / PELVIS_RADIAL) * TAU;
      const idx = row * stride + col;

      evaluateAnatomicalPelvis(v, theta, pt, cal, gluteOffset);
      pelPos.setXYZ(idx, pt.x, pt.y, pt.z);

      shortsPelvisSurface(v, theta, pt, cal, gluteOffset);
      shPos.setXYZ(idx, pt.x, pt.y, pt.z);
    }
  }

  pelPos.needsUpdate = true;
  shPos.needsUpdate = true;
  recomputeLoftSeamNormals(pelvisGeom, PELVIS_RADIAL, PELVIS_VERTICAL);
  recomputeLoftSeamNormals(shortsGeom, PELVIS_RADIAL, PELVIS_VERTICAL);

  const brCols = 56;
  const brRows = 20;
  const brStride = brCols + 1;
  const brPos = briefsGeom.getAttribute('position') as THREE.BufferAttribute;
  for (let row = 0; row <= brRows; row++) {
    const v = row / brRows;
    for (let col = 0; col <= brCols; col++) {
      const theta = ((col % brCols) / brCols) * TAU;
      intimateBriefsSurface(v, theta, pt, cal, gluteOffset);
      brPos.setXYZ(row * brStride + col, pt.x, pt.y, pt.z);
    }
  }
  brPos.needsUpdate = true;
  recomputeLoftSeamNormals(briefsGeom, brCols, brRows);
}

function createRig(
  palette: Palette,
  calibration: AnatomicalCalibrationState,
  wardrobeVis: Required<WardrobeVisibilityConfig>,
  envMap?: THREE.Texture
) {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  function ownGeometry<T extends THREE.BufferGeometry>(g: T): T {
    geometries.push(g);
    return g;
  }

  function ownMaterial<T extends THREE.Material>(m: T): T {
    materials.push(m);
    return m;
  }

  const textures = buildCharacterTextures(
    palette.skin,
    palette.iris,
    palette.hair
  );

  // V5.1 REALISM: a PMREM room environment on every PBR material —
  // without env reflections MeshPhysicalMaterial reads as flat plastic.
  // Intensities tuned per material family (skin soft, boots/metal shiny).
  const withEnv = (
    m: THREE.MeshPhysicalMaterial,
    intensity: number
  ): THREE.MeshPhysicalMaterial => {
    if (envMap) {
      m.envMap = envMap;
      m.envMapIntensity = intensity;
    }
    return m;
  };

  // 1. Multi-Layer Subsurface Scattering PBR Skin Material
  const skin = ownMaterial(
    withEnv(
      new THREE.MeshPhysicalMaterial({
        color: palette.skin,
        map: textures.skinSubsurfaceMap,
      normalMap: textures.skinNormalMap,
      normalScale: new THREE.Vector2(0.18, 0.18),
      bumpMap: textures.skinBumpMap,
      bumpScale: 0.00016,
      roughnessMap: textures.skinRoughnessMap,
      roughness: 0.48,
      metalness: 0.0,
      ior: 1.42,
      reflectivity: 0.35,
      clearcoat: 0.06,
      clearcoatRoughness: 0.42,
      sheen: 0.28,
      sheenRoughness: 0.65,
      sheenColor: new THREE.Color(palette.skin).lerp(
        new THREE.Color('#ffdfd4'),
        0.5
      ),
      attenuationColor: new THREE.Color('#d94b3d'),
      attenuationDistance: 0.018,
      thicknessMap: textures.skinThicknessMap,
      thickness: 0.012,
      }),
      0.42
    )
  );

  // Subtle tinted nipple/areola anatomical skin material
  const areolaMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(palette.skin).lerp(new THREE.Color('#b85d64'), 0.48),
      normalMap: textures.skinNormalMap,
      normalScale: new THREE.Vector2(0.24, 0.24),
      roughness: 0.52,
      clearcoat: 0.05,
    })
  );

  const lidSkin = ownMaterial(skin.clone());
  lidSkin.side = THREE.DoubleSide;
  // V6 GLAM-2: deeper smoky-plum eyeshadow with a shimmer finish (the
  // clearcoat doubles as metallic eyeshadow glitter under club lights)
  lidSkin.color.lerp(new THREE.Color('#6b3a4b'), 0.3);
  lidSkin.clearcoat = 0.24;
  lidSkin.clearcoatRoughness = 0.22;

  // 2. Couture Wardrobe Materials (Silk Satin, Intimate Lace/Silk, Velvet Shorts)
  const fabric = ownMaterial(
    withEnv(
      new THREE.MeshPhysicalMaterial({
        color: palette.fabric,
        normalMap: textures.fabricNormalMap,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughnessMap: textures.fabricRoughnessMap,
        roughness: 0.32,
        metalness: 0.06,
        clearcoat: 0.12,
      clearcoatRoughness: 0.38,
      sheen: 0.88,
      sheenRoughness: 0.34,
        sheenColor: new THREE.Color(palette.fabric).lerp(
          new THREE.Color('#ffffff'),
          0.48
        ),
        side: THREE.DoubleSide,
      }),
      0.6
    )
  );

  const intimateMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: palette.intimate,
      normalMap: textures.fabricNormalMap,
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughness: 0.30,
      metalness: 0.04,
      sheen: 0.82,
      sheenRoughness: 0.32,
      sheenColor: new THREE.Color('#ffe6ef'),
      side: THREE.DoubleSide,
    })
  );

  // V6 GLAM-2 — SEQUIN OMBRÉ SATIN GOWN SKIRT: champagne-gold paillettes
  // dust the plum satin and densify toward the hem; the metallic discs
  // mirror the club lights + PMREM env as she spins, turning the flared
  // skirt into the light-catcher of the whole stage.
  const skirtSequinMaps = makeSequinMaps(new THREE.Color(palette.skirt), {
    dotsAcross: 32,
    dotRadius: 0.46,
    goldIntensity: 0.92,
    hemDust: 0.6,
    brightJitter: 0.3,
  });
  const skirtFabric = ownMaterial(
    withEnv(
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff', // albedo fully delegated to the sequin atlas
        map: skirtSequinMaps.albedoMap,
        normalMap: textures.fabricNormalMap,
        normalScale: new THREE.Vector2(0.22, 0.22),
        roughnessMap: skirtSequinMaps.roughnessMetalMap,
        metalnessMap: skirtSequinMaps.roughnessMetalMap,
        roughness: 1.0,
        metalness: 1.0,
        clearcoat: 0.16,
        clearcoatRoughness: 0.3,
        sheen: 0.7,
        sheenRoughness: 0.36,
        sheenColor: new THREE.Color('#f4d9b8'),
        side: THREE.DoubleSide,
      }),
      0.68
    )
  );

  // V6 GLAM-2 — FINE GOLD-DUST CORSET: a tighter paillette pitch with no
  // ombré keeps the structured bodice sparkling without stealing the show.
  const bodiceSequinMaps = makeSequinMaps(new THREE.Color(palette.fabric), {
    dotsAcross: 64,
    dotRadius: 0.34,
    goldIntensity: 0.5,
    hemDust: 0,
    brightJitter: 0.4,
  });
  const bodiceFabric = ownMaterial(
    withEnv(
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        map: bodiceSequinMaps.albedoMap,
        normalMap: textures.fabricNormalMap,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughnessMap: bodiceSequinMaps.roughnessMetalMap,
        metalnessMap: bodiceSequinMaps.roughnessMetalMap,
        roughness: 1.0,
        metalness: 1.0,
        clearcoat: 0.14,
        clearcoatRoughness: 0.32,
        sheen: 0.85,
        sheenRoughness: 0.34,
        sheenColor: new THREE.Color(palette.fabric).lerp(
          new THREE.Color('#ffffff'),
          0.5
        ),
        side: THREE.DoubleSide,
      }),
      0.64
    )
  );

  const shortsMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(palette.fabric).multiplyScalar(0.54),
      normalMap: textures.fabricNormalMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.44,
      metalness: 0.05,
      sheen: 0.65,
      sheenRoughness: 0.42,
      sheenColor: new THREE.Color(palette.fabric).lerp(
        new THREE.Color('#ffffff'),
        0.30
      ),
      side: THREE.DoubleSide,
    })
  );

  // 3. Anisotropic Keratin Hair Materials (Base, Warm Balayage Highlight, Lowlight)
  const hairMaterial = ownMaterial(
    withEnv(
      new THREE.MeshPhysicalMaterial({
        color: palette.hair,
        map: textures.hairStrandMap,
        normalMap: textures.hairNormalMap,
        normalScale: new THREE.Vector2(0.35, 0.15),
        roughness: 0.34,
        metalness: 0.02,
        clearcoat: 0.18,
        clearcoatRoughness: 0.28,
        sheen: 0.82,
        sheenRoughness: 0.28,
        sheenColor: new THREE.Color(palette.hair).lerp(
          new THREE.Color('#c89274'),
          0.45
        ),
        side: THREE.DoubleSide,
      }),
      0.7
    )
  );

  const hairHighlight = ownMaterial(hairMaterial.clone());
  hairHighlight.color.lerp(new THREE.Color('#b88462'), 0.24);

  const bootMaterial = ownMaterial(
    withEnv(
      new THREE.MeshPhysicalMaterial({
        color: '#16141d',
        normalMap: textures.fabricNormalMap,
        normalScale: new THREE.Vector2(0.14, 0.14),
        // V6 GLAM-2: patent-leather wet look
        roughness: 0.20,
        metalness: 0.08,
        clearcoat: 0.62,
        clearcoatRoughness: 0.16,
        side: THREE.DoubleSide,
      }),
      0.9
    )
  );

  const metal = ownMaterial(
    withEnv(
      new THREE.MeshPhysicalMaterial({
        color: '#e5c185',
        metalness: 0.92,
        roughness: 0.18,
        clearcoat: 0.35,
        clearcoatRoughness: 0.15,
      }),
      1.1
    )
  );

  // V5.1 PERF + REALISM: transmission dropped (transmissive materials
  // force an extra render pass per frame — very costly on integrated GPUs)
  // and replaced with a glossy sparkle that reads identically at club scale.
  const diamondCrystal = ownMaterial(
    withEnv(
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        emissive: palette.accent,
        emissiveIntensity: 0.22,
        metalness: 0.55,
        roughness: 0.06,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
      }),
      1.3
    )
  );

  const accent = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.38,
      metalness: 0.18,
      roughness: 0.28,
    })
  );

  // 4. Photorealistic Eye, Oral, Lip Gloss & Manicure Materials
  const sclera = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: textures.scleraMap,
      roughness: 0.14,
      clearcoat: 0.85,
      clearcoatRoughness: 0.06,
      ior: 1.38,
    })
  );

  const iris = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: textures.irisMap,
      bumpMap: textures.irisBumpMap,
      bumpScale: 0.0004,
      roughness: 0.28,
      metalness: 0.02,
      ior: 1.40,
    })
  );

  const corneaMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.26,
      roughness: 0.02,
      metalness: 0.0,
      ior: 1.376,
      reflectivity: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      depthWrite: false,
    })
  );

  const caruncleMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: '#d97276',
      roughness: 0.18,
      clearcoat: 0.90,
      clearcoatRoughness: 0.08,
    })
  );

  const dark = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: '#0e0b10',
      roughness: 0.42,
    })
  );

  const lipMaterial = ownMaterial(
    withEnv(
      new THREE.MeshPhysicalMaterial({
        color: palette.lip,
        normalMap: textures.skinNormalMap,
        normalScale: new THREE.Vector2(0.12, 0.12),
        // V6 GLAM-2: wet couture gloss — near-lacquer clearcoat
        roughness: 0.15,
        clearcoat: 0.9,
        clearcoatRoughness: 0.07,
        sheen: 0.35,
        sheenColor: new THREE.Color('#ffccd5'),
      }),
      0.7
    )
  );

  const mouthMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: '#2d1216',
      roughness: 0.92,
    })
  );

  const teethMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: '#f6f2eb',
      roughness: 0.16,
      clearcoat: 0.75,
      clearcoatRoughness: 0.08,
      ior: 1.62,
    })
  );

  const tongueMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: '#c45460',
      normalMap: textures.skinNormalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.32,
      clearcoat: 0.65,
      clearcoatRoughness: 0.18,
    })
  );

  const nailMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: palette.nail,
      roughness: 0.12,
      metalness: 0.04,
      clearcoat: 0.92,
      clearcoatRoughness: 0.06,
      side: THREE.DoubleSide,
    })
  );

  const sphere = ownGeometry(new THREE.SphereGeometry(1, 28, 22));
  const cylinder = ownGeometry(new THREE.CylinderGeometry(1, 1, 1, 28));
  const root = new THREE.Group();

  function group(
    parent: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0
  ): THREE.Group {
    const result = new THREE.Group();
    result.position.set(x, y, z);
    parent.add(result);
    return result;
  }

  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    sx = 1,
    sy = 1,
    sz = 1
  ): THREE.Mesh {
    const result = new THREE.Mesh(geometry, material);
    result.position.set(x, y, z);
    result.scale.set(sx, sy, sz);
    result.castShadow = true;
    result.receiveShadow = true;
    parent.add(result);
    return result;
  }

  function curve(
    parent: THREE.Object3D,
    points: THREE.Vector3[],
    radius: number,
    material: THREE.Material,
    closed = false,
    tubularSegments = 48
  ): THREE.Mesh {
    const path = new THREE.CatmullRomCurve3(points, closed);
    return mesh(
      parent,
      ownGeometry(new THREE.TubeGeometry(path, tubularSegments, radius, 8, closed)),
      material
    );
  }

  // ==========================================================================
  // CORE SKELETAL HIERARCHY
  // ==========================================================================
  const pelvis = group(root, 0, 0.99, 0);
  const spine = group(pelvis);
  const headPivot = group(spine, 0, 0.445, 0.003);
  const head = group(headPivot, 0, 0.09, 0);

  // ==========================================================================
  // COMPLETE ANATOMICAL PELVIS, INTIMATE BRIEFS & DANCE SHORTS
  // ==========================================================================
  const pelvisGeometry = ownGeometry(
    loft(PELVIS_RADIAL, PELVIS_VERTICAL, (v, theta, out) =>
      evaluateAnatomicalPelvis(v, theta, out, calibration, ZERO_GLUTE_OFFSET)
    )
  );
  (pelvisGeometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  (pelvisGeometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  mesh(pelvis, pelvisGeometry, skin);

  const briefsGeometry = ownGeometry(
    loft(
      56,
      20,
      (v, theta, out) =>
        intimateBriefsSurface(v, theta, out, calibration, ZERO_GLUTE_OFFSET),
      false
    )
  );
  (briefsGeometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  (briefsGeometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const briefsMesh = mesh(pelvis, briefsGeometry, intimateMaterial);
  briefsMesh.visible = wardrobeVis.showIntimateLayer;
  (briefsGeometry as THREE.BufferGeometry & { __divaVisible?: boolean }).__divaVisible =
    wardrobeVis.showIntimateLayer;

  const shortsGeometry = ownGeometry(
    loft(
      PELVIS_RADIAL,
      PELVIS_VERTICAL,
      (v, theta, out) =>
        shortsPelvisSurface(v, theta, out, calibration, ZERO_GLUTE_OFFSET),
      false
    )
  );
  (shortsGeometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  (shortsGeometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const shortsMesh = mesh(pelvis, shortsGeometry, shortsMaterial);
  shortsMesh.visible = wardrobeVis.showDanceShorts;

  // ==========================================================================
  // COMPLETE ANATOMICAL TORSO, BUST, AREOLA/NIPPLES, BRALETTE & CORSET BODICE
  // ==========================================================================
  const torsoGeometry = ownGeometry(
    loft(TORSO_RADIAL, TORSO_VERTICAL, (v, theta, out) =>
      evaluateAnatomicalTorso(v, theta, out, calibration, ZERO_BUST_OFFSET)
    )
  );
  (torsoGeometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  (torsoGeometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  mesh(spine, torsoGeometry, skin);

  // Bust soft-body anchor groups (V5: the explicit areolar detail meshes were
  // removed for a tasteful public-facing glamour look — the corset bodice
  // covers this region; the anchors remain so the bust spring deformation
  // targets stay valid).
  const bustAnchors: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const nipTheta = HALF_PI - side * 0.53;
    const nipPt = new THREE.Vector3();
    evaluateAnatomicalTorso(0.492, nipTheta, nipPt, calibration, ZERO_BUST_OFFSET);

    const anchor = group(spine, nipPt.x, nipPt.y, nipPt.z - 0.0025);
    anchor.rotation.y = side * 0.24;
    anchor.rotation.x = 0.08;
    bustAnchors.push(anchor);
  }

  // Layer 1A: Intimate Silk-Satin Bralette
  const braletteGeometry = ownGeometry(
    loft(
      56,
      20,
      (v, theta, out) =>
        intimateBraletteSurface(v, theta, out, calibration, ZERO_BUST_OFFSET),
      false
    )
  );
  (braletteGeometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  (braletteGeometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const braletteMesh = mesh(spine, braletteGeometry, intimateMaterial);
  braletteMesh.visible = wardrobeVis.showIntimateLayer;
  // V5.1 PERF: the soft-body rebuild reads this flag to skip a hidden layer
  (braletteGeometry as THREE.BufferGeometry & { __divaVisible?: boolean }).__divaVisible =
    wardrobeVis.showIntimateLayer;

  // Layer 2: Structured Couture Corset Bodice
  const bodiceGeometry = ownGeometry(
    loft(
      BODICE_RADIAL,
      BODICE_VERTICAL,
      (v, theta, out) =>
        bodiceSurface(v, theta, out, calibration, ZERO_BUST_OFFSET),
      false
    )
  );
  (bodiceGeometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  (bodiceGeometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const bodiceMesh = mesh(spine, bodiceGeometry, bodiceFabric);
  bodiceMesh.visible = wardrobeVis.showCorsetBodice;

  // Gold Couture Piping & Vertical Princess Boning Seams on Corset Bodice
  if (wardrobeVis.showCorsetBodice) {
    for (const edge of [0, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < 64; i++) {
        const point = new THREE.Vector3();
        bodiceSurface(edge, (i / 64) * TAU, point, calibration, ZERO_BUST_OFFSET);
        points.push(point);
      }
      curve(spine, points, 0.0020, metal, true, 64);
    }

    // 6 Vertical gold corset boning channels around the bodice
    const boningAngles = [
      HALF_PI - 0.32,
      HALF_PI + 0.32,
      HALF_PI - 0.78,
      HALF_PI + 0.78,
      1.5 * PI - 0.36,
      1.5 * PI + 0.36,
    ];
    for (const ang of boningAngles) {
      const bPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= 14; i++) {
        const pt = new THREE.Vector3();
        bodiceSurface(i / 14, ang, pt, calibration, ZERO_BUST_OFFSET);
        pt.x += Math.cos(ang) * 0.0012;
        pt.z += Math.sin(ang) * 0.0012;
        bPoints.push(pt);
      }
      curve(spine, bPoints, 0.0013, metal, false, 20);
    }

    // Center sternum crystal brooch at sweetheart neckline plunge
    const broochPt = new THREE.Vector3();
    bodiceSurface(0.96, HALF_PI, broochPt, calibration, ZERO_BUST_OFFSET);
    mesh(
      spine,
      sphere,
      diamondCrystal,
      broochPt.x,
      broochPt.y,
      broochPt.z + 0.003,
      0.0065,
      0.0085,
      0.0040
    );

    // Shoulder straps with gold adjustment sliders
    for (const side of [-1, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const v = 0.655 + (i / 16) * 0.155;
        const point = new THREE.Vector3();
        const theta = side > 0 ? 0.96 : PI - 0.96;
        evaluateAnatomicalTorso(v, theta, point, calibration, ZERO_BUST_OFFSET);
        point.z += 0.0052;
        point.y += 0.0025 * Math.sin((i / 16) * PI);
        points.push(point);
      }
      curve(spine, points, 0.0048, fabric, false, 24);
    }
  }

  // ==========================================================================
  // GLAMOUR NECKLACE, CHOKER & MEDALLION WAIST BELT
  // ==========================================================================
  if (wardrobeVis.showJewelry) {
    // 1. Velvet & Gold Choker Collar at v = 0.83 on the neck
    const chokerPoints: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) {
      const pt = new THREE.Vector3();
      const th = (i / 48) * TAU;
      evaluateAnatomicalTorso(0.83, th, pt, calibration, ZERO_BUST_OFFSET);
      pt.x += Math.cos(th) * 0.0018;
      pt.z += Math.sin(th) * 0.0018;
      chokerPoints.push(pt);
    }
    curve(spine, chokerPoints, 0.0022, metal, true, 48);

    const chokerGemPt = new THREE.Vector3();
    evaluateAnatomicalTorso(0.83, HALF_PI, chokerGemPt, calibration, ZERO_BUST_OFFSET);
    mesh(
      spine,
      sphere,
      diamondCrystal,
      0,
      chokerGemPt.y,
      chokerGemPt.z + 0.0045,
      0.0048,
      0.0062,
      0.0032
    );

    // 2. Draped Sternum Pendant Necklace across the upper décolletage
    const necklacePoints: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) {
      const th = (i / 48) * TAU;
      const frontDrop = Math.max(0, Math.sin(th));
      const vNeck = 0.745 - 0.075 * Math.pow(frontDrop, 2.2);
      const pt = new THREE.Vector3();
      evaluateAnatomicalTorso(vNeck, th, pt, calibration, ZERO_BUST_OFFSET);
      pt.x += Math.cos(th) * 0.0022;
      pt.z += Math.sin(th) * 0.0022;
      necklacePoints.push(pt);
    }
    curve(spine, necklacePoints, 0.0012, metal, true, 48);
  }

  // Sculpted Gold & Crystal Medallion Waist Belt
  const belt = ownGeometry(new THREE.TorusGeometry(1, 0.042, 12, 72));
  const beltMesh = mesh(
    pelvis,
    belt,
    metal,
    0,
    0.005,
    0,
    0.146,
    0.119,
    0.105
  );
  beltMesh.rotation.x = HALF_PI;

  // 12 Crystal studs around the waist belt
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * TAU;
    const bx = Math.cos(th) * 0.148;
    const bz = Math.sin(th) * 0.121;
    mesh(
      pelvis,
      sphere,
      i % 2 === 0 ? diamondCrystal : accent,
      bx,
      0.005,
      bz,
      0.0048,
      0.0048,
      0.0048
    );
  }

  // ==========================================================================
  // LOWER LIMBS: ANATOMICAL THIGHS, KNEES, CALVES, FEET, TOES & DANCE BOOTS
  // ==========================================================================
  const kneeGeometry = ownGeometry(loft(32, 18, kneeJointSurface));
  const legs: LegRig[] = [];

  for (const side of [1, -1]) {
    const hip = group(pelvis, side * 0.087, -0.09, 0);

    const thighGeometry = ownGeometry(loft(44, 34, makeThighSurface(side)));
    const thighMesh = mesh(hip, thighGeometry, skin);

    const cuffGeometry = ownGeometry(
      loft(
        40,
        14,
        (v, theta, out) => {
          makeThighSurface(side)(0.73 + v * 0.27, theta, out);
          out.x += Math.cos(theta) * 0.0048;
          out.z += Math.sin(theta) * 0.0048;
        },
        false
      )
    );
    const cuffMesh = mesh(hip, cuffGeometry, shortsMaterial);
    cuffMesh.visible = wardrobeVis.showDanceShorts;

    // Gold thigh garter ring at v = 0.73
    if (wardrobeVis.showDanceShorts) {
      const garterPts: THREE.Vector3[] = [];
      for (let i = 0; i < 36; i++) {
        const pt = new THREE.Vector3();
        makeThighSurface(side)(0.73, (i / 36) * TAU, pt);
        pt.x += Math.cos((i / 36) * TAU) * 0.0055;
        pt.z += Math.sin((i / 36) * TAU) * 0.0055;
        garterPts.push(pt);
      }
      curve(hip, garterPts, 0.0016, metal, true, 36);
    }

    const knee = group(hip, 0, -THIGH, 0);
    mesh(knee, kneeGeometry, skin);

    const shinGeometry = ownGeometry(loft(40, 34, makeShinSurface(side)));
    const calfMesh = mesh(knee, shinGeometry, skin);

    const bootShaft = ownGeometry(
      loft(
        36,
        20,
        (v, theta, out) => {
          makeShinSurface(side)(v * 0.44, theta, out);
          out.x += Math.cos(theta) * 0.0048;
          out.z += Math.sin(theta) * 0.0048;
        },
        false
      )
    );
    const bootShaftMesh = mesh(knee, bootShaft, bootMaterial);
    bootShaftMesh.visible = wardrobeVis.showDanceBoots;

    // Gold & Neon Top Trim on Boot Cuff
    if (wardrobeVis.showDanceBoots) {
      const bootRimPts: THREE.Vector3[] = [];
      for (let i = 0; i < 36; i++) {
        const pt = new THREE.Vector3();
        makeShinSurface(side)(0.44, (i / 36) * TAU, pt);
        pt.x += Math.cos((i / 36) * TAU) * 0.0056;
        pt.z += Math.sin((i / 36) * TAU) * 0.0056;
        bootRimPts.push(pt);
      }
      curve(knee, bootRimPts, 0.0020, metal, true, 36);
    }

    const ankle = group(knee, 0, -SHIN, 0);
    const toePivot = group(ankle, 0, -0.042, 0.055);

    // 1. Complete Sculpted Anatomical Foot & 5 Toes with Toenails (underneath boot)
    const footGeom = ownGeometry(
      loft(32, 24, (v, theta, out) => anatomicalFootSurface(v, theta, out, side))
    );
    mesh(ankle, footGeom, skin);

    // 5 Individual Sculpted Toes (Hallux -> Little Toe)
    const toeRadii = [0.0068, 0.0048, 0.0045, 0.0042, 0.0038];
    const toeLengths = [0.024, 0.022, 0.019, 0.016, 0.013];
    for (let tIdx = 0; tIdx < 5; tIdx++) {
      const tx = side * (-0.018 + tIdx * 0.0088);
      const tz = 0.098 - tIdx * 0.0042;
      const ty = -0.044;
      const tr = toeRadii[tIdx];
      const tl = toeLengths[tIdx];

      mesh(ankle, sphere, skin, tx, ty, tz + tl * 0.45, tr, tr * 0.82, tl * 0.65);
      // Glossy painted toenail on dorsal tip of each toe
      mesh(
        ankle,
        sphere,
        nailMaterial,
        tx,
        ty + tr * 0.68,
        tz + tl * 0.68,
        tr * 0.72,
        0.0008,
        tl * 0.28
      );
    }

    // 2. Fitted Couture Dance Boot Upper, Platform Sole & Gold Block Heel
    if (wardrobeVis.showDanceBoots) {
      const bootFootGeom = ownGeometry(
        loft(32, 24, (v, theta, out) =>
          coutureBootUpperSurface(v, theta, out, side)
        )
      );
      mesh(ankle, bootFootGeom, bootMaterial);

      // Sculpted sole platform
      mesh(
        ankle,
        sphere,
        bootMaterial,
        0,
        -0.048,
        0.044,
        0.041,
        0.0085,
        0.097
      );

      // Neon LED sole accent welt
      mesh(
        ankle,
        sphere,
        accent,
        0,
        -0.045,
        0.045,
        0.042,
        0.0022,
        0.098
      );

      // Metallic gold couture block heel
      mesh(
        ankle,
        cylinder,
        metal,
        0,
        -0.039,
        -0.029,
        0.023,
        0.028,
        0.023
      );
    }

    legs.push({
      hip,
      knee,
      ankle,
      toePivot,
      thighMesh,
      calfMesh,
      side,
    });
  }

  // ==========================================================================
  // UPPER LIMBS: CLAVICLES, ARMS, WRISTS, BANGLE JEWELRY & 5-FINGER HANDS
  // ==========================================================================
  const arms: ArmRig[] = [];

  for (const side of [1, -1]) {
    // Articulated Clavicle / Scapula Auto-Shrug Root
    const clavicle = group(spine, side * 0.055, 0.342, 0.008);
    const shoulder = group(clavicle, side * 0.120, -0.016, -0.008);

    // Sculpted Deltoid Shoulder Cap
    mesh(shoulder, sphere, skin, 0, 0, 0, 0.041, 0.044, 0.040);

    const upperArmGeometry = ownGeometry(
      loft(32, 26, makeUpperArmSurface(side))
    );
    const upperArmMesh = mesh(shoulder, upperArmGeometry, skin);

    const elbow = group(shoulder, 0, -UPPER_ARM, 0);
    // Sculpted elbow joint with posterior olecranon prominence
    mesh(elbow, sphere, skin, 0, 0, -0.002, 0.0275, 0.026, 0.029);

    const forearmGeometry = ownGeometry(
      loft(32, 26, makeForearmSurface(side))
    );
    const forearmMesh = mesh(elbow, forearmGeometry, skin);

    // Stacked Gold & Neon Couture Wrist Bangles
    if (wardrobeVis.showJewelry) {
      mesh(
        elbow,
        cylinder,
        metal,
        0,
        -0.218,
        0,
        0.0205,
        0.0075,
        0.021
      );
      mesh(
        elbow,
        cylinder,
        accent,
        0,
        -0.227,
        0,
        0.0198,
        0.0045,
        0.0202
      );
      mesh(
        elbow,
        cylinder,
        metal,
        0,
        -0.234,
        0,
        0.0192,
        0.0060,
        0.0196
      );
    }

    // Wrist Pivot at exact distal end of forearm
    const wrist = group(elbow, 0, -FOREARM, 0);

    // Sculpted Metacarpal Palm with Thenar / Hypothenar Pads & Knuckles
    const palmGeometry = ownGeometry(loft(28, 18, createPalmSurface(side)));
    mesh(wrist, palmGeometry, skin);

    // 4 Articulated Fingers (Index = 0, Middle = 1, Ring = 2, Pinky = 3)
    // Each finger has 3 true phalangeal joints: MCP -> PIP -> DIP -> Fingernail
    const fingers: FingerChainRig[] = [];
    const fingerLengths = [0.043, 0.047, 0.044, 0.035];
    const fingerRadii = [0.0045, 0.0047, 0.0044, 0.0038];
    const fingerSplay = [-0.05, -0.015, 0.02, 0.065];

    for (let i = 0; i < 4; i++) {
      const mcpX = side * (-0.0175 + i * 0.0112);
      const mcpY = -0.059 + (i === 3 ? 0.0055 : i === 0 ? 0.0015 : 0);
      const mcpZ = 0.0012 - Math.abs(i - 1.3) * 0.0012;

      const mcp = group(wrist, mcpX, mcpY, mcpZ);
      mcp.rotation.z = side * fingerSplay[i];

      const totalLen = fingerLengths[i];
      const lenProx = totalLen * 0.45;
      const lenMid = totalLen * 0.31;
      const lenDist = totalLen * 0.24;
      const r0 = fingerRadii[i];

      const proxGeom = ownGeometry(
        createPhalanxGeometry(lenProx, r0, r0 * 0.89, false)
      );
      mesh(mcp, proxGeom, skin);

      // Gold ring on ring finger (i === 2)
      if (wardrobeVis.showJewelry && i === 2) {
        mesh(
          mcp,
          cylinder,
          metal,
          0,
          -lenProx * 0.48,
          0,
          r0 * 1.08,
          0.0028,
          r0 * 1.08
        );
      }

      const pip = group(mcp, 0, -lenProx, 0);
      pip.rotation.x = 0.16;
      const midGeom = ownGeometry(
        createPhalanxGeometry(lenMid, r0 * 0.89, r0 * 0.78, false)
      );
      mesh(pip, midGeom, skin);

      const dip = group(pip, 0, -lenMid, 0);
      dip.rotation.x = 0.14;
      const distGeom = ownGeometry(
        createPhalanxGeometry(lenDist, r0 * 0.78, r0 * 0.62, true)
      );
      mesh(dip, distGeom, skin);

      // Sculpted Curved Glossy Fingernail on dorsal face (-Z) of distal phalanx
      const nailGeom = ownGeometry(
        createFingernailGeometry(r0 * 0.68, lenDist * 0.68)
      );
      const nailMesh = mesh(
        dip,
        nailGeom,
        nailMaterial,
        0,
        -lenDist * 0.34,
        -r0 * 0.56
      );
      nailMesh.rotation.x = -0.06;

      fingers.push({
        mcp,
        pip,
        dip,
        isThumb: false,
        fingerIndex: i,
      });
    }

    // Articulated 3-Joint Thumb (CMC -> MCP -> IP -> Thumbnail)
    const thumbCmc = group(wrist, -side * 0.0235, -0.018, 0.0055);
    thumbCmc.rotation.set(-0.22, side * 0.38, -side * 0.52);

    const thumbMetacarpalGeom = ownGeometry(
      createPhalanxGeometry(0.019, 0.0062, 0.0053, false)
    );
    mesh(thumbCmc, thumbMetacarpalGeom, skin);

    const thumbMcp = group(thumbCmc, 0, -0.019, 0);
    thumbMcp.rotation.x = 0.18;
    const thumbProxGeom = ownGeometry(
      createPhalanxGeometry(0.015, 0.0053, 0.0046, false)
    );
    mesh(thumbMcp, thumbProxGeom, skin);

    const thumbIp = group(thumbMcp, 0, -0.015, 0);
    thumbIp.rotation.x = 0.14;
    const thumbDistGeom = ownGeometry(
      createPhalanxGeometry(0.013, 0.0046, 0.0038, true)
    );
    mesh(thumbIp, thumbDistGeom, skin);

    const thumbNailGeom = ownGeometry(createFingernailGeometry(0.0036, 0.0082));
    mesh(thumbIp, thumbNailGeom, nailMaterial, 0, -0.0045, -0.0032);

    fingers.push({
      mcp: thumbCmc,
      pip: thumbMcp,
      dip: thumbIp,
      isThumb: true,
      fingerIndex: 4,
    });

    arms.push({
      clavicle,
      shoulder,
      elbow,
      wrist,
      fingers,
      upperArmMesh,
      forearmMesh,
      side,
    });
  }

  // ==========================================================================
  // CRANIOFACIAL HEAD, SCULPTED EARS, EARRINGS, EYES, EYELASHES & ORAL CAVITY
  // ==========================================================================
  mesh(head, ownGeometry(loft(96, 72, headSurface)), skin);

  // Sculpted 3D Anatomical Ears + Gold Hoop & Crystal Drop Earrings
  const hoopGeometry = ownGeometry(
    new THREE.TorusGeometry(0.0125, 0.0015, 10, 32)
  );

  for (const side of [-1, 1]) {
    const earGeom = ownGeometry(createAnatomicalEarGeometry(side));
    const earGroup = group(head, side * 0.0745, 0.004, -0.004);
    mesh(earGroup, earGeom, skin);

    if (wardrobeVis.showJewelry) {
      const hoop = mesh(
        head,
        hoopGeometry,
        metal,
        side * 0.0785,
        -0.0235,
        0.001
      );
      hoop.rotation.y = side * 0.18;

      // Suspended teardrop crystal gem below the gold hoop
      mesh(
        head,
        sphere,
        diamondCrystal,
        side * 0.079,
        -0.039,
        0.001,
        0.0032,
        0.0052,
        0.0032
      );
    }
  }

  // Surface depth probe on the exact sculpted head evaluator
  function frontDepth(x: number, y: number): number {
    const v = clamp((y + 0.110) / 0.235, 0.01, 0.99);
    const probe = new THREE.Vector3();

    headSurface(v, 0, probe);
    const theta = Math.acos(clamp(x / Math.max(probe.x, 0.001), -1, 1));
    headSurface(v, theta, probe);

    return probe.z;
  }

  const eyes: EyeRig[] = [];

  for (const side of [1, -1]) {
    const x = side * 0.029;
    const y = 0.0175;
    const z = frontDepth(x, y) - 0.0032;

    const socket = group(head, x, y, z);

    // 1. Vascular Sclera Ellipsoid
    mesh(
      socket,
      sphere,
      sclera,
      0,
      0,
      0,
      0.0124,
      0.0088,
      0.0114
    );

    // 2. Medial Lacrimal Caruncle (pink inner tear-duct tissue at medial canthus)
    mesh(
      socket,
      sphere,
      caruncleMaterial,
      -side * 0.0108,
      -0.0006,
      0.0058,
      0.0022,
      0.0018,
      0.0018
    );

    // 3. Gaze-Rotating Iris, Pupil & Refractive Cornea Bulge
    const gaze = group(socket);

    mesh(
      gaze,
      sphere,
      iris,
      0,
      0,
      0.0101,
      0.0053,
      0.0053,
      0.0011
    );

    const pupil = mesh(
      gaze,
      sphere,
      dark,
      0,
      0,
      0.01112,
      0.0023,
      0.0023,
      0.00038
    );

    // Convex anterior corneal dome for crisp catchlights
    const cornea = mesh(
      gaze,
      sphere,
      corneaMaterial,
      0,
      0,
      0.0094,
      0.0058,
      0.0058,
      0.0029
    );

    // 4. Dynamic Upper & Lower Eyelid Shells + 3D Curved Eyelash Fans
    const upper = ownGeometry(makeLidGeometry());
    const lower = ownGeometry(makeLidGeometry());

    const upperMesh = mesh(socket, upper, lidSkin);
    const lowerMesh = mesh(socket, lower, skin);
    upperMesh.frustumCulled = false;
    lowerMesh.frustumCulled = false;

    const upperLashGroup = group(socket);
    const lowerLashGroup = group(socket);
    const upperLashGeom = ownGeometry(createEyelashFanGeometry(side, true));
    const lowerLashGeom = ownGeometry(createEyelashFanGeometry(side, false));
    mesh(upperLashGroup, upperLashGeom, dark);
    mesh(lowerLashGroup, lowerLashGeom, dark);

    updateLid(upper, 0, true, 0, upperLashGroup);
    updateLid(lower, 0, false, 0, lowerLashGroup);

    // 5. Winged Glamorous Eyeliner Flick along upper lateral canthus
    const linerPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const lx = side * (-0.010 + u * 0.0245);
      const ly = 0.0052 * Math.sin(u * PI * 0.78) + (u > 0.75 ? (u - 0.75) * 0.009 : 0);
      const lz = 0.0118 - Math.pow((u - 0.45) * 1.3, 2) * 0.0045;
      linerPoints.push(new THREE.Vector3(lx, ly, lz));
    }
    curve(socket, linerPoints, 0.00055, dark, false, 16);

    // 6. Articulated Sculpted Eyebrow Group (driven by FACS browRaise & browFurrow)
    const browGroup = group(head, 0, 0, 0);
    const eyebrowPoints: THREE.Vector3[] = [];

    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const px = side * (0.0135 + u * 0.0365);
      // High-fashion arched brow peaking at 68% lateral span
      const archLift =
        0.0048 * Math.sin(Math.pow(u, 0.85) * PI) +
        0.0014 * bell(u, 0.68, 0.18);
      const py = 0.0345 + archLift;
      eyebrowPoints.push(
        new THREE.Vector3(px, py, frontDepth(px, py) + 0.0016)
      );
    }

    curve(browGroup, eyebrowPoints, 0.0018, hairMaterial, false, 24);

    eyes.push({
      socket,
      gaze,
      pupil,
      cornea,
      upper,
      lower,
      upperLashGroup,
      lowerLashGroup,
      browGroup,
      side,
    });
  }

  // ==========================================================================
  // ORAL CAVITY, TEETH ARCHES, TONGUE & SCULPTED CUPID'S BOW LIPS
  // ==========================================================================
  const mouthY = -0.0465;
  const mouthZ = frontDepth(0, mouthY);

  // Dark oral cavity interior
  const mouth = mesh(
    head,
    sphere,
    mouthMaterial,
    0,
    mouthY - 0.0022,
    mouthZ - 0.0015,
    0.0185,
    0.0022,
    0.0065
  );

  // Upper Dental Arch (attached to maxilla)
  const upperTeethGeom = ownGeometry(createDentalArchGeometry(true));
  mesh(head, upperTeethGeom, teethMaterial, 0, mouthY - 0.0008, mouthZ + 0.0008);

  // Sculpted Upper Vermilion Lip with Cupid's Bow
  const upperLipGeom = ownGeometry(createUpperLipGeometry(frontDepth, mouthY));
  const upperLip = mesh(head, upperLipGeom, lipMaterial);

  // Articulated Jaw / Lower Lip Group (rotates/drops with `jawOpen` + `smile`)
  const jawGroup = group(head, 0, mouthY - 0.0045, mouthZ);
  const lowerTeethGeom = ownGeometry(createDentalArchGeometry(false));
  mesh(jawGroup, lowerTeethGeom, teethMaterial, 0, 0.0020, 0.0005);

  // Tongue inside lower jaw
  mesh(
    jawGroup,
    sphere,
    tongueMaterial,
    0,
    0.0005,
    -0.0035,
    0.0095,
    0.0024,
    0.0085
  );

  const lowerLipGeom = ownGeometry(createLowerLipGeometry(frontDepth, mouthY));
  const lowerLip = mesh(head, lowerLipGeom, lipMaterial);

  // ==========================================================================
  // MULTI-SYSTEM GLAMOUR HAIR: SCALP, BABY HAIRS, 32 WAVY LOCKS & `GirlHairSim`
  // ==========================================================================
  const scalpGeometry = ownGeometry(
    loft(
      84,
      36,
      (v, theta, out) => {
        const front = Math.max(0, Math.sin(theta));
        // Feminine rounded widow's-peak / temple hairline contour
        const templeWave = 0.04 * Math.cos(theta * 2);
        const lowerEdge = 0.35 + (0.42 + templeWave) * Math.pow(front, 2.2);
        const headV = lerp(lowerEdge, 0.9996, v);

        headSurface(headV, theta, out);
        const crownVolume = 0.0042 + 0.0032 * Math.sin(v * PI);
        out.x += Math.cos(theta) * crownVolume;
        out.z += Math.sin(theta) * crownVolume;
        out.y += 0.0032;
      },
      false
    )
  );

  mesh(head, scalpGeometry, hairMaterial);

  // Delicate swirled forehead/temple baby-hair edges along the anterior hairline
  const babyHairGeom = ownGeometry(createBabyHairWispsGeometry(headSurface));
  mesh(head, babyHairGeom, hairMaterial);

  // Translucent Malar Cheekbone Blush & Highlighter Shells
  const blushMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: '#e85d75',
      transparent: true,
      opacity: 0.24,
      roughness: 0.28,
      clearcoat: 0.45,
      clearcoatRoughness: 0.22,
      depthWrite: false,
    })
  );
  for (const side of [-1, 1]) {
    const cheekPatchGeom = ownGeometry(
      createCheekBlushPatchGeometry(side, headSurface)
    );
    mesh(head, cheekPatchGeom, blushMaterial);
  }

  // Wet lower-lid lacrimal tear meniscus for realistic stage eye catchlights
  const tearMeniscusGeom = ownGeometry(createTearMeniscusGeometry());
  for (const eye of eyes) {
    mesh(eye.socket, tearMeniscusGeom, corneaMaterial);
  }

  // Diamond & Gold Belly-Button Piercing at Sculpted Umbilicus (v = 0.145)
  if (wardrobeVis.showJewelry) {
    const navelPt = new THREE.Vector3();
    evaluateAnatomicalTorso(0.145, HALF_PI, navelPt, calibration, ZERO_BUST_OFFSET);
    mesh(
      spine,
      sphere,
      metal,
      0,
      navelPt.y + 0.0042,
      navelPt.z + 0.0038,
      0.0022,
      0.0022,
      0.0022
    );
    mesh(
      spine,
      sphere,
      diamondCrystal,
      0,
      navelPt.y - 0.0005,
      navelPt.z + 0.0048,
      0.0036,
      0.0046,
      0.0028
    );
  }

  // 1. 32 Multi-Tier Spring-Physics Glamorous Wavy Locks around the Crown & Back
  const hair: HairLockRig[] = [];

  for (let i = 0; i < 32; i++) {
    const u = i / 31;
    const angle = PI * 1.5 + (u - 0.5) * 3.55;
    const isFraming = Math.abs(u - 0.5) > 0.39;
    const tier = i % 3;

    const lengthA = isFraming ? 0.165 : 0.225 + 0.018 * tier;
    const lengthB = isFraming ? 0.145 : 0.195 + 0.014 * (i % 4);
    const lengthC = isFraming ? 0.095 : 0.125;
    const width = isFraming ? 0.0108 : 0.0155;

    const anchor = group(
      head,
      Math.cos(angle) * 0.0755,
      isFraming ? 0.054 : 0.058 + tier * 0.006,
      Math.sin(angle) * 0.084
    );

    anchor.rotation.y = HALF_PI - angle;

    const upper = group(anchor);
    const lower = group(upper, 0, -lengthA * 0.96, 0.008);
    const tip = group(lower, 0, -lengthB * 0.95, 0.006);

    const makeWavyLock = (
      length: number,
      radius: number,
      taperStart: number,
      taperEnd: number,
      wavePhase: number
    ) =>
      ownGeometry(
        loft(14, 20, (v, theta, out) => {
          const r = radius * lerp(taperEnd, taperStart, Math.pow(v, 0.55));
          // Glamorous S-wave salon curl profile
          const sWaveZ =
            0.0085 * Math.sin((1 - v) * PI * 1.35 + wavePhase) +
            0.0035 * Math.cos((1 - v) * PI * 2.7);
          const sWaveX = 0.0032 * Math.sin((1 - v) * PI * 1.8 + wavePhase);

          out.set(
            Math.cos(theta) * r + sWaveX,
            -length * (1 - v),
            Math.sin(theta) * r * 0.58 + sWaveZ
          );
        })
      );

    const mat = i % 3 === 0 ? hairHighlight : hairMaterial;

    mesh(upper, makeWavyLock(lengthA, width, 1.0, 0.78, i * 0.4), mat);
    mesh(lower, makeWavyLock(lengthB, width * 0.78, 1.0, 0.45, i * 0.4 + 1.1), mat);
    mesh(tip, makeWavyLock(lengthC, width * 0.45, 1.0, 0.06, i * 0.4 + 2.2), mat);

    hair.push({
      upper,
      lower,
      tip,
      angle,
      basePitch: 0.055 + tier * 0.015,
      pitch: 0.055,
      roll: 0,
      vx: 0,
      vz: 0,
      isFraming,
    });
  }

  // 2. Full `GirlHairSim` Multi-Chain Verlet Hair Engine Integration
  // (6-Segment High Ponytail + 4-Segment Left & Right Temple Framing Locks)
  const verletHairSim = new GirlHairSim();
  const verletHairRoot = group(root);

  // Decorative Gold & Velvet Scrunchy Cuff at Ponytail Crown Base
  const scrunchyGroup = group(head, 0, 0.068, -0.088);
  scrunchyGroup.rotation.x = -0.35;
  mesh(scrunchyGroup, belt, fabric, 0, 0, 0, 0.028, 0.028, 0.022);
  mesh(scrunchyGroup, cylinder, metal, 0, -0.012, 0, 0.024, 0.012, 0.024);

  const ponytailMeshes: THREE.Mesh[] = [];
  const leftLockMeshes: THREE.Mesh[] = [];
  const rightLockMeshes: THREE.Mesh[] = [];

  const hairCapsuleGeom = ownGeometry(
    loft(16, 14, (v, theta, out) => {
      const env = Math.pow(Math.sin(v * PI), 0.28);
      const r = env * (1.0 - 0.18 * (1 - v));
      out.set(Math.cos(theta) * r, v - 0.5, Math.sin(theta) * r * 0.78);
    })
  );

  for (let i = 0; i < PONYTAIL_SEGMENTS; i++) {
    const m = mesh(
      verletHairRoot,
      hairCapsuleGeom,
      i % 2 === 0 ? hairMaterial : hairHighlight
    );
    m.frustumCulled = false;
    ponytailMeshes.push(m);
  }
  for (let i = 0; i < SIDELOCK_SEGMENTS; i++) {
    const mL = mesh(verletHairRoot, hairCapsuleGeom, hairHighlight);
    const mR = mesh(verletHairRoot, hairCapsuleGeom, hairHighlight);
    mL.frustumCulled = false;
    mR.frustumCulled = false;
    leftLockMeshes.push(mL);
    rightLockMeshes.push(mR);
  }

  // ==========================================================================
  // VERLET FLARED COUTURE SKIRT (`SkirtClothSim`) & TUBULAR NEON HEM
  // ==========================================================================
  const cloth = new SkirtClothSim();
  const skirtGeometry = ownGeometry(new THREE.BufferGeometry());

  skirtGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(cloth.positions), 3)
      .setUsage(THREE.DynamicDrawUsage)
  );

  skirtGeometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array(cloth.normals.length), 3)
      .setUsage(THREE.DynamicDrawUsage)
  );

  skirtGeometry.setAttribute(
    'uv',
    new THREE.BufferAttribute(cloth.uvs, 2)
  );

  skirtGeometry.setIndex(new THREE.BufferAttribute(cloth.indices, 1));

  const skirt = mesh(root, skirtGeometry, skirtFabric);
  skirt.frustumCulled = false;
  skirt.visible = wardrobeVis.showFlaredSkirt;

  // Dynamic 12-sided tubular neon hem around the bottom of the Verlet skirt
  const hemSides = 12;
  const hemGeometry = ownGeometry(new THREE.BufferGeometry());
  const hemCount = SKIRT_COLS * hemSides;
  const hemPositions = new Float32Array(hemCount * 3);
  const hemNormals = new Float32Array(hemCount * 3);
  const hemIndices: number[] = [];

  for (let ring = 0; ring < SKIRT_COLS; ring++) {
    for (let side = 0; side < hemSides; side++) {
      const a = ring * hemSides + side;
      const b = ((ring + 1) % SKIRT_COLS) * hemSides + side;
      const c = ring * hemSides + ((side + 1) % hemSides);
      const d =
        ((ring + 1) % SKIRT_COLS) * hemSides +
        ((side + 1) % hemSides);

      hemIndices.push(a, c, b, c, d, b);
    }
  }

  hemGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(hemPositions, 3)
      .setUsage(THREE.DynamicDrawUsage)
  );

  hemGeometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(hemNormals, 3)
      .setUsage(THREE.DynamicDrawUsage)
  );

  hemGeometry.setIndex(hemIndices);

  // V6 GLAM-2: the hem trim follows the couture metals (gold) instead of the
  // neon accent — with a gold-sequin gown a cyan LED ring at the hem read as
  // a different outfit; gold unifies belt / choker / trims / hem.
  const hem = mesh(root, hemGeometry, metal);
  hem.frustumCulled = false;
  hem.visible = wardrobeVis.showFlaredSkirt;

  // Initialize World & Local Matrices for Cloth & Hair
  root.updateMatrixWorld(true);
  cloth.resetToMatrix(pelvis.matrix);

  const initHeadLocalMat = new THREE.Matrix4()
    .copy(root.matrixWorld)
    .invert()
    .multiply(head.matrixWorld);
  verletHairSim.resetToMatrix(initHeadLocalMat);

  // Reusable Face Slot for `updateGirlFace`
  const faceSlot: GirlFaceSlot = {
    slotIndex: 0,
    faceIntent: 'joyful',
    mode: 'DUET',
    isDuet: true,
    targetYaw: 0,
    targetPitch: 0,
    currentYaw: 0,
    cameraYaw: 0,
    blink: 0,
    blinkL: 0,
    blinkR: 0,
    blinkKind: 'NONE',
    squint: 0,
    browRaise: 0,
    browRaiseL: 0,
    browRaiseR: 0,
    browFurrow: 0,
    smile: 0.5,
    smirkAsym: 0,
    jawOpen: 0,
    lipPucker: 0,
    blush: 0.3,
    gazeYaw: 0,
    gazePitch: 0,
  };

  return {
    root,
    pelvis,
    spine,
    headPivot,
    head,
    jawGroup,
    upperLip,
    lowerLip,
    mouth,
    mouthY,
    mouthZ,
    legs,
    arms,
    eyes,
    hair,
    bustAnchors,
    torsoGeometry,
    braletteGeometry,
    bodiceGeometry,
    pelvisGeometry,
    briefsGeometry,
    shortsGeometry,
    calibration,
    skin,
    blushMaterial,
    accent,
    diamondCrystal,
    cloth,
    skirtGeometry,
    hemGeometry,
    hemPositions,
    hemNormals,
    hemSides,
    verletHairSim,
    ponytailMeshes,
    leftLockMeshes,
    rightLockMeshes,
    faceSlot,
    geometries,
    materials,
    textures,
    capsules: new Float32Array(42),

    scratch: {
      inverseRoot: new THREE.Matrix4(),
      inversePelvis: new THREE.Matrix4(),
      waist: new THREE.Matrix4(),
      headRootLocal: new THREE.Matrix4(),
      chestRootLocal: new THREE.Matrix4(),
      target: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      bend: new THREE.Vector3(),
      kneePoint: new THREE.Vector3(),
      upperDirection: new THREE.Vector3(),
      lowerDirection: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      worldScale: new THREE.Vector3(),
      qUpper: new THREE.Quaternion(),
      qLower: new THREE.Quaternion(),
      qFoot: new THREE.Quaternion(),
      qTemp: new THREE.Quaternion(),
    },

    softBody: {
      leftBreast: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 } as SoftBodySpring3D,
      rightBreast: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 } as SoftBodySpring3D,
      leftGlute: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 } as SoftBodySpring3D,
      rightGlute: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 } as SoftBodySpring3D,
      prevPelvisX: 0,
      prevPelvisY: 0.99,
      prevPelvisZ: 0,
      prevPelvisVx: 0,
      prevPelvisVy: 0,
      prevPelvisVz: 0,
      vertexUpdateCounter: 0,
      lastRebuildKey: 0,
      lastRebuildAppliedKey: 0,
    },

    state: {
      accumulator: 0,
      time: 0,
      beatCount: 0,
      spin: 0,
      spinVelocity: 0,
      frameCounter: 0,
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      high: 0,
      energy: 0,
      beat: 0,
      nextBlink: 2.4,
      blinkStart: -10,
      blinkIndex: 0,
      activeMoveIndex: 0,
      prevMoveIndex: 0,
      moveBlend: 1,
    },
  };
}

type Rig = ReturnType<typeof createRig>;
// ============================================================================
// SECTION 6: ANALYTICAL LIMB IK, FOOT-ROLL & SECONDARY SOFT-BODY PHYSICS
// ============================================================================
// Features:
//   - Two-bone analytical leg IK with soft-knee hyper-extension damping,
//     anatomical outward knee-pole cant, and heel-ball-toe foot-roll bank.
//   - 3-DOF Coupled Damped Spring Soft-Body Physics for Left/Right Bust and
//     Left/Right Glutes driven by pelvis acceleration, spin centrifugal force,
//     and bass/beat impulses.
//   - Corrective muscle bulge & clavicle auto-shrug kinematics when arms lift.
// ============================================================================

function solveLeg(
  rig: Rig,
  leg: LegRig,
  x: number,
  y: number,
  z: number,
  heading: number,
  footPitch = 0,
  footRoll = 0,
  kneeSwivel = 0
): void {
  const s = rig.scratch;

  // Desired root-local ankle position -> pelvis-local position
  s.target
    .set(x, y, z)
    .applyMatrix4(rig.root.matrixWorld)
    .applyMatrix4(s.inversePelvis);

  s.direction.copy(s.target).sub(leg.hip.position);

  const rawDist = s.direction.length();
  const maxReach = THIGH + SHIN - 0.0025;
  const minReach = Math.abs(THIGH - SHIN) + 0.004;

  // Soft-knee hyper-extension spring damping near full extension
  let distance = clamp(rawDist, minReach, maxReach);
  const softThreshold = maxReach - 0.025;
  if (distance > softThreshold) {
    const excess = distance - softThreshold;
    distance = softThreshold + 0.025 * (1 - Math.exp(-excess / 0.025));
  }

  s.direction.normalize();

  // Knee pole is forward (+Z) in pelvis coordinates with subtle feminine swivel
  s.bend
    .set(leg.side * (0.06 + kneeSwivel), 0, 1)
    .addScaledVector(s.direction, -s.direction.z);

  if (s.bend.lengthSq() < 0.00001) {
    s.bend
      .set(0, 1, 0)
      .addScaledVector(s.direction, -s.direction.y);
  }

  s.bend.normalize();

  const along =
    (THIGH * THIGH - SHIN * SHIN + distance * distance) /
    (2 * distance);

  const outward = Math.sqrt(
    Math.max(0, THIGH * THIGH - along * along)
  );

  s.kneePoint
    .copy(leg.hip.position)
    .addScaledVector(s.direction, along)
    .addScaledVector(s.bend, outward);

  s.upperDirection
    .copy(s.kneePoint)
    .sub(leg.hip.position)
    .normalize();

  s.target
    .copy(leg.hip.position)
    .addScaledVector(s.direction, distance);

  s.lowerDirection
    .copy(s.target)
    .sub(s.kneePoint)
    .normalize();

  s.qUpper.setFromUnitVectors(DOWN, s.upperDirection);
  s.qLower.setFromUnitVectors(DOWN, s.lowerDirection);

  leg.hip.quaternion.copy(s.qUpper);

  leg.knee.quaternion
    .copy(s.qUpper)
    .invert()
    .multiply(s.qLower);

  // Corrective quadriceps/hamstring & calf muscle flex swell based on knee bend angle
  const cosKnee = clamp(s.upperDirection.dot(s.lowerDirection), -1, 1);
  const kneeBendFactor = clamp((1 - cosKnee) * 0.5, 0, 1);
  const thighFlex = 1 + kneeBendFactor * 0.045;
  const calfFlex = 1 + ( kneeBendFactor * 0.035 + Math.max(0, footPitch) * 0.06 );
  leg.thighMesh.scale.set(thighFlex, 1, thighFlex);
  leg.calfMesh.scale.set(calfFlex, 1, calfFlex);

  // Keep the sole level in root space + apply dancer foot pitch (pointe/heel) & bank roll
  s.qFoot.setFromEuler(
    new THREE.Euler(footPitch, heading, footRoll, 'YXZ')
  );
  s.qTemp.copy(rig.pelvis.quaternion).invert().multiply(s.qFoot);

  leg.ankle.quaternion
    .copy(s.qLower)
    .invert()
    .multiply(s.qTemp);
}

function stepSecondarySoftBodyPhysics(
  rig: Rig,
  dt: number,
  spinVel: number,
  bass: number,
  beat: number,
  breathWave: number
): void {
  const sb = rig.softBody;
  const px = rig.pelvis.position.x;
  const py = rig.pelvis.position.y;
  const pz = rig.pelvis.position.z;

  const vx = clamp((px - sb.prevPelvisX) / dt, -5, 5);
  const vy = clamp((py - sb.prevPelvisY) / dt, -5, 5);
  const vz = clamp((pz - sb.prevPelvisZ) / dt, -5, 5);

  const ax = clamp((vx - sb.prevPelvisVx) / dt, -35, 35);
  const ay = clamp((vy - sb.prevPelvisVy) / dt, -35, 35);
  const az = clamp((vz - sb.prevPelvisVz) / dt, -35, 35);

  sb.prevPelvisX = px;
  sb.prevPelvisY = py;
  sb.prevPelvisZ = pz;
  sb.prevPelvisVx = vx;
  sb.prevPelvisVy = vy;
  sb.prevPelvisVz = vz;

  const firmness = clamp(rig.calibration.bustFirmness, 0.5, 1.6);
  // Natural critically-underdamped soft-tissue spring constants
  const kBust = 210 * firmness;
  const dBust = 14.5 * Math.sqrt(firmness);
  const centrifugal = Math.min(12, spinVel * spinVel * 0.14);

  const stepSpring = (
    sp: SoftBodySpring3D,
    side: number,
    stiffness: number,
    damping: number,
    maxDisp: number
  ) => {
    const extFx = -ax * 0.0011 + side * centrifugal * 0.00045 - spinVel * 0.0005;
    const extFy = -ay * 0.0014 + (bass * 0.004 + beat * 0.006);
    const extFz = -az * 0.0011 + centrifugal * 0.0005 + beat * 0.003;

    sp.vx += ((extFx - sp.x) * stiffness - sp.vx * damping) * dt;
    sp.vy += ((extFy - sp.y) * stiffness - sp.vy * damping) * dt;
    sp.vz += ((extFz - sp.z) * stiffness - sp.vz * damping) * dt;

    sp.x = clamp(sp.x + sp.vx * dt, -maxDisp, maxDisp);
    sp.y = clamp(sp.y + sp.vy * dt, -maxDisp, maxDisp);
    sp.z = clamp(sp.z + sp.vz * dt, -maxDisp, maxDisp);
  };

  stepSpring(sb.leftBreast, 1, kBust, dBust, 0.0085);
  stepSpring(sb.rightBreast, -1, kBust * 1.03, dBust, 0.0085);
  stepSpring(sb.leftGlute, 1, 240, 16.5, 0.0065);
  stepSpring(sb.rightGlute, -1, 245, 16.5, 0.0065);

  // V5.1 PERF FIX: the dynamic torso/pelvis garment rebuilds re-evaluate
  // ~10k anatomical surface points + re-normalize 6 loft geometries. Doing
  // that at a fixed 60 Hz brought the whole app to ~1 fps. The soft-body
  // springs displace at most ~8.5 mm and are still for most of a steady
  // dance — so the rebuilds are now gated by a dirty check: skip unless a
  // spring or the breath wave moved by a visible epsilon since the last
  // rebuild. Visual quality is unchanged (springs are clamped sub-centimeter
  // and the rebuild fires the moment they move); steady-state cost is zero.
  const springStateKey =
    sb.leftBreast.x * 31 + sb.leftBreast.y * 17 + sb.leftBreast.z * 7 +
    sb.rightBreast.x * 29 + sb.rightBreast.y * 13 + sb.rightBreast.z * 5 +
    sb.leftGlute.x * 23 + sb.leftGlute.y * 11 + sb.leftGlute.z * 3 +
    sb.rightGlute.x * 19 + sb.rightGlute.y * 9 + sb.rightGlute.z * 2 +
    breathWave * 41;
  const springsMoved =
    Math.abs(springStateKey - sb.lastRebuildKey) > 1.2e-3;

  // V5.1 PERF FIX: the bust-anchor groups lost their detail meshes in the
  // tasteful-glamour pass and nothing reads them — skip their per-step
  // surface evaluation entirely. The garment vertex rebuilds moved to the
  // component's useFrame (once per render frame, 30 Hz cap) so the 8-step
  // 120 Hz catch-up loop can never multiply them.
  sb.lastRebuildKey = springStateKey;
}

function writeCapsule(
  rig: Rig,
  index: number,
  a: THREE.Object3D,
  b: THREE.Object3D,
  radius: number
): void {
  const s = rig.scratch;
  const buffer = rig.capsules;
  const offset = index * 7;

  s.a.setFromMatrixPosition(a.matrixWorld).applyMatrix4(s.inverseRoot);
  s.b.setFromMatrixPosition(b.matrixWorld).applyMatrix4(s.inverseRoot);

  buffer[offset] = s.a.x;
  buffer[offset + 1] = s.a.y;
  buffer[offset + 2] = s.a.z;
  buffer[offset + 3] = s.b.x;
  buffer[offset + 4] = s.b.y;
  buffer[offset + 5] = s.b.z;
  buffer[offset + 6] = radius;
}

function updateHem(rig: Rig): void {
  const ring = rig.cloth.hemRingPositions;
  const dst = rig.hemPositions;
  const normal = rig.hemNormals;
  const sides = rig.hemSides;

  for (let r = 0; r < SKIRT_COLS; r++) {
    const i = r * 3;
    const previous = ((r + SKIRT_COLS - 1) % SKIRT_COLS) * 3;
    const next = ((r + 1) % SKIRT_COLS) * 3;

    let tx = ring[next] - ring[previous];
    let ty = ring[next + 1] - ring[previous + 1];
    let tz = ring[next + 2] - ring[previous + 2];
    const length = Math.hypot(tx, ty, tz) || 1;

    tx /= length;
    ty /= length;
    tz /= length;

    let bx: number;
    let by: number;
    let bz: number;

    if (Math.abs(ty) < 0.90) {
      bx = -tz;
      by = 0;
      bz = tx;
    } else {
      bx = 0;
      by = tz;
      bz = -ty;
    }

    const bLength = Math.hypot(bx, by, bz) || 1;
    bx /= bLength;
    by /= bLength;
    bz /= bLength;

    const nx = ty * bz - tz * by;
    const ny = tz * bx - tx * bz;
    const nz = tx * by - ty * bx;

    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * TAU;
      const c = Math.cos(angle);
      const s = Math.sin(angle);

      const ox = bx * c + nx * s;
      const oy = by * c + ny * s;
      const oz = bz * c + nz * s;
      const j = (r * sides + side) * 3;

      dst[j] = ring[i] + ox * 0.0028;
      dst[j + 1] = ring[i + 1] + oy * 0.0028;
      dst[j + 2] = ring[i + 2] + oz * 0.0028;

      normal[j] = ox;
      normal[j + 1] = oy;
      normal[j + 2] = oz;
    }
  }

  rig.hemGeometry.getAttribute('position').needsUpdate = true;
  rig.hemGeometry.getAttribute('normal').needsUpdate = true;
}

// ============================================================================
// SECTION 7: 16-MOVE GLAMOUR CHOREOGRAPHY ENGINE & CAT DUET INTERACTION
// ============================================================================
// Cycles through 8 rich, musical dance styles across 128-beat macro-phrases,
// with continuous contrapposto hip/ribcage counter-isolation, expressive
// finger flourishes, and interactive duet spotting with the dancing cat.
// ============================================================================

interface FrameInput {
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  high: number;
  energy: number;
  beat: number;
  bpm: number;
  active: boolean;
  catX: number;
  catY: number;
  catZ: number;
  partnerYaw?: number;
  faceIntent?: FaceIntent;
  tailCarriage?: HairCarriage;
  /** V5 bridge: host-engine pose (non-null = drive skeleton from it). */
  external?: ExternalDivaPose | null;
}

const MOVE_FACE_INTENTS: readonly FaceIntent[] = [
  'joyful',
  'smug',
  'fierce',
  'joyful',
  'serene',
  'smug',
  'intense',
  'joyful',
];

const MOVE_HAIR_CARRIAGES: readonly HairCarriage[] = [
  'sway',
  'whip',
  'high',
  'curled',
  'sway',
  'high',
  'whip',
  'curled',
];

function simulate(
  rig: Rig,
  input: FrameInput,
  localFloor: number
): void {
  const state = rig.state;
  const dt = STEP;

  state.time += dt;

  const envelope = (current: number, target: number) =>
    THREE.MathUtils.damp(
      current,
      target,
      target > current ? 18 : 6.5,
      dt
    );

  state.bass = envelope(state.bass, input.active ? input.bass : 0);
  state.lowMid = envelope(state.lowMid, input.active ? input.lowMid : 0);
  state.mid = envelope(state.mid, input.active ? input.mid : 0);
  state.highMid = envelope(state.highMid, input.active ? input.highMid : 0);
  state.high = envelope(state.high, input.active ? input.high : 0);
  state.energy = envelope(state.energy, input.active ? input.energy : 0);
  state.beat = envelope(state.beat, input.active ? input.beat : 0);

  const t = state.time;
  const energy = state.energy;
  const bass = state.bass;
  const mid = state.mid;
  const high = state.high;
  const beat = state.beat;

  if (input.active) {
    state.beatCount += (dt * input.bpm) / 60;
  }

  // Musical timing is independent of loudness.
  const phase = state.beatCount * PI;
  const halfPhase = phase * 0.5;
  const quarterPhase = phase * 0.25;
  const phrase128 = state.beatCount % 128;
  const mode8 = Math.floor(phrase128 / 16) % 8;
  const mode = mode8 % 4;
  const progress = (phrase128 % 16) / 16;

  const phraseEnvelope =
    smooth(0, 0.14, progress) *
    (1 - smooth(0.82, 1, progress));

  const activity = input.active ? 0.20 + 0.80 * energy : 0.08;
  const spinWeight = mode === 1 ? phraseEnvelope * activity : 0;
  const squatWeight = mode === 2 ? phraseEnvelope * activity : 0;
  const kickWeight = mode === 3 ? phraseEnvelope * activity : 0;
  const catDuetWeight = (mode8 === 4 || mode8 === 5) ? phraseEnvelope * activity : 0;
  const vogueWeight = (mode8 === 6 || mode8 === 7) ? phraseEnvelope * activity : 0;

  const blendedPose = input.external
    ? null
    : synthesizeBlendedGlamourPose(
        state.beatCount,
        phase,
        activity,
        bass,
        mid,
        high,
        beat
      );

  // V5 BRIDGE: host pose drives spin + pelvis directly (already damped at
  // 60 Hz on the host side). spinVelocity is reconstructed (wrap-safe) so
  // hair centrifugal + skirt swirl keep reacting to the host's turns.
  if (input.external) {
    const prevSpin = state.spin;
    state.spin = input.external.rootRotY;
    let dSpin = state.spin - prevSpin;
    dSpin = Math.atan2(Math.sin(dSpin), Math.cos(dSpin));
    state.spinVelocity = THREE.MathUtils.damp(
      state.spinVelocity,
      dSpin / dt,
      14,
      dt
    );
    const ext = input.external;
    rig.pelvis.position.set(
      ext.pelvisX,
      localFloor + 0.99 + ext.pelvisYOffset,
      ext.pelvisZ
    );
    rig.pelvis.rotation.set(
      ext.pelvisRotX,
      ext.rootRotY + ext.pelvisRotY,
      ext.pelvisRotZ
    );
    rig.pelvis.scale.set(
      clamp(ext.pelvisScaleX, 0.55, 1.6),
      clamp(ext.pelvisScaleY, 0.55, 1.6),
      clamp(ext.pelvisScaleZ, 0.55, 1.6)
    );
  } else {
    const targetSpin = Math.max(
      spinWeight * (2.2 + bass * 3.2),
      blendedPose!.spinRateTarget
    );
    state.spinVelocity = THREE.MathUtils.damp(
      state.spinVelocity,
      targetSpin,
      5.5,
      dt
    );
    state.spin = (state.spin + state.spinVelocity * dt) % TAU;

    // Cuban Figure-8 Hip Sway & Contrapposto Bounce
    const sway =
      Math.sin(phase) * (0.014 + activity * 0.036) +
      Math.sin(halfPhase) * catDuetWeight * 0.025;
    const figure8Z =
      Math.sin(phase * 2) * activity * 0.014 +
      Math.cos(phase) * catDuetWeight * 0.012;
    const bounce =
      activity * 0.020 * Math.pow(Math.sin(phase), 2) +
      squatWeight * 0.068 * Math.pow(Math.sin(phase), 2) +
      beat * 0.015;

    rig.pelvis.position.set(
      lerp(sway, blendedPose!.pelvisX, 0.65),
      localFloor + 0.99 + lerp(-bounce, blendedPose!.pelvisYOffset, 0.65),
      lerp(figure8Z, blendedPose!.pelvisZ, 0.65)
    );

    // Feminine contrapposto hip tilt (pelvis rolls opposite to supporting leg & counter-twists spine)
    const hipRoll = lerp(
      -Math.sin(phase) * (0.045 + activity * 0.095),
      blendedPose!.pelvisRoll,
      0.68
    );
    const hipYaw =
      state.spin +
      lerp(Math.cos(phase) * activity * 0.145, blendedPose!.pelvisYawOffset, 0.68);
    const hipPitch = lerp(
      0.022 + Math.sin(phase * 2) * activity * 0.038 + squatWeight * 0.08,
      blendedPose!.pelvisPitch,
      0.68
    );

    rig.pelvis.rotation.set(hipPitch, hipYaw, hipRoll);
  }

  // Subtle thoracic breathing + soft-body breast/glute spring step
  const breathWave = Math.sin(t * (1.8 + energy * 1.4));
  const breathScale = 1 + breathWave * 0.0028;

  // Thoracic Counter-Isolation + Body-Wave Undulation
  if (input.external) {
    const ext = input.external;
    rig.spine.rotation.set(ext.spinePitch, ext.spineYaw, ext.spineRoll);
    rig.spine.scale.set(
      clamp(ext.chestScale, 0.6, 1.6) * breathScale,
      1,
      clamp(ext.chestScale, 0.6, 1.6) * breathScale
    );
  } else {
    // V5.1 FIX: these lerp constants dereference blendedPose — they must
    // ONLY be computed on the built-in pose path (blendedPose is null when
    // the external bridge is active; computing them unconditionally threw
    // every step and killed the whole rAF loop).
    const bodyWavePitch = lerp(
      -0.018 +
        Math.sin(phase * 2 - 0.65) * (squatWeight * 0.14 + activity * 0.035) +
        catDuetWeight * 0.065,
      blendedPose!.spinePitch,
      0.70
    );
    const spineCounterYaw = lerp(
      -Math.cos(phase) * activity * 0.115,
      blendedPose!.spineYaw,
      0.70
    );
    const spineCounterRoll = lerp(
      Math.sin(phase) * (0.032 + activity * 0.078),
      blendedPose!.spineRoll,
      0.70
    );
    rig.spine.rotation.set(bodyWavePitch, spineCounterYaw, spineCounterRoll);
    rig.spine.scale.set(breathScale, 1, breathScale);
  }

  stepSecondarySoftBodyPhysics(
    rig,
    dt,
    state.spinVelocity,
    bass,
    beat,
    breathWave
  );

  // ==========================================================================
  // FACS FACIAL EXPRESSION & CAT COMPANION DUET GAZE SOLVER (`updateGirlFace`)
  // ==========================================================================
  const catAngle = Math.atan2(
    input.catX - rig.pelvis.position.x,
    Math.max(0.15, input.catZ - rig.pelvis.position.z)
  );
  const desiredPartnerYaw = input.external
    ? (input.external.isDuet ? (input.external.partnerYaw ?? 0) : 0)
    : input.partnerYaw ?? (catDuetWeight > 0.15 ? catAngle : 0);

  const jointTargets = {
    rootRotY: 0,
    pelvisRotX: rig.pelvis.rotation.x,
    pelvisRotY: rig.pelvis.rotation.y,
    pelvisRotZ: rig.pelvis.rotation.z,
    lowerSpineX: rig.spine.rotation.x * 0.5,
    lowerSpineY: rig.spine.rotation.y * 0.5,
    lowerSpineZ: rig.spine.rotation.z * 0.5,
    chestX: rig.spine.rotation.x * 0.5,
    chestY: rig.spine.rotation.y * 0.5,
    chestZ: rig.spine.rotation.z * 0.5,
    neckX: input.external
      ? input.external.neckX
      : Math.sin(phase * 2 - 0.3) * activity * 0.025 - beat * 0.025,
    neckY: input.external
      ? input.external.neckY
      : -Math.cos(halfPhase) * activity * 0.08,
    neckZ: input.external
      ? input.external.neckZ
      : Math.sin(halfPhase) * activity * 0.035,
    headX: input.external
      ? input.external.headX
      : catDuetWeight * 0.08,
    headY: input.external
      ? input.external.headY
      : -Math.cos(halfPhase) * activity * 0.06,
    headZ: input.external
      ? input.external.headZ
      : Math.sin(halfPhase) * activity * 0.04,
  };

  const moveContext = {
    dt,
    elapsed: t,
    beatCount: Math.floor(state.beatCount),
    p: (state.beatCount % 1) * TAU,
    halfP: (state.beatCount % 2) * PI,
    quarterP: (state.beatCount % 4) * HALF_PI,
    bass,
    lowMid: state.lowMid,
    mid,
    highMid: state.highMid,
    high,
    overall: energy,
    beatPulse: beat,
  };

  const faceSlot = rig.faceSlot;
  faceSlot.faceIntent = input.faceIntent ?? MOVE_FACE_INTENTS[mode8];
  faceSlot.isDuet = input.external
    ? input.external.isDuet
    : catDuetWeight > 0.1 || input.partnerYaw !== undefined;
  faceSlot.mode = faceSlot.isDuet ? 'DUET' : 'SOLO';
  faceSlot.targetYaw = desiredPartnerYaw;
  faceSlot.targetPitch = input.external ? 0 : (catDuetWeight > 0.15 ? -0.14 : 0);
  faceSlot.currentYaw = 0;

  updateGirlFace(
    jointTargets as unknown as Parameters<typeof updateGirlFace>[0],
    moveContext as unknown as Parameters<typeof updateGirlFace>[1],
    faceSlot
  );

  rig.headPivot.rotation.set(
    jointTargets.neckX + jointTargets.headX,
    jointTargets.neckY + jointTargets.headY,
    jointTargets.neckZ + jointTargets.headZ
  );

  // ==========================================================================
  // GLAMOUR PORT DE BRAS ARMS, CLAVICLE AUTO-SHRUG & 5-FINGER GESTURES
  // ==========================================================================
  for (const arm of rig.arms) {
    const side = arm.side;
    const wave = Math.sin(phase + (side < 0 ? PI : 0));
    const overhead = spinWeight;
    const vogueFrame = vogueWeight * (0.5 + 0.5 * Math.sin(phase + side * 0.8));
    const catBeckon = catDuetWeight * (side > 0 ? 1 : 0.35);

    if (input.external) {
      // V5 BRIDGE: host-engine arm channels. Their rig's +X chain ("left"
      // in Diva naming) receives OUR +X channels (our "R"); the host's Y
      // twist convention is mirrored versus the native rig, so Y negates.
      // Light 22/s damp smooths the 60 Hz host snapshot onto the 120 Hz grid.
      const ext = input.external;
      const sX = side > 0 ? ext.shoulderRX : ext.shoulderLX;
      const sY = side > 0 ? ext.shoulderRY : ext.shoulderLY;
      const sZ = side > 0 ? ext.shoulderRZ : ext.shoulderLZ;
      arm.shoulder.rotation.x = THREE.MathUtils.damp(
        arm.shoulder.rotation.x,
        sX,
        22,
        dt
      );
      arm.shoulder.rotation.y = THREE.MathUtils.damp(
        arm.shoulder.rotation.y,
        -sY,
        22,
        dt
      );
      arm.shoulder.rotation.z = THREE.MathUtils.damp(
        arm.shoulder.rotation.z,
        sZ,
        22,
        dt
      );
      arm.elbow.rotation.set(
        side > 0 ? ext.elbowRX : ext.elbowLX,
        -(side > 0 ? ext.elbowRY : ext.elbowLY),
        0
      );
      arm.wrist.rotation.set(
        side > 0 ? ext.wristRX : ext.wristLX,
        0,
        side > 0 ? ext.wristRZ : ext.wristLZ
      );
    } else {
      const shoulderX =
        -0.18 +
        wave * activity * 0.42 -
        overhead * 1.72 -
        vogueFrame * 0.95 -
        catBeckon * 0.55;

      const shoulderZ =
        side *
        (0.16 +
          activity * 0.16 +
          Math.max(0, wave) * high * 0.22 +
          overhead * 0.38 +
          vogueFrame * 0.28);

      const shoulderY =
        side * (0.12 + Math.cos(phase) * activity * 0.14) +
        side * vogueFrame * 0.35;

      const poseShX = side > 0 ? blendedPose!.leftShoulderX : blendedPose!.rightShoulderX;
      const poseShY = side > 0 ? blendedPose!.leftShoulderY : blendedPose!.rightShoulderY;
      const poseShZ = side > 0 ? blendedPose!.leftShoulderZ : blendedPose!.rightShoulderZ;

      arm.shoulder.rotation.x = THREE.MathUtils.damp(
        arm.shoulder.rotation.x,
        lerp(shoulderX, poseShX, 0.62),
        11,
        dt
      );
      arm.shoulder.rotation.y = THREE.MathUtils.damp(
        arm.shoulder.rotation.y,
        lerp(shoulderY, poseShY, 0.62),
        11,
        dt
      );
      arm.shoulder.rotation.z = THREE.MathUtils.damp(
        arm.shoulder.rotation.z,
        lerp(shoulderZ, poseShZ, 0.62),
        11,
        dt
      );

      // Clavicle Auto-Shrug: raises collarbone naturally when humerus lifts high
      const elbowFlex =
        -0.34 -
        activity * (0.46 + wave * 0.26) -
        overhead * 0.44 -
        vogueFrame * 0.72 -
        catBeckon * 0.48;

      arm.elbow.rotation.set(
        elbowFlex,
        side * (0.09 + vogueFrame * 0.32),
        -side * (0.08 + catBeckon * 0.15)
      );

      arm.wrist.rotation.set(
        Math.sin(phase * 1.5) * activity * 0.16 + vogueFrame * 0.28,
        side * (activity * 0.10 + Math.cos(phase) * 0.12),
        side * Math.cos(phase * 1.5) * activity * 0.15
      );
    }

    // Clavicle Auto-Shrug: raises collarbone naturally when humerus lifts
    // high (reads the LIVE shoulder rotation — valid in both pose sources).
    const armLiftAmount = clamp((-arm.shoulder.rotation.x - 0.35) / 1.5, 0, 1);
    arm.clavicle.rotation.z = side * armLiftAmount * 0.18;
    arm.clavicle.rotation.y = -side * armLiftAmount * 0.08;

    // Corrective Biceps Muscle Swell when elbow flexes (live rotation).
    const bicepsFlex =
      1 + clamp(-arm.elbow.rotation.x / 1.8, 0, 1) * 0.055;
    arm.upperArmMesh.scale.set(bicepsFlex, 1, bicepsFlex);

    // Graceful 3-Phalange Ballet/Flamenco Finger Cascade across all 5 digits
    for (let i = 0; i < arm.fingers.length; i++) {
      const f = arm.fingers[i];
      if (f.isThumb) {
        const thumbCurl =
          0.16 + activity * 0.12 * Math.sin(phase + 0.8);
        f.pip.rotation.x = thumbCurl;
        f.dip.rotation.x = thumbCurl * 0.85;
      } else {
        const cascadePhase = phase * 1.5 - f.fingerIndex * 0.38;
        const baseCurl =
          0.11 +
          f.fingerIndex * 0.052 +
          activity * (0.08 + Math.sin(cascadePhase) * 0.065);
        f.mcp.rotation.x = baseCurl;
        f.pip.rotation.x = baseCurl * 1.15;
        f.dip.rotation.x = baseCurl * 0.82;
      }
    }
  }

  // ==========================================================================
  // ANALYTICAL LEG IK & HEEL-BALL-TOE FOOT ROLL
  // ==========================================================================
  // V5.1 PERF FIX: a full-subtree updateWorldMatrix(true, true) here (and
  // again before the hair solver) walked all ~292 rig objects TWICE per
  // 120 Hz step — with the 8-step catch-up that is ~4700 matrix
  // compositions per frame and was the single biggest cost in the app
  // (~9 ms/step). The leg solver only needs the root + pelvis chain
  // (fresh: pelvis transforms were just written this step; the root is
  // constant through the step loop), so a 2-object ancestor update is
  // exact and ~150x cheaper.
  rig.root.updateWorldMatrix(true, false);
  rig.pelvis.updateWorldMatrix(false, false);
  rig.scratch.inversePelvis.copy(rig.pelvis.matrixWorld).invert();

  for (const leg of rig.legs) {
    if (input.external) {
      // V5 BRIDGE: host semantic channels -> analytical IK targets.
      //   footLift   (m)      -> sole height above the floor line
      //   legStepPitch (rad)  -> fore/aft foot swing (+ = backward)
      //   legStepRoll (rad)   -> lateral weight shift + foot bank
      //   hipYaw      (rad)   -> subtle lateral drift
      //   ankleToePitch (rad) -> pointe / toe-down pitch
      // The pelvis drop (crouch) already lives in the pelvis position, so
      // solveLeg's soft-knee IK bends the knees exactly as much as the host
      // choreography demands — with the native muscle-flex + foot-roll
      // quality intact.
      const ext = input.external;
      const side = leg.side;
      const lift = side > 0 ? ext.footLiftR : ext.footLiftL;
      const stepPitch = side > 0 ? ext.legStepPitchR : ext.legStepPitchL;
      const stepRoll = side > 0 ? ext.legStepRollR : ext.legStepRollL;
      const hipYaw = side > 0 ? ext.hipYawR : ext.hipYawL;
      const toePitch = side > 0 ? ext.ankleToePitchR : ext.ankleToePitchL;

      const LEG_REACH = THIGH + SHIN - 0.02;
      const x =
        side * 0.104 +
        stepRoll * 0.42 +
        Math.sin(hipYaw) * LEG_REACH * 0.16;
      const y = localFloor + 0.057 + clamp(lift, 0, 0.42);
      const z = -Math.sin(stepPitch) * LEG_REACH * 0.92;

      const c = Math.cos(state.spin);
      const s = Math.sin(state.spin);

      solveLeg(
        rig,
        leg,
        x * c + z * s,
        y,
        -x * s + z * c,
        state.spin,
        toePitch,
        stepRoll * 0.5,
        0
      );
      continue;
    }

    const legPhase = phase + (leg.side < 0 ? PI : 0);
    const sinLeg = Math.sin(legPhase);
    const lift = Math.max(0, sinLeg);
    const kick = kickWeight * Math.pow(lift, 1.75);

    const x =
      leg.side * (0.104 + kick * 0.048) +
      Math.sin(halfPhase) * catDuetWeight * 0.018;
    const y =
      localFloor +
      0.057 +
      lift * lift * activity * 0.055 +
      kick * 0.32;

    const z =
      lift * activity * 0.060 +
      kick * 0.33 +
      Math.cos(legPhase) * activity * 0.024;

    const c = Math.cos(state.spin);
    const s = Math.sin(state.spin);

    // Anatomical foot pitch: points toes gracefully when foot lifts or kicks
    const footPitch = (lift * 0.22 + kick * 0.38) * activity;
    const footRoll = -leg.side * lift * 0.06 * activity;
    const kneeSwivel = Math.sin(halfPhase) * 0.04;

    solveLeg(
      rig,
      leg,
      x * c + z * s,
      y,
      -x * s + z * c,
      state.spin,
      footPitch,
      footRoll,
      kneeSwivel
    );
  }

  // ==========================================================================
  // EYELID BLINKS, GAZE, PUPIL DILATION, EYEBROWS & ORAL LIP-SYNC
  // ==========================================================================
  if (t >= state.nextBlink) {
    state.blinkStart = t;
    state.blinkIndex++;
    state.nextBlink =
      t + 2.6 + 1.5 * (0.5 + 0.5 * Math.sin(state.blinkIndex * 2.399));
  }

  const blinkAge = t - state.blinkStart;
  let localClosure = 0;

  if (blinkAge < 0.080) {
    localClosure = smooth(0, 0.080, blinkAge);
  } else if (blinkAge < 0.200) {
    localClosure = 1 - smooth(0.080, 0.200, blinkAge);
  }

  const squint = faceSlot.squint ?? 0;

  for (let i = 0; i < rig.eyes.length; i++) {
    const eye = rig.eyes[i];
    const slotBlink = i === 0 ? (faceSlot.blinkL ?? 0) : (faceSlot.blinkR ?? 0);
    const closure = clamp(Math.max(localClosure, slotBlink * 0.85), 0, 1);

    eye.gaze.rotation.set(
      (faceSlot.gazePitch ?? 0) + Math.sin(t * 0.67) * 0.018,
      (faceSlot.gazeYaw ?? 0) + Math.sin(t * 0.91) * 0.032,
      0
    );

    const pupilScale = 0.0022 + energy * 0.00032 + beat * 0.00015;
    eye.pupil.scale.set(pupilScale, pupilScale, 0.00038);

    updateLid(eye.upper, closure, true, squint, eye.upperLashGroup);
    updateLid(eye.lower, closure, false, squint, eye.lowerLashGroup);

    // Eyebrow elevation & glabella furrow from `updateGirlFace`
    const browRaise =
      i === 0 ? (faceSlot.browRaiseL ?? 0) : (faceSlot.browRaiseR ?? 0);
    const furrow = faceSlot.browFurrow ?? 0;
    eye.browGroup.position.y = browRaise * 0.0032 - furrow * 0.0012;
    eye.browGroup.position.x = -eye.side * furrow * 0.0014;
    eye.browGroup.rotation.z = eye.side * (browRaise * 0.06 - furrow * 0.08);
  }

  // Lip-sync Jaw Articulation + Smile Width + Pucker
  const smile = faceSlot.smile ?? 0.45;
  const pucker = faceSlot.lipPucker ?? 0.1;
  const jawRad = clamp(
    (faceSlot.jawOpen ?? 0) +
      activity * mid * (0.012 + 0.018 * Math.pow(Math.sin(phase), 2)),
    0,
    MAX_JAW_OPEN_RAD
  );
  const mouthOpenMeters = jawRad * 0.055;
  const widthScale = 1.0 + smile * 0.14 - pucker * 0.12;

  rig.jawGroup.rotation.x = jawRad;
  rig.upperLip.scale.set(widthScale, 1, 1 + pucker * 0.18);
  rig.lowerLip.position.y = -mouthOpenMeters;
  rig.lowerLip.scale.set(widthScale, 1, 1 + pucker * 0.18);
  rig.mouth.scale.set(
    0.0185 * widthScale,
    0.0014 + mouthOpenMeters * 0.72,
    0.0065
  );

  // ==========================================================================
  // DUAL HAIR PHYSICS: 32 WAVY LOCKS + `GirlHairSim` MULTI-CHAIN VERLET
  // ==========================================================================
  for (let i = 0; i < rig.hair.length; i++) {
    const lock = rig.hair[i];

    const targetPitch =
      lock.basePitch +
      Math.min(0.48, state.spinVelocity * state.spinVelocity * 0.018) +
      Math.sin(phase - i * 0.19) * activity * 0.052;

    const targetRoll =
      -state.spinVelocity * 0.038 +
      Math.sin(t * 2.2 + i * 0.52) * (0.010 + high * 0.038);

    lock.vx += ((targetPitch - lock.pitch) * 56 - lock.vx * 12) * dt;
    lock.vz += ((targetRoll - lock.roll) * 50 - lock.vz * 11) * dt;
    lock.pitch += lock.vx * dt;
    lock.roll += lock.vz * dt;

    lock.upper.rotation.set(lock.pitch, 0, lock.roll);

    lock.lower.rotation.x = THREE.MathUtils.damp(
      lock.lower.rotation.x,
      lock.pitch * 0.72 + Math.sin(t * 2.6 + i * 0.32) * 0.024,
      7.5,
      dt
    );
    lock.lower.rotation.z = THREE.MathUtils.damp(
      lock.lower.rotation.z,
      lock.roll * 0.78,
      6.5,
      dt
    );

    lock.tip.rotation.x = THREE.MathUtils.damp(
      lock.tip.rotation.x,
      lock.pitch * 0.55 + Math.cos(t * 3.1 + i * 0.45) * 0.032,
      6.0,
      dt
    );
  }

  // V5.1 PERF FIX: the hair solver needs root/pelvis/spine/headPivot/head
  // world matrices only — chain-update those five (head pulls its four
  // ancestors) instead of the whole rig subtree.
  rig.root.updateWorldMatrix(true, false);
  rig.pelvis.updateWorldMatrix(false, false);
  rig.spine.updateWorldMatrix(false, false);
  rig.headPivot.updateWorldMatrix(false, false);
  rig.head.updateWorldMatrix(false, false);

  const scratch = rig.scratch;
  scratch.inverseRoot.copy(rig.root.matrixWorld).invert();
  scratch.waist.multiplyMatrices(
    scratch.inverseRoot,
    rig.pelvis.matrixWorld
  );
  scratch.headRootLocal.multiplyMatrices(
    scratch.inverseRoot,
    rig.head.matrixWorld
  );
  scratch.chestRootLocal.multiplyMatrices(
    scratch.inverseRoot,
    rig.spine.matrixWorld
  );

  const activeCarriage = input.tailCarriage ?? MOVE_HAIR_CARRIAGES[mode8];
  rig.verletHairSim.update({
    dt,
    headMatrix: scratch.headRootLocal,
    chestMatrix: scratch.chestRootLocal,
    tailCarriage: activeCarriage,
    spinVelocity: state.spinVelocity,
    bass,
    high,
    beatPulse: beat,
    elapsed: t,
  });

  // Apply computed positions, quaternions & scales to Ponytail and Temple Lock meshes
  rig.verletHairSim.applyToMeshes(
    rig.ponytailMeshes,
    rig.leftLockMeshes,
    rig.rightLockMeshes
  );
  const segScales = rig.verletHairSim.segmentScales;
  for (let i = 0; i < PONYTAIL_SEGMENTS; i++) {
    const s3 = i * 3;
    rig.ponytailMeshes[i].scale.set(
      segScales[s3],
      segScales[s3 + 1],
      segScales[s3 + 2]
    );
  }
  for (let i = 0; i < SIDELOCK_SEGMENTS; i++) {
    const l3 = (PONYTAIL_SEGMENTS + i) * 3;
    const r3 = (PONYTAIL_SEGMENTS + SIDELOCK_SEGMENTS + i) * 3;
    rig.leftLockMeshes[i].scale.set(
      segScales[l3],
      segScales[l3 + 1],
      segScales[l3 + 2]
    );
    rig.rightLockMeshes[i].scale.set(
      segScales[r3],
      segScales[r3 + 1],
      segScales[r3 + 2]
    );
  }

  // ==========================================================================
  // VERLET COUTURE SKIRT (`SkirtClothSim`) & CAPSULE COLLISIONS
  // ==========================================================================
  // BF-30 STALE-CAPSULE FIX: the leg capsules are read from the hip/knee/
  // ankle joints' matrixWorld — which the V5.1 perf fix stopped refreshing
  // (the full-subtree updateWorldMatrix walks were replaced by the 5-bone
  // hair chain, and the renderer's own scene.updateMatrixWorld only runs
  // once per RENDER frame). The capsules were therefore a full frame behind
  // the IK pose, and inside an 8-step 120 Hz catch-up they were 8 steps
  // stale: during fast kicks the thigh swung centimeters past its stale
  // capsule and poked through the skirt ("legs glitch outside her clothes").
  // Chain-update ONLY the six capsule joints (6 matrix compositions,
  // ~0.003 ms) so every cloth step collides against THIS step's leg pose.
  for (const leg of rig.legs) {
    leg.hip.updateWorldMatrix(false, false);
    leg.knee.updateWorldMatrix(false, false);
    leg.ankle.updateWorldMatrix(false, false);
  }

  // BF-30 RADIUS AUDIT: the flexed thigh mesh (vastus + rectus + adductor
  // bulges, x1.045 quadriceps flex scale) reaches ~0.098 m radius at
  // mid-thigh — the old 0.079 capsule left only ~2 mm of cloth clearance
  // and the thigh poked through on deep bends. 0.086 + CLOTH_SURFACE_MARGIN
  // (0.017) = 0.103 m restores a 5 mm cushion (pinned by test_leg_cloth.ts);
  // the hip ball grows to match.
  for (let i = 0; i < rig.legs.length; i++) {
    const leg = rig.legs[i];

    writeCapsule(rig, i * 3, leg.hip, leg.knee, 0.086);
    writeCapsule(rig, i * 3 + 1, leg.knee, leg.ankle, 0.054);
    writeCapsule(rig, i * 3 + 2, leg.hip, leg.hip, 0.095);
  }

  rig.cloth.update(
    dt,
    scratch.waist,
    rig.capsules,
    state.spinVelocity,
    bass * 0.68,
    high * 0.55,
    t,
    beat * 0.55
  );

  const positions = rig.cloth.positions;
  const previous = rig.cloth.prevPositions;
  const minimumY = localFloor + 0.012;

  for (let i = SKIRT_COLS; i < rig.cloth.numParticles; i++) {
    const yIndex = i * 3 + 1;
    if (positions[yIndex] < minimumY) {
      positions[yIndex] = minimumY;
      previous[yIndex] = Math.max(previous[yIndex], minimumY);
    }
  }

  rig.cloth.updateHemRingBuffer();
  rig.blushMaterial.opacity = clamp(0.14 + (faceSlot.blush ?? 0.25) * 0.28, 0.10, 0.42);
  rig.accent.emissiveIntensity = 0.28 + beat * 0.72;
  rig.diamondCrystal.emissiveIntensity = 0.18 + beat * 0.52 + high * 0.25;
}

// ============================================================================
// PUBLIC COMPONENT
// ============================================================================

export const DivaBody: React.FC<
  ProceduralDancingGirlProps
> = ({
  audio,
  bass: bassProp,
  mid: midProp,
  high: highProp,
  energy: energyProp,
  beatPulse: beatProp,
  bpm: bpmProp,
  isPlaying,
  position = ZERO_POSITION,
  rotation = ZERO_POSITION,
  scale = 1,
  floorY = 0,
  catPosition = DEFAULT_CAT_POSITION,
  primaryCoutureColor = '#922e59',
  skirtCoutureColor = '#2b1850',
  accentNeonColor = '#83c9dd',
  skinToneColor = '#d7a18a',
  hairColor = '#281b19',
  anatomy,
  wardrobe,
  externalPose,
}) => {
  const gl = useThree((s) => s.gl);

  // V5.1 REALISM: soft studio-room PMREM environment for HER materials only
  // (never assigned to scene.environment — the club look stays untouched).
  const envRT = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const roomScene = RoomEnvironment();
    const rt = pmrem.fromScene(roomScene, 0.04);
    pmrem.dispose();
    return rt;
  }, [gl]);

  const calibration = useMemo<AnatomicalCalibrationState>(
    () => ({
      bustVolumeScale: clamp(finite(anatomy?.bustVolumeScale, 1.08), 0.6, 1.6),
      bustFirmness: clamp(finite(anatomy?.bustFirmness, 1.0), 0.5, 1.6),
      hipCurveScale: clamp(finite(anatomy?.hipCurveScale, 1.08), 0.7, 1.5),
      gluteProjectionScale: clamp(
        finite(anatomy?.gluteProjectionScale, 1.10),
        0.7,
        1.6
      ),
      waistTaperScale: clamp(finite(anatomy?.waistTaperScale, 1.08), 0.7, 1.5),
      muscleToneScale: clamp(finite(anatomy?.muscleToneScale, 1.0), 0.4, 1.6),
    }),
    [
      anatomy?.bustVolumeScale,
      anatomy?.bustFirmness,
      anatomy?.hipCurveScale,
      anatomy?.gluteProjectionScale,
      anatomy?.waistTaperScale,
      anatomy?.muscleToneScale,
    ]
  );

  const wardrobeVis = useMemo<Required<WardrobeVisibilityConfig>>(
    () => ({
      showIntimateLayer: wardrobe?.showIntimateLayer ?? true,
      showCorsetBodice: wardrobe?.showCorsetBodice ?? true,
      showDanceShorts: wardrobe?.showDanceShorts ?? true,
      showFlaredSkirt: wardrobe?.showFlaredSkirt ?? true,
      showDanceBoots: wardrobe?.showDanceBoots ?? true,
      showJewelry: wardrobe?.showJewelry ?? true,
    }),
    [
      wardrobe?.showIntimateLayer,
      wardrobe?.showCorsetBodice,
      wardrobe?.showDanceShorts,
      wardrobe?.showFlaredSkirt,
      wardrobe?.showDanceBoots,
      wardrobe?.showJewelry,
    ]
  );

  const rig = useMemo(
    () =>
      createRig(
        {
          skin: skinToneColor,
          fabric: primaryCoutureColor,
          skirt: skirtCoutureColor,
          accent: accentNeonColor,
          hair: hairColor,
          iris: anatomy?.irisColor ?? '#4d7c6f',
          lip: anatomy?.lipTintColor ?? '#b44858',
          nail: anatomy?.nailPolishColor ?? '#cf5167',
          intimate: anatomy?.intimateLayerColor ?? '#2a1524',
        },
        calibration,
        wardrobeVis,
        envRT.texture
      ),
    [
      skinToneColor,
      primaryCoutureColor,
      skirtCoutureColor,
      accentNeonColor,
      hairColor,
      anatomy?.irisColor,
      anatomy?.lipTintColor,
      anatomy?.nailPolishColor,
      anatomy?.intimateLayerColor,
      calibration,
      wardrobeVis,
      envRT,
    ]
  );

  const input = useMemo<FrameInput>(
    () => ({
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      high: 0,
      energy: 0,
      beat: 0,
      bpm: 124,
      active: true,
      catX: DEFAULT_CAT_POSITION[0],
      catY: DEFAULT_CAT_POSITION[1],
      catZ: DEFAULT_CAT_POSITION[2],
    }),
    []
  );

  useEffect(() => {
    return () => {
      for (const geometry of rig.geometries) geometry.dispose();
      for (const material of rig.materials) material.dispose();
      rig.textures.disposeAll();
      envRT.dispose();
    };
  }, [rig, envRT]);

  useFrame((_, delta) => {
    const source =
      audio && 'current' in audio ? audio.current : audio;

    // Animate a gentle preview when no DSP inputs have been supplied.
    const preview =
      !audio &&
      bassProp === undefined &&
      midProp === undefined &&
      highProp === undefined &&
      energyProp === undefined &&
      beatProp === undefined;

    input.bass = unit(bassProp ?? source?.bass, preview ? 0.30 : 0);
    input.lowMid = unit(source?.lowMid ?? input.bass * 0.85, preview ? 0.26 : 0);
    input.mid = unit(
      midProp ?? source?.mid ?? source?.lowMid,
      preview ? 0.28 : 0
    );
    input.highMid = unit(source?.highMid ?? input.mid * 0.85, preview ? 0.22 : 0);
    input.high = unit(
      highProp ?? source?.high ?? source?.highMid,
      preview ? 0.18 : 0
    );
    input.energy = unit(
      energyProp ?? source?.energy,
      preview
        ? 0.42
        : input.bass * 0.45 + input.mid * 0.35 + input.high * 0.20
    );
    input.beat = unit(beatProp ?? source?.beatPulse);
    input.bpm = clamp(finite(bpmProp ?? source?.bpm, 124), 40, 240);
    input.active = isPlaying ?? source?.isPlaying ?? true;

    const activeCatPos = source?.catPosition ?? catPosition;
    input.catX = finite(activeCatPos?.[0], DEFAULT_CAT_POSITION[0]);
    input.catY = finite(activeCatPos?.[1], DEFAULT_CAT_POSITION[1]);
    input.catZ = finite(activeCatPos?.[2], DEFAULT_CAT_POSITION[2]);
    input.partnerYaw = source?.partnerYaw;
    input.faceIntent = source?.faceIntent;
    input.tailCarriage = source?.tailCarriage;

    // V5 BRIDGE: the host engine's pose snapshot wins when present. Its
    // faceIntent/partnerYaw/hairCarriage ride along on the snapshot too.
    const ext = externalPose?.current ?? null;
    if (ext) {
      input.external = ext;
      if (ext.faceIntent !== undefined) input.faceIntent = ext.faceIntent;
      if (ext.hairCarriage !== undefined) input.tailCarriage = ext.hairCarriage;
      input.partnerYaw = ext.isDuet ? ext.partnerYaw : undefined;
    } else {
      input.external = null;
    }

    rig.root.updateWorldMatrix(true, false);
    rig.root.getWorldScale(rig.scratch.worldScale);

    const rootY = rig.root.matrixWorld.elements[13];
    const worldScaleY = Math.max(
      0.0001,
      Math.abs(rig.scratch.worldScale.y)
    );

    const localFloor = (finite(floorY) - rootY) / worldScaleY;

    // Bounded catch-up avoids giant impulses after a background-tab pause.
    rig.state.accumulator = Math.min(
      rig.state.accumulator + clamp(finite(delta), 0, 0.1),
      STEP * 8
    );

    while (rig.state.accumulator >= STEP) {
      simulate(rig, input, localFloor);
      rig.state.accumulator -= STEP;
    }

    // V5.1 PERF: soft-body garment rebuild — ONCE per render frame, capped
    // at ~30 Hz, only when the springs actually moved since the last
    // rebuild, and skipping any under-layer whose mesh is hidden (the
    // bralette/briefs sit fully under the couture bodice/shorts).
    const sb = rig.softBody;
    const breathWave = Math.sin(
      rig.state.time * (1.8 + input.energy * 1.4)
    );
    const springKey =
      sb.leftBreast.x * 31 + sb.leftBreast.y * 17 + sb.leftBreast.z * 7 +
      sb.rightBreast.x * 29 + sb.rightBreast.y * 13 + sb.rightBreast.z * 5 +
      sb.leftGlute.x * 23 + sb.leftGlute.y * 11 + sb.leftGlute.z * 3 +
      sb.rightGlute.x * 19 + sb.rightGlute.y * 9 + sb.rightGlute.z * 2 +
      breathWave * 41;
    rig.state.frameCounter = (rig.state.frameCounter + 1) & 1;
    if (
      rig.state.frameCounter === 0 &&
      Math.abs(springKey - sb.lastRebuildAppliedKey) > 1.2e-3
    ) {
      sb.lastRebuildAppliedKey = springKey;
      updateDynamicTorsoAndGarments(
        rig.torsoGeometry,
        rig.braletteGeometry,
        rig.bodiceGeometry,
        rig.calibration,
        {
          leftDx: sb.leftBreast.x * 12,
          leftDy: sb.leftBreast.y * 14,
          leftDz: sb.leftBreast.z,
          rightDx: sb.rightBreast.x * 12,
          rightDy: sb.rightBreast.y * 14,
          rightDz: sb.rightBreast.z,
          breathExpansion: breathWave,
        }
      );
      updateDynamicPelvisAndGarments(
        rig.pelvisGeometry,
        rig.briefsGeometry,
        rig.shortsGeometry,
        rig.calibration,
        {
          leftDy: sb.leftGlute.y,
          leftDz: sb.leftGlute.z,
          rightDy: sb.rightGlute.y,
          rightDz: sb.rightGlute.z,
        }
      );
    }

    const positionAttribute = rig.skirtGeometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;

    (positionAttribute.array as Float32Array).set(rig.cloth.positions);
    positionAttribute.needsUpdate = true;

    rig.skirtGeometry.computeVertexNormals();

    updateHem(rig);
  });

  return (
    <primitive
      object={rig.root}
      position={[position[0], position[1], position[2]]}
      rotation={[rotation[0], rotation[1], rotation[2]]}
      scale={Math.max(0.001, finite(scale, 1))}
      dispose={null}
    />
  );
};

export default DivaBody;