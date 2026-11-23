import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as wasmSolver from '../wasm-solver';
import * as pool from '../solver-pool';
import { onSolveStep } from '../solve-steps';
import { historyStore, modelStore, uiStore } from '../../store';

beforeAll(async () => { await wasmSolver.initSolver(); });
afterEach(() => { onSolveStep(null); vi.restoreAllMocks(); });

describe('the progress of a parallel solve with shells', () => {
  it('counts the cases\' shell stresses and the combinations up to their totals', async () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 } as never);
    const n = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0)) as [number, number, number, number];
    for (const id of n) modelStore.addSupport(id, 'pinned3d');
    const q = modelStore.addQuad(n, conc, 0.2);
    const dead = modelStore.model.loadCases[0]!.id;
    const live = modelStore.addLoadCase('Live', 'L');
    modelStore.addSurfaceLoad3D(q, -2, dead);
    modelStore.addSurfaceLoad3D(q, -3, live);
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    modelStore.addCombination('1.4D', [{ caseId: dead, factor: 1.4 }]);
    modelStore.addCombination('1.2D+1.6L', [{ caseId: dead, factor: 1.2 }, { caseId: live, factor: 1.6 }]);
    modelStore.addCombination('D+L', [{ caseId: dead, factor: 1 }, { caseId: live, factor: 1 }]);

    const sequential = modelStore.solveCombinations3D(false, false, true);
    expect(typeof sequential, String(sequential)).toBe('object');
    const perCase = (sequential as { perCase: Map<number, unknown> }).perCase;
    vi.spyOn(pool, 'isPoolReady').mockReturnValue(true);
    vi.spyOn(pool, 'solveParallel').mockResolvedValue(perCase as never);

    const told: Record<string, Array<[number, number]>> = {};
    onSolveStep((step, done, total) => { (told[step] ??= []).push([done, total]); });
    const r = await modelStore.solveCombinations3DParallel(false, false, true);
    expect(typeof r, String(r)).toBe('object');
    const upTo = (n: number) => Array.from({ length: n + 1 }, (_, k) => [k, n]);
    expect(told.shells!.length).toBeGreaterThan(2);
    expect(told.shells).toEqual(upTo(told.shells![0]![1]));
    expect(told.combine).toEqual(upTo(3));
  });
});
