#!/usr/bin/env python3
"""Grand Choreographer integration: surgical edits to ProceduralDancingCat.tsx
and ProceduralClubStage.tsx. Every replacement uses exact anchors and asserts
success — the script fails loudly instead of corrupting files."""

import sys

CAT = "/home/z/my-project/src/components/ProceduralDancingCat.tsx"
STAGE = "/home/z/my-project/src/components/ProceduralClubStage.tsx"


def replace(content: str, old: str, new: str, label: str) -> str:
    if old not in content:
        print(f"FAIL [{label}]: anchor not found")
        sys.exit(1)
    if content.count(old) != 1:
        print(f"FAIL [{label}]: anchor not unique ({content.count(old)} matches)")
        sys.exit(1)
    print(f"OK   [{label}]")
    return content.replace(old, new, 1)


def cut_between(content: str, start_anchor: str, end_anchor: str, label: str,
                replacement: str) -> str:
    """Replace [start of start_anchor, start of end_anchor) with replacement."""
    i = content.find(start_anchor)
    if i < 0:
        print(f"FAIL [{label}]: start anchor not found")
        sys.exit(1)
    j = content.find(end_anchor, i)
    if j < 0:
        print(f"FAIL [{label}]: end anchor not found")
        sys.exit(1)
    print(f"OK   [{label}] ({j - i} chars replaced)")
    return content[:i] + replacement + content[j:]


# ============================================================================
# 1. PROCEDURAL DANCING CAT
# ============================================================================
with open(CAT, "r", encoding="utf-8") as f:
    cat = f.read()

# --- R1a: add lib imports after three.js import ---
cat = replace(
    cat,
    "import * as THREE from 'three';\n",
    """import * as THREE from 'three';
import {
  FACE_INTENT_OVERRIDES,
  TAIL_CARRIAGE_OFFSETS,
  type JointTargets,
} from '@/lib/danceMoves';
import { choreographer, beatClock } from '@/lib/danceRuntime';
import {
  mapStyleToFamily,
  DANCE_STYLE_PILLS,
  type DanceStyle,
} from '@/lib/danceStyleMapping';
""",
    "cat: imports",
)

# --- R1b: replace local DanceStyle union with re-export ---
cat = replace(
    cat,
    """export type DanceStyle =
  | 'AUTO'
  | 'IDLE'
  | 'HIP_HOP_GROOVE'
  | 'MELBOURNE_SHUFFLE'
  | 'DISCO_FUNK'
  | 'BASS_DROP_BREAKDANCE';
""",
    "export type { DanceStyle };\n",
    "cat: DanceStyle re-export",
)

# --- R2: remove local JointTargets interface (now imported from lib) ---
i = cat.find("interface JointTargets {")
if i < 0:
    print("FAIL [cat: JointTargets removal]: interface not found")
    sys.exit(1)
j = cat.find("function createInitialTargets()", i)
if j < 0:
    print("FAIL [cat: JointTargets removal]: createInitialTargets not found")
    sys.exit(1)
cat = cat[:i] + cat[j:]
print("OK   [cat: local JointTargets interface removed]")

# --- R3: engineRef — replace stale style fields with intent-blend state ---
cat = replace(
    cat,
    """    currentStyle: 'IDLE' as Exclude<DanceStyle, 'AUTO'>,
    lastReportedStyle: 'IDLE',""",
    """    lastReportedStyle: '',
    // Grand Choreographer blend state: damped toward the active move's face
    // intent + tail carriage so move switches never snap the expression.
    faceJawBias: 0,
    facePupilBias: 0,
    faceEarPitch: 0,
    faceEarRoll: 0,
    faceVisorDrop: 0,
    tailBasePitch: 0.15,
    tailCurl: 0.05,
    tailAmpScale: 1.0,
    tailSpeedScale: 1.0,""",
    "cat: engineRef blend state",
)

# --- R4: phase advance + beat handling (remove engine-level spin, add clock) ---
cat = replace(
    cat,
    """    // Advance continuous phase accumulators
    eng.phase += omega * dt;
    eng.tailPhase += omega * (0.75 + overall * 0.85) * dt;

    // Handle beat transient impulse
    if (isBeat && elapsed - eng.lastBeatTime > 0.18) {
      eng.lastBeatTime = elapsed;
      eng.beatCount += 1;
      eng.beatPulse = 1.0;

      // Trigger 360-degree mid-air spin every 4 beats during BASS_DROP_BREAKDANCE
      if (
        eng.currentStyle === 'BASS_DROP_BREAKDANCE' &&
        eng.beatCount % 4 === 0
      ) {
        eng.spinTargetY += Math.PI * 2;
      }
    } else {
      eng.beatPulse = THREE.MathUtils.damp(eng.beatPulse, 0, 11, dt);
    }
""",
    """    // Advance continuous phase accumulators (tail speed scaled by the active
    // move's carriage blend — a one-frame lag is imperceptible)
    eng.phase += omega * dt;
    eng.tailPhase += omega * (0.75 + overall * 0.85) * eng.tailSpeedScale * dt;

    // Handle beat transient impulse (360-degree spins are now requested by
    // individual moves through ctx.requestSpin, not by the engine state)
    if (isBeat && elapsed - eng.lastBeatTime > 0.18) {
      eng.lastBeatTime = elapsed;
      eng.beatCount += 1;
      eng.beatPulse = 1.0;
    } else {
      eng.beatPulse = THREE.MathUtils.damp(eng.beatPulse, 0, 11, dt);
    }

    // Publish the shared musical clock so the stage camera sequencer cuts on
    // exactly the bar boundaries the cat dances to (single writer, many readers)
    beatClock.phase = eng.phase;
    beatClock.beatCount = eng.beatCount;
""",
    "cat: phase/beat handling",
)

# --- R5: delete the old 5-state machine ---
cut_from = "    // 2. DETERMINE ACTIVE DANCE STYLE (STATE MACHINE)"
cut_to = "    // 3. RESET BASELINE TARGETS BEFORE STYLE LAYERING"
cat = cut_between(cat, cut_from, cut_to, "cat: state machine deleted", "")

# --- R6: drop unused halfP/quarterP (style branches are gone) ---
cat = replace(
    cat,
    """    const p = eng.phase;
    const halfP = p * 0.5; // 2-beat groove cycle
    const quarterP = p * 0.25; // 4-beat bar cycle
""",
    """    const p = eng.phase; // continuous beat phase (2*PI per beat)
""",
    "cat: phase aliases",
)

# --- R7: replace the 5 style branches with the choreographer integration ---
CHOREO_BLOCK = """    // ------------------------------------------------------------------------
    // 3.5 GRAND CHOREOGRAPHER — 42-move non-repetitive sequencer
    //     (hard 4-bar hold cap, bar-boundary switches, 6-move recency window,
    //      energy matching, 0.25 s pose crossfade, seeded per-song RNG —
    //      the "same move for a whole minute" problem is now impossible)
    // ------------------------------------------------------------------------
    choreographer.setFamily(mapStyleToFamily(hudStyle));
    choreographer.update(metrics, eng.beatCount, eng.phase, dt, elapsed);
    choreographer.applyPose(t);

    // Feed spin requests from spin moves (Kathak Chakkar, Ghoomar, Dandiya,
    // B-Boy freeze hops, legacy bass-drop 360s) into the yaw accumulator.
    const spinDelta = choreographer.consumePendingSpin();
    if (spinDelta !== 0) {
      eng.spinTargetY += spinDelta;
    }
    t.rootRotY = eng.spinTargetY; // engine-owned channel

    const activeMove = choreographer.getActiveMove();
    const highEnergy = activeMove.energy > 0.88;

    if (showHud && eng.lastReportedStyle !== activeMove.id) {
      eng.lastReportedStyle = activeMove.id;
      setActiveStateLabel(activeMove.name);
    }

    // Damp-blend the move's face intent onto the engine face layer so move
    // transitions flow instead of snapping (Kathakali fierce vs Odissi serene)
    const faceOv = activeMove.faceIntent
      ? FACE_INTENT_OVERRIDES[activeMove.faceIntent]
      : null;
    eng.faceJawBias = THREE.MathUtils.damp(
      eng.faceJawBias,
      faceOv ? faceOv.jawBias : 0,
      6,
      dt
    );
    eng.facePupilBias = THREE.MathUtils.damp(
      eng.facePupilBias,
      faceOv ? faceOv.pupilBias : 0,
      6,
      dt
    );
    eng.faceEarPitch = THREE.MathUtils.damp(
      eng.faceEarPitch,
      faceOv ? faceOv.earPitch : 0,
      6,
      dt
    );
    eng.faceEarRoll = THREE.MathUtils.damp(
      eng.faceEarRoll,
      faceOv ? faceOv.earRoll : 0,
      6,
      dt
    );
    eng.faceVisorDrop = THREE.MathUtils.damp(
      eng.faceVisorDrop,
      faceOv ? faceOv.visorDrop : 0,
      6,
      dt
    );

    // Damp-blend the move's tail carriage (Bhangra proud-high vs Odissi curled)
    const tailOv = activeMove.tailCarriage
      ? TAIL_CARRIAGE_OFFSETS[activeMove.tailCarriage]
      : null;
    eng.tailBasePitch = THREE.MathUtils.damp(
      eng.tailBasePitch,
      tailOv ? tailOv.basePitch : 0.15,
      5,
      dt
    );
    eng.tailCurl = THREE.MathUtils.damp(
      eng.tailCurl,
      tailOv ? tailOv.curlAdd : 0.05,
      5,
      dt
    );
    eng.tailAmpScale = THREE.MathUtils.damp(
      eng.tailAmpScale,
      tailOv ? tailOv.waveAmpScale : 1.0,
      5,
      dt
    );
    eng.tailSpeedScale = THREE.MathUtils.damp(
      eng.tailSpeedScale,
      tailOv ? tailOv.waveSpeedScale : 1.0,
      5,
      dt
    );

"""
cut_from = "    // ------------------------------------------------------------------------\n    // STATE 0: IDLE (Breathing, subtle weight shift, relaxed posture)"
cut_to = "    // ------------------------------------------------------------------------\n    // 4. EXPRESSIVE HEAD DETAILS: JAW, EARS, EYES, WHISKERS, VISOR"
cat = cut_between(cat, cut_from, cut_to, "cat: 5 style branches -> choreographer", CHOREO_BLOCK)

# --- R8: face layer — intent-driven ---
cat = replace(
    cat,
    """    // Jaw opens on heavy bass drops and breakdance state
    const bassDropJaw =
      resolvedStyle === 'BASS_DROP_BREAKDANCE'
        ? 0.48 + bass * 0.38
        : bass > 0.55
        ? (bass - 0.5) * 1.1
        : 0.05 + mid * 0.12;
    t.jawX = THREE.MathUtils.clamp(bassDropJaw, 0.04, 0.85);

    // Pupils dilate on bass drops
    t.pupilScale =
      1.0 +
      bass * 0.42 +
      (resolvedStyle === 'BASS_DROP_BREAKDANCE' ? 0.18 : 0);""",
    """    // Jaw opens on heavy bass drops + high-energy moves, shaped by the
    // active move's face intent (intense/fierce wider, serene softer)
    const bassDropJaw =
      highEnergy
        ? 0.48 + bass * 0.38 + eng.faceJawBias * 0.6
        : bass > 0.55
        ? (bass - 0.5) * 1.1 + eng.faceJawBias * 0.6
        : 0.05 + mid * 0.12 + eng.faceJawBias * 0.6;
    t.jawX = THREE.MathUtils.clamp(bassDropJaw, 0.04, 0.85);

    // Pupils dilate on bass drops; joyful widens, fierce narrows
    t.pupilScale =
      1.0 + bass * 0.42 + eng.facePupilBias + (highEnergy ? 0.18 : 0);""",
    "cat: jaw + pupils",
)

cat = replace(
    cat,
    """    const foldBack =
      resolvedStyle === 'BASS_DROP_BREAKDANCE' ? 0.32 : bass * 0.18;
    t.earLX = -foldBack - eng.earTwitchL * 0.5;
    t.earLZ = 0.18 + eng.earTwitchL + high * 0.22;
    t.earRX = -foldBack - eng.earTwitchR * 0.5;
    t.earRZ = -0.18 - eng.earTwitchR - high * 0.22;""",
    """    const foldBack =
      (highEnergy ? 0.32 : bass * 0.18) - eng.faceEarPitch * 0.5;
    t.earLX = -foldBack - eng.earTwitchL * 0.5;
    t.earLZ = 0.18 + eng.earTwitchL + high * 0.22 + eng.faceEarRoll;
    t.earRX = -foldBack - eng.earTwitchR * 0.5;
    t.earRZ = -0.18 - eng.earTwitchR - high * 0.22 - eng.faceEarRoll;""",
    "cat: ears intent blend",
)

cat = replace(
    cat,
    """    const shouldVisorFlipDown =
      visorDown || resolvedStyle === 'BASS_DROP_BREAKDANCE';""",
    """    const shouldVisorFlipDown =
      visorDown || highEnergy || eng.faceVisorDrop >= 0.8;""",
    "cat: visor intent",
)

# --- R9: tail section — carriage-driven ---
cat = replace(
    cat,
    """    const tailAmp =
      0.14 +
      overall * 0.28 +
      (resolvedStyle === 'BASS_DROP_BREAKDANCE' ? 0.16 : 0);""",
    """    const tailAmp =
      (0.14 + overall * 0.28 + (highEnergy ? 0.16 : 0)) * eng.tailAmpScale;""",
    "cat: tailAmp carriage",
)

cat = replace(
    cat,
    """      const waveAngleX =
        (i === 0 ? 0.42 : 0.12) +
        tailAmp * 0.45 * Math.cos(eng.tailPhase * 0.5 - i * 0.55);""",
    """      const waveAngleX =
        (i === 0 ? 0.42 : 0.12) +
        eng.tailBasePitch * (i === 0 ? 1.0 : 0.55) +
        eng.tailCurl * (0.3 + i * 0.18) +
        tailAmp * 0.45 * Math.cos(eng.tailPhase * 0.5 - i * 0.55);""",
    "cat: tail carriage base pose",
)

# --- R10: emissives — family-driven palettes ---
cat = replace(
    cat,
    """    if (resolvedStyle === 'BASS_DROP_BREAKDANCE') {
      _scratchColorA.copy(_neonMagenta).lerp(_neonCyan, Math.sin(p) * 0.5 + 0.5);
    } else if (resolvedStyle === 'DISCO_FUNK') {
      _scratchColorA.copy(_neonGold).lerp(_neonMagenta, mid);
    } else if (resolvedStyle === 'MELBOURNE_SHUFFLE') {
      _scratchColorA.copy(_neonLime).lerp(_neonCyan, high);
    } else {
      _scratchColorA.copy(_neonCyan).lerp(_neonMagenta, bass * 0.65);
    }""",
    """    const fam = activeMove.family;
    if (fam === 'BREAKDANCE') {
      _scratchColorA.copy(_neonMagenta).lerp(_neonCyan, Math.sin(p) * 0.5 + 0.5);
    } else if (fam === 'DISCO_FUNK') {
      _scratchColorA.copy(_neonGold).lerp(_neonMagenta, mid);
    } else if (fam === 'SHUFFLE') {
      _scratchColorA.copy(_neonLime).lerp(_neonCyan, high);
    } else if (fam === 'INDIAN_CLASSICAL') {
      // Temple-gold <-> cyan strobe for classical adavus
      _scratchColorA.copy(_neonGold).lerp(_neonCyan, Math.sin(p) * 0.5 + 0.5);
    } else if (fam === 'INDIAN_FOLK') {
      // Festive lime <-> magenta for Bhangra / Garba / Lavani
      _scratchColorA.copy(_neonLime).lerp(_neonMagenta, Math.sin(p) * 0.5 + 0.5);
    } else if (fam === 'BOLLYWOOD') {
      // Filmi magenta <-> gold glamour
      _scratchColorA.copy(_neonMagenta).lerp(_neonGold, mid);
    } else {
      _scratchColorA.copy(_neonCyan).lerp(_neonMagenta, bass * 0.65);
    }""",
    "cat: emissive family palettes",
)

cat = replace(
    cat,
    """      0.9 +
      bass * 2.8 +
      eng.beatPulse * 1.4 +
      (resolvedStyle === 'BASS_DROP_BREAKDANCE' ? 1.2 : 0);""",
    """      0.9 + bass * 2.8 + eng.beatPulse * 1.4 + (highEnergy ? 1.2 : 0);""",
    "cat: emissive intensity",
)

# --- R11: interactive HUD pills -> full 10-family deck ---
cat = replace(
    cat,
    """              {(
                [
                  ['AUTO', 'Auto AI-Free'],
                  ['IDLE', '0: Idle'],
                  ['HIP_HOP_GROOVE', '1: Groove'],
                  ['MELBOURNE_SHUFFLE', '2: Shuffle'],
                  ['DISCO_FUNK', '3: Disco'],
                  ['BASS_DROP_BREAKDANCE', '4: BassDrop'],
                ] as [DanceStyle, string][]
              ).map(([styleKey, label]) => (
                <button
                  key={styleKey}
                  onClick={() => setHudStyle(styleKey)}
                  style={{
                    background:
                      hudStyle === styleKey
                        ? 'linear-gradient(135deg, #00f5ff, #0088ff)'
                        : 'rgba(255,255,255,0.07)',
                    color: hudStyle === styleKey ? '#050811' : '#d6e2ff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}""",
    """              {DANCE_STYLE_PILLS.map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setHudStyle(pill.id)}
                  style={{
                    background:
                      hudStyle === pill.id
                        ? 'linear-gradient(135deg, #00f5ff, #0088ff)'
                        : 'rgba(255,255,255,0.07)',
                    color: hudStyle === pill.id ? '#050811' : '#d6e2ff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {pill.label}
                </button>
              ))}""",
    "cat: HUD pills",
)

cat = replace(
    cat,
    "                gridTemplateColumns: 'repeat(3, 1fr)',",
    "                gridTemplateColumns: 'repeat(2, 1fr)',",
    "cat: HUD grid",
)

with open(CAT, "w", encoding="utf-8") as f:
    f.write(cat)
print(f"\nCAT WRITTEN: {len(cat)} bytes")

# ============================================================================
# 2. PROCEDURAL CLUB STAGE — camera sequencer integration
# ============================================================================
with open(STAGE, "r", encoding="utf-8") as f:
    stage = f.read()

stage = replace(
    stage,
    "import type { AudioMetrics } from './ProceduralDancingCat';\n",
    """import type { AudioMetrics } from './ProceduralDancingCat';
import { cameraSequencer, beatClock } from '@/lib/danceRuntime';
""",
    "stage: imports",
)

# Drop now-unused module camera scratch vectors
stage = replace(
    stage,
    """const _violet = new THREE.Color('#7b2cbf');
const _camPosTarget = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3(0, 0.95, 0);
""",
    """const _violet = new THREE.Color('#7b2cbf');
""",
    "stage: scratch vectors",
)

stage = replace(
    stage,
    """  const stageState = useRef({
    beatCounter: 0,
    lastBeatFlag: false,
    ripplePhase: 0,
    activeDynamicCamIdx: 0,
  });""",
    """  const stageState = useRef({
    beatCounter: 0,
    lastBeatFlag: false,
    ripplePhase: 0,
  });""",
    "stage: stageState",
)

stage = replace(
    stage,
    """    const st = stageState.current;
    if (isBeat && !st.lastBeatFlag) {
      st.beatCounter++;
      if (st.beatCounter % 8 === 0) {
        st.activeDynamicCamIdx = (st.activeDynamicCamIdx + 1) % 3;
      }
    }
    st.lastBeatFlag = isBeat;

    const omega = ((bpm || 128) / 60) * Math.PI * 2;
    st.ripplePhase += dt * (2.5 + bass * 6.0);""",
    """    const st = stageState.current;
    if (isBeat && !st.lastBeatFlag) {
      st.beatCounter++;
    }
    st.lastBeatFlag = isBeat;

    st.ripplePhase += dt * (2.5 + bass * 6.0);""",
    "stage: beat counter",
)

# Replace section 5 camera director with the 16-shot sequencer
cam_start = "    // ------------------------------------------------------------------------\n    // 5. BEAT-REACTIVE CAMERA DIRECTOR"
cam_end = "  });\n\n  // Helper to render one Subwoofer Stack"
CAM_BLOCK = """    // ------------------------------------------------------------------------
    // 5. CINEMATIC CAMERA DIRECTOR — 16-shot music-video sequencer
    //    (bar-boundary hard cuts, bass-drop crash cuts, per-shot FOV punch &
    //     Dutch roll biases; ORBIT stays 100% user-owned & untouched)
    // ------------------------------------------------------------------------
    const perspCam = camera as THREE.PerspectiveCamera;
    if (cameraMode === 'ORBIT') {
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
        controlsRef.current.update();
      }
    } else {
      if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }
      cameraSequencer.updateAndApply(
        perspCam,
        cameraMode,
        metrics,
        st.beatCounter,
        beatClock.phase,
        dt,
        elapsed
      );
    }
"""
stage = cut_between(stage, cam_start, cam_end, "stage: camera director -> sequencer", CAM_BLOCK)

with open(STAGE, "w", encoding="utf-8") as f:
    f.write(stage)
print(f"STAGE WRITTEN: {len(stage)} bytes")

# ============================================================================
# 3. FINAL SANITY CHECKS
# ============================================================================
for path in (CAT, STAGE):
    src = open(path).read()
    assert "resolvedStyle" not in src, f"{path}: stale resolvedStyle reference!"
    assert "currentStyle" not in src or path == STAGE, f"{path}: stale currentStyle!"
print("\nALL INTEGRATION EDITS APPLIED CLEANLY")
