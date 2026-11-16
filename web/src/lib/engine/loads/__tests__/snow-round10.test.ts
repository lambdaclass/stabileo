import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases, type SnowCasesInput } from '../snow-loads';
import { snowDistributedResultant } from './snow-remesh-invariance';
import { roofSurfaceModel } from '../snow-roof-surfaces';
import { roofSnow } from '../../../codes/cirsoc104/snow';
import { planSnow } from '../load-plan-snow';
import { buildLoadPlan, type PlanSink } from '../load-plan';

function flat(splits: number, angle = 0, W = 2, shift = 0, mirror = 1) {
  const ring = [[0, -W, 3]];
  for (let k = 1; k <= splits; k++) ring.push([16 * k / splits, -W, 3]);
  ring.push([16, W, 3]);
  for (let k = splits - 1; k >= 0; k--) ring.push([16 * k / splits, W, 3]);
  return transform(mesh([ring]), angle, shift, mirror);
}

function generate(splits: number, mode: 'projected' | 'width' | 'panels', angle = 0, W = 2, options: { reverse?: boolean; selected?: boolean; override?: boolean; shift?: number; mirror?: number } = {}) {
  const model = flat(splits, angle, W, options.shift, options.mirror);
  if (options.reverse) for (const e of model.elements.values()) [e.nodeI, e.nodeJ] = [e.nodeJ, e.nodeI];
  const selected = [...model.elements.keys()];
  if (options.selected) {
    for (const [id, x] of [[1000, 100], [1001, 200]] as const) model.nodes.set(id, { id, x, y: 100, z: 3 });
    model.elements.set(1000, { id: 1000, nodeI: 1000, nodeJ: 1001, sectionId: 1, materialId: 1 });
  }
  const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
  if (mode === 'panels' && layout) {
    const reference = flat(1, angle, W, options.shift, options.mirror);
    layout.panels = [{ polygon: [...reference.nodes.values()].map(p => [p.x, p.y]), z: 3 + 11 * (options.shift ?? 0), roof: true }];
    layout.widthMembers = []; layout.points = [];
    layout.pieces = [...model.elements.values()].map(e => {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      return { elementId: e.id, panel: 0, roof: true, a: 0, b: Math.hypot(b.x - a.x, b.y - a.y), wI: 1, wJ: 1 };
    });
  }
  const config: SnowCasesInput['snow'] = { ...snow, ...(options.override === false ? {} : { roofSlopeDeg: 20 }), ...(options.selected ? { roof: selected } : {}) };
  const out = snowLoadCases({ model, layout, snow: config, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  const sink: PlanSink = { cases: [], distributed: [], nodal: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  expect(planSnow({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, tributaryWidth: 1, snow: { ...config, enabled: true, source: 'site' } }, sink, layout)).toBe(true);
  expect(sink.cases).toHaveLength(out.cases.length);
  for (const [k, c] of out.cases.entries()) {
    expect(sink.distributed.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.distributed);
    expect(sink.nodal.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.nodal);
  }
  return { ...out, model };
}

for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round10 flat frame ignores subdivisions ${mode}`, () => {
    const base = generate(1, mode), split = generate(8, mode);
    expect(base.geometry.W).toBeCloseTo(2, 10);
    expect(split.geometry.W).toBeCloseTo(base.geometry.W, 10);
    expect(split.cases).toHaveLength(base.cases.length);
    for (const [k, c] of split.cases.entries()) {
      expect(pressure(c.distributed, 1, 1)).toBeCloseTo(pressure(base.cases[k]!.distributed, 1, 1), 10);
    }
  });
}

function equivalent(base: ReturnType<typeof generate>, out: ReturnType<typeof generate>, splits: number, W: number, reverse = false) {
  expect(out.geometry.W).toBeCloseTo(W, 10);
  expect(out.geometry.direction[0]).toBeCloseTo(base.geometry.direction[0], 10);
  expect(out.geometry.direction[1]).toBeCloseTo(base.geometry.direction[1], 10);
  expect(out.cases).toHaveLength(base.cases.length);
  for (const [k, c] of out.cases.entries()) {
    expect(c.nameKey).toBe(base.cases[k]!.nameKey);
    expect(c.nameParams).toEqual(base.cases[k]!.nameParams);
    expect(c.nodal).toEqual([]);
    for (const source of [1, 2, 3, 4]) for (const direction of [[1, 0], [0, 1]]) {
      const ids = [...out.model.elements.keys()].filter(id => (id <= splits ? 1 : id === splits + 1 ? 2 : id <= 2 * splits + 1 ? 3 : 4) === source);
      const expected = snowDistributedResultant(base.model, base.cases[k]!.distributed, new Set([source]), [0, 0], direction);
      const actual = snowDistributedResultant(out.model, c.distributed, new Set(ids), [0, 0], direction);
      for (const [j, value] of actual.entries()) expect(value).toBeCloseTo(expected[j]!, 10);
    }
    for (let id = 1; id <= 2 * splits + 2; id++) {
      const horizontal = id !== splits + 1 && id !== 2 * splits + 2;
      const baseId = id <= splits ? 1 : id === splits + 1 ? 2 : id <= 2 * splits + 1 ? 3 : 4;
      const offset = id <= splits ? id - 1 : id - splits - 2;
      for (const t of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]) {
        const station = t * (horizontal ? 16 / splits : 2 * W);
        const baseStation = horizontal ? ((reverse ? splits - offset - 1 : offset) + t) * 16 / splits : station;
        expect(pressure(c.distributed, id, station)).toBeCloseTo(pressure(base.cases[k]!.distributed, baseId, baseStation), 10);
      }
    }
  }
}

for (const W of [2, 5.999, 6, 6.001]) for (const angle of [0, 0.37, Math.PI / 2, 2.1]) for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round10 complete loads preserve subdivisions ${W} ${angle} ${mode}`, () => {
    const base = generate(1, mode, angle, W);
    const expected = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: 20, W, slippery: true } });
    expect(base.cases.filter(c => c.nameKey === 'snow.case.unbalanced')).toHaveLength(2);
    for (const splits of [1, 2, 4, 8]) {
      const out = generate(splits, mode, angle, W);
      equivalent(base, out, splits, W);
      expect(pressure(out.cases[0]!.distributed, 1, 0.5)).toBeCloseTo(expected.ps, 10);
      for (const [k, c] of out.cases.filter(c => c.nameKey === 'snow.case.unbalanced').entries()) {
        expect(pressure(c.distributed, 1, 0.5)).toBeCloseTo(k === 0 ? expected.unbalanced!.windward : expected.unbalanced!.leeward, 10);
        expect(pressure(c.distributed, splits + 2, 0.5)).toBeCloseTo(k === 0 ? expected.unbalanced!.leeward : expected.unbalanced!.windward, 10);
      }
    }
  });
}

for (const reverse of [false, true]) for (const selected of [false, true]) for (const angle of [0, 0.37, Math.PI / 2]) for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round10 target run preserves frame ${reverse} ${selected} ${angle} ${mode}`, () => {
    const options = { reverse, selected }, base = generate(1, mode, angle, 2, options);
    for (const splits of [2, 4, 8]) equivalent(base, generate(splits, mode, angle, 2, options), splits, 2, reverse);
  });
}

for (const mode of ['projected', 'width', 'panels'] as const) for (const angle of [0, 0.37, Math.PI / 2]) {
  it(`round10 ordinary flat roof retains balanced answer ${mode} ${angle}`, () => {
    const base = generate(1, mode, angle, 2, { override: false });
    expect(base.cases).toHaveLength(1);
    const expected = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: 0, W: 2, slippery: true } });
    expect(pressure(base.cases[0]!.distributed, 1, 1)).toBeCloseTo(expected.ps, 10);
    for (const splits of [2, 4, 8]) equivalent(base, generate(splits, mode, angle, 2, { override: false }), splits, 2);
  });
}

for (const kind of ['gap', 'offset', 'height'] as const) for (const separation of [0, 0.5e-8, 1.5e-8]) {
  it(`round10 collinear runs respect ${kind} ${separation}`, () => {
    const x = kind === 'gap' ? separation : 0, y = kind === 'offset' ? separation : 0, z = kind === 'height' ? separation : 0;
    const model = mesh([[[0, 0, 3], [2, 0, 3]], [[2 + x, y, 3 + z], [4 + x, y, 3 + z]]]);
    const surfaces = roofSurfaceModel(model);
    expect(surfaces.runs).toHaveLength(separation <= 1e-8 ? 1 : 2);
    expect(Math.max(...surfaces.runs.map(r => r.length))).toBeCloseTo(separation <= 1e-8 ? 4 + x : 2, 10);
    const out = snowLoadCases({ model, snow, tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    expect(out.cases[0]!.distributed.length).toBeGreaterThan(0);
  });
}

it('round10 a noncollinear detour cannot join flat runs', () => {
  const points = [[0, 0, 3], [2, 0, 3], [2, 1, 3], [3, 1, 3], [3, 0, 3], [5, 0, 3]];
  const model = mesh(points.slice(1).map((p, k) => [points[k]!, p]));
  const runs = roofSurfaceModel(model).runs;
  expect(Math.max(...runs.map(r => r.length))).toBeCloseTo(2, 10);
});

for (const splits of [1, 2, 4, 8]) for (const angle of [0, 0.37, Math.PI / 2]) for (const mode of ['width', 'panels'] as const) {
  it(`round10 complete planner uses shared frame ${splits} ${angle} ${mode}`, () => {
    const model = flat(splits, angle), config = { ...snow, roofSlopeDeg: 20 };
    const layout = mode === 'width' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
    const out = snowLoadCases({ model, layout, snow: config, tributaryWidth: 1 })!;
    expect(out.geometry.W).toBeCloseTo(2, 10);
    expect(out.result.refused).toBeUndefined();
    const plan = buildLoadPlan({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, gravity: { mode }, tributaryWidth: 1, snow: { ...config, enabled: true, source: 'site' } });
    expect(plan.outcome).toBe('READY');
    const cases = plan.cases.filter(c => c.type === 'S');
    expect(cases).toHaveLength(out.cases.length);
    for (const [k, c] of cases.entries()) {
      expect(plan.distributed.filter(d => d.caseIndex === plan.cases.indexOf(c)).map(({ caseIndex, caseType, ...d }) => d)).toEqual(out.cases[k]!.distributed);
      expect(plan.nodal.filter(d => d.caseIndex === plan.cases.indexOf(c)).map(({ caseIndex, caseType, ...d }) => d)).toEqual(out.cases[k]!.nodal);
    }
  });
}

for (const W of [6 - 1e-12, 6, 6 + 1e-12]) for (const angle of [0, 0.37, Math.PI / 2]) for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round10 width comparison preserves either side of exact limit ${W} ${angle} ${mode}`, () => {
    const expected = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: 20, W, slippery: true } });
    for (const splits of [1, 2, 4, 8]) {
      const out = generate(splits, mode, angle, W);
      expect(out.result.unbalanced).toEqual(expected.unbalanced);
      expect(pressure(out.cases[1]!.distributed, 1, 0.5)).toBeCloseTo(expected.unbalanced!.windward, 10);
    }
  });
}

for (const mirror of [1, -1]) for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round10 translated and reflected subdivisions ${mirror} ${mode}`, () => {
    const options = { shift: 1, mirror }, base = generate(1, mode, 0.37, 2, options);
    for (const splits of [2, 4, 8]) equivalent(base, generate(splits, mode, 0.37, 2, options), splits, 2);
  });
}

for (const splits of [1, 2, 4, 8]) for (const angle of [0, 0.37, Math.PI / 2]) {
  it(`round10 nodal tributaries use the complete flat run ${splits} ${angle}`, () => {
    const model = flat(splits, angle), layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
    layout.widthMembers = []; layout.pieces = [];
    layout.points = [1, splits + 2].map(elementId => ({ elementId, nodeId: model.elements.get(elementId)!.nodeI, panel: 0, roof: true, w: 1 }));
    const out = snowLoadCases({ model, layout, tributaryWidth: 1, snow: { ...snow, roofSlopeDeg: 20 } })!;
    const expected = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: 20, W: 2, slippery: true } });
    expect(out.result.refused).toBeUndefined();
    expect(out.geometry.W).toBeCloseTo(2, 10);
    for (const [k, c] of out.cases.filter(c => c.nameKey === 'snow.case.unbalanced').entries()) {
      const u = expected.unbalanced!;
      for (const [j, point] of layout.points.entries()) {
        const p = j === k ? u.windward : u.leeward;
        expect(-c.nodal.filter(n => n.carrier === point.elementId).reduce((sum, n) => sum + n.fz, 0)).toBeCloseTo(p, 10);
      }
    }
  });
}

for (const mode of ['projected', 'width', 'panels'] as const) for (const splits of [1, 2, 4, 8]) {
  it(`round10 planar section retains shared run pressure ${mode} ${splits}`, () => {
    const points = Array.from({ length: 2 * splits + 1 }, (_, k) => {
      const x = 8 * k / splits;
      return [x, 0, 3 + Math.min(x, 16 - x) * 0.2];
    });
    const model = mesh(points.slice(1).map((p, k) => [points[k]!, p]));
    const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
    const out = snowLoadCases({ model, layout, tributaryWidth: 1, snow })!;
    const expected = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: Math.atan(0.2) * 180 / Math.PI, W: 8, slippery: true } });
    expect(out.result.refused).toBeUndefined();
    expect(out.geometry.W).toBeCloseTo(8, 10);
    expect(out.cases.filter(c => c.nameKey === 'snow.case.unbalanced')).toHaveLength(2);
    for (const [k, c] of out.cases.filter(c => c.nameKey === 'snow.case.unbalanced').entries()) for (const e of model.elements.values()) {
      const p = (e.id <= splits) === (k === 0) ? expected.unbalanced!.windward : expected.unbalanced!.leeward;
      expect(pressure(c.distributed, e.id)).toBeCloseTo(p * (mode === 'projected' ? 1 / (1 + 0.2 ** 2) : 1), 10);
    }
  });
}
