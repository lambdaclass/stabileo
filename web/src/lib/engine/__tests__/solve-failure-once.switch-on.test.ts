import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as wasmSolver from '../wasm-solver';
import { historyStore, modelStore, resultsStore, uiStore } from '../../store';
import { createPlate } from '../../store/physical-plates';
import { meshBeforeAnalysis } from '../../store/mesh-policy.svelte';
import { solveProgress } from '../../store/solve-progress.svelte';
import { runGlobalSolve } from '../live-calc';

beforeAll(async () => { await wasmSolver.initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
  for (const t of [...uiStore.toasts]) uiStore.dismissToast(t.id);
  solveProgress.dismiss();
});

describe('toasts that say the same', () => {
  it('stand once, the latest last, keeping an action the earlier one offered', () => {
    uiStore.toast('same', 'error', 'kinematic');
    uiStore.toast('other', 'info');
    uiStore.toast('same', 'error');
    expect(uiStore.toasts.map((t) => [t.message, t.actionId])).toEqual([['other', undefined], ['same', 'kinematic']]);
  });

  it('are taken back by what a card says in their place, unless they offer an action', () => {
    uiStore.toast('stop', 'error');
    uiStore.toast('stop', 'info', 'split-at-nodes');
    uiStore.dismissToastsSaying('stop');
    expect(uiStore.toasts.map((t) => t.actionId)).toEqual(['split-at-nodes']);
  });
});

describe('a solve that stops', () => {
  it('says why once, on the progress card, with no toast saying it again and no action that does not fix it', async () => {
    const n = [modelStore.addNode(0, 0, 3), modelStore.addNode(4, 0, 3), modelStore.addNode(4, 3, 3), modelStore.addNode(0, 3, 3)];
    for (const id of n) modelStore.addSupport(id, 'fixed');
    createPlate({ outline: n, materialId: 1, thickness: 0.15 });
    meshBeforeAnalysis.value = false;
    const o = await runGlobalSolve();
    expect(o.ok).toBe(false);
    const error = (o as { error: string }).error;
    expect(solveProgress.now?.phase).toBe('failed');
    expect(solveProgress.now?.error).toBe(error);
    expect(uiStore.toasts.filter((t) => t.message === error)).toEqual([]);
    expect(uiStore.toasts.some((t) => t.actionId === 'split-at-nodes')).toBe(false);
  });
});
