/**
 * Loading an influence line: g everywhere, q where the line has the sign sought, P at its peak,
 * against the brute force (every pattern of q over the spans, solved directly) and against a
 * direct solve of the pattern chosen.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solve } from '../../wasm-solver';
import { computeInfluenceLine } from '../../influence-service';
import { buildSolverInput2D } from '../../solver-service';
import { loadOnMember } from '../../moving-loads';
import { unitSolver, readForce, memberGeom } from '../unit-sweep';
import { ilExtremes, ilAreas, extremeLoads, uniformAlong, defaultLoadedMembers } from '../areas';
import { ilEnvelopeAlong } from '../envelope-along';
import type { IlTarget } from '../quantities';
import type { InfluenceQuantity } from '../../../store/model.svelte';
import { simpleBeam, threeSpan } from './fixtures';

beforeAll(async () => { await initSolver(); });

const DOWN = { x: 0, z: -1 };

function setup(model: never, q: InfluenceQuantity, target: IlTarget, n = 20) {
  const unit = unitSolver(buildSolverInput2D(model, false)!);
  const il = computeInfluenceLine(model, q, target.kind === 'node' ? target.nodeId : undefined, target.kind === 'section' ? target.elementId : undefined, target.kind === 'section' ? target.t : 0.5, n);
  if (typeof il === 'string') throw new Error(il);
  const lengthOf = (id: number) => memberGeom(unit, id).L;
  const read = (loads: ReturnType<typeof uniformAlong>) => readForce(q, solve({ ...unit, loads }), unit, target);
  return { unit, il, lengthOf, read };
}

describe('areas of a simple beam line', () => {
  it('M at midspan of L = 8: the triangle of height L/4 has area L²/8 = 8; V at midspan: ±L/8 = ±1', () => {
    const M = setup(simpleBeam(8), 'M', { kind: 'section', elementId: 1, t: 0.5 });
    const a = ilAreas(M.il.points, M.lengthOf, () => true);
    expect(a.pos).toBeCloseTo(8, 9);
    expect(a.neg).toBeCloseTo(0, 12);
    const V = setup(simpleBeam(8), 'V', { kind: 'section', elementId: 1, t: 0.5 });
    const b = ilAreas(V.il.points, V.lengthOf, () => true);
    expect(b.pos).toBeCloseTo(1, 9);
    expect(b.neg).toBeCloseTo(-1, 9);
    expect(b.posZones).toEqual([{ elementId: 1, t0: 0.5, t1: 1 }]);
    expect(b.negZones).toEqual([{ elementId: 1, t0: 0, t1: 0.5 }]);
  });

  it('V at midspan with q on the positive half and P at its peak: qL/8 + P/2, and the solve agrees', () => {
    const V = setup(simpleBeam(8), 'V', { kind: 'section', elementId: 1, t: 0.5 });
    const loads = { g: 0, q: 10, P: 20 };
    const ex = ilExtremes(V.il.points, V.lengthOf, () => true, loads, 'zones');
    expect(ex.max.value).toBeCloseTo(10 + 10, 9);
    expect(ex.min.value).toBeCloseTo(-10 - 10, 9);
    expect(ex.max.pointAt).toMatchObject({ elementId: 1, t: 0.5, side: 'right' });
    const pt = (id: number, a: number, w: number) => loadOnMember(V.unit, id, a, w, DOWN);
    expect(V.read(extremeLoads(V.unit, [1], loads, ex.max, DOWN, pt))).toBeCloseTo(ex.max.value, 4);
    expect(V.read(extremeLoads(V.unit, [1], loads, ex.min, DOWN, pt))).toBeCloseTo(ex.min.value, 4);
  });
});

describe('three spans of 6 m: the extremes by areas equal the worst pattern of q over the spans', () => {
  const model = threeSpan(6);
  const loads = { g: 10, q: 15, P: 0 };
  for (const [q, target] of [
    ['M', { kind: 'section', elementId: 1, t: 0.4 }],
    ['M', { kind: 'section', elementId: 2, t: 0 }],
    ['V', { kind: 'section', elementId: 2, t: 0 }],
    ['Rz', { kind: 'node', nodeId: 2 }],
  ] as const) {
    it(`${q} at ${JSON.stringify(target)}`, () => {
      const s = setup(model as never, q, target as IlTarget, 40);
      const ex = ilExtremes(s.il.points, s.lengthOf, () => true, loads, 'spans');
      const all = [1, 2, 3];
      let bruteMax = -Infinity, bruteMin = Infinity;
      for (let mask = 0; mask < 8; mask++) {
        const ls = all.flatMap((id) => uniformAlong(s.unit, id, 0, 6, loads.g, DOWN));
        for (const id of all) if (mask & (1 << (id - 1))) ls.push(...uniformAlong(s.unit, id, 0, 6, loads.q, DOWN));
        const v = s.read(ls);
        bruteMax = Math.max(bruteMax, v);
        bruteMin = Math.min(bruteMin, v);
      }
      const scale = Math.max(Math.abs(bruteMax), Math.abs(bruteMin));
      expect(Math.abs(ex.max.value - bruteMax)).toBeLessThan(2e-3 * scale);
      expect(Math.abs(ex.min.value - bruteMin)).toBeLessThan(2e-3 * scale);
      const pt = (id: number, a: number, w: number) => loadOnMember(s.unit, id, a, w, DOWN);
      expect(s.read(extremeLoads(s.unit, all, loads, ex.max, DOWN, pt))).toBeCloseTo(bruteMax, 6);
      expect(s.read(extremeLoads(s.unit, all, loads, ex.min, DOWN, pt))).toBeCloseTo(bruteMin, 6);
    });
  }

  it('the moment over the first interior support: q on spans 1 and 2 for the hogging extreme', () => {
    const s = setup(model as never, 'M', { kind: 'section', elementId: 1, t: 1 }, 40);
    const ex = ilExtremes(s.il.points, s.lengthOf, () => true, loads, 'spans');
    expect(ex.min.members.sort()).toEqual([1, 2]);
    expect(ex.max.members).toEqual([3]);
  });
});

describe('the envelope along the members', () => {
  it('a simple beam under g and q: M from 0 to (g+q)L²/8 at midspan, V ±(gL/2 + qL/2) at the ends', () => {
    const unit = unitSolver(buildSolverInput2D(simpleBeam(8) as never, false)!);
    const env = ilEnvelopeAlong(unit, 'M', { g: 10, q: 5, P: 0 }, 'zones', DOWN, defaultLoadedMembers(unit, DOWN));
    const mid = env.members[0].t.indexOf(0.5);
    expect(env.members[0].max[mid]).toBeCloseTo((15 * 64) / 8, 6);
    expect(env.members[0].min[mid]).toBeCloseTo((10 * 64) / 8, 6);
    const V = ilEnvelopeAlong(unit, 'V', { g: 10, q: 5, P: 0 }, 'zones', DOWN, [1]);
    expect(V.members[0].max[0]).toBeCloseTo(60, 6);
    expect(V.members[0].min[V.members[0].t.length - 1]).toBeCloseTo(-60, 6);
    // At midspan q on one half only: g·0 + q·L/8 = 5.
    expect(V.members[0].max[mid]).toBeCloseTo(5, 6);
    expect(V.members[0].min[mid]).toBeCloseTo(-5, 6);
  });
});
