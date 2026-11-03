/**
 * The limit analysis on critical sections against the textbook collapse
 * loads, and against the step-by-step analysis of the same model: the
 * kinematic minimum, the static maximum and the incremental λc must agree.
 */
import { describe, it, expect } from 'vitest';
import { solveLimit, peakInside } from '../solve-limit';
import { evaluateUserMechanism } from '../mechanism';
import { limitModel, minimumOver, mechanismMoments, distribution, peakRatio } from '../limit';
import { plasticCollapse2D } from '../../plastic-collapse';
import { countStaticDegree2D } from '../../kinematic-2d';
import { solveLp } from '../lp';
import { solve } from '../../wasm-solver';
import type { SolverLoad } from '../../types';
import { momentAt } from '../sections';
import { model, fixedBeam, proppedUdl, portal, twoSpanUdl, uniformMp, MP, P, pOn, q } from './helpers';

const verified = (r: ReturnType<typeof plasticCollapse2D>) => {
  expect(r.unresolved).not.toBe(true);
  expect(r.isMechanism).toBe(true);
  expect(Number.isFinite(r.collapseFactor) && r.collapseFactor > 0).toBe(true);
  return r.collapseFactor;
};
const incremental = (m: Parameters<typeof plasticCollapse2D>[0]) => verified(plasticCollapse2D(m, { mp: () => MP, np: () => Infinity }));

describe('a small linear program', () => {
  it('finds the optimum of a two-variable problem with free variables and equalities', () => {
    const r = solveLp({ c: [-1, -2], rows: [{ a: [1, 1], op: '<=', b: 4 }, { a: [1, 3], op: '<=', b: 6 }] });
    expect(r.status).toBe('optimal');
    if (r.status === 'optimal') { expect(r.x[0]).toBeCloseTo(3, 9); expect(r.x[1]).toBeCloseTo(1, 9); }
    const f = solveLp({ c: [0, 1], rows: [{ a: [1, -1], op: '<=', b: 2 }, { a: [-1, -1], op: '<=', b: 2 }, { a: [1, 0], op: '=', b: -1 }], free: [true, false] });
    expect(f.status).toBe('optimal');
    if (f.status === 'optimal') expect(f.value).toBeCloseTo(0, 9);
    expect(solveLp({ c: [1], rows: [{ a: [1], op: '<=', b: -1 }] }).status).toBe('infeasible');
    expect(solveLp({ c: [-1], rows: [{ a: [-1], op: '<=', b: 1 }] }).status).toBe('unbounded');
  });
  it('solves rows of very different scale exactly, and refuses a tiny infeasibility', () => {
    const r = solveLp({ c: [-1], rows: [{ a: [1e10], op: '<=', b: 1e10 }, { a: [1], op: '<=', b: 0.5 }] });
    expect(r.status).toBe('optimal');
    if (r.status === 'optimal') expect(r.x[0]).toBeCloseTo(0.5, 12);
    const s = solveLp({ c: [-1, -1], rows: [{ a: [1e10, 0], op: '<=', b: 2e10 }, { a: [1, 1], op: '<=', b: 3 }, { a: [0, 1e-6], op: '<=', b: 1e-6 }] });
    expect(s.status).toBe('optimal');
    if (s.status === 'optimal') { expect(s.x[0] + s.x[1]).toBeCloseTo(3, 12); expect(s.x[1]).toBeLessThanOrEqual(1 + 1e-12); }
    const e = solveLp({ c: [-1], rows: [{ a: [1e10], op: '>=', b: 1e9 }, { a: [1], op: '<=', b: 0.5 }] });
    expect(e.status).toBe('optimal');
    if (e.status === 'optimal') expect(e.x[0]).toBeCloseTo(0.5, 12);
    expect(solveLp({ c: [1], rows: [{ a: [1], op: '=', b: -1e-8 }] }).status).toBe('infeasible');
  });
  it('keeps the smaller ratio when two rows tie within the absolute noise of tiny right-hand sides', () => {
    const r = solveLp({ c: [-1], rows: [{ a: [1], op: '<=', b: 2e-10 }, { a: [1], op: '<=', b: 1e-10 }] });
    expect(r.status).toBe('optimal');
    if (r.status === 'optimal') expect(r.x[0] / 1e-10).toBeCloseTo(1, 9);
  });
  it('finds the same optimum whatever the scale of the right-hand side or of the costs', () => {
    for (const b of [1e-6, 1, 1e10]) {
      const r = solveLp({ c: [-1], rows: [{ a: [1], op: '<=', b }] });
      expect(r.status).toBe('optimal');
      if (r.status === 'optimal') expect(r.x[0] / b).toBeCloseTo(1, 9);
    }
    for (const k of [1e-8, 1e8]) {
      const r = solveLp({ c: [-k, -2 * k], rows: [{ a: [1, 1], op: '<=', b: 4 }, { a: [1, 3], op: '<=', b: 6 }] });
      expect(r.status).toBe('optimal');
      if (r.status === 'optimal') { expect(r.x[0]).toBeCloseTo(3, 9); expect(r.x[1]).toBeCloseTo(1, 9); }
    }
  });
});

describe('critical sections, independent mechanisms and GH', () => {
  it('fixed-fixed beam with a central load: N = 3, GH = 3 of which 1 is axial, m = 1', () => {
    const lm = limitModel(fixedBeam(), uniformMp);
    expect([lm.N, lm.m, lm.ghF, lm.sAxial]).toEqual([3, 1, 2, 1]);
    expect(countStaticDegree2D(fixedBeam()).degree).toBe(lm.ghF + lm.sAxial);
  });
  it('portal frame: N = 5 (two bases, two corners, the load), GH = 3, m = 2 (beam and sway)', () => {
    const lm = limitModel(portal(), uniformMp);
    expect([lm.N, lm.m, lm.ghF, lm.sAxial]).toEqual([5, 2, 3, 0]);
    expect(countStaticDegree2D(portal()).degree).toBe(3);
  });
  it('a joint of three members has three sections and a joint mechanism', () => {
    // Two-bay frame: interior joint where both beams and the middle column meet.
    const m = model([[1, 0, 0], [2, 0, 4], [3, 5, 4], [4, 5, 0], [5, 10, 4], [6, 10, 0]],
      [[1, 1, 2], [2, 2, 3], [3, 4, 3], [4, 3, 5], [5, 6, 5]],
      [[1, 'fixed'], [4, 'fixed'], [6, 'fixed']], [P(2, 1, 0), pOn(2, 2.5, -2), pOn(4, 2.5, -2)]);
    const s = solveLimit(m, uniformMp)!;
    expect(s.lm.N).toBe(3 + 1 + 3 + 1 + 2);
    expect(s.lm.ghF).toBe(6);
    expect(s.elementary.map((e) => e.kind).sort()).toEqual(['beam', 'beam', 'joint', 'sway']);
    expect(s.best.lambda).toBeCloseTo(incremental(m), 4);
  });
});

describe('the reference load\'s size', () => {
  it('a fixed-fixed beam under 1e-10 kN: λ scales by 1e10 with the same mechanism, and a drawn mechanism still does work', () => {
    const big = solveLimit(fixedBeam(6, 10), uniformMp)!;
    const tiny = solveLimit(fixedBeam(6, 1e-10), uniformMp)!;
    expect(tiny.best.lambda / (big.best.lambda * 1e11)).toBeCloseTo(1, 9);
    const sign = (v: number) => (v === 0 ? 0 : Math.sign(v));
    expect(tiny.best.theta.map(sign)).toEqual(big.best.theta.map(sign));
    const hinges = [{ member: 1, t: 0 }, { member: 1, t: 0.5 }, { member: 1, t: 1 }];
    const a = evaluateUserMechanism(fixedBeam(6, 10), uniformMp, hinges);
    const b = evaluateUserMechanism(fixedBeam(6, 1e-10), uniformMp, hinges);
    expect(b.verdict.kind).toBe(a.verdict.kind);
    expect(b.verdict.kind).not.toBe('noWork');
  });
});

describe('collapse loads: kinematic minimum = static check = step by step', () => {
  it('fixed-fixed beam, central load: λc = 8Mp/(PL)', () => {
    const s = solveLimit(fixedBeam(6, 10), uniformMp)!;
    expect(s.best.lambda).toBeCloseTo((8 * MP) / 60, 9);
    expect(s.moments.ratio).toBeCloseTo(1, 9);
    expect(incremental(fixedBeam(6, 10))).toBeCloseTo(s.best.lambda, 6);
  });
  it('propped cantilever with a uniform load: λc = 11.657 Mp/(wL²), hinge at 0.414 L from the prop', () => {
    const L = 6, w = 10;
    const s = solveLimit(proppedUdl(L, w), uniformMp)!;
    const exact = (2 * (3 + 2 * Math.SQRT2) * MP) / (w * L * L);
    expect(s.best.lambda).toBeCloseTo(exact, 7);
    expect(L - s.positions.get(1)! * L).toBeCloseTo((Math.SQRT2 - 1) * L, 4);
    expect(s.history.length).toBeGreaterThan(1);
    expect(Math.abs(incremental(proppedUdl(L, w)) / s.best.lambda - 1)).toBeLessThan(1e-4);
  });
  it('portal frame: beam 8Mp/(VL), sway 4Mp/(Hh), combined 6Mp/(Hh + VL/2) governs', () => {
    const s = solveLimit(portal(1, 1), uniformMp)!;
    const byKind = Object.fromEntries(s.elementary.map((e) => [e.kind, e.mech.lambda]));
    expect(byKind.beam).toBeCloseTo((8 * MP) / 6, 9);
    expect(byKind.sway).toBeCloseTo((4 * MP) / 4, 9);
    expect(s.best.lambda).toBeCloseTo((6 * MP) / 7, 9);
    expect(s.combination.map((c) => Math.abs(c))).toEqual([1, 1]);
    expect(s.best.theta.filter((t) => t !== 0)).toHaveLength(4);
    expect(incremental(portal(1, 1))).toBeCloseTo(s.best.lambda, 6);
  });
  it('portal frame with a strong lateral load: the sway mechanism governs', () => {
    const s = solveLimit(portal(3, 1), uniformMp)!;
    expect(s.best.lambda).toBeCloseTo((4 * MP) / 12, 9);
    expect(incremental(portal(3, 1))).toBeCloseTo(s.best.lambda, 6);
  });
  it('two-span continuous beam with uniform load: each span as a propped cantilever', () => {
    const L = 5, w = 10;
    const s = solveLimit(twoSpanUdl(L, w), uniformMp)!;
    expect(s.best.lambda).toBeCloseTo((2 * (3 + 2 * Math.SQRT2) * MP) / (w * L * L), 7);
    expect(Math.abs(incremental(twoSpanUdl(L, w)) / s.best.lambda - 1)).toBeLessThan(1e-4);
  });
  it('two-span beam with point loads: λc = 6Mp/(PL) for a central load on each span', () => {
    const L = 4;
    const m = model([[1, 0, 0], [2, L, 0], [3, 2 * L, 0]], [[1, 1, 2], [2, 2, 3]],
      [[1, 'pinned'], [2, 'rollerX'], [3, 'rollerX']], [pOn(1, L / 2, -10), pOn(2, L / 2, -10)]);
    const s = solveLimit(m, uniformMp)!;
    expect(s.best.lambda).toBeCloseTo((6 * MP) / (10 * L), 9);
    expect(incremental(m)).toBeCloseTo(s.best.lambda, 6);
  });
  it('gable frame: agrees with the step-by-step analysis', () => {
    const m = model([[1, 0, 0], [2, 0, 4], [3, 4, 6], [4, 8, 4], [5, 8, 0]], [[1, 1, 2], [2, 2, 3], [3, 3, 4], [4, 5, 4]],
      [[1, 'fixed'], [5, 'fixed']], [P(2, 2, 0), P(3, 0, -4)]);
    const s = solveLimit(m, uniformMp)!;
    expect(s.best.lambda).toBeCloseTo(incremental(m), 5);
    expect(s.moments.ratio).toBeLessThan(1 + 1e-6);
  });
  it('portal with a uniform beam load: the hinge drifting under the load does not end the analysis early', () => {
    // Columns Mp 1687.5, beam 3125, q = 15 kN/m on 6 m, H = 10 kN at 4 m: the beam mechanism,
    // λ = (2·1687.5 + 2·3125)/(15·6²/4) = 9625/135. A second hinge a sampling step from the first
    // used to stop the step-by-step analysis at 64.06 as a false mechanism.
    const m = model([[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]], [[1, 1, 2], [2, 2, 3], [3, 4, 3]],
      [[1, 'fixed'], [4, 'fixed']], [P(2, 10, 0), q(2, -15)]);
    const mp = (id: number) => (id === 2 ? 3125 : 1687.5);
    const s = solveLimit(m, mp)!;
    expect(s.best.lambda).toBeCloseTo(9625 / 135, 9);
    const r = plasticCollapse2D(m, { mp, np: () => Infinity });
    expect(Math.abs(verified(r) / (9625 / 135) - 1)).toBeLessThan(1e-4);
    expect(r.hinges.some((h) => h.unloadedAt !== undefined)).toBe(true);
  });

  it('columns weaker than the beam: the corner hinges go in the columns', () => {
    const m = portal(1, 1);
    const mp = (id: number) => (id === 2 ? 2 * MP : MP);
    const s = solveLimit(m, mp)!;
    const corner = s.lm.sm.sections.filter((x) => x.kind === 'joint');
    expect(corner.every((x) => x.member !== 2)).toBe(true);
    expect(s.best.lambda).toBeCloseTo(verified(plasticCollapse2D(m, { mp, np: () => Infinity })), 6);
  });
});

describe('the static theorem: distributions and bounds', () => {
  it('the moments of the governing mechanism are admissible; those of a higher one are not', () => {
    const lm = limitModel(portal(1, 1), uniformMp);
    const best = minimumOver(lm, lm.basis)!;
    expect(mechanismMoments(lm, best)!.ratio).toBeLessThanOrEqual(1 + 1e-9);
    const fixed = new Map<number, number>();
    // A distribution at λ above λc cannot stay within Mp anywhere.
    const d = distribution(lm, fixed, best.lambda * 1.1)!;
    expect(d.ratio).toBeGreaterThan(1);
    expect(best.lambda * 1.1 / d.ratio).toBeLessThanOrEqual(best.lambda + 1e-9);
  });
  it('a distribution of the uniform-load case peaks inside the span, where the shear vanishes', () => {
    const s = solveLimit(proppedUdl(6, 10), uniformMp)!;
    const span = s.lm.sm.sections.findIndex((x) => x.kind === 'span');
    const t = s.lm.sm.sections[span].t;
    expect(s.moments.M[span]).toBeCloseTo(MP, 6);
    const at = (u: number) => momentAt(s.lm.sm, 1, u, s.moments.M, s.best.lambda);
    expect(at(t - 0.01)).toBeLessThan(MP);
    expect(at(t + 0.01)).toBeLessThan(MP);
    expect(s.moments.ratio).toBeCloseTo(1, 6);
    void q;
  });
});

describe('the peak |M|/Mp of a distribution', () => {
  it('finds the true peak under a narrow partial load and the competing one under a second load', () => {
    const w = 10, L = 6;
    const input = model([[1, 0, 0], [2, L, 0]], [[1, 1, 2]], [[1, 'pinned'], [2, 'rollerX']], [
      { type: 'distributed', data: { elementId: 1, qI: -w, qJ: -w, a: 2, b: 2.3 } },
      { type: 'distributed', data: { elementId: 1, qI: -40, qJ: -40, a: 4.47, b: 4.53 } },
    ]);
    const lm = limitModel(input, uniformMp);
    const d = distribution(lm, new Map(), 1)!;
    const loads = [{ a: 2, b: 2.3, w }, { a: 4.47, b: 4.53, w: 40 }];
    const R1 = loads.reduce((s, l) => s + l.w * (l.b - l.a) * (L - (l.a + l.b) / 2) / L, 0);
    const Mx = (x: number) => R1 * x - loads.reduce((s, l) => {
      const e = Math.min(Math.max(x - l.a, 0), l.b - l.a);
      return s + l.w * e * (x - l.a - e / 2);
    }, 0);
    let best = 0;
    for (let i = 0; i <= 600000; i++) best = Math.max(best, Math.abs(Mx((L * i) / 600000)));
    expect(d.ratio / (best / MP)).toBeCloseTo(1, 6);
  });
});


describe('a couple applied at a member end', () => {
  const couple = (elementId: number, a: number, my: number): SolverLoad => ({ type: 'pointOnElement', data: { elementId, a, p: 0, my } });
  const nodal = (nodeId: number, my: number): SolverLoad => ({ type: 'nodal', data: { nodeId, fx: 0, fz: 0, my } });
  const beam = (load: SolverLoad) => model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'rollerX']], [q(1, -10), load]);

  it('at a joint free to turn is the same couple on the joint: the engine moves alike, and the collapse load is the same', () => {
    const onMember = beam(couple(1, 6, 15)), onNode = beam(nodal(2, 15));
    const d1 = solve(onMember).displacements, d2 = solve(onNode).displacements;
    d1.forEach((d, i) => { expect(d.ux).toBeCloseTo(d2[i].ux, 12); expect(d.uz).toBeCloseTo(d2[i].uz, 12); expect(d.ry).toBeCloseTo(d2[i].ry, 12); });
    const a = solveLimit(onMember, uniformMp), b = solveLimit(onNode, uniformMp);
    expect(a).not.toBeNull();
    expect(a!.best.lambda).toBeCloseTo(b!.best.lambda, 9);
    expect(Math.abs(incremental(onMember) / a!.best.lambda - 1)).toBeLessThan(1e-4);
  });

  it('inside the span, at a hinged end, or at a support that holds the rotation, is still refused', () => {
    expect(() => limitModel(beam(couple(1, 3, 15)), uniformMp)).toThrow(/couple inside a member/);
    expect(() => limitModel(beam(couple(1, 0, 15)), uniformMp)).toThrow(/couple inside a member/);
    const hinged = beam(couple(1, 6, 15));
    hinged.elements.get(1)!.hingeEnd = true;
    expect(() => limitModel(hinged, uniformMp)).toThrow(/couple inside a member/);
  });
});


describe('the redundants chosen against the peaks along the members, not only at the check points', () => {
  it('propped cantilever under a uniform load, nothing fixed: the lowest max |M| is (3 − 2√2)/2 · wL², its peak off every check point', () => {
    const L = 6, w = 10;
    const lm = limitModel(proppedUdl(L, w), uniformMp);
    const d = distribution(lm, new Map(), 1)!;
    expect(d.free).toBe(1);
    expect(Math.abs((d.ratio * MP) / (((3 - 2 * Math.sqrt(2)) / 2) * w * L * L) - 1)).toBeLessThan(1e-9);
  });
});

describe('a reference load far below 1e-12', () => {
  it('a simply supported beam under 1e-13 kN at midspan keeps its section there: λ is 1e14 times the 10 kN one, the same hinge', () => {
    const L = 6;
    const beam = (p: number) => model([[1, 0, 0], [2, L, 0]], [[1, 1, 2]], [[1, 'pinned'], [2, 'rollerX']], [pOn(1, L / 2, -p)]);
    const big = solveLimit(beam(10), uniformMp)!, small = solveLimit(beam(1e-13), uniformMp)!;
    expect(big.best.lambda).toBeCloseTo((4 * MP) / (10 * L), 9);
    expect(Math.abs((small.best.lambda * 1e-13) / (big.best.lambda * 10) - 1)).toBeLessThan(1e-9);
  });
});

describe('a joint of two members of different Mp', () => {
  const mpOf = (m: number) => (m === 1 ? 100 : 50);
  const beam = () => model([[1, 0, 0], [2, 4, 0], [3, 8, 0]], [[1, 1, 2], [2, 2, 3]], [[1, 'fixed'], [2, 'rollerX'], [3, 'fixed']], [pOn(1, 2, -10), pOn(2, 2, -10)]);
  it('takes the weaker Mp for the shared moment, wherever the user puts the hinge', () => {
    for (const extra of [[], [{ member: 1, t: 1 }], [{ member: 2, t: 0 }]]) {
      const lm = limitModel(beam(), mpOf, { extra });
      const joint = lm.sm.sections.filter((s) => s.kind === 'joint');
      expect(joint).toHaveLength(1);
      expect(joint[0].mp).toBe(50);
      expect(minimumOver(lm, lm.basis)!.lambda).toBeCloseTo(minimumOver(limitModel(beam(), mpOf), limitModel(beam(), mpOf).basis)!.lambda, 9);
    }
  });
});

describe('where the moment peaks inside a member', () => {
  it('finds a peak between the points a 400-point grid samples, over a nearly equal one on the grid', () => {
    const L = 8, t1 = 0.30125, t3 = 0.31, t2 = 0.7;
    const lm = limitModel(model([[1, 0, 0], [2, L, 0]], [[1, 1, 2]], [[1, 'pinned'], [2, 'rollerX']], [pOn(1, t1 * L, -10), pOn(1, t3 * L, -10), pOn(1, t2 * L, -10)]), uniformMp, { span: null });
    const at = (t: number) => lm.sm.sections.findIndex((s) => s.member === 1 && Math.abs(s.t - t) < 1e-9);
    const M = new Array(lm.sm.sections.length).fill(0);
    expect([at(t1), at(t3), at(t2)].every((k) => k >= 0)).toBe(true);
    M[at(t1)] = 100; M[at(t2)] = 99.99;
    const t = peakInside(lm, 1, M, 0)!;
    expect(t).toBeCloseTo(t1, 12);
    expect(Math.abs(momentAt(lm.sm, 1, t, M, 0))).toBeCloseTo(100, 9);
  });
});

describe('the largest |M| / Mp of a distribution', () => {
  it('is read at the zero of the shear under a linearly varying load, to round-off', () => {
    const L = 7;
    const lm = limitModel(model([[1, 0, 0], [2, L, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'fixed']], [{ type: 'distributed', data: { elementId: 1, qI: -3, qJ: 11, a: 1.3, b: 6.1 } }]), uniformMp, { span: null });
    const M = new Array(lm.sm.sections.length).fill(0);
    M[0] = 4; M[M.length - 1] = -9;
    const g = (t: number) => momentAt(lm.sm, 1, t, M, 1);
    let bt = 0, bv = -1;
    for (let i = 0; i <= 200000; i++) { const v = Math.abs(g(i / 200000)); if (v > bv) { bv = v; bt = i / 200000; } }
    let lo = Math.max(0, bt - 1e-5), hi = Math.min(1, bt + 1e-5);
    for (let i = 0; i < 200; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (Math.abs(g(a)) > Math.abs(g(b))) hi = b; else lo = a; }
    const exact = Math.abs(g((lo + hi) / 2));
    expect(peakRatio(lm.sm, M, 1).ratio * MP).toBeCloseTo(exact, 12);
  });
});

describe('equilibrium of fixed moments is judged at the scale of the problem', () => {
  for (const s of [1, 1e-10, 1e10]) {
    it(`loads and moments scaled by ${s}: zero moments under a load are refused, the equilibrium ones accepted`, () => {
      const lm = limitModel(fixedBeam(6, 10 * s), () => MP * s);
      const zero = new Map(lm.sm.sections.map((_, i) => [i, 0]));
      expect(distribution(lm, zero, 1)).toBeNull();
      const ref = distribution(limitModel(fixedBeam(6, 10), uniformMp), new Map(), 1)!;
      const exact = new Map(ref.M.map((m, i) => [i, m * s]));
      const d = distribution(lm, exact, 1);
      expect(d).not.toBeNull();
      expect(d!.ratio).toBeCloseTo(ref.ratio, 9);
    });
  }
});

describe('where the distributed-load hinge ended', () => {
  it('a fixed beam under a uniform load: the hinge starts at midspan and stays, and that is what is reported', () => {
    const m = model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'fixed']], [q(1, -10)]);
    const s = solveLimit(m, uniformMp)!;
    expect(s.positions.get(1)).toBeCloseTo(0.5, 9);
    expect(s.history[s.history.length - 1].positions.get(1)).toBeCloseTo(0.5, 9);
    expect(s.best.lambda).toBeCloseTo(16 * MP / (10 * 36), 6);
  });
});

describe('a feasibility program (zero cost) has exactly zero multipliers', () => {
  it('is certified optimal, not inaccurate, with ≤, ≥ and = rows of mixed scale', () => {
    const r = solveLp({ c: [0, 0], rows: [{ a: [1e-8, 1], op: '<=', b: 3 }, { a: [1, 1e9], op: '>=', b: 1 }, { a: [1, -1], op: '=', b: 0.5 }], free: [true, true] });
    expect(r.status).toBe('optimal');
  });
});
