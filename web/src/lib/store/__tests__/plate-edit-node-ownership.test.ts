import { afterEach, beforeAll, expect, it } from 'vitest';
import { modelStore } from '..';
import { modelFeatures } from '../../provenance/model-features';
import { meshDeferredSlabs, simplifySlabs } from '../../model/building/deferred-slabs';
import { tieFootprints } from '../../model/building/column-footprints';
import { applyCode } from '../../model/code/apply';
import { modelToCode } from '../../model/code/format';
import { renumber } from '../../model/edit/renumber';
import { closePlateHole, setPlateSideSagitta } from '../plate-shape';
import { applyPlateMeshes, applyPlateMeshesAsync, clearPlateMesh, createPlate, deletePlate, plateEntry, plateSides, planPlateMesh, setPlateSideArc } from '../physical-plates';

import { serializeProject, deserializeProject } from '../file';
import { plateLoops } from '../../model/physical/plate';
import { initSolver } from '../../engine/wasm-solver';

beforeAll(async () => { await initSolver(); });

function reopen() {
  const file = serializeProject();
  modelStore.clear();
  expect(deserializeProject(file)).toBe(true);
}

afterEach(() => modelStore.clear());

function fixture() {
  modelStore.clear();
  const nodes = (points: Array<[number, number]>) => points.map(([x, y]) => modelStore.addNode(x, y, 0));
  const outline = nodes([[0, 0], [6, 0], [6, 4], [0, 4]]);
  const hole = nodes([[2, 1], [3, 1], [3, 2], [2, 2]]);
  const plate = createPlate({ outline, holes: [hole], materialId: 1, thickness: 0.15 });
  if ('problem' in plate) throw Error(plate.problem);
  return { id: plate.id, outline, hole };
}

it('closing a saved hole deletes its authored nodes', () => {
  const { id, hole } = fixture();
  reopen();
  expect(closePlateHole(id, 0)).toBeNull();
  expect(hole.filter(n => modelStore.nodes.has(n))).toEqual(hole);
  expect(closePlateHole(id, 0)).toBe('needNodes');
});

it.each([0, 0.3])('changing a side to sagitta %s deletes the supplied arc node', sagitta => {
  const { id } = fixture();
  const mid = modelStore.addNode(3, -0.5, 0);
  expect(setPlateSideArc(id, 0, mid)).toBeNull();
  reopen();
  expect(setPlateSideSagitta(id, 0, sagitta)).toBeNull();
  expect(modelStore.nodes.has(mid)).toBe(true);
});

it.each([true, false])('straightening a generated side must retain a mass-bearing point (attached %s)', attached => {
  const { id, hole } = fixture();
  expect(setPlateSideSagitta(id, 0, 0.3)).toBeNull();
  const mid = plateSides(id)[0]!.mid!;
  const points = [{ nodeId: hole[0]!, m: 3 }, ...(attached ? [{ nodeId: mid, m: 2 }] : [])];
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  reopen();
  expect(setPlateSideSagitta(id, 0, 0)).toBeNull();
  expect(modelStore.nodes.has(mid)).toBe(attached);
  expect(modelStore.model.massSource?.points).toEqual(points);
});

it('deleting a plate preserves a point mass at a released corner', () => {
  const { id, outline } = fixture();
  const points = [{ nodeId: outline[0]!, m: 2 }];
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  deletePlate(id);
  expect(modelStore.model.massSource?.points).toEqual(points);
  expect(modelStore.nodes.has(outline[0]!)).toBe(true);
  expect(modelStore.nodes.has(outline[1]!)).toBe(false);
});

it.each([applyPlateMeshes, applyPlateMeshesAsync])('clearing a mesh preserves attached mass points (%p)', async apply => {
  const { id } = fixture();
  const plan = planPlateMesh(id, { size: 1, element: 'quad', followMembers: false });
  if (!plan?.mesh) throw Error(String(plan?.refused));
  expect((await apply([plan])).refused).toEqual([]);
  const [first, second] = plateLoops(plateEntry(id)!.group).owned;
  if (first === undefined || second === undefined) throw Error('expected two mesh-created nodes');
  const points = [{ nodeId: first, m: 2 }];
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  reopen();
  clearPlateMesh(id);
  expect(modelStore.model.massSource?.points).toEqual(points);
  expect(modelStore.nodes.has(first)).toBe(true);
  expect(modelStore.nodes.has(second)).toBe(false);
});

it('identifies plate edits that can affect the saved mass distribution', () => {
  const { hole } = fixture();
  const feature = () => modelFeatures(modelStore.snapshot()).has('physicalPlatePointMasses');
  expect(feature()).toBe(false);
  const outside = modelStore.addNode(9, 9, 0);
  const points = [{ nodeId: outside, m: 2 }];
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  expect(feature()).toBe(false);
  modelStore.setMassSource({ kind: 'custom', factors: [], points: [...points, { nodeId: hole[0]!, m: 3 }] });
  expect(feature()).toBe(true);
});

it.each([applyPlateMeshes, applyPlateMeshesAsync])('clearing a physical plate mesh drops a separately authored rigid link (%p)', async apply => {
  const { id, outline } = fixture();
  const plan = planPlateMesh(id, { size: 1, element: 'quad', followMembers: false });
  if (!plan?.mesh) throw Error(String(plan?.refused));
  expect((await apply([plan])).refused).toEqual([]);
  const [slaveNode] = plateLoops(plateEntry(id)!.group).owned;
  if (slaveNode === undefined) throw Error('expected a mesh node');
  const link = { type: 'rigidLink' as const, masterNode: outline[0]!, slaveNode, dofs: [0, 1, 2, 3, 4, 5] };
  modelStore.addConstraint(link);
  reopen();
  clearPlateMesh(id);
  expect(modelStore.model.constraints).toContainEqual(link);
  expect(modelStore.nodes.has(slaveNode)).toBe(true);
});

it('simplifying a deferred slab erases an authored link and point mass', () => {
  modelStore.clear();
  const panel = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x,y]) => modelStore.addNode(x!, y!)) as [number, number, number, number];
  const quad = modelStore.addQuad(panel, 1, 0.15);
  const id = modelStore.addGroup('L1', 'physicalMember', { quads: [quad] }, { data: { kind: 'slab', provenance: 'declared', meshAtSolve: { size: 1, meshed: false, panel } } });
  expect(meshDeferredSlabs().slabs).toBe(1);
  const free = [...modelStore.nodes.keys()].filter(n => !panel.includes(n));
  const [slaveNode, massNode] = free;
  if (slaveNode === undefined || massNode === undefined) throw Error('expected two mesh nodes');
  const link = { type: 'rigidLink' as const, masterNode: panel[0], slaveNode };
  const points = [{ nodeId: massNode, m: 3 }];
  modelStore.addConstraint(link);
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  expect(modelFeatures(modelStore.snapshot())).toContain('plateMeshRigidLinks');
  expect(modelFeatures(modelStore.snapshot())).toContain('physicalPlatePointMasses');
  expect(simplifySlabs([id]).slabs).toBe(1);
  expect(modelStore.model.constraints).toContainEqual(link);
  expect(modelStore.nodes.has(slaveNode)).toBe(true);
  expect(modelStore.model.massSource?.points).toEqual(points);
  expect(modelStore.nodes.has(massNode)).toBe(true);
});

it.each([true, false])('releases a shared footprint tie only after its last owner, and preserves an authored equivalent (%s)', authored => {
  const { id, outline, hole } = fixture();
  const other = createPlate({ outline: hole, materialId: 1, thickness: 0.15 });
  if ('problem' in other) throw Error(other.problem);
  const masterNode = outline[0]!;
  const slaveNode = hole[0]!;
  const link = { type: 'rigidLink' as const, masterNode, slaveNode, dofs: [0, 1, 2, 3, 4, 5] };
  if (authored) modelStore.addConstraint(link);
  const surface = [{ node: masterNode, x: 0, y: 0, hx: 3, hy: 2 }];
  modelStore.bulkMutate(() => {
    expect(tieFootprints([slaveNode], surface, id)).toBe(authored ? 0 : 1);
    expect(tieFootprints([slaveNode], surface, other.id)).toBe(0);
    expect(tieFootprints([slaveNode], surface, other.id)).toBe(0);
  });
  const snapshot = JSON.parse(serializeProject()).snapshot;
  expect(snapshot.constraints).toEqual([link]);
  expect(snapshot.footprintLinks?.[0]?.owners).toEqual(authored ? undefined : [id, other.id]);
  const result = renumber({ nodes: true, members: false, order: 'xyz', start: 30 });
  if ('refused' in result) throw Error(result.refused);
  reopen();
  clearPlateMesh(id);
  expect(modelStore.model.constraints).toHaveLength(1);
  expect(modelStore.snapshot().footprintLinks?.[0]?.owners).toEqual(authored ? undefined : [other.id]);
  clearPlateMesh(other.id);
  expect(modelStore.model.constraints).toHaveLength(authored ? 1 : 0);
});

it('keeps a constraint when its saved footprint record no longer matches the constraint', () => {
  const { id, outline, hole } = fixture();
  const masterNode = outline[0]!;
  const slaveNode = hole[0]!;
  tieFootprints([slaveNode], [{ node: masterNode, x: 0, y: 0, hx: 3, hy: 2 }], id);
  const file = JSON.parse(serializeProject());
  expect(file.snapshot.footprintLinks).toHaveLength(1);
  file.snapshot.constraints[0].dofs = [0];
  expect(deserializeProject(JSON.stringify(file))).toBe(true);
  clearPlateMesh(id);
  expect(modelStore.model.constraints).toEqual([{ type: 'rigidLink', masterNode, slaveNode, dofs: [0] }]);
});


it.each([false, true])('known wrong result: #2670 model code replaces footprint ownership with the imported constraint (%s)', owned => {
  const { id, outline, hole } = fixture();
  tieFootprints([hole[0]!], [{ node: outline[0]!, x: 0, y: 0, hx: 3, hy: 2 }], id);
  const snapshot = modelStore.snapshot();
  expect(snapshot.footprintLinks).toHaveLength(1);
  if (!owned) delete snapshot.footprintLinks;
  const text = modelToCode(snapshot);
  if (owned) modelStore.clear();
  expect(applyCode(text).applied).toBe(true);
  clearPlateMesh(id);
  expect(modelStore.model.constraints).toHaveLength(owned ? 0 : 1);
});
