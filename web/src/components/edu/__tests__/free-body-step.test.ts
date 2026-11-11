import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../../../lib/engine/wasm-solver';
import type { ElementForces } from '../../../lib/engine/types';
import { getExerciseSpecs } from '../exercise-data';
import { previewText, solveModel, specNodeIds, variantOf } from '../exercise-variant';
import { remarkSubmission } from '../exercise-marking';
import { questionKeys } from '../exam-grading';
import { toExercise } from '../exercises';
import { readDisplayedReaction } from '../edu-reactions';
import type { ModelSpec } from '../exercise-spec';
import {
  BAR_ENDS, endElement, freeBodyBars, freeBodyKeys, freeBodyTruth, parseFreeBodyKey, studentBalanced,
  type BarTruth, type FreeBodyBar,
} from '../free-body-step';

beforeAll(async () => {
  await initSolver();
});

const resolved = (id: string) => variantOf(getExerciseSpecs().find((s) => s.id === id)!);

function solved(model: ModelSpec): ElementForces[] {
  const r = solveModel(model);
  if (typeof r === 'string') throw new Error(r);
  return r.elementForces as ElementForces[];
}

/** Sum of the end actions and the bar's own loads, counterclockwise about end i: zero for a bar in equilibrium. */
function residual(model: ModelSpec, bar: FreeBodyBar, truth: BarTruth, reaction: (node: number, dof: 'Rx' | 'Ry' | 'M') => number) {
  const [ox, oy] = model.nodes[bar.nodes[0]!]!;
  let fx = 0, fy = 0, m = 0;
  const add = (x: number, y: number, px: number, py: number, mz = 0) => {
    fx += px; fy += py; m += mz + (x - ox) * py - (y - oy) * px;
  };
  for (const end of BAR_ENDS) {
    const [x, y] = model.nodes[endElement(bar, end).node]!;
    add(x, y, truth[end].Fx, truth[end].Fy, -truth[end].M);
  }
  for (const node of bar.nodes.slice(1, -1)) {
    const [x, y] = model.nodes[node]!;
    for (const l of model.nodalLoads ?? []) if (l.node === node) add(x, y, l.fx ?? 0, l.fy ?? 0, l.mz ?? 0);
    if (model.supports.some((sup) => sup.node === node)) add(x, y, reaction(node, 'Rx'), reaction(node, 'Ry'), -reaction(node, 'M'));
  }
  for (const l of model.distributedLoads ?? []) {
    if (!bar.elements.some((e) => e.index === l.element)) continue;
    const [i, j] = model.elements[l.element]!;
    const [xi, yi] = model.nodes[i]!, [xj, yj] = model.nodes[j]!;
    const len = Math.hypot(xj - xi, yj - yi);
    const q = l.qI, total = q * len;
    add((xi + xj) / 2, (yi + yj) / 2, (-(yj - yi) / len) * total, ((xj - xi) / len) * total);
  }
  return { fx, fy, m };
}

describe('free-body bars', () => {
  it('splits a portal frame into its three members', () => {
    const bars = freeBodyBars(resolved('portal-frame').model);
    expect(bars.map((b) => b.nodes)).toEqual([[0, 1], [1, 2], [3, 2]]);
  });

  it('keeps a beam with loads and a support along it as one bar, so it asks nothing', () => {
    expect(freeBodyBars(resolved('overhang-point-load').model)).toEqual([]);
    expect(freeBodyBars(resolved('simply-supported-distributed').model)).toEqual([]);
  });

  it('cuts a Gerber beam at its hinge, not at the support before it', () => {
    const bars = freeBodyBars(resolved('gerber-beam').model);
    expect(bars.map((b) => b.nodes)).toEqual([[0, 1, 2], [2, 3]]);
  });

  it('leaves trusses out', () => {
    expect(freeBodyBars(resolved('simple-truss').model)).toEqual([]);
  });

  it('follows a chain drawn against its own direction', () => {
    const model: ModelSpec = {
      nodes: [[0, 0], [2, 0], [4, 0], [4, 3]],
      elements: [[1, 0], [2, 1], [2, 3]],
      supports: [{ node: 0, type: 'pinned' }, { node: 3, type: 'fixed' }],
    };
    const bars = freeBodyBars(model);
    expect(bars).toHaveLength(2);
    expect(bars[0]!.nodes).toEqual([0, 1, 2]);
    expect(bars[0]!.elements).toEqual([{ index: 0, forward: false }, { index: 1, forward: false }]);
  });
});

describe('free-body truth', () => {
  for (const id of ['portal-frame', 'frame-varying-supports', 'gerber-beam']) {
    it(`balances every bar of ${id}`, () => {
      const ex = resolved(id);
      const bars = freeBodyBars(ex.model);
      const res = solveModel(ex.model);
      if (typeof res === 'string') throw new Error(res);
      const truth = freeBodyTruth(ex.model, bars, res.elementForces as ElementForces[])!;
      const ids = specNodeIds(ex.model);
      const reaction = (node: number, dof: 'Rx' | 'Ry' | 'M') => readDisplayedReaction(res, ids[node]!, dof) ?? 0;
      bars.forEach((bar, b) => {
        const r = residual(ex.model, bar, truth[b]!, reaction);
        expect(Math.abs(r.fx)).toBeLessThan(1e-6);
        expect(Math.abs(r.fy)).toBeLessThan(1e-6);
        expect(Math.abs(r.m)).toBeLessThan(1e-6);
      });
    });
  }

  it('reads a column base as the reaction the first step asks for', () => {
    const ex = resolved('portal-frame');
    const res = solveModel(ex.model);
    if (typeof res === 'string') throw new Error(res);
    const truth = freeBodyTruth(ex.model, freeBodyBars(ex.model), res.elementForces as ElementForces[])!;
    const base = specNodeIds(ex.model)[0]!;
    expect(truth[0]!.i.Fx).toBeCloseTo(readDisplayedReaction(res, base, 'Rx')!, 6);
    expect(truth[0]!.i.Fy).toBeCloseTo(readDisplayedReaction(res, base, 'Ry')!, 6);
    expect(truth[0]!.i.M).toBeCloseTo(readDisplayedReaction(res, base, 'M')!, 6);
  });

  it('carries no moment across a hinge', () => {
    const ex = resolved('gerber-beam');
    const truth = freeBodyTruth(ex.model, freeBodyBars(ex.model), solved(ex.model))!;
    expect(truth[0]!.j.M).toBe(0);
    expect(truth[1]!.i.M).toBe(0);
    expect(truth[0]!.j.Fy).toBeCloseTo(-truth[1]!.i.Fy, 6);
  });
});

describe('free-body answers', () => {
  it('keys every end of every bar and reads them back', () => {
    const bars = freeBodyBars(resolved('portal-frame').model);
    const keys = freeBodyKeys(bars);
    expect(keys).toHaveLength(18);
    expect(parseFreeBodyKey(keys[5]!)).toEqual({ bar: 0, end: 'j', dof: 'M' });
    expect(parseFreeBodyKey('fb:0:k:M')).toBeNull();
  });

  it('tells a balanced wrong diagram from an unbalanced one', () => {
    const ex = resolved('portal-frame');
    const bars = freeBodyBars(ex.model);
    const truth = freeBodyTruth(ex.model, bars, solved(ex.model))!;
    const column = truth[0]!;
    expect(studentBalanced(ex.model, bars[0]!, column, column)).toBe(true);
    const shifted = { i: { ...column.i, Fx: column.i.Fx + 4 }, j: { ...column.j, Fx: column.j.Fx - 4 } };
    const h = ex.model.nodes[1]![1];
    shifted.j.M = column.j.M + 4 * h;
    expect(studentBalanced(ex.model, bars[0]!, shifted, column)).toBe(true);
    expect(studentBalanced(ex.model, bars[0]!, { ...column, i: { ...column.i, Fx: column.i.Fx + 4 } }, column)).toBe(false);
  });
});

describe('free-body answers in a hand-in and an exam', () => {
  const spec = () => getExerciseSpecs().find((s) => s.id === 'portal-frame')!;

  it('asks for them in the exam keys, after the reactions and before the diagrams', () => {
    const keys = questionKeys(variantOf(spec(), 7));
    const first = keys.findIndex((k) => k.startsWith('fb:'));
    expect(keys.filter((k) => k.startsWith('fb:'))).toHaveLength(18);
    expect(keys.slice(0, first).every((k) => k.startsWith('r:') || k.startsWith('k'))).toBe(true);
    expect(keys.slice(first + 18).some((k) => k.startsWith('fb:'))).toBe(false);
  });

  it('marks them again from the seed, keeping the sign', () => {
    const ex = variantOf(spec(), 7);
    const bars = freeBodyBars(ex.model);
    const truth = freeBodyTruth(ex.model, bars, solved(ex.model))!;
    const answers = freeBodyKeys(bars).map((key) => {
      const k = parseFreeBodyKey(key)!;
      const v = truth[k.bar]![k.end][k.dof];
      return { key, label: key, answer: (key === 'fb:1:j:Fy' ? -v : v).toFixed(3), outcome: 'pending' as const };
    });
    const remark = remarkSubmission(spec(), {
      stabileoSubmission: 1, exerciseId: ex.id, exerciseTitle: ex.title, student: '', submittedAt: '', answers, seed: 7,
    })!;
    const wrong = remark.answers.filter((a) => a.outcome !== 'correct').map((a) => a.key);
    expect(Math.abs(truth[1]!.j.Fy)).toBeGreaterThan(0.5);
    expect(wrong).toEqual(['fb:1:j:Fy']);
  });

  it('can be turned off by the author, and a one-bar exercise never has it', () => {
    expect(toExercise(variantOf({ ...spec(), freeBody: false })).freeBody).toBeUndefined();
    expect(toExercise(variantOf(spec())).freeBody?.bars).toHaveLength(3);
    expect(toExercise(resolved('cantilever-point')).freeBody).toBeUndefined();
  });
});

describe('the exercise list', () => {
  it('reads every built-in statement without a raw parameter', () => {
    for (const s of getExerciseSpecs()) {
      expect(previewText(s.title, s.params), s.id).not.toMatch(/\{[A-Za-z_]/);
      expect(previewText(s.description, s.params), s.id).not.toMatch(/\{[A-Za-z_]/);
    }
  });

  it('shows a parameter as its range', () => {
    const params = { values: { L: { min: 4, max: 8, step: 0.5 }, P: { min: 10, max: 10, step: 5 } } };
    expect(previewText('{L} m with {P} kN and {x}', params)).toBe('4–8 m with 10 kN and {x}');
  });
});
