import { describe, expect, it } from 'vitest';
import {
  defaultVariant, drawVariant, evalExpr, exprNames, ExprError, lintParams, rangeValues, resolveModel, seedFrom,
  type ExerciseParams, type ParametricModelSpec,
} from '../exercise-params';

const beam: ParametricModelSpec = {
  nodes: [[0, 0], ['L', 0]],
  elements: [[0, 1]],
  supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }],
  nodalLoads: [{ node: 1, mz: 'M' }],
  distributedLoads: [{ element: 0, qI: '-q', qJ: '-q/2' }],
};
const params: ExerciseParams = {
  values: { L: { min: 4, max: 8, step: 0.5 }, q: { min: 2, max: 10, step: 1 }, M: { min: 0, max: 0.3, step: 0.1 } },
  supportChoices: [{ support: 0, types: ['pinned', 'fixed'] }],
};

describe('exercise params', () => {
  it('lists a range without float drift', () => {
    expect(rangeValues({ min: 0, max: 0.3, step: 0.1 })).toEqual([0, 0.1, 0.2, 0.3]);
    expect(rangeValues({ min: 1, max: 0, step: 1 })).toEqual([]);
    expect(rangeValues({ min: 0, max: 1, step: 0 })).toEqual([]);
    expect(rangeValues({ min: 0, max: 3e-7, step: 1e-7 })).toEqual([0, 1e-7, 2e-7, 3e-7]);
  });

  it('gives the same variant for the same seed and different ones across a class', () => {
    const a = drawVariant(params, seedFrom('legajo-104233'));
    expect(drawVariant(params, seedFrom('legajo-104233'))).toEqual(a);
    const distinct = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(drawVariant(params, seedFrom(`s${i}`)))));
    expect(distinct.size).toBeGreaterThan(30);
  });

  it('does not change a variant when the authored parameters are reordered', () => {
    const reordered: ExerciseParams = { ...params, values: { M: params.values.M!, q: params.values.q!, L: params.values.L! } };
    expect(drawVariant(reordered, 7)).toEqual(drawVariant(params, 7));
  });

  it('keeps every drawn value on its range', () => {
    for (let s = 0; s < 200; s++) {
      const v = drawVariant(params, s);
      expect(rangeValues(params.values.L!)).toContain(v.values.L);
      expect(['pinned', 'fixed']).toContain(v.supports[0]);
    }
  });

  it('resolves the structure of a variant', () => {
    const m = resolveModel(beam, { values: { L: 6, q: 4, M: 0.2 }, supports: { 0: 'fixed' } });
    expect(m.nodes).toEqual([[0, 0], [6, 0]]);
    expect(m.supports).toEqual([{ node: 0, type: 'fixed' }, { node: 1, type: 'rollerX' }]);
    expect(m.distributedLoads).toEqual([{ element: 0, qI: -4, qJ: -2 }]);
    expect(m.nodalLoads).toEqual([{ node: 1, mz: 0.2 }]);
  });

  it('evaluates precedence, unary minus and parentheses', () => {
    expect(evalExpr('-(L - 2) * 3 / 2 + 1', { L: 6 })).toBe(-5);
    expect(evalExpr('2e1 / -L', { L: 4 })).toBe(-5);
  });

  it('refuses anything outside the grammar', () => {
    for (const bad of ['L; alert(1)', 'constructor', 'L**2', '(L', 'L/0', 'x'.repeat(201)]) {
      expect(() => evalExpr(bad, { L: 1 })).toThrow(ExprError);
    }
  });

  it('does not take what every object inherits for a parameter', () => {
    expect(() => evalExpr('2*constructor', { L: 1 })).toThrow(/unknown parameter constructor/);
    expect(lintParams({ ...beam, nodes: [[0, 0], ['toString', 0]] }, params).some((p) => p.includes('unknown parameter toString'))).toBe(true);
  });

  it('lints unknown names, empty ranges and missing supports', () => {
    const problems = lintParams(
      { ...beam, nodes: [[0, 0], ['Lx', 0]] },
      { values: { L: { min: 1, max: 0, step: 1 }, q: params.values.q!, M: params.values.M! }, supportChoices: [{ support: 5, types: ['fixed'] }] },
    );
    expect(problems.some((p) => p.includes('unknown parameter Lx'))).toBe(true);
    expect(problems.some((p) => p.includes('parameter L has no values'))).toBe(true);
    expect(problems.some((p) => p.includes('support 5'))).toBe(true);
    expect(lintParams(beam, params)).toEqual([]);
  });

  it('starts from the middle of each range', () => {
    expect(defaultVariant(params).values).toEqual({ L: 6, q: 6, M: 0.1 });
    expect(defaultVariant(params).supports).toEqual({ 0: 'pinned' });
  });

  it('reads numbers in scientific notation as numbers, never their exponent as a parameter', () => {
    expect(exprNames('1e-5*L2 + 2E+3/q + x1')).toEqual(['L2', 'q', 'x1']);
    expect(lintParams({ nodes: [[0, 0], ['1e-3*L', 0]], elements: [[0, 1]], supports: [] }, { values: { L: { min: 1, max: 2, step: 1 } } })).toEqual([]);
  });
});
