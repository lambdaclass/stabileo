/**
 * Meshing one quad in its place (the PRO quick-edit card's "Mesh").
 *
 * The mesh is the quad, finer, so it must carry what the quad carried: the same pressure on every
 * new quad (and so the same total force), the same thermal load, the same groups. It used to be a
 * delete followed by a mesh of the corners, and the delete took the loads and memberships with it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import { meshQuad } from '../mesh-region';
import { addLoads } from '../../../store/load-ops';
import { serializeProject, deserializeProject } from '../../../store/file';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

function slab(): number {
  const n = [modelStore.addNode(0, 0, 3), modelStore.addNode(4, 0, 3), modelStore.addNode(4, 4, 3), modelStore.addNode(0, 4, 3)] as [number, number, number, number];
  return modelStore.addQuad(n, 1, 0.2);
}
const area = (quadId: number) => {
  const p = modelStore.quads.get(quadId)!.nodes.map((id) => modelStore.nodes.get(id)!);
  const d1 = [p[2]!.x - p[0]!.x, p[2]!.y - p[0]!.y], d2 = [p[3]!.x - p[1]!.x, p[3]!.y - p[1]!.y];
  return Math.abs(d1[0]! * d2[1]! - d1[1]! * d2[0]!) / 2;
};

describe('meshing a quad in its place', () => {
  it('keeps the surface load on every new quad, the total force unchanged', () => {
    const q = slab();
    modelStore.addSurfaceLoad3D(q, -5, 1);
    const r = meshQuad(q, { density: { mode: 'targetSize', size: 1 }, splitBeams: true });
    if (!r || 'refused' in r) throw new Error('refused');
    expect(r.quadCount).toBe(16);
    expect(r.carriedLoads).toBe(1);
    const loads = modelStore.loads.filter((l) => l.type === 'surface3d');
    expect(loads).toHaveLength(16);
    expect(loads.every((l) => l.type === 'surface3d' && l.data.q === -5 && l.data.caseId === 1 && r.quads.includes(l.data.quadId))).toBe(true);
    const total = loads.reduce((s, l) => s + (l.type === 'surface3d' ? l.data.q * area(l.data.quadId) : 0), 0);
    expect(total).toBeCloseTo(-5 * 16, 9);
  });

  it('keeps the thermal load, the groups, the offset and the curvature', () => {
    const q = slab();
    modelStore.addThermalLoadQuad3D(q, 20, 5, 2);
    const g = modelStore.addGroup('Slab', 'user', { quads: [q] });
    modelStore.setShellOffset('quad', q, { frame: 'local', x: 0, y: 0, z: 0.1 });
    modelStore.setQuadCurved(q, true);
    const r = meshQuad(q, { density: { mode: 'fixedDivisions', nx: 2, ny: 2 }, splitBeams: true });
    if (!r || 'refused' in r) throw new Error('refused');
    const thermal = modelStore.loads.filter((l) => l.type === 'thermalQuad3d');
    expect(thermal).toHaveLength(4);
    expect(thermal.every((l) => l.type === 'thermalQuad3d' && l.data.dtUniform === 20 && l.data.dtGradient === 5 && l.data.caseId === 2)).toBe(true);
    expect([...modelStore.model.groups.get(g)!.members.quads!].sort()).toEqual([...r.quads].sort());
    for (const id of r.quads) {
      expect(modelStore.quads.get(id)!.curved).toBe(true);
      expect(modelStore.quads.get(id)!.offset).toEqual({ frame: 'local', x: 0, y: 0, z: 0.1 });
    }
  });

  it('is one undo step', () => {
    const q = slab();
    modelStore.addSurfaceLoad3D(q, -5, 1);
    historyStore.clear();
    meshQuad(q, { density: { mode: 'fixedDivisions', nx: 2, ny: 2 }, splitBeams: true });
    historyStore.undo();
    expect([...modelStore.quads.keys()]).toEqual([q]);
    expect(modelStore.loads.filter((l) => l.type === 'surface3d')).toHaveLength(1);
  });

  it('leaves the quad as it was when another shell already lies in its region', () => {
    const q = slab();
    const c = [modelStore.addNode(1, 1, 3), modelStore.addNode(3, 1, 3), modelStore.addNode(3, 3, 3), modelStore.addNode(1, 3, 3)] as [number, number, number, number];
    modelStore.addQuad(c, 1, 0.2);
    modelStore.addSurfaceLoad3D(q, -5, 1);
    expect(meshQuad(q, { density: { mode: 'targetSize', size: 1 }, splitBeams: true })).toEqual({ refused: 'occupied' });
    expect(modelStore.quads.has(q)).toBe(true);
    expect(modelStore.loads.filter((l) => l.type === 'surface3d')).toHaveLength(1);
  });
});

describe('a triangle numbered as the quad', () => {
  // Quads and triangles number from 1 each: quad 1 and plate 1 are two shells.
  it('keeps the triangle\'s loads on the triangle, and the project reopens', () => {
    const q = slab();
    const t = modelStore.addPlate([modelStore.addNode(10, 0, 3), modelStore.addNode(12, 0, 3), modelStore.addNode(10, 2, 3)], 1, 0.2);
    expect(t).toBe(q);
    modelStore.addSurfaceLoad3D(t, -3, 1, { on: 'plate' });
    addLoads([{ type: 'thermalQuad3d', data: { id: 0, quadId: t, on: 'plate', dtUniform: 15, dtGradient: 0, caseId: 1 } }]);
    modelStore.addSurfaceLoad3D(q, -5, 1);
    const r = meshQuad(q, { density: { mode: 'fixedDivisions', nx: 2, ny: 2 }, splitBeams: true });
    if (!r || 'refused' in r) throw new Error('refused');
    expect(r.carriedLoads).toBe(1);
    const shellLoads = modelStore.loads.flatMap((l) => (l.type === 'surface3d' || l.type === 'thermalQuad3d' ? [{ type: l.type, ...l.data }] : []));
    expect(shellLoads.filter((l) => l.on === 'plate').map((l) => l.quadId)).toEqual([t, t]);
    expect(shellLoads.filter((l) => l.type === 'thermalQuad3d' && !l.on)).toHaveLength(0);
    expect(shellLoads.filter((l) => !l.on).map((l) => l.quadId).sort()).toEqual([...r.quads].sort());
    expect(deserializeProject(serializeProject())).toBe(true);
  });
});
