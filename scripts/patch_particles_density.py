#!/usr/bin/env python3
"""V3 particles.ts density patch:
- Adds module-level _density state + setParticleDensity() + dense() helper.
- Inside each system's create(), shadows the base count with a density-scaled
  local `N` so every InstancedMesh / Float32Array uses the scaled count.
- Adds `ambient` flag to the ParticleSystem interface + sets it on
  ember_diyas + fog_wisps (the always-on floaters).
"""
import re

PATH = "/home/z/my-project/src/lib/particles.ts"
src = open(PATH).read()

# 1) Interface: add ambient flag
src = src.replace(
    """export interface ParticleSystem {
  id: string;                        // 'confetti_burst'""",
    """export interface ParticleSystem {
  id: string;                        // 'confetti_burst'
  /** V3: ambient systems (ember diyas, fog wisps) run continuously — the
      stage parks them on Lite FX. Event systems only fire on beats/drops. */
  ambient?: boolean;""",
)

# 2) Module density state after the ParticleSystem interface block
src = src.replace(
    """// ----------------------------------------------------------------------------
// Seeded RNG (\u00a72.4 Determinism Law \u2014 mulberry32)
// ----------------------------------------------------------------------------""",
    """// ----------------------------------------------------------------------------
// V3 PARTICLE DENSITY \u2014 global instance-count scale, applied at create()
// time (the stage rebuilds the FX pack whenever the FX level changes, so a
// toggle re-creates every system at the new density). Default 0.6: the
// V2 launch drew 614 ambient+event instances; V3 draws ~40% fewer by user
// request ("flying particles should be less"), with the remaining budget
// weighted toward the beat-synced event bursts.
// ----------------------------------------------------------------------------
let _density = 0.6;

/** Sets the global particle instance density (0.15..1). Must be called
    BEFORE the FX pack is created (the stage does this in its useMemo). */
export function setParticleDensity(d: number): void {
  _density = Math.max(0.15, Math.min(1, d));
}

/** Density-scaled instance count with a per-system floor. */
function dense(base: number, min: number): number {
  return Math.max(min, Math.round(base * _density));
}

// ----------------------------------------------------------------------------
// Seeded RNG (\u00a72.4 Determinism Law \u2014 mulberry32)
// ----------------------------------------------------------------------------""",
)

# 3) Per-system: shadow base counts with scaled locals inside create()
systems = [
    # (base const, min floor, rand seed line marker, local var name)
    ("CONFETTI_COUNT", 48, "const rand = makeRand(seed ^ 0x1a2b3c4d);"),
    ("HOLI_COUNT", 36, "const rand = makeRand(seed ^ 0x5f6e7d8c);"),
    ("DIYAS_COUNT", 28, "const rand = makeRand(seed ^ 0x9a8b7c6d);"),
    ("FOG_COUNT", 8, "const rand = makeRand(seed ^ 0x3c4d5e6f);"),
    ("SPARKS_COUNT", 24, "const rand = makeRand(seed ^ 0x7e8f9a0b);"),
]

for base_const, floor, marker in systems:
    assert marker in src, marker
    # Insert the scaled local right after the rand line
    src = src.replace(
        marker,
        marker + f"\n    // V3 density-scaled instance count for this system\n    const N = dense({base_const}, {floor});",
        1,
    )

# Now replace uses of each base const INSIDE create() bodies only. Strategy:
# each create() body runs from its `const N = dense(...)` line to the next
# `},\n  dispose()` marker. Replace base_const -> N within those spans.
lines = src.split("\n")
out_lines = []
i = 0
current_const = None
while i < len(lines):
    line = lines[i]
    m = re.search(r"const N = dense\((\w+), (\d+)\);", line)
    if m:
        current_const = m.group(1)
        out_lines.append(line)
        i += 1
        # Now inside the system body: replace until the dispose() marker
        while i < len(lines):
            l2 = lines[i]
            if "dispose() {" in l2 or l2.startswith("const N = dense("):
                # end of body marker handling: stop before dispose, or a new
                # system's N line means we exited without dispose (shouldn't)
                if "dispose() {" in l2:
                    current_const = None
                out_lines.append(l2)
                i += 1
                break
            if current_const and current_const in l2:
                l2 = re.sub(r"\b" + current_const + r"\b", "N", l2)
            out_lines.append(l2)
            i += 1
        continue
    out_lines.append(line)
    i += 1

src = "\n".join(out_lines)

# 4) Mark ambient systems in the registry
src = src.replace(
    """export const PARTICLE_SYSTEMS: ParticleSystem[] = [
  confettiBurstSystem,
  holiGeyserSystem,
  emberDiyasSystem,
  fogWispsSystem,
  strobeSparksSystem,
];""",
    """export const PARTICLE_SYSTEMS: ParticleSystem[] = [
  confettiBurstSystem,   // event (drops)
  holiGeyserSystem,      // event (Holi-class looks)
  emberDiyasSystem,      // AMBIENT floaters
  fogWispsSystem,        // AMBIENT haze
  strobeSparksSystem,    // event (DJ booth bursts)
];

/** V3: true when the system is an always-on ambient floater (parked on Lite). */
export function isAmbientSystem(sys: ParticleSystem): boolean {
  return sys.ambient === true;
}""",
)

open(PATH, "w").write(src)
print("patched OK")
