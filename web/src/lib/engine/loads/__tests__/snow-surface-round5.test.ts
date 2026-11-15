import { expect, it } from 'vitest';
import { concave, mesh, transform } from './snow-surface-round2-fixture';
import { ridgeRoofs } from './snow-surface-round3-fixture';
import { pressure, regulations, snow } from './snow-roof-plane-fixture';
import { roofSnow } from '../../../codes/cirsoc104/snow';
import { gravityLayout, type GravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import { roofSurfaceModel } from '../snow-roof-surfaces';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { buildLoadPlan } from '../load-plan';

const knownWrong = it;
const drift = { pg: 1, pf: 0.7, balanced: 0.7, slippery: true, tributaryWidth: 1 };
const expected = (gradient: number, W: number) => roofSnow({ ...snow, roof: { kind: 'gable', slippery: true, slopeDeg: Math.atan(gradient) * 180 / Math.PI, W } });

function panelLayout(model: ReturnType<typeof mesh>, reverse = false): GravityLayout {
  const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
  const polygon = [...model.nodes.values()].map(n => [n.x, n.y] as [number, number]);
  layout.panels = [{ polygon: reverse ? polygon.reverse() : polygon, z: Math.min(...[...model.nodes.values()].map(n => n.z!)), roof: true }];
  layout.widthMembers = [];
  layout.points = [];
  layout.pieces = [3, 4].map(elementId => ({ elementId, panel: 0, roof: true, a: 0.25, b: 0.75, wI: 0.2, wJ: 0.2 }));
  return layout;
}

for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) for (const mirror of [1, -1]) for (const reverse of [false, true]) for (const reversedMember of [false, true]) {
  knownWrong(`known wrong result: #2095 round5 recess pressure ${angle} ${mirror} ${reverse} ${reversedMember}`, () => {
    const model = transform(concave(), angle, 1, mirror), layout = panelLayout(model, reverse);
    if (reversedMember) for (const id of [3, 4]) {
      const e = model.elements.get(id)!;
      [e.nodeI, e.nodeJ] = [e.nodeJ, e.nodeI];
    }
    const sf = roofSurfaceModel(model), ps = expected(0.2, 4).ps;
    const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    for (const id of [3, 4]) expect(pressure(out.cases[0]!.distributed, id, 0.5)).toBeCloseTo(ps * 0.2, 9);
    for (const pc of layout.pieces) {
      const direct = sf.pieceLoads(pc, layout, plane => {
        expect(plane).toBeDefined();
        return expected(Math.hypot(...plane!.gradient), plane!.W).ps;
      });
      expect(pressure(direct, pc.elementId, 0.5)).toBeCloseTo(ps * 0.2, 9);
    }
  });
}

for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) for (const mirror of [1, -1]) for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round5 public concave pressure ${angle} ${mirror} ${mode}`, () => {
    const model = transform(concave(), angle, 1, mirror);
    const layout = mode === 'projected' ? undefined : mode === 'panels' ? panelLayout(model) : gravityLayout(model, { mode, tributaryWidth: 1 });
    const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    for (const id of [3, 4]) {
      const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z! - a.z!);
      const horizontal = Math.hypot(b.x - a.x, b.y - a.y);
      const factor = mode === 'panels' ? 0.2 : mode === 'projected' ? (horizontal / length) ** 2 : 1;
      expect(pressure(out.cases[0]!.distributed, id, 0.5)).toBeCloseTo(expected(0.2, 4).ps * factor, 9);
    }
  });
}

for (const offset of [0, 0.25]) {
  knownWrong(`known wrong result: #2095 round5 missing pitched strip refuses ${offset}`, () => {
    const model = concave(), layout = panelLayout(model);
    layout.panels[0]!.polygon = [[1, 1 + offset], [4, 1 + offset], [4, 2], [1, 2]];
    layout.pieces = [layout.pieces[0]!];
    const sf = roofSurfaceModel(model);
    expect(() => sf.pieceLoads(layout.pieces[0]!, layout, () => 1)).toThrow('snow.refused.roofPlane');
    expect(sf.resolves(layout)).toBe(false);
    expect(() => driftAndSlidingLoads(model, layout, drift)).toThrow('snow.refused.roofPlane');
    const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
    expect(out.result.refused).toBe('snow.refused.roofPlane');
    expect(out.cases).toEqual([]);
  });
}

function contactRoof(length: number, location = 3) {
  const base = ridgeRoofs('single');
  const rings = [
    [[0, 0, 3], [6, 0, 3], [6, 4, 5], [0, 4, 5]],
    [[0, 4, 5], [6, 4, 5], [6, 8, 3], [0, 8, 3]],
  ];
  rings.push(length === 0
    ? [[location, 4, 5], [location + 1, 6, 5.4], [location - 1, 6, 5.4]]
    : [[location - length / 2, 4, 5], [location + length / 2, 4, 5], [location + length / 2, 6, 5.4], [location - length / 2, 6, 5.4]]);
  return { base, model: mesh(rings) };
}

for (const location of [0, 3, 6]) for (const angle of [0, Math.PI / 2]) for (const mirror of [1, -1]) for (const mode of ['projected', 'width', 'panels'] as const) {
  knownWrong(`known wrong result: #2095 round5 point contact carries no ridge load ${location} ${angle} ${mirror} ${mode}`, () => {
    const fixtures = contactRoof(0, location);
    const model = transform(fixtures.model, angle, 1, mirror), base = transform(fixtures.base, angle, 1, mirror);
    const sf = roofSurfaceModel(model);
    const layoutOf = (m: typeof model) => mode === 'projected' ? undefined : gravityLayout(m, { mode, tributaryWidth: 1 });
    const out = snowLoadCases({ model, snow, layout: layoutOf(model), tributaryWidth: 1 })!;
    const control = snowLoadCases({ model: base, snow, layout: layoutOf(base), tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    expect(control.result.refused).toBeUndefined();
    expect(out.cases).toHaveLength(control.cases.length);
    for (const [k, c] of control.cases.entries()) expect(pressure(out.cases[k]!.distributed, 3, 3)).toBeCloseTo(pressure(c.distributed, 3, 3), 9);
    expect(sf.memberPlanes(3)).toHaveLength(2);
    if (mode !== 'projected') {
      const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } });
      expect(plan.outcome).toBe('READY');
      const cases = plan.cases.filter(c => c.type === 'S');
      expect(cases).toHaveLength(out.cases.length);
      for (const [k, c] of cases.entries()) expect(pressure(plan.distributed.filter(d => d.caseType === 'S' && d.caseIndex === plan.cases.indexOf(c)), 3, 3)).toBeCloseTo(pressure(out.cases[k]!.distributed, 3, 3), 9);
    }
  });
}

for (const length of [0.02, 2, 5.999]) for (const location of [1, 3]) for (const mode of ['projected', 'width', 'panels'] as const) {
  knownWrong(`known wrong result: #2095 round5 partial member support refuses ${length} ${location} ${mode}`, () => {
    const { model } = contactRoof(length, location), sf = roofSurfaceModel(model);
    expect(() => sf.memberPlanes(3)).toThrow('snow.refused.roofPlane');
    const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
    const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
    expect(out.result.refused).toBe('snow.refused.roofPlane');
    expect(out.cases).toEqual([]);
    if (layout) expect(() => driftAndSlidingLoads(model, layout, drift)).toThrow('snow.refused.roofPlane');
    if (mode !== 'projected') {
      const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } });
      expect(plan.outcome).toBe('BLOCKED');
      expect(plan.blockedKeys.some(m => m.key === 'snow.refused.roofPlane')).toBe(true);
      expect(plan.cases.filter(c => c.type === 'S')).toEqual([]);
    }
  });
}

for (const length of [6, 6.001]) {
  it(`round5 full member support keeps all actual facets ${length}`, () => {
    const { model } = contactRoof(length), sf = roofSurfaceModel(model);
    expect(sf.memberPlanes(3)).toHaveLength(3);
    const out = snowLoadCases({ model, snow: { ...snow, roof: [3] }, tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    expect(pressure(out.cases[0]!.distributed, 3, 3)).toBeCloseTo((2 * expected(0.5, 4).ps + expected(0.2, 2).ps) / 3, 9);
  });
}

it('round5 a flat roof keeps flat panel pressure', () => {
  const model = mesh([[[0, 0, 3], [4, 0, 3], [4, 4, 3], [0, 4, 3]]]);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  expect(pressure(out.cases[0]!.distributed, 1, 2)).toBeCloseTo(2 * expected(0, 4).ps, 9);
});
