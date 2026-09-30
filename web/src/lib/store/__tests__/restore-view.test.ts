/**
 * A re-solve shows what was on screen before the edit that cleared it.
 *
 * An edit clears the results; the re-solve (live calc, or Calcular) used to
 * land on the deformed shape of the unit-factor loads, whatever diagram and
 * combination had been showing — so every slider move in Explore, and every
 * edit under live calc, threw the user back to the deformed shape.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resultsStore } from '../results.svelte';
import type { AnalysisResults, FullEnvelope } from '../../engine/types';

const R = (tag: number) => ({ displacements: [{ nodeId: 1, ux: tag, uz: 0, ry: 0 }], reactions: [], elementForces: [] }) as unknown as AnalysisResults;

beforeEach(() => {
  resultsStore.clear();
  resultsStore.restoreView(false); // drop whatever an earlier test left pending
});

describe('restoreView', () => {
  it('puts the diagram back after a clear and a fresh solve', () => {
    resultsStore.setResults(R(1));
    resultsStore.diagramType = 'moment';
    resultsStore.clear();
    resultsStore.clear(); // a second edit before the re-solve does not lose it
    resultsStore.setResults(R(2));
    expect(resultsStore.diagramType).toBe('deformed');
    resultsStore.restoreView(false);
    expect(resultsStore.diagramType).toBe('moment');
    expect(resultsStore.pendingView).toBeNull();
  });

  it('puts the combination back when the new results have it', () => {
    resultsStore.setResults(R(1));
    resultsStore.setCombinationResults(new Map([[1, R(1)]]), new Map([[7, R(7)], [8, R(8)]]), { maxAbsResults: R(0) } as unknown as FullEnvelope);
    resultsStore.activeComboId = 8;
    resultsStore.activeView = 'combo';
    resultsStore.diagramType = 'shear';
    resultsStore.clear();
    resultsStore.setResults(R(2));
    resultsStore.setCombinationResults(new Map([[1, R(1)]]), new Map([[7, R(17)], [8, R(18)]]), { maxAbsResults: R(0) } as unknown as FullEnvelope);
    resultsStore.restoreView(false);
    expect(resultsStore.activeView).toBe('combo');
    expect(resultsStore.activeComboId).toBe(8);
    expect(resultsStore.results!.displacements[0].ux).toBe(18);
    expect(resultsStore.diagramType).toBe('shear');
  });

  it('does nothing when nothing was cleared', () => {
    resultsStore.setResults(R(1));
    resultsStore.diagramType = 'axial';
    resultsStore.restoreView(false);
    expect(resultsStore.diagramType).toBe('axial');
  });
});
