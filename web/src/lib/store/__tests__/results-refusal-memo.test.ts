import { describe, it, expect, vi, beforeEach } from 'vitest';

const scans = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../engine/known-issues', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../engine/known-issues')>();
  return {
    ...actual,
    knownIssueResultDisposition: (r: unknown) => { scans.count += 1; return actual.knownIssueResultDisposition(r); },
  };
});

import { resultsStore } from '../results.svelte';
import type { AnalysisResults3D, FullEnvelope3D } from '../../engine/types-3d';

const refusal = { code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'withheld' };
const result = (refused = false) => ({
  displacements: [], reactions: [], elementForces: [],
  structuredDiagnostics: refused ? [refusal] : [],
}) as unknown as AnalysisResults3D;
const envelope = {} as FullEnvelope3D;

describe('the results store scans a published result for refusals once, not on every read', () => {
  beforeEach(() => { resultsStore.clear(); scans.count = 0; });

  it('reading the per-case and per-combination maps many times scans each result once', () => {
    const pc = new Map([[1, result()], [2, result()]]);
    const pco = new Map([[10, result()], [11, result()], [12, result()]]);
    scans.count = 0;
    resultsStore.setCombinationResults3D(pc, pco, envelope);
    for (let i = 0; i < 500; i++) {
      expect(resultsStore.perCase3D.size).toBe(2);
      expect(resultsStore.perCombo3D.size).toBe(3);
    }
    expect(scans.count).toBeLessThanOrEqual(5);
  });

  it('a refused case still withholds every combination, and a later clean solve is shown', () => {
    resultsStore.setCombinationResults3D(new Map([[1, result(true)], [2, result()]]), new Map([[10, result()]]), envelope);
    expect(resultsStore.perCase3D.size).toBe(0);
    expect(resultsStore.perCombo3D.size).toBe(0);
    expect(resultsStore.perCase3D.size).toBe(0);

    resultsStore.setCombinationResults3D(new Map([[1, result()], [2, result()]]), new Map([[10, result()]]), envelope);
    expect([...resultsStore.perCase3D.keys()]).toEqual([1, 2]);
    expect([...resultsStore.perCombo3D.keys()]).toEqual([10]);
  });

  it('results3D is withheld when refused and shown when the next solve is clean, scanning each once', () => {
    const bad = result(true);
    scans.count = 0;
    resultsStore.setResults3D(bad);
    for (let i = 0; i < 100; i++) expect(resultsStore.results3D).toBeNull();
    expect(scans.count).toBeLessThanOrEqual(1);

    const good = result();
    scans.count = 0;
    resultsStore.setResults3D(good);
    for (let i = 0; i < 100; i++) expect(resultsStore.results3D).not.toBeNull();
    expect(scans.count).toBeLessThanOrEqual(1);
    expect(resultsStore.results3D?.structuredDiagnostics).toEqual([]);
  });
});
