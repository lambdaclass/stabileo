import { expect, it } from 'vitest';
import { buildLoadPlan, roofWeightFor, type LoadPlanInput } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { checkResponse } from './gravity-carrier-response';
import { bay } from './gravity-regions-fixture';
import { input } from './gravity-width-mass-fixture';

const reproduce = process.env.RUN_KNOWN_WRONG === '2200' ? it : it.skip;
const gravity = { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true } as const;
const roof = { use: 'maintenance', weight: 'heavy', dead: 2, slopeDeg: 0 } as const;

type Model = ReturnType<typeof bay>['model'];

function plan(model: Model, roofSettings?: typeof roof, options: LoadPlanInput['gravity'] = gravity) {
  return buildLoadPlan(input(model, { gravity: options, roof: roofSettings }));
}

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

function expectBlocked(model: Model, reason: RegExp) {
  const result = plan(model);
  expect(result.outcome).toBe('BLOCKED');
  expect(result.blockedKeys[0]?.params?.message).toMatch(reason);
  expect(result.distributed).toEqual([]);
  expect(result.nodal).toEqual([]);
  expect(result.surface).toEqual([]);
  expect(result.levels).toEqual([]);
  expect(() => gravityLayout(model, gravity)).toThrow(reason);
  expect(() => roofWeightFor(model, gravity, 1, 2)).toThrow(reason);
}

reproduce('known wrong result: #2200 a sloped shell springing at a beam level does not establish a shared deck', () => {
  for (const width of [0.1, 10]) {
    const { model } = bay(0);
    addShell(model, 0, width, 3, 6);
    expectBlocked(model, /same deck/i);
    expect(plan(model, undefined, { mode: 'width' }).outcome).toBe('READY');
  }
});

function rotated(model: Model, angle: number, mirror: number) {
  for (const node of model.nodes.values()) {
    const { x, y } = node;
    node.x = x * Math.cos(angle) - mirror * y * Math.sin(angle);
    node.y = x * Math.sin(angle) + mirror * y * Math.cos(angle);
  }
}

reproduce('known wrong result: #2200 an exposed strip takes roof pressures even with a covered bay centre', () => {
  for (const [angle, mirror, mesh, upperWidth] of [[0, 1, 1, 6], [0.37, 1, 3, 5.5], [1.16, -1, 2, 5.5]] as const) {
    const fixture = bay(6, 0, 1, mesh, mesh > 1);
    const { model, physical } = fixture;
    addShell(model, 0, upperWidth, 6);
    rotated(model, angle, mirror);
    expect(plan(model).outcome).toBe('READY');
    const result = plan(model, roof);
    expect(result.blockedKeys.map(key => key.key)).toEqual(['loadPlan.blocked.concentratedRoof']);
    const loads = result.distributed;
    expect(loads.filter(load => load.caseType === 'L')).toEqual([]);
    for (const kind of ['D', 'Lr'] as const) {
      for (const [id, { nodeI, nodeJ }] of model.elements) {
        const [xi, yi] = physical.get(nodeI)!;
        const [xj, yj] = physical.get(nodeJ)!;
        const members = loads.filter(load => load.caseType === kind && load.elementId === id);
        if (yi !== yj || xj <= 6) {
          expect(members).toEqual([]);
          continue;
        }
        expect(members).toHaveLength(1);
        const [load] = members;
        expect(load!.a ?? 0).toBeCloseTo(6 - xi, 10);
        expect(load!.b ?? xj - xi).toBeCloseTo(xj - xi, 10);
        if (kind === 'D') {
          expect(load!.q).toBeCloseTo(-6, 10);
          expect(load!.qJ).toBeCloseTo(-6, 10);
        }
      }
    }
    checkResponse(fixture, loads.filter(load => load.caseType === 'D'), 6, 10, 6);
    const lower = result.levels.find(level => level.elevation === 3)!;
    expect(lower.superimposedKN).toBeCloseTo(36 + 2 * 24, 10);
  }
});

reproduce('known wrong result: #2200 a strip with both covered and exposed area refuses', () => {
  for (const upper of [6.001, 6.25, 9.999]) {
    const { model } = bay(6);
    addShell(model, 0, upper, 6);
    expectBlocked(model, /mixed roof and floor exposure/i);
  }
  const { model } = bay(6);
  addShell(model, 0, 6.25, 6);
  const ring = model.quads.get(2)!.nodes;
  model.quads.delete(2);
  ring.forEach((nodeI, i) => {
    const id = model.elements.size + 1;
    model.elements.set(id, { id, nodeI, nodeJ: ring[(i + 1) % ring.length]!, sectionId: 1, materialId: 1 });
  });
  expectBlocked(model, /mixed roof and floor exposure/i);
});

reproduce('known wrong result: #2200 a shell outside the elevation band cannot subtract a beam deck', () => {
  const { model } = bay(0);
  addShell(model, 0, 4, 3.00125);
  expectBlocked(model, /same deck/i);
});

it('uses a level shell at the elevation band edge and leaves a separate higher deck in place', () => {
  const lower = bay(0).model;
  addShell(lower, 0, 4, 3.001);
  const same = plan(lower);
  expect(same.outcome).toBe('READY');
  expect(same.distributed.filter(load => load.caseType === 'D').map(load => [load.elementId, load.a, load.q])).toEqual([
    [1, 4, -3], [2, 4, -3],
  ]);
  expect(same.levels[0]!.planAreaM2).toBeCloseTo(60, 10);
  const higher = bay(0).model;
  addShell(higher, 0, 4, 6, 9);
  const separate = plan(higher);
  expect(separate.outcome).toBe('READY');
  expect(new Set(separate.distributed.filter(load => load.caseType === 'D').map(load => load.elementId))).toEqual(new Set(higher.elements.keys()));
  expect(separate.levels.reduce((area, level) => area + level.planAreaM2, 0)).toBeCloseTo(84, 10);
});

it('treats a deck at and below the cover rise as exposed', () => {
  for (const rise of [0.049, 0.05]) {
    const { model } = bay(6);
    addShell(model, 0, 8, 3 + rise);
    const layout = gravityLayout(model, gravity);
    expect(layout.pieces.map(piece => [piece.elementId, piece.roof])).toEqual([[1, true], [2, true]]);
  }
});

reproduce('known wrong result: #2200 overhead cover just above the exposure threshold can make a strip mixed', () => {
  const { model } = bay(6);
  addShell(model, 0, 8, 3.051);
  expectBlocked(model, /mixed roof and floor exposure/i);
});

it('keeps the floor load where the uncovered strip is entirely under a higher deck', () => {
  const { model } = bay(6);
  addShell(model, 0, 10, 6);
  expect(plan(model).outcome).toBe('READY');
  const result = plan(model, roof);
  expect(result.blockedKeys.map(key => key.key)).toEqual(['loadPlan.blocked.concentratedRoof']);
  expect(result.distributed.filter(load => load.caseType === 'Lr')).toEqual([]);
  const dead = result.distributed.filter(load => load.caseType === 'D');
  expect(dead.map(load => load.elementId).sort()).toEqual([1, 2]);
  for (const load of dead) {
    expect(load.a).toBeCloseTo(6, 10);
    expect(load.b ?? 10).toBeCloseTo(10, 10);
    expect(load.q).toBeCloseTo(-3, 10);
    expect(load.qJ).toBeCloseTo(-3, 10);
  }
  expect(result.levels.find(level => level.elevation === 3)!.superimposedKN).toBeCloseTo(60, 10);
});
