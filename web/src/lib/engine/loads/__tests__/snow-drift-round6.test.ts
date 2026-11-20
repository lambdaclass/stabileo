import { physicalSnowCases } from './snow-physical-cases';
import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { pressure, regulations, snow } from './snow-roof-plane-fixture';
import { gravityLayout, type GravityLayout } from '../plan-gravity';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { snowLoadCases } from '../snow-loads';
import { planSnow } from '../load-plan-snow';
import { buildLoadPlan, type PlanSink } from '../load-plan';
import { stepDrift } from '../../../codes/cirsoc104/drift';
import { roofSnow } from '../../../codes/cirsoc104/snow';

const knownWrong = it;
const inputs = { pg: 1, pf: 1, balanced: 0.7, slippery: true, tributaryWidth: 0.2 };
type Model = ReturnType<typeof mesh>;
type P2 = [number, number];

function publicSnow(input: Parameters<typeof snowLoadCases>[0], refused?: string) {
  const out = snowLoadCases(input)!;
  const sink: PlanSink = { cases: [], distributed: [], nodal: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const planned = planSnow({ regulations: regulations(), model: input.model as Model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, tributaryWidth: input.tributaryWidth, snow: { ...input.snow, enabled: true, source: 'site' } }, sink, input.layout);
  if (refused) {
    expect(out.result.refused).toBe(refused);
    expect(out.cases).toEqual([]);
    expect(planned).toBe(false);
    expect(sink.cases).toEqual([]);
    expect(sink.distributed).toEqual([]);
    expect(sink.nodal).toEqual([]);
    expect(sink.blockedKeys.map(m => m.key)).toContain(refused);
    return out;
  }
  expect(out.result.refused).toBeUndefined();
  expect(planned).toBe(true);
  expect(sink.blockedKeys).toEqual([]);
  expect(physicalSnowCases(sink)).toHaveLength(out.cases.length);
  for (const [k, c] of out.cases.entries()) expect(sink.distributed.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.distributed);
  return out;
}

function carrier(model: Model, a: number[], b: number[]) {
  const nodeI = model.nodes.size + 1, nodeJ = nodeI + 1, id = model.elements.size + 1;
  model.nodes.set(nodeI, { id: nodeI, x: a[0]!, y: a[1]!, z: a[2]! });
  model.nodes.set(nodeJ, { id: nodeJ, x: b[0]!, y: b[1]!, z: b[2]! });
  model.elements.set(id, { id, nodeI, nodeJ, sectionId: 1, materialId: 1 });
  return id;
}

function layoutFor(model: Model, panels: GravityLayout['panels'], id: number, panel: number, mode: 'width' | 'pieces', depth = 0.2) {
  const layout = gravityLayout(model, { mode: 'width', tributaryWidth: depth });
  layout.panels = panels;
  layout.points = [];
  layout.widthMembers = mode === 'width' ? layout.widthMembers.filter(w => w.elementId === id) : [];
  layout.pieces = mode === 'pieces' ? [{ elementId: id, panel, roof: true, a: 0, b: 1, wI: depth, wJ: depth }] : [];
  return layout;
}

function panel(x0: number, x1: number, y0: number, y1: number, z: number) {
  return { polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as P2[], z, roof: true };
}

function rotatePanels(panels: GravityLayout['panels'], angle: number, mirror: number) {
  for (const p of panels) p.polygon = p.polygon.map(([x, y]) => [mirror * x * Math.cos(angle) - y * Math.sin(angle) + 137, mirror * x * Math.sin(angle) + y * Math.cos(angle) - 91]);
  for (const p of panels) p.z += 11;
}

function sliding(model: Model, layout: GravityLayout, id: number, x = 0.5) {
  const yes = driftAndSlidingLoads(model, layout, inputs), no = driftAndSlidingLoads(model, layout, { ...inputs, pf: 0 });
  return pressure(yes.distributed, id, x) - pressure(no.distributed, id, x);
}

for (const mode of ['width', 'pieces'] as const) for (const angle of [0, Math.PI / 2]) for (const mirror of [1, -1]) {
  knownWrong(`known wrong result: #2095 round6 continuous pitched panels carry sliding ${mode} ${angle} ${mirror}`, () => {
    const x = mode === 'width' ? 1.6 : 1.5;
    const model = mesh([
      [[0, 0, 3], [3, 0, 3.03], [3, 2, 3.03], [0, 2, 3]],
      [[-6, 0, 4.2], [0, 0, 3.6], [0, 2, 3.6], [-6, 2, 4.2]],
    ]);
    const id = carrier(model, [x, 0.5, 3 + 0.01 * x], [x, 1.5, 3 + 0.01 * x]);
    const panels = [panel(0, 1.5, 0, 2, 3), panel(1.5, 3, 0, 2, 3.015), panel(-6, 0, 0, 2, 3.6)];
    transform(model, angle, 1, mirror); rotatePanels(panels, angle, mirror);
    const layout = layoutFor(model, panels, id, 1, mode);
    expect(sliding(model, layout, id)).toBeCloseTo(0.4 * 6 / 4.5 * 0.2, 9);
    const out = publicSnow({ model, layout, snow, tributaryWidth: 0.2 })!;
    const control = publicSnow({ model, layout, snow: { ...snow, slippery: false }, tributaryWidth: 0.2 })!;
    expect(out.result.refused).toBeUndefined();
    expect(pressure(out.cases[0]!.distributed, id, 0.5) - pressure(control.cases[0]!.distributed, id, 0.5)).toBeCloseTo(0.4 * roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: Math.atan(0.1) * 180 / Math.PI, W: 6, slippery: true } }).pf * 6 / 4.5 * 0.2, 9);
  });
}

for (const split of [1, 10]) {
  knownWrong(`known wrong result: #2095 round6 continuous pitched fetch ${split}`, () => {
    const model = mesh([[[0, 0, 3], [30, 0, 6], [30, 2, 6], [0, 2, 3]]]);
    const panels = [panel(0, split, 0, 2, 3), panel(split, 30, 0, 2, 3 + split * 0.1)];
    const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 1 });
    layout.panels = panels;
    const out = driftAndSlidingLoads(model, layout, { ...inputs, parapet: { height: 1 } });
    const reports = out.derivation.filter(m => m.key === 'snow.derivation.parapet' && m.params?.z === 3);
    expect(reports.length).toBeGreaterThan(0);
    for (const report of reports) expect(report.params?.lu).toBe(30);
  });
}

for (const slope of [0, 0.5, 1]) for (const angle of [0, Math.PI / 2]) for (const mirror of [1, -1]) for (const reverse of [false, true]) {
  knownWrong(`known wrong result: #2095 round6 horizontal tributary normal ${slope} ${angle} ${mirror} ${reverse}`, () => {
    const model = mesh([[[0, 0, 3], [2, 0, 3 + 2 * slope], [2, 2, 3 + 2 * slope], [0, 2, 3]]]);
    const id = 1;
    if (reverse) {
      const e = model.elements.get(id)!;
      [e.nodeI, e.nodeJ] = [e.nodeJ, e.nodeI];
    }
    const panels = [panel(0, 2, 0, 2, 3)];
    transform(model, angle, 1, mirror); rotatePanels(panels, angle, mirror);
    const layout = layoutFor(model, panels, id, 0, 'pieces', 0.4);
    const side = angle === 0 ? '-y' : '+x';
    const adjacent = [{ side, topZ: 20, separation: 0, length: 30 }] as const;
    const out = driftAndSlidingLoads(model, layout, { ...inputs, adjacent: [...adjacent] });
    const dr = stepDrift({ pg: 1, balanced: 0.7, stepHeight: 6, luUpper: 30, luLower: 2 });
    expect(dr.applies).toBe(true);
    expect(dr.w).toBeGreaterThan(0.6);
    expect(pressure(out.distributed, id, 0.5)).toBeCloseTo(dr.pd * (0.4 - 0.4 ** 2 / (2 * dr.w)), 9);
    const publicOut = publicSnow({ model, layout, snow: { ...snow, adjacent: [...adjacent] }, tributaryWidth: 0.2 })!;
    const base = publicSnow({ model, layout, snow, tributaryWidth: 0.2 })!;
    const localDr = stepDrift({ pg: 1, balanced: base.result.ps, stepHeight: 6, luUpper: 30, luLower: 2 });
    expect(publicOut.result.refused).toBeUndefined();
    expect(pressure(publicOut.cases[0]!.distributed, id, 0.5) - pressure(base.cases[0]!.distributed, id, 0.5)).toBeCloseTo(localDr.pd * (0.4 - 0.4 ** 2 / (2 * localDr.w)), 9);
  });
}

for (const [lo, hi, expected] of [[-1, 3, 1], [0, 2, 1], [0.25, 1.75, 1], [-1, 1, 1], [0.4, 2, 1], [0.4, 1.75, 1], [0.5, 1.75, 1], [1.99, 3, 1], [2, 3, 0], [2.01, 3, 0], [-2, -0.01, 0]] as const) for (const mode of ['width', 'pieces'] as const) for (const angle of [0, Math.PI / 2]) for (const mirror of [1, -1]) {
  knownWrong(`known wrong result: #2095 round6 eave overlap ${lo} ${hi} ${mode} ${angle} ${mirror}`, () => {
    const model = mesh([
      [[0, 0, 3], [3, 0, 3], [3, 2, 3], [0, 2, 3]],
      [[-6, lo, 4.2], [0, lo, 3.6], [0, hi, 3.6], [-6, hi, 4.2]],
    ]);
    const id = carrier(model, [0.5, 0.4, 3], [1.5, 0.4, 3]);
    const panels = [panel(0, 3, 0.4, 2, 3), panel(-6, 0, lo, hi, 3.6)];
    transform(model, angle, 1, mirror); rotatePanels(panels, angle, mirror);
    const layout = layoutFor(model, panels, id, 0, mode);
    if (expected && (lo !== 0.4 || hi !== 2)) {
      expect(() => driftAndSlidingLoads(model, layout, inputs)).toThrow('snow.refused.slidingOverlap');
      publicSnow({ model, layout, snow, tributaryWidth: 0.2 }, 'snow.refused.slidingOverlap');
      return;
    }
    expect(sliding(model, layout, id)).toBeCloseTo(expected * 0.4 * 6 / 4.5 * 0.2, 9);
    const yes = publicSnow({ model, layout, snow, tributaryWidth: 0.2 })!;
    const no = publicSnow({ model, layout, snow: { ...snow, slippery: false }, tributaryWidth: 0.2 })!;
    expect(yes.result.refused).toBeUndefined();
    expect(pressure(yes.cases[0]!.distributed, id, 0.5) - pressure(no.cases[0]!.distributed, id, 0.5)).toBeCloseTo(expected * 0.4 * yes.result.pf * 6 / 4.5 * 0.2, 9);
  });
}

for (const mode of ['width', 'pieces'] as const) {
  it(`round6 drift crosses continuous pitched panels ${mode}`, () => {
    const x = mode === 'width' ? 1.6 : 1.5;
    const model = mesh([
      [[0, 0, 3], [30, 0, 3.3], [30, 2, 3.3], [0, 2, 3]],
      [[-30, 0, 6], [0, 0, 6], [0, 2, 6], [-30, 2, 6]],
    ]);
    const id = carrier(model, [x, 0.5, 3 + 0.01 * x], [x, 1.5, 3 + 0.01 * x]);
    const panels = [panel(0, 1.5, 0, 2, 3), panel(1.5, 30, 0, 2, 3.015), panel(-30, 0, 0, 2, 6)];
    const layout = layoutFor(model, panels, id, 1, mode);
    const out = driftAndSlidingLoads(model, layout, inputs);
    const dr = stepDrift({ pg: 1, balanced: 0.7, stepHeight: 3, luUpper: 30, luLower: 30 });
    const integral = mode === 'width' ? 0.2 * (1 - x / dr.w) : 0.2 - ((x + 0.2) ** 2 - x ** 2) / (2 * dr.w);
    expect(pressure(out.distributed, id, 0.5)).toBeCloseTo(dr.pd * integral, 9);
  });
}

for (const y of [0.5, 1.5, 2.5]) {
  it(`round6 separate eave intervals preserve the gap ${y}`, () => {
    const source = [[0, 0], [-6, 0], [-6, 3], [0, 3], [0, 2], [-1, 2], [-1, 1], [0, 1]].map(([x, y]) => [x!, y!, 3.6 - 0.1 * x!]);
    const model = mesh([[[0, 0, 3], [3, 0, 3], [3, 3, 3], [0, 3, 3]], source]);
    const id = carrier(model, [0.5, y, 3], [1.5, y, 3]);
    const layout = layoutFor(model, [panel(0, 3, 0, 3, 3), { polygon: source.map(p => [p[0]!, p[1]!] as P2), z: 3.6, roof: true }], id, 0, 'width');
    expect(() => driftAndSlidingLoads(model, layout, inputs)).toThrow('snow.refused.slidingOverlap');
    publicSnow({ model, layout, snow, tributaryWidth: 0.2 }, 'snow.refused.slidingOverlap');
  });
}

for (const offset of [-0.01, 0, 0.01]) {
  it(`round6 distinct roof levels stay separate ${offset}`, () => {
    const model = mesh([
      [[0, 0, 3], [1, 0, 3], [1, 2, 3], [0, 2, 3]],
      [[1, 0, 4 + offset], [3, 0, 4 + offset], [3, 2, 4 + offset], [1, 2, 4 + offset]],
    ]);
    const id = carrier(model, [1.5, 0.5, 4 + offset], [1.5, 1.5, 4 + offset]);
    const layout = layoutFor(model, [panel(0, 1, 0, 2, 3), panel(1, 3, 0, 2, 4 + offset)], id, 1, 'width');
    expect(() => driftAndSlidingLoads(model, layout, inputs)).toThrow('snow.refused.stepDriftTransfer');
    for (const node of model.nodes.values()) if (node.x === 3) node.z! += 0.1;
    expect(driftAndSlidingLoads(model, layout, inputs).distributed).toEqual([]);
  });
}

for (const slope of [0, 0.1, 0.5]) {
  it(`round6 planar sections retain their width answer ${slope}`, () => {
    const model = mesh([[[0, 0, 3], [6, 0, 3 + 6 * slope]]]);
    const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 0.2 });
    expect(layout.panels).toEqual([]);
    expect(driftAndSlidingLoads(model, layout, inputs).distributed).toEqual([]);
    const out = publicSnow({ model, layout, snow, tributaryWidth: 0.2 });
    const expected = roofSnow({ ...snow, roof: { kind: 'gable', slopeDeg: Math.atan(slope) * 180 / Math.PI, W: 6, slippery: true } });
    expect(pressure(out.cases[0]!.distributed, 1)).toBeCloseTo(expected.ps * 0.2, 9);
  });
}

for (const mode of ['width', 'panels'] as const) {
  it(`round6 load-plan UI blocks clipped sliding eaves ${mode}`, () => {
    const model = mesh([
      [[0, 0, 3], [3, 0, 3], [3, 2, 3], [0, 2, 3]],
      [[-6, -1, 4.2], [0, -1, 3.6], [0, 3, 3.6], [-6, 3, 4.2]],
    ]);
    const plan = buildLoadPlan({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, gravity: { mode }, tributaryWidth: 0.2, snow: { ...snow, enabled: true, source: 'site' } });
    publicSnow({ model, snow, tributaryWidth: 0.2 }, 'snow.refused.slidingOverlap');
    expect(plan.outcome).toBe('BLOCKED');
    expect(plan.blockedKeys.map(m => m.key)).toContain('snow.refused.slidingOverlap');
    expect(plan.cases.filter(c => c.type === 'S')).toEqual([]);
    expect(plan.distributed.filter(d => d.caseType === 'S')).toEqual([]);
    expect(plan.nodal.filter(d => d.caseType === 'S')).toEqual([]);
  });
}

for (const [overhang, refused] of [[0.009, false], [0.011, true]] as const) {
  it(`round6 eave endpoint alignment boundary ${overhang}`, () => {
    const lo = 0.4 - overhang, hi = 2 + overhang;
    const model = mesh([
      [[0, 0, 3], [3, 0, 3], [3, 2, 3], [0, 2, 3]],
      [[-6, lo, 4.2], [0, lo, 3.6], [0, hi, 3.6], [-6, hi, 4.2]],
    ]);
    const id = carrier(model, [0.5, 0.4, 3], [1.5, 0.4, 3]);
    const layout = layoutFor(model, [panel(0, 3, 0.4, 2, 3), panel(-6, 0, lo, hi, 3.6)], id, 0, 'width');
    if (refused) {
      expect(() => driftAndSlidingLoads(model, layout, inputs)).toThrow('snow.refused.slidingOverlap');
      publicSnow({ model, layout, snow, tributaryWidth: 0.2 }, 'snow.refused.slidingOverlap');
    } else {
      expect(sliding(model, layout, id)).toBeCloseTo(0.4 * 6 / 4.5 * 0.2, 9);
      publicSnow({ model, layout, snow, tributaryWidth: 0.2 });
    }
  });
}
