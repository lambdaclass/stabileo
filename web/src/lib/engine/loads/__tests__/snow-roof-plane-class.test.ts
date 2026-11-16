import { transverseSnowLoads } from './snow-roof-plane-fixture';
import { expect, it } from 'vitest';
import { snow, run, pressure, skewRoof, regulations } from './snow-roof-plane-fixture';
import { stepRoof } from './snow-step-fixture';
import { auditRoof } from './snow-slope-audit-fixture';
import { snowLoadCases } from '../snow-loads';
import { snowRoofSurfaces, roofSurfaceModel } from '../snow-roof-surfaces';
import { buildLoadPlan } from '../load-plan';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { gravityLayout } from '../plan-gravity';

function transformed(model: ReturnType<typeof stepRoof>, angle: number, mirror: number, shift: number) {
  for (const n of model.nodes.values()) {
    const x = mirror * n.x, y = n.y;
    n.x = x * Math.cos(angle) - y * Math.sin(angle) + 137 * shift;
    n.y = x * Math.sin(angle) + y * Math.cos(angle) - 91 * shift;
    n.z = (n.z ?? 0) + 11 * shift;
  }
  return model;
}

function required(ps: number, height: number, distance = 0.1) {
  const gamma = 0.426 + 2.2, hb = ps / gamma, hc = Math.max(0, height - hb), hd = 0.381;
  const width = Math.min(hd <= hc ? 4 * hd : 4 * hd ** 2 / hc, 8 * hc);
  return ps + (hc / hb < 0.2 || distance > width ? 0 : gamma * Math.min(hd, hc) * (1 - distance / width));
}

for (const angle of [0, 0.37, -0.8, 1.1, Math.PI / 2, Math.PI]) for (const mirror of [1, -1]) for (const shift of [0, 1]) {
  it(`pitched receiver loads are rigid-plan invariant: ${angle}, mirror ${mirror}, shift ${shift}`, () => {
    const model = transformed(stepRoof(), angle, mirror, shift);
    const out = run(model);
    const ps = (70 - 20) / 65;
    expect(out.result.pf).toBeCloseTo(1, 12);
    expect(out.geometry.W).toBeCloseTo(1, 9);
    expect(pressure(out.cases[0]!.distributed, 500)).toBeCloseTo(required(ps, 0.45), 9);
    const x = 0.5 / Math.cos(20 * Math.PI / 180);
    expect(pressure(out.cases[0]!.distributed, 500, x)).toBeCloseTo(required(ps, 0.45 - 0.5 * Math.tan(20 * Math.PI / 180)), 9);
    const width = run(model, 'width');
    expect(pressure(width.cases[0]!.distributed, 500)).toBeCloseTo(ps, 9);
    const projected = snowLoadCases({ model, snow, tributaryWidth: 1 })!;
    expect(pressure(transverseSnowLoads(model, projected.cases[0]!.distributed), 500)).toBeCloseTo(ps * Math.cos(20 * Math.PI / 180) ** 2, 9);
  });
  it(`skew roof plane elevations are invariant: ${angle}, mirror ${mirror}, shift ${shift}`, () => {
    const model = transformed(skewRoof(), angle, mirror, shift);
    const sf = roofSurfaceModel(model).atMember.get(5)!;
    expect(sf.slope).toBeCloseTo(Math.atan(0.5) * 180 / Math.PI, 9);
    expect(sf.W).toBeCloseTo(6, 9);
    const pt = model.nodes.get(4)!;
    expect(sf.elevation([pt.x, pt.y])).toBeCloseTo(6 + 11 * shift, 9);
  });
}

for (const heightRatio of [1.199, 1.201]) for (const angle of [0, 0.37]) {
  it(`receiving snow depth bounds the low-step exemption: ${heightRatio}, rotation ${angle}`, () => {
    const ps = (70 - 20) / 65, hb = ps / (0.426 + 2.2), height = heightRatio * hb;
    const out = run(stepRoof(20, 20, height, angle));
    expect(pressure(out.cases[0]!.distributed, 500)).toBeCloseTo(required(ps, height), 9);
    expect(out.derivation.some(d => d.key === 'snow.derivation.drift')).toBe(heightRatio > 1.2);
  });
}

for (const factor of [0.999, 1.001]) {
  it(`drift is capped on the correct side of hc = hd: ${factor}`, () => {
    const ps = (70 - 20) / 65, height = ps / (0.426 + 2.2) + 0.381 * factor;
    const out = run(stepRoof(20, 0, height));
    expect(pressure(out.cases[0]!.distributed, 500)).toBeCloseTo(required(ps, height), 9);
  });
}

for (const slope of [0, 20]) for (const angle of [0, 0.37, 1.1]) {
  it(`a roof without a step keeps its balanced answer: slope ${slope}, rotation ${angle}`, () => {
    const model = transformed(auditRoof('gable', slope), angle, 1, 0);
    const out = run(model);
    expect(out.derivation.some(d => d.key === 'snow.derivation.drift')).toBe(false);
    const want = slope === 0 ? 1 : 0.7 * (70 - 20) / 65;
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    for (const piece of layout.pieces.filter(p => p.roof && p.wI > 0)) {
      const load = out.cases[0]!.distributed.find(d => d.elementId === piece.elementId && d.a === piece.a && d.b === piece.b)!;
      expect(-load.q / piece.wI).toBeCloseTo(want, 9);
    }
  });
}

it('the panel plane evaluates elevation away from a diagonal rafter', () => {
  const model = skewRoof();
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  layout.panels.push({ polygon: [[0, 0], [6, 0], [6, 6], [0, 6]], z: 3, roof: true, });
  const sf = snowRoofSurfaces(model, layout)(layout.panels.length - 1);
  expect(sf.elevation([0, 6])).toBeCloseTo(6, 12);
  expect(sf.slope).toBeCloseTo(Math.atan(0.5) * 180 / Math.PI, 12);
});

for (const mode of ['panels', 'width'] as const) {
  it(`the load planner and direct generator share the same roof model: ${mode}`, () => {
    const model = stepRoof(20, 0, 0.45, 0.37);
    const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model,
      gravity: { mode }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } });
    expect(plan.outcome).toBe('READY');
    const index = plan.cases.findIndex(c => c.type === 'S');
    const direct = mode === 'panels' ? run(model) : snowLoadCases({ model, snow, tributaryWidth: 1 })!;
    expect(pressure(plan.distributed.filter(d => d.caseIndex === index), 500)).toBeCloseTo(pressure(direct.cases[0]!.distributed, 500), 9);
  });
}

it('an isolated diagonal cannot determine a plane over a two-dimensional footprint', () => {
  const model = skewRoof();
  for (const id of [1, 2, 3, 4]) model.elements.delete(id);
  const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
  layout.panels.push({ polygon: [[0, 0], [6, 0], [6, 6], [0, 6]], z: 3, roof: true });
  expect(snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!.result.refused).toBe('snow.refused.roofPlane');
  expect(() => snowRoofSurfaces(model, layout)(0)).toThrow('snow.refused.roofPlane');
});

function compareCases(actual: ReturnType<typeof run>, expected: ReturnType<typeof run>) {
  expect(actual.cases.length).toBe(expected.cases.length);
  for (const [i, c] of actual.cases.entries()) {
    const list = (xs: typeof c.distributed) => [...xs].sort((a, b) => a.elementId - b.elementId || (a.a ?? 0) - (b.a ?? 0) || (a.b ?? 1e9) - (b.b ?? 1e9) || a.q - b.q);
    const a = list(c.distributed), b = list(expected.cases[i]!.distributed);
    expect(a.length).toBe(b.length);
    for (const [j, load] of a.entries()) {
      expect(load.elementId).toBe(b[j]!.elementId);
      expect(load.frame).toBe(b[j]!.frame);
      for (const key of ['q', 'qJ', 'a', 'b'] as const) expect(load[key] ?? load.q).toBeCloseTo(b[j]![key] ?? b[j]!.q, 9);
    }
  }
}

for (const angle of [0.37, -0.8, 1.1, Math.PI / 2]) {
  it(`every generated step-roof load survives rotation ${angle}`, () => {
    compareCases(run(stepRoof(20, 0, 0.45, angle)), run());
  });
  it(`all partial snow patterns use roof axes at rotation ${angle}`, () => {
    const base = auditRoof('gable', 5);
    for (const m of [base, transformed(auditRoof('gable', 5), angle, 1, 1)]) {
      const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 1 });
      const out = snowLoadCases({ model: m, snow: { ...snow, partial: true }, layout, tributaryWidth: 1 })!;
      const ref = snowLoadCases({ model: base, snow: { ...snow, partial: true }, layout: gravityLayout(base, { mode: 'panels', tributaryWidth: 1 }), tributaryWidth: 1 })!;
      compareCases(out, ref);
    }
  });
}

for (const angle of [0, 0.37, 1.1]) {
  it(`a planar roof section retains its width-based answer at rotation ${angle}`, () => {
    const model = skewRoof();
    model.nodes.clear(); model.elements.clear();
    for (const [id, x, z] of [[1, 0, 3], [2, 1, 3 + Math.tan(20 * Math.PI / 180)], [3, 2, 3]] as const) model.nodes.set(id, { id, x, y: 0, z });
    for (const [id, nodeI, nodeJ] of [[1, 1, 2], [2, 2, 3]] as const) model.elements.set(id, { id, nodeI, nodeJ, sectionId: 1, materialId: 1 });
    transformed(model, angle, 1, 1);
    const out = snowLoadCases({ model, snow, tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    expect(out.geometry.W).toBeCloseTo(1, 12);
    for (const d of transverseSnowLoads(model, out.cases[0]!.distributed)) expect(-d.q).toBeCloseTo((70 - 20) / 65 * Math.cos(20 * Math.PI / 180) ** 2, 12);
  });
}

for (const height of [0.099, 0.101]) {
  it(`a physical low step is not discarded by a geometric height cutoff: ${height}`, () => {
    const model = stepRoof(20, 20, height);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    const out = snowLoadCases({ model, snow: { ...snow, pg: 0.1 }, layout, tributaryWidth: 1 })!;
    const ps = 0.1 * (70 - 20) / 65, gamma = 0.426 * 0.1 + 2.2, hc = height - ps / gamma;
    const width = Math.min(4 * 0.269 ** 2 / hc, 8 * hc);
    expect(pressure(out.cases[0]!.distributed, 500)).toBeCloseTo(ps + gamma * hc * (1 - 0.1 / width), 9);
  });
}

for (const unrelated of [false, true]) for (const height of [0.2, 0.6]) {
  it(`sliding uses its own source plane and the local receiver: unrelated ${unrelated}, height ${height}`, () => {
    const model = stepRoof(20, 0, height);
    let n = 300, e = 300;
    const source = (x: number, z: number) => {
      for (const y of [0, 2]) {
        model.nodes.set(n, { id: n, x, y, z });
        model.nodes.set(n + 1, { id: n + 1, x: x - 6, y, z: z + 0.6 });
        model.elements.set(e, { id: e, nodeI: n, nodeJ: n + 1, sectionId: 1, materialId: 1 });
        n += 2; e++;
      }
    };
    source(0, 3 + height);
    if (unrelated) source(-30, 8);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    const input = { pg: 1, balanced: (70 - 20) / 65, pf: 1, tributaryWidth: 1 };
    if (height === 0.2) {
      expect(() => driftAndSlidingLoads(model, layout, { ...input, slippery: true })).toThrow('snow.refused.roofPlane');
      expect(run(model).result.refused).toBe('snow.refused.roofPlane');
      expect(run(model).cases).toEqual([]);
      return;
    }
    const sliding = driftAndSlidingLoads(model, layout, { ...input, slippery: true });
    const retained = driftAndSlidingLoads(model, layout, { ...input, slippery: false });
    expect(sliding.derivation.some(d => d.key === 'snow.derivation.sliding')).toBe(true);
    expect(pressure(sliding.distributed, 500) - pressure(retained.distributed, 500)).toBeCloseTo(0.4 * 6 / 4.5, 9);
    const mid = 0.75 / Math.cos(20 * Math.PI / 180);
    expect(pressure(sliding.distributed, 500, mid) - pressure(retained.distributed, 500, mid)).toBeCloseTo(height === 0.6 ? 0.4 * 6 / 4.5 : 0, 9);
  });
}

for (const angle of [0.37, 1.1, Math.PI / 2]) {
  it(`unbalanced snow uses the roof direction at rotation ${angle}`, () => {
    const base = auditRoof('gable', 20);
    const rotated = transformed(auditRoof('gable', 20), angle, 1, 1);
    compareCases(run(rotated), run(base));
    expect(run(rotated).cases.filter(c => c.nameKey === 'snow.case.unbalanced')).toHaveLength(2);
  });
}

it('equally pitched surfaces across a step remain separate planes', () => {
  const model = stepRoof(20, 20, 0.45, 0.37);
  const out = run(model);
  const want = required((70 - 20) / 65, 0.45);
  expect(pressure(out.cases[0]!.distributed, 500)).toBeCloseTo(want, 9);
  expect(pressure(out.cases[0]!.distributed, 500, 0.5 / Math.cos(20 * Math.PI / 180))).toBeCloseTo(want, 9);
});

it('a pitched source supplies local heights above a flat receiver', () => {
  const model = stepRoof(0, 20, 0.45);
  model.nodes.set(500, { id: 500, x: 0.1, y: 0.75, z: 3 });
  model.nodes.set(501, { id: 501, x: 1.1, y: 0.75, z: 3 });
  model.elements.set(500, { id: 500, nodeI: 500, nodeJ: 501, sectionId: 1, materialId: 1 });
  expect(pressure(run(model).cases[0]!.distributed, 500)).toBeCloseTo(required(1, 0.45 + 0.75 * Math.tan(20 * Math.PI / 180)), 9);
});

for (const side of [-1, 1]) for (const angle of [0, 0.37]) {
  it(`the low-slope minimum uses roof width on both sides of its limit: ${side}, rotation ${angle}`, () => {
    const model = stepRoof();
    const W = 21 / (20 - 0.5) + side * 0.001;
    for (const p of model.nodes.values()) {
      p.y *= W;
      if (p.id < 100 || p.id >= 500) p.z = 3 + ((p.z ?? 0) - 3) * W;
    }
    transformed(model, angle, 1, 0);
    const out = run(model, 'width');
    expect(out.geometry.W).toBeCloseTo(W, 12);
    expect(out.result.pf).toBeCloseTo(side < 0 ? 1 : 0.7, 12);
    expect(pressure(out.cases[0]!.distributed, 500)).toBeCloseTo((side < 0 ? 1 : 0.7) * (70 - 20) / 65, 12);
  });
}

for (const mirror of [1, -1]) {
  it(`the full generated load list is invariant under translation and mirror ${mirror}`, () => {
    compareCases(run(transformed(stepRoof(), 0.37, mirror, 1)), run());
  });
}

it('selecting the receiving roof keeps drift from the unselected source', () => {
  const model = stepRoof(20, 20, 0.45, 0.37);
  const selected = [...model.elements.keys()].filter(id => id < 100 || id >= 500);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow: { ...snow, roof: selected }, layout, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  expect(pressure(out.cases[0]!.distributed, 500)).toBeCloseTo(required((70 - 20) / 65, 0.45), 9);
  expect(out.cases[0]!.distributed.every(d => selected.includes(d.elementId))).toBe(true);
});
