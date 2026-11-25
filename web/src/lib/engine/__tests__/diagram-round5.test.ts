import { expect, it } from 'vitest';
import { computeDiagramValueAt, computeElementDiagram, prepareDiagramValueAt } from '../diagrams';
import { computeDiagram3D, criticalDiagramStations3D, evaluateDiagramAt, prepareDiagramEvaluator3D } from '../diagrams-3d';
import {
  computeDiagrams2D, computeDiagrams3D, computeDiagramValueAtWasm, computeDiagramValueAt3DWasm,
  computeEnvelope, computeEnvelope3D, extractBeamStations, extractBeamStations3D,
  extractBeamStationsGrouped, extractBeamStationsGrouped3D, solve, solve3D, solvePDelta, solvePDelta3D,
  solveMovingLoads as solveMovingLoadsWasm, solveMovingLoads3D as solveMovingLoads3DWasm,
} from '../wasm-solver';
import { computeDiagramGlobalMax } from '../../canvas/draw-diagrams';
import { computePointwiseEnvelope, solveMovingLoads, solveMovingLoadsAsync } from '../moving-loads';
import { buildPath3D, foldPosition, sweepMovingLoad3D, trainLoads } from '../moving-loads-3d';
import type { SolverInput } from '../types';
import { extractForcesAtStation } from '../station-forces';
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

it('known wrong result: #2226 uses the partial-load shear peak for the overlay and pointwise envelope', () => {
  const [, , planar] = forceRecords();
  for (const result of planar) {
    const start = 1 / 32, end = 1 / 16, q = 128;
    result.elementForces[0]!.distributedLoads = [{ a: start, b: end, qI: q, qJ: -q }];
    const expected = (end - start) * q / 4;
    expect.soft(computeDiagramGlobalMax(result, 'shear')).toBe(expected);
    expect.soft(computePointwiseEnvelope([result])!.shear.globalMax).toBe(expected);
  }
});

it('known wrong result: #2226 folds only inward endpoint faces into spatial moving-load envelopes', () => {
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

it('known wrong result: #2437 checks a point query for an extremum aliased onto its boundary', () => {
  const [, , planar, spatial] = forceRecords();
  const at = a / length;
  const loads = [{ a, b: 2.25, qI: 1, qJ: -(2 ** 54) }];
  for (const result of planar) {
    const ef = { ...result.elementForces[0]!, distributedLoads: loads };
    expect.soft(() => computeDiagramValueAtWasm('shear', at, ef)).toThrow('interior member diagram extremum has no distinct normalized station');
    expect.soft(() => computeDiagramValueAt('shear', at, ef)).toThrow(/extrema/i);
    expect.soft(() => prepareDiagramValueAt('shear', ef)(at)).toThrow(/extrema/i);
    expect.soft(computeDiagramValueAtWasm('shear', at - Number.EPSILON, ef)).toBe(0);
    expect.soft(computeDiagramValueAtWasm('shear', at, { ...ef, distributedLoads: [{ ...loads[0]!, qJ: -1 }] })).toBe(0);
  }
  for (const result of spatial) {
    const ef = { ...result.elementForces[0]!, distributedLoadsZ: loads };
    expect.soft(() => computeDiagramValueAt3DWasm('shearZ', at, ef)).toThrow('interior member diagram extremum has no distinct normalized station');
    expect.soft(() => evaluateDiagramAt(ef, 'shearZ', at)).toThrow(/extrema/i);
    expect.soft(() => prepareDiagramEvaluator3D(ef, 'shearZ')(at)).toThrow(/extrema/i);
    expect.soft(computeDiagramValueAt3DWasm('shearZ', at - Number.EPSILON, ef)).toBe(0);
    expect.soft(computeDiagramValueAt3DWasm('shearZ', at, { ...ef, distributedLoadsZ: [{ ...loads[0]!, qJ: -1 }] })).toBe(0);
  }
});

it('known wrong result: #2437 reads the plotted polynomial extremum through prepared and direct queries', () => {
  const [plane, space, planar, spatial] = forceRecords();
  const distributed = [-(2 ** 54), 2 ** 54, 1].map(q => ({ a: 0, b: 1, qI: q, qJ: q }));
  for (const result of planar) {
    const ef = { ...result.elementForces[0]!, length: 1, vStart: -0.5, distributedLoads: distributed };
    expect.soft(computeElementDiagram('moment', ef, 0, 0, 1, 0).maxValue).toBe(0.125);
    expect.soft(computeDiagramValueAt('moment', 0.5, ef)).toBe(0.125);
    expect.soft(computeDiagramValueAtWasm('moment', 0.5, ef)).toBe(0.125);
    expect.soft(computeDiagrams2D(plane, { ...result, elementForces: [ef] }).moment[0]!.maxValue).toBe(0.125);
    expect.soft(prepareDiagramValueAt('moment', ef)(0.5)).toBe(0.125);
  }
  for (const result of spatial) {
    const ef = { ...result.elementForces[0]!, length: 1, vyStart: -0.5, distributedLoadsY: distributed };
    expect.soft(computeDiagram3D(ef, 'momentZ').maxValue).toBe(0.125);
    expect.soft(evaluateDiagramAt(ef, 'momentZ', 0.5)).toBe(0.125);
    expect.soft(computeDiagramValueAt3DWasm('momentZ', 0.5, ef)).toBe(0.125);
    expect.soft(computeDiagrams3D(space, { ...result, elementForces: [ef] }).momentZ[0]!.maxValue).toBe(0.125);
    expect.soft(prepareDiagramEvaluator3D(ef, 'momentZ')(0.5)).toBe(0.125);
  }
});

it('known wrong result: #2437 retains both faces of a physically rebased piece cut', () => {
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

it('known wrong result: #1782 assigns the last axle to the exact spatial path endpoint', () => {
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

it('#1782 browser and WASM moving analyses apply a rounded path endpoint at the fixed node', async () => {
  const [planar, spatial] = cantilevers(256);
  const length = 1 + 2 ** -45;
  planar.nodes.set(3, { id: 3, x: 256, z: length });
  spatial.nodes.set(3, { id: 3, x: 256, y: 0, z: length });
  planar.elements.set(2, { ...planar.elements.get(1)!, id: 2, nodeI: 2, nodeJ: 3 });
  spatial.elements.set(2, { ...spatial.elements.get(1)!, id: 2, nodeI: 2, nodeJ: 3 });
  for (const nodeId of [2, 3]) {
    planar.supports.set(nodeId, { id: nodeId, type: 'fixed', nodeId });
    spatial.supports.set(nodeId, { ...spatial.supports.get(1)!, nodeId });
  }
  const weight = 100;
  const config = { train: { name: 'P', axles: [{ offset: 0, weight }] }, step: 256 + length, pathElementIds: [1, 2] };
  expect(config.step - 256).toBe(1);
  for (const result of [solveMovingLoads(planar, config), await solveMovingLoadsAsync(planar, config)]) {
    if (typeof result === 'string') throw new Error(result);
    expect(result.positions.map(position => position.refPosition)).toEqual([-0, config.step]);
    expect.soft(result.elements.get(2)).toMatchObject({ nMaxPos: 0, nMaxNeg: 0 });
  }
  const spatialSweep = await sweepMovingLoad3D(spatial, buildPath3D(spatial, [1, 2])!, config.train, { step: config.step });
  expect.soft(spatialSweep.positions).toBe(2);
  expect.soft(spatialSweep.elements.get(2)?.n).toMatchObject({ max: { value: 0 }, min: { value: 0 } });
  for (const result of [solveMovingLoadsWasm({ ...config, solver: planar }), solveMovingLoads3DWasm({ ...config, solver: spatial })]) {
    expect.soft(result.numPositions).toBe(2);
    expect.soft(result.elements['2']).toMatchObject({ nMaxPos: 0, nMaxNeg: 0 });
  }
});

it('known wrong result: #2437 carries a point jump through cancellation at an interval minimum', () => {
  const [plane, space, planar, spatial] = forceRecords();
  const scale = 2 ** 54;
  const distributed = [{ a: 0.25, b: 0.75, qI: -8 * scale, qJ: 8 * scale }];
  const point = [{ a: 0.25, p: 1 }];
  for (const result of planar) {
    const ef = Object.assign(result.elementForces[0]!, { length: 1, vStart: scale, vEnd: scale,
      distributedLoads: distributed, pointLoads: point });
    const diagram = computeElementDiagram('shear', ef, 0, 0, 1, 0);
    expect.soft(diagram.minValue).toBe(1);
    expect.soft(computeDiagramValueAt('shear', 0.5, ef)).toBe(1);
    expect.soft(prepareDiagramValueAt('shear', ef)(0.5)).toBe(1);
    expect.soft(computeDiagramValueAtWasm('shear', 0.5, ef)).toBe(1);
    expect.soft(computeDiagrams2D(plane, result).shear[0]!.minValue).toBe(1);
    expect.soft(computeDiagramValueAt('shear', 3 / 8, ef)).toBe(scale / 4 + 1);
  }
  for (const result of spatial) {
    const ef = Object.assign(result.elementForces[0]!, { length: 1, vzStart: scale, vzEnd: scale,
      distributedLoadsZ: distributed, pointLoadsZ: point });
    expect.soft(computeDiagram3D(ef, 'shearZ').minValue).toBe(1);
    expect.soft(evaluateDiagramAt(ef, 'shearZ', 0.5)).toBe(1);
    expect.soft(prepareDiagramEvaluator3D(ef, 'shearZ')(0.5)).toBe(1);
    expect.soft(computeDiagramValueAt3DWasm('shearZ', 0.5, ef)).toBe(1);
    expect.soft(computeDiagrams3D(space, result).shearZ[0]!.minValue).toBe(1);
    expect.soft(evaluateDiagramAt(ef, 'shearZ', 5 / 8)).toBe(scale / 4 + 1);
  }
});

it('known wrong result: #2437 retains signed endpoint terms through force recovery', () => {
  const [plane, space] = cantilevers(1);
  const planar = [solve(plane), solvePDelta(plane).results];
  const spatial = [solve3D(space), solvePDelta3D(space).results];
  const huge = 2 ** 54;
  const members = [{ elementId: 1, length: 1, sectionId: 1, materialId: 1 }];
  const loads = [[1, huge], [0, -huge], [0, -1]].map(([qI, qJ]) => ({ a: 0, b: 1, qI: qI!, qJ: qJ! }));
  for (const result of planar) {
    const ef = result.elementForces[0]!;
    ef.distributedLoads = loads;
    const browser = computeElementDiagram('shear', ef, 0, 0, 1, 0);
    const wasm = computeDiagrams2D(plane, result).shear[0]!;
    expect.soft(browser.maxAbsT).toBe(0.5);
    expect.soft(browser.maxValue).toBe(0.25);
    expect.soft(wasm.maxAbsT).toBe(0.5);
    expect.soft(wasm.maxValue).toBe(0.25);
    for (const [t, value] of [[0, 0], [0.25, 3 / 16], [0.5, 0.25], [0.75, 3 / 16], [1, 0]] as const) {
      expect.soft(computeDiagramValueAtWasm('shear', t, ef)).toBe(value);
      expect.soft(computeDiagramValueAt('shear', t, ef)).toBe(value);
      expect.soft(prepareDiagramValueAt('shear', ef)(t)).toBe(value);
    }
    const input = { members, combinations: [{ comboId: 1, results: result }] };
    for (const stations of [extractBeamStations(input).stations, extractBeamStationsGrouped(input).members[0]!.stations]) {
      expect.soft(stations.find(s => s.t === 0.5)?.comboForces[0]?.v).toBe(0.25);
    }
    expect.soft(computeEnvelope([result])!.shear.globalMax).toBe(0.25);
  }
  for (const result of spatial) {
    const ef = result.elementForces[0]!;
    ef.distributedLoadsZ = loads;
    for (const diagram of [computeDiagram3D(ef, 'shearZ'), computeDiagrams3D(space, result).shearZ[0]!]) {
      expect.soft(diagram.maxValue).toBe(0.25);
      expect.soft(diagram.points).toContainEqual(expect.objectContaining({ t: 0.5, value: 0.25 }));
    }
    for (const [t, value] of [[0, 0], [0.25, 3 / 16], [0.5, 0.25], [0.75, 3 / 16], [1, 0]] as const) {
      expect.soft(computeDiagramValueAt3DWasm('shearZ', t, ef)).toBe(value);
      expect.soft(evaluateDiagramAt(ef, 'shearZ', t)).toBe(value);
      expect.soft(prepareDiagramEvaluator3D(ef, 'shearZ')(t)).toBe(value);
    }
    const input = { members, combinations: [{ comboId: 1, results: result }] };
    for (const stations of [extractBeamStations3D(input).stations, extractBeamStationsGrouped3D(input).members[0]!.stations]) {
      expect.soft(stations.find(s => s.t === 0.5)?.comboForces[0]?.vz).toBe(0.25);
    }
    expect.soft(computeEnvelope3D([result])!.shearZ.globalMax).toBe(0.25);
  }
});

it('known wrong result: #2437 checks the compensated ordinate of an aliased peak', () => {
  const [plane, space, planar, spatial] = forceRecords();
  const baseline = 2 ** 54;
  const refusal = /interior member diagram extremum has no distinct normalized station/;
  const jump = { a: 1, p: 1 };
  for (const [qI, qJ, aliases] of [[2 ** 57, -(2 ** 112), true], [2 ** 56, -(2 ** 111), false]] as const) {
    const load = { a: 1.5, b: 2.25, qI, qJ };
    for (const result of planar) {
      const ef = result.elementForces[0]!;
      Object.assign(ef, { vStart: baseline, pointLoads: [jump], distributedLoads: [load] });
      expect.soft(computeDiagramValueAtWasm('shear', 0.5 - Number.EPSILON / 4, ef)).toBe(baseline);
      const query = () => computeDiagramValueAtWasm('shear', 0.5, ef);
      const diagram = () => computeDiagrams2D(plane, result).shear[0]!.maxValue;
      if (aliases) {
        expect.soft(query).toThrow(refusal);
        expect.soft(diagram).toThrow(refusal);
      } else {
        expect.soft(query()).toBe(baseline);
        expect.soft(diagram()).toBe(baseline);
      }
    }
    for (const result of spatial) {
      const ef = result.elementForces[0]!;
      Object.assign(ef, { vzStart: baseline, pointLoadsZ: [jump], distributedLoadsZ: [load] });
      expect.soft(computeDiagramValueAt3DWasm('shearZ', 0.5 - Number.EPSILON / 4, ef)).toBe(baseline);
      const query = () => computeDiagramValueAt3DWasm('shearZ', 0.5, ef);
      const diagram = () => computeDiagrams3D(space, result).shearZ[0]!.maxValue;
      if (aliases) {
        expect.soft(query).toThrow(refusal);
        expect.soft(diagram).toThrow(refusal);
      } else {
        expect.soft(query()).toBe(baseline);
        expect.soft(diagram()).toBe(baseline);
      }
    }
  }
});

it('known wrong result: #2437 selects the jump face from the supplied physical distance', () => {
  const [, , , spatial] = forceRecords();
  for (const result of spatial) {
    const parent = result.elementForces[0]!;
    const local = { ...parent, length: 1, vzStart: -4, vzEnd: 3, pointLoadsZ: [{ a: 0.25, p: 7 }] };
    const piecewise = {
      ...parent, length: 2,
      pieces: [
        { x0: 0, x1: 1, sectionId: 1, forces: { ...local, pointLoadsZ: [] } },
        { x0: 1, x1: 2, sectionId: 2, forces: local },
      ],
    };
    const abs = { ...local, combined: { method: 'abs' as const, parts: [local] } };
    for (const [ef, distance, left] of [[local, 0.25, -4], [piecewise, 1.25, -4], [abs, 0.25, 4]] as const) {
      const t = distance / ef.length;
      const prepared = prepareDiagramEvaluator3D(ef, 'shearZ');
      for (const adjacent of [t - Number.EPSILON / 8, t, t + Number.EPSILON / 2]) {
        expect.soft(evaluateDiagramAt(ef, 'shearZ', { t: adjacent, distance })).toBe(left);
        expect.soft(prepared({ t: adjacent, distance, right: true })).toBe(3);
        expect.soft(extractForcesAtStation(ef, { t: adjacent, distance }).vz).toBe(left);
      }
      expect.soft(prepared(t + Number.EPSILON / 2)).toBe(3);
    }
  }
});

it('known wrong result: #2437 keeps the sampled concrete policy for the seven-storey force record', () => {
  const [, , , [result]] = forceRecords();
  const f = {
    ...result!.elementForces[0]!, elementId: 104, length: 5,
    vzStart: 15.111138439043934, vzEnd: -20.888861560956066,
    myStart: -3.402192018069118, myEnd: -17.84649982284948,
    distributedLoadsZ: [{ a: 0, b: 5, qI: -7.199999999999999, qJ: -7.199999999999999 }],
  };
  expect(criticalDiagramStations3D(f, 'concrete-design').map(cut => cut.t)).toEqual([0, 1]);
  expect(() => criticalDiagramStations3D(f)).toThrow(/extrema/i);
  const diagram = computeDiagram3D(f, 'momentY');
  expect(diagram.maxValue).toBeGreaterThan(f.myStart);
  expect(diagram.maxValue).toBeGreaterThan(f.myEnd);
});

it('known wrong result: #2437 transfers a stationary shear only when the rounded cut agrees', () => {
  const [plane, space] = cantilevers(1);
  const d = 2 ** -53;
  const high = 2 ** 54;
  const station = 0.5 + 4 * d;
  for (const [numerator, transfers] of [[21, false], [22, true]] as const) {
    const k = numerator / (128 * d);
    const distributedLoads = [{ a: 0.5, b: 1, qI: 7 * k, qJ: 7 * k - k / d }];
    const check = (read: () => number | null) => {
      if (transfers) expect.soft(read()).toBe(high + 4);
      else expect.soft(read).toThrow(/extrema/i);
    };
    for (const result of [solve(plane), solvePDelta(plane).results]) {
      const ef = Object.assign(result.elementForces[0]!, { vStart: high, distributedLoads });
      expect.soft(computeDiagrams2D(plane, result).shear[0]!.points)
        .toContainEqual(expect.objectContaining({ t: station, value: high + 4 }));
      expect.soft(computeDiagramValueAtWasm('shear', 0.5, ef)).toBe(high);
      check(() => computeDiagramValueAtWasm('shear', station, ef));
      check(() => computeDiagramValueAt('shear', station, ef));
      check(() => prepareDiagramValueAt('shear', ef)(station));
    }
    for (const result of [solve3D(space), solvePDelta3D(space).results]) {
      const ef = Object.assign(result.elementForces[0]!, { vzStart: high, distributedLoadsZ: distributedLoads });
      expect.soft(computeDiagrams3D(space, result).shearZ[0]!.points)
        .toContainEqual(expect.objectContaining({ t: station, value: high + 4 }));
      expect.soft(computeDiagramValueAt3DWasm('shearZ', 0.5, ef)).toBe(high);
      check(() => computeDiagramValueAt3DWasm('shearZ', station, ef));
      check(() => evaluateDiagramAt(ef, 'shearZ', station));
      check(() => prepareDiagramEvaluator3D(ef, 'shearZ')(station));
    }
  }
  const distributedLoads = [{ a: 0.5, b: 1, qI: 2 ** 451, qJ: 2 ** 451 }, { a: 0.5, b: 1, qI: 0, qJ: -(2 ** 1001) }];
  const planar = { ...solve(plane).elementForces[0]!, distributedLoads };
  const spatial = { ...solve3D(space).elementForces[0]!, distributedLoadsZ: distributedLoads };
  expect.soft(() => computeDiagramValueAt('shear', 0.5, planar)).toThrow(/extrema/i);
  expect.soft(() => evaluateDiagramAt(spatial, 'shearZ', 0.5)).toThrow(/extrema/i);
});

it('known wrong result: #2437 retains a small force through two levels of cancellation', () => {
  const [plane, space] = cantilevers(1);
  const high = 2 ** 110, medium = 2 ** 54;
  const members = [{ elementId: 1, length: 1, sectionId: 1, materialId: 1 }];
  const loads = [high, medium, 1, -medium, -high].map(q => ({ a: 0, b: 1, qI: q, qJ: q }));
  for (const result of [solve(plane), solvePDelta(plane).results]) {
    const ef = Object.assign(result.elementForces[0]!, { distributedLoads: loads });
    for (const diagram of [computeElementDiagram('shear', ef, 0, 0, 1, 0), computeDiagrams2D(plane, result).shear[0]!]) {
      expect.soft(diagram.maxValue).toBe(1);
    }
    expect.soft(computeEnvelope([result])!.shear.globalMax).toBe(1);
    const input = { members, combinations: [{ comboId: 1, results: result }], numStations: 3 };
    for (const stations of [extractBeamStations(input).stations, extractBeamStationsGrouped(input).members[0]!.stations]) {
      expect.soft(stations.find(s => s.t === 0.5)?.comboForces[0]?.v).toBe(0.5);
    }
    for (const t of [0, 0.25, 0.5, 1]) {
      expect.soft(computeDiagramValueAt('shear', t, ef)).toBe(t);
      expect.soft(prepareDiagramValueAt('shear', ef)(t)).toBe(t);
      expect.soft(computeDiagramValueAtWasm('shear', t, ef)).toBe(t);
    }
  }
  for (const result of [solve3D(space), solvePDelta3D(space).results]) {
    const ef = Object.assign(result.elementForces[0]!, { distributedLoadsZ: loads });
    for (const diagram of [computeDiagram3D(ef, 'shearZ'), computeDiagrams3D(space, result).shearZ[0]!]) {
      expect.soft(diagram.maxValue).toBe(1);
    }
    expect.soft(computeEnvelope3D([result])!.shearZ.globalMax).toBe(1);
    const input = { members, combinations: [{ comboId: 1, results: result }], numStations: 3 };
    for (const stations of [extractBeamStations3D(input).stations, extractBeamStationsGrouped3D(input).members[0]!.stations]) {
      expect.soft(stations.find(s => s.t === 0.5)?.comboForces[0]?.vz).toBe(0.5);
    }
    for (const t of [0, 0.25, 0.5, 1]) {
      expect.soft(evaluateDiagramAt(ef, 'shearZ', t)).toBe(t);
      expect.soft(prepareDiagramEvaluator3D(ef, 'shearZ')(t)).toBe(t);
      expect.soft(computeDiagramValueAt3DWasm('shearZ', t, ef)).toBe(t);
    }
  }
});

it('known wrong result: #2437 keeps the physical approach side when a rebased query rounds onto a jump', () => {
  const [, space] = cantilevers(2);
  const offset = 0.25 + 2 ** -53;
  const localCut = 1.25;
  const publishedCut = offset + localCut;
  for (const result of [solve3D(space), solvePDelta3D(space).results]) {
    const leaf = result.elementForces[0]!;
    const member = { ...leaf, pieces: [
      { x0: 0, x1: offset, forces: { ...leaf, length: offset } },
      { x0: offset, x1: 2, forces: { ...leaf, length: 2 - offset, vzStart: -4, pointLoadsZ: [{ a: localCut, p: 9 }] } },
    ] };
    const direct = (station: { t: number; distance: number; right?: boolean }) => evaluateDiagramAt(member, 'shearZ', station);
    for (const read of [direct, prepareDiagramEvaluator3D(member, 'shearZ')]) {
      expect.soft(read({ t: publishedCut / 2, distance: publishedCut })).toBe(-4);
      expect.soft(read({ t: publishedCut / 2, distance: publishedCut, right: true })).toBe(5);
      const distance = 1.5 + 2 ** -52;
      expect.soft(read({ t: distance / 2, distance })).toBe(5);
      expect.soft(read({ t: distance / 2, distance, right: false })).toBe(5);
    }
    const distance = 1.5 + 2 ** -52;
    expect.soft(extractForcesAtStation(member, { t: distance / 2, distance }).vz).toBe(5);
  }
});

it('known wrong result: #2226 emits only the two faces of a jump shared with a bounded candidate', () => {
  const [, space] = cantilevers(1);
  for (const result of [solve3D(space), solvePDelta3D(space).results]) {
    const leaf = result.elementForces[0]!;
    const signed = { ...leaf, distributedLoadsZ: [{ a: 0, b: 1, qI: 4, qJ: -4 }] };
    const abs = { ...leaf, combined: { method: 'abs' as const, parts: [signed, leaf] } };
    const jump = { ...leaf, pointLoadsZ: [{ a: 0.5, p: 3 }] };
    const srss = { ...leaf, combined: { method: 'srss' as const, parts: [signed, leaf] } };
    const bounded = { ...leaf, combined: { method: 'abs' as const, parts: [srss, leaf] } };
    const member = { ...leaf, combined: { method: 'srss' as const, parts: [bounded, jump] } };
    const diagram = computeDiagram3D(member, 'shearZ');
    expect.soft(diagram.extrema).toBe('bounded');
    expect.soft(diagram.points.filter(p => p.t === 0.5).map(p => p.value)).toEqual([1, Math.hypot(1, 3)]);
    expect.soft(evaluateDiagramAt(member, 'shearZ', 0.5, true)).toBe(Math.hypot(1, 3));
    expect.soft(computeDiagram3D(abs, 'shearZ').points.filter(p => p.t === 0.5).map(p => p.value)).toEqual([1]);
  }
});

it('known wrong result: #1782 keeps a reversed axle just inside a path endpoint', async () => {
  const d = 2 ** -53;
  const start = 0.25 + 3 * d;
  const end = start + 1.5;
  const interior = 1.75 + 2 * d;
  const [plane, space] = cantilevers(start);
  plane.nodes.set(2, { id: 2, x: 0, z: start });
  plane.nodes.set(3, { id: 3, x: 1.5, z: start });
  space.nodes.set(2, { id: 2, x: 0, y: 0, z: start });
  space.nodes.set(3, { id: 3, x: 1.5, y: 0, z: start });
  plane.elements.set(2, { ...plane.elements.get(1)!, id: 2, nodeI: 3, nodeJ: 2 });
  space.elements.set(2, { ...space.elements.get(1)!, id: 2, nodeI: 3, nodeJ: 2 });
  const train = { name: 'P', axles: [{ offset: 0, weight: 8 }] };
  const config = { train, step: interior, pathElementIds: [1, 2] };
  for (const result of [solveMovingLoads(plane, config), await solveMovingLoadsAsync(plane, config)]) {
    if (typeof result === 'string') throw new Error(result);
    const ef = result.positions.find(p => p.refPosition === interior)!.results.elementForces.find(f => f.elementId === 2)!;
    expect.soft(ef.pointLoads).toEqual([expect.objectContaining({ a: d, p: 8 })]);
    expect.soft(result.fullEnvelope?.shear.elements.find(e => e.elementId === 2)?.tPositions).toContain(d / 1.5);
  }
  const path = buildPath3D(space, [1, 2])!;
  expect.soft(trainLoads(space, path, train, interior)).toContainEqual(
    expect.objectContaining({ type: 'pointOnElement', data: expect.objectContaining({ elementId: 2, a: d }) }));
  expect.soft(() => trainLoads(space, path, train, start + d / 2)).toThrow('solver.diagramExtremaUnavailable');
  expect.soft(trainLoads(space, path, train, end)).toContainEqual(
    expect.objectContaining({ type: 'pointOnElement', data: expect.objectContaining({ elementId: 2, a: 0 }) }));
  const sweep = await sweepMovingLoad3D(space, path, train, { step: interior });
  expect.soft(sweep.positions).toBe(2);
  const forces = sweep.elements.get(2)!;
  expect.soft([forces.vy.max, forces.vy.min, forces.vz.max, forces.vz.min]).toContainEqual(
    expect.objectContaining({ x: d, position: interior }));
});

it('known wrong result: #2437 keeps a small ramp peak when overlapping triangular loads cancel', () => {
  const [plane, space] = cantilevers(1);
  const high = 2 ** 54, start = 1 / high;
  const loads = [
    { a: 0, b: 1, qI: high, qJ: 0 },
    { a: 0, b: 1, qI: 0, qJ: high },
    { a: 0, b: 1, qI: -high, qJ: -high },
    { a: start, b: 1, qI: 1, qJ: -1 },
  ];
  const peak = (1 - start) / 4;
  for (const result of [solve(plane), solvePDelta(plane).results]) {
    const ef = Object.assign(result.elementForces[0]!, { vStart: 0, vEnd: 0, distributedLoads: loads });
    expect.soft(computeElementDiagram('shear', ef, 0, 0, 1, 0).maxValue).toBe(peak);
    expect.soft(computeDiagrams2D(plane, result).shear[0]!.maxValue).toBe(peak);
    expect.soft(computeEnvelope([result])!.shear.globalMax).toBe(peak);
    expect.soft(computeDiagramValueAt('shear', 0.5, ef)).toBe(peak);
    expect.soft(prepareDiagramValueAt('shear', ef)(0.5)).toBe(peak);
    expect.soft(computeDiagramValueAtWasm('shear', 0.5, ef)).toBe(peak);
  }
  for (const result of [solve3D(space), solvePDelta3D(space).results]) {
    const ef = Object.assign(result.elementForces[0]!, { vzStart: 0, vzEnd: 0, distributedLoadsZ: loads });
    expect.soft(computeDiagram3D(ef, 'shearZ').maxValue).toBe(peak);
    expect.soft(computeDiagrams3D(space, result).shearZ[0]!.maxValue).toBe(peak);
    expect.soft(computeEnvelope3D([result])!.shearZ.globalMax).toBe(peak);
    expect.soft(evaluateDiagramAt(ef, 'shearZ', 0.5)).toBe(peak);
    expect.soft(prepareDiagramEvaluator3D(ef, 'shearZ')(0.5)).toBe(peak);
    expect.soft(computeDiagramValueAt3DWasm('shearZ', 0.5, ef)).toBe(peak);
  }
});

const finalReviewReproducer = process.env.RUN_KNOWN_WRONG === '2226' ? it : it.skip;

finalReviewReproducer('known wrong result: #2226 accepts the transferable moment station of the tubular truss', () => {
  const span = 1.5620499351813308;
  const shear = 0.045069352012818566;
  const q = -0.042665245455608784;
  const mI = -0.003161256078544587;
  const moment = 0.020643206654111797;
  const [plane, space] = cantilevers(span);
  for (const result of [solve(plane), solvePDelta(plane).results]) {
    const ef = {
      ...result.elementForces[0]!, mStart: -mI, vStart: shear, distributedLoads: [{ a: 0, b: span, qI: q, qJ: q }],
    };
    const t = computeElementDiagram('moment', ef, 0, 0, span, 0).maxAbsT;
    expect.soft(() => { expect(computeDiagramValueAt('moment', t, ef)).toBe(-moment); }).not.toThrow();
    expect.soft(() => { expect(prepareDiagramValueAt('moment', ef)(t)).toBe(-moment); }).not.toThrow();
    expect.soft(computeDiagramValueAtWasm('moment', t, ef)).toBeCloseTo(-moment, 15);
  }
  for (const result of [solve3D(space), solvePDelta3D(space).results]) {
    const ef = {
      ...result.elementForces[0]!, myStart: mI, vzStart: shear, distributedLoadsZ: [{ a: 0, b: span, qI: q, qJ: q }],
    };
    const diagram = computeDiagram3D(ef, 'momentY');
    const t = diagram.points.find(p => p.value === diagram.maxAbsValue)!.t;
    expect.soft(() => criticalDiagramStations3D(ef)).not.toThrow();
    expect.soft(() => { expect(evaluateDiagramAt(ef, 'momentY', t)).toBe(moment); }).not.toThrow();
    expect.soft(() => { expect(prepareDiagramEvaluator3D(ef, 'momentY')(t)).toBe(moment); }).not.toThrow();
    expect.soft(computeDiagramValueAt3DWasm('momentY', t, ef)).toBeCloseTo(moment, 15);
  }
});
