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

describe('the single degree of freedom from a model is judged by its own stiffness scale', () => {
  function tipCantilever(eScale: number, support: 'fixed' | 'pinned') {
    uiStore.analysisMode = '2d';
    historyStore.clear();
    modelStore.clear();
    modelStore.batch(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(3, 0);
      modelStore.addElement(a, b);
      modelStore.addSupport(a, support);
    });
    const mat = modelStore.model.materials.get(1)!;
    modelStore.updateMaterial(1, { e: mat.e * eScale });
    return modelStore.model.materials.get(1)!.e;
  }

  it.each([1, 1e-12, 1e-20])('a cantilever with E scaled by %s keeps k = 3EI/L³ and the same ω for the mass scaled alike', (scale) => {
    const ref = (() => { tipCantilever(1, 'fixed'); const r = sdofFromModel(modelStore.model, [{ nodeId: 2, m: 1 }], 2, 'uz'); if (typeof r === 'string') throw new Error(r); return r; })();
    tipCantilever(scale, 'fixed');
    const r = sdofFromModel(modelStore.model, [{ nodeId: 2, m: scale }], 2, 'uz');
    if (typeof r === 'string') throw new Error(r);
    expect(r.k / (ref.k * scale)).toBeCloseTo(1, 9);
    expect(Math.sqrt(r.k / r.m) / Math.sqrt(ref.k / ref.m)).toBeCloseTo(1, 9);
  });

  it.each([1, 1e-12, 1e-20])('a bar pinned at one end with a free tip stays a mechanism with E scaled by %s', (scale) => {
    tipCantilever(scale, 'pinned');
    expect(sdofFromModel(modelStore.model, [{ nodeId: 2, m: 1 }], 2, 'uz')).toBe('mechanism');
  });
});
