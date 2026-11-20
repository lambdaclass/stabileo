import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import { createPlate, meshBeforeAnalysis, plateStatus, preparePlatesForAnalysis } from '../../store/physical-plates';
import { runGlobalSolve } from '../live-calc';
import type { AnalysisResults3D } from '../types-3d';
import { initSolver } from '../wasm-solver';

const reproduce2368 = process.env.RUN_KNOWN_WRONG === '2368' ? it : it.skip;
const reproduce2388 = process.env.RUN_KNOWN_WRONG === '2388' ? it : it.skip;

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
  modelStore.addSurfaceLoad3D(id, -1);
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

const entries = [
  ['direct linear', () => modelStore.solve3D(false, false, true)],
  ['async linear', () => modelStore.solve3DAsync(false, false, true)],
  ['combination P-Delta', () => modelStore.solveCombinations3D(false, false, true)],
  ['parallel combination P-Delta', () => modelStore.solveCombinations3DParallel(false, false, true)],
] as const;

function addPDeltaCombination() {
  modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
  modelStore.setAnalysis({ perCombination: 'pdelta' });
}

reproduce2368.each([true, false])('known wrong result: #2368 preparation names the invalid plate with automatic meshing %s', auto => {
  loadedSlab();
  missingFloor();
  meshBeforeAnalysis.value = auto;
  expect(preparePlatesForAnalysis()).toMatchObject({ ok: false, plates: ['missing floor'] });
});

reproduce2368('known wrong result: #2368 the global solve refuses the invalid plate and publishes no results', async () => {
  loadedSlab();
  missingFloor();
  const outcome = await runGlobalSolve({ directBase: true });
  expect(outcome).toEqual({ ok: false, error: expect.stringContaining('missing floor') });
  expect(resultsStore.results3D).toBeNull();
});

reproduce2368.each(entries)('known wrong result: #2368 the %s entry refuses the invalid plate', async (_entry, solve) => {
  loadedSlab();
  missingFloor();
  addPDeltaCombination();
  expect(await solve()).toEqual(expect.stringContaining('missing floor'));
});

it('solves the supported slab and balances its area load in real WASM', async () => {
  loadedSlab();
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({ ok: true });
  expectLoadedSlab(resultsStore.results3D);
});

function wallSlabJoint(stations: 'wall' | 'slab' | 'both' | 'neither' | 'separate') {
  const [a, b, c, d] = loadedSlab();
  const at = (x: number, y: number, z: number) => modelStore.addNode(x, y, z);
  const m = at(2, 0, 0);
  const u = at(0, 2, 0), v = at(4, 2, 0);
  const addQuad = (nodes: [number, number, number, number]) => modelStore.addQuad(nodes, 1, 0.15);
  if (stations === 'slab' || stations === 'both') {
    modelStore.removeQuad(1);
    const n = at(2, 4, 0);
    modelStore.addSurfaceLoad3D(addQuad([a!, m, n, d!]), -1);
    modelStore.addSurfaceLoad3D(addQuad([m, b!, c!, n]), -1);
  }
  const z = stations === 'separate' ? 0.01 : 0;
  const p = z ? at(0, 0, z) : a!, q = z ? at(4, 0, z) : b!;
  for (const node of [p, q, m, u, v]) modelStore.addSupport(node, 'fixed3d');
  const upperA = at(0, 0, 2), upperB = at(4, 0, 2);
  if (stations === 'wall' || stations === 'both') {
    const upperM = at(2, 0, 2);
    addQuad([p, m, upperM, upperA]);
    addQuad([m, q, upperB, upperM]);
  } else {
    addQuad([p, q, upperB, upperA]);
  }
}

reproduce2388.each(['wall', 'slab'] as const)('known wrong result: #2388 refuses a hanging %s node where the wall meets the slab', async stations => {
  wallSlabJoint(stations);
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.any(String) });
  expect(resultsStore.results3D).toBeNull();
});

reproduce2388.each(entries)('known wrong result: #2388 the %s entry refuses a nonconforming wall–slab joint', async (_entry, solve) => {
  wallSlabJoint('wall');
  addPDeltaCombination();
  expect(await solve()).toEqual(expect.stringMatching(/wall.*slab|slab.*wall/i));
});

it.each(['both', 'neither', 'separate'] as const)('solves a wall and slab with %s stations', stations => {
  wallSlabJoint(stations);
  expectLoadedSlab(modelStore.solve3D(false, false, true));
});

reproduce2388('known wrong result: #2388 the seven-storey gallery slabs share the reported wall stations and solve', async () => {
  await modelStore.loadExample('pro-edificio-7p');
  expect(preparePlatesForAnalysis().ok).toBe(true);
  const answer = modelStore.solve3D(true, false, true);
  if (!answer || typeof answer === 'string') throw new Error(String(answer));
  for (const [a, b, joint] of [[13, 14, 121], [58, 59, 130]] as const) {
    const at = modelStore.nodes.get(joint)!;
    const atA = modelStore.nodes.get(a)!;
    const atB = modelStore.nodes.get(b)!;
    const uz = (id: number) => answer.displacements.find(d => d.nodeId === id)!.uz;
    const ratio = (at.x - atA.x) / (atB.x - atA.x);
    const gap = uz(joint) - (uz(a) * (1 - ratio) + uz(b) * ratio);
    const slabsAtJoint = [...modelStore.quads.values(), ...modelStore.plates.values()].filter(cell =>
      cell.nodes.includes(joint) && cell.nodes.every(n => modelStore.nodes.get(n)!.z === at.z));
    expect(slabsAtJoint.length, `node ${joint} old unsplit-edge gap = ${gap} m`).toBeGreaterThan(0);
    expect(Number.isFinite(uz(joint))).toBe(true);
  }
});
