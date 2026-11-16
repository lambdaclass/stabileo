import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases, type SnowCasesInput } from '../snow-loads';
import { roofSnow } from '../../../codes/cirsoc104/snow';
import { buildLoadPlan, type PlanSink } from '../load-plan';
import { planSnow } from '../load-plan-snow';
import { roofSurfaceModel } from '../snow-roof-surfaces';

const knownWrong = it;
type Model = ReturnType<typeof mesh>;

function flat(W: number) {
  return mesh([[[0, -W, 3], [30, -W, 3], [30, 0, 3], [0, 0, 3]], [[0, 0, 3], [30, 0, 3], [30, W, 3], [0, W, 3]]]);
}

function section(splits: number, W = 10) {
  const model = mesh([]);
  for (let k = 0; k <= 2 * splits; k++) {
    const x = W * k / splits;
    model.nodes.set(k + 1, { id: k + 1, x, y: 0, z: 3 + Math.min(x, 2 * W - x) * 0.2 });
    if (k) model.elements.set(k, { id: k, nodeI: k, nodeJ: k + 1, sectionId: 1, materialId: 1 });
  }
  return model;
}

function generate(model: Model, mode: 'projected' | 'width' | 'panels', config: SnowCasesInput['snow'], layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 })) {
  const out = snowLoadCases({ model, layout, snow: config, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  const sink: PlanSink = { cases: [], distributed: [], nodal: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  expect(planSnow({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, tributaryWidth: 1, snow: { ...config, enabled: true, source: 'site' } }, sink, layout)).toBe(true);
  expect(sink.cases).toHaveLength(out.cases.length);
  for (const [k, c] of out.cases.entries()) {
    expect(sink.distributed.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.distributed);
    expect(sink.nodal.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.nodal);
  }
  return out;
}

for (const W of [5.999, 6, 6.001, 8]) for (const mode of ['projected', 'width'] as const) {
  knownWrong(`known wrong result: #2095 round8 flat override sides and ridge ${W} ${mode}`, () => {
    const model = flat(W), config = { ...snow, roofSlopeDeg: 20 };
    const out = generate(model, mode, config);
    const expected = roofSnow({ ...config, roof: { kind: 'gable', slopeDeg: 20, W, slippery: true } });
    const cases = out.cases.filter(c => c.nameKey === 'snow.case.unbalanced');
    expect(cases).toHaveLength(2);
    for (const [k, c] of cases.entries()) for (const [y, p] of [[-W, k === 0 ? expected.unbalanced!.windward : expected.unbalanced!.leeward], [W, k === 0 ? expected.unbalanced!.leeward : expected.unbalanced!.windward], [0, (expected.unbalanced!.leeward + expected.unbalanced!.windward) / 2]]) {
      const member = [...model.elements.values()].find(e => model.nodes.get(e.nodeI)!.y === y && model.nodes.get(e.nodeJ)!.y === y)!;
      expect(pressure(c.distributed, member.id, 15)).toBeCloseTo(p!, 10);
    }
  });
}

for (const splits of [1, 2, 3]) for (const mode of ['projected', 'width', 'panels'] as const) {
  knownWrong(`known wrong result: #2095 round8 section split ${splits} ${mode}`, () => {
    const model = section(splits), out = generate(model, mode, snow);
    const expected = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: Math.atan(0.2) * 180 / Math.PI, W: 10, slippery: true } });
    const cases = out.cases.filter(c => c.nameKey === 'snow.case.unbalanced');
    expect(cases).toHaveLength(2);
    const cos2 = mode === 'projected' ? 1 / (1 + 0.2 ** 2) : 1;
    for (const [k, c] of cases.entries()) for (const e of model.elements.values()) {
      const p = (e.id <= splits) === (k === 0) ? expected.unbalanced!.windward : expected.unbalanced!.leeward;
      expect(pressure(c.distributed, e.id)).toBeCloseTo(p * cos2, 10);
    }
  });
}

for (const angle of [0, 0.37, Math.PI / 2]) for (const mirror of [1, -1]) for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round8 flat override allocation ${mode} ${angle} ${mirror}`, () => {
    const model = transform(flat(8), angle, 1, mirror), config = { ...snow, roofSlopeDeg: 20 };
    const out = generate(model, mode, config), balanced = out.cases[0]!;
    const expected = roofSnow({ ...config, roof: { kind: 'gable', slopeDeg: 20, W: 8, slippery: true } });
    const cases = out.cases.filter(c => c.nameKey === 'snow.case.unbalanced');
    expect(cases).toHaveLength(2);
    for (const [k, c] of cases.entries()) for (const id of [1, 3, 6]) {
      const original = flat(8), e = original.elements.get(id)!;
      const a = original.nodes.get(e.nodeI)!, b = original.nodes.get(e.nodeJ)!;
      const alignment = -Math.sin(angle) * out.geometry.direction[0] + Math.cos(angle) * out.geometry.direction[1];
      expect(Math.abs(alignment)).toBeCloseTo(1, 10);
      const side = Math.sign(alignment) * (a.y + b.y) / 2;
      const u = expected.unbalanced!;
      const p = side === 0 ? (u.leeward + u.windward) / 2 : side * (k === 0 ? 1 : -1) > 0 ? u.leeward : u.windward;
      const base = pressure(balanced.distributed, id, 15);
      expect(base).toBeGreaterThan(0);
      expect(pressure(c.distributed, id, 15)).toBeCloseTo(base * p / expected.ps, 10);
    }
  });
}

for (const splits of [1, 2, 3]) for (const angle of [0.37, Math.PI / 2]) for (const mirror of [1, -1]) for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round8 split loads survive transforms ${splits} ${mode} ${angle} ${mirror}`, () => {
    const out = generate(transform(section(splits), angle, 1, mirror), mode, snow);
    const original = generate(section(1), mode, snow);
    expect(out.geometry.W).toBeCloseTo(10, 10);
    expect(out.cases).toHaveLength(original.cases.length);
    for (const [k, c] of out.cases.entries()) for (let id = 1; id <= 2 * splits; id++) {
      expect(pressure(c.distributed, id)).toBeCloseTo(pressure(original.cases[k]!.distributed, id <= splits ? 1 : 2), 10);
    }
  });
}

for (const mode of ['width', 'panels'] as const) for (const kind of ['flat', 'section'] as const) {
  it(`round8 complete planner ${kind} ${mode}`, () => {
    const model = kind === 'flat' ? flat(8) : section(3), config = kind === 'flat' ? { ...snow, roofSlopeDeg: 20 } : snow;
    const out = generate(model, mode === 'width' ? 'projected' : mode, config);
    const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode }, tributaryWidth: 1, snow: { ...config, enabled: true, source: 'site' } });
    expect(plan.outcome).toBe('READY');
    const cases = plan.cases.filter(c => c.type === 'S');
    expect(cases).toHaveLength(out.cases.length);
    for (const [k, c] of cases.entries()) {
      expect(plan.distributed.filter(d => d.caseIndex === plan.cases.indexOf(c)).map(({ caseIndex, caseType, ...d }) => d)).toEqual(out.cases[k]!.distributed);
      expect(plan.nodal.filter(d => d.caseIndex === plan.cases.indexOf(c)).map(({ caseIndex, caseType, ...d }) => d)).toEqual(out.cases[k]!.nodal);
    }
  });
}

for (const slope of [0, 21 / 8 + 0.5 - 0.001, 21 / 8 + 0.5, 70, 70.001]) {
  it(`round8 override unbalanced applicability ${slope}`, () => {
    const out = generate(flat(8), 'width', { ...snow, roofSlopeDeg: slope });
    const expected = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: slope, W: 8, slippery: true } });
    expect(out.cases.filter(c => c.nameKey === 'snow.case.unbalanced')).toHaveLength(expected.unbalanced ? 2 : 0);
    expect(pressure(out.cases[0]!.distributed, 1)).toBeCloseTo(expected.ps, 10);
  });
}

for (const W of [5.999, 6, 6.001]) for (const splits of [1, 2, 3]) {
  it(`round8 section width branch ${W} ${splits}`, () => {
    const out = generate(section(splits, W), 'width', snow);
    const expected = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: Math.atan(0.2) * 180 / Math.PI, W, slippery: true } });
    expect(out.geometry.W).toBeCloseTo(W, 10);
    for (const c of out.cases.filter(c => c.nameKey === 'snow.case.unbalanced')) {
      const loads = [...Array(2 * splits)].map((_, k) => pressure(c.distributed, k + 1));
      expect(Math.min(...loads)).toBeCloseTo(expected.unbalanced!.windward, 10);
      expect(Math.max(...loads)).toBeCloseTo(expected.unbalanced!.leeward, 10);
    }
  });
}

for (const reverse of [false, true]) for (const selected of [false, true]) {
  it(`round8 section shared run ${reverse} ${selected}`, () => {
    const model = section(3);
    if (reverse) for (const e of model.elements.values()) [e.nodeI, e.nodeJ] = [e.nodeJ, e.nodeI];
    const surfaces = roofSurfaceModel(model);
    expect(surfaces.planes).toHaveLength(2);
    for (const p of surfaces.planes) {
      expect(p.kind).toBe('section');
      expect(p.members.size).toBe(3);
      expect(p.W).toBeCloseTo(10, 10);
    }
    const out = generate(model, 'width', { ...snow, ...(selected ? { roof: [1] } : {}) });
    expect(out.geometry.W).toBeCloseTo(10, 10);
    expect(out.cases[0]!.distributed).toHaveLength(selected ? 1 : 6);
  });
}

for (const kind of ['gap', 'gradient', 'height'] as const) {
  it(`round8 section stops at ${kind}`, () => {
    const model = kind === 'gap' ? mesh([[[0, 0, 3], [5, 0, 4]], [[6, 0, 4.2], [11, 0, 5.2]]])
      : kind === 'height' ? mesh([[[0, 0, 3], [5, 0, 4]], [[5, 0, 4.1], [10, 0, 5.1]]])
      : mesh([[[0, 0, 3], [5, 0, 4]], [[5, 0, 4], [10, 0, 4.5]]]);
    const surfaces = roofSurfaceModel(model);
    expect(surfaces.planes).toHaveLength(2);
    for (const p of surfaces.planes) expect(p.W).toBeCloseTo(5, 10);
    expect(generate(model, 'width', snow).cases.length).toBeGreaterThan(0);
  });
}

for (const y of [-0.011, -0.009, 0, 0.009, 0.011]) {
  it(`round8 coordinate ridge sharing boundary ${y}`, () => {
    const model = flat(8);
    for (const row of [-Math.abs(y), Math.abs(y)]) {
      const n = model.nodes.size + 1, id = model.elements.size + 1;
      model.nodes.set(n, { id: n, x: 0, y: row, z: 3 });
      model.nodes.set(n + 1, { id: n + 1, x: 30, y: row, z: 3 });
      model.elements.set(id, { id, nodeI: n, nodeJ: n + 1, sectionId: 1, materialId: 1 });
    }
    const id = model.elements.size - (y < 0 ? 1 : 0);
    const out = generate(model, 'projected', { ...snow, roofSlopeDeg: 20 });
    const u = out.result.unbalanced!;
    for (const [k, c] of out.cases.filter(c => c.nameKey === 'snow.case.unbalanced').entries()) {
      const expected = y === 0 ? (u.leeward + u.windward) / 2 : y * (k === 0 ? 1 : -1) > 0 ? u.leeward : u.windward;
      expect(pressure(c.distributed, id)).toBeCloseTo(expected, 10);
    }
  });
}

for (const y of [-8, 0, 8]) {
  it(`round8 flat override nodal tributary ${y}`, () => {
    const model = flat(8), layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
    const e = [...model.elements.values()].find(e => model.nodes.get(e.nodeI)!.y === y && model.nodes.get(e.nodeJ)!.y === y)!;
    layout.points = [{ nodeId: e.nodeI, elementId: e.id, panel: 0, roof: true, w: 2 }];
    layout.widthMembers = []; layout.pieces = [];
    const config = { ...snow, roofSlopeDeg: 20 };
    const out = generate(model, 'width', config, layout);
    const u = out.result.unbalanced!;
    for (const [k, c] of out.cases.filter(c => c.nameKey === 'snow.case.unbalanced').entries()) {
      const p = y === 0 ? (u.leeward + u.windward) / 2 : y * (k === 0 ? 1 : -1) > 0 ? u.leeward : u.windward;
      expect(c.nodal.reduce((sum, n) => sum - n.fz, 0)).toBeCloseTo(2 * p, 10);
    }
  });
}

for (const delta of [-2e-8, -0.5e-8, 0.5e-8, 2e-8]) {
  it(`round8 section gradient matching boundary ${delta}`, () => {
    const model = mesh([[[0, 0, 3], [5, 0, 4]], [[5, 0, 4], [10, 0, 5 + delta]]]);
    const surfaces = roofSurfaceModel(model);
    const merged = Math.abs(delta) < 1e-8;
    expect(surfaces.planes).toHaveLength(merged ? 1 : 2);
    for (const p of surfaces.planes) expect(p.W).toBeCloseTo(merged ? 10 : 5, 10);
  });
}
