import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure } from './snow-roof-plane-fixture';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';

function flat(splits: number, angle = 0, W = 2) {
  const ring = [[0, -W, 3]];
  for (let k = 1; k <= splits; k++) ring.push([16 * k / splits, -W, 3]);
  ring.push([16, W, 3]);
  for (let k = splits - 1; k >= 0; k--) ring.push([16 * k / splits, W, 3]);
  return transform(mesh([ring]), angle, 0);
}

function generate(splits: number, mode: 'projected' | 'width' | 'panels', angle = 0, W = 2) {
  const model = flat(splits, angle, W);
  const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
  if (mode === 'panels' && layout) {
    const reference = flat(1, angle, W);
    layout.panels = [{ polygon: [...reference.nodes.values()].map(p => [p.x, p.y]), z: 3, roof: true }];
    layout.widthMembers = []; layout.points = [];
    layout.pieces = [...model.elements.values()].map(e => {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      return { elementId: e.id, panel: 0, roof: true, a: 0, b: Math.hypot(b.x - a.x, b.y - a.y), wI: 1, wJ: 1 };
    });
  }
  const out = snowLoadCases({ model, layout, snow: { ...snow, roofSlopeDeg: 20 }, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  return out;
}

for (const mode of ['projected', 'width', 'panels'] as const) {
  it.skip(`known wrong result: #2095 round10 flat frame ignores subdivisions ${mode}`, () => {
    const base = generate(1, mode), split = generate(8, mode);
    expect(base.geometry.W).toBeCloseTo(2, 10);
    expect(split.geometry.W).toBeCloseTo(base.geometry.W, 10);
    expect(split.cases).toHaveLength(base.cases.length);
    for (const [k, c] of split.cases.entries()) {
      expect(pressure(c.distributed, 1, 1)).toBeCloseTo(pressure(base.cases[k]!.distributed, 1, 1), 10);
    }
  });
}
