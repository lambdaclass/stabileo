import { beforeEach, expect, it, vi } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { createPlate, planPlateMesh, applyPlateMeshes, addPlateLoad } from '../physical-plates';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { generateMesh } from '../../model/edit/mesher';
import { auditMeshCompatibility } from '../../model/edit/mesh-compatibility';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; });
const node = (x: number, y: number, z = 0) => modelStore.addNode(x, y, z);
function plate(outline: number[], holes: number[][] = []) {
  const p = createPlate({ outline, holes, materialId: 1, thickness: 0.15 });
  if (!('id' in p)) throw new Error(JSON.stringify(p));
  return p.id;
}
function apply(ids: number[]) {
  const plans = ids.map(id => planPlateMesh(id, { size: 0.5, element: 'quad', followMembers: true })!);
  for (const p of plans) expect(p.mesh, p.refused).not.toBeNull();
  const r = applyPlateMeshes(plans);
  expect(r.refused).toEqual([]);
  expect(r.plates).toBe(ids.length);
}
function solve() {
  syncDefinedLoadsForAnalysis();
  const r = modelStore.solve3D(false, false, true);
  expect(typeof r, String(r)).not.toBe('string');
  return r as AnalysisResults3D;
}

it('meshes a slab with an oblique beam and an opening, sharing actual IDs and balancing loads', () => {
  const a = node(0, 0), b = node(4, 0), d = node(0, 4), e = node(4, 4);
  const hole = [node(1, 3), node(2, 3), node(2, 3.5), node(1, 3.5)];
  const ids = [plate([a, b, e, d], [hole])];
  for (const [i, j] of [[a, b], [b, e], [e, d], [d, a]]) modelStore.addElement(i!, j!);
  for (const n of [a, b, d, e]) modelStore.addSupport(n, 'pinned3d');
  modelStore.addElement(node(0, 1), node(4, 2));
  for (const id of ids) addPlateLoad(id, 1, 5);
  apply(ids);
  const key = (a: number, b: number) => [a, b].sort((a, b) => a - b).join(',');
  const edges = new Set<string>();
  for (const cell of [...modelStore.quads.values(), ...modelStore.plates.values()]) {
    for (let k = 0; k < cell.nodes.length; k++) edges.add(key(cell.nodes[k]!, cell.nodes[(k + 1) % cell.nodes.length]!));
  }
  expect(modelStore.elements.size).toBeGreaterThan(2);
  for (const beam of modelStore.elements.values()) expect(edges.has(key(beam.nodeI, beam.nodeJ))).toBe(true);
  const first = solve();
  expect(first.reactions.reduce((s, r) => s + r.fz, 0)).toBeCloseTo(15.5 * 5, 6);
  // Read-only previews must not alter topology, forces or displacements.
  const before = modelStore.snapshot();
  for (const id of ids) expect(planPlateMesh(id)?.mesh).not.toBeNull();
  expect(modelStore.snapshot()).toEqual(before);
  const second = solve();
  expect(second.displacements).toEqual(first.displacements);
  expect(second.reactions).toEqual(first.reactions);
  expect(second.elementForces).toEqual(first.elementForces);
});

it('detects a short corner crossing missed by endpoint/midpoint inclusion', () => {
  const id = plate([node(0, 0), node(4, 0), node(4, 4), node(0, 4)]);
  modelStore.addElement(node(-1, 3), node(9, 8));
  const p = planPlateMesh(id, { size: 1 })!;
  expect(p.input!.fixedSegments).toHaveLength(1);
  expect(p.mesh, p.refused).not.toBeNull();
  expect(applyPlateMeshes([p]).refused).toEqual([]);
});

it('does not accept a mesh fallback that drops a requested trace', () => {
  const id = plate([node(0, 0), node(6, 0), node(6, 4), node(0, 4)], [[node(2, 1.5), node(3, 1.5), node(3, 2.5), node(2, 2.5)]]);
  modelStore.addElement(node(0, 1), node(6, 1));
  modelStore.addElement(node(4.5, 3, -3), node(4.5, 3, 3));
  const before = modelStore.snapshot();
  const p = planPlateMesh(id, { size: 0.4 })!;
  const raw = generateMesh(p.input!)!;
  expect(raw).not.toBeNull();
  expect(auditMeshCompatibility(p.input!, raw)).toMatchObject({ ok: false, reason: 'missingEdges' });
  expect(p.refused).toBe('beamCompatibility');
  expect(applyPlateMeshes([p]).plates).toBe(0);
  expect(modelStore.snapshot()).toEqual(before);
});

it('rolls back the entire batch when a beam cannot be cut safely', () => {
  const first = plate([node(0, 0), node(4, 0), node(4, 4), node(0, 4)]);
  const second = plate([node(8, 0), node(12, 0), node(12, 4), node(8, 4)]);
  const beam = modelStore.addElement(node(8, 2), node(12, 2));
  const plans = [first, second].map(id => planPlateMesh(id)!);
  for (const p of plans) expect(p.mesh).not.toBeNull();
  const before = modelStore.snapshot();
  // A refused split must never leave a partially installed mesh.
  const split = modelStore.splitMember;
  const guard = vi.spyOn(modelStore, 'splitMember').mockImplementation((id, ts, opts) => id === beam ? null : split(id, ts, opts));
  try {
    const r = applyPlateMeshes(plans);
    expect(r).toMatchObject({ plates: 0, cells: 0, refused: [{ id: second, reason: 'beamCompatibility' }] });
    expect(modelStore.snapshot()).toEqual(before);
  } finally { guard.mockRestore(); }
});

it('rejects coincident beam endpoints with different IDs instead of pretending they are connected', () => {
  const id = plate([node(0, 0), node(6, 0), node(6, 4), node(0, 4)], [[node(2, 1.5), node(3, 1.5), node(3, 2.5), node(2, 2.5)]]);
  apply([id]);
  modelStore.addElement(node(1, 0), node(1, 4));
  const before = modelStore.snapshot();
  const p = planPlateMesh(id, { size: 0.5 })!;
  expect(p.mesh, p.refused).not.toBeNull();
  expect(applyPlateMeshes([p]).refused).toEqual([{ id, reason: 'beamCompatibility' }]);
  expect(modelStore.snapshot()).toEqual(before);
});

it('meshes a vertical wall with an opening and retains equilibrium', () => {
  const a = node(0, 0, 0), b = node(4, 0, 0), c = node(4, 0, 4), d = node(0, 0, 4);
  const id = plate([a, b, c, d], [[node(1, 0, 1), node(2, 0, 1), node(2, 0, 2), node(1, 0, 2)]]);
  modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
  modelStore.addNodalLoad3D(c, 10, 0, -20, 0, 0, 0, 1);
  const p = planPlateMesh(id, { size: 0.5, element: 'tri' })!;
  expect(p.mesh, p.refused).not.toBeNull();
  expect(applyPlateMeshes([p]).refused).toEqual([]);
  const r = solve();
  expect(r.reactions.reduce((s, r) => s + r.fx, 0)).toBeCloseTo(-10, 6);
  expect(r.reactions.reduce((s, r) => s + r.fz, 0)).toBeCloseTo(20, 6);
});

it('retains the shared-edge guard when adjacent unstructured meshes cannot be made conforming', () => {
  const a = node(0, 0), b = node(4, 0), c = node(8, 0), d = node(0, 4), e = node(4, 4), f = node(8, 4);
  const hole = [node(1, 3), node(2, 3), node(2, 3.5), node(1, 3.5)];
  const ids = [plate([a, b, e, d], [hole]), plate([b, c, f, e])];
  modelStore.addElement(node(0, 1), node(8, 3));
  const plans = ids.map(id => planPlateMesh(id, { size: 0.5 })!);
  for (const p of plans) expect(p.mesh, p.refused).not.toBeNull();
  const before = modelStore.snapshot();
  const r = applyPlateMeshes(plans);
  expect(r).toMatchObject({ plates: 0, cells: 0, refused: [{ id: ids[0], reason: 'cannotMesh' }] });
  expect(modelStore.snapshot()).toEqual(before);
});
