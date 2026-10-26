/**
 * One manual solve: Enter, the ribbon, ToolbarResults and the exports reach `runGlobalSolve`, the
 * solve Calcular runs, and take its guard.
 *
 * Enter had a copy of its own (`runSolve3D`) that checked only the model version: an older solve
 * landing after a newer one was published, and a view export after PRO's solve failed solved again
 * (two solves, two error toasts). The guard itself read only the model version, and self-weight
 * switched on clears the results without moving it: a solve in flight published its
 * no-self-weight answer under the switch.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store';
import { initSolver } from '../wasm-solver';
import { runGlobalSolve } from '../live-calc';
import { runSolve, ensureResults } from '../../actions/solve';
import { ensureProResults } from '../../pro/export-results';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); modelStore.setResultScopes(null); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
});
afterEach(() => { vi.restoreAllMocks(); uiStore.analysisMode = '3d'; uiStore.includeSelfWeight = false; });

/** A 6 m × 4 m portal in XZ, fixed feet: 20 kN/m on the beam in D, 15 kN sideways at the top in W. */
function portal() {
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(6, 0, 0);
  const n3 = modelStore.addNode(0, 0, 4), n4 = modelStore.addNode(6, 0, 4);
  modelStore.addElement(n1, n3); const beam = modelStore.addElement(n3, n4); modelStore.addElement(n2, n4);
  for (const n of [n1, n2]) modelStore.addSupport(n, 'fixed3d');
  const D = modelStore.model.loadCases[0]!.id;
  const W = modelStore.addLoadCase('W', 'W');
  modelStore.addDistributedLoad3D(beam, 0, 0, -20, -20, undefined, undefined, D);
  modelStore.addNodalLoad3D(n3, 15, 0, 0, 0, 0, 0, W);
  return { n3, D, W };
}

/** A real single solve, told apart by node `n`'s ux. */
function tagged(n: number, ux: number): AnalysisResults3D {
  const r = modelStore.solve3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  const c = structuredClone(r) as AnalysisResults3D;
  c.displacements.find((d) => d.nodeId === n)!.ux = ux;
  return c;
}

const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const shownUx = (n: number) => resultsStore.results3D?.displacements.find((d) => d.nodeId === n)?.ux;

describe('Enter and the exports solve through the guarded entry point', () => {
  it('Enter: an older solve landing after a newer one is discarded', async () => {
    const { n3 } = portal();
    const older = tagged(n3, 111), newer = tagged(n3, 222);
    const d1 = deferred<AnalysisResults3D>(), d2 = deferred<AnalysisResults3D>();
    const solve = vi.spyOn(modelStore, 'solve3DAsync').mockReturnValueOnce(d1.promise as never).mockReturnValueOnce(d2.promise as never);
    runSolve(); await flush();
    runSolve(); await flush();
    expect(solve).toHaveBeenCalledTimes(2);
    d2.resolve(newer); await flush();
    expect(shownUx(n3)).toBe(222);
    d1.resolve(older); await flush();
    expect(shownUx(n3)).toBe(222);
  });

  it('a view export after PRO\'s solve failed does not solve again', async () => {
    portal();
    const solve = vi.spyOn(modelStore, 'solve3DAsync').mockResolvedValue('mechanism' as never);
    const toast = vi.spyOn(uiStore, 'toast');
    await ensureProResults();               // ProViewExportDialog, before drawing
    const o = await ensureResults();        // view-export.ts `drawable`
    expect(o.ok).toBe(false);
    expect(solve).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls.filter((c) => c[1] === 'error')).toHaveLength(1);
  });

  it('Enter\'s "All loads" is Calcular\'s', async () => {
    const { n3, D, W } = portal();
    modelStore.addCombination('1.2D+1.6W', [{ caseId: D, factor: 1.2 }, { caseId: W, factor: 1.6 }]);
    await runGlobalSolve();
    const calcular = structuredClone(resultsStore.results3D!);
    expect(resultsStore.perCombo3D.size).toBe(1);
    resultsStore.clear3D();
    expect((await ensureResults()).ok).toBe(true);
    expect(resultsStore.perCombo3D.size).toBe(1);
    const enter = resultsStore.results3D!;
    for (const d of calcular.displacements) {
      const e = enter.displacements.find((x) => x.nodeId === d.nodeId)!;
      expect(Math.abs(d.ux - e.ux) + Math.abs(d.uz - e.uz)).toBeLessThan(1e-12);
    }
    expect(Math.abs(calcular.displacements.find((d) => d.nodeId === n3)!.ux)).toBeGreaterThan(0);
  });
});

describe('the guard reads the solve settings, not only the model', () => {
  for (const entry of ['Calcular', 'Enter'] as const) {
    it(`${entry}: a solve in flight when self-weight is switched on is discarded`, async () => {
      uiStore.analysisMode = '3d';
      const { n3 } = portal();
      const without = tagged(n3, 333);
      const d = deferred<AnalysisResults3D>();
      vi.spyOn(modelStore, 'solve3DAsync').mockReturnValueOnce(d.promise as never);
      const version = modelStore.modelVersion;
      const p = entry === 'Calcular' ? runGlobalSolve() : ensureResults();
      await flush();
      // App.svelte clears the results on this; the model version does not move.
      uiStore.includeSelfWeight = true;
      resultsStore.clear3D();
      d.resolve(without); await p;
      expect(modelStore.modelVersion).toBe(version);
      expect(resultsStore.results3D).toBeNull();
    });
  }
});
