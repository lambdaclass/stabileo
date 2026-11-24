import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { solve_3d, solve_pdelta_3d } from '../../../wasm/dedaliano_engine.js';
import { modelStore } from '../../../store/model.svelte';
import '../../../store/index';
import { applyLoadPlan } from '../../../store/apply-load-plan';
import { teAt } from '../../../i18n/engine-text';
import type { Load } from '../../../store/model.svelte';
import { buildSolverLoads3D } from '../../solver-service';
import type { AnalysisResults3D, Constraint3D } from '../../types-3d';
import { gravityLayout } from '../plan-gravity';
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
  return { model, row, beam, shell, tieRows };
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
  const { model, row, beam, shell, tieRows } = modelFixture();
  const left = row(0, 3), center = row(5, 3), right = row(10, 3);
  for (const [a, b] of [[left, center], [center, right]] as const) {
    beam(a[0], b[0]);
    beam(a[1], b[1]);
  }
  for (const [a, b] of [left, center, right]) beam(a, b);
  const shellLeft = row(0, shellZ), shellRight = row(10, shellZ);
  shell(shellLeft, shellRight);
  tieRows(left, shellLeft);
  tieRows(right, shellRight);
  if (withIndependentOverhead) beam(...row(5, 6));
  return model;
}

function deadResultant(model: LoadModelData, loadEveryPanel: boolean, shellOwners: number[], expectedArea: number) {
  const gravity = { mode: 'panels', loadEveryPanel } as const;
  const plan = buildLoadPlan(input(model, { gravity }));
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(plan.surface.filter(load => load.caseType === 'D').map(load => load.quadId).sort()).toEqual(shellOwners);
  expect(plan.levels.reduce((total, level) => total + level.superimposedKN, 0)).toBeCloseTo(expectedArea * pressure, 10);
  const layout = gravityLayout(model, { ...gravity, tributaryWidth: 3 });
  expect([...layout.areaByLevel.values()].reduce((total, level) => total + level, 0)).toBeCloseTo(expectedArea, 10);
  expect(() => snowDriftRefusal(model)).not.toThrow();
}

it('#2512 two direct vertical ties preserve loads on separate storeys', () => {
  for (const loadEveryPanel of [false, true]) deadResultant(directlyTiedPlatforms(), loadEveryPanel, [1, 2], 2 * area);
});

it('#2512 tied shells share a deck only within the cover-rise boundary', () => {
  for (const loadEveryPanel of [false, true]) {
    deadResultant(directlyTiedPlatforms(3.051), loadEveryPanel, [1, 2], 2 * area);
    deadResultant(directlyTiedPlatforms(3.049), loadEveryPanel, [2], area);
  }
});

it('#2512 two stub stations attach the offset shell to its bay', () => {
  for (const loadEveryPanel of [false, true]) {
    const model = stubAttachedShellBay();
    deadResultant(model, loadEveryPanel, [1, 2], area);
    model.constraints.pop();
    deadResultant(model, loadEveryPanel, [1, 2], 2 * area);
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

it('#2512 WASM reactions include the stub-attached deck once', () => {
  checkPlanReactions(stubAttachedShellBay(), 'D', area * pressure);
});

it('#2512 WASM reactions include roof live load below the same-deck beam', () => {
  const model = subdividedShellBay();
  const isolated = buildLoadPlan(input({ ...model, elements: new Map() }, { gravity: { mode: 'panels' }, roof }));
  const expected = isolated.surface.find(load => load.caseType === 'Lr')!.q * area;
  expect(expected).toBeGreaterThan(0);
  checkPlanReactions(model, 'Lr', expected);
});

type ReviewModel = ReturnType<typeof modelFixture>['model'];

function restoreAndPlan(model: ReviewModel, setRoof = false) {
  modelStore.clear();
  const nodes = new Map([...model.nodes].map(([id, { x, y, z }]) => [id, modelStore.addNode(x, y, z)]));
  const materialId = modelStore.model.materials.keys().next().value!;
  const quads = [...model.quads.values()].map(({ nodes: [a, b, c, d] }) =>
    modelStore.addQuad([nodes.get(a)!, nodes.get(b)!, nodes.get(c)!, nodes.get(d)!], materialId, shellThickness));
  for (const { nodeI, nodeJ } of model.elements.values()) modelStore.addElement(nodes.get(nodeI)!, nodes.get(nodeJ)!);
  for (const constraint of model.constraints ?? []) {
    if (constraint.type === 'equalDOF') modelStore.addConstraint({
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

function applyDeadPressure(model: ReviewModel) {
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

it('#2512 restored stub ties apply only shell pressure', () => {
  const { quads, loads } = applyDeadPressure(stubAttachedShellBay());
  expect(loads.map(load => load.data)).toEqual(quads.map(quadId => expect.objectContaining({ quadId, q: pressure })));
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

it('#2512 attached bay ownership checks both ends of the overlap', () => {
  deadResultant(tiedShellBay(3.049), true, [1], area);
  deadResultant(tiedShellBay(3.051), true, [1], 2 * area);
  const model = tiedShellBay(3.02, 3.06);
  const plan = buildLoadPlan(input(model, { gravity: { mode: 'panels', loadEveryPanel: true } }));
  const expected = pressure * 6 * (10 + Math.hypot(10, 0.04));
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo(expected, 10);
});

it('#2512 an untied shell needs to match the bay only over their overlap', () => {
  const model = tiedShellBay(2.9989, 2.9998, false, -10);
  const gravity = { mode: 'panels', loadEveryPanel: true } as const;
  const plan = buildLoadPlan(input(model, { gravity }));
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(plan.distributed.filter(load => load.caseType === 'D')).toEqual([]);
  expect(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo(pressure * 6 * Math.hypot(20, 0.0009), 10);
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
  for (const loadEveryPanel of [false, true]) for (const offset of [-3, 0.049, 0.051, 3]) {
    const model = offsetRoof(offset).model;
    const gravity = { mode: 'panels', loadEveryPanel } as const;
    const plan = buildLoadPlan(input(model, { gravity }));
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    expect(plan.distributed.filter(load => load.caseType === 'D')).toEqual(offset === 0.049 ? [] : [
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
  deadResultant(model, true, [2], 2 * area);
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

it('#2512 directly established bay ownership and separated shells keep their pressure', () => {
  for (const loadEveryPanel of [false, true]) {
    deadResultant(coincidentBayWithShadowedShell(0.02, 2), loadEveryPanel, [2], area);
    deadResultant(coincidentBayWithShadowedShell(0.051, 1), loadEveryPanel, [1, 2], 2 * area);
  }
  const plan = buildLoadPlan(input(coincidentBayWithShadowedShell(0.02)));
  expect(plan.outcome).toBe('READY');
  expect(plan.surface).toEqual([]);
  expect(plan.distributed.some(load => load.caseType === 'D')).toBe(true);
});
