/**
 * The steel tables of the design desk read the factored demands through `membersFor`. With the
 * model's combinations defined and only the load cases solved, there are none, and the demand gate
 * refuses: the tables ask `steelDemandsWithheld` first and say why instead of throwing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { publishCombinations3D } from '../active-results';
import { membersFor, steelDemandsWithheld } from '../steel-optimise.svelte';
import { IncompleteConcurrentDemandError } from '../../engine/complete-demand-set';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('steel demands with the combinations not solved', () => {
  it('are withheld with the reason, and read once the combinations are solved', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('3d-portal-frame');
    expect(modelStore.model.combinations.length).toBeGreaterThan(0);
    const ids = [...modelStore.elements.keys()];
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    expect(steelDemandsWithheld()).toBe('design.error.combinationsUnsolved');
    expect(() => membersFor(ids)).toThrow(IncompleteConcurrentDemandError);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    expect(steelDemandsWithheld()).toBeNull();
    expect(membersFor(ids).members.length).toBeGreaterThan(0);
  }, 120000);
});
