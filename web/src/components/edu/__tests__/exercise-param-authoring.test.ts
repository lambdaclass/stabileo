import { describe, expect, it } from 'vitest';
import { paramTargets, parametrize, stations, suggestBinding, suggestRange } from '../exercise-param-authoring';
import { resolveModel } from '../exercise-params';
import type { ModelSpec } from '../exercise-spec';

const overhang: ModelSpec = {
  nodes: [[0, 0], [2, 0], [6, 0], [7.5, 0]],
  elements: [[0, 1], [1, 2], [2, 3]],
  supports: [{ node: 0, type: 'pinned' }, { node: 2, type: 'rollerX' }],
  nodalLoads: [{ node: 1, fy: -12 }, { node: 3, fy: -5, fx: 2 }],
  distributedLoads: [{ element: 2, qI: -4, qJ: -2 }],
};

describe('turning a drawn structure into parameters', () => {
  it('offers the spans between stations and every load', () => {
    expect(stations([6, 0, 2, 2.0000001, 7.5])).toEqual([0, 2, 6, 7.5]);
    const kinds = paramTargets(overhang).map((x) => `${x.target.kind}:${x.target.index}=${x.value}`);
    expect(kinds).toEqual(['segX:0=2', 'segX:1=4', 'segX:2=1.5', 'fy:0=12', 'fx:1=2', 'fy:1=5', 'q:0=4']);
  });

  it('a varying span moves what lies beyond it and keeps the overhang', () => {
    const L = suggestBinding(overhang, { kind: 'segX', index: 1 }, []);
    expect(L.name).toBe('L');
    const { model, params } = parametrize({ model: overhang, bindings: [L], supportChoices: [] });
    expect(model.nodes.map(([x]) => x)).toEqual([0, 2, '2 + L', '3.5 + L']);
    const at = resolveModel(model, { values: { L: 5 }, supports: {} });
    expect(at.nodes.map(([x]) => x)).toEqual([0, 2, 7, 8.5]);
    expect(params?.values.L).toMatchObject({ min: 2, max: 6, step: 0.5, unit: 'm' });
  });

  it('loads vary in magnitude and keep their sign and their shape', () => {
    const P = suggestBinding(overhang, { kind: 'fy', index: 0 }, []);
    const q = suggestBinding(overhang, { kind: 'q', index: 0 }, ['P']);
    const { model } = parametrize({ model: overhang, bindings: [P, q], supportChoices: [] });
    expect(model.nodalLoads![0]).toEqual({ node: 1, fy: '-P' });
    expect(model.distributedLoads![0]).toEqual({ element: 2, qI: '-q', qJ: '-0.5 * q' });
    const at = resolveModel(model, { values: { P: 20, q: 10 }, supports: {} });
    expect(at.nodalLoads![0]!.fy).toBe(-20);
    expect(at.distributedLoads![0]).toEqual({ element: 2, qI: -10, qJ: -5 });
  });

  it('names stay unique, and a support choice of one type is no choice', () => {
    expect(suggestBinding(overhang, { kind: 'fy', index: 1 }, ['P', 'P2']).name).toBe('P3');
    expect(parametrize({ model: overhang, bindings: [], supportChoices: [{ support: 1, types: ['rollerX'] }] }).params).toBeUndefined();
    const r = parametrize({ model: overhang, bindings: [], supportChoices: [{ support: 1, types: ['rollerX', 'pinned'] }] });
    expect(r.model).toEqual(overhang);
    expect(r.params).toEqual({ values: {}, supportChoices: [{ support: 1, types: ['rollerX', 'pinned'] }] });
  });

  it('suggests round ranges that contain the drawn value', () => {
    expect(suggestRange('fy', 12)).toEqual({ min: 5, max: 20, step: 5, unit: 'kN' });
    expect(suggestRange('segX', 8)).toEqual({ min: 4, max: 12, step: 0.5, unit: 'm' });
    for (const v of [0.3, 1, 3.7, 15, 48]) {
      const r = suggestRange('q', v);
      expect(r.min).toBeLessThanOrEqual(Math.max(v, r.step));
      expect(r.max).toBeGreaterThanOrEqual(v);
    }
  });
});
