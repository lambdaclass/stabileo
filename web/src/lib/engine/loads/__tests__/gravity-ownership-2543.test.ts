import { expect, it } from 'vitest';
import type { Constraint3D } from '../../types-3d';
import { buildLoadPlan, roofWeightFor, type LoadModelData } from '../load-plan';
import { gravityLayout, MIN_STOREY_HEADROOM } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../../wasm-solver';
import { input } from './gravity-width-mass-fixture';
import { snowDriftRefusal } from '../snow-drift-loads';
import { teAt } from '../../../i18n/engine-text';
import { applyLoadPlan } from '../../../store/apply-load-plan';
import { modelStore } from '../../../store/index';

type Point = [number, number];
const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

function fixture() {
  const nodes: LoadModelData['nodes'] = new Map();
  const elements: LoadModelData['elements'] = new Map();
  const quads: NonNullable<LoadModelData['quads']> = new Map();
  const constraints: Constraint3D[] = [];
  const model = {
    nodes, elements, quads, constraints, loadCases: [],
    sections: new Map([[1, { id: 1, a: 0.1 }]]),
    materials: new Map([[1, { id: 1, rho: 25 }]]),
  } satisfies LoadModelData;
  const node = ([x, y]: Point, z: number) => {
    const id = nodes.size + 1;
    nodes.set(id, { id, x, y, z });
    return id;
  };
  const member = (nodeI: number, nodeJ: number, type: 'frame' | 'truss' = 'frame') => {
    const id = elements.size + 1;
    elements.set(id, { id, nodeI, nodeJ, type, sectionId: 1, materialId: 1 });
  };
  const ring = (points: Point[], z: number, type: 'frame' | 'truss' = 'frame') => {
    const ids = points.map(point => node(point, z));
    ids.forEach((id, i) => member(id, ids[(i + 1) % ids.length]!, type));
    return ids;
  };
  const quad = (ids: number[]) => {
    const id = quads.size + 1;
    quads.set(id, { id, nodes: ids, materialId: 1, thickness: 0.1 });
  };
  const shell = (points: Point[], z: number) => {
    const ids = points.map(point => node(point, z));
    quad(ids);
    return ids;
  };
  const eccentric = (masterNode: number, slaveNode: number, released = false) => {
    const a = nodes.get(masterNode)!, b = nodes.get(slaveNode)!;
    constraints.push({
      type: 'eccentricConnection', masterNode, slaveNode,
      offsetX: b.x - a.x, offsetY: b.y - a.y, offsetZ: b.z! - a.z!,
      releases: [false, false, released],
    });
  };
  return { model, node, member, ring, quad, shell, eccentric };
}

function shadowedBay({ rise = 0.02, attachedToBay = false, released = false } = {}) {
  const { model, ring, shell, eccentric } = fixture();
  const points = rectangle(0, 0, 10, 6);
  const bay = ring(points, 3);
  const lower = shell(points, 3);
  const upper = shell(points, 3 + rise);
  lower.slice(0, 2).forEach((id, i) => {
    if (!released) model.constraints.push({ type: 'equalDOF', masterNode: id, slaveNode: upper[i]!, dofs: [2] });
    if (attachedToBay) eccentric(bay[i]!, id);
  });
  return model;
}

function shiftedShells({ delta = 0.01, rise = 0.02, released = false, gap = 0 } = {}) {
  const { model, shell, eccentric } = fixture();
  const lower = shell(rectangle(0, 0, 10, 6), 3);
  const upper = shell([[2 + gap, 0], [12 + gap + delta, 0], [12 + gap, 6], [2 + gap, 6]], 3 + rise);
  eccentric(lower[0]!, upper[0]!);
  eccentric(lower[1]!, upper[1]!, released);
  return model;
}

function openingWithLowHeadroom(withShell = true) {
  const { model, node, member, ring, quad } = fixture();
  const outline = rectangle(0, 0, 6, 6);
  const outer = ring(outline, 3);
  outer.forEach((id, i) => member(node(outline[i]!, 0), id));
  if (withShell) quad(ring(rectangle(0.5, 0.5, 1.5, 1.5), 3));
  ring(outline, 4, 'truss');
  member(node([3, 0], 4), node([3, 6], 4));
  member(node([0, 3], 4), node([6, 3], 4));
  return model;
}

function planFor(model: LoadModelData, loadEveryPanel = false, tributaryWidth = 3) {
  return buildLoadPlan(input(model, { gravity: { mode: 'panels', loadEveryPanel }, tributaryWidth }));
}

function expectRefusal(plan: ReturnType<typeof planFor>, key: string) {
  expect(plan.blockedKeys).toEqual([expect.objectContaining({ key })]);
  expect(plan.outcome).toBe('BLOCKED');
  expect(plan.cases).toEqual([]);
  expect(plan.distributed).toEqual([]);
  expect(plan.nodal).toEqual([]);
  expect(plan.surface).toEqual([]);
}

it.each([false, true])('#2543 unequal eccentric offsets require explicit ownership (%s)', every => {
  expectRefusal(planFor(shiftedShells(), every), 'loadPlan.gravity.overlappingShells');
});

it.each([false, true])('#2543 coincident shell overlap cannot be loaded twice (%s)', every => {
  expectRefusal(planFor(shadowedBay(), every), 'loadPlan.gravity.overlappingShells');
});

it('#2543 clips the owned annulus without restoring a shell-filled hole', () => {
  const plan = planFor(openingWithLowHeadroom());
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(plan.levels.find(level => level.elevation === 3)?.superimposedKN).toBeCloseTo(4 * 1.5 ** 2, 10);
  expect(plan.surface.filter(load => load.caseType === 'D')).toMatchObject([{ quadId: 1, q: 1 }]);
  expect(planFor(openingWithLowHeadroom(), true).levels.find(level => level.elevation === 3)?.superimposedKN).toBeCloseTo(36, 10);
});

it('#2543 clips a strip across a larger shell-filled opening', () => {
  const { model, node, member, ring, quad } = fixture();
  const outline = rectangle(0, 0, 10, 6);
  ring(outline, 3);
  quad(ring(rectangle(2, 2, 4, 4), 3));
  ring(outline, 4, 'truss');
  member(node([0, 3], 4), node([10, 3], 4));
  const plan = planFor(model, false, 1);
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(plan.levels.find(level => level.elevation === 3)?.superimposedKN).toBeCloseTo(52, 10);
});

it('#2543 inclined fringe member preserves transferred plan first moments', () => {
  const model = openingWithLowHeadroom(false);
  model.nodes.get(2)!.z = 3.0004;
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 3 });
  const inclined = layout.pieces.filter(piece => piece.elementId === 1 || piece.elementId === 2);
  expect(planFor(model).outcome).toBe('READY');
  expect(inclined.length).toBeGreaterThan(0);
  let area = 0, xMoment = 0, yMoment = 0;
  const add = (x: number, y: number, a: number) => { area += a; xMoment += x * a; yMoment += y * a; };
  for (const p of layout.pieces) {
    const beam = model.elements.get(p.elementId)!;
    const i = model.nodes.get(beam.nodeI)!, j = model.nodes.get(beam.nodeJ)!;
    const length = Math.hypot(j.x - i.x, j.y - i.y, j.z! - i.z!);
    const a = p.a ?? 0, b = p.b ?? length, mid = (a + b) / (2 * length);
    add(i.x + mid * (j.x - i.x), i.y + mid * (j.y - i.y), (b - a) * (p.wI + p.wJ) / 2);
  }
  for (const p of layout.points) {
    const node = model.nodes.get(p.nodeId)!;
    add(node.x, node.y, p.w);
  }
  expect(area).toBeCloseTo(9, 10);
  expect(xMoment).toBeCloseTo(27, 10);
  expect(yMoment).toBeCloseTo(27, 10);
});

it('#2543 cover entirely in a hole leaves the annulus exposed', () => {
  const { model, ring, shell, quad } = fixture();
  ring(rectangle(0, 0, 10, 10), 3);
  quad(ring(rectangle(3, 3, 7, 7), 3));
  const upper = shell(rectangle(4, 4, 6, 6), 7);
  const options = { mode: 'panels', loadEveryPanel: true, tributaryWidth: 3 } as const;
  expect(() => gravityLayout(model, options)).toThrow(expect.objectContaining({ key: 'loadPlan.gravity.mixedExposure' }));
  const uniform = gravityLayout(model, { ...options, uniformPressure: true });
  expect(planFor(model, true).outcome).toBe('READY');
  expect(uniform.panels.find(panel => panel.z === 3)?.roof).toBe(true);
  rectangle(3, 3, 7, 7).forEach(([x, y], i) => Object.assign(model.nodes.get(upper[i]!)!, { x, y }));
  const layout = gravityLayout(model, options);
  expect(layout.panels.find(panel => panel.z === 3)?.roof).toBe(true);
  expect(layout.roofShells).toEqual(new Set(['quad:2']));
});

for (const mode of ['panels', 'width'] as const) it(`#2543 pitched shell covers the lower roof at its high end in ${mode}`, () => {
  const { model, shell, quad, node } = fixture();
  shell(rectangle(6, 1, 8, 3), 3.3);
  quad(rectangle(0, 0, 10, 4).map(p => node(p, 3 + p[0] / 5)));
  const options = { mode, loadEveryPanel: true, tributaryWidth: 3 };
  const layout = gravityLayout(model, options);
  expect(buildLoadPlan(input(model, { gravity: options })).outcome).toBe('READY');
  expect([...layout.roofShells]).toEqual(['quad:2']);
});

for (const mode of ['panels', 'width'] as const) it(`#2543 exact midpoint outside the cover receives roof dead pressure in ${mode}`, () => {
  const { model, shell, member, node } = fixture();
  const end = node([1 + Number.EPSILON, 2], 3);
  member(node([1, 0], 3), end);
  shell(rectangle(-1, -1, 1, 3), 6);
  const roof = { use: 'occupancy', weight: 'heavy', dead: 2, slopePercent: 0 } as const;
  for (const [x, expected] of [[1 + Number.EPSILON, -2], [1, -1], [1 - Number.EPSILON, -1], [1.125, -2]] as const) {
    model.nodes.get(end)!.x = x;
    const layout = gravityLayout(model, { mode, tributaryWidth: 1 });
    const actions = planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 2, liveOf: () => 2 }, roof });
    expect(actions.distributed.filter(load => load.elementId === 1 && load.caseType === 'D'))
      .toMatchObject([{ q: expected }]);
    expect((expected === -2 ? layout.roofAreaOf : layout.areaOf).get(1)).toBeCloseTo(Math.hypot(x - 1, 2), 10);
  }
});

function inclinedParallelDeck(gap: number, ties: number, dof: number) {
  const { model, ring, quad, node } = fixture();
  const outline = rectangle(0, 0, 10, 6);
  const bay = ring(outline, 3);
  bay.forEach(id => { const p = model.nodes.get(id)!; p.z = p.x === 0 ? 2.9996 : 3.0004; });
  const upper = outline.map((p, i) => node(p, model.nodes.get(bay[i]!)!.z! + gap));
  quad(upper);
  for (let i = 0; i < ties; i++) {
    model.constraints.push({ type: 'equalDOF', masterNode: bay[i]!, slaveNode: upper[i]!, dofs: [dof] });
  }
  return model;
}

for (const every of [false, true]) it(`#2543 inclined overlapping decks with vertical equality need ownership (${every})`, () => {
  for (const ties of [1, 4]) {
    const model = inclinedParallelDeck(0.0502, ties, 2);
    const key = 'loadPlan.gravity.offsetShellDeck';
    const gravity = { mode: 'panels', loadEveryPanel: every } as const;
    const plan = planFor(model, every);
    expectRefusal(plan, key);
    expect(teAt(plan.blockedKeys[0]!, 'en')).toContain('assign the area load once by hand');
    expect(() => gravityLayout(model, { ...gravity, tributaryWidth: 3 })).toThrow(expect.objectContaining({ key }));
    expect(() => roofWeightFor(model, gravity, 3, 1)).toThrow(expect.objectContaining({ key }));
    expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining({ key }));
  }
});

it.each([false, true])('#2543 independent inclined decks follow automatic headroom and explicit selection (%s)', every => {
  for (const ties of [0, 4]) for (const gap of [0.0502, MIN_STOREY_HEADROOM + 0.001]) {
    const plan = planFor(inclinedParallelDeck(gap, ties, 0), every);
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    const bayArea = every || gap > MIN_STOREY_HEADROOM ? 60 : 0;
    expect(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo(bayArea + 6 * Math.hypot(10, 0.0008), 10);
  }
});

it('#2543 a partly covered beam bay needs an explicit roof and floor assignment', () => {
  const { model, ring, shell } = fixture();
  ring(rectangle(0, 0, 10, 6), 3);
  shell(rectangle(0, 0, 7, 6), 6);
  const roof = { use: 'maintenance', weight: 'heavy', dead: 1, slopeDeg: 0 } as const;
  const gravity = { mode: 'panels' } as const;
  expectRefusal(buildLoadPlan(input(model, { gravity, roof })), 'loadPlan.gravity.mixedExposure');
});

it('#2543 inclined fringe line loads use physical member station and intensity', () => {
  const model = openingWithLowHeadroom(false);
  const flat = planFor(model, false, 2);
  model.nodes.get(2)!.z = 3.0004;
  const inclined = planFor(model, false, 2);
  expect(flat.outcome).toBe('READY');
  expect(inclined.outcome).toBe('READY');
  const pieces = (plan: typeof flat) => plan.distributed.filter(load => load.caseType === 'D' && load.elementId === 1);
  const flatPieces = pieces(flat), inclinedPieces = pieces(inclined);
  expect(flatPieces.length).toBeGreaterThan(0);
  expect(inclinedPieces).toHaveLength(flatPieces.length);
  const cosine = 6 / Math.hypot(6, 0.0004);
  for (const [i, load] of inclinedPieces.entries()) {
    const expected = flatPieces[i]!;
    expect(load.a).toBeCloseTo(expected.a! / cosine, 10);
    expect(load.b).toBeCloseTo(expected.b! / cosine, 10);
    expect(load.q).toBeCloseTo(expected.q * cosine, 10);
  }
});

it('#2543 restored preview refuses the overlapping tied bay before apply', () => {
  const model = inclinedParallelDeck(0.0502, 4, 2);
  modelStore.clear();
  try {
    const ids = new Map([...model.nodes].map(([id, { x, y, z }]) => [id, modelStore.addNode(x, y, z)]));
    for (const { nodeI, nodeJ } of model.elements.values()) modelStore.addElement(ids.get(nodeI)!, ids.get(nodeJ)!);
    for (const quad of model.quads.values()) {
      const [a, b, c, d] = quad.nodes.map(id => ids.get(id)!);
      modelStore.addQuad([a!, b!, c!, d!], modelStore.materials.keys().next().value!, quad.thickness!);
    }
    for (const tie of model.constraints) if (tie.type === 'equalDOF') {
      modelStore.addConstraint({ ...tie, masterNode: ids.get(tie.masterNode)!, slaveNode: ids.get(tie.slaveNode)! });
    }
    modelStore.addNodalLoad3D(ids.get(1)!, 0, 0, -1, 0, 0, 0);
    modelStore.restore(JSON.parse(JSON.stringify(modelStore.snapshot())));
    const plan = planFor(modelStore.model, true);
    expectRefusal(plan, 'loadPlan.gravity.offsetShellDeck');
    const prior = modelStore.snapshot();
    expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual(plan.blockedKeys[0]);
    expect(modelStore.snapshot()).toEqual(prior);
  } finally {
    modelStore.clear();
  }
});


it('#2543 independently grounded bay and shell ties retain both load carriers', () => {
  const model = inclinedParallelDeck(0.0502, 0, 2);
  const master = 9;
  model.nodes.set(master, { id: master, x: 0, y: 0, z: 0 });
  for (const slaveNode of [1, 5]) model.constraints.push({ type: 'equalDOF', masterNode: master, slaveNode, dofs: [2] });
  const supported: LoadModelData = { ...model, supports: new Map([[1, { id: 1, nodeId: master, type: 'fixed3d' }]]) };
  expectRefusal(planFor(model, true), 'loadPlan.gravity.offsetShellDeck');
  const plan = planFor(supported, true);
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo(60 * (1 + Math.hypot(10, 0.0008) / 10), 10);
});

it('#2543 a vertically tied, separated storey retains its independent load', () => {
  const gap = MIN_STOREY_HEADROOM + 0.125;
  const model = inclinedParallelDeck(gap, 4, 2);
  for (const every of [false, true]) {
    const plan = planFor(model, every);
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    expect(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo(60 * (1 + Math.hypot(10, 0.0008) / 10), 10);
  }
});

it('#2543 a subdivided rigid attachment keeps the shifted member load on the shell', () => {
  const { model, member, node, quad } = fixture();
  const start = node([0, 0], 3), end = node([10, 0], 3);
  member(start, end);
  const anchors = [node([0, 0], 3.01), node([10, 0], 3.01)];
  const corners = [node([0, 0], 3.02), node([10, 0], 3.02)];
  quad([...corners, node([10, 6], 3.02), node([0, 6], 3.02)]);
  for (const [i, frame] of [start, end].entries()) {
    model.constraints.push({ type: 'rigidLink', masterNode: frame, slaveNode: anchors[i]!, dofs: [2] },
      { type: 'rigidLink', masterNode: anchors[i]!, slaveNode: corners[i]!, dofs: [2] });
  }
  for (const every of [false, true]) {
    const plan = planFor(model, every);
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    expect(plan.distributed).toEqual([]);
    expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([{ quadId: 1, q: 1, caseType: 'D' }]);
    expect(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo(60, 10);
  }
});

it('#2543 solves the generated inclined fringe force and moment in both WASM dimensions', () => {
  const model = openingWithLowHeadroom(false);
  const deadOnCarrier = (plan: ReturnType<typeof planFor>) =>
    plan.distributed.filter(load => load.caseType === 'D' && load.elementId === 1);
  const flat = deadOnCarrier(planFor(model));
  expect(flat.length).toBeGreaterThan(0);
  const force = flat.reduce((sum, load) => sum - load.q * (load.b! - load.a!), 0);
  const moment = flat.reduce((sum, load) => sum - load.q * (load.b! ** 2 - load.a! ** 2) / 2, 0);
  const rise = 0.0004;
  model.nodes.get(2)!.z = 3 + rise;
  const inclined = deadOnCarrier(planFor(model));
  expect(inclined).toHaveLength(flat.length);
  for (const load of inclined) expect(load.qJ ?? load.q).toBe(load.q);

  const cosine = 6 / Math.hypot(6, rise);
  const reference = flat.map(load => ({ ...load, a: load.a! / cosine, b: load.b! / cosine,
    q: load.q * cosine, qJ: (load.qJ ?? load.q) * cosine }));
  const reactions = (space: boolean, loads: typeof inclined) => {
    modelStore.clear();
    try {
      const a = modelStore.addNode(0, 0, 3);
      const b = modelStore.addNode(6, 0, 3 + rise);
      const el = modelStore.addElement(a, b);
      modelStore.addSupport(a, space ? 'fixed3d' : 'fixed');
      for (const load of loads) {
        if (space) modelStore.addDistributedLoad3D(el, 0, 0, load.q, load.qJ ?? load.q, load.a, load.b, undefined, { frame: 'global' });
        else modelStore.addDistributedLoad(el, load.q, load.qJ, 0, true, undefined, load.a, load.b);
      }
      if (space) {
        const wire = modelStore.buildSolverInput3D()!;
        const nonlinear = solvePDelta3D(wire);
        expect(nonlinear.converged).toBe(true);
        const linear = solve3D(wire).reactions[0]!;
        return [linear, nonlinear.results.reactions[0]!] as const;
      }
      const wire = modelStore.buildSolverInput(false, 'xz')!;
      const nonlinear = solvePDelta(wire);
      expect(nonlinear.converged).toBe(true);
      const linear = solve(wire).reactions[0]!;
      const secondOrder = nonlinear.results.reactions[0]!;
      return [{ fz: linear.rz, my: linear.my }, { fz: secondOrder.rz, my: secondOrder.my }] as const;
    } finally {
      modelStore.clear();
    }
  };
  for (const space of [false, true]) {
    const [linear, secondOrder] = reactions(space, inclined);
    const [, expected] = reactions(space, reference);
    expect(linear.fz).toBeCloseTo(force, 9);
    expect(Math.abs(linear.my)).toBeCloseTo(moment, 9);
    expect(secondOrder.fz).toBeCloseTo(expected.fz, 9);
    expect(secondOrder.my).toBeCloseTo(expected.my, 9);
  }
});

const replayLocalBay = process.env.RUN_KNOWN_WRONG === '2607' ? it : it.skip;

replayLocalBay('known wrong result: #2607 a separately supported pitched roof clears the bay across their overlap', () => {
  const { model, ring, quad, node } = fixture();
  const lower = ring(rectangle(2, 0, 6, 4), 3);
  const upper = rectangle(0, 0, 6, 4).map(point => node(point, 2.75 + point[0] / 4));
  quad(upper);
  const supported: LoadModelData = {
    ...model,
    supports: new Map([...lower, ...upper].map(id => [id, { id, nodeId: id, type: 'fixed3d' }])),
  };
  const layout = gravityLayout(supported, { mode: 'panels', tributaryWidth: 3 });
  expect.soft([...layout.areaOf.values()].reduce((sum, area) => sum + area, 0)).toBeCloseTo(16, 10);
  const plan = planFor(supported);
  expect.soft(plan.outcome).toBe('READY');
  expect.soft(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo(16 + 4 * Math.hypot(6, 1.5), 10);
});
