import { describe, it, expect, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { MAX_SYSTEM_DOFS, SystemError, modelSystem } from '../mdof-system';
import { modalSolve } from '../modal-decomposition';

const spy = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../../solver-detailed', async (orig) => {
  const mod = await orig<typeof import('../../../solver-detailed')>();
  return { ...mod, solveDetailed: (...a: Parameters<typeof mod.solveDetailed>) => { spy.calls++; return mod.solveDetailed(...a); } };
});

function cantilever() {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  modelStore.clear();
  modelStore.batch(() => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(3, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed');
  });
}

describe('the size limit of the teaching modal system', () => {
  it('refuses a model over the limit before any dense solve, with the exact count', () => {
    cantilever();
    spy.calls = 0;
    let err: unknown = null;
    try { modelSystem(modelStore.model, [{ nodeId: 2, m: 1 }], { nPerMember: 40, massModel: 'lumped', barMass: false }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(SystemError);
    expect((err as SystemError).code).toBe('tooBig');
    expect((err as SystemError).params).toEqual({ n: 120, max: MAX_SYSTEM_DOFS });
    expect(spy.calls).toBe(0);
  });

  it('solves a model under the limit, through the same solve', () => {
    cantilever();
    spy.calls = 0;
    const s = modelSystem(modelStore.model, [{ nodeId: 2, m: 1 }], { nPerMember: 4, massModel: 'lumped', barMass: false });
    expect(s.dofs.length).toBeGreaterThan(0);
    expect(spy.calls).toBe(1);
  });
});

describe('massless degrees of freedom are judged by their own masses', () => {
  it('a 1 t oscillator next to a 1e13 t one keeps its modes', () => {
    uiStore.analysisMode = '2d';
    historyStore.clear();
    modelStore.clear();
    modelStore.batch(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3);
      const c = modelStore.addNode(5, 0), d = modelStore.addNode(5, 3);
      modelStore.addElement(a, b);
      modelStore.addElement(c, d);
      modelStore.addSupport(a, 'fixed');
      modelStore.addSupport(c, 'fixed');
    });
    const s = modelSystem(modelStore.model, [{ nodeId: 2, m: 1e13 }, { nodeId: 4, m: 1 }], { nPerMember: 1, massModel: 'lumped', barMass: false });
    const heavy = s.dofs.filter((d) => d.nodeId === 2).map((d) => d.dir).sort();
    const light = s.dofs.filter((d) => d.nodeId === 4).map((d) => d.dir).sort();
    expect(heavy).toEqual(['ux', 'uz']);
    expect(light).toEqual(['ux', 'uz']);
    const sol = modalSolve(s.K, s.M, s.dofs, s.ground);
    const w = sol.modes.map((m) => m.omega).sort((x, y) => x - y);
    expect(w).toHaveLength(4);
    expect(w[2] / w[0]).toBeCloseTo(Math.sqrt(1e13), 0);
    expect((w[2] / w[0]) / Math.sqrt(1e13)).toBeCloseTo(1, 8);
    expect((w[3] / w[1]) / Math.sqrt(1e13)).toBeCloseTo(1, 8);
  });
});
