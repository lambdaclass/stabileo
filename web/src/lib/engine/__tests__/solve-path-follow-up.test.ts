/**
 * The manual solve's guarantees #588 left open: the combination path refuses NaN displacements as
 * the single solve does, every manual solve cancels the pending live calc, and the fallback's
 * message reports failure even when an independent single solve stands.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store';
import { initSolver } from '../wasm-solver';
import { runLiveCalc, registerLiveCalcCanceller } from '../live-calc';
import { ensureResults } from '../../actions/solve';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); modelStore.setResultScopes(null); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.includeSelfWeight = false;
  // Basic 3D solves its combinations once load cases are on.
  uiStore.loadCasesEnabled = true;
});
afterEach(() => { vi.restoreAllMocks(); registerLiveCalcCanceller(null); uiStore.analysisMode = '3d'; uiStore.loadCasesEnabled = false; });

/** A portal with a dead load, a wind case and one combination of them. */
function portal() {
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(6, 0, 0);
  const n3 = modelStore.addNode(0, 0, 4), n4 = modelStore.addNode(6, 0, 4);
  modelStore.addElement(n1, n3); const beam = modelStore.addElement(n3, n4); modelStore.addElement(n2, n4);
  for (const n of [n1, n2]) modelStore.addSupport(n, 'fixed3d');
  const D = modelStore.model.loadCases[0]!.id;
  const W = modelStore.addLoadCase('W', 'W');
  modelStore.addDistributedLoad3D(beam, 0, 0, -20, -20, undefined, undefined, D);
  modelStore.addNodalLoad3D(n3, 15, 0, 0, 0, 0, 0, W);
  modelStore.addCombination('1.2D+1.6W', [{ caseId: D, factor: 1.2 }, { caseId: W, factor: 1.6 }]);
  return { n3 };
}

describe('NaN displacements with combinations defined', () => {
  for (const mode of ['pro', '3d'] as const) {
    it(`${mode}: the manual solve publishes nothing`, async () => {
      uiStore.analysisMode = mode;
      const { n3 } = portal();
      const good = modelStore.solve3D(false, false, mode === 'pro') as AnalysisResults3D;
      const bad = structuredClone(good);
      bad.displacements.find((d) => d.nodeId === n3)!.ux = NaN;
      vi.spyOn(modelStore, 'solve3DAsync').mockResolvedValue(bad as never);
      const outcome = await ensureResults();
      expect(outcome.ok).toBe(false);
      expect(resultsStore.results3D).toBeNull();
      expect(resultsStore.perCombo3D.size).toBe(0);
    });
  }
});

describe('the pending live calc', () => {
  it('is cancelled by every manual solve, an export included', async () => {
    uiStore.analysisMode = '3d';
    portal();
    // App's debounce: a live calc due right after the last edit.
    let fired = false;
    const timer = setTimeout(() => { fired = true; void runLiveCalc('3d', 'rightHand'); }, 0);
    registerLiveCalcCanceller(() => clearTimeout(timer));
    const outcome = await ensureResults();
    await new Promise((r) => setTimeout(r, 5));
    expect(fired).toBe(false);
    expect(outcome.ok).toBe(true);
    expect(resultsStore.perCombo3D.size).toBe(1);
  });
});

describe("the fallback's message", () => {
  it('reports failed combinations while retaining the clean single solve (Basic)', async () => {
    uiStore.analysisMode = '3d';
    portal();
    vi.spyOn(modelStore, 'solveCombinations3DParallel').mockRejectedValue(new Error('worker crashed'));
    const toasts: string[] = [];
    vi.spyOn(uiStore, 'toast').mockImplementation((_message, kind) => { toasts.push(kind ?? 'info'); });
    const outcome = await ensureResults();
    expect(outcome.ok).toBe(false);
    expect(resultsStore.results3D).not.toBeNull();
    expect(resultsStore.perCombo3D.size).toBe(0);
    expect(toasts).toContain('error');
    expect(toasts).not.toContain('success');
  });
});
