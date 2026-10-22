/**
 * "Re-run analysis and design" succeeds only when the analysis the model asks for came back.
 *
 * It reported success, and the project current, when the combinations were refused (an empty
 * active list) or their solve threw: `runGlobalSolve` fell back to the single solve and said
 * nothing of what it left out, and design had no combinations to read.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { rerunAnalysisAndDesign } from '../recheck';
import { recheckStore } from '../../store/recheck.svelte';
import { RESULTS_VERSION } from '../../provenance/registry';
import { tp } from '../../i18n';

const STEEL = { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 };
/** What was opened: a project with no stamp, so solved with an older version. */
const olderProject = () => ({
  analysisMode: 'pro',
  materials: [[1, STEEL]],
  elements: [[1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
  supports: [[1, { nodeId: 1, type: 'pinned3d' }]],
  loads: [],
  loadCases: [{ id: 1, type: 'D' }],
}) as never;

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); modelStore.setResultScopes(null); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
  recheckStore.reset();
});
afterEach(() => { vi.restoreAllMocks(); uiStore.analysisMode = '3d'; recheckStore.reset(); });

/** A portal in XZ with D and W, and 1.2D + 1.6W. */
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

describe('rerunAnalysisAndDesign', () => {
  it('succeeds with the combinations solved, and ends the stale state', async () => {
    portal();
    recheckStore.openProject(olderProject(), 'pro');
    const r = await rerunAnalysisAndDesign();
    expect(r.ok).toBe(true);
    expect(resultsStore.perCombo3D.size).toBe(1);
    expect(recheckStore.stale).toBe(false);
  });

  it('fails, and stays stale, when the combinations were refused', async () => {
    portal();
    modelStore.setResultScopes({ active: [] } as never);
    recheckStore.openProject(olderProject(), 'pro');
    const toast = vi.spyOn(uiStore, 'toast');
    const r = await rerunAnalysisAndDesign();
    expect(r.ok).toBe(false);
    expect(recheckStore.stale).toBe(true);
    // The single solve that stood in says it solved; the re-run does not say it is done.
    expect(toast.mock.calls.map((c) => c[0])).not.toContain(tp('recheck.rerunDone', { v: RESULTS_VERSION }));
    expect(toast.mock.calls.some((c) => c[1] === 'error')).toBe(true);
  });

  it('fails, and stays stale, when the combination solve threw', async () => {
    portal();
    vi.spyOn(modelStore, 'solveCombinations3DParallel').mockRejectedValue(new Error('worker crashed'));
    recheckStore.openProject(olderProject(), 'pro');
    const r = await rerunAnalysisAndDesign();
    expect(r.ok).toBe(false);
    expect(r.error).toContain('worker crashed');
    expect(recheckStore.stale).toBe(true);
  });
});
