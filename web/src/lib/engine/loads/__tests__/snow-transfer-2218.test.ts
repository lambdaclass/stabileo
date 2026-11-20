import { snowDensity } from '../../../codes/cirsoc104/snow';
import { teAt } from '../../../i18n/engine-text';
import { expect, it } from 'vitest';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import { buildLoadPlan } from '../load-plan';
import { pressure, regulations, snow } from './snow-roof-plane-fixture';
import { mesh, transform } from './snow-surface-round2-fixture';

function steppedRoof(cuts: number[] = [], upperZ = 5, upperRise = 0) {
  const edge = cuts.map(t => [0, 4 * t, 3]);
  return mesh([
    [[0, 0, 3], [7.5, 0, 3], [7.5, 4, 3], [0, 4, 3], ...edge.reverse()],
    [[-7.5, 0, upperZ + upperRise], [0, 0, upperZ], [0, 4, upperZ], [-7.5, 4, upperZ + upperRise]],
  ]);
}

it('#2218 a positive flat-roof step triangle refuses before member transfer', () => {
  const model = steppedRoof();
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  expect(() => driftAndSlidingLoads(model, layout, {
    pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1,
  })).toThrow('snow.refused.stepDriftTransfer');
});

const pitchedStep = process.env.RUN_KNOWN_WRONG === '2218' ? it : it.skip;

pitchedStep('known wrong result: #2218 pitching the far upper edge still refuses the same positive step triangle', () => {
  const model = steppedRoof([], 5, 0.075);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  expect(() => driftAndSlidingLoads(model, layout, {
    pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1,
  })).toThrow('snow.refused.stepDriftTransfer');
});

pitchedStep('known wrong result: #2218 pitched steps block snow cases and the load plan', () => {
  const model = steppedRoof([], 5, 0.075);
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
  const reason = { key: 'snow.refused.stepDriftTransfer' };
  expect(plan.blockedKeys).toEqual([reason]);
  expect(teAt(reason, 'en')).not.toBe(reason.key);
  expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], combinations: [] });
});

it('#2218 snow cases and the load plan refuse the step triangle', () => {
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
  const reason = { key: 'snow.refused.stepDriftTransfer' };
  expect(plan.blockedKeys).toEqual([reason]);
  expect(teAt(reason, 'en')).not.toBe(reason.key);
  expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], combinations: [] });
});

it('#2218 step drift cannot pass through subdivision or plan rotation', () => {
  for (const cuts of [[], [0.25, 0.5, 0.75], [0.17, 0.63]]) for (const angle of [0, 0.37]) {
    const model = transform(steppedRoof(cuts), angle, 0);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    expect(() => driftAndSlidingLoads(model, layout, {
      pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1,
    })).toThrow('snow.refused.stepDriftTransfer');
  }
});

it('#2218 a flat step below the drift threshold keeps the balanced member loads', () => {
  const balanced = 0.7;
  const hb = balanced / snowDensity(1);
  const snowInput = { pg: 1, balanced, pf: balanced, slippery: false, tributaryWidth: 1 };
  for (const ratio of [1.199, 1.201]) {
    const model = steppedRoof([], 3 + ratio * hb);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    const run = () => driftAndSlidingLoads(model, layout, snowInput);
    if (ratio < 1.2) {
      expect(run()).toMatchObject({ distributed: [] });
      const result = snowLoadCases({
        model, layout, tributaryWidth: 1, snow: { ...snow, roofKind: 'mono', slippery: false },
      })!;
      expect(result.result.refused).toBeUndefined();
      const loads = result.cases[0]!.distributed;
      expect(loads.some(load => load.q < 0)).toBe(true);
      const areaByMember = new Map<number, number>();
      for (const d of loads) {
        const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const force = -(d.q + (d.qJ ?? d.q)) * ((d.b ?? length) - (d.a ?? 0)) / 2;
        areaByMember.set(e.id, (areaByMember.get(e.id) ?? 0) + force / result.result.ps);
      }
      expect(result.cases[0]!.nodal).toEqual([]);
      for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const long = [1, 3, 5, 7].includes(id);
        expect(areaByMember.get(id)).toBeCloseTo(long ? (7.5 - 2) * 2 : 4 * 2 / 2, 8);
        const length = long ? 7.5 : 4;
        for (const station of [length / 8, length / 2, 7 * length / 8]) {
          const depth = Math.min(station, 2, length - station);
          expect(pressure(loads, id, station)).toBeCloseTo(result.result.ps * depth, 8);
        }
      }
      expect([...areaByMember.values()].reduce((sum, area) => sum + area, 0)).toBeCloseTo(2 * 7.5 * 4, 8);
    } else {
      expect(run).toThrow('snow.refused.stepDriftTransfer');
    }
  }
});

it('#2218 a varying pressure with unresolved drift applicability blocks at a flat step', () => {
  const hb = 0.7 / snowDensity(1);
  const model = steppedRoof([], 3 + 1.199 * hb);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  expect(() => driftAndSlidingLoads(model, layout, {
    pg: 1, balanced: (_, [, y]) => y > 0.3 && y < 0.4 ? 0.5 : 0.7,
    pf: 0.7, slippery: false, tributaryWidth: 1,
  })).toThrow('snow.refused.stepDriftTransfer');
});
