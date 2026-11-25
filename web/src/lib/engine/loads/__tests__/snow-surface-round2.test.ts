import { transverseSnowLoads } from './snow-roof-plane-fixture';
import { expect, it } from 'vitest';
import { mesh, separateRoofs, asymmetric, concave, disjoint, twoPitch, transform, transformWithDyadicBasis } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { auditRoof } from './snow-slope-audit-fixture';
import { snowLoadCases } from '../snow-loads';
import { roofSurfaceModel } from '../snow-roof-surfaces';
import { gravityLayout } from '../plan-gravity';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { roofSnow } from '../../../codes/cirsoc104/snow';
import { buildLoadPlan } from '../load-plan';

const knownWrong = it;
const expected = (slopeDeg: number, W: number) => roofSnow({ ...snow, roof: { kind: 'gable', slippery: true, slopeDeg, W } });

for (const angle of [0, 0.37, -0.8, Math.PI / 2, Math.PI]) for (const mirror of [1, -1]) {
  for (const mode of ['projected', 'width', 'panels'] as const) {
    knownWrong(`known wrong result: #2095 selected eave retains full roof pitch ${mode} ${angle} ${mirror}`, () => {
      const model = transform(auditRoof('gable', 20), angle, 1, mirror);
      const eave = [...model.elements.values()].find(e => {
        const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        return a.z === 14 && b.z === 14 && Math.hypot(a.x - b.x, a.y - b.y) < 4;
      })!.id;
      const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
      const full = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
      const selected = snowLoadCases({ model, snow: { ...snow, roof: [eave] }, layout, tributaryWidth: 1 })!;
      expect(selected.result.refused).toBeUndefined();
      expect(selected.result.cs).toBeCloseTo(expected(20, 3).cs, 9);
      expect(selected.cases[0]!.distributed.length).toBeGreaterThan(0);
      expect(selected.cases[0]!.distributed).toEqual(full.cases[0]!.distributed.filter(d => d.elementId === eave));
    });
  }
  knownWrong(`known wrong result: #2095 asymmetric panel uses region pitch and width ${angle} ${mirror}`, () => {
    const model = transform(asymmetric(), angle, 1, mirror);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
    const p1 = expected(Math.atan(0.3) * 180 / Math.PI, 1).ps;
    const p2 = expected(Math.atan(0.1) * 180 / Math.PI, 3).ps;
    expect(pressure(out.cases[0]!.distributed, 1, 0.5)).toBeCloseTo(0.5 * p1, 9);
    expect(pressure(out.cases[0]!.distributed, 1, 3)).toBeCloseTo(p1 + p2, 9);
  });
  knownWrong(`known wrong result: #2095 each gable surface governs unbalanced snow ${angle} ${mirror}`, () => {
    const model = transform(asymmetric(0.5, 8), angle, 1, mirror);
    const out = snowLoadCases({ model, snow, tributaryWidth: 1 })!;
    const cases = out.cases.filter(c => c.nameKey === 'snow.case.unbalanced');
    expect(cases).toHaveLength(2);
    const low = expected(Math.atan(0.5) * 180 / Math.PI, 1);
    const high = expected(Math.atan(0.5 / 7) * 180 / Math.PI, 7);
    expect(Math.max(...cases.map(c => pressure(c.distributed, 1)))).toBeCloseTo(low.unbalanced!.leeward, 9);
    expect(Math.max(...cases.map(c => pressure(c.distributed, 6)))).toBeCloseTo(high.unbalanced!.leeward, 9);
  });
  knownWrong(`known wrong result: #2095 two pitch sliding follows source to ridge ${angle} ${mirror}`, () => {
    const model = transform(twoPitch(), angle, 1, mirror);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    const inputs = { pg: 1, balanced: 2, pf: 1, tributaryWidth: 1 };
    const yes = driftAndSlidingLoads(model, layout, { ...inputs, slippery: true });
    const no = driftAndSlidingLoads(model, layout, { ...inputs, slippery: false });
    expect(pressure(yes.distributed, 500) - pressure(no.distributed, 500)).toBeCloseTo(0.4 * 6 / 4.5, 9);
  });
  knownWrong(`known wrong result: #2095 concave roof recess has no invented plane ${angle} ${mirror}`, () => {
    const model = transform(concave(), angle, 1, mirror);
    const pt = transformPoint(2, 2, angle, mirror);
    const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
    layout.panels.push({ polygon: [transformPoint(1.5, 1.5, angle, mirror), transformPoint(2.5, 1.5, angle, mirror), transformPoint(2.5, 2.5, angle, mirror), transformPoint(1.5, 2.5, angle, mirror)], z: 14, roof: true });
    expect(roofSurfaceModel(model).panel(layout.panels.length - 1, layout).planeAt(pt)).toBeUndefined();
  });
  knownWrong(`known wrong result: #2095 disconnected parallel sections retain their own width ${angle} ${mirror}`, () => {
    const model = transform(disjoint(), angle, 1, mirror);
    const sf = roofSurfaceModel(model);
    for (const p of sf.planes) expect(p.W).toBeCloseTo(2, 9);
  });
}

function transformPoint(x: number, y: number, angle: number, mirror: number): [number, number] {
  return [mirror * x * Math.cos(angle) - y * Math.sin(angle) + 137, mirror * x * Math.sin(angle) + y * Math.cos(angle) - 91];
}

knownWrong('known wrong result: #2095 partial exemption belongs to each surface', () => {
  const rings: number[][][] = [];
  for (const [y0, y1, z0, z1] of [[0, 1, 3, 3.3], [1, 4, 3.3, 3], [4, 5, 3, 3.3], [5, 8, 3.3, 3]]) {
    rings.push([[0, y0!, z0!], [6, y0!, z0!], [6, y1!, z1!], [0, y1!, z1!]]);
  }
  const model = mesh(rings);
  const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow: { ...snow, partial: true }, layout, tributaryWidth: 1 })!;
  expect(out.cases.filter(c => c.pattern && c.nameParams.axis === 'Y').length).toBeGreaterThan(0);
});

for (const angle of [0, 0.37, Math.PI / 2]) for (const shift of [0, 1]) for (const mirror of [1, -1]) {
  for (const fixture of [asymmetric, concave, disjoint, separateRoofs, twoPitch]) for (const mode of ['width', 'panels'] as const) {
    it(`all generated loads and planner agree for ${fixture.name} ${mode} ${angle} ${shift} ${mirror}`, () => {
      const base = fixture();
      const rotate = fixture === twoPitch && mode === 'width' ? transformWithDyadicBasis : transform;
      const model = rotate(fixture(), angle, shift, mirror);
      const layout = gravityLayout(model, { mode, tributaryWidth: 1 });
      const direct = snowLoadCases({ model, snow: { ...snow, partial: true }, layout, tributaryWidth: 1 })!;
      const reference = snowLoadCases({ model: base, snow: { ...snow, partial: true }, layout: gravityLayout(base, { mode, tributaryWidth: 1 }), tributaryWidth: 1 })!;
      expect(direct.result.refused).toBe(reference.result.refused);
      expect(direct.cases.length).toBe(reference.cases.length);
      const canonical = (c: typeof direct.cases[number]) => [...c.distributed].sort((a, b) => a.elementId - b.elementId || (a.a ?? 0) - (b.a ?? 0) || a.q - b.q);
      for (const [k, c] of direct.cases.entries()) {
        const actual = canonical(c), expected = canonical(reference.cases[k]!);
        expect(actual.length).toBe(expected.length);
        for (const [j, d] of actual.entries()) {
          expect(d.elementId).toBe(expected[j]!.elementId);
          for (const key of ['q', 'qJ', 'a', 'b'] as const) expect(d[key] ?? 0).toBeCloseTo(expected[j]![key] ?? 0, 9);
        }
      }
      const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode }, tributaryWidth: 1, snow: { ...snow, partial: true, enabled: true, source: 'site' } });
      if (fixture === twoPitch && mode === 'panels') {
        expect(direct).toMatchObject({ result: { refused: 'snow.refused.stepDriftTransfer' }, cases: [] });
        expect(plan).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [{ key: 'snow.refused.stepDriftTransfer' }], cases: [], distributed: [] });
        return;
      }
      expect(plan.outcome).toBe('READY');
      const index = plan.cases.findIndex(c => c.type === 'S');
      const planned = plan.distributed.filter(d => d.caseIndex === index);
      const compare = mode === 'panels' ? direct : snowLoadCases({ model, snow, tributaryWidth: 1 })!;
      for (const id of model.elements.keys()) expect(pressure(planned, id)).toBeCloseTo(pressure(compare.cases[0]!.distributed, id), 9);
    });
  }
}

it('ridge tributaries use the width and pressure of the surface they carry', () => {
  const model = asymmetric();
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  layout.panels = [{ polygon: [[0, 0], [6, 0], [6, 1], [0, 1]], z: 3, roof: true }, { polygon: [[0, 1], [6, 1], [6, 4], [0, 4]], z: 3, roof: true }];
  layout.pieces = [{ elementId: 3, a: 0, b: 6, wI: 0.5, wJ: 0.5, roof: true, panel: 0 }, { elementId: 3, a: 0, b: 6, wI: 1.5, wJ: 1.5, roof: true, panel: 1 }];
  layout.points = []; layout.widthMembers = [];
  const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
  const ps = [expected(Math.atan(0.3) * 180 / Math.PI, 1).ps, expected(Math.atan(0.1) * 180 / Math.PI, 3).ps];
  expect(pressure(out.cases[0]!.distributed, 3)).toBeCloseTo(0.5 * ps[0]! + 1.5 * ps[1]!, 9);
});

for (const gap of [0, 0.001]) {
  it(`a source contributes only continuously connected upslope facets: gap ${gap}`, () => {
    const model = twoPitch();
    if (gap) for (const n of model.nodes.values()) if (n.id >= 300 && n.x <= -1) {
      if (n.x === -1) continue;
      n.x -= gap;
    }
    if (gap) {
      for (const e of [...model.elements.values()].filter(e => e.id >= 305)) {
        for (const end of ['nodeI', 'nodeJ'] as const) {
          const n = model.nodes.get(e[end])!;
          if (n.x !== -1) continue;
          const id = model.nodes.size + 1000;
          model.nodes.set(id, { ...n, id, x: n.x - gap }); e[end] = id;
        }
      }
    }
    const sf = roofSurfaceModel(model), source = sf.atMember.get(302)!;
    expect(sf.sourceWidth(source)).toBeCloseTo(gap ? 1 : 6, 9);
  });
}

it('an open spatial source over a receiver refuses instead of omitting sliding', () => {
  const model = mesh([[[0, 0, 3], [6, 0, 3], [6, 6, 3], [0, 6, 3]], [[0, 0, 4], [-6, 0, 5]], [[0, 6, 4], [-6, 6, 5]]]);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  expect(snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!.result.refused).toBe('snow.refused.roofPlane');
  expect(() => driftAndSlidingLoads(model, layout, { pg: 1, pf: 0.7, balanced: 0.7, slippery: true, tributaryWidth: 1 })).toThrow('snow.refused.roofPlane');
});

it('a flat panel in a concave roof recess retains flat-roof snow', () => {
  const ring = [...concave().nodes.values()].map(n => [n.x, n.y, n.z!]);
  const model = mesh([ring, [[1.5, 1.5, 3], [2.5, 1.5, 3], [2.5, 2.5, 3], [1.5, 2.5, 3]]]);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  expect(pressure(out.cases[0]!.distributed, 7, 0.5)).toBeCloseTo(0.5, 9);
});

it('disjoint sections retain the correct balanced pressure through the public generator', () => {
  const model = transform(disjoint(), 0.37);
  const out = snowLoadCases({ model, snow, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  for (const d of transverseSnowLoads(model, out.cases[0]!.distributed)) expect(-d.q).toBeCloseTo(expected(Math.atan(0.1) * 180 / Math.PI, 2).ps / 1.01, 9);
});

it('closed disjoint coplanar footprints keep their widths and the empty gap', () => {
  const model = separateRoofs(), sf = roofSurfaceModel(model);
  expect(sf.planes).toHaveLength(2);
  for (const p of sf.planes) expect(p.W).toBeCloseTo(2, 9);
  const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
  layout.panels.push({ polygon: [[5, 5], [6, 5], [6, 6], [5, 6]], z: 3, roof: true });
  expect(sf.panel(layout.panels.length - 1, layout).planeAt([5.5, 5.5])).toBeUndefined();
});

it('no unbalanced cases are generated when each surface is below its own limit', () => {
  const out = snowLoadCases({ model: asymmetric(), snow, tributaryWidth: 1 })!;
  expect(out.cases.filter(c => c.nameKey === 'snow.case.unbalanced')).toHaveLength(0);
});

for (const W of [5.999, 6.001]) {
  it(`each gable side uses the correct branch at W ${W}`, () => {
    const rise = W * Math.tan(10 * Math.PI / 180), model = asymmetric(rise, W + 10);
    for (const n of model.nodes.values()) if (n.y === 1) n.y = W;
    const out = snowLoadCases({ model, snow, tributaryWidth: 1 })!;
    const cases = out.cases.filter(c => c.nameKey === 'snow.case.unbalanced');
    expect(cases).toHaveLength(2);
    expect(Math.max(...cases.map(c => pressure(c.distributed, 1)))).toBeCloseTo(expected(10, W).unbalanced!.leeward, 9);
    expect(Math.min(...cases.map(c => pressure(c.distributed, 1)))).toBeCloseTo(expected(10, W).unbalanced!.windward, 9);
  });
}

it('an unresolved nodal tributary spanning different surfaces refuses', () => {
  const model = asymmetric(), layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  layout.points.push({ nodeId: 1, elementId: 1, panel: 0, w: 0.1, roof: true });
  expect(snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!.result.refused).toBe('snow.refused.roofPlane');
  expect(() => roofSurfaceModel(model).panel(0, layout)).toThrow('snow.refused.roofPlane');
});

it('a sloped cantilever beyond a closed footprint retains a width-section answer', () => {
  const model = mesh([[[0, 0, 3], [6, 0, 3], [6, 6, 6], [0, 6, 6]]]);
  model.nodes.set(100, { id: 100, x: 0, y: 7, z: 6.5 });
  model.elements.set(100, { id: 100, nodeI: 4, nodeJ: 100, sectionId: 1, materialId: 1 });
  const out = snowLoadCases({ model, snow, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  expect(pressure(transverseSnowLoads(model, out.cases[0]!.distributed), 100)).toBeCloseTo(expected(Math.atan(0.5) * 180 / Math.PI, 7).ps / 1.25, 9);
});
