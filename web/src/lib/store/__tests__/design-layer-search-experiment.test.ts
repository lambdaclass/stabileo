import { writeFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { currentFrameDesignQuality, frameDesignQuality } from './design-quality-fixture';
import { detailingStore } from '../detailing.svelte';
import { verificationStore } from '../verification.svelte';
import * as feedback from '../../engine/detailing/design-feedback-loop';

// Optional full evidence, including the retained geometry rather than only aggregate counts.
// STABILEO_LAYER_AUDIT=/tmp/design-layer-audit adds .before.json and .after.json snapshots.
function writeAudit(phase: 'before' | 'after'): void {
  const path = process.env.STABILEO_LAYER_AUDIT;
  if (!path) return;
  const run = detailingStore.lastRun!;
  const loop = detailingStore.lastFeedbackLoop!;
  const data = {
    ...currentFrameDesignQuality(),
    members: [...verificationStore.contexts].map(([id, ctx]) => ({
      id, kind: ctx.elementType, verdict: verificationStore.memberVerdict(id),
      outcome: verificationStore.outcomeFor(id),
    })),
    reverification: run.reverification, lapping: run.lapping, layering: run.layering,
    layoutSearch: run.layoutSearch,
    loop: { outcome: loop.outcome, unrepaired: loop.unrepaired,
      physicalSearch: loop.physicalSearch ? { trials: loop.physicalSearch.trials,
        stats: loop.physicalSearch.stats, termination: loop.physicalSearch.termination } : undefined },
    assemblies: run.assemblies.map(a => ({ id: a.id, elementIds: a.elementIds,
      conflicts: a.conflicts, unsupported: a.unsupported, bars: a.bars })),
  };
  writeFileSync(`${path}.${phase}.json`, JSON.stringify(data,
    (_key, value) => value instanceof Map ? Object.fromEntries(value) : value instanceof Set ? [...value] : value));
}

// STABILEO_LAYER_SEARCH=8 npx vitest run --project unit src/lib/store/__tests__/design-layer-search-experiment.test.ts
it.runIf(!!process.env.STABILEO_LAYER_SEARCH)('repairs the existing cage without losing physical approvals', async () => {
  const run = feedback.runDesignFeedbackLoop;
  const timings: Array<{ phase: string; elapsedMs: number; cpuMs: number }> = [];
  let phase = 'diameters';
  const enable = vi.spyOn(feedback, 'runDesignFeedbackLoop').mockImplementation(input => run({
    ...input, physicalSearch: input.physicalSearch ?? { maxDetailingRuns: 8, maxMemberSearches: 64 },
    detail: (outcomes, contexts) => {
      const start = performance.now(), cpu = process.cpuUsage();
      const result = input.detail(outcomes, contexts);
      const used = process.cpuUsage(cpu);
      const timing = { phase, elapsedMs: performance.now() - start, cpuMs: (used.user + used.system) / 1000 };
      timings.push(timing);
      console.log(JSON.stringify(timing));
      return result;
    },
  }));
  let before: Awaited<ReturnType<typeof frameDesignQuality>>;
  let result: ReturnType<typeof detailingStore.generate>;
  let elapsedMs = 0, cpuMs = 0;
  try {
    before = await frameDesignQuality();
    writeAudit('before');
    phase = 'layers';
    const start = performance.now(), cpu = process.cpuUsage();
    result = detailingStore.generate({ physicalSearch: {
      maxDetailingRuns: Number(process.env.STABILEO_LAYER_SEARCH), maxMemberSearches: 64,
      operators: ['redistributeLayers'],
    } });
    elapsedMs = performance.now() - start;
    const used = process.cpuUsage(cpu);
    cpuMs = (used.user + used.system) / 1000;
  } finally { enable.mockRestore(); }
  expect(result, detailingStore.lastError ?? '').not.toBeNull();
  const after = currentFrameDesignQuality();
  writeAudit('after');
  const search = detailingStore.lastFeedbackLoop!.physicalSearch!;
  const evidence = { before, after, trials: search.trials, stats: search.stats,
    termination: search.termination, elapsedMs, cpuMs, timings };
  writeFileSync('/tmp/design-layer-search.json', JSON.stringify(evidence));
  console.log(JSON.stringify(evidence));
  expect(before.verifiedIds.length).toBeGreaterThanOrEqual(76);
  expect(after.verifiedIds).toEqual(expect.arrayContaining(before.verifiedIds));
  expect(after.output.passingWithBlockingConflicts).toEqual([]);
  expect(after.output.exhausted).toBeLessThanOrEqual(before.output.exhausted);
  expect(after.output.provisional).toBe(before.output.provisional);
  expect(after.output.blockingConflicts).toBeLessThanOrEqual(before.output.blockingConflicts);
  expect(Object.values(after.output.counts).reduce((a, b) => a + b, 0)).toBe(408);
  for (const [key, count] of Object.entries(after.output.open)) {
    expect(count, key).toBeLessThanOrEqual(before.output.open[key] ?? 0);
  }
  if (Number(process.env.STABILEO_LAYER_SEARCH) >= 8) {
    expect(search.changed).toContain(227);
    expect(after.output.blockingConflicts).toBeLessThanOrEqual(1992);
  }
  // Persisted row intent must survive a later generation without running the new search.
  expect(detailingStore.generate()).not.toBeNull();
  const replay = currentFrameDesignQuality();
  expect(replay.verifiedIds).toEqual(expect.arrayContaining(after.verifiedIds));
  expect(replay.output.passingWithBlockingConflicts).toEqual([]);
  expect(replay.output.blockingConflicts).toBeLessThanOrEqual(after.output.blockingConflicts);
}, 600_000);
