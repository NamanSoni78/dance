// src/lib/mp4Recorder.ts
// V4 RECORDING V5 — native WebCodecs MP4 encoder (the VLC-seek fix).
//
// BF-20 ROOT CAUSE: MediaRecorder's H.264 track uses long browser-chosen
// GOPs and a thin sync-sample (stss) table. Seeking a player (VLC) to an
// arbitrary timestamp lands mid-GOP, potentially seconds from the nearest
// IDR — the decoder then freeze-frames, smears macroblocks and flickers
// until the next keyframe arrives. Playback start-to-end looked fine, which
// is exactly the reported symptom ("plays, but seek to any timestamp breaks").
//
// V5 FIX: encode the video ourselves with WebCodecs where the app owns the
// GOP — an IDR keyframe every 30 frames (1 s at 30 fps CFR), muxed by
// mp4-muxer which records every key chunk in the stss box. Any seek target
// is now within ~500 ms of a clean IDR, so decoders snap to the picture
// instantly. Audio is tapped as raw PCM (audioEngine.attachPcmTap worklet)
// and encoded through AudioEncoder (AAC, Opus fallback). If WebCodecs is
// unavailable the caller falls back to the legacy MediaRecorder path.

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface Mp4RecorderOptions {
  canvas: HTMLCanvasElement;
  /** Constant frame rate of the capture grid (default 30). */
  fps?: number;
  /** Keyframe interval in seconds (default 1.0 = IDR every 30 frames). */
  gopSeconds?: number;
  /** Video bitrate (default 16 Mbps — transparent at DPR-1 ≤1080p). */
  videoBitrate?: number;
  /** Registers the PCM tap; returns an unregister function. */
  attachPcmTap: (
    cb: (l: Float32Array, r: Float32Array, frames: number, sampleRate: number) => void
  ) => () => void;
  /** AudioContext.sampleRate probe (null = no audio track). */
  getPcmSampleRate: () => number | null;
  /** Optional error sink (never throws). */
  onError?: (msg: string) => void;
}

export interface Mp4RecorderHandle {
  /** Called by the CFR RecordFrameTap on each capture tick (30 fps grid). */
  onCapture: (canvas: HTMLCanvasElement) => void;
  /** Flushes encoders + finalizes the muxer; resolves the finished MP4 blob. */
  stop: () => Promise<Blob>;
  /** Tears down without producing a file. */
  abort: () => void;
}

/** H.264 codec candidates, most-capable first (High L5.1 → High L4 → Baseline). */
const AVC_CANDIDATES = ['avc1.640033', 'avc1.640028', 'avc1.42E01E'] as const;

interface AudioPlan {
  codec: 'aac' | 'opus';
  sampleRate: number;
  bitrate: number;
}

export async function createMp4Recorder(
  opts: Mp4RecorderOptions
): Promise<Mp4RecorderHandle | null> {
  const { canvas } = opts;
  const fps = opts.fps ?? 30;
  // BF-28: GOP is enforced in REAL time (gopUs) inside onCapture — a frame
  // count would stretch whenever capture ticks drop.
  const gopUs = Math.round((opts.gopSeconds ?? 1.0) * 1_000_000);
  const videoBitrate = opts.videoBitrate ?? 16_000_000;
  const onError = opts.onError ?? (() => {});

  // ---- video probe ---------------------------------------------------------
  if (typeof VideoEncoder === 'undefined') return null;
  const rawW = canvas.width;
  const rawH = canvas.height;
  if (rawW < 2 || rawH < 2) return null;
  // H.264 yuv420 needs even dimensions; the rare odd canvas is blitted
  // through a scratch 2D canvas (GPU copy) before constructing VideoFrame.
  const outW = rawW & ~1;
  const outH = rawH & ~1;
  const needsBlit = outW !== rawW || outH !== rawH;

  let videoCodec: string | null = null;
  for (const codec of AVC_CANDIDATES) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: outW,
        height: outH,
        bitrate: videoBitrate,
        framerate: fps,
      });
      if (support.supported) {
        videoCodec = codec;
        break;
      }
    } catch {
      // try the next candidate
    }
  }
  if (!videoCodec) return null;

  // ---- audio probe ---------------------------------------------------------
  let audio: AudioPlan | null = null;
  const sampleRate = opts.getPcmSampleRate();
  if (typeof AudioEncoder !== 'undefined' && sampleRate && sampleRate >= 8000) {
    const audioCandidates: Array<{ codec: 'aac' | 'opus'; bitrate: number }> = [
      { codec: 'aac', bitrate: 192_000 },
      { codec: 'opus', bitrate: 160_000 },
    ];
    for (const cand of audioCandidates) {
      try {
        const support = await AudioEncoder.isConfigSupported({
          codec: cand.codec,
          sampleRate,
          numberOfChannels: 2,
          bitrate: cand.bitrate,
        });
        if (support.supported) {
          audio = { ...cand, sampleRate };
          break;
        }
      } catch {
        // try the next candidate
      }
    }
  }

  // ---- muxer ---------------------------------------------------------------
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: outW, height: outH, frameRate: fps },
    ...(audio
      ? {
          audio: {
            codec: audio.codec,
            numberOfChannels: 2,
            sampleRate: audio.sampleRate,
          },
        }
      : {}),
    // moov written up-front into memory on finalize: complete duration +
    // seek tables in one atom — the file is streamable and random-access
    // the moment it hits disk.
    fastStart: 'in-memory',
    // Video timestamps start at 0; audio timestamps start whenever the tap
    // attached. Normalize both to 0 so tracks interleave cleanly.
    firstTimestampBehavior: 'offset',
  });

  // ---- encoders ------------------------------------------------------------
  let failed = false;
  // BF-28 REAL-TIME TIMESTAMPS. V5 stamped every frame at
  // frameIndex / fps — synthetic CFR. The capture grid PACES frames at 30 fps
  // but cannot GUARANTEE that rate: the backpressure guard below drops ticks,
  // `latencyMode: 'quality'` hardware encoders buffer frames in lookahead
  // queues, and any rAF stall (GC, occlusion, heavy 4-dancer scene) skips
  // ticks. Every dropped tick compressed the video timeline by one frame
  // slot while the audio track (sample-count timestamps) stayed real-time —
  // a 2-minute take with half the ticks dropped exported a 60 s video track
  // playing at 2x speed, then freeze-framing on the last frame while the
  // audio ran to 2:00 (the container duration comes from the longer track).
  // FIX: stamp each frame with the REAL elapsed wall-clock time since the
  // recorder was created. Video duration now always equals audio duration
  // equals wall clock; a dropped tick just means that frame is absent (VFR),
  // never a speed-up.
  const t0 = performance.now();
  let lastFramePtsUs = -1;
  let lastKeyFrameUs = -1;
  // BF-28 reorder-safe dts: encoded chunks may arrive out of presentation
  // order (B-frames under latencyMode 'quality'). We buffer a small window
  // of arrivals (decode order) and emit each chunk with
  //   dts = min(pts of itself and the next REORDER_WINDOW-1 arrivals),
  // clamped strictly increasing; ctts = max(0, pts - dts).
  // On encoders without B-frames (the common case) pts arrives ascending, so
  // dts == pts and ctts == 0 — identical to a plain VFR mux, no ctts box.
  const REORDER_WINDOW = 6;
  const pendingChunks: Array<{
    chunk: EncodedVideoChunk;
    meta: EncodedVideoChunkMetadata | undefined;
  }> = [];
  let lastDtsUs = -1;
  const emitPendingChunk = () => {
    const item = pendingChunks.shift();
    if (!item) return;
    const ptsUs = item.chunk.timestamp;
    let dtsUs = ptsUs;
    for (let k = 0; k < pendingChunks.length; k++) {
      const p = pendingChunks[k].chunk.timestamp;
      if (p < dtsUs) dtsUs = p;
    }
    if (dtsUs <= lastDtsUs) dtsUs = lastDtsUs + 1;
    lastDtsUs = dtsUs;
    const compositionOffsetUs = Math.max(0, ptsUs - dtsUs);
    muxer.addVideoChunk(item.chunk, item.meta, dtsUs, compositionOffsetUs);
  };
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      pendingChunks.push({ chunk, meta });
      while (pendingChunks.length > REORDER_WINDOW) emitPendingChunk();
    },
    error: (e) => {
      failed = true;
      onError(`video encoder: ${(e as Error).message}`);
    },
  });
  videoEncoder.configure({
    codec: videoCodec,
    width: outW,
    height: outH,
    bitrate: videoBitrate,
    framerate: fps,
    // 'quality' mode: the encoder may buffer for better rate control; the
    // capture grid already paces input at CFR, so latency stays ~1 frame.
    latencyMode: 'quality',
  });

  let audioEncoder: AudioEncoder | null = null;
  let audioChunks = 0;
  let audioFrames = 0;
  let detachPcm: (() => void) | null = null;
  if (audio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
        audioChunks++;
      },
      error: (e) => {
        failed = true;
        onError(`audio encoder: ${(e as Error).message}`);
      },
    });
    audioEncoder.configure({
      codec: audio.codec,
      sampleRate: audio.sampleRate,
      numberOfChannels: 2,
      bitrate: audio.bitrate,
    });
  }

  // Scratch 2D canvas for odd-dimension blits (allocated lazily once).
  let blitCanvas: HTMLCanvasElement | null = null;
  let blitCtx: CanvasRenderingContext2D | null = null;

  let frameIndex = -1;

  const onCapture = (srcCanvas: HTMLCanvasElement) => {
    if (failed) return;
    // Backpressure guard: with real-time timestamps a dropped tick is now
    // HARMLESS (the frame is simply absent, timing stays correct), so the
    // threshold is raised well above the lookahead depth of quality-mode
    // hardware encoders (~4-8 frames) — dropping ticks is the last resort,
    // not a routine rate-limiter.
    if (videoEncoder.encodeQueueSize > 24) return;

    // BF-24c: guard against ANY live-canvas size drift (mid-REC window
    // resize / browser zoom / toolbar collapse). The encoder is configured
    // once at (outW, outH); a VideoFrame built from a different-size canvas
    // corrupts the stream. Blit-scale through the scratch 2D canvas
    // whenever the source does not exactly match the encoder config.
    const sizeMismatch =
      srcCanvas.width !== outW || srcCanvas.height !== outH;
    let source: CanvasImageSource = srcCanvas;
    if (needsBlit || sizeMismatch) {
      if (!blitCanvas) {
        blitCanvas = document.createElement('canvas');
        blitCanvas.width = outW;
        blitCanvas.height = outH;
        blitCtx = blitCanvas.getContext('2d', { alpha: false });
      }
      if (!blitCtx) return;
      blitCtx.drawImage(srcCanvas, 0, 0, outW, outH);
      source = blitCanvas;
    }

    frameIndex++;
    // BF-28: REAL elapsed wall-clock time — the video track can never drift
    // from the audio track's sample-accurate timeline, no matter how many
    // capture ticks were dropped or how the encoder reorders its output.
    let timestampUs = Math.round((performance.now() - t0) * 1000);
    if (timestampUs <= lastFramePtsUs) timestampUs = lastFramePtsUs + 1000;
    lastFramePtsUs = timestampUs;
    const durationUs = Math.round(1_000_000 / fps);
    // BF-28: 1 s GOP in REAL time (frame-count cadence would stretch to 2+ s
    // of wall clock whenever ticks drop, hollowing out the seek table).
    const dueKeyFrame = timestampUs - lastKeyFrameUs >= gopUs;
    if (dueKeyFrame) lastKeyFrameUs = timestampUs;
    try {
      const frame = new VideoFrame(source, { timestamp: timestampUs, duration: durationUs });
      // THE FIX: explicit 1 s GOP. keyFrame forces a clean IDR; mp4-muxer
      // records each key chunk in stss, so every second of the file is a
      // random-access point.
      videoEncoder.encode(frame, { keyFrame: dueKeyFrame });
      frame.close();
    } catch (e) {
      failed = true;
      onError(`frame capture: ${(e as Error).message}`);
    }
  };

  // ---- audio PCM plumbing --------------------------------------------------
  if (audio && audioEncoder) {
    const encoderRef = audioEncoder;
    detachPcm = opts.attachPcmTap((l, r, frames, sr) => {
      if (failed || encoderRef.state === 'closed') return;
      if (frames <= 0) return;
      // f32-planar: one buffer holding the L plane then the R plane.
      const planar = new Float32Array(frames * 2);
      planar.set(l.subarray(0, frames), 0);
      planar.set(r.subarray(0, frames), frames);
      const timestampUs = Math.round((audioFrames * 1_000_000) / sr);
      audioFrames += frames;
      try {
        const ad = new AudioData({
          format: 'f32-planar',
          sampleRate: sr,
          numberOfFrames: frames,
          numberOfChannels: 2,
          timestamp: timestampUs,
          data: planar,
        });
        encoderRef.encode(ad);
        ad.close();
      } catch (e) {
        failed = true;
        onError(`audio encode: ${(e as Error).message}`);
      }
    });
  }

  const teardown = () => {
    try {
      detachPcm?.();
    } catch {
      /* already detached */
    }
    detachPcm = null;
    try {
      if (videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      /* closing */
    }
    try {
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    } catch {
      /* closing */
    }
  };

  const stop = async (): Promise<Blob> => {
    if (failed) {
      teardown();
      throw new Error('mp4 recorder failed during capture');
    }
    if (frameIndex < 0) {
      teardown();
      throw new Error('mp4 recorder captured no frames');
    }
    // Guard: a configured-but-empty audio track is an invalid MP4. If the
    // tap never delivered samples (no music playing), synthesize one silent
    // block so the track exists and is well-formed.
    if (audio && audioEncoder && audioChunks === 0) {
      const frames = 2048;
      const silence = new Float32Array(frames * 2);
      try {
        const ad = new AudioData({
          format: 'f32-planar',
          sampleRate: audio.sampleRate,
          numberOfFrames: frames,
          numberOfChannels: 2,
          timestamp: 0,
          data: silence,
        });
        audioEncoder.encode(ad);
        ad.close();
      } catch {
        /* leave the track empty; finalize will still run */
      }
    }
    try {
      detachPcm?.();
      detachPcm = null;
      await videoEncoder.flush();
      // Flush delivered any reorder-window stragglers — emit the decode-order
      // tail so every encoded frame reaches the muxer before finalize.
      while (pendingChunks.length > 0) emitPendingChunk();
      if (audioEncoder) await audioEncoder.flush();
      muxer.finalize();
    } finally {
      teardown();
    }
    return new Blob([target.buffer], { type: 'video/mp4' });
  };

  const abort = () => {
    failed = true;
    teardown();
  };

  return { onCapture, stop, abort };
}
