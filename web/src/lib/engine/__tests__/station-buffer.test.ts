import { afterEach, expect, it, vi } from 'vitest';
import * as wasmSolver from '../wasm-solver';
import { computeEnvelope3D, extractBeamStationBuffer3D, extractBeamStationsGrouped3D } from '../wasm-solver';
import { decodeStationBuffer } from '../station-buffer';
import { computeStationDemands, setCompactStationTransfer } from '../verification-service';
import type { ElementForces3D, AnalysisResults3D } from '../types-3d';
import type { AutoVerifyModelData } from '../auto-verify';

function force(id: number, factor = 1): ElementForces3D {
  return { elementId: id, length: 6, nStart: -230 * factor, nEnd: -200 * factor,
    vyStart: 20 * factor, vyEnd: -30 * factor, vzStart: 40 * factor, vzEnd: -50 * factor,
    mxStart: -15 * factor, mxEnd: -15 * factor, myStart: 10 * factor, myEnd: -40 * factor,
    mzStart: -30 * factor, mzEnd: 70 * factor, qYI: -3 * factor, qYJ: -5 * factor,
    qZI: -5 * factor, qZJ: -7 * factor,
    distributedLoadsY: [{ a: 1, b: 4, qI: -2 * factor, qJ: -8 * factor }],
    distributedLoadsZ: [{ a: 2, b: 6, qI: -5 * factor, qJ: 3 * factor }],
    distributedLoadsX: [{ a: 0, b: 6, qI: 2 * factor, qJ: 8 * factor }],
    pointLoadsY: [{ a: 2.4, p: -13 * factor }], pointLoadsZ: [{ a: 3, p: 9 * factor }],
    releaseMyStart: id % 2 === 0, releaseMyEnd: false, releaseMzStart: false,
    releaseMzEnd: id % 3 === 0, releaseTStart: id % 4 === 0, releaseTEnd: false };
}
const results = (elementForces: ElementForces3D[]): AnalysisResults3D => ({ elementForces, displacements: [], reactions: [] });
const members = [3, 1, 7, 99].map(elementId => ({ elementId, length: elementId === 7 ? 7.2 : 6, sectionId: 1, materialId: 1 }));
const combinations = [
  { comboId: 8, comboName: 'Compression', results: results([force(1), force(3), force(7), force(1, 1.7)]) },
  { comboId: 2, results: results([force(7, -1), force(3, -1)]) },
  { comboId: 15, comboName: '', results: results([force(1, 0), force(3, 0)]) },
];
afterEach(() => { vi.restoreAllMocks(); setCompactStationTransfer(true); });
it.each([2, 11, 21])('matches grouped Rust forces exactly at %i stations, including missing data', numStations => {
  const grouped = extractBeamStationsGrouped3D({ members, combinations, numStations });
  const buffer = extractBeamStationBuffer3D({ members, numStations,
    combinations: combinations.map(c => ({ comboId: c.comboId, elementForces: c.results.elementForces })) });
  expect(buffer).toBeInstanceOf(Float64Array);
  const names = new Map([[8, 'Compression'], [15, '']]);
  const decoded = decodeStationBuffer(buffer!, names);
  expect(decoded.map(m => m.elementId)).toEqual(members.map(m => m.elementId));
  for (const [i, member] of grouped.members.entries()) {
    const actual = decoded[i];
    expect(actual.length).toBe(member.length);
    expect(actual.stationTs).toEqual(member.stations.map(s => s.t));
    expect(actual.comboResults.map(c => c.comboId)).toEqual(member.stations[0].comboForces.map(c => c.comboId));
    for (const combo of actual.comboResults) {
      expect(combo.comboName).toBe(names.get(combo.comboId) ?? `Combo ${combo.comboId}`);
      expect(combo.stations).toEqual(member.stations.map(s => {
        const cf = s.comboForces.find(c => c.comboId === combo.comboId)!;
        return { t: s.t, x: s.stationX, n: cf.n, vy: cf.vy, vz: cf.vz, my: cf.my, mz: cf.mz, torsion: cf.torsion };
      }));
    }
  }
});
it('preserves complete governing demands and station reports through the production service', () => {
  const model = { elements: new Map(), nodes: new Map() } as AutoVerifyModelData;
  for (const m of members) {
    model.elements.set(m.elementId, { id: m.elementId, type: 'frame', nodeI: m.elementId * 2,
      nodeJ: m.elementId * 2 + 1, sectionId: 1, materialId: 1 });
    model.nodes.set(m.elementId * 2, { id: m.elementId * 2, x: 0, y: 0, z: 0 });
    model.nodes.set(m.elementId * 2 + 1, { id: m.elementId * 2 + 1, x: m.length, y: 0, z: 0 });
  }
  const partial = new Map(combinations.map(c => [c.comboId, c.results]));
  const names = combinations.map(c => ({ id: c.comboId, name: c.comboName ?? `Combo ${c.comboId}`, factors: [] }));
  for (const compact of [false, true]) {
    setCompactStationTransfer(compact);
    expect(() => computeStationDemands(partial, names, model)).toThrow(/complete|combination/i);
  }
  const perCombo = new Map(combinations.map((c, i) => [c.comboId, results(members.map(m =>
    c.results.elementForces.find(e => e.elementId === m.elementId) ?? force(m.elementId, i)))]));
  setCompactStationTransfer(false);
  const reference = computeStationDemands(perCombo, names, model);
  setCompactStationTransfer(true);
  expect(computeStationDemands(perCombo, names, model)).toEqual(reference);
});
it('handles empty members, no combinations, and the minimum station count', () => {
  expect(decodeStationBuffer(extractBeamStationBuffer3D({ members: [], combinations: [], numStations: 11 })!, new Map())).toEqual([]);
  const missing = extractBeamStationBuffer3D({ members, combinations: [], numStations: 0 });
  expect(decodeStationBuffer(missing!, new Map())).toEqual(members.map(m => ({
    elementId: m.elementId, length: m.length, stationTs: [0, 1], comboResults: [],
  })));
});
it('rejects malformed input and damaged or unsupported buffers', () => {
  expect(() => extractBeamStationBuffer3D({ members, numStations: -1, combinations: [] })).toThrow();
  for (const data of [[], [2, 0, 11], [1, -1, 11], [1, 0, 1], [1, 1, 11], [1, 0, 11, 99]]) {
    expect(() => decodeStationBuffer(Float64Array.from(data), new Map())).toThrow();
  }
});

it('falls back only when the compact export is unavailable, and propagates real errors', () => {
  const model = {
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }]]),
  } as AutoVerifyModelData;
  const perCombo = new Map([[8, results([force(1)])]]);
  const active = [{ id: 8, name: 'Compression', factors: [] }];
  setCompactStationTransfer(false);
  const reference = computeStationDemands(perCombo, active, model);
  setCompactStationTransfer(true);
  const compact = vi.spyOn(wasmSolver, 'extractBeamStationBuffer3D').mockReturnValue(null);
  const grouped = vi.spyOn(wasmSolver, 'extractBeamStationsGrouped3D');
  expect(computeStationDemands(perCombo, active, model)).toEqual(reference);
  expect(grouped).toHaveBeenCalledTimes(1);
  compact.mockImplementation(() => { throw new Error('station extraction failed'); });
  expect(() => computeStationDemands(perCombo, active, model)).toThrow('station extraction failed');
  expect(grouped).toHaveBeenCalledTimes(1);
});

it('#2250 both production design station transfers retain the concurrent tuple at the partial-load peak', () => {
  const length = 100;
  const ef = {
    ...force(1, 0), length,
    distributedLoadsX: [], distributedLoadsY: [],
    distributedLoadsZ: [{ a: 1, b: 2, qI: 1, qJ: -1 }], pointLoadsY: [], pointLoadsZ: [],
  };
  const model = {
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: length, y: 0, z: 0 }]]),
  } as AutoVerifyModelData;
  const combinations = [{ id: 1, name: 'U', factors: [] }];
  for (const compact of [false, true]) {
    setCompactStationTransfer(compact);
    const { stations } = computeStationDemands(new Map([[1, results([ef])]]), combinations, model);
    const values = stations.get(1)!.comboResults[0]!.stations;
    const peak = values.reduce((a, b) => a.vz > b.vz ? a : b);
    expect(peak.t).toBeCloseTo(1.5 / length, 12);
    expect(peak.vz).toBeCloseTo(0.25, 12);
    expect(peak.my).toBeCloseTo(1 / 12, 12);
  }
});

const round3 = process.env.RUN_KNOWN_WRONG === '2403' ? it : it.skip;

round3('refuses variable member envelopes whose shared piece IDs represent different cuts', () => {
  const displacement = (nodeId: number) => ({ nodeId, ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 });
  const plain = { ...force(1, 0), length: 10, distributedLoadsX: [], distributedLoadsY: [], distributedLoadsZ: [],
    pointLoadsY: [], pointLoadsZ: [] };
  const split = (cut: number, shear: number): AnalysisResults3D => ({
    ...results([{ ...plain, pieces: [
      { x0: 0, x1: cut, sectionId: 1, dI: displacement(1), dJ: displacement(3), forces: {
        ...plain, elementId: 2, length: cut, vzStart: shear, vzEnd: shear,
      } },
      { x0: cut, x1: plain.length, sectionId: 2, dI: displacement(3), dJ: displacement(2), forces: {
        ...plain, elementId: 3, length: plain.length - cut,
      } },
    ] }]), displacements: [displacement(1), displacement(2)],
  });
  for (const layouts of [[split(4, 0), split(6, 40)], [split(6, 40), split(4, 0)]]) {
    expect.soft(() => computeEnvelope3D(layouts)).toThrow(/extrema/i);
  }
  const first = split(4, 0), second = split(4, 40);
  const envelope = computeEnvelope3D([first, second])?.shearZ.elements.find(e => e.elementId === 1);
  expect(envelope?.tPositions.filter((t, i) => t === 0.4 && envelope.posValues[i] === 40)).toHaveLength(1);
});
