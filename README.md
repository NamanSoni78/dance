# 🕺 Disco Cats — 3D Audio-Reactive Dance Party

**Live demo:** [dance.namansoli.in](https://dance.namansoli.in)

A browser-native 3D dance party: audio-reactive characters — from chunky neon cats to a couture-wearing realistic dancer — that choreograph themselves to your music, and a built-in recorder that exports a clean MP4 of the whole show. No backend, no uploads: everything renders and encodes on your GPU.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![three.js](https://img.shields.io/badge/three.js-R3F-white?logo=three.js) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript) ![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ What it does

- **🎵 Drop any track** — a built-in beat clock + 5-band Web Audio DSP (bass / low-mid / mid / high-mid / treble) drives every move. Characters literally dance *to* your song, not a canned loop.
- **🐱 A whole roster, not one model** — add and remove dancing cats and the realistic Diva on the fly; any solo, duet, or full-group lineup is one click away.
- **💃 51-move vocabulary** — a procedural dance engine with 51 solo moves, 16 duet formations, and 10 spotlights, plus group choreography (formations, slot travel, mirror mode, spin accumulators). Every performance is different.
- **👗 The Diva** — a fully procedural realistic dancer: cloth-simulated sequin skirt (98-particle Verlet solver with leg capsule collision), FACS-based facial animation, subsurface-scattering skin, refractive eyes, dual hair physics, and soft-body breathing.
- **🎬 Record to MP4** — WebCodecs + `mp4-muxer` capture the canvas and audio in real time. Video timestamps are wall-clock based, so what you record is exactly what you watched — audio and video always the same length. 100% client-side encoding, zero upload.

## 🛠 Tech stack

| Layer | Tools |
|---|---|
| Framework | Next.js 16 (App Router, 100% static export) · React 19 · TypeScript |
| 3D | three.js · @react-three/fiber · @react-three/drei |
| Audio | Web Audio API — AnalyserNode DSP, beat clock, multiband envelopes |
| Video | WebCodecs (VideoEncoder / AudioEncoder) · mp4-muxer |
| UI | Tailwind CSS · shadcn/ui · Radix primitives · lucide-react |

Runs as a fully static site — deploy it on any static host (Vercel, Netlify, GitHub Pages…). No server, no database, no API keys.

## 🚀 Quickstart

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build (static export to `out/`):

```bash
npm run build
npx serve out      # preview the export locally
```

Lint & typecheck:

```bash
npm run lint
npx tsc --noEmit
```

## 🎮 How to use

1. **Load a track** — pick a demo song or drop in your own audio file.
2. **Build your crew** — add cats / the Diva from the roster, remove anyone with ×, run a solo act if you like.
3. **Press Play** — the beat clock picks choreography (solos, duets, spotlights, group formations) driven by the live audio spectrum.
4. **Hit Record** — perform, stop, and download the MP4. Duration always matches wall-clock playback; audio is muxed in.

## 📁 Project layout

```
src/
├── app/                      # Next.js App Router (static export)
├── components/
│   ├── DivaBody.tsx          # procedural realistic dancer (skin/face/cloth/glam)
│   ├── ProceduralDancingGirl.tsx  # engine → Diva bridge (beat clock, damping)
│   └── ProceduralDancingCat.tsx   # neon low-poly dancing cat
├── lib/
│   ├── danceMoves.ts         # 51-move vocabulary + MoveContext
│   ├── choreographer.ts      # duets, spotlights, group formations
│   ├── species.ts            # per-species accents & palettes
│   ├── girlCloth.ts          # Verlet skirt sim + leg capsule collision
│   ├── mp4Recorder.ts        # WebCodecs canvas/audio → MP4 muxing
│   └── …                     # beat clock, DSP, audio engine
└── scripts/                  # offline test harnesses (excluded from build)
```

## 🔬 Engineering notes

- **Zero-allocation render loop** — the dance engine mutates shared pose buffers in place; the Diva's 120 Hz cloth/body simulation never allocates per frame.
- **Real-time-safe MP4 timestamps** — video frames are stamped on a wall-clock recording timebase with CFR slot reconstruction, so slow render loops can't compress time (the classic "2× speed video" bug) or desync from audio.
- **Cloth that respects legs** — thigh/shin/boot capsules are rebuilt from the IK-solved skeleton every cloth step; the Verlet solver projects skirt particles out of them, so legs never glitch through the gown.
- **Static-first** — every feature (audio, 3D, encoding) runs client-side; the site is a plain static bundle behind a CDN.

## 🧪 Offline test harnesses

The `scripts/` folder contains tsx-run harnesses for the pure-logic parts of the engine (group choreography state machine, pose paths, the 51-move library through the bridge semantics, cloth/leg-collision drills). They are excluded from the app build.

```bash
npx tsx scripts/test_group_machine.ts
```

## 📜 License

MIT — do what you want, attribution appreciated.

---

Made with 🪩 by [Naman Soli](https://namansoli.in) — music in, cats out.
