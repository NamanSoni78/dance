'use client';

/**
 * ============================================================================
 * ZERO-ALLOCATION WEB AUDIO DSP ENGINE
 * ============================================================================
 * - AudioContext + AnalyserNode (fftSize = 2048) writing into a single
 *   pre-allocated Uint8Array (zero garbage collection per frame).
 * - Sample-rate-invariant FFT bin mapping (works on 44.1 / 48 / 96 kHz).
 * - Offline BPM detection (OfflineAudioContext + 140 Hz low-pass isolating
 *   the kick drum), clamped cleanly to [90, 175] BPM.
 * - Adaptive spectral-flux kick-transient detection (~230 ms refractory
 *   window) with a 66 ms beat latch so multiple per-frame consumers
 *   (cat rig, club stage, 2D HUD) all observe the same beat impulse.
 * - Built-in procedural 808 club synthesizer (Demo Beat mode) that routes
 *   REAL audio through the analyser, so the FFT reactivity is genuine.
 * - MP3/WAV/OGG loading is 100% client-side via URL.createObjectURL +
 *   file.arrayBuffer(). Previous blob URLs are revoked so browser RAM stays
 *   flat across 50+ uploaded songs. Nothing is ever uploaded to a server.
 */

import type { AudioMetrics } from '@/components/ProceduralDancingCat';

export type AudioMode = 'FILE' | 'SYNTH' | 'IDLE';

export interface PlaybackInfo {
  currentTime: number;
  duration: number;
  trackName: string;
  mode: AudioMode;
  isPlaying: boolean;
  volume: number;
}

export interface ExtendedAudioController {
  /** Zero-allocation getter called at 60-144 FPS inside R3F useFrame / rAF */
  getMetrics: () => AudioMetrics;
  /** Direct read-only access to the 1024-bin Uint8Array FFT spectrum */
  getRawFrequencyData: () => Uint8Array;
  /** Recording tap: a MediaStream carrying the full pre-volume music mix
   *  (analyser output), so .webm exports keep audio even when muted. */
  getRecordingStream: () => MediaStream | null;
  /** V4 RECORDING V5 (WebCodecs): raw PCM tap from the pre-volume analyser
   *  bus — stereo Float32 blocks for the AudioEncoder. Returns a detach
   *  function. The worklet buffers 4096-frame blocks (~85 ms) before posting
   *  so the main thread stays allocation-quiet while recording. */
  attachPcmTap: (
    cb: (l: Float32Array, r: Float32Array, frames: number, sampleRate: number) => void
  ) => () => void;
  /** V4: AudioContext sampleRate probe for the WebCodecs audio plan
   *  (lazily creates the context — cheap + idempotent). */
  getPcmSampleRate: () => number | null;
  /** Load an uploaded MP3/WAV/OGG/FLAC File. Returns the detected BPM. */
  loadFile: (file: File) => Promise<number>;
  /** Start the built-in Web Audio 808 procedural club beat (real audio) */
  startBuiltInSynth: (bpm?: number) => void;
  /** Autoplay-policy-aware synth start: returns true when audio is running */
  tryStartBuiltInSynth: (bpm?: number) => Promise<boolean>;
  stopBuiltInSynth: () => void;
  togglePlay: () => Promise<void>;
  seek: (timeSeconds: number) => void;
  setVolume: (vol: number) => void;
  setSynthBpm: (bpm: number) => void;
  getPlaybackInfo: () => PlaybackInfo;
  /** Subscribe to play/pause/ended transport changes (UI sync) */
  setOnPlaybackChange: (cb: (() => void) | null) => void;
  dispose: () => void;
}

const FFT_SIZE = 2048;
const BIN_COUNT = FFT_SIZE / 2; // 1024 bins
const BPM_MIN = 90;
const BPM_MAX = 175;
/** Beat latch: all consumers within this window see isBeat === true */
const BEAT_LATCH_MS = 66;
/** Same-frame memoization window for getMetrics (multiple consumers/frame) */
const FRAME_MEMO_MS = 3;

/** Indirection so TS control-flow narrowing does not treat `ctx.state` as
 *  permanently non-running across an `await ctx.resume()` boundary. */
function isCtxRunning(c: AudioContext): boolean {
  return c.state === 'running';
}

// ----------------------------------------------------------------------------
// V4 RECORDING V5 — PCM tap worklet source (inline module, no public file).
// Buffers 128-frame render quanta into 4096-frame blocks, then posts a
// {l, r, frames} pair to the main thread for the WebCodecs AudioEncoder.
// ----------------------------------------------------------------------------
const PCM_TAP_WORKLET_SRC = `
class RecPcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this._cap = 4096;
    this._l = new Float32Array(this._cap);
    this._r = new Float32Array(this._cap);
    this._n = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const chL = input[0] || null;
      const chR = input.length > 1 ? (input[1] || chL) : chL;
      const frames = chL ? chL.length : 0;
      for (let i = 0; i < frames; i++) {
        this._l[this._n] = chL ? chL[i] : 0;
        this._r[this._n] = chR ? chR[i] : 0;
        this._n++;
        if (this._n >= this._cap) {
          this.port.postMessage({ l: this._l.slice(), r: this._r.slice(), frames: this._n });
          this._n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('rec-pcm-tap', RecPcmTap);
`;

export function createZeroAllocAudioController(): ExtendedAudioController {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let masterGain: GainNode | null = null;
  let mediaSource: MediaElementAudioSourceNode | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let currentObjectUrl: string | null = null;

  // Pre-allocated typed arrays (never re-allocated in the frame loop)
  const freqData = new Uint8Array(BIN_COUNT);

  // Pre-allocated mutable metrics struct returned every frame
  const metrics: AudioMetrics = {
    bass: 0,
    mid: 0,
    high: 0,
    overall: 0,
    isBeat: false,
    bpm: 128,
    isPlaying: false,
  };

  // Sample-rate-corrected bin indices (computed once when ctx initializes)
  let bassStart = 1;
  let bassEnd = 6;
  let midStart = 7;
  let midEnd = 42;
  let highStart = 70;
  let highEnd = 280;

  // Adaptive beat & BPM state (primitives + fixed ring buffer => zero GC)
  let prevBass = 0;
  let bassAvg = 0.25;
  let lastBeatTimeMs = 0;
  let beatLatchUntilMs = 0;
  let smoothedOverall = 0;
  let lastMetricsCalcMs = -1000;
  const bpmRingBuffer = new Float32Array(12);
  let bpmRingCount = 0;
  let bpmRingWriteIdx = 0;

  // Transport & built-in synth state
  let mode: AudioMode = 'IDLE';
  let trackName = 'Demo Beat';
  let masterVolume = 0.85;
  let synthTimerId: number | null = null;
  let synthRunning = false;
  let synthStep = 0;
  let synthBpm = 128;
  let synthNextStepTime = 0;
  // Synth voices are routed through this bus so that stopping the demo
  // beat can instantly mute notes already scheduled in the lookahead window.
  let synthBus: GainNode | null = null;
  // Lazily-created recording tap (MediaStreamAudioDestinationNode fed from
  // the analyser so exports capture the full pre-volume music mix)
  let recordingDest: MediaStreamAudioDestinationNode | null = null;
  // Optional UI subscriber notified on play / pause / ended transport changes
  // (fires on media-key pauses and natural song end, keeping the UI honest).
  let onPlaybackChange: (() => void) | null = null;
  const notifyPlaybackChange = () => {
    if (onPlaybackChange) onPlaybackChange();
  };

  // --------------------------------------------------------------------------
  // AUDIO GRAPH INITIALIZATION
  // --------------------------------------------------------------------------
  function ensureAudioContext(): AudioContext {
    if (!ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AudioCtx();

      analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.72;

      masterGain = ctx.createGain();
      masterGain.gain.value = masterVolume;

      // analyser -> masterGain -> speakers (metrics are pre-volume: the cat
      // keeps dancing even when the user mutes the output)
      analyser.connect(masterGain);
      masterGain.connect(ctx.destination);

      // Exact FFT bin boundaries for this hardware's sample rate:
      // k(f) = f * N / fs
      const sr = ctx.sampleRate;
      const hzPerBin = sr / FFT_SIZE;
      bassStart = Math.max(1, Math.floor(20 / hzPerBin));
      bassEnd = Math.min(BIN_COUNT - 1, Math.ceil(140 / hzPerBin));
      midStart = Math.max(bassEnd + 1, Math.floor(140 / hzPerBin));
      midEnd = Math.min(BIN_COUNT - 1, Math.ceil(900 / hzPerBin));
      highStart = Math.max(midEnd + 1, Math.floor(1500 / hzPerBin));
      highEnd = Math.min(BIN_COUNT - 1, Math.ceil(6000 / hzPerBin));

      // Reusable HTML5 Audio Element (one MediaElementSource for life)
      audioEl = new Audio();
      audioEl.crossOrigin = 'anonymous';
      audioEl.preload = 'auto';
      mediaSource = ctx.createMediaElementSource(audioEl);
      mediaSource.connect(analyser);

      // Keep the transport UI in sync with external state changes
      // (hardware media keys, tab audio indicators, natural song end)
      audioEl.addEventListener('play', notifyPlaybackChange);
      audioEl.addEventListener('pause', notifyPlaybackChange);
      audioEl.addEventListener('ended', notifyPlaybackChange);

      // Synth voice bus -> analyser (muted instantly when synth stops)
      synthBus = ctx.createGain();
      synthBus.gain.value = 1;
      synthBus.connect(analyser);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  // --------------------------------------------------------------------------
  // PROCEDURAL WEB AUDIO 808 / ACID CLUB SYNTHESIZER (ZERO EXTERNAL MP3)
  // --------------------------------------------------------------------------
  function trigger808Kick(time: number, punch = 1.0) {
    if (!ctx || !synthBus) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';

    // Pitch envelope: 155 Hz -> 42 Hz sub drop
    osc.frequency.setValueAtTime(155 * punch, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);
    osc.frequency.exponentialRampToValueAtTime(28, time + 0.32);

    gain.gain.setValueAtTime(0.95 * punch, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.34);

    osc.connect(gain);
    gain.connect(synthBus);
    osc.start(time);
    osc.stop(time + 0.35);
  }

  function triggerSnare(time: number) {
    if (!ctx || !synthBus) return;
    // Tonal body
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(110, time + 0.08);
    oscGain.gain.setValueAtTime(0.45, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(oscGain);
    oscGain.connect(synthBus);
    osc.start(time);
    osc.stop(time + 0.13);

    // High-frequency snap oscillator cluster
    const snap = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snap.type = 'sawtooth';
    snap.frequency.setValueAtTime(520, time);
    snap.frequency.exponentialRampToValueAtTime(180, time + 0.14);
    snapGain.gain.setValueAtTime(0.3, time);
    snapGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    snap.connect(snapGain);
    snapGain.connect(synthBus);
    snap.start(time);
    snap.stop(time + 0.16);
  }

  function triggerHiHat(time: number, open = false) {
    if (!ctx || !synthBus) return;
    // Metallic FM-style high-frequency cluster feeding the High band
    const freqs = [2450, 3680, 5120];
    const dur = open ? 0.18 : 0.045;
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freqs[i], time);
      gain.gain.setValueAtTime(0.11, time);
      gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);
      osc.connect(gain);
      gain.connect(synthBus);
      osc.start(time);
      osc.stop(time + dur + 0.01);
    }
  }

  function triggerAcidBass(time: number, freq: number, accent = false) {
    if (!ctx || !synthBus) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.Q.value = accent ? 12 : 6;
    filter.frequency.setValueAtTime(accent ? 1600 : 850, time);
    filter.frequency.exponentialRampToValueAtTime(180, time + 0.16);

    gain.gain.setValueAtTime(accent ? 0.38 : 0.24, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(synthBus);
    osc.start(time);
    osc.stop(time + 0.19);
  }

  const acidNotes = [
    55, 55, 110, 55, 65.41, 73.42, 82.41, 98, 55, 110, 82.41, 73.42, 65.41,
    55, 49, 65.41,
  ];

  /**
   * LOOKAHEAD SCHEDULER ("A Tale of Two Clocks" pattern).
   * A low-rate timer (SYNTH_TICK_MS) tops up a queue of Web Audio events
   * scheduled on the SAMPLE-ACCURATE audio clock (ctx.currentTime), keeping
   * a SYNTH_LOOKAHEAD_SEC buffer of music in flight. This is drift-free and
   * immune to setTimeout throttling (background tabs, headless browsers,
   * energy savers) as long as the timer wakes at least once per window.
   */
  const SYNTH_LOOKAHEAD_SEC = 2.2;
  const SYNTH_TICK_MS = 150;
  /** Ring buffer of scheduled quarter-note beat times (audio clock) — the
   *  demo synth's beat grid is deterministic, so isBeat fires sample-accurate
   *  impulses straight from the scheduler instead of the flux estimator. */
  const SYNTH_BEAT_RING = 64;
  const synthBeatTimes = new Float64Array(SYNTH_BEAT_RING);
  let synthBeatWriteCount = 0;
  let synthBeatReadIdx = 0;

  function scheduleStepAt(time: number, step: number) {
    const stepInBar = step % 16;
    const barNumber = Math.floor(step / 16) % 8;
    const isDropBar = barNumber >= 5; // Bars 5..7 => heavy bass-drop energy

    // Four-on-the-floor + syncopated b-boy kick on drop bars
    if (
      stepInBar % 4 === 0 ||
      (isDropBar && (stepInBar === 6 || stepInBar === 14))
    ) {
      trigger808Kick(time, isDropBar ? 1.25 : 1.0);
      // Register the four-on-the-floor grid as the deterministic beat pulse
      if (stepInBar % 4 === 0) {
        synthBeatTimes[synthBeatWriteCount % SYNTH_BEAT_RING] = time;
        synthBeatWriteCount++;
      }
    }

    // Snare on 2 and 4 (steps 4 and 12)
    if (stepInBar === 4 || stepInBar === 12) {
      triggerSnare(time);
    }

    // 16th-note hi-hats
    if (stepInBar % 2 === 1 || isDropBar) {
      triggerHiHat(time, stepInBar % 4 === 2);
    }

    // Acid bassline / groove mid-range
    triggerAcidBass(time, acidNotes[stepInBar], isDropBar || stepInBar % 4 === 2);
  }

  function synthTick() {
    if (!ctx || mode !== 'SYNTH' || !synthRunning) return;
    const stepDurSec = 60 / synthBpm / 4;
    while (synthNextStepTime < ctx.currentTime + SYNTH_LOOKAHEAD_SEC) {
      scheduleStepAt(synthNextStepTime, synthStep);
      synthStep++;
      synthNextStepTime += stepDurSec;
    }
    synthTimerId = window.setTimeout(synthTick, SYNTH_TICK_MS);
  }

  function stopSynthTimer() {
    const wasRunning = synthRunning;
    synthRunning = false;
    if (synthTimerId !== null) {
      clearTimeout(synthTimerId);
      synthTimerId = null;
    }
    // Instantly mute voices already scheduled inside the lookahead window
    if (synthBus && ctx) {
      synthBus.gain.cancelScheduledValues(ctx.currentTime);
      synthBus.gain.setValueAtTime(0, ctx.currentTime);
    }
    if (wasRunning) notifyPlaybackChange();
  }

  function startSynthTimer() {
    stopSynthTimer();
    if (!ctx || !synthBus) return;
    synthRunning = true;
    synthStep = 0;
    synthNextStepTime = ctx.currentTime + 0.06;
    synthBeatWriteCount = 0;
    synthBeatReadIdx = 0;
    synthBus.gain.cancelScheduledValues(ctx.currentTime);
    synthBus.gain.setValueAtTime(1, ctx.currentTime);
    synthTick();
    notifyPlaybackChange();
  }

  function resetBeatEstimator() {
    prevBass = 0;
    bassAvg = 0.25;
    smoothedOverall = 0;
    lastBeatTimeMs = 0;
    beatLatchUntilMs = 0;
    bpmRingCount = 0;
    bpmRingWriteIdx = 0;
  }

  function startSynthInternal(bpm: number) {
    if (audioEl && !audioEl.paused) {
      audioEl.pause();
    }
    synthBpm = Math.max(BPM_MIN, Math.min(BPM_MAX, bpm));
    metrics.bpm = synthBpm;
    mode = 'SYNTH';
    trackName = `Demo Beat — ${synthBpm} BPM Club Synth`;
    resetBeatEstimator();
    startSynthTimer();
  }

  // --------------------------------------------------------------------------
  // OFFLINE BPM DETECTION (140 Hz LOW-PASS KICK ISOLATION)
  // --------------------------------------------------------------------------
  async function detectBPMOffline(buffer: ArrayBuffer): Promise<number> {
    if (!ctx) return 128;
    const audioBuffer = await ctx.decodeAudioData(buffer);

    const sampleRate = audioBuffer.sampleRate;
    const duration = Math.min(30, audioBuffer.duration);
    if (duration < 2) return 128; // too short to analyze reliably

    // Analyze a 30-second slice from the middle of the song
    const startOffset = Math.max(0, audioBuffer.duration / 2 - duration / 2);

    const offlineCtx = new OfflineAudioContext(
      1,
      Math.max(1, Math.floor(sampleRate * duration)),
      sampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    // Isolate the kick drum with a 140 Hz low-pass filter
    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 140;

    source.connect(filter);
    filter.connect(offlineCtx.destination);
    source.start(0, startOffset, duration);

    const renderedBuffer = await offlineCtx.startRendering();
    const channelData = renderedBuffer.getChannelData(0);

    // Find amplitude peaks separated by at least 0.25 s (max 240 BPM)
    let maxAmp = 0;
    for (let i = 0; i < channelData.length; i += 64) {
      const v = Math.abs(channelData[i]);
      if (v > maxAmp) maxAmp = v;
    }
    if (maxAmp <= 0.0001) return 128;

    const threshold = 0.65 * maxAmp;
    const minStep = Math.floor(sampleRate * 0.25);
    const peaks: number[] = [];
    for (let i = 0; i < channelData.length; i++) {
      if (Math.abs(channelData[i]) > threshold) {
        peaks.push(i);
        i += minStep; // skip forward past the same kick's decay tail
      }
    }
    if (peaks.length < 4) return 128;

    // Histogram of inter-peak intervals, folded cleanly into [90, 175] BPM
    const tempoBuckets = new Map<number, number>();
    for (let i = 1; i < peaks.length; i++) {
      const intervalSec = (peaks[i] - peaks[i - 1]) / sampleRate;
      if (intervalSec <= 0.01) continue;
      let bpm = 60 / intervalSec;
      while (bpm < BPM_MIN) bpm *= 2;
      while (bpm > BPM_MAX) bpm /= 2;
      if (bpm < BPM_MIN || bpm > BPM_MAX) continue;
      const key = Math.round(bpm);
      tempoBuckets.set(key, (tempoBuckets.get(key) ?? 0) + 1);
    }

    let bestBpm = 128;
    let maxCount = 0;
    for (const [bpm, count] of tempoBuckets) {
      if (count > maxCount) {
        maxCount = count;
        bestBpm = bpm;
      }
    }
    if (maxCount < 3) return 128;

    return Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, bestBpm)));
  }

  // --------------------------------------------------------------------------
  // ZERO-ALLOCATION METRICS GETTER (CALLED AT 60-144 FPS BY MANY CONSUMERS)
  // --------------------------------------------------------------------------
  function getMetrics(): AudioMetrics {
    const isFilePlaying =
      mode === 'FILE' && audioEl !== null && !audioEl.paused && !audioEl.ended;
    const isSynthPlaying = mode === 'SYNTH' && synthRunning;
    const active = isFilePlaying || isSynthPlaying;

    metrics.isPlaying = active;
    if (!active || !analyser) {
      metrics.bass = 0;
      metrics.mid = 0;
      metrics.high = 0;
      metrics.overall = 0;
      metrics.isBeat = false;
      return metrics;
    }

    const nowMs = performance.now();

    // Same-frame memoization: cat rig, club stage and 2D HUD each call this
    // every frame — only compute the FFT analysis once per ~frame.
    if (nowMs - lastMetricsCalcMs < FRAME_MEMO_MS) {
      metrics.isBeat = nowMs < beatLatchUntilMs;
      return metrics;
    }
    lastMetricsCalcMs = nowMs;

    analyser.getByteFrequencyData(freqData);

    // 1. Sub-Band Bass (20 - 140 Hz): kick drum / sub-bass
    let sumBass = 0;
    const countBass = bassEnd - bassStart + 1;
    for (let i = bassStart; i <= bassEnd; i++) {
      sumBass += freqData[i];
    }
    const rawBass = sumBass / (countBass * 255);
    const shapedBass = Math.min(1, Math.pow(rawBass, 1.15) * 1.18);

    // 2. Sub-Band Mid (140 - 900 Hz): snare / vocals / groove
    let sumMid = 0;
    const countMid = midEnd - midStart + 1;
    for (let i = midStart; i <= midEnd; i++) {
      sumMid += freqData[i];
    }
    const rawMid = sumMid / (countMid * 255);
    const shapedMid = Math.min(1, Math.pow(rawMid, 1.1) * 1.25);

    // 3. Sub-Band High (1.5k - 6k Hz): hi-hats / treble
    let sumHigh = 0;
    const countHigh = highEnd - highStart + 1;
    for (let i = highStart; i <= highEnd; i++) {
      sumHigh += freqData[i];
    }
    const rawHigh = sumHigh / (countHigh * 255);
    const shapedHigh = Math.min(1, Math.pow(rawHigh, 0.95) * 1.45);

    // 4. Smoothed overall RMS energy
    const instOverall = shapedBass * 0.45 + shapedMid * 0.35 + shapedHigh * 0.2;
    smoothedOverall = smoothedOverall * 0.82 + instOverall * 0.18;

    // 5. BEAT DETECTION
    if (mode === 'SYNTH' && ctx) {
      // Deterministic path: the demo synth's beat grid is known exactly, so
      // isBeat fires sample-accurate impulses straight off the audio clock
      // (perfect sync, immune to analyzer-side EWMA inflation from the acid
      // bassline overlapping the 20-140 Hz kick band).
      const nowAudio = ctx.currentTime;
      if (synthBeatWriteCount - synthBeatReadIdx > SYNTH_BEAT_RING) {
        synthBeatReadIdx = synthBeatWriteCount - SYNTH_BEAT_RING;
      }
      let firedBeat = false;
      while (
        synthBeatReadIdx < synthBeatWriteCount &&
        synthBeatTimes[synthBeatReadIdx % SYNTH_BEAT_RING] <= nowAudio
      ) {
        firedBeat = true;
        synthBeatReadIdx++;
      }
      if (firedBeat) {
        beatLatchUntilMs = nowMs + BEAT_LATCH_MS;
        metrics.bpm = synthBpm;
      }
    } else {
      // Adaptive spectral-flux kick transient + BPM estimator for uploaded
      // MP3s (positive flux => trigger on the rising edge, never on
      // sustained sub-bass).
      const positiveFlux = Math.max(0, shapedBass - prevBass);
      prevBass = shapedBass;

      const isTransient =
        shapedBass > bassAvg * 1.26 && // adaptive ratio vs local energy
        shapedBass > 0.32 && // noise gate
        positiveFlux > 0.04 && // onset attack requirement
        nowMs - lastBeatTimeMs > 230; // refractory window

      bassAvg = bassAvg * 0.94 + shapedBass * 0.06;

      if (isTransient) {
        const deltaMs = nowMs - lastBeatTimeMs;
        lastBeatTimeMs = nowMs;
        beatLatchUntilMs = nowMs + BEAT_LATCH_MS;

        if (deltaMs > 320 && deltaMs < 700) {
          // Valid inter-onset interval -> jitter-free BPM via ring buffer mean
          const instBpm = 60000 / deltaMs;
          bpmRingBuffer[bpmRingWriteIdx] = instBpm;
          bpmRingWriteIdx = (bpmRingWriteIdx + 1) % bpmRingBuffer.length;
          if (bpmRingCount < bpmRingBuffer.length) bpmRingCount++;

          let bpmSum = 0;
          for (let i = 0; i < bpmRingCount; i++) {
            bpmSum += bpmRingBuffer[i];
          }
          metrics.bpm = Math.round(
            Math.max(BPM_MIN, Math.min(BPM_MAX, bpmSum / bpmRingCount))
          );
        }
      }
    }

    metrics.bass = shapedBass;
    metrics.mid = shapedMid;
    metrics.high = shapedHigh;
    metrics.overall = smoothedOverall;
    metrics.isBeat = nowMs < beatLatchUntilMs;

    return metrics;
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------
  return {
    getMetrics,
    getRawFrequencyData: () => freqData,

    getRecordingStream(): MediaStream | null {
      if (!analyser) return null;
      const audioContext = ensureAudioContext();
      if (!recordingDest) {
        recordingDest = audioContext.createMediaStreamDestination();
        // Pre-volume tap from the analyser: recording audio survives both
        // the mute button and volume changes (captures content, not monitor)
        analyser.connect(recordingDest);
      }
      return recordingDest.stream;
    },

    attachPcmTap(cb) {
      const audioContext = ensureAudioContext();
      void audioContext.resume().catch(() => undefined);
      let node: AudioWorkletNode | ScriptProcessorNode | null = null;
      let sink: GainNode | null = null;
      let cancelled = false;
      // Shared zero-gain sink: keeps the tap pulled by the graph while
      // emitting silence (it never copies input -> output).
      sink = audioContext.createGain();
      sink.gain.value = 0;
      sink.connect(audioContext.destination);

      const detach = () => {
        cancelled = true;
        try {
          if (node) {
            const maybeWorklet = node as AudioWorkletNode;
            if (maybeWorklet.port) maybeWorklet.port.onmessage = null;
          }
        } catch {
          /* not a worklet */
        }
        try {
          if (node) node.disconnect();
        } catch {
          /* already gone */
        }
        try {
          if (sink) sink.disconnect();
        } catch {
          /* already gone */
        }
        node = null;
        sink = null;
      };

      const url = URL.createObjectURL(
        new Blob([PCM_TAP_WORKLET_SRC], { type: 'text/javascript' })
      );
      audioContext.audioWorklet
        .addModule(url)
        .then(() => {
          URL.revokeObjectURL(url);
          if (cancelled || !analyser) return;
          const workletNode = new AudioWorkletNode(
            audioContext,
            'rec-pcm-tap',
            { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }
          );
          workletNode.port.onmessage = (ev: MessageEvent) => {
            const d = ev.data as { l: Float32Array; r: Float32Array; frames: number };
            cb(d.l, d.r, d.frames, audioContext.sampleRate);
          };
          analyser.connect(workletNode);
          workletNode.connect(sink as GainNode);
          node = workletNode;
        })
        .catch(() => {
          URL.revokeObjectURL(url);
          if (cancelled || !analyser) return;
          // ScriptProcessorNode fallback (deprecated but universal).
          // Input is the pre-volume analyser bus; output stays silent.
          const spn = audioContext.createScriptProcessor(4096, 2, 2);
          spn.onaudioprocess = (ev: AudioProcessingEvent) => {
            cb(
              ev.inputBuffer.getChannelData(0),
              ev.inputBuffer.getChannelData(1),
              4096,
              audioContext.sampleRate
            );
          };
          analyser.connect(spn);
          spn.connect(sink as GainNode);
          node = spn;
        });

      return detach;
    },

    getPcmSampleRate(): number | null {
      try {
        return ensureAudioContext().sampleRate;
      } catch {
        return null;
      }
    },

    async loadFile(file: File) {
      stopSynthTimer();
      if (mode === 'SYNTH') mode = 'IDLE';
      const audioContext = ensureAudioContext();
      audioContext.resume().catch(() => {});

      // Revoke the previous blob URL so browser RAM stays flat across
      // 50+ uploaded songs (Memory Leak & URL Cleanup mandate).
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
      }
      currentObjectUrl = URL.createObjectURL(file);

      if (audioEl) {
        audioEl.src = currentObjectUrl;
        audioEl.currentTime = 0;
        mode = 'FILE';
        trackName = file.name.replace(/\.[^/.]+$/, '');
      }

      resetBeatEstimator();

      // Start playback instantly; run offline BPM detection in parallel
      const playPromise =
        audioEl && mode === 'FILE'
          ? audioEl.play().catch(() => undefined)
          : Promise.resolve();

      let detected = 128;
      try {
        const arrayBuffer = await file.arrayBuffer();
        detected = await detectBPMOffline(arrayBuffer);
      } catch {
        detected = 128; // safe fallback if decoding fails
      }
      metrics.bpm = detected;

      await playPromise;
      return detected;
    },

    startBuiltInSynth(bpm = 128) {
      const audioContext = ensureAudioContext();
      audioContext.resume().catch(() => {});
      startSynthInternal(bpm);
    },

    async tryStartBuiltInSynth(bpm = 128) {
      // Already running -> no restart (prevents gesture handlers double-firing)
      if (mode === 'SYNTH' && synthRunning) return true;
      const audioContext = ensureAudioContext();
      if (audioContext.state !== 'running') {
        // A genuine user gesture resolves resume() within milliseconds. A
        // PARKED resume (the mount-time autoplay attempt that the browser
        // blocked) can resolve minutes later inside some unrelated click —
        // it must never hijack that user action, so stale calls abort.
        const callTimeMs = performance.now();
        try {
          await audioContext.resume();
        } catch {
          return false;
        }
        if (!isCtxRunning(audioContext)) return false;
        if (performance.now() - callTimeMs > 1500) return false;
      }
      startSynthInternal(bpm);
      return true;
    },

    stopBuiltInSynth() {
      stopSynthTimer();
      if (mode === 'SYNTH') mode = 'IDLE';
    },

    async togglePlay() {
      const audioContext = ensureAudioContext();
      await audioContext.resume().catch(() => undefined);

      if (mode === 'SYNTH') {
        if (synthRunning) {
          stopSynthTimer();
          mode = 'IDLE';
        } else {
          mode = 'SYNTH';
          startSynthTimer();
        }
        return;
      }

      if (mode === 'FILE' && audioEl) {
        if (audioEl.paused) {
          await audioEl.play().catch(() => undefined);
        } else {
          audioEl.pause();
        }
        return;
      }

      // Nothing loaded -> start the built-in 808 synth immediately
      startSynthInternal(synthBpm);
    },

    seek(timeSeconds: number) {
      if (mode === 'FILE' && audioEl) {
        audioEl.currentTime = Math.max(
          0,
          Math.min(timeSeconds, audioEl.duration || 0)
        );
      }
    },

    setVolume(vol: number) {
      masterVolume = Math.max(0, Math.min(1, vol));
      if (masterGain && ctx) {
        masterGain.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.02);
      }
    },

    setSynthBpm(bpm: number) {
      synthBpm = Math.max(BPM_MIN, Math.min(BPM_MAX, bpm));
      if (mode === 'SYNTH') {
        metrics.bpm = synthBpm;
        trackName = `Demo Beat — ${synthBpm} BPM Club Synth`;
        notifyPlaybackChange();
      }
    },

    setOnPlaybackChange(cb: (() => void) | null) {
      onPlaybackChange = cb;
    },

    getPlaybackInfo() {
      const isFilePlaying =
        mode === 'FILE' && audioEl !== null && !audioEl.paused && !audioEl.ended;
      const isSynthPlaying = mode === 'SYNTH' && synthRunning;
      return {
        currentTime: mode === 'FILE' && audioEl ? audioEl.currentTime : 0,
        duration:
          mode === 'FILE' && audioEl && Number.isFinite(audioEl.duration)
            ? audioEl.duration
            : 0,
        trackName,
        mode,
        isPlaying: isFilePlaying || isSynthPlaying,
        volume: masterVolume,
      };
    },

    dispose() {
      stopSynthTimer();
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
        try {
          audioEl.load();
        } catch {
          // no-op
        }
        audioEl = null;
        mediaSource = null;
      }
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
      }
      if (ctx) {
        if (recordingDest) {
          try {
            recordingDest.disconnect();
          } catch {
            // no-op
          }
          recordingDest = null;
        }
        ctx.close().catch(() => {});
        ctx = null;
        analyser = null;
        masterGain = null;
      }
    },
  };
}
