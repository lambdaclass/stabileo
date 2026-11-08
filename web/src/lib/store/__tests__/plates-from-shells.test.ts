import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '..';
import { applyPlateMeshes, physicalPlates, planPlateMesh, plateLoadDefs, plateStatus } from '../physical-plates';
import { looseShells, platesFromMeshAtSolve, platesFromShells } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { plateLoops } from '../../model/physical/plate';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await wasmSolver.initSolver(); });

/** An n × m grid of 1 m quads at z = 0, pinned at every edge node, 5 kPa on each quad in case 1. */
function grid(n: number, m: number, skip: (i: number, j: number) => boolean = () => false) {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
  const id: number[][] = [];
  for (let i = 0; i <= n; i++) { id.push([]); for (let j = 0; j <= m; j++) id[i]!.push(modelStore.addNode(i, j, 0)); }
  const quads: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    if (skip(i, j)) continue;
    const q = modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], 1, 0.15);
    modelStore.addSurfaceLoad3D(q, 5, 1);
    quads.push(q);
  }
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) if (i === 0 || j === 0 || i === n || j === m) modelStore.addSupport(id[i]![j]!, 'pinned3d');
  return { id, quads };
}

const solve = () => {
  syncDefinedLoadsForAnalysis();
  const r = modelStore.solve3D(false, false, true);
  expect(typeof r, String(r)).not.toBe('string');
  return r as AnalysisResults3D;
};
const fz = (r: AnalysisResults3D) => r.reactions.reduce((s, x) => s + x.fz, 0);

describe('shells already in a model made plates', () => {
  it('makes a panel one plate with its outline\'s corners, keeps its mesh current and its load, and the answer does not move', () => {
    const { id } = grid(3, 2);
    const before = solve();
    expect(looseShells()).toHaveLength(6);
    const [p] = platesFromShells(looseShells());
    expect(physicalPlates()).toHaveLength(1);
    expect(looseShells()).toHaveLength(0);
    const g = modelStore.model.groups.get(p!)!;
    expect(new Set(plateLoops(g).outer)).toEqual(new Set([id[0]![0], id[3]![0], id[3]![2], id[0]![2]]));
    expect(plateStatus(p!)).toBe('current');
    expect(plateLoadDefs(p!)).toHaveLength(1);
    const after = solve();
    expect(fz(after)).toBeCloseTo(fz(before), 6);
    expect(fz(after)).toBeCloseTo(5 * 6, 6);
    const d = after.displacements.find((x) => x.nodeId === id[1]![1])!.uz;
    expect(d).toBeCloseTo(before.displacements.find((x) => x.nodeId === id[1]![1])!.uz, 9);
  });

  it('meshes the plate it made again from its own definition, the load following', () => {
    grid(3, 2);
    const [p] = platesFromShells(looseShells());
    const r = applyPlateMeshes([planPlateMesh(p!, { size: 0.5 })!]);
    expect(r.plates).toBe(1);
    expect(r.droppedLocalLoads).toBe(0);
    expect(modelStore.model.groups.get(p!)!.members.quads).toHaveLength(24);
    expect(fz(solve())).toBeCloseTo(30, 6);
  });

  it('takes a ring of shells as an outline with a hole', () => {
    grid(3, 3, (i, j) => i === 1 && j === 1);
    const [p] = platesFromShells(looseShells());
    const loops = plateLoops(modelStore.model.groups.get(p!)!);
    expect(loops.outer).toHaveLength(4);
    expect(loops.holes).toHaveLength(1);
    expect(loops.holes[0]).toHaveLength(4);
  });

  it('stops a panel at a member running through it', () => {
    const { id } = grid(4, 2);
    modelStore.addElement(id[2]![0]!, id[2]![1]!, 'frame'); modelStore.addElement(id[2]![1]!, id[2]![2]!, 'frame');
    expect(platesFromShells(looseShells())).toHaveLength(2);
  });

  it('turns a slab the solve was to mesh into a plate waiting for its mesh, its load kept', () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const c = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    for (const n of c) modelStore.addSupport(n, 'pinned3d');
    const q = modelStore.addQuad(c as [number, number, number, number], 1, 0.15);
    modelStore.addSurfaceLoad3D(q, 4, 1);
    const g = modelStore.addGroup('L1', 'physicalMember', { quads: [q] }, { data: { kind: 'slab', provenance: 'declared', meshAtSolve: { size: 0.5, meshed: false, panel: c } } });
    expect(platesFromMeshAtSolve()).toBe(1);
    expect(modelStore.quads.size).toBe(0);
    expect(plateStatus(g)).toBe('unmeshed');
    expect((modelStore.model.groups.get(g)!.data as { meshAtSolve?: unknown }).meshAtSolve).toBeUndefined();
    expect(plateLoadDefs(g)).toHaveLength(1);
    applyPlateMeshes([planPlateMesh(g)!]);
    expect(modelStore.model.groups.get(g)!.members.quads!.length).toBe(48);
    expect(fz(solve())).toBeCloseTo(4 * 12, 6);
  });
});

describe('a circular plate', () => {
  it('has four curved sides and a circular hole, and meshes to its circle', async () => {
    const { createCircularPlate } = await import('../physical-plates');
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const r = createCircularPlate({ center: [0, 0, 0], radius: 3, hole: { center: [1, 0, 0], radius: 0.5 }, materialId: 1, thickness: 0.15 });
    expect('id' in r, JSON.stringify(r)).toBe(true);
    const id = (r as { id: number }).id;
    expect(plateStatus(id)).toBe('unmeshed');
    const plan = planPlateMesh(id, { size: 0.5 })!;
    expect(plan.mesh, plan.refused).not.toBeNull();
    applyPlateMeshes([plan]);
    const quads = modelStore.model.groups.get(id)!.members.quads!;
    expect(quads.length).toBeGreaterThan(20);
    const radii = [...new Set(quads.flatMap((q) => modelStore.quads.get(q)!.nodes))].map((n) => { const p = modelStore.nodes.get(n)!; return Math.hypot(p.x, p.y); });
    expect(Math.max(...radii)).toBeCloseTo(3, 6);
    const fromHole = [...new Set(quads.flatMap((q) => modelStore.quads.get(q)!.nodes))].map((n) => { const p = modelStore.nodes.get(n)!; return Math.hypot(p.x - 1, p.y); });
    expect(Math.min(...fromHole)).toBeGreaterThan(0.5 * Math.cos(Math.PI / 8) - 1e-6);
    expect(fromHole.filter((d) => Math.abs(d - 0.5) < 1e-6).length).toBeGreaterThanOrEqual(8);
    expect(createCircularPlate({ center: [0, 0, 0], radius: 0, materialId: 1, thickness: 0.15 })).toEqual({ problem: 'needNodes' });
  });
});

describe('the seven-storey example', () => {
  it('turns every shell into plates, each current, and solves to the same answer', async () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('pro-edificio-7p');
    const before = solve();
    const shells = looseShells().length;
    const ids = platesFromShells(looseShells());
    expect(ids.length).toBeGreaterThan(10);
    expect(looseShells()).toHaveLength(0);
    expect(ids.every((id) => plateStatus(id) === 'current')).toBe(true);
    expect(ids.reduce((s, id) => s + (modelStore.model.groups.get(id)!.members.quads?.length ?? 0), 0)).toBe(shells);
    const after = solve();
    expect(fz(after)).toBeCloseTo(fz(before), 4);
    const top = before.displacements.reduce((a, b) => (Math.abs(b.uz) > Math.abs(a.uz) ? b : a));
    expect(after.displacements.find((d) => d.nodeId === top.nodeId)!.uz).toBeCloseTo(top.uz, 9);
  }, 120_000);
});

describe('plates meshed together', () => {
  it('leave every one of them current, the later ones meeting the earlier node to node', async () => {
    const { createPlate } = await import('../physical-plates');
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const n = [[0, 0], [4, 0], [8, 0], [8, 3], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    for (const k of n) modelStore.addSupport(k, 'pinned3d');
    const a = (createPlate({ outline: [n[0]!, n[1]!, n[4]!, n[5]!], materialId: 1, thickness: 0.15 }) as { id: number }).id;
    const b = (createPlate({ outline: [n[1]!, n[2]!, n[3]!, n[4]!], materialId: 1, thickness: 0.15 }) as { id: number }).id;
    applyPlateMeshes([planPlateMesh(a, { size: 0.5 })!, planPlateMesh(b, { size: 0.5 })!]);
    expect([plateStatus(a), plateStatus(b)]).toEqual(['current', 'current']);
    const edge = (id: number) => new Set(modelStore.model.groups.get(id)!.members.quads!.flatMap((q) => modelStore.quads.get(q)!.nodes).filter((k) => Math.abs(modelStore.nodes.get(k)!.x - 4) < 1e-9));
    expect(edge(a)).toEqual(edge(b));
  });
});
