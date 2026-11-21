import { expect, it } from 'vitest';
import { computeDiagramValueAt, computeElementDiagram } from '../diagrams';
import { computeDiagram3D, evaluateDiagramAt } from '../diagrams-3d';
import {
  computeDiagrams2D, computeDiagrams3D, computeDiagramValueAtWasm, computeDiagramValueAt3DWasm,
  computeEnvelope, computeEnvelope3D, solve, solve3D, solvePDelta, solvePDelta3D,
} from '../wasm-solver';
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
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [],
  };
  const spatial: SolverInput3D = {
    materials: planar.materials,
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]),
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

it.skip('known wrong result: #2250 — refuses a point query at a peak whose ordinate cannot transfer', () => {
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
    ef.distributedLoads = [{ a, b: 2.25, qI: 4, qJ: -4 }];
    expect.soft(computeDiagramValueAtWasm('shear', 0.625, ef)).toBe(0.75);
    expect.soft(computeDiagramValueAt('shear', 0.625, ef)).toBe(0.75);
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

it.skip('known wrong result: #2226 — refuses an envelope that aliases an extremum with another case’s jump', () => {
  const [, , planar, spatial] = forceRecords();
  const jump = peakT * length;
  for (const result of planar) {
    const peak = structuredClone(result);
    peak.elementForces[0]!.distributedLoads = [{ a, b, qI: q, qJ: -q }];
    result.elementForces[0]!.pointLoads = [{ a: jump, p: 10 }];
    expect.soft(() => computeEnvelope([peak, result])).toThrow(/extrema/i);
    result.elementForces[0]!.pointLoads[0]!.a = a;
    expect.soft(computeEnvelope([peak, result])!.shear.globalMax).toBe(10);
  }
  for (const result of spatial) {
    const peak = structuredClone(result);
    peak.elementForces[0]!.distributedLoadsZ = [{ a, b, qI: q, qJ: -q }];
    result.elementForces[0]!.pointLoadsZ = [{ a: jump, p: 10 }];
    expect.soft(() => computeEnvelope3D([peak, result])).toThrow(/extrema/i);
    result.elementForces[0]!.pointLoadsZ[0]!.a = a;
    expect.soft(computeEnvelope3D([peak, result])!.shearZ.globalMax).toBe(10);
  }
});

it.skip('known wrong result: #2250 — refuses distinct extrema aliased within one normalized station', () => {
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
