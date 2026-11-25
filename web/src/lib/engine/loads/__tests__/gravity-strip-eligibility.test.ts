import { expect, it } from 'vitest';
import { teAt } from '../../../i18n/engine-text';
import { floorLoad, physicalFloorLoad } from '../floor-loads';
import { buildLoadPlan, roofWeightFor } from '../load-plan';
import { gravityLayout, MAX_DECK_SPAN, MIN_STOREY_HEADROOM, type GravityOptions } from '../plan-gravity';
import { bay, explicitStripFloor } from './gravity-regions-fixture';
import { input } from './gravity-width-mass-fixture';

type Model = ReturnType<typeof bay>['model'];
const panels = { mode: 'panels', tributaryWidth: 1 } as const;

function wideBay(length: number, span: number, shellWidth: number): Model {
  const { model } = bay(shellWidth * 10 / length);
  for (const n of model.nodes.values()) {
    n.x *= length / 10;
    n.y *= span / 6;
  }
  return model;
}

function overheadBay(headroom: number, covered = 0.1, upperWidth = 10): Model {
  const { model } = bay(covered);
  const corners = [[0, 0], [upperWidth, 0], [upperWidth, 6], [0, 6]].map(([x, y]) => {
    const id = model.nodes.size + 1;
    model.nodes.set(id, { id, x: x!, y: y!, z: 3 + headroom });
    return id;
  });
  model.quads.set(2, { id: 2, nodes: corners });
  corners.forEach((nodeI, i) => {
    const id = model.elements.size + 1;
    model.elements.set(id, { id, nodeI, nodeJ: corners[(i + 1) % corners.length]!, sectionId: 1, materialId: 1 });
  });
  return model;
}

function expectBlocked(model: Model, gravity: GravityOptions, key: string, reason: RegExp) {
  const plan = buildLoadPlan(input(model, { gravity }));
  expect(plan.outcome).toBe('BLOCKED');
  expect(plan.blockedKeys).toEqual([{ key }]);
  expect(teAt(plan.blockedKeys[0]!, 'en')).toMatch(reason);
  expect(plan.distributed).toEqual([]);
  expect(plan.nodal).toEqual([]);
  expect(plan.surface).toEqual([]);
  expect(plan.levels).toEqual([]);
  expect(() => gravityLayout(model, gravity)).toThrow(expect.objectContaining({ key }));
  expect(() => roofWeightFor(model, gravity, 1, 1)).toThrow(expect.objectContaining({ key }));
}

it('#2200 refuses partial strips oblique to the requested one-way span', () => {
  for (const angle of [Math.PI / 6, 1e-6, -Math.PI / 6, Math.PI / 2]) {
    const { model } = bay(4, angle);
    const gravity = { ...panels, slab: 'oneWay', spanAxis: 'y', loadEveryPanel: true } as const;
    const floor = {
      nodes: model.nodes,
      beams: [...model.elements.values()].map(member => ({ ...member, type: 'frame' as const })),
      q: 1, distribution: gravity.slab, spanAxis: gravity.spanAxis,
      shellFootprints: [...model.quads.values()].map(quad => [quad.nodes.map(id => {
        const { x, y } = model.nodes.get(id)!;
        return [x, y] as [number, number];
      })]),
    };
    const key = 'loadPlan.gravity.stripDirection';
    expectBlocked(model, gravity, 'loadPlan.gravity.differentDeck', /same deck/i);
    expect(() => floorLoad(floor)).toThrow(expect.objectContaining({ key }));
    expect(() => physicalFloorLoad(floor)).toThrow(expect.objectContaining({ key }));
  }
});

it('#2200 refuses uncovered strips whose carrier span exceeds the deck limit', () => {
  expectBlocked(wideBay(100, 100, 1), panels, 'loadPlan.gravity.differentDeck', /same deck/i);
  expectBlocked(wideBay(10, MAX_DECK_SPAN + 0.125, 9), panels, 'loadPlan.gravity.differentDeck', /same deck/i);
});

it('#2200 refuses uncovered strips without storey headroom', () => {
  expectBlocked(overheadBay(MIN_STOREY_HEADROOM - 0.125), panels, 'loadPlan.gravity.differentDeck', /same deck/i);
});

it('checks explicit strip transfer at and below the span limit', () => {
  for (const span of [MAX_DECK_SPAN, MAX_DECK_SPAN - 0.125]) {
    const model = wideBay(10, span, 4);
    expectBlocked(model, panels, 'loadPlan.gravity.differentDeck', /same deck/i);
    const dead = explicitStripFloor(model).loads.map(load => ({ ...load, q: load.qZI, qJ: load.qZJ }));
    expect(dead.map(l => l.elementId).sort()).toEqual([1, 2]);
    for (const load of dead) {
      expect(load.a).toBeCloseTo(4, 10);
      expect(load.b ?? 10).toBeCloseTo(10, 10);
      expect(load.q).toBeCloseTo(-span / 2, 10);
      expect(load.qJ ?? load.q).toBeCloseTo(-span / 2, 10);
    }
  }
});

it('storey clearance cannot resolve partial shell ownership', () => {
  for (const model of [
    overheadBay(MIN_STOREY_HEADROOM),
    overheadBay(MIN_STOREY_HEADROOM + 0.125),
    overheadBay(MIN_STOREY_HEADROOM - 0.125, 4, 2),
  ]) expectBlocked(model, panels, 'loadPlan.gravity.differentDeck', /same deck/i);
});
