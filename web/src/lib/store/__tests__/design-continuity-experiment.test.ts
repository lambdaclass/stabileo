import { writeFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { currentFrameDesignQuality, frameDesignQuality } from './design-quality-fixture';
import { detailingStore } from '../detailing.svelte';
import { verificationStore } from '../verification.svelte';
import * as feedback from '../../engine/detailing/design-feedback-loop';

// STABILEO_CONTINUITY_EXPERIMENT=8 npx vitest run --project unit src/lib/store/__tests__/design-continuity-experiment.test.ts
it.runIf(!!process.env.STABILEO_CONTINUITY_EXPERIMENT)('repairs beam continuity and preserves physical approvals', async () => {
  const bottom = !!process.env.STABILEO_BOTTOM_EXPERIMENT;
  const catalogRuns = Number(process.env.STABILEO_CATALOG_EXPERIMENT ?? 0);
  const rowRuns = Number(process.env.STABILEO_ROW_PRESERVATION ?? 0);
  const cageRuns = Number(process.env.STABILEO_CAGE_CATALOG ?? 0);
  const mixedRuns = Number(process.env.STABILEO_MIXED_CAGE_CATALOG ?? 0);
  const line = bottom || !!process.env.STABILEO_LINE_EXPERIMENT;
  const maxDetailingRuns = Number(process.env.STABILEO_CONTINUITY_EXPERIMENT);
  const run = feedback.runDesignFeedbackLoop;
  const spy = vi.spyOn(feedback, 'runDesignFeedbackLoop').mockImplementation(i =>
    run({ ...i, physicalSearch: i.physicalSearch ?? { maxDetailingRuns: 8, maxMemberSearches: 64 } }));
  try {
    await frameDesignQuality();
    expect(detailingStore.generate({ physicalSearch: {
      maxDetailingRuns: 8, maxMemberSearches: 64, operators: ['redistributeLayers'],
    } })).not.toBeNull();
  } finally { spy.mockRestore(); }
  const seeded = currentFrameDesignQuality();
  if (line) expect(detailingStore.generate({ physicalSearch: {
    maxDetailingRuns: 8, maxMemberSearches: 64, operators: ['harmonizeTop'],
  } })).not.toBeNull();
  if (bottom) expect(detailingStore.generate({ physicalSearch: {
    maxDetailingRuns: 80, maxMemberSearches: 512, operators: ['harmonizeTopLine'],
  } })).not.toBeNull();
  const before = currentFrameDesignQuality();
  const start = performance.now();
  expect(detailingStore.generate({ physicalSearch: {
    maxDetailingRuns, maxMemberSearches: 512,
    operators: [bottom ? 'harmonizeBottomLine' : line ? 'harmonizeTopLine' : 'harmonizeTop'],
  } }), detailingStore.lastError ?? '').not.toBeNull();
  const elapsedMs = performance.now() - start;
  const continuity = currentFrameDesignQuality();
  const continuitySearch = detailingStore.lastFeedbackLoop!.physicalSearch!;
  if (catalogRuns) expect(detailingStore.generate({ physicalSearch: {
    maxDetailingRuns: catalogRuns, maxMemberSearches: 768, operators: ['harmonizeTopCatalog'],
  } }), detailingStore.lastError ?? '').not.toBeNull();
  const catalog = currentFrameDesignQuality();
  const catalogStats = detailingStore.lastFeedbackLoop!.physicalSearch!.stats;
  if (rowRuns) expect(detailingStore.generate({ physicalSearch: {
    maxDetailingRuns: rowRuns, maxMemberSearches: 128, operators: ['preserveBottomRows', 'redistributeLayers'],
  } }), detailingStore.lastError ?? '').not.toBeNull();
  const rows = currentFrameDesignQuality();
  const rowStats = detailingStore.lastFeedbackLoop!.physicalSearch!.stats;
  if (cageRuns) expect(detailingStore.generate({ physicalSearch: {
    maxDetailingRuns: cageRuns, maxMemberSearches: 512, operators: ['harmonizeCageCatalog'],
  } }), detailingStore.lastError ?? '').not.toBeNull();
  const cage = currentFrameDesignQuality();
  const cageStats = detailingStore.lastFeedbackLoop!.physicalSearch!.stats;
  if (mixedRuns) expect(detailingStore.generate({ physicalSearch: {
    maxDetailingRuns: mixedRuns, maxMemberSearches: 512, operators: ['harmonizeMixedCageCatalog'],
  } }), detailingStore.lastError ?? '').not.toBeNull();
  const after = currentFrameDesignQuality();
  const search = detailingStore.lastFeedbackLoop!.physicalSearch!;
  const evidence = { before, after, elapsedMs, trials: search.trials, stats: search.stats,
    termination: search.termination, changed: search.changed, continuity,
    continuityStats: continuitySearch.stats, catalog, catalogStats, rows, rowStats, cage, cageStats };
  writeFileSync('/tmp/design-continuity-search.json', JSON.stringify(evidence));
  if (process.env.STABILEO_CONTINUITY_AUDIT) writeFileSync(process.env.STABILEO_CONTINUITY_AUDIT, JSON.stringify({
    ...evidence, members: [...verificationStore.contexts].map(([id, ctx]) => ({ id, kind: ctx.elementType,
      section: ctx.section, material: ctx.material, verdict: verificationStore.memberVerdict(id),
      outcome: verificationStore.outcomeFor(id) })),
    reverification: search.result.reverification, lapping: search.result.lapping,
    layering: search.result.layering, layoutSearch: search.result.layoutSearch, assemblies: search.result.assemblies,
  }, (_key, value) => value instanceof Map ? Object.fromEntries(value) : value instanceof Set ? [...value] : value));
  console.log(JSON.stringify({ before: before.output, after: after.output, elapsedMs, stats: search.stats }));
  expect(after.verifiedIds).toEqual(expect.arrayContaining(before.verifiedIds));
  expect(after.verifiedIds).toEqual(expect.arrayContaining(seeded.verifiedIds));
  expect(after.verifiedIds).toEqual(expect.arrayContaining(continuity.verifiedIds));
  expect(after.verifiedIds).toEqual(expect.arrayContaining(catalog.verifiedIds));
  expect(after.verifiedIds).toEqual(expect.arrayContaining(rows.verifiedIds));
  expect(after.verifiedIds).toEqual(expect.arrayContaining(cage.verifiedIds));
  expect(after.output.passingWithBlockingConflicts).toEqual([]);
  expect(after.output.exhausted).toBe(before.output.exhausted);
  expect(after.output.provisional).toBe(before.output.provisional);
  expect(after.output.blockingConflicts).toBeLessThanOrEqual(before.output.blockingConflicts);
  for (const [key, count] of Object.entries(after.output.open)) {
    expect(count, key).toBeLessThanOrEqual(before.output.open[key] ?? 0);
  }
  expect(search.stats.structuralSolves).toBe(0);
  if (bottom && maxDetailingRuns >= 64) {
    // Preserve every physical approval from the preceding production audit, by identity.
    expect(after.verifiedIds).toEqual(expect.arrayContaining([2, 4, 7, 8, 9, 13, 16, 17, 18, 19, 20,
      32, 34, 38, 40, 42, 43, 45, 48, 50, 52, 53, 54, 55, 58, 63, 65, 68, 70, 72, 74, 77, 78,
      79, 82, 83, 84, 89, 94, 97, 98, 99, 102, 103, 104, 105, 107, 109, 110, 113, 114, 115, 118,
      119, 120, 121, 122, 123, 124, 125, 126, 130, 131, 135, 136, 137, 138, 139, 140, 142, 143,
      144, 147, 148, 149, 152, 153, 154, 157, 158, 159, 185, 201, 202]));
    expect(after.output.blockingConflicts).toBeLessThan(1542);
    expect(continuitySearch.termination).toBe('sweepComplete');
    if (catalogRuns === 64) {
      // All 140 approvals from the 1101-blocker audit, not just the previous total.
      expect(after.verifiedIds).toEqual(expect.arrayContaining([2, 4, 6, 7, 8, 9, 10, 12, 13, 14,
        16, 17, 18, 19, 20, 32, 34, 38, 40, 42, 43, 45, 48, 50, 51, 52, 53, 54, 55, 58, 62,
        63, 65, 66, 68, 70, 72, 73, 74, 76, 77, 78, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
        90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
        109, 110, 111, 113, 114, 115, 118, 119, 120, 121, 122, 123, 124, 125, 126, 130, 131,
        135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151,
        152, 153, 154, 155, 156, 157, 158, 159, 160, 185, 201, 202, 211, 212, 213, 285, 286,
        287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 316, 317, 318, 319, 320, 321, 322, 323]));
      expect(after.output.blockingConflicts).toBeLessThanOrEqual(1092);
      if (rowRuns === 16) expect(after.output.blockingConflicts).toBeLessThanOrEqual(920);
      if (rowRuns === 16 && cageRuns === 64) {
        expect(after.output.blockingConflicts).toBeLessThanOrEqual(844);
        expect(after.verifiedIds.length).toBeGreaterThanOrEqual(169);
        if (mixedRuns === 64) {
          expect(after.output.blockingConflicts).toBeLessThanOrEqual(819);
          expect(after.verifiedIds.length).toBeGreaterThanOrEqual(177);
        }
      }
      expect(after.verifiedIds.filter(id => verificationStore.contexts.get(id)?.elementType === 'beam').length).toBeGreaterThanOrEqual(26);
    }
  } else if (line && maxDetailingRuns >= 80) {
    expect(after.verifiedIds.length).toBeGreaterThanOrEqual(81);
    expect(after.output.blockingConflicts).toBeLessThanOrEqual(1641);
  }
  expect(detailingStore.generate()).not.toBeNull();
  const replay = currentFrameDesignQuality();
  expect(replay.verifiedIds).toEqual(after.verifiedIds);
  expect(replay.output).toEqual(after.output);
}, process.env.STABILEO_MIXED_CAGE_CATALOG ? 1_800_000 : process.env.STABILEO_CAGE_CATALOG ? 1_500_000 : process.env.STABILEO_ROW_PRESERVATION ? 1_200_000 : 900_000);
