/**
 * F.1.1: a cantilever whose free end is unbraced takes Cb = 1 in every case.
 *
 * The verification computed Cb from the diagram on cantilevers too: a 6 m IPE cantilever under a
 * tip load has a linear diagram, Cb = 1,67, and its lateral-torsional capacity rose by two thirds.
 * Whether a member reaches a free end is topology, which `memberLengths` now reads.
 */
import { describe, it, expect } from 'vitest';
import { runSteelVerification } from '../verification-service';
import { memberLengths } from '../steel/unbraced-length';
import type { AnalysisResults3D } from '../types-3d';
import type { ElementStationResult } from '../station-design-forces';
import type { StationForces } from '../station-forces';

const IPE300 = { id: 1, name: 'IPE 300', a: 53.8e-4, iy: 8356e-8, iz: 604e-8, h: 0.300, b: 0.150, tw: 0.0071, tf: 0.0107, j: 20.1e-8, shape: 'I' };
const STEEL = { id: 1, name: 'F-24', fy: 235, fu: 360, e: 200_000 };
const TS = [0, 0.25, 0.5, 0.75, 1];

function model(supportAtTip: boolean) {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }]]),
    elements: new Map<number, any>([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
    sections: new Map([[1, IPE300]]),
    materials: new Map([[1, STEEL]]),
    supports: new Map<number, any>([[1, { id: 1, nodeId: 1 }], ...(supportAtTip ? [[2, { id: 2, nodeId: 2 }]] as const : [])]),
  } as any;
}

// Tip load: hogging moment linear from −60 kN·m at the root to 0 at the tip.
const diagrams = () => new Map<number, ElementStationResult>([[1, {
  elementId: 1, length: 6, stationTs: [...TS],
  comboResults: [{ comboId: 1, comboName: '1.4D', stations: TS.map((t) => ({ t, x: 6 * t, n: 0, vy: 0, vz: 10, my: -60 * (1 - t), mz: 0, torsion: 0 }) as StationForces) }],
}]]);
const results = { displacements: [], reactions: [], elementForces: [{
  elementId: 1, length: 6, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 10, vzEnd: 10,
  mxStart: 0, mxEnd: 0, myStart: -60, myEnd: 0, mzStart: 0, mzEnd: 0,
}] } as unknown as AnalysisResults3D;

const cbOf = (v: { flexureZ: { steps: string[] } }) => parseFloat(v.flexureZ.steps.find((s) => s.includes('Cb ='))!.match(/Cb = ([\d.,]+)/)![1]!.replace(',', '.'));

describe('Cb on a cantilever', () => {
  it('reads a free end from the topology', () => {
    expect(memberLengths(model(false)).get(1)?.freeEnd).toBe(true);
    expect(memberLengths(model(true)).get(1)?.freeEnd).toBe(false);
  });

  it('is 1 at a free end, where the diagram would give 1.67', () => {
    const m = model(false);
    const [v] = runSteelVerification(results, m, undefined, diagrams(), memberLengths(m));
    expect(cbOf(v!)).toBeCloseTo(1, 6);
  });

  it('and the same member held at both ends still reads the diagram', () => {
    const m = model(true);
    const [v] = runSteelVerification(results, m, undefined, diagrams(), memberLengths(m));
    expect(cbOf(v!)).toBeGreaterThan(1.5);
  });
});
