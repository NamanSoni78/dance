// V3 offline verification of the groupDance mode machine.
// Simulates the demo-beat 32-beat energy cycle at 128 BPM and asserts the
// choreographic mode lifecycle works exactly as designed.
import { createGroupDirector } from '../src/lib/groupDance';
import type { AudioMetrics } from '../src/lib/choreographer';
import type { SpeciesId } from '../src/lib/species';
import { GIRL_DUET_MOVES } from '../src/lib/girlDuetMoves';

const GIRL_DUET_IDS = new Set(GIRL_DUET_MOVES.map((d) => d.id));

function simOverall(beat: number): number {
  const phraseBeat = ((beat % 32) + 32) % 32;
  if (phraseBeat < 4) return 0.07;   // idle intro
  if (phraseBeat < 12) return 0.36;  // hip-hop groove
  if (phraseBeat < 20) return 0.52;  // disco funk
  if (phraseBeat < 26) return 0.57;  // shuffle
  return 0.82;                       // bass drop
}

function runCrew(label: string, species: SpeciesId[], beats = 480): void {
  const director = createGroupDirector(20261015);
  director.setCrewSpecies(species);
  director.setDancerCount(species.length);

  const metrics: AudioMetrics = {
    bass: 0.5, mid: 0.5, high: 0.4, overall: 0.36,
    isBeat: true, bpm: 128, isPlaying: true,
  };

  let firstDuetBeat = -1;
  let duetBeats = 0;
  let firstSpotBeat = -1;
  let spotBeats = 0;
  const formationsSeen = new Set<string>();
  const duetIds = new Set<string>();
  const spotSpeciesSeen = new Set<string>();
  let hypeRoleBeats = 0;
  let roleParityErrors = 0;
  const timeline: string[] = [];

  for (let beat = 0; beat <= beats; beat++) {
    metrics.overall = simOverall(beat);
    director.update(metrics, beat, beat * Math.PI * 2, 0.469); // dt=60/128

    const cs = director.getChoreoState();
    if (cs.mode === 'DUET_CONTACT') {
      if (firstDuetBeat < 0) firstDuetBeat = beat;
      duetBeats++;
      if (cs.duet) duetIds.add(cs.duet.id);

      // Role invariants per crew size
      // V5 GIRL-FIRST LAW: when the active duet is one of the Diva's authored
      // routines, any GIRL in the pair takes PARTNER_A (poseA = feminine
      // anchor); otherwise the legacy fixed order holds. The invariant is
      // exactly one A + one B per pair, with the girl leading girl-duets.
      const n = species.length;
      const isGirlDuet = cs.duet ? GIRL_DUET_IDS.has(cs.duet.id) : false;
      const girlFirstOk = (idxA: number, idxB: number): boolean => {
        const roleA = director.getSlotState(idxA).duetRole;
        const roleB = director.getSlotState(idxB).duetRole;
        const oneEach =
          (roleA === 'PARTNER_A' && roleB === 'PARTNER_B') ||
          (roleA === 'PARTNER_B' && roleB === 'PARTNER_A');
        if (!oneEach) return false;
        if (!isGirlDuet) return roleA === 'PARTNER_A';
        const aIsGirl = species[idxA] === 'GIRL';
        const bIsGirl = species[idxB] === 'GIRL';
        if (aIsGirl && !bIsGirl) return roleA === 'PARTNER_A';
        if (bIsGirl && !aIsGirl) return roleB === 'PARTNER_A';
        return true; // both or neither: any A/B order
      };
      if (n === 2) {
        if (!girlFirstOk(0, 1)) roleParityErrors++;
      } else if (n === 4) {
        if (!girlFirstOk(0, 1) || !girlFirstOk(2, 3)) roleParityErrors++;
      } else if (n === 3) {
        const roles = [0, 1, 2].map((i) => director.getSlotState(i).duetRole);
        const partners = roles.filter((r) => r === 'PARTNER_A' || r === 'PARTNER_B').length;
        const hype = roles.filter((r) => r === 'HYPE_BACKDROP').length;
        if (partners !== 2 || hype !== 1) roleParityErrors++;
        if (hype === 1) hypeRoleBeats++;
      }
    }
    if (cs.mode === 'SPECIES_SPOTLIGHT') {
      if (firstSpotBeat < 0) firstSpotBeat = beat;
      spotBeats++;
      const soloistIdx = cs.spotlightIndex % species.length;
      const isSoloist = director.getSlotState(soloistIdx).isSpotlightSoloist;
      if (!isSoloist) roleParityErrors++;
      spotSpeciesSeen.add(species[soloistIdx]);
    }
    if (cs.mode === 'FORMATION_GROUP') formationsSeen.add(cs.formationId);
    if (beat % 32 === 0) {
      const out = { text: '' };
      director.getSummary(out);
      timeline.push(`  beat ${String(beat).padStart(3)}: ${out.text}`);
    }
  }

  console.log(`\n=== ${label} (n=${species.length}, ${beats} beats ≈ ${((beats / 128) * 60).toFixed(0)}s of music) ===`);
  console.log(`duet beats: ${duetBeats} (first @ ${firstDuetBeat}), spotlights: ${spotBeats} (first @ ${firstSpotBeat})`);
  console.log(`distinct duets used: ${duetIds.size}`);
  console.log(`spotlight species rotated: ${[...spotSpeciesSeen].join(', ') || '(none)'}`);
  console.log(`baseline formations used (${formationsSeen.size}): ${[...formationsSeen].slice(0, 8).join(', ')}${formationsSeen.size > 8 ? ', …' : ''}`);
  console.log(`hype-backdrop beats (n=3): ${hypeRoleBeats}`);
  console.log(`ROLE PARITY ERRORS: ${roleParityErrors}`);
  console.log('timeline (every 32 beats):');
  console.log(timeline.join('\n'));

  if (roleParityErrors > 0) {
    console.log(`!!! FAIL: ${roleParityErrors} role parity errors`);
    process.exitCode = 1;
  }
  if (species.length >= 2) {
    if (firstDuetBeat < 0) { console.log('!!! FAIL: no duet ever fired'); process.exitCode = 1; }
    if (firstSpotBeat < 0) { console.log('!!! FAIL: no spotlight ever fired'); process.exitCode = 1; }
    if (formationsSeen.has('SOLO_SPOTLIGHT') || formationsSeen.has('CALL_RESPONSE_CYPHER')) {
      console.log('!!! FAIL: solo-spot formation leaked into baseline rotation');
      process.exitCode = 1;
    }
  }
}

runCrew('DUO (cat + diva)', ['CAT', 'GIRL']);
runCrew('TRIO (cat + diva + mouse)', ['CAT', 'GIRL', 'MOUSE']);
runCrew('QUAD (cat + diva + mouse + cat)', ['CAT', 'GIRL', 'MOUSE', 'CAT']);
runCrew('SOLO (cat only — must stay FORMATION_GROUP)', ['CAT'], 160);

// Solo invariant: never duet/spotlight
{
  const director = createGroupDirector(1);
  director.setCrewSpecies(['CAT']);
  director.setDancerCount(1);
  const m: AudioMetrics = { bass: 0.6, mid: 0.6, high: 0.5, overall: 0.82, isBeat: true, bpm: 128, isPlaying: true };
  let bad = 0;
  for (let beat = 0; beat <= 200; beat++) {
    director.update(m, beat, beat * Math.PI * 2, 0.469);
    if (director.getChoreoState().mode !== 'FORMATION_GROUP') bad++;
  }
  console.log(`\nSOLO invariant violations (must be 0): ${bad}`);
  if (bad > 0) process.exitCode = 1;
}
console.log('\nDONE');
