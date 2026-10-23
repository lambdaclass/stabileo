import { writeFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { frameDesignQuality } from './design-quality-fixture';
import { verificationStore } from '../verification.svelte';
import * as beam from '../../engine/design/candidate-enumerate-beam';
import { STANDARD_LONG_DIAS } from '../../engine/design/objective';

// Opt-in experiments, not production policies or claims of design adequacy.
// Run each profile in a fresh process, with the same release WASM:
// STABILEO_BEAM_PALETTE=baseline STABILEO_HEURISTICS_OUTPUT=/tmp/beam-baseline.json \
//   npx vitest run --project unit src/lib/store/__tests__/design-heuristics-experiment.test.ts
const palettes: Record<string, readonly number[]> = {
  baseline: STANDARD_LONG_DIAS,
  min16: STANDARD_LONG_DIAS.filter(d => d >= 16),
  family: [16, 20, 25],
  min20: STANDARD_LONG_DIAS.filter(d => d >= 20),
};

it.runIf(!!process.env.STABILEO_BEAM_PALETTE)('measures a beam diameter heuristic through final verification', async () => {
  const profile = process.env.STABILEO_BEAM_PALETTE!;
  const palette = palettes[profile];
  if (!palette) throw new Error(`Unknown beam palette: ${profile}`);
  const generate = beam.createBeamCandidateGenerator;
  vi.spyOn(beam, 'createBeamCandidateGenerator').mockImplementation(ctx => generate({
    ...ctx,
    material: { ...ctx.material,
      // Restrict only enumeration; never invent sizes outside the project catalog.
      longDiametersMm: (ctx.material.longDiametersMm ?? STANDARD_LONG_DIAS).filter(d => palette.includes(d)),
    },
  }));
  try {
    const start = performance.now();
    const { output, verifiedIds } = await frameDesignQuality();
    const elapsedMs = performance.now() - start;
    expect(output.aborted).toBe(false);
    expect(output.notReached).toBe(0);
    expect(Object.values(output.counts).reduce((a, b) => a + b, 0)).toBe(408);
    expect(output.passingWithBlockingConflicts).toEqual([]);
    const members = [...verificationStore.contexts].map(([id, ctx]) => ({
      id, kind: ctx.elementType, verdict: verificationStore.memberVerdict(id),
      outcome: verificationStore.outcomeFor(id),
    }));
    // Fewer drawn beams can make columns appear clearer. Report missing coverage
    // beside passes, so this experiment cannot be read as an acceptance gate.
    const statusesByKind: Record<string, Record<string, number>> = {};
    for (const member of members) {
      const counts = statusesByKind[member.kind] ??= {};
      counts[member.verdict.status] = (counts[member.verdict.status] ?? 0) + 1;
    }
    const data = { profile, palette, output, verifiedIds, elapsedMs, statusesByKind, members };
    if (process.env.STABILEO_HEURISTICS_OUTPUT) {
      writeFileSync(process.env.STABILEO_HEURISTICS_OUTPUT, JSON.stringify(data));
    }
    console.log(JSON.stringify({ profile, palette, output, verifiedIds, elapsedMs, statusesByKind }));
  } finally { vi.restoreAllMocks(); }
}, 600_000);
