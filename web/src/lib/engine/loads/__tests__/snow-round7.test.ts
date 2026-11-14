import { expect, it } from 'vitest';
import { concave, mesh, transform } from './snow-surface-round2-fixture';
import { stepRoof } from './snow-step-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { gravityLayout, type GravityLayout } from '../plan-gravity';
import { snowLoadCases, type SnowCasesInput } from '../snow-loads';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { planSnow } from '../load-plan-snow';
import { buildLoadPlan, type PlanSink } from '../load-plan';
import { roofSnow } from '../../../codes/cirsoc104/snow';
import { stepDrift, parapetDrift } from '../../../codes/cirsoc104/drift';

const knownWrong = it;
const inputs = { pg: 1, balanced: (70 - 20) / 65, pf: 1, slippery: false, tributaryWidth: 0.1 };
type Model = ReturnType<typeof mesh>;

function publicSnow(model: Model, layout?: GravityLayout, config: SnowCasesInput['snow'] = snow) {
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
      const pressures = expected.unbalanced ? [expected.ps, expected.unbalanced.windward, expected.unbalanced.leeward] : [expected.ps];
      expect(out.cases.map(c => -c.nodal.reduce((sum, n) => sum + n.fz, 0) / 0.75).sort((a, b) => a - b)).toEqual(pressures.sort((a, b) => a - b).map(p => expect.closeTo(p, 10)));
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
        if (!dr.applies) expect(Math.abs(actual)).toBe(0);
        else expect(actual).toBeGreaterThan(0);
        if (y === 0.3) expect(Math.abs(actual)).toBe(expected);
      }
      const full = publicSnow(model, layout);
      expect(full.result.refused).toBeUndefined();
      const base = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: 20, W: 1, slippery: true } }).ps * 0.1;
      expect(pressure(full.cases[0]!.distributed, 500, 0.3 / Math.cos(20 * Math.PI / 180))).toBeCloseTo(base, 10);
    });
  }
}

for (const top of [2.8, 2.949, 2.951, 3, 4, 5]) for (const angle of [0, 0.37]) for (const mode of ['width', 'pieces'] as const) {
  knownWrong(`known wrong result: #2095 round7 exterior local elevation ${top} ${mode} ${angle}`, () => {
    const model = mesh([[[-6, 0, 2], [2, 0, top], [2, 10, top], [-6, 10, 2]], [[2, 0, 3], [4, 0, 3], [4, 10, 3], [2, 10, 3]]]);
    model.nodes.set(500, { id: 500, x: 2.1, y: 4, z: 3 }); model.nodes.set(501, { id: 501, x: 2.1, y: 6, z: 3 });
    model.elements.set(500, { id: 500, nodeI: 500, nodeJ: 501, sectionId: 1, materialId: 1 });
    const panels: GravityLayout['panels'] = [{ polygon: [[-6, 0], [2, 0], [2, 10], [-6, 10]], z: 2, roof: true }, { polygon: [[2, 0], [4, 0], [4, 10], [2, 10]], z: 3, roof: true }];
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
    if (top >= 2.95) expect(actual).toBeCloseTo(0, 10);
    else {
      const dr = parapetDrift({ pg: 1, balanced: inputs.balanced, parapetHeight: 1, lu: 2 });
      expect(actual).toBeGreaterThan(0);
      if (mode === 'width') expect(actual).toBeCloseTo(dr.pd * (1 - 0.1 / dr.w) * 0.1, 10);
    }
    expect(publicSnow(model, layout, { ...snow, parapet: { height: 1 } }).result.refused).toBeUndefined();
  });
}

for (const angle of [0, 0.37]) for (const offset of [-2e-8, 0, 2e-8]) for (const mode of ['projected', 'panels'] as const) {
  it(`round7 crossing boundary ${angle} ${offset} ${mode}`, () => {
    const model = stepRoof(20, 0, Math.tan(20 * Math.PI / 180) + offset, angle);
    const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 0.1 });
    const out = publicSnow(model, layout);
    if (offset < 0) {
      expect(out.result.refused).toBe('snow.refused.roofPlane');
      expect(out.cases).toEqual([]);
    } else {
      expect(out.result.refused).toBeUndefined();
      expect(out.cases.length).toBeGreaterThan(0);
    }
  });
}

for (const angle of [0, 0.37, Math.PI / 2]) for (const mode of ['width', 'pieces'] as const) for (const reverse of [false, true]) {
  it(`round7 drift width and sliding cutoff ${mode} ${angle} ${reverse}`, () => {
    const model = mesh([[[0, 0, 3], [8, 0, 3], [8, 2, 3], [0, 2, 3]], [[-6, 0, 4.2], [0, 0, 3.6], [0, 2, 3.6], [-6, 2, 4.2]]]);
    const nodeI = 500, nodeJ = 501;
    model.nodes.set(nodeI, { id: nodeI, x: reverse ? 8 : 0, y: 0, z: 3 });
    model.nodes.set(nodeJ, { id: nodeJ, x: reverse ? 0 : 8, y: 0, z: 3 });
    model.elements.set(500, { id: 500, nodeI, nodeJ, sectionId: 1, materialId: 1 });
    const panels: GravityLayout['panels'] = [{ polygon: [[0, 0], [8, 0], [8, 2], [0, 2]], z: 3, roof: true }, { polygon: [[-6, 0], [0, 0], [0, 2], [-6, 2]], z: 3.6, roof: true }];
    transform(model, angle); rotatePanels(panels, angle, 1);
    const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 0.1 });
    layout.panels = panels; layout.points = []; layout.pieces = [];
    layout.widthMembers = mode === 'width' ? layout.widthMembers.filter(w => w.elementId === 500) : [];
    if (mode === 'pieces') layout.pieces = [{ elementId: 500, panel: 0, roof: true, a: 0, b: 8, wI: 0.1, wJ: 0.1 }];
    const retained = driftAndSlidingLoads(model, layout, inputs), sliding = driftAndSlidingLoads(model, layout, { ...inputs, slippery: true });
    const dr = stepDrift({ pg: 1, balanced: inputs.balanced, stepHeight: 0.6, luUpper: 6, luLower: 8 });
    const station = (x: number) => reverse ? 8 - x : x;
    for (const x of [dr.w - 0.001, dr.w + 0.001, 4.499, 4.501, 4.7]) {
      expect(pressure(retained.distributed, 500, station(x))).toBeCloseTo(Math.max(0, dr.pd * (1 - x / dr.w)) * 0.1, 10);
      expect(pressure(sliding.distributed, 500, station(x)) - pressure(retained.distributed, 500, station(x))).toBeCloseTo(x < 4.5 ? 0.4 * 6 / 4.5 * 0.1 : 0, 10);
    }
    expect(publicSnow(model, layout).result.refused).toBeUndefined();
  });
}

for (const angle of [0, Math.PI / 2]) for (const mode of ['width', 'pieces'] as const) {
  it(`round7 adjacent applicability cutoff ${mode} ${angle}`, () => {
    const model = mesh([[[0, 0, 3], [2, 0, 3], [2, 2, 3.2], [0, 2, 3.2]]]);
    model.nodes.set(500, { id: 500, x: 0.1, y: 0, z: 3 }); model.nodes.set(501, { id: 501, x: 0.1, y: 2, z: 3.2 });
    model.elements.set(500, { id: 500, nodeI: 500, nodeJ: 501, sectionId: 1, materialId: 1 });
    const panels: GravityLayout['panels'] = [{ polygon: [[0, 0], [mode === 'pieces' ? 0.1 : 2, 0], [mode === 'pieces' ? 0.1 : 2, 2], [0, 2]], z: 3, roof: true }];
    const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 0.1 }); layout.panels = panels; layout.points = []; layout.pieces = [];
    layout.widthMembers = mode === 'width' ? layout.widthMembers.filter(w => w.elementId === 500) : [];
    if (mode === 'pieces') layout.pieces = [{ elementId: 500, panel: 0, roof: true, a: 0, b: Math.hypot(2, 0.2), wI: 0.1, wJ: 0.1 }];
    transform(model, angle); rotatePanels(panels, angle, 1);
    const adjacent = [{ side: angle === 0 ? '-x' as const : '-y' as const, topZ: 14.45, separation: 0, length: 6 }];
    const out = driftAndSlidingLoads(model, layout, { ...inputs, adjacent });
    const cutoff = (0.45 - 1.2 * inputs.balanced / (0.426 + 2.2)) / 0.1;
    expect(pressure(out.distributed, 500, (cutoff - 0.001) * Math.hypot(1, 0.1))).toBeGreaterThan(0);
    for (const y of [cutoff + 0.001, 1.2, 1.4]) expect(Math.abs(pressure(out.distributed, 500, y * Math.hypot(1, 0.1)))).toBe(0);
    expect(publicSnow(model, layout, { ...snow, adjacent }).result.refused).toBeUndefined();
  });
}

for (const mode of ['width', 'panels'] as const) for (const height of [0.35, 0.45]) for (const angle of [0, 0.37]) {
  it(`round7 complete planner crossing contract ${mode} ${height} ${angle}`, () => {
    const model = stepRoof(20, 0, height, angle);
    const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode }, tributaryWidth: 0.1, snow: { ...snow, enabled: true, source: 'site' } });
    if (height === 0.35) {
      expect(plan.outcome).toBe('BLOCKED');
      expect(plan.blockedKeys.map(m => m.key)).toContain('snow.refused.roofPlane');
      expect(plan.cases.filter(c => c.type === 'S')).toEqual([]);
    } else {
      expect(plan.outcome).toBe('READY');
      expect(plan.cases.some(c => c.type === 'S')).toBe(true);
    }
  });
}

it('round7 snapshot eave strip matches the independent capped-triangle integral', () => {
  const model = stepRoof();
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = driftAndSlidingLoads(model, layout, { ...inputs, tributaryWidth: 1 });
  const gamma = 0.426 + 2.2, hc = 0.45 - inputs.balanced / gamma, slope = Math.tan(20 * Math.PI / 180);
  for (const x of [0.5, 0.75, 1]) {
    const limit = (hc - x / 8) / slope;
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThan((0.45 - 1.2 * inputs.balanced / gamma) / slope);
    expect(pressure(out.distributed, 11, x)).toBeCloseTo(gamma * (hc - x / 8) ** 2 / (2 * slope), 10);
  }
});
