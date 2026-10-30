/**
 * The limit analysis on critical sections against the textbook collapse
 * loads, and against the step-by-step analysis of the same model: the
 * kinematic minimum, the static maximum and the incremental λc must agree.
 */
import { describe, it, expect } from 'vitest';
import { solveLimit } from '../solve-limit';
import { limitModel, minimumOver, mechanismMoments, distribution } from '../limit';
import { plasticCollapse2D } from '../../plastic-collapse';
import { countStaticDegree2D } from '../../kinematic-2d';
import { solveLp } from '../lp';
import { momentAt } from '../sections';
import { model, fixedBeam, proppedUdl, portal, twoSpanUdl, uniformMp, MP, P, pOn, q } from './helpers';

const incremental = (m: Parameters<typeof plasticCollapse2D>[0]) => plasticCollapse2D(m, { mp: () => MP, np: () => Infinity }).collapseFactor;

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
    expect(Math.abs(r.collapseFactor / (9625 / 135) - 1)).toBeLessThan(1e-4);
    expect(r.hinges.some((h) => h.unloadedAt !== undefined)).toBe(true);
  });

  it('columns weaker than the beam: the corner hinges go in the columns', () => {
    const m = portal(1, 1);
    const mp = (id: number) => (id === 2 ? 2 * MP : MP);
    const s = solveLimit(m, mp)!;
    const corner = s.lm.sm.sections.filter((x) => x.kind === 'joint');
    expect(corner.every((x) => x.member !== 2)).toBe(true);
    expect(s.best.lambda).toBeCloseTo(plasticCollapse2D(m, { mp, np: () => Infinity }).collapseFactor, 6);
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
