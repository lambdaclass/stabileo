import { expect, it } from 'vitest';
import { computeDiagramValueAt, computeElementDiagram, prepareDiagramValueAt } from '../diagrams';
import { computeDiagram3D, evaluateDiagramAt, prepareDiagramEvaluator3D, memberCriticalOrdinates3D } from '../diagrams-3d';
import {
  computeDiagrams2D, computeDiagrams3D, computeDiagramValueAtWasm, computeDiagramValueAt3DWasm,
  computeEnvelope, computeEnvelope3D, extractBeamStations, extractBeamStations3D,
  extractBeamStationsGrouped, extractBeamStationsGrouped3D, extractBeamStationBuffer3D, solve, solve3D, solvePDelta, solvePDelta3D,
  solveMovingLoads as solveMovingLoadsWasm, solveMovingLoads3D as solveMovingLoads3DWasm,
} from '../wasm-solver';
import { decodeStationBuffer } from '../station-buffer';
import { forceTable3D } from '../report/calc-report-extra';
import { computeDiagramGlobalMax } from '../../canvas/draw-diagrams';
import { computePointwiseEnvelope, solveMovingLoads, solveMovingLoadsAsync } from '../moving-loads';
import { buildPath3D, foldPosition, sweepMovingLoad3D, trainLoads } from '../moving-loads-3d';
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

function forceRecords(memberLength = length) {
  const [plane, space] = cantilevers(memberLength);
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

it('known wrong result: #2437 keeps small planar couples and spatial forces through baseline cancellation', () => {
  const [, , planar, spatial] = forceRecords();
  const big = 2 ** 54;
  for (const result of planar) {
    const base = { ...result.elementForces[0]!, length: 2, mStart: big, vStart: big };
    for (const pointLoads of [
      [{ a: 0.5, p: 0, my: 1 }],
      [{ a: 0.25, p: 0, my: big }, { a: 0.5, p: 0, my: 1 }, { a: 0.75, p: 0, my: -big }],
    ]) {
      const ef = { ...base, pointLoads };
      expect.soft(computeDiagramValueAt('moment', 0.5, ef)).toBe(1);
      expect.soft(prepareDiagramValueAt('moment', ef)(0.5)).toBe(1);
      expect.soft(computeElementDiagram('moment', ef, 0, 0, 2, 0).points.find(p => p.t === 0.5)?.value).toBe(1);
      expect.soft(computeDiagramValueAtWasm('moment', 0.5, ef)).toBe(1);
    }
    expect.soft(computeDiagramValueAt('moment', 0.5, base)).toBe(0);
  }
  for (const result of spatial) {
    const base = { ...result.elementForces[0]!, length: 2, myStart: big, vzStart: -big };
    for (const pointLoadsZ of [
      [{ a: 0.5, p: 2 }],
      [{ a: 0, p: big }, { a: 0.5, p: 2 }, { a: 0.75, p: -4 * big }],
    ]) {
      const ef = { ...base, pointLoadsZ };
      expect.soft(evaluateDiagramAt(ef, 'momentY', 0.5)).toBe(1);
      expect.soft(prepareDiagramEvaluator3D(ef, 'momentY')(0.5)).toBe(1);
      expect.soft(computeDiagram3D(ef, 'momentY').points.find(p => p.t === 0.5)?.value).toBe(1);
      expect.soft(computeDiagramValueAt3DWasm('momentY', 0.5, ef)).toBe(1);
    }
    expect.soft(evaluateDiagramAt(base, 'momentY', 0.5)).toBe(0);
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
    const cut = 0.41666666666666663;
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


it('known wrong result: #2437 preserves nested cancellation in signed diagram ordinates', () => {
  const [plane, space, planar, spatial] = forceRecords();
  const large = 2 ** 108, small = 2 ** 54;
  const half = Number.EPSILON / 2, tail = 2 ** -108;
  for (const [terms, expected] of [
    [[large, small, 1, -small, -1, -large], 0],
    [[large, small, 1, -small, 1, -large], 2],
    [[1, half, -tail], 1],
    [[1, half], 1],
    [[1, half, tail], 1 + Number.EPSILON],
  ] as const) {
    for (const result of planar) {
      const ef = result.elementForces[0]!;
      ef.pointLoads = terms.map((my, i) => ({ a: (i + 1) / 8, p: 0, my }));
      expect.soft(computeDiagramValueAt('moment', 0.5, ef)).toBe(expected);
      expect.soft(prepareDiagramValueAt('moment', ef)(0.5)).toBe(expected);
      expect.soft(computeElementDiagram('moment', ef, 0, 0, 3, 0).points.find(p => p.t === 0.5)?.value).toBe(expected);
      expect.soft(computeDiagramValueAtWasm('moment', 0.5, ef)).toBe(expected);
      expect.soft(computeDiagrams2D(plane, result).moment[0]!.points.find((p: { t: number }) => p.t === 0.5)?.value).toBe(expected);
      const envelope = computeEnvelope([result])!.moment.elements[0]!;
      const i = envelope.tPositions.indexOf(0.5);
      expect.soft([envelope.negValues[i], envelope.posValues[i]]).toEqual([0, expected]);
    }
    for (const result of spatial) {
      const ef = result.elementForces[0]!;
      ef.pointLoadsZ = terms.map((moment, i) => {
        const arm = 2 ** -i;
        return { a: 1.5 - arm, p: moment / arm };
      });
      expect.soft(evaluateDiagramAt(ef, 'momentY', 0.5)).toBe(expected);
      expect.soft(prepareDiagramEvaluator3D(ef, 'momentY')(0.5)).toBe(expected);
      expect.soft(computeDiagram3D(ef, 'momentY').points.find(p => p.t === 0.5)?.value).toBe(expected);
      expect.soft(computeDiagramValueAt3DWasm('momentY', 0.5, ef)).toBe(expected);
      expect.soft(computeDiagrams3D(space, result).momentY[0]!.points.find((p: { t: number }) => p.t === 0.5)?.value).toBe(expected);
      const envelope = computeEnvelope3D([result])!.momentY.elements[0]!;
      const i = envelope.tPositions.indexOf(0.5);
      expect.soft([envelope.negValues[i], envelope.posValues[i]]).toEqual([0, expected]);
    }
  }
});

it('known wrong result: #2437 evaluates ordinary piece queries at the physical parent distance', () => {
  const [, , , spatial] = forceRecords();
  const q = 2 ** 54;
  for (const result of spatial) {
    const ef = result.elementForces[0]!;
    const local = { ...ef, length: 1 };
    const parent = {
      ...ef,
      pieces: [
        { x0: 0, x1: 1, forces: local },
        { x0: 1, x1: 2, forces: { ...local, vzStart: 4 - q / 2, distributedLoadsZ: [{ a: 0, b: 1, qI: q, qJ: q }] } },
        { x0: 2, x1: 3, forces: local },
      ],
    };
    const at = prepareDiagramEvaluator3D(parent, 'shearZ');
    for (const [t, expected] of [[0.5 - 2 ** -54, 1], [0.5, 4], [0.5 + 2 ** -53, 10]] as const) {
      expect.soft(evaluateDiagramAt(parent, 'shearZ', t)).toBe(expected);
      expect.soft(at(t)).toBe(expected);
    }
    expect.soft(computeDiagram3D(parent, 'shearZ').points.find(p => p.t === 0.5)?.value).toBe(4);
    expect.soft(at(1 / 3)).toBe(0);
    expect.soft(at(1 / 3, true)).toBe(4 - q / 2);
    expect.soft(at(2 / 3)).toBe(4 + q / 2);
    expect.soft(at(2 / 3, true)).toBe(0);
  }
});

it('known wrong result: #2437 refuses a physical root that rounds to a load boundary', () => {
  const [, , planar, spatial] = forceRecords();
  const q = 2 ** 50;
  const load = { a: 1.5, b: 1.5 + 1 / q, qI: 9 * q, qJ: -41 * q };
  for (const result of planar) {
    const ef = result.elementForces[0]!;
    ef.distributedLoads = [load];
    expect.soft(() => computeDiagramValueAt('shear', 0.5, ef)).toThrow(/extrema/i);
    expect.soft(() => prepareDiagramValueAt('shear', ef)(0.5)).toThrow(/extrema/i);
    expect.soft(() => computeElementDiagram('shear', ef, 0, 0, length, 0)).toThrow(/extrema/i);
    expect.soft(() => computeDiagramValueAtWasm('shear', 0.5, ef)).toThrow(/relative geometry limit/);
    expect.soft(computeDiagramValueAt('shear', 0.5 - 2 ** -54, ef)).toBe(0);
    ef.distributedLoads = [{ a: 1.5, b: 2.25, qI: 4, qJ: -4 }];
    expect.soft(computeDiagramValueAt('shear', 0.625, ef)).toBe(0.75);
    expect.soft(computeDiagramValueAtWasm('shear', 0.625, ef)).toBe(0.75);
  }
  for (const result of spatial) {
    const ef = result.elementForces[0]!;
    ef.distributedLoadsZ = [load];
    expect.soft(() => evaluateDiagramAt(ef, 'shearZ', 0.5)).toThrow(/extrema/i);
    expect.soft(() => prepareDiagramEvaluator3D(ef, 'shearZ')(0.5, true)).toThrow(/extrema/i);
    expect.soft(() => computeDiagram3D(ef, 'shearZ')).toThrow(/extrema/i);
    expect.soft(() => memberCriticalOrdinates3D(ef, 'shearZ')).toThrow(/extrema/i);
    expect.soft(() => computeDiagramValueAt3DWasm('shearZ', 0.5, ef)).toThrow(/relative geometry limit/);
    expect.soft(evaluateDiagramAt(ef, 'shearZ', 0.5 - 2 ** -54)).toBe(0);
    ef.distributedLoadsZ = [{ a: 1.5, b: 2.25, qI: 4, qJ: -4 }];
    expect.soft(evaluateDiagramAt(ef, 'shearZ', 0.625)).toBe(0.75);
    expect.soft(computeDiagramValueAt3DWasm('shearZ', 0.625, ef)).toBe(0.75);
  }
});

it('known wrong result: #2437 preserves the point-force lever residual in browser and WASM moments', () => {
  const [plane, space, planar, spatial] = forceRecords(2);
  const p = 2 ** 54;
  const start = -3 * (p / 4);
  const members = [{ elementId: 1, length: 2, sectionId: 1, materialId: 1 }];
  const numStations = 3;
  for (const [a, expected] of [[0.25, 0], [0.25 + 2 ** -54, -1], [0.25 - 2 ** -54, 1]] as const) {
    for (const result of planar) {
      const ef = result.elementForces[0]!;
      ef.mStart = start;
      ef.pointLoads = [{ a, p: -p }];
      expect.soft(computeDiagramValueAt('moment', 0.5, ef)).toBe(expected);
      expect.soft(prepareDiagramValueAt('moment', ef)(0.5)).toBe(expected);
      expect.soft(computeElementDiagram('moment', ef, 0, 0, 2, 0).points.find(p => p.t === 0.5)?.value).toBe(expected);
      expect.soft(computeDiagramValueAtWasm('moment', 0.5, ef)).toBe(expected);
      expect.soft(computeDiagrams2D(plane, result).moment[0]!.points.find((p: { t: number }) => p.t === 0.5)?.value).toBe(expected);
      const input = { members, numStations, combinations: [{ comboId: 1, results: result }] };
      expect.soft(extractBeamStations(input).stations.find(s => s.t === 0.5)?.comboForces[0]?.m).toBe(expected);
      expect.soft(extractBeamStationsGrouped(input).members[0]?.stations.find(s => s.t === 0.5)?.comboForces[0]?.m).toBe(expected);
      const envelope = computeEnvelope([result])!.moment.elements[0]!;
      const i = envelope.tPositions.indexOf(0.5);
      expect.soft([envelope.negValues[i], envelope.posValues[i]]).toEqual([Math.min(0, expected), Math.max(0, expected)]);
    }
    for (const result of spatial) {
      const ef = result.elementForces[0]!;
      ef.myStart = start;
      ef.pointLoadsZ = [{ a, p }];
      expect.soft(evaluateDiagramAt(ef, 'momentY', 0.5)).toBe(expected);
      expect.soft(prepareDiagramEvaluator3D(ef, 'momentY')(0.5)).toBe(expected);
      expect.soft(computeDiagram3D(ef, 'momentY').points.find(p => p.t === 0.5)?.value).toBe(expected);
      expect.soft(computeDiagramValueAt3DWasm('momentY', 0.5, ef)).toBe(expected);
      expect.soft(computeDiagrams3D(space, result).momentY[0]!.points.find((p: { t: number }) => p.t === 0.5)?.value).toBe(expected);
      const input = { members, numStations, combinations: [{ comboId: 1, results: result }] };
      expect.soft(extractBeamStations3D(input).stations.find(s => s.t === 0.5)?.comboForces[0]?.my).toBe(expected);
      expect.soft(extractBeamStationsGrouped3D(input).members[0]?.stations.find(s => s.t === 0.5)?.comboForces[0]?.my).toBe(expected);
      const packed = extractBeamStationBuffer3D({
        members, numStations, combinations: [{ comboId: 1, elementForces: result.elementForces }],
      });
      expect.soft(decodeStationBuffer(packed!, new Map())[0]?.comboResults[0]?.stations.find(s => s.t === 0.5)?.my).toBe(expected);
      const envelope = computeEnvelope3D([result])!.momentY.elements[0]!;
      const i = envelope.tPositions.indexOf(0.5);
      expect.soft([envelope.negValues[i], envelope.posValues[i]]).toEqual([Math.min(0, expected), Math.max(0, expected)]);
    }
  }
});

it('known wrong result: #2437 evaluates the adjacent point force at the product distance', () => {
  const [, , planar, spatial] = forceRecords(3);
  const p = 2 ** 54;
  const boundary = 1 / 3;
  for (const [t, expected, linearMoment] of [[boundary - 2 ** -54, 0, -4], [boundary, 0, -1], [boundary + 2 ** -54, 2, 2]] as const) {
    for (const result of planar) {
      const ef = result.elementForces[0]!;
      ef.pointLoads = [{ a: 1, p: -p }];
      expect.soft(computeDiagramValueAt('moment', t, ef)).toBe(expected);
      expect.soft(prepareDiagramValueAt('moment', ef)(t)).toBe(expected);
      expect.soft(computeDiagramValueAtWasm('moment', t, ef)).toBe(expected);
      const affine = { ...ef, pointLoads: [], mStart: -p, vStart: -p };
      expect.soft(computeDiagramValueAt('moment', t, affine)).toBe(linearMoment);
      expect.soft(computeDiagramValueAtWasm('moment', t, affine)).toBe(linearMoment);
    }
    for (const result of spatial) {
      const ef = result.elementForces[0]!;
      ef.pointLoadsZ = [{ a: 1, p }];
      expect.soft(evaluateDiagramAt(ef, 'momentY', t)).toBe(expected);
      expect.soft(prepareDiagramEvaluator3D(ef, 'momentY')(t, true)).toBe(expected);
      expect.soft(computeDiagramValueAt3DWasm('momentY', t, ef)).toBe(expected);
      const affine = { ...ef, pointLoadsZ: [], myStart: -p, vzStart: p };
      expect.soft(evaluateDiagramAt(affine, 'momentY', t)).toBe(linearMoment);
      expect.soft(computeDiagramValueAt3DWasm('momentY', t, affine)).toBe(linearMoment);
    }
  }
});

it('known wrong result: #2437 accumulates the non-power-of-two point-force product error', () => {
  const [plane, space, planar, spatial] = forceRecords(2);
  const p = 2 ** 54 + 4;
  const m = 3 * 2 ** 52 + 4;
  const members = [{ elementId: 1, length: 2, sectionId: 1, materialId: 1 }];
  const numStations = 3;
  for (const [a, expected] of [[0.25, -1], [0.5, p / 2 - m]] as const) {
    for (const result of planar) {
      const ef = result.elementForces[0]!;
      ef.mStart = -m;
      ef.pointLoads = [{ a, p: -p }];
      expect.soft(computeDiagramValueAt('moment', 0.5, ef)).toBe(expected);
      expect.soft(prepareDiagramValueAt('moment', ef)(0.5)).toBe(expected);
      expect.soft(computeElementDiagram('moment', ef, 0, 0, 2, 0).points.find(point => point.t === 0.5)?.value).toBe(expected);
      expect.soft(computeDiagramValueAtWasm('moment', 0.5, ef)).toBe(expected);
      expect.soft(computeDiagrams2D(plane, result).moment[0]!.points.find((point: { t: number }) => point.t === 0.5)?.value).toBe(expected);
      const diagram = computeEnvelope([result])!.moment.elements[0]!;
      const request = { members, numStations, combinations: [{ comboId: 1, results: result }] };
      expect.soft(extractBeamStations(request).stations.find(s => s.t === 0.5)?.comboForces[0]?.m).toBe(expected);
      expect.soft(extractBeamStationsGrouped(request).members[0]?.stations.find(s => s.t === 0.5)?.comboForces[0]?.m).toBe(expected);
      expect.soft(diagram.negValues[diagram.tPositions.indexOf(0.5)]).toBe(expected);
    }
    for (const result of spatial) {
      const ef = result.elementForces[0]!;
      ef.myStart = -m;
      ef.pointLoadsZ = [{ a, p }];
      expect.soft(evaluateDiagramAt(ef, 'momentY', 0.5)).toBe(expected);
      expect.soft(prepareDiagramEvaluator3D(ef, 'momentY')(0.5)).toBe(expected);
      expect.soft(computeDiagram3D(ef, 'momentY').points.find(point => point.t === 0.5)?.value).toBe(expected);
      expect.soft(computeDiagramValueAt3DWasm('momentY', 0.5, ef)).toBe(expected);
      expect.soft(computeDiagrams3D(space, result).momentY[0]!.points.find((point: { t: number }) => point.t === 0.5)?.value).toBe(expected);
      const diagram = computeEnvelope3D([result])!.momentY.elements[0]!;
      const request = { members, numStations, combinations: [{ comboId: 1, results: result }] };
      expect.soft(extractBeamStations3D(request).stations.find(s => s.t === 0.5)?.comboForces[0]?.my).toBe(expected);
      expect.soft(extractBeamStationsGrouped3D(request).members[0]?.stations.find(s => s.t === 0.5)?.comboForces[0]?.my).toBe(expected);
      const packed = extractBeamStationBuffer3D({
        members, numStations, combinations: [{ comboId: 1, elementForces: result.elementForces }],
      });
      expect.soft(decodeStationBuffer(packed!, new Map())[0]?.comboResults[0]?.stations.find(s => s.t === 0.5)?.my).toBe(expected);
      expect.soft(diagram.negValues[diagram.tPositions.indexOf(0.5)]).toBe(expected);
    }
  }
});

it('known wrong result: #2437 integrates distributed actions at the physical WASM envelope cut', () => {
  const [, , planar, spatial] = forceRecords(2);
  const q = 2 ** 54;
  const uniform = { a: 0, b: 2, qI: q, qJ: q };
  const t = 1.25 / 2;
  for (const sign of [-1, 1]) {
    const momentLoad = { a: 1, b: 1.5, qI: 1, qJ: 1 };
    const startShear = -0.25 - sign / q;
    const ramp = { a: 1, b: 1.5, qI: 1, qJ: -1 + sign * 2 ** -51 };
    for (const result of planar) {
      const peak = structuredClone(result);
      peak.elementForces[0]!.distributedLoads = [ramp];
      result.elementForces[0]!.distributedLoads = [uniform];
      result.elementForces[0]!.vStart = -1.25 * q;
      const diagram = computeEnvelope([peak, result])!.shear.elements[0]!;
      const i = diagram.tPositions.indexOf(t);
      expect.soft(sign < 0 ? diagram.negValues[i] : diagram.posValues[i]).toBe(sign);
      peak.elementForces[0]!.distributedLoads = [momentLoad];
      peak.elementForces[0]!.vStart = startShear;
      peak.elementForces[0]!.mStart = 0;
      result.elementForces[0]!.vStart = 0;
      result.elementForces[0]!.mStart = (25 / 32) * q;
      const moment = computeEnvelope([peak, result])!.moment.elements[0]!;
      const at = moment.tPositions.indexOf(t);
      expect.soft(sign < 0 ? moment.posValues[at] : moment.negValues[at]).toBe(-sign * 1.25);
    }
    for (const result of spatial) {
      const peak = structuredClone(result);
      peak.elementForces[0]!.distributedLoadsZ = [ramp];
      result.elementForces[0]!.distributedLoadsZ = [uniform];
      result.elementForces[0]!.vzStart = -1.25 * q;
      const diagram = computeEnvelope3D([peak, result])!.shearZ.elements[0]!;
      const i = diagram.tPositions.indexOf(t);
      expect.soft(sign < 0 ? diagram.negValues[i] : diagram.posValues[i]).toBe(sign);
      peak.elementForces[0]!.distributedLoadsZ = [momentLoad];
      peak.elementForces[0]!.vzStart = startShear;
      peak.elementForces[0]!.myStart = 0;
      result.elementForces[0]!.vzStart = 0;
      result.elementForces[0]!.myStart = -(25 / 32) * q;
      const moment = computeEnvelope3D([peak, result])!.momentY.elements[0]!;
      const at = moment.tPositions.indexOf(t);
      expect.soft(sign < 0 ? moment.negValues[at] : moment.posValues[at]).toBe(sign * 1.25);
      const physical = { t, distance: { x: 1.25, residual: sign / q } };
      expect.soft(evaluateDiagramAt(result.elementForces[0]!, 'momentY', physical)).toBe(sign * 1.25);
    }
  }
});

it('known wrong result: #2226 reports the physical location of a spatial stationary shear', () => {
  const [, , , spatial] = forceRecords(7);
  const x = 29 / 16;
  const value = 25 / 32;
  expect(x / 7 * 7).not.toBe(x);
  for (const result of spatial) {
    const ef = result.elementForces[0]!;
    ef.distributedLoadsZ = [{ a: 1.5, b: 2, qI: 5, qJ: -3 }];
    expect.soft(computeDiagram3D(ef, 'shearZ')).toMatchObject({ maxAbsX: x, maxAbsValue: value });
    expect.soft(memberCriticalOrdinates3D(ef, 'shearZ').find(point => point.value === value)?.x).toBe(x);
    const envelope: Parameters<typeof foldPosition>[0] = new Map();
    foldPosition(envelope, result, 4);
    expect.soft(envelope.get(ef.elementId)?.vz.max).toEqual({ value, x, position: 4 });
    expect.soft(forceTable3D('shear', result, String, 'kN', String, 'm')).toContain('0.78125 (x = 1.8125 m)');
    const wasm = computeEnvelope3D([result])!;
    expect.soft(forceTable3D('shear', result, String, 'kN', String, 'm', wasm)).toContain('0.78125 (x = 1.8125 m)');
  }
});
