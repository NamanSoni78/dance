// src/lib/species.ts
// V4 CREW SPECIES — presets for the shared 24-joint procedural rig.
//
// DESIGN LAW: every dancer runs the EXACT same joint hierarchy, IK floor lock,
// choreographer pose channels and auto-layers. A preset only parameterizes
// SILHOUETTE (ears / snout / whiskers / tail), MATERIALS, SCALE and ACCENT
// multipliers — so every authored 41-channel pose (42 solo moves, 32 duets,
// hype/spotlight routines) works unchanged for every species.
//
// V4: DOG is retired — replaced by GIRL, a realistic human diva. She shares
// the identical biped skeleton (same joint offsets, same IK, same pose
// contract) but renders a human body, face, hair and — her signature —
// physics cloth (verlet skirt) + a verlet ponytail chain. Her silhouettes
// (hair instead of ears/tail) are driven by the same accent/carriage system.
//
// Zero per-frame cost: everything here is read once at mount into the
// component's materials/geometry; accents are scalars on the engine state.

export type SpeciesId = 'CAT' | 'GIRL' | 'MOUSE';

export type EarStyle = 'POINTY' | 'FLOPPY' | 'ROUND';
export type SnoutStyle = 'FLAT' | 'LONG' | 'TINY';
export type PupilStyle = 'SLIT' | 'ROUND';

export interface SpeciesPreset {
  /** V4: renderer branch — animal rig (cat/mouse) vs the girl rig. */
  kind: 'animal' | 'girl';
  id: SpeciesId;
  /** Short UI label */
  label: string;
  /** Emoji for the crew chips */
  emoji: string;
  /** Uniform rig scale (rig local floor stays the world floor at y=0) */
  scale: number;
  /** Primary fur color (body, head, arms, legs) — GIRL: hair color */
  furDark: string;
  /** Secondary fur color (muzzle, belly, tufts) — GIRL: hair highlight */
  furCream: string;
  /** Sheen tint for the velvet MeshPhysicalMaterial rim — GIRL: hair sheen */
  sheenColor: string;
  /** Inner-ear / nose / paw pad skin tone — GIRL: unused (bust/lip base) */
  skinPink: string;
  /** Ear silhouette (GIRL: ignored) */
  earStyle: EarStyle;
  /** Muzzle silhouette (GIRL: ignored) */
  snoutStyle: SnoutStyle;
  /** Whiskers on/off (GIRL: ignored) */
  whiskers: boolean;
  /** Whisker length multiplier (GIRL: ignored) */
  whiskerLength: number;
  /** Tail params (GIRL: ignored — her verlet ponytail uses accent instead) */
  tailLength: number;
  tailRadius: number;
  tailWagSpeed: number;
  tailBasePitch: number;
  /** Pupil geometry style (GIRL: ignored — she has natural round pupils) */
  pupilStyle: PupilStyle;
  /** Sneaker accent color — GIRL: boot trim */
  sneakerAccent: string;
  /** Bounce energy multiplier on squash/jump accents */
  bounce: number;
  /** Ear twitch amplitude multiplier — GIRL: hair-settle bounce */
  earTwitch: number;
  /** Tongue-out idle layer (GIRL: ignored) */
  tongue: boolean;
  /** Buck teeth (GIRL: ignored) */
  buckTeeth: boolean;
  /** Headphone earcup scale (GIRL: ignored — she wears none) */
  headphoneScale: number;
  // ---- V4 GIRL-ONLY (optional; animals leave them undefined) ----
  /** Warm human skin tone */
  skin?: string;
  /** Natural eye sclera / iris (realistic, not neon) */
  eyeSclera?: string;
  eyeIris?: string;
  /** Lip + cheek blush tones */
  lip?: string;
  blush?: string;
  /** Fitted crop-top + skirt (cloth) + under-skirt shorts */
  outfitTop?: string;
  outfitSkirt?: string;
  /** Neon trim shared by top hem, wrist bangles and boot laces */
  outfitTrim?: string;
  /** Platform boots */
  boots?: string;
}

export const SPECIES_PRESETS: Record<SpeciesId, SpeciesPreset> = {
  CAT: {
    kind: 'animal',
    id: 'CAT',
    label: 'Cat',
    emoji: '🐱',
    scale: 1.0,
    furDark: '#1b1e2b',
    furCream: '#f5ede2',
    sheenColor: '#5b6ea8',
    skinPink: '#ff7aa2',
    earStyle: 'POINTY',
    snoutStyle: 'FLAT',
    whiskers: true,
    whiskerLength: 1.0,
    tailLength: 1.0,
    tailRadius: 1.0,
    tailWagSpeed: 1.0,
    tailBasePitch: 0.0,
    pupilStyle: 'SLIT',
    sneakerAccent: '#ff2a85',
    bounce: 1.0,
    earTwitch: 1.0,
    tongue: false,
    buckTeeth: false,
    headphoneScale: 1.0,
  },
  GIRL: {
    kind: 'girl',
    id: 'GIRL',
    label: 'Diva',
    emoji: '💃',
    // V5.1: the DivaBody rig is a real ~1.71 m human at scale 1 — 0.98 lands
    // her at a believable 1.68 m glam height (plus built-in heeled boots)
    // while still reading taller than the animals.
    scale: 0.98,
    furDark: '#2a1c22',      // hair — deep espresso brunette
    furCream: '#584033',     // hair highlight — warm caramel balayage
    sheenColor: '#a5713f',   // hair sheen — warm caramel gloss under neon
    skinPink: '#ff9db4',     // blush base
    earStyle: 'POINTY',      // ignored (girl renderer)
    snoutStyle: 'FLAT',      // ignored
    whiskers: false,         // ignored
    whiskerLength: 0,
    tailLength: 0,           // ignored — verlet ponytail instead
    tailRadius: 0,
    tailWagSpeed: 1.0,       // hair sway speed
    tailBasePitch: 0,
    pupilStyle: 'ROUND',     // ignored (natural pupils)
    sneakerAccent: '#22ecff',// boot lace accent
    bounce: 0.92,            // smooth, grounded groove (heavier hip style)
    earTwitch: 0.8,          // hair-settle bounce scale
    tongue: false,
    buckTeeth: false,
    headphoneScale: 0,
    // ---- girl-only ----
    skin: '#d9a78e',         // warm sun-kissed tan (SSS-tinted by DivaBody)
    eyeSclera: '#f8f5f0',
    eyeIris: '#4d7c6f',      // striking teal-green (DivaBody iris map tint)
    lip: '#c23b52',          // couture rose
    blush: '#ff9db4',
    outfitTop: '#922e59',    // wine couture corset bodice (silk satin)
    outfitSkirt: '#2b1850',  // deep plum flared skirt
    outfitTrim: '#22ecff',   // neon cyan accents / jewelry glow
    boots: '#16141d',        // glossy black heeled boots
  },
  MOUSE: {
    kind: 'animal',
    id: 'MOUSE',
    label: 'Mouse',
    emoji: '🐭',
    scale: 0.74,
    furDark: '#8f95a3',
    furCream: '#f0e8dc',
    sheenColor: '#c9d4ff',
    skinPink: '#ffb3c1',
    earStyle: 'ROUND',
    snoutStyle: 'TINY',
    whiskers: true,
    whiskerLength: 1.35,
    tailLength: 1.45,
    tailRadius: 0.45,
    tailWagSpeed: 1.35,
    tailBasePitch: -0.2,
    pupilStyle: 'ROUND',
    sneakerAccent: '#00bbf9',
    bounce: 1.3,
    earTwitch: 1.8,
    tongue: false,
    buckTeeth: true,
    headphoneScale: 0.82,
  },
};

/** V4: DOG retired — the crew is cat + diva + mouse. */
export const SPECIES_ORDER: SpeciesId[] = ['CAT', 'GIRL', 'MOUSE'];

export function getSpeciesPreset(id: SpeciesId): SpeciesPreset {
  return SPECIES_PRESETS[id] ?? SPECIES_PRESETS.CAT;
}
