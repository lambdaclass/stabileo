import { readFileSync, writeFileSync } from 'node:fs';
import { computeDiagramValueAt } from '../../diagrams';
import { evaluateDiagramAt } from '../../diagrams-3d';
import { windLoadCases } from '../wind-cases';
import { windAxis } from './wind-integration-fixture';
import { velocityPressure } from '../../../codes/cirsoc102/wind';
import { afterAll, expect, it } from 'vitest';
import { otherStructureWind } from '../wind-other';
import { integrateWindPressure, windHeightField, windHeightLoads } from '../wind-pressure-field';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type LoadPlanInput, type PlanSink } from '../load-plan';
import { mesh, remeshWind, variants, windProject, windResultants, assertWindResultants } from './wind-integration-fixture';
import { input2DToWireObject, input3DToWireObject, solve, solvePDelta, solve3D, solvePDelta3D } from '../../wasm-solver';
import type { SolverInput } from '../../types';
import type { SolverInput3D } from '../../types-3d';

const nativeCases: Array<{ kind: string; variant: string; dimension: number; [key: string]: unknown }> = [];
afterAll(() => {
  if (process.env.WIND_MEMBER_CASES) { writeFileSync(process.env.WIND_MEMBER_CASES, JSON.stringify(nativeCases, null, 2) + '\n'); return; }
  const fixtures = JSON.parse(readFileSync(new URL('../../../../../../engine/tests/integration/wind_member_2220.json', import.meta.url), 'utf8')) as typeof nativeCases;
  for (const candidate of nativeCases) expect(fixtures.find(c => c.kind === candidate.kind && c.variant === candidate.variant && c.dimension === candidate.dimension)).toEqual(JSON.parse(JSON.stringify(candidate)));
});

const generate = (model: ReturnType<typeof mesh>, kind: string, rotated = false) => {
  if (kind !== 'wall') {
    const structure = kind.startsWith('solidSign') ? { kind: 'solidSign' as const, clearance: 0 } : kind === 'chimney' ? { kind: 'chimney' as const, section: 'squareNormal' as const, diameter: 2 }
      : kind === 'openSign' ? { kind: 'openSign' as const, members: 'flat' as const, solidity: 1, width: 2 }
      : { kind: 'latticeTower' as const, section: kind === 'triangularTower' ? 'triangle' as const : 'square' as const, round: false, solidity: 1, diagonal: false, width: 2 };
    const generated = otherStructureWind({ model, structure, project: { ...windProject, basicSpeed: 1 }, directions: [rotated ? '+y' : '+x'], tributaryWidth: 2 });
    const c = kind.startsWith('solidSignMinimum') ? generated.cases.find(c => c.nameKey === 'wind.other.minimumSignCase' && c.nameParams.c === (kind.endsWith('Positive') ? 'B+' : 'B−'))! : generated.cases[0]!;
    expect(c).toBeDefined();
    return { points: c.nodal, lines: c.distributed.map(d => ({ ...d, q: d.qZ })) };
  }
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  planWind({ model, tributaryWidth: 2, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: [rotated ? '+y' : '+x'], directions: { x: !rotated, y: rotated }, bothSenses: false, caseSet: 'case1', profile: [[0, 1], [6, 1]] } } as LoadPlanInput, levels, sink);
  expect(sink.blockedKeys).toEqual([]);
  return { points: sink.nodal.filter(n => n.caseIndex === 0), lines: sink.distributed.filter(n => n.caseIndex === 0) };
};

for (const kind of ['chimney', 'wall', 'openSign', 'latticeTower', 'solidSign', 'triangularTower', 'solidSignMinimumPositive', 'solidSignMinimumNegative']) for (const variant of variants) for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const pressureSign of [1, -1]) {
  it(`#2220 ${kind} member loading ${variant} spatial=${spatial} nonlinear=${nonlinear} pressure=${pressureSign}`, () => {
    const { model } = remeshWind(mesh(kind === 'triangularTower' ? [[[-2, -1, 0], [-2, -1, 6]], [[2, -1, 0], [2, -1, 6]], [[0, 2, 0], [0, 2, 6]]] : kind.startsWith('solidSign') ? [[[0, 0, 0], [0, 0, 6]], [[0, 2, 0], [0, 2, 6]]] : [[[0, 0, 0], [0, 0, 6]]]), variant);
    const rotated = variant === 'rotate';
    const { points, lines } = generate(model, kind, rotated);
    const component = (p: { qX?: number; qY?: number }) => pressureSign * ((rotated ? p.qY : p.qX) ?? 0);
    const w = pressureSign * (kind === 'wall' ? 2 : kind.startsWith('solidSign') || kind === 'triangularTower' ? 0.8 : 1.6);
    if (kind === 'triangularTower') assertWindResultants(windResultants(model, lines.map(p => ({ ...p, q: 0 }))), rotated ? [0, 0.8 * 3 * 6, 0, -0.8 * 3 * 18, 0, 0] : [0.8 * 3 * 6, 0, 0, 0, 0.8 * 3 * 18, 0]);
    if (kind.startsWith('solidSignMinimum')) {
      const F = 0.8 * 2 * 6, ecc = kind.endsWith('Positive') ? 1 : -1;
      assertWindResultants(windResultants(model, lines.map(p => ({ ...p, q: 0 }))), rotated ? [0, F, 0, -3 * F, 0, -F + ecc * 0.4 * F] : [F, 0, 0, 0, 3 * F, -F + ecc * 0.4 * F]);
    }
    const eccentricity = kind === 'solidSignMinimumPositive' ? 1 : kind === 'solidSignMinimumNegative' ? -1 : 0;
    const carrierScale = (nodeId: number) => 1 + eccentricity * 0.4 * (1 - (rotated ? -model.nodes.get(nodeId)!.x : model.nodes.get(nodeId)!.y));
    const scales = Object.fromEntries([...model.elements].map(([id, e]) => [id, carrierScale(e.nodeI)]));
    const base = [...model.nodes.values()].find(n => n.z === 0)!.id;
    const tip = [...model.nodes.values()].find(n => n.z === 6)!.id;
    const input: SolverInput = {
      nodes: new Map([...model.nodes].map(([id, n]) => [id, { id, x: rotated ? n.y : n.x, z: n.z ?? 0 }])),
      elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      supports: new Map([...model.nodes.values()].filter(n => n.z === 0).map(n => [n.id, { id: n.id, nodeId: n.id, type: 'fixed' }])),
      loads: [...lines.map(d => ({ type: 'distributed' as const, data: { elementId: d.elementId, qI: -component(d), qJ: -component(d), a: d.a, b: d.b } })), ...points.map(p => ({ type: 'nodal' as const, data: { nodeId: p.nodeId, fx: rotated ? p.fy : p.fx, fz: 0, my: 0 } }))],
    };
    const assertMemberLoads = () => { expect(points).toEqual([]); expect(lines.length).toBeGreaterThan(0); };
    const assertCarrierForces = () => { for (const e of model.elements.values()) {
      const a = model.nodes.get(e.nodeI)!.z!, b = model.nodes.get(e.nodeJ)!.z!;
      expect(lines.filter(d => d.elementId === e.id).reduce((s, d) => s + component(d) * (d.b! - d.a!), 0)).toBeCloseTo(w * carrierScale(e.nodeI) * (b - a), 10);
    } };
    if (spatial) {
      const input3: SolverInput3D = { ...input, nodes: new Map([...model.nodes].map(([id, n]) => [id, { ...n, z: n.z ?? 0 }])),
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', localYx: rotated ? 0 : 1, localYy: rotated ? 1 : 0, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
        sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]), supports: new Map([...model.nodes.values()].filter(n => n.z === 0).map(n => [n.id, { nodeId: n.id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }])),
        loads: [...lines.map(d => ({ type: 'distributed' as const, data: { elementId: d.elementId, qYI: component(d), qYJ: component(d), qZI: 0, qZJ: 0, a: d.a, b: d.b } })), ...points.map(p => ({ type: 'nodal' as const, data: { nodeId: p.nodeId, fx: p.fx, fy: p.fy, fz: 0, mx: 0, my: 0, mz: p.mz ?? 0 } }))],
      };
      if (!nonlinear && variant !== 'mirror') nativeCases.push({ kind, variant: `${variant}:${pressureSign}`, dimension: 3, axis: 'z', displacement: rotated ? 'uy' : 'ux', length: 6, segments: [{ a: 0, b: 6, q: w }], scales, tipScale: carrierScale(tip), base, tip, input: input3DToWireObject(input3) });
      assertMemberLoads();
      assertCarrierForces();
      const out = nonlinear ? solvePDelta3D(input3).results : solve3D(input3);
      expect(out.elementForces.map((f: { elementId: number }) => f.elementId).sort((a: number, b: number) => a - b)).toEqual([...model.elements.keys()].sort((a, b) => a - b));
      expect(out.displacements.find((d: { nodeId: number; ux: number; uy: number }) => d.nodeId === tip)![rotated ? 'uy' : 'ux']).toBeCloseTo(w * carrierScale(tip) * 6 ** 4 / (8 * 200000 * 1000 * 1e-4), 8);
      for (const f of out.elementForces) {
        const memberW = w * scales[f.elementId]!;
        const z = model.nodes.get(model.elements.get(f.elementId)!.nodeI)!.z!;
        expect(f.vyStart).toBeCloseTo(-memberW * (6 - z), 8);
        expect(f.mzStart).toBeCloseTo(-memberW * (6 - z) ** 2 / 2, 8);
        expect(f.mxStart).toBeCloseTo(0, 10);
        for (const t of [0.2, 0.5, 0.8]) {
          const station = z + t * f.length;
          expect(evaluateDiagramAt(f, 'shearY', t)).toBeCloseTo(-memberW * (6 - station), 8);
          expect(evaluateDiagramAt(f, 'momentZ', t)).toBeCloseTo(-memberW * (6 - station) ** 2 / 2, 8);
          expect(evaluateDiagramAt(f, 'torsion', t)).toBeCloseTo(0, 10);
        }
      }
    } else {
      if (!nonlinear && variant !== 'mirror') nativeCases.push({ kind, variant: `${variant}:${pressureSign}`, dimension: 2, axis: 'z', displacement: 'ux', length: 6, segments: [{ a: 0, b: 6, q: w }], scales, tipScale: carrierScale(tip), base, tip, input: input2DToWireObject(input) });
      assertMemberLoads();
      assertCarrierForces();
      const out = nonlinear ? solvePDelta(input).results : solve(input);
      expect(out.elementForces.map((f: { elementId: number }) => f.elementId).sort((a: number, b: number) => a - b)).toEqual([...model.elements.keys()].sort((a, b) => a - b));
      expect(out.displacements.find((d: { nodeId: number; ux: number }) => d.nodeId === tip)!.ux).toBeCloseTo(w * carrierScale(tip) * 6 ** 4 / (8 * 200000 * 1000 * 1e-4), 8);
      for (const f of out.elementForces) {
        const memberW = w * scales[f.elementId]!;
        const z = model.nodes.get(model.elements.get(f.elementId)!.nodeI)!.z!;
        expect(f.vStart).toBeCloseTo(memberW * (6 - z), 8);
        expect(f.mStart).toBeCloseTo(memberW * (6 - z) ** 2 / 2, 8);
        for (const t of [0.2, 0.5, 0.8]) { const station = z + t * f.length;
          expect(computeDiagramValueAt('shear', t, f)).toBeCloseTo(memberW * (6 - station), 8);
          expect(computeDiagramValueAt('moment', t, f)).toBeCloseTo(memberW * (6 - station) ** 2 / 2, 8);
        }
      }
    }
  });
}

for (const profile of [undefined, [[0, 1], [6, 1]]]) it(`#2220 an open building requires its free-roof declaration profile=${!!profile}`, () => {
  const model = mesh([[[0, 0, 0], [0, 0, 6], [10, 0, 6]]]);
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  planWind({ model, tributaryWidth: 2, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'open', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, directions: { x: true, y: false }, profile } } as LoadPlanInput, levels, sink);
  expect(sink.cases).toEqual([]);
  expect(sink.blockedKeys.map(n => n.key)).toContain('wind.pressure.openBuildingRequiresFreeRoof');
});

for (const angle of [0, 0.37, Math.PI / 2, 2.1]) for (const split of [false, true]) it(`#2220 intrinsic carrier tributaries rotate per member ${angle} split=${split}`, () => {
  const model = mesh([0, 2, 6].flatMap(x => [0, 4].map(y => [[x, y, 0], [x, y, 4]])));
  for (const n of model.nodes.values()) { const { x, y } = n; n.x = Math.cos(angle) * x - Math.sin(angle) * y; n.y = Math.sin(angle) * x + Math.cos(angle) * y; }
  if (split) {
    const e = model.elements.get(1)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!, id = model.nodes.size + 1;
    model.nodes.set(id, { id, x: a.x, y: a.y, z: 1 }); model.elements.set(1, { ...e, nodeJ: id });
    model.elements.set(7, { ...e, id: 7, nodeI: id, nodeJ: b.id });
  }
  const width = Math.max(...[...model.nodes.values()].map(n => n.y)) - Math.min(...[...model.nodes.values()].map(n => n.y));
  const field = windHeightField({ model, axis: 'x', from: 0, to: 4, pressure: () => 1 / width });
  const result = windHeightLoads(field, 1, 0);
  expect(result.nodal).toEqual([]);
  for (const e of model.elements.values()) {
    const expected = e.id === 1 || e.id === 2 || e.id === 7 ? 1 / 12 : e.id === 3 || e.id === 4 ? 1 / 4 : 1 / 6;
    const parts = result.distributed.filter(p => p.elementId === e.id);
    expect(parts.length).toBeGreaterThan(0);
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    expect(parts.reduce((sum, p) => sum + (p.qX + p.qXJ!) * (p.b - p.a) / 2, 0)).toBeCloseTo(expected * (b.z! - a.z!), 10);
    for (const p of parts) { expect(p.qX).toBeCloseTo(expected, 10); expect(p.qXJ).toBeCloseTo(expected, 10); }
  }
});

it('#2220 a four-carrier nonrectangular partition refuses instead of using axis-dependent slices', () => {
  const model = mesh([[[0, 0, 0], [0, 0, 4]], [[4, 0, 0], [4, 0, 4]], [[0, 3, 0], [0, 3, 4]], [[3, 2, 0], [3, 2, 4]]]);
  expect(() => windHeightField({ model, axis: 'x', from: 0, to: 4, pressure: () => 1 })).toThrow('wind.pressure.carrierPartitionUnresolved');
});

for (const sign of [1, -1]) it(`#2220 a reversed carrier retains partial trapezoidal pressure ${sign}`, () => {
  const model = mesh([sign > 0 ? [[0, 0, -2], [0, 0, 6]] : [[0, 0, 6], [0, 0, -2]]]);
  const field = windHeightField({ model, axis: 'x', from: 0, to: 6, width: 2, pressure: z => z - 3, boundaries: [3] });
  const loads = windHeightLoads(field, 1, 0).distributed;
  expect(loads).toHaveLength(2);
  for (const p of loads) {
    expect(p.qX).toBeCloseTo(2 * ((sign > 0 ? -2 + p.a : 6 - p.a) - 3), 10);
    expect(p.qXJ).toBeCloseTo(2 * ((sign > 0 ? -2 + p.b : 6 - p.b) - 3), 10);
  }
});

for (const free of [false, true]) for (const variant of ['base', 'uniform', 'uneven'] as const) for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const pressureSign of [1, -1]) it(`#2220 zoned roof member forces and deflection free=${free} ${variant} spatial=${spatial} nonlinear=${nonlinear} pressure=${pressureSign}`, () => {
  const { model } = remeshWind(mesh([[[0, 0, 3], [12, 0, 3]]]), variant);
  const lines = free ? otherStructureWind({ model, structure: { kind: 'freeRoof', roof: 'monoslope', blocked: false }, project: windProject, directions: ['+x'], tributaryWidth: 1 }).cases[0]!.distributed.map(p => ({ ...p, q: p.qZ, qJ: p.qZJ }))
    : windLoadCases({ model, axes: [{ ...windAxis, along: 12 }], set: 'case1', directions: ['+x'], tributaryWidth: 1, speed: 40 }).cases[0]!.distributed;
  for (const p of lines) { p.q *= pressureSign; if (p.qJ !== undefined) p.qJ *= pressureSign; }
  const pressure = pressureSign * (free ? velocityPressure(3, windProject) / 1000 * 0.85 : 0.85);
  const coefficients = free ? [0.8, 0.6, 0.3] : [0.9, 0.5, 0.3];
  const cuts = [0, 3, 6, 12];
  const integral = (station: number, power: number) => coefficients.reduce((sum, c, i) => { const a = Math.max(station, cuts[i]!), b = cuts[i + 1]!; return sum + (b > a ? pressure * c * (b ** (power + 1) - a ** (power + 1)) / (power + 1) : 0); }, 0);
  const input: SolverInput = {
    nodes: new Map([...model.nodes].map(([id, n]) => [id, { id, x: n.x, z: n.z ?? 0 }])),
    elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: lines.map(p => ({ type: 'distributed', data: { elementId: p.elementId, qI: p.q, qJ: p.qJ ?? p.q, a: p.a, b: p.b } })),
  };
  const expectedDeflection = (36 * integral(0, 2) - integral(0, 3)) / (6 * 200000 * 1000 * 1e-4);
  const segments = coefficients.map((c, i) => ({ a: cuts[i]!, b: cuts[i + 1]!, q: pressure * c }));
  const tip = [...model.nodes.values()].find(n => n.x === 12)!.id;
  if (spatial) {
    const input3: SolverInput3D = { ...input, nodes: new Map([...model.nodes].map(([id, n]) => [id, { ...n, z: n.z ?? 0 }])),
      elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', localYx: 0, localYy: 1, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
      sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]), supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: lines.map(p => ({ type: 'distributed', data: { elementId: p.elementId, qYI: 0, qYJ: 0, qZI: p.q, qZJ: p.qJ ?? p.q, a: p.a, b: p.b } })),
    };
    if (!nonlinear) nativeCases.push({ kind: free ? 'freeRoof' : 'roof', variant: `${variant}:${pressureSign}`, dimension: 3, axis: 'x', displacement: 'uz', length: 12, segments, tip, input: input3DToWireObject(input3) });
    const out = nonlinear ? solvePDelta3D(input3).results : solve3D(input3);
    expect(out.elementForces.map((f: { elementId: number }) => f.elementId).sort((a: number, b: number) => a - b)).toEqual([...model.elements.keys()].sort((a, b) => a - b));
    expect(out.displacements.find((d: { nodeId: number; uz: number }) => d.nodeId === tip)!.uz).toBeCloseTo(expectedDeflection, 8);
    for (const f of out.elementForces) for (const t of [0.2, 0.5, 0.8]) { const station = model.nodes.get(model.elements.get(f.elementId)!.nodeI)!.x + t * f.length;
      expect(evaluateDiagramAt(f, 'shearZ', t)).toBeCloseTo(-integral(station, 0), 8);
      expect(evaluateDiagramAt(f, 'momentY', t)).toBeCloseTo(integral(station, 1) - station * integral(station, 0), 8);
      expect(evaluateDiagramAt(f, 'torsion', t)).toBeCloseTo(0, 10);
    }
  } else {
    if (!nonlinear) nativeCases.push({ kind: free ? 'freeRoof' : 'roof', variant: `${variant}:${pressureSign}`, dimension: 2, axis: 'x', displacement: 'uz', length: 12, segments, tip, input: input2DToWireObject(input) });
    const out = nonlinear ? solvePDelta(input).results : solve(input);
    expect(out.elementForces.map((f: { elementId: number }) => f.elementId).sort((a: number, b: number) => a - b)).toEqual([...model.elements.keys()].sort((a, b) => a - b));
    expect(out.displacements.find((d: { nodeId: number; uz: number }) => d.nodeId === tip)!.uz).toBeCloseTo(expectedDeflection, 8);
    for (const f of out.elementForces) for (const t of [0.2, 0.5, 0.8]) { const station = model.nodes.get(model.elements.get(f.elementId)!.nodeI)!.x + t * f.length;
      expect(computeDiagramValueAt('shear', t, f)).toBeCloseTo(-integral(station, 0), 8);
      expect(computeDiagramValueAt('moment', t, f)).toBeCloseTo(-(integral(station, 1) - station * integral(station, 0)), 8);
    }
  }
});

for (const blocked of [false, true]) it(`#2220 a declared free roof keeps its blockage procedure with a pressure profile blocked=${blocked}`, () => {
  const model = mesh([[[0, 0, 0], [0, 0, 3], [12, 0, 3]], [[0, 6, 0], [0, 6, 3], [12, 6, 3]]]);
  const generate = (profile?: number[][]) => {
    const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
    const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
    planWind({ model, tributaryWidth: 2, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'open', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: ['+x'], directions: { x: true, y: false }, structure: { kind: 'freeRoof', roof: 'monoslope', blocked }, profile } } as LoadPlanInput, levels, sink);
    expect(sink.blockedKeys).toEqual([]);
    expect(sink.cases.map(c => c.nameKey)).toEqual(['wind.other.freeRoofCase', 'wind.other.freeRoofCase', 'wind.other.minimumCase']);
    return sink;
  };
  const normal = generate(), profiled = generate([[0, 999], [6, 999]]);
  expect(profiled.distributed).toEqual(normal.distributed);
  expect(profiled.unsupportedKeys.map(n => n.key)).toContain('loadPlan.note.windProfileOther');
  const first = normal.distributed.find(p => p.caseIndex === 0)!;
  const expected = velocityPressure(3, windProject) / 1000 * 0.85 * (blocked ? 1.2 : 0.8) * 2;
  expect(first.q).toBeCloseTo(expected, 10);
});

it('#2220 curved pressure retains the second and third work moments', () => {
  const loads = integrateWindPressure(6, [], z => z ** 2);
  for (const power of [2, 3]) {
    const integral = loads.reduce((sum, p) => {
      const slope = (p.qJ - p.q) / (p.b - p.a), intercept = p.q - slope * p.a;
      return sum + intercept * (p.b ** (power + 1) - p.a ** (power + 1)) / (power + 1) + slope * (p.b ** (power + 2) - p.a ** (power + 2)) / (power + 2);
    }, 0);
    expect(integral).toBeCloseTo(6 ** (power + 3) / (power + 3), 8);
  }
});

it('#2220 an oblique grid retains each physical carrier tributary', () => {
  const model = mesh([0, 2, 6].flatMap(x => [0, 4].map(y => [[x, y, 0], [x, y, 4]])));
  for (const n of model.nodes.values()) { const { x, y } = n; n.x = Math.cos(0.37) * x - Math.sin(0.37) * y; n.y = Math.sin(0.37) * x + Math.cos(0.37) * y; }
  const width = Math.max(...[...model.nodes.values()].map(n => n.y)) - Math.min(...[...model.nodes.values()].map(n => n.y));
  const field = windHeightField({ model, axis: 'x', from: 0, to: 4, pressure: () => 1 / width });
  for (const e of model.elements.values()) {
    const expected = e.id <= 2 ? 1 / 3 : e.id <= 4 ? 1 : 2 / 3;
    expect((field.loads.get(e.nodeI) ?? field.baseLoads.get(e.nodeI) ?? 0) + (field.loads.get(e.nodeJ) ?? field.baseLoads.get(e.nodeJ) ?? 0)).toBeCloseTo(expected, 10);
  }
});

for (const kind of ['bracedTower', 'taperCrossing'] as const) for (const variant of variants) for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const sign of [1, -1]) it(`#2220 — ${kind} per-carrier response ${variant} spatial=${spatial} nonlinear=${nonlinear} sign=${sign}`, () => {
  const source = kind === 'bracedTower'
    ? mesh([0, 2].flatMap(x => [-1, 1].map(y => [[x, y, 0], [x, y, 6]])))
    : mesh([-1, 1].map(s => [[0, s * 0.015, 0], [0, s * 0.045, 6]]));
  if (kind === 'bracedTower') source.elements.set(5, { ...source.elements.get(1)!, id: 5, nodeI: 1, nodeJ: 4 });
  const { model, sources } = remeshWind(source, variant);
  const rotated = variant === 'rotate';
  const lines = windHeightLoads(windHeightField({ model, axis: rotated ? 'y' : 'x', from: 0, to: 6, width: 0.09, pressure: () => 1 }), rotated ? 0 : sign, rotated ? sign : 0).distributed;
  const carriers = [...model.elements.values()].filter(e => kind !== 'bracedTower' || sources.get(e.id)! <= 4);
  expect([...new Set(lines.map(p => p.elementId))].sort((a, b) => a - b)).toEqual(carriers.map(e => e.id).sort((a, b) => a - b));
  const scale = kind === 'bracedTower' ? 1 : 6 / Math.hypot(6, 0.03), length = 6 / scale;
  const qI = sign * scale * (kind === 'bracedTower' ? 0.5 : 0.015), qJ = sign * scale * (kind === 'bracedTower' ? 0.5 : 0.045);
  const gradient = (qJ - qI) / length;
  const integral = (at: number, power: number) => qI * (length ** (power + 1) - at ** (power + 1)) / (power + 1) + gradient * (length ** (power + 2) - at ** (power + 2)) / (power + 2);
  for (const e of carriers) {
    const start = model.nodes.get(e.nodeI)!.z! / scale, end = model.nodes.get(e.nodeJ)!.z! / scale;
    const parts = lines.filter(p => p.elementId === e.id);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.reduce((s, p) => s + ((rotated ? p.qY : p.qX) + (rotated ? p.qYJ! : p.qXJ!)) * (p.b - p.a) / 2, 0)).toBeCloseTo(integral(start, 0) - integral(end, 0), 10);
    for (const p of parts) {
      expect(rotated ? p.qY : p.qX).toBeCloseTo(qI + gradient * (start + p.a), 10);
      expect(rotated ? p.qYJ : p.qXJ).toBeCloseTo(qI + gradient * (start + p.b), 10);
    }
  }
  const used = new Set(carriers.flatMap(e => [e.nodeI, e.nodeJ]));
  const nodes = new Map([...model.nodes].filter(([id]) => used.has(id)));
  const tip = [...nodes.values()].find(n => n.z === 6)!.id;
  const component = (p: { qX: number; qXJ?: number; qY: number; qYJ?: number }, end = false) => rotated ? end ? p.qYJ! : p.qY : end ? p.qXJ! : p.qX;
  const input: SolverInput = {
    nodes: new Map([...nodes].map(([id, n]) => [id, { id, x: 0, z: n.z! / scale }])),
    elements: new Map(carriers.map(e => [e.id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    supports: new Map([...nodes.values()].filter(n => n.z === 0).map(n => [n.id, { id: n.id, nodeId: n.id, type: 'fixed' }])),
    loads: lines.map(p => ({ type: 'distributed', data: { elementId: p.elementId, qI: -component(p), qJ: -component(p, true), a: p.a, b: p.b } })),
  };
  const expectedDeflection = (3 * length * integral(0, 2) - integral(0, 3)) / (6 * 200000 * 1000 * 1e-4);
  const check = (out: ReturnType<typeof solve> | ReturnType<typeof solve3D>) => {
    expect(out.elementForces.map((f: { elementId: number }) => f.elementId).sort((a: number, b: number) => a - b)).toEqual(carriers.map(e => e.id).sort((a, b) => a - b));
    for (const d of out.displacements) if (nodes.get(d.nodeId)!.z === 6) expect(rotated && 'uy' in d ? d.uy : d.ux).toBeCloseTo(expectedDeflection, 8);
    for (const f of out.elementForces) {
      const z = nodes.get(model.elements.get(f.elementId)!.nodeI)!.z! / scale;
      for (const t of [0, 0.2, 0.5, 0.8, 1]) {
        const at = z + t * f.length, shear = integral(at, 0), moment = integral(at, 1) - at * shear;
        if ('vyStart' in f) {
          expect(evaluateDiagramAt(f, 'shearY', t)).toBeCloseTo(-shear, 8);
          expect(evaluateDiagramAt(f, 'momentZ', t)).toBeCloseTo(-moment, 8);
          expect(evaluateDiagramAt(f, 'torsion', t)).toBeCloseTo(0, 10);
        } else {
          expect(computeDiagramValueAt('shear', t, f)).toBeCloseTo(shear, 8);
          expect(computeDiagramValueAt('moment', t, f)).toBeCloseTo(moment, 8);
        }
      }
    }
  };
  if (spatial) {
    const input3: SolverInput3D = { ...input, nodes: new Map([...nodes].map(([id, n]) => [id, { ...n, z: n.z! }])),
      elements: new Map(carriers.map(e => [e.id, { ...e, type: 'frame', localYx: rotated ? 0 : 1, localYy: rotated ? 1 : 0, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
      sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]), supports: new Map([...nodes.values()].filter(n => n.z === 0).map(n => [n.id, { nodeId: n.id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }])),
      loads: lines.map(p => ({ type: 'distributed', data: { elementId: p.elementId, qYI: component(p), qYJ: component(p, true), qZI: 0, qZJ: 0, a: p.a, b: p.b } })),
    };
    if (!nonlinear && variant !== 'mirror') nativeCases.push({ kind, variant: `${variant}:${sign}`, dimension: 3, axis: 'z', coordinateScale: 1 / scale, displacement: rotated ? 'uy' : 'ux', length, segments: [{ a: 0, b: length, q: qI, qJ }], tip, input: input3DToWireObject(input3) });
    check(nonlinear ? solvePDelta3D(input3).results : solve3D(input3));
  } else {
    if (!nonlinear && variant !== 'mirror') nativeCases.push({ kind, variant: `${variant}:${sign}`, dimension: 2, axis: 'z', displacement: 'ux', length, segments: [{ a: 0, b: length, q: qI, qJ }], tip, input: input2DToWireObject(input) });
    check(nonlinear ? solvePDelta(input).results : solve(input));
  }
});

for (const entry of ['field', 'planner'] as const) for (const variant of variants) for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const sign of [-1, 1]) it.skipIf(process.env.RUN_KNOWN_WRONG !== '2220')(`#2220 known wrong result: #2220 cubic grid ${entry} ${variant} spatial=${spatial} nonlinear=${nonlinear} sign=${sign}`, () => {
  const source = mesh([0, 1, 2].flatMap(column => [-1, 1].map(side => [[column === 1 ? 0 : column, side * 0.75, 0], [column, side * 0.25, 1]])));
  const { model, sources } = remeshWind(source, variant), rotated = variant === 'rotate';
  const axis = rotated ? 'y' : 'x';
  let lines: ReturnType<typeof windHeightLoads>['distributed'];
  if (entry === 'field') lines = windHeightLoads(windHeightField({ model, axis, from: 0, to: 1, pressure: z => z }), rotated ? 0 : 1, rotated ? 1 : 0).distributed;
  else {
    const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
    const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
    planWind({ model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: [rotated ? '+y' : '+x'], caseSet: 'case1', profile: [[0, 0], [1, 1]] } } as LoadPlanInput, levels, sink);
    expect(sink.blockedKeys).toEqual([]); expect(sink.cases).toHaveLength(1); expect(sink.nodal).toEqual([]);
    lines = sink.distributed.map(p => ({ ...p, q: p.q, qJ: p.qJ ?? p.q, qX: p.qX ?? 0, qXJ: p.qXJ ?? p.qX ?? 0, qY: p.qY ?? 0, qYJ: p.qYJ ?? p.qY ?? 0, a: p.a!, b: p.b!, frame: 'global' as const, facet: -1 }));
  }
  const component = (p: typeof lines[number], end = false) => rotated ? end ? p.qYJ! : p.qY! : end ? p.qXJ! : p.qX!;
  const coefficientsFor = (id: number) => sources.get(id)! <= 2 ? [0, 0, 1.5 / 8, -1 / 8] : sources.get(id)! <= 4 ? [0, 1.5 / 4, -1 / 4] : [0, 3 / 8, -3.5 / 8, 1 / 8];
  const polynomialIntegral = (coefficients: number[], a: number, b: number, power: number) => coefficients.reduce((sum, c, k) => sum + c * (b ** (k + power + 1) - a ** (k + power + 1)) / (k + power + 1), 0);
  const checkLoads = () => {
  expect([...new Set(lines.map(p => p.elementId))].sort((a, b) => a - b)).toEqual([...model.elements.keys()].sort((a, b) => a - b));
  for (const e of model.elements.values()) {
    const start = model.nodes.get(e.nodeI)!.z!, end = model.nodes.get(e.nodeJ)!.z!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const scale = (end - start) / Math.hypot(b.x - a.x, b.y - a.y, end - start);
    const parts = lines.filter(p => p.elementId === e.id);
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) { expect(component(p)).toBeGreaterThanOrEqual(0); expect(component(p, true)).toBeGreaterThanOrEqual(0); }
    for (const power of [0, 1, 2, 3]) {
      const actual = parts.reduce((sum, p) => {
        const lo = start + scale * p.a, hi = start + scale * p.b;
        const gradient = (component(p, true) - component(p)) / (hi - lo) / scale;
        return sum + polynomialIntegral([component(p) / scale - gradient * lo, gradient], lo, hi, power);
      }, 0);
      expect(actual).toBeCloseTo(polynomialIntegral(coefficientsFor(e.id), start, end, power), 10);
    }
  }
  };
  const carriers = [...model.elements.values()].filter(e => sources.get(e.id)! <= 2);
  const used = new Set(carriers.flatMap(e => [e.nodeI, e.nodeJ]));
  const nodes = new Map([...model.nodes].filter(([id]) => used.has(id)));
  const scale = 1 / Math.hypot(1, 0.5), length = 1 / scale;
  const coefficients = [0, 0, sign * 1.5 * scale ** 3 / 8, -sign * scale ** 4 / 8];
  const integral = (at: number, power: number) => polynomialIntegral(coefficients, at, length, power);
  const tip = [...nodes.values()].find(n => n.z === 1)!.id;
  const input: SolverInput = {
    nodes: new Map([...nodes].map(([id, n]) => [id, { id, x: 0, z: n.z! / scale }])),
    elements: new Map(carriers.map(e => [e.id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    supports: new Map([...nodes.values()].filter(n => n.z === 0).map(n => [n.id, { id: n.id, nodeId: n.id, type: 'fixed' }])),
    loads: lines.filter(p => carriers.some(e => e.id === p.elementId)).map(p => ({ type: 'distributed', data: { elementId: p.elementId, qI: -sign * component(p), qJ: -sign * component(p, true), a: p.a, b: p.b } })),
  };
  const check = (out: ReturnType<typeof solve> | ReturnType<typeof solve3D>) => {
    checkLoads();
    expect(out.elementForces.map((f: { elementId: number }) => f.elementId).sort((a: number, b: number) => a - b)).toEqual(carriers.map(e => e.id).sort((a, b) => a - b));
    for (const d of out.displacements) if (nodes.get(d.nodeId)!.z === 1) expect(rotated && 'uy' in d ? d.uy : d.ux).toBeCloseTo((3 * length * integral(0, 2) - integral(0, 3)) / (6 * 200000 * 1000 * 1e-4), 12);
    for (const f of out.elementForces) for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const at = nodes.get(model.elements.get(f.elementId)!.nodeI)!.z! / scale + t * f.length;
      const shear = integral(at, 0), moment = integral(at, 1) - at * shear;
      if ('vyStart' in f) {
        expect(evaluateDiagramAt(f, 'shearY', t)).toBeCloseTo(-shear, 10);
        expect(evaluateDiagramAt(f, 'momentZ', t)).toBeCloseTo(-moment, 10);
        expect(evaluateDiagramAt(f, 'torsion', t)).toBeCloseTo(0, 10);
      } else {
        expect(computeDiagramValueAt('shear', t, f)).toBeCloseTo(shear, 10);
        expect(computeDiagramValueAt('moment', t, f)).toBeCloseTo(moment, 10);
      }
    }
  };
  if (spatial) {
    const input3: SolverInput3D = { ...input, nodes: new Map([...nodes].map(([id, n]) => [id, { ...n, z: n.z! }])),
      elements: new Map(carriers.map(e => [e.id, { ...e, type: 'frame', localYx: rotated ? 0 : 1, localYy: rotated ? 1 : 0, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
      sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]), supports: new Map([...nodes.values()].filter(n => n.z === 0).map(n => [n.id, { nodeId: n.id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }])),
      loads: lines.filter(p => carriers.some(e => e.id === p.elementId)).map(p => ({ type: 'distributed', data: { elementId: p.elementId, qYI: sign * component(p), qYJ: sign * component(p, true), qZI: 0, qZJ: 0, a: p.a, b: p.b } })),
    };
    if (!nonlinear && variant !== 'mirror') nativeCases.push({ kind: `cubicGrid:${entry}`, variant: `${variant}:${sign}`, dimension: 3, axis: 'z', coordinateScale: 1 / scale, displacement: rotated ? 'uy' : 'ux', length, polynomial: coefficients, segments: [], tip, input: input3DToWireObject(input3) });
    check(nonlinear ? solvePDelta3D(input3).results : solve3D(input3));
  } else {
    if (!nonlinear && variant !== 'mirror') nativeCases.push({ kind: `cubicGrid:${entry}`, variant: `${variant}:${sign}`, dimension: 2, axis: 'z', displacement: 'ux', length, polynomial: coefficients, segments: [], tip, input: input2DToWireObject(input) });
    check(nonlinear ? solvePDelta(input).results : solve(input));
  }
});
