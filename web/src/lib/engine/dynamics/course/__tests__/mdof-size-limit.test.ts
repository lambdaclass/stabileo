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

function rollerBeam(angle: number) {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  modelStore.clear();
  let b = 0;
  modelStore.batch(() => {
    const a = modelStore.addNode(0, 0);
    b = modelStore.addNode(4, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(b, 'rollerX', undefined, { angle });
  });
  const s = modelSystem(modelStore.model, [{ nodeId: b, m: 2, horizontalOnly: true }], { nPerMember: 1, massModel: 'lumped', barMass: false });
  return { s, omega: modalSolve(s.K, s.M, s.dofs, s.ground).modes.map((q) => q.omega) };
}

describe('a horizontal-only point mass on an inclined roller', () => {
  it.each([30, 60, 135])('keeps one massive translation along the surface at %i°, with the axial frequency of the horizontal roller', (deg) => {
    const ref = rollerBeam(0).omega;
    expect(ref).toHaveLength(1);
    const { s, omega } = rollerBeam(deg);
    expect(s.dofs.some((d) => (d.angle ?? 0) !== 0)).toBe(deg !== 0);
    expect(s.dofs.filter((d) => d.dir !== 'ry')).toHaveLength(1);
    expect(omega).toHaveLength(1);
    expect(omega[0] / ref[0]).toBeCloseTo(1, 8);
  });
});

describe('a rotational inertia at a node', () => {
  it('goes on the rotation diagonal, and changing only it changes the frequencies as det(K − ω²M) = 0 says', () => {
    cantilever();
    const opts = { nPerMember: 1, massModel: 'lumped' as const, barMass: false };
    const bare = modelSystem(modelStore.model, [{ nodeId: 2, m: 2 }], opts);
    const spun = modelSystem(modelStore.model, [{ nodeId: 2, m: 2, izz: 0.7 }], opts);
    const iz = spun.fullDofs.findIndex((d) => d.nodeId === 2 && d.dir === 'uz');
    const ir = spun.fullDofs.findIndex((d) => d.nodeId === 2 && d.dir === 'ry');
    expect(spun.fullM[ir][ir]).toBeCloseTo(0.7, 12);
    expect(bare.dofs.some((d) => d.dir === 'ry')).toBe(false);
    expect(spun.dofs.some((d) => d.dir === 'ry')).toBe(true);
    const K = spun.fullK;
    const kzz = K[iz][iz], kzr = K[iz][ir], krr = K[ir][ir];
    const a = 2 * 0.7, b = -(kzz * 0.7 + krr * 2), c = kzz * krr - kzr * kzr;
    const w2 = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    const omega = (s: typeof spun) => modalSolve(s.K, s.M, s.dofs, s.ground).modes.map((q) => q.omega);
    const bending = omega(spun).filter((w) => Math.abs(w * w - w2) / w2 < 1e-9);
    expect(bending).toHaveLength(1);
    const w0 = Math.sqrt((kzz - (kzr * kzr) / krr) / 2);
    expect(Math.min(...omega(bare).map((w) => Math.abs(w - w0) / w0))).toBeLessThan(1e-9);
    expect(Math.sqrt(w2)).toBeLessThan(w0 * (1 - 1e-3));
  });
});
