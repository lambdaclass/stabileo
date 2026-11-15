import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { gravityLayout, type GravityLayout } from '../plan-gravity';
import { snowLoadCases, type SnowCasesInput } from '../snow-loads';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { stepDrift } from '../../../codes/cirsoc104/drift';
import { planSnow } from '../load-plan-snow';
import { buildLoadPlan, type PlanSink } from '../load-plan';

const regression = it.skip;
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
  regression(`known wrong result: #2095 round9 valley cannot extend adjacent drift fetch ${station}`, () => {
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
  regression(`known wrong result: #2095 round9 selected barrel ignores unrelated slope ${mode}`, () => {
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
