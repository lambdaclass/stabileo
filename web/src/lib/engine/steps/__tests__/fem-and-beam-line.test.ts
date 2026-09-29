/**
 * The fixed-end action table and the beam reading against the engine: on a
 * beam fixed at both ends the end moments ARE the fixed-end moments, whichever
 * way the beam was drawn, for every kind of load.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import { planeModel } from '../plane-model';
import { fixedEnd } from '../fem';
import { beamLine } from '../beam-line';
import { solveReference } from '../reference';
import { num } from '../format';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

function fixedFixed(reverse: boolean, load: (e: number) => void) {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
  const e = reverse ? modelStore.addElement(b, a) : modelStore.addElement(a, b);
  modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'fixed');
  load(e);
  const input = modelStore.buildSolverInput(false)!;
  const pm = planeModel(input);
  const m = pm.members.get(e)!;
  const fe = fixedEnd(m, pm.memberLoads, { i: 'I', j: 'J' });
  const ref = solveReference(input)!;
  return { fe, ref: { ...ref.endMoments.get(e)!, ...ref.endShears.get(e)! } };
}

const cases: Array<[string, (e: number) => void]> = [
  ['uniform', (e) => modelStore.addDistributedLoad(e, -10, -10)],
  ['triangular', (e) => modelStore.addDistributedLoad(e, 0, -12)],
  ['trapezoid', (e) => modelStore.addDistributedLoad(e, -4, -10)],
  ['partial', (e) => modelStore.addDistributedLoad(e, -8, -8, undefined, undefined, undefined, 1, 4)],
  ['point', (e) => modelStore.addPointLoadOnElement(e, 2, -15)],
  ['couple', (e) => modelStore.addPointLoadOnElement(e, 2, 0, { my: 20 })],
];

describe('fixed-end actions against the engine', () => {
  for (const [name, load] of cases) {
    for (const reverse of [false, true]) {
      it(`${name}${reverse ? ', drawn right to left' : ''}`, () => {
        const { fe, ref } = fixedFixed(reverse, load);
        expect(fe.Mi).toBeCloseTo(ref.Mi, 6);
        expect(fe.Mj).toBeCloseTo(ref.Mj, 6);
        expect(fe.Vi).toBeCloseTo(ref.Vi, 6);
        expect(fe.Vj).toBeCloseTo(ref.Vj, 6);
      });
    }
  }

  it('shows wL²/12 for a uniform load', () => {
    const { fe } = fixedFixed(false, (e) => modelStore.addDistributedLoad(e, -10, -10));
    expect(fe.terms[0].formula.M).toContain('\\frac{wL^2}{12}');
    expect(fe.Mi).toBeCloseTo(10 * 36 / 12, 9);
  });
});

describe('the beam, read left to right', () => {
  it('spans between supports, an overhang past the last one, loads downward positive', () => {
    const n = [0, 4, 7, 10, 12].map((x) => modelStore.addNode(x, 0));
    const e1 = modelStore.addElement(n[0], n[1]);
    const e2 = modelStore.addElement(n[2], n[1]); // drawn right to left
    const e3 = modelStore.addElement(n[2], n[3]);
    const e4 = modelStore.addElement(n[3], n[4]);
    modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'rollerX'); modelStore.addSupport(n[3], 'rollerX');
    modelStore.addDistributedLoad(e1, -5, -5);
    modelStore.addDistributedLoad(e2, -6, -6);
    modelStore.addNodalLoad(n[2], 0, -20, 0);
    modelStore.addNodalLoad(n[4], 0, -3, 0);
    void e3; void e4;
    const r = beamLine(planeModel(modelStore.buildSolverInput(false)!));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = r.beam;
    expect(b.spans.map((s) => s.L)).toEqual([4, 6]);
    expect(b.spans[1].inner.map((x) => x.x)).toEqual([3]);
    expect(b.overhangs).toHaveLength(1);
    expect(b.overhangs[0].side).toBe('right');
    expect(b.overhangs[0].L).toBe(2);
    // Span 2: the flipped member's load is downward 6 over [0, 3], the node load 20 at 3.
    const s2 = b.spans[1].loads;
    expect(s2).toContainEqual({ kind: 'dist', a: 0, b: 3, wa: 6, wb: 6 });
    expect(s2).toContainEqual({ kind: 'point', a: 3, P: 20 });
    expect(b.overhangs[0].loads).toContainEqual({ kind: 'point', a: 2, P: 3 });
  });

  it('refuses what is not a straight beam, and says why', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(4, 3);
    modelStore.addElement(a, b); modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed');
    const r = beamLine(planeModel(modelStore.buildSolverInput(false)!));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.reason.key).toBe('steps.req.beam.horizontal');
  });
});

describe('number format', () => {
  it('four significant figures, powers of ten for the very large and small', () => {
    expect(num(37.5)).toBe('37.5');
    expect(num(8888.888)).toBe('8889');
    expect(num(-0.0011773)).toBe('-0.001177');
    expect(num(2e8)).toBe('2 \\cdot 10^{8}');
    expect(num(0.0001)).toBe('10^{-4}');
  });
});
