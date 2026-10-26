/**
 * Footings, slab joints and steel joints never design over the unfactored solve when the model's
 * combinations are defined and not solved.
 *
 * Live calc re-solves only "All loads" while the single view is on screen (`engine/live-calc.ts`,
 * for a large model's sake), so after one edit `perCombo3D` is empty while 1.2D + 1.6W is still
 * defined. The footing then read "Active result set (no combination solved)" and the joint one
 * set with no combination: both designed for D + W at factor 1.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import { resultsStore } from '../results.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D, combinationsUnsolved } from '../active-results';
import { collectFootingReactions } from '../detailing-footing-inputs';
import { jointDesignStore } from '../joint-design.svelte';
import { runLiveCalc } from '../../engine/live-calc';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); modelStore.setResultScopes(null); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A 6 m × 4 m portal in XZ, fixed feet, a footing under one: 20 kN/m on the beam in D, 15 kN sideways in W; 1.2D + 1.6W. */
function portal() {
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(6, 0, 0);
  const n3 = modelStore.addNode(0, 0, 4), n4 = modelStore.addNode(6, 0, 4);
  const c1 = modelStore.addElement(n1, n3), beam = modelStore.addElement(n3, n4); modelStore.addElement(n2, n4);
  for (const n of [n1, n2]) modelStore.addSupport(n, 'fixed3d');
  const D = modelStore.model.loadCases[0]!.id;
  const W = modelStore.addLoadCase('W', 'W');
  modelStore.addDistributedLoad3D(beam, 0, 0, -20, -20, undefined, undefined, D);
  modelStore.addNodalLoad3D(n3, 15, 0, 0, 0, 0, 0, W);
  const combo = modelStore.addCombination('1.2D + 1.6W', [{ caseId: D, factor: 1.2 }, { caseId: W, factor: 1.6 }]);
  modelStore.addFooting(n1, 'Z1');
  return { n1, n3, c1, beam, D, combo };
}

/** The full solve Calcular runs: All loads, then the combinations; the single view on screen. */
function solveAll() {
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const b = modelStore.solveCombinations3D(false, false, true);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
  resultsStore.activeView = 'single';
}

describe('design inputs after a live calc that left the combinations out', () => {
  it('reads the combinations after a full solve', () => {
    const { n1, n3, c1, beam, combo } = portal();
    solveAll();
    expect(collectFootingReactions().get(n1)!.factored.map((f) => f.combinationId)).toEqual([combo]);
    expect(jointDesignStore.designFor(n3, [c1, beam]).demands.axial?.comboId).toBe(combo);
    expect(combinationsUnsolved()).toBe(false);
  });

  it('footings and joints refuse, with the reason, rather than design over the unfactored solve', async () => {
    const { n1, n3, c1, beam, D } = portal();
    solveAll();
    // An edit, and live calc re-solves "All loads" only.
    modelStore.addNodalLoad3D(n3, 0, 0, -1, 0, 0, 0, D);
    await runLiveCalc('pro', 'rightHand');
    expect(resultsStore.results3D).not.toBeNull();
    expect(resultsStore.perCombo3D.size).toBe(0);

    expect(collectFootingReactions().get(n1)).toBeUndefined();
    expect(jointDesignStore.designFor(n3, [c1, beam]).demands.combinationsConsidered).toBe(0);
    // The reason the floor and joint panels give.
    expect(combinationsUnsolved()).toBe(true);
  });

  it('a model with no combinations still designs over its one solve', async () => {
    const { n1, n3, c1, beam, combo } = portal();
    modelStore.removeCombination(combo);
    await runLiveCalc('pro', 'rightHand');
    expect(collectFootingReactions().get(n1)!.factored.map((f) => f.combinationId)).toEqual([0]);
    expect(jointDesignStore.designFor(n3, [c1, beam]).demands.combinationsConsidered).toBe(1);
    expect(combinationsUnsolved()).toBe(false);
  });
});
