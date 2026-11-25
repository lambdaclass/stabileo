import { expect, it } from 'vitest';
import { computeDiagramValueAt, computeElementDiagram, prepareDiagramValueAt } from '../diagrams';
import { computeDiagram3D, evaluateDiagramAt, prepareDiagramEvaluator3D } from '../diagrams-3d';
import {
  computeDiagrams2D, computeDiagrams3D, computeDiagramValueAtWasm, computeDiagramValueAt3DWasm,
  computeEnvelope, computeEnvelope3D, extractBeamStations, extractBeamStations3D,
  extractBeamStationsGrouped, extractBeamStationsGrouped3D, solve, solve3D, solvePDelta, solvePDelta3D,
} from '../wasm-solver';
import { computeDiagramGlobalMax } from '../../canvas/draw-diagrams';
import { computePointwiseEnvelope } from '../moving-loads';
import { buildPath3D, foldPosition, trainLoads } from '../moving-loads-3d';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';

const length = 3;
const a = 1.5;
const b = a + 1351081 * Number.EPSILON;
const q = 2 ** 32;
const peakT = a / length + (b / length - a / length) / 2;
const peakForce = (b - a) * q / 4;

function cantilevers(length: number): [SolverInput, SolverInput3D] {
  const planar: SolverInput = {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: length, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 0.0001 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [],
  };
  const spatial: SolverInput3D = {
    materials: planar.materials,
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
      releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
      releaseTStart: false, releaseTEnd: false }]]),
    nodes: new Map([...planar.nodes].map(([id, node]) => [id, { ...node, y: 0 }])),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 0.0001, iy: 0.0001, j: 0.0001 }]]),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [],
  };
  return [planar, spatial];
}

function forceRecords() {
  const [plane, space] = cantilevers(length);
  const linearPlane = solve(plane);
  const linearSpace = solve3D(space);
  const pDeltaPlane = solvePDelta(plane);
  const pDeltaSpace = solvePDelta3D(space);
  expect(pDeltaPlane.converged && pDeltaSpace.converged).toBe(true);
  const planar = [linearPlane, pDeltaPlane.results];
  const spatial = [linearSpace, pDeltaSpace.results];
  return [plane, space, planar, spatial] as const;
}

it('#2250 refuses a point query at a peak whose ordinate cannot transfer', () => {
  const [plane, space, planar, spatial] = forceRecords();
  for (const result of planar) {
    const ef = result.elementForces[0]!;
    ef.distributedLoads = [{ a, b: a + 3 * Number.EPSILON, qI: 1 / Number.EPSILON, qJ: -1 / Number.EPSILON }];
    const plotted = computeElementDiagram('shear', ef, 0, 0, length, 0);
    expect.soft(() => computeDiagramValueAt('shear', plotted.maxAbsT, ef)).toThrow(/extrema/i);
    expect.soft(() => computeDiagramValueAtWasm('shear', peakT, ef)).toThrow(/relative geometry limit/i);
    expect.soft(plotted.maxValue).toBe(0.75);

    ef.distributedLoads = [{ a, b, qI: q, qJ: -q }];
    const diagram = computeDiagrams2D(plane, result).shear[0]!;
    expect.soft(diagram.maxValue).toBe(peakForce);
    expect.soft(() => computeDiagramValueAtWasm('shear', peakT, ef)).toThrow(/extrema/i);
    expect.soft(() => computeDiagramValueAt('shear', peakT, ef)).toThrow(/extrema/i);
    expect.soft(() => prepareDiagramValueAt('shear', ef)(peakT)).toThrow(/extrema/i);
    ef.distributedLoads = [{ a, b: 2.25, qI: 4, qJ: -4 }];
    expect.soft(computeDiagramValueAtWasm('shear', 0.625, ef)).toBe(0.75);
    expect.soft(computeDiagramValueAt('shear', 0.625, ef)).toBe(0.75);
    expect.soft(prepareDiagramValueAt('shear', ef)(0.625)).toBe(0.75);
  }
  for (const result of spatial) {
    const ef = result.elementForces[0]!;
    ef.distributedLoadsZ = [{ a, b, qI: q, qJ: -q }];
    const diagram = computeDiagrams3D(space, result).shearZ[0]!;
    expect.soft(diagram.maxValue).toBe(peakForce);
    expect.soft(() => computeDiagramValueAt3DWasm('shearZ', peakT, ef)).toThrow(/extrema/i);
    expect.soft(() => evaluateDiagramAt(ef, 'shearZ', peakT)).toThrow(/extrema/i);
    ef.distributedLoadsZ = [{ a, b: 2.25, qI: 4, qJ: -4 }];
    expect.soft(computeDiagramValueAt3DWasm('shearZ', 0.625, ef)).toBe(0.75);
    expect.soft(evaluateDiagramAt(ef, 'shearZ', 0.625)).toBe(0.75);
  }
});

it('#2226 refuses an envelope that aliases an extremum with another case’s jump', () => {
  const [, , planar, spatial] = forceRecords();
  const jump = peakT * length;
  const members = [{ elementId: 1, length, sectionId: 1, materialId: 1 }];
  for (const result of planar) {
    const peak = structuredClone(result);
    peak.elementForces[0]!.distributedLoads = [{ a, b, qI: q, qJ: -q }];
    result.elementForces[0]!.pointLoads = [{ a: jump, p: 10 }];
    expect.soft(() => computeEnvelope([peak, result])).toThrow('Cannot compute the envelope: shear of element 1: distinct member diagram cuts share a normalized station');
    const stations = { members, combinations: [peak, result].map((results, i) => ({ comboId: i + 1, results })) };
    expect.soft(() => extractBeamStations(stations)).toThrow(/normalized station/i);
    expect.soft(() => extractBeamStationsGrouped(stations)).toThrow(/normalized station/i);
    result.elementForces[0]!.pointLoads[0]!.a = a;
    expect.soft(computeEnvelope([peak, result])!.shear.globalMax).toBe(10);
    expect.soft(extractBeamStations(stations).stations.some(s => s.t === peakT)).toBe(true);
    expect.soft(extractBeamStationsGrouped(stations).members[0]!.stations.some(s => s.t === peakT)).toBe(true);
  }
  for (const result of spatial) {
    const peak = structuredClone(result);
    peak.elementForces[0]!.distributedLoadsZ = [{ a, b, qI: q, qJ: -q }];
    result.elementForces[0]!.pointLoadsZ = [{ a: jump, p: 10 }];
    expect.soft(() => computeEnvelope3D([peak, result])).toThrow('Cannot compute the envelope: shearZ of element 1: distinct member diagram cuts share a normalized station');
    const stations = { members, combinations: [peak, result].map((results, i) => ({ comboId: i + 1, results })) };
    expect.soft(() => extractBeamStations3D(stations)).toThrow(/normalized station/i);
    expect.soft(() => extractBeamStationsGrouped3D(stations)).toThrow(/normalized station/i);
    result.elementForces[0]!.pointLoadsZ[0]!.a = a;
    expect.soft(computeEnvelope3D([peak, result])!.shearZ.globalMax).toBe(10);
    expect.soft(extractBeamStations3D(stations).stations.some(s => s.t === peakT)).toBe(true);
    expect.soft(extractBeamStationsGrouped3D(stations).members[0]!.stations.some(s => s.t === peakT)).toBe(true);
  }
});

it('#2250 refuses distinct extrema aliased within one normalized station', () => {
  const [, , [rp], [rs]] = forceRecords();
  const planar = rp!.elementForces[0]!;
  const spatial = rs!.elementForces[0]!;
  const momentInputs = (steps: number) => {
    const width = steps * Number.EPSILON;
    const leftRoot = 5 / 16, rightRoot = 7 / 16;
    const shear = leftRoot * rightRoot / width;
    const qI = -(leftRoot + rightRoot) / width ** 2;
    const qJ = (2 - leftRoot - rightRoot) / width ** 2;
    const load = { a, b: a + width, qI, qJ };
    return [
      () => computeElementDiagram('moment', { ...planar, vStart: shear, mStart: shear * a, distributedLoads: [load] }, 0, 0, length, 0),
      () => computeDiagram3D({ ...spatial, vzStart: shear, myStart: -shear * a, distributedLoadsZ: [load] }, 'momentY'),
    ];
  };
  for (const diagram of momentInputs(4)) {
    expect.soft(diagram).toThrow(/extrema/i);
  }
  for (const diagram of momentInputs(64)) {
    expect(diagram().points.filter(p => p.t > 0.5 && p.t < (a + 64 * Number.EPSILON) / length).length).toBeGreaterThanOrEqual(2);
  }
});

it.skip('known wrong result: #2226 uses the partial-load shear peak for the overlay and pointwise envelope', () => {
  const [, , planar] = forceRecords();
  for (const result of planar) {
    const start = 1 / 32, end = 1 / 16, q = 128;
    result.elementForces[0]!.distributedLoads = [{ a: start, b: end, qI: q, qJ: -q }];
    const expected = (end - start) * q / 4;
    expect.soft(computeDiagramGlobalMax(result, 'shear')).toBe(expected);
    expect.soft(computePointwiseEnvelope([result])!.shear.globalMax).toBe(expected);
  }
});

it.skip('known wrong result: #2226 folds only inward endpoint faces into spatial moving-load envelopes', () => {
  const [, , , spatial] = forceRecords();
  for (const result of spatial) {
    const ef = result.elementForces[0]!;
    ef.vzStart = 10;
    ef.vzEnd = 30;
    ef.pointLoadsZ = [{ a: 0, p: -10 }, { a: 1, p: -5 }, { a: 2, p: 7 }, { a: length, p: 28 }];
    const envelope: Parameters<typeof foldPosition>[0] = new Map();
    foldPosition(envelope, result, 4);
    const shear = envelope.get(ef.elementId)!.vz;
    expect.soft(shear.min).toEqual({ value: -5, x: 1, position: 4 });
    expect.soft(shear.max).toEqual({ value: 2, x: 2, position: 4 });
  }
});

it.skip('known wrong result: #2437 checks a point query for an extremum aliased onto its boundary', () => {
  const [, , planar, spatial] = forceRecords();
  const at = a / length;
  const loads = [{ a, b: 2.25, qI: 1, qJ: -(2 ** 54) }];
  for (const result of planar) {
    const ef = { ...result.elementForces[0]!, distributedLoads: loads };
    expect.soft(() => computeDiagramValueAtWasm('shear', at, ef)).toThrow(/extrema/i);
    expect.soft(() => computeDiagramValueAt('shear', at, ef)).toThrow(/extrema/i);
    expect.soft(() => prepareDiagramValueAt('shear', ef)(at)).toThrow(/extrema/i);
    expect.soft(computeDiagramValueAtWasm('shear', at - Number.EPSILON, ef)).toBe(0);
    expect.soft(computeDiagramValueAtWasm('shear', at, { ...ef, distributedLoads: [{ ...loads[0]!, qJ: -1 }] })).toBe(0);
  }
  for (const result of spatial) {
    const ef = { ...result.elementForces[0]!, distributedLoadsZ: loads };
    expect.soft(() => computeDiagramValueAt3DWasm('shearZ', at, ef)).toThrow(/extrema/i);
    expect.soft(() => evaluateDiagramAt(ef, 'shearZ', at)).toThrow(/extrema/i);
    expect.soft(() => prepareDiagramEvaluator3D(ef, 'shearZ')(at)).toThrow(/extrema/i);
    expect.soft(computeDiagramValueAt3DWasm('shearZ', at - Number.EPSILON, ef)).toBe(0);
    expect.soft(computeDiagramValueAt3DWasm('shearZ', at, { ...ef, distributedLoadsZ: [{ ...loads[0]!, qJ: -1 }] })).toBe(0);
  }
});

it.skip('known wrong result: #2437 reads the plotted polynomial extremum through prepared and direct queries', () => {
  const [, , planar, spatial] = forceRecords();
  const distributed = [-(2 ** 54), 2 ** 54, 1].map(q => ({ a: 0, b: 1, qI: q, qJ: q }));
  for (const result of planar) {
    const ef = { ...result.elementForces[0]!, length: 1, vStart: -0.5, distributedLoads: distributed };
    expect.soft(computeElementDiagram('moment', ef, 0, 0, 1, 0).maxValue).toBe(0.125);
    expect.soft(computeDiagramValueAt('moment', 0.5, ef)).toBe(0.125);
    expect.soft(prepareDiagramValueAt('moment', ef)(0.5)).toBe(0.125);
  }
  for (const result of spatial) {
    const ef = { ...result.elementForces[0]!, length: 1, vyStart: -0.5, distributedLoadsY: distributed };
    expect.soft(computeDiagram3D(ef, 'momentZ').maxValue).toBe(0.125);
    expect.soft(evaluateDiagramAt(ef, 'momentZ', 0.5)).toBe(0.125);
    expect.soft(prepareDiagramEvaluator3D(ef, 'momentZ')(0.5)).toBe(0.125);
  }
});

it.skip('known wrong result: #2437 retains both faces of a physically rebased piece cut', () => {
  const [, , , spatial] = forceRecords();
  for (const result of spatial) {
    const ef = result.elementForces[0]!;
    const local = { ...ef, length: 1 };
    const a = 0.24999999999999992;
    const parent = {
      ...ef, length: 3,
      pieces: [
        { x0: 0, x1: 1, forces: local },
        { x0: 1, x1: 2, forces: { ...local, pointLoadsZ: [{ a, p: 10 }] } },
        { x0: 2, x1: 3, forces: { ...local, vzStart: 10 } },
      ],
    };
    const cut = (1 + a) / 3;
    const at = prepareDiagramEvaluator3D(parent, 'shearZ');
    expect.soft(at(cut - Number.EPSILON / 4)).toBe(0);
    expect.soft(at(cut)).toBe(0);
    expect.soft(at(cut, true)).toBe(10);
    expect.soft(at(cut + Number.EPSILON / 4)).toBe(10);
    expect.soft(computeDiagram3D(parent, 'shearZ').points.filter(p => p.t === cut).map(p => p.value)).toEqual([0, 10]);
  }
});

it.skip('known wrong result: #1782 assigns the last axle to the exact spatial path endpoint', () => {
  const [, input] = cantilevers(256);
  input.nodes.set(3, { id: 3, x: 257, y: 0, z: 2 ** -22 });
  input.elements.set(2, { ...input.elements.get(1)!, id: 2, nodeI: 2, nodeJ: 3 });
  const path = buildPath3D(input, [1, 2])!;
  const last = path[1]!;
  const end = last.cumStart + last.length;
  expect(last.length).toBeGreaterThan(end - last.cumStart);
  const train = { name: 'P', axles: [{ offset: 0, weight: 10 }] };
  const loadsAt = (x: number) => trainLoads(input, path, train, x);
  expect.soft(loadsAt(end).find(l => l.type === 'pointOnElement')?.data).toMatchObject({ elementId: 2, a: last.length });
  expect.soft(loadsAt(last.cumStart + 0.5).find(l => l.type === 'pointOnElement')?.data).toMatchObject({ elementId: 2, a: 0.5 });
});
