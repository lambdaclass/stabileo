import { describe, it, expect, beforeAll } from 'vitest';
import * as wasm from '../../wasm-solver';
import type { SolverInput, SolverLoad } from '../../types';
import { teachingPDelta, toAnalysisResults } from '../pdelta';
import { beamColumnEndLoads } from '../beam-column-loads';
import { fixedEnd } from '../../steps/fem';
import type { PMember, PMemberLoad } from '../../steps/plane-model';
import { column, EI } from './fixtures';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });

const L = 5;
const Pe = (Math.PI ** 2 * EI) / (L * L);

function phiRun(input: SolverInput) {
  const r = teachingPDelta(input, { method: 'phi', axialRigid: false });
  if (!r.ok) throw new Error(r.reason.key);
  expect(r.run.converged).toBe(true);
  return { run: r.run, res: toAnalysisResults(r.run.sys, input, r.run.final, 'phi', r.run.finalSolvedWith) };
}

const withLoads = (input: SolverInput, loads: SolverLoad[]) => {
  input.loads.push(...loads);
  return input;
};
const uniform = (w: number): SolverLoad => ({ type: 'distributed', data: { elementId: 1, qI: w, qJ: w } });
const point = (p: number): SolverLoad => ({ type: 'pointOnElement', data: { elementId: 1, a: L / 2, p } });

describe('beam-column span loads at N = 0 are the first-order fixed-end actions', () => {
  const m = { id: 1, L, EI, EA: 1e6, truss: false, hingeI: false, hingeJ: false } as unknown as PMember;
  const cases: Array<[string, PMemberLoad[]]> = [
    ['uniform', [{ kind: 'dist', member: 1, a: 0, b: L, qa: 3, qb: 3 }]],
    ['partial trapezoidal', [{ kind: 'dist', member: 1, a: 1, b: 3.5, qa: -2, qb: 5 }]],
    ['point load and couple', [{ kind: 'point', member: 1, a: 1.7, p: 4, px: 0, m: 2.5 }]],
  ];
  for (const [name, loads] of cases) {
    it(name, () => {
      const fe = fixedEnd(m, loads, { i: 'I', j: 'J' });
      const want = [-fe.Vi, -fe.Mi, -fe.Vj, -fe.Mj];
      for (const N of [0, 1e-9 * Pe, -1e-9 * Pe]) {
        const got = beamColumnEndLoads(m, N, loads)!;
        got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(1e-9 * Math.max(1, Math.abs(want[i]))));
      }
    });
  }
});

describe('beam-column span loads under large tension', () => {
  const m = { id: 1, L, EI, EA: 1e6, truss: false, hingeI: false, hingeJ: false } as unknown as PMember;
  const w = 4;
  for (const kL of [20, 1e3, 1e7]) {
    it(`kL = ${kL}: the fixed-end moment of a uniform load is (wL²/12)·3(u − tanh u)/(u² tanh u), u = kL/2, in bounded work`, () => {
      const k = kL / L, T = EI * k * k, u = kL / 2;
      const t0 = performance.now();
      const got = beamColumnEndLoads(m, T, [{ kind: 'dist', member: 1, a: 0, b: L, qa: w, qb: w }])!;
      expect(performance.now() - t0).toBeLessThan(2000);
      const exact = (w * L * L) / 12 * (3 * (u - Math.tanh(u))) / (u * u * Math.tanh(u));
      expect(Math.abs(Math.abs(got[1]) - exact) / exact).toBeLessThan(1e-8);
      expect(Math.abs(Math.abs(got[3]) - exact) / exact).toBeLessThan(1e-8);
      expect(Math.abs(Math.abs(got[0]) - (w * L) / 2) / ((w * L) / 2)).toBeLessThan(1e-8);
    });
  }
});

describe('φ with span loads against the closed-form beam-column', () => {
  const w = 4, Q = 10;
  const u = (P: number) => (L / 2) * Math.sqrt(Math.abs(P) / EI);

  for (const P of [0.5 * Pe, -0.5 * Pe]) {
    const c = P > 0;
    const x = u(P);
    const tag = c ? 'compression 0.5 Pe' : 'tension 0.5 Pe';

    it(`pinned-pinned, uniform load, ${tag}: end rotation`, () => {
      const { res } = phiRun(withLoads(column('pinned', 'rollerZ', L, P), [uniform(w)]));
      const amp = c ? (3 * (Math.tan(x) - x)) / x ** 3 : (3 * (x - Math.tanh(x))) / x ** 3;
      const exact = (w * L ** 3) / (24 * EI) * amp;
      expect(Math.abs(res.displacements.find((d) => d.nodeId === 1)!.ry) / exact).toBeCloseTo(1, 7);
    });

    it(`pinned-pinned, midspan point load, ${tag}: end rotation`, () => {
      const { res } = phiRun(withLoads(column('pinned', 'rollerZ', L, P), [point(Q)]));
      const amp = c ? (2 * (1 - Math.cos(x))) / (x * x * Math.cos(x)) : (2 * (Math.cosh(x) - 1)) / (x * x * Math.cosh(x));
      const exact = (Q * L * L) / (16 * EI) * amp;
      expect(Math.abs(res.displacements.find((d) => d.nodeId === 1)!.ry) / exact).toBeCloseTo(1, 7);
    });

    it(`fixed-fixed, uniform load, ${tag}: end moment`, () => {
      const { res } = phiRun(withLoads(column('fixed', 'guided', L, P), [uniform(w)]));
      const amp = c ? (3 * (Math.tan(x) - x)) / (x * x * Math.tan(x)) : (3 * (x - Math.tanh(x))) / (x * x * Math.tanh(x));
      const exact = (w * L * L) / 12 * amp;
      expect(Math.abs(res.elementForces[0].mStart) / exact).toBeCloseTo(1, 7);
    });

    it(`fixed-fixed, midspan point load, ${tag}: end moment`, () => {
      const { res } = phiRun(withLoads(column('fixed', 'guided', L, P), [point(Q)]));
      const amp = c ? (2 * (1 - Math.cos(x))) / (x * Math.sin(x)) : (2 * (Math.cosh(x) - 1)) / (x * Math.sinh(x));
      const exact = (Q * L) / 8 * amp;
      expect(Math.abs(res.elementForces[0].mStart) / exact).toBeCloseTo(1, 7);
    });
  }

  it('a hinge at the member end gives the same answer as a pin at the support: the loads are condensed exactly', () => {
    const P = 0.5 * Pe;
    const pinned = phiRun(withLoads(column('fixed', 'rollerZ', L, P), [uniform(w), point(Q)]));
    const hinged = withLoads(column('fixed', 'guided', L, P), [uniform(w), point(Q)]);
    hinged.elements.get(1)!.hingeEnd = true;
    const h = phiRun(hinged);
    expect(h.res.elementForces[0].mStart / pinned.res.elementForces[0].mStart).toBeCloseTo(1, 7);
    expect(Math.abs(h.res.elementForces[0].mEnd)).toBeLessThan(1e-9 * Math.abs(pinned.res.elementForces[0].mStart));
  });
});

describe('a member under strong tension', () => {
  const m = { L: 5, EI };
  for (const kL of [50, 200, 700]) {
    it(`kL = ${kL}: fixed-end moments from the closed forms, and the shears carry the whole load`, () => {
      const N = EI * (kL / m.L) ** 2, x = kL / 2, w = 7, Q = 11;
      const u = beamColumnEndLoads(m, N, [{ kind: 'dist', a: 0, b: m.L, qa: w, qb: w } as PMemberLoad])!;
      expect(u.every(Number.isFinite)).toBe(true);
      expect(Math.abs(u[1]) / ((w * m.L * m.L) / 12 * (3 * (x - Math.tanh(x))) / (x * x * Math.tanh(x)))).toBeCloseTo(1, 7);
      expect((u[0] + u[2]) / (w * m.L)).toBeCloseTo(1, 10);
      const p = beamColumnEndLoads(m, N, [{ kind: 'point', a: m.L / 2, p: Q, m: 0 } as PMemberLoad])!;
      expect(p.every(Number.isFinite)).toBe(true);
      expect(Math.abs(p[1]) / ((Q * m.L) / 8 * (2 * Math.tanh(x / 2)) / x)).toBeCloseTo(1, 7);
      expect((p[0] + p[2]) / Q).toBeCloseTo(1, 10);
    });
  }
});
