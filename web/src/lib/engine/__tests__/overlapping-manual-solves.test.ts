import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runGlobalSolve, runLiveCalc } from '../live-calc';
import { solveSteps } from '../solve-steps';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { solveProgress } from '../../store/solve-progress.svelte';
import * as wasm from '../wasm-solver';

const fakeCaseResult = () => ({ elementForces: [], reactions: [], displacements: [], solverDiagnostics: [] }) as any;
const fakeComboResult = () => ({
  perCase: new Map([[1, fakeCaseResult()]]),
  perCombo: new Map([[1, fakeCaseResult()]]),
  envelope: {} as any,
});

interface Held { finish: () => void; report: ReturnType<typeof solveSteps> }

describe('overlapping manual solves', () => {
  beforeEach(() => {
    modelStore.clear();
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(5, 0, 0);
    modelStore.addElement(n1, n2, 'frame');
    modelStore.addSupport(n1, 'fixed');
    uiStore.analysisMode = 'pro';
    vi.spyOn(wasm, 'isWasmReady').mockReturnValue(true);
    solveProgress.dismiss();
  });
  afterEach(() => { vi.restoreAllMocks(); uiStore.analysisMode = '2d'; solveProgress.dismiss(); });

  it('only the latest solve reports to the card, and a superseded one never says it failed', async () => {
    const held: Held[] = [];
    const combo = vi.spyOn(modelStore, 'solveCombinations3DParallel').mockImplementation(() => new Promise((resolve) => {
      held.push({ finish: () => resolve(fakeComboResult()), report: solveSteps() });
    }));
    const single = vi.spyOn(modelStore, 'solve3DAsync').mockResolvedValue(fakeCaseResult());

    const first = runGlobalSolve();
    await vi.waitFor(() => expect(held).toHaveLength(1));
    const second = runGlobalSolve();
    await vi.waitFor(() => expect(held).toHaveLength(2));
    expect(solveProgress.now?.phase).toBe('cases');

    await held[0]!.report('combine', 1, 3);
    expect(solveProgress.now?.phase).toBe('cases');

    held[0]!.finish();
    const superseded = await first;
    expect(superseded.ok).toBe(false);
    expect(solveProgress.now?.phase).toBe('cases');
    expect(solveProgress.now?.error).toBeUndefined();

    await runLiveCalc('pro', 'rightHand');
    expect(combo).toHaveBeenCalledTimes(2);
    expect(single).not.toHaveBeenCalled();

    await held[1]!.report('combine', 2, 3);
    expect(solveProgress.now).toMatchObject({ phase: 'combine', done: 2, total: 3 });

    held[1]!.finish();
    expect((await second).ok).toBe(true);
    expect(solveProgress.now?.phase).toBe('done');
  });
});
