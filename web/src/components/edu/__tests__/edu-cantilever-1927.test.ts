import { afterEach, expect, it, vi } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../../lib/store';
import { solveBuckling, solvePDelta } from '../../../lib/engine/wasm-solver';
import { eduStore } from '../edu-store.svelte';
import { solveForEdu } from '../edu-solver';

afterEach(() => {
  eduStore.clearExercise();
  resultsStore.clear();
  modelStore.clear();
  uiStore.analysisMode = '2d';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.skip('known wrong result: #1927 — a loaded educational cantilever loses its grade when the tangent becomes unstable', () => {
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  const toast = vi.spyOn(uiStore, 'toast');
  modelStore.clear();
  uiStore.analysisMode = 'edu';
  uiStore.includeSelfWeight = false;
  eduStore.loadExercise({ id: 'column', solverType: 'pdelta' } as never);
  const root = modelStore.addNode(0, 0);
  const tip = modelStore.addNode(0, 4);
  modelStore.addElement(root, tip);
  modelStore.addSupport(root, 'fixed');
  const unit = modelStore.addNodalLoad(tip, 0, -1);
  const critical = solveBuckling(modelStore.buildSolverInput(false)!, 1).modes[0]!.loadFactor;
  modelStore.removeLoad(unit);
  for (const [scale, stable] of [[0.5, true], [0.995, false], [1.5, false], [0.5, true]] as const) {
    const load = modelStore.addNodalLoad(tip, 0.001, -scale * critical);
    const reference = solvePDelta(modelStore.buildSolverInput(false)!);
    expect(reference.isStable).toBe(stable);
    toast.mockClear();
    solveForEdu();
    if (stable) {
      expect(eduStore.results?.displacements).toEqual(reference.results.displacements);
      expect(resultsStore.results?.reactions).toEqual(reference.results.reactions);
    } else {
      expect.soft(eduStore.results).toBeNull();
      expect.soft(resultsStore.results).toBeNull();
      expect.soft(toast).toHaveBeenCalledWith(expect.any(String), 'error');
    }
    modelStore.removeLoad(load);
  }
});
