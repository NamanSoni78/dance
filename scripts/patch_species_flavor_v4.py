#!/usr/bin/env python3
# scripts/patch_species_flavor_v4.py
# V4: replace DOG section with GIRL (Diva) section in speciesFlavor.ts
# + hype-pose bar-parity variety + GIRL branches in applyHypeCrewResponsePose.

import re, sys

PATH = "/home/z/my-project/src/lib/speciesFlavor.ts"
src = open(PATH, encoding="utf-8").read()
orig_len = len(src)

# ---------------------------------------------------------------------------
# 1) Cut the DOG section: from the banner line before "// SPECIES 2: THE DOG"
#    to the banner line before "// SPECIES 3: THE MOUSE".
# ---------------------------------------------------------------------------
dog_anchor = src.find("// SPECIES 2: THE DOG")
mouse_anchor = src.find("SPECIES 3: THE MOUSE")
if dog_anchor < 0 or mouse_anchor < 0:
    sys.exit("FATAL: could not find DOG/MOUSE section anchors")

dog_start = src.rfind("\n// =", 0, dog_anchor)
mouse_start = src.rfind("\n// =", 0, src.find("// " + "SPECIES 3: THE MOUSE") if False else mouse_anchor - 1)
# banner starts with "// ====" — walk back to that line's beginning
dog_start = src.rfind("\n// =", 0, dog_anchor)
mouse_banner = src.find("// =", src.rfind("\n", 0, mouse_anchor))
# Simpler: locate the "// ====" line that begins the mouse banner
mouse_line = src.rfind("\n", 0, mouse_anchor)
mouse_banner_start = src.rfind("\n// =", 0, mouse_anchor)
if dog_start < 0 or mouse_banner_start < 0:
    sys.exit("FATAL: banner walk-back failed")

GIRL_SECTION = r'''
// ============================================================================
// SPECIES 2: THE DIVA ('GIRL') — SMOOTH, EXPRESSIVE, MAGNETIC
// V4: replaces the dog. A realistic human diva on the shared biped rig —
// warm skin, natural face, high ponytail (verlet chain physics in the
// renderer) and a verlet-cloth skirt that flares on her spins. 0.92 groove:
// feminine figure-8 isolations, never robotic.
// ============================================================================

/**
 * Girl (Diva) Additive Accent Layer:
 * - Liquid figure-8 hip micro-roll on halfP (the feminine engine under every
 *   pose she dances — solo, duet or hype)
 * - Chest breath on the beat glow + 2-and-4 weight shift
 * - Charm head-tilt on the backbeat; wrist-flick micro-articulations
 * Kept SMALL — it stacks on top of any authored pose.
 */
function girlAccentLayer(t: JointTargets, ctx: MoveContext): void {
  const sway = Math.sin(ctx.halfP);
  const backbeat = Math.sin(ctx.p * 0.5); // 2-and-4 weight transfer
  const s1 = Math.sin(ctx.p);

  // Figure-8 hip isolation + lateral weight transfer
  t.pelvisRotZ += 0.022 * sway;
  t.pelvisRotY += 0.018 * s1;
  t.pelvisX += 0.006 * backbeat;
  t.pelvisY -= 0.010 * (0.5 + 0.5 * ctx.bass);

  // Chest breath on the beat glow
  t.chestScale += 0.014 * ctx.beatPulse + 0.008 * ctx.bass;
  t.chestZ += 0.014 * sway;

  // Charm head tilt on the backbeat (the "diva listen" micro-move)
  t.headZ += 0.020 * backbeat;
  t.neckZ += 0.012 * backbeat;

  // Wrist flick micro-articulations
  t.wristLZ += 0.03 * s1;
  t.wristRZ -= 0.03 * s1;

  clampPhysicsInPlace(t);
}

/**
 * GIRL SIGNATURE 1: GIRL_GHOOMAR_SKIRT_FLARE
 * The showcase spin: full Ghoomar twirls every 4 beats with wide rotating
 * wrists — the verlet skirt flares into a disc purely from spin velocity.
 */
const GIRL_GHOOMAR_SKIRT_FLARE: DanceMove = {
  id: 'GIRL_GHOOMAR_SKIRT_FLARE',
  name: 'Diva Signature — Ghoomar Skirt Flare Twirls',
  family: asDanceFamily('INDIAN_FOLK'),
  origin: 'Ghoomar — Rajasthani folk feminine spins',
  energy: 0.82,
  tempoFit: [100, 160],
  defaultBars: 4,
  tags: ['spin', 'arms'],
  faceIntent: 'joyful',
  tailCarriage: 'whip', // hair whips out with the spin (girl renderer)
  pose: (t, c) => {
    const e = env(c.moveProgress);
    const s = Math.sin(c.p);
    const wave = Math.sin(c.halfP);
    if (c.isBeat && c.beatCount % 4 === 0) c.requestSpin(Math.PI * 2);
    // Soft ghoomar plie + upright crown chest; hips figure-8 under the spin
    setBody(
      t,
      0,
      PELVIS_REST_Y - 0.08 * e - c.bass * 0.03,
      wave * 0.03 * e,
      0,
      0.03,
      wave * 0.05 * e,
      0,
      0.05,
      0,
      -wave * 0.04,
      0.10 + c.mid * 0.06,
      0,
      0,
      1.04 + c.bass * 0.03,
      -0.05,
      0,
      0,
      0.04 * e,
      wave * 0.10,
      0
    );
    // Wide rotating ghoomar arms — wrists circle on halfP
    setArms(
      t,
      -1.35 - Math.abs(wave) * 0.5, 0.3, 0.55 + wave * 0.3, -0.9 + wave * 0.4, 0.35, 0.5 * wave + c.high * 0.2, 0.3,
      -1.35 - Math.abs(wave) * 0.5, -0.3, -0.55 - wave * 0.3, -0.9 - wave * 0.4, -0.35, 0.5 * wave + c.high * 0.2, -0.3
    );
    // Heel-peel spins with soft knees
    setLegs(
      t,
      0.05 * Math.max(0, s), 0.05 * Math.max(0, -s), -0.06, -0.06, 0.08, -0.08, 0.30, -0.30,
      0.35 + c.bass * 0.08, 0.35 + c.bass * 0.08, -0.3, -0.3
    );
  },
};

/**
 * GIRL SIGNATURE 2: GIRL_HAIR_FLIP_WINDFALL
 * Bollywood hair-flip choreography: the head throws back on the half-beat,
 * the verlet ponytail whips over and settles with the figure-8 hips.
 */
const GIRL_HAIR_FLIP_WINDFALL: DanceMove = {
  id: 'GIRL_HAIR_FLIP_WINDFALL',
  name: 'Diva Signature — Hair-Flip Windfall',
  family: asDanceFamily('BOLLYWOOD'),
  origin: 'Bollywood hair-flip choreography',
  energy: 0.72,
  tempoFit: [95, 150],
  defaultBars: 4,
  tags: ['isolation', 'arms'],
  faceIntent: 'smug',
  tailCarriage: 'sway',
  pose: (t, c) => {
    const e = env(c.moveProgress);
    const flip = Math.sin(c.halfP); // 2-beat head-throw cycle
    const fig8 = Math.sin(c.p * 0.5); // slow figure-8 hips
    const throwPeak = Math.max(0, flip); // the back-throw half
    setBody(
      t,
      0,
      PELVIS_REST_Y - 0.06 * e,
      fig8 * 0.05 * e,
      0.02,
      -0.04 - throwPeak * 0.10,
      fig8 * 0.08,
      -fig8 * 0.05,
      0.04,
      0,
      0,
      0.12 + c.mid * 0.08,
      fig8 * 0.06,
      0,
      1.04 + c.bass * 0.03,
      -throwPeak * 0.35 - 0.05,
      0,
      0,
      -0.30 * throwPeak * e + c.beatPulse * 0.08,
      fig8 * 0.12,
      -fig8 * 0.06
    );
    // One arm sweeps across on the flip, the other frames the hip
    setArms(
      t,
      -0.5 - throwPeak * 0.9, 0.25, 0.35 + throwPeak * 0.25, -1.15 + throwPeak * 0.55, 0.3, 0.3 + c.high * 0.15, 0.2,
      -0.35, -0.2, -0.30, -0.75, -0.3, 0.35 + c.high * 0.15, -0.25
    );
    setLegs(
      t,
      0.04 * Math.max(0, Math.sin(c.p)), 0.04 * Math.max(0, -Math.sin(c.p)), 0, 0, 0.10, -0.10, 0.25, -0.25,
      0.30 + c.bass * 0.06, 0.30 + c.bass * 0.06, 0.10, 0.10
    );
  },
};

/**
 * GIRL SIGNATURE 3: GIRL_RUNWAY_DIAMOND_STRUT
 * Fashion-runway strut in place: chin up, shoulders back, hip pop on the
 * front step, long swinging arms that brush the thigh on the back-swing.
 */
const GIRL_RUNWAY_DIAMOND_STRUT: DanceMove = {
  id: 'GIRL_RUNWAY_DIAMOND_STRUT',
  name: 'Diva Signature — Runway Diamond Strut',
  family: asDanceFamily('DISCO_FUNK'),
  origin: 'Fashion-runway walk, diamond arms',
  energy: 0.58,
  tempoFit: [88, 140],
  defaultBars: 4,
  tags: ['pose', 'groove'],
  faceIntent: 'smug',
  tailCarriage: 'high',
  pose: (t, c) => {
    const e = env(c.moveProgress);
    const step = Math.sin(c.p); // 1-beat catwalk step cycle
    const hipPop = Math.max(0, step);
    setBody(
      t,
      0,
      PELVIS_REST_Y - 0.04 * e,
      step * 0.04 * e,
      0,
      -0.06,
      step * 0.10 * e,
      -step * 0.06,
      0.02,
      0,
      0,
      0.08 + c.mid * 0.05,
      0,
      0,
      1.03 + c.bass * 0.02,
      -0.12,
      0,
      0,
      0.05,
      step * 0.15,
      -step * 0.10
    );
    setArms(
      t,
      0.10 + hipPop * 0.20, 0.15, 0.18 + hipPop * 0.10, -0.55 - step * 0.25, 0.20, 0.25 + c.high * 0.12, 0.15,
      0.10 - step * 0.15, -0.15, -0.18 + Math.max(0, -step) * 0.10, -0.55 + step * 0.25, -0.20, 0.25 + c.high * 0.12, -0.15
    );
    // Catwalk cross-step: hip yaw + toe pitch, heel peel on the front step
    setLegs(
      t,
      0.06 * Math.max(0, step), 0.06 * Math.max(0, -step), -0.10 * step, 0.10 * step, 0.06, -0.06, 0.22, -0.22,
      0.28 + c.bass * 0.05, 0.28 + c.bass * 0.05, 0.20, 0.20
    );
  },
};

/**
 * GIRL SIGNATURE 4: GIRL_BHARATANATYAM_DIVA_FUSION
 * Bharatanatyam adavu stamps with feminine lasya styling — soft araimandi,
 * mudra arms at the ribs, hip isolation under the stamps.
 */
const GIRL_BHARATANATYAM_DIVA_FUSION: DanceMove = {
  id: 'GIRL_BHARATANATYAM_DIVA_FUSION',
  name: 'Diva Signature — Bharatanatyam Fusion Soli',
  family: asDanceFamily('INDIAN_CLASSICAL'),
  origin: 'Bharatanatyam adavus, feminine lasya styling',
  energy: 0.68,
  tempoFit: [95, 150],
  defaultBars: 4,
  tags: ['footwork', 'isolation'],
  faceIntent: 'fierce',
  tailCarriage: 'curled',
  pose: (t, c) => {
    const e = env(c.moveProgress);
    const s = Math.sin(c.p);
    const stampL = Math.max(0, s) * (0.16 + c.bass * 0.07) * e;
    const stampR = Math.max(0, -s) * (0.16 + c.bass * 0.07) * e;
    setBody(
      t,
      0,
      PELVIS_REST_Y - 0.12 * e - c.beatPulse * 0.04,
      s * 0.035 * e,
      0,
      -0.04,
      s * 0.05,
      -s * 0.04,
      0.05,
      -s * 0.04,
      s * 0.03,
      0.11 + c.mid * 0.07,
      0,
      0,
      1.04,
      -0.03,
      s * 0.07,
      s * 0.05,
      c.beatPulse * 0.10,
      s * 0.10,
      -s * 0.05
    );
    setArms(
      t,
      0.10, -0.40, 0.40, -1.30, 0.45, 0.35 + c.high * 0.18, 0.30,
      0.10, 0.40, -0.40, -1.30, -0.45, 0.35 + c.high * 0.18, -0.30
    );
    setLegs(
      t,
      stampL, stampR, -stampL * 0.3, -stampR * 0.3, 0.12, -0.12, 0.40, -0.40,
      0.42 + c.bass * 0.10, 0.42 + c.bass * 0.10, stampL * 0.8, stampR * 0.8
    );
  },
};

/**
 * GIRL SIGNATURE 5: GIRL_DROP_SPLIT_BOUNCE
 * Accent move: a deep drop with the chest lifted (never collapsed), hair
 * falls forward, one arm points to the sky on beat 4, split-bounce recover.
 */
const GIRL_DROP_SPLIT_BOUNCE: DanceMove = {
  id: 'GIRL_DROP_SPLIT_BOUNCE',
  name: 'Diva Signature — Drop & Split-Bounce',
  family: asDanceFamily('GLOBAL_PARTY'),
  origin: 'Club diva drop recoveries',
  energy: 0.9,
  tempoFit: [100, 165],
  defaultBars: 2,
  tags: ['floor', 'jump'],
  faceIntent: 'intense',
  tailCarriage: 'whip',
  accentMove: true,
  pose: (t, c) => {
    const e = env(c.moveProgress);
    const drop = Math.abs(Math.sin(c.halfP)); // 2-beat drop/recover cycle
    const deep = Math.pow(drop, 1.6); // sharp attack into the floor
    const point = beatWindow((c.quarterP / HALF_PI) % 4, 3.0, 2.5) * e;
    setBody(
      t,
      0,
      PELVIS_REST_Y - (0.16 + deep * 0.14) * e,
      0,
      0.02,
      -0.05,
      0,
      0,
      0.10,
      0,
      0,
      0.16 + c.mid * 0.09,
      0,
      0,
      1.05 + c.bass * 0.04,
      0.10 * deep,
      0,
      0,
      0.12 * deep + c.beatPulse * 0.06,
      0,
      0
    );
    // One arm points to the sky on beat 4, the other frames the knee
    setArms(
      t,
      -2.4 * point - 0.4, 0.3, 0.30 + point * 0.25, -0.35, 0.30, 0.4 + c.high * 0.15, 0.25,
      -0.30, -0.20, -0.25, -1.05, -0.35, 0.35 + c.high * 0.15, -0.20
    );
    // Wide split stance; knees track the drop depth
    setLegs(
      t,
      0.03, 0.03, -0.14, -0.14, 0.20, -0.20, 0.34, -0.34,
      (0.55 + deep * 0.35) * e, (0.55 + deep * 0.35) * e, 0.18, 0.18
    );
  },
};

'''

src = src[:dog_start] + GIRL_SECTION.rstrip() + "\n" + src[mouse_banner_start:]

# ---------------------------------------------------------------------------
# 2) SPECIES_FLAVOR record: DOG entry -> GIRL entry
# ---------------------------------------------------------------------------
old_record = """  DOG: {
    species: 'DOG',
    accentLayer: dogAccentLayer,
    signatureMoves: [
      DOG_ZOOMIES_CIRCLE_SPRINT,
      DOG_TAIL_CHASE_PIVOT,
      DOG_HOWL_UP_BASS_HOLD,
      DOG_PLAY_BOW_BHANGRA_BOUNCE,
      DOG_GOOD_BOY_STOMP_CLAP,
    ],
    persona: 'The Dog — hype, heavy-grooved, joyful',
  },"""
new_record = """  GIRL: {
    species: 'GIRL',
    accentLayer: girlAccentLayer,
    signatureMoves: [
      GIRL_GHOOMAR_SKIRT_FLARE,
      GIRL_HAIR_FLIP_WINDFALL,
      GIRL_RUNWAY_DIAMOND_STRUT,
      GIRL_BHARATANATYAM_DIVA_FUSION,
      GIRL_DROP_SPLIT_BOUNCE,
    ],
    persona: 'The Diva — smooth, expressive, magnetic',
  },"""
if old_record not in src:
    sys.exit("FATAL: SPECIES_FLAVOR DOG record not found verbatim")
src = src.replace(old_record, new_record)

# ---------------------------------------------------------------------------
# 3) applyHypeCrewResponsePose: GIRL branches + bar-parity variety
# ---------------------------------------------------------------------------
old_species = """  const crouchBase = species === 'DOG' ? 0.11 : species === 'CAT' ? 0.07 : 0.09;
  const bounceAmp = species === 'MOUSE' ? 0.045 : species === 'DOG' ? 0.035 : 0.020;"""
new_species = """  // V4: DOG retired; the diva grooves smooth and low
  const crouchBase = species === 'GIRL' ? 0.08 : species === 'CAT' ? 0.07 : 0.09;
  const bounceAmp = species === 'MOUSE' ? 0.045 : species === 'GIRL' ? 0.026 : 0.020;"""
if old_species not in src:
    sys.exit("FATAL: hype species lines not found")
src = src.replace(old_species, new_species)

old_arms = """  // Inner arm (toward soloist) extends in a supportive cypher point on hypePoint; outer arm grooves low
  const pointLeft = slotSideSign > 0 ? hypePoint : 0;
  const pointRight = slotSideSign < 0 ? hypePoint : 0;

  setArms(
    t,
    (-0.55 - 0.65 * pointLeft - 0.15 * Math.abs(s1)) * e,
    -0.28 * pointLeft,
    (0.26 - 0.12 * pointLeft) * e,
    (-1.05 + 0.70 * pointLeft) * e,
    0.20 * e,
    0.22 * s1 * e,
    0.15 * e,
    (-0.55 - 0.65 * pointRight - 0.15 * Math.abs(s1)) * e,
    0.28 * pointRight,
    (-0.26 + 0.12 * pointRight) * e,
    (-1.05 + 0.70 * pointRight) * e,
    -0.20 * e,
    -0.22 * s1 * e,
    -0.15 * e
  );"""
new_arms = """  // Inner arm (toward soloist) extends in a supportive cypher point on
  // hypePoint; outer arm grooves low.
  // V4 VARIETY: bar-parity alternation — even bars keep the classic cypher
  // point & low groove; odd bars lift BOTH hands into a raised wave. The
  // hype crew no longer loops one static pattern for a whole mode (the
  // "they just repeat the same move" complaint).
  const pointLeft = slotSideSign > 0 ? hypePoint : 0;
  const pointRight = slotSideSign < 0 ? hypePoint : 0;
  const barVar = Math.floor(ctx.moveBar) % 2;
  const upWave = barVar * e; // 0 on even bars, e on odd bars

  setArms(
    t,
    (-0.55 - 0.65 * pointLeft - 0.15 * Math.abs(s1) - 0.50 * upWave) * e,
    -0.28 * pointLeft + 0.20 * upWave,
    (0.26 - 0.12 * pointLeft + 0.28 * upWave) * e,
    (-1.05 + 0.70 * pointLeft + 0.55 * upWave) * e,
    0.20 * e,
    0.22 * s1 * e + 0.30 * upWave * Math.sin(ctx.p),
    0.15 * e,
    (-0.55 - 0.65 * pointRight - 0.15 * Math.abs(s1) - 0.50 * upWave) * e,
    0.28 * pointRight - 0.20 * upWave,
    (-0.26 + 0.12 * pointRight - 0.28 * upWave) * e,
    (-1.05 + 0.70 * pointRight + 0.55 * upWave) * e,
    -0.20 * e,
    -0.22 * s1 * e - 0.30 * upWave * Math.sin(ctx.p),
    -0.15 * e
  );"""
if old_arms not in src:
    sys.exit("FATAL: hype arms block not found verbatim")
src = src.replace(old_arms, new_arms)

open(PATH, "w", encoding="utf-8").write(src)

# verification
final = open(PATH, encoding="utf-8").read()
checks = {
    "GIRL_ signature moves": len(re.findall(r"const GIRL_\w+: DanceMove", final)),
    "girlAccentLayer defs": final.count("function girlAccentLayer"),
    "DOG_ leftovers": len(re.findall(r"\bDOG_\w+", final)),
    "dogAccentLayer leftovers": final.count("dogAccentLayer"),
    "'DOG' string leftovers": final.count("'DOG'"),
    "barVar present": final.count("barVar"),
}
print("PATCH OK", orig_len, "->", len(final))
for k, v in checks.items():
    print(f"  {k}: {v}")
