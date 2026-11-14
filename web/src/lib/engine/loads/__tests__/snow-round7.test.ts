import { expect, it } from 'vitest';
import { concave, mesh, transform } from './snow-surface-round2-fixture';
import { stepRoof } from './snow-step-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { gravityLayout, type GravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { planSnow } from '../load-plan-snow';
import type { PlanSink } from '../load-plan';
import { roofSnow } from '../../../codes/cirsoc104/snow';
import { stepDrift, parapetDrift } from '../../../codes/cirsoc104/drift';

const knownWrong = it.skip;
const inputs = { pg: 1, balanced: (70 - 20) / 65, pf: 1, slippery: false, tributaryWidth: 0.1 };
type Model = ReturnType<typeof mesh>;

function publicSnow(model: Model, layout?: GravityLayout, config = snow) {
  const out = snowLoadCases({ model, layout, snow: config, tributaryWidth: 0.1 })!;
  const sink: PlanSink = { cases: [], distributed: [], nodal: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const ready = planSnow({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, tributaryWidth: 0.1, snow: { ...config, enabled: true, source: 'site' } }, sink, layout);
  expect(ready).toBe(!out.result.refused);
  expect(sink.cases).toHaveLength(out.cases.length);
  for (const [k, c] of out.cases.entries()) {
    expect(sink.distributed.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.distributed);
    expect(sink.nodal.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.nodal);
  }
  if (out.result.refused) {
    expect(sink.blockedKeys.map(m => m.key)).toContain(out.result.refused);
    expect(sink.distributed).toEqual([]);
    expect(sink.nodal).toEqual([]);
  }
  return out;
}

function rotatePanels(panels: GravityLayout['panels'], angle: number, mirror: number) {
  for (const p of panels) {
    p.polygon = p.polygon.map(([x, y]) => [mirror * x * Math.cos(angle) - y * Math.sin(angle) + 137, mirror * x * Math.sin(angle) + y * Math.cos(angle) - 91]);
    p.z += 11;
  }
}

for (const angle of [0, 0.37, Math.PI / 2]) for (const mirror of [1, -1]) {
  for (const ratio of [1.199, 1.201]) for (const mode of ['projected', 'width', 'panels'] as const) {
    knownWrong(`known wrong result: #2095 round7 crossing step refuses invariantly ${ratio} ${mode} ${angle} ${mirror}`, () => {
      const model = transform(stepRoof(20, 0, ratio * inputs.balanced / (0.426 + 2.2)), angle, 1, mirror);
      const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 0.1 });
      const out = publicSnow(model, layout);
      expect(out.result.refused).toBe('snow.refused.roofPlane');
      expect(out.cases).toEqual([]);
      if (layout) expect(() => driftAndSlidingLoads(model, layout, inputs)).toThrow('snow.refused.roofPlane');
    });
  }
  for (const flat of [false, true]) {
    knownWrong(`known wrong result: #2095 round7 concave nodal pressure ${flat} ${angle} ${mirror}`, () => {
      const model = concave();
      if (flat) for (const n of model.nodes.values()) n.z = 3;
      const polygon = [...model.nodes.values()].map(n => [n.x, n.y] as [number, number]);
      transform(model, angle, 1, mirror);
      const panels = [{ polygon, z: 3, roof: true }]; rotatePanels(panels, angle, mirror);
      const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
      layout.panels = panels; layout.pieces = []; layout.widthMembers = [];
      layout.points = [{ nodeId: 4, elementId: 3, panel: 0, w: 0.75, roof: true }];
      const out = publicSnow(model, layout);
      expect(out.result.refused).toBeUndefined();
      const expected = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: flat ? 0 : Math.atan(0.2) * 180 / Math.PI, W: 4, slippery: true } });
      expect(out.cases[0]!.nodal).toEqual([{ nodeId: 4, carrier: 3, fx: 0, fy: 0, fz: expect.closeTo(-expected.ps * 0.75, 10) }]);
    });
  }
  for (const mode of ['width', 'pieces'] as const) {
    knownWrong(`known wrong result: #2095 round7 step applicability partitions ${mode} ${angle} ${mirror}`, () => {
      const model = stepRoof(20, 0, 0.45);
      const panels = gravityLayout(model, { mode: 'panels', tributaryWidth: 0.1 }).panels;
      if (mode === 'pieces') panels[0] = { polygon: [[0, 0], [0.1, 0], [0.1, 2], [0, 2]], z: 3, roof: true };
      transform(model, angle, 1, mirror); rotatePanels(panels, angle, mirror);
      const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 0.1 });
      layout.panels = panels; layout.points = []; layout.pieces = [];
      layout.widthMembers = mode === 'width' ? layout.widthMembers.filter(w => w.elementId === 500) : [];
      if (mode === 'pieces') layout.pieces = [{ elementId: 500, panel: 0, roof: true, a: 0, b: 1 / Math.cos(20 * Math.PI / 180), wI: 0.1, wJ: 0.1 }];
      const out = driftAndSlidingLoads(model, layout, inputs);
      const cutoff = (0.45 - 1.2 * inputs.balanced / (0.426 + 2.2)) / Math.tan(20 * Math.PI / 180);
      for (const y of [cutoff - 0.001, cutoff + 0.001, 0.3, 0.4]) {
        const dr = stepDrift({ pg: 1, balanced: inputs.balanced, stepHeight: 0.45 - y * Math.tan(20 * Math.PI / 180), luUpper: 6, luLower: 6 });
        const expected = !dr.applies ? 0 : mode === 'width' ? dr.pd * (1 - 0.1 / dr.w) * 0.1 : dr.pd * (0.1 - 0.015 / dr.w);
        const actual = pressure(out.distributed, 500, y / Math.cos(20 * Math.PI / 180));
        if (!dr.applies) expect(actual).toBe(0);
        else expect(actual).toBeGreaterThan(0);
        if (y === 0.3) expect(actual).toBe(expected);
      }
      const full = publicSnow(model, layout);
      expect(full.result.refused).toBeUndefined();
      const base = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: 20, W: 1, slippery: true } }).ps * 0.1;
      expect(pressure(full.cases[0]!.distributed, 500, 0.3 / Math.cos(20 * Math.PI / 180))).toBeCloseTo(base, 10);
    });
  }
}

for (const top of [2.8, 4, 5]) for (const angle of [0, 0.37]) for (const mode of ['width', 'pieces'] as const) {
  knownWrong(`known wrong result: #2095 round7 exterior local elevation ${top} ${mode} ${angle}`, () => {
    const model = mesh([[[0, 0, 2], [2, 0, top], [2, 10, top], [0, 10, 2]], [[2, 0, 3], [4, 0, 3], [4, 10, 3], [2, 10, 3]]]);
    model.nodes.set(500, { id: 500, x: 2.1, y: 4, z: 3 }); model.nodes.set(501, { id: 501, x: 2.1, y: 6, z: 3 });
    model.elements.set(500, { id: 500, nodeI: 500, nodeJ: 501, sectionId: 1, materialId: 1 });
    const panels: GravityLayout['panels'] = [{ polygon: [[0, 0], [2, 0], [2, 10], [0, 10]], z: 2, roof: true }, { polygon: [[2, 0], [4, 0], [4, 10], [2, 10]], z: 3, roof: true }];
    if (mode === 'pieces') {
      panels[1] = { polygon: [[2, 0], [2.1, 0], [2.1, 10], [2, 10]], z: 3, roof: true };
      panels.push({ polygon: [[2.1, 0], [4, 0], [4, 10], [2.1, 10]], z: 3, roof: true });
    }
    transform(model, angle); rotatePanels(panels, angle, 1);
    const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 0.1 }); layout.panels = panels; layout.points = []; layout.pieces = [];
    layout.widthMembers = mode === 'width' ? layout.widthMembers.filter(w => w.elementId === 500) : [];
    if (mode === 'pieces') layout.pieces = [{ elementId: 500, panel: 1, roof: true, a: 0, b: 2, wI: 0.1, wJ: 0.1 }];
    const base = driftAndSlidingLoads(model, layout, inputs), out = driftAndSlidingLoads(model, layout, { ...inputs, parapet: { height: 1 } });
    const actual = pressure(out.distributed, 500, 1) - pressure(base.distributed, 500, 1);
    if (top > 3) expect(actual).toBeCloseTo(0, 10);
    else {
      const dr = parapetDrift({ pg: 1, balanced: inputs.balanced, parapetHeight: 1, lu: 2 });
      expect(actual).toBeGreaterThan(0);
      if (mode === 'width') expect(actual).toBeCloseTo(dr.pd * (1 - 0.1 / dr.w) * 0.1, 10);
    }
    expect(publicSnow(model, layout, { ...snow, parapet: { height: 1 } } as typeof snow).result.refused).toBeUndefined();
  });
}
