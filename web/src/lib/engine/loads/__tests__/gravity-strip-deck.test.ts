import { expect, it } from 'vitest';
import type { EngineMessage } from '../../../codes/message';
import { teAt } from '../../../i18n/engine-text';
import { buildLoadPlan, roofWeightFor } from '../load-plan';
import { gravityLayout, MAX_DECK_SPAN } from '../plan-gravity';
import { snowDriftRefusal } from '../snow-drift-loads';
import { bay } from './gravity-regions-fixture';
import { input } from './gravity-width-mass-fixture';

const differentDeck = { key: 'loadPlan.gravity.differentDeck' };
const overlappingShells = { key: 'loadPlan.gravity.overlappingShells', params: { first: 1, second: 2 } };
type Model = ReturnType<typeof bay>['model'];

function addShell(model: Model, x0: number, x1: number, z0: number, z1 = z0) {
  const id = model.quads.size + 1;
  const corners = [[x0, 0, z0], [x1, 0, z0], [x1, 6, z1], [x0, 6, z1]] as const;
  const nodes = corners.map(([x, y, z]) => {
    const nodeId = model.nodes.size + 1;
    model.nodes.set(nodeId, { id: nodeId, x, y, z });
    return nodeId;
  });
  model.quads.set(id, { id, nodes });
}

function addMember(model: Model, x: number, z0: number, z1: number) {
  const first = model.nodes.size + 1;
  model.nodes.set(first, { id: first, x, y: 0, z: z0 });
  model.nodes.set(first + 1, { id: first + 1, x, y: 6, z: z1 });
  const id = model.elements.size + 1;
  model.elements.set(id, { id, nodeI: first, nodeJ: first + 1, sectionId: 1, materialId: 1 });
}

function rotated(model: Model, angle: number, mirror: number) {
  for (const node of model.nodes.values()) {
    const { x, y } = node;
    node.x = x * Math.cos(angle) - mirror * y * Math.sin(angle);
    node.y = x * Math.sin(angle) + mirror * y * Math.cos(angle);
  }
}

function expectBlocked(model: Model, reason: EngineMessage = differentDeck, tributaryWidth = 1) {
  for (const loadEveryPanel of [false, true]) {
    const gravity = { mode: 'panels', tributaryWidth, loadEveryPanel } as const;
    const plan = buildLoadPlan(input(model, { gravity, tributaryWidth, generateCombinations: true }));
    expect(plan, JSON.stringify(plan.blockedKeys)).toMatchObject({
      outcome: 'BLOCKED', blockedKeys: [reason], distributed: [], nodal: [], surface: [], levels: [], combinations: [],
    });
    expect(teAt(plan.blockedKeys[0]!, 'en')).toMatch(/same deck|shells 1 and 2 overlap|coverage check failed/i);
    expect(() => gravityLayout(model, gravity)).toThrow(expect.objectContaining(reason));
    expect(() => roofWeightFor(model, gravity, tributaryWidth, 2)).toThrow(expect.objectContaining(reason));
  }
  expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
}

it('#2200 a sloped shell springing at a beam level needs explicit ownership', () => {
  for (const width of [0.1, 10]) {
    const { model } = bay(0);
    addShell(model, 0, width, 3, 6);
    expectBlocked(model);
    expect(buildLoadPlan(input(model, { gravity: { mode: 'width' } })).outcome).toBe('READY');
  }
});

it('#2200 an overhead shell cannot settle ownership of a partially covered bay', () => {
  for (const [angle, mirror, mesh, upperWidth] of [
    [0, 1, 1, 6], [0.37, 1, 3, 6], [1.16, -1, 2, 5.5],
    [0, 1, 1, 6.001], [0, 1, 1, 6.25], [0, 1, 1, 9.999], [0, 1, 1, 10],
  ] as const) {
    const { model } = bay(6, 0, 1, mesh, mesh > 1);
    addShell(model, 0, upperWidth, 6);
    rotated(model, angle, mirror);
    const reason = angle === 0.37
      ? { key: 'loadPlan.gravity.deckCheckFailed', params: { detail: expect.any(String) } }
      : differentDeck;
    expectBlocked(model, reason);
  }
});

it('#2200 an overhead beam ring cannot settle ownership of a partially covered bay', () => {
  for (const width of [MAX_DECK_SPAN - 0.125, MAX_DECK_SPAN, MAX_DECK_SPAN + 0.125]) {
    const { model } = bay(6);
    addShell(model, -2, 12, 6);
    const ring = model.quads.get(2)!.nodes;
    model.quads.delete(2);
    ring.forEach((nodeI, i) => {
      model.nodes.get(nodeI)!.y = i < 2 ? -3 : -3 + width;
      const id = model.elements.size + 1;
      model.elements.set(id, { id, nodeI, nodeJ: ring[(i + 1) % ring.length]!, sectionId: 1, materialId: 1 });
    });
    expectBlocked(model);
  }
});

it('#2200 a nearby shell cannot subtract a beam deck', () => {
  for (const height of [3.001, 3.00125]) {
    const { model } = bay(0);
    addShell(model, 0, 4, height);
    expectBlocked(model);
  }
  const { model } = bay(0);
  addShell(model, 0, 4, 6, 9);
  const plan = buildLoadPlan(input(model, { gravity: { mode: 'panels', loadEveryPanel: true } }));
  expect(plan.outcome).toBe('READY');
  expect(new Set(plan.distributed.filter(load => load.caseType === 'D').map(load => load.elementId))).toEqual(new Set(model.elements.keys()));
  expect(plan.levels.reduce((total, level) => total + level.planAreaM2, 0)).toBeCloseTo(84, 10);
});

it('#2200 shell overlaps at or within the separation limit refuse before exposure', () => {
  for (const rise of [0.049, 0.05, 0.051]) {
    const { model } = bay(6);
    addShell(model, 0, 8, 3 + rise);
    expectBlocked(model, rise <= 0.05 ? overlappingShells : differentDeck);
  }
});

it('#2282 overhead width loads cannot settle partial ownership at the bay level', () => {
  for (const [x, width, z0, z1] of [
    [5, 10, 6, 8], [5, 10.5, 6, 8], [5, 9.75, 6, 8], [5, 2, 6, 8],
    [-0.99, 10, 6, 8], [5, 10, 3.02, 3.051], [-1, 10, 6, 8], [5, 0, 6, 8],
    [5, 10, 3.02, 3.05], [5, 10, 6, 6], [7, 6, 6, 6], [7, 5.999, 6, 6],
    [-0.999, 10, 6, 6], [7, 5.999, 3.051, 3.051], [7, 6, 3.049, 3.049],
  ] as const) {
    const { model } = bay(4);
    addMember(model, x, z0, z1);
    expectBlocked(model, differentDeck, width);
  }
});
