import { writeFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { frameDesignQuality, PHYSICAL_BASELINE_PASSES } from './design-quality-fixture';
import { detailingStore } from '../detailing.svelte';
import * as feedback from '../../engine/detailing/design-feedback-loop';

// Enable the production loop's optional search without changing the project's default.
// STABILEO_GUIDED_SEARCH=8 npx vitest run --project unit src/lib/store/__tests__/design-guided-search-experiment.test.ts
it.runIf(!!process.env.STABILEO_GUIDED_SEARCH)('explores physical repair alternatives without replacing a better full design', async () => {
  const run = feedback.runDesignFeedbackLoop;
  const timings: Array<{ elapsedMs: number; cpuMs: number }> = [];
  vi.spyOn(feedback, 'runDesignFeedbackLoop').mockImplementation(input => run({
    ...input, physicalSearch: { maxDetailingRuns: Number(process.env.STABILEO_GUIDED_SEARCH), maxMemberSearches: 64 },
    detail: (outcomes, contexts) => {
      const start = performance.now(), cpu = process.cpuUsage();
      const result = input.detail(outcomes, contexts);
      const used = process.cpuUsage(cpu);
      timings.push({ elapsedMs: performance.now() - start, cpuMs: (used.user + used.system) / 1000 });
      writeFileSync('/tmp/design-guided-timing.json', JSON.stringify(timings));
      return result;
    },
  }));
  try {
    const data = await frameDesignQuality();
    const search = detailingStore.lastFeedbackLoop!.physicalSearch!;
    expect(data.output.passingWithBlockingConflicts).toEqual([]);
    expect(data.output.exhausted).toBeLessThanOrEqual(35);
    expect(data.verifiedIds.length).toBeGreaterThanOrEqual(72);
    expect(data.verifiedIds).toEqual(expect.arrayContaining(PHYSICAL_BASELINE_PASSES));
    expect(data.output.blockingConflicts).toBeLessThanOrEqual(2981);
    if (Number(process.env.STABILEO_GUIDED_SEARCH) >= 8) {
      expect(data.verifiedIds).toEqual(expect.arrayContaining([40, 45, 50, 65]));
      expect(data.output.blockingConflicts).toBeLessThanOrEqual(2066);
    }
    const output = { ...data, trials: search.trials, stats: search.stats, termination: search.termination, timings };
    writeFileSync('/tmp/design-guided-search.json', JSON.stringify(output));
    console.log(JSON.stringify(output));
  } finally { vi.restoreAllMocks(); }
}, 600_000);
