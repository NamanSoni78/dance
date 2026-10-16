'use client';

/**
 * ============================================================================
 * DANCE CAT 3D — MAIN STUDIO PAGE  (dance.namansoni.in)
 * ============================================================================
 * ARCHITECTURE LAWS ENFORCED HERE:
 *  - "Zero React Re-Render" rule: 60 FPS FFT values (bass/mid/high/isBeat)
 *    NEVER enter React state. A memoized `getMetrics` callback is read inside
 *    R3F's useFrame, and one requestAnimationFrame loop drives the 2D HUD
 *    (equalizer bars, beat LED, BPM badge, seek bar) via direct
 *    `ref.current.style` mutations — zero component re-renders per frame.
 *  - 100% client-side: MP3s are loaded via URL.createObjectURL + FileReader
 *    in browser memory. Nothing is ever uploaded to a server.
 *  - V2 GROUP CREW: up to 4 animals (cat/dog/mouse) directed by the shared
 *    groupDirector — formations, sync modes and interactions.
 *  - V2 RECORDING V3: preserveDrawingBuffer + DPR lock + requestFrame-driven
 *    capture = clean, glitch-free MP4 exports.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  ProceduralDancingCat,
  type DanceStyle,
  type AudioMetrics,
} from '@/components/ProceduralDancingCat';
import { ProceduralDancingGirl } from '@/components/ProceduralDancingGirl';
import {
  ProceduralClubStage,
  type CameraMode,
} from '@/components/ProceduralClubStage';
import {
  createZeroAllocAudioController,
  type ExtendedAudioController,
} from '@/lib/audioEngine';
import { DANCE_STYLE_PILLS } from '@/lib/danceStyleMapping';
import {
  getLeadChoreographer,
  cameraSequencer,
  groupDirector,
  showState,
} from '@/lib/danceRuntime';
import {
  SPECIES_ORDER,
  SPECIES_PRESETS,
  type SpeciesId,
} from '@/lib/species';
import type { Formation, SyncMode } from '@/lib/groupDance';
import { requestStageLook } from '@/lib/showDirector';
import {
  createMp4Recorder,
  type Mp4RecorderHandle,
} from '@/lib/mp4Recorder';
import {
  AudioLines,
  Circle,
  Disc3,
  Music2,
  Pause,
  Play,
  Square,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';

// ============================================================================
// ZERO-ALLOCATION FALLBACKS (used before the controller exists / on SSR)
// ============================================================================
const ZERO_METRICS: AudioMetrics = {
  bass: 0,
  mid: 0,
  high: 0,
  overall: 0,
  isBeat: false,
  bpm: 128,
  isPlaying: false,
};
const EMPTY_FREQ = new Uint8Array(1024);

const CAMERA_MODES: { id: CameraMode; label: string }[] = [
  { id: 'ORBIT', label: 'Orbit' },
  { id: 'DYNAMIC_AUTO', label: 'Auto Director' },
  { id: 'FRONT_STAGE', label: 'Front' },
  { id: 'HERO_LOW', label: 'Low B-Boy' },
  { id: 'DJ_OVERHEAD', label: 'Overhead' },
];

// V2 GROUP CREW decks
const FORMATION_MODES: { id: Formation; label: string }[] = [
  { id: 'AUTO', label: 'Auto' },
  { id: 'LINE', label: 'Line' },
  { id: 'ARC', label: 'Arc' },
  { id: 'DIAMOND', label: 'Diamond' },
  { id: 'CIRCLE', label: 'Circle' },
];

const SYNC_MODES: { id: SyncMode; label: string }[] = [
  { id: 'AUTO', label: 'Auto' },
  { id: 'UNISON', label: 'Unison' },
  { id: 'CANON', label: 'Canon' },
  { id: 'MIRROR', label: 'Mirror' },
  { id: 'FREESTYLE', label: 'Freestyle' },
];

const VIBE_PILLS: { id: string; label: string }[] = [
  { id: 'AUTO', label: 'Auto' },
  { id: 'DIWALI_MELA', label: 'Diwali Mela' },
  { id: 'HOLI_RAVE', label: 'Holi Rave' },
  { id: 'NEON_BHANGRA', label: 'Neon Bhangra' },
  { id: 'SYNTHWAVE_SUNSET', label: 'Synthwave' },
  { id: 'NEO_TOKYO', label: 'Neo Tokyo' },
  { id: 'ICE_CLUB', label: 'Ice Club' },
];

const MAX_CREW = 4;

/** Initial LINE-formation slot for a dancer's mount transform (the engine's
 *  slot damping takes over from the first frame). */
function initialLineSlot(i: number, n: number): [number, number, number] {
  const half = (n - 1) * 0.5;
  return [(i - half) * 1.7, 0, 0];
}

// ----------------------------------------------------------------------------
// V3 RECORDING V4 (BF-19) — CONSTANT FRAME RATE capture tap.
// Recording V3 emitted one video frame per RENDERED frame, which produced a
// variable-frame-rate MP4: whenever render fps dipped or jittered (heavy
// scene, GC, 4-dancer crew), frame timestamps bunched up and players showed
// the "stuck / laggy" stutter. Recording V4 captures at a FIXED 30 fps via a
// drift-compensated accumulator:
//   - requestFrame fires only when ≥1/30 s has elapsed since the last capture
//     (fixed-step schedule — a late frame does NOT slide the grid)
//   - a stall longer than 2 frames (GC hitch / tab background) RESYNCS to now
//     instead of burst-capturing a fan of stale frames
//   - 30 fps at the same 16 Mbps = 2× the per-frame bitrate budget = cleaner
//     motion at the same file size, and every player smooths 30 fps CFR video
// ----------------------------------------------------------------------------
const REC_FPS = 30;
const REC_FRAME_MS = 1000 / REC_FPS;
const recGlobals = {
  active: false,
  /** MediaRecorder path: manual-frame capture track. */
  track: null as CanvasCaptureMediaStreamTrack | null,
  /** V4 RECORDING V5 (WebCodecs) path: direct capture callback. */
  capture: null as ((canvas: HTMLCanvasElement) => void) | null,
  nextCaptureAt: 0,
};

const RecordFrameTap: React.FC = () => {
  useFrame(() => {
    if (!recGlobals.active) return;
    if (!recGlobals.track && !recGlobals.capture) return;
    const now = performance.now();
    // First frame: capture immediately so the stream opens on a fresh frame
    if (recGlobals.nextCaptureAt === 0) recGlobals.nextCaptureAt = now;
    if (now >= recGlobals.nextCaptureAt) {
      if (recGlobals.capture) {
        // V5: WebCodecs path — the callback builds a VideoFrame straight
        // from the canvas (same CFR grid, no captureStream at all).
        const canvas = document.querySelector('canvas');
        if (canvas) recGlobals.capture(canvas as HTMLCanvasElement);
      } else if (recGlobals.track) {
        recGlobals.track.requestFrame();
      }
      // Fixed-step advance (drift-compensated): late renders never slide the
      // 33.33 ms capture grid.
      recGlobals.nextCaptureAt += REC_FRAME_MS;
      // If we fell behind by more than 2 capture periods (stall / GC), resync
      // ahead instead of firing a burst of stale frames.
      if (recGlobals.nextCaptureAt < now - REC_FRAME_MS * 2) {
        recGlobals.nextCaptureAt = now + REC_FRAME_MS * 0.5;
      }
    }
  });
  return null;
};

const AUDIO_EXT_RE = /\.(mp3|wav|ogg|flac|m4a|aac|opus|weba|webm)$/i;

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function DanceCatStudioPage() {
  const [mounted, setMounted] = useState(false);

  // UI states — ONLY updated on explicit user actions / track loads,
  // never from the 60 FPS audio loop.
  const [forcedStyle, setForcedStyle] = useState<DanceStyle>('AUTO');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [trackTitle, setTrackTitle] = useState('Demo Beat — 128 BPM Club Synth');
  const [hasFile, setHasFile] = useState(false);
  const [detectedBpm, setDetectedBpm] = useState(128);
  const [isPlayingUi, setIsPlayingUi] = useState(false);
  const [volumeUi, setVolumeUi] = useState(0.85);
  const [synthBpmUi, setSynthBpmUi] = useState(128);
  const [soundHint, setSoundHint] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [demoActive, setDemoActive] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  // V1.5: the show directs itself by default — the user loves the cinematic
  // auto director, and the wide-by-default V1.5 shots are the star of the app.
  // ORBIT stays one click away and remains 100% user-owned when selected.
  const [cameraMode, setCameraMode] = useState<CameraMode>('DYNAMIC_AUTO');

  // V2 GROUP CREW — dancer list (species per slot), formation / sync / vibe
  const [dancers, setDancers] = useState<SpeciesId[]>(['CAT']);
  const [formation, setFormation] = useState<Formation>('AUTO');
  const [syncMode, setSyncMode] = useState<SyncMode>('AUTO');
  const [vibe, setVibe] = useState('AUTO');
  // V2 RECORDING V3 — DPR lock while recording (kills hi-DPI bitrate starvation)
  const [recDprLock, setRecDprLock] = useState(false);

  // Singleton zero-allocation audio controller (client only)
  const audioCtrlRef = useRef<ExtendedAudioController | null>(null);
  const audioStartedRef = useRef(false);
  const kickAudioRef = useRef<() => Promise<void>>(async () => {});

  // Recording state (MediaRecorder is event-driven, not per-frame)
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStartMsRef = useRef(0);
  // V4 RECORDING V5: active WebCodecs handle (null = MediaRecorder / idle)
  const mp4RecRef = useRef<Mp4RecorderHandle | null>(null);

  const canRecord = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      (typeof VideoEncoder !== 'undefined' ||
        (typeof MediaRecorder !== 'undefined' &&
          typeof HTMLCanvasElement.prototype.captureStream === 'function')),
    []
  );

  const fileInputRef = useRef<HTMLInputElement>(null!);
  const dragDepthRef = useRef(0);

  // Direct DOM refs for the 60 FPS HUD (zero React state updates!)
  const bassBarRef = useRef<HTMLDivElement>(null);
  const midBarRef = useRef<HTMLDivElement>(null);
  const highBarRef = useRef<HTMLDivElement>(null);
  const beatDotRef = useRef<HTMLDivElement>(null);
  const bpmTextRef = useRef<HTMLSpanElement>(null);
  const seekTrackRef = useRef<HTMLDivElement>(null);
  const seekFillRef = useRef<HTMLDivElement>(null);
  const seekKnobRef = useRef<HTMLDivElement>(null);
  const timeCurRef = useRef<HTMLSpanElement>(null);
  const timeDurRef = useRef<HTMLSpanElement>(null);
  // Live "Now dancing / Camera / Vibe" readout (zero-re-render, DOM-rAF driven)
  const hudMoveRef = useRef<HTMLSpanElement>(null);
  const hudShotRef = useRef<HTMLSpanElement>(null);
  const hudVibeRef = useRef<HTMLSpanElement>(null);
  const hudCrewRef = useRef<HTMLSpanElement>(null);
  const recTimerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getController = useCallback((): ExtendedAudioController | null => {
    if (typeof window === 'undefined') return null;
    if (!audioCtrlRef.current) {
      audioCtrlRef.current = createZeroAllocAudioController();
    }
    return audioCtrlRef.current;
  }, []);

  // Stable zero-allocation callbacks passed into the R3F Canvas children
  const getMetrics = useCallback((): AudioMetrics => {
    const ctrl = audioCtrlRef.current;
    return ctrl ? ctrl.getMetrics() : ZERO_METRICS;
  }, []);

  const getRawFrequencyData = useCallback((): Uint8Array => {
    const ctrl = audioCtrlRef.current;
    return ctrl ? ctrl.getRawFrequencyData() : EMPTY_FREQ;
  }, []);

  // --------------------------------------------------------------------------
  // V2 GROUP CREW — push crew changes into the shared director + camera
  // --------------------------------------------------------------------------
  useEffect(() => {
    groupDirector.setDancerCount(dancers.length);
    groupDirector.setCrewSpecies(dancers); // V3: spotlight signature selection
    cameraSequencer.setGroupBias(dancers.length);
  }, [dancers]);

  useEffect(() => {
    groupDirector.setFormation(formation);
  }, [formation]);

  useEffect(() => {
    groupDirector.setSync(syncMode);
  }, [syncMode]);

  // --------------------------------------------------------------------------
  // V3 PHONE TIER + FX LEVEL + DECK COLLAPSE
  // The tier is computed ONCE on mount: phones (< 640 px CSS width or a
  // coarse pointer) get the Lite FX level, a capped DPR and a COLLAPSED
  // control deck so the first thing you see is the full-stage show — the
  // compact bar (Play + REC + expand) is one thumb-tap away.
  // --------------------------------------------------------------------------
  const [isPhoneTier, setIsPhoneTier] = useState(false);
  const [fxLevel, setFxLevel] = useState(2); // 1 = Lite · 2 = Full
  const [deckOpen, setDeckOpen] = useState(true);

  useEffect(() => {
    const coarse =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const phone = coarse || window.innerWidth < 640;
    setIsPhoneTier(phone);
    setFxLevel(phone ? 1 : 2);
    setDeckOpen(!phone);
  }, []);

  // --------------------------------------------------------------------------
  // INSTANT DEMO BEAT: try audible autoplay on load; fall back to the first
  // user gesture when the browser's autoplay policy blocks sound.
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!mounted) return;
    let disposed = false;

    const hintTimer = window.setTimeout(() => {
      if (!audioStartedRef.current && !disposed) setSoundHint(true);
    }, 1400);

    const onGesture = (e: Event) => {
      // Space is handled by the dedicated keyboard shortcut below
      if (e.type === 'keydown' && (e as KeyboardEvent).code === 'Space') return;
      // Pointer presses on interactive controls (Play, pills, sliders, upload
      // label) must NOT race the control's own action with a synth kick.
      if (e.type === 'pointerdown') {
        const el = e.target as HTMLElement | null;
        if (el && el.closest('button, input, label, a, select, textarea')) {
          return;
        }
      }
      void kickAudioRef.current();
    };

    const kick = async () => {
      const ctrl = getController();
      if (!ctrl || audioStartedRef.current) return;
      // A song file is already loaded: playback is the user's explicit
      // choice (Play button / Space), not an ambient demo-beat kick.
      if (ctrl.getPlaybackInfo().mode === 'FILE') return;
      const ok = await ctrl.tryStartBuiltInSynth(128);
      if (ok && !disposed) {
        audioStartedRef.current = true;
        setDemoActive(false);
        setSoundHint(false);
        const info = ctrl.getPlaybackInfo();
        setIsPlayingUi(info.isPlaying);
        setTrackTitle(info.trackName);
        window.removeEventListener('pointerdown', onGesture);
        window.removeEventListener('keydown', onGesture);
      }
    };
    kickAudioRef.current = kick;

    void kick(); // attempt instant autoplay (works with prior media engagement)
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);

    return () => {
      disposed = true;
      window.clearTimeout(hintTimer);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [mounted, getController]);

  // --------------------------------------------------------------------------
  // TRANSPORT HANDLERS (all user-gesture driven)
  // --------------------------------------------------------------------------
  const syncUiFromEngine = useCallback(() => {
    const ctrl = getController();
    if (!ctrl) return;
    const info = ctrl.getPlaybackInfo();
    setIsPlayingUi(info.isPlaying);
    setTrackTitle(info.trackName);
    if (info.isPlaying) {
      audioStartedRef.current = true;
      setDemoActive(false);
      setSoundHint(false);
      if (info.mode === 'FILE') setHasFile(true);
    }
  }, [getController]);

  // Keep the transport UI honest when playback changes outside direct user
  // actions: natural song end, hardware media keys, tab audio indicators.
  useEffect(() => {
    if (!mounted) return;
    const ctrl = getController();
    if (!ctrl) return;
    ctrl.setOnPlaybackChange(() => syncUiFromEngine());
    return () => ctrl.setOnPlaybackChange(null);
  }, [mounted, getController, syncUiFromEngine]);

  const handleTogglePlay = useCallback(async () => {
    const ctrl = getController();
    if (!ctrl) return;
    await ctrl.togglePlay();
    syncUiFromEngine();
  }, [getController, syncUiFromEngine]);

  const handleDemoBeat = useCallback(async () => {
    const ctrl = getController();
    if (!ctrl) return;
    const ok = await ctrl.tryStartBuiltInSynth(synthBpmUi);
    if (ok) syncUiFromEngine();
  }, [getController, synthBpmUi, syncUiFromEngine]);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3400);
  }, []);

  // V2 GROUP CREW handlers (defined after showNotice — no TDZ)
  const handleAddDancer = useCallback(
    (sp: SpeciesId) => {
      setDancers((prev) => {
        if (prev.length >= MAX_CREW) {
          showNotice('Crew is full — 4 dancers max on this stage.');
          return prev;
        }
        return [...prev, sp];
      });
    },
    [showNotice]
  );

  // V6 BF-29: remove ANY dancer by slot — the default cat included. The old
  // UI could only pop the newest dancer, so a stage that started with the
  // cat could never become a girl solo (the user's exact report). Every
  // on-stage chip now carries its own ×.
  const handleRemoveDancer = useCallback(
    (index: number) => {
      setDancers((prev) => {
        if (prev.length <= 1) {
          showNotice('Someone has to dance — keep at least one.');
          return prev;
        }
        if (index < 0 || index >= prev.length) return prev;
        const next = prev.slice();
        next.splice(index, 1);
        return next;
      });
    },
    [showNotice]
  );

  const handleVibePill = useCallback((id: string) => {
    setVibe(id);
    requestStageLook(id);
  }, []);

  // Stable mount transforms per crew lineup (a fresh array every render would
  // re-apply the position prop on unrelated re-renders — e.g. dragging the
  // volume slider — and snap the dancers back to their LINE slots)
  const initialSlots = useMemo(
    () => dancers.map((_, i) => initialLineSlot(i, dancers.length)),
    [dancers]
  );

  const handleFile = useCallback(
    async (file: File) => {
      const ctrl = getController();
      if (!ctrl) return;
      const isAudio =
        file.type.startsWith('audio/') || AUDIO_EXT_RE.test(file.name);
      if (!isAudio) {
        showNotice('That is not an audio file — drop an MP3, WAV or OGG.');
        return;
      }
      setIsAnalyzing(true);
      try {
        const bpm = await ctrl.loadFile(file);
        setDetectedBpm(bpm);
        setHasFile(true);
        syncUiFromEngine();
      } catch {
        showNotice('Could not decode that file. Try another MP3.');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [getController, syncUiFromEngine, showNotice]
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = ''; // allow re-picking the same file
  };

  // --------------------------------------------------------------------------
  // DRAG & DROP ANYWHERE
  // --------------------------------------------------------------------------
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  };

  // --------------------------------------------------------------------------
  // INTERACTIVE SONG SCRUBBER (pointer scrubbing, seek via engine)
  // --------------------------------------------------------------------------
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const ctrl = getController();
      const el = seekTrackRef.current;
      if (!ctrl || !el) return;
      const info = ctrl.getPlaybackInfo();
      if (info.duration <= 0) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      ctrl.seek(ratio * info.duration);
    },
    [getController]
  );

  const onSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };
  const onSeekPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.buttons & 1) !== 0) seekFromClientX(e.clientX);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolumeUi(v);
    getController()?.setVolume(v);
  };

  const handleSynthBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const b = Number(e.target.value);
    setSynthBpmUi(b);
    getController()?.setSynthBpm(b);
  };

  const handleMuteToggle = () => {
    const next = volumeUi > 0 ? 0 : 0.85;
    setVolumeUi(next);
    getController()?.setVolume(next);
  };

  // --------------------------------------------------------------------------
  // RECORD & EXPORT — V2 RECORDING V3: glitch-free MP4 clip export
  // (100% client-side: the video never leaves the user's device)
  //
  // V1 exported corrupted WebM (missing Duration metadata — BF-11). V1.5
  // added MP4 + a WebM duration repair, but users still saw occasional
  // glitch / distortion artifacts. V3 kills the three remaining root causes
  // (BF-16):
  //   1. TORN FRAMES — the WebGL canvas was captured without
  //      `preserveDrawingBuffer`, so the compositor could tap a cleared
  //      buffer. The Canvas now always keeps its drawing buffer.
  //   2. MACROBLOCKING — hi-DPI screens rendered the canvas at up to 2x CSS
  //      pixels (e.g. 3840x2160) while the encoder ran at 12 Mbps = starved
  //      bitrate. The Canvas DPR is now locked to 1 for the duration of the
  //      recording and the MP4 bitrate raised to 16 Mbps.
  //   3. FRAME PACING — `captureStream(60)` duplicates / drops frames
  //      arbitrarily. Now `captureStream(0)` + one `requestFrame()` per
  //      rendered frame (RecordFrameTap inside the Canvas) = every recorded
  //      frame is a complete composited frame, with MediaRecorder handling
  //      the variable-frame-rate timestamps.
  // --------------------------------------------------------------------------
  const pickRecordingFormat = (): { mime: string; ext: 'mp4' | 'webm'; isMp4: boolean } => {
    const mp4Candidates = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2', // H.264 High + AAC-LC
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // H.264 Baseline + AAC-LC
      'video/mp4;codecs=avc1',
      'video/mp4',
    ];
    const webmCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (let i = 0; i < mp4Candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(mp4Candidates[i])) {
        return { mime: mp4Candidates[i], ext: 'mp4', isMp4: true };
      }
    }
    for (let i = 0; i < webmCandidates.length; i++) {
      if (MediaRecorder.isTypeSupported(webmCandidates[i])) {
        return { mime: webmCandidates[i], ext: 'webm', isMp4: false };
      }
    }
    return { mime: '', ext: 'webm', isMp4: false };
  };

  const downloadRecordingBlob = (blob: Blob, ext: 'mp4' | 'webm') => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dance-crew-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Blob URL lifecycle law: revoke after the download has been handed off
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
  };

  const handleRecordToggle = useCallback(async () => {
    // ---- STOP: V5 WebCodecs active recording → finalize the MP4 ----------
    const mp4Handle = mp4RecRef.current;
    if (mp4Handle) {
      recGlobals.active = false;
      recGlobals.capture = null;
      recGlobals.track = null;
      recGlobals.nextCaptureAt = 0;
      setRecDprLock(false); // restore hi-DPI rendering
      setIsRecording(false);
      mp4RecRef.current = null;
      showNotice('Finishing .mp4 export…');
      try {
        const blob = await mp4Handle.stop();
        downloadRecordingBlob(blob, 'mp4');
        showNotice('Recording saved as .mp4 — 1-second keyframes, seek-safe in every player.');
      } catch {
        showNotice('MP4 export failed — try recording again.');
      }
      return;
    }

    // ---- STOP: MediaRecorder path (double-stop guarded) ------------------
    const rec = recorderRef.current;
    if (rec) {
      if (rec.state === 'recording' || rec.state === 'paused') rec.stop();
      return;
    }

    const canvas = document.querySelector('canvas');
    const ctrl = getController();
    if (!canvas || !ctrl) return;

    // ---- START: V4 RECORDING V5 (WebCodecs) — the preferred path ----------
    // Native VideoEncoder with an explicit 1 s IDR GOP + AudioEncoder PCM
    // track, muxed by mp4-muxer (BF-20 — the VLC random-seek fix). Any
    // unsupported config falls through to the MediaRecorder path below.
    if (
      typeof VideoEncoder !== 'undefined' &&
      typeof ctrl.attachPcmTap === 'function' &&
      typeof ctrl.getPcmSampleRate === 'function'
    ) {
      let handle: Mp4RecorderHandle | null = null;
      try {
        // BF-24b: lock the canvas to the recording DPR FIRST and wait for
        // the resize to LAND before creating the encoder. V4 read the canvas
        // size at the old DPR (2x on retina) while every captured frame
        // arrived at the locked 1x size — an encoder configured for the
        // wrong dimensions is the classic "file plays but has glitch
        // frames" corruption. Settle = canvas width identical across two
        // consecutive animation frames (bounded wait, instant at dpr 1).
        setRecDprLock(true);
        const canvasEl = canvas as HTMLCanvasElement;
        let lastW = -1;
        let stableFrames = 0;
        for (let i = 0; i < 40; i++) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          if (canvasEl.width === lastW) {
            stableFrames++;
            if (stableFrames >= 2 && i >= 1) break;
          } else {
            stableFrames = 0;
            lastW = canvasEl.width;
          }
        }
        handle = await createMp4Recorder({
          canvas: canvasEl,
          fps: REC_FPS,
          gopSeconds: 1.0,
          videoBitrate: 16_000_000,
          attachPcmTap: (cb) => ctrl.attachPcmTap(cb),
          getPcmSampleRate: () => ctrl.getPcmSampleRate(),
          onError: (m) => showNotice(`Recorder: ${m}`),
        });
      } catch {
        handle = null;
      }
      if (handle) {
        mp4RecRef.current = handle;
        recGlobals.track = null;
        recGlobals.capture = handle.onCapture;
        recGlobals.nextCaptureAt = 0;
        recGlobals.active = true;
        recStartMsRef.current = performance.now();
        setIsRecording(true);
        return;
      }
      // WebCodecs path unavailable — release the DPR lock so the fallback
      // records at the same fidelity as before.
      setRecDprLock(false);
    }

    const fmt = pickRecordingFormat();
    if (!fmt.mime) {
      showNotice('Recording is not supported in this browser.');
      return;
    }

    // V3: frame-perfect capture — captureStream(0) + requestFrame() per
    // rendered frame when the browser supports it, else classic captureStream(60)
    let videoStream: MediaStream;
    let manualFrameCapture = false;
    try {
      videoStream = (canvas as HTMLCanvasElement).captureStream(0);
      const vTrack = videoStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      if (vTrack && typeof vTrack.requestFrame === 'function') {
        manualFrameCapture = true;
      } else {
        videoStream.getTracks().forEach((tr) => tr.stop());
        videoStream = (canvas as HTMLCanvasElement).captureStream(60);
      }
    } catch {
      videoStream = (canvas as HTMLCanvasElement).captureStream(60);
    }

    // Audio tap from the DSP engine (pre-volume analyser tap, so exports
    // keep full music even if muted)
    const audioStream = ctrl.getRecordingStream();
    const tracks: MediaStreamTrack[] =
      audioStream !== null
        ? [...videoStream.getVideoTracks(), ...audioStream.getAudioTracks()]
        : videoStream.getVideoTracks();
    const combined = new MediaStream(tracks);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(combined, {
        mimeType: fmt.mime,
        // V3: 16 Mbps H.264 at DPR 1 (≤1080p-class canvas) = transparent quality
        videoBitsPerSecond: fmt.isMp4 ? 16_000_000 : 12_000_000,
        audioBitsPerSecond: 192_000,
      });
    } catch {
      videoStream.getTracks().forEach((tr) => tr.stop());
      showNotice('Could not start the recorder.');
      return;
    }

    recChunksRef.current = [];
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) recChunksRef.current.push(e.data);
    };
    recorder.onerror = () => {
      showNotice('Recording hiccup — the clip may be incomplete.');
    };
    recorder.onstop = () => {
      // V4: stop the frame tap FIRST, then release the capture tracks
      recGlobals.active = false;
      recGlobals.track = null;
      recGlobals.capture = null;
      recGlobals.nextCaptureAt = 0;
      videoStream.getTracks().forEach((tr) => tr.stop());
      setRecDprLock(false); // restore hi-DPI rendering

      const chunks = recChunksRef.current;
      recChunksRef.current = [];
      recorderRef.current = null;
      setIsRecording(false);

      if (chunks.length === 0) {
        showNotice('Recording was empty — nothing to save.');
        return;
      }
      const rawBlob = new Blob(chunks, { type: fmt.mime });
      if (rawBlob.size === 0) {
        showNotice('Recording was empty — nothing to save.');
        return;
      }

      if (fmt.isMp4) {
        // MP4 muxed in ONE piece on stop: moov/duration/seek data is complete.
        downloadRecordingBlob(rawBlob, 'mp4');
        showNotice('Recording saved as .mp4 — check your downloads.');
        return;
      }

      // WebM fallback: repair the missing Duration element so every player
      // sees a healthy, seekable file. Lazy import keeps the fixer out of the
      // initial JS bundle; any failure falls back to the raw blob (BF-11).
      showNotice('Finishing .webm export…');
      void (async () => {
        try {
          const fixer = await import('webm-duration-fix');
          const fixed = await fixer.default(rawBlob);
          downloadRecordingBlob(fixed, 'webm');
          showNotice('Recording saved as .webm (duration repaired) — check downloads.');
        } catch {
          downloadRecordingBlob(rawBlob, 'webm');
          showNotice('Recording saved as .webm — check your downloads.');
        }
      })();
    };

    // MP4: single-mux capture (no timeslice) for a clean, complete moov atom.
    // WebM: 500 ms chunks so long recordings stay memory-flat and crash-safe.
    if (fmt.isMp4) recorder.start();
    else recorder.start(500);

    // V4: arm the CFR frame tap + lock DPR to 1 (bitrate-matched canvas).
    // nextCaptureAt = 0 makes the tap fire on its very next frame so the
    // stream opens on a fresh capture (zero-stale first frame).
    if (manualFrameCapture) {
      recGlobals.track =
        videoStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      recGlobals.capture = null;
      recGlobals.nextCaptureAt = 0;
      recGlobals.active = true;
    }
    setRecDprLock(true);

    recorderRef.current = recorder;
    recStartMsRef.current = performance.now();
    setIsRecording(true);
  }, [getController, showNotice]);

  // --------------------------------------------------------------------------
  // SPACE = PLAY/PAUSE KEYBOARD SHORTCUT
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.tagName === 'BUTTON' ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (audioStartedRef.current) {
        void handleTogglePlay();
      } else {
        void kickAudioRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mounted, handleTogglePlay]);

  // --------------------------------------------------------------------------
  // ZERO-RE-RENDER 2D HUD LOOP (EQ bars, beat LED, BPM, seek bar, times)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!mounted) return;
    let rafId = 0;
    let lastBpm = '';
    let lastCur = '';
    let lastDur = '';
    let lastMoveId = '';
    let lastShotId = '';
    let lastRecLabel = '';
    let lastVibe = '';
    let lastCrew = '';
    const crewSummary = { text: 'Solo' };

    const tick = () => {
      const ctrl = audioCtrlRef.current;
      if (ctrl) {
        const m = ctrl.getMetrics();

        // Mini equalizer bars (direct DOM style writes)
        if (bassBarRef.current)
          bassBarRef.current.style.height = `${Math.max(6, m.bass * 100)}%`;
        if (midBarRef.current)
          midBarRef.current.style.height = `${Math.max(6, m.mid * 100)}%`;
        if (highBarRef.current)
          highBarRef.current.style.height = `${Math.max(6, m.high * 100)}%`;

        // Beat LED
        if (beatDotRef.current) {
          beatDotRef.current.style.transform = m.isBeat
            ? 'scale(1.6)'
            : 'scale(1)';
          beatDotRef.current.style.opacity = m.isBeat ? '1' : '0.35';
          beatDotRef.current.style.boxShadow = m.isBeat
            ? '0 0 12px rgba(52, 211, 153, 0.95)'
            : 'none';
        }

        // Live BPM badge (only touch the DOM when the value changes)
        const bpmStr = String(Math.round(m.bpm));
        if (bpmStr !== lastBpm) {
          lastBpm = bpmStr;
          if (bpmTextRef.current) bpmTextRef.current.textContent = bpmStr;
        }

        // Transport / seek bar
        const info = ctrl.getPlaybackInfo();
        if (info.duration > 0) {
          const pct = `${(info.currentTime / info.duration) * 100}%`;
          if (seekFillRef.current) seekFillRef.current.style.width = pct;
          if (seekKnobRef.current) seekKnobRef.current.style.left = pct;
          if (seekTrackRef.current) {
            seekTrackRef.current.style.opacity = '1';
            seekTrackRef.current.style.pointerEvents = 'auto';
            seekTrackRef.current.setAttribute(
              'aria-valuenow',
              String(Math.round((info.currentTime / info.duration) * 100))
            );
          }
          const cur = fmtTime(info.currentTime);
          if (cur !== lastCur) {
            lastCur = cur;
            if (timeCurRef.current) timeCurRef.current.textContent = cur;
          }
          const dur = fmtTime(info.duration);
          if (dur !== lastDur) {
            lastDur = dur;
            if (timeDurRef.current) timeDurRef.current.textContent = dur;
          }
        } else {
          if (seekTrackRef.current) {
            seekTrackRef.current.style.opacity = '0.45';
            seekTrackRef.current.style.pointerEvents = 'none';
          }
          if (seekFillRef.current) seekFillRef.current.style.width = '0%';
          if (seekKnobRef.current) seekKnobRef.current.style.left = '0%';
          const live = 'LIVE';
          if (lastCur !== live) {
            lastCur = live;
            if (timeCurRef.current) timeCurRef.current.textContent = live;
          }
          if (lastDur !== live) {
            lastDur = live;
            if (timeDurRef.current) timeDurRef.current.textContent = live;
          }
        }
      }

      // Live "Now dancing / Camera shot / Vibe" readout — textContent is only
      // touched when the active move/shot/look actually changes (every few bars)
      // V3: during DUET_CONTACT / SPECIES_SPOTLIGHT the readout shows the
      // authored partner choreography / signature solo instead of the lead
      // choreographer's (frozen) solo move.
      const choreo = groupDirector.getChoreoState();
      let moveLabel = getLeadChoreographer().getActiveMove().name;
      let moveKey = 'solo:' + getLeadChoreographer().getActiveMove().id;
      if (choreo.mode === 'DUET_CONTACT' && choreo.duet !== null) {
        moveLabel = 'Duet — ' + choreo.duet.name;
        moveKey = 'duet:' + choreo.duet.id;
      } else if (choreo.mode === 'SPECIES_SPOTLIGHT' && choreo.signature !== null) {
        moveLabel = 'Spotlight — ' + choreo.signature.name;
        moveKey = 'spot:' + choreo.signature.id;
      }
      if (moveKey !== lastMoveId) {
        lastMoveId = moveKey;
        if (hudMoveRef.current) hudMoveRef.current.textContent = moveLabel;
      }
      const shotId = cameraSequencer.getActiveShotId();
      if (shotId !== lastShotId) {
        lastShotId = shotId;
        if (hudShotRef.current)
          hudShotRef.current.textContent = cameraSequencer.getActiveShotName();
      }
      if (showState.lookName !== lastVibe) {
        lastVibe = showState.lookName;
        if (hudVibeRef.current)
          hudVibeRef.current.textContent = showState.lookName;
      }
      groupDirector.getSummary(crewSummary);
      if (crewSummary.text !== lastCrew) {
        lastCrew = crewSummary.text;
        if (hudCrewRef.current)
          hudCrewRef.current.textContent = crewSummary.text;
      }

      // Recording timer (mm:ss, direct DOM write)
      // V4: the timer runs on EITHER recorder backend (MediaRecorder ref or
      // the WebCodecs V5 handle) — previously V5 recordings never ticked.
      if ((recorderRef.current || mp4RecRef.current) && recTimerRef.current) {
        const s = Math.floor((performance.now() - recStartMsRef.current) / 1000);
        const label = `REC ${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
        if (label !== lastRecLabel) {
          lastRecLabel = label;
          recTimerRef.current.textContent = label;
        }
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mounted]);

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------
  if (!mounted) {
    return (
      <main className="flex h-dvh w-full items-center justify-center bg-[#06060a]">
        <div className="flex flex-col items-center gap-3">
          <Disc3
            className="h-9 w-9 animate-spin text-cyan-400"
            style={{ animationDuration: '2.6s' }}
          />
          <p className="font-mono text-xs tracking-widest text-slate-500">
            BOOTING GROOVE ENGINE…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative h-dvh w-full select-none overflow-hidden bg-[#06060a] text-slate-100"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* ====================================================================
          3D WEBGL CANVAS (REACT THREE FIBER)
          ==================================================================== */}
      <div className="absolute inset-0">
        <Canvas
          shadows
          dpr={
            recDprLock ? 1 : isPhoneTier ? [1, 1.5] : [1, 2]
          }
          camera={{ position: [0, 1.35, 4.6], fov: 50, near: 0.1, far: 60 }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            // V2 RECORDING V3 (BF-16): the compositor must never tap a
            // cleared drawing buffer — this alone kills torn/corrupt frames
            // in canvas.captureStream() recordings.
            preserveDrawingBuffer: true,
          }}
        >
          <color attach="background" args={['#06060a']} />
          {/* V1.5: fog pushed out (9..22) so the wide default framing keeps the
              far EQ ring and stage rim crisp instead of graying them out */}
          <fog attach="fog" args={['#06060a', 9, 22]} />

          {/* V3 RECORDING V4: fixed 30 fps CFR capture while REC is active —
              drift-compensated accumulator (BF-19) */}
          <RecordFrameTap />

          {/* 100% procedural club stage: instanced EQ ring, LED floor,
              subwoofers, DJ booth, lasers, V2 show-director looks + FX +
              crowd, V3 group camera pairing, camera director.
              fxLevel: 1 = Lite (phone) · 2 = Full (density + ambient FX) */}
          <ProceduralClubStage
            getMetrics={getMetrics}
            getRawFrequencyData={getRawFrequencyData}
            cameraMode={cameraMode}
            showFxDetail={fxLevel}
          />

          {/* V4 GROUP CREW — up to 4 procedural dancers on the shared rig.
              Dancer 0 is the lead (beat-clock writer + group director brain).
              The Diva (GIRL) renders through her own rig — realistic human
              body, verlet cloth skirt + ponytail chain physics. */}
          {dancers.map((sp, i) =>
            sp === 'GIRL' ? (
              <ProceduralDancingGirl
                key={`dancer-${i}-${sp}`}
                getMetrics={getMetrics}
                forcedStyle={forcedStyle}
                demoMode={demoActive}
                showHud={false}
                dancerIndex={i}
                position={initialSlots[i]}
              />
            ) : (
              <ProceduralDancingCat
                key={`dancer-${i}-${sp}`}
                getMetrics={getMetrics}
                forcedStyle={forcedStyle}
                demoMode={demoActive}
                showHud={false}
                species={sp}
                dancerIndex={i}
                position={initialSlots[i]}
              />
            )
          )}
        </Canvas>
      </div>

      {/* Glassmorphic full-window drag & drop overlay */}
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-3 z-50 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-cyan-400/70 bg-[#06060a]/80 shadow-[0_0_60px_rgba(34,236,255,0.25)_inset] backdrop-blur-xl">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-fuchsia-500 shadow-lg shadow-cyan-400/30">
            <Upload className="h-8 w-8 text-[#06060a]" />
          </div>
          <p className="mt-5 text-xl font-extrabold tracking-tight text-cyan-300 sm:text-2xl">
            DROP YOUR TRACK
          </p>
          <p className="mt-1.5 text-center text-xs text-slate-400">
            MP3 · WAV · OGG — decoded 100% on your device, never uploaded
          </p>
        </div>
      )}

      {/* Inline notice (invalid file / decode error) */}
      {notice && (
        <div className="absolute left-1/2 top-20 z-40 -translate-x-1/2">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-2.5 backdrop-blur-xl">
            <p className="text-xs font-semibold text-rose-200">{notice}</p>
          </div>
        </div>
      )}

      {/* Autoplay-blocked hint */}
      {soundHint && !hasFile && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-30 -translate-x-1/2">
          <div className="flex animate-pulse items-center gap-2 rounded-full border border-cyan-400/40 bg-[#0b0e1a]/90 px-4 py-2 backdrop-blur-xl">
            <VolumeX className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-200">
              Tap anywhere to unmute the demo beat
            </span>
          </div>
        </div>
      )}

      {/* ====================================================================
          TOP BAR — BRAND, LIVE EQ, BPM, UPLOAD
          ==================================================================== */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 sm:p-4">
        {/* Brand chip + zero-re-render mini equalizer */}
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0e1a]/85 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-500 shadow-lg shadow-cyan-400/20">
            <AudioLines className="h-5 w-5 text-[#06060a]" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold tracking-tight text-white">
                GROOVE CAT 3D
              </span>
              <span className="hidden rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300 sm:inline-block">
                Pure DSP · No AI
              </span>
            </div>
            <p className="text-[10px] text-slate-400">dance.namansoni.in</p>
          </div>

          {/* 60 FPS equalizer — updated via direct DOM, zero re-renders */}
          <div className="flex h-9 items-end gap-1 rounded-lg border border-white/5 bg-black/40 px-2 py-1">
            <div
              ref={bassBarRef}
              className="w-1.5 rounded-t bg-rose-500"
              style={{ height: '15%' }}
              title="Bass (kick)"
            />
            <div
              ref={midBarRef}
              className="w-1.5 rounded-t bg-amber-400"
              style={{ height: '15%' }}
              title="Mid (groove)"
            />
            <div
              ref={highBarRef}
              className="w-1.5 rounded-t bg-cyan-400"
              style={{ height: '15%' }}
              title="High (hi-hats)"
            />
          </div>
        </div>

        {/* BPM badge + detected-BPM lock + Upload button */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5 backdrop-blur-xl sm:flex">
            <div
              ref={beatDotRef}
              className="h-2 w-2 rounded-full bg-emerald-400"
            />
            <span className="font-mono text-sm font-bold leading-none text-emerald-300">
              <span ref={bpmTextRef}>128</span>{' '}
              <span className="text-[10px] text-emerald-400/70">BPM</span>
            </span>
          </div>

          {hasFile && (
            <div className="hidden items-center rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2.5 backdrop-blur-xl md:flex">
              <span className="font-mono text-[11px] font-bold text-fuchsia-300">
                {detectedBpm} BPM LOCKED
              </span>
            </div>
          )}

          <label
            className={
              'cursor-pointer rounded-2xl bg-gradient-to-r from-fuchsia-500 to-rose-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-fuchsia-500/25 transition hover:brightness-110 active:scale-95 ' +
              (isAnalyzing ? 'pointer-events-none opacity-80' : '')
            }
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-1.5">
                <Disc3 className="h-3.5 w-3.5 animate-spin" />
                Decoding…
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Upload MP3
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus"
              className="hidden"
              onChange={onFileInputChange}
              aria-label="Upload an MP3 song"
            />
          </label>
        </div>
      </header>

      {/* ====================================================================
          BOTTOM AUDIO DECK — SEEK BAR, TRANSPORT, STYLE & CAMERA PILLS
          ==================================================================== */}
      <footer
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 sm:p-4"
        style={{
          // V3: iPhone home-indicator safe area + never less than the base pad
          paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)',
        }}
      >
        <div className="pointer-events-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0b0e1a]/85 p-3 shadow-2xl backdrop-blur-md sm:backdrop-blur-xl sm:p-4">
          {/* ================================================================
              V3 ALWAYS-VISIBLE TRANSPORT — Play · Demo · REC · volume +
              the deck collapse toggle. On phones the collapsed bar IS the
              deck: one thumb-tap on the chevron opens the full studio.
              ================================================================ */}
          <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
            <button
              onClick={() => void handleTogglePlay()}
              aria-label={isPlayingUi ? 'Pause' : 'Play'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#06060a] shadow-lg transition hover:scale-105 active:scale-95"
            >
              {isPlayingUi ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              )}
            </button>

            <button
              onClick={() => void handleDemoBeat()}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[11px] font-bold text-cyan-300 transition hover:bg-cyan-400/20 active:scale-95 sm:px-3.5"
            >
              <Disc3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Demo Beat</span>
              <span className="sm:hidden">Demo</span>
            </button>

            {/* Record & export the WebGL canvas + engine audio (.mp4 where
                supported, .webm with duration repair as fallback) */}
            {canRecord && (
              <button
                onClick={handleRecordToggle}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                className={
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold transition active:scale-95 sm:px-3.5 ' +
                  (isRecording
                    ? 'bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.6)]'
                    : 'border border-rose-400/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20')
                }
              >
                {isRecording ? (
                  <>
                    <Square className="h-3 w-3 fill-current" />
                    <span ref={recTimerRef} className="font-mono tabular-nums">
                      REC 0:00
                    </span>
                  </>
                ) : (
                  <>
                    <Circle className="h-3 w-3 fill-current" />
                    Record
                  </>
                )}
              </button>
            )}

            {/* Track title — hidden while the deck is collapsed (compact bar) */}
            {deckOpen && (
              <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
                <Music2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="truncate text-xs font-medium text-slate-300">
                  {trackTitle}
                </span>
              </div>
            )}

            {/* Volume — hidden while collapsed on phones (expand to reach) */}
            {deckOpen && (
              <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
                <button
                  onClick={handleMuteToggle}
                  aria-label={volumeUi === 0 ? 'Unmute' : 'Mute'}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  {volumeUi === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volumeUi}
                  onChange={handleVolumeChange}
                  className="w-16 sm:w-20"
                  aria-label="Volume"
                />
              </div>
            )}

            {/* Demo synth BPM (hidden once a real song is loaded) */}
            {deckOpen && !hasFile && (
              <label className="hidden shrink-0 items-center gap-1.5 md:flex">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  Demo
                </span>
                <input
                  type="range"
                  min={95}
                  max={170}
                  step={1}
                  value={synthBpmUi}
                  onChange={handleSynthBpmChange}
                  className="w-16"
                  aria-label="Demo beat BPM"
                />
                <span className="w-7 font-mono text-[10px] tabular-nums text-fuchsia-300">
                  {synthBpmUi}
                </span>
              </label>
            )}

            {/* V3 DECK COLLAPSE TOGGLE — minimize / maximize the studio deck */}
            <button
              onClick={() => setDeckOpen((v) => !v)}
              aria-label={deckOpen ? 'Minimize control deck' : 'Expand control deck'}
              aria-expanded={deckOpen}
              className={
                'ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition active:scale-90 ' +
                (deckOpen
                  ? 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                  : 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20')
              }
            >
              {deckOpen ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronUp className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* ================================================================
              V3 COLLAPSIBLE STUDIO DECK — grid-rows 0fr→1fr animated
              collapse (auto-height, GPU-cheap, no JS measurement).
              Contains: seek bar · live readout · dance/crew/formation/sync/
              vibe/FX/cam decks · tagline.
              ================================================================ */}
          <div
            className="grid transition-[grid-template-rows,opacity] duration-300 ease-in-out"
            style={{
              gridTemplateRows: deckOpen ? '1fr' : '0fr',
              opacity: deckOpen ? 1 : 0,
              // visibility (unlike opacity) also kills tab-focus + pointer
              // events into the collapsed area; delayed so it flips mid-fade
              visibility: deckOpen ? 'visible' : 'hidden',
              transitionDelay: deckOpen ? '0ms, 0ms, 120ms' : '0ms, 0ms, 180ms',
            }}
          >
            <div
              className={
                'overflow-hidden ' +
                // V3 phone: cap the expanded deck height + internal scroll so
                // short landscapes never push the panel over the whole stage
                (deckOpen ? 'max-h-[46dvh] overflow-y-auto no-scrollbar sm:max-h-none sm:overflow-visible' : '')
              }
            >
              {/* Song scrubber / seek bar */}
              <div className="mt-3 flex items-center gap-2.5 sm:gap-3">
                <span
                  ref={timeCurRef}
                  className="w-9 text-right font-mono text-[10px] tabular-nums text-slate-400"
                >
                  LIVE
                </span>
                <div
                  ref={seekTrackRef}
                  role="slider"
                  aria-label="Seek through the song"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={0}
                  onPointerDown={onSeekPointerDown}
                  onPointerMove={onSeekPointerMove}
                  className="relative h-2 flex-1 cursor-pointer touch-none rounded-full bg-white/10"
                  style={{ opacity: 0.45, pointerEvents: 'none' }}
                >
                  <div
                    ref={seekFillRef}
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500"
                    style={{ width: '0%' }}
                  />
                  <div
                    ref={seekKnobRef}
                    className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-300 bg-white shadow-md"
                    style={{ left: '0%' }}
                  />
                </div>
                <span
                  ref={timeDurRef}
                  className="w-9 font-mono text-[10px] tabular-nums text-slate-400"
                >
                  LIVE
                </span>
              </div>

          {/* Live choreography readout — zero-re-render, DOM-rAF driven */}
          <div className="mt-3 flex min-w-0 items-center gap-2 text-[10px]">
            <span className="shrink-0 font-bold uppercase tracking-widest text-cyan-400/80">
              Now dancing
            </span>
            <span
              ref={hudMoveRef}
              className="truncate font-semibold text-cyan-200"
            >
              Club Idle
            </span>
            <span className="shrink-0 text-slate-600">|</span>
            <span className="shrink-0 font-bold uppercase tracking-widest text-fuchsia-400/80">
              Cam
            </span>
            <span
              ref={hudShotRef}
              className="truncate font-semibold text-fuchsia-200"
            >
              Front Stage Center
            </span>
            <span className="shrink-0 text-slate-600">|</span>
            <span className="shrink-0 font-bold uppercase tracking-widest text-amber-400/80">
              Vibe
            </span>
            <span
              ref={hudVibeRef}
              className="truncate font-semibold text-amber-200"
            >
              Diwali Mela
            </span>
            <span className="ml-auto shrink-0 rounded-full bg-white/5 px-2 py-0.5 font-semibold text-slate-300">
              <span ref={hudCrewRef}>Solo</span>
            </span>
          </div>

          {/* Choreography switcher deck (10 family pills) */}
          <div className="mt-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Dance
            </span>
            {DANCE_STYLE_PILLS.map((style) => {
              const active = forcedStyle === style.id;
              return (
                <button
                  key={style.id}
                  onClick={() => setForcedStyle(style.id)}
                  className={
                    'shrink-0 cursor-pointer rounded-full px-3 py-2 text-[11px] font-bold transition sm:py-1.5 ' +
                    (active
                      ? 'bg-cyan-400 text-[#06060a] shadow-[0_0_14px_rgba(34,236,255,0.5)]'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white')
                  }
                >
                  {style.label}
                </button>
              );
            })}
          </div>

          {/* V2 CREW DECK — add cat / diva / mouse dancers (up to 4 on stage) */}
          <div className="mt-1.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Crew
            </span>
            {SPECIES_ORDER.map((sp) => {
              const preset = SPECIES_PRESETS[sp];
              const count = dancers.reduce(
                (acc, d) => acc + (d === sp ? 1 : 0),
                0
              );
              return (
                <button
                  key={sp}
                  onClick={() => handleAddDancer(sp)}
                  className={
                    'shrink-0 cursor-pointer rounded-full px-3 py-2 text-[11px] font-bold transition sm:py-1.5 ' +
                    (count > 0
                      ? 'bg-emerald-400 text-[#06060a] shadow-[0_0_14px_rgba(52,211,153,0.5)]'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white')
                  }
                >
                  {preset.emoji} {preset.label}
                  {count > 0 ? ` ×${count}` : ''}
                </button>
              );
            })}

            {/* V6 BF-29 — ON-STAGE ROSTER: every dancer is individually
                removable (the default cat too), so any solo lineup —
                girl-only included — is one × away. */}
            <span className="shrink-0 pl-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              On stage
            </span>
            {dancers.map((sp, i) => {
              const preset = SPECIES_PRESETS[sp];
              return (
                <button
                  key={`roster-${i}-${sp}`}
                  onClick={() => handleRemoveDancer(i)}
                  aria-label={`Remove ${preset.label} ${i + 1} from the stage`}
                  title={`Remove this ${preset.label} — solo mode!`}
                  className="group/roster shrink-0 cursor-pointer rounded-full bg-emerald-400/15 px-2.5 py-2 text-[11px] font-bold text-emerald-300 ring-1 ring-emerald-400/40 transition hover:bg-rose-500/25 hover:text-rose-300 hover:ring-rose-400/60 sm:py-1.5"
                >
                  {preset.emoji}
                  <span className="ml-1 opacity-60 transition group-hover/roster:opacity-100">
                    ×
                  </span>
                </button>
              );
            })}
          </div>

          {/* V2 FORMATION DECK */}
          <div className="mt-1.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Formation
            </span>
            {FORMATION_MODES.map((f) => {
              const active = formation === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFormation(f.id)}
                  className={
                    'shrink-0 cursor-pointer rounded-full px-3 py-2 text-[10px] font-bold transition sm:py-1 ' +
                    (active
                      ? 'bg-emerald-400 text-[#06060a]'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white')
                  }
                >
                  {f.label}
                </button>
              );
            })}

            {/* V2 SYNC DECK (same row — compact) */}
            <span className="shrink-0 pl-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Sync
            </span>
            {SYNC_MODES.map((s) => {
              const active = syncMode === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSyncMode(s.id)}
                  className={
                    'shrink-0 cursor-pointer rounded-full px-3 py-2 text-[10px] font-bold transition sm:py-1 ' +
                    (active
                      ? 'bg-cyan-400 text-[#06060a]'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white')
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* V2 VIBE DECK — Grand Show Director stage looks */}
          <div className="mt-1.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Vibe
            </span>
            {VIBE_PILLS.map((v) => {
              const active = vibe === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => handleVibePill(v.id)}
                  className={
                    'shrink-0 cursor-pointer rounded-full px-3 py-2 text-[10px] font-bold transition sm:py-1 ' +
                    (active
                      ? 'bg-amber-400 text-[#06060a] shadow-[0_0_12px_rgba(251,191,36,0.45)]'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white')
                  }
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          {/* Camera mode deck + V3 FX level toggle (same row — compact) */}
          <div className="mt-1.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Cam
            </span>
            {CAMERA_MODES.map((cam) => {
              const active = cameraMode === cam.id;
              return (
                <button
                  key={cam.id}
                  onClick={() => setCameraMode(cam.id)}
                  className={
                    'shrink-0 cursor-pointer rounded-full px-3 py-2 text-[11px] font-bold transition sm:py-1.5 ' +
                    (active
                      ? 'bg-fuchsia-500 text-white shadow-[0_0_14px_rgba(255,0,127,0.45)]'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white')
                  }
                >
                  {cam.label}
                </button>
              );
            })}

            {/* V3 FX LEVEL — Lite parks the ambient floaters + crowd and
                halves event-FX density (default on phones); Full restores
                the complete show. */}
            <span className="shrink-0 pl-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              FX
            </span>
            {[1, 2].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFxLevel(lvl)}
                aria-label={lvl === 1 ? 'Lite FX (fewer particles)' : 'Full FX'}
                className={
                  'shrink-0 cursor-pointer rounded-full px-3 py-2 text-[11px] font-bold transition sm:py-1.5 ' +
                  (fxLevel === lvl
                    ? 'bg-violet-400 text-[#06060a] shadow-[0_0_12px_rgba(167,139,250,0.5)]'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white')
                }
              >
                {lvl === 1 ? 'Lite' : 'Full'}
              </button>
            ))}
          </div>

          <p className="mt-2.5 hidden text-center text-[9px] tracking-wide text-slate-600 sm:block">
            67 moves (42 + 25 diva) + 32 duets · 43 cinematic cams · 18
            formations · cat + diva + mouse crew up to 4 · cloth + hair
            physics · seek-safe MP4 export · 100% on-device · Space = play/pause
          </p>
            </div>
          </div>
          {/* /V3 collapsible studio deck */}
        </div>
      </footer>
    </main>
  );
}
