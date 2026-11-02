import { describe, it, expect, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { MAX_SYSTEM_DOFS } from '../mdof-system';
import { sdofFromModel } from '../sdof-model';

const spy = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../../solver-detailed', async (orig) => {
  const mod = await orig<typeof import('../../../solver-detailed')>();
  return { ...mod, solveDetailed: (...a: Parameters<typeof mod.solveDetailed>) => { spy.calls++; return mod.solveDetailed(...a); } };
});

function chain(nodes: number) {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  modelStore.clear();
  modelStore.batch(() => {
    const ids = Array.from({ length: nodes }, (_, i) => modelStore.addNode(i, 0));
    for (let i = 1; i < nodes; i++) modelStore.addElement(ids[i - 1], ids[i]);
    modelStore.addSupport(ids[0], 'fixed');
  });
}

describe('the model-derived single degree of freedom system keeps the teaching size limit', () => {
  it('refuses a model over the limit before any solve', () => {
    chain(Math.floor(MAX_SYSTEM_DOFS / 3) + 2);
    spy.calls = 0;
    expect(sdofFromModel(modelStore.model, [{ nodeId: 2, m: 1 }], 2, 'uz')).toBe('tooBig');
    expect(spy.calls).toBe(0);
  });

  it('solves a model at the limit, once', () => {
    chain(Math.floor(MAX_SYSTEM_DOFS / 3) + 1);
    spy.calls = 0;
    const r = sdofFromModel(modelStore.model, [{ nodeId: 2, m: 1 }], 2, 'uz');
    if (typeof r === 'string') throw new Error(r);
    expect(r.nFree).toBe(MAX_SYSTEM_DOFS);
    expect(spy.calls).toBe(1);
  });
});
