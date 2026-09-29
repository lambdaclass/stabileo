/**
 * A steel example from the gallery can be designed as it opens: its steel declares a grade and
 * both strengths, so the check and the optimiser have what they need. It opened with neither, and
 * steel design had nothing to check.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { resultsStore } from '../results.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { steelOptimise } from '../steel-optimise.svelte';
import { PRO_EXAMPLES } from '../../data/pro-examples';

beforeAll(async () => { await initSolver(); uiStore.analysisMode = 'pro'; });

describe.each(['pro-simple-shed', 'pipe-rack'])('%s', (id) => {
  it('is checked by steel design as it opens', async () => {
    await PRO_EXAMPLES.find((e) => e.id === id)!.load();
    const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D([...r.perCase.values()][0]!);
    publishCombinations3D(r);
    steelOptimise.run('section');
    expect(steelOptimise.rows.length).toBeGreaterThan(0);
    // Every section of a family the check covers has a verdict for its current profile (angles
    // are outside the CIRSOC member check's scope, which it says in the panel).
    const covered = steelOptimise.rows.filter((row) => row.family !== 'L');
    expect(covered.length).toBeGreaterThan(0);
    for (const row of covered) expect(row.current, `${id}: ${row.currentName}`).not.toBeNull();
  });
});
