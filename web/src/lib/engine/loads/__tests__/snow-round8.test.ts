import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases, type SnowCasesInput } from '../snow-loads';
import { roofSnow } from '../../../codes/cirsoc104/snow';
import { buildLoadPlan } from '../load-plan';

const knownWrong = it.skip;
type Model = ReturnType<typeof mesh>;

function flat(W: number) {
  return mesh([[[0, -W, 3], [30, -W, 3], [30, 0, 3], [0, 0, 3]], [[0, 0, 3], [30, 0, 3], [30, W, 3], [0, W, 3]]]);
}

function section(splits: number) {
  const model = mesh([]);
  for (let k = 0; k <= 2 * splits; k++) {
    const x = 10 * k / splits;
    model.nodes.set(k + 1, { id: k + 1, x, y: 0, z: 3 + Math.min(x, 20 - x) * 0.2 });
    if (k) model.elements.set(k, { id: k, nodeI: k, nodeJ: k + 1, sectionId: 1, materialId: 1 });
  }
  return model;
}

function generate(model: Model, mode: 'projected' | 'width' | 'panels', config: SnowCasesInput['snow']) {
  const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
  const out = snowLoadCases({ model, layout, snow: config, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
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
