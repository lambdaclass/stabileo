import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import stadium from '../../templates/fixtures/full-stadium.json';
import { nonconformingWallSlab, PLATE_EDGE_TOL } from '../../model/physical/plate-analysis';
import { modelStore, resultsStore, uiStore } from '../../store';
import { addPlateLoad, createPlate, meshBeforeAnalysis, plateStatus, preparePlatesForAnalysis } from '../../store/physical-plates';
import { runDirectAnalysis } from '../direct-analysis';
import { runGlobalSolve } from '../live-calc';
import type { AnalysisResults3D } from '../types-3d';
import { initSolver } from '../wasm-solver';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
});
afterEach(() => {
  meshBeforeAnalysis.value = true;
  uiStore.analysisMode = '2d';
});

function loadedSlab() {
  const nodes = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  for (const node of nodes.slice(0, 3)) modelStore.addSupport(node, 'fixed3d');
  const id = modelStore.addQuad(nodes as [number, number, number, number], 1, 0.15);
  modelStore.addSurfaceLoad3D(id, 1);
  return nodes;
}

function missingFloor() {
  const outline = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
  const plate = createPlate({ outline, name: 'missing floor', materialId: 1, thickness: 0.15 });
  if (!('id' in plate)) throw new Error(plate.problem);
  expect(plateStatus(plate.id)).toBe('unmeshed');
  modelStore.updateNode(outline[0]!, 8, 0, 3);
  expect(plateStatus(plate.id)).toBe('invalid');
}

function expectLoadedSlab(result: AnalysisResults3D | string | null) {
  expect(typeof result, String(result)).toBe('object');
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.reduce((sum, support) => sum + support.fz, 0)).toBeCloseTo(4 * 4, 8);
}

function designCombinations(perCombination: 'linear' | 'pdelta') {
  modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
  modelStore.setAnalysis({ perCombination });
}

const entries = [
  ['direct linear', () => modelStore.solve3D(false, false, true)],
  ['async linear', () => modelStore.solve3DAsync(false, false, true)],
  ['linear combination', () => {
    designCombinations('linear');
    return modelStore.solveCombinations3D(false, false, true);
  }],
  ['parallel linear combination', () => {
    designCombinations('linear');
    return modelStore.solveCombinations3DParallel(false, false, true);
  }],
  ['combination P-Delta', () => {
    designCombinations('pdelta');
    return modelStore.solveCombinations3D(false, false, true);
  }],
  ['parallel combination P-Delta', () => {
    designCombinations('pdelta');
    return modelStore.solveCombinations3DParallel(false, false, true);
  }],
  ['direct design analysis', () => {
    designCombinations('pdelta');
    const model = modelStore.model;
    return runDirectAnalysis(model, model.loadCases, model.combinations, { includeSelfWeight: false });
  }],
] as const;

const directEntries = [
  ...entries,
  ['advanced input', () => {
    try { return modelStore.buildSolverInput3D(); } catch (error) { return (error as Error).message; }
  }],
  ['reproducible input', () => modelStore.singleSolveInput3D(false, false, true)],
] as const;

for (const [entry, solve] of directEntries) {
  it(`#2368 the ${entry} entry refuses an old mesh after a valid outline edit`, async () => {
    editMeshedFloor();
    expect(await solve()).toEqual(entry === 'reproducible input' ? null : expect.stringContaining('supported floor'));
  });
  it(`#2388 the ${entry} entry refuses duplicate junction endpoints`, async () => {
    wallSlabJoint('duplicate');
    expect(await solve()).toEqual(entry === 'reproducible input' ? null : expect.stringMatching(/wall.*slab/i));
  });
}

it.each([true, false])('#2368 preparation names the invalid plate with automatic meshing %s', auto => {
  loadedSlab();
  missingFloor();
  meshBeforeAnalysis.value = auto;
  expect(preparePlatesForAnalysis()).toMatchObject({ ok: false, plates: ['missing floor'] });
});

it('#2368 the global solve refuses the invalid plate and publishes no results', async () => {
  loadedSlab();
  missingFloor();
  const outcome = await runGlobalSolve({ directBase: true });
  expect(outcome).toEqual({ ok: false, error: expect.stringContaining('missing floor') });
  expect(resultsStore.results3D).toBeNull();
});

it.each(entries)('#2368 the %s entry refuses the invalid plate', async (_entry, solve) => {
  loadedSlab();
  missingFloor();
  expect(await solve()).toEqual(expect.stringContaining('missing floor'));
});

it('#2368 a model with an invalid plate has no reproducible solver input', () => {
  loadedSlab();
  missingFloor();
  expect(modelStore.singleSolveInput3D(false, false, true)).toBeNull();
});

it('#2368 the advanced 3D input names the invalid plate', () => {
  loadedSlab();
  missingFloor();
  expect(() => modelStore.buildSolverInput3D()).toThrow('missing floor');
});

function meshPhysicalFloor() {
  const outline = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const plate = createPlate({ outline, name: 'supported floor', materialId: 1, thickness: 0.15 });
  if (!('id' in plate)) throw new Error(plate.problem);
  expect(preparePlatesForAnalysis()).toMatchObject({ ok: true, meshed: 1 });
  const group = modelStore.model.groups.get(plate.id)!;
  const shellIds = group.members.quads!;
  expect(shellIds.length).toBeGreaterThan(1);
  return { group, shellIds };
}

function editMeshedFloor() {
  const { group, shellIds } = meshPhysicalFloor();
  const nodes = group.members.nodes!;
  expect(plateStatus(group.id)).toBe('current');
  const corner = modelStore.addNode(4, 5, 0);
  modelStore.setGroupMembers(group.id, { ...group.members, nodes: [nodes[0]!, nodes[1]!, corner, ...nodes.slice(3)] });
  expect(plateStatus(group.id)).toBe('stale');
  expect(modelStore.model.groups.get(group.id)?.members.quads).toEqual(shellIds);
  expect(modelStore.quads.size).toBe(shellIds.length);
  for (const node of nodes.slice(0, 4)) modelStore.addSupport(node, 'fixed3d');
  modelStore.addSupport(corner, 'fixed3d');
  addPlateLoad(group.id, 1, 1);
  return group.id;
}

it('#2368 preparation refuses the stale outline with automatic meshing disabled', () => {
  editMeshedFloor();
  meshBeforeAnalysis.value = false;
  expect(preparePlatesForAnalysis()).toEqual({ ok: false, reason: 'needsMesh', plates: ['supported floor'] });
});

it('#2368 automatic preparation remeshes the edited outline and balances its new area load', async () => {
  const id = editMeshedFloor();
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({ ok: true });
  expect(plateStatus(id)).toBe('current');
  expect(resultsStore.results3D?.reactions.reduce((sum, support) => sum + support.fz, 0)).toBeCloseTo(4 * (4 + 5) / 2, 8);
});

it('#2368 refuses a saved plate whose recorded mesh is incomplete', () => {
  const { group, shellIds } = meshPhysicalFloor();
  modelStore.removeQuad(shellIds[0]!);
  modelStore.setGroupMembers(group.id, { ...group.members, quads: shellIds.slice(1) });
  expect(preparePlatesForAnalysis()).toEqual({ ok: false, reason: 'invalid', plates: ['supported floor'] });
  expect(modelStore.solve3D(false, false, true)).toEqual(expect.stringContaining('supported floor'));
});

it('#2368 automatic preparation meshes a valid physical plate and WASM balances its load', () => {
  const { shellIds } = meshPhysicalFloor();
  for (const node of modelStore.nodes.keys()) modelStore.addSupport(node, 'fixed3d');
  for (const id of shellIds) modelStore.addSurfaceLoad3D(id, 1);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

it('solves the supported slab and balances its area load in real WASM', async () => {
  loadedSlab();
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({ ok: true });
  expectLoadedSlab(resultsStore.results3D);
});

function wallSlabJoint(stations: 'wall' | 'slab' | 'both' | 'duplicate' | 'neither' | 'separate', boundary?: number) {
  const [a, b, c, d] = loadedSlab();
  const at = (x: number, y: number, z: number) => modelStore.addNode(x, y, z);
  const m = at(2, 0, stations === 'duplicate' ? 0 : boundary ?? 0);
  const addQuad = (nodes: [number, number, number, number]) => modelStore.addQuad(nodes, 1, 0.15);
  if (stations === 'slab' || stations === 'both' || stations === 'duplicate') {
    modelStore.removeQuad(1);
    const n = at(2, 4, 0);
    modelStore.addSurfaceLoad3D(addQuad([a!, m, n, d!]), 1);
    modelStore.addSurfaceLoad3D(addQuad([m, b!, c!, n]), 1);
  }
  const z = boundary ?? (stations === 'separate' ? 0.01 : 0);
  const p = z ? at(0, 0, z) : a!, q = z ? at(4, 0, z) : b!;
  if (z) modelStore.addElement(boundary === undefined ? a! : d!, p);
  for (const node of [p, q, m]) modelStore.addSupport(node, 'fixed3d');
  const upperA = at(0, 0, 2), upperB = at(4, 0, 2);
  if (stations === 'wall' || stations === 'both' || stations === 'duplicate') {
    const wallM = stations === 'duplicate' ? at(2, 0, z) : m;
    const upperM = at(2, 0, 2);
    addQuad([p, wallM, upperM, upperA]);
    addQuad([wallM, q, upperB, upperM]);
  } else {
    addQuad([p, q, upperB, upperA]);
  }
}

it('#2388 global analysis refuses duplicate junction endpoints and publishes no results', async () => {
  wallSlabJoint('duplicate');
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.stringMatching(/wall.*slab/i) });
  expect(resultsStore.results3D).toBeNull();
});

it('#2388 refuses overlapping endpoints inside the distance limit', () => {
  wallSlabJoint('duplicate', PLATE_EDGE_TOL / 2);
  expect(modelStore.solve3D(false, false, true)).toEqual(expect.stringMatching(/wall.*slab/i));
});

it('#2388 solves independently supported edges beyond the endpoint distance limit', () => {
  wallSlabJoint('duplicate', PLATE_EDGE_TOL * 2);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

it('#2388 solves shells with only point contact and a separate frame connection', () => {
  const [a] = loadedSlab();
  const wallBase = [modelStore.addNode(-4, 0, 0), modelStore.addNode(0, 0, 0)];
  for (const node of wallBase) modelStore.addSupport(node, 'fixed3d');
  modelStore.addElement(a!, wallBase[0]!);
  modelStore.addQuad([wallBase[0]!, wallBase[1]!, modelStore.addNode(0, 0, 2), modelStore.addNode(-4, 0, 2)], 1, 0.15);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

it.each(['wall', 'slab'] as const)('#2388 refuses a hanging %s node where the wall meets the slab', async stations => {
  wallSlabJoint(stations);
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.any(String) });
  expect(resultsStore.results3D).toBeNull();
});

it.each(entries)('#2388 the %s entry refuses a nonconforming wall–slab joint', async (_entry, solve) => {
  wallSlabJoint('wall');
  expect(await solve()).toEqual(expect.stringMatching(/wall.*slab|slab.*wall/i));
});

it('#2388 a hanging wall node prevents exporting a reproducible solver input', () => {
  wallSlabJoint('wall');
  expect(modelStore.singleSolveInput3D(false, false, true)).toBeNull();
});

it('#2388 advanced analysis refuses a triangular wall and names both physical plates', () => {
  const [a, b, c, d] = loadedSlab();
  const m = modelStore.addNode(2, 0, 0);
  const top = modelStore.addNode(2, 0, 2);
  const wallCell = modelStore.addPlate([a!, m, top], 1, 0.15);
  for (const [name, outline, cells] of [
    ['main slab', [a!, b!, c!, d!], { quads: [1] }],
    ['core wall', [a!, m, top], { plates: [wallCell] }],
  ] as const) {
    const group = createPlate({ name, outline: [...outline], materialId: 1, thickness: 0.15 });
    if (!('id' in group)) throw new Error(group.problem);
    modelStore.setGroupMembers(group.id, {
      nodes: [...outline],
      ...('quads' in cells ? { quads: [...cells.quads] } : { plates: [...cells.plates] }),
    });
  }
  expect(() => modelStore.buildSolverInput3D()).toThrow(/core wall.*main slab/);
});

it('#2388 refuses an interior station within the edge distance limit', () => {
  wallSlabJoint('wall', PLATE_EDGE_TOL / 2);
  expect(modelStore.solve3D(false, false, true)).toEqual(expect.stringMatching(/wall.*slab/i));
});

it('#2388 solves a station just beyond the edge distance limit', () => {
  wallSlabJoint('wall', PLATE_EDGE_TOL * 2);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

it.each(['both', 'neither', 'separate'] as const)('solves a wall and slab with %s stations', stations => {
  wallSlabJoint(stations);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

it('#2388 the seven-storey gallery slabs share the reported wall stations and solve', async () => {
  uiStore.includeSelfWeight = true;
  await modelStore.loadExample('pro-edificio-7p');
  expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
  expect(modelStore.quads.size).toBe(126);
  const answer = modelStore.solve3D(true, false, true);
  if (!answer || typeof answer === 'string') throw new Error(String(answer));
  expect(answer).toHaveProperty('equilibrium.equilibriumOk', true);
  for (const shell of modelStore.quads.values()) {
    const points = shell.nodes.map(id => modelStore.nodes.get(id)!);
    const dimensions = (['x', 'y', 'z'] as const).map(axis => new Set(points.map(n => n[axis])).size);
    expect(dimensions.sort()).toEqual([1, 2, 2]);
    for (const [i, a] of points.entries()) {
      const b = points[(i + 1) % points.length]!;
      expect([a.x !== b.x, a.y !== b.y, a.z !== b.z].filter(Boolean)).toHaveLength(1);
    }
  }
  for (let floor = 0; floor < 7; floor++) {
    const corner = 13 + 15 * floor;
    const [wallX, center, wallY] = [121, 122, 123].map(id => id + 3 * floor);
    const slabAt = (id: number) => [...modelStore.quads.values()].filter(cell =>
      cell.nodes.includes(id) && cell.nodes.every(n => modelStore.nodes.get(n)!.z === modelStore.nodes.get(id)!.z));
    const edges = (id: number) => new Set(slabAt(id).flatMap(cell => {
      const i = cell.nodes.indexOf(id);
      return [cell.nodes[(i + 1) % cell.nodes.length], cell.nodes[(i + cell.nodes.length - 1) % cell.nodes.length]];
    }));
    const { z } = modelStore.nodes.get(corner)!;
    const nodeAt = (x: number, y: number) =>
      [...modelStore.nodes.values()].find(n => n.x === x && n.y === y && n.z === z)!.id;
    const east = nodeAt(6, 2.5), north = nodeAt(2.5, 5);
    expect(edges(wallX!)).toEqual(new Set([corner, corner + 1, center]));
    expect(edges(wallY!)).toEqual(new Set([corner, corner + 5, center]));
    expect(edges(center!)).toEqual(new Set([wallX, wallY, east, north]));
    expect([...modelStore.elements.values()].filter(e => [e.nodeI, e.nodeJ].includes(east))).toHaveLength(2);
    expect([...modelStore.elements.values()].filter(e => [e.nodeI, e.nodeJ].includes(north))).toHaveLength(2);
    for (const id of [wallX, center, wallY]) expect(Number.isFinite(answer.displacements.find(d => d.nodeId === id)?.uz)).toBe(true);
  }
});

it.each(['linear', 'pdelta'] as const)('#2409 gallery admits signed %s combinations', async method => {
  await modelStore.loadExample('pro-edificio-7p');
  modelStore.setAnalysis({ perCombination: method });
  const ids = modelStore.model.combinations.map(c => c.id);
  for (const answer of [
    modelStore.solveCombinations3D(true, false, true),
    await modelStore.solveCombinations3DParallel(true, false, true),
  ]) {
    if (!answer || typeof answer === 'string') throw new Error(String(answer));
    expect([...answer.perCombo.keys()]).toEqual(ids);
  }
});

function constrainedWallJoint(dofs: readonly number[], weights: readonly [number, number]) {
  wallSlabJoint('wall');
  const [a, b] = modelStore.quads.get(1)!.nodes;
  const wallNode = modelStore.quads.get(2)!.nodes[1]!;
  const support = [...modelStore.supports.values()].find(s => s.nodeId === wallNode)!;
  modelStore.removeSupport(support.id);
  for (const dof of dofs) {
    modelStore.addConstraint({
      type: 'linearMPC', terms: [
        { nodeId: wallNode, dof, coefficient: 2 },
        { nodeId: a!, dof, coefficient: -2 * weights[0] },
        { nodeId: b!, dof, coefficient: -2 * weights[1] },
      ],
    });
  }
  return wallNode;
}

it.each(entries)('#2409 the %s entry accepts a fully tied shell edge', async (_entry, solve) => {
  constrainedWallJoint([0, 1, 2, 3, 4, 5], [0.5, 0.5]);
  const answer = await solve();
  expect(answer, String(answer)).not.toBeNull();
  expect(typeof answer, String(answer)).toBe('object');
});

it.each([
  [[0, 1, 2, 3, 4], [0.5, 0.5]],
  [[0, 1, 2, 3, 4, 5], [0.25, 0.75]],
] as const)('#2388 refuses a shell edge with incomplete or incorrect compatibility (%j, %j)', (dofs, weights) => {
  constrainedWallJoint(dofs, weights);
  expect(modelStore.solve3D(false, false, true)).toEqual(expect.stringMatching(/wall.*slab/i));
});

it('#2409 propagates a load through the interpolated wall station in the global solve', async () => {
  const wallNode = constrainedWallJoint([0, 1, 2, 3, 4, 5], [0.5, 0.5]);
  modelStore.addNodalLoad3D(wallNode, 0, 0, -1, 0, 0, 0);
  expect(modelStore.buildSolverInput3D()?.constraints).toHaveLength(6);
  expect(modelStore.singleSolveInput3D(false, false, true)?.wire()).toHaveProperty('constraints', expect.arrayContaining(modelStore.constraints));
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({ ok: true });
  const result = resultsStore.results3D!;
  expect(result.displacements.find(d => d.nodeId === wallNode)?.uz).toBeCloseTo(0, 12);
  expect(result.reactions.reduce((sum, support) => sum + support.fz, 0)).toBeCloseTo(4 * 4 + 1, 8);
});

it('#2409 accepts complete direct MPC ties at coincident shell endpoints', () => {
  wallSlabJoint('duplicate');
  const slabNode = modelStore.quads.get(2)!.nodes[1]!;
  const wallNode = modelStore.quads.get(4)!.nodes[1]!;
  for (const dof of [0, 1, 2, 3, 4, 5]) {
    modelStore.addConstraint({
      type: 'linearMPC', terms: [
        { nodeId: slabNode, dof, coefficient: -1 },
        { nodeId: wallNode, dof, coefficient: 1 },
      ],
    });
  }
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

function wallUnderSlab(clearance = 0, xShift = 0) {
  const [corner] = loadedSlab();
  const a = modelStore.addNode(1 + xShift, 1, -clearance);
  const b = modelStore.addNode(3 + xShift, 2, -clearance);
  const i = modelStore.addNode(1 + xShift, 1, -3);
  const j = modelStore.addNode(3 + xShift, 2, -3);
  const wall = modelStore.addQuad([a, b, j, i], 1, 0.15);
  modelStore.addSupport(i, 'fixed3d');
  modelStore.addSupport(j, 'fixed3d');
  modelStore.addElement(corner!, i);
  return { wall, base: [i, j] };
}

it('#2430 refuses a supported wall ending inside a loaded slab face', async () => {
  for (const [entry, solve] of directEntries) {
    modelStore.clear();
    const { wall } = wallUnderSlab();
    const result = await solve();
    expect.soft(result && typeof result === 'object' ? 'returned a result' : result, entry).toEqual(entry === 'reproducible input' ? null : expect.stringMatching(new RegExp('wall q' + wall + '.*slab q1', 'i')));
  }
  modelStore.clear();
  wallUnderSlab();
  const outcome = await runGlobalSolve({ directBase: true });
  expect(outcome.ok ? 'returned a result' : outcome.error).toEqual(expect.stringMatching(/wall.*slab/i));
  expect(resultsStore.results3D).toBeNull();
});

it('#2430 refuses a wall edge piercing the interior of a loaded slab', async () => {
  for (const [entry, solve] of directEntries) {
    modelStore.clear();
    const { wall } = wallUnderSlab(-1);
    const result = await solve();
    expect.soft(result && typeof result === 'object' ? 'returned a result' : result, entry)
      .toEqual(entry === 'reproducible input' ? null : expect.stringMatching(new RegExp('wall q' + wall + '.*slab q1', 'i')));
  }
  modelStore.clear();
  wallUnderSlab(-1);
  const outcome = await runGlobalSolve({ directBase: true });
  expect.soft(outcome.ok ? 'returned a result' : outcome.error).toEqual(expect.stringMatching(/wall.*slab/i));
  expect(resultsStore.results3D).toBeNull();
});

it('#2430 refuses a piercing wall just inside the slab face', () => {
  const { wall } = wallUnderSlab(-1, 3 - 2 * PLATE_EDGE_TOL);
  expect(modelStore.solve3D(false, false, true)).toEqual(expect.stringMatching(new RegExp('wall q' + wall + '.*slab q1', 'i')));
});

it('#2430 solves a wall crossing the slab elevation outside the slab face', () => {
  const { base } = wallUnderSlab(-1, 3 + 2 * PLATE_EDGE_TOL);
  const result = modelStore.solve3D(false, false, true);
  expectLoadedSlab(result);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.filter(r => base.includes(r.nodeId)).map(r => r.fz)).toEqual([0, 0]);
});

it('#2430 a separately supported wall beyond the contact limit keeps the loaded slab result', () => {
  const { base } = wallUnderSlab(PLATE_EDGE_TOL * 2);
  const result = modelStore.solve3D(false, false, true);
  expectLoadedSlab(result);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.filter(r => base.includes(r.nodeId)).map(r => r.fz)).toEqual([0, 0]);
});

it('#2430 refuses a wall inside the contact limit', () => {
  wallUnderSlab(PLATE_EDGE_TOL / 2);
  const result = modelStore.solve3D(false, false, true);
  expect(result && typeof result === 'object' ? 'returned a result' : result).toEqual(expect.stringMatching(/wall.*slab/i));
});

it('#2430 transfers the entire slab load into the wall when both share the interior mesh edge', () => {
  const at = (x: number, y: number, z: number) => modelStore.addNode(x, y, z);
  const a = at(0, 0, 0), b = at(2, 0, 0), c = at(4, 0, 0);
  const d = at(0, 4, 0), e = at(2, 4, 0), f = at(4, 4, 0);
  const i = at(2, 0, -3), j = at(2, 4, -3);
  for (const nodes of [[a, b, e, d], [b, c, f, e]] as const) {
    modelStore.addSurfaceLoad3D(modelStore.addQuad([...nodes], 1, 0.15), 1);
  }
  modelStore.addQuad([b, e, j, i], 1, 0.15);
  modelStore.addSupport(i, 'fixed3d');
  modelStore.addSupport(j, 'fixed3d');
  const result = modelStore.solve3D(false, false, true);
  expectLoadedSlab(result);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.map(r => r.nodeId).sort((a, b) => a - b)).toEqual([i, j]);
  for (const support of result.reactions) expect(support.fz).toBeCloseTo(4 * 4 / 2, 8);
});

function throughSlab(y: number, bottom = -1, left = 1, right = 3) {
  const [corner] = loadedSlab();
  const points: [number, number, number][] = [[left, y, bottom], [right, y, bottom], [right, y, 1], [left, y, 1]];
  const [a, b, c, d] = points.map(([x, py, z]) => modelStore.addNode(x, py, z)) as [number, number, number, number];
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(b, 'fixed3d');
  modelStore.addQuad([a, b, c, d], 1, 0.15);
  modelStore.addElement(corner!, a);
}

it.each(directEntries)(
  'the %s entry refuses a wall passing through a slab',
  async (entry, solve) => {
    throughSlab(2);
    expect(await solve()).toEqual(entry === 'reproducible input' ? null : expect.stringMatching(/wall.*slab/i));
  },
);

it('global analysis refuses a wall passing through a slab', async () => {
  throughSlab(2);
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.stringMatching(/wall.*slab/i) });
  expect(resultsStore.results3D).toBeNull();
});

it.each([[2, 0.01], [-0.01, -1]])('solves the loaded slab and a wall clear of its face at y=%s, bottom=%s', (y, bottom) => {
  throughSlab(y, bottom);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

it.each(directEntries)('#2586 the %s entry refuses a wall spanning the slab face', async (entry, solve) => {
  throughSlab(2, -1, -1, 5);
  expect(await solve()).toEqual(entry === 'reproducible input' ? null : expect.stringMatching(/wall.*slab/i));
});

it('#2586 global solve refuses a face intersection with no wall-edge crossings', async () => {
  throughSlab(2, -1, -1, 5);
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.stringMatching(/wall.*slab/i) });
  expect(resultsStore.results3D).toBeNull();
});

it('solves when the wide wall crosses the slab plane beyond its face', () => {
  throughSlab(-2 * PLATE_EDGE_TOL, -1, -1, 5);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

it('transfers the slab load across a shared wall trace with wall cells above and below', () => {
  const at = (x: number, y: number, z: number) => modelStore.addNode(x, y, z);
  const a = at(0, 0, 0), b = at(4, 0, 0), c = at(0, 4, 0), d = at(4, 4, 0);
  const left = at(0, 2, 0), right = at(4, 2, 0);
  const i = at(0, 2, -1), j = at(4, 2, -1);
  for (const cells of [[a, b, right, left], [left, right, d, c]] as const) {
    modelStore.addSurfaceLoad3D(modelStore.addQuad([...cells], 1, 0.15), 1);
  }
  modelStore.addQuad([i, j, right, left], 1, 0.15);
  modelStore.addQuad([left, right, at(4, 2, 1), at(0, 2, 1)], 1, 0.15);
  modelStore.addSupport(i, 'fixed3d');
  modelStore.addSupport(j, 'fixed3d');
  const result = modelStore.solve3D(false, false, true);
  expectLoadedSlab(result);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.map(reaction => reaction.nodeId).sort((a, b) => a - b)).toEqual([i, j]);
  for (const reaction of result.reactions) expect(reaction.fz).toBeCloseTo(8, 8);
});

function skewWallSlab() {
  const at = ([x, y, z]: number[]) => modelStore.addNode(x!, y!, z!);
  const translate = (p: number[], v: number[]) => p.map((x, i) => x + v[i]!);
  const a = [0.3, 11.78, 0.32], span = [4.11, 0.11, 1.01], width = [-0.32, 2.24, 0.21], drop = [0.15, -0.12, -2.21];
  const b = translate(a, span);
  const left = at(a), right = at(b);
  const i = at(translate(a, drop)), j = at(translate(b, drop));
  const slab = modelStore.addQuad([at(translate(a, width)), at(translate(b, width)), right, left], 1, 0.15);
  modelStore.addSurfaceLoad3D(slab, 1);
  modelStore.addQuad([i, j, right, left], 1, 0.15);
  modelStore.addSupport(i, 'fixed3d');
  modelStore.addSupport(j, 'fixed3d');
  const area = Math.sqrt(span.reduce((s, x) => s + x * x, 0) * width.reduce((s, x) => s + x * x, 0)
    - span.reduce((s, x, k) => s + x * width[k]!, 0) ** 2);
  return { area, bases: [i, j] };
}

function cornerWall(offset: number) {
  const [corner] = loadedSlab();
  const a = modelStore.addNode(offset, offset, -1), b = modelStore.addNode(offset - 2, offset + 2, -1);
  const c = modelStore.addNode(offset - 2, offset + 2, 1), d = modelStore.addNode(offset, offset, 1);
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(b, 'fixed3d');
  modelStore.addQuad([a, b, c, d], 1, 0.15);
  modelStore.addElement(corner!, a);
  if (offset !== 0) return;
  const support = [...modelStore.supports.values()].find(entry => entry.nodeId === corner)!;
  modelStore.removeSupport(support.id);
  for (const dof of [0, 1, 2, 3, 4, 5]) {
    modelStore.addConstraint({
      type: 'linearMPC', terms: [
        { nodeId: corner!, dof, coefficient: 2 }, { nodeId: a, dof, coefficient: -1 }, { nodeId: d, dof, coefficient: -1 },
      ],
    });
  }
}

it.each([['skew shared edge', skewWallSlab], ['slab corner', () => { cornerWall(0); }]] as const)(
  '#2586 accepts wall contact at a %s',
  async (_, setup) => {
    for (const [entry, solve] of entries) {
      modelStore.clear();
      setup();
      const result = await solve();
      expect.soft(result, entry).toBeTypeOf('object');
      expect.soft(result, entry).not.toBeNull();
    }
    modelStore.clear();
    const expected = setup();
    expect(() => modelStore.buildSolverInput3D()).not.toThrow();
    expect(modelStore.singleSolveInput3D(false, false, true)).not.toBeNull();
    expect(await runGlobalSolve({ directBase: true })).toMatchObject({ ok: true });
    const result = resultsStore.results3D;
    if (!expected) {
      expectLoadedSlab(result);
      return;
    }
    expect(result?.reactions.map(reaction => reaction.nodeId).sort((a, b) => a - b)).toEqual(expected.bases);
    expect(result?.reactions.reduce((sum, reaction) => sum + reaction.fz, 0)).toBeCloseTo(expected.area, 8);
  },
);

it('#2586 still refuses a wall edge crossing the slab strictly inside the face', () => {
  cornerWall(2 * PLATE_EDGE_TOL);
  expect(modelStore.solve3D(false, false, true)).toMatch(/wall.*slab/i);
});


it.each([[3, 4, [74, 73]], [117, 112, [92]]] as const)(
  '#2607 stadium slab %s and wall %s share a compatible boundary',
  (slabId, wallId, shared) => {
    const slab = stadium.quads.find(q => q.id === slabId)!;
    const wall = stadium.quads.find(q => q.id === wallId)!;
    expect(slab.nodes.filter(id => wall.nodes.includes(id))).toEqual(shared);
    expect(nonconformingWallSlab({
      nodes: new Map(stadium.nodes.map(n => [n.id, n])),
      elements: new Map(),
      quads: new Map([[slab.id, slab], [wall.id, wall]]),
    })).toBeNull();
  },
);

function apexWall(offset: number, position = 2) {
  const [corner] = loadedSlab();
  const a = modelStore.addNode(1, position, -3), b = modelStore.addNode(3, position, -3);
  const apex = modelStore.addNode(2, position, offset);
  modelStore.addPlate([a, b, apex], 1, 0.15);
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(b, 'fixed3d');
  modelStore.addElement(corner!, a);
  return [a, b];
}

it.each(directEntries)('#2607 the %s entry refuses an unmatched wall apex in a slab face', async (entry, solve) => {
  apexWall(0);
  const result = await solve();
  expect(result && typeof result === 'object' ? 'returned a result' : result)
    .toEqual(entry === 'reproducible input' ? null : expect.stringMatching(/wall p1.*slab q1/i));
});

it.each([0, PLATE_EDGE_TOL / 2])('#2607 global analysis refuses a triangular wall apex at clearance %s', async clearance => {
  apexWall(-clearance);
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.stringMatching(/wall p1.*slab q1/i) });
  expect(resultsStore.results3D).toBeNull();
});

it.each([[-2 * PLATE_EDGE_TOL, 2], [0, -2 * PLATE_EDGE_TOL]])(
  '#2607 a triangular wall clear of the slab keeps the pressure result (%s, %s)',
  (offset, position) => {
    const base = apexWall(offset, position);
    const result = modelStore.solve3D(false, false, true);
    expectLoadedSlab(result);
    if (!result || typeof result === 'string') throw new Error(String(result));
    expect(result.reactions.filter(r => base.includes(r.nodeId)).map(r => r.fz)).toEqual([0, 0]);
  },
);
function loadedSeam(tilt = 0) {
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const at = (x: number, y: number, z: number) => modelStore.addNode(x, y * cos - z * sin, y * sin + z * cos);
  const a = at(0, 0, 0), b = at(2, 0, 0), c = at(4, 0, 0);
  const d = at(0, 4, 0), e = at(2, 4, 0), f = at(4, 4, 0);
  for (const nodes of [[a, b, e, d], [b, c, f, e]] as const) {
    modelStore.addSurfaceLoad3D(modelStore.addQuad([...nodes], 1, 0.15), 1);
  }
  return { a, b, c, d, e, at };
}

function wallPiercingSeam() {
  const { a, c, d, at } = loadedSeam();
  for (const node of [a, c, d]) modelStore.addSupport(node, 'fixed3d');
  const i = at(2, 1, -3), j = at(2, 3, -3);
  const k = at(2, 1, 1), l = at(2, 3, 1);
  modelStore.addSupport(i, 'fixed3d');
  modelStore.addSupport(j, 'fixed3d');
  modelStore.addElement(a, i);
  return modelStore.addQuad([i, j, l, k], 1, 0.15);
}

it('#2430 refuses a wall piercing the internal edge of a loaded slab mesh', async () => {
  for (const [entry, solve] of directEntries) {
    modelStore.clear();
    wallPiercingSeam();
    const result = await solve();
    expect.soft(result && typeof result === 'object' ? 'returned a result' : result, entry)
      .toEqual(entry === 'reproducible input' ? null : expect.stringMatching(/wall q3.*slab q[12]/i));
  }

  modelStore.clear();
  wallPiercingSeam();
  const outcome = await runGlobalSolve({ directBase: true });
  expect.soft(outcome.ok ? 'returned a result' : outcome.error).toEqual(expect.stringMatching(/wall q3.*slab q[12]/i));
  expect(resultsStore.results3D).toBeNull();
});

it('#2430 solves a loaded acute wall joint that shares the slab seam', async () => {
  for (const tilt of [0, 0.2]) {
    modelStore.clear();
    resultsStore.clear();
    const { b, e, at } = loadedSeam(tilt);
    const apex = at(3.5, 2, 1);
    modelStore.addPlate([b, e, apex], 1, 0.15);
    modelStore.addSupport(apex, 'fixed3d');

    for (const [entry, solve] of directEntries) {
      const result = await solve();
      expect.soft(result, entry).not.toBeNull();
      expect.soft(typeof result, entry + ': ' + String(result)).toBe('object');
    }
    const outcome = await runGlobalSolve({ directBase: true });
    expect.soft(outcome).toMatchObject({ ok: true });
    const result = resultsStore.results3D;
    if (!result) throw new Error('Missing result at the shared acute joint');
    expectLoadedSlab(result);
    expect(result.reactions.map(r => r.nodeId)).toEqual([apex]);
  }
});


function wallAtSlabPerimeter(inset: number) {
  const [corner] = loadedSlab();
  const x = 4 - inset;
  const base = [modelStore.addNode(x, 1, -3), modelStore.addNode(x, 3, -3)] as const;
  const top = [modelStore.addNode(x, 1, 1), modelStore.addNode(x, 3, 1)] as const;
  for (const node of base) modelStore.addSupport(node, 'fixed3d');
  modelStore.addElement(corner!, base[0]);
  return { wall: modelStore.addQuad([...base, top[1], top[0]], 1, 0.15), base };
}

function wallWithSlopingTop(clearanceI: number, clearanceJ: number) {
  const fixture = wallUnderSlab(clearanceI);
  const node = modelStore.quads.get(fixture.wall)!.nodes[1]!;
  modelStore.updateNode(node, 3, 2, -clearanceJ);
  return fixture;
}

function diamondWall(conforming = false) {
  const [a, b, c, d] = loadedSlab() as [number, number, number, number];
  const base = modelStore.addNode(2, 2, -2);
  const top = modelStore.addNode(2, 2, 2);
  modelStore.addSupport(base, 'fixed3d');
  if (!conforming) return modelStore.addQuad([a, base, c, top], 1, 0.15);
  modelStore.removeQuad(1);
  for (const nodes of [[a, b, c], [c, d, a]] as const) {
    modelStore.addSurfaceLoad3D(modelStore.addPlate([...nodes], 1, 0.15), 1, undefined, { on: 'plate' });
  }
  modelStore.addPlate([a, base, c], 1, 0.15);
  modelStore.addPlate([c, top, a], 1, 0.15);
  return null;
}

it.each([
  ['both crossing points inside the perimeter band', () => wallAtSlabPerimeter(PLATE_EDGE_TOL / 2).wall],
  ['a sloping edge inside the contact band', () => wallWithSlopingTop(PLATE_EDGE_TOL / 4, PLATE_EDGE_TOL / 2).wall],
  ['only part of a sloping edge inside the contact band', () => wallWithSlopingTop(PLATE_EDGE_TOL / 2, PLATE_EDGE_TOL * 2).wall],
  ['a diamond face sharing only opposite corners', () => diamondWall()!],
] as const)('known wrong result: #2430 — refuses %s', async (_label, wall) => {
  for (const [entry, solve] of directEntries) {
    modelStore.clear();
    const id = wall();
    const result = await solve();
    expect.soft(result && typeof result === 'object' ? 'returned a result' : result, entry).toEqual(entry === 'reproducible input' ? null : expect.stringMatching(new RegExp('wall q' + id + '.*slab q1', 'i')));
  }

  modelStore.clear();
  const id = wall();
  const outcome = await runGlobalSolve({ directBase: true });
  expect.soft(outcome.ok ? 'returned a result' : outcome.error).toEqual(expect.stringMatching(new RegExp('wall q' + id + '.*slab q1', 'i')));
  expect(resultsStore.results3D).toBeNull();
});

it.each([
  ['both crossings outside the perimeter band', () => wallAtSlabPerimeter(-PLATE_EDGE_TOL / 2)],
  ['a sloping edge beyond the contact distance', () => wallWithSlopingTop(PLATE_EDGE_TOL * 2, PLATE_EDGE_TOL * 3)],
] as const)('#2430 the loaded slab solves with %s', (_label, wall) => {
  const { base } = wall();
  const result = modelStore.solve3D(false, false, true);
  expectLoadedSlab(result);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.filter(r => base.includes(r.nodeId)).map(r => r.fz)).toEqual([0, 0]);
});

it('#2430 solves a diamond wall and slab that share the full diagonal edge', () => {
  diamondWall(true);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

it('#2580 solves a wall that shares the slab edge within the contact band', async () => {
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(4, 0, 0);
  const c = modelStore.addNode(2, 4, 0);
  const i = modelStore.addNode(0, PLATE_EDGE_TOL * 0.95, -PLATE_EDGE_TOL * 0.95);
  const j = modelStore.addNode(4, PLATE_EDGE_TOL * 0.95, -PLATE_EDGE_TOL * 0.95);
  modelStore.addSurfaceLoad3D(modelStore.addPlate([a, b, c], 1, 0.15), 1, undefined, { on: 'plate' });
  modelStore.addQuad([a, i, j, b], 1, 0.15);
  modelStore.addSupport(i, 'fixed3d');
  modelStore.addSupport(j, 'fixed3d');

  for (const [entry, solve] of directEntries) {
    const result = await solve();
    expect.soft(result, entry).not.toBeNull();
    expect.soft(typeof result, entry + ': ' + String(result)).toBe('object');
  }
  const outcome = await runGlobalSolve({ directBase: true });
  expect.soft(outcome).toMatchObject({ ok: true });
  const result = resultsStore.results3D;
  if (!result) throw new Error('Missing result for the shared wall edge');
  expect(result.reactions.reduce((sum, support) => sum + support.fz, 0)).toBeCloseTo(4 * 4 / 2, 8);
});

it('#2580 refuses a wall edge that shares slab corners across an unmeshed diagonal', async () => {
  const [a, , c] = loadedSlab();
  const base = modelStore.addNode(2, 2, -2);
  modelStore.addSupport(base, 'fixed3d');
  const wall = modelStore.addPlate([a!, base, c!], 1, 0.15);
  const refusal = expect.stringMatching(new RegExp('wall p' + wall + '.*slab q1', 'i'));
  for (const [entry, solve] of directEntries) {
    expect.soft(await solve(), entry).toEqual(entry === 'reproducible input' ? null : refusal);
  }
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: refusal });
  expect(resultsStore.results3D).toBeNull();
});

function edgePointJoint(clearance: number, conforming: boolean) {
  const node = (x: number, y: number, z: number) => modelStore.addNode(x, y, z);
  const a = node(0, 0, 0), b = node(0, 2, 0), c = node(0, 2, 4), d = node(0, 0, 4);
  const e = node(-1, 2 + clearance, 2), f = node(1, 2 + clearance, 2);
  const g = node(1, 4, 2), h = node(-1, 4, 2);
  for (const id of [a, b, e, f, g, h]) modelStore.addSupport(id, 'fixed3d');
  modelStore.addElement(a, e);
  if (conforming) {
    const contact = node(0, 2, 2);
    const mid = node(0, 0, 2);
    const top = node(0, 4, 2);
    modelStore.addQuad([a, b, contact, mid], 1, 0.15);
    modelStore.addQuad([mid, contact, c, d], 1, 0.15);
    modelStore.addSurfaceLoad3D(modelStore.addQuad([e, contact, top, h], 1, 0.15), 1);
    modelStore.addSurfaceLoad3D(modelStore.addQuad([contact, f, g, top], 1, 0.15), 1);
  } else {
    modelStore.addQuad([a, b, c, d], 1, 0.15);
    modelStore.addSurfaceLoad3D(modelStore.addQuad([e, f, g, h], 1, 0.15), 1);
  }
}

it.each(directEntries)(
  '#2607 the %s entry refuses a wall and slab touching at unmatched edge interiors', async (entry, solve) => {
    edgePointJoint(0, false);
    const result = await solve();
    expect(result && typeof result === 'object' ? 'returned a result' : result)
      .toEqual(entry === 'reproducible input' ? null : expect.stringMatching(/wall q1.*slab q2/i));
  },
);

it('#2607 global analysis refuses unmatched edge-to-edge contact', async () => {
  edgePointJoint(0, false);
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.stringMatching(/wall q1.*slab q2/i) });
  expect(resultsStore.results3D).toBeNull();
});

it.each([[0, true], [2 * PLATE_EDGE_TOL, false]] as const)('#2607 edge contact clearance %s and shared station %s preserve slab pressure', (clearance, conforming) => {
  edgePointJoint(clearance, conforming);
  const result = modelStore.solve3D(false, false, true);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.reduce((sum, support) => sum + support.fz, 0)).toBeCloseTo(2 * (2 - clearance), 8);
});

function tangentWall(offset: number, shared = false) {
  const [corner] = loadedSlab();
  const a = modelStore.addNode(2, offset - 2, -3), b = modelStore.addNode(-2, offset + 2, -3);
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(b, 'fixed3d');
  if (shared) {
    modelStore.addPlate([a, b, corner!], 1, 0.15);
  } else {
    const c = modelStore.addNode(-2, offset + 2, 1), d = modelStore.addNode(2, offset - 2, 1);
    modelStore.addQuad([a, b, c, d], 1, 0.15);
    modelStore.addElement(corner!, a);
  }
  return [a, b];
}

it.each(directEntries)('#2607 %s detects a slab corner inside the wall face', async (entry, solve) => {
  tangentWall(0);
  const result = await solve();
  expect(result && typeof result === 'object' ? 'returned a result' : result)
    .toEqual(entry === 'reproducible input' ? null : expect.stringMatching(/wall q2.*slab q1/i));
});

it('#2607 global solve detects a tangent wall at the slab vertex', async () => {
  for (const offset of [0, 2 * PLATE_EDGE_TOL]) {
    modelStore.clear();
    tangentWall(offset);
    expect.soft(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.stringMatching(/wall q2.*slab q1/i) });
    expect.soft(resultsStore.results3D).toBeNull();
  }
  modelStore.clear();
  const bases = tangentWall(-2 * PLATE_EDGE_TOL);
  const result = modelStore.solve3D(false, false, true);
  expectLoadedSlab(result);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.filter(r => bases.includes(r.nodeId)).map(r => r.fz)).toEqual([0, 0]);
  modelStore.clear();
  tangentWall(0, true);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});
