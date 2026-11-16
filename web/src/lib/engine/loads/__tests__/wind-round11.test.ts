import { expect, it, vi } from 'vitest';
import { windHeightField, windHeightLoads } from '../wind-pressure-field';
import { windLoadCases } from '../wind-cases';
import { otherStructureWind } from '../wind-other';
import { planWind } from '../load-plan-wind';
import { buildLoadPlan, levelsWithPlanArea, type LoadPlanInput, type PlanSink } from '../load-plan';
import { defaultRegulations } from '../../../codes/roles';
import { mesh, remeshWind, variants, windAxis, windProject, windResultants, assertWindResultants } from './wind-integration-fixture';
import { expectHeightCarrierTips } from './wind-tip-assertions';

const refusal = 'wind.pressure.triangularCentroidUnsupported';
const structure = { kind: 'latticeTower' as const, section: 'triangle' as const, round: false, solidity: 1, diagonal: false, width: 2 };
const sink = (): PlanSink => ({ cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] });

const knownWrong = process.env.RUN_KNOWN_WRONG === '2220' ? it : it.skip;
function expectWindCaseRefusal(model: ReturnType<typeof mesh>, axis: 'x' | 'y', direction: '+x' | '-x' | '+y' | '-y', generate = windLoadCases) {
  expect(() => generate({ model, axes: [{ ...windAxis, axis, pressureField: windHeightField({ model, axis, from: 0, to: 4, pressure: () => 1 }) }], set: 'all', directions: [direction], tributaryWidth: 2, speed: 40 })).toThrow(refusal);
}

knownWrong('known wrong result: #2220 case refusal rejects a generator that silently accepts the input', () => {
  const model = mesh([[[0, 0, 0], [0, 0, 4]], [[0, 2, 0], [0, 2, 4]], [[2, 0, 0], [2, 0, 4]]]);
  const broken = vi.fn(() => ({ cases: [], notes: [] }));
  expect(() => expectWindCaseRefusal(model, 'x', '+x', broken)).toThrow();
  expect(broken).toHaveBeenCalledOnce();
});

for (const entry of ['field', 'cases', 'other', 'planner', 'plannerOther', 'loadPlan', 'loadPlanOther'] as const) for (const variant of variants) for (const direction of ['+x', '-x', '+y', '-y'] as const) it(`#2220 asymmetric triangle refuses ${entry} ${variant} ${direction}`, () => {
  const { model, direction: transformDirection } = remeshWind(mesh([[[0, 0, 0], [0, 0, 4]], [[0, 2, 0], [0, 2, 4]], [[2, 0, 0], [2, 0, 4]]]), variant);
  const d = transformDirection(direction), axis = d.endsWith('x') ? 'x' : 'y';
  const field = () => windHeightField({ model, axis, from: 0, to: 4, pressure: () => 1 });
  if (entry === 'field') expect(field).toThrow(refusal);
  else if (entry === 'cases') expectWindCaseRefusal(model, axis, d);
  else if (entry === 'other') expect(() => otherStructureWind({ model, structure, project: windProject, directions: [d], tributaryWidth: 2 })).toThrow(refusal);
  else {
    const other = entry.endsWith('Other');
    const input = { model, tributaryWidth: 2, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: other ? 'open' : 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: [d], directions: { x: axis === 'x', y: axis === 'y' }, caseSet: 'all', ...(other ? { structure } : { profile: [[0, 1], [4, 1]] }) } } as LoadPlanInput;
    let out = sink();
    if (entry.startsWith('loadPlan')) {
      const regulations = defaultRegulations();
      for (const key of Object.keys(regulations) as Array<keyof typeof regulations>) if (regulations[key].adapterId) regulations[key] = { ...regulations[key], configComplete: true, state: 'applied' };
      out = buildLoadPlan({ ...input, regulations, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false });
    } else planWind(input, levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 })), out);
    expect(out.blockedKeys.map(n => n.key)).toContain(refusal);
    expect(out.cases.filter(c => c.type === 'W' || c.type === 'Wa')).toEqual([]);
    expect(out.distributed.filter(p => p.caseType === 'W' || p.caseType === 'Wa')).toEqual([]);
    expect(out.nodal.filter(p => p.caseType === 'W' || p.caseType === 'Wa')).toEqual([]);
  }
});

for (const axis of ['x', 'y'] as const) for (const offset of [-1e-10, 0, 1e-10]) it(`#2220 triangular symmetry boundary ${axis} ${offset}`, () => {
  const xy = [[0, -1], [0, 1], [2, offset]];
  const model = mesh(xy.map(([x, y]) => axis === 'x' ? [[x!, y!, 0], [x!, y!, 4]] : [[y!, x!, 0], [y!, x!, 4]]));
  const field = () => windHeightField({ model, axis, from: 0, to: 4, pressure: () => 1 });
  if (offset !== 0) expect(field).toThrow(refusal);
  else {
    const loads = windHeightLoads(field(), axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0);
    expect(loads.nodal).toEqual([]);
    for (const p of loads.distributed) { expect(p[axis === 'x' ? 'qX' : 'qY']).toBeCloseTo(2 / 3, 10); expect(p[axis === 'x' ? 'qXJ' : 'qYJ']).toBeCloseTo(2 / 3, 10); }
    assertWindResultants(windResultants(model, loads.distributed), axis === 'x' ? [8, 0, 0, 0, 16, 0] : [0, 8, 0, -16, 0, 0]);
  }
});

for (const axis of ['x', 'y'] as const) it(`#2220 coincident projected centroid alone does not certify a triangular partition ${axis}`, () => {
  const model = mesh([[0, -1], [1, 1], [2, 0]].map(([x, y]) => axis === 'x' ? [[x!, y!, 0], [x!, y!, 4]] : [[y!, x!, 0], [y!, x!, 4]]));
  expect(() => windHeightField({ model, axis, from: 0, to: 4, pressure: () => 1 })).toThrow(refusal);
});

for (const variant of variants) for (const eccentricity of [-0.3, 0.3]) for (const lower of [0, 1e-12, -1e-12, 'balanced'] as const) it(`#2220 unsupported band is local ${variant} e=${eccentricity} lower=${lower}`, () => {
  const { model, back } = remeshWind(mesh([[[0, 0, 0], [0, 0, 2]], [[0, 0, 2], [0, -1, 6]], [[0, 0, 2], [0, 1, 6]]]), variant);
  const axis = variant === 'rotate' ? 'y' : 'x';
  const field = windHeightField({ model, axis, from: 0, to: 6, width: 2, boundaries: [2], pressure: z => z < 2 ? lower === 'balanced' ? z - 1 : lower : 1 });
  const fx = variant === 'mirror' ? -1 : axis === 'x' ? 1 : 0, fy = axis === 'y' ? 1 : 0;
  const e = variant === 'mirror' ? -eccentricity : eccentricity;
  if (lower !== 0) { expect(() => windHeightLoads(field, fx, fy, e)).toThrow('wind.pressure.distributedTorqueUnsupported'); expect(windHeightLoads(field, fx, fy).distributed.length).toBeGreaterThan(0); return; }
  const loads = windHeightLoads(field, fx, fy, e);
  expect(loads.nodal).toEqual([]);
  expect(loads.baseLoads).toEqual([]);
  for (const p of loads.distributed) {
    const m = model.elements.get(p.elementId)!, a = model.nodes.get(m.nodeI)!, b = model.nodes.get(m.nodeJ)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z! - a.z!), scale = (b.z! - a.z!) / length;
    for (const end of [false, true]) {
      const s = end ? p.b : p.a, z = a.z! + scale * s;
      const side = Math.sign(back(b.x, b.y)[1]!);
      const expected = a.z! < 2 ? 0 : ((z - 2) / 4 - side * eccentricity) * scale;
      const actual = back(end ? p.qXJ! : p.qX, end ? p.qYJ! : p.qY);
      expect(actual[0]).toBeCloseTo(expected, 10); expect(actual[1]).toBeCloseTo(0, 10);
    }
  }
  assertWindResultants(windResultants(model, loads.distributed, [], back), [4, 0, 0, 0, 56 / 3, 4 * eccentricity]);
});

for (const component of ['ux', 'uy'] as const) for (const corruption of ['missing', 'duplicate', 'wrong', 'nan'] as const) it(`#2220 every carrier tip is checked ${component} ${corruption}`, () => {
  const correct = [{ nodeId: 2, ux: 0.1, uy: 0.1 }, { nodeId: 4, ux: 0.2, uy: 0.2 }, { nodeId: 6, ux: 0.3, uy: 0.3 }];
  const expected = (id: number) => id / 20;
  expect(() => expectHeightCarrierTips(correct, [2, 4, 6], component, expected, 8)).not.toThrow();
  const bad = correct.map(d => ({ ...d }));
  if (corruption === 'missing') bad.splice(1, 1);
  else if (corruption === 'duplicate') bad.push({ ...bad[1]! });
  else bad[1]![component] = corruption === 'nan' ? NaN : 0.4;
  expect(() => expectHeightCarrierTips(bad, [2, 4, 6], component, expected, 8)).toThrow();
});

for (const axis of ['x', 'y'] as const) for (const ratio of [-2, -0.5, 0.5, 2]) it(`#2220 triangular symmetry retains its geometric roundoff scale ${axis} ${ratio}`, () => {
  const offset = ratio * 32 * Number.EPSILON * Math.sqrt(5);
  const model = mesh([[0, -1], [0, 1], [2, offset]].map(([x, y]) => axis === 'x' ? [[x!, y!, 0], [x!, y!, 4]] : [[y!, x!, 0], [y!, x!, 4]]));
  const field = () => windHeightField({ model, axis, from: 0, to: 4, pressure: () => 1 });
  if (Math.abs(ratio) > 1) expect(field).toThrow(refusal);
  else {
    const loads = windHeightLoads(field(), axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0);
    expect(loads.nodal).toEqual([]);
    expect(loads.distributed).toHaveLength(3);
    for (const p of loads.distributed) { expect(p[axis === 'x' ? 'qX' : 'qY']).toBeCloseTo(2 / 3, 10); expect(p[axis === 'x' ? 'qXJ' : 'qYJ']).toBeCloseTo(2 / 3, 10); }
  }
});

for (const axis of ['x', 'y'] as const) for (const sign of [-1, 1]) it(`#2220 the original round-3 triangle requires wind-direction symmetry ${axis} ${sign}`, () => {
  const model = mesh([[[-2, -1, 0], [-2, -1, 6]], [[2, -1, 0], [2, -1, 6]], [[0, 2, 0], [0, 2, 6]]]);
  const field = () => windHeightField({ model, axis, from: 0, to: 6, pressure: () => 1 });
  if (axis === 'x') expect(field).toThrow(refusal);
  else {
    const out = windHeightLoads(field(), 0, sign);
    expect(out.nodal).toEqual([]);
    for (const p of out.distributed) { expect(p.qY).toBeCloseTo(sign * 4 / 3, 10); expect(p.qYJ).toBeCloseTo(sign * 4 / 3, 10); }
    assertWindResultants(windResultants(model, out.distributed), [0, sign * 24, 0, -sign * 72, 0, 0]);
  }
});
