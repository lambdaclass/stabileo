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

  it.each([1e6, 1e12, 1e15])('an unrelated supported member %s times stiffer leaves a flexible cantilever its own k', (ratio) => {
    tipCantilever(1, 'fixed');
    const ref = sdofFromModel(modelStore.model, [{ nodeId: 2, m: 1 }], 2, 'uz');
    if (typeof ref === 'string') throw new Error(ref);
    const mat = modelStore.model.materials.get(1)!;
    modelStore.batch(() => {
      const stiff = modelStore.addMaterial({ ...mat, name: 'stiff', e: mat.e * ratio });
      const c = modelStore.addNode(0, 5), d = modelStore.addNode(3, 5);
      const el = modelStore.addElement(c, d);
      modelStore.updateElement(el, { materialId: stiff });
      modelStore.addSupport(c, 'fixed');
    });
    const r = sdofFromModel(modelStore.model, [{ nodeId: 2, m: 1 }], 2, 'uz');
    if (typeof r === 'string') throw new Error(r);
    expect(r.k / ref.k).toBeCloseTo(1, 9);
  });

  it('a node whose two directions differ in stiffness by far more than 1e12 keeps both', () => {
    tipCantilever(1e-9, 'fixed');
    const ref = sdofFromModel(modelStore.model, [{ nodeId: 2, m: 1 }], 2, 'uz');
    if (typeof ref === 'string') throw new Error(ref);
    const s = modelStore.addSupport(2, 'spring');
    modelStore.updateSupport(s, { kx: 1e13, ky: 0, kz: 0 });
    const z = sdofFromModel(modelStore.model, [{ nodeId: 2, m: 1 }], 2, 'uz');
    const x = sdofFromModel(modelStore.model, [{ nodeId: 2, m: 1 }], 2, 'ux');
    if (typeof z === 'string') throw new Error(z);
    if (typeof x === 'string') throw new Error(x);
    expect(x.k / z.k).toBeGreaterThan(1e12);
    expect(z.k / ref.k).toBeCloseTo(1, 9);
    expect(x.k / 1e13).toBeCloseTo(1, 6);
  });
});

describe('the single degree of freedom from a model holds only the mass at its node', () => {
  function twoSpans() {
    uiStore.analysisMode = '2d';
    historyStore.clear();
    modelStore.clear();
    let ids: number[] = [];
    modelStore.batch(() => {
      ids = [0, 1.5, 3].map((x) => modelStore.addNode(x, 0));
      modelStore.addElement(ids[0], ids[1]);
      modelStore.addElement(ids[1], ids[2]);
      modelStore.addSupport(ids[0], 'fixed');
    });
    return ids;
  }

  it('refuses a cantilever with masses at the middle node and at the tip', () => {
    const [, mid, tip] = twoSpans();
    expect(sdofFromModel(modelStore.model, [{ nodeId: mid, m: 2 }, { nodeId: tip, m: 1 }], tip, 'uz')).toBe('otherMasses');
    expect(sdofFromModel(modelStore.model, [{ nodeId: mid, m: 2 }, { nodeId: tip, m: 1 }], mid, 'uz')).toBe('otherMasses');
  });

  it('refuses a rotational inertia that would turn with the node', () => {
    const [, , tip] = twoSpans();
    expect(sdofFromModel(modelStore.model, [{ nodeId: tip, m: 1, izz: 0.5 }], tip, 'uz')).toBe('otherMasses');
  });

  it('a mass on the fixed support does not move and is no reason to refuse', () => {
    const [base, , tip] = twoSpans();
    const alone = sdofFromModel(modelStore.model, [{ nodeId: tip, m: 1 }], tip, 'uz');
    const withBase = sdofFromModel(modelStore.model, [{ nodeId: base, m: 7, izz: 3 }, { nodeId: tip, m: 1 }], tip, 'uz');
    if (typeof alone === 'string') throw new Error(alone);
    expect(withBase).toEqual(alone);
  });
});

