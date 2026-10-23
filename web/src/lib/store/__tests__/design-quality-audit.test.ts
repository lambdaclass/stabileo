import { writeFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { frameDesignQuality } from './design-quality-fixture';
import { detailingStore } from '../detailing.svelte';
import { verificationStore } from '../verification.svelte';
import * as design from '../../engine/design/candidate-search';
import * as detailing from '../../engine/detailing/run-detailing';
import * as coordination from '../../engine/detailing/coordinate-floor';
import * as search from '../../engine/detailing/coordination-search';

// Opt-in diagnostic, never a timing gate. Writes evidence from the actual production run.
// STABILEO_DESIGN_AUDIT=/tmp/design-audit.json npx vitest run --project unit src/lib/store/__tests__/design-quality-audit.test.ts
it.runIf(!!process.env.STABILEO_DESIGN_AUDIT)('audits final failures and search work', async () => {
  const timings: Record<string, number[]> = {};
  function measure<T extends (...args: any[]) => any>(name: string, fn: T): T {
    return ((...args: Parameters<T>) => {
      const start = performance.now();
      try { return fn(...args); }
      finally { (timings[name] ??= []).push(performance.now() - start); }
    }) as T;
  }
  const runDesign = measure('design', design.runDesign);
  const runDetailing = measure('detail', detailing.runDetailing);
  const coordinateFloor = measure('floor', coordination.coordinateFloor);
  const coordinate = measure('layoutSearch', search.coordinate);
  vi.spyOn(design, 'runDesign').mockImplementation(runDesign);
  vi.spyOn(detailing, 'runDetailing').mockImplementation(runDetailing);
  vi.spyOn(coordination, 'coordinateFloor').mockImplementation(coordinateFloor);
  vi.spyOn(search, 'coordinate').mockImplementation(coordinate);
  try {
    const { output, verifiedIds } = await frameDesignQuality();
    const run = detailingStore.lastRun!;
    const loop = detailingStore.lastFeedbackLoop!;
    expect(run).toBeTruthy();
    expect(output.aborted).toBe(false);
    const data = {
      output, verifiedIds, timings,
      members: [...verificationStore.contexts].map(([id, ctx]) => ({
        id, kind: ctx.elementType, verdict: verificationStore.memberVerdict(id),
        outcome: verificationStore.outcomeFor(id),
      })),
      reverification: run.reverification,
      layoutSearch: run.layoutSearch,
      lapping: run.lapping,
      layering: run.layering,
      loop: { outcome: loop.outcome, stats: loop.stats, unrepaired: loop.unrepaired,
        physicalSearch: loop.physicalSearch ? { trials: loop.physicalSearch.trials,
          stats: loop.physicalSearch.stats, termination: loop.physicalSearch.termination } : undefined,
        iterations: loop.iterations.map(i => ({ failed: i.failed, proposed: i.proposed, changed: i.changed, rejected: i.rejected })) },
      coordination: run.coordination.map(c => ({ id: c.assembly.id, attempts: c.repair.attempts,
        unresolved: c.repair.unresolved, moved: c.repair.moved, trace: c.repair.trace })),
      assemblies: run.assemblies.map(a => ({ id: a.id, elementIds: a.elementIds,
        conflicts: a.conflicts, unsupported: a.unsupported, bars: a.bars })),
    };
    writeFileSync(process.env.STABILEO_DESIGN_AUDIT!, JSON.stringify(data,
      (_key, value) => value instanceof Map ? Object.fromEntries(value) : value instanceof Set ? [...value] : value));
    console.log(JSON.stringify({ output, timings, path: process.env.STABILEO_DESIGN_AUDIT }));
  } finally { vi.restoreAllMocks(); }
}, 600_000);
