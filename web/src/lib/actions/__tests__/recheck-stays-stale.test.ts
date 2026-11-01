/**
 * A solve asked for the combinations that did not get them leaves the project stale, whoever runs
 * it: the re-check's re-run said so already, and a plain Calcular right after used to end it over
 * the same single solve (#588 review).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { runGlobalSolve } from '../../engine/live-calc';
import { rerunAnalysisAndDesign } from '../recheck';
import { recheckStore } from '../../store/recheck.svelte';

const STEEL = { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 };
const olderProject = () => ({
  analysisMode: 'pro', materials: [[1, STEEL]],
  elements: [[1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
  supports: [[1, { nodeId: 1, type: 'pinned3d' }]], loads: [], loadCases: [{ id: 1, type: 'D' }],
}) as never;

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); modelStore.setResultScopes(null); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false; recheckStore.reset();
});
afterEach(() => { vi.restoreAllMocks(); uiStore.analysisMode = '3d'; recheckStore.reset(); });

function portal() {
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(6, 0, 0);
  const n3 = modelStore.addNode(0, 0, 4), n4 = modelStore.addNode(6, 0, 4);
  modelStore.addElement(n1, n3); const beam = modelStore.addElement(n3, n4); modelStore.addElement(n2, n4);
  for (const n of [n1, n2]) modelStore.addSupport(n, 'fixed3d');
  const D = modelStore.model.loadCases[0]!.id;
  const W = modelStore.addLoadCase('W', 'W');
  modelStore.addDistributedLoad3D(beam, 0, 0, -20, -20, undefined, undefined, D);
  modelStore.addNodalLoad3D(n3, 15, 0, 0, 0, 0, 0, W);
  modelStore.addCombination('1.2D + 1.6W', [{ caseId: D, factor: 1.2 }, { caseId: W, factor: 1.6 }]);
}

describe('a solve that left the combinations out', () => {
  it('leaves the project stale after the re-run, and after a plain Calcular too', async () => {
    portal();
    vi.spyOn(modelStore, 'solveCombinations3DParallel').mockRejectedValue(new Error('worker crashed'));
    recheckStore.openProject(olderProject(), 'pro');
    expect(recheckStore.stale).toBe(true);
    expect((await rerunAnalysisAndDesign()).ok).toBe(false);
    expect(recheckStore.stale).toBe(true);
    const outcome = await runGlobalSolve();
    expect(outcome).toEqual({ ok: false, error: 'worker crashed' });
    expect(recheckStore.stale).toBe(true);
  });

  it('ends the stale state once the combinations are solved', async () => {
    portal();
    recheckStore.openProject(olderProject(), 'pro');
    const outcome = await runGlobalSolve();
    expect(outcome.ok && outcome.combinationsLeftOut === null).toBe(true);
    expect(recheckStore.stale).toBe(false);
  });
});
