import { describe, it, expect, beforeAll } from 'vitest';
import * as wasm from '../../wasm-solver';
import type { ElementForces, SolverInput } from '../../types';
import { teachingPDelta, toAnalysisResults } from '../pdelta';
import { teachingBuckling } from '../buckling';
import { refineInput, collapseResults } from '../refine';
import { computeDiagramValueAt } from '../../diagrams';
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

  it('a fixed-fixed column of one element: φ gives its higher modes, each internal, with no nodal shape drawn', () => {
    const b = teachingBuckling(column('fixed', 'guided', L, P), { method: 'phi', axialRigid: false }, 3);
    if (!b.ok) throw new Error(b.reason.key);
    expect(b.run.modes.length).toBe(3);
    [2 * Math.PI, 8.986818916, 4 * Math.PI].forEach((kL, i) => {
      const m = b.run.modes[i];
      expect(m.lambda / ((kL * kL * EI) / (L * L) / P)).toBeCloseTo(1, 6);
      expect(m.internal).toBe(true);
      expect(m.D.every((v) => v === 0)).toBe(true);
    });
  });

  it('a pinned-pinned column: its mode is a nodal one, drawn', () => {
    const b = teachingBuckling(column('pinned', 'rollerZ', L, P), { method: 'phi', axialRigid: false }, 1);
    if (!b.ok) throw new Error(b.reason.key);
    expect(b.run.modes[0].internal).toBeUndefined();
    expect(Math.max(...b.run.modes[0].D.map(Math.abs))).toBeCloseTo(1, 9);
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
      expect(eng.length).toBeGreaterThan(0);
      expect(b.run.modes.length).toBe(Math.min(4, eng.length));
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

describe('a load along a member', () => {
  it('a cantilever column under its own axial load: N varies by the load along it, as in the engine, and the base carries it all', () => {
    const L = 5, qa = -6;
    const input = column('fixed', null, L, 100, 2);
    input.loads.push({ type: 'axialDistributed', data: { elementId: 1, qI: qa, qJ: qa } });
    const t = teachingPDelta(input, { method: 'consistent', axialRigid: false });
    if (!t.ok) throw new Error(t.reason.key);
    const mine = toAnalysisResults(t.run.sys, input, t.run.final, 'consistent', t.run.final.N).elementForces[0];
    const engRes = wasm.solvePDelta(input).results;
    const eng = engRes.elementForces[0];
    const top = t.run.final.D[t.run.sys.dof(2, 1)];
    expect(top).toBeCloseTo(engRes.displacements.find((d: { nodeId: number }) => d.nodeId === 2).uz, 12);
    expect(Math.abs(top)).toBeGreaterThan(0);
    expect(mine.nStart - mine.nEnd).toBeCloseTo(qa * L, 9);
    for (const key of ['nStart', 'nEnd', 'vStart', 'mStart', 'mEnd'] as const) expect(mine[key]).toBeCloseTo(eng[key], 6);
    expect(mine.distributedLoadsX).toEqual([{ qI: qa, qJ: qa, a: 0, b: L }]);
  });
});

describe('a refined member read back as one', () => {
  it('a pin-ended column under a side load: the collapsed diagram passes through every piece\'s second-order moment', () => {
    const L = 5, w = 4;
    const Pe = (Math.PI ** 2 * EI) / (L * L);
    const input = column('pinned', 'rollerZ', L, 0.5 * Pe);
    input.loads.push({ type: 'distributed', data: { elementId: 1, qI: w, qJ: w } });
    const r = refineInput(input, 8);
    const eng = wasm.solvePDelta(r.input);
    const ef = collapseResults(r, input, eng.results).elementForces[0];
    const pieces = new Map<number, ElementForces>(eng.results.elementForces.map((f: ElementForces) => [f.elementId, f]));
    for (const piece of r.pieces.get(1)!) expect(computeDiagramValueAt('moment', piece.x0 / L, ef)).toBeCloseTo(pieces.get(piece.id)!.mStart, 6);
    expect(computeDiagramValueAt('moment', 1, ef)).toBeCloseTo(ef.mEnd, 6);
    const mid = Math.abs(computeDiagramValueAt('moment', 0.5, ef));
    expect(mid / ((w * L * L) / 8)).toBeGreaterThan(1.8);
  });
});

describe('P-Δ past an internal member mode', () => {
  it('a fixed-guided column above 4π²EI/L² is not reported stable with φ', () => {
    const Pcr = (4 * Math.PI ** 2 * EI) / (5 * 5);
    for (const f of [0.9, 1.2]) {
      const t = teachingPDelta(column('fixed', 'guided', 5, f * Pcr), { method: 'phi', axialRigid: false });
      if (!t.ok) throw new Error(t.reason.key);
      expect(t.run.stable).toBe(f < 1);
    }
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
