import { describe, it, expect, beforeAll } from 'vitest';
import * as wasm from '../../wasm-solver';
import type { SolverInput } from '../../types';
import { teachingPDelta, toAnalysisResults } from '../pdelta';
import { teachingBuckling } from '../buckling';
import { refineInput, collapseResults } from '../refine';
import { buildSystem } from '../system';
import { column, portal, scaleArea, EI } from './fixtures';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });

const lambda1 = (input: SolverInput, method: 'consistent' | 'string' | 'phi', n = 1) => {
  const r = refineInput(input, n);
  const b = teachingBuckling(r.input, { method, axialRigid: false }, 1);
  if (!b.ok) throw new Error(b.reason.key);
  return b.run.modes[0].lambda;
};

describe('Euler columns (P = 100 kN, L = 5 m)', () => {
  const L = 5, P = 100;
  const cases: Array<[string, Parameters<typeof column>[0], Parameters<typeof column>[1], number]> = [
    ['pinned-pinned', 'pinned', 'rollerZ', 1],
    ['fixed-free', 'fixed', null, 2],
    ['fixed-pinned', 'fixed', 'rollerZ', 0.69915566],
    ['fixed-fixed', 'fixed', 'guided', 0.5],
  ];
  for (const [name, base, top, K] of cases) {
    const exact = (Math.PI ** 2 * EI) / ((K * L) ** 2) / P;
    it(`${name}: one member with φ gives π²EI/(KL)², K = ${K}`, () => {
      expect(lambda1(column(base, top, L, P), 'phi', 1) / exact).toBeCloseTo(1, 6);
    });
    it(`${name}: the consistent matrix converges to it from above as the member is cut`, () => {
      const errs = [2, 4, 8].map((n) => lambda1(column(base, top, L, P), 'consistent', n) / exact - 1);
      for (const e of errs) expect(e).toBeGreaterThan(-1e-9);
      expect(errs[1]).toBeLessThan(errs[0]);
      expect(errs[2]).toBeLessThan(errs[1]);
      expect(errs[2]).toBeLessThan(1e-3);
    });
  }

  it('one cubic element overestimates the pinned-pinned load by 12/π² − 1 = 21.6 %', () => {
    const exact = (Math.PI ** 2 * EI) / (L * L) / P;
    expect(lambda1(column('pinned', 'rollerZ', L, P), 'consistent', 1) / exact).toBeCloseTo(12 / Math.PI ** 2, 6);
  });

  it('a fixed-fixed column of one element has no free rotation to buckle with, and φ still finds it (Wittrick–Williams count)', () => {
    const b = teachingBuckling(column('fixed', 'guided', L, P), { method: 'consistent', axialRigid: false }, 1);
    const ok = b.ok && b.run.modes.length > 0;
    if (ok) expect(b.run.modes[0].lambda).toBeGreaterThan(1e6);
    expect(lambda1(column('fixed', 'guided', L, P), 'phi', 1)).toBeCloseTo((4 * Math.PI ** 2 * EI) / (L * L) / P, 3);
  });

  it('φ at n = 1 finds the higher modes too: pinned-pinned λ_k = k²·λ₁', () => {
    const b = teachingBuckling(column('pinned', 'rollerZ', L, P), { method: 'phi', axialRigid: false }, 3);
    if (!b.ok) throw new Error(b.reason.key);
    const l = b.run.modes.map((m) => m.lambda / b.run.modes[0].lambda);
    expect(l[1]).toBeCloseTo(4, 5);
    expect(l[2]).toBeCloseTo(9, 5);
  });
});

describe('the teaching solver against the engine at the same discretization', () => {
  const model = () => portal(4, 6, 300, 10, {
    hinged: true,
    extraLoads: [
      { type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } },
      { type: 'pointOnElement', data: { elementId: 1, a: 1.5, p: 3, px: -20 } },
    ],
  });

  for (const n of [1, 2, 4]) {
    it(`P-Δ with the consistent matrix: same iterations, displacements, member forces and reactions (n = ${n})`, () => {
      const input = model();
      const r = refineInput(input, n);
      const eng = wasm.solvePDelta(r.input);
      const t = teachingPDelta(r.input, { method: 'consistent', axialRigid: false });
      if (!t.ok) throw new Error(t.reason.key);
      expect(t.run.iterations).toBe(eng.iterations);
      expect(t.run.converged).toBe(true);
      const mine = toAnalysisResults(t.run.sys, r.input, t.run.final, 'consistent', t.run.final.N);
      const a = collapseResults(r, input, mine), e = collapseResults(r, input, eng.results);
      a.displacements.forEach((d, k) => {
        expect(d.ux).toBeCloseTo(e.displacements[k].ux, 10);
        expect(d.uz).toBeCloseTo(e.displacements[k].uz, 10);
        expect(d.ry).toBeCloseTo(e.displacements[k].ry, 10);
      });
      a.elementForces.forEach((f, k) => {
        const g = e.elementForces[k];
        for (const key of ['nStart', 'nEnd', 'vStart', 'vEnd', 'mStart', 'mEnd'] as const) expect(f[key]).toBeCloseTo(g[key], 6);
      });
      a.reactions.forEach((x, k) => {
        expect(x.rx).toBeCloseTo(e.reactions[k].rx, 6);
        expect(x.rz).toBeCloseTo(e.reactions[k].rz, 6);
        expect(x.my).toBeCloseTo(e.reactions[k].my, 6);
      });
    });

    it(`buckling with the consistent matrix: the engine's factors (n = ${n})`, () => {
      const r = refineInput(model(), n);
      const eng = wasm.solveBuckling(r.input, 4).modes.map((m: { loadFactor: number }) => m.loadFactor);
      const b = teachingBuckling(r.input, { method: 'consistent', axialRigid: false }, 4);
      if (!b.ok) throw new Error(b.reason.key);
      b.run.modes.forEach((m, k) => expect(m.lambda / eng[k]).toBeCloseTo(1, 8));
    });
  }

  it('the first-order solve is the engine\'s, loads along the member included', () => {
    const input = model();
    const eng = wasm.solve(input);
    const t = teachingPDelta(input, { method: 'none', axialRigid: false });
    if (!t.ok) throw new Error(t.reason.key);
    const mine = toAnalysisResults(t.run.sys, input, t.run.linear, 'none', new Map());
    mine.elementForces.forEach((f, k) => {
      expect(f.mStart).toBeCloseTo(eng.elementForces[k].mStart, 8);
      expect(f.nEnd).toBeCloseTo(eng.elementForces[k].nEnd, 8);
      expect(f.distributedLoads).toEqual(eng.elementForces[k].distributedLoads);
      expect(f.pointLoads).toEqual(eng.elementForces[k].pointLoads);
    });
    mine.reactions.forEach((x, k) => expect(x.rx).toBeCloseTo(eng.reactions[k].rx, 8));
  });
});

describe('iterations', () => {
  it('start from the first-order axial forces and shrink the change below the tolerance', () => {
    const input = portal(4, 6, 600, 10);
    const t = teachingPDelta(input, { method: 'phi', axialRigid: false });
    if (!t.ok) throw new Error(t.reason.key);
    const { history, linear } = t.run;
    expect(history.length).toBeGreaterThan(1);
    expect([...history[0].N]).toEqual([...linear.N]);
    for (let k = 1; k < history.length; k++) expect(history[k].change).toBeLessThan(history[k - 1].change);
    expect(history[history.length - 1].change).toBeLessThan(1e-4);
  });

  it('a column past its critical load does not reach a stable equilibrium', () => {
    const Pcr = (Math.PI ** 2 * EI) / (4 * 25);
    const t = teachingPDelta(column('fixed', null, 5, 1.5 * Pcr, 1), { method: 'phi', axialRigid: false });
    if (!t.ok) throw new Error(t.reason.key);
    expect(t.run.converged && t.run.stable).toBe(false);
  });
});

describe('the sway portal: amplification against 1/(1 − P/Pcr)', () => {
  it('the drift grows by 1/(1 − 1/λ₁) within 1 %', () => {
    const input = portal(4, 6, 400, 10, { Ib: 1e-3 });
    const b = teachingBuckling(input, { method: 'phi', axialRigid: true }, 1);
    const lin = teachingPDelta(input, { method: 'none', axialRigid: true });
    const pd = teachingPDelta(input, { method: 'phi', axialRigid: true });
    if (!b.ok || !lin.ok || !pd.ok) throw new Error('refused');
    const sys = pd.run.sys;
    const d1 = lin.run.linear.D[sys.dof(2, 0)], d2 = pd.run.final.D[sys.dof(2, 0)];
    const B2 = 1 / (1 - 1 / b.run.modes[0].lambda);
    expect(d2 / d1 / B2).toBeCloseTo(1, 2);
    expect(b.run.modes[0].lambda).toBeGreaterThan(1.5);
  });

  it('with the chord matrix and rigid members the story is the classical ΣP/(ΣH·L): λ = K_story·h/ΣP', () => {
    const input = portal(4, 6, 400, 10, { Ib: 1e6 });
    const b = teachingBuckling(input, { method: 'string', axialRigid: true }, 1);
    if (!b.ok) throw new Error(b.reason.key);
    const kStory = 2 * (12 * EI) / 4 ** 3;
    expect(b.run.modes[0].lambda).toBeCloseTo((kStory * 4) / 800, 3);
  });
});

describe('axially rigid members', () => {
  it('give what the elastic solve tends to as A grows', () => {
    const input = portal(4, 6, 300, 10, { hinged: true, extraLoads: [{ type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } }] });
    for (const method of ['phi', 'consistent', 'string'] as const) {
      const rigid = teachingPDelta(input, { method, axialRigid: true });
      const big = teachingPDelta(scaleArea(input, 1e6), { method, axialRigid: false });
      if (!rigid.ok || !big.ok) throw new Error('refused');
      const a = toAnalysisResults(rigid.run.sys, input, rigid.run.final, method, rigid.run.final.N);
      const b = toAnalysisResults(big.run.sys, input, big.run.final, method, big.run.final.N);
      a.displacements.forEach((d, k) => expect(d.ux).toBeCloseTo(b.displacements[k].ux, 7));
      a.elementForces.forEach((f, k) => {
        expect(f.nStart).toBeCloseTo(b.elementForces[k].nStart, 3);
        expect(f.mStart).toBeCloseTo(b.elementForces[k].mStart, 3);
      });
    }
  });

  it('reduce the unknowns to the rotations and the sway: 3 for a portal', () => {
    const b = buildSystem(portal(4, 6, 300, 10), { method: 'phi', axialRigid: true });
    if (!b.ok) throw new Error(b.reason.key);
    expect(b.sys.free.length).toBe(6);
    expect(b.sys.rigid!.T[0].length).toBe(3);
  });

  it('refuse a structure whose axial forces equilibrium alone does not give', () => {
    const b = buildSystem(column('fixed', 'fixed', 5, 100), { method: 'phi', axialRigid: true });
    expect(b.ok).toBe(false);
  });
});
