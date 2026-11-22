import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { runGlobalSolve } from '../../engine/live-calc';
import { runDirectAnalysis } from '../../engine/direct-analysis';
import type { AnalysisResults3D } from '../../engine/types-3d';
import { initSolver } from '../../engine/wasm-solver';
import { PLANE_TOL, plateLoops, type PlateMeshSpec } from '../../model/physical/plate';
import { weldTolerance } from '../../model/weld-tolerance';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { createArc, remakeArc } from '../curved-members';
import { centerlineInput } from '../dynamic-input';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import {
  addPlateLoad, applyPlateMeshes, createPlate, meshBeforeAnalysis, planPlateMesh,
  planPlateMeshes, plateEntry, plateStatus, setPlateMeshSpec,
} from '../physical-plates';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear();
  historyStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
  meshBeforeAnalysis.value = true;
});
afterEach(() => { uiStore.analysisMode = '2d'; });

const arcSpec = { size: 1, element: 'tri', followMembers: false } as const;
const squareSpec = { size: 2, element: 'quad', followMembers: false } as const;

function makePlate(outline: number[], mesh: PlateMeshSpec, arcMids?: number[]) {
  const plate = createPlate({ name: 'Test floor', outline, arcMids, mesh, materialId: 1, thickness: 0.2, followArcs: false });
  if (!('id' in plate)) throw new Error(plate.problem);
  addPlateLoad(plate.id, 1, 1);
  return plate.id;
}

function arcFloor(memberSide: -1 | 0 | 1, plateSide = -1, followMembers = false) {
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(4, 0, 0);
  const c = modelStore.addNode(4, 5, 0);
  const d = modelStore.addNode(0, 5, 0);
  const members = memberSide ? createArc(a, { x: 2, y: 2 * memberSide, z: 0 }, b, 4) : [];
  if (memberSide) expect(members).toHaveLength(4);
  const mid = modelStore.addNode(2, 2 * plateSide, 0);
  for (const node of [a, b, c, d]) modelStore.addSupport(node, 'fixed3d');
  return { id: makePlate([a, mid, b, c, d], { ...arcSpec, followMembers }, [1]), mid, members };
}

function answer(result = modelStore.solve3D(false, false, true)) {
  if (!result || typeof result === 'string') throw new Error(String(result));
  return result;
}

const reaction = (result: AnalysisResults3D) => result.reactions.reduce((total, support) => total + support.fz, 0);
const peakUz = (result: AnalysisResults3D) => Math.max(...result.displacements.map(d => Math.abs(d.uz)));
const arcArea = (segments: number) => segments * 2 * Math.sin(Math.PI / segments);

for (const follow of [false, true]) {
  it(`#2460 manual remesh follows the declared semicircle with member following ${follow}`, async () => {
    const { id } = arcFloor(1, -1, follow);
    const plans = await planPlateMeshes([id]);
    expect(plans).toHaveLength(1);
    expect(applyPlateMeshes(plans!).refused).toEqual([]);
    expect(plateStatus(id)).toBe('current');
    syncDefinedLoadsForAnalysis();
    expect(reaction(answer())).toBeCloseTo(20 + arcArea(Math.ceil(2 * Math.PI)), 8);
  });
}

it('#2460 automatic remesh balances the specified sweep pressure', async () => {
  const { id } = arcFloor(1);
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({ ok: true });
  expect(plateStatus(id)).toBe('current');
  expect(reaction(answer(resultsStore.results3D))).toBeCloseTo(20 + arcArea(Math.ceil(2 * Math.PI)), 8);
});

const directEntries = [
  ['linear', () => modelStore.solve3D(false, false, true)],
  ['async linear', () => modelStore.solve3DAsync(false, false, true)],
  ['linear combinations', () => modelStore.solveCombinations3D(false, false, true)],
  ['parallel linear combinations', () => modelStore.solveCombinations3DParallel(false, false, true)],
  ['P-Delta combinations', () => modelStore.solveCombinations3D(false, false, true)],
  ['parallel P-Delta combinations', () => modelStore.solveCombinations3DParallel(false, false, true)],
  ['design', () => {
    const model = modelStore.model;
    return runDirectAnalysis(model, model.loadCases, model.combinations, { includeSelfWeight: false });
  }],
  ['advanced input', () => {
    try { centerlineInput({ caseDisplacements: true }); } catch (error) { return (error as Error).message; }
    return null;
  }],
  ['reproducible input', () => modelStore.singleSolveInput3D(false, false, true)],
] as const;

for (const [entry, solve] of directEntries) {
  it(`#2460 the ${entry} entry rejects a saved complementary mesh`, async () => {
    const { id, mid } = arcFloor(1, 1);
    expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
    syncDefinedLoadsForAnalysis();
    expect(reaction(answer())).toBeCloseTo(20 - arcArea(4), 8);
    modelStore.updateNode(mid, 2, -2, 0);
    modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
    modelStore.setAnalysis({ perCombination: entry.includes('P-Delta') || entry === 'design' ? 'pdelta' : 'linear' });
    expect(await solve()).toEqual(entry === 'reproducible input' ? null : expect.stringContaining('Test floor'));
    expect(plateStatus(id)).toBe('stale');
  });
}

for (const memberSide of [0, -1] as const) {
  it(`#2460 solves a specified sweep with member side ${memberSide}`, () => {
    const { id } = arcFloor(memberSide);
    expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
    syncDefinedLoadsForAnalysis();
    expect(reaction(answer())).toBeCloseTo(20 + arcArea(memberSide ? 4 : Math.ceil(2 * Math.PI)), 8);
  });
}

it('#2460 ambiguous member samples refuse remesh without replacing the old mesh', async () => {
  const { id, members } = arcFloor(-1);
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  const beforeEdit = planPlateMesh(id)!;
  expect(beforeEdit.mesh).toBeTruthy();
  const station = modelStore.elements.get(members[0]!)!.nodeJ;
  const y = -PLANE_TOL / 2;
  modelStore.updateNode(station, 2 - Math.sqrt(4 - y * y), y, 0);
  const snapshot = modelStore.snapshot();
  const version = modelStore.modelVersion;
  const plan = planPlateMesh(id)!;
  expect(plan).toMatchObject({ mesh: null, refused: 'ambiguousSweep' });
  for (const preview of [beforeEdit, plan]) {
    expect(applyPlateMeshes([preview])).toMatchObject({ plates: 0, refused: [{ id, reason: 'ambiguousSweep' }] });
  }
  expect(modelStore.modelVersion).toBe(version);
  expect(modelStore.snapshot()).toEqual(snapshot);
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.stringMatching(/Test floor.*sweep/i) });
  expect(resultsStore.results3D).toBeNull();
  expect(modelStore.snapshot()).toEqual(snapshot);
});

it('#2460 member stations spanning both sweeps refuse remesh', () => {
  const { id, members } = arcFloor(-1);
  const station = modelStore.elements.get(members[1]!)!.nodeJ;
  modelStore.updateNode(station, 2, 2, 0);
  expect(applyPlateMeshes([planPlateMesh(id)!])).toMatchObject({ plates: 0, refused: [{ id, reason: 'ambiguousSweep' }] });
  expect(plateEntry(id)!.surface.meshed).toBeUndefined();
});

it('#2460 a member station clearly on the midpoint side remains eligible', () => {
  const { id, members } = arcFloor(-1);
  const station = modelStore.elements.get(members[0]!)!.nodeJ;
  const y = -2 * PLANE_TOL;
  modelStore.updateNode(station, 2 - Math.sqrt(4 - y * y), y, 0);
  expect(planPlateMesh(id)!.refused).toBeUndefined();
});

function squareFloor(element: 'quad' | 'tri' = 'quad') {
  const outline = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  for (const node of outline) modelStore.addSupport(node, 'fixed3d');
  const id = makePlate(outline, { ...squareSpec, element });
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  return id;
}

const offset = { frame: 'local', x: 0, y: 0, z: 0.1 } as const;
const quads = (id: number) => (plateEntry(id)!.group.members.quads ?? []).map(shell => modelStore.quads.get(shell)!);

for (const field of ['offset', 'curved'] as const) {
  it(`#2461 exact remesh preserves one quad's ${field} and its solved displacement`, () => {
    const id = squareFloor();
    const original = quads(id)[0]!;
    const coords = (nodes: readonly number[]) => nodes.map(n => modelStore.nodes.get(n)).map(p => [p!.x, p!.y, p!.z ?? 0]);
    const corners = coords(original.nodes);
    if (field === 'offset') modelStore.setShellOffset('quad', original.id, offset);
    else modelStore.setQuadCurved(original.id, true);
    syncDefinedLoadsForAnalysis();
    const before = peakUz(answer());
    expect(before).toBeGreaterThan(0);
    expect(applyPlateMeshes([planPlateMesh(id)!])).toMatchObject({ plates: 1, refused: [] });
    syncDefinedLoadsForAnalysis();
    expect(peakUz(answer())).toBeCloseTo(before, 12);
    const edited = quads(id).filter(q => q[field] !== undefined);
    expect(edited).toHaveLength(1);
    expect(edited[0]![field]).toEqual(field === 'offset' ? offset : true);
    expect(coords(edited[0]!.nodes)).toEqual(corners);
  });

  it(`#2461 a different mesh refuses a quad's ${field} edit without changing the model`, async () => {
    const id = squareFloor();
    const original = quads(id)[0]!;
    if (field === 'offset') modelStore.setShellOffset('quad', original.id, offset);
    else modelStore.setQuadCurved(original.id, true);
    syncDefinedLoadsForAnalysis();
    const before = peakUz(answer());
    const snapshot = modelStore.snapshot();
    const version = modelStore.modelVersion;
    const plans = await planPlateMeshes([id], { size: 1 });
    expect(plans).toMatchObject([{ name: 'Test floor', mesh: null, refused: 'shellEdits' }]);
    expect(applyPlateMeshes(plans!)).toMatchObject({ plates: 0, refused: [{ id, reason: 'shellEdits' }] });
    expect(modelStore.modelVersion).toBe(version);
    expect(modelStore.snapshot()).toEqual(snapshot);
    expect(plateStatus(id)).toBe('current');
    expect(peakUz(answer())).toBeCloseTo(before, 12);
  });
}

it('#2461 automatic remesh refuses an unmapped triangle offset and withholds results', async () => {
  const id = squareFloor('tri');
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({ ok: true });
  expect(reaction(answer(resultsStore.results3D))).toBeCloseTo(16, 8);
  const triangle = plateEntry(id)!.group.members.plates![0]!;
  modelStore.setShellOffset('plate', triangle, offset);
  setPlateMeshSpec([id], { element: 'quad' });
  const snapshot = modelStore.snapshot();
  expect(await runGlobalSolve({ directBase: true })).toEqual({ ok: false, error: expect.stringMatching(/Test floor.*offset/i) });
  expect(resultsStore.results3D).toBeNull();
  expect(modelStore.snapshot()).toEqual(snapshot);
  expect(plateStatus(id)).toBe('stale');
});

it('#2461 apply rechecks a shell edit made after preview', () => {
  const id = squareFloor();
  const plan = planPlateMesh(id, { size: 1 })!;
  expect(plan.mesh).toBeTruthy();
  modelStore.setShellOffset('quad', quads(id)[0]!.id, offset);
  const snapshot = modelStore.snapshot();
  expect(applyPlateMeshes([plan])).toMatchObject({ plates: 0, refused: [{ id, reason: 'shellEdits' }] });
  expect(modelStore.snapshot()).toEqual(snapshot);
});

it('#2461 remaking a member cannot clear a plate with shell edits', () => {
  const { id, members } = arcFloor(1, 1);
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  const shell = plateEntry(id)!.group.members.plates![0]!;
  modelStore.setShellOffset('plate', shell, offset);
  const arc = modelStore.elements.get(members[0]!)!.arc!;
  const snapshot = modelStore.snapshot();
  expect(remakeArc(arc.id, { segments: 8 })).toMatchObject({ refused: ['Test floor'] });
  expect(modelStore.snapshot()).toEqual(snapshot);
});

it('#2461 a triangle offset and its solved displacement survive an exact remesh', () => {
  const id = squareFloor('tri');
  const triangles = () => plateEntry(id)!.group.members.plates!.map(n => modelStore.plates.get(n)!);
  const original = triangles()[0]!;
  modelStore.setShellOffset('plate', original.id, offset);
  syncDefinedLoadsForAnalysis();
  const before = peakUz(answer());
  expect(before).toBeGreaterThan(0);
  expect(applyPlateMeshes([planPlateMesh(id)!])).toMatchObject({ plates: 1, refused: [] });
  syncDefinedLoadsForAnalysis();
  expect(peakUz(answer())).toBeCloseTo(before, 12);
  const edited = triangles().filter(shell => shell.offset !== undefined);
  expect(edited).toHaveLength(1);
  expect(edited[0]).toMatchObject({ nodes: original.nodes, offset });
});

it('#2461 refuses to make an inexact match by snapping to a shifted old mesh node', () => {
  const id = squareFloor();
  const shell = quads(id)[0]!;
  modelStore.setShellOffset('quad', shell.id, offset);
  const owned = new Set(plateLoops(plateEntry(id)!.group).owned);
  const node = modelStore.nodes.get(shell.nodes.find(n => owned.has(n))!)!;
  modelStore.updateNode(node.id, node.x + weldTolerance() / 2, node.y, node.z);
  const snapshot = modelStore.snapshot();
  expect(applyPlateMeshes([planPlateMesh(id)!])).toMatchObject({ plates: 0, refused: [{ id, reason: 'shellEdits' }] });
  expect(modelStore.snapshot()).toEqual(snapshot);
});

it('#2461 a different mesh solves after explicitly clearing the edit', () => {
  const id = squareFloor();
  const first = quads(id)[0]!.id;
  modelStore.setShellOffset('quad', first, offset);
  modelStore.setShellOffset('quad', first, undefined);
  expect(applyPlateMeshes([planPlateMesh(id, { size: 1 })!])).toMatchObject({ plates: 1, refused: [] });
  expect(quads(id)).toHaveLength(16);
  syncDefinedLoadsForAnalysis();
  expect(reaction(answer())).toBeCloseTo(16, 8);
});
