import { stepDrift } from '../../../codes/cirsoc104/drift';
import { snowDensity } from '../../../codes/cirsoc104/snow';
import { teAt } from '../../../i18n/engine-text';
import { expect, it } from 'vitest';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { gravityLayout } from '../plan-gravity';
import { snowRoofSteps } from '../snow-roof-surfaces';
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

it('#2218 pitching the far upper edge still refuses the same positive step triangle', () => {
  for (const upperRise of [0.00025, 0.075]) {
    const model = steppedRoof([], 5, upperRise);
    const panels = gravityLayout(steppedRoof(), { mode: 'panels', tributaryWidth: 1 });
    expect(snowRoofSteps(model, panels)).toHaveLength(1);
    for (const layout of [panels, { ...gravityLayout(model, { mode: 'width', tributaryWidth: 1 }), panels: panels.panels }]) {
      expect(() => driftAndSlidingLoads(model, layout, {
        pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1,
      })).toThrow('snow.refused.stepDriftTransfer');
    }
  }
});

it('#2218 pitched steps block snow cases and the load plan', () => {
  const model = steppedRoof([], 5, 0.00025);
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

it('#2218 shallow pitched steps below the threshold produce no transferred surcharge', () => {
  const balanced = 0.7;
  const hb = balanced / snowDensity(1);
  const model = steppedRoof([], 3 + 1.199 * hb, 0.00025);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  expect(snowRoofSteps(model, layout)).toHaveLength(1);
  const result = driftAndSlidingLoads(model, layout, { pg: 1, balanced, pf: balanced, slippery: false, tributaryWidth: 1 });
  expect(result.distributed).toEqual([]);
  expect(result.derivation.filter(d => d.key !== 'snow.derivation.noSliding').map(d => d.key)).toEqual(Array(3).fill('snow.derivation.noDrift'));
});

it('#2218 flat and pitched fixtures share the physical triangle oracle', () => {
  const { pd, w } = stepDrift({ pg: 1, balanced: 0.7, stepHeight: 2, luUpper: 7.5, luLower: 7.5 });
  const force = 4 * pd * w / 2;
  expect(force).toBeCloseTo(3.049542288, 10);
  expect(force * w / 3).toBeCloseTo(1.549167482304, 10);
  expect(force * 2).toBeCloseTo(6.099084576, 10);
});

const transferOracle = process.env.RUN_KNOWN_WRONG === '2218' ? it : it.skip;

transferOracle('known wrong result: #2218 the step triangle retains force and both physical first moments', () => {
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

transferOracle('known wrong result: #2218 a one-way roof delivers both exact step-drift bearing reactions', () => {
  const balanced = 0.7;
  const gravity = { mode: 'panels', slab: 'oneWay', spanAxis: 'x' } as const;
  const config = { ...snow, roofKind: 'mono', slippery: false, partial: false } as const;
  for (const cuts of [[], [0.17, 0.63]]) for (const angle of [0, 0.37]) for (const rise of [0, 0.075]) {
    const model = transform(steppedRoof(cuts, 5, rise), angle, 0);
    const layout = gravityLayout(model, { ...gravity, tributaryWidth: 1 });
    const transfer = driftAndSlidingLoads(model, layout, { pg: 1, balanced, pf: balanced, slippery: false, tributaryWidth: 1 }).distributed;
    const forceBySide = [0, 0];
    for (const load of transfer) {
      const member = model.elements.get(load.elementId)!;
      const a = model.nodes.get(member.nodeI)!, b = model.nodes.get(member.nodeJ)!;
      const x = a.x * Math.cos(angle) + a.y * Math.sin(angle);
      const side = Math.round(x / 7.5);
      expect(x).toBeCloseTo(side * 7.5, 10);
      expect(b.x * Math.cos(angle) + b.y * Math.sin(angle)).toBeCloseTo(side * 7.5, 10);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const force = -(load.q + (load.qJ ?? load.q)) * ((load.b ?? length) - (load.a ?? 0)) / 2;
      forceBySide[side] = forceBySide[side]! + force;
      expect(load.q).toBeCloseTo(-(side === 0 ? 3.049542288 - 1.549167482304 / 7.5 : 1.549167482304 / 7.5) / 4, 10);
    }
    expect(forceBySide[0]).toBeCloseTo(3.049542288 - 1.549167482304 / 7.5, 10);
    expect(forceBySide[1]).toBeCloseTo(1.549167482304 / 7.5, 10);
    const direct = snowLoadCases({ model, snow: config, tributaryWidth: 1, layout })!;
    expect(direct.result.refused).toBeUndefined();
    const plan = buildLoadPlan({
      model, gravity, regulations: regulations(), dead: [], occupancyKey: 'vivienda', tributaryWidth: 1,
      reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
      snow: { ...config, enabled: true, source: 'site' },
    });
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    expect(plan.distributed.filter(load => load.caseType === 'S').length).toBeGreaterThan(0);
  }
});
