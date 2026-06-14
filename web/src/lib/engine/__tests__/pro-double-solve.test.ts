// PR [10] PART 2 — PRO solve no longer runs a redundant baseline single solve.
//
// Before: globalSolve3D's PRO branch ran a full single-case solve AND then the
// combination solve (which already returns per-case results) — an extra full
// solve every time. After: it runs combinations directly and falls back to a
// single solve ONLY when the combination path fails.
//
// We mock the two solve entry points on modelStore and assert the call FLOW
// (the perf win is "one fewer full solve per PRO combo solve"); we don't need
// the real WASM solver for a call-count test.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { runGlobalSolve } from '../live-calc';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import * as wasm from '../wasm-solver';

const fakeCaseResult = () => ({ elementForces: [], reactions: [], displacements: [], solverDiagnostics: [] }) as any;
const fakeComboResult = () => ({
  perCase: new Map([[1, fakeCaseResult()]]),
  perCombo: new Map([[1, fakeCaseResult()]]),
  envelope: {} as any,
});

describe('PRO solve: no redundant baseline single solve', () => {
  beforeEach(() => {
    // Minimal PRO model with a combination so the combo path is taken.
    modelStore.clear();
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(5, 0, 0);
    modelStore.addElement(n1, n2, 'frame');
    modelStore.addSupport(n1, 'fixed');
    uiStore.analysisMode = 'pro';
    // WASM readiness is irrelevant — the solve entry points are mocked — but
    // globalSolve3D calls ensureWasmReady(); stub it so no real init runs.
    vi.spyOn(wasm, 'isWasmReady').mockReturnValue(true);
  });
  afterEach(() => { vi.restoreAllMocks(); uiStore.analysisMode = '2d'; });

  it('combo success: single solve3D is NOT called; combos run once', async () => {
    const single = vi.spyOn(modelStore, 'solve3D');
    const combo = vi.spyOn(modelStore, 'solveCombinations3DParallel').mockResolvedValue(fakeComboResult());
    await runGlobalSolve();
    expect(combo).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled(); // ← the redundant baseline solve is gone
  });

  it('combo failure: falls back to exactly one single solve3D', async () => {
    const single = vi.spyOn(modelStore, 'solve3D').mockReturnValue(fakeCaseResult());
    const combo = vi.spyOn(modelStore, 'solveCombinations3DParallel').mockResolvedValue('combo error');
    await runGlobalSolve();
    expect(combo).toHaveBeenCalledTimes(1);
    expect(single).toHaveBeenCalledTimes(1); // fallback path preserved
  });
});
