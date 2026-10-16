'use client';

/**
 * ============================================================================
 * PROCEDURAL CYBER-CLUB STAGE — 100% OFFLINE, ZERO EXTERNAL ASSETS
 * ============================================================================
 * - 64-bar radial InstancedMesh spectrum analyzer (1 draw call), driven
 *   directly by the raw 1024-bin FFT Uint8Array.
 * - 36-tile (6x6) InstancedMesh LED dancefloor (1 draw call) with radial
 *   ripple waves propagating from the cat's sneakers on every kick drum.
 * - Dual subwoofer stacks with physically pumping woofer cones (Z-excursion
 *   proportional to bass energy) + spinning DJ turntable booth.
 * - Sweeping volumetric laser cones + moving-head spotlights.
 * - Beat-reactive camera director (ORBIT / FRONT_STAGE / HERO_LOW /
 *   DJ_OVERHEAD / DYNAMIC_AUTO) — V1.5: 19-shot sequencer, wide-by-default
 *   optics (base FOV 50), directional beat-punch, smoothed shake + roll.
 * - Lighting is fully procedural (directional/hemisphere/spot/point) — NO
 *   external .hdr Environment presets, so the site loads instantly with
 *   zero external network dependencies.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { AudioMetrics } from './ProceduralDancingCat';
import { cameraSequencer, beatClock, showState, groupDirector } from '@/lib/danceRuntime';
import {
  PARTICLE_SYSTEMS,
  syncParticleLookState,
  isAmbientSystem,
  setParticleDensity,
  type FxContext,
} from '@/lib/particles';
import { createCrowd } from '@/lib/crowd';
import type { GroupCameraSelectHints } from '@/lib/groupCameraShots';
import {
  createShowDirector,
  getStageLookById,
  consumeRequestedStageLook,
  type ShowDirector,
} from '@/lib/showDirector';

export type CameraMode =
  | 'ORBIT'
  | 'FRONT_STAGE'
  | 'HERO_LOW'
  | 'DJ_OVERHEAD'
  | 'DYNAMIC_AUTO';

export interface ProceduralClubStageProps {
  getMetrics: () => AudioMetrics;
  getRawFrequencyData: () => Uint8Array;
  cameraMode: CameraMode;
  /** V2: 0 = FX + crowd off (mobile), 1 = FX only, 2 = FX + crowd (default) */
  showFxDetail?: number;
}

// ============================================================================
// MODULE-SCOPED SCRATCH OBJECTS (ZERO HEAP ALLOCATIONS IN useFrame)
// ============================================================================
const EQ_BAR_COUNT = 64;
const FLOOR_GRID_SIZE = 6; // 6x6 = 36 tiles
const FLOOR_TILE_COUNT = FLOOR_GRID_SIZE * FLOOR_GRID_SIZE;

const _dummyObj = new THREE.Object3D();
const _colorA = new THREE.Color();
const _cyan = new THREE.Color('#00f5ff');
const _magenta = new THREE.Color('#ff007f');
const _lime = new THREE.Color('#39ff14');
const _violet = new THREE.Color('#7b2cbf');

// V2 GRAND SHOW DIRECTOR: blended-palette scratch (written by the director
// integration each frame, read by every stage material — zero allocation)
const _paletteOut = {
  primary: new THREE.Color(),
  secondary: new THREE.Color(),
  accent: new THREE.Color(),
  base: new THREE.Color(),
  spotL: new THREE.Color(),
  spotR: new THREE.Color(),
  rim: new THREE.Color(),
};
// V3 GROUP CHOREOGRAPHER: stable camera hints (mutated in place each frame,
// handed to cameraSequencer.setGroupHints so 2+ dancer shot cuts pair with
// the active formation / duet / spotlight — zero allocation)
const _groupHints: GroupCameraSelectHints = {
  energy: 0.5,
  seedBeat: 0,
  lastShotId: '',
  formationId: 'LINE_BREATHING',
  duetFacing: undefined,
  isDuetActive: false,
  isMirrorMode: false,
  isCanonMode: false,
  isSoloSpot: false,
  isSongEnding: false,
};
const _fxContext: FxContext = {
  metrics: {
    bass: 0, mid: 0, high: 0, overall: 0,
    isBeat: false, bpm: 120, isPlaying: false,
  },
  beatPhase: 0,
  beatCount: 0,
  dropActive: false,
  dt: 0.016,
  elapsed: 0,
};

export const ProceduralClubStage: React.FC<ProceduralClubStageProps> = ({
  getMetrics,
  getRawFrequencyData,
  cameraMode,
  showFxDetail = 2,
}) => {
  // InstancedMesh Refs
  const eqInstancedRef = useRef<THREE.InstancedMesh>(null!);
  const floorInstancedRef = useRef<THREE.InstancedMesh>(null!);

  // Subwoofer Cone Refs (Left & Right Stacks)
  const wooferTopLRef = useRef<THREE.Mesh>(null!);
  const wooferBotLRef = useRef<THREE.Mesh>(null!);
  const wooferTopRRef = useRef<THREE.Mesh>(null!);
  const wooferBotRRef = useRef<THREE.Mesh>(null!);

  // DJ Turntable Platter Refs
  const platterLRef = useRef<THREE.Mesh>(null!);
  const platterRRef = useRef<THREE.Mesh>(null!);

  // Sweeping Club Lasers & Dynamic Lights
  const laserLeftRef = useRef<THREE.Group>(null!);
  const laserRightRef = useRef<THREE.Group>(null!);
  const keyLightLRef = useRef<THREE.SpotLight>(null!);
  const keyLightRRef = useRef<THREE.SpotLight>(null!);
  const rimLightRef = useRef<THREE.PointLight>(null!);
  const ambientRef = useRef<THREE.AmbientLight>(null!);
  const hemiRef = useRef<THREE.HemisphereLight>(null!);

  // Camera & OrbitControls Refs
  const controlsRef = useRef<OrbitControlsImpl>(null!);
  const { camera } = useThree();

  // Pre-allocated Materials & Geometries
  const stageAssets = useMemo(() => {
    const eqGeo = new THREE.BoxGeometry(0.11, 1.0, 0.11);
    // Shift geometry so y=0 is at the bottom of the bar for clean scaling
    eqGeo.translate(0, 0.5, 0);

    const tileGeo = new THREE.BoxGeometry(0.56, 0.04, 0.56);

    const eqMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#00f5ff',
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.6,
    });

    const tileMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#1a243d',
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.7,
    });

    const stageDeckMat = new THREE.MeshStandardMaterial({
      color: '#090c15',
      roughness: 0.4,
      metalness: 0.8,
    });

    const speakerCabinetMat = new THREE.MeshStandardMaterial({
      color: '#121624',
      roughness: 0.5,
      metalness: 0.4,
    });

    const wooferConeMat = new THREE.MeshStandardMaterial({
      color: '#1e2436',
      roughness: 0.3,
      metalness: 0.7,
    });

    const neonTrimMat = new THREE.MeshStandardMaterial({
      color: '#00f5ff',
      emissive: '#00f5ff',
      emissiveIntensity: 1.6,
      roughness: 0.2,
    });

    const laserConeMatL = new THREE.MeshBasicMaterial({
      color: '#00f5ff',
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const laserConeMatR = new THREE.MeshBasicMaterial({
      color: '#ff007f',
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return {
      eqGeo,
      tileGeo,
      eqMat,
      tileMat,
      stageDeckMat,
      speakerCabinetMat,
      wooferConeMat,
      neonTrimMat,
      laserConeMatL,
      laserConeMatR,
    };
  }, []);

  // Dispose GPU resources on unmount
  useEffect(() => {
    return () => {
      stageAssets.eqGeo.dispose();
      stageAssets.tileGeo.dispose();
      stageAssets.eqMat.dispose();
      stageAssets.tileMat.dispose();
      stageAssets.stageDeckMat.dispose();
      stageAssets.speakerCabinetMat.dispose();
      stageAssets.wooferConeMat.dispose();
      stageAssets.neonTrimMat.dispose();
      stageAssets.laserConeMatL.dispose();
      stageAssets.laserConeMatR.dispose();
    };
  }, [stageAssets]);

  // Initialize InstancedMesh matrices & colors once on mount
  useEffect(() => {
    if (eqInstancedRef.current) {
      for (let i = 0; i < EQ_BAR_COUNT; i++) {
        const angle = (i / EQ_BAR_COUNT) * Math.PI * 1.4 - Math.PI * 0.7 + Math.PI;
        const radius = 2.85;
        _dummyObj.position.set(
          Math.sin(angle) * radius,
          0,
          Math.cos(angle) * radius
        );
        _dummyObj.rotation.set(0, angle, 0);
        _dummyObj.scale.set(1, 0.15, 1);
        _dummyObj.updateMatrix();
        eqInstancedRef.current.setMatrixAt(i, _dummyObj.matrix);
        eqInstancedRef.current.setColorAt(i, _cyan);
      }
      eqInstancedRef.current.instanceMatrix.needsUpdate = true;
      if (eqInstancedRef.current.instanceColor) {
        eqInstancedRef.current.instanceColor.needsUpdate = true;
      }
    }

    if (floorInstancedRef.current) {
      let idx = 0;
      const offset = (FLOOR_GRID_SIZE - 1) * 0.5;
      for (let gx = 0; gx < FLOOR_GRID_SIZE; gx++) {
        for (let gz = 0; gz < FLOOR_GRID_SIZE; gz++) {
          _dummyObj.position.set((gx - offset) * 0.62, -0.025, (gz - offset) * 0.62);
          _dummyObj.rotation.set(0, 0, 0);
          _dummyObj.scale.set(1, 1, 1);
          _dummyObj.updateMatrix();
          floorInstancedRef.current.setMatrixAt(idx, _dummyObj.matrix);
          floorInstancedRef.current.setColorAt(idx, _violet);
          idx++;
        }
      }
      floorInstancedRef.current.instanceMatrix.needsUpdate = true;
      if (floorInstancedRef.current.instanceColor) {
        floorInstancedRef.current.instanceColor.needsUpdate = true;
      }
    }
  }, []);

  // Internal timing state for stage & camera cuts
  const stageState = useRef({
    beatCounter: 0,
    lastBeatFlag: false,
    ripplePhase: 0,
    // V2 Grand Show Director: shared drop detector (energy-jump law)
    dropBaseline: 0,
    dropBeats: 0,
  });

  // ----------------------------------------------------------------------
  // V2 GRAND SHOW DIRECTOR PACK — 14 stage looks + 5 particle systems +
  // 52-silhouette crowd. Built once; every system mutates in place and is
  // disposed on unmount. Total added cost: 11 draw calls, 0 new lights.
  // ----------------------------------------------------------------------
  const v2Pack = useMemo(() => {
    // V3 FX LEVELS: 1 = Lite (phone / user toggle — event FX only at 0.3
    // density, ambient floaters + crowd parked), 2 = Full (0.6 density —
    // still ~40% fewer instances than V2's launch by user request).
    // setParticleDensity MUST run before the systems create themselves.
    setParticleDensity(showFxDetail >= 2 ? 0.6 : 0.3);
    const director: ShowDirector = createShowDirector({ seed: 202607 });
    const fxGroup = new THREE.Group();
    const ambientOn = showFxDetail >= 2;
    const systems = PARTICLE_SYSTEMS.map((sys, idx) => {
      const inst = sys.create(1000 + idx * 97);
      // Ambient floaters (ember diyas, fog wisps) only run on Full FX
      inst.mesh.visible = !(isAmbientSystem(sys) && !ambientOn);
      fxGroup.add(inst.mesh);
      return inst;
    });
    const crowd = createCrowd.create(77701);
    crowd.group.visible = showFxDetail >= 2;
    fxGroup.add(crowd.group);
    return {
      director,
      fxGroup,
      systems,
      crowd,
      withCrowd: showFxDetail >= 2,
      withAmbient: ambientOn,
    };
  }, [showFxDetail]);

  useEffect(() => {
    return () => {
      for (let i = 0; i < v2Pack.systems.length; i++) {
        v2Pack.systems[i].dispose();
      }
      v2Pack.crowd.dispose();
    };
  }, [v2Pack]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const elapsed = state.clock.elapsedTime;
    const metrics = getMetrics();
    const freqData = getRawFrequencyData();
    const { bass, mid, high, overall, isBeat, bpm } = metrics;

    const st = stageState.current;
    if (isBeat && !st.lastBeatFlag) {
      st.beatCounter++;
    }
    st.lastBeatFlag = isBeat;

    st.ripplePhase += dt * (2.5 + bass * 6.0);

    // ----------------------------------------------------------------------
    // V2 GRAND SHOW DIRECTOR — advance the look sequencer (32-64-beat energy
    // matched rotation + drop-triggered hype looks), consume any UI "Vibe"
    // pill request, then push the blended palette into every stage material
    // and light. Drop detection follows the same energy-jump law as the
    // choreographer / camera sequencer (§2.3 — computed ONCE here per frame).
    // ----------------------------------------------------------------------
    const forcedLook = consumeRequestedStageLook();
    if (forcedLook && forcedLook !== 'AUTO') {
      v2Pack.director.forceLook(forcedLook);
    }
    v2Pack.director.update(metrics, beatClock.beatCount, beatClock.phase, dt, elapsed);
    v2Pack.director.getBlendedPalette(_paletteOut);
    const activeLook = getStageLookById(v2Pack.director.getActiveLookId());

    // Publish for the zero-re-render HUD "Vibe" readout
    showState.lookId = activeLook.id;
    showState.lookName = v2Pack.director.getActiveLookName();

    // Shared drop detector for the FX systems + crowd
    st.dropBaseline +=
      (overall - st.dropBaseline) * (1.0 - Math.exp(-0.7 * dt));
    const isDropish = bass > 0.8 && overall > st.dropBaseline + 0.055;
    if (isBeat) {
      st.dropBeats = isDropish ? st.dropBeats + 1 : 0;
    }
    const dropActive = st.dropBeats >= 2;

    // Stage materials drink the look palette
    stageAssets.eqMat.emissive.copy(_paletteOut.primary);
    stageAssets.neonTrimMat.color.copy(_paletteOut.accent);
    stageAssets.neonTrimMat.emissive.copy(_paletteOut.accent);
    stageAssets.stageDeckMat.color.copy(_paletteOut.base);
    stageAssets.laserConeMatL.color.copy(_paletteOut.primary);
    stageAssets.laserConeMatR.color.copy(_paletteOut.secondary);
    if (keyLightLRef.current) keyLightLRef.current.color.copy(_paletteOut.spotL);
    if (keyLightRRef.current) keyLightRRef.current.color.copy(_paletteOut.spotR);
    if (rimLightRef.current) rimLightRef.current.color.copy(_paletteOut.rim);
    if (ambientRef.current) ambientRef.current.color.set(activeLook.ambientTint);
    if (hemiRef.current) {
      hemiRef.current.color.copy(_paletteOut.primary);
      hemiRef.current.groundColor.copy(_paletteOut.base);
    }

    // FX + crowd context (mutated in place — zero allocation)
    _fxContext.metrics.bass = bass;
    _fxContext.metrics.mid = mid;
    _fxContext.metrics.high = high;
    _fxContext.metrics.overall = overall;
    _fxContext.metrics.isBeat = isBeat;
    _fxContext.metrics.bpm = bpm;
    _fxContext.metrics.isPlaying = metrics.isPlaying;
    _fxContext.beatPhase = beatClock.phase;
    _fxContext.beatCount = beatClock.beatCount;
    _fxContext.dropActive = dropActive;
    _fxContext.dt = dt;
    _fxContext.elapsed = elapsed;

    syncParticleLookState(
      _paletteOut.primary,
      _paletteOut.secondary,
      _paletteOut.accent,
      activeLook.id
    );
    if (showFxDetail >= 1) {
      for (let i = 0; i < v2Pack.systems.length; i++) {
        // V3: skip ambient systems entirely on Lite FX (parked meshes)
        if (
          !v2Pack.withAmbient &&
          isAmbientSystem(PARTICLE_SYSTEMS[i])
        ) {
          continue;
        }
        v2Pack.systems[i].update(_fxContext);
      }
      if (v2Pack.withCrowd) {
        v2Pack.crowd.update(_fxContext, _paletteOut.accent);
      }
    }

    // ------------------------------------------------------------------------
    // 1. UPDATE 64-BAR INSTANCED 3D SPECTRUM ANALYZER (SINGLE DRAW CALL)
    // ------------------------------------------------------------------------
    if (eqInstancedRef.current) {
      for (let i = 0; i < EQ_BAR_COUNT; i++) {
        // Mirror low-to-high frequencies symmetrically from center-back outward
        const symIdx = i < 32 ? 31 - i : i - 32;
        const binIdx = Math.min(255, Math.floor(symIdx * 3.5) + 1);
        const rawVal = metrics.isPlaying
          ? freqData[binIdx] / 255
          : 0.08 + 0.06 * Math.sin(elapsed * 3 + i * 0.25);

        const angle = (i / EQ_BAR_COUNT) * Math.PI * 1.45 - Math.PI * 0.725 + Math.PI;
        const radius = 2.95;

        const targetHeight = Math.max(0.12, rawVal * 2.4 + bass * 0.35);

        _dummyObj.position.set(
          Math.sin(angle) * radius,
          0,
          Math.cos(angle) * radius
        );
        _dummyObj.rotation.set(0, angle, 0);
        _dummyObj.scale.set(1, targetHeight, 1);
        _dummyObj.updateMatrix();
        eqInstancedRef.current.setMatrixAt(i, _dummyObj.matrix);

        // V2 LOOK-DRIVEN GRADIENT: primary -> secondary by height, accent tip
        const normH = Math.min(1, rawVal * 1.3);
        _colorA.copy(_paletteOut.primary).lerp(_paletteOut.secondary, normH);
        if (normH > 0.75) {
          _colorA.lerp(_paletteOut.accent, (normH - 0.75) * 4);
        }
        eqInstancedRef.current.setColorAt(i, _colorA);
      }
      eqInstancedRef.current.instanceMatrix.needsUpdate = true;
      if (eqInstancedRef.current.instanceColor) {
        eqInstancedRef.current.instanceColor.needsUpdate = true;
      }
      stageAssets.eqMat.emissiveIntensity = 0.65 + bass * 1.6;
    }

    // ------------------------------------------------------------------------
    // 2. UPDATE 36-TILE INSTANCED LED DISCO FLOOR (SINGLE DRAW CALL)
    //    V2: the active stage look selects the PATTERN —
    //    0 radial ripple | 1 checker strobe | 2 EQ columns | 3 spiral sweep
    // ------------------------------------------------------------------------
    if (floorInstancedRef.current) {
      let idx = 0;
      const offset = (FLOOR_GRID_SIZE - 1) * 0.5;
      const pattern = activeLook.floorPattern;
      for (let gx = 0; gx < FLOOR_GRID_SIZE; gx++) {
        for (let gz = 0; gz < FLOOR_GRID_SIZE; gz++) {
          const x = (gx - offset) * 0.62;
          const z = (gz - offset) * 0.62;
          const distFromCenter = Math.sqrt(x * x + z * z);
          const checker = (gx + gz) % 2 === 0;
          let wave: number;

          if (pattern === 1) {
            // Checker strobe: alternating cells flash on the beat
            wave = checker
              ? (isBeat ? 1 : 0.18) * (0.5 + bass * 0.6)
              : 0.16 + Math.sin(elapsed * 2.2 + gz) * 0.08;
          } else if (pattern === 2) {
            // EQ columns: each grid row is a frequency band, brightness = level
            const binIdx = Math.min(
              255,
              8 + Math.floor((gz / FLOOR_GRID_SIZE) * 60)
            );
            const lvl = metrics.isPlaying ? freqData[binIdx] / 255 : 0.15;
            wave = lvl * (0.6 + bass * 0.5);
          } else if (pattern === 3) {
            // Spiral sweep: rotating spiral arms from the center
            const ang = Math.atan2(z, x);
            wave =
              0.5 +
              0.5 * Math.sin(ang * 3 + distFromCenter * 4 - st.ripplePhase * 1.6);
          } else {
            // 0 — classic radial ripple from the dancers' sneakers
            wave = Math.sin(distFromCenter * 3.2 - st.ripplePhase) * 0.5 + 0.5;
          }

          if (checker) {
            _colorA.copy(_paletteOut.primary).lerp(_paletteOut.secondary, wave);
          } else {
            _colorA.copy(_paletteOut.secondary).lerp(_paletteOut.accent, wave * mid);
          }

          const brightness =
            0.22 + wave * (0.45 + bass * 0.85) + (isBeat && pattern === 1 ? 0.35 : 0);
          _colorA.multiplyScalar(brightness);

          floorInstancedRef.current.setColorAt(idx, _colorA);
          idx++;
        }
      }
      if (floorInstancedRef.current.instanceColor) {
        floorInstancedRef.current.instanceColor.needsUpdate = true;
      }
    }

    // ------------------------------------------------------------------------
    // 3. SUBWOOFER SPEAKER CONE EXCURSION & DJ PLATTER SPIN
    // ------------------------------------------------------------------------
    const wooferZ = 0.23 + bass * 0.065 + (isBeat ? 0.025 : 0);
    const wooferScale = 1 + bass * 0.14;
    if (wooferTopLRef.current && wooferBotLRef.current) {
      wooferTopLRef.current.position.z = wooferZ;
      wooferBotLRef.current.position.z = wooferZ;
      wooferTopLRef.current.scale.set(wooferScale, wooferScale, 1);
      wooferBotLRef.current.scale.set(wooferScale, wooferScale, 1);
    }
    if (wooferTopRRef.current && wooferBotRRef.current) {
      wooferTopRRef.current.position.z = wooferZ;
      wooferBotRRef.current.position.z = wooferZ;
      wooferTopRRef.current.scale.set(wooferScale, wooferScale, 1);
      wooferBotRRef.current.scale.set(wooferScale, wooferScale, 1);
    }

    if (platterLRef.current && platterRRef.current) {
      platterLRef.current.rotation.y += dt * (1.8 + mid * 4.0);
      platterRRef.current.rotation.y -= dt * (1.8 + high * 4.0);
    }

    // ------------------------------------------------------------------------
    // 4. SWEEPING CLUB LASERS & MOVING-HEAD SPOTLIGHTS
    // ------------------------------------------------------------------------
    if (laserLeftRef.current && laserRightRef.current) {
      laserLeftRef.current.rotation.z =
        -0.35 + Math.sin(elapsed * 1.8) * (0.35 + high * 0.35);
      laserLeftRef.current.rotation.x =
        0.25 + Math.cos(elapsed * 1.4) * 0.25;

      laserRightRef.current.rotation.z =
        0.35 - Math.sin(elapsed * 1.8) * (0.35 + high * 0.35);
      laserRightRef.current.rotation.x =
        0.25 + Math.sin(elapsed * 1.4) * 0.25;

      stageAssets.laserConeMatL.opacity = 0.06 + bass * 0.18 + high * 0.12;
      stageAssets.laserConeMatR.opacity = 0.06 + mid * 0.18 + bass * 0.12;
    }

    if (keyLightLRef.current && keyLightRRef.current && rimLightRef.current) {
      keyLightLRef.current.intensity = 35 + bass * 55;
      keyLightRRef.current.intensity = 35 + mid * 55;
      rimLightRef.current.intensity = 25 + high * 45 + (isBeat ? 25 : 0);
    }

    stageAssets.neonTrimMat.emissiveIntensity =
      1.1 + bass * 2.5 + (isBeat ? 1.2 : 0);

    // ------------------------------------------------------------------------
    // 5. CINEMATIC CAMERA DIRECTOR — 16-shot music-video sequencer
    //    (bar-boundary hard cuts, bass-drop crash cuts, per-shot FOV punch &
    //     Dutch roll biases; ORBIT stays 100% user-owned & untouched)
    //    V3: with a 2+ dancer crew, shot cuts come from the 16 multi-dancer
    //    GROUP_CAMERA_SHOTS via the formation-aware pairing selector.
    // ------------------------------------------------------------------------
    const perspCam = camera as THREE.PerspectiveCamera;
    if (cameraMode === 'ORBIT') {
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
        controlsRef.current.update();
      }
      // Group hints stay armed even in ORBIT so returning to the auto
      // director resumes the group pool mid-phrase without a seam.
    } else {
      if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }
      const crewN = groupDirector.getDancerCount();
      if (crewN >= 2) {
        const cs = groupDirector.getChoreoState();
        _groupHints.energy = overall;
        _groupHints.seedBeat = st.beatCounter;
        _groupHints.lastShotId = cameraSequencer.getActiveShotId();
        _groupHints.formationId = cs.formationId;
        _groupHints.duetFacing = cs.duet !== null ? cs.duet.facing : undefined;
        _groupHints.isDuetActive = cs.duet !== null;
        _groupHints.isMirrorMode = cs.isMirror;
        _groupHints.isCanonMode = cs.isCanon;
        _groupHints.isSoloSpot = cs.signature !== null;
        _groupHints.isSongEnding = false;
        cameraSequencer.setGroupHints(_groupHints);
      } else {
        cameraSequencer.setGroupHints(null);
      }
      cameraSequencer.updateAndApply(
        perspCam,
        cameraMode,
        metrics,
        st.beatCounter,
        beatClock.phase,
        dt,
        elapsed
      );
    }
  });

  // Helper to render one Subwoofer Stack (Left or Right)
  const renderSubwooferStack = (
    position: [number, number, number],
    rotationY: number,
    topConeRef: React.RefObject<THREE.Mesh>,
    botConeRef: React.RefObject<THREE.Mesh>
  ) => (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Main Cabinet Body */}
      <RoundedBox
        args={[0.75, 1.55, 0.46]}
        radius={0.05}
        smoothness={4}
        position={[0, 0.775, 0]}
        material={stageAssets.speakerCabinetMat}
        castShadow
        receiveShadow
      />
      {/* Neon Cabinet Frame Trim */}
      <RoundedBox
        args={[0.77, 1.57, 0.42]}
        radius={0.05}
        position={[0, 0.775, -0.01]}
        material={stageAssets.neonTrimMat}
      />
      {/* Upper Woofer Ring & Pumping Cone */}
      <mesh position={[0, 1.12, 0.23]} material={stageAssets.neonTrimMat}>
        <torusGeometry args={[0.24, 0.02, 12, 32]} />
      </mesh>
      <mesh
        ref={topConeRef}
        position={[0, 1.12, 0.23]}
        rotation={[Math.PI / 2, 0, 0]}
        material={stageAssets.wooferConeMat}
      >
        <cylinderGeometry args={[0.07, 0.23, 0.1, 24]} />
      </mesh>

      {/* Lower Woofer Ring & Pumping Cone */}
      <mesh position={[0, 0.48, 0.23]} material={stageAssets.neonTrimMat}>
        <torusGeometry args={[0.26, 0.022, 12, 32]} />
      </mesh>
      <mesh
        ref={botConeRef}
        position={[0, 0.48, 0.23]}
        rotation={[Math.PI / 2, 0, 0]}
        material={stageAssets.wooferConeMat}
      >
        <cylinderGeometry args={[0.08, 0.25, 0.12, 24]} />
      </mesh>
    </group>
  );

  return (
    <group>
      {/* OrbitControls (active when cameraMode === 'ORBIT') — V1.5: wider
          zoom-out freedom (max 9m) so manual mode can enjoy the full stage too */}
      <OrbitControls
        ref={controlsRef}
        target={[0, 0.95, 0]}
        enablePan={false}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={2.0}
        maxDistance={9.0}
        dampingFactor={0.07}
      />

      {/* ====================================================================
          DYNAMIC CLUB LIGHTING RIG (100% PROCEDURAL — NO EXTERNAL HDR)
          ==================================================================== */}
      {/* V1.5: lighting bumped slightly — the default wide framing shows more
          of the stage deck, so the floor needs a touch more fill to not read
          as a black void in zoomed-out shots. */}
      <ambientLight ref={ambientRef} intensity={0.6} color="#b8d0ff" />
      <hemisphereLight
        ref={hemiRef}
        color="#00f5ff"
        groundColor="#190826"
        intensity={0.8}
      />
      <directionalLight
        position={[2.5, 4.5, 3.5]}
        intensity={1.6}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <spotLight
        ref={keyLightLRef}
        position={[-2.6, 3.8, 2.2]}
        angle={0.55}
        penumbra={0.7}
        intensity={45}
        color="#00f5ff"
      />
      <spotLight
        ref={keyLightRRef}
        position={[2.6, 3.8, 2.2]}
        angle={0.55}
        penumbra={0.7}
        intensity={45}
        color="#ff007f"
      />
      <pointLight
        ref={rimLightRef}
        position={[0, 2.4, -2.2]}
        intensity={35}
        color="#39ff14"
      />

      {/* ====================================================================
          SWEEPING VOLUMETRIC LASER CONES
          ==================================================================== */}
      <group ref={laserLeftRef} position={[-2.2, 3.6, -1.2]}>
        <mesh position={[0, -2.2, 0]} material={stageAssets.laserConeMatL}>
          <coneGeometry args={[1.45, 4.4, 24, 1, true]} />
        </mesh>
      </group>
      <group ref={laserRightRef} position={[2.2, 3.6, -1.2]}>
        <mesh position={[0, -2.2, 0]} material={stageAssets.laserConeMatR}>
          <coneGeometry args={[1.45, 4.4, 24, 1, true]} />
        </mesh>
      </group>

      {/* ====================================================================
          V2 GRAND SHOW DIRECTOR — particle FX + crowd (single group mount;
          11 draw calls total, zero new lights, fully disposed on unmount)
          ==================================================================== */}
      <primitive object={v2Pack.fxGroup} />

      {/* ====================================================================
          CIRCULAR CYBER STAGE DECK & 6x6 INSTANCED LED FLOOR
          ==================================================================== */}
      <mesh
        position={[0, -0.09, 0]}
        material={stageAssets.stageDeckMat}
        receiveShadow
      >
        <cylinderGeometry args={[3.35, 3.55, 0.16, 48]} />
      </mesh>
      {/* Glowing Outer Stage Rim */}
      <mesh
        position={[0, -0.01, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        material={stageAssets.neonTrimMat}
      >
        <torusGeometry args={[3.35, 0.025, 12, 64]} />
      </mesh>

      {/* 36-Tile Instanced LED Floor */}
      <instancedMesh
        ref={floorInstancedRef}
        args={[stageAssets.tileGeo, stageAssets.tileMat, FLOOR_TILE_COUNT]}
        receiveShadow
      />

      {/* 64-Bar Instanced 3D Spectrum Analyzer Ring */}
      <instancedMesh
        ref={eqInstancedRef}
        args={[stageAssets.eqGeo, stageAssets.eqMat, EQ_BAR_COUNT]}
      />

      {/* ====================================================================
          DUAL SUBWOOFER SPEAKER STACKS & REAR DJ TURNTABLE BOOTH
          ==================================================================== */}
      {renderSubwooferStack([-2.05, 0, -1.35], 0.48, wooferTopLRef, wooferBotLRef)}
      {renderSubwooferStack([2.05, 0, -1.35], -0.48, wooferTopRRef, wooferBotRRef)}

      {/* Rear DJ Booth Console */}
      <group position={[0, 0, -1.85]}>
        <RoundedBox
          args={[1.85, 0.82, 0.58]}
          radius={0.06}
          smoothness={4}
          position={[0, 0.41, 0]}
          material={stageAssets.speakerCabinetMat}
          castShadow
          receiveShadow
        />
        {/* Glowing Front DJ Emblem Strip */}
        <RoundedBox
          args={[1.5, 0.14, 0.04]}
          radius={0.02}
          position={[0, 0.52, 0.29]}
          material={stageAssets.neonTrimMat}
        />
        {/* Left & Right Spinning Vinyl Turntables */}
        <mesh
          ref={platterLRef}
          position={[-0.48, 0.84, 0]}
          material={stageAssets.neonTrimMat}
        >
          <cylinderGeometry args={[0.24, 0.24, 0.03, 24]} />
        </mesh>
        <mesh
          ref={platterRRef}
          position={[0.48, 0.84, 0]}
          material={stageAssets.neonTrimMat}
        >
          <cylinderGeometry args={[0.24, 0.24, 0.03, 24]} />
        </mesh>
      </group>
    </group>
  );
};

export default ProceduralClubStage;
