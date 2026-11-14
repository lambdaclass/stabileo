import { expect, it } from 'vitest';
import { ridgeRoofs as roof } from './snow-surface-round3-fixture';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { snowLoadCases } from '../snow-loads';
import { roofSurfaceModel } from '../snow-roof-surfaces';
import { gravityLayout } from '../plan-gravity';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { roofSnow, snowDensity } from '../../../codes/cirsoc104/snow';
import { REF_DRIFT_ADJACENT } from '../../../codes/cirsoc104/drift';
import { buildLoadPlan } from '../load-plan';

const knownWrong = it;


for (const kind of ['perpendicular', 'L', 'hip', 'single'] as const) for (const mode of ['projected', 'width', 'panels'] as const) {
  knownWrong(`known wrong result: #2095 round3 each ridge has governing unbalanced loads ${kind} ${mode}`, () => {
    const model = roof(kind), sf = roofSurfaceModel(model);
    const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
    if (kind === 'hip' && layout && mode === 'panels') {
      layout.pieces = [...model.elements.values()].flatMap(e => {
        const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        return a.z === 3 && b.z === 3 ? [{ elementId: e.id, a: L / 2 - 0.5, b: L / 2 + 0.5, wI: 0.25, wJ: 0.25, roof: true, panel: 0 }] : [];
      });
      layout.widthMembers = [];
    }
    const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    const cases = out.cases.filter(c => c.nameKey === 'snow.case.unbalanced');
    expect(cases).toHaveLength(kind === 'single' ? 2 : 4);
    for (const e of model.elements.values()) {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      if (a.z !== 3 || b.z !== 3) continue;
      const plane = sf.memberPlanes(e.id)[0]!;
      const r = roofSnow({ ...snow, roof: { kind: 'gable', slippery: true, slopeDeg: plane.slope, W: plane.W } });
      const x = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      const balanced = pressure(out.cases[0]!.distributed, e.id, x);
      expect(balanced).toBeGreaterThan(0);
      expect(Math.max(...cases.map(c => pressure(c.distributed, e.id, x))) / balanced).toBeCloseTo(r.unbalanced!.leeward / r.ps, 9);
    }
  });
}

for (const mode of ['projected', 'width', 'panels'] as const) {
  knownWrong(`known wrong result: #2095 round3 selecting a covered lower roof ${mode}`, () => {
    const model = mesh([[[0, 0, 3], [6, 0, 3], [6, 6, 3], [0, 6, 3]], [[0, 0, 6], [6, 0, 6], [6, 6, 6], [0, 6, 6]]]);
    const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
    const out = snowLoadCases({ model, snow: { ...snow, roof: [1, 2, 3, 4] }, layout, tributaryWidth: 1 });
    expect(out).not.toBeNull();
    expect(out!.result.refused).toBeUndefined();
    expect(out!.cases[0]!.distributed.length).toBeGreaterThan(0);
    expect(out!.cases[0]!.distributed.every(d => d.elementId <= 4)).toBe(true);
  });
}

for (const y of [0, 0.25, 1, 1.001]) {
  knownWrong(`known wrong result: #2095 round3 complete source segment crossing ${y}`, () => {
    const model = mesh([[[1, 0, 3], [2, 0, 3], [2, 1, 3], [1, 1, 3]], [[0, y, 4], [10, y, 5]]]);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
    if (y <= 1) {
      expect(out.result.refused).toBe('snow.refused.roofPlane');
      expect(out.cases).toEqual([]);
      expect(() => driftAndSlidingLoads(model, layout, { pg: 1, pf: 0.7, balanced: 0.7, slippery: true, tributaryWidth: 1 })).toThrow('snow.refused.roofPlane');
      expect(() => roofSurfaceModel(model).panel(0, layout)).toThrow('snow.refused.roofPlane');
    } else {
      expect(out.result.refused).toBeUndefined();
      expect(pressure(out.cases[0]!.distributed, 1, 0.5)).toBeCloseTo(0.5, 9);
    }
  });
}

for (const separation of [0, 5.999, 6, 6.001]) {
  knownWrong(`known wrong result: #2095 round3 adjacent drift reports the applying edge interval ${separation}`, () => {
    const model = mesh([[[0, 0, 3], [6, 0, 3], [6, 6, 6], [0, 6, 6]]]);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    layout.panels = [{ polygon: [[0, 0], [0, 6], [6, 6], [6, 0]], z: 3, roof: true }];
    const input = { pg: 1, pf: 0.7, balanced: 0.7, slippery: false, tributaryWidth: 1, adjacent: [{ side: '+x' as const, topZ: 5, separation, length: 20 }] };
    const out = driftAndSlidingLoads(model, layout, input);
    const applies = out.derivation.filter(d => d.key === 'snow.derivation.adjacent');
    if (separation < 6) {
      expect(out.distributed.length).toBeGreaterThan(0);
      expect(out.refs.includes(REF_DRIFT_ADJACENT)).toBe(true);
      expect(applies.length).toBeGreaterThan(0);
      const thresholdY = (5 - 3 - 1.2 * input.balanced / snowDensity(input.pg)) / 0.5;
      expect(applies[0]!.params?.from).toBeCloseTo(6 - thresholdY, 2);
      expect(applies[0]!.params?.to).toBe(6);
    } else {
      expect(out.distributed).toEqual([]);
      expect(out.refs.includes(REF_DRIFT_ADJACENT)).toBe(false);
      expect(applies).toEqual([]);
    }
  });
}

for (const mode of ['width', 'panels'] as const) {
  knownWrong(`known wrong result: #2095 round3 load planner includes each ridge ${mode}`, () => {
    const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model: roof('perpendicular'), gravity: { mode }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } });
    expect(plan.outcome).toBe('READY');
    expect(plan.cases.filter(c => c.type === 'S')).toHaveLength(5);
  });
}

for (const kind of ['perpendicular', 'L', 'hip'] as const) for (const angle of [0.37, -0.8, Math.PI / 2, Math.PI]) for (const mirror of [1, -1]) for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round3 complete snow loads survive rotation ${kind} ${mode} ${angle} ${mirror}`, () => {
    const base = roof(kind), model = transform(roof(kind), angle, 1, mirror);
    const baseLayout = mode === 'projected' ? undefined : gravityLayout(base, { mode, tributaryWidth: 1 });
    const layout = baseLayout && structuredClone(baseLayout);
    if (layout) {
      for (const panel of layout.panels) {
        panel.z += 11;
        panel.polygon = panel.polygon.map(([x, y]) => [mirror * x * Math.cos(angle) - y * Math.sin(angle) + 137, mirror * x * Math.sin(angle) + y * Math.cos(angle) - 91]);
      }
    }
    const a = snowLoadCases({ model: base, snow, layout: baseLayout, tributaryWidth: 1 })!;
    const b = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
    expect(b.result.refused).toBe(a.result.refused);
    expect(b.cases).toHaveLength(a.cases.length);
    const canonical = (c: typeof a.cases[number]) => [...c.distributed].sort((x, y) => x.elementId - y.elementId || (x.a ?? 0) - (y.a ?? 0) || x.q - y.q);
    for (const [k, c] of a.cases.entries()) {
      const expected = canonical(c), actual = canonical(b.cases[k]!);
      expect(actual).toHaveLength(expected.length);
      for (const [j, d] of expected.entries()) {
        expect(actual[j]!.elementId).toBe(d.elementId);
        for (const key of ['q', 'qJ', 'a', 'b'] as const) expect(actual[j]![key] ?? 0).toBeCloseTo(d[key] ?? 0, 9);
      }
      expect(b.cases[k]!.nodal).toHaveLength(c.nodal.length);
      for (const [j, n] of c.nodal.entries()) {
        const actual = b.cases[k]!.nodal[j]!;
        expect(actual.nodeId).toBe(n.nodeId);
        expect(mirror * (Math.cos(angle) * actual.fx + Math.sin(angle) * actual.fy)).toBeCloseTo(n.fx, 9);
        expect(-Math.sin(angle) * actual.fx + Math.cos(angle) * actual.fy).toBeCloseTo(n.fy, 9);
        expect(actual.fz).toBeCloseTo(n.fz, 9);
      }
    }
  });
}

for (const y of [-0.001, 0, 0.25, 1, 1.001]) for (const angle of [0, 0.37, Math.PI / 2]) {
  it(`round3 segment intersection is invariant at panel boundary ${y} ${angle}`, () => {
    const model = transform(mesh([[[1, 0, 3], [2, 0, 3], [2, 1, 3], [1, 1, 3]], [[0, y, 4], [10, y, 5]]]), angle);
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
    expect(out.result.refused).toBe(y >= 0 && y <= 1 ? 'snow.refused.roofPlane' : undefined);
  });
}

it('round3 a source below the panel does not prevent the correct flat roof answer', () => {
  const model = mesh([[[1, 0, 3], [2, 0, 3], [2, 1, 3], [1, 1, 3]], [[0, 0.25, 1], [10, 0.25, 2]]]);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  expect(pressure(out.cases[0]!.distributed, 1, 0.5)).toBeCloseTo(0.5, 9);
});

for (const mode of ['projected', 'width', 'panels'] as const) {
  it(`round3 selected covered sloping roof retains its pitch ${mode}`, () => {
    const model = mesh([[[0, 0, 3], [6, 0, 3], [6, 6, 4.5], [0, 6, 4.5]], [[0, 0, 8], [6, 0, 8], [6, 6, 8], [0, 6, 8]]]);
    const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
    const out = snowLoadCases({ model, snow: { ...snow, roof: [1, 2, 3, 4] }, layout, tributaryWidth: 1 })!;
    const expected = roofSnow({ ...snow, roof: { kind: 'gable', slippery: true, slopeDeg: Math.atan(0.25) * 180 / Math.PI, W: 6 } });
    expect(out.result.refused).toBeUndefined();
    expect(pressure(out.cases[0]!.distributed, 1, 3)).toBeCloseTo(expected.ps, 9);
    const upper = snowLoadCases({ model, snow: { ...snow, roof: [5, 6, 7, 8] }, layout, tributaryWidth: 1 })!;
    expect(upper.result.refused).toBeUndefined();
    expect(upper.cases[0]!.distributed.every(d => d.elementId >= 5)).toBe(true);
    expect(pressure(upper.cases[0]!.distributed, 5, 3)).toBeCloseTo(mode === 'panels' ? 3 : 1, 9);
  });
}

it('round3 adjacent drift inside a narrow valley is reported even when endpoints and midpoint do not apply', () => {
  const model = mesh([
    [[0, 0, 3.8], [6, 0, 3.8], [6, 2, 3], [0, 2, 3]],
    [[0, 2, 3], [6, 2, 3], [6, 6, 3.8], [0, 6, 3.8]],
  ]);
  const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
  layout.panels = [{ polygon: [[0, 0], [0, 6], [6, 6], [6, 0]], z: 3, roof: true }];
  const input = { pg: 1, pf: 0.7, balanced: 0.7, slippery: false, tributaryWidth: 1, adjacent: [{ side: '+x' as const, topZ: 3.5, separation: 0, length: 20 }] };
  const out = driftAndSlidingLoads(model, layout, input);
  expect(out.distributed.length).toBeGreaterThan(0);
  expect(out.refs).toContain(REF_DRIFT_ADJACENT);
  const applies = out.derivation.filter(d => d.key === 'snow.derivation.adjacent');
  expect(applies).toHaveLength(2);
  for (const range of applies) {
    expect(range.params!.from as number).toBeGreaterThan(3);
    expect(range.params!.to as number).toBeLessThan(5);
  }
});

for (const mode of ['width', 'panels'] as const) {
  it(`round3 planner refuses the entire unresolved crossing source ${mode}`, () => {
    const model = mesh([[[1, 0, 3], [2, 0, 3], [2, 1, 3], [1, 1, 3]], [[0, 0.25, 4], [10, 0.25, 5]]]);
    const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } });
    if (mode === 'panels') {
      expect(plan.outcome).toBe('BLOCKED');
      expect(plan.blockedKeys.some(m => m.key === 'snow.refused.roofPlane')).toBe(true);
      expect(plan.cases.filter(c => c.type === 'S')).toEqual([]);
    } else {
      expect(plan.outcome).toBe('READY');
      expect(plan.cases.some(c => c.type === 'S')).toBe(true);
    }
  });
}
