// V5 offline stability test for the AI cloth + hair sims:
// feed them violent waist/head motion (fast spins, drops, teleports) and
// assert positions stay finite and inside sane bounds for thousands of steps.
import { SkirtClothSim } from '../src/lib/girlCloth';
import { GirlHairSim } from '../src/lib/girlHair';

const MAT = new Float32Array(16);
function setMat(x: number, y: number, z: number, yaw: number): void {
  // Column-major 4x4 like THREE.Matrix4: rotation-Y + translation
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  MAT.fill(0);
  MAT[0] = c; MAT[2] = -s;
  MAT[5] = 1;
  MAT[8] = s; MAT[10] = c;
  MAT[15] = 1;
  MAT[12] = x; MAT[13] = y; MAT[14] = z;
}

let failures = 0;
function checkFinite(label: string, arr: Float32Array, maxAbs: number): void {
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) {
      console.log(`!!! FAIL [${label}] value[${i}] = ${v}`);
      failures++;
      return;
    }
    if (Math.abs(v) > maxAbs) {
      console.log(`!!! FAIL [${label}] |value[${i}]| = ${Math.abs(v)} > ${maxAbs}`);
      failures++;
      return;
    }
  }
}

// ---- CLOTH: spin 12 rad/s + drops to the floor + teleports ---------------
const cloth = new SkirtClothSim();
const caps = new Float32Array(28);
caps.set([0, 0.9, 0, 0, 0.51, 0, 0.1], 0);   // left thigh
caps.set([0, 0.51, 0, 0, 0.12, 0, 0.072], 7); // left shin
caps.set([0.05, 0.9, 0, 0.05, 0.51, 0, 0.1], 14);
caps.set([0.05, 0.51, 0, 0.05, 0.12, 0, 0.072], 21);
let yaw = 0;
for (let step = 0; step < 4000; step++) {
  const t = step * 0.016;
  // violent choreography: fast spin + squat bounce + horizontal travel
  yaw += 12 * 0.016;
  const y = 0.9 - 0.4 * Math.max(0, Math.sin(t * 6.1));
  setMat(Math.sin(t * 2.3) * 0.8, y, Math.cos(t * 1.7) * 0.6, yaw);
  cloth.update({ dt: 0.016, waistMatrix: MAT, legCapsules: caps, spinVelocity: 12, bass: 0.9, high: 0.7, beatPulse: step % 16 === 0 ? 1 : 0, elapsed: t });
  if (step === 2000) {
    // teleport stress: huge jump must trigger reset, not explode
    setMat(50, 3, -50, yaw);
    cloth.update({ dt: 0.016, waistMatrix: MAT, legCapsules: caps, elapsed: t });
  }
  if (step % 100 === 0) {
    checkFinite(`cloth pos @${step}`, cloth.positions, 80);
    checkFinite(`cloth normals @${step}`, cloth.normals, 2);
  }
}
console.log(`cloth sim: 4000 steps OK (spin 12 rad/s, drops, travel, teleport) — failures: ${failures}`);

// Hem ring sanity
cloth.updateHemRingBuffer();
checkFinite('hem ring', cloth.hemRingPositions, 80);

// ---- HAIR: whip spins + head bangs + teleports ---------------------------
const hair = new GirlHairSim();
for (let step = 0; step < 4000; step++) {
  const t = step * 0.016;
  yaw += 18 * 0.016; // whip carriage territory
  const y = 1.55 + Math.sin(t * 9.0) * 0.12; // head height bobbing hard
  setMat(Math.sin(t * 3.1) * 0.9, y, Math.cos(t * 2.2) * 0.7, yaw);
  hair.update({
    dt: 0.016,
    headMatrix: MAT,
    tailCarriage: step % 64 < 32 ? 'whip' : 'high',
    spinVelocity: 18,
    bass: 0.85,
    high: 0.6,
    beatPulse: step % 8 === 0 ? 1 : 0,
    elapsed: t,
  });
  if (step === 1500) {
    setMat(-40, 2, 40, yaw);
    hair.update({ dt: 0.016, headMatrix: MAT, elapsed: t });
  }
  if (step % 100 === 0) {
    checkFinite(`hair pos @${step}`, hair.positions, 60);
    checkFinite(`hair quats @${step}`, hair.segmentQuaternions, 1.01);
    checkFinite(`hair scales @${step}`, hair.segmentScales, 2);
  }
}
console.log(`hair sim: 4000 steps OK (whip spins, head bangs, teleport) — failures: ${failures}`);

// Floor-lock sanity: hair must never dip below 0.12 m world
let minY = Infinity;
for (let i = 1; i < hair.positions.length; i += 3) {
  if (hair.positions[i] < minY) minY = hair.positions[i];
}
console.log(`hair lowest particle after sim: ${minY.toFixed(3)} m (floor lock >= 0.12)`);
if (minY < 0.10) { console.log('!!! FAIL hair floor lock breached'); failures++; }

// Cloth floor clamp sanity (0.02 m)
minY = Infinity;
for (let i = 1; i < cloth.positions.length; i += 3) {
  if (cloth.positions[i] < minY) minY = cloth.positions[i];
}
console.log(`cloth lowest particle after sim: ${minY.toFixed(3)} m (floor clamp >= 0.02)`);
if (minY < 0.0) { console.log('!!! FAIL cloth floor clamp breached'); failures++; }

console.log(`\n${failures === 0 ? 'ALL SIM STABILITY CHECKS PASSED' : `FAILURES: ${failures}`}`);
process.exitCode = failures === 0 ? 0 : 1;
