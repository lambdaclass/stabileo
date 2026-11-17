import { expect, it } from 'vitest';
import { floorLoad, physicalFloorLoad, type FloorLoadInput } from '../floor-loads';
import { bay } from './gravity-regions-fixture';

const wrong2201 = process.env.RUN_KNOWN_WRONG === '2201' ? it : it.skip;

function zone(x0: number, x1: number, y0: number, y1: number): FloorLoadInput['zone'] {
  return { outer: [[x0, y0, 3], [x1, y0, 3], [x1, y1, 3], [x0, y1, 3]] };
}

const { model } = bay(0);
const base = {
  nodes: model.nodes,
  beams: [...model.elements.values()].map(beam => ({ ...beam, type: 'frame' as const })),
  q: 1,
};

wrong2201('known wrong result: #2201 eccentric two-way zone refuses every load in the definition', () => {
  for (const calculate of [floorLoad, physicalFloorLoad]) {
    const result = calculate({ ...base, distribution: 'twoWay', zone: zone(0, 1, 0, 6) });
    expect(result).toMatchObject({ refusal: 'eccentricZone', loads: [], nodal: [], totalKN: 0 });
  }
});

wrong2201('known wrong result: #2201 a concentric one-way patch applies equal line reactions at the actual stations', () => {
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
