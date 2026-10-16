// src/lib/crowd.ts
// V2 'Grand Show Director' pack — 52-silhouette instanced club crowd (3 draw
// calls): beat-bouncing attendees with vertex-color rim strips, 12 arm-raisers
// on drops, 8 phone screens. Back-240-degree arc keeps the camera corridor clear.
import * as THREE from 'three';
import { FxContext } from './particles';

export interface CrowdSystem {
  create: (seed: number) => {
    group: THREE.Group;                 // contains InstancedMeshes for crowd + phones
    update: (ctx: FxContext, lookAccentColor: THREE.Color) => void;
    dispose: () => void;
  };
}

// ----------------------------------------------------------------------------
// Seeded RNG (§2.4 Determinism Law — mulberry32)
// ----------------------------------------------------------------------------
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------------------
// Shared Module-Scope Scratch Objects (§1 Law 1 Zero-Allocation)
// ----------------------------------------------------------------------------
const _dummy = new THREE.Object3D();
const _colorScratch = new THREE.Color();

const ATTENDEE_COUNT = 52;
const RAISER_COUNT = 12; // ~23% of crowd raises both arms on drops (24 arm instances)
const ARM_INSTANCES = RAISER_COUNT * 2;
const PHONE_COUNT = 8;

/**
 * Builds a single merged low-poly attendee geometry (< 108 triangles)
 * consisting of a tapered capsule torso, low-poly sphere head, resting arm
 * silhouettes, and an inward-facing chest/collarbone rim strip tagged via
 * vertex colors so `instanceColor` illuminates ONLY the neon rim strip while
 * the body stays a deep dark silhouette (#07070c).
 */
function buildAttendeeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Torso (8-sided tapered cylinder, ground-aligned)
  const torso = new THREE.CylinderGeometry(0.16, 0.12, 0.72, 8, 1, false);
  torso.translate(0, 0.36, 0);
  parts.push(torso);

  // 2. Shoulders / resting arm hints (low-poly box with bevel feel)
  const shoulders = new THREE.BoxGeometry(0.42, 0.36, 0.16);
  shoulders.translate(0, 0.54, 0);
  parts.push(shoulders);

  // 3. Head (low-poly sphere)
  const head = new THREE.SphereGeometry(0.115, 8, 6);
  head.translate(0, 0.88, 0);
  parts.push(head);

  // 4. Thin emissive chest cell / rim badge on front of torso (+Z local)
  const chestStrip = new THREE.BoxGeometry(0.24, 0.045, 0.02);
  chestStrip.translate(0, 0.62, 0.145);
  parts.push(chestStrip);

  // Merge geometries manually with vertex color tagging (zero external deps)
  let totalVerts = 0;
  let totalIndices = 0;
  for (let p = 0; p < parts.length; p++) {
    const pos = parts[p].attributes.position;
    totalVerts += pos.count;
    const idx = parts[p].index;
    totalIndices += idx ? idx.count : pos.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);
  const indices = new Uint16Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  for (let p = 0; p < parts.length; p++) {
    const g = parts[p];
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const idx = g.index;
    const isRimStrip = p === 3;

    for (let v = 0; v < pos.count; v++) {
      const dst = (vOffset + v) * 3;
      positions[dst] = pos.getX(v);
      positions[dst + 1] = pos.getY(v);
      positions[dst + 2] = pos.getZ(v);

      if (norm) {
        normals[dst] = norm.getX(v);
        normals[dst + 1] = norm.getY(v);
        normals[dst + 2] = norm.getZ(v);
      }

      if (isRimStrip) {
        // Full multiplier so instanceColor shines cleanly on the chest rim strip
        colors[dst] = 1.0;
        colors[dst + 1] = 1.0;
        colors[dst + 2] = 1.0;
      } else {
        // Near-black silhouette body with subtle top-head rim catch
        const y = pos.getY(v);
        const shade = y > 0.92 ? 0.16 : 0.035;
        colors[dst] = shade;
        colors[dst + 1] = shade;
        colors[dst + 2] = shade * 1.25;
      }
    }

    if (idx) {
      for (let k = 0; k < idx.count; k++) {
        indices[iOffset + k] = idx.getX(k) + vOffset;
      }
      iOffset += idx.count;
    } else {
      for (let k = 0; k < pos.count; k++) {
        indices[iOffset + k] = vOffset + k;
      }
      iOffset += pos.count;
    }

    vOffset += pos.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

export const createCrowd: CrowdSystem = {
  create(seed: number) {
    const rand = makeRand(seed ^ 0x44556677);
    const group = new THREE.Group();

    // 1. Silhouette Bodies + Chest Rim Strip (52 instances)
    const bodyGeo = buildAttendeeGeometry();
    const bodyMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
    });
    const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, ATTENDEE_COUNT);
    bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bodyMesh.frustumCulled = false;

    // 2. Raising Arms for 20%+ of crowd on dropActive + Phone holders (24 instances)
    const armGeo = new THREE.CylinderGeometry(0.036, 0.044, 0.42, 6, 1);
    // Pivot at shoulder joint (y = 0) extending upward when raised
    armGeo.translate(0, 0.21, 0);
    const armMat = new THREE.MeshBasicMaterial({
      color: 0x090910,
    });
    const armMesh = new THREE.InstancedMesh(armGeo, armMat, ARM_INSTANCES);
    armMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    armMesh.frustumCulled = false;

    // 3. Phones-in-the-air (8 instances) — tiny emissive plane flickering with `high`
    const phoneGeo = new THREE.PlaneGeometry(0.075, 0.135);
    const phoneMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const phoneMesh = new THREE.InstancedMesh(phoneGeo, phoneMat, PHONE_COUNT);
    phoneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    phoneMesh.frustumCulled = false;

    group.add(bodyMesh);
    group.add(armMesh);
    group.add(phoneMesh);

    // Precomputed per-attendee placement & variant traits
    const baseX = new Float32Array(ATTENDEE_COUNT);
    const baseZ = new Float32Array(ATTENDEE_COUNT);
    const faceYaw = new Float32Array(ATTENDEE_COUNT);
    const phaseOffset = new Float32Array(ATTENDEE_COUNT);
    const scaleX = new Float32Array(ATTENDEE_COUNT);
    const scaleY = new Float32Array(ATTENDEE_COUNT);
    const scaleZ = new Float32Array(ATTENDEE_COUNT);

    // Place crowd at radius 3.4–4.6m, strictly in the back 240° arc
    // (Angle 60° to 300° where 0° is +Z front camera — keeps front camera corridor clear)
    for (let i = 0; i < ATTENDEE_COUNT; i++) {
      const t = i / (ATTENDEE_COUNT - 1);
      const arcAngle =
        (60 * Math.PI) / 180 +
        t * ((240 * Math.PI) / 180) +
        (rand() - 0.5) * 0.06;
      const radius = 3.45 + rand() * 1.12;

      const x = Math.sin(arcAngle) * radius;
      const z = Math.cos(arcAngle) * radius;
      baseX[i] = x;
      baseZ[i] = z;
      // Face inward toward the cat at (0, 0, 0)
      faceYaw[i] = Math.atan2(-x, -z);
      phaseOffset[i] = rand() * Math.PI * 2;

      // 4 distinct silhouette variants (slim, hoodie-wide, tall, compact)
      const variant = i % 4;
      if (variant === 0) {
        scaleX[i] = 0.92;
        scaleY[i] = 1.04;
        scaleZ[i] = 0.92;
      } else if (variant === 1) {
        scaleX[i] = 1.14;
        scaleY[i] = 0.98;
        scaleZ[i] = 1.08;
      } else if (variant === 2) {
        scaleX[i] = 0.96;
        scaleY[i] = 1.12;
        scaleZ[i] = 0.96;
      } else {
        scaleX[i] = 1.04;
        scaleY[i] = 0.91;
        scaleZ[i] = 1.0;
      }

      bodyMesh.setColorAt(i, _colorScratch.setHex(0xffb703));
    }

    // Select 12 evenly distributed attendees for arm-raising (first 8 also hold phones)
    const raiserIndices = new Uint8Array(RAISER_COUNT);
    for (let r = 0; r < RAISER_COUNT; r++) {
      raiserIndices[r] = Math.floor(((r + 0.5) / RAISER_COUNT) * ATTENDEE_COUNT);
    }

    let raiseFactor = 0;

    return {
      group,
      update(ctx: FxContext, lookAccentColor: THREE.Color) {
        const dt = ctx.dt;
        const m = ctx.metrics;
        const beatPhase = ctx.beatPhase;

        // Smoothly damp arm raise factor toward 1.0 during drops, 0.0 otherwise
        const targetRaise = ctx.dropActive ? 1.0 : 0.0;
        raiseFactor += (targetRaise - raiseFactor) * (1.0 - Math.exp(-6.0 * dt));

        // Update all 52 attendee silhouettes
        for (let i = 0; i < ATTENDEE_COUNT; i++) {
          const p = phaseOffset[i];
          // Half-beat bounce (§5 law): y = base + |sin(beatPhase/2 + p)| * 0.09 * (0.4 + bass)
          const bob =
            Math.abs(Math.sin(beatPhase * 0.5 + p)) * 0.09 * (0.4 + m.bass);
          // Bar-rate lean sway
          const barSway = Math.sin(beatPhase * 0.25 + p) * 0.065;

          _dummy.position.set(baseX[i], bob, baseZ[i]);
          _dummy.rotation.set(0, faceYaw[i], barSway);
          _dummy.scale.set(scaleX[i], scaleY[i], scaleZ[i]);
          _dummy.updateMatrix();
          bodyMesh.setMatrixAt(i, _dummy.matrix);

          // Rim brightness pulses subtly with mid/bass and wave phase
          const rimPulse =
            0.55 + 0.35 * Math.sin(beatPhase * 0.5 + p) + m.bass * 0.35;
          _colorScratch.copy(lookAccentColor).multiplyScalar(rimPulse);
          bodyMesh.setColorAt(i, _colorScratch);
        }

        // Update raising arms (2 arms per raiser attendee)
        for (let r = 0; r < RAISER_COUNT; r++) {
          const personIdx = raiserIndices[r];
          const p = phaseOffset[personIdx];
          const bob =
            Math.abs(Math.sin(beatPhase * 0.5 + p)) * 0.09 * (0.4 + m.bass);
          const yaw = faceYaw[personIdx];
          const sy = scaleY[personIdx];

          // Right and left shoulder offsets in world space
          const cosY = Math.cos(yaw);
          const sinY = Math.sin(yaw);
          const shoulderY = bob + 0.64 * sy;

          // Lerp pitch from resting down (2.65 rad) to raised cheering V (0.18 rad + wave)
          const holdsPhone = r < PHONE_COUNT;
          const effRaise = holdsPhone ? Math.max(0.78, raiseFactor) : raiseFactor;
          const wave = Math.sin(beatPhase + p) * 0.18 * effRaise;
          const armPitch = 2.65 * (1.0 - effRaise) + (0.15 + wave) * effRaise;

          for (let side = 0; side < 2; side++) {
            const armIdx = r * 2 + side;
            const dir = side === 0 ? -1 : 1;
            const shoulderOffset = dir * 0.21 * scaleX[personIdx];
            const sxWorld = baseX[personIdx] + cosY * shoulderOffset;
            const szWorld = baseZ[personIdx] - sinY * shoulderOffset;

            _dummy.position.set(sxWorld, shoulderY, szWorld);
            _dummy.rotation.set(
              armPitch * 0.25,
              yaw,
              dir * (0.15 * effRaise) + (1.0 - effRaise) * dir * 2.7
            );
            _dummy.scale.set(1, sy, 1);
            _dummy.updateMatrix();
            armMesh.setMatrixAt(armIdx, _dummy.matrix);
          }

          // Update phone-in-the-air for the first 8 raisers
          if (holdsPhone) {
            const shoulderOffset = 0.21 * scaleX[personIdx];
            const handX =
              baseX[personIdx] +
              cosY * shoulderOffset +
              sinY * 0.08;
            const handZ =
              baseZ[personIdx] -
              sinY * shoulderOffset +
              cosY * 0.08;
            const handY = shoulderY + 0.44 * sy + Math.sin(beatPhase + p) * 0.03;

            const flicker =
              0.65 +
              m.high * 0.85 +
              0.25 * Math.sin(beatPhase * 2.0 + r * 1.7);

            _dummy.position.set(handX, handY, handZ);
            _dummy.rotation.set(-0.15, yaw, Math.sin(beatPhase * 0.5 + p) * 0.12);
            _dummy.scale.setScalar(0.85 + m.high * 0.35);
            _dummy.updateMatrix();
            phoneMesh.setMatrixAt(r, _dummy.matrix);

            _colorScratch
              .copy(lookAccentColor)
              .lerp(_whiteColor, 0.65)
              .multiplyScalar(flicker);
            phoneMesh.setColorAt(r, _colorScratch);
          }
        }

        bodyMesh.instanceMatrix.needsUpdate = true;
        if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
        armMesh.instanceMatrix.needsUpdate = true;
        phoneMesh.instanceMatrix.needsUpdate = true;
        if (phoneMesh.instanceColor) phoneMesh.instanceColor.needsUpdate = true;
      },
      dispose() {
        bodyGeo.dispose();
        bodyMat.dispose();
        armGeo.dispose();
        armMat.dispose();
        phoneGeo.dispose();
        phoneMat.dispose();
      },
    };
  },
};

const _whiteColor = new THREE.Color(0xffffff);