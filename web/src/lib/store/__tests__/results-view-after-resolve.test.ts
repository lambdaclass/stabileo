/**
 * A re-solve puts back what was on screen before the edit cleared it — but
 * only onto results, only the user's latest choice, and only within the same
 * project.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resultsStore } from '../results.svelte';
import type { AnalysisResults } from '../../engine/types';

const r = (): AnalysisResults => ({ displacements: [], reactions: [], elementForces: [] } as unknown as AnalysisResults);

afterEach(() => { resultsStore.clear(); resultsStore.forgetView(); });

describe('the view waiting for a re-solve', () => {
  it('is the diagram picked while the solve was running, not the one before', () => {
    resultsStore.setResults(r());
    resultsStore.diagramType = 'moment';
    resultsStore.clear();
    resultsStore.diagramType = 'shear';
    resultsStore.setResults(r(), true);
    resultsStore.restoreView(false);
    expect(resultsStore.diagramType).toBe('shear');
  });

  it('is dropped when another project replaces this one', () => {
    resultsStore.setResults(r());
    resultsStore.diagramType = 'moment';
    resultsStore.clear();
    expect(resultsStore.pendingView).not.toBeNull();
    resultsStore.forgetView();
    expect(resultsStore.pendingView).toBeNull();
  });
});
