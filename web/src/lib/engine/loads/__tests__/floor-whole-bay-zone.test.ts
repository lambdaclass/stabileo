import { expect, it } from 'vitest';
import { floorLoad, physicalFloorLoad, type FloorLoadInput } from '../floor-loads';
import { bay } from './gravity-regions-fixture';
import { checkLinearResponse } from './gravity-carrier-response';

const xLength = 6;
const yLength = 5;
const pressure = 4;

function twoBays(angle: number, mirror: number, subdivide: boolean) {
  const fixture = bay(0, 0, 1, 1, subdivide);
  const { model, physical, ends } = fixture;
  const point = (x: number, y: number): [number, number, number] =>
    [x * Math.cos(angle) - mirror * y * Math.sin(angle), x * Math.sin(angle) + mirror * y * Math.cos(angle), 3];
  for (const [id, [u, v]] of physical) {
    const [x, y] = [u * xLength / 10, v * yLength / 6];
    physical.set(id, [x, y]);
    const [px, py, z] = point(x, y);
    model.nodes.set(id, { id, x: px, y: py, z });
  }
  const firstBay = { ...fixture, model: { ...model, elements: new Map(model.elements) } };
  const right = [0, yLength].map(y => {
    const id = model.nodes.size + 1;
    const [px, py, z] = point(13.5, y);
    model.nodes.set(id, { id, x: px, y: py, z });
    return id;
  });
  for (const [nodeI, nodeJ] of [[ends[0]!, right[0]!], [right[0]!, right[1]!], [right[1]!, ends[1]!]]) {
    const id = model.elements.size + 1;
    model.elements.set(id, { id, nodeI, nodeJ, sectionId: 1, materialId: 1 });
  }
  const rectangle = (x0: number, y0: number, x1: number, y1: number) => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];
  return { fixture: firstBay, model, rectangle };
}

function checkCarriers(fixture: ReturnType<typeof bay>, result: ReturnType<typeof floorLoad>) {
  const { model, physical } = fixture;
  expect(result.refusal).toBeUndefined();
  expect(result.nodal).toEqual([]);
  expect(result.loadedArea).toBeCloseTo(xLength * yLength, 10);
  expect(result.totalKN).toBeCloseTo(120, 10);
  expect(new Set(result.loads.map(load => load.elementId))).toEqual(new Set(model.elements.keys()));
  const depth = yLength / 2;
  for (const [id, { nodeI, nodeJ }] of model.elements) {
    const [xi, yi] = physical.get(nodeI)!;
    const [xj, yj] = physical.get(nodeJ)!;
    const [start, end, length] = yi === yj ? [xi, xj, xLength] : [yi, yj, yLength];
    const loads = result.loads.filter(load => load.elementId === id);
    const cuts = [...new Set([start, end, depth, length - depth, ...loads.flatMap(load => [start + (load.a ?? 0), start + (load.b ?? end - start)])])]
      .filter(x => x >= start && x <= end).sort((a, b) => a - b);
    for (const [i, a] of cuts.slice(0, -1).entries()) {
      const b = cuts[i + 1]!;
      if (b - a < 1e-12) continue;
      for (const fraction of [0.25, 0.75]) {
        const x = a + fraction * (b - a);
        const local = x - start;
        const q = loads.reduce((sum, load) => {
          const a = load.a ?? 0, b = load.b ?? end - start;
          return local < a || local > b ? sum : sum + load.qZI + (load.qZJ - load.qZI) * (local - a) / (b - a);
        }, 0);
        expect(q).toBeCloseTo(-pressure * Math.min(x, length - x, depth), 8);
      }
    }
  }
  const loads = result.loads.map(load => ({ ...load, q: load.qZI, qJ: load.qZJ }));
  const peak = pressure * depth;
  checkLinearResponse(fixture, loads, [
    { a: 0, b: depth, qa: 0, qb: peak },
    { a: depth, b: xLength - depth, qa: peak, qb: peak },
    { a: xLength - depth, b: xLength, qa: peak, qb: 0 },
  ]);
  const shortEnds = [fixture.root[1]!, fixture.ends[1]!];
  const shortRoots = [fixture.root[0]!, fixture.ends[0]!];
  const transposed = new Map([...physical].map(([id, [x, y]]) => [id, [y, x] as [number, number]]));
  checkLinearResponse({ ...fixture, physical: transposed, root: shortRoots, ends: shortEnds }, loads, [
    { a: 0, b: depth, qa: 0, qb: peak },
    { a: depth, b: yLength, qa: peak, qb: 0 },
  ]);
}

it('#2282 — a complete bay zone delivers its member loads', () => {
  for (const [angle, mirror, subdivide] of [[0, 1, false], [0.37, 1, true], [1.16, -1, true]] as const) {
    const { fixture, model, rectangle } = twoBays(angle, mirror, subdivide);
    const input: FloorLoadInput = {
      nodes: model.nodes, beams: [...model.elements.values()].map(beam => ({ ...beam, type: 'frame' })),
      q: pressure, distribution: 'twoWay',
    };
    const exact = { outer: rectangle(0, 0, xLength, yLength) };
    const withUnloadedOpening = {
      outer: rectangle(-1, -1, xLength, yLength + 1),
      holes: [rectangle(-0.9, 0, -0.25, 1)],
    };
    for (const calculate of [floorLoad, physicalFloorLoad]) {
      checkCarriers(fixture, calculate({ ...input, zone: exact }));
      checkCarriers(fixture, calculate({ ...input, zone: withUnloadedOpening }));
      for (const zone of [
        { outer: rectangle(0, 0, xLength - 0.001, yLength) },
        { ...exact, holes: [rectangle(1, 1, 2, 2)] },
      ]) {
        expect(calculate({ ...input, zone })).toMatchObject({ refusal: 'eccentricZone', loads: [], nodal: [] });
      }
    }
  }
});
