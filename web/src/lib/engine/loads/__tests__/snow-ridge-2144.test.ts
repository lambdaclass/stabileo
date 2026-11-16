import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { assertSnowRemeshInvariant, remeshSnowRoof } from './snow-remesh-invariance';
import { gravityLayout } from '../plan-gravity';
import { roofGeometry, snowLoadCases, type SnowCasesInput } from '../snow-loads';
import { planSnow } from '../load-plan-snow';
import { buildLoadPlan, type PlanSink, type LoadModelData } from '../load-plan';

type Mode = 'projected' | 'width' | 'panels';

function flat(W = 2, angle = 0) {
  return transform(mesh([[[0, -W, 3], [16, -W, 3], [16, W, 3], [0, W, 3]]]), angle, 0);
}

function generator(mode: Mode, config: SnowCasesInput['snow'], polygon?: Array<[number, number]>, loadEveryPanel = false) {
  return (model: LoadModelData) => {
    const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1, loadEveryPanel });
    if (mode === 'panels' && layout && polygon) {
      layout.panels = [{ polygon, z: 3, roof: true }];
      layout.widthMembers = []; layout.points = [];
      layout.pieces = [...model.elements.values()].map(e => {
        const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        return { elementId: e.id, panel: 0, roof: true, a: 0, b: Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)), wI: 1, wJ: 1 };
      });
    }
    const out = snowLoadCases({ model, layout, snow: config, tributaryWidth: 1 })!;
    expect(out).not.toBeNull();
    expect(out.result.refused).toBeUndefined();
    const sink: PlanSink = { cases: [], distributed: [], nodal: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
    expect(planSnow({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, tributaryWidth: 1, snow: { ...config, enabled: true, source: 'site' } }, sink, layout)).toBe(true);
    for (const [k, c] of out.cases.entries()) {
      expect(sink.distributed.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.distributed);
      expect(sink.nodal.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.nodal);
    }
    return out;
  };
}

for (const mode of ['projected', 'width', 'panels'] as const) for (const angle of [0, 0.37, Math.PI / 2, 2.1]) {
  it(`#2144 asymmetric eave subdivision preserves short-edge load ${mode} ${angle}`, () => {
    const model = flat(2, angle), polygon = [...model.nodes.values()].map(n => [n.x, n.y] as [number, number]);
    const generate = generator(mode, { ...snow, roofSlopeDeg: 20 }, polygon);
    const base = generate(model);
    const ps = 0.7 * (70 - 20) / (70 - 5), leeward = 1.5 * ps;
    expect(pressure(base.cases[1]!.distributed, 2, 1)).toBeCloseTo(0, 10);
    const witness = generate(remeshSnowRoof(model, new Map([[1, 8]])).model);
    expect(pressure(witness.cases[1]!.distributed, 2, 1)).toBeCloseTo(0, 10);
    const resolved = remeshSnowRoof(model, new Map([[2, 2], [4, 2]])).model;
    for (const edges of [[1], [3], [2], [4], [5], [6], [1, 3], [2, 4], [...resolved.elements.keys()]]) {
      const splits = new Map(edges.map(id => [id, id % 2 ? 8 : 3]));
      const { out } = assertSnowRemeshInvariant(resolved, splits, generate);
      expect(pressure(out.cases[1]!.distributed, 2, 0.1)).toBeCloseTo(0, 10);
    }
  });
}

for (const mode of ['projected', 'width', 'panels'] as const) for (const W of [6 - 1e-12, 6, 6 + 1e-12]) {
  it(`#2144 ridge preserves both sides of width limit ${mode} ${W}`, () => {
    const model = flat(W), polygon = [...model.nodes.values()].map(n => [n.x, n.y] as [number, number]);
    const { out } = assertSnowRemeshInvariant(model, new Map([[1, 8]]), generator(mode, { ...snow, roofSlopeDeg: 20 }, polygon));
    const ps = 0.7 * 50 / 65, windward = W <= 6 ? 0 : 0.3 * ps, leeward = (W <= 6 ? 1.5 : 1.2 * 1.5) * ps;
    expect(pressure(out.cases[1]!.distributed, 2, 1)).toBeCloseTo(windward, 10);
  });
}

for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`uniform subdivision retains main's correct pressures ${mode}`, () => {
    const model = flat(), generate = generator(mode, { ...snow, roofSlopeDeg: 20 }, [...model.nodes.values()].map(n => [n.x, n.y]));
    const { out } = assertSnowRemeshInvariant(model, new Map([[1, 8], [3, 8]]), generate);
    const ps = 0.7 * 50 / 65;
    expect(pressure(out.cases[0]!.distributed, 2, 1)).toBeCloseTo(ps, 10);
    expect(pressure(out.cases[1]!.distributed, 2, 1)).toBeCloseTo(0, 10);
  });
}

for (const kind of ['mono', 'gable', 'curved', 'multiple', 'dome'] as const) for (const override of [false, true]) for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`#2144 shared geometry and slope ${kind} ${override} ${mode}`, () => {
    const base = flat(), polygon = [...base.nodes.values()].map(n => [n.x, n.y] as [number, number]);
    const model = kind === 'gable' && override ? remeshSnowRoof(base, new Map([[2, 2], [4, 2]])).model : base;
    const generate = generator(mode, { ...snow, roofKind: kind, ...(override ? { roofSlopeDeg: 20 } : {}) }, polygon);
    for (const edge of model.elements.keys()) assertSnowRemeshInvariant(model, new Map([[edge, 8]]), generate);
  });
}

for (const kind of ['mono', 'gable'] as const) for (const angle of [0, 0.37, Math.PI / 2]) for (const mode of ['projected', 'width'] as const) {
  it(`geometric ${kind} plane pressure is independent of every edge subdivision ${angle} ${mode}`, () => {
    const t = Math.tan(20 * Math.PI / 180);
    const ring = kind === 'mono' ? [[0, 0, 3], [16, 0, 3], [16, 4, 3 + 4 * t], [0, 4, 3 + 4 * t]] : [[0, 0, 3], [16, 0, 3], [16, 2, 3 + 2 * t], [0, 2, 3 + 2 * t]];
    const rings = kind === 'mono' ? [ring] : [ring, [[0, 2, 3 + 2 * t], [16, 2, 3 + 2 * t], [16, 4, 3], [0, 4, 3]]];
    const model = transform(mesh(rings), angle, 0), generate = generator(mode, { ...snow, roofKind: kind });
    const base = generate(model);
    expect(base.geometry.slopeDeg).toBeCloseTo(20, 10);
    expect(pressure(base.cases[0]!.distributed, 1, 1)).toBeCloseTo(0.7 * 50 / 65, 10);
    for (const edge of model.elements.keys()) assertSnowRemeshInvariant(model, new Map([[edge, 8]]), generate);
  });
}

for (const mode of ['width', 'panels'] as const) {
  it(`#2144 complete load planner preserves asymmetric ridge ${mode}`, () => {
    const config = { ...snow, roofSlopeDeg: 20, enabled: true, source: 'site' as const };
    const model = remeshSnowRoof(flat(), new Map([[1, 8]])).model;
    const plan = buildLoadPlan({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, gravity: { mode }, tributaryWidth: 1, snow: config });
    expect(plan.outcome).toBe('READY');
    const c = plan.cases.findIndex(c => c.type === 'S' && c.nameKey === 'snow.case.unbalanced');
    const expected = 0;
    const q = pressure(plan.distributed.filter(d => d.caseIndex === c), 2, 1);
    expect(q).toBeCloseTo(expected, 10);
  });
}

for (const kind of ['curved', 'multiple', 'dome'] as const) for (const angle of [0, 0.37]) for (const mode of ['projected', 'width', 'panels'] as const) for (const override of [false, true]) {
  it(`#2144 geometric shaped roof ${kind} ${angle} ${mode} ${override}`, () => {
    const profile = kind === 'multiple' ? [[0, 3], [2, 4], [4, 3], [6, 4], [8, 3]] : [[0, 3], [2, 4], [4, 4.5], [6, 4], [8, 3]];
    const rings = profile.slice(1).map(([y, z], k) => [[0, profile[k]![0]!, profile[k]![1]!], [16, profile[k]![0]!, profile[k]![1]!], [16, y!, z!], [0, y!, z!]]);
    const model = transform(mesh(rings), angle, 0), generate = generator(mode, { ...snow, roofKind: kind, ...(override ? { roofSlopeDeg: 20 } : {}) });
    for (const edge of model.elements.keys()) assertSnowRemeshInvariant(model, new Map([[edge, 8]]), generate);
    assertSnowRemeshInvariant(model, new Map([...model.elements.keys()].map(id => [id, 3])), generate);
    assertSnowRemeshInvariant(model, new Map([...model.elements.keys()].map(id => [id, 2 + id % 4])), generate);
  });
}

it(`#2144 near-top subdivision cannot move a geometric ridge`, () => {
  const model = mesh([[[0, 0, 3], [16, 0, 3], [16, 4, 4], [0, 4, 4]]]);
  assertSnowRemeshInvariant(model, new Map([[2, 128]]), generator('width', { ...snow, roofKind: 'mono' }));
});

function facetedDome(mode: Mode) {
  const rim = [[0, 0, 3], [8, 0, 3], [8, 8, 3], [0, 8, 3]], crown = [4, 4, 5];
  const model = mesh(rim.map((p, k) => [p, rim[(k + 1) % rim.length]!, crown]));
  const generate = generator(mode, { ...snow, roofKind: 'dome' }, undefined, true);
  const out = generate(model);
  const slope = Math.atan(2 / Math.hypot(4, 4)) * 180 / Math.PI;
  expect(pressure(out.cases[0]!.distributed, 1, 1)).toBeCloseTo(0.7 * (70 - slope) / 65, 10);
  if (mode === 'panels') {
    const refined = generate(remeshSnowRoof(model, new Map([[2, 8]])).model);
    expect(pressure(refined.cases[0]!.distributed, 1, 1)).toBeCloseTo(0.7 * (70 - slope) / 65, 10);
  }
  for (const edge of model.elements.keys()) assertSnowRemeshInvariant(model, new Map([[edge, 8]]), generate);
}

for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`#2144 selected roof uses the same physical ridge ${mode}`, () => {
    const model = flat(), polygon = [...model.nodes.values()].map(n => [n.x, n.y] as [number, number]);
    const generate = (m: LoadModelData) => generator(mode, { ...snow, roofSlopeDeg: 20, roof: [...m.elements.keys()] }, polygon)(m);
    const resolved = remeshSnowRoof(model, new Map([[2, 2], [4, 2]])).model;
    assertSnowRemeshInvariant(resolved, new Map([[1, 8], [3, 3], [2, 4], [5, 3], [6, 4]]), generate);
  });
}

for (const mode of ['projected', 'width'] as const) {
  it(`#2144 faceted dome retains its geometry-derived pressure ${mode}`, () => facetedDome(mode));
}

if (process.env.RUN_KNOWN_WRONG === '2172') {
  it('known wrong result: #2172 faceted dome retains its geometry-derived pressure panels', () => facetedDome('panels'));
} else {
  it.skip('known wrong result: #2172 faceted dome retains its geometry-derived pressure panels', () => facetedDome('panels'));
}

it('#2144 nodal tributaries receive the same ridge-crossing pressure', () => {
  const model = flat();
  const generate = (m: LoadModelData) => {
    const layout = gravityLayout(m, { mode: 'width', tributaryWidth: 1 });
    layout.widthMembers = []; layout.pieces = [];
    layout.points = [{ elementId: 2, nodeId: m.elements.get(2)!.nodeI, panel: 0, roof: true, w: 1 }];
    const out = snowLoadCases({ model: m, layout, snow: { ...snow, roofSlopeDeg: 20 }, tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    expect(out.cases[1]!.nodal).toEqual([]);
    return out;
  };
  assertSnowRemeshInvariant(model, new Map([[1, 8]]), generate);
});

function perturbedFlat(corner: number, delta: number, angle = 0) {
  const model = flat(2, angle), node = model.nodes.get(corner)!;
  node.z = node.z! + delta;
  return model;
}

for (const mode of ['projected', 'width', 'panels'] as const) for (const angle of [0, 0.37]) for (const corner of [1, 2, 3, 4]) for (const delta of [-1e-12, 1e-12]) {
  it(`#2144 tiny elevation perturbation preserves ridge and pressures ${mode} ${angle} ${corner} ${delta}`, () => {
    const model = perturbedFlat(corner, delta, angle), polygon = [...model.nodes.values()].map(n => [n.x, n.y] as [number, number]);
    const config = { ...snow, roofSlopeDeg: 20, roof: [...model.elements.keys()] };
    const generate = generator(mode, config, polygon), base = generate(flat(2, angle)), out = generate(model);
    expect(roofGeometry(model)).toEqual({ ...base.geometry, origin: model.nodes.get(1)! });
    expect(roofGeometry(model, new Set(config.roof))).toEqual({ ...base.geometry, origin: model.nodes.get(1)! });
    expect(out.geometry).toEqual({ ...base.geometry, origin: model.nodes.get(1)! });
    expect(out.cases).toEqual(base.cases);
    expect(pressure(out.cases[1]!.distributed, 2, 1)).toBeCloseTo(0, 10);
  });
}

for (const delta of [0, 1e-8 - 1e-12, 1e-8, 1e-8 + 1e-12]) for (const corner of [1, 3]) for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`#2144 ridge elevation tolerance boundary ${mode} ${corner} ${delta}`, () => {
    const model = perturbedFlat(corner, delta), polygon = [...model.nodes.values()].map(n => [n.x, n.y] as [number, number]);
    const generate = generator(mode, { ...snow, roofSlopeDeg: 20 }, polygon), base = generate(flat()), out = generate(model);
    const higher = delta > 1e-8;
    expect(out.geometry.ridge).toBe(higher ? (corner === 1 ? 0 : 4) : 2);
    expect(roofGeometry(model)).toEqual(out.geometry);
    const expected = 1.5 * 0.7 * 50 / 65 * (higher && corner === 1 ? 1 : 0);
    expect(pressure(out.cases[1]!.distributed, 2, 1)).toBeCloseTo(expected, 10);
    if (!higher) {
      expect(out.cases.map(({ nodal, ...c }) => c)).toEqual(base.cases.map(({ nodal, ...c }) => c));
      if (mode !== 'projected' || delta === 0) expect(out.cases).toEqual(base.cases);
      else {
        expect(out.cases[0]!.nodal).toHaveLength(4);
        const dz = model.nodes.get(corner)!.z! - 3, ps = 0.7 * 50 / 65;
        for (const n of out.cases[0]!.nodal) {
          expect(Math.hypot(n.fx, n.fy)).toBeCloseTo(ps * dz / 2, 20);
          expect(n.fz).toBeLessThan(0);
        }
      }
    }
  });
}

for (const mode of ['width', 'panels'] as const) for (const delta of [-1e-12, 1e-12]) {
  it(`#2144 complete load planner preserves tiny elevation ridge ${mode} ${delta}`, () => {
    const input = { regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam' as const, floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, gravity: { mode }, tributaryWidth: 1, snow: { ...snow, roofSlopeDeg: 20, enabled: true, source: 'site' as const } };
    const base = buildLoadPlan({ ...input, model: flat() }), out = buildLoadPlan({ ...input, model: perturbedFlat(1, delta) });
    expect(out.outcome).toBe('READY');
    expect(out.cases).toEqual(base.cases);
    expect(out.distributed).toEqual(base.distributed);
    expect(out.nodal).toEqual(base.nodal);
    const c = out.cases.findIndex(c => c.type === 'S' && c.nameKey === 'snow.case.unbalanced');
    expect(pressure(out.distributed.filter(d => d.caseIndex === c), 2, 1)).toBeCloseTo(0, 10);
  });
}

for (const delta of [-1e-12, 1e-12]) {
  it(`#2144 nodal tributary preserves tiny elevation ridge ${delta}`, () => {
    const model = perturbedFlat(1, delta), layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
    layout.widthMembers = []; layout.pieces = [];
    layout.points = [{ elementId: 2, nodeId: model.elements.get(2)!.nodeI, panel: 0, roof: true, w: 1 }];
    const out = snowLoadCases({ model, layout, snow: { ...snow, roofSlopeDeg: 20 }, tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    expect(out.cases[1]!.nodal).toEqual([]);
  });
}
