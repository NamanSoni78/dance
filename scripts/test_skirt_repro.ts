// scripts/test_skirt_repro.ts
// Reproduce the DivaBody skirt call pattern offline against the NEW
// SkirtClothSim to find why the skirt shatters in the live build.

import { SkirtClothSim } from '../src/lib/girlCloth';

// Column-major 4x4 like THREE.Matrix4
function makeMat(
  tx: number, ty: number, tz: number,
  yaw = 0
): Float32Array {
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

const sim = new SkirtClothSim();

// Root-local pelvis (waist) — pelvis at (0, 0.99, 0) in root space
const waist = makeMat(0, 0.99, 0, 0);

// Root-local leg capsules for straight standing legs (hip y=0.90):
// 6 capsules x (ax,ay,az,bx,by,bz,r) — 2 legs x 3 capsules
const caps = new Float32Array(42);
// left leg (-X): thigh hip(-0.087, 0.90, 0) -> knee(-0.087, 0.47, 0)
caps.set([-0.087, 0.90, 0, -0.087, 0.47, 0, 0.079], 0);
// left shin knee -> ankle(-0.087, 0.05, 0)
caps.set([-0.087, 0.47, 0, -0.087, 0.05, 0, 0.054], 7);
// left hip blob
caps.set([-0.087, 0.90, 0, -0.087, 0.90, 0, 0.088], 14);
// right leg (+X)
caps.set([0.087, 0.90, 0, 0.087, 0.47, 0, 0.079], 21);
caps.set([0.087, 0.47, 0, 0.087, 0.05, 0, 0.054], 28);
caps.set([0.087, 0.90, 0, 0.087, 0.90, 0, 0.088], 35);

function stats(label: string): void {
  const p = sim.positions;
  let minY = Infinity, maxY = -Infinity;
  let minR = Infinity, maxR = -Infinity;
  let nan = 0;
  for (let i = 0; i < sim.numParticles; i++) {
    const x = p[i * 3];
    const y = p[i * 3 + 1];
    const z = p[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nan++;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    const r = Math.hypot(x, z);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
  }
  console.log(
    `${label}: nan=${nan} y=[${minY.toFixed(3)}, ${maxY.toFixed(3)}] radius=[${minR.toFixed(3)}, ${maxR.toFixed(3)}]`
  );
}

// The girl_3d per-step pattern: dt = 1/120
const DT = 1 / 120;
for (let step = 0; step < 600; step++) {
  sim.update(DT, waist, caps, 0, 0.3, 0.18, step * DT, 0);
  if (step === 0 || step === 1 || step === 5 || step === 30 || step === 120 || step === 599) {
    stats(`step ${step}`);
  }
}

// Also try the old-style dt (1/60)
const sim2 = new SkirtClothSim();
for (let step = 0; step < 300; step++) {
  sim2.update(1 / 60, waist, caps, 0, 0.3, 0.18, step / 60, 0);
}
stats('dt=1/60 after 300 steps');
