import { expect, it } from 'vitest';
import { teAt } from '../../../i18n/engine-text';
import { buildLoadPlan, roofWeightFor, type LoadPlanInput } from '../load-plan';
import { gravityLayout, MAX_DECK_SPAN, type GravityOptions } from '../plan-gravity';
import { snowDriftRefusal } from '../snow-drift-loads';
import { checkResponse } from './gravity-carrier-response';
import { bay } from './gravity-regions-fixture';
import { input } from './gravity-width-mass-fixture';

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

function expectBlocked(model: Model, key: string, reason: RegExp) {
  const result = plan(model);
  expect(result.outcome).toBe('BLOCKED');
  expect(result.blockedKeys).toEqual([{ key }]);
  expect(teAt(result.blockedKeys[0]!, 'en')).toMatch(reason);
  expect(result.distributed).toEqual([]);
  expect(result.nodal).toEqual([]);
  expect(result.surface).toEqual([]);
  expect(result.levels).toEqual([]);
  expect(() => gravityLayout(model, gravity)).toThrow(expect.objectContaining({ key }));
  expect(() => roofWeightFor(model, gravity, 1, 2)).toThrow(expect.objectContaining({ key }));
}

it('#2200 a sloped shell springing at a beam level does not establish a shared deck', () => {
  for (const width of [0.1, 10]) {
    const { model } = bay(0);
    addShell(model, 0, width, 3, 6);
    expectBlocked(model, 'loadPlan.gravity.differentSlopedDeck', /same deck/i);
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

it('#2200 an exposed strip takes roof pressures even with a covered bay centre', () => {
  for (const [angle, mirror, mesh, upperWidth] of [[0, 1, 1, 6], [0.37, 1, 3, 6], [1.16, -1, 2, 5.5]] as const) {
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

it('#2200 a strip with both covered and exposed area refuses', () => {
  for (const upper of [6.001, 6.25, 9.999]) {
    const { model } = bay(6);
    addShell(model, 0, upper, 6);
    expectBlocked(model, 'loadPlan.gravity.mixedExposure', /mixed roof and floor exposure/i);
  }
  const { model } = bay(6);
  addShell(model, 0, 6.25, 6);
  const ring = model.quads.get(2)!.nodes;
  model.quads.delete(2);
  ring.forEach((nodeI, i) => {
    const id = model.elements.size + 1;
    model.elements.set(id, { id, nodeI, nodeJ: ring[(i + 1) % ring.length]!, sectionId: 1, materialId: 1 });
  });
  expectBlocked(model, 'loadPlan.gravity.mixedExposure', /mixed roof and floor exposure/i);
});

it('#2200 a shell outside the elevation band cannot subtract a beam deck', () => {
  const { model } = bay(0);
  addShell(model, 0, 4, 3.00125);
  expectBlocked(model, 'loadPlan.gravity.differentDeck', /same deck/i);
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

it('#2200 overhead cover just above the exposure threshold can make a strip mixed', () => {
  const { model } = bay(6);
  addShell(model, 0, 8, 3.051);
  expectBlocked(model, 'loadPlan.gravity.mixedExposure', /mixed roof and floor exposure/i);
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

function upperRing(model: Model, width: number) {
  const corners = [[-2, -3], [12, -3], [12, -3 + width], [-2, -3 + width]] as const;
  const nodes = corners.map(([x, y]) => {
    const id = model.nodes.size + 1;
    model.nodes.set(id, { id, x, y, z: 6 });
    return id;
  });
  const first = model.elements.size + 1;
  nodes.forEach((nodeI, i) => {
    const id = first + i;
    model.elements.set(id, { id, nodeI, nodeJ: nodes[(i + 1) % nodes.length]!, sectionId: 1, materialId: 1 });
  });
  return first;
}

const automatic = { ...gravity, loadEveryPanel: false };

function checkStripUnderRing(fixture: ReturnType<typeof bay>, upperFirst: number, options: typeof automatic, exposed: boolean) {
  const { model, physical } = fixture;
  const result = plan(model, roof, options);
  expect(result.blockedKeys.map(key => key.key)).toEqual(['loadPlan.blocked.concentratedRoof']);
  const layout = gravityLayout(model, options);
  expect(layout.pieces.filter(piece => piece.elementId < upperFirst).map(piece => piece.roof)).toEqual([exposed, exposed]);
  expect(layout.pieces.some(piece => piece.elementId >= upperFirst)).toBe(!exposed);
  const lower = result.distributed.filter(load => load.elementId < upperFirst);
  expect(lower.filter(load => load.caseType === (exposed ? 'L' : 'Lr'))).toEqual([]);
  expect([...new Set(lower.map(load => load.caseType))].sort()).toEqual(['D', exposed ? 'Lr' : 'L']);
  expect(result.nodal).toEqual([]);
  const pressure = exposed ? roof.dead : 1;
  const dead = lower.filter(load => load.caseType === 'D');
  for (const [id, { nodeI, nodeJ }] of model.elements) {
    if (id >= upperFirst) continue;
    const [xi, yi] = physical.get(nodeI)!;
    const [xj, yj] = physical.get(nodeJ)!;
    const loads = dead.filter(load => load.elementId === id);
    if (yi !== yj || xj <= 6) {
      expect(loads).toEqual([]);
      continue;
    }
    expect(loads).toHaveLength(1);
    const [load] = loads;
    expect(load!.a ?? 0).toBeCloseTo(6 - xi, 10);
    expect(load!.b ?? xj - xi).toBeCloseTo(xj - xi, 10);
    expect(load!.q).toBeCloseTo(-3 * pressure, 10);
    expect(load!.qJ ?? load!.q).toBeCloseTo(-3 * pressure, 10);
  }
  const elements = new Map([...model.elements].filter(([id]) => id < upperFirst));
  checkResponse({ ...fixture, model: { ...model, elements } }, dead, 6, 10, 3 * pressure);
  if (exposed) expect(roofWeightFor(model, options, 1, 0)).toBe('heavy');
}

it('#2200 a rejected bare upper ring leaves the lower strip exposed', () => {
  for (const [angle, mirror, mesh] of [[0, 1, 1], [0.37, 1, 3], [1.16, -1, 2]] as const) {
    const fixture = bay(6, 0, 1, mesh, mesh > 1);
    const first = upperRing(fixture.model, MAX_DECK_SPAN + 0.125);
    rotated(fixture.model, angle, mirror);
    checkStripUnderRing(fixture, first, automatic, true);
  }
});

it('a deck at or below the span limit and an explicitly loaded wider deck cover the strip', () => {
  for (const [span, options] of [[MAX_DECK_SPAN - 0.125, automatic], [MAX_DECK_SPAN, automatic], [MAX_DECK_SPAN + 0.125, gravity]] as const) {
    const fixture = bay(6);
    const first = upperRing(fixture.model, span);
    checkStripUnderRing(fixture, first, options, false);
  }
});

function widthRoof(model: Model, x: number, z0: number, z1: number, split = false) {
  const nodes = (split ? [0, 3, 6] : [0, 6]).map(y => {
    const id = model.nodes.size + 1;
    model.nodes.set(id, { id, x, y, z: z0 + (z1 - z0) * y / 6 });
    return id;
  });
  const first = model.elements.size + 1;
  nodes.slice(1).forEach((nodeJ, i) => {
    const id = first + i;
    model.elements.set(id, { id, nodeI: nodes[i]!, nodeJ, sectionId: 1, materialId: 1 });
  });
  return first;
}

it('#2282 — a width-loaded roof covers the full strip', () => {
  for (const [angle, mirror, mesh, width] of [[0, 1, 1, 10], [0.37, 1, 3, 10.5], [1.16, -1, 2, 10.5]] as const) {
    const fixture = bay(4, 0, 1, mesh, mesh > 1);
    const { model, physical } = fixture;
    const first = widthRoof(model, 5, 6, 8, mesh > 1);
    rotated(model, angle, mirror);
    for (const options of [automatic, gravity]) {
      const settings = { ...options, tributaryWidth: width };
      const layout = gravityLayout(model, settings);
      expect(layout.widthMembers.map(member => member.elementId)).toEqual([...model.elements.keys()].filter(id => id >= first));
      expect(layout.pieces.every(piece => !piece.roof)).toBe(true);
      const result = buildLoadPlan(input(model, { gravity: settings, roof, tributaryWidth: width }));
      const lower = result.distributed.filter(load => load.elementId < first);
      expect([...new Set(lower.map(load => load.caseType))].sort()).toEqual(['D', 'L']);
      const dead = lower.filter(load => load.caseType === 'D');
      for (const [id, { nodeI, nodeJ }] of model.elements) {
        if (id >= first) continue;
        const [xi, yi] = physical.get(nodeI)!;
        const [xj, yj] = physical.get(nodeJ)!;
        const loads = dead.filter(load => load.elementId === id);
        if (yi !== yj || xj <= 4) {
          expect(loads).toEqual([]);
          continue;
        }
        expect(loads).toHaveLength(1);
        const [load] = loads;
        expect(load!.a ?? 0).toBeCloseTo(Math.max(0, 4 - xi), 10);
        expect(load!.b ?? xj - xi).toBeCloseTo(xj - xi, 10);
        expect(load!.q).toBeCloseTo(-3, 10);
        expect(load!.qJ ?? load!.q).toBeCloseTo(-3, 10);
      }
      const elements = new Map([...model.elements].filter(([id]) => id < first));
      checkResponse({ ...fixture, model: { ...model, elements } }, dead, 4, 10, 3);
    }
  }
});

it('#2282 — partial width cover refuses mixed exposure', () => {
  for (const options of [automatic, gravity]) {
    for (const [x, width] of [[5, 9.75], [5, 2], [-0.99, 10]] as const) {
      const { model } = bay(4);
      widthRoof(model, x, 6, 8);
      expectBlockedWithWidth(model, { ...options, tributaryWidth: width });
    }
  }
  const { model } = bay(4);
  widthRoof(model, 5, 3.02, 3.051);
  expectBlockedWithWidth(model, { ...gravity, tributaryWidth: 10 });

  const gapped = bay(4).model;
  const first = widthRoof(gapped, 5, 6, 8, true);
  const second = gapped.elements.get(first + 1)!;
  const start = gapped.nodes.get(second.nodeI)!;
  const id = gapped.nodes.size + 1;
  const gap = 1e-9;
  gapped.nodes.set(id, { ...start, id, y: start.y + gap, z: start.z! + gap / 3 });
  second.nodeI = id;
  expectBlockedWithWidth(gapped, { ...gravity, tributaryWidth: 10 });

  const snowFallback = bay(4).model;
  widthRoof(snowFallback, 5, 6, 8);
  expect(() => snowDriftRefusal(snowFallback)).toThrow(expect.objectContaining({ key: 'loadPlan.gravity.mixedExposure' }));
});

function expectBlockedWithWidth(model: Model, gravityOptions: GravityOptions, key = 'loadPlan.gravity.mixedExposure') {
  const { tributaryWidth } = gravityOptions;
  expect(buildLoadPlan(input(model, { gravity: gravityOptions, tributaryWidth }))).toMatchObject({
    outcome: 'BLOCKED', blockedKeys: [{ key }], distributed: [], nodal: [], surface: [], levels: [],
  });
  expect(() => gravityLayout(model, gravityOptions)).toThrow(expect.objectContaining({ key }));
  expect(() => roofWeightFor(model, gravityOptions, tributaryWidth, 2)).toThrow(expect.objectContaining({ key }));
}

it('leaves strips exposed without area from a width footprint above the cover rise', () => {
  for (const [x, width, z0, z1] of [[-1, 10, 6, 8], [5, 0, 6, 8], [5, 10, 3.02, 3.05]] as const) {
    const { model } = bay(4);
    widthRoof(model, x, z0, z1);
    const layout = gravityLayout(model, { ...gravity, tributaryWidth: width });
    expect(layout.pieces.map(piece => [piece.elementId, piece.a, piece.roof])).toEqual([[1, 4, true], [2, 4, true]]);
  }
});

it('#2282 a horizontal width-loaded member covers the full strip', () => {
  for (const [x, width, angle, mirror, mesh] of [[5, 10, 0, 1, 1], [7, 6, 0.37, 1, 3], [7, 6, 1.16, -1, 2]] as const) {
    const fixture = bay(4, 0, 1, mesh, mesh > 1);
    const { model, physical } = fixture;
    const first = widthRoof(model, x, 6, 6, mesh > 1);
    const upper = new Map([...model.elements].filter(([id]) => id >= first));
    const upperNodes = [...upper.values()].flatMap(({ nodeI, nodeJ }) => [nodeI, nodeJ]);
    const upperPhysical = new Map(upperNodes.map(id => [id, [model.nodes.get(id)!.y, 0] as [number, number]]));
    rotated(model, angle, mirror);
    for (const options of [automatic, gravity]) {
      const settings = { ...options, tributaryWidth: width };
      const result = buildLoadPlan(input(model, { gravity: settings, roof, tributaryWidth: width }));
      const lower = result.distributed.filter(load => load.elementId < first);
      const elements = new Map([...model.elements].filter(([id]) => id < first));
      const dead = lower.filter(load => load.caseType === 'D');
      checkResponse({ ...fixture, model: { ...model, elements } }, dead, 4, 10, 3);
      expect(result.blockedKeys.map(({ key }) => key)).toEqual(['loadPlan.blocked.concentratedRoof']);
      expect(result.nodal).toEqual([]);
      expect([...new Set(lower.map(load => load.caseType))].sort()).toEqual(['D', 'L']);
      for (const [id, { nodeI, nodeJ }] of elements) {
        const [xi, yi] = physical.get(nodeI)!;
        const [xj, yj] = physical.get(nodeJ)!;
        for (const [kind, pressure] of [['D', 1], ['L', result.factors.occupancy.value]] as const) {
          const loads = lower.filter(load => load.elementId === id && load.caseType === kind);
          if (yi !== yj || xj <= 4) {
            expect(loads).toEqual([]);
            continue;
          }
          expect(loads).toHaveLength(1);
          expect(loads[0]!.a ?? 0).toBeCloseTo(Math.max(0, 4 - xi), 10);
          expect(loads[0]!.b ?? xj - xi).toBeCloseTo(xj - xi, 10);
          expect(loads[0]!.q).toBeCloseTo(-3 * pressure, 10);
          expect(loads[0]!.qJ ?? loads[0]!.q).toBeCloseTo(-3 * pressure, 10);
        }
      }
      const upperDead = result.distributed.filter(load => load.elementId >= first && load.caseType === 'D');
      expect(upperDead).toHaveLength(upper.size);
      for (const load of upperDead) {
        expect(load.a).toBeUndefined();
        expect(load.b).toBeUndefined();
        expect(load.q).toBe(-roof.dead * width);
      }
      checkResponse({
        model: { ...model, elements: upper }, physical: upperPhysical,
        root: [upperNodes[0]!], ends: [upperNodes.at(-1)!],
      }, upperDead, 0, 6, roof.dead * width);
      const layout = gravityLayout(model, settings);
      expect(layout.pieces.every(piece => !piece.roof)).toBe(true);
      expect(layout.widthMembers.map(member => member.elementId)).toEqual([...upper.keys()]);
      expect(result.levels.find(level => level.elevation === 3)!.superimposedKN).toBeCloseTo(36 + 24 * roof.dead, 10);
    }
  }
});

it('#2282 a horizontal width footprint that partly covers a strip refuses', () => {
  for (const options of [automatic, gravity]) {
    for (const [x, width] of [[7, 5.999], [-0.999, 10]] as const) {
      const { model } = bay(4);
      widthRoof(model, x, 6, 6);
      expectBlockedWithWidth(model, { ...options, tributaryWidth: width });
    }
  }
  const low = bay(4).model;
  widthRoof(low, 7, 3.051, 3.051);
  expectBlockedWithWidth(low, { ...automatic, tributaryWidth: 5.999 }, 'loadPlan.gravity.stripHeadroom');
  expectBlockedWithWidth(low, { ...gravity, tributaryWidth: 5.999 });
  const { model } = bay(4);
  widthRoof(model, 4, 6, 6);
  expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining({ key: 'loadPlan.gravity.mixedExposure' }));
});

it('leaves a strip exposed when a horizontal width footprint has no overhead area', () => {
  for (const [x, width, z] of [[-1, 10, 6], [7, 0, 6], [7, 6, 3.049], [7, 6, 3.05]] as const) {
    const fixture = bay(4);
    const { model } = fixture;
    const first = widthRoof(model, x, z, z);
    const settings = { ...gravity, tributaryWidth: width };
    const result = buildLoadPlan(input(model, { gravity: settings, roof, tributaryWidth: width }));
    const lower = result.distributed.filter(load => load.elementId < first);
    expect([...new Set(lower.map(load => load.caseType))].sort()).toEqual(['D', 'Lr']);
    const dead = lower.filter(load => load.caseType === 'D');
    expect(dead.map(load => [load.elementId, load.a, load.b, load.q, load.qJ])).toEqual([
      [1, 4, undefined, -6, -6], [2, 4, undefined, -6, -6],
    ]);
    const elements = new Map([...model.elements].filter(([id]) => id < first));
    checkResponse({ ...fixture, model: { ...model, elements } }, dead, 4, 10, 6);
    expect(gravityLayout(model, settings).pieces.every(piece => piece.roof)).toBe(true);
  }
});
