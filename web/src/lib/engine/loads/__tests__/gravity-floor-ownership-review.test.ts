import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { solve_3d, solve_pdelta_3d } from '../../../wasm/dedaliano_engine.js';
import { modelStore } from '../../../store/model.svelte';
import '../../../store/index';
import { applyLoadPlan } from '../../../store/apply-load-plan';
import type { EngineMessage } from '../../../codes/message';
import { teAt } from '../../../i18n/engine-text';
import type { Load } from '../../../store/model.svelte';
import { buildSolverLoads3D } from '../../solver-service';
import type { AnalysisResults3D, Constraint3D } from '../../types-3d';
import { gravityLayout, MAX_DECK_SPAN, MIN_STOREY_HEADROOM } from '../plan-gravity';
import { buildLoadPlan, roofWeightFor, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { snowDriftRefusal } from '../snow-drift-loads';
import { input } from './gravity-width-mass-fixture';
import { offsetRoof } from './gravity-offset-roof-fixture';

const area = 10 * 6;
const shellThickness = 0.1;
const pressure = 1;
const roof = { use: 'maintenance', weight: 'heavy', dead: pressure, slopeDeg: 0 } as const;
const template = JSON.parse(readFileSync(new URL('../../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];

function modelFixture() {
  const nodes: LoadModelData['nodes'] = new Map();
  const elements: LoadModelData['elements'] = new Map();
  const quads = new Map<number, { id: number; nodes: [number, number, number, number]; materialId: number; thickness: number }>();
  const constraints: Constraint3D[] = [];
  const model = {
    nodes, elements, quads, constraints, loadCases: [],
    sections: new Map([[1, { id: 1, a: 0.1 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]),
  } satisfies LoadModelData;
  const node = (x: number, y: number, z: number) => {
    const id = nodes.size + 1;
    nodes.set(id, { id, x, y, z });
    return id;
  };
  const row = (x: number, z: number) => [node(x, 0, z), node(x, 6, z)] as const;
  const beam = (nodeI: number, nodeJ: number) => {
    const id = elements.size + 1;
    elements.set(id, { id, nodeI, nodeJ, type: 'frame', sectionId: 1, materialId: 1 });
  };
  const shell = ([a, d]: ReturnType<typeof row>, [b, c]: ReturnType<typeof row>) => {
    const id = quads.size + 1;
    quads.set(id, { id, nodes: [a, b, c, d], materialId: 1, thickness: shellThickness });
  };
  const tieRows = (masters: ReturnType<typeof row>, slaves: ReturnType<typeof row>) => {
    masters.forEach((masterNode, i) => constraints.push({ type: 'equalDOF', masterNode, slaveNode: slaves[i]!, dofs: [2] }));
  };
  return { model, node, row, beam, shell, tieRows };
}

function directlyTiedPlatforms(upper = 6) {
  const { model, row, shell, tieRows } = modelFixture();
  const lowerLeft = row(0, 3), upperLeft = row(0, upper);
  shell(lowerLeft, row(10, 3));
  shell(upperLeft, row(10, upper));
  tieRows(lowerLeft, upperLeft);
  return model;
}

function stubAttachedShellBay() {
  const { model, row, beam, shell, tieRows } = modelFixture();
  const left = row(0, 3), right = row(10, 3), stubs = row(5, 3);
  beam(left[0], right[0]);
  beam(right[0], right[1]);
  beam(right[1], left[1]);
  beam(left[1], left[0]);
  beam(left[0], stubs[0]);
  beam(left[1], stubs[1]);
  const seam = row(5, 3.02);
  shell(row(0, 3.02), seam);
  shell(seam, row(10, 3.02));
  tieRows(stubs, seam);
  return model;
}

function subdividedShellBay(withIndependentOverhead = false, shellZ = 2.96) {
  const { model, row, beam, shell } = modelFixture();
  const left = row(0, 3), center = row(5, 3), right = row(10, 3);
  for (const [a, b] of [[left, center], [center, right]] as const) {
    beam(a[0], b[0]);
    beam(a[1], b[1]);
  }
  for (const [a, b] of [left, center, right]) beam(a, b);
  const shellLeft = row(0, shellZ), shellRight = row(10, shellZ);
  shell(shellLeft, shellRight);
  [...left, ...right].forEach((masterNode, i) => model.constraints.push({
    type: 'rigidLink', masterNode, slaveNode: [...shellLeft, ...shellRight][i]!, dofs: [0, 1, 2, 3, 4, 5],
  }));
  if (withIndependentOverhead) beam(...row(5, 6));
  return model;
}

function deadResultant(model: LoadModelData, loadEveryPanel: boolean, shellOwners: number[], expectedArea: number, planArea = expectedArea) {
  const gravity = { mode: 'panels', loadEveryPanel } as const;
  const plan = buildLoadPlan(input(model, { gravity }));
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(plan.surface.filter(load => load.caseType === 'D').map(load => load.quadId).sort()).toEqual(shellOwners);
  expect(plan.levels.reduce((total, level) => total + level.superimposedKN, 0)).toBeCloseTo(expectedArea * pressure, 10);
  const layout = gravityLayout(model, { ...gravity, tributaryWidth: 3 });
  expect([...layout.areaByLevel.values()].reduce((total, level) => total + level, 0)).toBeCloseTo(planArea, 10);
  expect(() => snowDriftRefusal(model)).not.toThrow();
}

it('#2512 two direct vertical ties preserve loads on separate storeys', () => {
  for (const loadEveryPanel of [false, true]) deadResultant(directlyTiedPlatforms(), loadEveryPanel, [1, 2], 2 * area);
});

it('#2512 tied shells require clear separation', () => {
  for (const loadEveryPanel of [false, true]) {
    deadResultant(directlyTiedPlatforms(3.051), loadEveryPanel, [1, 2], 2 * area);
    for (const z of [3.049, 3.05]) expectPanelRefusal(directlyTiedPlatforms(z), shadowRefusal, loadEveryPanel);
  }
});

it('#2512 one or two offset stub stations cannot establish a shared deck', () => {
  for (const loadEveryPanel of [false, true]) {
    const model = stubAttachedShellBay();
    expectPanelRefusal(model, separateBayRefusal, loadEveryPanel);
    model.constraints.pop();
    expectPanelRefusal(model, separateBayRefusal, loadEveryPanel);
  }
});

it('#2512 the centre beam in a subdivided bay leaves its own shell exposed', () => {
  for (const loadEveryPanel of [false, true]) {
    const gravity = { mode: 'panels', loadEveryPanel } as const;
    const model = subdividedShellBay();
    const isolated = { ...model, elements: new Map() };
    const expected = buildLoadPlan(input(isolated, { gravity, roof })).surface.filter(load => load.caseType === 'Lr');
    expect(expected).toHaveLength(1);
    const plan = buildLoadPlan(input(model, { gravity, roof }));
    expect(plan.surface.filter(load => load.caseType === 'Lr')).toEqual(expected);
    expect(gravityLayout(model, { ...gravity, tributaryWidth: 3 }).roofQuads.has(1)).toBe(true);
    expect(roofWeightFor(model, gravity, 3, 0)).toBe(roofWeightFor(isolated, gravity, 3, 0));
    const covered = subdividedShellBay(true);
    expect(gravityLayout(covered, { ...gravity, tributaryWidth: 3 }).roofQuads.has(1)).toBe(false);
    expect(buildLoadPlan(input(covered, { gravity, roof })).surface.filter(load => load.caseType === 'Lr')).toEqual([]);
    const separate = subdividedShellBay(false, 2.8);
    expect(gravityLayout(separate, { ...gravity, tributaryWidth: 3 }).roofQuads.has(1)).toBe(false);
    expect(buildLoadPlan(input(separate, { gravity, roof })).surface.filter(load => load.caseType === 'Lr')).toEqual([]);
    deadResultant(separate, loadEveryPanel, [1], 2 * area);
  }
});

function checkWasmReactions(model: LoadModelData, loads: Load[], expected: number) {
  const freeVertical = new Set(model.constraints?.flatMap(constraint => constraint.type === 'equalDOF' ? [constraint.slaveNode] : []));
  const shell = model.quads?.get(1);
  freeVertical.add(shell?.nodes[1] ?? model.elements.values().next().value!.nodeI);
  const supports = new Map([...model.nodes.keys()].map(nodeId => [
    nodeId, { nodeId, rx: true, ry: true, rz: !freeVertical.has(nodeId), rrx: true, rry: true, rrz: true },
  ]));
  const solverInput = {
    ...structuredClone(template),
    nodes: Object.fromEntries(model.nodes), elements: Object.fromEntries(model.elements),
    quads: Object.fromEntries(model.quads ?? []), constraints: model.constraints,
    supports: Object.fromEntries(supports),
    loads: buildSolverLoads3D({ ...model, supports, loads } as never, loads, false, false),
  };
  const nonlinear = JSON.parse(solve_pdelta_3d(JSON.stringify(solverInput), 100, 1e-10));
  expect(nonlinear.converged).toBe(true);
  const totals = ([solve_3d(solverInput), nonlinear.results] as AnalysisResults3D[]).map(result =>
    result.reactions.reduce((total, reaction) => total + reaction.fz, 0));
  expect(totals).toEqual([expect.closeTo(expected, 8), expect.closeTo(expected, 8)]);
}

function checkPlanReactions(model: LoadModelData, caseType: 'D' | 'Lr', expected: number, gravity: LoadPlanInput['gravity'] = { mode: 'panels' }) {
  const plan = buildLoadPlan(input(model, { gravity, ...(caseType === 'Lr' ? { roof } : {}) }));
  const loads: Load[] = [];
  for (const load of plan.surface.filter(load => load.caseType === caseType)) {
    loads.push({ type: 'surface3d', data: { id: loads.length + 1, quadId: load.quadId, q: load.q } });
  }
  for (const load of plan.distributed.filter(load => load.caseType === caseType)) {
    loads.push({ type: 'distributed3d', data: {
      id: loads.length + 1, elementId: load.elementId, qYI: 0, qYJ: 0,
      qZI: load.q, qZJ: load.qJ ?? load.q, a: load.a, b: load.b, frame: load.frame,
    } });
  }
  for (const load of plan.nodal.filter(load => load.caseType === caseType)) {
    loads.push({ type: 'nodal3d', data: { id: loads.length + 1, nodeId: load.nodeId, fx: 0, fy: 0, fz: load.fz, mx: 0, my: 0, mz: 0 } });
  }
  checkWasmReactions(model, loads, expected);
}

it('#2512 WASM reactions include both directly tied storeys', () => {
  checkPlanReactions(directlyTiedPlatforms(), 'D', 2 * area * pressure);
});



it('#2512 WASM reactions include roof live load below the same-deck beam', () => {
  const model = subdividedShellBay();
  const isolated = buildLoadPlan(input({ ...model, elements: new Map() }, { gravity: { mode: 'panels' }, roof }));
  const expected = isolated.surface.find(load => load.caseType === 'Lr')!.q * area;
  expect(expected).toBeGreaterThan(0);
  checkPlanReactions(model, 'Lr', expected);
});

type ReviewModel = ReturnType<typeof modelFixture>['model'];

function restoreAndPlan(model: LoadModelData, setRoof = false) {
  modelStore.clear();
  const nodes = new Map([...model.nodes].map(([id, { x, y, z }]) => [id, modelStore.addNode(x, y, z)]));
  const materialId = modelStore.model.materials.keys().next().value!;
  const quads = [...model.quads?.values() ?? []].map(({ nodes: [a, b, c, d] }) =>
    modelStore.addQuad([nodes.get(a!)!, nodes.get(b!)!, nodes.get(c!)!, nodes.get(d!)!], materialId, shellThickness));
  for (const { nodeI, nodeJ } of model.elements.values()) modelStore.addElement(nodes.get(nodeI)!, nodes.get(nodeJ)!);
  for (const constraint of model.constraints ?? []) {
    if (constraint.type === 'equalDOF' || constraint.type === 'eccentricConnection' || constraint.type === 'rigidLink') modelStore.addConstraint({
      ...constraint, masterNode: nodes.get(constraint.masterNode)!, slaveNode: nodes.get(constraint.slaveNode)!,
    });
  }
  modelStore.restore(JSON.parse(JSON.stringify(modelStore.snapshot())));
  const snapshot = modelStore.model;
  const plan = buildLoadPlan(input(snapshot, {
    gravity: { mode: 'panels' },
    ...(setRoof ? { roof } : {}),
  }));
  return { quads, plan };
}

function applyDeadPressure(model: LoadModelData) {
  const { quads, plan } = restoreAndPlan(model);
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf: key => key })).toBeUndefined();
  const dead = modelStore.model.loadCases.find(loadCase => loadCase.type === 'D')!;
  return { quads, loads: modelStore.model.loads.filter(load => load.data.caseId === dead.id) };
}

it('#2512 restored directly tied storeys both receive applied pressure', () => {
  const { quads, loads } = applyDeadPressure(directlyTiedPlatforms());
  expect(loads.map(load => load.data)).toEqual(quads.map(quadId => expect.objectContaining({ quadId, q: pressure })));
});

it('#2512 restored stub ties refuse ambiguous shell ownership', () => {
  const { plan } = restoreAndPlan(stubAttachedShellBay());
  const before = modelStore.snapshot();
  expect(plan.outcome).toBe('BLOCKED');
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual(separateBayRefusal);
  expect(modelStore.snapshot()).toEqual(before);
});

it('#2512 restored subdivided bay previews uniform roof live load and refuses apply', () => {
  const model = subdividedShellBay();
  const { quads, plan } = restoreAndPlan(model, true);
  const isolated = buildLoadPlan(input({ ...model, elements: new Map() }, { gravity: { mode: 'panels' }, roof }));
  const expected = isolated.surface.filter(load => load.caseType === 'Lr');
  expect(expected).toHaveLength(1);
  expect(plan.surface.filter(load => load.caseType === 'Lr')).toEqual(expected.map(load => ({ ...load, quadId: quads[0] })));
  expect(plan.outcome).toBe('BLOCKED');
  const before = modelStore.snapshot();
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual({ key: 'loadPlan.blocked.concentratedRoof' });
  expect(modelStore.snapshot()).toEqual(before);
});

function tiedShellBay(shellZ: number, endZ = shellZ, tied = true, start = 0) {
  const { model, row, beam, shell, tieRows } = modelFixture();
  const left = row(0, 3), right = row(10, 3);
  beam(left[0], right[0]);
  beam(right[0], right[1]);
  beam(right[1], left[1]);
  beam(left[1], left[0]);
  const shellLeft = row(start, shellZ);
  shell(shellLeft, row(10, endZ));
  if (tied) tieRows(left, shellLeft);
  return model;
}

it('#2512 two aligned stations keep the elevated shell and lower bay independent', () => {
  for (const loadEveryPanel of [false, true]) {
    const model = tiedShellBay(6);
    deadResultant(model, loadEveryPanel, [1], 2 * area);
    model.constraints = model.constraints.map(constraint => {
      if (constraint.type !== 'equalDOF') return constraint;
      return { type: 'rigidLink', masterNode: constraint.masterNode, slaveNode: constraint.slaveNode };
    });
    deadResultant(model, loadEveryPanel, [1], 2 * area);
  }
});

it('#2512 a partial attachment is ambiguous inside the separation limit', () => {
  for (const loadEveryPanel of [false, true]) {
    expectPanelRefusal(tiedShellBay(3.049), separateBayRefusal, loadEveryPanel);
  }
  deadResultant(tiedShellBay(3.051), true, [1], 2 * area);
  const separatedSlope = tiedShellBay(3.051, 3.06);
  deadResultant(separatedSlope, true, [1], area + 6 * Math.hypot(10, 0.009), 2 * area);
});

it('#2512 a near-level shell extending beyond the bay does not own it', () => {
  expectPanelRefusal(tiedShellBay(2.9989, 2.9998, false, -10), separateBayRefusal, true);
});

it('#2512 3D linear and nonlinear WASM reactions include the shell and separate bay', () => {
  checkPlanReactions(tiedShellBay(6), 'D', 2 * area * pressure);
});

it('#2512 applying a restored model emits beam loads for the separate bay', () => {
  const { quads, loads } = applyDeadPressure(tiedShellBay(6));
  const surfaces = loads.filter(load => load.type === 'surface3d');
  expect(surfaces.map(load => load.data)).toEqual(quads.map(quadId => expect.objectContaining({ quadId, q: pressure })));
  const beams = loads.filter(load => load.type === 'distributed3d');
  expect(new Set(beams.map(load => load.data.elementId)).size).toBe(4);
  const model = modelStore.model;
  const resultant = beams.reduce((sum, { data }) => {
    const beam = model.elements.get(data.elementId)!;
    const a = model.nodes.get(beam.nodeI)!, b = model.nodes.get(beam.nodeJ)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return sum - (data.qZI + data.qZJ) / 2 * ((data.b ?? length) - (data.a ?? 0));
  }, 0);
  expect(resultant).toBeCloseTo(area * pressure, 10);
});

it('#2512 a rigid offset cannot make a separate rafter part of the roof shell', () => {
  for (const loadEveryPanel of [false, true]) for (const offset of [-3, 0.049, 0.05, MIN_STOREY_HEADROOM, MIN_STOREY_HEADROOM + 0.125, 3]) {
    const model = offsetRoof(offset).model;
    const gravity = { mode: 'panels', loadEveryPanel } as const;
    const plan = buildLoadPlan(input(model, { gravity }));
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    expect(plan.distributed.filter(load => load.caseType === 'D')).toEqual(offset <= 0.05 && offset > 0 ? [] : [
      { caseType: 'D', elementId: 1, q: -3 * pressure, frame: 'global' },
    ]);
    expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([{ caseType: 'D', quadId: 1, q: pressure }]);
  }
});

it('#2512 shell shadowing requires a final owner within the deck boundary', () => {
  const { model, row, shell, tieRows } = modelFixture();
  const station = [3, 3.04, 3.08].map(z => {
    const left = row(0, z);
    shell(left, row(10, z));
    return left;
  });
  tieRows(station[0]!, station[1]!);
  tieRows(station[1]!, station[2]!);
  const plan = buildLoadPlan(input(model, { gravity: { mode: 'panels' } }));
  expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.gravity.overlappingShells', params: { first: 1, second: 2 } }]);
  expect(plan).toMatchObject({ outcome: 'BLOCKED', distributed: [], nodal: [], surface: [] });
});

it('#2512 an offset shell cannot pass its bay to a shadowing shell outside the deck boundary', () => {
  const model = tiedShellBay(3.04);
  const upper = tiedShellBay(3.08);
  const shell = upper.quads.get(1)!;
  const nodes = shell.nodes.map(id => id + model.nodes.size) as typeof shell.nodes;
  nodes.forEach((id, i) => model.nodes.set(id, { ...upper.nodes.get(shell.nodes[i]!)!, id }));
  model.quads.set(2, { ...shell, id: 2, nodes });
  model.quads.get(1)!.nodes.forEach((masterNode, i) =>
    model.constraints.push({ type: 'equalDOF', masterNode, slaveNode: nodes[i]!, dofs: [2] }));
  expectPanelRefusal(model, shadowRefusal, true);
});

it('#2512 full-span one-way transfer preserves projected area on rising beams', () => {
  const model = tiedShellBay(6, 6, false);
  model.quads.clear();
  for (const node of model.nodes.values()) if (node.z === 3) node.z += node.x === 10 ? 0.00045 : -0.00045;
  const gravity = { mode: 'panels', slab: 'oneWay', spanAxis: 'y' } as const;
  const plan = buildLoadPlan(input(model, { gravity }));
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo(area * pressure, 10);
  checkPlanReactions(model, 'D', area * pressure, gravity);
});

function coincidentBayWithShadowedShell(rise: number, bayAttachments = 0) {
  const { model, row, beam, shell, tieRows } = modelFixture();
  const left = row(0, 3), right = row(10, 3);
  beam(left[0], right[0]);
  beam(right[0], right[1]);
  beam(right[1], left[1]);
  beam(left[1], left[0]);
  const lowerLeft = row(0, 3);
  shell(lowerLeft, row(10, 3));
  const upperLeft = row(0, 3 + rise);
  shell(upperLeft, row(10, 3 + rise));
  tieRows(lowerLeft, upperLeft);
  left.slice(0, bayAttachments).forEach((masterNode, i) => model.constraints.push({
    type: 'equalDOF', masterNode, slaveNode: lowerLeft[i]!, dofs: [2],
  }));
  return model;
}

const shadowRefusal = { key: 'loadPlan.gravity.overlappingShells', params: { first: 1, second: 2 } };

it('#2512 shadowed shell ownership cannot put gravity back on a coincident bay', () => {
  for (const model of [
    coincidentBayWithShadowedShell(0.02),
    coincidentBayWithShadowedShell(0.049, 1),
  ]) {
    for (const loadEveryPanel of [false, true]) {
      const gravity = { mode: 'panels', loadEveryPanel } as const;
      const plan = buildLoadPlan(input(model, { gravity, generateCombinations: true }));
      expect(plan.outcome, JSON.stringify({
        blockedKeys: plan.blockedKeys,
        shells: plan.surface.filter(load => load.caseType === 'D').map(load => load.quadId),
        beams: [...new Set(plan.distributed.filter(load => load.caseType === 'D').map(load => load.elementId))],
        gravityKN: plan.levels.reduce((total, level) => total + level.superimposedKN, 0),
      })).toBe('BLOCKED');
      expect(plan.blockedKeys).toEqual([shadowRefusal]);
      expect(teAt(plan.blockedKeys[0]!, 'en')).toMatch(/^Shells 1 and 2 overlap/);
      expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], combinations: [], levels: [] });
      expect(() => gravityLayout(model, { ...gravity, tributaryWidth: 3 })).toThrow(expect.objectContaining(shadowRefusal));
      expect(() => roofWeightFor(model, gravity, 3, 0)).toThrow(expect.objectContaining(shadowRefusal));
    }
    expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(shadowRefusal));
  }
});

it('#2512 apply refuses to put pressure on a restored coincident bay with ambiguous ownership', () => {
  const { quads, plan } = restoreAndPlan(coincidentBayWithShadowedShell(0.02));
  const before = modelStore.snapshot();
  expect(plan.outcome).toBe('BLOCKED');
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual({
    ...shadowRefusal, params: { first: quads[0], second: quads[1] },
  });
  expect(modelStore.snapshot()).toEqual(before);
});

it('#2512 a bay cannot inherit shell ownership from a chain of attachments', () => {
  for (const loadEveryPanel of [false, true]) {
    expectPanelRefusal(coincidentBayWithShadowedShell(0.02, 2), shadowRefusal, loadEveryPanel);
    deadResultant(coincidentBayWithShadowedShell(0.051, 1), loadEveryPanel, [1, 2], 2 * area);
  }
});

function bayBoundary(beam: (a: number, b: number) => void, left: readonly [number, number], right: readonly [number, number]) {
  beam(left[0], right[0]);
  beam(right[0], right[1]);
  beam(right[1], left[1]);
  beam(left[1], left[0]);
}

function baysSharingOneShell(separation: number, secondX = 0) {
  const { model, row, beam, shell, tieRows } = modelFixture();
  const lowerLeft = row(0, 3), lowerRight = row(10, 3);
  const upperLeft = row(secondX, 3 + separation), upperRight = row(10 + secondX, 3 + separation);
  bayBoundary(beam, lowerLeft, lowerRight);
  bayBoundary(beam, upperLeft, upperRight);
  const shellLeft = row(0, 3 + separation / 2), shellRight = row(10 + secondX, 3 + separation / 2);
  shell(shellLeft, shellRight);
  tieRows(lowerLeft, shellLeft);
  tieRows(upperRight, shellRight);
  return model;
}

function shellOverhangingBay(rise: number, verticalTies = 4) {
  const { model, node, row, beam, shell } = modelFixture();
  const left = row(0, 3), right = row(10, 3);
  bayBoundary(beam, left, right);
  const z = 3 + rise;
  const shellLeft = [node(-1, -1, z), node(-1, 8, z)] as const;
  const shellRight = [node(12, -1, z), node(12, 8, z)] as const;
  shell(shellLeft, shellRight);
  [...left, ...right].forEach((masterNode, i) => {
    const slaveNode = [...shellLeft, ...shellRight][i]!;
    const a = model.nodes.get(masterNode)!, b = model.nodes.get(slaveNode)!;
    model.constraints.push({
      type: 'eccentricConnection', masterNode, slaveNode,
      offsetX: b.x - a.x, offsetY: b.y - a.y, offsetZ: b.z! - a.z!,
      releases: [false, false, i >= verticalTies],
    });
  });
  return model;
}

const separateBayRefusal = { key: 'loadPlan.gravity.differentDeck' };

function expectPanelRefusal(model: ReviewModel, reason: EngineMessage, loadEveryPanel: boolean, tributaryWidth = 3) {
  const gravity = { mode: 'panels', loadEveryPanel } as const;
  const plan = buildLoadPlan(input(model, { gravity, tributaryWidth, generateCombinations: true }));
  expect(plan.outcome, JSON.stringify({ blocked: plan.blockedKeys, levels: plan.levels })).toBe('BLOCKED');
  expect(plan.blockedKeys).toEqual([reason]);
  expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], combinations: [], levels: [] });
  expect(() => gravityLayout(model, { ...gravity, tributaryWidth })).toThrow(expect.objectContaining(reason));
  expect(() => roofWeightFor(model, gravity, tributaryWidth, 0)).toThrow(expect.objectContaining(reason));
  expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
}

for (const loadEveryPanel of [false, true]) {
  for (const gap of [0.08, 0.051]) {
    it(`#2512 a shell cannot absorb both overlapping bays separated by ${gap} with loadEveryPanel=${loadEveryPanel}`, () => {
      const model = baysSharingOneShell(gap);
      expectPanelRefusal(model, separateBayRefusal, loadEveryPanel);
    });
  }

  for (const rise of [0.02, 0.049]) {
    it(`#2512 unequal corner offsets at ${rise} block duplicate bay gravity with loadEveryPanel=${loadEveryPanel}`, () => {
      expectPanelRefusal(shellOverhangingBay(rise), separateBayRefusal, loadEveryPanel);
    });
  }

  it(`#2512 bays cannot assume a shared shell from partial ties with loadEveryPanel=${loadEveryPanel}`, () => {
    expectPanelRefusal(baysSharingOneShell(0.049), separateBayRefusal, loadEveryPanel);
    expectPanelRefusal(baysSharingOneShell(0.08, 10), separateBayRefusal, loadEveryPanel);
  });
}

it('#2512 uneven offsets do not establish an owner within the level tolerance', () => {
  expectPanelRefusal(shellOverhangingBay(0.0005), separateBayRefusal, true);
});

it('#2512 only a separated shell retains independent gravity with incomplete attachments', () => {
  deadResultant(shellOverhangingBay(0.051), true, [1], 13 * 9 + area);
  expectPanelRefusal(shellOverhangingBay(0.02, 1), separateBayRefusal, true);
  deadResultant(baysSharingOneShell(0.102), true, [1], 3 * area);
});

for (const [name, model, reason] of [
  ['separated bays under one shell', () => baysSharingOneShell(0.08), separateBayRefusal],
  ['an overhanging shell with unequal corner offsets', () => shellOverhangingBay(0.02), separateBayRefusal],
] as const) {
  it(`#2512 restored apply refuses ${name}`, () => {
    const { plan } = restoreAndPlan(model());
    const before = modelStore.snapshot();
    expect(plan.outcome).toBe('BLOCKED');
    expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual(reason);
    expect(modelStore.snapshot()).toEqual(before);
  });
}

function straddlingShadow() {
  const { model, row, beam, shell, tieRows } = modelFixture();
  const left = row(0, 3), right = row(10, 3);
  bayBoundary(beam, left, right);
  const lower = row(0, 3.0005);
  shell(lower, row(10, 3.0005));
  const upper = row(0, 3.049);
  shell(upper, row(10, 3.0504));
  tieRows(lower, upper);
  return model;
}

function openingWithShell() {
  const { model, node, row, beam } = modelFixture();
  bayBoundary(beam, row(0, 3), row(10, 3));
  const ring = [[2, 2], [4, 2], [4, 4], [2, 4]].map(([x, y]) => node(x!, y!, 3));
  const [a, b, c, d] = ring as [number, number, number, number];
  bayBoundary(beam, [a, d], [b, c]);
  model.quads.set(1, { id: 1, nodes: [a, b, c, d], materialId: 1, thickness: shellThickness });
  return model;
}

function wideCover(span = 13) {
  const { model, node, beam } = modelFixture();
  const [a, b, c, d] = [[0, 0], [span, 0], [span, span], [0, span]]
    .map(([x, y]) => node(x!, y!, 6)) as [number, number, number, number];
  bayBoundary(beam, [a, d], [b, c]);
  beam(node(2, 5, 3), node(7, 5, 3));
  return model;
}

const wideCoverRefusal = { key: 'loadPlan.gravity.widePanels', params: { n: 1, span: MAX_DECK_SPAN } };

for (const loadEveryPanel of [false, true]) {
  it(`#2512 a shell-to-bay overlap straddles the deck limit (${loadEveryPanel})`, () => {
    expectPanelRefusal(tiedShellBay(3.02, 3.06), separateBayRefusal, loadEveryPanel);
  });

  it(`#2512 a shadowed shell cannot return its load to a bay (${loadEveryPanel})`, () => {
    expectPanelRefusal(straddlingShadow(), shadowRefusal, loadEveryPanel);
  });
}

it('#2512 a rejected wide ring cannot cover a lower member', () => {
  expectPanelRefusal(wideCover(), wideCoverRefusal, false);
});

for (const [name, fixture, reason] of [
  ['a shell straddling the deck limit', () => tiedShellBay(3.02, 3.06), separateBayRefusal],
  ['a reclaimed shadowed bay', straddlingShadow, shadowRefusal],
  ['an overhead wide ring without a slab', wideCover, wideCoverRefusal],
] as const) {
  it(`#2512 restored apply refuses ${name}`, () => {
    const { plan } = restoreAndPlan(fixture());
    const before = modelStore.snapshot();
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('BLOCKED');
    expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual(reason);
    expect(modelStore.snapshot()).toEqual(before);
  });
}

it('#2512 a ring at the span limit or explicitly selected can cover a lower member', () => {
  for (const [span, loadEveryPanel] of [[MAX_DECK_SPAN - 0.01, false], [MAX_DECK_SPAN, false], [MAX_DECK_SPAN + 1, true]] as const) {
    const model = wideCover(span);
    const layout = gravityLayout(model, { mode: 'panels', loadEveryPanel, tributaryWidth: 3 });
    expect(layout.roof.has(5)).toBe(false);
    expect(layout.areaByLevel.get(6)).toBeCloseTo(span ** 2, 10);
  }
});

function shellAcrossBayGap(overlapGap = false) {
  const { model, node, beam } = modelFixture();
  const corners = [[0, 0], [10, 0], [10, 6], [8, 6], [8, 2], [2, 2], [2, 6], [0, 6]];
  const boundary = corners.map(([x, y]) => node(x!, y!, 3));
  boundary.forEach((id, index) => beam(id, boundary[(index + 1) % boundary.length]!));
  const shell = [[0, overlapGap ? 1 : 3, 2.75], [10, overlapGap ? 1 : 3, 3.25], [10, 5, 3.25], [0, 5, 2.75]];
  model.quads.set(1, { id: 1, nodes: shell.map(([x, y, z]) => node(x!, y!, z!)) as [number, number, number, number], materialId: 1, thickness: shellThickness });
  return model;
}

for (const loadEveryPanel of [false, true]) {
  it(`#2512 a shell can own the framed opening without loading the opening beams twice (${loadEveryPanel})`, () => {
    const model = openingWithShell();
    deadResultant(model, loadEveryPanel, [1], area);
    const plan = buildLoadPlan(input(model, { gravity: { mode: 'panels', loadEveryPanel } }));
    expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([expect.objectContaining({ quadId: 1, q: pressure })]);
    const memberForce = plan.distributed.filter(load => load.caseType === 'D').reduce((force, load) => {
      const beam = model.elements.get(load.elementId)!;
      const a = model.nodes.get(beam.nodeI)!, b = model.nodes.get(beam.nodeJ)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      return force - (load.q + (load.qJ ?? load.q)) * ((load.b ?? length) - (load.a ?? 0)) / 2;
    }, 0);
    const nodeForce = -plan.nodal.filter(load => load.caseType === 'D').reduce((force, load) => force + load.fz, 0);
    expect(memberForce + nodeForce).toBeCloseTo((area - 2 * 2) * pressure, 10);
    expect(() => roofWeightFor(model, { mode: 'panels', loadEveryPanel }, 3, pressure)).not.toThrow();

    const overhang = modelFixture();
    for (const [id, point] of model.nodes) overhang.model.nodes.set(id, point);
    overhang.model.elements = model.elements;
    const ring = model.quads.get(1)!.nodes;
    const nodes = ring.map(id => {
      const { x, y, z } = model.nodes.get(id)!;
      return overhang.node(x === 4 ? 4.1 : x, y, z ?? 0);
    }) as [number, number, number, number];
    overhang.model.quads.set(1, { ...model.quads.get(1)!, nodes });
    expectPanelRefusal(overhang.model, separateBayRefusal, loadEveryPanel);
  });

  it(`#2512 separation is independent across disconnected bay overlaps (${loadEveryPanel})`, () => {
    const model = shellAcrossBayGap();
    deadResultant(model, loadEveryPanel, [1], 36 + 2 * Math.hypot(10, 0.5), 56);
    expectPanelRefusal(shellAcrossBayGap(true), separateBayRefusal, loadEveryPanel);
    expect(() => roofWeightFor(model, { mode: 'panels', loadEveryPanel }, 3, pressure)).not.toThrow();
  });
}

it('#2512 a shared edge does not exempt folded-back shells from overlap checks', () => {
  const { model, node } = modelFixture();
  const edge = [node(0, 0, 3), node(4, 0, 3)] as const;
  for (const direction of [1, -1]) {
    const id = model.quads.size + 1;
    const nodes: [number, number, number, number] = [...edge, node(-3, -4 * direction, 3), node(7, direction, 3)];
    model.quads.set(id, { id, nodes, materialId: 1, thickness: shellThickness });
  }
  for (const loadEveryPanel of [false, true]) expectPanelRefusal(model, shadowRefusal, loadEveryPanel);
});

it('#2512 a low roof fringe cannot reclaim a shell-filled opening', () => {
  const model = openingWithShell();
  const node = (x: number, y: number, z: number) => {
    const id = model.nodes.size + 1;
    model.nodes.set(id, { id, x, y, z });
    return id;
  };
  const beam = (nodeI: number, nodeJ: number, type: 'frame' | 'truss' = 'frame') => {
    const id = model.elements.size + 1;
    model.elements.set(id, { id, nodeI, nodeJ, type, sectionId: 1, materialId: 1 });
  };
  const top = [[0, 0], [10, 0], [10, 6], [0, 6]].map(([x, y]) => node(x!, y!, 4));
  for (const [i, one] of top.entries()) {
    beam(one, top[(i + 1) % 4]!, 'truss');
  }
  beam(node(0, 3, 4), node(10, 3, 4));
  expectPanelRefusal(model, { key: 'loadPlan.gravity.areaResultant', params: { z: 3 } }, false, 1);
  const gravity = { mode: 'panels', loadEveryPanel: true } as const;
  const plan = buildLoadPlan(input(model, { gravity, tributaryWidth: 1 }));
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(plan.levels.find(level => level.elevation === 3)?.planAreaM2).toBeCloseTo(area, 10);
  expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([expect.objectContaining({ quadId: 1, q: pressure })]);
});

const offsetRafterRefusal = { key: 'loadPlan.gravity.offsetRafter', params: { id: 1 } };

function framedGable(mesh: boolean, gap = false, detached = false) {
  const { model, row, beam, shell } = modelFixture();
  const left = row(0, 3), right = row(10, 3);
  row(0, 0).forEach((base, i) => beam(base, left[i]!));
  row(10, 0).forEach((base, i) => beam(base, right[i]!));
  const leftEave = detached ? row(0, 3) : left;
  const rightEave = detached ? row(10, 3) : right;
  const ridge = row(gap ? 4 : 5, 4);
  const otherRidge = gap ? row(6, 4) : ridge;
  bayBoundary(beam, left, right);
  const stations = mesh
    ? [leftEave, row(2.5, 3.5), ridge, row(7.5, 3.5), rightEave]
    : [leftEave, ridge, rightEave];
  if (gap) {
    shell(leftEave, ridge);
    shell(otherRidge, rightEave);
  } else {
    for (const [i, start] of stations.slice(0, -1).entries()) shell(start, stations[i + 1]!);
    if (!detached) {
      for (const direction of [0, 1] as const) {
        beam(left[direction], ridge[direction]);
        beam(ridge[direction], right[direction]);
      }
      beam(...ridge);
    }
  }
  return model;
}

for (const loadEveryPanel of [false, true]) {
  it(`#2512 attached gable shells own the eave ring with loadEveryPanel=${loadEveryPanel}`, () => {
    const gravity = { mode: 'panels', loadEveryPanel } as const;
    const gableRoof = { ...roof, slopeDeg: Math.atan2(1, 5) * 180 / Math.PI };
    for (const mesh of [false, true]) {
      const model = framedGable(mesh);
      const isolated = { ...model, elements: new Map([...model.elements].filter(([, { nodeI, nodeJ }]) => {
        const a = model.nodes.get(nodeI)!, b = model.nodes.get(nodeJ)!;
        return a.x === b.x && a.y === b.y;
      })) };
      const expected = buildLoadPlan(input(isolated, { gravity, roof: gableRoof }));
      expect(expected.blockedKeys).toEqual([{ key: 'loadPlan.blocked.concentratedRoof' }]);
      expect(expected.surface.filter(load => load.caseType === 'D')).toHaveLength(model.quads.size);
      expect(expected.surface.filter(load => load.caseType === 'Lr')).toHaveLength(model.quads.size);
      const plan = buildLoadPlan(input(model, { gravity, roof: gableRoof }));
      expect(plan.blockedKeys).toEqual(expected.blockedKeys);
      expect(plan.surface).toEqual(expected.surface);
      expect(plan.distributed).toEqual([]);
      expect(plan.nodal).toEqual([]);
      expect(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo(2 * 6 * Math.hypot(5, 1) * pressure, 10);
      const layout = gravityLayout(model, { ...gravity, tributaryWidth: 3 });
      expect(layout.roofQuads).toEqual(new Set(model.quads.keys()));
      expect(layout.widthMembers).toEqual([]);
      expect(layout.pieces).toEqual([]);
      expect(roofWeightFor(model, gravity, 3, pressure)).toEqual(roofWeightFor(isolated, gravity, 3, pressure));
      expect(snowDriftRefusal(model)).toBe(snowDriftRefusal(isolated));
    }
  });

  for (const offset of [0.051, 0.2, -0.2, MIN_STOREY_HEADROOM - 0.125]) {
    it(`#2512 a matched rafter at offset ${offset} refuses with loadEveryPanel=${loadEveryPanel}`, () => {
      const { model } = offsetRoof(offset);
      expectPanelRefusal(model, offsetRafterRefusal, loadEveryPanel);
    });
  }
}

it('#2512 restored gable loads reach the linear and P-Delta reactions', () => {
  const model = framedGable(false);
  const { quads, loads } = applyDeadPressure(model);
  expect(loads.map(load => load.type)).toEqual(['surface3d', 'surface3d']);
  for (const [index, load] of loads.entries()) expect(load.data).toMatchObject({ quadId: quads[index], q: pressure });
  checkPlanReactions(model, 'D', 2 * 6 * Math.hypot(5, 1) * pressure);
});

it('#2512 restored apply blocks the matched 200 mm offset rafter', () => {
  const { model } = offsetRoof(0.2);
  const { plan } = restoreAndPlan(model);
  const before = modelStore.snapshot();
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('BLOCKED');
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual(offsetRafterRefusal);
  expect(modelStore.snapshot()).toEqual(before);
});

it('#2512 a detached or gapped pitched shell cannot take ownership of a framed bay', () => {
  for (const loadEveryPanel of [false, true]) {
    expectPanelRefusal(framedGable(false, true), separateBayRefusal, loadEveryPanel);
    expectPanelRefusal(framedGable(false, false, true), separateBayRefusal, loadEveryPanel);
    const model = framedGable(false, false, true);
    model.quads.clear();
    const plan = buildLoadPlan(input(model, { gravity: { mode: 'panels', loadEveryPanel } }));
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    expect(plan.surface).toEqual([]);
    expect(plan.levels.reduce((total, level) => total + level.superimposedKN, 0)).toBeCloseTo(area * pressure, 10);
  }
});

it('#2512 a 200 mm offset without a rigid attachment keeps member and shell gravity', () => {
  const { model } = offsetRoof(0.2);
  model.constraints.length = 0;
  const gravity = { mode: 'panels' } as const;
  const plan = buildLoadPlan(input(model, { gravity }));
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(plan.distributed.filter(load => load.caseType === 'D')).toEqual([
    { caseType: 'D', elementId: 1, q: -3 * pressure, frame: 'global' },
  ]);
  expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([{ caseType: 'D', quadId: 1, q: pressure }]);
  expect(teAt(offsetRafterRefusal, 'en')).toContain('Member 1');
  const attached = offsetRoof(0.2).model;
  const width = buildLoadPlan(input(attached, { gravity: { mode: 'width' } }));
  expect(width.outcome, JSON.stringify(width.blockedKeys)).toBe('READY');
  expect(width.distributed.filter(load => load.caseType === 'D')).toEqual(plan.distributed.filter(load => load.caseType === 'D'));
  expect(width.surface).toEqual([]);
});

it('#2512 a shell-owned central strip under matching overhead cannot classify the exposed sides', () => {
  const { model, row, beam, shell } = modelFixture();
  bayBoundary(beam, row(0, 3), row(10, 3));
  shell(row(4, 3), row(6, 3));
  shell(row(4, 6), row(6, 6));
  for (const loadEveryPanel of [false, true]) expectPanelRefusal(model, separateBayRefusal, loadEveryPanel);
});

it('#2512 a low roof cannot reclaim a shell strip along the lower bay perimeter', () => {
  const { model, row, beam, shell, node } = modelFixture();
  bayBoundary(beam, row(0, 3), row(10, 3));
  shell(row(0, 3), row(4, 3));
  shell(row(3, 4), row(7, 4));
  const top = [row(0, 4), row(10, 4)] as const;
  bayBoundary(beam, ...top);
  for (const element of [...model.elements.values()].slice(4)) element.type = 'truss';
  beam(node(0, 3, 4), node(10, 3, 4));
  for (const loadEveryPanel of [false, true]) expectPanelRefusal(model, separateBayRefusal, loadEveryPanel, 1);
});
