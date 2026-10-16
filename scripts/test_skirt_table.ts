// scripts/test_skirt_table.ts — dump the new SkirtClothSim constraint table
// and rest geometry to find the collapse bug.

import { SkirtClothSim } from '../src/lib/girlCloth';

const sim = new SkirtClothSim() as unknown as {
  positions: Float32Array;
  numParticles: number;
  constraintA: Uint16Array;
  constraintB: Uint16Array;
  constraintRest: Float32Array;
  constraintStiff: Float32Array;
  constraintPass: Uint8Array;
  constraintCount: number;
  localRestX: Float32Array;
  localRestY: Float32Array;
  localRestZ: Float32Array;
  columnRestStepDist: Float32Array;
  rowWeight: Float32Array;
};

console.log('numParticles:', sim.numParticles, 'constraintCount:', sim.constraintCount);

// Rest geometry: column 0 vertical neighbors (particle r*14+0)
console.log('\n--- rest local positions, column 0 (x,y,z per row) ---');
for (let r = 0; r < 7; r++) {
  const idx = r * 14;
  console.log(
    `row ${r}: (${sim.localRestX[idx].toFixed(4)}, ${sim.localRestY[idx].toFixed(4)}, ${sim.localRestZ[idx].toFixed(4)})  weight=${sim.rowWeight[idx].toFixed(3)}`
  );
}
console.log('\ncolumnRestStepDist (vertical rest per row):');
for (let r = 1; r < 7; r++) {
  console.log(`  row ${r}: ${sim.columnRestStepDist[r * 14].toFixed(4)}`);
}

// Vertical constraints in the table: a=r*14, b=(r+1)*14
console.log('\n--- constraints connecting (r*14) -> (r+1)*14 for col 0 ---');
for (let i = 0; i < sim.constraintCount; i++) {
  const a = sim.constraintA[i];
  const b = sim.constraintB[i];
  if (a % 14 === 0 && b === a + 14) {
    console.log(
      `  a=${a} b=${b} rest=${sim.constraintRest[i].toFixed(4)} stiff=${sim.constraintStiff[i].toFixed(3)} pass=${sim.constraintPass[i]}`
    );
  }
}

// Stiffness distribution
console.log('\n--- stiffness stats ---');
let minS = Infinity, maxS = -Infinity, sumS = 0;
for (let i = 0; i < sim.constraintCount; i++) {
  minS = Math.min(minS, sim.constraintStiff[i]);
  maxS = Math.max(maxS, sim.constraintStiff[i]);
  sumS += sim.constraintStiff[i];
}
console.log(`stiff: min=${minS.toFixed(3)} max=${maxS.toFixed(3)} mean=${(sumS / sim.constraintCount).toFixed(3)}`);

// rest length stats
let minR = Infinity, maxR = -Infinity;
for (let i = 0; i < sim.constraintCount; i++) {
  minR = Math.min(minR, sim.constraintRest[i]);
  maxR = Math.max(maxR, sim.constraintRest[i]);
}
console.log(`rest: min=${minR.toFixed(4)} max=${maxR.toFixed(4)}`);

// pass values
const passes = new Set<number>();
for (let i = 0; i < sim.constraintCount; i++) passes.add(sim.constraintPass[i]);
console.log('distinct pass values:', Array.from(passes).sort());
