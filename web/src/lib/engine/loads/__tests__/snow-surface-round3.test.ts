import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { snowLoadCases } from '../snow-loads';
import { roofSurfaceModel } from '../snow-roof-surfaces';
import { gravityLayout } from '../plan-gravity';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { roofSnow, snowDensity } from '../../../codes/cirsoc104/snow';
import { REF_DRIFT_ADJACENT } from '../../../codes/cirsoc104/drift';
import { buildLoadPlan } from '../load-plan';

const knownWrong = it.skip;

function gable(x: number, y: number, perpendicular = false) {
  const point = (a: number, b: number, z: number) => perpendicular ? [x + b, y + a, z] : [x + a, y + b, z];
  return [
    [point(0, 0, 3), point(6, 0, 3), point(6, 4, 5), point(0, 4, 5)],
    [point(0, 4, 5), point(6, 4, 5), point(6, 8, 3), point(0, 8, 3)],
  ];
}

function roof(kind: 'perpendicular' | 'L' | 'hip' | 'single') {
  if (kind === 'hip') return mesh([
    [[0, 0, 3], [8, 0, 3], [4, 4, 5]],
    [[8, 0, 3], [8, 12, 3], [4, 8, 5], [4, 4, 5]],
    [[8, 12, 3], [0, 12, 3], [4, 8, 5]],
    [[0, 12, 3], [0, 0, 3], [4, 4, 5], [4, 8, 5]],
  ]);
  return mesh(kind === 'single' ? gable(0, 0) : [...gable(kind === 'L' ? -6 : 0, 0), ...gable(kind === 'L' ? 0 : 20, kind === 'L' ? -6 : 20, true)]);
}

for (const kind of ['perpendicular', 'L', 'hip', 'single'] as const) for (const mode of ['projected', 'width', 'panels'] as const) {
  knownWrong(`known wrong result: #2095 round3 each ridge has governing unbalanced loads ${kind} ${mode}`, () => {
    const model = roof(kind), sf = roofSurfaceModel(model);
    const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
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
    const input = { pg: 1, pf: 0.7, balanced: 0.7, slippery: false, tributaryWidth: 1, adjacent: [{ side: '+x' as const, topZ: 5, separation, length: 20 }] };
    const out = driftAndSlidingLoads(model, layout, input);
    const applies = out.derivation.filter(d => d.key === 'snow.derivation.adjacent');
    expect(out.refs.includes(REF_DRIFT_ADJACENT)).toBe(separation < 6);
    if (separation < 6) {
      expect(out.distributed.length).toBeGreaterThan(0);
      expect(applies.length).toBeGreaterThan(0);
      const thresholdY = (5 - 3 - 1.2 * input.balanced / snowDensity(input.pg)) / 0.5;
      expect(applies[0]!.params?.from).toBeCloseTo(6 - thresholdY, 2);
      expect(applies[0]!.params?.to).toBe(6);
    } else {
      expect(out.distributed).toEqual([]);
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
