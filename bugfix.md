# BUGFIX LOG — Dance Cat 3D (V1 integration + V1.5 "Wide & Smooth + MP4")
Format: ID · severity · component · symptom · root cause · fix · verification.
Bugs are listed in discovery order. "Package bug" = defect in the externally
AI-generated grand_choreographer_package; "Integration bug" = mismatch surfaced
while wiring it into the live engine; "Pre-existing" = older latent issue;
"V1.5" = found & fixed during the V1.5 pass from user feedback.

---

## BF-01 — Package bug · HIGH · choreographer.ts
**Symptom:** At every move transition the cat would briefly "power dip" toward
a neutral standing pose before the next move ramped up — a soft, mushy look on
every single switch (up to ~24 dips per minute at 128 BPM).
**Root cause:** During the 0.25 s crossfade, `applyPose()` re-evaluated the
OUTGOING move with `ctx.moveProgress = Math.min(1.0, moveBar / plannedHoldBars)`.
Once the outgoing move passed its planned lifetime, progress clamped to 1.0,
and the shared `env()` envelope returns `0` at progress 1.0 — so the outgoing
pose collapsed to neutral *in the middle of the blend* instead of holding.
**Fix:** Clamp the outgoing move's progress to `0.849` (just inside `env()`'s
flat full-energy region) so the outgoing pose holds at 100% amplitude while
the incoming move ramps in. One-line change + comment in `applyPose()`.
**Verification:** Reasoned through `env()` boundaries (0.15 entry / 0.85 exit);
headless run showed continuous energy across the Chakkar → Dhamaal transition.

## BF-02 — Package bug · MEDIUM · danceMoves.ts (LEGACY_BASS_DROP_BREAKDANCE)
**Symptom:** The original engine's signature flourish — a full 360° mid-air
spin every 4 beats during Bass-Drop Breakdance — silently disappeared in the
"verbatim legacy refactor", making the flagship high-energy state feel flatter
than V0.
**Root cause:** The old engine triggered the spin at the state level
(`eng.spinTargetY += 2π` when `currentStyle === 'BASS_DROP_BREAKDANCE' &&
beatCount % 4 === 0`). The refactor moved style logic into moves but never
ported that trigger, and the new move body contains no `requestSpin` call.
**Fix:** Restored as a move-level call at the top of the pose function:
`if (c.isBeat && c.beatCount % 4 === 0) c.requestSpin(Math.PI * 2);` — now
routed through the choreographer's spin accumulator like Chakkar/Ghoomar.
**Verification:** Code path identical to KATHAK_CHAKKAR_SPIN which was
browser-verified spinning in earlier testing.

## BF-03 — Package bug · MEDIUM · cameraShots.ts (fixed presets)
**Symptom (latent):** Switching from a fixed preset (FRONT_STAGE/HERO_LOW/
DJ_OVERHEAD) to DYNAMIC_AUTO could compute a huge stale `shotBeat` and an
uninitialized-feeling first shot.
**Root cause:** `shotStartPhase`/`lastShotIntBar` are only reset inside
`cutToShot()`; while a fixed preset is active they go stale.
**Fix (free behavior):** Actually acceptable-by-design — on DYNAMIC_AUTO
re-entry the stale `intBar > lastShotIntBar` check forces an immediate fresh
`cutToShot()`, which snaps the camera to a proper new shot on beat 1. Verified
in browser: enabling Auto Director immediately showed "90s Hype Floor Fisheye",
then cut to "Crash-Zoom Beat Punch". Documented here so future work knows it
is intentional; no code change needed.

## BF-04 — Integration bug · HIGH · ProceduralDancingCat.tsx
**Symptom:** `npm run build` failed: "Object literal may only specify known
properties, and 'jawX' does not exist in type 'JointTargets'".
**Root cause:** The lib's `JointTargets` (correctly) excludes engine-owned face
channels (jaw/ears/pupils/visor), but the cat's `createInitialTargets()` still
initialized them, and the local interface had been deleted in favor of the lib
import.
**Fix:** Introduced `CatJointTargets extends JointTargets` adding the 8
face channels; `createInitialTargets(): CatJointTargets`. Structural superset
flows into `choreographer.applyPose(t: JointTargets)` unchanged.
**Verification:** Clean build, zero TS errors.

## BF-05 — Integration bug · MEDIUM · ProceduralClubStage.tsx
**Symptom (prevented):** The stage had no access to the cat's accumulated beat
phase, but the camera sequencer cuts on bar boundaries derived from `phase`.
**Root cause:** Two separate `useFrame` subscribers each integrating their own
phase would drift apart (and double-advance if shared naïvely).
**Fix:** Created `src/lib/danceRuntime.ts` with a module-scope `beatClock`
singleton. The cat is the SINGLE WRITER (publishes `eng.phase`/`eng.beatCount`
each frame); the stage only reads. One-frame read lag (~16 ms) is invisible
for camera work.
**Verification:** Bar-boundary camera cuts observed in browser.

## BF-06 — Integration bug · LOW · page.tsx / danceStyleMapping.ts
**Symptom (prevented):** Package integration snippet imported the choreographer
from `@/components/DancingCat` — a file that does not exist in this codebase —
and the 2D HUD polling snippet was written as a separate rAF loop, violating
the app's "ONE rAF loop for all DOM HUD updates" convention.
**Root cause:** The external AI had to guess integration points it could not
see.
**Fix:** Singletons exported from `src/lib/danceRuntime.ts`; move/shot/timer
readouts merged into the page's EXISTING rAF loop with change-gated
`textContent` writes.
**Verification:** "Now dancing" readout updates only on move change; no extra
rAF loops (grep-verified one `requestAnimationFrame` loop in page.tsx).

## BF-07 — Pre-existing · LOW · three.js deprecation warnings
**Symptom:** Console shows `THREE.Clock has been deprecated` and
`PCFSoftShadowMap has been removed` warnings.
**Root cause:** React Three Fiber 9.8.1 internals + `<Canvas shadows>` default
against three 0.186 — upstream, not app code.
**Status:** Cosmetic only; ignored for V1. Revisit when R3F publishes a fix.

## BF-08 — Environment note · INFO · headless verification timing
**Symptom:** In the headless test environment the move readout appeared to
hold the same move for ~20+ wall-clock seconds, initially looking like the
anti-repetition fix was not working.
**Root cause:** Software WebGL renders at ~3 FPS, and the engine clamps
`dt = min(rawDelta, 0.1)` — so engine time advances at ~0.3× wall time and a
4-bar hold (~7.5 s at 128 BPM) stretches to ~25 wall seconds.
**Verification:** t1 "Chakkar" → t3 "Dhamaal" transitions confirmed the
sequencer switches within the expected *engine-time* budget; real 60 FPS
browsers run real-time. No code change.

---

# V1.5 FIXES (from user feedback: over-zoom, shake-on-pull-back, corrupted
# WebM, cat model, general polish)

## BF-09 — V1.5 · HIGH · cameraShots.ts — auto director zooms in too much
**Symptom:** User: "auto director do too zoom in… i want some zoom out by
default, zoom out look so cool."
**Root cause (4 compounding factors):** (1) base FOV 42 is a tight portrait
focal length; (2) the beat-reactive FOV punch subtracted up to
`bass*4.5 + 1.8` degrees, collapsing to ~35° on every bass hit; (3) most
shots sat 2.0–3.9 m from a ~1.9 m cat, so it filled the frame; (4) the
Dutch roll wobbled at ±0.11+0.06 rad continuously, adding a dizzy sway on
top of the tight framing.
**Fix:** Base FOV 42→50 with hard clamp [46, 62]; FOV punch halved to
`bass*2.2 + 0.9`; all 16 shots re-tuned 25–40% further back (full-body shots
now 3.1–5.2 m, wide establishing 5.4 m); FACE_CLOSEUP made rarer
(energyFit [0.10,0.75]→[0.15,0.55]) and pulled to 2.55 m; Dutch roll halved
and slowed (2.5→1.7 rad/s); 3 NEW wide shots (WIDE_ESTABLISHING,
SLOW_PULL_BACK, HIGH_WIDE_DRIFT) with a `wide: true` +0.8 selection bonus;
default camera mode switched ORBIT→DYNAMIC_AUTO so the app opens on the
cinematic wide show; canvas default `fov 50 @ z 4.6`; ORBIT maxDistance
6.5→9.0; fog [6,16]→[9,22].
**Verification:** Vision analysis of load-state screenshot: cat occupies
~50–60% of frame height (V1: ~85–90%), full stage visible, no clipping.
Rotation sampling showed Wide Stage Establishing + High Wide Festival Drift
entering regular rotation. `cutToShot` also snaps `camera.fov` so hard cuts
change focal length instantly (no zoom smear).

## BF-10 — V1.5 · HIGH · cameraShots.ts — "camera shake too much when it goto back"
**Symptom:** User: "sometimes camera shake too much when it goto back."
**Root cause (2 parts):** (a) `beatPunch` was applied as a blind world-space
`pos.z -= punch` on EVERY beat. On rear-view shots (Over-the-Shoulder sits at
z ≈ −3) minus-Z pushes the camera AWAY from the cat — a 12–38 cm backward
jerk per beat that reads as violent shaking exactly when the camera is
behind the subject. (b) The handheld micro-shake used raw
`sin(elapsed*43)/cos(elapsed*57)` at full amplitude the instant bass crossed
0.65 — high-frequency strobing with no attack/decay.
**Fix:** (a) Punch is now DIRECTIONAL — a scratch vector from camera toward
the look-target, so every shot type gets a subtle dolly-thump toward the
subject instead of a world-axis shove; amplitudes cut ~50% (max 0.18).
(b) Shake amplitudes cut ~55%, frequencies lowered to 21/29 rad/s with slow
secondary sines (13.7/17.3) for organic drift, bass gate raised 0.65→0.75,
and wrapped in a damped envelope (`shakeEnv`, λ=5 ≈ 200 ms attack/decay) so
it fades in and out smoothly.
**Verification:** Code-path reasoning per shot (all 19 shots use the same
directional path); no backward-jerk geometry remains; browser run shows
smooth Over-the-Shoulder segments with zero console errors.

## BF-11 — V1.5 · HIGH · page.tsx — WebM exports read as "corrupted"
**Symptom:** User: "record records in webm, which gives corrupted — i want
better mp4."
**Root cause:** `MediaRecorder` WebM output omits the Segment→Info
**Duration** element (Chrome writes "unknown" because duration is only
known at stop). Many players (QuickTime, WhatsApp, Windows Photos, some
editors) display such files as broken/00:00/unseekable. V1 offered WebM
only.
**Fix:** MP4-first codec negotiation — `video/mp4;codecs=avc1.640028,mp4a.40.2`
→ `avc1.42E01E` → `video/mp4` (Chrome 126+ & Safari mux real MP4 with
complete moov/duration metadata) → WebM fallback (Firefox) where the blob is
post-processed with `webm-duration-fix` (`fixWebmBlob`, lazy-imported so it
stays out of the 2.5 MB initial bundle — 128 KB separate chunk). MP4 path
uses single-mux `start()` (no timeslice) for a clean moov atom; WebM keeps
500 ms chunks. Extension + user notice name the real format.
**Verification:** Headless Chrome: `video/mp4 => true`, REC start→stop
produced "Recording saved as .mp4 — check your downloads." with zero console
errors; chunk split confirmed in `out/_next/static/chunks/`.

## BF-12 — V1.5 · MEDIUM · page.tsx — canvas capture tracks leaked
**Symptom (latent):** Every V1 recording left the `canvas.captureStream()`
video track live after stop (recorder stop does not stop input tracks);
repeated recordings stacked live capture pipelines.
**Root cause:** `onstop` only assembled the blob — the stream tracks were
never stopped.
**Fix:** `onstop` stops all `videoStream` tracks; the constructor-failure
path also stops them; double-stop guarded via `state` check.
**Verification:** Code inspection + clean REC lifecycle in browser
(button returns to idle, repeated start/stop works).

## BF-13 — V1.5 · LOW · ProceduralDancingCat.tsx — chest never breathes
**Symptom (subtle):** Between beat-driven squash events the cat's chest was
perfectly static while moves held `chestScale` flat — the model felt
"frozen" in calm passages.
**Root cause:** No engine-owned baseline motion for `chestScale`; only bass
squash (pelvis) and move-authored values touched the torso.
**Fix:** Engine breathing layer after `applyPose`:
`chestScale += sin(elapsed·1.5)·0.012 + bass·0.05 + beatPulse·0.02`
(additive, so move-authored chest poses are preserved).
**Verification:** Continuous chest motion observed in all screenshots; no
interference with move poses (additive only, damped application unchanged).

## BF-14 — V1.5 · HIGH · cameraShots.ts + choreographer.ts — drop-trigger
saturation: crash cuts & accent-move floods on loud music
**Symptom:** Camera crash-cut between drop shots on nearly every bar and the
choreographer interrupted non-accent moves after 2 beats — frantic pacing,
far beyond "cut on the drop". (Contributes to the user's "too much
cutting/zoom" feel with real music, and to the demo beat's busy look.)
**Root cause:** Both systems gated drops on absolute `bass > 0.85` for 2
consecutive beats. Measured live on the demo synth (and typical of modern
mixed-to-zero music): the perceptual bass band pins at 0.91–1.0 on virtually
EVERY kick — so the condition was armed permanently, and the only thing
throttling cuts was shot-hold durations.
**Fix:** Drops are now an energy JUMP above the song's own slow baseline:
`energyBaseline` (exponential damp, τ≈1.4 s of `overall`) and
`isDropish = bass > 0.8 && overall > baseline + 0.055` sustained 2+ beats.
Camera adds phrase pacing: crash cuts need ≥4 beats into the current shot
AND ≥8 beats since the last crash cut (max one per 2 bars). Choreographer
uses the same signal (inline damp, lib stays THREE-free) for the accent
switch.
**Verification:** Live band sampling (B pinned 78–100%, overall jumps
~0.19 on real drop bars vs ~0.0 on steady bars) predicted exactly the
observed post-fix behavior: rotation sampling now shows Whip-Pan (once, at
the drop) → High Wide Festival Drift → Wide Stage Establishing, and moves
hold their planned 2–4 bars (Chakkar accent at drop → Dhamaal → B-Boy CCs
→ Jumpstyle), zero console errors.

---

## REGRESSION SAFETY NET (re-run after any future change)
1. `npm run build` — must stay 100% static, zero errors.
2. `npx eslint src --max-warnings 0` — must be silent.
3. Headless smoke via `scripts/browser_verify*.sh` — zero page errors, move
   readout rotates, REC toggles, ORBIT stays manual.
4. Pause the audio → cat must settle into IDLE breathing (never dances
   silently to nothing).

---

# V2.0 FIXES (2026-10-15)

## BF-15 — Cat sometimes dances the whole song facing the back (user report)
**Symptom:** Occasionally the cat turned to face the back wall and then kept
dancing facing away from the camera for the rest of the song.
**Root cause:** `Dandiya Raas` calls `ctx.requestSpin(Math.PI)` — a 180°
partner turn — on every 4th beat, intending to alternate front/back each
bar. But `eng.spinTargetY` is a plain accumulator: if the choreographer
switched moves right after a half-turn (4-bar cap, recency rotation, or an
accent-drop switch), the residue stayed at an odd multiple of π forever.
No mechanism ever returned the yaw to front.
**Fix — Reface Law (engine-level, zero move-library changes):**
1. Every move transition arms a 1.1 s `refaceTimer`.
2. Any spin request grants a 0.65 s `spinGrace` window so in-flight spins
   (entry 360s, Chakkar, Ghoomar) animate fully and are never cancelled —
   the wrap only strips WHOLE turns.
3. Once grace expires inside the reface window, `spinTargetY` wraps into
   (−π, π] (the live `root.rotation.y` shifts by the same whole turns, so
   nothing snaps) and damps to 0 (front) at λ=4 (~0.6 s settle).
4. Result: a dancer may only face away for as long as its ACTIVE move says
   so. Interrupted half-turns now finish into a smooth reface. Brief
   back-facing moments inside spin moves remain legal (user: "occasionally
   it is okay").
**Verification:** Trace of the accumulator math for all 5 spin-requesting
moves + interrupted-Dandiya scenario; headless run shows zero console
errors and the lead re-settling after forced family switches.

## BF-16 — MP4 exports still showed glitch / distortion (user report)
**Symptom:** V1.5's MP4 output played fine overall but contained occasional
torn frames and blocky/mushy distortion moments.
**Root causes (three, stacked):**
1. **Torn frames** — the WebGL canvas was captured without
   `preserveDrawingBuffer`, so Chrome's captureStream could tap a buffer
   that the compositor had already cleared.
2. **Macroblocking** — hi-DPI screens render the canvas at up to 2× CSS
   pixels (e.g. 3840×2160) while the H.264 encoder ran at 12 Mbps →
   starved bitrate on complex neon scenes.
3. **Frame pacing** — `captureStream(60)` hands the encoder duplicate /
   arbitrarily-dropped frames, producing stuttery motion artifacts.
**Fix — Recording V3:**
1. Canvas now always sets `gl.preserveDrawingBuffer: true`.
2. The Canvas `dpr` locks to exactly 1 for the whole recording (restored
   on stop); MP4 bitrate raised to 16 Mbps (WebM 12 Mbps).
3. `captureStream(0)` + one `requestFrame()` per rendered frame via a
   `<RecordFrameTap/>` inside the Canvas (feature-detected; falls back to
   `captureStream(60)` where requestFrame is unavailable) — every recorded
   frame is a complete composited frame and MediaRecorder handles the VFR
   timestamps.
**Verification:** REC lifecycle headless (start → REC 0:11 timer → stop →
button reset → zero console errors); DPR lock observed applying/restoring.

## BF-17 — Dancers would snap back to their LINE slot on unrelated re-renders
**Symptom (caught during V2 verification, pre-release):** Dragging the
volume slider while a multi-dancer crew was dancing in a non-LINE formation
would teleport every dancer back to their original LINE position for one
frame.
**Root cause:** `position={initialLineSlot(i, n)}` built a fresh array on
every page render; React re-applied the changed position prop to the
already-mounted slot groups.
**Fix:** Mount transforms are memoized per crew lineup
(`initialSlots = useMemo(..., [dancers])`) — stable references mean
unrelated re-renders never touch the dancers; only crew changes re-space
slots (intended).
**Verification:** Volume input interaction with 2 dancers in ARC
formation — no position snap, zero console errors.

## V2 AUDIT NOTES — grandshowdirector.zip (external AI package)
Audited clean and integrated as-is (with one adaptation): 14 stage looks,
showDirector (energy-matched rotation, drop hype crash-cuts, 2-bar palette
crossfade), 5 particle systems (614 instances, 5 draw calls, camera-safety
cylinder verified), crowd (52 bodies + 24 arms + 8 phones, 3 draw calls,
back-240° arc keeps the camera corridor clear), 8 bonus wide camera shots.
**Adaptation:** the appendix re-declared `CameraShot`/`CameraContext`
locally; replaced with `import type` from cameraShots.ts so merging the 8
shots into `CAMERA_SHOTS` (now 27) creates zero runtime import cycle.
Their integration snippet's `createCrowd.create(77701)` API is correct as
shipped. FX palette bridge (`syncParticleLookState`) wired per frame.

---

# V3.0 BUGFIXES

## BF-18 — Clicking the Dog crew chip froze the whole UI (runtime TypeError)
**Symptom (user-reported):** "when i click dog, then Cannot read properties
of null (reading 'rotation') at ProceduralDancingCat.tsx:1171 — and ui
freeze".
**Root cause:** The whisker meshes mount conditionally on
`preset.whiskers`, but the DOG preset has `whiskers: false` — so
`whiskerLRef` / `whiskerRRef` never attach and stay null. The useFrame
whisker-vibration block dereferenced them unconditionally every frame →
per-frame throw → React error overlay spam → frozen UI.
**Fix:** Null-guard the whisker block (mesh refs cached into locals,
block skipped when the species renders no whiskers). Full sweep confirmed
the other species-conditional meshes (tongue, buck teeth, inner-ear tufts)
are static — no refs — and the ear groups mount for ALL ear styles, so
this was the only crash site.
**Verification:** Live browser: dog added solo and in 2/3-dancer crews,
dancing for minutes, zero console errors.

## BF-19 — MP4 exports played "stuck / laggy" (variable frame rate)
**Symptom (user-reported):** "now rendered mp4 has less glitch and
desortion, but still its video stuck (like it feels laggy)".
**Root cause:** Recording V3 emitted one video frame per RENDERED frame
(`requestFrame()` inside every useFrame). The resulting MP4 carried
variable-frame-rate timestamps: whenever render fps dipped or jittered
(4-dancer crew, FX bursts, GC), frame timestamps bunched and players
showed stutter/freeze-frames.
**Fix (Recording V4):** fixed 30 fps CONSTANT frame rate capture — a
drift-compensated accumulator in RecordFrameTap fires `requestFrame()`
only when ≥ 33.33 ms have elapsed since the last capture (fixed-step
schedule — a late render never slides the grid), and a stall > 2 capture
periods (GC hitch / background tab) RESYNCS ahead instead of burst-capturing
stale frames. 30 fps at the same 16 Mbps doubles the per-frame bitrate
budget, and every player smooths CFR 30 video.
**Verification:** REC lifecycle headless (start → CFR timer → stop → clean
reset, zero console errors); accumulator logic unit-reviewed (first-frame
immediate capture on arm, grid advance, 2-frame stall resync).

## V3 AUDIT NOTES — group-dance-mega.zip (external AI package)
Audited 5 files (323 KB). Contracts (JointTargets 41 channels, MoveContext,
CameraShot/CameraContext) matched our engine exactly — integrated 4 modules:
32 duets / 18 formations / species flavor (15 signature moves + accents +
hype poses) / 16 group camera shots. **Four defects found + fixed:**
1. `constshrug` typo (missing space) in DUET_BHANGRA partner-slap poseA/poseB
   — would not compile. Fixed to `const shrug`.
2. **Solo-spot formation leak**: their `selectGroupFormation` without a
   requiredTag lets 'solo-spot' tagged formations (SOLO_SPOTLIGHT,
   CALL_RESPONSE_CYPHER) into the baseline FORMATION_GROUP rotation —
   observed live ("2 · Solo Spotlight · UNISON" while just dancing normally).
   Fixed: baseline calls exclude solo-spot formations.
3. **Spotlights could never fire** (their scheduling law): strict
   phraseIndex arithmetic (`phraseIndex === 2`) only matched transitions
   landing on 32-beat boundaries, which in simulation always coincided with
   the low-energy intro beat (overall 0.07 < 0.48 gate) — 480-beat offline
   simulation: 0 spotlights. Replaced with deterministic alternation
   (duet → formation → spotlight → …) + relaxed energy gates (duet ≥ 0.30,
   spotlight ≥ 0.35). Re-simulation: first duet @ beat 16, first spotlight
   @ beat 48, species rotate, 0 role-parity errors across n=2/3/4.
4. First special mode arrived too late (beat 144 ≈ 67 s) because initial
   FORMATION duration could roll 32 beats and transitions kept landing on
   phrase-0 boundaries. Fixed: first cycle is always 4 bars → first duet
   within ~10-20 s of song start.
**Offline verification harnesses** (scripts/test_group_machine.ts +
scripts/test_pose_path.ts): 4,032 duet pose evaluations (32 duets × both
partners × 63 context points), all 15 signature moves, all hype poses and
accent layers — zero physics-floor / anatomical-clamp / non-finite
violations; selectors deterministic with recency. Live browser: natural
"Garba-Raas — 2/4 Ektaal Sweep & Strike" duet fired and vision-verified
(cat + dog ~1 m apart, angled toward each other, hype mouse behind).

---

# V4.0 BUGFIXES

## BF-20 — MP4 exports broke on random seek in VLC (user report)
**Symptom (user):** "current mp4 plays, but when i open in vlc and play at
any other time stamp, it get frame get frezze, disort and flicker."
**Root cause:** MediaRecorder's H.264 track uses long browser-chosen GOPs
and a thin stss (sync-sample) table. Seeking to an arbitrary timestamp
lands mid-GOP, potentially seconds from the nearest IDR — the decoder then
freeze-frames, smears macroblocks and flickers until the next keyframe.
Start-to-end playback looked fine (CFR had fixed pacing in V3), which is
exactly why only seeking exposed it.
**Fix (Recording V5, src/lib/mp4Recorder.ts):** encode natively with
WebCodecs — VideoEncoder h264 with an EXPLICIT 1 s IDR GOP (keyFrame every
30 frames at 30 fps CFR, 16 Mbps), AudioEncoder fed by a new PCM tap
(audioEngine.attachPcmTap: AudioWorklet 'rec-pcm-tap' 4096-frame blocks,
ScriptProcessor fallback; AAC 192k -> Opus 160k fallback), muxed by
mp4-muxer (fastStart 'in-memory', firstTimestampBehavior 'offset') which
records every key chunk in stss. MediaRecorder kept as full fallback
(Firefox); REC button enables on VideoEncoder OR MediaRecorder.
**Verification:** live REC lifecycle in Chromium (start -> ticking timer ->
stop -> "Recording saved as .mp4" -> button reset, zero console errors);
the downloaded file inspected with ffprobe/ffmpeg: h264 avg_frame_rate
30/1, nb_frames 51 with I-frames at exactly 0 and 30 (the 1 s cadence),
and 5/5 random-timestamp seeks (-ss 1.3/3.7/5.2/7.9/9.4) decode clean.
Note: headless Chromium lacks an AAC encoder — the Opus fallback path was
exercised and produced valid audio; desktop Chrome negotiates AAC first.

## BF-21 — Crews "do not dance, they just repeat the same move" (user report)
**Symptom (user):** "in current V3, they do not dance, they just repete
same move!!"
**Root cause (found by 480-beat offline simulation of the V3 machine):**
specials chained BACK-TO-BACK — after a duet ended, the alternation logic
picked the next special immediately (duet -> spotlight -> duet ...), so the
baseline FORMATION_GROUP (where the non-repetitive 42-move sequencer lives)
almost never ran: measured 92% of show time inside authored fixed loops
(duet 224/480 + spotlight 217/480 beats), sequencer ~8%, and only 2
formations ever appeared. The V3 design comment SAID "FORMATION -> duet ->
FORMATION -> spotlight" but the implementation never inserted the
formation gaps.
**Fix (groupDance.ts):** a special NEVER chains into the next special — on
mode expiry it ALWAYS returns to FORMATION_GROUP (6-10 bar windows), and
the next special fires only after that passage. Re-simulation: sequencer
share 73%, specials 27%, 8 distinct formations, duets/spotlights still
rotate, 0 role-parity errors across n=2/3/4. Plus two enrichment layers:
spotlight soloists chain signature -> signatureAlt at the mode midpoint
(ChoreoState.signatureAlt, seeded +7 beats), and the hype-crew pose
alternates patterns by bar parity (cypher point <-> hands-up wave).

## BF-22 — REC timer never ticked on the WebCodecs path (found in V4 testing)
**Symptom:** during a V5 (WebCodecs) recording the HUD timer stayed
"REC 0:00" for the whole clip.
**Root cause:** the HUD rAF loop gated the timer on
`recorderRef.current` (MediaRecorder) — the V5 path stores its handle in
`mp4RecRef`, so the condition was never true.
**Fix:** the timer now runs on EITHER backend
(`recorderRef.current || mp4RecRef.current`). Live-verified: timer ticks
0:02 -> 0:09 across a 9 s WebCodecs recording.

## V4 INTEGRATION NOTES
- Dog retired per user request ("replace dog with a hot girl"); the Diva
  (GIRL) shares the exact animal skeleton (offsets, IK, damping), so all
  32 authored duets and the hype/spotlight system run on her unchanged.
  Her uniqueness: girlMoves.ts (25-move library) through a library-agnostic
  choreographer (config.moves), same seeds => her switch timing stays in
  sync with the animals in UNISON/CANON/MIRROR.
- New physics (all zero-allocation, pre-built sims): verlet cloth skirt
  (98 particles, ~420 constraints x3 relax, leg-capsule collision, spin
  flare + bass lift), verlet ponytail chain (7 particles), critically
  damped bust spring (k=170 c=19, max 2.4 cm).
- Regression harnesses updated to GIRL (test_group_machine.ts,
  test_pose_path.ts): all pose-path checks pass including the 5 girl
  signatures + accent layer (0 physics/clamp/finite violations).

## V5 BUGFIXES (Task ID 8 — V5.1 The Glamour Rebuild)

### BF-23 — Diva mount froze the whole page (rAF loop death)
**Symptom:** adding the Diva chip dropped the page to ~1 fps and even
`agent-browser` AX-tree queries timed out; her meshes existed (292) but the
world stopped.
**Root cause:** in DivaBody.simulate(), the spine lerp constants
(`bodyWavePitch`/`spineCounterYaw`/`spineCounterRoll`) dereferenced
`blendedPose!` and were computed UNCONDITIONALLY — before the
`input.external` branch. On the bridge path `blendedPose` is null, so every
120 Hz step threw `Cannot read properties of null (reading 'spinePitch')`,
killing the shared rAF loop (and every other character with it).
**Fix:** moved the three constants inside the non-external branch. Verified:
zero page errors, engine runs (figure_8_sway), sim loop 2.1 ms/frame.

### BF-24 — MP4 "little corrupted" (the user's report) — three stacked causes
**a) B-frame composition offsets (mp4Recorder.ts).** `latencyMode: 'quality'`
lets hardware encoders emit B-frames: decode order != presentation order.
We called `muxer.addVideoChunk(chunk, meta)` bare — mp4-muxer only writes
the ctts (composition-time) table when the caller passes the offset, so
reordered arrivals produced a corrupted stts/ctts → glitch frames on some
devices. **Fix:** reconstruct dts from the CFR arrival slot (k-th emitted
chunk decodes at k * frameDuration) and pass `compositionOffsetUs =
chunk.timestamp - dtsUs` explicitly. On B-frame-less encoders every offset
is 0 → bit-identical muxing to before.
**b) DPR-lock resize race (page.tsx).** The encoder was created from the
canvas size BEFORE `setRecDprLock(true)` resized it (2x → 1x on hi-DPI) —
encoder configured for the wrong dimensions = classic "plays but glitches".
**Fix:** lock DPR first, wait for the canvas size to settle across 2
consecutive animation frames (bounded 40-frame wait), then create the
recorder; release the lock if the WebCodecs path falls back.
**c) Mid-REC size drift (mp4Recorder.ts).** Window resize / zoom during
recording changed the live canvas size mid-stream. **Fix:** every capture
blit-scales through the scratch 2D canvas whenever the source size differs
from the encoder config.
**Verified:** live in-browser WebCodecs export captured (createObjectURL
hook), extracted and probed: h264 1280x576 30/1 CFR with exact 1/30 s
timestamps, keyframe-first GOP, Opus audio fallback (headless lacks AAC),
`ffmpeg -f null` decode clean + mid-file seek clean.

### BF-25 — THE SHATTERED SKIRT (skirt collapsed to the floor in 1 step)
**Symptom:** the DivaBody test route showed the flared skirt as a jagged
shattered mass around her ankles; offline repro: every waist-pinned particle
fell to the 0.020 m floor clamp within ONE update.
**Hunt:** section-bisected the collapse to `enforceMeridianStrainLimit`; an
A/B test (fresh sim vs byte-identical method copy) showed the original
collapses and the copy holds — meaning the file's real bytes differed from
what every tool DISPLAYED. Raw byte dump (`od -c`) proved it:
`pos[l3+1] = pos[u3] + dy*scale; pos[l3+2] = pos[u3] + dz*scale;` — the Y
and Z writes read the UPPER particle's X (u3) instead of u3+1/u3+2. The
wrong component made the "clamp to 6% strain" scale explode into a
teleport-to-upper-X + floor-clamp cascade.
**Root cause:** indexing bug shipped IN the AI package (verified against the
original zip bytes). Display tools rendered it as correct code because
`[u3` prefixes triggered ANSI-artifact swallowing in my read pipeline (same
class of artifact that faked a `constshrug` typo in V3).
**Fix:** `pos[u3+1]` / `pos[u3+2]`. Verified: hem holds 0.47-0.68 m over
4000 violent steps (spins, drops, teleports); live render = smooth flared
cone (VLM confirmed).
**Lesson recorded:** for byte-exact verification of AI-authored code, use
`od -c` / Python repr reads, never terminal-echo greps.

### BF-26 — Diva performance catastrophe (73.7 ms/frame in the sim loop)
**Symptom:** with the Diva mounted, the page ran at ~1 fps even after the
skirt fix.
**Causes found by timing probes (all fixed):**
1. `rig.root.updateWorldMatrix(true, true)` — full 292-object subtree walk
   TWICE per 120 Hz step (leg IK + hair solver). With the 8-step catch-up
   that is ~4700 matrix compositions per frame. **Fix:** the leg solver
   needs root+pelvis only; the hair solver needs root→pelvis→spine→
   headPivot→head — 5-bone chain updates instead of full subtree.
2. Soft-body garment rebuilds (torso/bodice/shorts/pelvis: ~10k anatomical
   surface evaluations + 6 geometry normal recomputes) ran at a fixed 60 Hz
   inside the 120 Hz sim = multiplied by the 8-step catch-up. The first
   dirty-check attempt failed (beat/bass forces keep the springs
   perpetually moving). **Fix:** moved the rebuilds to useFrame — once per
   render frame, 30 Hz cap, dirty-checked, and skipping the hidden intimate
   under-layer entirely (its meshes are never visible under the corset).
3. Bust-anchor surface evaluation loop removed (its detail meshes were cut
   in the tasteful-glamour pass — nothing read it).
4. `transmission: 0.85` diamond material (extra transparent render pass per
   frame) replaced with a metal-sparkle look.
**Result:** sim loop 73.7 ms → 2.1-3.4 ms per frame (~22x). Live-verified
via in-page timing probe (stripped before ship).

### BF-27 — "Plastic mannequin" material pass
**Symptom:** VLM judged the body 3/10 realism — "plastic/latex, no
subsurface scattering, helmet hair, flat vinyl corset".
**Fixes:**
- PMREM RoomEnvironment reflections on her PBR materials only (never
  scene.environment — the club art direction stays untouched), intensity
  tuned per family: skin 0.42, hair 0.70, corset 0.60, boots 0.90, gold
  1.10, crystal 1.30.
- Skin: normalScale 0.18 → 0.10, bumpScale 0.00016 → 0.0001, roughness
  0.48 → 0.53 (kills the pore-noise "scarring" read at distance).
- Palette: skin #d9a78e (less orange), lips #c23b52 (stronger couture rose),
  hair deep espresso with caramel balayage sheen.
- The DivaBody already ships procedural SSS albedo/thickness/roughness
  maps + attenuationColor — these only read correctly WITH the env map.
**Result (VLM, best-framed club burst):** "reads as an attractive glamorous
dancer — hourglass silhouette, wine + plum classic diva look, realistic
human proportions vs the stylized cat, no broken parts."

## V5 INTEGRATION NOTES
- Engine/body split: ProceduralDancingGirl.tsx = engine wrapper (choreo
  machine, damping, ExternalDivaPose bridge, DSP metrics feed);
  DivaBody.tsx = the AI's ultra-realistic body (audited, bridged, tastefully
  de-explicitized, perf-fixed, env-lit). The V4-era sculpted-body girl
  component is fully retired.
- MoveContext gained optional lowMid/highMid (the Diva face engine refines
  jaw/brow shaping with a 5-band split; every other consumer ignores them).
- DspAudioMetrics made mutable (hosts share one snapshot object through a
  ref, zero-allocation law).
- New regression harnesses: test_diva_bridge.ts (bridge semantics across
  51+32+10 pose paths), test_skirt_repro.ts (BF-25 before/after),
  test_skirt_old.ts (old-sim reference), test_skirt_table.ts (constraint
  table sanity).

## V6 BUGFIXES (Task ID 9 — V6.0 "Solo Diva Sequins")

### BF-28 — MP4 export played at 2x speed, last frame froze to pad the file (user report)
**Symptom:** a 2-minute recording produced a 2-minute file (audio intact) in
which the VIDEO track finished in ~1 minute at ~2x speed and then sat on the
last frame while the audio ran to the end.
**Root cause:** `onCapture` stamped every VideoFrame at
`frameIndex / fps` — synthetic CFR. The 30 fps capture grid PACES frames but
cannot GUARANTEE them: the backpressure guard (`encodeQueueSize > 10`)
dropped ticks, `latencyMode: 'quality'` hardware encoders buffer frames in
lookahead queues, and any rAF stall (GC / occlusion / heavy 4-dancer scene)
skipped ticks. Every dropped tick compressed the video timeline by one frame
slot while the audio track (sample-count timestamps, real-time by physics)
kept the true clock — half the ticks dropped = exactly the reported 2x.
The container duration comes from the longest track (audio), so the video
froze on its last frame to fill the remainder.
**Fixes (mp4Recorder.ts):**
1. REAL-TIME TIMESTAMPS: every frame is stamped with
   `performance.now() - t0` (strictly increasing, µs). Video duration now
   always equals audio duration equals wall clock; a dropped tick just means
   that frame is absent (VFR), never a speed-up.
2. Reorder-safe dts (keeps BF-24a's B-frame safety): encoded chunks buffer
   in a 6-deep decode-order window; each is emitted with
   `dts = min(pts of itself + next 5 arrivals)`, clamped strictly
   increasing, `ctts = max(0, pts - dts)`. On B-frame-less encoders (the
   common case) dts == pts, ctts == 0 — identical to a plain VFR mux.
3. 1 s GOP enforced in REAL time (a frame-count GOP would stretch to 2+ s
   of wall clock whenever ticks drop, hollowing out the seek table).
4. Backpressure threshold raised 10 -> 24 (with real-time stamps a dropped
   tick is harmless, so dropping is the last resort, not a rate-limiter).
**Verified in-browser (SwiftShader headless = the harshest drop-rate
environment, ~0.75 fps capture):** 9 s take -> video track duration 9.00 s
(8 frames; the old code would have stamped 0.27 s = 33x speed-up), and an
8.1 s take with music -> video 8.10 s / audio present (247 Opus frames).
(The headless audio track is shorter than video only because the
worklet -> main-thread PCM tap is CPU-starved under SwiftShader at 100%;
on real GPUs V4/V5 already proved full-length audio.)

### BF-29 — Girl solo was impossible (user report)
**Symptom:** by default one cat dances; adding the girl gives
[cat, girl], but the only removal control popped the NEWEST dancer — the cat
could never leave, so a girl-only stage was unreachable.
**Fix (page.tsx):** the crew deck gains an ON-STAGE ROSTER — one chip per
active dancer, each with its own x (removes by slot index, min 1 dancer
stays). Removing the cat from [cat, girl] leaves the diva as slot 0 (lead /
beat-clock writer — both rigs already implement the lead contract).
**Verified live:** roster aria-labels went
`["Remove Cat 1"] -> ["Remove Cat 1","Remove Diva 2"] -> ["Remove Diva 1"]`
with the diva dancing solo (3 distinct poses across screenshots), zero
console/page errors.

### BF-30 — Diva's legs glitched through the skirt during fast moves (user report)
**Symptom:** during dance the thigh/calf sometimes poked outside the skirt
fabric.
**Root causes (two stacked):**
1. STALE CAPSULES: the cloth engine collides against leg capsules read from
   the hip/knee/ankle joints' `matrixWorld` — which the V5.1 perf fix
   (BF-26) stopped refreshing (full-subtree walks were replaced by the
   5-bone hair chain; the renderer's own `scene.updateMatrixWorld` runs
   only once per RENDER frame). The capsules were therefore a full frame
   behind the IK — and all 8 steps of a 120 Hz catch-up used the SAME stale
   pose. A fast kick swings the thigh several cm per frame -> it punched
   through cloth that was colliding against where the leg USED to be.
2. RADIUS AUDIT: the flexed thigh mesh (vastus + rectus + hamstring bulges,
   x1.045 quadriceps flex) reaches ~0.098 m radius — the old 0.079 m capsule
   left only ~2 mm of cloth clearance.
**Fixes (DivaBody.tsx):** chain-update ONLY the six capsule joints
(`hip/knee/ankle.updateWorldMatrix(false, false)` per leg — 6 matrix
compositions, ~0.003 ms) right before `writeCapsule`, so every cloth step
collides against THIS step's IK pose; thigh capsule 0.079 -> 0.086 and hip
ball 0.088 -> 0.095 (0.086 + the solver's 0.017 margin = 0.103 m, a 5 mm
cushion over the worst-case flexed mesh).
**Verified offline (NEW scripts/test_leg_cloth.ts):**
- coverage invariant — flexed thigh/shin/boot worst-case radii vs capsule +
  margin (5.2 / 6.8 / 17.4 mm clearance);
- fast-kick cloth drill — 3.5 s of alternating 0.2 s kicks + deep squat +
  2-pi/s spin at 120 Hz with fresh per-step capsules: worst post-solve
  penetration 0.00 mm, hem holds [0.49, 0.83] m, no NaN.
**Verified live:** low-angle close-up VLM across 3 frames mid-dance — "no
visible clipping where her legs poke through the skirt" in any image.

## V6 GLAMOUR PASS (GLAM-2) — "make her dress a little beautiful"
- SEQUIN OMBRE SATIN SKIRT: new procedural 256x256 tileable atlas
  (makeSequinMaps) drives albedo (plum satin + champagne/rose-gold
  paillette discs densifying toward the hem) + roughness/metalness (mirror
  discs: G 0.42 -> 0.10, B 0.05 -> 0.93) — the metallic discs mirror the
  club lights + PMREM env as she spins. Deterministic per-cell hashes (no
  RNG state), seam-exact grid (32 across).
- FINE GOLD-DUST CORSET: same generator at 64-across, half intensity, no
  ombré — structured sparkle that doesn't steal the show.
- TWO-TONE COUTURE RESTORED: new `skirtCoutureColor` prop — the wrapper
  passes `outfitSkirt` (deep plum #2b1850) so the gown reads wine-over-plum
  (V5 had accidentally tinted the skirt with the bodice's wine).
- HEM TRIM: neon cyan LED ring -> gold couture metal (unifies belt/choker/
  boot trims/hem).
- MAKEUP & FINISH: wet couture lip gloss (clearcoat 0.62 -> 0.90, roughness
  0.24 -> 0.15), deeper smoky-plum shimmer eyeshadow (clearcoat 0.24),
  patent-leather boots (clearcoat 0.48 -> 0.62), rose nail lacquer
  (#cf5167) matching the lips.
- VLM verdict on the low-angle burst: gold sparkle + metallic sheen clearly
  visible on the skirt, flared cone drape intact, 3 distinct poses, nothing
  broken.
