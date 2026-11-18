import { expect, it } from 'vitest';
import { floorLoad, physicalFloorLoad, type FloorLoadInput } from '../floor-loads';
import { bay } from './gravity-regions-fixture';


function zone(x0: number, x1: number, y0: number, y1: number): FloorLoadInput['zone'] {
  return { outer: [[x0, y0, 3], [x1, y0, 3], [x1, y1, 3], [x0, y1, 3]] };
}

const { model } = bay(0);
const base = {
  nodes: model.nodes,
  beams: [...model.elements.values()].map(beam => ({ ...beam, type: 'frame' as const })),
  q: 1,
};

it('#2201 eccentric two-way zone refuses every load in the definition', () => {
  for (const calculate of [floorLoad, physicalFloorLoad]) {
    const result = calculate({ ...base, distribution: 'twoWay', zone: zone(0, 1, 0, 6) });
    expect(result).toMatchObject({ refusal: 'eccentricZone', loads: [], nodal: [], totalKN: 0 });
  }
});

it('#2201 a concentric one-way patch applies equal line reactions at the actual stations', () => {
  for (const calculate of [floorLoad, physicalFloorLoad]) {
    const result = calculate({ ...base, distribution: 'oneWay', spanAxis: 'y', zone: zone(2, 8, 2, 4) });
    expect(result.nodal).toEqual([]);
    expect(result.loadedArea).toBeCloseTo(12, 10);
    expect(result.loads).toHaveLength(2);
    for (const [i, load] of result.loads.entries()) {
      expect(load.elementId).toBe(i + 1);
      expect(load.a).toBeCloseTo(2, 10);
      expect(load.b).toBeCloseTo(8, 10);
      expect(load.qZI).toBeCloseTo(-1, 10);
      expect(load.qZJ).toBeCloseTo(-1, 10);
    }
  }
});

it('a one-way patch that spans the carriers retains the application interval', () => {
  const result = floorLoad({ ...base, distribution: 'oneWay', spanAxis: 'y', zone: zone(2, 8, 0, 6) });
  expect(result.loads).toHaveLength(2);
  expect(result.totalKN).toBeCloseTo(36, 10);
});

it('#2201 a symmetric two-way zone loads its internal carrier and an offset zone refuses', () => {
  const nodes = new Map([
    [1, { x: 0, y: 0, z: 3 }], [2, { x: 5, y: 0, z: 3 }], [3, { x: 10, y: 0, z: 3 }],
    [4, { x: 0, y: 6, z: 3 }], [5, { x: 5, y: 6, z: 3 }], [6, { x: 10, y: 6, z: 3 }],
  ]);
  const beams = [[1, 2], [2, 3], [3, 6], [6, 5], [5, 4], [4, 1], [2, 5]].map(([nodeI, nodeJ], i) => ({
    id: i + 1, nodeI: nodeI!, nodeJ: nodeJ!, type: 'frame' as const, sectionId: 1,
  }));
  const load = (x0: number, x1: number) => floorLoad({ nodes, beams, distribution: 'twoWay', q: 1, zone: zone(x0, x1, 2, 4) });
  const centered = load(4, 6);
  expect(centered.refusal).toBeUndefined();
  expect(centered.totalKN).toBeCloseTo(4, 10);
  expect(centered.nodal).toEqual([]);
  expect(new Set(centered.loads.map(line => line.elementId))).toEqual(new Set([7]));
  const density = (x: number) => centered.loads.reduce((total, line) => {
    const a = line.a!, b = line.b!;
    return a <= x && x < b ? total + line.qZI + (line.qZJ - line.qZI) * (x - a) / (b - a) : total;
  }, 0);
  const stations = [...new Set([0, 2, 4, 6, ...centered.loads.flatMap(line => [line.a!, line.b!])])].sort((a, b) => a - b);
  for (let i = 1; i < stations.length; i++) {
    const start = stations[i - 1]!, end = stations[i]!;
    for (const fraction of [0.25, 0.75]) {
      const x = start + fraction * (end - start);
      expect(density(x)).toBeCloseTo(x > 2 && x < 4 ? -2 : 0, 10);
    }
  }
  expect(load(4, 6.001)).toMatchObject({ refusal: 'eccentricZone', loads: [], nodal: [] });
});

it('#2201 a zone cannot be combined with shell footprints', () => {
  const fullStrip: NonNullable<FloorLoadInput['shellFootprints']> = [[[[0, 0], [6, 0], [6, 6], [0, 6]]]];
  for (const calculate of [floorLoad, physicalFloorLoad]) {
    const supply = () => fullStrip;
    for (const distribution of ['twoWay', 'oneWay'] as const) {
      for (const shellFootprints of [fullStrip, supply, []]) {
        const result = calculate({ ...base, distribution, spanAxis: 'y', zone: zone(0, 1, 0, 6), shellFootprints });
        expect(result).toMatchObject({ refusal: 'zoneWithShellFootprints', panels: [], loads: [], nodal: [], loadedArea: 0, totalKN: 0 });
        expect(result.perBeam.size).toBe(0);
      }
    }
  }
});

it('shell footprints alone transfer pressure to the actual uncovered carrier intervals', () => {
  const shellFootprints: NonNullable<FloorLoadInput['shellFootprints']> = [[[[0, 0], [6, 0], [6, 6], [0, 6]]]];
  for (const calculate of [floorLoad, physicalFloorLoad]) {
    const result = calculate({ ...base, distribution: 'oneWay', spanAxis: 'y', shellFootprints });
    expect(result.refusal).toBeUndefined();
    expect(result.nodal).toEqual([]);
    expect(result.loads.map(load => [load.elementId, load.a, load.b ?? 10, load.qZI, load.qZJ])).toEqual([
      [1, 6, 10, -3, -3], [2, 6, 10, -3, -3],
    ]);
  }
});
