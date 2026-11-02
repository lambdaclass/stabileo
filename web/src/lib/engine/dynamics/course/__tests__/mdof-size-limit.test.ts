import { describe, it, expect, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { MAX_SYSTEM_DOFS, SystemError, modelSystem } from '../mdof-system';

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
