/**
 * The comparison overlay is drawn against the main diagram, in the same axes.
 * Everything the Compare menu offers — the base solve, a case, a combination,
 * the envelope — is already published in the drawn axes, so the overlay must
 * not be converted a second time.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resultsStore } from '../results.svelte';
import type { AnalysisResults } from '../../engine/types';

afterEach(() => {
  resultsStore._setTransverseSignProvider(() => 1);
  resultsStore.clear();
});

const raw = (): AnalysisResults => ({
  displacements: [], reactions: [],
  elementForces: [{ elementId: 1, nStart: 0, nEnd: 0, vStart: 3, vEnd: -3, mStart: 5, mEnd: -7, length: 4, qI: 0, qJ: 0, pointLoads: [], distributedLoads: [], hingeStart: false, hingeEnd: false }],
} as unknown as AnalysisResults);

describe('the comparison overlay on a member drawn against the solver axis', () => {
  it('has the sign of the main diagram', () => {
    resultsStore._setTransverseSignProvider(() => -1);
    resultsStore.setResults(raw());
    const main = resultsStore.results!.elementForces[0];
    expect(main.mStart).toBe(-5);
    resultsStore.setOverlay(resultsStore.singleResults, 'base');
    const over = resultsStore.overlayResults!.elementForces[0];
    expect([over.vStart, over.mStart, over.mEnd]).toEqual([main.vStart, main.mStart, main.mEnd]);
  });
});
