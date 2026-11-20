import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { PLATE_EDGE_TOL } from '../../model/physical/plate-analysis';
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

const staleTest = process.env.RUN_KNOWN_WRONG === '2368' ? it : it.skip;
const junctionTest = process.env.RUN_KNOWN_WRONG === '2388' ? it : it.skip;

const directEntries = [
  ...entries,
  ['advanced input', () => {
    try { modelStore.buildSolverInput3D(); } catch (error) { return (error as Error).message; }
    return null;
  }],
  ['reproducible input', () => modelStore.singleSolveInput3D(false, false, true)],
] as const;

for (const [entry, solve] of directEntries) {
  staleTest(`known wrong result: #2368 the ${entry} entry refuses an old mesh after a valid outline edit`, async () => {
    editMeshedFloor();
    expect(await solve()).toEqual(entry === 'reproducible input' ? null : expect.stringContaining('supported floor'));
  });
  junctionTest(`known wrong result: #2388 the ${entry} entry refuses duplicate junction endpoints`, async () => {
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

junctionTest('known wrong result: #2388 global analysis refuses duplicate junction endpoints and publishes no results', async () => {
  wallSlabJoint('duplicate');
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.stringMatching(/wall.*slab/i) });
  expect(resultsStore.results3D).toBeNull();
});

junctionTest('known wrong result: #2388 refuses overlapping endpoints inside the distance limit', () => {
  wallSlabJoint('duplicate', PLATE_EDGE_TOL / 2);
  expect(modelStore.solve3D(false, false, true)).toEqual(expect.stringMatching(/wall.*slab/i));
});

it('#2388 solves independently supported edges beyond the endpoint distance limit', () => {
  wallSlabJoint('duplicate', PLATE_EDGE_TOL * 2);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

it('#2388 solves independently supported shells that only touch at a corner', () => {
  loadedSlab();
  const wallBase = [modelStore.addNode(-4, 0, 0), modelStore.addNode(0, 0, 0)];
  for (const node of wallBase) modelStore.addSupport(node, 'fixed3d');
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
  expect(modelStore.quads.size).toBe(91);
  const answer = modelStore.solve3D(true, false, true);
  if (!answer || typeof answer === 'string') throw new Error(String(answer));
  expect(answer).toHaveProperty('equilibrium.equilibriumOk', true);
  for (let floor = 0; floor < 7; floor++) {
    const corner = 13 + 15 * floor;
    const [wallX, center, wallY] = [121, 122, 123].map(id => id + 3 * floor);
    const slabAt = (id: number) => [...modelStore.quads.values()].filter(cell =>
      cell.nodes.includes(id) && cell.nodes.every(n => modelStore.nodes.get(n)!.z === modelStore.nodes.get(id)!.z));
    const edges = (id: number) => new Set(slabAt(id).flatMap(cell => {
      const i = cell.nodes.indexOf(id);
      return [cell.nodes[(i + 1) % cell.nodes.length], cell.nodes[(i + cell.nodes.length - 1) % cell.nodes.length]];
    }));
    expect(edges(wallX!)).toEqual(new Set([corner, corner + 1, center]));
    expect(edges(wallY!)).toEqual(new Set([corner, corner + 5, center]));
    expect(edges(center!)).toEqual(new Set([wallX, wallY, corner + 6]));
    for (const id of [wallX, center, wallY]) expect(Number.isFinite(answer.displacements.find(d => d.nodeId === id)?.uz)).toBe(true);
  }
});
