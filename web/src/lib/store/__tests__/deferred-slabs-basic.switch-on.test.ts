/**
 * A slab placed to be meshed at the analysis (`meshAtSolve`), opened in Basic 3D: Basic has no
 * plates, so it is not made one, the model still solves, and the analysis meshes the slab in place
 * (`model/building/deferred-slabs.ts`) with its whole load on the mesh.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { runGlobalSolve } from '../../engine/live-calc';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import type { SurfaceLoad3D } from '../model.svelte';
import { physicalPlates, platesNeedingMesh } from '../physical-plates';
import { ensurePhysicalModel } from '../plates-from-shells';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await wasmSolver.initSolver(); });
afterEach(() => { uiStore.analysisMode = 'pro'; });

/** A 4 × 3 m slab waiting for its 0.5 m mesh, pinned at its corners, a beam along each side, 4 kPa in case 1. */
function deferredSlab(mode: '3d' | 'pro') {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = mode;
  const c = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  for (const n of c) modelStore.addSupport(n, 'pinned3d');
  c.forEach((n, i) => modelStore.addElement(n, c[(i + 1) % 4]!, 'frame'));
  const q = modelStore.addQuad(c as [number, number, number, number], 1, 0.15);
  modelStore.addSurfaceLoad3D(q, 4, 1);
  const g = modelStore.addGroup('L1', 'physicalMember', { quads: [q] }, { data: { kind: 'slab', provenance: 'declared', meshAtSolve: { size: 0.5, meshed: false, panel: c } } });
  return { g, q };
}

const meshAtSolve = (g: number) => (modelStore.model.groups.get(g)!.data as { meshAtSolve?: { meshed: boolean } }).meshAtSolve;
const area = (q: number) => {
  const [a, b, c, d] = modelStore.quads.get(q)!.nodes.map((n) => modelStore.nodes.get(n)!);
  return Math.abs((c!.x - a!.x) * (d!.y - b!.y) - (d!.x - b!.x) * (c!.y - a!.y)) / 2;
};
const slabLoad = () => modelStore.loads.filter((l) => l.type === 'surface3d').reduce((s, l) => { const d = l.data as SurfaceLoad3D; return s + d.q * area(d.quadId); }, 0);

describe('a slab the solve was to mesh, in Basic 3D', () => {
  it('stays a slab of one shell, and the model solves', () => {
    const { g, q } = deferredSlab('3d');
    expect(ensurePhysicalModel()).toBe(0);
    expect(physicalPlates()).toHaveLength(0);
    expect(platesNeedingMesh()).toHaveLength(0);
    expect(meshAtSolve(g)).toMatchObject({ meshed: false });
    expect([...modelStore.quads.keys()]).toEqual([q]);
    expect(slabLoad()).toBeCloseTo(4 * 12, 9);
    const r = modelStore.solve3D(false, false, false);
    expect(typeof r, String(r)).not.toBe('string');
    expect((r as AnalysisResults3D).displacements.length).toBeGreaterThan(0);
  });

  it('is meshed in place by the analysis, its whole load on the mesh', async () => {
    const { g } = deferredSlab('3d');
    const outcome = await runGlobalSolve();
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
    expect(physicalPlates()).toHaveLength(0);
    expect(meshAtSolve(g)).toMatchObject({ meshed: true });
    expect(modelStore.model.groups.get(g)!.members.quads!.length).toBe(48);
    expect(slabLoad()).toBeCloseTo(4 * 12, 9);
    expect(resultsStore.results3D).not.toBeNull();
  });

  it('is made a plate in PRO', () => {
    const { g } = deferredSlab('pro');
    expect(ensurePhysicalModel()).toBe(1);
    expect(physicalPlates().map((p) => p.id)).toEqual([g]);
    expect(meshAtSolve(g)).toBeUndefined();
  });
});
