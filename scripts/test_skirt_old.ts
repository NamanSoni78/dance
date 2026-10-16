// scripts/test_skirt_old_vs_new.ts — does the OLD (V4-verified) cloth sim
// hold the skirt shape under the same call pattern that shatters the new one?

import { SkirtClothSim as OldSim } from '../.ref/girl-diva-mega/src-lib-girlCloth';

function makeMat(tx: number, ty: number, tz: number, yaw = 0): Float32Array {
  const m = new Float32Array(16);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  m[0] = c; m[2] = -s;
  m[5] = 1;
  m[8] = s; m[10] = c;
  m[15] = 1;
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}

const sim = new OldSim();
const waist = makeMat(0, 0.99, 0, 0);
const caps = new Float32Array(28);
caps.set([-0.087, 0.90, 0, -0.087, 0.47, 0, 0.10], 0);
caps.set([-0.087, 0.47, 0, -0.087, 0.12, 0, 0.072], 7);
caps.set([0.087, 0.90, 0, 0.087, 0.47, 0, 0.10], 14);
caps.set([0.087, 0.47, 0, 0.087, 0.12, 0, 0.072], 21);

function stats(label: string): void {
  const p = sim.positions;
  let minY = Infinity, maxY = -Infinity, nan = 0;
  for (let i = 0; i < sim.numParticles; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nan++;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  console.log(`${label}: nan=${nan} y=[${minY.toFixed(3)}, ${maxY.toFixed(3)}]`);
}

// Old API: object params {dt, waistMatrix, legCapsules, spinVelocity, bass, high, beatPulse, elapsed}
for (let step = 0; step < 600; step++) {
  sim.update({
    dt: 1 / 120,
    waistMatrix: waist,
    legCapsules: caps,
    spinVelocity: 0,
    bass: 0.3,
    high: 0.18,
    beatPulse: 0,
    elapsed: step / 120,
  });
  if (step === 0 || step === 1 || step === 5 || step === 120 || step === 599) {
    stats(`old step ${step}`);
  }
}
