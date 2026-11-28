import { expect, it } from 'vitest';
import { assessProject } from '../../provenance/applicability';
import { stampSolve } from '../../provenance/solve-stamp';
import { RESULTS_VERSION } from '../../provenance/registry';
import type { FeatureSnapshot } from '../../provenance/model-features';
import { createRecheckStore } from '../recheck.svelte';

it.each(['2d', '3d', 'pro'])('known wrong result: #1928 solving again in %s cannot verify an unpublished zone load', async mode => {
  const id = 'unpublished-zone-occupancies';
  const snapshot: FeatureSnapshot = { groups: [
    [1, { kind: 'loadZone', data: { use: { occupancy: 'uk-A1', provenance: 'confirmed' } } }],
    [2, { kind: 'floorLoad', data: { fromZone: 1, role: 'live' } }],
  ], designData: { loadBasis: { resultsVersion: RESULTS_VERSION } } };
  for (const analysis of ['linear', 'pdelta', 'plastic'] as const) {
    const solvedWith = stampSolve(analysis, null);
    const store = createRecheckStore();
    const expected = !__PUBLIC_FEATURES__.proPlatesUnified;
    expect.soft(assessProject(snapshot, solvedWith, mode).changes.some(c => c.id === id)).toBe(expected);
    store.openProject({ ...snapshot, solvedWith }, mode);
    await store.retry();
    expect.soft(store.assessment?.changes.some(c => c.id === id && c.requiresLoadRegeneration)).toBe(expected);
    store.openProject({
      ...snapshot, groups: snapshot.groups!.slice(0, 1), solvedWith,
      pendingRecheckNotice: { stamp: { ...solvedWith, resultsVersion: 0 }, features: ['unpublishedZoneLiveLoads'] },
    }, mode);
    await store.retry();
    expect(store.assessment?.changes.some(c => c.id === id)).toBe(false);
  }
});
