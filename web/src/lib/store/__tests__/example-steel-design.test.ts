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

describe('proposals belong to the project they were made on', () => {
  it('are dropped when another project opens, and Apply writes nothing then', async () => {
    await PRO_EXAMPLES.find((e) => e.id === 'pipe-rack')!.load();
    const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D([...r.perCase.values()][0]!);
    publishCombinations3D(r);
    steelOptimise.run('section');
    const keys = steelOptimise.rows.map((row) => row.key);
    expect(keys.length).toBeGreaterThan(0);
    await PRO_EXAMPLES.find((e) => e.id === 'pro-simple-shed')!.load();
    const before = JSON.stringify([...modelStore.sections.values()]);
    expect(steelOptimise.rows).toEqual([]);
    steelOptimise.apply(keys);
    expect(JSON.stringify([...modelStore.sections.values()])).toBe(before);
    expect(steelOptimise.applied).toEqual([]);
  });
});

describe('what the optimiser checks', () => {
  it('leaves aluminium members out, and says how many', async () => {
    await PRO_EXAMPLES.find((e) => e.id === 'pipe-rack')!.load();
    const [first] = [...modelStore.materials.values()];
    modelStore.updateMaterial(first!.id, { gradeId: 'alu-5083-h116', fy: 215 } as never);
    const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D([...r.perCase.values()][0]!);
    publishCombinations3D(r);
    steelOptimise.run('member');
    const aluMembers = [...modelStore.elements.values()].filter((e) => e.materialId === first!.id).map((e) => e.id);
    expect(aluMembers.length).toBeGreaterThan(0);
    expect(steelOptimise.rows.some((row) => row.elementIds.some((id) => aluMembers.includes(id)))).toBe(false);
    expect(steelOptimise.outOfScope).toBe(aluMembers.length);
  });
});
