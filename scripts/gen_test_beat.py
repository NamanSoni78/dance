#!/usr/bin/env python3
"""Generate a 120 BPM test WAV (kick every 0.5s + hats) to verify the
offline BPM detection pipeline end-to-end in the browser."""
import math
import struct
import wave

SR = 44100
DUR = 12.0
BPM = 120
BEAT = 60.0 / BPM  # 0.5 s

n = int(SR * DUR)
samples = [0.0] * n

def add_tone(start_s, dur_s, f0, f1, amp, decay_pow=2.0):
    start = int(start_s * SR)
    length = int(dur_s * SR)
    for i in range(length):
        idx = start + i
        if idx >= n:
            break
        t = i / SR
        # exponential pitch drop (808-style kick)
        f = f0 * (f1 / f0) ** min(1.0, t / (dur_s * 0.3))
        env = amp * max(0.0, 1.0 - t / dur_s) ** decay_pow
        samples[idx] += env * math.sin(2 * math.pi * f * t)

def add_noise(start_s, dur_s, amp):
    import random
    random.seed(42)
    start = int(start_s * SR)
    length = int(dur_s * SR)
    for i in range(length):
        idx = start + i
        if idx >= n:
            break
        t = i / SR
        env = amp * max(0.0, 1.0 - t / dur_s) ** 3.0
        samples[idx] += env * (random.random() * 2 - 1)

t_beat = 0.0
while t_beat < DUR - 0.4:
    add_tone(t_beat, 0.30, 150.0, 40.0, 0.9, 2.5)   # kick
    add_noise(t_beat + BEAT / 2, 0.05, 0.25)         # off-beat hat
    add_tone(t_beat + BEAT / 2, 0.12, 220.0, 110.0, 0.35, 2.0)  # snare-ish
    t_beat += BEAT

# normalize + soft clip
peak = max(abs(s) for s in samples) or 1.0
scale = 0.92 / peak
out = []
for s in samples:
    v = max(-1.0, min(1.0, s * scale))
    out.append(struct.pack('<h', int(v * 32767)))

path = '/home/z/my-project/.ref/test-120bpm.wav'
with wave.open(path, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b''.join(out))

print(f'Wrote {path}: {DUR}s @ {BPM} BPM (beat interval {BEAT}s)')
