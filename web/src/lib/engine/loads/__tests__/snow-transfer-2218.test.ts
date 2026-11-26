import { stepDrift } from '../../../codes/cirsoc104/drift';
import { snowDensity } from '../../../codes/cirsoc104/snow';
import { teAt } from '../../../i18n/engine-text';
import { expect, it } from 'vitest';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { gravityLayout } from '../plan-gravity';
import { roofSurfaceModel, snowRoofEdgePairs, snowRoofSteps } from '../snow-roof-surfaces';
import { snowLoadCases } from '../snow-loads';
import { buildLoadPlan } from '../load-plan';
import { pressure, regulations, snow } from './snow-roof-plane-fixture';
import { mesh, transform } from './snow-surface-round2-fixture';

function steppedRoof(cuts: number[] = [], upperZ = 5, upperRise = 0, depth = 7.5) {
  const edge = cuts.map(t => [0, 4 * t, 3]);
  return mesh([
    [[0, 0, 3], [depth, 0, 3], [depth, 4, 3], [0, 4, 3], ...edge.reverse()],
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

it('#2218 the step triangle retains force and both physical first moments', () => {
  const model = steppedRoof();
  const layout = gravityLayout(model, { mode: 'panels', slab: 'oneWay', spanAxis: 'x', tributaryWidth: 1 });
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

it('#2218 a one-way roof delivers both exact step-drift bearing reactions', () => {
  const balanced = 0.7;
  const config = { ...snow, roofKind: 'mono', slippery: false, partial: false } as const;
  for (const cuts of [[], [0.17, 0.63]]) for (const angle of [0, Math.PI / 2]) for (const rise of [0, 0.00025]) {
    const gravity = { mode: 'panels', slab: 'oneWay', spanAxis: angle === 0 ? 'x' : 'y' } as const;
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

it('#2218 integrates the portion of a positive drift inside the receiving bay', () => {
  const depth = 1;
  const model = steppedRoof([], 5, 0, depth);
  const layout = gravityLayout(model, { mode: 'panels', slab: 'oneWay', spanAxis: 'x', tributaryWidth: 1 });
  const inputs = { pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1 };
  const { w, pd } = stepDrift({ ...inputs, stepHeight: 2, luUpper: 7.5, luLower: depth });
  expect(w).toBeGreaterThan(depth);
  const rows = driftAndSlidingLoads(model, layout, inputs).distributed;
  const near = pd * (depth / 2 - depth ** 2 / (6 * w));
  const far = pd * (depth / 2 - depth ** 2 / (3 * w));
  expect(rows.map(row => row.elementId).sort()).toEqual([2, 4]);
  expect(rows.find(row => row.elementId === 4)!.q).toBeCloseTo(-near, 10);
  expect(rows.find(row => row.elementId === 2)!.q).toBeCloseTo(-far, 10);
});

it('#2218 requires both bearings to deliver the positive drift', () => {
  const model = steppedRoof();
  const gravity = { mode: 'panels', slab: 'oneWay', spanAxis: 'x' } as const;
  const layout = gravityLayout(model, { ...gravity, tributaryWidth: 1 });
  const config = { ...snow, roofKind: 'mono', slippery: false } as const;
  const inputs = { pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1 };
  expect(() => driftAndSlidingLoads(model, layout, { ...inputs, receivers: new Set([2]) })).toThrow('snow.refused.stepDriftTransfer');
  expect(() => driftAndSlidingLoads(model, layout, { ...inputs, receivers: new Set([2, 4]) })).not.toThrow();
  const scoped = snowLoadCases({ model, layout, tributaryWidth: 1, snow: { ...config, roof: [2, 5, 6, 7, 8] } })!;
  expect(scoped).toMatchObject({ result: { refused: 'snow.refused.stepDriftTransfer' }, cases: [] });
  const across = gravityLayout(model, { ...gravity, spanAxis: 'y', tributaryWidth: 1 });
  expect(() => driftAndSlidingLoads(model, across, inputs)).toThrow('snow.refused.stepDriftTransfer');
  const hb = inputs.balanced / snowDensity(inputs.pg);
  const low = steppedRoof([], 3 + 1.199 * hb);
  expect(driftAndSlidingLoads(low, gravityLayout(low, { ...gravity, tributaryWidth: 1 }), inputs).distributed).toEqual([]);
});



it.each([false, true])('#2218 positive pressure reaches each loaded one-way bay (station split %s)', stationSplit => {
  const config = { ...snow, roofKind: 'mono', slippery: false } as const;
  const inputs = { pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1 };
  for (const [depth, expected] of [
    [1, [1.5633453333333334, 1.476509181184, 0.00968777348266666]],
    [2, [2.274958546848, 0.774583741152, 0]],
  ] as const) {
    for (const angle of [0, Math.PI / 2]) {
      const near = [[0, 0, 3], [depth, 0, 3], ...(stationSplit ? [[depth, 2, 3]] : []), [depth, 4, 3], [0, 4, 3]];
      const far = stationSplit
        ? [
            [[depth, 0, 3], [7.5, 0, 3], [7.5, 2, 3], [depth, 2, 3]],
            [[depth, 2, 3], [7.5, 2, 3], [7.5, 4, 3], [depth, 4, 3]],
          ]
        : [[[depth, 0, 3], [7.5, 0, 3], [7.5, 4, 3], [depth, 4, 3]]];
      const model = transform(mesh([near, ...far, [[-7.5, 0, 5], [0, 0, 5], [0, 4, 5], [-7.5, 4, 5]]]), angle, 0);
      const gravity = { mode: 'panels', slab: 'oneWay', spanAxis: angle === 0 ? 'x' : 'y' } as const;
      const layout = gravityLayout(model, { ...gravity, tributaryWidth: 1 });
      const measures = (rows: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number }>) => {
        const forceByBearing = [0, 0, 0];
        const momentAlong = [0, 0, 0];
        for (const row of rows) {
          const e = model.elements.get(row.elementId)!;
          const worldA = model.nodes.get(e.nodeI)!, worldB = model.nodes.get(e.nodeJ)!;
          if ((worldA.z ?? 0) > 3) continue;
          const local = ({ x, y }: typeof worldA) => [
            x * Math.cos(angle) + y * Math.sin(angle),
            y * Math.cos(angle) - x * Math.sin(angle),
          ];
          const [ax, ay] = local(worldA), [bx, by] = local(worldB);
          const bearing = [0, depth, 7.5].findIndex(x => Math.abs(x - ax!) < 1e-10 && Math.abs(x - bx!) < 1e-10);
          expect(bearing).toBeGreaterThanOrEqual(0);
          const length = Math.hypot(worldB.x - worldA.x, worldB.y - worldA.y);
          const start = row.a ?? 0, span = (row.b ?? length) - start;
          const q0 = -row.q, q1 = -(row.qJ ?? row.q);
          const force = span * (q0 + q1) / 2;
          const first = span ** 2 * (q0 + 2 * q1) / 6;
          forceByBearing[bearing] = forceByBearing[bearing]! + force;
          momentAlong[bearing] = momentAlong[bearing]! + ay! * force + (by! - ay!) / length * (start * force + first);
        }
        return { forceByBearing, momentAlong };
      };
      const { distributed } = driftAndSlidingLoads(model, layout, inputs);
      const drift = measures(distributed);
      for (const [i, force] of expected.entries()) {
        expect(drift.forceByBearing[i]).toBeCloseTo(force, 10);
        expect(drift.momentAlong[i]).toBeCloseTo(2 * force, 10);
      }
      expect(drift.forceByBearing[1]! * depth + drift.forceByBearing[2]! * 7.5).toBeCloseTo(1.549167482304, 10);
      const farMembers = new Set([...model.elements.values()].filter(({ nodeI, nodeJ }) => {
        const depthAt = (id: number) => {
          const { x, y } = model.nodes.get(id)!;
          return x * Math.cos(angle) + y * Math.sin(angle);
        };
        return [nodeI, nodeJ].every(id => Math.abs(depthAt(id) - 7.5) < 1e-10);
      }).map(e => e.id));
      const farRows = distributed.filter(row => farMembers.has(row.elementId));
      expect(farRows).toHaveLength(depth === 2 ? 0 : stationSplit ? 2 : 1);
      const receivers = new Set([...model.elements.keys()].filter(id => !farMembers.has(id)));
      const selected = () => driftAndSlidingLoads(model, layout, { ...inputs, receivers }).distributed;
      if (depth === 1) expect(selected).toThrow('snow.refused.stepDriftTransfer');
      else expect(selected()).toEqual(distributed);
      const direct = snowLoadCases({ model, layout, snow: config, tributaryWidth: 1 })!;
      expect(direct.result.refused).toBeUndefined();
      const plan = buildLoadPlan({
        model, gravity, regulations: regulations(), dead: [], occupancyKey: 'vivienda', tributaryWidth: 1,
        reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
        snow: { ...config, enabled: true, source: 'site' },
      });
      expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
      for (const rows of [direct.cases[0]!.distributed, plan.distributed.filter(load => load.caseType === 'S' && load.caseIndex === plan.cases.findIndex(c => c.type === 'S'))]) {
        const total = measures(rows);
        for (const [i, area] of [2 * depth, 15, 2 * (7.5 - depth)].entries()) {
          const force = area * direct.result.ps + expected[i]!;
          expect(total.forceByBearing[i]).toBeCloseTo(force, 10);
          expect(total.momentAlong[i]).toBeCloseTo(2 * force, 10);
        }
      }
    }
  }
});

it('#2607 snow detects a step on the second owned roof strip', () => {
  const model = steppedRoof();
  const layout = gravityLayout(model, { mode: 'panels', slab: 'oneWay', spanAxis: 'x', tributaryWidth: 1 });
  const rectangle = (a: number, b: number): [number, number][] => [[a, 0], [b, 0], [b, 4], [a, 4]];
  const lower = layout.panels.find(panel => panel.z === 3)!;
  const upper = layout.panels.find(panel => panel.z === 5)!;
  const clipped = { ...layout, panels: [
    { ...lower, oneWaySpan: undefined, footprint: [[rectangle(0, 2)], [rectangle(4, 7.5)]] },
    { ...upper, polygon: rectangle(3, 4) },
  ] };
  const steps = snowRoofSteps(model, clipped);
  expect(steps).toHaveLength(1);
  expect([steps[0]!.a[0], steps[0]!.b[0]]).toEqual([4, 4]);
  const geometry = roofSurfaceModel(model);
  const surfaces = {
    ...geometry,
    resolves: () => true,
    panel: (index: number) => ({
      ...geometry.panel(index, layout), elevation: () => clipped.panels[index]!.z,
    }),
    edgeHeights: (_a: [number, number], _b: [number, number], _layout: typeof layout, first: number, second: number) =>
      [clipped.panels[first]!.z - clipped.panels[second]!.z],
  };
  expect(() => driftAndSlidingLoads(model, clipped, {
    pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1,
  }, surfaces)).toThrow('snow.refused.stepDriftTransfer');
});

it('#2607 separated roof edges use the measured separation for drift', () => {
  const gravity = { mode: 'panels', slab: 'oneWay', spanAxis: 'x' } as const;
  const config = { ...snow, roofKind: 'mono', slippery: false } as const;
  const inputs = { pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1 };
  for (const separation of [0, 0.005, 0.011, 5.999, 6, 6.001]) {
    const model = steppedRoof();
    for (const node of model.nodes.values()) if (node.z === 5) node.x -= separation;
    const layout = gravityLayout(model, { ...gravity, tributaryWidth: 1 });
    expect.soft(snowRoofSteps(model, layout)).toHaveLength(separation === 0 ? 1 : 0);
    const { distributed } = driftAndSlidingLoads(model, layout, inputs);
    const measure = (rows: typeof distributed) => {
      let force = 0, moment = 0;
      for (const row of rows) {
        const member = model.elements.get(row.elementId)!;
        const a = model.nodes.get(member.nodeI)!, b = model.nodes.get(member.nodeJ)!;
        if (a.z !== 3) continue;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const load = -(row.q + (row.qJ ?? row.q)) * ((row.b ?? length) - (row.a ?? 0)) / 2;
        expect(a.x).toBe(b.x);
        force += load;
        moment += load * a.x;
      }
      return { force, moment };
    };
    const expected = (balanced: number) => {
      const { pd, w } = stepDrift({ ...inputs, balanced, stepHeight: 2, luUpper: 7.5, luLower: 7.5, separation });
      return { force: 4 * pd * w / 2, moment: 4 * pd * w ** 2 / 6 };
    };
    const drift = measure(distributed);
    expect.soft(drift.force, `force at ${separation}`).toBeCloseTo(expected(inputs.balanced).force, 10);
    expect.soft(drift.moment, `moment at ${separation}`).toBeCloseTo(expected(inputs.balanced).moment, 10);
    const direct = snowLoadCases({ model, layout, snow: config, tributaryWidth: 1 })!;
    expect(direct.result.refused).toBeUndefined();
    const plan = buildLoadPlan({
      model, gravity, regulations: regulations(), dead: [], occupancyKey: 'vivienda', tributaryWidth: 1,
      reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
      snow: { ...config, enabled: true, source: 'site' },
    });
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    const caseIndex = plan.cases.findIndex(c => c.type === 'S');
    for (const rows of [direct.cases[0]!.distributed, plan.distributed.filter(load => load.caseType === 'S' && load.caseIndex === caseIndex)]) {
      const applied = measure(rows as typeof distributed);
      const balanced = direct.result.ps;
      expect.soft(applied.force, `snow force at ${separation}`).toBeCloseTo(30 * balanced + expected(balanced).force, 10);
      expect.soft(applied.moment, `snow moment at ${separation}`).toBeCloseTo(30 * 3.75 * balanced + expected(balanced).moment, 10);
    }
  }
});

it('#2607 translating the plan preserves a measurable roof separation', () => {
  const model = steppedRoof();
  const layout = gravityLayout(model, { mode: 'panels', slab: 'oneWay', spanAxis: 'x', tributaryWidth: 1 });
  const shift = 1e12;
  const gap = 0.005;
  const panels = layout.panels.map(panel => ({
    ...panel, polygon: panel.polygon.map(([x, y]): [number, number] => [x + (panel.z === 5 ? shift - gap : shift), y]),
  }));
  const shifted = { ...layout, panels };
  const geometry = roofSurfaceModel(model);
  const surfaces = (index: number) => ({ ...geometry.panel(index, layout), elevation: () => panels[index]!.z });
  expect(snowRoofSteps(model, shifted, surfaces)).toEqual([]);
  expect(snowRoofEdgePairs(model, shifted, surfaces)).toEqual([
    expect.objectContaining({ separation: shift - (shift - gap) }),
  ]);
});

it('#2607 a higher roof opening leaves the lower roof parapet band exposed', () => {
  const model = steppedRoof();
  const layout = gravityLayout(model, { mode: 'panels', slab: 'oneWay', spanAxis: 'x', tributaryWidth: 1 });
  const rectangle = (lo: number, bottom: number, hi: number, top: number): [number, number][] =>
    [[lo, bottom], [hi, bottom], [hi, top], [lo, top]];
  const low = layout.panels.findIndex(panel => panel.z === 3);
  const high = layout.panels.findIndex(panel => panel.z === 5);
  const exterior = rectangle(-8, -8, 15.5, 12);
  const opening = rectangle(-7, -7, 14.5, 11);
  const geometry = roofSurfaceModel(model);
  const surfaces = {
    ...geometry,
    resolves: () => true,
    panel: (index: number) => ({ ...geometry.panel(index, layout), elevation: () => layout.panels[index]!.z }),
    edgeHeights: (_a: [number, number], _b: [number, number], _layout: typeof layout, first: number, second: number) =>
      [layout.panels[first]!.z - layout.panels[second]!.z],
  };
  const loads = (upper: typeof layout.panels[number], cover = true) => {
    const panels = layout.panels.map((panel, i) => i === high ? upper : panel);
    const lowerMembers = new Set(layout.pieces.filter(piece => piece.panel === low).map(piece => piece.elementId));
    return driftAndSlidingLoads(model, { ...layout, panels }, {
      pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1, parapet: { height: 2 },
    }, {
      ...surfaces,
      edgeHeights: (...args) => cover ? surfaces.edgeHeights(...args) : [-2],
    }).distributed.filter(row => lowerMembers.has(row.elementId));
  };
  const solid = { ...layout.panels[high]!, polygon: exterior, footprint: [[exterior]] };
  const opened = { ...solid, footprint: [[exterior, opening]] };
  const uncovered = loads(opened, false);
  expect(uncovered.length).toBeGreaterThan(0);
  expect(loads(solid)).toEqual([]);
  expect(loads(opened)).toEqual(uncovered);
  const partial = loads({ ...solid, footprint: [[exterior, rectangle(-7, 0.5, 14.5, 1.5)]] });
  const west = [...model.elements.values()].find(({ nodeI, nodeJ }) => [nodeI, nodeJ].every(id => {
    const p = model.nodes.get(id)!;
    return p.x === 0 && p.z === 3;
  }))!;
  const station = (y: number) => Math.abs(model.nodes.get(west.nodeI)!.y - y);
  expect(pressure(partial, west.id, station(1))).toBeGreaterThan(0);
  expect(Math.abs(pressure(partial, west.id, station(2)))).toBe(0);
});

const reviewRound = process.env.RUN_KNOWN_WRONG === '2607' ? it : it.skip;

reviewRound('known wrong result: #2607 entered and modeled adjacent roofs generate one drift source', () => {
  const model = steppedRoof();
  for (const node of model.nodes.values()) if (node.z === 5) {
    node.x -= 1;
    if (node.y === 0) node.y = 0.04;
  }
  const layout = gravityLayout(model, { mode: 'panels', slab: 'oneWay', spanAxis: 'x', tributaryWidth: 1 });
  const lower = layout.panels.find(panel => panel.z === 3)!;
  const partition = { ...lower, roof: false, polygon: [[0, 0], [0.02, 0], [0.02, 0.08], [0, 0.08]] as [number, number][] };
  const partitioned = { ...layout, panels: [...layout.panels, partition] };
  const entered = { side: '-x', separation: 1, topZ: 5, length: 7.5 } as const;
  const inputs = { pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1 };
  for (const roofLayout of [layout, partitioned]) {
    const modeled = driftAndSlidingLoads(model, roofLayout, inputs);
    expect(modeled.distributed.length).toBeGreaterThan(0);
    expect.soft(driftAndSlidingLoads(model, roofLayout, { ...inputs, adjacent: [entered] }).distributed)
      .toEqual(modeled.distributed);
  }
});

reviewRound('known wrong result: #2607 a separated off-center ridge is checked on both roof profiles', () => {
  const lower = [[0, 0, 3], [7.5, 0, 3], [7.5, 30, 3], [0, 30, 3]];
  const base = [[-8.5, 0, 3], [-1, 0, 3], [-1, 30, 3], [-8.5, 30, 3]];
  const separated = gravityLayout(mesh([lower, base]), { mode: 'panels', slab: 'oneWay', spanAxis: 'x', tributaryWidth: 1 });
  const upper = separated.panels.findIndex(panel => panel.polygon.every(([x]) => x < 0));
  const receiver = separated.panels.findIndex(panel => panel.polygon.every(([x]) => x >= 0));
  const inputs = { pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1 };
  for (const peak of [3, 5]) {
    const crest = [[-8.5, 6, peak], [-1, 6, peak]];
    const toe = [[-8.5, 12, 3], [-1, 12, 3]];
    const model = mesh([lower, [base[0]!, base[1]!, crest[1]!, crest[0]!], [crest[0]!, crest[1]!, toe[1]!, toe[0]!]]);
    const surfaceModel = roofSurfaceModel(model);
    const surface = (index: number) => surfaceModel.panel(index, separated);
    expect(surface(upper).elevation([-1, 6])).toBe(peak);
    for (const y of [0, 15, 30]) expect(surface(upper).elevation([-1, y])).toBe(surface(receiver).elevation([0, y]));
    const pairs = snowRoofEdgePairs(model, separated, surface).filter(pair => pair.lower === receiver);
    expect.soft(pairs).toHaveLength(peak > 3 ? 1 : 0);
    if (peak > 3) {
      expect.soft(() => driftAndSlidingLoads(model, separated, inputs, surfaceModel)).toThrow('snow.refused.stepDriftTransfer');
    } else {
      expect(driftAndSlidingLoads(model, separated, inputs, surfaceModel).distributed).toEqual([]);
    }
  }
});
