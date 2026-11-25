import { expect, it } from 'vitest';
import { teAt } from '../../../i18n/engine-text';
import { applyLoadPlan } from '../../../store/apply-load-plan';
import { modelStore } from '../../../store/index';
import { buildLoadPlan, roofWeightFor, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { gravityLayout, MIN_STOREY_HEADROOM, widthSpans } from '../plan-gravity';
import { snowDriftRefusal } from '../snow-drift-loads';
import { input } from './gravity-width-mass-fixture';
import { snow } from './snow-roof-plane-fixture';

const mixed = 'loadPlan.gravity.mixedExposure';
const roof = { use: 'maintenance', weight: 'heavy', dead: 2, slopeDeg: 0 } as const;
const panels = { mode: 'panels' } as const;
const everyPanel = { ...panels, loadEveryPanel: true };
const enabledSnow = { ...snow, enabled: true, source: 'test input' };

type Point = [number, number];
const rectangle = (left: number, right: number): Point[] => [[left, 0], [right, 0], [right, 6], [left, 6]];

function fixture() {
  const nodes: LoadModelData['nodes'] = new Map();
  const elements: LoadModelData['elements'] = new Map();
  const quads: NonNullable<LoadModelData['quads']> = new Map();
  const model = {
    nodes, elements, quads, loadCases: [],
    sections: new Map([[1, { id: 1, a: 0.1 }]]),
    materials: new Map([[1, { id: 1, rho: 25 }]]),
  } satisfies LoadModelData;
  const polygon = (points: Point[], height: (x: number) => number) => points.map(([x, y]) => {
    const id = nodes.size + 1;
    nodes.set(id, { id, x, y, z: height(x) });
    return id;
  });
  const beams = (points: Point[], z: number) => {
    const ids = polygon(points, () => z);
    const count = ids.length === 2 ? 1 : ids.length;
    ids.slice(0, count).forEach((nodeI, i) => {
      const id = elements.size + 1;
      elements.set(id, { id, nodeI, nodeJ: ids[(i + 1) % ids.length]!, sectionId: 1, materialId: 1 });
    });
  };
  const shell = (points: Point[], height: (x: number) => number) => {
    quads.set(1, { id: 1, nodes: polygon(points, height), materialId: 1, thickness: 0.1 });
  };
  return { model, beams, shell };
}

function stackedBays(left = 0, right = 7) {
  const { model, beams } = fixture();
  beams(rectangle(0, 10), 3);
  beams(rectangle(left, right), 6);
  return model;
}

function pitchedCover(lower: Point[], bandEdge: number) {
  const { model, beams, shell } = fixture();
  beams(lower, 3);
  shell(rectangle(-1, 14), x => 3 + MIN_STOREY_HEADROOM + (x - bandEdge) / 8);
  return model;
}

function plan(model: LoadModelData, options: Partial<LoadPlanInput> = {}) {
  return buildLoadPlan(input(model, { gravity: panels, ...options }));
}

function expectMixed(result: ReturnType<typeof plan>) {
  expect(result.blockedKeys, JSON.stringify({ outcome: result.outcome, levels: result.levels.map(level => [level.elevation, level.superimposedKN]) }))
    .toEqual([expect.objectContaining({ key: mixed })]);
  expect(teAt(result.blockedKeys[0]!, 'en')).toContain('roof and floor');
  expect(result).toMatchObject({ outcome: 'BLOCKED', cases: [], distributed: [], nodal: [], surface: [] });
}

function deadAt(result: ReturnType<typeof plan>, elevation: number) {
  expect(result.outcome, JSON.stringify(result.blockedKeys)).toBe('READY');
  return result.levels.find(level => level.elevation === elevation)?.superimposedKN;
}

it('#2543 review refuses partial upper beam bay exposure before assigning roof actions', () => {
  for (const gravity of [everyPanel, panels]) {
    for (const model of [stackedBays(), stackedBays(7, 10)]) {
      expectMixed(plan(model, { gravity, roof }));
    }
  }
});

it('#2543 review refuses partial upper beam bay exposure for snow and roof weight', () => {
  const model = stackedBays();
  expect.soft(() => roofWeightFor(model, everyPanel, 3, roof.dead)).toThrow(expect.objectContaining({ key: mixed }));
  expect.soft(() => snowDriftRefusal(model)).toThrow(expect.objectContaining({ key: mixed }));
  expectMixed(plan(model, { gravity: everyPanel, snow: enabledSnow }));
});

it('#2543 review blocks applying mixed actions to a restored beam model', () => {
  const model = stackedBays();
  modelStore.clear();
  try {
    const ids = new Map([...model.nodes].map(([id, { x, y, z }]) => [id, modelStore.addNode(x, y, z)]));
    for (const { nodeI, nodeJ } of model.elements.values()) modelStore.addElement(ids.get(nodeI)!, ids.get(nodeJ)!);
    modelStore.addNodalLoad3D(ids.get(1)!, 0, 0, -1, 0, 0, 0);
    modelStore.restore(JSON.parse(JSON.stringify(modelStore.snapshot())));
    const result = plan(modelStore.model, { gravity: everyPanel, snow: enabledSnow });
    expectMixed(result);
    const prior = modelStore.snapshot();
    expect(applyLoadPlan(result, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual(result.blockedKeys[0]);
    expect(modelStore.snapshot()).toEqual(prior);
  } finally {
    modelStore.clear();
  }
});

it('#2543 review retains uniform actions on both partly stacked beam bays', () => {
  const result = plan(stackedBays(), { gravity: everyPanel });
  expect(deadAt(result, 3)).toBeCloseTo(60, 10);
  expect(deadAt(result, 6)).toBeCloseTo(42, 10);
});

it('#2543 review accepts complete cover and edge contact for roof classification', () => {
  const options = { ...everyPanel, tributaryWidth: 3 };
  for (const [model, exposed] of [[stackedBays(0, 10), false], [stackedBays(10, 17), true]] as const) {
    const layout = gravityLayout(model, options);
    expect(layout.panels.find(panel => panel.z === 3)?.roof).toBe(exposed);
    expect(layout.areaByLevel.get(3)).toBeCloseTo(60, 10);
  }
});

it('#2543 review trims a lower bay covered at low clearance under a pitched overhang', () => {
  const model = pitchedCover(rectangle(0, 10), 10.5);
  const layout = gravityLayout(model, { ...panels, tributaryWidth: 3 });
  expect.soft(layout.panels.some(panel => panel.z === 3)).toBe(false);
  expect.soft(layout.pieces.some(piece => piece.elementId <= 4)).toBe(false);
  expect(deadAt(plan(model), 3)).toBe(0);
});

it('#2543 review clips the retained bay where local clearance crosses the headroom limit', () => {
  const model = pitchedCover([[0, 0], [10, 3], [0, 6]], 9);
  expect(deadAt(plan(model), 3)).toBeCloseTo(0.5 * 1 * 0.6, 10);
});

it('#2543 review clips a bare-member fringe at the same shell clearance limit', () => {
  const model = pitchedCover([[0, 3], [10, 3]], 9);
  const layout = gravityLayout(model, { ...panels, tributaryWidth: 3 });
  const member = layout.widthMembers.find(member => member.elementId === 1)!;
  expect(member).toBeDefined();
  const area = widthSpans(member, 3).reduce((sum, { t0, t1, width }) => sum + (t1 - t0) * width * member.horizontalLength, 0);
  expect(area).toBeCloseTo(3, 10);
  expect(deadAt(plan(model), 3)).toBeCloseTo(3, 10);
});

it('#2543 review retains a lower bay at storey clearance and when every panel is requested', () => {
  for (const [bandEdge, gravity] of [[-2, panels], [10.5, everyPanel]] as const) {
    expect(deadAt(plan(pitchedCover(rectangle(0, 10), bandEdge), { gravity }), 3)).toBeCloseTo(60, 10);
  }
});
