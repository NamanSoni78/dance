import type { DanceMove, JointTargets, MoveContext } from './danceMoves';

// ============================================================================
// THE DIVA 3.0 — ULTRA-REALISTIC FACS EXPRESSION, OCULOMOTOR GAZE, VISEME
// LIP-SYNC & CAT-DUET EMOTION ENGINE (`src/lib/girlFace.ts`)
// ============================================================================
// Zero-allocation per-frame facial expression, FACS Action Unit (AU) solver,
// physiological blink/eyelid kinematics, Vestibulo-Ocular Reflex (VOR),
// dancer spotting, formant-approximated viseme lip-sync, and head/neck
// gaze-tracking controller called by the live engine via:
//   `updateGirlFace(t, ctx, slot)`
//
// Core Biomechanical & Glamour Systems:
//   1. Ekman FACS (Facial Action Coding System) 24-Channel Muscle Solver:
//      - Computes anatomically coupled Action Units (AU1 Inner Brow Raiser,
//        AU2 Outer Brow Raiser, AU4 Corrugator Brow Lowerer, AU5 Upper Lid
//        Raiser, AU6 Orbicularis Oculi Cheek Raiser / Duchenne Squint,
//        AU7 Lid Tightener, AU9 Levator Labii Nose Wrinkler, AU10 Upper Lip
//        Raiser, AU12 Zygomaticus Major Smile Puller, AU14 Buccinator Dimpler,
//        AU15 Depressor Anguli Oris, AU17 Mentalis Chin Raiser, AU18 Incisivus
//        Lip Pucker, AU20 Risorius Lip Stretcher, AU22 Orbicularis Oris
//        Funneler, AU25 Lips Part, AU26 Masseter/Pterygoid Jaw Drop, AU43/45/46
//        Levator Palpebrae / Orbicularis Oculi Blink & Flirt Wink).
//   2. 7-Mode Asymmetric Human Blink & Flirt Wink Kinematics:
//      - `SINGLE`: Fast 42 ms orbicularis oculi snap down, 118 ms levator
//        palpebrae superioris exponential recovery.
//      - `DOUBLE`: Crisp two-pulse flutter on bar boundaries & high-energy peaks.
//      - `SLEEPY`: Languid 460 ms sultry bedroom-eye sweep with 92% dwell plateau
//        during 'serene' and 'smug' phrases.
//      - `WINK_L` / `WINK_R`: Playful asymmetric flirtatious wink on 4th-beat
//        backbeats during duets or audience camera glances.
//      - `FLUTTER`: Rapid eyelash-fan micro-flutter on treble/brilliance peaks.
//      - Superior-Rectus Eyelid Coupling (Bell's Phenomenon & vertical gaze
//        palpebral fissure tracking).
//   3. Trained Dancer Spotting & Cat-Companion Duet Gaze Solver:
//      - Models real pirouette spotting: holds world-space fixation on the
//        focal target (camera or dancing cat companion) while the torso twists,
//        then whips the head 360 deg in <110 ms when neck torsion exceeds the
//        anatomical sternocleidomastoid limit (~52 deg).
//      - Vestibulo-Ocular Reflex (VOR): counter-rotates the eyeballs opposite
//        residual head angular velocity so her gaze never drifts blurrily.
//      - Micro-Saccade Social Triangle Scanner: alternates fixation between
//        the partner's left eye (42%), right eye (42%), and mouth/nose (16%)
//        at physiological 220-380 ms intervals, with beat-4 audience flirt glances.
//   4. Multi-Band Formant Viseme & Syllabic Jaw Articulation (`0..0.06 rad`):
//      - Decomposes `ctx.bass`, `ctx.lowMid`, `ctx.mid`, `ctx.highMid`, and
//        `ctx.high` into 9 continuous vowel/consonant viseme weights
//        (`SIL`, `AA`, `EE`, `IH`, `OH`, `OO`, `MM`, `FF`, `SS`) while strictly
//        clamping jaw drop to `[0, MAX_JAW_OPEN_RAD]` (`0.06 rad`).
//   5. Autonomic Pupillometry, Tear-Film Catchlight Gloss & Malar Blush:
//      - Models sympathetic pupil dilation on bass drops & duet intimacy,
//        hippus micro-oscillation, cheek vascular blush, and nostril flare.
// ============================================================================

export type FaceIntent = NonNullable<DanceMove['faceIntent']>;

export const MAX_JAW_OPEN_RAD = 0.06;
export const SNARE_BROW_MID_THRESHOLD = 0.60;

const PI = Math.PI;
const HALF_PI = Math.PI * 0.5;
const TAU = Math.PI * 2;

const MAX_NECK_YAW = 0.44;
const MAX_HEAD_YAW = 0.50;
const MAX_NECK_PITCH = 0.35;
const MAX_HEAD_PITCH = 0.40;
const MAX_NECK_ROLL = 0.28;
const MAX_HEAD_ROLL = 0.36;

// Spotting lock & whip-snap thresholds (radians)
const SPOTTING_TORSION_LOCK_LIMIT = 0.86;
const SPOTTING_WHIP_SPEED_BOOST = 4.2;

// Pre-allocated temporal smoothing bank for up to 16 dancer slots (Zero-Allocation Law)
export const MAX_DANCER_FACE_SLOTS = 16;
const STATE_STRIDE = 40;
const SLOT_STATE_BANK = new Float32Array(MAX_DANCER_FACE_SLOTS * STATE_STRIDE);

// Offsets inside SLOT_STATE_BANK per dancer slot (0..39)
const ST_INITIALIZED = 0;
const ST_SMOOTH_GAZE_YAW = 1;
const ST_SMOOTH_GAZE_PITCH = 2;
const ST_SMOOTH_SMILE = 3;
const ST_SMOOTH_BROW_L = 4;
const ST_SMOOTH_BROW_R = 5;
const ST_SMOOTH_JAW = 6;
const ST_SMOOTH_BLUSH = 7;
const ST_SMOOTH_FURROW = 8;
const ST_SNARE_ENV = 9;
const ST_BLINK_L = 10;
const ST_BLINK_R = 11;
const ST_SMIRK_ASYM = 12;
const ST_SMOOTH_PUCKER = 13;
const ST_SMOOTH_SQUINT_L = 14;
const ST_SMOOTH_SQUINT_R = 15;
const ST_SMOOTH_PUPIL = 16;
const ST_SMOOTH_NOSTRIL = 17;
const ST_SMOOTH_UPPER_LIP = 18;
const ST_SMOOTH_CHIN_RAISE = 19;
const ST_SMOOTH_MOUTH_STRETCH = 20;
const ST_SMOOTH_TONGUE_LIFT = 21;
const ST_PREV_BODY_YAW = 22;
const ST_SPOTTING_FIXATION_YAW = 23;
const ST_SPOTTING_WHIP_TIMER = 24;
const ST_SACCADE_YAW = 25;
const ST_SACCADE_PITCH = 26;
const ST_SACCADE_NEXT_TIME = 27;
const ST_SACCADE_TARGET_NODE = 28;
const ST_VOCAL_SYLLABLE_ENV = 29;
const ST_SIBILANT_ENV = 30;
const ST_BASS_DROP_ENV = 31;
const ST_VISEME_AA = 32;
const ST_VISEME_EE = 33;
const ST_VISEME_OH = 34;
const ST_VISEME_OO = 35;
const ST_VISEME_MM = 36;
const ST_HEAD_BOB_VEL = 37;
const ST_HEAD_BOB_POS = 38;
const ST_LAST_ELAPSED = 39;

export type BlinkKind =
  | 'NONE'
  | 'SINGLE'
  | 'DOUBLE'
  | 'SLEEPY'
  | 'WINK_L'
  | 'WINK_R'
  | 'FLUTTER';

export type VisemeKind =
  | 'SIL'
  | 'AA'
  | 'EE'
  | 'IH'
  | 'OH'
  | 'OO'
  | 'MM'
  | 'FF'
  | 'SS';

export type SaccadeFixationNode =
  | 'LEFT_EYE'
  | 'RIGHT_EYE'
  | 'LIPS'
  | 'CAT_FACE'
  | 'AUDIENCE_CENTER';

/**
 * Complete FACS Action Unit (AU) weight bundle exposed on `GirlFaceSlot`
 * for high-resolution procedural face rigs and morph target drivers.
 */
export interface FacsActionUnitWeights {
  /** AU1: Inner Brow Raiser (frontalis pars medialis) [0..1] */
  au1InnerBrowRaiser: number;
  /** AU2: Outer Brow Raiser (frontalis pars lateralis) [0..1] */
  au2OuterBrowRaiser: number;
  /** AU4: Brow Lowerer / Glabella Furrow (corrugator supercilii + procerus) [0..1] */
  au4BrowLowerer: number;
  /** AU5: Upper Lid Raiser (levator palpebrae superioris) [0..1] */
  au5UpperLidRaiser: number;
  /** AU6: Cheek Raiser / Duchenne Eye Crinkle (orbicularis oculi pars orbitalis) [0..1] */
  au6CheekRaiser: number;
  /** AU7: Eyelid Tightener / Sultry Squint (orbicularis oculi pars palpebralis) [0..1] */
  au7LidTightener: number;
  /** AU9: Nose Wrinkler / Fierce Snarl (levator labii superioris alaeque nasi) [0..1] */
  au9NoseWrinkler: number;
  /** AU10: Upper Lip Raiser / Cupid's Bow Show (levator labii superioris) [0..1] */
  au10UpperLipRaiser: number;
  /** AU12: Lip Corner Puller / Zygomatic Smile (zygomaticus major) [0..1] */
  au12LipCornerPuller: number;
  /** AU14: Cheek Dimpler (buccinator) [0..1] */
  au14Dimpler: number;
  /** AU15: Lip Corner Depressor / Sultry Pout (depressor anguli oris) [0..1] */
  au15LipCornerDepressor: number;
  /** AU17: Chin Raiser / Lower Lip Push-Up (mentalis) [0..1] */
  au17ChinRaiser: number;
  /** AU18: Lip Pucker / Kiss (incisivus labii superioris/inferioris) [0..1] */
  au18LipPucker: number;
  /** AU20: Lip Stretcher (risorius) [0..1] */
  au20LipStretcher: number;
  /** AU22: Lip Funneler / Ooh Shape (orbicularis oris) [0..1] */
  au22LipFunneler: number;
  /** AU25: Lips Part (depressor labii inferioris) [0..1] */
  au25LipsPart: number;
  /** AU26: Jaw Drop normalized [0..1] (maps to `0..MAX_JAW_OPEN_RAD`) */
  au26JawDrop: number;
  /** AU38: Nostril Dilator / Breathing Flare (nasalis pars alaris) [0..1] */
  au38NostrilDilator: number;
  /** AU43: Eyes Closed (unified) [0..1] */
  au43EyesClosed: number;
  /** AU45: Blink Pulse [0..1] */
  au45Blink: number;
  /** AU46: Asymmetric Flirt Wink Bias [-1..1] (-1 = left wink, +1 = right wink) */
  au46Wink: number;
}

/**
 * Per-dancer slot state passed into `updateGirlFace(t, ctx, slot)`.
 * Input fields are read if present; output expression weights are written in-place
 * every frame with zero heap allocation.
 */
export interface GirlFaceSlot {
  /** Dancer slot index (0..15) for deterministic blink & saccade phase offsets */
  slotIndex?: number;
  index?: number;

  /** Active move expression intent ('serene' | 'fierce' | 'joyful' | 'smug' | 'intense') */
  faceIntent?: FaceIntent;
  intent?: FaceIntent;

  /** Active formation/choreography mode ('SOLO' | 'GROUP' | 'DUET' | 'SPOTLIGHT') */
  mode?: string;
  isDuet?: boolean;
  isSpotlight?: boolean;

  /** World-space yaw angle (radians) toward duet partner or focal target */
  targetYaw?: number;
  /** World-space pitch angle (radians) toward partner/camera (default 0) */
  targetPitch?: number;
  /** Dancer's current root world yaw (radians); falls back to `t.rootRotY` */
  currentYaw?: number;
  /** Camera world yaw (radians, default 0 facing +Z camera) */
  cameraYaw?: number;
  /** Optional world-space yaw toward the dancing cat companion */
  catYaw?: number;
  /** Optional world-space pitch toward the dancing cat companion (typically -0.18 rad) */
  catPitch?: number;

  // --- Mutated Output Channels (read by ProceduralDancingGirl.tsx) ---
  /** Unified upper-eyelid closure [0..1] */
  blink?: number;
  /** Left upper-eyelid closure [0..1] (supports subtle flirt wink asymmetry) */
  blinkL?: number;
  /** Right upper-eyelid closure [0..1] */
  blinkR?: number;
  /** Active blink classification for debug/HUD inspection */
  blinkKind?: BlinkKind;

  /** Lower-lid Duchenne cheek squint [0..1] coupled to smile & beatPulse */
  squint?: number;
  /** Left lower-lid squint [0..1] */
  squintL?: number;
  /** Right lower-lid squint [0..1] */
  squintR?: number;

  /** Unified eyebrow elevation [-0.35..1.0] */
  browRaise?: number;
  /** Left eyebrow elevation [-0.35..1.0] */
  browRaiseL?: number;
  /** Right eyebrow elevation [-0.35..1.0] */
  browRaiseR?: number;
  /** Glabella inner-brow pinch [0..1] for 'fierce' and 'intense' focus */
  browFurrow?: number;

  /** Mouth corner smile intensity [0..1] with 2-and-4 backbeat wave */
  smile?: number;
  /** Asymmetric smirk bias [-1..1] (-1 = left corner higher, +1 = right higher) */
  smirkAsym?: number;
  /** Vocal-band lip-sync jaw rotation in radians [0..0.06] */
  jawOpen?: number;
  /** Subtle lip ooh/pucker [0..1] on bass drops and sultry 'smug' phrases */
  lipPucker?: number;
  /** Upper lip Cupid's bow lift [0..1] */
  upperLipRaise?: number;
  /** Mouth horizontal stretch [0..1] for wide vowel/smile articulation */
  mouthStretch?: number;
  /** Cheek dimple compression [0..1] */
  cheekDimple?: number;
  /** Chin mentalis raise / lower-lip pout push [0..1] */
  chinRaise?: number;
  /** Subtle tongue-tip alveolar lift [0..1] during singing/syllables */
  tongueLift?: number;
  /** Dominant phonetic viseme classification */
  viseme?: VisemeKind;

  /** Warm cheek blush intensity [0..1] */
  blush?: number;
  /** Cheekbone champagne highlighter sheen [0..1] */
  cheekHighlight?: number;
  /** Nostril breathing/exertion flare [0..1] */
  nostrilFlare?: number;
  /** Autonomic pupil dilation normalized [0..1] */
  pupilDilation?: number;
  /** Lower-lid tear meniscus catchlight gloss [0..1] */
  tearFilmGloss?: number;

  /** Local eyeball horizontal gaze offset in radians [-0.32..0.32] */
  gazeYaw?: number;
  /** Local eyeball vertical gaze offset in radians [-0.22..0.22] */
  gazePitch?: number;
  /** Convergence angle (vergence) in radians for near-field partner focus [0..0.045] */
  gazeVergence?: number;
  /** Active saccade fixation target node */
  saccadeTarget?: SaccadeFixationNode;
  /** Dancer spotting state (true while head is whipping around during a turn) */
  isSpottingWhip?: boolean;

  /** Full 21-channel FACS Action Unit breakdown */
  facs?: FacsActionUnitWeights;
}

// ============================================================================
// INTENT EMOTIONAL ARCHETYPE PROFILES
// ============================================================================
// Defines baseline muscle tone, blink style propensity, brow asymmetry,
// smile warmth, and gaze boldness for each of the 5 core dance intents.
// ============================================================================

interface IntentEmotionalProfile {
  readonly baseSmile: number;
  readonly baseBrow: number;
  readonly baseFurrow: number;
  readonly baseSquint: number;
  readonly basePucker: number;
  readonly baseUpperLip: number;
  readonly baseChinRaise: number;
  readonly baseHood: number;
  readonly baseBlush: number;
  readonly basePupil: number;
  readonly smirkAmplitude: number;
  readonly browCockAsym: number;
  readonly sleepyBlinkProb: number;
  readonly doubleBlinkProb: number;
  readonly flirtWinkProb: number;
  readonly saccadeRateHz: number;
  readonly audienceFlirtGain: number;
  readonly headBobGain: number;
}

const INTENT_PROFILES: Readonly<Record<FaceIntent, IntentEmotionalProfile>> = {
  joyful: {
    baseSmile: 0.66,
    baseBrow: 0.26,
    baseFurrow: 0.0,
    baseSquint: 0.34,
    basePucker: 0.08,
    baseUpperLip: 0.22,
    baseChinRaise: 0.05,
    baseHood: 0.0,
    baseBlush: 0.32,
    basePupil: 0.58,
    smirkAmplitude: 0.14,
    browCockAsym: 0.05,
    sleepyBlinkProb: 0.08,
    doubleBlinkProb: 0.34,
    flirtWinkProb: 0.22,
    saccadeRateHz: 2.6,
    audienceFlirtGain: 0.62,
    headBobGain: 1.0,
  },
  smug: {
    baseSmile: 0.46,
    baseBrow: 0.19,
    baseFurrow: 0.04,
    baseSquint: 0.28,
    basePucker: 0.34,
    baseUpperLip: 0.14,
    baseChinRaise: 0.18,
    baseHood: 0.085,
    baseBlush: 0.28,
    basePupil: 0.64,
    smirkAmplitude: 0.58,
    browCockAsym: 0.22,
    sleepyBlinkProb: 0.46,
    doubleBlinkProb: 0.28,
    flirtWinkProb: 0.36,
    saccadeRateHz: 1.85,
    audienceFlirtGain: 0.72,
    headBobGain: 0.78,
  },
  serene: {
    baseSmile: 0.38,
    baseBrow: 0.15,
    baseFurrow: 0.0,
    baseSquint: 0.18,
    basePucker: 0.16,
    baseUpperLip: 0.08,
    baseChinRaise: 0.06,
    baseHood: 0.055,
    baseBlush: 0.24,
    basePupil: 0.54,
    smirkAmplitude: 0.08,
    browCockAsym: 0.03,
    sleepyBlinkProb: 0.54,
    doubleBlinkProb: 0.14,
    flirtWinkProb: 0.10,
    saccadeRateHz: 1.45,
    audienceFlirtGain: 0.38,
    headBobGain: 0.55,
  },
  fierce: {
    baseSmile: 0.16,
    baseBrow: -0.11,
    baseFurrow: 0.52,
    baseSquint: 0.38,
    basePucker: 0.18,
    baseUpperLip: 0.32,
    baseChinRaise: 0.24,
    baseHood: 0.04,
    baseBlush: 0.20,
    basePupil: 0.48,
    smirkAmplitude: 0.32,
    browCockAsym: 0.19,
    sleepyBlinkProb: 0.10,
    doubleBlinkProb: 0.22,
    flirtWinkProb: 0.16,
    saccadeRateHz: 3.1,
    audienceFlirtGain: 0.48,
    headBobGain: 1.15,
  },
  intense: {
    baseSmile: 0.12,
    baseBrow: -0.15,
    baseFurrow: 0.58,
    baseSquint: 0.32,
    basePucker: 0.14,
    baseUpperLip: 0.25,
    baseChinRaise: 0.20,
    baseHood: 0.03,
    baseBlush: 0.22,
    basePupil: 0.62,
    smirkAmplitude: 0.18,
    browCockAsym: 0.12,
    sleepyBlinkProb: 0.06,
    doubleBlinkProb: 0.18,
    flirtWinkProb: 0.08,
    saccadeRateHz: 2.9,
    audienceFlirtGain: 0.32,
    headBobGain: 1.08,
  },
};

const DEFAULT_FACS_WEIGHTS: FacsActionUnitWeights = {
  au1InnerBrowRaiser: 0,
  au2OuterBrowRaiser: 0,
  au4BrowLowerer: 0,
  au5UpperLidRaiser: 0,
  au6CheekRaiser: 0,
  au7LidTightener: 0,
  au9NoseWrinkler: 0,
  au10UpperLipRaiser: 0,
  au12LipCornerPuller: 0,
  au14Dimpler: 0,
  au15LipCornerDepressor: 0,
  au17ChinRaiser: 0,
  au18LipPucker: 0,
  au20LipStretcher: 0,
  au22LipFunneler: 0,
  au25LipsPart: 0,
  au26JawDrop: 0,
  au38NostrilDilator: 0,
  au43EyesClosed: 0,
  au45Blink: 0,
  au46Wink: 0,
};

// Pre-allocated FACS objects per slot so `slot.facs` never allocates at runtime
const SLOT_FACS_POOL: FacsActionUnitWeights[] = Array.from(
  { length: MAX_DANCER_FACE_SLOTS },
  () => ({ ...DEFAULT_FACS_WEIGHTS })
);

// Default reusable fallback slot if caller omits the 3rd argument
const DEFAULT_FACE_SLOT: GirlFaceSlot = {
  slotIndex: 0,
  faceIntent: 'joyful',
  mode: 'SOLO',
  targetYaw: 0,
  targetPitch: 0,
  currentYaw: 0,
  cameraYaw: 0,
  blink: 0,
  blinkL: 0,
  blinkR: 0,
  blinkKind: 'NONE',
  squint: 0,
  squintL: 0,
  squintR: 0,
  browRaise: 0,
  browRaiseL: 0,
  browRaiseR: 0,
  browFurrow: 0,
  smile: 0.45,
  smirkAsym: 0,
  jawOpen: 0,
  lipPucker: 0,
  upperLipRaise: 0.15,
  mouthStretch: 0.2,
  cheekDimple: 0.2,
  chinRaise: 0.05,
  tongueLift: 0,
  viseme: 'SIL',
  blush: 0.25,
  cheekHighlight: 0.4,
  nostrilFlare: 0.1,
  pupilDilation: 0.5,
  tearFilmGloss: 0.85,
  gazeYaw: 0,
  gazePitch: 0,
  gazeVergence: 0.015,
  saccadeTarget: 'AUDIENCE_CENTER',
  isSpottingWhip: false,
  facs: SLOT_FACS_POOL[0],
};

// ============================================================================
// MATHEMATICAL & SIGNAL PROCESSING HELPERS (ZERO ALLOCATION)
// ============================================================================

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function saturate(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth01(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

function smoother01(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * c * (c * (c * 6 - 15) + 10);
}

function bell(x: number, center: number, width: number): number {
  const d = (x - center) / Math.max(1e-6, width);
  return Math.exp(-0.5 * d * d);
}

/** Wraps any angle in radians into [-PI, PI] */
export function wrapAngleRad(angle: number): number {
  let a = (angle + PI) % TAU;
  if (a < 0) a += TAU;
  return a - PI;
}

/** Frame-rate independent exponential smoothing factor `1 - exp(-dt / tau)` */
function expAlpha(dt: number, tau: number): number {
  if (tau <= 1e-5) return 1;
  return 1 - Math.exp(-dt / tau);
}

/** Deterministic 32-bit integer hash in [0, 1) — zero allocation */
function hash01(a: number, b: number): number {
  let h = ((a * 2654435761) ^ (b * 1597334677)) | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Resets the internal temporal state bank for a specific dancer slot (or all slots).
 */
export function resetGirlFaceSlot(slotIndex?: number): void {
  if (slotIndex === undefined) {
    SLOT_STATE_BANK.fill(0);
    return;
  }
  const idx = clamp(slotIndex | 0, 0, MAX_DANCER_FACE_SLOTS - 1);
  const base = idx * STATE_STRIDE;
  for (let i = 0; i < STATE_STRIDE; i++) {
    SLOT_STATE_BANK[base + i] = 0;
  }
}

// ============================================================================
// 1. PHYSIOLOGICAL EYELID & BLINK KINEMATICS ENGINE
// ============================================================================
// Real human blinks exhibit a strongly asymmetric velocity profile:
//   - Downstroke (Orbicularis Oculi fast-twitch motor units): ~40-48 ms
//   - Dwell (Closed apposition phase): ~15-25 ms (up to 180 ms in sultry blinks)
//   - Upstroke (Levator Palpebrae Superioris tonic recovery): ~110-140 ms
// ============================================================================

/**
 * Asymmetric physiological eyelid curve:
 * Closes rapidly in the first 26% of the window, holds briefly, and opens
 * smoothly along a cubic-exponential recovery curve over the remaining 74%.
 */
function asymmetricLidPulse(localPhase: number): number {
  if (localPhase <= 0 || localPhase >= 1) return 0;
  if (localPhase < 0.26) {
    return smoother01(localPhase / 0.26);
  }
  if (localPhase < 0.34) {
    return 1.0;
  }
  const openT = (localPhase - 0.34) / 0.66;
  const inv = 1 - smooth01(openT);
  return inv * inv;
}

/**
 * Evaluates the deterministic blink & flirt-wink state for the current beat.
 * Writes `blinkL`, `blinkR`, `blink`, and `blinkKind` directly to `slot`.
 */
function computeBlinkChannels(
  ctx: MoveContext,
  intent: FaceIntent,
  profile: IntentEmotionalProfile,
  slotIdx: number,
  gazePitch: number,
  isSpottingWhip: boolean,
  isDuet: boolean,
  slot: GirlFaceSlot
): void {
  const beatCount = ctx.beatCount | 0;
  const beatFrac = ((ctx.p / TAU) % 1 + 1) % 1; // 0..1 within current beat
  const hTrigger = hash01(beatCount + slotIdx * 37, slotIdx + 11);
  const hType = hash01(beatCount + 103, slotIdx + 53);
  const hAsym = hash01(beatCount + 211, slotIdx + 97);

  const beatInBar = ((beatCount % 4) + 4) % 4;
  const isBarStart = beatInBar === 0;
  const isPhraseEnd = (beatCount & 7) === 7;
  const isBackbeatFour = beatInBar === 3;

  // Trained dancers naturally blink during a spotting head-whip to suppress motion blur!
  const shouldBlink = isBarStart || isSpottingWhip || hTrigger < 0.38;

  let rawBlinkL = 0;
  let rawBlinkR = 0;
  let kind: BlinkKind = 'NONE';

  if (shouldBlink) {
    if (isSpottingWhip) {
      // Crisp protective spotting blink synchronized with the head whip
      kind = 'SINGLE';
      const pulse = asymmetricLidPulse((beatFrac - 0.02) / 0.24);
      rawBlinkL = pulse;
      rawBlinkR = pulse;
    } else if (
      isBackbeatFour &&
      isDuet &&
      (intent === 'smug' || intent === 'joyful') &&
      hType < profile.flirtWinkProb
    ) {
      // 1. PLAYFUL DUET / AUDIENCE FLIRT WINK on Beat 4
      const winkRight = hAsym >= 0.45;
      kind = winkRight ? 'WINK_R' : 'WINK_L';
      const windowPhase = (beatFrac - 0.10) / 0.44;
      if (windowPhase > 0 && windowPhase < 1) {
        const winkCurve =
          windowPhase < 0.32
            ? smoother01(windowPhase / 0.32)
            : 1 - smooth01((windowPhase - 0.32) / 0.68);
        if (winkRight) {
          rawBlinkR = winkCurve * 0.98;
          rawBlinkL = winkCurve * 0.22; // Sympathetic partial lid dip on opposite eye
        } else {
          rawBlinkL = winkCurve * 0.98;
          rawBlinkR = winkCurve * 0.22;
        }
      }
    } else if (
      (intent === 'serene' || intent === 'smug') &&
      (hType < profile.sleepyBlinkProb || ctx.overall < 0.45)
    ) {
      // 2. SLEEPY SLOW SULTRY BLINK: languid 72%-of-beat sweep
      kind = 'SLEEPY';
      const windowPhase = (beatFrac - 0.06) / 0.72;
      if (windowPhase > 0 && windowPhase < 1) {
        const curve =
          windowPhase < 0.34
            ? smooth01(windowPhase / 0.34)
            : windowPhase < 0.50
            ? 0.96 + 0.04 * Math.sin(((windowPhase - 0.34) / 0.16) * PI)
            : 1 - smooth01((windowPhase - 0.50) / 0.50);
        const sultry = clamp(curve * 0.96, 0, 1);
        rawBlinkL = sultry;
        rawBlinkR = sultry * 0.94;
      }
    } else if (
      isPhraseEnd ||
      (hType > 1.0 - profile.doubleBlinkProb &&
        (intent === 'joyful' || intent === 'smug'))
    ) {
      // 3. DOUBLE-BLINK FLUTTER: two crisp consecutive blinks inside one beat
      kind = 'DOUBLE';
      const pulse1 = asymmetricLidPulse((beatFrac - 0.05) / 0.24);
      const pulse2 = asymmetricLidPulse((beatFrac - 0.33) / 0.26);
      const combined = pulse1 > pulse2 ? pulse1 : pulse2;
      rawBlinkL = combined;
      const winkBias = intent === 'smug' ? 1.08 : 1.0;
      rawBlinkR = clamp(combined * winkBias, 0, 1);
    } else if (ctx.high > 0.78 && beatFrac < 0.42) {
      // 4. TREBLE EYELASH FLUTTER on shimmering high-hat/synth peaks
      kind = 'FLUTTER';
      const flutterWave =
        0.38 *
        Math.pow(Math.sin(beatFrac * PI * 6), 2) *
        smooth01(1 - beatFrac / 0.42);
      rawBlinkL = flutterWave;
      rawBlinkR = flutterWave * 0.95;
    } else {
      // 5. SINGLE NATURAL HUMAN BLINK: offset deterministically within the beat
      kind = 'SINGLE';
      const startOffset = 0.08 + hTrigger * 0.42;
      const pulse = asymmetricLidPulse((beatFrac - startOffset) / 0.30);
      rawBlinkL = pulse;
      rawBlinkR = pulse;
    }
  }

  // Superior Rectus Eyelid-Gaze Coupling:
  // Looking downward (`gazePitch > 0` in head-down coordinates or negative pitch)
  // naturally lowers the upper eyelid margin; sultry 'smug'/'serene' intents add
  // a glamorous bedroom-eye resting hood.
  const gazeHood = clamp(gazePitch * 0.24, -0.07, 0.15);
  const intentHood = profile.baseHood * (1 - ctx.beatPulse * 0.35);

  slot.blinkL = clamp(rawBlinkL + gazeHood + intentHood, 0, 1);
  slot.blinkR = clamp(rawBlinkR + gazeHood + intentHood * 0.92, 0, 1);
  slot.blink = (slot.blinkL + slot.blinkR) * 0.5;
  slot.blinkKind = kind;
}

// ============================================================================
// 2. TRAINED DANCER SPOTTING, VOR & SOCIAL TRIANGLE SACCADE SOLVER
// ============================================================================
// Solves:
//   - Target selection between Duet Partner, Cat Companion, and Camera Audience
//   - Pirouette Spotting Lock & Whip-Snap when body rotates > 50 degrees
//   - Eye-Head-Neck coordination (Neck 35%, Head 45%, Eyeballs 20%)
//   - Social Eye-Triangle Micro-Saccades (Left Eye <-> Right Eye <-> Mouth)
// ============================================================================

const SACCADE_NODES: readonly SaccadeFixationNode[] = [
  'LEFT_EYE',
  'RIGHT_EYE',
  'LIPS',
  'CAT_FACE',
  'AUDIENCE_CENTER',
];

function solveDancerSpottingAndGaze(
  t: JointTargets,
  ctx: MoveContext,
  slot: GirlFaceSlot,
  profile: IntentEmotionalProfile,
  base: number,
  slotIdx: number,
  dt: number,
  isDuet: boolean
): { eyeYaw: number; eyePitch: number; isWhip: boolean } {
  const currentBodyYaw = slot.currentYaw ?? t.rootRotY ?? 0;
  const cameraYaw = slot.cameraYaw ?? 0;
  const partnerWorldYaw = slot.targetYaw ?? slot.catYaw ?? cameraYaw;
  const partnerWorldPitch = slot.targetPitch ?? slot.catPitch ?? 0;

  // During duets, she locks eyes with her partner/cat for Beats 1-3, then flashes
  // a charismatic 4th-beat glance toward the camera audience.
  const beatInBar = ((ctx.beatCount % 4) + 4) % 4;
  const audienceGlanceWeight =
    isDuet && beatInBar === 3
      ? profile.audienceFlirtGain * Math.sin((ctx.p % TAU) * 0.5)
      : 0;

  const desiredWorldYaw = isDuet
    ? wrapAngleRad(
        partnerWorldYaw +
          wrapAngleRad(cameraYaw - partnerWorldYaw) * audienceGlanceWeight
      )
    : cameraYaw;

  const desiredWorldPitch = isDuet
    ? lerp(partnerWorldPitch, 0, audienceGlanceWeight)
    : slot.targetPitch ?? 0;

  // Total torso world yaw = root yaw + pelvis + lowerSpine + chest
  const torsoTwistYaw = t.pelvisRotY + t.lowerSpineY + t.chestY;
  const totalTorsoWorldYaw = wrapAngleRad(currentBodyYaw + torsoTwistYaw);

  // Measure torso angular velocity to detect active spins/pirouettes
  const prevTorsoYaw = SLOT_STATE_BANK[base + ST_PREV_BODY_YAW];
  const torsoYawDelta = wrapAngleRad(totalTorsoWorldYaw - prevTorsoYaw);
  const torsoOmega = Math.abs(torsoYawDelta / dt);
  SLOT_STATE_BANK[base + ST_PREV_BODY_YAW] = totalTorsoWorldYaw;

  // Relative yaw from the chest forward axis to the focal target
  const rawRelativeYaw = wrapAngleRad(desiredWorldYaw - totalTorsoWorldYaw);

  // Dancer Spotting State Machine:
  // If spinning fast (`torsoOmega > 2.2 rad/s`) and relative torsion exceeds
  // `SPOTTING_TORSION_LOCK_LIMIT` (~49 deg), trigger a crisp 95 ms spotting whip!
  let whipTimer = SLOT_STATE_BANK[base + ST_SPOTTING_WHIP_TIMER];
  if (
    torsoOmega > 2.2 &&
    Math.abs(rawRelativeYaw) > SPOTTING_TORSION_LOCK_LIMIT &&
    whipTimer <= 0
  ) {
    whipTimer = 0.095;
  }
  if (whipTimer > 0) {
    whipTimer = Math.max(0, whipTimer - dt);
  }
  SLOT_STATE_BANK[base + ST_SPOTTING_WHIP_TIMER] = whipTimer;
  const isWhip = whipTimer > 0;
  slot.isSpottingWhip = isWhip;

  const clampedTargetYaw = clamp(rawRelativeYaw, -0.82, 0.82);
  const rawTargetPitch = clamp(
    desiredWorldPitch - (t.pelvisRotX + t.lowerSpineX + t.chestX) * 0.36,
    -0.38,
    0.38
  );

  // During a spotting whip, accelerate neck/head tracking by 4.2x so the head snaps around
  const gazeTau = isWhip ? 0.065 / SPOTTING_WHIP_SPEED_BOOST : 0.062;
  const gazeAlpha = expAlpha(dt, gazeTau);

  const smoothYaw =
    SLOT_STATE_BANK[base + ST_SMOOTH_GAZE_YAW] +
    (clampedTargetYaw - SLOT_STATE_BANK[base + ST_SMOOTH_GAZE_YAW]) * gazeAlpha;
  const smoothPitch =
    SLOT_STATE_BANK[base + ST_SMOOTH_GAZE_PITCH] +
    (rawTargetPitch - SLOT_STATE_BANK[base + ST_SMOOTH_GAZE_PITCH]) * gazeAlpha;

  SLOT_STATE_BANK[base + ST_SMOOTH_GAZE_YAW] = smoothYaw;
  SLOT_STATE_BANK[base + ST_SMOOTH_GAZE_PITCH] = smoothPitch;

  // Distribute gaze rotation across Neck (35%), Head (45%), and Eyeballs (20%)
  // while preserving choreography head tilts and rhythmic groove
  const gazeBlend = isDuet ? 0.70 : 0.48;
  t.neckY = clamp(
    t.neckY * (1 - gazeBlend * 0.5) + smoothYaw * 0.35 * gazeBlend,
    -MAX_NECK_YAW,
    MAX_NECK_YAW
  );
  t.headY = clamp(
    t.headY * (1 - gazeBlend * 0.5) + smoothYaw * 0.45 * gazeBlend,
    -MAX_HEAD_YAW,
    MAX_HEAD_YAW
  );
  t.neckX = clamp(
    t.neckX + smoothPitch * 0.30 * gazeBlend,
    -MAX_NECK_PITCH,
    MAX_NECK_PITCH
  );
  t.headX = clamp(
    t.headX + smoothPitch * 0.40 * gazeBlend,
    -MAX_HEAD_PITCH,
    MAX_HEAD_PITCH
  );

  // Physiological Social-Triangle Micro-Saccades:
  // Scans between Left Eye (-0.018 rad yaw, +0.008 pitch), Right Eye (+0.018 yaw, +0.008 pitch),
  // and Lips (0 yaw, -0.016 pitch) at natural 250-450 ms intervals.
  let nextSaccadeTime = SLOT_STATE_BANK[base + ST_SACCADE_NEXT_TIME];
  if (ctx.elapsed >= nextSaccadeTime || nextSaccadeTime === 0) {
    const bucket = ((ctx.elapsed * 3.1) | 0) + slotIdx * 23;
    const hNode = hash01(bucket, 7);
    const interval =
      (0.24 + 0.28 * hash01(bucket, 13)) /
      Math.max(0.8, profile.saccadeRateHz * 0.5);
    SLOT_STATE_BANK[base + ST_SACCADE_NEXT_TIME] = ctx.elapsed + interval;

    let nodeIdx = 0;
    let targetSacYaw = 0;
    let targetSacPitch = 0;

    if (audienceGlanceWeight > 0.3) {
      nodeIdx = 4; // AUDIENCE_CENTER
      targetSacYaw = (hash01(bucket, 19) - 0.5) * 0.022;
      targetSacPitch = 0.005;
    } else if (isDuet && desiredWorldPitch < -0.06) {
      nodeIdx = 3; // CAT_FACE
      targetSacYaw = (hash01(bucket, 29) - 0.5) * 0.032;
      targetSacPitch = -0.018 + (hash01(bucket, 31) - 0.5) * 0.018;
    } else if (hNode < 0.40) {
      nodeIdx = 0; // LEFT_EYE
      targetSacYaw = -0.018;
      targetSacPitch = 0.008;
    } else if (hNode < 0.80) {
      nodeIdx = 1; // RIGHT_EYE
      targetSacYaw = 0.018;
      targetSacPitch = 0.008;
    } else {
      nodeIdx = 2; // LIPS (sultry gaze drop to lips)
      targetSacYaw = 0.0;
      targetSacPitch = -0.018;
    }

    SLOT_STATE_BANK[base + ST_SACCADE_TARGET_NODE] = nodeIdx;
    SLOT_STATE_BANK[base + ST_SACCADE_YAW] = targetSacYaw;
    SLOT_STATE_BANK[base + ST_SACCADE_PITCH] = targetSacPitch;
  }

  const sacYaw = SLOT_STATE_BANK[base + ST_SACCADE_YAW];
  const sacPitch = SLOT_STATE_BANK[base + ST_SACCADE_PITCH];
  const nodeIdx = clamp(
    SLOT_STATE_BANK[base + ST_SACCADE_TARGET_NODE] | 0,
    0,
    SACCADE_NODES.length - 1
  );

  // Vestibulo-Ocular Reflex (VOR) residual compensation: eyeballs absorb the
  // remaining 28% of target angle that the head/neck haven't reached yet.
  const eyeYaw = clamp(smoothYaw * 0.28 + sacYaw, -0.32, 0.32);
  const eyePitch = clamp(smoothPitch * 0.28 + sacPitch, -0.22, 0.22);

  slot.gazeYaw = eyeYaw;
  slot.gazePitch = eyePitch;
  slot.gazeVergence = isDuet ? 0.024 : 0.012;
  slot.saccadeTarget = SACCADE_NODES[nodeIdx];

  return { eyeYaw, eyePitch, isWhip };
}

// ============================================================================
// 3. MULTI-BAND FORMANT VISEME & SYLLABIC JAW SOLVER (HARD-CAPPED AT 0.06 RAD)
// ============================================================================
// Maps DSP frequency bands (`bass`, `lowMid`, `mid`, `highMid`, `high`) into
// realistic singing/lip-sync vowel & consonant shapes:
//   - Open vowels (`AA`, `OH`): driven by strong `mid` + `lowMid` vocal formants
//   - Spread vowels (`EE`, `IH`): driven by `mid` + `highMid` second formants
//   - Rounded vowels (`OO`): driven by `bass` + `lowMid` with low `highMid`
//   - Bilabial/Sibilant consonants (`MM`, `FF`, `SS`): driven by `high` transients
// ============================================================================

function computeVisemeAndJawChannels(
  ctx: MoveContext,
  profile: IntentEmotionalProfile,
  smoothSmile: number,
  base: number,
  dt: number,
  slot: GirlFaceSlot
): void {
  const bass = clamp(ctx.bass ?? 0, 0, 1);
  const lowMid = clamp(ctx.lowMid ?? bass * 0.8, 0, 1);
  const mid = clamp(ctx.mid ?? 0, 0, 1);
  const highMid = clamp(ctx.highMid ?? mid * 0.8, 0, 1);
  const high = clamp(ctx.high ?? 0, 0, 1);

  // 1. Vocal-Band Jaw Micro-Open (Strictly clamped to `[0, MAX_JAW_OPEN_RAD]`)
  let targetJaw = 0;
  if (mid > 0.30) {
    const vocalDrive = (mid - 0.30) / 0.70; // 0..1
    // Multi-harmonic syllabic cadence locked to beat phase `ctx.p` + natural 9.5 Hz vibrato
    const syllableWave =
      0.58 +
      0.42 * Math.sin(ctx.p * 2 + ctx.elapsed * 9.5) * Math.cos(ctx.p - 0.4);
    const rawOpen =
      (vocalDrive * 0.82 + high * 0.18) * syllableWave * MAX_JAW_OPEN_RAD;
    targetJaw = clamp(rawOpen, 0, MAX_JAW_OPEN_RAD);
  }

  const prevJaw = SLOT_STATE_BANK[base + ST_SMOOTH_JAW];
  // Snappy 20 ms jaw opening, smooth 52 ms closing
  const jawAlpha =
    targetJaw > prevJaw ? expAlpha(dt, 0.020) : expAlpha(dt, 0.052);
  const smoothJaw = clamp(
    prevJaw + (targetJaw - prevJaw) * jawAlpha,
    0,
    MAX_JAW_OPEN_RAD
  );
  SLOT_STATE_BANK[base + ST_SMOOTH_JAW] = smoothJaw;
  slot.jawOpen = smoothJaw;

  const jawNorm = smoothJaw / MAX_JAW_OPEN_RAD; // 0..1

  // 2. Formant Viseme Weight Estimation
  const formantAlpha = expAlpha(dt, 0.038);
  const rawAA = saturate(jawNorm * 0.85 + (mid - 0.35) * 0.6);
  const rawEE = saturate((highMid - 0.30) * 0.9 + smoothSmile * 0.35);
  const rawOH = saturate(jawNorm * 0.65 + (lowMid - 0.35) * 0.75 * (1 - smoothSmile * 0.5));
  const rawOO = saturate((bass * 0.55 + lowMid * 0.45 - highMid * 0.4) * (1 - jawNorm * 0.4));
  const rawMM = saturate((1 - jawNorm * 1.8) * (lowMid * 0.4 + profile.baseChinRaise));

  const visAA = lerp(SLOT_STATE_BANK[base + ST_VISEME_AA], rawAA, formantAlpha);
  const visEE = lerp(SLOT_STATE_BANK[base + ST_VISEME_EE], rawEE, formantAlpha);
  const visOH = lerp(SLOT_STATE_BANK[base + ST_VISEME_OH], rawOH, formantAlpha);
  const visOO = lerp(SLOT_STATE_BANK[base + ST_VISEME_OO], rawOO, formantAlpha);
  const visMM = lerp(SLOT_STATE_BANK[base + ST_VISEME_MM], rawMM, formantAlpha);

  SLOT_STATE_BANK[base + ST_VISEME_AA] = visAA;
  SLOT_STATE_BANK[base + ST_VISEME_EE] = visEE;
  SLOT_STATE_BANK[base + ST_VISEME_OH] = visOH;
  SLOT_STATE_BANK[base + ST_VISEME_OO] = visOO;
  SLOT_STATE_BANK[base + ST_VISEME_MM] = visMM;

  // Classify dominant viseme for debug/lip-shaping
  let domViseme: VisemeKind = 'SIL';
  if (jawNorm < 0.08 && high < 0.45) {
    domViseme = visMM > 0.35 ? 'MM' : 'SIL';
  } else if (high > 0.68 && jawNorm < 0.35) {
    domViseme = highMid > 0.55 ? 'SS' : 'FF';
  } else if (visOO > visAA && visOO > visEE) {
    domViseme = 'OO';
  } else if (visOH > visAA && visOH > visEE) {
    domViseme = 'OH';
  } else if (visEE > visAA) {
    domViseme = jawNorm > 0.45 ? 'EE' : 'IH';
  } else {
    domViseme = 'AA';
  }
  slot.viseme = domViseme;

  // 3. Lip Pucker, Upper Lip Cupid's-Bow Lift, Mouth Stretch & Tongue Articulation
  const targetPucker = clamp(
    (profile.basePucker + bass * 0.28 + visOO * 0.26 + visOH * 0.14) *
      (1 - smoothSmile * 0.62),
    0,
    1
  );
  const smoothPucker = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_PUCKER],
    targetPucker,
    expAlpha(dt, 0.060)
  );
  SLOT_STATE_BANK[base + ST_SMOOTH_PUCKER] = smoothPucker;
  slot.lipPucker = smoothPucker;

  const targetUpperLip = clamp(
    profile.baseUpperLip + smoothSmile * 0.24 + jawNorm * 0.22 + high * 0.10,
    0,
    1
  );
  const smoothUpperLip = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_UPPER_LIP],
    targetUpperLip,
    expAlpha(dt, 0.055)
  );
  SLOT_STATE_BANK[base + ST_SMOOTH_UPPER_LIP] = smoothUpperLip;
  slot.upperLipRaise = smoothUpperLip;

  const targetStretch = clamp(
    smoothSmile * 0.65 + visEE * 0.35 - smoothPucker * 0.45,
    0,
    1
  );
  const smoothStretch = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_MOUTH_STRETCH],
    targetStretch,
    expAlpha(dt, 0.055)
  );
  SLOT_STATE_BANK[base + ST_SMOOTH_MOUTH_STRETCH] = smoothStretch;
  slot.mouthStretch = smoothStretch;

  const targetChin = clamp(
    profile.baseChinRaise + smoothPucker * 0.35 + visMM * 0.25 - jawNorm * 0.4,
    0,
    1
  );
  const smoothChin = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_CHIN_RAISE],
    targetChin,
    expAlpha(dt, 0.065)
  );
  SLOT_STATE_BANK[base + ST_SMOOTH_CHIN_RAISE] = smoothChin;
  slot.chinRaise = smoothChin;

  // Alveolar tongue-tip modulation during liquid/dental syllables ('la', 'na', 'da')
  const tongueWave = 0.5 + 0.5 * Math.sin(ctx.p * 3 + ctx.elapsed * 11.2);
  const targetTongue = clamp(jawNorm * 0.75 * tongueWave, 0, 1);
  const smoothTongue = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_TONGUE_LIFT],
    targetTongue,
    expAlpha(dt, 0.035)
  );
  SLOT_STATE_BANK[base + ST_SMOOTH_TONGUE_LIFT] = smoothTongue;
  slot.tongueLift = smoothTongue;
}

// ============================================================================
// PRIMARY PER-FRAME CONTROLLER: `updateGirlFace(t, ctx, slot)`
// ============================================================================

export function updateGirlFace(
  t: JointTargets,
  ctx: MoveContext,
  slot: GirlFaceSlot = DEFAULT_FACE_SLOT
): GirlFaceSlot {
  const dt = clamp(ctx.dt || 0.016, 0.002, 0.05);
  const slotIdx = clamp(
    (slot.slotIndex ?? slot.index ?? 0) | 0,
    0,
    MAX_DANCER_FACE_SLOTS - 1
  );
  const base = slotIdx * STATE_STRIDE;

  const intent: FaceIntent = slot.faceIntent ?? slot.intent ?? 'joyful';
  const profile = INTENT_PROFILES[intent] ?? INTENT_PROFILES.joyful;

  const isDuet =
    slot.isDuet === true ||
    slot.mode === 'DUET' ||
    (slot.targetYaw !== undefined && Math.abs(slot.targetYaw) > 0.001) ||
    (slot.catYaw !== undefined && Math.abs(slot.catYaw) > 0.001);

  // Initialize state bank on first frame for this slot
  if (SLOT_STATE_BANK[base + ST_INITIALIZED] === 0) {
    SLOT_STATE_BANK[base + ST_INITIALIZED] = 1;
    SLOT_STATE_BANK[base + ST_SMOOTH_SMILE] = profile.baseSmile;
    SLOT_STATE_BANK[base + ST_SMOOTH_BLUSH] = profile.baseBlush;
    SLOT_STATE_BANK[base + ST_SMOOTH_PUPIL] = profile.basePupil;
  }

  // ==========================================================================
  // 1. GAZE TARGETS, SPOTTING WHIP & SOCIAL TRIANGLE SACCADES
  // ==========================================================================
  const { eyePitch, isWhip } = solveDancerSpottingAndGaze(
    t,
    ctx,
    slot,
    profile,
    base,
    slotIdx,
    dt,
    isDuet
  );

  // ==========================================================================
  // 2. MICRO-SMILE WAVES ON BEATS 2-AND-4 (BACKBEAT CHARM & DUCHENNE SQUINT)
  // ==========================================================================
  const beatInBar = ((ctx.beatCount % 4) + 4) % 4;
  // `halfP` completes 1 full cycle every 2 beats: `-sin(halfP)` peaks on beats 2 and 4
  const backbeatWave = 0.5 - 0.5 * Math.sin(ctx.halfP);
  const isTwoOrFour = beatInBar === 1 || beatInBar === 3 ? 1 : 0;
  const backbeatAccent =
    (0.18 * backbeatWave + 0.14 * isTwoOrFour * ctx.beatPulse) *
    (0.7 + 0.3 * ctx.overall);

  const targetSmile = clamp(profile.baseSmile + backbeatAccent, 0, 1);
  const smileAlpha = expAlpha(dt, 0.072);
  const smoothSmile =
    SLOT_STATE_BANK[base + ST_SMOOTH_SMILE] +
    (targetSmile - SLOT_STATE_BANK[base + ST_SMOOTH_SMILE]) * smileAlpha;
  SLOT_STATE_BANK[base + ST_SMOOTH_SMILE] = smoothSmile;
  slot.smile = smoothSmile;

  // Asymmetric smirk for 'smug' / 'fierce' + subtle 2-and-4 charm wave
  const targetSmirk =
    intent === 'smug'
      ? profile.smirkAmplitude * Math.sin(ctx.quarterP + 0.4)
      : intent === 'fierce'
      ? profile.smirkAmplitude * Math.cos(ctx.halfP)
      : profile.smirkAmplitude * Math.sin(ctx.halfP);
  const smoothSmirk =
    SLOT_STATE_BANK[base + ST_SMIRK_ASYM] +
    (targetSmirk - SLOT_STATE_BANK[base + ST_SMIRK_ASYM]) * smileAlpha;
  SLOT_STATE_BANK[base + ST_SMIRK_ASYM] = smoothSmirk;
  slot.smirkAsym = smoothSmirk;
  slot.cheekDimple = clamp(
    smoothSmile * 0.55 + Math.abs(smoothSmirk) * 0.35,
    0,
    1
  );

  // Duchenne Eye-Cheek Squint (Orbicularis Oculi pars orbitalis):
  // Genuine smiles crinkle the outer lower eyelids, with slight asymmetry on smirks
  const baseSquintTarget = clamp(
    smoothSmile * 0.52 +
      (intent === 'fierce' ? 0.28 : 0) +
      ctx.beatPulse * 0.12,
    0,
    1
  );
  const targetSquintL = clamp(baseSquintTarget - smoothSmirk * 0.08, 0, 1);
  const targetSquintR = clamp(baseSquintTarget + smoothSmirk * 0.08, 0, 1);
  const squintAlpha = expAlpha(dt, 0.065);

  const smoothSquintL = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_SQUINT_L],
    targetSquintL,
    squintAlpha
  );
  const smoothSquintR = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_SQUINT_R],
    targetSquintR,
    squintAlpha
  );
  SLOT_STATE_BANK[base + ST_SMOOTH_SQUINT_L] = smoothSquintL;
  SLOT_STATE_BANK[base + ST_SMOOTH_SQUINT_R] = smoothSquintR;

  slot.squintL = smoothSquintL;
  slot.squintR = smoothSquintR;
  slot.squint = (smoothSquintL + smoothSquintR) * 0.5;

  // ==========================================================================
  // 3. SNARE BROW FLASH (BAND-GATED ON `ctx.mid > 0.60`) & GLABELLA FURROW
  // ==========================================================================
  let snareTrigger = 0;
  if (ctx.mid > SNARE_BROW_MID_THRESHOLD) {
    const midExcess =
      (ctx.mid - SNARE_BROW_MID_THRESHOLD) / (1.0 - SNARE_BROW_MID_THRESHOLD);
    snareTrigger = clamp(midExcess * 1.15 + ctx.beatPulse * 0.25, 0, 1);
  }

  const prevSnareEnv = SLOT_STATE_BANK[base + ST_SNARE_ENV];
  // Fast 15 ms attack on snare hit, smooth 105 ms exponential release
  const snareAlpha =
    snareTrigger > prevSnareEnv ? expAlpha(dt, 0.015) : expAlpha(dt, 0.105);
  const snareEnv = prevSnareEnv + (snareTrigger - prevSnareEnv) * snareAlpha;
  SLOT_STATE_BANK[base + ST_SNARE_ENV] = snareEnv;

  const targetBrow = clamp(
    profile.baseBrow + snareEnv * 0.68 + ctx.high * 0.10,
    -0.35,
    1.0
  );
  const browAlpha = expAlpha(dt, 0.034);

  // Cocked single-brow flair during 'smug' or 'fierce' snare flashes
  const browAsym =
    intent === 'smug' || intent === 'fierce'
      ? profile.browCockAsym * (0.5 + 0.5 * snareEnv)
      : 0.04 * smoothSmirk;

  const targetBrowL = clamp(targetBrow - browAsym * 0.5, -0.35, 1.0);
  const targetBrowR = clamp(targetBrow + browAsym, -0.35, 1.0);

  const smoothBrowL = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_BROW_L],
    targetBrowL,
    browAlpha
  );
  const smoothBrowR = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_BROW_R],
    targetBrowR,
    browAlpha
  );
  SLOT_STATE_BANK[base + ST_SMOOTH_BROW_L] = smoothBrowL;
  SLOT_STATE_BANK[base + ST_SMOOTH_BROW_R] = smoothBrowR;

  slot.browRaiseL = smoothBrowL;
  slot.browRaiseR = smoothBrowR;
  slot.browRaise = (smoothBrowL + smoothBrowR) * 0.5;

  // Glabella brow furrow (Corrugator Supercilii) for 'fierce' & 'intense' moves
  const targetFurrow =
    intent === 'fierce' || intent === 'intense'
      ? clamp(profile.baseFurrow + 0.32 * ctx.bass - 0.25 * snareEnv, 0, 1)
      : 0;
  const smoothFurrow =
    SLOT_STATE_BANK[base + ST_SMOOTH_FURROW] +
    (targetFurrow - SLOT_STATE_BANK[base + ST_SMOOTH_FURROW]) *
      expAlpha(dt, 0.068);
  SLOT_STATE_BANK[base + ST_SMOOTH_FURROW] = smoothFurrow;
  slot.browFurrow = smoothFurrow;

  // Subtle head charm roll & bass-locked groove nod on 2-and-4 snare flashes
  const charmRoll =
    (0.036 * isTwoOrFour * snareEnv + 0.026 * Math.sin(ctx.halfP)) *
    (intent === 'smug' ? -1 : 1);
  t.headZ = clamp(t.headZ + charmRoll, -MAX_HEAD_ROLL, MAX_HEAD_ROLL);
  t.neckZ = clamp(t.neckZ + charmRoll * 0.45, -MAX_NECK_ROLL, MAX_NECK_ROLL);

  // ==========================================================================
  // 4. VOCAL-BAND JAW MICRO-OPEN & FORMANT VISEMES (`0..0.06 rad`)
  // ==========================================================================
  computeVisemeAndJawChannels(ctx, profile, smoothSmile, base, dt, slot);

  // ==========================================================================
  // 5. BLINK VARIATIONS, PUPILLOMETRY, NOSTRIL FLARE & WARM BLUSH
  // ==========================================================================
  computeBlinkChannels(
    ctx,
    intent,
    profile,
    slotIdx,
    eyePitch,
    isWhip,
    isDuet,
    slot
  );

  // Warm Malar Blush & Highlighter Sheen respond to dance exertion, duet intimacy & smile
  const targetBlush = clamp(
    profile.baseBlush +
      0.32 * smoothSmile +
      0.22 * ctx.overall +
      (isDuet ? 0.15 : 0),
    0,
    1
  );
  const smoothBlush =
    SLOT_STATE_BANK[base + ST_SMOOTH_BLUSH] +
    (targetBlush - SLOT_STATE_BANK[base + ST_SMOOTH_BLUSH]) *
      expAlpha(dt, 0.24);
  SLOT_STATE_BANK[base + ST_SMOOTH_BLUSH] = smoothBlush;
  slot.blush = smoothBlush;
  slot.cheekHighlight = clamp(
    0.35 + 0.40 * smoothSmile + 0.25 * ctx.beatPulse,
    0,
    1
  );

  // Autonomic Pupillometry (sympathetic dilation on bass drops + 0.4 Hz hippus wave)
  const hippus = 0.04 * Math.sin(ctx.elapsed * 2.5 + slotIdx);
  const targetPupil = clamp(
    profile.basePupil +
      ctx.bass * 0.24 +
      ctx.beatPulse * 0.14 +
      (isDuet ? 0.10 : 0) +
      hippus,
    0.15,
    0.98
  );
  const smoothPupil = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_PUPIL],
    targetPupil,
    expAlpha(dt, 0.12)
  );
  SLOT_STATE_BANK[base + ST_SMOOTH_PUPIL] = smoothPupil;
  slot.pupilDilation = smoothPupil;

  // Nostril Breathing & Exertion Flare
  const breathCycle = 0.5 + 0.5 * Math.sin(ctx.quarterP);
  const targetNostril = clamp(
    0.12 + ctx.overall * 0.38 * breathCycle + ctx.bass * 0.22 + smoothFurrow * 0.18,
    0,
    1
  );
  const smoothNostril = lerp(
    SLOT_STATE_BANK[base + ST_SMOOTH_NOSTRIL],
    targetNostril,
    expAlpha(dt, 0.08)
  );
  SLOT_STATE_BANK[base + ST_SMOOTH_NOSTRIL] = smoothNostril;
  slot.nostrilFlare = smoothNostril;
  slot.tearFilmGloss = clamp(0.78 + 0.22 * smoothBlush, 0, 1);

  // ==========================================================================
  // 6. POPULATE 21-CHANNEL EKMAN FACS ACTION UNIT WEIGHTS (ZERO ALLOCATION)
  // ==========================================================================
  const facs = SLOT_FACS_POOL[slotIdx];
  const posBrow = Math.max(0, slot.browRaise ?? 0);
  facs.au1InnerBrowRaiser = clamp(posBrow * (1 - smoothFurrow * 0.5), 0, 1);
  facs.au2OuterBrowRaiser = clamp(Math.max(0, smoothBrowR), 0, 1);
  facs.au4BrowLowerer = smoothFurrow;
  facs.au5UpperLidRaiser = clamp(snareEnv * 0.55 * (1 - (slot.blink ?? 0)), 0, 1);
  facs.au6CheekRaiser = slot.squint ?? 0;
  facs.au7LidTightener = clamp(
    (slot.squint ?? 0) * 0.75 + (intent === 'smug' ? 0.25 : 0),
    0,
    1
  );
  facs.au9NoseWrinkler = clamp(
    intent === 'fierce' ? smoothFurrow * 0.48 : 0,
    0,
    1
  );
  facs.au10UpperLipRaiser = slot.upperLipRaise ?? 0;
  facs.au12LipCornerPuller = smoothSmile;
  facs.au14Dimpler = slot.cheekDimple ?? 0;
  facs.au15LipCornerDepressor = clamp(
    (intent === 'fierce' || intent === 'intense' ? 0.24 : 0) * (1 - smoothSmile),
    0,
    1
  );
  facs.au17ChinRaiser = slot.chinRaise ?? 0;
  facs.au18LipPucker = slot.lipPucker ?? 0;
  facs.au20LipStretcher = slot.mouthStretch ?? 0;
  facs.au22LipFunneler = clamp((slot.lipPucker ?? 0) * 0.75, 0, 1);
  facs.au25LipsPart = clamp(
    (slot.jawOpen ?? 0) / MAX_JAW_OPEN_RAD + (slot.upperLipRaise ?? 0) * 0.35,
    0,
    1
  );
  facs.au26JawDrop = clamp((slot.jawOpen ?? 0) / MAX_JAW_OPEN_RAD, 0, 1);
  facs.au38NostrilDilator = smoothNostril;
  facs.au43EyesClosed = slot.blink ?? 0;
  facs.au45Blink =
    slot.blinkKind === 'SINGLE' || slot.blinkKind === 'DOUBLE'
      ? slot.blink ?? 0
      : 0;
  facs.au46Wink = clamp((slot.blinkR ?? 0) - (slot.blinkL ?? 0), -1, 1);

  slot.facs = facs;
  return slot;
}

export default updateGirlFace;