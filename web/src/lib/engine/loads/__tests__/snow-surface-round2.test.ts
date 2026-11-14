import { expect, it } from 'vitest';
import { mesh, asymmetric, concave, disjoint, twoPitch, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { auditRoof } from './snow-slope-audit-fixture';
import { snowLoadCases } from '../snow-loads';
import { roofSurfaceModel } from '../snow-roof-surfaces';
import { gravityLayout } from '../plan-gravity';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { roofSnow } from '../../../codes/cirsoc104/snow';
import { buildLoadPlan } from '../load-plan';

const knownWrong = it.skip;
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
    const inputs = { pg: 1, balanced: 0.7, pf: 1, tributaryWidth: 1 };
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
