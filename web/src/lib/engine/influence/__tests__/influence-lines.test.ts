/**
 * Influence lines against the textbook: ordinates of M and V on a simple beam at x = 0, L/4 and
 * L, a cantilever, a two-span continuous beam (Müller-Breslau values), a truss bar's N, and the
 * displacement and rotation lines by Maxwell's reciprocity against one solve per load position.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver } from '../../wasm-solver';
import { computeInfluenceLine } from '../../influence-service';
import { buildSolverInput2D } from '../../solver-service';
import { loadOnMember } from '../../moving-loads';
import { targetDisplacement } from '../maxwell';
import { unitSolver } from '../unit-sweep';
import type { InfluenceLineResult, InfluenceQuantity } from '../../../store/model.svelte';
import { t } from '../../../i18n';
import { simpleBeam, cantilever, twoSpan, kingPostTruss, planeModel, EI } from './fixtures';

beforeAll(async () => { await initSolver(); });

function line(model: never, q: InfluenceQuantity, node?: number, elem?: number, t = 0.5, n = 20): InfluenceLineResult {
  const r = computeInfluenceLine(model, q, node, elem, t, n);
  if (typeof r === 'string') throw new Error(r);
  return r;
}
/** The ordinate with the load at s on member `elem` (not at the section itself). */
const at = (il: InfluenceLineResult, elem: number, t: number) => {
  const p = il.points.find((x) => x.elementId === elem && Math.abs(x.t - t) < 1e-9 && !('side' in x && x.side));
  if (!p) throw new Error(`no point at e${elem} t=${t}`);
  return p.value;
};
const sides = (il: InfluenceLineResult, elem: number, t: number) => {
  const ps = il.points.filter((x) => x.elementId === elem && Math.abs(x.t - t) < 1e-9 && (x as { side?: string }).side);
  return { left: ps.find((p) => (p as { side?: string }).side === 'left')!.value, right: ps.find((p) => (p as { side?: string }).side === 'right')!.value };
};

describe('simply supported beam, L = 10 m', () => {
  const L = 10;
  const m = simpleBeam(L);
  const handM = (x: number, s: number) => (s <= x ? (s * (L - x)) / L : (x * (L - s)) / L);
  const handV = (x: number, s: number) => (s < x ? -s / L : 1 - s / L);

  it('M at x = L/4: s(L−x)/L left of the section, x(L−s)/L right of it, peak 1.875 at the section', () => {
    const il = line(m, 'M', undefined, 1, 0.25);
    for (const t of [0.1, 0.2, 0.5, 0.75, 0.9]) expect(at(il, 1, t)).toBeCloseTo(handM(2.5, t * L), 9);
    expect(sides(il, 1, 0.25)).toEqual({ left: expect.closeTo(1.875, 9), right: expect.closeTo(1.875, 9) });
  });

  it('M at x = 0 and x = L is zero wherever the load stands', () => {
    for (const t of [0, 1]) for (const p of line(m, 'M', undefined, 1, t).points) expect(Math.abs(p.value)).toBeLessThan(1e-9);
  });

  it('V at x = L/4 jumps from −1/4 to +3/4 at the section', () => {
    const il = line(m, 'V', undefined, 1, 0.25);
    for (const t of [0.1, 0.5, 0.9]) expect(at(il, 1, t)).toBeCloseTo(handV(2.5, t * L), 9);
    const s = sides(il, 1, 0.25);
    expect(s.left).toBeCloseTo(-0.25, 9);
    expect(s.right).toBeCloseTo(0.75, 9);
  });

  it('V just inside the member at x = 0: 0 with the load on the support, 1 just past it', () => {
    const il = line(m, 'V', undefined, 1, 0);
    expect(sides(il, 1, 0)).toEqual({ left: expect.closeTo(0, 9), right: expect.closeTo(1, 9) });
    expect(at(il, 1, 0.5)).toBeCloseTo(0.5, 9);
  });

  it('V just inside the member at x = L: −1 just before the support, 0 with the load on it', () => {
    const il = line(m, 'V', undefined, 1, 1);
    expect(sides(il, 1, 1)).toEqual({ left: expect.closeTo(-1, 9), right: expect.closeTo(0, 9) });
    expect(at(il, 1, 0.5)).toBeCloseTo(-0.5, 9);
  });

  it('the reaction at A is 1 − s/L', () => {
    const il = line(m, 'Rz', 1);
    for (const t of [0, 0.3, 1]) expect(at(il, 1, t)).toBeCloseTo(1 - t, 9);
  });

  it('a section outside [0, L] is refused', () => {
    expect(typeof computeInfluenceLine(m, 'M', undefined, 1, 1.2)).toBe('string');
    expect(typeof computeInfluenceLine(m, 'M', undefined, 1, -0.1)).toBe('string');
  });
});

describe('cantilever, L = 4 m, fixed at x = 0', () => {
  const m = cantilever(4);
  it('M at the root is −s (the top fibre in tension), V is 1, the fixed-end couple is +s', () => {
    const M = line(m, 'M', undefined, 1, 0);
    const V = line(m, 'V', undefined, 1, 0);
    const My = line(m, 'My', 1);
    for (const t of [0.25, 0.5, 1]) {
      expect(at(M, 1, t)).toBeCloseTo(-4 * t, 9);
      expect(at(V, 1, t)).toBeCloseTo(1, 9);
      expect(at(My, 1, t)).toBeCloseTo(4 * t, 9);
    }
  });
});

describe('two equal spans, L = 6 m (Müller-Breslau)', () => {
  const L = 6;
  const m = twoSpan(L);
  it('the middle reaction is ξ(3 − ξ²)/2 with the load in the first span', () => {
    const il = line(m, 'Rz', 2);
    for (const xi of [0.25, 0.5, 0.75]) expect(at(il, 1, xi)).toBeCloseTo((xi * (3 - xi * xi)) / 2, 6);
    expect(at(il, 1, 0.5)).toBeCloseTo(0.6875, 6);
  });

  it('the moment over the middle support is −(L/4)·ξ(1 − ξ²): −0.09375 L at midspan', () => {
    const il = line(m, 'M', undefined, 1, 1);
    for (const xi of [0.25, 0.5, 0.75]) expect(at(il, 1, xi)).toBeCloseTo((-L / 4) * xi * (1 - xi * xi), 6);
    expect(at(il, 1, 0.5)).toBeCloseTo(-0.09375 * L, 6);
    expect(at(il, 2, 0.5)).toBeCloseTo(-0.09375 * L, 6);
  });
});

describe('truss bar', () => {
  it('N in the bottom chord 1–2 is a triangle: 0 at the supports, 2/3 with the load at the middle node', () => {
    const il = line(kingPostTruss(), 'N', undefined, 1, 0.5);
    expect(at(il, 1, 0)).toBeCloseTo(0, 9);
    expect(at(il, 1, 1)).toBeCloseTo(2 / 3, 6);
    expect(at(il, 1, 0.5)).toBeCloseTo(1 / 3, 6);
    expect(at(il, 2, 0.5)).toBeCloseTo(1 / 3, 6);
    expect(at(il, 2, 1)).toBeCloseTo(0, 9);
  });
});

describe('displacement and rotation lines (Maxwell)', () => {
  const L = 10;
  const m = simpleBeam(L);
  const unit = unitSolver(buildSolverInput2D(m as never, false)!);

  it('uz at midspan is −s(3L² − 4s²)/(48EI) for s ≤ L/2 (the load down, uz up)', () => {
    const il = line(m, 'uz', undefined, 1, 0.5);
    for (const t of [0.1, 0.25, 0.5]) {
      const s = t * L;
      expect(at(il, 1, t)).toBeCloseTo((-s * (3 * L * L - 4 * s * s)) / (48 * EI), 12);
    }
  });

  it('the rotation at A, by node and by section x = 0: −s(L−s)(2L−s)/(6EIL)', () => {
    const byNode = line(m, 'ry', 1);
    const bySection = line(m, 'ry', undefined, 1, 0);
    for (const t of [0.2, 0.5, 0.8]) {
      const s = t * L;
      const hand = (-s * (L - s) * (2 * L - s)) / (6 * EI * L);
      expect(at(byNode, 1, t)).toBeCloseTo(hand, 12);
      expect(at(bySection, 1, t)).toBeCloseTo(hand, 12);
    }
  });

  it('equals the target displacement under a unit load at each position (one solve each)', () => {
    const cont = twoSpan(6);
    const u2 = unitSolver(buildSolverInput2D(cont as never, false)!);
    for (const [q, t] of [['uz', 0.3], ['ry', 0.3], ['ux', 0.7]] as const) {
      const il = line(cont, q, undefined, 1, t);
      for (const p of il.points.filter((_, k) => k % 3 === 0)) {
        const brute = targetDisplacement(u2, q, { kind: 'section', elementId: 1, t }, loadOnMember(u2, p.elementId, p.t * 6, 1, { x: 0, z: -1 }));
        expect(p.value).toBeCloseTo(brute, 12);
      }
    }
    expect(unit.loads).toEqual([]);
  });

  it('a rotation is refused where it has no meaning: a hinged member end, a node only hinges reach, a truss bar', () => {
    expect(typeof computeInfluenceLine(m, 'ry', 1)).not.toBe('string');
    const hinged = planeModel([[1, 0, 0], [2, 5, 0], [3, 10, 0]], [[1, 1, 2, 'frame', { hingeI: true }], [2, 2, 3]], [[1, 'pinned'], [3, 'rollerX']]);
    expect(computeInfluenceLine(hinged, 'ry', undefined, 1, 0)).toBe(t('course.influence.err.rotationAtHinge'));
    expect(computeInfluenceLine(hinged, 'ry', 1)).toBe(t('course.influence.err.rotationNoStiffness'));
    expect(typeof computeInfluenceLine(hinged, 'ry', undefined, 1, 0.01)).not.toBe('string');
    expect(computeInfluenceLine(kingPostTruss(), 'ry', undefined, 1, 0.5)).toBe(t('course.influence.err.rotationOnTruss'));
  });
});
