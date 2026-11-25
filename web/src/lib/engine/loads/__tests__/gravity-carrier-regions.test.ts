import { expect, it } from 'vitest';
import { floorLoad } from '../floor-loads';
import { buildLoadPlan } from '../load-plan';
import { input as planInput } from './gravity-width-mass-fixture';
import { explicitStripFloor, bay } from './gravity-regions-fixture';
import { checkResponse } from './gravity-carrier-response';

it('#2199 each uncovered strip gives the hand-solved carrier response', () => {
  for (const [angle, mirror, mesh] of [[0, 1, 1], [0.37, 1, 3], [1.16, -1, 2]] as const) {
    const fixture = bay(4.76, angle, mirror, mesh, mesh > 1);
    const result = explicitStripFloor(fixture.model);
    checkResponse(fixture, result.loads.map(load => ({ ...load, q: load.qZI, qJ: load.qZJ })), 4.76, 10, 3);
  }
});

it('#2200 aligned one-way strips give the hand-solved carrier response', () => {
  for (const [angle, mirror, mesh, spanAxis] of [[0, 1, 1, 'y'], [Math.PI / 2, -1, 2, 'x'], [Math.PI, 1, 3, 'y']] as const) {
    const fixture = bay(4, angle, mirror, mesh, mesh > 1);
    const plan = buildLoadPlan(planInput(fixture.model, { gravity: { mode: 'panels', slab: 'oneWay', spanAxis } }));
    const refusal = angle === Math.PI
      ? { key: 'loadPlan.gravity.deckCheckFailed', params: { detail: expect.any(String) } }
      : { key: 'loadPlan.gravity.differentDeck' };
    expect(plan).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [refusal], distributed: [], surface: [], nodal: [] });
    const result = explicitStripFloor(fixture.model, { distribution: 'oneWay', spanAxis });
    const loads = result.loads.map(load => ({ ...load, q: load.qZI, qJ: load.qZJ }));
    for (const [id, { nodeI, nodeJ }] of fixture.model.elements) {
      const [xi, yi] = fixture.physical.get(nodeI)!;
      const [xj, yj] = fixture.physical.get(nodeJ)!;
      const carrierLoads = loads.filter(load => load.elementId === id);
      if (yi !== yj || xj <= 4) {
        expect(carrierLoads).toEqual([]);
        continue;
      }
      expect(carrierLoads).toHaveLength(1);
      const [load] = carrierLoads;
      expect(load!.a ?? 0).toBeCloseTo(Math.max(0, 4 - xi), 10);
      expect(load!.b ?? xj - xi).toBeCloseTo(xj - xi, 10);
      expect(load!.q).toBeCloseTo(-3, 10);
      expect(load!.qJ ?? load!.q).toBeCloseTo(-3, 10);
    }
    checkResponse(fixture, loads, 4, 10, 3);
  }
});

it('#2201 the concentric zone gives the hand-solved carrier response', () => {
  const fixture = bay(0, 0, 1, 1, true);
  const { model } = fixture;
  const result = floorLoad({
    nodes: model.nodes, beams: [...model.elements.values()].map(beam => ({ ...beam, type: 'frame' })),
    q: 1, distribution: 'oneWay', spanAxis: 'y', zone: { outer: [[2, 2, 3], [8, 2, 3], [8, 4, 3], [2, 4, 3]] },
  });
  checkResponse(fixture, result.loads.map(load => ({ ...load, q: load.qZI, qJ: load.qZJ })), 2, 8, 1);
});
