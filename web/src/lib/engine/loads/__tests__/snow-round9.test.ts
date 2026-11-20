import { physicalSnowCases } from './snow-physical-cases';
import { transverseSnowLoads } from './snow-roof-plane-fixture';
import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { gravityLayout, type GravityLayout } from '../plan-gravity';
import { snowLoadCases, type SnowCasesInput } from '../snow-loads';
import { driftAndSlidingLoads, snowDriftRefusal } from '../snow-drift-loads';
import { roofSurfaceModel } from '../snow-roof-surfaces';
import { shapedSnow } from '../snow-shapes';
import { stepDrift, parapetDrift, slidingSnow } from '../../../codes/cirsoc104/drift';
import { planSnow } from '../load-plan-snow';
import { buildLoadPlan, type PlanSink } from '../load-plan';

type Model = ReturnType<typeof mesh>;
const inputs = { pg: 1, balanced: 1, pf: 1, slippery: false, tributaryWidth: 0.1 };

function valley(depth = 0.2, station = 1) {
  const model = mesh([[[0, 0, 3], [2, 0, 3], [2, 4, 3], [0, 4, 3]], [[2, 0, 3], [22, 0, 3], [22, station, 3 - depth], [2, station, 3 - depth]], [[2, station, 3 - depth], [22, station, 3 - depth], [22, 4, 3], [2, 4, 3]]]);
  model.nodes.set(500, { id: 500, x: 0.1, y: 1.5, z: 3 });
  model.nodes.set(501, { id: 501, x: 0.1, y: 2.5, z: 3 });
  model.elements.set(500, { id: 500, nodeI: 500, nodeJ: 501, sectionId: 1, materialId: 1 });
  const panels: GravityLayout['panels'] = [{ polygon: [[0, 0], [2, 0], [2, 4], [0, 4]], z: 3, roof: true }, { polygon: [[2, 0], [22, 0], [22, 4], [2, 4]], z: 3 - depth, roof: true }];
  const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 0.1 });
  layout.panels = panels; layout.points = []; layout.pieces = [];
  layout.widthMembers = layout.widthMembers.filter(w => w.elementId === 500);
  return { model, layout };
}

for (const station of [1, 2, 3]) {
  it(`round9 valley cannot extend adjacent drift fetch ${station}`, () => {
    const { model, layout } = valley(0.2, station);
    const base = driftAndSlidingLoads(model, layout, inputs);
    const out = driftAndSlidingLoads(model, layout, { ...inputs, adjacent: [{ side: '-x', topZ: 5, separation: 0, length: 1 }] });
    const dr = stepDrift({ pg: 1, balanced: 1, stepHeight: 2, luUpper: 1, luLower: 2, separation: 0 });
    expect(pressure(out.distributed, 500, 0.5) - pressure(base.distributed, 500, 0.5)).toBeCloseTo(dr.pd * (1 - 0.1 / dr.w) * 0.1, 10);
  });
}

function barrel(withOther: boolean) {
  const model = mesh([[[30, 20, 3], [38, 20, 5], [38, 24, 5], [30, 24, 3]], ...[-4, -2, 0, 2].map((y, k) => [[0, y, [3, 5, 5.5, 5, 3][k]!], [10, y, [3, 5, 5.5, 5, 3][k]!], [10, y + 2, [3, 5, 5.5, 5, 3][k + 1]!], [0, y + 2, [3, 5, 5.5, 5, 3][k + 1]!]])]);
  const selected = [...model.elements.keys()].filter(id => id > 4);
  if (!withOther) for (const id of [1, 2, 3, 4]) model.elements.delete(id);
  return { model, selected };
}

for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round9 selected barrel ignores unrelated slope ${mode}`, () => {
    const run = (withOther: boolean) => {
      const { model, selected } = barrel(withOther);
      const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 0.1 });
      return snowLoadCases({ model, layout, tributaryWidth: 0.1, snow: { ...snow, roofKind: 'curved', roof: selected } })!;
    };
    const isolated = run(false), out = run(true);
    expect(isolated.result.refused).toBeUndefined();
    expect(out.result.refused).toBeUndefined();
    expect(out.cases.length).toBe(isolated.cases.length);
    const ordered = (cases: typeof out.cases) => cases.map(c => [...c.distributed].sort((a, b) => a.elementId - b.elementId || (a.a ?? 0) - (b.a ?? 0)));
    expect(ordered(out.cases)).toEqual(ordered(isolated.cases));
    expect(out.cases.map(c => c.nodal)).toEqual(isolated.cases.map(c => c.nodal));
  });
}

function publicSnow(model: Model, layout: GravityLayout | undefined, config: SnowCasesInput['snow']) {
  const out = snowLoadCases({ model, layout, snow: config, tributaryWidth: 0.1 })!;
  const sink: PlanSink = { cases: [], distributed: [], nodal: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  expect(planSnow({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, tributaryWidth: 0.1, snow: { ...config, enabled: true, source: 'site' } }, sink, layout)).toBe(!out.result.refused);
  if (out.result.refused) expect(sink.cases).toEqual([]);
  else expect(physicalSnowCases(sink)).toHaveLength(out.cases.length);
  for (const [k, c] of out.cases.entries()) {
    expect(sink.distributed.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.distributed);
    expect(sink.nodal.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.nodal);
  }
  if (out.result.refused) {
    expect(sink.blockedKeys.map(m => m.key)).toContain(out.result.refused);
    expect(sink.distributed).toEqual([]);
    expect(sink.nodal).toEqual([]);
  }
  return out;
}

function move(model: Model, layout: GravityLayout, angle: number, mirror: number) {
  transform(model, angle, 1, mirror);
  for (const panel of layout.panels) {
    panel.polygon = panel.polygon.map(([x, y]) => [mirror * x * Math.cos(angle) - y * Math.sin(angle) + 137, mirror * x * Math.sin(angle) + y * Math.cos(angle) - 91]);
    panel.z += 11;
  }
}

for (const angle of [0, 0.37, Math.PI / 2]) for (const mirror of [1, -1]) for (const mode of ['width', 'pieces'] as const) {
  it(`round9 valley cannot extend parapet fetch ${mode} ${angle} ${mirror}`, () => {
    const { model, layout } = valley();
    if (mode === 'pieces') {
      layout.widthMembers = [];
      layout.panels[0] = { polygon: [[0.1, 0], [2, 0], [2, 4], [0.1, 4]], z: 3, roof: true };
      layout.panels.push({ polygon: [[0, 0], [0.1, 0], [0.1, 4], [0, 4]], z: 3, roof: true });
      layout.pieces = [{ elementId: 500, panel: 0, roof: true, a: 0, b: 1, wI: 0.1, wJ: 0.1 }];
    }
    move(model, layout, angle, mirror);
    const base = driftAndSlidingLoads(model, layout, inputs);
    const out = driftAndSlidingLoads(model, layout, { ...inputs, parapet: { height: 3 } });
    const dr = parapetDrift({ pg: 1, balanced: 1, parapetHeight: 3, lu: 2 });
    expect(dr.applies).toBe(true);
    const expected = dr.pd * (mode === 'width' ? (1 - 0.1 / dr.w) * 0.1 : 0.1 - 0.015 / dr.w);
    expect(pressure(out.distributed, 500, 0.5) - pressure(base.distributed, 500, 0.5)).toBeCloseTo(expected, 10);
    const config = { ...snow, slippery: false, roofKind: 'mono' as const };
    const ordinary = publicSnow(model, layout, config), loaded = publicSnow(model, layout, { ...config, parapet: { height: 3 } });
    expect(loaded.result.refused).toBeUndefined();
    expect(pressure(loaded.cases[0]!.distributed, 500, 0.5) - pressure(ordinary.cases[0]!.distributed, 500, 0.5)).toBeCloseTo(expected, 10);
  });
}

for (const angle of [0, 0.37, Math.PI / 2]) for (const mirror of [1, -1]) for (const mode of ['projected', 'width', 'panels'] as const) for (const reverse of [false, true]) {
  it(`round9 selected barrel pressure is independent of other roofs ${mode} ${angle} ${mirror} ${reverse}`, () => {
    const run = (withOther: boolean) => {
      const { model, selected } = barrel(withOther);
      if (reverse) for (const e of model.elements.values()) [e.nodeI, e.nodeJ] = [e.nodeJ, e.nodeI];
      transform(model, angle, 1, mirror);
      const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 0.1 });
      return publicSnow(model, layout, { ...snow, roofKind: 'curved', roof: selected });
    };
    const isolated = run(false), out = run(true);
    expect(out.result.refused).toBeUndefined();
    expect(out.cases).toHaveLength(3);
    expect(out.geometry).toEqual(isolated.geometry);
    for (const [k, c] of out.cases.entries()) {
      const expected = isolated.cases[k]!;
      for (const d of expected.distributed) {
        const e = barrel(false).model.elements.get(d.elementId)!;
        const model = barrel(false).model, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
        const station = d.b === undefined ? length / 2 : ((d.a ?? 0) + d.b) / 2;
        expect(pressure(c.distributed, d.elementId, station)).toBeCloseTo(pressure(expected.distributed, d.elementId, station), 10);
      }
      expect(c.nodal).toEqual(expected.nodal);
    }
  });
}

for (const mode of ['width', 'panels'] as const) for (const withOther of [false, true]) {
  it(`round9 complete planner selected barrel ${mode} ${withOther}`, () => {
    const { model, selected } = barrel(withOther), config = { ...snow, roofKind: 'curved' as const, roof: selected };
    const out = publicSnow(model, mode === 'width' ? undefined : gravityLayout(model, { mode, tributaryWidth: 0.1 }), config);
    const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode }, tributaryWidth: 0.1, snow: { ...config, enabled: true, source: 'site' } });
    expect(plan.outcome).toBe('READY');
    const cases = physicalSnowCases(plan);
    expect(cases).toHaveLength(3);
    for (const [k, c] of cases.entries()) {
      expect(plan.distributed.filter(d => d.caseIndex === plan.cases.indexOf(c)).map(({ caseIndex, caseType, ...d }) => d)).toEqual(out.cases[k]!.distributed);
      expect(plan.nodal.filter(d => d.caseIndex === plan.cases.indexOf(c)).map(({ caseIndex, caseType, ...d }) => d)).toEqual(out.cases[k]!.nodal);
    }
  });
}

for (const gap of [0, 0.5e-8, 1e-8, 2e-8, 0.2]) {
  it(`round9 continuous join height boundary ${gap}`, () => {
    const { model, layout } = valley();
    const roof = mesh([[[0, 0, 3], [2, 0, 3], [2, 4, 3], [0, 4, 3]], [[2, 0, 3 - gap], [22, 0, 3 - gap], [22, 4, 3 - gap], [2, 4, 3 - gap]]]);
    for (const id of [500, 501]) roof.nodes.set(id, model.nodes.get(id)!);
    roof.elements.set(500, model.elements.get(500)!);
    layout.panels[1]!.z = 3 - gap;
    const base = driftAndSlidingLoads(roof, layout, inputs);
    const out = driftAndSlidingLoads(roof, layout, { ...inputs, parapet: { height: 3 } });
    const lu = gap <= 1e-8 ? 22 : 2;
    const dr = parapetDrift({ pg: 1, balanced: 1, parapetHeight: 3, lu });
    const expected = dr.pd * (1 - 0.1 / dr.w) * 0.1;
    expect(pressure(out.distributed, 500, 0.5) - pressure(base.distributed, 500, 0.5)).toBeCloseTo(expected, 10);
  });
}

for (const overlap of [0, 0.099, 0.1, 0.101]) {
  it(`round9 continuous join overlap boundary ${overlap}`, () => {
    const { model, layout } = valley();
    const roof = mesh([[[0, 0, 3], [2, 0, 3], [2, 4, 3], [0, 4, 3]], [[2, 4 - overlap, 3], [22, 4 - overlap, 3], [22, 8, 3], [2, 8, 3]]]);
    for (const id of [500, 501]) roof.nodes.set(id, model.nodes.get(id)!);
    roof.elements.set(500, model.elements.get(500)!);
    layout.panels[1] = { polygon: [[2, 4 - overlap], [22, 4 - overlap], [22, 8], [2, 8]], z: 3, roof: true };
    const out = driftAndSlidingLoads(roof, layout, { ...inputs, parapet: { height: 3 } });
    const lu = 4 - (4 - overlap) > 0.1 ? 22 : 2;
    const dr = parapetDrift({ pg: 1, balanced: 1, parapetHeight: 3, lu });
    expect(pressure(out.distributed, 500, 0.5)).toBeCloseTo(dr.pd * (1 - 0.1 / dr.w) * 0.1, 10);
  });
}

for (const angle of [0, 0.37]) {
  it(`round9 unresolved valley refuses before grouping ${angle}`, () => {
    const { model, layout } = valley();
    for (const e of model.elements.values()) {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      if (a.x >= 2 && b.x >= 2 && a.x !== b.x) model.elements.delete(e.id);
    }
    move(model, layout, angle, 1);
    expect(() => driftAndSlidingLoads(model, layout, inputs)).toThrow('snow.refused.roofPlane');
    const out = publicSnow(model, layout, { ...snow, slippery: false, roofKind: 'mono' });
    expect(out.result.refused).toBe('snow.refused.roofPlane');
    expect(out.cases).toEqual([]);
  });
}

for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round9 planar selected barrel has its own profile ${mode}`, () => {
    const model = mesh([[[30, 20, 3], [38, 20, 5], [38, 24, 5], [30, 24, 3]], [[0, -4, 3], [0, -2, 3.8]], [[0, -2, 3.8], [0, 0, 4]], [[0, 0, 4], [0, 2, 3.8]], [[0, 2, 3.8], [0, 4, 3]]]);
    const selected = [...model.elements.keys()].filter(id => id > 4);
    const out = publicSnow(model, mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 0.1 }), { ...snow, roofKind: 'curved', roof: selected });
    expect(out.result.refused).toBeUndefined();
    expect(out.cases).toHaveLength(3);
    const nodes = [...new Set(selected.flatMap(id => { const e = model.elements.get(id)!; return [e.nodeI, e.nodeJ]; }))].map(id => model.nodes.get(id)!);
    const shaped = shapedSnow(nodes, { kind: 'curved', pf: out.result.pf, ce: out.result.ce, ct: out.result.ct, slippery: true, gamma: out.result.gamma, axis: 'y' })!;
    const expected = [shaped.balanced, ...shaped.unbalanced.map(c => c.at)];
    for (const [k, c] of out.cases.entries()) for (const id of selected) {
      const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const cos2 = mode === 'projected' ? (b.y - a.y) ** 2 / ((b.y - a.y) ** 2 + ((b.z ?? 0) - (a.z ?? 0)) ** 2) : 1;
      const d = (mode === 'projected' ? transverseSnowLoads(model, c.distributed) : c.distributed).find(d => d.elementId === id);
      expect(-(d?.q ?? 0)).toBeCloseTo(expected[k]!(a) * 0.1 * cos2, 10);
      expect(-(d ? d.qJ ?? d.q : 0)).toBeCloseTo(expected[k]!(b) * 0.1 * cos2, 10);
    }
  });
}

for (const kind of ['gable', 'curved', 'multiple', 'dome'] as const) {
  it(`round9 selected flat roof excludes other geometry ${kind}`, () => {
    const model = mesh([[[40, 20, 3], [48, 20, 5], [48, 24, 5], [40, 24, 3]], [[0, -8, 3], [30, -8, 3], [30, 0, 3], [0, 0, 3]], [[0, 0, 3], [30, 0, 3], [30, 8, 3], [0, 8, 3]]]);
    const selected = [...model.elements.keys()].filter(id => id > 4);
    const config = { ...snow, roofKind: kind, roof: selected, roofSlopeDeg: 20 };
    const out = publicSnow(model, undefined, config);
    for (const id of [1, 2, 3, 4]) model.elements.delete(id);
    const isolated = publicSnow(model, undefined, config);
    expect(out.geometry).toEqual(isolated.geometry);
    expect(out.geometry.W).toBe(8);
    expect(out.geometry.slopeDeg).toBe(0);
    expect(out.cases).toEqual(isolated.cases);
  });
}

function append(model: Model, extra: Model) {
  for (const n of extra.nodes.values()) model.nodes.set(n.id + 1000, { ...n, id: n.id + 1000 });
  for (const e of extra.elements.values()) model.elements.set(e.id + 1000, { ...e, id: e.id + 1000, nodeI: e.nodeI + 1000, nodeJ: e.nodeJ + 1000 });
}

for (const role of ['lower', 'upper'] as const) {
  it(`round9 valley cannot bypass refusal at the ${role} step`, () => {
    const { model, layout } = valley();
    const z = role === 'lower' ? 5 : 1;
    append(model, mesh([[[-1, 0, z], [0, 0, z], [0, 4, z], [-1, 4, z]]]));
    layout.panels.push({ polygon: [[-1, 0], [0, 0], [0, 4], [-1, 4]], z, roof: true });
    if (role === 'upper') for (const id of [500, 501]) Object.assign(model.nodes.get(id)!, { x: -0.1, z: 1 });
    expect(() => driftAndSlidingLoads(model, layout, inputs)).toThrow('snow.refused.stepDriftTransfer');
    for (const node of model.nodes.values()) if (node.id > 1000 && node.x === -1) node.z = z + 0.1;
    if (role === 'upper') for (const id of [500, 501]) model.nodes.get(id)!.z = 1.01;
    expect(() => driftAndSlidingLoads(model, layout, inputs)).toThrow('snow.refused.stepDriftTransfer');
    expect(publicSnow(model, layout, { ...snow, slippery: false, roofKind: 'mono' })).toMatchObject({
      result: { refused: 'snow.refused.stepDriftTransfer' }, cases: [],
    });
  });
}

it('round9 sliding stays on the continuous receiving roof', () => {
  const { model, layout } = valley();
  append(model, mesh([[[-6, 0, 3.7], [0, 0, 3.1], [0, 4, 3.1], [-6, 4, 3.7]]]));
  layout.panels.push({ polygon: [[-6, 0], [0, 0], [0, 4], [-6, 4]], z: 3.1, roof: true });
  for (const [id, y] of [[600, 1.5], [601, 2.5]]) model.nodes.set(id!, { id: id!, x: 2.1, y: y!, z: 3 - 0.2 * (4 - y!) / 3 });
  model.elements.set(600, { id: 600, nodeI: 600, nodeJ: 601, sectionId: 1, materialId: 1 });
  const length = Math.hypot(1, 0.2 / 3);
  layout.widthMembers.push({ elementId: 600, length, horizontalLength: 1 });
  const base = driftAndSlidingLoads(model, layout, inputs), out = driftAndSlidingLoads(model, layout, { ...inputs, slippery: true });
  expect(pressure(out.distributed, 600, length / 2) - pressure(base.distributed, 600, length / 2)).toBe(0);
  const sl = slidingSnow({ pf: 1, slopePercent: 10, slippery: true, W: 6 });
  expect(sl.applies).toBe(true);
  expect(pressure(out.distributed, 500, 0.5) - pressure(base.distributed, 500, 0.5)).toBeCloseTo(sl.intensity * 0.1, 10);
  const config = { ...snow, roofKind: 'mono' as const };
  const ordinary = publicSnow(model, layout, { ...config, slippery: false }), loaded = publicSnow(model, layout, config);
  expect(loaded.result.refused).toBeUndefined();
  expect(pressure(loaded.cases[0]!.distributed, 600, length / 2) - pressure(ordinary.cases[0]!.distributed, 600, length / 2)).toBe(0);
});

for (const heights of [[], [NaN], [Infinity], [-Infinity]]) {
  it(`round9 unavailable edge continuity refuses ${String(heights)}`, () => {
    const { model, layout } = valley(), surfaces = roofSurfaceModel(model);
    const unavailable = { ...surfaces, edgeHeights: () => heights };
    expect(snowDriftRefusal(model, layout, unavailable)).toBe('snow.refused.roofPlane');
    expect(() => driftAndSlidingLoads(model, layout, inputs, unavailable)).toThrow('snow.refused.roofPlane');
  });
}
