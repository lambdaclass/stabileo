import { expect, it } from 'vitest';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import { buildLoadPlan } from '../load-plan';
import { regulations, snow } from './snow-roof-plane-fixture';
import { mesh, transform } from './snow-surface-round2-fixture';

function steppedRoof(cuts: number[] = [], upperZ = 5) {
  const edge = cuts.map(t => [0, 4 * t, 3]);
  return mesh([
    [[0, 0, 3], [7.5, 0, 3], [7.5, 4, 3], [0, 4, 3], ...edge.reverse()],
    [[-7.5, 0, upperZ], [0, 0, upperZ], [0, 4, upperZ], [-7.5, 4, upperZ]],
  ]);
}

const regression = process.env.RUN_KNOWN_WRONG === '2218' ? it : it.skip;

regression('known wrong result: #2218 the step triangle retains force and both physical first moments', () => {
  const model = steppedRoof();
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = driftAndSlidingLoads(model, layout, { pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1 });
  const actual = out.distributed.reduce((v, d) => {
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y), lo = d.a ?? 0, hi = d.b ?? L;
    const q0 = -d.q, q1 = -(d.qJ ?? d.q), F = (hi - lo) * (q0 + q1) / 2;
    const first = (hi - lo) ** 2 * (q0 + 2 * q1) / 6;
    return [v[0]! + F, v[1]! + (a.x + (b.x - a.x) * lo / L) * F + (b.x - a.x) / L * first,
      v[2]! + (a.y + (b.y - a.y) * lo / L) * F + (b.y - a.y) / L * first];
  }, [0, 0, 0]);
  expect(actual[0]).toBeCloseTo(3.049542288, 10);
  expect(actual[1]).toBeCloseTo(1.549167482304, 10);
  expect(actual[2]).toBeCloseTo(6.099084576, 10);
});

regression('known wrong result: #2218 snow cases and the load plan refuse the step triangle', () => {
  const model = steppedRoof();
  const gravity = { mode: 'panels' } as const;
  const config = { ...snow, roofKind: 'mono', slippery: false } as const;
  const layout = gravityLayout(model, { ...gravity, tributaryWidth: 1 });
  const direct = snowLoadCases({ model, snow: config, tributaryWidth: 1, layout })!;
  expect(direct).toMatchObject({ result: { refused: 'snow.refused.stepDriftTransfer' }, cases: [] });
  expect(direct.flatRoof).toBeUndefined();
  const plan = buildLoadPlan({
    model, gravity, regulations: regulations(), dead: [], occupancyKey: 'vivienda', tributaryWidth: 1,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
    snow: { ...config, enabled: true, source: 'site' },
  });
  expect(plan.outcome).toBe('BLOCKED');
  expect(plan.blockedKeys).toEqual([{ key: 'snow.refused.stepDriftTransfer' }]);
  expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], combinations: [] });
});

regression('known wrong result: #2218 step drift cannot pass through subdivision or plan rotation', () => {
  for (const cuts of [[], [0.25, 0.5, 0.75], [0.17, 0.63]]) for (const angle of [0, 0.37]) {
    const model = transform(steppedRoof(cuts), angle, 0);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    expect(() => driftAndSlidingLoads(model, layout, {
      pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1,
    })).toThrow('snow.refused.stepDriftTransfer');
  }
});
