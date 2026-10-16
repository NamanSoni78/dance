# DANCE CAT 3D — MASTER PLAN (V1 + V1.5)
**Project:** dance.namansoni.in — 3D Audio-Reactive Dancing Cat
**Stack:** Next.js 16 (App Router, 100% static export) · React Three Fiber · three.js · Tailwind CSS 4 · Web Audio API
**Deployment target:** Vercel Hobby (zero Fluid Active CPU — pure CDN edge)
**V1 status:** ✅ SHIPPED
**V1.5 status:** ✅ SHIPPED — "Wide & Smooth + MP4 + Cat Model 2.0" (see §7 onward)

---

## 1. PRODUCT VISION

One page, zero friction: the visitor drops any MP3/WAV/OGG (or hits the built-in
Demo Beat), and a fully procedural neon streetwear cat dances in a cyber-club
with **perfect beat synchronization** — computed 100% on-device with
deterministic Web Audio DSP. No AI APIs, no model downloads, no backend, no
uploads. The site is a static CDN bundle that cannot consume serverless CPU.

**North-star experience goals**
1. *Drop → dance in under 2 seconds* (instant playback, BPM detection in parallel).
2. *Never the same show twice* — 42-move choreography sequencer + 16-shot camera director.
3. *Culturally rich* — authentic Indian classical (Bharatanatyam, Kathak, Odissi,
   Kathakali, Mohiniyattam) and folk/filmi (Bhangra, Garba, Dandiya, Ghoomar,
   Lavani, Bihu, Dappankuthu, Naatu-style mass steps) alongside global club moves.
4. *Sharable* — one-tap .webm recording of the canvas + music, plus a real
   1200×630 OG screenshot for link previews.

---

## 2. V1 ARCHITECTURE (as built)

```
src/
├── app/
│   ├── layout.tsx        SEO metadata (OG/Twitter images, theme #06060a)
│   ├── page.tsx          Studio UI: drag-drop, transport, pills, REC, HUD rAF loop
│   └── globals.css       neon slider styling, no-scrollbar utility
├── components/
│   ├── ProceduralDancingCat.tsx   24-joint rig + engine layers (face/tail/IK/damping)
│   │                              └─ now driven by the Grand Choreographer
│   └── ProceduralClubStage.tsx    Instanced EQ ring + LED floor + subs + DJ booth
│                                  └─ camera director now driven by Camera Sequencer
└── lib/
    ├── audioEngine.ts    Zero-alloc DSP: FFT 2048, spectral-flux beats, offline
    │                     BPM [90-175], 808 synth, blob-URL lifecycle, REC audio tap
    ├── danceMoves.ts     ★ V1: 42 DanceMove library (11 Indian classical,
    │                     14 Indian folk/filmi, 12 global, 5 legacy refactors)
    │                     + FACE_INTENT_OVERRIDES + TAIL_CARRIAGE_OFFSETS
    ├── choreographer.ts  ★ Non-repetitive sequencer: hard 4-bar cap, recency
    │                     window 6, energy matching, 0.25 s crossfade, mulberry32
    ├── cameraShots.ts    ★ 16 cinematic shots + bar-boundary cut sequencer
    ├── danceStyleMapping.ts ★ 10 UI pills ↔ DanceFamily mapping (legacy kept)
    └── danceRuntime.ts   ★ Shared singletons: choreographer, cameraSequencer,
                          beatClock (cat writes phase, stage reads)
public/og.png            Real 1200×630 screenshot of the cat mid-dance
```

### 2.1 The Grand Choreographer data flow (per frame, zero heap allocation)

```
getMetrics() ──► cat useFrame ──► beatClock (phase/beatCount publish)
                     │
                     ▼
        choreographer.update(metrics, beatCount, phase, dt, elapsed)
        ├─ IDLE fallback when !isPlaying || overall < 0.12
        ├─ bar-boundary switch (2–4 bars, HARD CAP 4)
        ├─ sustained bass > 0.85 (≥2 beats) → accent move on next beat
        └─ seeded RNG (mulberry32, re-seeded from detected BPM)
                     │
                     ▼
        choreographer.applyPose(t)   ← 46-channel JointTargets
        ├─ activeMove.pose(t, ctx)   (beat-locked math only)
        └─ 0.25 s crossfade vs outgoing move (outgoing held at full energy)
                     │
                     ▼
   ENGINE LAYERS (untouched, engine-owned):
   ├─ squash & stretch (bass)          ├─ face auto-layer + FACE_INTENT blend
   ├─ requestSpin() → yaw accumulator  ├─ tail wave + TAIL_CARRIAGE blend
   ├─ 2-bone leg IK + floor lock       ├─ emissive palettes per family
   └─ damp-to-rig (λ 9–16)             └─ blink / ear twitch / whiskers
                     │
                     ▼
   stage useFrame ──► cameraSequencer.updateAndApply(...)
                      (16 shots, bar cuts, drop crash-cuts, FOV punch, Dutch roll)
```

### 2.2 Key invariants (DO NOT BREAK in future work)

| # | Law | Why |
|---|-----|-----|
| 1 | Zero React re-render: FFT values never enter `useState`; HUD via direct DOM in one rAF loop | 60 FPS UI |
| 2 | Zero heap allocation inside any per-frame path (no `new`, no literals, no closures, no `.map`) | no GC hitches |
| 3 | Beat-lock: cyclic motion only at integer multiples of `p / halfP / quarterP / moveBeat·π` | perfect sync |
| 4 | Moves never write `rootRotY`, `jawX`, `pupilScale`, `earLX/LZ/RX/RZ`, `visorRotX/Y`, `pelvisScale*` — spins via `requestSpin`, face via `faceIntent`, squash via engine | layer ownership |
| 5 | Legs: IK floor lock — moves command `pelvisY/footLift/legStepPitch/extraKnee/ankleToePitch` only; lateral pelvis motion must pair with foot lifts | no foot sliding |
| 6 | Static export only: no `app/api/*`, no Server Actions, no dynamic SSR | 0 Fluid CPU on Vercel Hobby |
| 7 | Blob URL lifecycle: every `createObjectURL` for songs must be revoked on the next upload; REC blobs revoked after download | flat RAM |
| 8 | ORBIT camera mode is user-owned; sequencer only drives DYNAMIC_AUTO + presets | UX trust |

---

## 3. V1 RELEASE SCOPE (delivered)

| Feature | Status | Notes |
|---|---|---|
| 24-joint procedural cat rig | ✅ (pre-V1) | untouched, verified |
| Zero-alloc DSP engine + offline BPM + 808 demo synth | ✅ (pre-V1) | untouched |
| **42-move dance library** | ✅ V1 | incl. 20+ Indian moves, authentic technique names |
| **Non-repetitive choreographer** | ✅ V1 | fixes the "same move for 1 minute" complaint |
| **16-shot cinematic camera sequencer** | ✅ V1 | DYNAMIC_AUTO = auto director |
| **10 family pills** (legacy 6 kept working) | ✅ V1 | AUTO default, IDLE last |
| **Live "Now dancing / Cam" readout** | ✅ V1 | DOM-rAF, zero re-renders |
| **Record & export .webm** (canvas + music) | ✅ V1 | pre-volume audio tap, mute-safe |
| **OG image 1200×630** + metadata | ✅ V1 | real screenshot, verified non-flat render |
| Face intents + tail carriages blending | ✅ V1 | damped, engine layers preserved |
| Neon emissive palettes per dance family | ✅ V1 | temple-gold classical, filmi magenta, etc. |

**Verified in-browser (headless):** move rotation (Chakkar → Dhamaal), camera
cuts (Floor Fisheye → Crash-Zoom), forced Classical family → classical move,
REC start/stop lifecycle, zero page errors, clean build + ESLint, static
export 2.4 MB.

---

## 4. HOW TO EXTEND (5-minute recipes)

**Add a dance move:** open `src/lib/danceMoves.ts`, append a `DanceMove` object
to `DANCE_MOVES` (id/name/family/origin/energy/tempoFit/defaultBars/tags +
`pose(t, c)` using `setBody/setArms/setLegs`). The choreographer indexes it
automatically — no other file changes.

**Add a camera shot:** append a `CameraShot` to `CAMERA_SHOTS` in
`cameraShots.ts` (`frame(pos, look, ctx)` writes scratch vectors). The
sequencer picks it up by energy fit automatically.

**Add a UI pill:** add the id to `DanceStyle` + `DANCE_STYLE_PILLS` +
`mapStyleToFamily()` in `danceStyleMapping.ts` (map to an existing family, or
add a new `DanceFamily` and tag moves with it).

---

## 5. ACCEPTANCE CHECKLIST FOR FUTURE CHANGES

- [ ] `npm run build` → zero TS/ESLint errors, all routes `○ (Static)`
- [ ] `out/` size stays < 4 MB (currently 2.4 MB)
- [ ] Headless smoke: no `agent-browser errors`; move readout changes over ~30 s
- [ ] ORBIT camera still fully user-controlled
- [ ] Pause audio → cat falls to IDLE breathing (not endless silent dance)
- [ ] Upload → seek → pause → resume → song end → replay flow intact
- [ ] REC start/stop returns button to idle, no console errors
- [ ] New moves respect the invariants table (§2.2)

---

## 6. BACKLOG IDEAS (V2+, prioritized — post V1.5)

1. ~~**MP4 export**~~ ✅ DONE in V1.5 (see §8.3).
2. **Shareable choreography seeds** — URL `?seed=` param for reproducible shows.
3. **Move picker overlay** — tap "Now dancing" to browse all 42 moves with
   previews (`choreographer.forceMove(id)` is already exposed).
4. **Duet mode** — second smaller cat mirrored, offset phase (rig is a
   component; instantiate twice with `position` prop).
5. **Song library** — IndexedDB persistence of analyzed BPM + per-song seed.
6. **Lyrics/vocal-band move bias** — use the 140–900 Hz vocal energy to bias
   BOLLYWOOD family during sung passages.
7. **Seasonal skins / stage looks** — Diwali/Holi palette packs for stage +
   emissives (queued for the external-AI "Grand Show Director" pack — prompt
   delivered with V1.5 as `download/grand-show-director-prompt.md`).
8. **Performance guard** — auto DPR reduction if frame time > 20 ms for 5 s.

---
---

# V1.5 — "WIDE & SMOOTH + MP4 + CAT MODEL 2.0"

**Trigger:** direct user feedback on V1 (verbatim): *"auto director do too zoom
in… sometimes camera shake too much when it goto back — i want some zoom out by
default, zoom out look so cool… cat model can be better… record records in
webm, which gives corrupted — i want better mp4… make everything more
better."*

## 7. V1.5 SCOPE (what changed and why)

| # | Item | User complaint / goal | V1.5 solution |
|---|------|----------------------|---------------|
| 1 | **Camera Director V2** | Auto director zooms in too much; wants zoomed-out default | Base FOV 42→50, all 16 shots pulled back 25–40%, FOV punch halved + clamped [46, 62], 3 NEW wide shots (19 total), wide-shot selection bias |
| 2 | **Shake/punch overhaul** | "Camera shake too much when it goto back" | Beat-punch now aims TOWARD the subject (was world −Z — jerked backward on rear shots, the actual reported bug); punch amplitudes cut ~50%; Dutch roll softened; micro-shake gets smooth attack/decay envelope, lower freqs, higher bass gate |
| 3 | **Recording V2** | WebM exports arrive "corrupted" (unseekable / rejected by players) + wants MP4 | MP4-first codec negotiation (H.264/AAC, Chrome 126+ & Safari), WebM fallback with **duration-metadata repair** (`webm-duration-fix`, lazy-loaded), single-mux MP4 capture (no timeslice), track cleanup, format-aware filename + notice |
| 4 | **Cat Model 2.0** | "Cat model can be better" | Sheen-velvet fur materials (MeshPhysicalMaterial), slit cat pupils, bigger expressive eyes, cheek fur tufts, neck ruff, hip fluff, ear-tip rounds, chest tuft, headphone cushions, engine breathing layer on chest |
| 5 | **Polish** | "Make everything more better" | Wider ORBIT bounds (max 9m), fog retuned for wide framing, lighting bump for wide shots, live tagline, docs discipline (plan/worklog/bugfix) |
| 6 | **Next-AI prompt** | "Give me a prompt which I will give to another intelligent AI" | `grand-show-director-prompt.md` — stage looks + beat-synced particle FX + crowd + 8 bonus wide camera shots, with full verbatim engine contracts (same format that produced the V1 choreographer package) |

## 8. V1.5 TECHNICAL DESIGN

### 8.1 Camera Director V2 (`src/lib/cameraShots.ts` — rewritten)

**Constants:** `BASE_FOV = 50` · FOV punch = `bass * 2.2 + isBeat * 0.9`
(was `bass * 4.5 + isBeat * 1.8`) · final FOV clamped to **[46, 62]**.

**Shot grammar changes:**
- `frame()` distances re-tuned so full-body shots sit 3.1–5.2 m back
  (was 2.0–3.9 m); portrait closeup 2.55 m @ fovBias −2 (48° effective).
- `beatPunch` now applied **along the normalized look-direction** via a
  pre-allocated scratch vector (`_punchDir`), replacing the old world-space
  `pos.z -= punch` (which pushed rear-view cameras AWAY from the cat on every
  beat — the "shakes when it goes back" bug, BF-10).
- Micro-shake: amplitudes cut ~55%, frequencies 43/57 → 21/29 rad/s (plus
  secondary 13.7/17.3 sines for organic drift), bass gate 0.65 → 0.75, and a
  **damped envelope** (`shakeEnv`, λ=5) so shake fades in/out smoothly
  instead of strobing on/off with the bass.
- Dutch roll: `(activeShot.rollBias ?? 0.06) + bass * 0.03` (was 0.06 +
  bass * 0.06), oscillation slowed to 1.7 rad/s.
- `cutToShot()` now also **snaps `camera.fov`** to the new shot's bias so
  hard cuts cut FOV too (no zoom-smear between different fovBias shots).
- **3 new wide shots**: `WIDE_ESTABLISHING` (5.4 m static wide, calm energy),
  `SLOW_PULL_BACK` (3.2→5.6 m reverse dolly over 4 bars), `HIGH_WIDE_DRIFT`
  (2.9 m elevated slow 3/4 drift). Optional `wide: true` flag gives +0.8
  selection score so wide framings dominate the rotation.
- `FACE_CLOSEUP` narrowed to calmer energies (energyFit [0.15, 0.55]) so the
  tightest framing is rarer.

**Sequencer invariants preserved:** bar-boundary cuts, 4-shot recency window,
energyFit matching, bass-drop crash cuts from `DROP_SHOT_IDS`, ORBIT
untouched, zero per-frame allocation.

### 8.2 Stage & canvas framing (`ProceduralClubStage.tsx`, `page.tsx`)

- Canvas default camera: `fov 50`, position `[0, 1.35, 4.6]` (was 42 / z 3.45).
- ORBIT: `maxDistance 6.5 → 9.0` (zoom-out freedom), `minDistance 1.8 → 2.0`.
- Fog `[6, 16] → [9, 22]` so wide shots don't gray out the far EQ ring.
- Ambient 0.55→0.60, hemisphere 0.75→0.80 — wide framing shows more floor.

### 8.3 Recording V2 (`page.tsx` + `webm-duration-fix` dep)

**Root cause of "corrupted" V1 exports (BF-11):** MediaRecorder's WebM output
omits the Segment→Info **Duration** element (duration is only known when the
recording stops; Chrome writes `unknown`). Result: many players (QuickTime,
WhatsApp, some editors) show the clip as broken / 00:00 / unseekable.

**V1.5 pipeline:**
1. Codec negotiation (feature-detected, best-first):
   `video/mp4;codecs=avc1.640028,mp4a.40.2` → `avc1.42E01E` → `video/mp4` →
   `webm;codecs=vp9,opus` → `vp8,opus` → `webm`.
2. MP4 path: `recorder.start()` **without timeslice** (single clean mux —
   no fragmented-MP4 chunk edge cases), 14 Mbps video / 192 kbps audio.
3. WebM fallback path: `start(500)` timeslice + on stop, lazy
   `import('webm-duration-fix')` → `fixWebmBlob(blob)` rewrites duration
   metadata; failure falls back to the raw blob (never blocks the download).
4. On stop: all canvas-capture tracks stopped (V1 leaked them, BF-12),
   double-stop guarded, extension-aware filename + user notice naming the
   actual format.

### 8.4 Cat Model 2.0 (`ProceduralDancingCat.tsx`)

- **Materials:** `darkFur`/`creamFur` upgraded to `MeshPhysicalMaterial` with
  **sheen** (velvet rim under club neon); `sneakerBody` gets clearcoat
  (patent-leather kick).
- **Eyes:** sclera 0.075→0.082, iris 0.058→0.064, pupils are now **slit
  pupils** (circle geometry pre-scaled x0.62 — the engine's uniform
  pupilScale animation still works on top).
- **New static meshes (≈13, all pre-allocated):** cheek fur tufts ×2,
  neck ruff torus, hip fluff capsules ×2, ear-tip spheres ×2, chest tuft
  spheres ×3, tail-base fluff sphere, headphone fur cushions ×2.
- **Engine breathing layer:** after `applyPose`, `chestScale` gets an
  additive `sin(elapsed·1.5)·0.012 + bass·0.05 + beatPulse·0.02` breath —
  V1 had no baseline chestScale motion between moves (BF-13).
- **Rig untouched:** all 24 joints, IK floor lock, face/tail auto-layers,
  spin accumulator, damping — identical to V1 (invariants §2.2 hold).

## 9. V1.5 ACCEPTANCE CHECKLIST

- [x] `npm run build` → zero TS/ESLint errors, all routes `○ (Static)`
- [x] Default framing visibly wider (FOV 50 @ 4.6 m base, wide shots in
      rotation — browser-verified)
- [x] Rear-view shots no longer jerk backward on every beat (directional
      punch)
- [x] REC produces `.mp4` on Chrome/Safari (`.webm` + duration fix
      fallback on Firefox), tracks cleaned up, button lifecycle clean
- [x] ORBIT still 100% user-owned; pause → IDLE breathing intact
- [x] Zero console errors in headless verification
- [x] plan.md / worklog.md / bugfix.md updated; danceV1.5.zip packaged
- [x] Next-AI mega-prompt delivered (`download/grand-show-director-prompt.md`)

---

## 10. V2.0 — GRAND SHOW DIRECTOR + GROUP DANCE CREW (multi-animal)

### 10.1 Scope (user requests, 2026-10-15)

1. **BF-15 back-facing bug** — cat sometimes faces back for a whole song.
2. **BF-16 recording glitches** — MP4 output still shows glitch/distortion.
3. **Grand Show Director pack** — integrate external AI package (14 stage looks,
   5 particle systems, 52-person crowd, 8 bonus wide camera shots).
4. **Group Dance Crew** — 2-4 animals (cat / dog / mouse) dancing together with
   formations, sync modes and real interactions.

### 10.2 BF-15 — Reface Law (root cause + fix)

Root cause: `Dandiya Raas` calls `requestSpin(Math.PI)` (180° partner turn) on
every 4th beat. If the choreographer switches moves right after that half-turn,
`eng.spinTargetY` stays at an odd multiple of π — nothing ever returns it to
front → the cat dances the rest of the song facing back.

Fix (engine-level, no move library changes): on every ACTIVE MOVE TRANSITION,
arm a 0.9 s **reface window**: wrap `spinTargetY` into (−π, π] (shifting the
live `root.rotation.y` by the same whole turns so nothing snaps), then damp
`spinTargetY → 0` at λ=4. Spins requested by the incoming move (always 2π in
the library except Dandiya's π) land on whole turns and remain untouched —
the law only corrects leftover residue. Brief back-facing moments inside a
move stay legal (user: "occasionally it is okay").

### 10.3 BF-16 — Recording V3 (glitch root causes + fixes)

1. **Torn frames**: WebGL canvas captured without `preserveDrawingBuffer` —
   the compositor may tap a cleared buffer. Fix: `gl={{ preserveDrawingBuffer:
   true }}` on the Canvas.
2. **Bitrate starvation macroblocking**: hi-DPI screens render the canvas at
   up to 2× CSS pixels (e.g. 3840×2160) while the encoder runs at 12 Mbps.
   Fix: lock Canvas `dpr` to 1 while REC is active (restored after), raise
   MP4 bitrate to 16 Mbps.
3. **Frame pacing**: `captureStream(60)` duplicates/drops frames arbitrarily.
   Fix: `captureStream(0)` + `track.requestFrame()` once per rendered frame
   (via a Canvas-internal `<FrameTap/>` useFrame hook) — every recorded frame
   is a complete composited frame, VFR timestamps handled by MediaRecorder.
   Feature-detected; falls back to `captureStream(60)`.

### 10.4 Grand Show Director integration (`src/lib/`)

- `stageLooks.ts` (14 looks: 6 Indian + 8 global), `showDirector.ts`
  (energy-matched 32-64-beat look rotation + drop-triggered hype looks, 2-bar
  palette crossfade), `particles.ts` (confetti cannons / holi geysers / ember
  diyas / fog wisps / strobe sparks — 8 draw calls total), `crowd.ts` (52
  silhouette attendees, 12 arm-raisers, 8 phones — 3 draw calls),
  `cameraShotsAppendix.ts` (8 wide shots; `import type` from cameraShots to
  avoid a runtime cycle; merged into `CAMERA_SHOTS` → 27 shots).
- Stage wiring: showDirector palette drives EQ ring / neon trim / deck /
  laser / spot / rim colors each frame; `floorPattern` 0-3 switches the LED
  floor loop (radial ripple / checker strobe / EQ columns / spiral sweep);
  `syncParticleLookState` bridges the live palette into FX; crowd + FX group
  mounted + disposed; `showState` singleton in danceRuntime feeds the HUD
  "Vibe" readout (zero-re-render).
- UI: "Vibe" pill deck — Auto + 5 curated looks (forceLook API).

### 10.5 Group Dance Crew architecture

- `src/lib/species.ts` — `SpeciesId = 'CAT' | 'DOG' | 'MOUSE'`; presets drive
  scale, fur colors, ear style (pointy/floppy/round), snout (flat/long/tiny +
  buck teeth), whiskers, tail params (length/radius/wag speed), pupil style,
  species bounce factor. Same 24-joint rig — only mesh/material parameters
  differ, so every one of the 42 moves works for every species.
- `src/lib/groupDance.ts` — `groupDirector` (factory singleton):
  formations (LINE / ARC / DIAMOND / CIRCLE + AUTO rotation every 32-64
  beats), sync modes (UNISON / CANON / MIRROR / FREESTYLE / AUTO), damped
  slot travel, interaction scheduler (every 48-96 beats, 8-beat events):
  HIGH_FIVE (pair anchors 1.06 m, arm-reach envelope + clap pulse), HIP_BUMP
  (0.82 m, alternating lean), DO_SI_DO (curved slot swap), SYNC_SPIN
  (broadcast 2π to all), HUDDLE_POP (converge 0.6 m, inward facing, pop-spin
  release). Per-dancer `DancerSlotState` objects mutated in place (zero-alloc).
- `danceRuntime.ts` — `dancerChoreographers[0..3]` (one instance per dancer;
  identical seeds in UNISON/CANON/MIRROR → identical deterministic move
  streams; divergent seeds in FREESTYLE), rebuilt on sync-mode change;
  `showState` for the Vibe HUD; lead dancer (index 0) remains the single
  beatClock writer.
- Engine (`ProceduralDancingCat.tsx`): props `species`, `dancerIndex`;
  outer slot-group damps toward slot target (λ 2.2); `facingYaw` accumulator
  (λ 3) added to spin yaw; CANON phase offset feeds only the choreographer;
  MIRROR flips the pose L/R post-applyPose (swaps + sign flips, no alloc);
  interaction arm/lean blends layered after applyPose; group spin consumed
  from director; Reface Law (§10.2); ContactShadows only on dancer 0
  (scale 5 — one instance shadows the whole crew); species accents (wag
  speed, bounce, ear twitch) on the auto-layers.
- `page.tsx` — Crew deck (🐱/🐶/🐭 chips add, count badges, cap 4, "−"
  removes newest, min 1), Formation + Sync + Vibe decks, HUD crew summary,
  Canvas `dpr` lock during REC.
- `cameraShots.ts` — `setGroupBias(n)`: +1.5° FOV and +0.35 m min shot radius
  per extra dancer so group framings stay wide.

### 10.6 V2.0 acceptance checklist

- [x] Single cat (CAT, 1 dancer) behaves exactly like V1.5 (zero regression — solo run verified)
- [x] Back-facing residue impossible: after any move switch the lead refaces (Reface Law, BF-15)
- [x] REC produces clean MP4 (no torn frames, no macroblocking) at dpr 1 (Recording V3, BF-16)
- [x] Stage looks rotate every 32-64 beats + on drops; Vibe pills force looks (Holi Rave switch vision-verified)
- [x] FX + crowd visible, beat-synced, disposed on unmount, ≤14 new draw calls (11 actual)
- [x] 2-4 dancers: formations transition smoothly, sync modes work, all 5
      interactions trigger and resolve, no interpenetration at rest slots
      (3- and 4-dancer crews vision-verified: species distinct, ARC/DIAMOND spacing clean)
- [x] npm run build clean; zero console errors headless; plan/worklog/bugfix
      updated; danceV2.0.zip packaged; next-AI mega-prompt delivered

---

# V3.0 — "THE PERFECT SHOW" (duets + polish + phone)

## 11. V3.0 SCOPE (user-reported + package integration)

1. **BF-18 — Dog crash**: selecting 🐶 threw `Cannot read properties of null
   (reading 'rotation')` at the whisker block (dog preset has
   `whiskers: false` → whisker meshes never mount → refs stay null) and the
   per-frame throw froze the UI. Fix: species-null-guard the whisker block.
2. **BF-19 — MP4 "stuck/laggy" playback**: Recording V3 emitted a frame per
   RENDERED frame → variable-frame-rate MP4. When render fps dips or jitters
   (heavy scene, GC, 4-dancer crew), frame timestamps bunch → players show
   stutter. Fix: Recording V4 — fixed 30 fps CONSTANT frame rate capture via
   drift-compensated accumulator inside RecordFrameTap (+2× per-frame
   bitrate budget at the same 16 Mbps).
3. **Less ambient particles by default**: density scale 0.6 desktop / 0.3
   phone on all 5 instanced systems + a Lite/Full FX toggle; Lite also parks
   the two ambient systems (ember diyas, fog wisps) and the crowd.
4. **Collapsible control deck**: full panel ⇄ compact bar (Play + REC +
   expand). Default collapsed on phones (<640px), expanded on desktop.
   Grid-rows 0fr→1fr animated collapse.
5. **Phone UX + smoothness pass**: safe-area bottom padding, touch-action
   manipulation on all controls, larger pill touch targets, DPR cap 1.5 on
   phone tier, reduced backdrop-blur on phone, deck max-height with internal
   scroll on short screens.
6. **Grand Group Choreographer V2.5 package integration** (external AI's
   `group-dance-mega.zip`, audited):
   - `duetMoves.ts` — 32 full 41-channel partner choreographies
     (Dandiya 4-taal suite, lifts, high-five chains, comedy scale-duets,
     finales) with authored contact beats → replaces the V2 envelope-only
     interactions for pairs (new DUET_CONTACT mode).
   - `groupFormations.ts` — 18 animated formations (accordion lines, weaves,
     carousels, garba ring, expanding star, call-response cypher) → replaces
     the 4 static formations. UI pills map: LINE→LINE_BREATHING,
     ARC→ARC_CRESCENT_SWAY, DIAMOND→DIAMOND_PULSE, CIRCLE→CIRCLE_GARBA_RING;
     AUTO rotates all 18.
   - `speciesFlavor.ts` — per-species accent layer on EVERY pose (dog
     weight-shift + head bob, mouse 1.3× hop snap, cat liquid shoulder
     isolations), 15 signature solo moves (5 per species), hype-crew
     call-and-response poses, personas → new SPECIES_SPOTLIGHT mode.
   - `groupCameraShots.ts` — 16 multi-dancer shots (two-shot contact-axis
     lock, mirror symmetry axis, canon ripple truck, overhead mandala,
     huddle-burst snap…) with formation-aware pairing → camera sequencer
     uses them whenever n ≥ 2 (43 total shots).
   - Scheduling (their laws, kept): mode machine FORMATION_GROUP ⇄
     DUET_CONTACT ⇄ SPECIES_SPOTLIGHT, transitions strictly on bar
     downbeats; phaseOffset forced 0 in duets; legacy interactions disabled
     during duets; n=2 pair (0,1) center · n=3 rotating pair + upstage hype
     · n=4 double-duet ±1.22 m.

## 12. V3.0 TECHNICAL DESIGN

- `groupDance.ts` (rewritten internals, same factory API): DancerSlotState
  gains `duetRole` / `isSpotlightSoloist` / `slotSideSign`;
  `setCrewSpecies(list)` (page → director on crew change);
  `getChoreoState()` returns a stable mutated-in-place
  `{ mode, duet, signature, spotlightIndex, formationId, isMirror, isCanon,
  beatStart, durationBeats }` read by engines + camera each frame.
  Sync pills: UNISON none, CANON i·0.52 lag, MIRROR outer-half flip,
  FREESTYLE divergent seeds (existing), AUTO deterministic flavor roll.
- Engine pose path: mode branch BEFORE the choreographer —
  DUET_CONTACT → poseA/poseB (or hype pose) with mode-locked
  moveBeat/moveBar/moveProgress from `beatStart`; SPECIES_SPOTLIGHT →
  signature move / hype pose; FORMATION_GROUP → existing choreographer.
  `applySpeciesAccent(species)` stacks on every non-hype pose.
  Duet `requestSpin` buffered through a per-instance stable closure →
  spin accumulator + Reface Law unchanged. HUD reads duet/signature names.
- `cameraShots.ts`: `setGroupHints(hints | null)`; when n ≥ 2 the sequencer
  selects from GROUP_CAMERA_SHOTS via the package's
  `selectGroupCameraShot(hints)` on cut boundaries (crash-cut path stays
  solo-only). `setGroupBias(n)` pull-back/FOV bias retained on top.
- `particles.ts`: `setParticleDensity(d)` module state read at create();
  ambient vs event system split (ember/fog gated by fxDetail ≥ 2).
- `page.tsx`: CFR RecordFrameTap (30 fps accumulator, resync-on-stall);
  deck collapse state; perf tier detect (width < 640 → phone tier: fxDetail
  1, DPR ≤ 1.5, collapsed deck); FX Lite/Full pills; crew species sync.
- Zero-allocation law preserved everywhere (module-scratch modeCtx, stable
  closures, no per-frame arrays/objects).

## 13. V3.0 ACCEPTANCE CHECKLIST

- [x] Dog/mouse/cat chips never crash — every species renders + dances solo
      (BF-18 fixed: null-guarded whisker refs; dog verified solo + in crews)
- [x] 2-4 dancer crews: duets trigger on phrase boundaries (n=3 rotating
      hype, n=4 double-duet), spotlight cyphers rotate species, formations
      animate (breathing line, garba ring), no mesh interpenetration
      (offline: 480-beat sim × n=2/3/4, 0 role-parity errors; live: natural
      Garba-Raas duet vision-verified — pair ~1 m apart angled inward)
- [x] MP4 export plays SMOOTH (CFR 30) — no stutter/stuck frames
      (Recording V4 accumulator; REC lifecycle verified)
- [x] Ambient particles visibly fewer by default; Lite toggle works
      (density 0.6 Full / 0.3 Lite, ambient parking, FX pills verified)
- [x] Deck collapses/expands on desktop + phone; default collapsed <640px
      (grid-rows 0fr↔1fr + visibility; compact bar = Play/Demo/REC/chevron)
- [x] Phone: safe-area padding, no double-tap zoom, playable framerate
      (touch-action manipulation, DPR ≤1.5, Lite FX default, 46dvh deck cap)
- [x] Solo cat zero-regression (V1.5 gate) + species accent adds flavor
      (solo invariant 0 violations in 200-beat sim; accent path exercised)
- [x] npm run build clean, zero console errors, docs aligned, danceV3.0.zip

# V4.0 — "THE DIVA EDITION" (variety fix + the girl + seek-safe MP4)

## 14. V4.0 SCOPE (user-reported V3 feedback)

1. **"They do not dance, they just repeat the same move!!"** — root-caused
   with a 480-beat offline simulation: the V3 mode machine chained specials
   back-to-back (duet -> spotlight -> duet ...), so a crew spent ~92% of the
   show inside authored fixed loops and the 42-move non-repetitive sequencer
   almost never danced. Fix is structural (see 15.1).
2. **Replace dog with a realistic girl** — "not a robot": a human diva on the
   SAME biped rig contract (identical skeleton, IK, 41-channel poses, group
   machine), with real physics: verlet cloth skirt, verlet ponytail chain,
   subtle bust spring. Her own 25-move unique dance library + 5 spotlight
   signatures.
3. **"Pack/encode MP4 properly"** — VLC random-seek showed freeze/distort/
   flicker: MediaRecorder's H.264 has long browser-chosen GOPs and a thin
   stss table. Recording V5 = native WebCodecs (VideoEncoder with explicit
   1 s IDR GOP + AudioEncoder PCM track, muxed by mp4-muxer); MediaRecorder
   kept as fallback.
4. Prompt for the external AI (girl + cloth + dance) + aligned docs.

## 15. V4.0 TECHNICAL DESIGN

### 15.1 Variety overhaul (groupDance.ts + speciesFlavor.ts)
- **Specials never chain**: on mode expiry, a duet/spotlight ALWAYS returns
  to FORMATION_GROUP; the next special fires only after the baseline window
  (energy gates unchanged, alternation still picks which special).
- FORMATION windows 6-10 bars (24-40 beats): the sequencer cycles 3-5 moves
  per window. Sim result: sequencer share 8% -> 73%; formations used
  2 -> 8; specials 92% -> 27% of show time.
- **Spotlight signature chaining**: ChoreoState.signatureAlt (selected at
  spotlight entry, seeded +7 beats, excludes the first) — the soloist swaps
  signature -> signatureAlt at the mode midpoint (2 different signature
  moves per spotlight, engines pick it up via `useAlt`).
- **Hype-crew bar-parity**: even bars = classic cypher point; odd bars =
  both-hands-up wave (upWave blend in applyHypeCrewResponsePose). No more
  one static hype loop.

### 15.2 The Diva (ProceduralDancingGirl.tsx + girlMoves.ts)
- Same skeleton offsets/IK/damping as the animals (pose compatibility law):
  pelvis 0.90, legs 0.39+0.39, shoulders at [±0.27, 0.25], the exact joint
  hierarchy — every authored 41-channel pose, duet and hype routine works on
  her unchanged.
- **Verlet cloth skirt**: 14-around x 7-row grid (98 particles), ~420
  structural/shear/bend constraints, 3 relax passes, pinned to a hip anchor;
  forces = gravity + damping + spin centrifugal flare + bass lift + micro
  wind; collision vs 4 leg capsules; floor clamp; geometry positions +
  computeVertexNormals per frame (world-space mesh outside the slot group).
- **Verlet ponytail**: 7-particle chain, tapered capsules positioned/
  oriented from link midpoints; spin flare + gravity; clamped above the
  torso line.
- **Bust spring**: critically-damped (k=170, c=19) chest flex driven by
  pelvis vertical velocity — subtle (max 2.4 cm) — the whole chest shell
  moves so seams never show.
- Realistic face: warm skin with velvet sheen, natural brown iris + dark
  pupil + catchlight, blink (2.8-4.8 s), brow raise on high energy, smile
  by face-intent, blush, lashes; hair = ball + bangs + side locks + the
  physics ponytail; neon trim identity (choker, bangles, boot laces, hem).
- **girlMoves.ts**: 25 moves (24 + idle) authored for feminine style on the
  shared contract: figure-8 hips, ghoomar spins (skirt showcase), thumka,
  hair flips, body waves, lasya/tribhangi, binjali bhangra, runway strut...
- **Library-agnostic sequencer**: choreographer.ts accepts `config.moves`;
  danceRuntime builds girlChoreographers[] with the same seeds (her switch
  TIMING stays in sync with the animals in UNISON/CANON/MIRROR — same index
  cadence, her own steps).
- speciesFlavor.ts: GIRL accent layer (figure-8 micro + charm tilt + wrist
  flicks), 5 signature moves (Ghoomar Skirt Flare, Hair-Flip Windfall,
  Runway Diamond Strut, Bharatanatyam Fusion Soli, Drop & Split-Bounce),
  persona "The Diva — smooth, expressive, magnetic". DOG retired.

### 15.3 Recording V5 (mp4Recorder.ts + audioEngine.ts + page.tsx)
- WebCodecs path (preferred): VideoEncoder h264 (High L5.1 -> L4 -> Baseline
  probe), **keyFrame every 30 frames = 1 s GOP @ 30 fps CFR** (16 Mbps,
  quality latency mode, backpressure guard); frames from `new
  VideoFrame(canvas)` on the existing CFR RecordFrameTap grid (odd-dimension
  canvases blit through a scratch 2D canvas).
- Audio: audioEngine.attachPcmTap (AudioWorklet 'rec-pcm-tap', 4096-frame
  blocks; ScriptProcessor fallback) -> AudioEncoder AAC 192k -> Opus 160k
  fallback; getPcmSampleRate probe. Empty-track guard synthesizes one
  silent block.
- mp4-muxer: fastStart 'in-memory' + firstTimestampBehavior 'offset' ->
  complete moov with full stss on finalize. Verified on a real export:
  h264 30/1 CFR, IDR at frames 0 + 30, 5/5 random-seek decodes clean.
- MediaRecorder fallback retained end-to-end (Firefox etc.); canRecord now
  ORs VideoEncoder availability; REC timer runs on either backend (was
  MediaRecorder-only — V5 recordings never ticked the timer).

## 16. V4.0 ACCEPTANCE CHECKLIST

- [x] "Repeat same move" fixed structurally: specials 92% -> 27% of show
      time; sequencer (the user's favorite part) back to 73%; 8 formations
      rotate; spotlight soloists chain 2 signatures; hype crew alternates
      patterns by bar parity (offline sim n=2/3/4, 0 role-parity errors)
- [x] Diva replaces dog: chip works, crews render (duo + trio VLM-verified:
      humanoid figure with skirt, ponytail, visible face, no artifacts);
      she DANCES (pose changes confirmed across 2.5 s), skirt + ponytail
      react (cloth + hair flow change between frames), bust spring subtle
- [x] Her own choreography: 25-move library through the same sequencer laws
      (4-026 duet pose evaluations + all signatures + accents: 0 violations)
- [x] MP4 random-seek safe: WebCodecs export verified with ffprobe + ffmpeg
      (h264 30/1 CFR, IDR every 30 frames, 5/5 mid-timestamp seeks decode
      clean; Opus audio fallback exercised — headless lacks AAC, real Chrome
      gets AAC); MediaRecorder fallback intact
- [x] tsc + eslint --max-warnings 0 silent; npm run build clean static
      export (out/ 2.7 MB); zero page errors through every browser round
- [x] Docs aligned (this section + BF-20..22 + worklog); danceV4.0.zip

## 17. V5.1 "THE GLAMOUR REBUILD" — ultra-realistic Diva 3.0 body

User verdict on V4/V5 girl: "still look so much like plastic mannequin /
plain — I want a glamour sexy hot girl" + "mp4 exported is a little
corrupted". Two-track scope: (A) transplant the AI's Diva 3.0 ultra-realistic
body as the rendering layer under our proven choreography engine; (B) kill
the last MP4 corruption sources.

### 17.1 ARCHITECTURE — engine/body split (the big idea)
- ProceduralDancingGirl.tsx is now the ENGINE WRAPPER ONLY: beat clock,
  51-move solo library, 16 partner duets, 10 spotlights, formations/sync,
  Reface-Law spin, slot travel, species accents, breathing — the exact group
  machinery from V3/V4 — damping the 41-channel JointTargets and writing one
  stable ExternalDivaPose snapshot per frame (zero allocation).
- DivaBody.tsx (from the AI's better_resources.zip girl_3d.ts, audited +
  integrated + improved) is the BODY: multi-layer SSS skin with procedural
  pore/Langer-line/vascularity DataTextures, sculpted craniofacial anatomy
  (brow ridge, nose, cheekbones, jaw, 3D ears + earrings), FACS 24-AU face
  with 7-mode blinks/winks/saccades/viseme lip-sync, refractive-layered eyes,
  28 lash + brow rig, couture wardrobe (sweetheart corset with gold boning +
  crystal brooch, dance shorts, 98-particle Verlet flared skirt + neon hem
  tube, gold jewelry), dual hair physics (32 spring locks + multi-chain
  Verlet ponytail/temple-locks with curl memory), soft-body bust/glute
  springs, breathing, analytical leg IK with soft-knee + heel-ball-toe roll,
  5-finger 3-phalange hands with ballet finger cascades.
- The bridge: ExternalDivaPose carries damped root/pelvis/spine/head/arm
  channels + SEMANTIC leg channels (footLift, legStepPitch, legStepRoll,
  hipYaw, ankleToePitch) + face intent/hair carriage/duet gaze. simulate()
  maps them onto its own skeleton at 120 Hz; spin velocity is reconstructed
  wrap-safe so hair/skirt centrifugal physics keep reacting to host turns.
- Tasteful glamour: explicit areolar anatomy meshes REMOVED, intimate
  under-layer hidden (its meshes + soft-body rebuilds skipped) — the corset
  bodice carries the look.

### 17.2 V5.1 CRITICAL FIXES (found by verification, see bugfix BF-23..27)
- BF-25 (THE big one): the AI cloth sim's meridian strain limiter wrote
  `pos[u3]` (upper particle's X) into the Y and Z slots — the skirt
  collapsed to the floor in one step (the "shattered skirt"). Byte-level
  hunt (display artifacts masked it in every read); fixed to u3+1/u3+2.
- BF-23: blendedPose null dereference on the bridge path killed the rAF
  loop (page froze at 1 fps when she mounted).
- BF-24 a/b/c: MP4 corruption trio — B-frame composition offsets (dts
  reconstructed from CFR arrival slots + explicit ctts), DPR-lock resize
  race (encoder created only after the canvas settles), mid-REC resize
  guard (any live size drift blit-scales through the scratch canvas).
- BF-26: performance — full-subtree updateWorldMatrix x2 per 120 Hz step
  (~4700 matrix compositions/frame) replaced with 5-bone chain updates;
  garment soft-body rebuilds moved from the fixed-step sim (x8 catch-up
  multiplier) to once-per-frame with dirty-check; hidden under-layer
  rebuilds skipped; sim cost 73.7 ms -> ~2.1-3.4 ms per frame.
- BF-27: realism — PMREM RoomEnvironment reflections on her PBR materials
  (skin 0.42 / hair 0.7 / corset 0.6 / boots 0.9 / gold 1.1 / crystal 1.3);
  transmission material replaced with glossy sparkle (kills the extra
  render pass); skin normal/bump/roughness softened; palette rebalanced.

### 17.3 V5.1 ACCEPTANCE CHECKLIST
- [x] Offline: tsc + eslint --max-warnings 0 silent; test_group_machine
      (0 role-parity, solo invariant 0); test_pose_path (51 solo + 16 duets
      x A/B + 10 spotlights + accents + hype: 0 violations); NEW
      test_diva_bridge (bridge semantics: IK reach envelopes, pelvis
      offsets, arm ranges, scale-multiplier regression, reface wrap safety:
      0 failures); test_girl_sims (new cloth + hair, 4000-step violent
      stress: 0 failures, hem holds 0.47-0.68 m); skirt collapse repro
      before/after (y floor 0.020 -> 0.63+)
- [x] Live: Diva renders in the club (292 meshes, hourglass silhouette,
      wine corset + plum flared skirt + black heeled boots + ponytail);
      dancing (pose changes across frames, move = figure_8_sway etc.);
      VLM glamour verdict on the best-framed burst: "attractive glamorous
      dancer, real human woman, classic diva look, no broken parts"; skirt
      = smooth flared cone (post-fix); zero console errors
- [x] Face close-up: brows, almond eyes with iris/pupil/catchlight, curved
      lashes, nose bridge/tip, glossy lips, segmented hair locks — sculpted
      (not mannequin); tuned skin tone/roughness after the first close-up
- [x] Perf: sim loop 2.1-3.4 ms/frame (was 73.7); cat-only baseline vs
      diva-mounted delta is small even in software GL
- [x] MP4: recorded a live WebCodecs export in-browser (blob captured via
      URL.createObjectURL hook, extracted, ffprobe + ffmpeg): h264 1280x576
      30/1 CFR exact timestamps, keyframe-first, Opus audio fallback
      working, decode + mid-file seek clean (headless only records ~4
      frames at 1 fps SwiftShader — structure verified, real-GPU rate
      verified in V4)
- [x] npm run build clean static export; zero debug routes/probes shipped
      (divatest removed, all __divaProbe/__divaPerf instrumentation
      stripped); docs aligned (this section + BF-23..27 + worklog)
- [x] Deliverable: download/danceV5.zip (source + plan + worklog + bugfix)

## 18. V6.0 SCOPE — "Solo Diva Sequins" (user-reported V5 feedback)
1. BF-28 MP4 2x-speed export: 2-min take -> video finishes in 1 min at 2x,
   last frame freezes while audio runs full length. REAL bug in the V5
   timestamp scheme (synthetic CFR stamps + dropped capture ticks).
2. BF-29 girl solo impossible: default cat cannot be removed once the diva
   is added (only "remove newest" existed).
3. BF-30 legs glitch outside the skirt during fast dance moves.
4. GLAM-2 glamour pass: sequin/ombré fabrics, two-tone couture, gloss
   makeup, patent boots, rose nails, gold hem.

## 19. V6.0 TECHNICAL DESIGN
### 19.1 BF-28 — real-time MP4 timestamps (mp4Recorder.ts)
- Frame pts = `performance.now() - t0` (µs, strictly increasing): video
  duration == audio duration == wall clock regardless of dropped ticks
  (backpressure guard, quality-mode lookahead, rAF stalls). Dropped ticks
  become VFR absences, never speed-ups.
- Reorder-safe dts: 6-deep decode-order window, `dts = min(window pts)`
  clamped strictly increasing, `ctts = max(0, pts - dts)`; B-frame-less
  encoders degrade to dts == pts, ctts == 0 (no ctts box).
- GOP in real time (`gopUs`), not frame count (a count-based GOP stretches
  when ticks drop). Backpressure threshold 10 -> 24.
### 19.2 BF-29 — on-stage roster (page.tsx)
- `handleRemoveDancer(index)` removes ANY slot (min 1 stays); the crew deck
  renders one chip per active dancer with its own x. Removing slot 0
  promotes the diva to lead (both rigs implement the dancerIndex === 0
  lead contract: beat-clock writer + group-director brain).
### 19.3 BF-30 — fresh leg capsules + radius audit (DivaBody.tsx)
- Before `writeCapsule`, chain-update `hip/knee/ankle.updateWorldMatrix
  (false, false)` per leg (6 compositions, ~0.003 ms) — capsules now match
  THIS 120 Hz step's IK instead of the last render frame.
- Thigh capsule 0.079 -> 0.086, hip ball 0.088 -> 0.095 (flexed thigh mesh
  worst case 0.098 m + 0.017 solver margin = 0.103 m = 5 mm cushion).
- New scripts/test_leg_cloth.ts: coverage invariant + 3.5 s fast-kick /
  squat / spin cloth drill (0.00 mm post-solve penetration).
### 19.4 GLAM-2 — sequin couture (DivaBody.tsx + ProceduralDancingGirl.tsx)
- makeSequinMaps(): 256x256 tileable atlas — albedo (base + champagne/
  rose-gold paillettes, hem-densified ombré) + G-roughness/B-metalness
  (mirror discs). Skirt: 32-across, 0.92 gold; bodice: 64-across, 0.5.
- New `skirtCoutureColor` prop restores the two-tone gown (wine corset over
  plum sequin skirt); hem trim neon -> gold; lip gloss / eyeshadow /
  patent boots / rose nails material bumps. See bugfix.md V6 GLAMOUR PASS.

## 20. V6.0 ACCEPTANCE CHECKLIST
- [x] Offline: tsc + eslint --max-warnings 0 silent; all harnesses green —
      test_group_machine (0 role-parity, 0 solo violations), test_pose_path,
      test_diva_bridge, test_girl_sims, test_skirt_repro, NEW
      test_leg_cloth (coverage 5.2/6.8/17.4 mm; 0.00 mm penetration through
      kicks + squat + spin)
- [x] BF-28 live: 9 s take at ~0.75 fps SwiftShader capture -> video track
      9.00 s (old code: 0.27 s = 33x); 8.1 s take with music -> video 8.10 s
      + audio track present; zero page errors
- [x] BF-29 live: roster `["Remove Cat 1"] -> ["Remove Cat 1","Remove Diva 2"]
      -> ["Remove Diva 1 from the stage"]`; diva dances solo, zero errors
- [x] BF-30 live: low-angle VLM across 3 mid-dance frames — no leg-through-
      skirt clipping anywhere; skirt a proper flared cone
- [x] GLAM-2 live: VLM confirms gold sparkle/metallic sequin sheen on the
      skirt, wine corset + belt + black boots readable, 3 distinct poses
- [x] npm run build clean static export (3 routes); docs aligned (this
      section + bugfix.md BF-28..30 + worklog Task ID 9)
- [x] Deliverable: download/danceV6.zip (source + plan + bugfix + worklog)
