import { expect, it } from 'vitest';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type LoadPlanInput, type PlanSink } from '../load-plan';
import { otherStructureWind } from '../wind-other';
import { windHeightField, windHeightLoads } from '../wind-pressure-field';
import { velocityPressure } from '../../../codes/cirsoc102/wind';
import { solidSignCf } from '../../../codes/cirsoc102/other-structures';
import { mesh, windProject, windResultants, assertWindResultants } from './wind-integration-fixture';


for (const pressure of [0.4, 0.8, 1.2]) for (const direction of ['+x', '-x', '+y', '-y'] as const) it(`#2220 solid sign eccentric minimum pressure=${pressure} ${direction}`, () => {
  const axis = direction.endsWith('x') ? 'x' : 'y', sign = direction.startsWith('-') ? -1 : 1;
  const model = mesh([[[0, -1, 0], [0, -1, 6]], [[0, 1, 0], [0, 1, 6]]]);
  if (axis === 'y') for (const n of model.nodes.values()) { n.x = n.y; n.y = 0; }
  const cf = solidSignCf(2 / 6, 1);
  const unit = velocityPressure(6, { ...windProject, basicSpeed: 1 }) / 1000 * cf;
  const out = otherStructureWind({ model, structure: { kind: 'solidSign', clearance: 0 }, project: { ...windProject, basicSpeed: Math.sqrt(pressure / unit) }, G: () => 1, directions: [direction], tributaryWidth: 1 });
  expect(out.notes).toEqual([]);
  for (const ecc of [1, -1]) {
    const candidates = out.cases.filter(c => c.nameParams.c === `B${ecc > 0 ? '+' : '−'}`);
    const expectedForce = sign * Math.max(pressure, 0.8) * 2 * 6;
    const expectedMoment = ecc * expectedForce * 0.2 * 2;
    expect(candidates.some(c => {
      const r = windResultants(model, c.distributed.map(p => ({ ...p, q: p.qZ })), c.nodal);
      return Math.abs(r[axis === 'x' ? 0 : 1]! - expectedForce) < 1e-9 && Math.abs(r[5]! - expectedMoment) < 1e-9;
    })).toBe(true);
    const minimum = candidates.find(c => c.nameKey === 'wind.other.minimumSignCase');
    expect(minimum).toBeDefined();
    assertWindResultants(windResultants(model, minimum!.distributed.map(p => ({ ...p, q: p.qZ })), minimum!.nodal), axis === 'x' ? [sign * 9.6, 0, 0, 0, sign * 28.8, ecc * sign * 3.84] : [0, sign * 9.6, 0, -sign * 28.8, 0, ecc * sign * 3.84]);
  }
});

for (const height of [0, 576 * Number.EPSILON, 2304 * Number.EPSILON, 1e-10, 3]) it(`#2220 triangular refusal and retained collinear boundary height=${height}`, () => {
  const model = mesh([[[0, 0, 0], [0, 0, 4]], [[2, 0, 0], [2, 0, 4]], [[6, height, 0], [6, height, 4]]]);
  if (height > 1152 * Number.EPSILON) { expect(() => windHeightField({ model, axis: 'y', from: 0, to: 4, pressure: () => 1 })).toThrow('wind.pressure.triangularCentroidUnsupported'); return; }
  const loads = windHeightLoads(windHeightField({ model, axis: 'y', from: 0, to: 4, pressure: () => 1 }), 0, 1).distributed;
  expect(loads.map(p => p.elementId).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  for (const p of loads) {
    const expected = [1, 3, 2][p.elementId - 1]!;
    expect(p.qY).toBeCloseTo(expected, 10);
    expect(p.qYJ).toBeCloseTo(expected, 10);
  }
  expect(windResultants(model, loads)[1]).toBeCloseTo(24, 10);
});

for (const angle of [0, 0.37, 2.1]) for (const split of [false, true]) it(`#2220 scalene triangular partitions refuse across rotations and subdivision ${angle} ${split}`, () => {
  const model = mesh([[[0, 0, 0], [0, 0, 4]], [[4, 0, 0], [4, 0, 4]], [[0, 3, 0], [0, 3, 4]]]);
  for (const n of model.nodes.values()) { const { x, y } = n; n.x = x * Math.cos(angle) - y * Math.sin(angle); n.y = x * Math.sin(angle) + y * Math.cos(angle); }
  if (split) {
    const e = model.elements.get(1)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    model.nodes.set(7, { id: 7, x: a.x, y: a.y, z: 1 });
    model.elements.set(1, { ...e, nodeJ: 7 }); model.elements.set(4, { ...e, id: 4, nodeI: 7, nodeJ: b.id });
  }
  expect(() => windHeightField({ model, axis: 'x', from: 0, to: 4, pressure: (_z, width) => 1 / width })).toThrow('wind.pressure.triangularCentroidUnsupported');
});

for (const kind of ['latticeTower', 'solidSign'] as const) it(`#2220 planner retains ${kind} transfer`, () => {
  const model = mesh(kind === 'latticeTower' ? [[[-1, -1.5, 0], [-1, -1.5, 6]], [[-1, 1.5, 0], [-1, 1.5, 6]], [[2, 0, 0], [2, 0, 6]]] : [[[0, -1, 0], [0, -1, 6]], [[0, 1, 0], [0, 1, 6]]]);
  const structure = kind === 'latticeTower' ? { kind, section: 'triangle', round: false, solidity: 1, diagonal: false, width: 3 } : { kind, clearance: 0 };
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  planWind({ model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 1, exposure: 'C', enclosure: 'open', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: ['+x'], directions: { x: true, y: false }, structure } } as LoadPlanInput, levels, sink);
  expect(sink.blockedKeys).toEqual([]);
  expect(sink.nodal).toEqual([]);
  if (kind === 'latticeTower') {
    const lines = sink.distributed.filter(p => p.caseIndex === 0);
    assertWindResultants(windResultants(model, lines), [14.4, 0, 0, 0, 43.2, 0]);
    for (const e of model.elements.values()) expect(lines.filter(p => p.elementId === e.id).reduce((sum, p) => sum + p.qX! * (p.b! - p.a!), 0)).toBeCloseTo(4.8, 10);
  } else {
    const indices = sink.cases.flatMap((c, i) => c.nameKey === 'wind.other.minimumSignCase' ? [i] : []);
    expect(indices).toHaveLength(2);
    for (const index of indices) {
      const r = windResultants(model, sink.distributed.filter(p => p.caseIndex === index));
      expect(r[0]).toBeCloseTo(9.6, 10); expect(Math.abs(r[5]!)).toBeCloseTo(3.84, 10);
    }
  }
});

it('#2220 coincident carriers divide a supported symmetric triangular median cell', () => {
  const model = mesh([[[0, 0, 0], [0, 0, 4]], [[6, 0, 0], [6, 0, 4]], [[3, 3, 0], [3, 3, 4]]]);
  model.elements.set(4, { ...model.elements.get(1)!, id: 4 });
  const loads = windHeightLoads(windHeightField({ model, axis: 'y', from: 0, to: 4, pressure: () => 1 }), 0, 1).distributed;
  expect([...new Set(loads.map(p => p.elementId))].sort()).toEqual([1, 2, 3, 4]);
  for (const p of loads) {
    const expected = p.elementId === 1 || p.elementId === 4 ? 1 : 2;
    expect(p.qY).toBeCloseTo(expected, 10); expect(p.qYJ).toBeCloseTo(expected, 10);
  }
  assertWindResultants(windResultants(model, loads), [0, 24, 0, -48, 0, 72]);
});
