import { describe, it, expect, beforeAll } from 'vitest';
import * as wasm from '../../wasm-solver';
import type { ElementForces, SolverInput } from '../../types';
import { teachingPDelta, toAnalysisResults, iteratePDelta, reducedStiffness } from '../pdelta';
import { teachingBuckling, phiBuckling, criticalCount, firstOrderAxial } from '../buckling';
import { refineInput, collapseResults } from '../refine';
import { computeDiagramValueAt } from '../../diagrams';
import { buildSystem, TEACHING_MAX_DOFS } from '../system';
import { runPDelta2D } from '../run-pdelta';
import { runBuckling2D } from '../run-buckling';
import { DEFAULT_SETTINGS } from '../settings';
import { column, clampedColumn, portal, scaleArea, EI, E, I } from './fixtures';

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

  it('a fixed-fixed column of one element has no free rotation to buckle with: the linear matrices refuse, φ still finds it (Wittrick–Williams count)', () => {
    for (const method of ['consistent', 'string'] as const) {
      const b = teachingBuckling(column('fixed', 'guided', L, P), { method, axialRigid: false }, 1);
      expect(b.ok).toBe(false);
      if (!b.ok) expect(b.reason.key).toBe('course.second-order.refuse.noModeRepresented');
    }
    const one = runBuckling2D(column('fixed', 'guided', L, P), { ...DEFAULT_SETTINGS, method: 'consistent', n: 1 });
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.reason.key).toBe('course.second-order.refuse.noModeRepresented');
    const refined = runBuckling2D(column('fixed', 'guided', L, P), { ...DEFAULT_SETTINGS, method: 'consistent', n: 4 });
    if (!refined.ok) throw new Error(refined.reason.key);
    expect(refined.result.modes[0].loadFactor / ((4 * Math.PI ** 2 * EI) / (L * L) / P) - 1).toBeLessThan(1e-2);
    expect(lambda1(column('fixed', 'guided', L, P), 'phi', 1)).toBeCloseTo((4 * Math.PI ** 2 * EI) / (L * L) / P, 3);
  });

  it('past the teaching size the engine path still refuses a mode its cubic elements cannot represent', () => {
    const withChain = (input: SolverInput): SolverInput => {
      const nodes = new Map(input.nodes), elements = new Map(input.elements), supports = new Map(input.supports);
      for (let k = 0; k < 110; k++) nodes.set(1000 + k, { id: 1000 + k, x: 20 + k * 0.5, z: -50 });
      for (let k = 0; k < 109; k++) elements.set(1000 + k, { ...input.elements.get(1)!, id: 1000 + k, nodeI: 1000 + k, nodeJ: 1001 + k });
      supports.set(1000, { id: 1000, nodeId: 1000, type: 'pinned' });
      supports.set(1001, { id: 1001, nodeId: 1109, type: 'rollerX' });
      return { ...input, nodes, elements, supports };
    };
    const big = withChain(column('fixed', 'guided', L, P));
    const sys = buildSystem(big, { method: 'consistent', axialRigid: false }, true);
    expect(sys.ok).toBe(false);
    if (!sys.ok) expect(sys.reason.key).toBe('course.second-order.refuse.tooBig');
    const one = runBuckling2D(big, { ...DEFAULT_SETTINGS, method: 'consistent', n: 1 });
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.reason.key).toBe('course.second-order.refuse.noModeRepresented');
    const pinned = runBuckling2D(withChain(column('pinned', 'rollerZ', L, P)), { ...DEFAULT_SETTINGS, method: 'consistent', n: 1 });
    if (!pinned.ok) throw new Error(pinned.reason.key);
    expect(pinned.result.modes[0].loadFactor / ((Math.PI ** 2 * EI) / (L * L) / P)).toBeCloseTo(12 / Math.PI ** 2, 6);
  });

  it('a pin-ended member that can only shorten: every method calls P-Δ unstable past π²EI/L², stable below it', () => {
    const pinned = (P: number) => {
      const c = column('pinned', 'rollerZ', L, P);
      c.elements.set(1, { ...c.elements.get(1)!, hingeStart: true, hingeEnd: true });
      return c;
    };
    const euler = (Math.PI ** 2 * EI) / (L * L);
    for (const method of ['consistent', 'string', 'phi'] as const) {
      for (const [P, stable] of [[0.9 * euler, true], [1.1 * euler, false]] as const) {
        const r = teachingPDelta(pinned(P), { method, axialRigid: false });
        if (!r.ok) throw new Error(r.reason.key);
        expect(r.run.stable, `${method} at ${P / euler} P_E`).toBe(stable);
      }
    }
  });

  it('the engine path calls P-Δ unstable past a held-ends load its nodes cannot see, and stable below it', () => {
    const held = (4 * Math.PI ** 2 * EI) / (L * L);
    for (const [P, stable] of [[0.9 * held, true], [1.1 * held, false]] as const) {
      const r = runPDelta2D(column('fixed', 'guided', L, P), { ...DEFAULT_SETTINGS, method: 'consistent', n: 1 });
      if (!r.ok) throw new Error(r.reason.key);
      expect(r.result.isStable, `${P / held} of the held-ends load`).toBe(stable);
      if (!stable) expect(Number.isFinite(r.result.b2Factor)).toBe(false);
    }
  });

  it('the engine path calls P-Δ unstable when the second-order forces, not the first-order ones, pass a column\'s held-ends load', () => {
    const h = 4, b = 6, Pe = (Math.PI ** 2 * EI) / (h * h);
    const input = portal(h, b, 0.8 * Pe, (2.7 * Pe * b) / h, { A: 1, Ib: 1000 * I });
    const r = runPDelta2D(input, { ...DEFAULT_SETTINGS, method: 'consistent', n: 1 });
    if (!r.ok) throw new Error(r.reason.key);
    const most = (f: ElementForces[]) => Math.max(...f.map((x) => -Math.min(x.nStart, x.nEnd)));
    expect(most(r.result.linearResults.elementForces)).toBeLessThan(4 * Pe);
    expect(most(r.result.results.elementForces)).toBeGreaterThan(4 * Pe);
    expect(r.result.secondOrder.lambda1 ?? Infinity).toBeGreaterThan(1);
    expect(r.result.isStable).toBe(false);
  });

  it('a fixed-fixed column of one element: φ gives its higher modes, each internal, with no nodal shape drawn', () => {
    const b = teachingBuckling(clampedColumn(L, P), { method: 'phi', axialRigid: false }, 3);
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

describe('span axial integration #1329', () => {
  it.skip('known wrong result: #1329: the teaching cantilever matches independently integrated cubic work', () => {
    const L = 5, P = 100, W = 30, H = 2;
    const input = column('fixed', null, L, P, H);
    input.loads.push({ type: 'axialDistributed', data: { elementId: 1, qI: -W / L, qJ: -W / L } });
    const a = 12 * EI / L ** 3 - (6 * P + 3 * W) / (5 * L);
    const b = -6 * EI / L ** 2 + (P + W) / 10;
    const c = 4 * EI / L - (2 * P / 15 + W / 30) * L;
    const sway = H * c / (a * c - b * b);
    const theta = -H * b / (a * c - b * b);
    const moment = -((-6 * EI / L ** 2 + P / 10) * sway + (2 * EI / L + (P / 30 + W / 60) * L) * theta);
    const t = teachingPDelta(input, { method: 'consistent', axialRigid: false });
    if (!t.ok) throw new Error(t.reason.key);
    const mine = toAnalysisResults(t.run.sys, input, t.run.final, 'consistent', t.run.finalSolvedWith);
    const engine = wasm.solvePDelta(input).results;
    for (const results of [engine, mine]) {
      expect(results.displacements.find((d: { nodeId: number }) => d.nodeId === 2)!.ux).toBeCloseTo(sway, 12);
      expect(results.elementForces[0].mStart).toBeCloseTo(moment, 6);
      expect(results.reactions[0].my).toBeCloseTo(moment, 6);
      expect(results.elementForces[0].mEnd).toBeCloseTo(0, 9);
    }
  });
});

describe('span load shapes #1329', () => {
  for (const shape of ['trapezoidal', 'partial', 'point'] as const) {
    for (const n of [1, 4]) {
      it.skip(`known wrong result: #1329: ${shape} axial load matches engine stiffness and end forces (n = ${n})`, () => {
        const L = 5, P = 100, H = 2, angle = 0.4;
        const c = Math.cos(angle), s = Math.sin(angle);
        const input = column('fixed', null, L, P, H);
        input.nodes.set(2, { id: 2, x: L * c, z: L * s });
        input.loads = [{ type: 'nodal', data: { nodeId: 2, fx: -P * c - H * s, fz: -P * s + H * c, my: 0 } }];
        if (shape === 'point') input.loads.push({ type: 'pointOnElement', data: { elementId: 1, a: 0.3 * L, p: 0, px: -30 } });
        else input.loads.push({ type: 'axialDistributed', data: { elementId: 1, qI: shape === 'partial' ? -6 : 0, qJ: -6, ...(shape === 'partial' ? { a: 0.2 * L, b: 0.7 * L } : {}) } });
        const refined = refineInput(input, n).input;
        const t = teachingPDelta(refined, { method: 'consistent', axialRigid: false });
        if (!t.ok) throw new Error(t.reason.key);
        const mine = toAnalysisResults(t.run.sys, refined, t.run.final, 'consistent', t.run.finalSolvedWith);
        const eng = wasm.solvePDelta(refined).results;
        mine.displacements.forEach((d, k) => {
          for (const key of ['ux', 'uz', 'ry'] as const) expect(d[key]).toBeCloseTo(eng.displacements[k][key], 12);
        });
        mine.elementForces.forEach((f, k) => {
          for (const key of ['nStart', 'nEnd', 'vStart', 'vEnd', 'mStart', 'mEnd'] as const) expect(f[key]).toBeCloseTo(eng.elementForces[k][key], 6);
        });
        mine.reactions.forEach((r, k) => {
          for (const key of ['rx', 'rz', 'my'] as const) expect(r[key]).toBeCloseTo(eng.reactions[k][key], 6);
        });
      });
    }
  }
});

describe('a load along a member', () => {
  it('a cantilever column under its own axial load: N varies by the load along it, as in the engine, and the base carries it all', () => {
    const L = 5, qa = -6;
    const input = column('fixed', null, L, 100, 2);
    input.loads.push({ type: 'axialDistributed', data: { elementId: 1, qI: qa, qJ: qa } });
    const t = teachingPDelta(input, { method: 'consistent', axialRigid: false });
    if (!t.ok) throw new Error(t.reason.key);
    const mine = toAnalysisResults(t.run.sys, input, t.run.final, 'consistent', t.run.finalSolvedWith).elementForces[0];
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

describe('an axial span load alone', () => {
  it('a cantilever column loaded only along its axis is compressed by it: the teaching N and top displacement are the engine\'s', () => {
    const L = 5, qa = -6;
    const input = column('fixed', null, L, 0, 0);
    input.loads = [{ type: 'axialDistributed', data: { elementId: 1, qI: qa, qJ: qa } }];
    const b = buildSystem(input, { method: 'consistent', axialRigid: false });
    if (!b.ok) throw new Error(b.reason.key);
    const first = firstOrderAxial(b.sys);
    if (!first.ok) throw new Error(first.reason.key);
    expect(first.N0.get(1)!).toBeCloseTo((qa * L) / 2, 9);
    const t = teachingPDelta(input, { method: 'consistent', axialRigid: false });
    if (!t.ok) throw new Error(t.reason.key);
    const engRes = wasm.solvePDelta(input).results;
    const top = t.run.final.D[t.run.sys.dof(2, 1)];
    expect(top).toBeLessThan(0);
    expect(top).toBeCloseTo(engRes.displacements.find((d: { nodeId: number }) => d.nodeId === 2).uz, 12);
    const f = toAnalysisResults(t.run.sys, input, t.run.final, 'consistent', t.run.finalSolvedWith).elementForces[0];
    expect(f.nStart).toBeCloseTo(qa * L, 9);
    expect(f.nEnd).toBeCloseTo(0, 9);
  });

  for (const method of ['consistent', 'string', 'phi'] as const) {
    it(`a horizontal cantilever under an axial span load only (${method}): Fnodal holds no load, the span load is applied once, and the engine agrees`, () => {
      const L = 4, qa = -5;
      const input = column('fixed', null, L, 0, 0);
      input.nodes.set(2, { id: 2, x: L, z: 0 });
      input.loads = [{ type: 'axialDistributed', data: { elementId: 1, qI: qa, qJ: qa } }];
      const b = buildSystem(input, { method, axialRigid: false });
      if (!b.ok) throw new Error(b.reason.key);
      expect(b.sys.Fnodal.every((v) => v === 0)).toBe(true);
      expect(b.sys.F[b.sys.dof(2, 0)]).toBeCloseTo(qa * L / 2, 12);
      const t = teachingPDelta(input, { method, axialRigid: false });
      if (!t.ok) throw new Error(t.reason.key);
      const eng = wasm.solvePDelta(input).results;
      const tip = t.run.final.D[t.run.sys.dof(2, 0)];
      expect(tip).toBeCloseTo(eng.displacements.find((d: { nodeId: number }) => d.nodeId === 2).ux, 12);
      expect(tip).toBeCloseTo((qa * L * L) / (2 * 200000 * 1000 * 0.01), 12);
      const f = toAnalysisResults(t.run.sys, input, t.run.final, method, t.run.finalSolvedWith).elementForces[0];
      expect(f.nStart).toBeCloseTo(qa * L, 9);
      expect(f.nEnd).toBeCloseTo(0, 9);
    });
  }
});

describe('forces recovered with the axial forces the last solve used', () => {
  const balance = (sys: ReturnType<typeof iteratePDelta>['sys'], ends: Map<number, number[]>) => {
    const nodal = new Array(sys.nTotal).fill(0);
    for (const m of sys.members) {
      const c = m.c, s = m.s, f = ends.get(m.id)!;
      const ids = [sys.dof(m.i, 0), sys.dof(m.i, 1), sys.dof(m.i, 2), sys.dof(m.j, 0), sys.dof(m.j, 1), sys.dof(m.j, 2)];
      const g = [c * f[0] - s * f[1], s * f[0] + c * f[1], f[2], c * f[3] - s * f[4], s * f[3] + c * f[4], f[5]];
      ids.forEach((d, k) => { nodal[d] += g[k]; });
    }
    return Math.max(...sys.free.map((d) => Math.abs(nodal[d] - sys.Fnodal[d])));
  };
  for (const maxIter of [1, 100]) {
    it(`${maxIter === 1 ? 'stopped after one iteration' : 'converged'}: every free joint balances its loads`, () => {
      const b = buildSystem(portal(4, 6, 1500, 10), { method: 'consistent', axialRigid: false });
      if (!b.ok) throw new Error(b.reason.key);
      const run = iteratePDelta(b.sys, 'consistent', maxIter);
      expect(run.converged).toBe(maxIter !== 1);
      const res = toAnalysisResults(run.sys, portal(4, 6, 1500, 10), run.final, 'consistent', run.finalSolvedWith);
      const ends = new Map(res.elementForces.map((e) => [e.elementId, [-e.nStart, e.vStart, e.mStart, e.nEnd, -e.vEnd, -e.mEnd]]));
      expect(balance(run.sys, ends)).toBeLessThan(1e-8);
    });
  }

  it('the panel\'s results: every free joint balances its loads', () => {
    for (const method of ['phi', 'string'] as const) {
      const pd = runPDelta2D(portal(4, 6, 1500, 10), { ...DEFAULT_SETTINGS, method, n: 1 });
      if (!pd.ok) throw new Error(pd.reason.key);
      const b = buildSystem(portal(4, 6, 1500, 10), { method, axialRigid: false });
      if (!b.ok) throw new Error(b.reason.key);
      const ends = new Map(pd.result.results.elementForces.map((e) => [e.elementId, [-e.nStart, e.vStart, e.mStart, e.nEnd, -e.vEnd, -e.mEnd]]));
      expect(balance(b.sys, ends)).toBeLessThan(1e-8);
    }
  });
});

describe('the size limit', () => {
  it('a chain of 5000 joints is refused with its exact count of unknowns, before any dense matrix', () => {
    const n = 5000;
    const input: SolverInput = {
      nodes: new Map(Array.from({ length: n }, (_, k) => [k + 1, { id: k + 1, x: k, z: 0 }])),
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map(Array.from({ length: n - 1 }, (_, k) => [k + 1, { id: k + 1, type: 'frame' as const, nodeI: k + 1, nodeJ: k + 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }])),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
      loads: [{ type: 'nodal', data: { nodeId: n, fx: -1, fz: 0, my: 0 } }],
    };
    const b = buildSystem(input, { method: 'consistent', axialRigid: false });
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.reason.key).toBe('course.second-order.refuse.tooBig');
      expect(b.reason.params).toEqual({ n: 3 * (n - 1), max: TEACHING_MAX_DOFS });
    }
  });
});

describe('a large model with few unknowns', () => {
  it('3000 fixed joints and one free cantilever tip: solved over its 3 unknowns, the same answer as the cantilever alone', () => {
    const n = 3000, L = 4, P = 100, H = 5;
    const nodes = new Map(Array.from({ length: n }, (_, k) => [k + 1, { id: k + 1, x: 0, z: k === n - 1 ? L : -k }]));
    const elements = new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: n, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]);
    for (let k = 2; k < n; k++) elements.set(k, { id: k, type: 'frame' as const, nodeI: k - 1, nodeJ: k, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false });
    const supports = new Map(Array.from({ length: n - 1 }, (_, k) => [k + 1, { id: k + 1, nodeId: k + 1, type: 'fixed' as const }]));
    const big: SolverInput = { ...column('fixed', null, L, P, H), nodes, elements, supports, loads: [{ type: 'nodal', data: { nodeId: n, fx: H, fz: -P, my: 0 } }] };
    const a = teachingPDelta(big, { method: 'consistent', axialRigid: false });
    const b = teachingPDelta(column('fixed', null, L, P, H), { method: 'consistent', axialRigid: false });
    if (!a.ok || !b.ok) throw new Error('refused');
    expect(a.run.sys.free).toHaveLength(3);
    expect(a.run.converged).toBe(true);
    const tip = (r: typeof a.run, id: number) => r.final.D[r.sys.dof(id, 0)];
    expect(tip(a.run, n) / tip(b.run, 2)).toBeCloseTo(1, 12);
  });
});

describe('φ buckling never invents a mode', () => {
  it('a two-bar truss has at most as many critical loads as free DOFs: asking for more gives no fabricated λ', () => {
    const input: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 2, z: 0 }], [3, { id: 3, x: 1, z: 1 }]]),
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map([[1, { id: 1, type: 'truss' as const, nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }], [2, { id: 2, type: 'truss' as const, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' as const }], [2, { id: 2, nodeId: 2, type: 'pinned' as const }]]),
      loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fz: -100, my: 0 } }],
    };
    const b = buildSystem(input, { method: 'phi', axialRigid: false });
    if (!b.ok) throw new Error(b.reason.key);
    const first = firstOrderAxial(b.sys);
    if (!first.ok) throw new Error(first.reason.key);
    const modes = phiBuckling(b.sys, 3, first.N0, []);
    const exact = (200000 * 1000 * 0.01) / (100 / Math.SQRT2);
    expect(modes).toHaveLength(2);
    for (const m of modes) expect(m.lambda / exact).toBeCloseTo(1, 8);
    expect(criticalCount(b.sys, first.N0, exact * 1.001)).toBe(2);
    for (const m of modes) {
      expect(Number.isFinite(m.lambda)).toBe(true);
      expect(criticalCount(b.sys, first.N0, m.lambda * (1 + 1e-6))).toBeGreaterThan(criticalCount(b.sys, first.N0, m.lambda * (1 - 1e-6)));
    }
  });

  it('the double root gets two independent shapes, each nearly annihilated by K(λ)', () => {
    const input: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 2, z: 0 }], [3, { id: 3, x: 1, z: 1 }]]),
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map([[1, { id: 1, type: 'truss' as const, nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }], [2, { id: 2, type: 'truss' as const, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' as const }], [2, { id: 2, nodeId: 2, type: 'pinned' as const }]]),
      loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fz: -100, my: 0 } }],
    };
    const b = buildSystem(input, { method: 'phi', axialRigid: false });
    if (!b.ok) throw new Error(b.reason.key);
    const first = firstOrderAxial(b.sys);
    if (!first.ok) throw new Error(first.reason.key);
    const modes = phiBuckling(b.sys, 2, first.N0, []);
    expect(modes).toHaveLength(2);
    const [u, v] = modes.map((m) => b.sys.free.map((d) => m.D[d]));
    const dotp = u.reduce((s, x, i) => s + x * v[i], 0);
    const nrm = (w: number[]) => Math.hypot(...w);
    expect(Math.abs(dotp) / (nrm(u) * nrm(v))).toBeLessThan(1e-6);
    for (const [k, m] of modes.entries()) {
      const K = reducedStiffness(b.sys, new Map([...first.N0].map(([id, n]) => [id, n * m.lambda])), 'phi');
      const w = k === 0 ? u : v;
      const r = K.map((row) => row.reduce((s, x, j) => s + x * w[j], 0));
      const kn = Math.max(...reducedStiffness(b.sys, new Map(), 'phi').flat().map(Math.abs));
      expect(nrm(r) / (kn * nrm(w))).toBeLessThan(1e-6);
    }
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

describe('φ buckling of a member with every end held', () => {
  const held = (): SolverInput => {
    const input = column('fixed', 'fixed', 5, 0);
    input.loads = [];
    const top = [...input.supports.values()].find((s) => s.nodeId === 2)!;
    input.supports.set(top.id, { ...top, dz: -1e-3 });
    return input;
  };

  it('a fixed–fixed column shortened by its support: its internal modes, the first at 4π²EI/L²', () => {
    const b = teachingBuckling(held(), { method: 'phi', axialRigid: false }, 2);
    if (!b.ok) throw new Error(String(b.reason));
    const N = -[...b.run.N0.values()][0];
    expect(N).toBeGreaterThan(0);
    expect(b.run.modes.length).toBeGreaterThanOrEqual(1);
    expect(b.run.modes[0].internal).toBe(true);
    expect((b.run.modes[0].lambda * N) / ((4 * Math.PI ** 2 * EI) / 25)).toBeCloseTo(1, 8);
  });

  it('the methods that need a nodal unknown still refuse it', () => {
    expect(teachingBuckling(held(), { method: 'consistent', axialRigid: false }, 1).ok).toBe(false);
    expect(teachingPDelta(held(), { method: 'phi', axialRigid: false }).ok).toBe(false);
  });
});

describe('a joint that no bar holds across', () => {
  it('two collinear compressed truss bars: the middle joint can move sideways, so the run is refused, not held', () => {
    const bar = (id: number, i: number, j: number) => ({ id, type: 'truss' as const, nodeI: i, nodeJ: j, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false });
    const input: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 2, z: 0 }], [3, { id: 3, x: 4, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map([[1, bar(1, 1, 2)], [2, bar(2, 2, 3)]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' as const }], [2, { id: 2, nodeId: 3, type: 'rollerX' as const }]]),
      loads: [{ type: 'nodal', data: { nodeId: 3, fx: -100, fz: 0, my: 0 } }],
    };
    for (const method of ['consistent', 'string', 'phi'] as const) {
      const b = buildSystem(input, { method, axialRigid: false });
      expect(b.ok).toBe(false);
      if (!b.ok) expect(b.reason.key).toBe('course.second-order.refuse.singular');
    }
    const run = runPDelta2D(input, { ...DEFAULT_SETTINGS, method: 'phi', n: 1 });
    expect(run.ok).toBe(false);
  });
});

describe('the compression guard with rigid members reads each member\'s own round-off', () => {
  const lShape = (pull: number, P: number): SolverInput => ({
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: 4 }], [3, { id: 3, x: 6, z: 4 }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'frame' as const, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 3, type: 'pinned' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: -pull, fz: -P, my: 0 } }],
  });

  it('a column under 100 kN beside a beam pulled by 1e12 kN buckles clamped at both ends, λ = 4π²EI/(L²·P)', () => {
    const pulled = teachingBuckling(lShape(1e12, 100), { method: 'phi', axialRigid: true }, 1);
    if (!pulled.ok) throw new Error(pulled.reason.key);
    expect(pulled.run.N0.get(1)).toBeCloseTo(-100, 6);
    expect(pulled.run.N0.get(2)).toBeCloseTo(1e12, -3);
    expect(pulled.run.modes[0].lambda / ((4 * Math.PI ** 2 * EI) / (16 * 100))).toBeCloseTo(1, 4);
  });

  it('still refuses when the only compression is round-off', () => {
    const b = buildSystem(lShape(1e12, 0), { method: 'phi', axialRigid: true });
    if (!b.ok) throw new Error(b.reason.key);
    const first = firstOrderAxial(b.sys);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.reason.key).toBe('course.second-order.refuse.noCompression');
  });
});

describe('a tiny compression still buckles: λ·P does not depend on the load scale', () => {
  for (const method of ['consistent', 'phi'] as const) {
    for (const axialRigid of [false, true]) {
      it(`${method}${axialRigid ? ', axially rigid' : ''}: P = 1e-10 kN and P = 100 kN give the same λ·P`, () => {
        const at = (P: number) => {
          const b = teachingBuckling(refineInput(column('pinned', 'rollerZ', 5, P), 4).input, { method, axialRigid }, 1);
          if (!b.ok) throw new Error(b.reason.key);
          return b.run.modes[0].lambda * P;
        };
        const ref = at(100);
        expect(ref / (Math.PI ** 2 * EI / 25)).toBeCloseTo(1, method === 'phi' ? 6 : 2);
        expect(at(1e-10) / ref).toBeCloseTo(1, 6);
      });
    }
  }
});

describe('a couple on a bar cannot be carried', () => {
  const bar = (my: number): SolverInput => ({
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 4, z: 0 }], [3, { id: 3, x: 2, z: 3 }]]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([
      [1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'truss', nodeI: 3, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [3, { id: 3, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: 2, type: 'rollerX' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fz: -10, my: 0 } }, { type: 'pointOnElement', data: { elementId: 1, a: 1, p: 0, my } }],
  } as unknown as SolverInput);
  it('a point couple on a truss bar is refused, not dropped; without it the model builds', () => {
    const r = buildSystem(bar(5), { method: 'consistent', axialRigid: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.key).toBe('course.second-order.refuse.trussCouple');
    expect(buildSystem(bar(0), { method: 'consistent', axialRigid: false }).ok).toBe(true);
  });
});

describe('a nodal and an internal buckling mode at the same load factor', () => {
  const frame = (id: number, nodeI: number, nodeJ: number) => ({ id, type: 'frame' as const, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false });
  const A = 0.01, NA = 100;
  const twoColumns = (): SolverInput => ({
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: 5 }], [3, { id: 3, x: 10, z: 0 }], [4, { id: 4, x: 10, z: 2.5 }]]),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I }]]),
    elements: new Map([[1, frame(1, 1, 2)], [2, frame(2, 3, 4)]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 2, type: 'fixed', dz: -(NA * 5) / (E * 1000 * A) }], [3, { id: 3, nodeId: 3, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 4, fx: 0, fz: -NA / 4, my: 0 } }],
  }) as unknown as SolverInput;

  it('a clamped column and a cantilever tuned to buckle together: one mode is drawn, one is internal', () => {
    const exact = (4 * Math.PI ** 2 * EI) / (25 * NA);
    const b = teachingBuckling(twoColumns(), { method: 'phi', axialRigid: false }, 2);
    if (!b.ok) throw new Error(b.reason.key);
    expect(b.run.modes).toHaveLength(2);
    for (const m of b.run.modes) expect(m.lambda / exact).toBeCloseTo(1, 8);
    const drawn = b.run.modes.filter((m) => !m.internal);
    const internal = b.run.modes.filter((m) => m.internal);
    expect(drawn).toHaveLength(1);
    expect(internal).toHaveLength(1);
    expect(internal[0].D.every((v) => v === 0)).toBe(true);
    expect(Math.max(...drawn[0].D.map(Math.abs))).toBeCloseTo(1, 9);
  });
});

describe('the compression check ignores displacements that do not stretch the member', () => {
  it.each([0, 1e6, 1e10, 1e13])('a cantilever column under 100 kN keeps N = −100 kN and Pcr with a lateral load of %s kN', (H) => {
    const b = buildSystem(column('fixed', null, 4, 100, H), { method: 'consistent', axialRigid: false });
    if (!b.ok) throw new Error(b.reason.key);
    const a = firstOrderAxial(b.sys);
    if (!a.ok) throw new Error(a.reason.key);
    expect(a.N0.get(1)! / -100).toBeCloseTo(1, 9);
    const r = teachingBuckling(column('fixed', null, 4, 100, H), { method: 'phi', axialRigid: false }, 1);
    if (!r.ok) throw new Error(r.reason.key);
    expect(r.run.modes[0].lambda * 100 / ((Math.PI ** 2 * EI) / (4 * 16))).toBeCloseTo(1, 6);
  });
});
