// src/lib/danceMoves.ts
// Complete 42-move procedural dance library — zero-allocation, beat-locked, audio-reactive.

export type DanceFamily =
  | 'IDLE' | 'HIP_HOP' | 'SHUFFLE' | 'DISCO_FUNK' | 'BREAKDANCE'
  | 'INDIAN_CLASSICAL' | 'INDIAN_FOLK' | 'BOLLYWOOD' | 'GLOBAL_PARTY';

export type MoveTag =
  | 'footwork' | 'spin' | 'arms' | 'isolation' | 'jump' | 'floor' | 'pose' | 'groove';

export type FaceIntent = 'serene' | 'fierce' | 'joyful' | 'smug' | 'intense';
export type TailCarriage = 'neutral' | 'high' | 'curled' | 'sway' | 'whip';

export interface JointTargets {
  rootY: number; rootRotY: number;
  pelvisY: number; pelvisX: number; pelvisZ: number;
  pelvisRotX: number; pelvisRotY: number; pelvisRotZ: number;
  pelvisScaleX: number; pelvisScaleY: number; pelvisScaleZ: number;
  lowerSpineX: number; lowerSpineY: number; lowerSpineZ: number;
  chestX: number; chestY: number; chestZ: number; chestScale: number;
  neckX: number; neckY: number; neckZ: number;
  headX: number; headY: number; headZ: number;
  shoulderLX: number; shoulderLY: number; shoulderLZ: number;
  elbowLX: number; elbowLY: number; wristLX: number; wristLZ: number;
  shoulderRX: number; shoulderRY: number; shoulderRZ: number;
  elbowRX: number; elbowRY: number; wristRX: number; wristRZ: number;
  footLiftL: number; footLiftR: number;
  legStepPitchL: number; legStepPitchR: number;
  legStepRollL: number; legStepRollR: number;
  hipYawL: number; hipYawR: number;
  extraKneeL: number; extraKneeR: number;
  ankleToePitchL: number; ankleToePitchR: number;
}

export interface MoveContext {
  p: number; halfP: number; quarterP: number;
  beatPulse: number; beatCount: number; isBeat: boolean;
  moveBeat: number; moveBar: number; moveProgress: number;
  bass: number; mid: number; high: number; overall: number;
  /** Finer DSP bands (optional — the Diva face engine refines jaw/brow
   *  shaping with them; engines without a 5-band split leave them unset and
   *  the face engine falls back to bass/mid/high mixing). */
  lowMid?: number; highMid?: number;
  bpm: number; elapsed: number; dt: number;
  requestSpin: (radians: number) => void;
}

export interface DanceMove {
  id: string;
  name: string;
  family: DanceFamily;
  origin: string;
  energy: number;
  tempoFit: [number, number];
  defaultBars: number;
  tags: MoveTag[];
  faceIntent?: FaceIntent;
  tailCarriage?: TailCarriage;
  accentMove?: boolean;
  /** PURE function. Writes ~40+ JointTargets channels. ZERO allocation. Beat-locked. */
  pose: (t: JointTargets, ctx: MoveContext) => void;
}

export const PELVIS_REST_Y = 0.90;
const PY = 0.90; // Short alias for PELVIS_REST_Y // Standing pelvis height (0.39 thigh + 0.39 shin + 0.12 sneaker sole)

/** Face-intent additive offsets blended by the engine on top of its audio face layer. */
export interface FaceIntentOverride {
  jawBias: number; pupilBias: number; earPitch: number; earRoll: number; visorDrop: number;
}
export const FACE_INTENT_OVERRIDES: Record<FaceIntent, FaceIntentOverride> = {
  serene:  { jawBias: -0.05, pupilBias:  0.05, earPitch:  0.08, earRoll:  0.10, visorDrop: 0.0 },
  fierce:  { jawBias:  0.22, pupilBias: -0.12, earPitch: -0.35, earRoll:  0.28, visorDrop: 0.6 },
  joyful:  { jawBias:  0.16, pupilBias:  0.18, earPitch:  0.20, earRoll: -0.08, visorDrop: 0.0 },
  smug:    { jawBias:  0.04, pupilBias: -0.05, earPitch: -0.10, earRoll:  0.22, visorDrop: 1.0 },
  intense: { jawBias:  0.28, pupilBias:  0.22, earPitch: -0.42, earRoll:  0.32, visorDrop: 0.8 },
};

/** Tail-carriage base pose overrides blended onto the 5-segment travelling wave. */
export interface TailCarriageOffset {
  basePitch: number; curlAdd: number; waveAmpScale: number; waveSpeedScale: number;
}
export const TAIL_CARRIAGE_OFFSETS: Record<TailCarriage, TailCarriageOffset> = {
  neutral: { basePitch:  0.15, curlAdd: 0.05, waveAmpScale: 1.0, waveSpeedScale: 1.0 },
  high:    { basePitch:  0.65, curlAdd: 0.12, waveAmpScale: 1.2, waveSpeedScale: 1.3 },
  curled:  { basePitch:  0.35, curlAdd: 0.38, waveAmpScale: 0.6, waveSpeedScale: 0.8 },
  sway:    { basePitch:  0.20, curlAdd: 0.08, waveAmpScale: 1.6, waveSpeedScale: 0.7 },
  whip:    { basePitch: -0.05, curlAdd: 0.02, waveAmpScale: 2.1, waveSpeedScale: 1.9 },
};

/** Smooth 0..1 entrance (0->0.15) and exit (0.85->1.0) envelope for graceful bar transitions. */
function env(progress: number): number {
  if (progress < 0.15) return progress / 0.15;
  if (progress > 0.85) return (1.0 - progress) / 0.15;
  return 1.0;
}

/** Zero-allocation writer for root, pelvis, 3-segment spine, neck, and head (20 channels). */
function setBody(
  t: JointTargets,
  rootY: number, pY: number, pX: number, pZ: number, pRX: number, pRY: number, pRZ: number,
  spX: number, spY: number, spZ: number, chX: number, chY: number, chZ: number, chS: number,
  nkX: number, nkY: number, nkZ: number, hdX: number, hdY: number, hdZ: number
): void {
  t.rootY = rootY; t.pelvisY = pY; t.pelvisX = pX; t.pelvisZ = pZ;
  t.pelvisRotX = pRX; t.pelvisRotY = pRY; t.pelvisRotZ = pRZ;
  t.lowerSpineX = spX; t.lowerSpineY = spY; t.lowerSpineZ = spZ;
  t.chestX = chX; t.chestY = chY; t.chestZ = chZ; t.chestScale = chS;
  t.neckX = nkX; t.neckY = nkY; t.neckZ = nkZ;
  t.headX = hdX; t.headY = hdY; t.headZ = hdZ;
}

/** Zero-allocation writer for left & right shoulder/elbow/wrist chains (14 channels). */
function setArms(
  t: JointTargets,
  sLX: number, sLY: number, sLZ: number, eLX: number, eLY: number, wLX: number, wLZ: number,
  sRX: number, sRY: number, sRZ: number, eRX: number, eRY: number, wRX: number, wRZ: number
): void {
  t.shoulderLX = sLX; t.shoulderLY = sLY; t.shoulderLZ = sLZ;
  t.elbowLX = eLX; t.elbowLY = eLY; t.wristLX = wLX; t.wristLZ = wLZ;
  t.shoulderRX = sRX; t.shoulderRY = sRY; t.shoulderRZ = sRZ;
  t.elbowRX = eRX; t.elbowRY = eRY; t.wristRX = wRX; t.wristRZ = wRZ;
}

/** Zero-allocation writer for both IK leg chains (12 channels). */
function setLegs(
  t: JointTargets,
  liftL: number, liftR: number, pitchL: number, pitchR: number,
  rollL: number, rollR: number, yawL: number, yawR: number,
  kneeL: number, kneeR: number, toeL: number, toeR: number
): void {
  t.footLiftL = liftL; t.footLiftR = liftR;
  t.legStepPitchL = pitchL; t.legStepPitchR = pitchR;
  t.legStepRollL = rollL; t.legStepRollR = rollR;
  t.hipYawL = yawL; t.hipYawR = yawR;
  t.extraKneeL = kneeL; t.extraKneeR = kneeR;
  t.ankleToePitchL = toeL; t.ankleToePitchR = toeR;
}

export const DANCE_MOVES: DanceMove[] = [
  // ============================================================================
  // GROUP A — INDIAN CLASSICAL (11 Moves)
  // ============================================================================
  {
    // 1. Tatta Adavu (Bharatanatyam): flat-foot stamps in araimandi half-sit; cat turns hips out & slaps paws on beatPulse.
    id: 'BHARATANATYAM_TATTA_ADAVU', name: 'Tatta Adavu — Araimandi Stamps', family: 'INDIAN_CLASSICAL',
    origin: 'Bharatanatyam — Tamil Nadu, India', energy: 0.55, tempoFit: [90, 145], defaultBars: 4,
    tags: ['footwork', 'pose'], faceIntent: 'intense', tailCarriage: 'high',
    pose: (t, c) => {
      const e = env(c.moveProgress); // 15% entry/exit blend envelope
      const s = Math.sin(c.p); // 1-beat alternating L/R stamp cycle
      const lL = Math.max(0, s) * (0.18 + c.bass * 0.08) * e; // left paw lift before slap
      const lR = Math.max(0, -s) * (0.18 + c.bass * 0.08) * e; // right paw lift on alternate beat
      // Araimandi sit (-0.16m), flat lumbar, sundari lateral neck slide, drishti eye-line snap on beat
      setBody(t, 0, PY - 0.16 * e - c.beatPulse * 0.05, s * 0.04 * e, 0, -0.05 * e, s * 0.06, -s * 0.05, 0.06 * e, -s * 0.05, s * 0.04, 0.12 * e + c.mid * 0.08, 0, 0, 1.04 + c.bass * 0.04, -0.04, s * 0.08, s * 0.05, c.beatPulse * 0.12, s * 0.12, -s * 0.06);
      // Hands locked at waist in ardhachandra mudra (elbows flared -1.35 rad, wrists cocked 0.4 rad)
      setArms(t, 0.15, -0.45, 0.42, -1.35, 0.5, 0.4 + c.high * 0.15, -0.35, 0.15, 0.45, -0.42, -1.35, -0.5, 0.4 + c.high * 0.15, 0.35);
      // 0.42 rad diamond turnout (hipYaw), 0.48 rad araimandi knee bend, dorsiflexed paw stamps
      setLegs(t, lL, lR, -lL * 0.3, -lR * 0.3, 0.14 * e, -0.14 * e, 0.42 * e, -0.42 * e, 0.48 * e + c.bass * 0.12, 0.48 * e + c.bass * 0.12, lL * 0.8, lR * 0.8);
    },
  },
  {
    // 2. Natta Adavu (Bharatanatyam): Tai-yum-tat-ta side heel-extension lunge with tripataka mudra arm line.
    id: 'BHARATANATYAM_NATTA_ADAVU', name: 'Natta Adavu — Heel Lunge & Tripataka', family: 'INDIAN_CLASSICAL',
    origin: 'Bharatanatyam — Tamil Nadu, India', energy: 0.62, tempoFit: [95, 150], defaultBars: 4,
    tags: ['footwork', 'arms', 'pose'], faceIntent: 'fierce', tailCarriage: 'high',
    pose: (t, c) => {
      const e = env(c.moveProgress); // smooth transition weight
      const side = Math.sin(c.halfP); // 2-beat alternating L/R heel extension
      const extL = Math.max(0, side) * e; // left leg extension phase
      const extR = Math.max(0, -side) * e; // right leg extension phase
      // Araimandi base (-0.15m) shifting 0.10m laterally toward supporting leg, torso counter-tilts
      setBody(t, 0, PY - 0.15 * e - c.bass * 0.05, -side * 0.10 * e, 0.02 * Math.abs(side), -0.04, side * 0.12, side * 0.07, 0.05, -side * 0.10, -side * 0.08, 0.14 + c.mid * 0.10, side * 0.16, side * 0.06, 1.05 + c.bass * 0.04, 0, side * 0.14, side * 0.07, c.beatPulse * 0.10, side * 0.25, -side * 0.05);
      // Natyarambhe shoulder line (0.85 rad abduction); active wrist snaps up in tripataka on extension
      setArms(t, -0.15 - extL * 0.35, 0.2, 0.85 * e, -0.95 + extL * 0.65, 0.3, 0.55 * extL + c.high * 0.15, 0.2, -0.15 - extR * 0.35, -0.2, -0.85 * e, -0.95 + extR * 0.65, -0.3, 0.55 * extR + c.high * 0.15, -0.2);
      // Extending leg straightens knee and pitches heel forward (-0.38 rad) with +0.45 rad toe dorsiflexion
      setLegs(t, extL * 0.06, extR * 0.06, -extL * 0.38, -extR * 0.38, 0.12 + extL * 0.20, -0.12 - extR * 0.20, 0.40 * e, -0.40 * e, (0.45 - extL * 0.35) * e, (0.45 - extR * 0.35) * e, extL * 0.45, extR * 0.45);
    },
  },
  {
    // 3. Kudittu Mettu Adavu (Bharatanatyam): spring on toes (kudittu) then strike heels down (mettu) in araimandi.
    id: 'BHARATANATYAM_KUDITTU_METTU', name: 'Kudittu Mettu — Toe Jump & Heel Strike', family: 'INDIAN_CLASSICAL',
    origin: 'Bharatanatyam — Tamil Nadu, India', energy: 0.78, tempoFit: [105, 165], defaultBars: 4,
    tags: ['jump', 'footwork', 'arms'], faceIntent: 'joyful', tailCarriage: 'whip',
    pose: (t, c) => {
      const e = env(c.moveProgress); // entry/exit envelope
      const hop = Math.max(0, Math.sin(c.p)); // 1-beat hop phase (up on beat first half, strike on second)
      const armSweep = Math.sin(c.halfP); // 2-beat overhead katakamukha arc
      // Genuine toe-spring jump (rootY up to 0.09m) while holding deep araimandi crouch (-0.18m)
      setBody(t, hop * (0.07 + c.bass * 0.04) * e, PY - 0.18 * e + hop * 0.04, 0, 0, -0.06 + hop * 0.08, 0, 0, 0.08, 0, 0, 0.16 + c.mid * 0.12, armSweep * 0.10, 0, 1.06 + c.beatPulse * 0.05, -hop * 0.08, 0, armSweep * 0.06, hop * 0.14 - c.beatPulse * 0.12, armSweep * 0.15, 0);
      // Arms sweep from chest katakamukha (-1.4 rad) out to wide overhead diagonal (-1.9 rad shoulderX)
      setArms(t, -1.1 - Math.max(0, armSweep) * 0.8, 0.3, 0.55 + Math.abs(armSweep) * 0.35, -1.4 + Math.abs(armSweep) * 0.9, 0.4, 0.45 * hop, 0.2, -1.1 - Math.max(0, -armSweep) * 0.8, -0.3, -0.55 - Math.abs(armSweep) * 0.35, -1.4 + Math.abs(armSweep) * 0.9, -0.4, 0.45 * hop, -0.2);
      // Both heels lift + point toes during jump (-0.42 rad plantarflexion), slam flat on mettu landing
      setLegs(t, hop * 0.14 * e, hop * 0.14 * e, -0.08 * hop, -0.08 * hop, 0.16 * e, -0.16 * e, 0.44 * e, -0.44 * e, 0.55 * e + (1 - hop) * c.bass * 0.15, 0.55 * e + (1 - hop) * c.bass * 0.15, -hop * 0.42 + (1 - hop) * 0.25, -hop * 0.42 + (1 - hop) * 0.25);
    },
  },
  {
    // 4. Mandi Adavu (Bharatanatyam): full-sit muzhumandi knee drop pulsing to bass with alternating floor reaches.
    id: 'BHARATANATYAM_MANDI_PULSE', name: 'Mandi Adavu — Deep Muzhumandi Pulse', family: 'INDIAN_CLASSICAL',
    origin: 'Bharatanatyam — Tamil Nadu, India', energy: 0.72, tempoFit: [95, 145], defaultBars: 2,
    tags: ['floor', 'footwork', 'isolation'], faceIntent: 'intense', tailCarriage: 'curled',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const pulse = Math.abs(Math.sin(c.p)); // every-beat vertical mandi bounce
      const reach = Math.sin(c.halfP); // 2-beat alternating forward mudra reach
      // Deep muzhumandi sit (-0.28m pelvis drop) with upright lordotic spine (+0.12 lowerSpineX)
      setBody(t, 0, PY - (0.26 + pulse * 0.06 + c.bass * 0.05) * e, reach * 0.05 * e, 0.03 * e, -0.08 * e, reach * 0.14, 0, 0.12 * e, reach * 0.10, 0, 0.18 * e + c.mid * 0.09, reach * 0.18, -reach * 0.05, 1.05 + c.bass * 0.05, -0.06, -reach * 0.10, reach * 0.06, 0.12 * pulse + c.beatPulse * 0.10, reach * 0.20, 0);
      // Alternating forward diagonal anjali/alapallava reach (-1.25 rad shoulderX)
      setArms(t, -0.75 - reach * 0.50, 0.25, 0.35, -0.85 + reach * 0.45, 0.35, 0.35 + c.high * 0.20, 0.15, -0.75 + reach * 0.50, -0.25, -0.35, -0.85 - reach * 0.45, -0.35, 0.35 + c.high * 0.20, -0.15);
      // Extreme knee bend (0.92 rad extraKnee) + wide diamond hip turnout (0.45 rad) + raised heels (-0.38 toe pitch)
      setLegs(t, 0.04 * pulse, 0.04 * pulse, -0.12 * e, -0.12 * e, 0.22 * e, -0.22 * e, 0.45 * e, -0.45 * e, (0.88 + pulse * 0.14) * e, (0.88 + pulse * 0.14) * e, -0.38 * e, -0.38 * e);
    },
  },
  {
    // 5. Alarippu (Bharatanatyam): rhythmic blossoming awakening — syncopated attami neck slides & overhead lotus bloom.
    id: 'BHARATANATYAM_ALARIPPU_BLOOM', name: 'Alarippu — Lotus Awakening & Attami Neck', family: 'INDIAN_CLASSICAL',
    origin: 'Bharatanatyam — Tamil Nadu, India', energy: 0.42, tempoFit: [90, 135], defaultBars: 4,
    tags: ['isolation', 'arms', 'pose'], faceIntent: 'serene', tailCarriage: 'curled',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const attami = Math.sin(c.p); // 1-beat horizontal neck isolation (sundari/attami)
      const bloom = 0.5 - 0.5 * Math.cos(c.quarterP); // 4-beat bar arc from chest to overhead anjali
      // Samapada/light araimandi stance (-0.08m), rock-steady hips while upper chest & neck isolate
      setBody(t, 0, PY - 0.08 * e - c.bass * 0.03, 0, 0, 0, 0, 0, 0.04 * bloom, 0, attami * 0.04 * e, 0.10 + bloom * 0.12 + c.mid * 0.08, 0, -attami * 0.05, 1.03 + bloom * 0.05, 0, attami * 0.16 * e, attami * 0.12 * e, c.beatPulse * 0.08, -attami * 0.10, -attami * 0.14 * e);
      // Arms rise over 4 beats from front tamrachuda (-0.8 rad) to full overhead anjali (-2.25 rad shoulderX)
      setArms(t, -0.80 - bloom * 1.45, 0.35 * (1 - bloom), 0.30 + Math.sin(bloom * 3.14159) * 0.55, -1.25 + bloom * 0.55, 0.4, 0.35 + c.high * 0.18, 0.25, -0.80 - bloom * 1.45, -0.35 * (1 - bloom), -0.30 - Math.sin(bloom * 3.14159) * 0.55, -1.25 + bloom * 0.55, -0.4, 0.35 + c.high * 0.18, -0.25);
      // Gentle heel-toe tap on the beat while maintaining classical turnout (0.35 rad)
      setLegs(t, Math.max(0, attami) * 0.04, Math.max(0, -attami) * 0.04, 0, 0, 0.08 * e, -0.08 * e, 0.35 * e, -0.35 * e, 0.22 * e, 0.22 * e, attami * 0.18, -attami * 0.18);
    },
  },
  {
    // 6. Tatkar (Kathak): rapid flat-foot ghungroo bell percussion ("Na Dhin Dhin Na") with upright crown posture.
    id: 'KATHAK_TATKAR_BELLS', name: 'Tatkar — Na Dhin Dhin Na Bell Footwork', family: 'INDIAN_CLASSICAL',
    origin: 'Kathak — Uttar Pradesh, India', energy: 0.65, tempoFit: [100, 170], defaultBars: 4,
    tags: ['footwork', 'groove'], faceIntent: 'joyful', tailCarriage: 'sway',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const bol = Math.sin(c.p * 2); // double-time tatkar stamp (2 strikes per beat)
      const sway = Math.sin(c.halfP); // 2-beat graceful Lucknow gharana upper-body anga sway
      const stampL = Math.max(0, bol) * (0.12 + c.high * 0.06 + c.bass * 0.04) * e; // left ghungroo slap
      const stampR = Math.max(0, -bol) * (0.12 + c.high * 0.06 + c.bass * 0.04) * e; // right ghungroo slap
      // Upright Kathak stance (-0.05m knee soften), subtle ribcage glide & eyebrow/head accent on sam
      setBody(t, 0, PY - 0.05 * e - c.beatPulse * 0.03, sway * 0.05 * e, 0, 0.02, sway * 0.08, -sway * 0.04, 0.04, -sway * 0.06, sway * 0.06, 0.10 + c.mid * 0.07, sway * 0.12, sway * 0.05, 1.04 + c.beatPulse * 0.04, 0, -sway * 0.08, sway * 0.06, c.beatPulse * 0.11, sway * 0.14, -sway * 0.08);
      // Utplavana chest-level hastak: palms curved at sternum (-0.95 shoulderX, -1.45 elbowX) with wrist ripples
      setArms(t, -0.95, 0.45, 0.48 + sway * 0.12, -1.45, 0.55, 0.30 * Math.sin(c.p) + c.high * 0.15, 0.25, -0.95, -0.45, -0.48 + sway * 0.12, -1.45, -0.55, -0.30 * Math.sin(c.p) + c.high * 0.15, -0.25);
      // Subtle 0.20 rad natural Kathak V-stance turnout; crisp double-time flat paw strikes
      setLegs(t, stampL, stampR, -stampL * 0.2, -stampR * 0.2, 0.05, -0.05, 0.20 * e, -0.20 * e, 0.14 * e, 0.14 * e, stampL * 0.5, stampR * 0.5);
    },
  },
  {
    // 7. Chakkar (Kathak): high-velocity 360-degree pirouette on the heel with one arm overhead & one at sternum.
    id: 'KATHAK_CHAKKAR_SPIN', name: 'Chakkar — Lightning Pirouette & Sam Freeze', family: 'INDIAN_CLASSICAL',
    origin: 'Kathak — North India', energy: 0.85, tempoFit: [105, 175], defaultBars: 2,
    tags: ['spin', 'arms', 'pose'], faceIntent: 'intense', tailCarriage: 'whip', accentMove: true,
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      // Trigger one 360-degree spin per bar on beat 0 of the bar
      if (c.isBeat && (c.beatCount % 4 === 0)) c.requestSpin(Math.PI * 2);
      const samLock = (c.beatCount % 4 === 3) ? 1.0 : 0.0; // beat 4 sharp sam arrival pose lock
      const whip = Math.sin(c.p); // 1-beat spotting head whip
      // Tall axial alignment (-0.03m during spin, -0.09m drop on sam lock)
      setBody(t, 0, PY - (0.03 + samLock * 0.06) * e, 0, 0, 0, 0, 0, 0.06, 0, 0, 0.15 + samLock * 0.10 + c.bass * 0.08, 0, 0, 1.06 + samLock * 0.06, 0, whip * 0.22 * (1 - samLock), 0, c.beatPulse * 0.14, -whip * 0.25 * (1 - samLock), samLock * 0.08);
      // Left arm high overhead (-2.15 rad), right arm curved across chest (-0.95 rad), opening wide on sam
      setArms(t, -2.15 * e, 0.2, 0.35 + samLock * 0.45, -0.65, 0.3, 0.35 + c.high * 0.15, 0.2, -0.95 - samLock * 0.40, -0.35, -0.45 - samLock * 0.40, -1.35 + samLock * 0.55, -0.4, 0.40, -0.2);
      // Left heel pivot (+0.32 ankleToePitchL), right foot taps around axis
      setLegs(t, 0.02, (1 - samLock) * 0.09 * Math.abs(whip), 0, -0.10 * whip, 0.04, -0.08, 0.18 * e, -0.25 * e, 0.10 + samLock * 0.18, 0.12 + samLock * 0.18, 0.32 * e, -0.20 * (1 - samLock));
    },
  },
  {
    // 8. Aamad & Toda (Kathak): royal Mughal court entry with flowing kalai wrist circles snapping into a sharp sam pose.
    id: 'KATHAK_AAMAD_FLOURISH', name: 'Aamad — Royal Entry & Kalai Wrist Flourish', family: 'INDIAN_CLASSICAL',
    origin: 'Kathak — Lucknow & Jaipur Gharanas, India', energy: 0.52, tempoFit: [90, 145], defaultBars: 4,
    tags: ['arms', 'pose', 'groove'], faceIntent: 'smug', tailCarriage: 'high',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const kalai = Math.sin(c.p); // 1-beat figure-8 wrist rotation (kalai)
      const phrase = Math.sin(c.quarterP); // 4-beat diagonal court walk & ghoonghat veil frame
      // Regal forward/back court glide (pelvisZ ±0.06m) with lifted sternum
      setBody(t, 0, PY - 0.06 * e - c.bass * 0.04, phrase * 0.06 * e, Math.cos(c.halfP) * 0.05 * e, 0.03, -phrase * 0.14, phrase * 0.04, 0.05, phrase * 0.10, -phrase * 0.05, 0.14 + c.mid * 0.09, phrase * 0.16, 0.05 * Math.cos(c.halfP), 1.05 + c.bass * 0.04, -0.03, -phrase * 0.12, 0.06 * kalai, c.beatPulse * 0.09, -phrase * 0.18, 0.08 * Math.sin(c.halfP));
      // Right arm frames face in pallu/ghoonghat arc (-1.65 rad shoulderX); left arm extends diagonally
      setArms(t, -0.75 + phrase * 0.25, 0.3, 0.72 * e, -0.65, 0.35, kalai * 0.48, 0.25 * Math.cos(c.p), -1.65 * e, -0.45, -0.42, -1.30, -0.5, -kalai * 0.48 + c.high * 0.18, -0.25 * Math.cos(c.p));
      // Measured aristocratic step-touch synchronized with pelvis shift
      const stepL = Math.max(0, Math.sin(c.halfP)) * 0.09 * e;
      const stepR = Math.max(0, -Math.sin(c.halfP)) * 0.09 * e;
      setLegs(t, stepL, stepR, -stepL * 1.4, -stepR * 1.4, 0.07, -0.07, 0.22 * e, -0.22 * e, 0.16 * e, 0.16 * e, stepL * 1.5, stepR * 1.5);
    },
  },
  {
    // 9. Tribhangi (Odissi): temple-sculpture three-bend S-curve — head, torso (chauka), and hip deflected in opposition.
    id: 'ODISSI_TRIBHANGI_SCULPTURE', name: 'Tribhangi — Temple Sculpture S-Curve Sway', family: 'INDIAN_CLASSICAL',
    origin: 'Odissi — Odisha, India', energy: 0.38, tempoFit: [90, 130], defaultBars: 4,
    tags: ['isolation', 'pose', 'groove'], faceIntent: 'serene', tailCarriage: 'curled',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const bhanga = Math.sin(c.halfP); // 2-beat lyrical S-curve deflection
      const pulse = Math.abs(Math.sin(c.p)); // 1-beat heel-tap cadence
      // Bend 1 (Hip): lateral pelvis push (+0.13m) & hip tilt (-0.16 rad); Bend 2 (Torso): opposite chestZ (+0.18 rad); Bend 3 (Head): counter-tilt
      setBody(t, 0, PY - 0.14 * e - pulse * 0.03 - c.bass * 0.04, bhanga * 0.13 * e, 0, -0.04 * e, -bhanga * 0.10, -bhanga * 0.16 * e, 0.06 * e, bhanga * 0.08, bhanga * 0.14 * e, 0.12 * e + c.mid * 0.08, -bhanga * 0.10, bhanga * 0.18 * e, 1.03 + c.mid * 0.04, 0, bhanga * 0.12, -bhanga * 0.16 * e, 0.06 * pulse + c.beatPulse * 0.07, bhanga * 0.10, -bhanga * 0.18 * e);
      // Square chauka box arms or asymmetrical flute-playing pose (alapadma wrists rippling on hi-hats)
      setArms(t, -1.05 + bhanga * 0.35, 0.4, 0.78 * e, -1.35, 0.45, 0.35 * Math.sin(c.p) + c.high * 0.15, 0.30, -1.05 - bhanga * 0.35, -0.4, -0.78 * e, -1.35, -0.45, -0.35 * Math.sin(c.p) + c.high * 0.15, -0.30);
      // Weight-bearing knee bends deeper while opposite heel taps on beat
      const tapL = Math.max(0, -bhanga) * pulse * 0.08 * e;
      const tapR = Math.max(0, bhanga) * pulse * 0.08 * e;
      setLegs(t, tapL, tapR, -tapL * 0.8, -tapR * 0.8, 0.15 * e, -0.15 * e, 0.38 * e, -0.38 * e, (0.42 + Math.max(0, bhanga) * 0.18) * e, (0.42 + Math.max(0, -bhanga) * 0.18) * e, tapL * 2.5, tapR * 2.5);
    },
  },
  {
    // 10. Kalasam (Kathakali): wide outer-edge foot stance, trembling ferocious mudras, and sweeping warrior arm arcs.
    id: 'KATHAKALI_KALASAM_HERO', name: 'Kalasam — Ferocious Warrior Stance & Mudra Sweep', family: 'INDIAN_CLASSICAL',
    origin: 'Kathakali — Kerala, India', energy: 0.76, tempoFit: [95, 155], defaultBars: 4,
    tags: ['pose', 'arms', 'footwork'], faceIntent: 'intense', tailCarriage: 'high',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const stomp = Math.sin(c.p); // 1-beat wide warrior rock
      const tremor = Math.sin(c.p * 4) * (0.08 + c.high * 0.12); // rapid 4x-beat Kathakali mudra hand vibration
      const sweep = Math.sin(c.halfP); // 2-beat circular arm kalasam
      // Ultra-wide low stance (-0.22m pelvisY) rocking fiercely side-to-side (±0.09m)
      setBody(t, 0, PY - 0.22 * e - c.bass * 0.07, stomp * 0.09 * e, 0.04 * e, -0.08 * e, sweep * 0.15, -stomp * 0.08, 0.10 * e, sweep * 0.12, stomp * 0.06, 0.22 * e + c.bass * 0.10, sweep * 0.18, 0, 1.10 + c.beatPulse * 0.06, -0.08, -sweep * 0.14, stomp * 0.08, c.beatPulse * 0.16, -sweep * 0.22, tremor * 0.5);
      // Huge bowed elbows (-1.15 rad) with fierce hamsasya/mushti mudra tremor in wrists
      setArms(t, -1.10 - sweep * 0.55, 0.35, 0.92 * e, -1.15, 0.5, 0.45 + tremor, 0.35, -1.10 + sweep * 0.55, -0.35, -0.92 * e, -1.15, -0.5, 0.45 - tremor, -0.35);
      // Outer-foot-edge Kerala stance: wide legStepRoll (±0.32 rad) and deep crouch (0.62 rad extraKnee)
      const liftL = Math.max(0, stomp) * 0.15 * e;
      const liftR = Math.max(0, -stomp) * 0.15 * e;
      setLegs(t, liftL, liftR, 0, 0, 0.32 * e, -0.32 * e, 0.36 * e, -0.36 * e, 0.62 * e + c.bass * 0.12, 0.62 * e + c.bass * 0.12, 0.18 * e, 0.18 * e);
    },
  },
  {
    // 11. Atavakul (Mohiniyattam): circular lasya torso sway (andolika) like a coconut palm in coastal Kerala breeze.
    id: 'MOHINIYATTAM_LASYA_SWAY', name: 'Atavakul — Lasya Palm-Breeze Circular Sway', family: 'INDIAN_CLASSICAL',
    origin: 'Mohiniyattam — Kerala, India', energy: 0.34, tempoFit: [90, 128], defaultBars: 4,
    tags: ['groove', 'arms', 'isolation'], faceIntent: 'serene', tailCarriage: 'sway',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const swayX = Math.sin(c.halfP); // 2-beat lateral figure-8 torso sway
      const swayZ = Math.sin(c.p); // 1-beat vertical/sagittal wave completing infinity loop
      // Soft half-sit (-0.12m) with continuous circular spine & neck waves (andolika)
      setBody(t, 0, PY - 0.12 * e - Math.abs(swayZ) * 0.04, swayX * 0.09 * e, 0.02 * swayZ * e, 0.04 * swayZ, -swayX * 0.08, -swayX * 0.07, 0.05 * swayZ, swayX * 0.10, swayX * 0.12 * e, 0.10 + c.mid * 0.09, swayX * 0.14, swayX * 0.15 * e, 1.02 + c.mid * 0.04, 0.05 * swayZ, swayX * 0.12, swayX * 0.14 * e, 0.06 * swayZ, swayX * 0.16, swayX * 0.12 * e);
      // Graceful flowing arms sweeping through horizontal infinity arcs with soft wrist ripples
      setArms(t, -0.70 - swayZ * 0.25, 0.25, 0.60 + swayX * 0.25, -0.85, 0.3, 0.38 * swayZ + c.high * 0.12, 0.20 * swayX, -0.70 + swayZ * 0.25, -0.25, -0.60 + swayX * 0.25, -0.85, -0.3, -0.38 * swayZ + c.high * 0.12, 0.20 * swayX);
      // Gentle weight transfer with soft paw lifts so feet never slide
      const stepL = Math.max(0, -swayX) * 0.05 * e;
      const stepR = Math.max(0, swayX) * 0.05 * e;
      setLegs(t, stepL, stepR, 0, 0, 0.12 * e, -0.12 * e, 0.34 * e, -0.34 * e, 0.32 * e, 0.32 * e, stepL * 2.0, stepR * 2.0);
    },
  },

  // ============================================================================
  // GROUP B — INDIAN FOLK & FILMI (14 Moves)
  // ============================================================================
  {
    // 12. Luddi / Shoulder-Bounce Bhangra: relentless dhol-driven high knee hop with skyward double-shoulder shrugs.
    id: 'BHANGRA_SHOULDER_BOUNCE', name: 'Bhangra — Dhol Shoulder Shrug & Knee Hop', family: 'INDIAN_FOLK',
    origin: 'Bhangra — Punjab, India', energy: 0.84, tempoFit: [100, 165], defaultBars: 4,
    tags: ['groove', 'arms', 'footwork'], faceIntent: 'joyful', tailCarriage: 'high',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const dhol = Math.abs(Math.sin(c.p)); // every-beat dhol shrug & bounce
      const legAlt = Math.sin(c.halfP); // 2-beat alternating high knee hitch
      // Energetic dhol bounce (-0.11m crouch on downbeat) with proud open chest
      setBody(t, 0, PY - 0.06 - dhol * (0.09 + c.bass * 0.08) * e, -legAlt * 0.07 * e, 0, 0.05 * dhol, legAlt * 0.12, legAlt * 0.08, 0.06, -legAlt * 0.10, -legAlt * 0.06, 0.18 + c.bass * 0.12, -legAlt * 0.12, 0, 1.08 + c.beatPulse * 0.07, 0.08 * dhol, legAlt * 0.10, -legAlt * 0.08, 0.18 * dhol + c.beatPulse * 0.14, -legAlt * 0.12, legAlt * 0.10);
      // Iconic Bhangra "Balle Balle" arms: hands high above shoulders (-1.75 rad shoulderX) pumping up on every beat
      setArms(t, -1.55 - dhol * 0.35, 0.25, 0.68 + dhol * 0.22, -1.10, 0.35, 0.30 * Math.sin(c.p) + c.high * 0.15, 0.25, -1.55 - dhol * 0.35, -0.25, -0.68 - dhol * 0.22, -1.10, -0.35, -0.30 * Math.sin(c.p) + c.high * 0.15, -0.25);
      // High alternating Punjabi knee lift (0.24m footLift) with flexed ankle
      const liftL = Math.max(0, legAlt) * (0.22 + c.bass * 0.06) * e;
      const liftR = Math.max(0, -legAlt) * (0.22 + c.bass * 0.06) * e;
      setLegs(t, liftL, liftR, -liftL * 1.6, -liftR * 1.6, 0.14 * e, -0.14 * e, 0.25 * e, -0.25 * e, 0.25 + liftL * 1.2, 0.25 + liftR * 1.2, liftL * 1.2, liftR * 1.2);
    },
  },
  {
    // 13. Dhamaal Jump (Bhangra): explosive double-foot harvest leap with wide victory arms & mid-air heel tuck.
    id: 'BHANGRA_DHAMAAL_JUMP', name: 'Dhamaal — Explosive Double-Foot Harvest Leap', family: 'INDIAN_FOLK',
    origin: 'Bhangra — Punjab, India', energy: 0.94, tempoFit: [105, 175], defaultBars: 2,
    tags: ['jump', 'arms'], faceIntent: 'joyful', tailCarriage: 'high', accentMove: true,
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const air = Math.max(0, Math.sin(c.p)); // 1-beat airborne phase
      const sway = Math.sin(c.halfP); // 2-beat side-to-side jubilation
      // Full airborne leap (rootY up to 0.16m) with crouch compression on landing
      setBody(t, air * (0.12 + c.bass * 0.06) * e, PY - (1 - air) * 0.14 * e, sway * 0.06 * e, 0, 0.08 * air, sway * 0.14, 0, 0.10 * air, 0, sway * 0.08, 0.22 * air + c.mid * 0.12, 0, sway * 0.10, 1.10 + c.beatPulse * 0.08, -0.10 * air, 0, sway * 0.08, 0.20 * air + c.beatPulse * 0.15, sway * 0.14, 0);
      // Wide V-skyward victory arms (-2.20 rad shoulderX, 0.85 rad abduction)
      setArms(t, -2.05 - air * 0.25, 0.2, 0.82 * e, -0.55 - (1 - air) * 0.45, 0.3, 0.40 * air, 0.2, -2.05 - air * 0.25, -0.2, -0.82 * e, -0.55 - (1 - air) * 0.45, -0.3, 0.40 * air, -0.2);
      // Both feet tuck up in mid-air (footLift 0.18m, extraKnee 0.55 rad) and land solidly
      setLegs(t, air * 0.18 * e, air * 0.18 * e, -air * 0.25, -air * 0.25, 0.18 * e, -0.18 * e, 0.28 * e, -0.28 * e, (0.35 + air * 0.35) * e, (0.35 + air * 0.35) * e, -air * 0.35, -air * 0.35);
    },
  },
  {
    // 14. Jhoomar (Bhangra): slow, intoxicated Sandal Bar folk sway with wide pendulum arms & cross-step lilt.
    id: 'BHANGRA_JHOOMAR_SWAY', name: 'Jhoomar — Pendulum Harvest Sway', family: 'INDIAN_FOLK',
    origin: 'Jhoomar — Punjab, India', energy: 0.58, tempoFit: [90, 138], defaultBars: 4,
    tags: ['groove', 'arms'], faceIntent: 'joyful', tailCarriage: 'high',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const swing = Math.sin(c.halfP); // 2-beat wide pendulum swing
      const dip = Math.abs(Math.sin(c.p)); // 1-beat earthy knee lilt
      // Deep relaxed lilt (-0.11m dip) swaying 0.12m side-to-side
      setBody(t, 0, PY - (0.07 + dip * 0.07 + c.bass * 0.05) * e, swing * 0.12 * e, 0, 0.04, swing * 0.18, -swing * 0.09, 0.05, swing * 0.14, swing * 0.10, 0.12 + c.mid * 0.10, swing * 0.22, swing * 0.12, 1.05 + c.bass * 0.05, 0.05 * dip, -swing * 0.12, swing * 0.10, 0.14 * dip + c.beatPulse * 0.10, -swing * 0.18, swing * 0.12);
      // Both arms sweep together in parallel pendulum arc across the body
      setArms(t, -0.95 - dip * 0.25, swing * 0.35, 0.45 + swing * 0.45, -1.05, 0.3, 0.35 * swing, 0.2, -0.95 - dip * 0.25, swing * 0.35, -0.45 + swing * 0.45, -1.05, -0.3, 0.35 * swing, -0.2);
      // Alternating foot lift with slight cross-step pitch
      const lL = Math.max(0, -swing) * 0.12 * e;
      const lR = Math.max(0, swing) * 0.12 * e;
      setLegs(t, lL, lR, -lL * 1.5, -lR * 1.5, 0.10, -0.10, 0.20 * e, -0.20 * e, 0.24 + dip * 0.15, 0.24 + dip * 0.15, lL * 1.4, lR * 1.4);
    },
  },
  {
    // 15. Do-Taali Garba: Navratri circular two-clap step — low swoop gathering energy then high overhead clap.
    id: 'GARBA_DO_TAALI_CIRCLE', name: 'Do-Taali Garba — Swoop & Overhead Taali Clap', family: 'INDIAN_FOLK',
    origin: 'Garba — Gujarat, India', energy: 0.68, tempoFit: [98, 155], defaultBars: 4,
    tags: ['arms', 'footwork', 'groove'], faceIntent: 'joyful', tailCarriage: 'sway',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const swoop = Math.sin(c.halfP); // -1 = low earth swoop (beat 1), +1 = high taali clap (beat 2)
      const clapHit = Math.max(0, Math.sin(c.p)); // sharp wrist convergence on clap beats
      // Pelvis dives deep (-0.20m) during earth swoop and rises (-0.05m) on high clap
      setBody(t, 0, PY - (0.12 - swoop * 0.08 + c.bass * 0.05) * e, swoop * 0.09 * e, 0.04 * (1 - swoop) * e, -0.18 * Math.max(0, -swoop) * e, swoop * 0.20, 0, -0.14 * Math.max(0, -swoop) * e, swoop * 0.15, swoop * 0.08, -0.15 * Math.max(0, -swoop) + 0.18 * Math.max(0, swoop) + c.mid * 0.10, swoop * 0.18, 0, 1.05 + c.beatPulse * 0.05, 0.10 * swoop, -swoop * 0.12, 0.08 * swoop, 0.14 * swoop + c.beatPulse * 0.10, 0, 0.10 * swoop);
      // Arms sweep from low floor gather (-0.45 rad) to high diagonal clap (-1.85 rad shoulderX, elbows bent inward)
      setArms(t, -1.15 - swoop * 0.70, 0.45, 0.25 + (1 - clapHit) * 0.35, -1.25, 0.55, 0.35 * clapHit, 0.2, -1.15 - swoop * 0.70, -0.45, -0.25 - (1 - clapHit) * 0.35, -1.25, -0.55, 0.35 * clapHit, -0.2);
      // Side-step foot lifts paired with lateral pelvis motion
      const lL = Math.max(0, swoop) * 0.11 * e;
      const lR = Math.max(0, -swoop) * 0.11 * e;
      setLegs(t, lL, lR, -0.10 * lL, -0.10 * lR, 0.12 * e, -0.12 * e, 0.26 * e, -0.26 * e, (0.38 - swoop * 0.22) * e, (0.38 - swoop * 0.22) * e, lL * 1.5, lR * 1.5);
    },
  },
  {
    // 16. Dandiya Raas Strike & Spin: figure-8 stick-strike wrist snaps on beats 1-3 + 180-deg turn on beat 4.
    id: 'DANDIYA_RAAS_SPIN', name: 'Dandiya Raas — Stick Strike & Raas Turn', family: 'INDIAN_FOLK',
    origin: 'Dandiya Raas — Gujarat, India', energy: 0.76, tempoFit: [105, 165], defaultBars: 4,
    tags: ['spin', 'arms', 'footwork'], faceIntent: 'joyful', tailCarriage: 'whip',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      if (c.isBeat && (c.beatCount % 4 === 3)) c.requestSpin(Math.PI); // 180-deg Raas partner turn on beat 4
      const strike = Math.sin(c.p); // alternating L/R stick cross-strike
      const cross = Math.cos(c.halfP); // 2-beat upper-torso diagonal twist
      // Springy Raas step (-0.09m bounce) with diagonal torso twist into each stick strike
      setBody(t, 0, PY - 0.08 * e - Math.abs(strike) * 0.05 - c.bass * 0.05, cross * 0.08 * e, 0, 0.04, cross * 0.18, -cross * 0.06, 0.06, cross * 0.16, 0, 0.14 + c.mid * 0.10, cross * 0.24, strike * 0.06, 1.06 + c.beatPulse * 0.05, 0, -cross * 0.14, strike * 0.06, c.beatPulse * 0.14, -cross * 0.18, 0);
      // Forearms whip forward and down on beatPulse like striking dandiya sticks
      setArms(t, -1.10 - strike * 0.45, 0.30, 0.45, -1.15 + c.beatPulse * 0.45, 0.40, strike * 0.55 + c.high * 0.20, 0.25, -1.10 + strike * 0.45, -0.30, -0.45, -1.15 + c.beatPulse * 0.45, -0.40, -strike * 0.55 - c.high * 0.20, -0.25);
      // Quick alternating Raas step-tap
      const lL = Math.max(0, strike) * 0.12 * e;
      const lR = Math.max(0, -strike) * 0.12 * e;
      setLegs(t, lL, lR, -lL * 1.2, -lR * 1.2, 0.10, -0.10, 0.22 * e, -0.22 * e, 0.22 * e, 0.22 * e, lL * 1.6, lR * 1.6);
    },
  },
  {
    // 17. Bollywood Thumka: sharp lateral hip-check spike on the beat with one hand behind head & expressive wink-tilt.
    id: 'BOLLYWOOD_THUMKA_POP', name: 'Jhumka Thumka — Sharp Lateral Hip Check', family: 'BOLLYWOOD',
    origin: 'Bollywood — Mumbai, India', energy: 0.66, tempoFit: [95, 150], defaultBars: 4,
    tags: ['isolation', 'groove', 'pose'], faceIntent: 'smug', tailCarriage: 'sway',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const side = Math.sin(c.halfP) >= 0 ? 1 : -1; // switches target hip side every 2 beats
      const pop = Math.pow(Math.abs(Math.sin(c.p)), 2) * (1 + c.bass * 0.5 + c.beatPulse * 0.4); // sharp staccato hip spike
      // Sharp lateral pelvis displacement (0.15m) + steep opposite hip tilt (-0.20 rad pelvisRotZ)
      setBody(t, 0, PY - 0.08 * e - pop * 0.04, side * pop * 0.14 * e, 0, 0.04, -side * pop * 0.12, -side * pop * 0.18 * e, 0.05, side * 0.08, side * pop * 0.14 * e, 0.14 + c.mid * 0.10, -side * 0.12, side * pop * 0.12 * e, 1.05 + c.beatPulse * 0.05, 0, side * 0.10, -side * pop * 0.12, c.beatPulse * 0.12, side * 0.14, -side * pop * 0.14);
      // Right hand behind head (-1.95 shoulderRX, -2.0 elbowRX); left hand on jutting hip
      setArms(t, 0.15, -0.45, 0.45, -1.45, 0.5, 0.35 + c.high * 0.15, -0.30, -1.95 * e, -0.35, -0.65 * e, -1.95 * e, -0.5, 0.30 * pop, 0.20);
      // Popping side lifts heel slightly to free hip spike
      const lL = (side > 0 ? pop * 0.07 : 0) * e;
      const lR = (side < 0 ? pop * 0.07 : 0) * e;
      setLegs(t, lL, lR, 0, 0, 0.10 * e, -0.10 * e, 0.24 * e, -0.24 * e, 0.18 + lR * 2.0, 0.18 + lL * 2.0, -lL * 3.5, -lR * 3.5);
    },
  },
  {
    // 18. Naagin Dance (Bollywood/Folk): hypnotic cobra hood paws over head with sinuous spine wave & figure-8 sway.
    id: 'BOLLYWOOD_NAAGIN_COBRA', name: 'Naagin Cobra — Hood Paws & Sinuous Spine Wave', family: 'BOLLYWOOD',
    origin: 'North Indian Brass Band & Bollywood', energy: 0.70, tempoFit: [95, 155], defaultBars: 4,
    tags: ['isolation', 'arms', 'groove'], faceIntent: 'intense', tailCarriage: 'whip',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const slither = Math.sin(c.p); // 1-beat lateral cobra head weave
      const coil = Math.sin(c.halfP); // 2-beat vertical coil rise & sink
      // Phase-staggered lateral wave from pelvis -> lowerSpine -> chest -> neck -> head
      setBody(t, 0, PY - (0.14 - coil * 0.06 + c.bass * 0.05) * e, Math.sin(c.p - 1.2) * 0.09 * e, 0.04 * coil, -0.06 * e, slither * 0.14, Math.sin(c.p - 0.9) * 0.10, 0.04, -slither * 0.12, Math.sin(c.p - 0.6) * 0.14 * e, 0.10 + c.mid * 0.12, slither * 0.14, Math.sin(c.p - 0.3) * 0.16 * e, 1.06 + c.high * 0.05, -0.08, -slither * 0.15, slither * 0.18 * e, 0.12 + c.beatPulse * 0.12, slither * 0.18, -slither * 0.15 * e);
      // Both wrists arched directly above forehead forming the twin-paw cobra hood (sarpashirsha mudra)
      setArms(t, -1.85 * e, 0.45, 0.22 + slither * 0.10, -1.55 * e, 0.6, 0.65 + c.beatPulse * 0.25, 0.15, -1.85 * e, -0.45, -0.22 + slither * 0.10, -1.55 * e, -0.6, 0.65 + c.beatPulse * 0.25, -0.15);
      // Low slithering side-steps
      const lL = Math.max(0, slither) * 0.07 * e;
      const lR = Math.max(0, -slither) * 0.07 * e;
      setLegs(t, lL, lR, -lL * 0.8, -lR * 0.8, 0.15 * e, -0.15 * e, 0.30 * e, -0.30 * e, (0.38 - coil * 0.15) * e, (0.38 - coil * 0.15) * e, lL * 2.0, lR * 2.0);
    },
  },
  {
    // 19. SRK Open-Arms Pose (Bollywood): dramatic slow-motion chest expansion with wide horizontal arms & head tilt.
    id: 'BOLLYWOOD_SRK_OPEN_ARMS', name: 'King Khan — Iconic Open-Arms Romantic Sweep', family: 'BOLLYWOOD',
    origin: 'Bollywood Cinema — Mumbai, India', energy: 0.48, tempoFit: [90, 145], defaultBars: 2,
    tags: ['pose', 'arms'], faceIntent: 'smug', tailCarriage: 'curled', accentMove: true,
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const open = Math.min(1, c.moveProgress * 2.2); // sweeps wide open in first bar and holds heroically
      const breath = Math.sin(c.p) * (0.04 + c.mid * 0.06); // emotional trembling chest breath
      // Slight backward lean (+0.14 pelvisRotX & +0.22 chestX), weight on right foot, romantic head tilt (+0.22 headZ)
      setBody(t, 0, PY - 0.07 * e, -0.06 * open * e, 0.04 * open * e, 0.10 * open * e, 0.12 * open, 0.06 * open, 0.12 * open * e, -0.06 * open, 0, (0.22 * open + breath) * e, 0, -0.05 * open, 1.10 + c.bass * 0.06, -0.08 * open, 0.10 * open, 0.14 * open * e, -0.08 * open + c.beatPulse * 0.08, 0.14 * open, 0.22 * open * e);
      // Wide-open horizontal embrace (-1.25 shoulderX, ±1.15 shoulderZ, nearly straight elbows -0.25 rad)
      setArms(t, -1.20 * open * e, 0.35, (0.30 + open * 0.85) * e, -1.10 + open * 0.85, 0.2, -0.20 + breath * 2, 0.15, -1.20 * open * e, -0.35, -(0.30 + open * 0.85) * e, -1.10 + open * 0.85, -0.2, -0.20 + breath * 2, -0.15);
      // Left foot extended slightly forward on toe tip
      setLegs(t, 0.02 * open, 0, -0.22 * open * e, 0.05 * open, 0.12 * e, -0.12 * e, 0.25 * e, -0.20 * e, 0.12 * e, 0.26 * open * e, -0.30 * open * e, 0.05);
    },
  },
  {
    // 20. Hook-Step Collar Shake (Bollywood): thumbs tucked at belt/hoodie pockets with rapid double-shoulder pops.
    id: 'BOLLYWOOD_COLLAR_HOOKSTEP', name: 'Filmi Hook-Step — Pocket Thumbs & Double Shoulder Pop', family: 'BOLLYWOOD',
    origin: 'Bollywood Masala — Mumbai, India', energy: 0.74, tempoFit: [100, 160], defaultBars: 4,
    tags: ['isolation', 'groove'], faceIntent: 'joyful', tailCarriage: 'high',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const step = Math.sin(c.halfP); // 2-beat side-to-side swagger travel
      const pop = Math.sin(c.p * 2); // double-time shoulder & chest isolation pop
      // Swaggering lateral hip travel (±0.11m) with rapid double-time chest & shoulder shimmy
      setBody(t, 0, PY - 0.07 * e - Math.abs(Math.sin(c.p)) * (0.06 + c.bass * 0.06), step * 0.11 * e, 0, 0.04, step * 0.15, -step * 0.09, 0.05, -step * 0.10, step * 0.07, -0.08 * pop - c.mid * 0.14, pop * 0.14, step * 0.08, 1.06 + c.beatPulse * 0.06, 0.08 * Math.sin(c.p), -step * 0.12, -step * 0.08, 0.16 * Math.sin(c.p) + c.beatPulse * 0.12, -step * 0.14, pop * 0.08);
      // Paws hooked at hoodie waist pockets while shoulders pop up/down in opposition (±0.28 shoulderZ)
      setArms(t, 0.10, -0.40, 0.42 + pop * (0.22 + c.high * 0.10), -1.40, 0.45, 0.30, -0.25, 0.10, 0.40, -0.42 + pop * (0.22 + c.high * 0.10), -1.40, -0.45, 0.30, 0.25);
      // Rhythmic heel-scuff side steps
      const lL = Math.max(0, step) * 0.10 * e;
      const lR = Math.max(0, -step) * 0.10 * e;
      setLegs(t, lL, lR, -lL * 1.3, -lR * 1.3, 0.12 * e, -0.12 * e, 0.20 * e, -0.20 * e, 0.20 + c.bass * 0.10, 0.20 + c.bass * 0.10, lL * 2.2, lR * 2.2);
    },
  },
  {
    // 21. Dappankuthu (Chennai Street Kuthu): raw parai-drum knee stomp with forward hunch, wrist flick & chin jut.
    id: 'SOUTH_DAPPANKUTHU_STOMP', name: 'Dappankuthu — Chennai Parai Drum Street Stomp', family: 'INDIAN_FOLK',
    origin: 'Kuthu — Tamil Nadu, India', energy: 0.90, tempoFit: [110, 175], defaultBars: 4,
    tags: ['footwork', 'groove', 'isolation'], faceIntent: 'fierce', tailCarriage: 'whip',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const kuthu = Math.abs(Math.sin(c.p)); // relentless every-beat stomp drive
      const alt = Math.sin(c.halfP); // 2-beat alternating high knee drive
      // Forward street-hunch (-0.18 chestX), deep bounce, chin jutted up (+0.22 headX)
      setBody(t, 0, PY - 0.12 * e - kuthu * (0.10 + c.bass * 0.08), -alt * 0.08 * e, 0.05 * e, -0.10 * e, alt * 0.18, alt * 0.08, -0.12 * e, -alt * 0.14, 0, -0.18 * e - c.bass * 0.14, alt * 0.20, alt * 0.08, 1.08 + c.beatPulse * 0.08, -0.12 * e, -alt * 0.12, 0, 0.22 * e + c.beatPulse * 0.18, -alt * 0.16, alt * 0.10);
      // One hand beats an invisible parai drum at chest; other arm pumps downward with loose wrist flicks
      setArms(t, -0.85 - kuthu * 0.45, 0.35, 0.48, -1.25, 0.4, 0.55 * Math.sin(c.p * 2) + c.high * 0.20, 0.2, -0.55 + alt * 0.40, -0.25, -0.52, -1.10, -0.3, -0.55 * Math.sin(c.p * 2) - c.high * 0.20, -0.2);
      // Aggressive high-knee earth stomp (0.26m footLift)
      const lL = Math.max(0, alt) * (0.24 + c.bass * 0.06) * e;
      const lR = Math.max(0, -alt) * (0.24 + c.bass * 0.06) * e;
      setLegs(t, lL, lR, -lL * 1.8, -lR * 1.8, 0.16 * e, -0.16 * e, 0.28 * e, -0.28 * e, 0.32 + lL * 1.1, 0.32 + lR * 1.1, lL * 1.4, lR * 1.4);
    },
  },
  {
    // 22. Naatu Hook-Step (Tollywood Mass): rapid suspender-hold cross-kick & synchronized side-to-side ankle whip.
    id: 'TOLLYWOOD_MASS_NAATU', name: 'Naatu Mass Step — Rapid Cross-Kick & Suspender Bounce', family: 'BOLLYWOOD',
    origin: 'Tollywood — Telangana & Andhra Pradesh, India', energy: 0.92, tempoFit: [115, 175], defaultBars: 4,
    tags: ['footwork', 'jump', 'groove'], faceIntent: 'intense', tailCarriage: 'whip',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const kick = Math.sin(c.p); // 1-beat alternating high cross-kick
      const hop = Math.abs(Math.cos(c.p)); // off-beat supporting foot micro-hop
      // Micro-hop (rootY 0.04m) with counter-twisting pelvis & chest to balance rapid kicks
      setBody(t, hop * 0.04 * e, PY - 0.09 * e - c.bass * 0.06, -kick * 0.09 * e, 0, 0.05, -kick * 0.24, kick * 0.10, 0.06, kick * 0.18, -kick * 0.08, 0.14 + c.mid * 0.12, kick * 0.22, -kick * 0.10, 1.07 + c.beatPulse * 0.06, 0, -kick * 0.14, kick * 0.08, c.beatPulse * 0.16, -kick * 0.18, -kick * 0.12);
      // Paws gripping imaginary suspenders at chest while elbows wing out on each kick
      setArms(t, -0.75, 0.55, 0.55 + Math.max(0, kick) * 0.35, -1.55, 0.6, 0.25, 0.2, -0.75, -0.55, -0.55 - Math.max(0, -kick) * 0.35, -1.55, -0.6, 0.25, -0.2);
      // Fast alternating cross-body kick (legStepPitch -0.45 rad, inward legStepRoll)
      const kL = Math.max(0, kick) * e;
      const kR = Math.max(0, -kick) * e;
      setLegs(t, kL * 0.22, kR * 0.22, -kL * 0.48, -kR * 0.48, -kL * 0.22 + 0.08, kR * 0.22 - 0.08, 0.15, -0.15, 0.22 + kR * 0.25, 0.22 + kL * 0.25, -kL * 0.35 + c.high * 0.15, -kR * 0.35 + c.high * 0.15);
    },
  },
  {
    // 23. Ghoomar (Rajasthani Royal Twirl): continuous veil-framed ghagra skirt spin with dipping wave on sam.
    id: 'RAJASTHANI_GHOOMAR_TWIRL', name: 'Ghoomar — Royal Marwar Veil Twirl', family: 'INDIAN_FOLK',
    origin: 'Ghoomar — Rajasthan, India', energy: 0.60, tempoFit: [90, 145], defaultBars: 4,
    tags: ['spin', 'arms', 'groove'], faceIntent: 'serene', tailCarriage: 'sway',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      if (c.isBeat && (c.beatCount % 4 === 0)) c.requestSpin(Math.PI * 2); // Smooth 360-deg ghagra twirl per bar
      const dip = 0.5 + 0.5 * Math.sin(c.halfP); // 2-beat rising and dipping wave
      const wrist = Math.sin(c.p); // 1-beat delicate Marwari wrist wave
      // Graceful dipping wave (-0.06m to -0.16m pelvisY) with gentle forward bow
      setBody(t, 0, PY - (0.06 + dip * 0.10 + c.bass * 0.04) * e, 0.05 * wrist * e, 0, -0.08 * dip * e, 0.10 * wrist, 0, -0.06 * dip * e, 0, 0.06 * wrist, 0.10 - 0.12 * dip + c.mid * 0.08, 0.12 * wrist, 0, 1.04 + c.bass * 0.04, -0.06 * dip, -0.08 * wrist, 0.08 * wrist, 0.08 * dip + c.beatPulse * 0.08, -0.10 * wrist, 0.10 * wrist);
      // Soft rounded arms framing veiled face and flared skirt
      setArms(t, -1.35 + dip * 0.35, 0.35, 0.55, -1.20, 0.45, wrist * 0.40 + c.high * 0.15, 0.25, -1.05 + dip * 0.25, -0.35, -0.65, -1.10, -0.45, -wrist * 0.40 - c.high * 0.15, -0.25);
      // Small circular pivot steps
      const lL = Math.max(0, wrist) * 0.07 * e;
      const lR = Math.max(0, -wrist) * 0.07 * e;
      setLegs(t, lL, lR, -lL * 0.8, -lR * 0.8, 0.08, -0.08, 0.24 * e, -0.24 * e, (0.18 + dip * 0.22) * e, (0.18 + dip * 0.22) * e, lL * 1.8, lR * 1.8);
    },
  },
  {
    // 24. Lavani (Maharashtra Folk): sassy nauvari-saree waist figure-8, padar flick, and dramatic back-arch head toss.
    id: 'MAHARASHTRA_LAVANI_FLICK', name: 'Lavani — Sassy Dholki Waist Flick & Head Toss', family: 'INDIAN_FOLK',
    origin: 'Lavani — Maharashtra, India', energy: 0.75, tempoFit: [100, 160], defaultBars: 4,
    tags: ['isolation', 'groove', 'pose'], faceIntent: 'smug', tailCarriage: 'whip',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const hip = Math.sin(c.p); // 1-beat sharp dholki hip figure-8
      const toss = Math.max(0, Math.sin(c.halfP)); // 2-beat dramatic back-arch & head toss
      // Sassy hip swing (±0.12m) + dramatic backward thoracic arch (+0.22 chestX on toss)
      setBody(t, 0, PY - 0.10 * e - c.bass * 0.06, hip * 0.12 * e, -0.03 * toss * e, 0.10 * toss * e, hip * 0.20, -hip * 0.15 * e, 0.12 * toss * e, -hip * 0.14, hip * 0.12, (0.22 * toss + c.mid * 0.12) * e, -hip * 0.16, hip * 0.10, 1.07 + c.beatPulse * 0.06, 0.14 * toss, hip * 0.12, -hip * 0.10, (0.24 * toss + c.beatPulse * 0.14) * e, hip * 0.18, -hip * 0.14);
      // Left hand on hip; right hand flicks imaginary saree padar at shoulder then points skyward
      setArms(t, 0.15, -0.45, 0.42, -1.40, 0.5, 0.35, -0.30, -1.30 - toss * 0.55, -0.30, -0.48 - toss * 0.25, -1.25 + toss * 0.50, -0.4, 0.45 * hip + c.high * 0.20, -0.25);
      // Heavy ghungroo heel-strike accents
      const lL = Math.max(0, hip) * 0.11 * e;
      const lR = Math.max(0, -hip) * 0.11 * e;
      setLegs(t, lL, lR, -lL * 1.2, -lR * 1.2, 0.12 * e, -0.12 * e, 0.26 * e, -0.26 * e, 0.24 * e, 0.24 * e, lL * 2.2, lR * 2.2);
    },
  },
  {
    // 25. Rongali Bihu (Assam Spring Folk): brisk coupled waist-shimmy with hands on hips & alternating overhead wave.
    id: 'ASSAM_BIHU_WAIST_FLICK', name: 'Rongali Bihu — Pepa Horn Waist Shimmy', family: 'INDIAN_FOLK',
    origin: 'Bihu — Assam, India', energy: 0.70, tempoFit: [105, 165], defaultBars: 4,
    tags: ['isolation', 'footwork', 'groove'], faceIntent: 'joyful', tailCarriage: 'sway',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const flick = Math.sin(c.p * 2); // rapid 2x-beat Assamese dhol waist-flick
      const armAlt = Math.sin(c.quarterP); // 2-bar switch between both-hands-on-waist and overhead wave
      // Forward inclination (-0.08 lowerSpineX) isolating rapid pelvic/waist oscillations
      setBody(t, 0, PY - 0.09 * e - Math.abs(Math.sin(c.p)) * (0.05 + c.bass * 0.05), flick * 0.08 * e, 0.03 * Math.cos(c.p) * e, -0.06 + 0.06 * flick, flick * 0.18, -flick * 0.12, -0.08 * e, -flick * 0.12, flick * 0.10, 0.08 + c.mid * 0.08, 0, -flick * 0.08, 1.04 + c.bass * 0.04, 0, 0, flick * 0.06, c.beatPulse * 0.10, 0.10 * Math.sin(c.halfP), -flick * 0.08);
      // Both hands at waist when armAlt <= 0; right hand waves overhead when armAlt > 0
      const upR = Math.max(0, armAlt) * e;
      setArms(t, 0.18, -0.50, 0.46, -1.45, 0.55, 0.35 + flick * 0.15, -0.35, 0.18 - upR * 1.85, 0.50 * (1 - upR), -0.46 - upR * 0.20, -1.45 + upR * 0.65, -0.55, 0.35 + flick * 0.30 + c.high * 0.15, 0.35);
      // Brisk hopping toe-heel step
      const lL = Math.max(0, Math.sin(c.p)) * 0.09 * e;
      const lR = Math.max(0, -Math.sin(c.p)) * 0.09 * e;
      setLegs(t, lL, lR, -lL * 1.1, -lR * 1.1, 0.10 * e, -0.10 * e, 0.22 * e, -0.22 * e, 0.24 * e, 0.24 * e, lL * 1.8, lR * 1.8);
    },
  },

  // ============================================================================
  // GROUP C — GLOBAL STREET / CLUB (12 Moves)
  // ============================================================================
  {
    // 26. Moonwalk Backslide: weight locked on raised toe while flat foot glides backward in 2-beat alternation.
    id: 'GLOBAL_MOONWALK_GLIDE', name: 'Moonwalk — Zero-Gravity Backslide Illusion', family: 'DISCO_FUNK',
    origin: 'Pop / Street — California, USA', energy: 0.68, tempoFit: [95, 145], defaultBars: 4,
    tags: ['footwork', 'isolation', 'groove'], faceIntent: 'smug', tailCarriage: 'curled',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const slide = Math.sin(c.halfP); // 2-beat alternating L/R glide cycle
      const snap = Math.cos(c.halfP); // foot switch moment
      // Forward neck/head turtle-lock (-0.12 chestX, +0.18 headX) while pelvis drifts back/forth
      setBody(t, 0, PY - 0.06 * e - c.bass * 0.04, 0, -0.06 * snap * e, -0.06 * e, slide * 0.12, 0, -0.08 * e, -slide * 0.10, 0, -0.12 * e - c.mid * 0.10, -slide * 0.12, 0, 1.03 + c.beatPulse * 0.04, -0.14 * e, 0, 0, 0.18 * e + c.beatPulse * 0.12, slide * 0.08, 0);
      // Smooth counter-swinging arms with crisp wrist snaps on foot switches
      setArms(t, -0.15 + slide * 0.50, 0.15, 0.28, -0.65 - Math.abs(snap) * 0.35, 0.2, 0.25 * snap, 0.15, -0.15 - slide * 0.50, -0.15, -0.28, -0.65 - Math.abs(snap) * 0.35, -0.2, -0.25 * snap, -0.15);
      // Anchor foot pops up on extreme toe (-0.45 ankleToePitch + 0.45 extraKnee) while flat foot slides back
      const archL = Math.max(0, slide) * e;
      const archR = Math.max(0, -slide) * e;
      setLegs(t, archL * 0.11, archR * 0.11, slide * 0.36 * e, -slide * 0.36 * e, 0.06, -0.06, 0.08, -0.08, archL * 0.48, archR * 0.48, -archL * 0.46 + c.high * 0.10, -archR * 0.46 + c.high * 0.10);
    },
  },
  {
    // 27. Stepped Robot: phase-quantized 90-degree servo locks with micro-overshoot shudder on beatPulse.
    id: 'GLOBAL_STEPPED_ROBOT', name: 'Cyber-Cat Robot — Quantized Servo Locks', family: 'HIP_HOP',
    origin: 'Popping / Robot — Oakland & LA, USA', energy: 0.62, tempoFit: [90, 145], defaultBars: 4,
    tags: ['isolation', 'arms', 'pose'], faceIntent: 'smug', tailCarriage: 'neutral',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const q1 = Math.round(Math.sin(c.halfP)); // quantized -1, 0, +1 2-beat servo state
      const q2 = Math.round(Math.cos(c.p)); // quantized 1-beat secondary axis state
      const dime = c.beatPulse * 0.16; // mechanical servo arrest vibration on beat hit
      // Rigid torso turning in quantized 45-deg increments
      setBody(t, 0, PY - 0.05 * e, q1 * 0.05 * e, 0, 0, q1 * 0.22 * e, 0, 0, q1 * 0.15 * e, 0, 0.08 + dime * 0.5, q2 * 0.28 * e, q1 * 0.06, 1.04 + c.bass * 0.05, 0, -q2 * 0.25 * e, 0, dime, q1 * 0.32 * e, q2 * 0.10 * e);
      // 90-degree elbow right-angles (-1.57 rad) snapping between horizontal & vertical tracks
      setArms(t, -0.78 - q1 * 0.78, 0, 0.55 + q2 * 0.35, -1.57, q1 * 0.45, dime * 1.5, 0, -0.78 + q1 * 0.78, 0, -0.55 - q2 * 0.35, -1.57, -q1 * 0.45, -dime * 1.5, 0);
      // Stiff mechanical knee lock with quantized heel pivot
      setLegs(t, Math.max(0, q1) * 0.06 * e, Math.max(0, -q1) * 0.06 * e, -q1 * 0.15 * e, q1 * 0.15 * e, 0.08, -0.08, q1 * 0.18 * e, q1 * 0.18 * e, 0.10 * e, 0.10 * e, q2 * 0.20, -q2 * 0.20);
    },
  },
  {
    // 28. Egyptian Box Tutting: geometric 90-degree forearm & paw frames sliding around the head and chest.
    id: 'GLOBAL_KING_TUTTING', name: 'King Tut — Geometric 90° Paw Box Frames', family: 'HIP_HOP',
    origin: 'Street / Popping — California, USA', energy: 0.64, tempoFit: [95, 150], defaultBars: 4,
    tags: ['arms', 'isolation', 'pose'], faceIntent: 'intense', tailCarriage: 'curled',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const slot = Math.sin(c.p); // 1-beat geometric wrist/forearm slide
      const box = Math.cos(c.halfP); // 2-beat box rotation around chest/face
      // Low locked stance (-0.09m) while neck slides horizontally inside forearm box
      setBody(t, 0, PY - 0.09 * e - c.bass * 0.05, box * 0.06 * e, 0, 0, 0, -box * 0.05, 0.04, 0, box * 0.05, 0.08 + c.mid * 0.10, 0, -box * 0.06, 1.04 + c.beatPulse * 0.05, 0, slot * 0.16 * e, box * 0.14 * e, c.beatPulse * 0.10, -slot * 0.14, -box * 0.14 * e);
      // Elbows raised to shoulder height (-1.50 shoulderX, ±0.95 shoulderZ), wrists bent 90 deg (±0.85 rad)
      setArms(t, -1.50 * e, 0.55 + box * 0.35, 0.90 * e, -1.57 * e, 0.65 + slot * 0.45, 0.85 * Math.sign(slot) + c.high * 0.15, 0.40 * box, -1.50 * e, -0.55 + box * 0.35, -0.90 * e, -1.57 * e, -0.65 + slot * 0.45, -0.85 * Math.sign(slot) - c.high * 0.15, -0.40 * box);
      // Wide stable base with subtle beat knee pulse
      setLegs(t, 0.02 * Math.max(0, slot), 0.02 * Math.max(0, -slot), 0, 0, 0.16 * e, -0.16 * e, 0.25 * e, -0.25 * e, 0.24 * e + c.bass * 0.08, 0.24 * e + c.bass * 0.08, 0, 0);
    },
  },
  {
    // 29. Fresno Popping & Body Wave: phase-propagated sagittal wave from head -> chest -> spine -> pelvis -> knees.
    id: 'GLOBAL_POPPING_BODYWAVE', name: 'Fresno Boogaloo — Full-Body Wave & Hit', family: 'HIP_HOP',
    origin: 'Electric Boogaloos — Fresno, California, USA', energy: 0.72, tempoFit: [90, 145], defaultBars: 4,
    tags: ['isolation', 'groove'], faceIntent: 'smug', tailCarriage: 'sway',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const hit = c.beatPulse * (0.20 + c.bass * 0.15); // sharp muscle contraction hit on kick
      // Travelling sagittal wave: phase lags by 0.65 rad per segment down the body
      const wHead = Math.sin(c.p);
      const wChest = Math.sin(c.p - 0.65);
      const wSpine = Math.sin(c.p - 1.30);
      const wPelvis = Math.sin(c.p - 1.95);
      setBody(t, 0, PY - 0.10 * e - Math.max(0, -wPelvis) * 0.08, Math.sin(c.halfP) * 0.09 * e, wPelvis * 0.08 * e, wPelvis * 0.18 * e, Math.cos(c.halfP) * 0.14, 0, wSpine * 0.20 * e, 0, 0, wChest * 0.26 * e - hit, 0, 0, 1.05 + hit * 0.4 + c.mid * 0.06, wHead * 0.18 * e, 0, 0, -wHead * 0.22 * e + hit, 0, Math.sin(c.halfP) * 0.10);
      // Fresno side-to-side arm pop & wrist roll
      const armSide = Math.sin(c.halfP);
      setArms(t, -0.65 - Math.max(0, armSide) * 0.55, 0.25, 0.45 + wChest * 0.20, -1.10 - hit, 0.3, wHead * 0.35, 0.15, -0.65 - Math.max(0, -armSide) * 0.55, -0.25, -0.45 - wChest * 0.20, -1.10 - hit, -0.3, -wHead * 0.35, -0.15);
      // Wave terminates in alternating knee bend & heel pop
      const lL = Math.max(0, wPelvis) * 0.07 * e;
      const lR = Math.max(0, -wPelvis) * 0.07 * e;
      setLegs(t, lL, lR, -wPelvis * 0.15, wPelvis * 0.15, 0.12 * e, -0.12 * e, 0.18 * e, -0.18 * e, (0.24 + Math.max(0, -wPelvis) * 0.25) * e, (0.24 + Math.max(0, wPelvis) * 0.25) * e, -lL * 3.0, -lR * 3.0);
    },
  },
  {
    // 30. Campbellocking Twirl & Point: rapid overhead wrist twirl ("twirl") snapping into a dead-stop Uncle Sam point ("lock").
    id: 'GLOBAL_LOCKING_POINT', name: 'Campbellock — Wrist Twirl & Uncle Sam Point', family: 'DISCO_FUNK',
    origin: 'Locking — Los Angeles, USA', energy: 0.78, tempoFit: [100, 155], defaultBars: 4,
    tags: ['arms', 'pose', 'groove'], faceIntent: 'joyful', tailCarriage: 'high',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const isPoint = Math.sin(c.halfP) > 0; // beat 1: wrist twirl up; beat 2: sharp point lock
      const twirl = Math.sin(c.p * 2); // fast double-time wrist roll during twirl phase
      // Funky Scooby-Doo knee bounce on twirl, sharp forward freeze bow on point
      setBody(t, 0, PY - (isPoint ? 0.13 : 0.07 + Math.abs(Math.sin(c.p)) * 0.06) * e, (isPoint ? -0.08 : 0.06) * e, 0, isPoint ? -0.12 * e : 0.04, isPoint ? -0.22 * e : 0.12, 0, isPoint ? -0.10 * e : 0.05, 0, 0, (isPoint ? -0.14 : 0.16) * e + c.mid * 0.10, isPoint ? -0.25 * e : 0.15, 0, 1.06 + c.beatPulse * 0.06, 0, isPoint ? 0.20 * e : -0.10, 0, c.beatPulse * 0.15, isPoint ? 0.25 * e : -0.12, isPoint ? -0.12 : 0.08);
      // Right arm twirls by ear (-1.85 rad) then shoots straight out (-1.45 shoulderRX, -0.15 elbowRX) to point at camera
      setArms(t, 0.15, -0.40, 0.42, -1.35, 0.45, 0.30, -0.25, isPoint ? -1.45 * e : -1.85 * e, isPoint ? 0 : -0.35, isPoint ? -0.25 * e : -0.55 * e, isPoint ? -0.15 : -1.45, 0, isPoint ? 0.10 : twirl * 0.65, 0);
      // High funky knee lift on transition
      const lL = (!isPoint ? Math.abs(Math.sin(c.p)) * 0.16 : 0.03) * e;
      const lR = (isPoint ? 0.08 : 0.02) * e;
      setLegs(t, lL, lR, -lL * 1.4, -lR * 1.2, 0.14 * e, -0.14 * e, 0.22 * e, -0.22 * e, 0.28 * e + c.bass * 0.10, 0.28 * e + c.bass * 0.10, lL * 1.5, -lR * 2.5);
    },
  },
  {
    // 31. B-Boy CC Footwork: deep crouch floor-work kicking & hooking alternating legs across with sneaker scuffs.
    id: 'GLOBAL_BBOY_CCS_FOOTWORK', name: 'B-Boy CCs — Low Crouch Cross-Sweep Footwork', family: 'BREAKDANCE',
    origin: 'Breaking — Bronx, New York, USA', energy: 0.90, tempoFit: [105, 175], defaultBars: 4,
    tags: ['floor', 'footwork'], faceIntent: 'fierce', tailCarriage: 'whip',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const cc = Math.sin(c.p); // 1-beat alternating L/R CC kick-sweep
      // Deep floor crouch (-0.30m pelvisY) twisting hips violently against upper torso
      setBody(t, 0, PY - (0.28 + c.bass * 0.06) * e, -cc * 0.14 * e, -0.05 * e, -0.22 * e, cc * 0.38 * e, cc * 0.14 * e, -0.18 * e, -cc * 0.22, -cc * 0.10, -0.20 * e - c.bass * 0.10, -cc * 0.30 * e, 0, 1.08 + c.beatPulse * 0.06, 0.16 * e, cc * 0.18, 0, 0.22 * e + c.beatPulse * 0.15, cc * 0.24, -cc * 0.12);
      // Supporting arm posts down toward floor (-0.55 shoulderX, straight elbow); opposite arm guards chest
      const postL = Math.max(0, -cc) * e;
      const postR = Math.max(0, cc) * e;
      setArms(t, -0.55 - postL * 0.35, 0.20, 0.45 + postL * 0.25, -0.95 + postL * 0.65, 0.2, 0.45 * postL, 0.15, -0.55 - postR * 0.35, -0.20, -0.45 - postR * 0.25, -0.95 + postR * 0.65, -0.2, 0.45 * postR, -0.15);
      // Sweeping leg shoots forward/across (-0.52 legStepPitch) while supporting leg compresses (0.95 extraKnee)
      setLegs(t, postR * 0.18, postL * 0.18, -postR * 0.52, -postL * 0.52, 0.26 * e - postR * 0.35, -0.26 * e + postL * 0.35, 0.32 * e, -0.32 * e, (0.92 - postR * 0.60) * e, (0.92 - postL * 0.60) * e, postR * 0.42, postL * 0.42);
    },
  },
  {
    // 32. Power Hop & Air-Chair Freeze (Accent Move): explosive spin-hop dropping into an inverted-angle b-boy freeze hold.
    id: 'GLOBAL_BABY_FREEZE_HOP', name: 'B-Boy Freeze — Spin Hop & Power Freeze Lock', family: 'BREAKDANCE',
    origin: 'Breaking — Bronx, New York, USA', energy: 0.98, tempoFit: [100, 175], defaultBars: 2,
    tags: ['floor', 'jump', 'pose', 'spin'], faceIntent: 'intense', tailCarriage: 'whip', accentMove: true,
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      if (c.isBeat && c.moveBeat < 1.0) c.requestSpin(Math.PI * 2); // Entry 360 power-whip spin
      const hop = c.moveProgress < 0.25 ? Math.sin(c.moveProgress * 4 * Math.PI) : 0; // entry hop into freeze
      const lock = c.moveProgress >= 0.25 ? e : e * (c.moveProgress * 4); // freeze hold envelope
      // Deep asymmetrical freeze tilt: pelvis drops (-0.32m), torso tilts hard sideways (+0.32 pelvisRotZ & chestZ)
      setBody(t, hop * 0.14, PY - 0.31 * lock, 0.14 * lock, 0.05 * lock, -0.18 * lock, -0.28 * lock, 0.28 * lock, -0.14 * lock, -0.15 * lock, 0.22 * lock, 0.15 * lock + c.bass * 0.10, -0.20 * lock, 0.25 * lock, 1.10 + c.beatPulse * 0.08, 0.12 * lock, 0.18 * lock, -0.15 * lock, 0.18 * lock + c.beatPulse * 0.14, 0.25 * lock, -0.18 * lock);
      // Left arm posts down into stab position; right arm flares high in b-boy balance line
      setArms(t, -0.65 * lock, 0.35, 0.35 * lock, -1.15 * lock, 0.4, 0.55 * lock, 0.2, -1.95 * lock, -0.25, -0.85 * lock, -0.55 * lock, -0.3, 0.35 + c.high * 0.20, -0.25);
      // Left leg tucked tight; right leg kicked high and wide (footLiftR 0.28m, legStepPitchR -0.55)
      setLegs(t, 0.05 * lock, (0.28 + c.bass * 0.04) * lock, 0.15 * lock, -0.55 * lock, 0.22 * lock, -0.34 * lock, 0.35 * lock, -0.42 * lock, 0.95 * lock, 0.18 * lock, -0.35 * lock, 0.42 * lock);
    },
  },
  {
    // 33. 1920s Harlem Charleston: inward/outward knee-twist ("bee's knees") with high front-back swing kicks.
    id: 'GLOBAL_HARLEM_CHARLESTON', name: 'Harlem Charleston — Bee’s-Knees Twist & Kick', family: 'GLOBAL_PARTY',
    origin: 'Jazz / Swing — Harlem, New York, USA', energy: 0.80, tempoFit: [105, 170], defaultBars: 4,
    tags: ['footwork', 'groove'], faceIntent: 'joyful', tailCarriage: 'sway',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const step = Math.sin(c.halfP); // 2-beat front-kick / back-step pendulum
      const twist = Math.cos(c.p); // 1-beat inward/outward Charleston heel-toe twist
      // Bouncy 1920s jazz forward lean (-0.12 lowerSpineX) with playful hip swivel
      setBody(t, Math.max(0, Math.sin(c.p)) * 0.03 * e, PY - 0.09 * e - Math.abs(twist) * 0.05, twist * 0.07 * e, step * 0.06 * e, -0.10 * e, -step * 0.18, twist * 0.08, -0.10 * e, step * 0.14, -twist * 0.06, -0.08 * e + c.mid * 0.10, step * 0.20, 0, 1.05 + c.beatPulse * 0.05, 0.10 * e, -step * 0.12, twist * 0.08, 0.14 + c.beatPulse * 0.12, -step * 0.14, twist * 0.10);
      // Opposing jazz-running arms + playful wrist flap on twist
      setArms(t, -0.45 + step * 0.65, 0.25, 0.38 + Math.abs(twist) * 0.18, -1.15, 0.3, twist * 0.38, 0.2, -0.45 - step * 0.65, -0.25, -0.38 - Math.abs(twist) * 0.18, -1.15, -0.3, -twist * 0.38, -0.2);
      // Iconic Charleston pigeon-toe / knock-knee alternation via hipYawL/R reversal
      const lL = Math.max(0, step) * 0.20 * e;
      const lR = Math.max(0, -step) * 0.20 * e;
      setLegs(t, lL, lR, -step * 0.44 * e, step * 0.44 * e, 0.12 * twist * e, -0.12 * twist * e, twist * 0.36 * e, -twist * 0.36 * e, 0.26 * e + c.bass * 0.10, 0.26 * e + c.bass * 0.10, lL * 1.5, lR * 1.5);
    },
  },
  {
    // 34. Hardstyle / Jumpstyle: high airborne double-kick jumper with hard downward fist pumps on every kick transient.
    id: 'GLOBAL_HARD_JUMPSTYLE', name: 'Jumpstyle — Rotterdam Hard-Kick Jumper', family: 'SHUFFLE',
    origin: 'Jumpstyle — Belgium & Netherlands', energy: 0.95, tempoFit: [120, 175], defaultBars: 4,
    tags: ['jump', 'footwork'], faceIntent: 'intense', tailCarriage: 'whip',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const hop = Math.abs(Math.sin(c.p)); // every-beat airborne jump
      const kick = Math.sin(c.halfP); // alternating high front-kick vs back-tuck
      // Continuous airborne hop (rootY up to 0.11m) with upright backward counter-lean during high front kicks
      setBody(t, hop * (0.08 + c.bass * 0.05) * e, PY - 0.07 * e, -kick * 0.06 * e, 0, 0.08 * Math.abs(kick) * e, -kick * 0.18, 0, 0.06 * e, kick * 0.14, 0, 0.12 + c.bass * 0.12, kick * 0.18, 0, 1.08 + c.beatPulse * 0.08, -0.08, -kick * 0.12, 0, c.beatPulse * 0.18, -kick * 0.15, 0);
      // Tight boxer/jumper guard arms pumping hard with each kick
      setArms(t, -0.65 + kick * 0.50, 0.30, 0.35, -1.35 + hop * 0.35, 0.35, 0.25 * hop, 0.15, -0.65 - kick * 0.50, -0.30, -0.35, -1.35 + hop * 0.35, -0.35, 0.25 * hop, -0.15);
      // Kicking leg shoots high forward (-0.54 legStepPitch, 0.26m footLift) while back leg tucks
      const kL = Math.max(0, kick) * e;
      const kR = Math.max(0, -kick) * e;
      setLegs(t, (0.08 + kL * 0.18) * e, (0.08 + kR * 0.18) * e, -kick * 0.52 * e, kick * 0.52 * e, 0.08, -0.08, 0.12, -0.12, (0.18 + kR * 0.45) * e, (0.18 + kL * 0.45) * e, (kL - kR) * 0.35, (kR - kL) * 0.35);
    },
  },
  {
    // 35. The Floss: high-speed counter-phase hip swing while straight arms whip across front and behind back.
    id: 'GLOBAL_VIRAL_FLOSS', name: 'The Floss — Counter-Phase Hip & Arm Whip', family: 'GLOBAL_PARTY',
    origin: 'Viral Street / Pop — Global', energy: 0.76, tempoFit: [100, 165], defaultBars: 4,
    tags: ['isolation', 'arms', 'groove'], faceIntent: 'smug', tailCarriage: 'whip',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const swing = Math.sin(c.p * 2); // fast double-time lateral hip & arm opposition
      const frontBack = Math.sin(c.p); // alternates arms passing in front vs behind pelvis
      // Deadpan still head while pelvis violently swings opposite to arms (±0.15m pelvisX)
      setBody(t, 0, PY - 0.06 * e - c.bass * 0.04, -swing * 0.15 * e, 0, 0, swing * 0.16, swing * 0.20 * e, 0, -swing * 0.12, -swing * 0.16 * e, 0.06 + c.mid * 0.06, -swing * 0.10, -swing * 0.10 * e, 1.03 + c.beatPulse * 0.04, 0, 0, swing * 0.06, c.beatPulse * 0.08, 0, 0);
      // Straight stiff arms (-0.15 elbowX) sweeping together laterally in opposite phase to pelvis
      setArms(t, -0.15 * frontBack, swing * 0.25, 0.35 + swing * 0.48 * e, -0.15, 0, 0.20 * swing, 0, -0.15 * frontBack, swing * 0.25, -0.35 + swing * 0.48 * e, -0.15, 0, 0.20 * swing, 0);
      // Alternating heel relief so feet stay planted without sliding
      const lL = Math.max(0, swing) * 0.05 * e;
      const lR = Math.max(0, -swing) * 0.05 * e;
      setLegs(t, lL, lR, 0, 0, 0.12 * e, -0.12 * e, 0.15 * e, -0.15 * e, 0.15 + lL * 2.5, 0.15 + lR * 2.5, -lL * 4.0, -lR * 4.0);
    },
  },
  {
    // 36. Caramelldansen / Kawaii Bunny Bounce: paws cupped beside ears as bunny ears with joyful side-hip bounce.
    id: 'GLOBAL_CARAMELL_KAWAII', name: 'Caramelldansen — Kawaii Ear-Paw Hip Bounce', family: 'GLOBAL_PARTY',
    origin: 'Eurobeat / Harajuku Pop — Sweden & Japan', energy: 0.74, tempoFit: [110, 175], defaultBars: 4,
    tags: ['groove', 'jump', 'arms'], faceIntent: 'joyful', tailCarriage: 'high',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const sway = Math.sin(c.p); // 1-beat energetic side-to-side hip & head tilt
      const hop = Math.abs(Math.cos(c.p)); // every-beat upbeat bounce
      // Joyful lateral hip swing (±0.13m) with matching kawaii head tilt (+0.20 headZ)
      setBody(t, hop * 0.04 * e, PY - 0.08 * e - (1 - hop) * 0.07, sway * 0.13 * e, 0, 0.05, -sway * 0.12, -sway * 0.18 * e, 0.06, sway * 0.08, sway * 0.12 * e, 0.14 + c.mid * 0.08, 0, sway * 0.14 * e, 1.04 + c.beatPulse * 0.05, 0, 0, sway * 0.14 * e, 0.10 * hop + c.beatPulse * 0.10, 0, sway * 0.20 * e);
      // Both paws raised right beside cat ears (-1.95 shoulderX, -1.75 elbowX) flapping wrists on every beat
      const flap = (1 - hop) * 0.45 + c.high * 0.20;
      setArms(t, -1.95 * e, 0.35, 0.38 * e, -1.75 * e, 0.45, flap, 0.20 * sway, -1.95 * e, -0.35, -0.38 * e, -1.75 * e, -0.45, flap, 0.20 * sway);
      // Playful side-kick heel flick on unweighted leg
      const lL = Math.max(0, -sway) * 0.14 * e;
      const lR = Math.max(0, sway) * 0.14 * e;
      setLegs(t, lL, lR, 0.12 * lL, 0.12 * lR, 0.14 * e, -0.14 * e, 0.15 * e, -0.15 * e, 0.22 + lL * 1.8, 0.22 + lR * 1.8, -lL * 2.5, -lR * 2.5);
    },
  },
  {
    // 37. Harlem Ballroom Vogue + K-Pop S-Curve Body Roll: sharp angular face-framing hands with sensual chest-to-hip roll.
    id: 'GLOBAL_VOGUE_KPOP_ROLL', name: 'Ballroom Vogue — Face Frame & K-Pop Body Roll', family: 'GLOBAL_PARTY',
    origin: 'Harlem Ballroom & Seoul K-Pop', energy: 0.70, tempoFit: [95, 155], defaultBars: 4,
    tags: ['arms', 'isolation', 'pose'], faceIntent: 'smug', tailCarriage: 'curled',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const frameSwitch = Math.sin(c.halfP); // 2-beat architectural Vogue hand frame switch
      const roll = Math.sin(c.p); // 1-beat K-pop chest-to-pelvis body roll
      // High-fashion S-curve chest isolations with fierce runway neck attitude
      setBody(t, 0, PY - 0.08 * e - Math.max(0, -roll) * 0.06, frameSwitch * 0.10 * e, Math.cos(c.p) * 0.06 * e, -roll * 0.16 * e, frameSwitch * 0.18, -frameSwitch * 0.14 * e, roll * 0.18 * e, -frameSwitch * 0.12, frameSwitch * 0.10, (0.20 * roll + c.mid * 0.12) * e, -frameSwitch * 0.15, frameSwitch * 0.12, 1.06 + c.beatPulse * 0.05, -0.08 * roll, frameSwitch * 0.16, -frameSwitch * 0.12, c.beatPulse * 0.12, frameSwitch * 0.22, -frameSwitch * 0.15);
      // Angular horizontal & vertical Vogue face frames with crisp 90-degree wrist angles
      setArms(t, -1.45 - frameSwitch * 0.45, 0.55, 0.52 * e, -1.60 * e, 0.65, 0.55 * frameSwitch + c.high * 0.20, 0.35, -1.45 + frameSwitch * 0.45, -0.55, -0.52 * e, -1.60 * e, -0.65, -0.55 * frameSwitch - c.high * 0.20, -0.35);
      // Catwalk cross-posed legs with high stiletto heel arch on front foot
      const lL = Math.max(0, frameSwitch) * 0.08 * e;
      const lR = Math.max(0, -frameSwitch) * 0.08 * e;
      setLegs(t, lL, lR, -0.15 * frameSwitch * e, 0.15 * frameSwitch * e, 0.06, -0.06, 0.20 * e, -0.20 * e, 0.16 + lL * 2.2, 0.16 + lR * 2.2, -lL * 4.2, -lR * 4.2);
    },
  },

  // ============================================================================
  // GROUP D — LEGACY 5 REFACTORS (Mandatory Verbatim Math Preserved)
  // ============================================================================
  {
    // 38. Legacy 1 — IDLE: Club-ready relaxed breathing sway, tail & ear micro-groove when music is quiet/stopped.
    id: 'LEGACY_IDLE_BREATHE', name: 'Club Idle — Neon Streetwear Breathing Sway', family: 'IDLE',
    origin: 'Original Engine Legacy State 1', energy: 0.10, tempoFit: [60, 200], defaultBars: 4,
    tags: ['groove'], faceIntent: 'serene', tailCarriage: 'neutral',
    pose: (t, c) => {
      const breath = Math.sin(c.elapsed * 2.2); // slow organic breathing cycle
      const sway = Math.sin(c.elapsed * 1.1); // gentle weight shift
      t.rootY = 0;
      t.pelvisY = PY - 0.02 + breath * 0.012; // subtle standing knee softness
      t.pelvisX = sway * 0.035; // gentle lateral weight drift
      t.pelvisZ = 0;
      t.pelvisRotX = 0.02 * breath;
      t.pelvisRotY = sway * 0.05;
      t.pelvisRotZ = -sway * 0.03;
      t.lowerSpineX = 0.03 * breath;
      t.lowerSpineY = -sway * 0.04;
      t.lowerSpineZ = sway * 0.03;
      t.chestX = 0.05 * breath;
      t.chestY = -sway * 0.05;
      t.chestZ = 0;
      t.chestScale = 1.0 + breath * 0.025; // breathing ribcage expansion
      t.neckX = -0.02 * breath;
      t.neckY = sway * 0.06;
      t.neckZ = 0;
      t.headX = 0.04 * Math.sin(c.elapsed * 2.2 - 0.5) + c.beatPulse * 0.05;
      t.headY = sway * 0.08;
      t.headZ = sway * 0.04;
      // Standing neutral arms per Engine Contract Part B
      t.shoulderLX = 0.10 + breath * 0.03; t.shoulderLY = 0; t.shoulderLZ = 0.25;
      t.elbowLX = -0.35 - breath * 0.04; t.elbowLY = 0.10; t.wristLX = 0; t.wristLZ = 0;
      t.shoulderRX = 0.10 + breath * 0.03; t.shoulderRY = 0; t.shoulderRZ = -0.25;
      t.elbowRX = -0.35 - breath * 0.04; t.elbowRY = -0.10; t.wristRX = 0; t.wristRZ = 0;
      t.footLiftL = 0; t.footLiftR = 0;
      t.legStepPitchL = 0; t.legStepPitchR = 0;
      t.legStepRollL = 0.04; t.legStepRollR = -0.04;
      t.hipYawL = 0.10; t.hipYawR = -0.10;
      t.extraKneeL = 0.04; t.extraKneeR = 0.04;
      t.ankleToePitchL = 0; t.ankleToePitchR = 0;
    },
  },
  {
    // 39. Legacy 2 — HIP_HOP_GROOVE: Verbatim reference move from Engine Contract Part D (2-step bounce, chest pop, nod).
    id: 'LEGACY_HIP_HOP_GROOVE', name: 'Hip-Hop Groove — 2-Step Bounce & Snare Chest Pop', family: 'HIP_HOP',
    origin: 'Original Engine Legacy State 2', energy: 0.60, tempoFit: [90, 155], defaultBars: 4,
    tags: ['groove', 'isolation'], faceIntent: 'smug', tailCarriage: 'sway',
    pose: (t, c) => {
      const { p, halfP, bass, mid, beatPulse } = c;
      const bounce = Math.abs(Math.sin(p * 0.5)); // bounce on every beat
      const grooveSway = Math.sin(halfP); // 2-beat lateral weight transfer
      t.rootY = 0;
      t.pelvisY = PY - 0.06 - bounce * (0.1 + bass * 0.09); // knee-bounce sinks with the kick
      t.pelvisX = grooveSway * 0.11; // weight shifts side to side
      t.pelvisZ = 0;
      t.pelvisRotZ = -grooveSway * 0.09; // opposite hip drop
      t.pelvisRotY = Math.cos(halfP) * 0.14;
      t.pelvisRotX = 0.06 * bounce;
      // Phase-delayed S-curve spine + snare chest pop
      t.lowerSpineX = 0.08 * Math.sin(p - 0.3); // phase offset = spine follows hips late
      t.lowerSpineY = Math.sin(halfP - 0.3) * 0.12;
      t.lowerSpineZ = grooveSway * 0.08;
      t.chestX = -0.14 * Math.sin(p) - mid * 0.18; // chest pops forward on snare
      t.chestY = -Math.sin(halfP - 0.6) * 0.18;
      t.chestZ = Math.cos(halfP) * 0.08;
      t.chestScale = 1 + mid * 0.06 + bass * 0.04;
      // Syncopated head nod (off-beat — the "yea boi" nod)
      t.neckX = 0.15 * Math.sin(p - 0.4);
      t.neckY = Math.sin(halfP) * 0.12;
      t.neckZ = -grooveSway * 0.08;
      t.headX = 0.24 * Math.sin(p) + beatPulse * 0.18; // extra nod punch on the kick
      t.headY = -t.chestY * 0.6; // head counter-rotates chest
      t.headZ = Math.sin(halfP) * 0.1;
      // Alternating shoulder pops + relaxed b-boy arm swing
      const armSwing = Math.sin(halfP);
      t.shoulderLX = -0.35 + armSwing * 0.45;
      t.shoulderLY = 0.15 * armSwing;
      t.shoulderLZ = 0.38 + Math.max(0, armSwing) * 0.25;
      t.elbowLX = -1.15 - 0.3 * Math.cos(p);
      t.elbowLY = 0.35;
      t.wristLX = 0.25 * Math.sin(p);
      t.wristLZ = 0.15;
      t.shoulderRX = -0.35 - armSwing * 0.45;
      t.shoulderRY = 0.15 * armSwing;
      t.shoulderRZ = -0.38 - Math.max(0, -armSwing) * 0.25;
      t.elbowRX = -1.15 + 0.3 * Math.cos(p);
      t.elbowRY = -0.35;
      t.wristRX = -0.25 * Math.sin(p);
      t.wristRZ = -0.15;
      // Subtle alternating foot tap on weight shift (IK keeps feet on floor)
      t.footLiftL = Math.max(0, -grooveSway) * 0.05;
      t.footLiftR = Math.max(0, grooveSway) * 0.05;
      t.legStepPitchL = 0; t.legStepPitchR = 0;
      t.legStepRollL = Math.max(0, -grooveSway) * 0.08;
      t.legStepRollR = -Math.max(0, grooveSway) * 0.08;
      t.hipYawL = 0.12; t.hipYawR = -0.12;
      t.extraKneeL = 0.10; t.extraKneeR = 0.10;
      t.ankleToePitchL = 0; t.ankleToePitchR = 0;
    },
  },
  {
    // 40. Legacy 3 — MELBOURNE_SHUFFLE: High-speed Running Man + T-Step heel-toe glide with pumping rave arms.
    id: 'LEGACY_MELBOURNE_SHUFFLE', name: 'Melbourne Shuffle — Running Man & T-Step Glide', family: 'SHUFFLE',
    origin: 'Original Engine Legacy State 3 — Melbourne, Australia', energy: 0.86, tempoFit: [110, 175], defaultBars: 4,
    tags: ['footwork', 'groove'], faceIntent: 'joyful', tailCarriage: 'whip',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const stride = Math.sin(c.p); // 1-beat high-knee Running Man alternation
      const pump = Math.abs(Math.cos(c.p)); // half-beat vertical shuffle hop
      // Micro-hop shuffle glide with counter-rotated torso & pumping rave arms
      setBody(t, pump * 0.04 * e, PY - 0.08 * e - (1 - pump) * (0.07 + c.bass * 0.06), Math.sin(c.halfP) * 0.09 * e, 0, -0.06 * e, -stride * 0.22, 0, -0.05 * e, stride * 0.16, 0, -0.08 * e - c.mid * 0.12, stride * 0.24, 0, 1.06 + c.beatPulse * 0.06, 0.08, -stride * 0.14, 0, 0.16 * pump + c.beatPulse * 0.14, -stride * 0.18, Math.sin(c.halfP) * 0.08);
      // Opposite arm-to-leg runner drive with hi-hat wrist flicks
      setArms(t, -0.55 - stride * 0.65, 0.20, 0.35, -1.20 + pump * 0.25, 0.25, stride * 0.35 + c.high * 0.20, 0.15, -0.55 + stride * 0.65, -0.20, -0.35, -1.20 + pump * 0.25, -0.25, -stride * 0.35 - c.high * 0.20, -0.15);
      // High knee chamber (0.24m footLift) sliding into wide front-back split (-0.46 legStepPitch)
      const liftL = Math.max(0, stride) * (0.22 + c.bass * 0.06) * e;
      const liftR = Math.max(0, -stride) * (0.22 + c.bass * 0.06) * e;
      setLegs(t, liftL, liftR, -stride * 0.45 * e, stride * 0.45 * e, 0.10 * e, -0.10 * e, 0.18 * e, -0.18 * e, 0.24 + liftL * 1.2, 0.24 + liftR * 1.2, stride * 0.30, -stride * 0.30);
    },
  },
  {
    // 41. Legacy 4 — DISCO_FUNK: Saturday Night Fever diagonal sky-point to hip-pocket sweep with funky hip thrust.
    id: 'LEGACY_DISCO_FUNK', name: 'Disco Funk — Travolta Sky-Point & Hip Thrust', family: 'DISCO_FUNK',
    origin: 'Original Engine Legacy State 4 — 1970s NYC Disco', energy: 0.72, tempoFit: [95, 150], defaultBars: 4,
    tags: ['arms', 'pose', 'groove'], faceIntent: 'smug', tailCarriage: 'high',
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      const point = Math.sin(c.halfP); // 2-beat diagonal sweep from left hip (-1) to right sky (+1)
      const thrust = Math.abs(Math.sin(c.p)); // every-beat disco pelvic thrust
      // Wide-lapel disco swagger: pelvis thrusts side-to-side while chest opens toward the pointing hand
      setBody(t, 0, PY - 0.07 * e - thrust * (0.07 + c.bass * 0.06), -point * 0.12 * e, 0.04 * thrust * e, 0.08 * thrust * e, point * 0.20, point * 0.14 * e, 0.08 * e, point * 0.15, -point * 0.10, 0.18 * e + c.mid * 0.12, point * 0.24 * e, -point * 0.12, 1.07 + c.beatPulse * 0.06, -0.06 * point, point * 0.18, 0, -0.12 * point + c.beatPulse * 0.12, point * 0.26 * e, 0.08 * point);
      // Left hand planted on left hip; right arm sweeps from across left waist (-0.65) up to sky-point (-2.45 shoulderRX)
      const sky = 0.5 + 0.5 * point; // 0 = across waist, 1 = full sky-point
      setArms(t, 0.15, -0.45, 0.45, -1.40, 0.5, 0.30, -0.30, (-0.65 - sky * 1.80) * e, (0.45 - sky * 0.65) * e, (0.35 - sky * 1.05) * e, (-1.10 + sky * 0.95) * e, -0.2, 0.20 * sky + c.high * 0.15, 0);
      // Weight shifts onto right leg during sky-point while left heel pops
      const lL = sky * 0.07 * e;
      const lR = (1 - sky) * 0.07 * e;
      setLegs(t, lL, lR, 0, 0, 0.16 * e, -0.16 * e, 0.25 * e, -0.25 * e, 0.18 + lL * 2.2, 0.18 + lR * 2.2, -lL * 3.5, -lR * 3.5);
    },
  },
  {
    // 42. Legacy 5 — BASS_DROP_BREAKDANCE: High-energy uprock jump-drop, krump chest-pop & rapid b-boy floor switches.
    id: 'LEGACY_BASS_DROP_BREAKDANCE', name: 'Bass-Drop Breakdance — Uprock Jump & Krump Stomp', family: 'BREAKDANCE',
    origin: 'Original Engine Legacy State 5', energy: 0.96, tempoFit: [100, 175], defaultBars: 4,
    tags: ['jump', 'floor', 'isolation', 'footwork'], faceIntent: 'fierce', tailCarriage: 'whip', accentMove: true,
    pose: (t, c) => {
      const e = env(c.moveProgress); // transition envelope
      // Signature 360-degree mid-air power spin every 4 beats (restored from
      // the original engine's BASS_DROP_BREAKDANCE state — dropped in the
      // refactor, reinstated because it was the state's defining flourish).
      if (c.isBeat && c.beatCount % 4 === 0) c.requestSpin(Math.PI * 2);
      const dropPhase = Math.sin(c.halfP); // >0 = high uprock jump-slash, <=0 = low floor drop
      const beatHit = Math.sin(c.p); // 1-beat alternating switch
      const isHigh = dropPhase > 0 ? 1 : 0;
      // Alternates between explosive airborne uprock leap (rootY 0.12m) and deep floor drop (-0.28m pelvisY)
      setBody(t, isHigh * Math.abs(beatHit) * (0.10 + c.bass * 0.06) * e, PY - (isHigh ? 0.08 : 0.28 + c.bass * 0.06) * e, beatHit * 0.12 * e, 0, (isHigh ? 0.08 : -0.20) * e, beatHit * 0.28, -beatHit * 0.12, (isHigh ? 0.06 : -0.16) * e, -beatHit * 0.20, 0, -c.beatPulse * 0.26 + (isHigh ? 0.18 : -0.15) * e, -beatHit * 0.26, 0, 1.10 + c.bass * 0.08 + c.beatPulse * 0.08, 0, beatHit * 0.16, 0, c.beatPulse * 0.22, beatHit * 0.22, -beatHit * 0.12);
      // Uprock cross-slash arms opening violently on each beatPulse
      const slash = Math.cos(c.p);
      setArms(t, -1.05 - isHigh * 0.55, slash * 0.45, 0.55 + slash * 0.35, -1.10 + slash * 0.45, 0.35, c.beatPulse * 0.45, 0.2, -1.05 - isHigh * 0.55, -slash * 0.45, -0.55 - slash * 0.35, -1.10 + slash * 0.45, -0.35, c.beatPulse * 0.45, -0.2);
      // Fast b-boy lunge-switches with deep extraKnee during low phase
      const lL = Math.max(0, beatHit) * 0.22 * e;
      const lR = Math.max(0, -beatHit) * 0.22 * e;
      setLegs(t, lL, lR, -beatHit * 0.46 * e, beatHit * 0.46 * e, 0.22 * e, -0.22 * e, 0.28 * e, -0.28 * e, ((1 - isHigh) * 0.65 + 0.22) * e, ((1 - isHigh) * 0.65 + 0.22) * e, lL * 1.6, lR * 1.6);
    },
  },
];

