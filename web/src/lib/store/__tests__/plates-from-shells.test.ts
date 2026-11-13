import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '..';
import { applyPlateMeshes, physicalPlates, planPlateMesh, plateLoadDefs, plateStatus } from '../physical-plates';
import { ensurePhysicalModel, ensurePlates, looseShells, platesFromMeshAtSolve, platesFromShells } from '../plates-from-shells';
import { planRecognition } from '../physical-recognition';
import { physicalGroups } from '../physical';
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
  it('makes a panel one plate with its outline\'s corners, keeps its mesh current and its loads as they were written, and the answer does not move', () => {
    const { id } = grid(3, 2);
    const before = solve();
    expect(looseShells()).toHaveLength(6);
    const [p] = platesFromShells(looseShells());
    expect(physicalPlates()).toHaveLength(1);
    expect(looseShells()).toHaveLength(0);
    const g = modelStore.model.groups.get(p!)!;
    expect(new Set(plateLoops(g).outer)).toEqual(new Set([id[0]![0], id[3]![0], id[3]![2], id[0]![2]]));
    expect(plateStatus(p!)).toBe('current');
    expect(plateLoadDefs(p!)).toHaveLength(0);
    expect(modelStore.loads.filter((l) => l.type === 'surface3d')).toHaveLength(6);
    const after = solve();
    expect(fz(after)).toBeCloseTo(fz(before), 6);
    expect(fz(after)).toBeCloseTo(5 * 6, 6);
    const d = after.displacements.find((x) => x.nodeId === id[1]![1])!.uz;
    expect(d).toBeCloseTo(before.displacements.find((x) => x.nodeId === id[1]![1])!.uz, 9);
  });

  it('meshes the plate it made again from its own definition, the uniform load on its elements made the plate\'s and following', () => {
    grid(3, 2);
    const [p] = platesFromShells(looseShells());
    const plan = planPlateMesh(p!, { size: 0.5 })!;
    expect(plan.localLoads).toBe(0);
    const r = applyPlateMeshes([plan]);
    expect(r.plates).toBe(1);
    expect(r.droppedLocalLoads).toBe(0);
    expect(plateLoadDefs(p!)).toHaveLength(1);
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

describe('what a plate selected whole is given beyond its section', () => {
  it('follows every new mesh: curvature, the mid-surface offset and the foundation springs, made again on the new nodes', async () => {
    const { createPlate, setPlateShellSpec } = await import('../physical-plates');
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const c = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const { id } = createPlate({ outline: c, materialId: 1, thickness: 0.2 }) as { id: number };
    const offset = { frame: 'local' as const, x: 0, y: 0, z: -0.1 };
    setPlateShellSpec([id], { curved: true, offset, springs: { ks: 20000, uplift: false, holdHorizontal: true } });
    const springs = () => [...modelStore.supports.values()].filter((s) => s.type === 'custom3d' && ((s as { kz?: number }).kz ?? 0) > 0);
    const kz = () => springs().reduce((a, s) => a + (s as { kz?: number }).kz!, 0);
    for (const size of [2, 1]) {
      applyPlateMeshes([planPlateMesh(id, { size })!]);
      const quads = modelStore.model.groups.get(id)!.members.quads!;
      expect(quads).toHaveLength((4 / size) ** 2);
      expect(quads.every((q) => modelStore.quads.get(q)!.curved && JSON.stringify(modelStore.quads.get(q)!.offset) === JSON.stringify(offset))).toBe(true);
      expect(springs()).toHaveLength((4 / size + 1) ** 2);
      expect(kz()).toBeCloseTo(20000 * 16, 6);
      expect(plateStatus(id)).toBe('current');
    }
    setPlateShellSpec([id], { springs: null, curved: false });
    expect(physicalPlates()[0]!.surface.springs).toBeUndefined();
    expect(physicalPlates()[0]!.surface.curved).toBeUndefined();
  });

  it('is read off the shells it was made from when they agree', () => {
    const { quads } = grid(2, 1);
    for (const q of quads) { modelStore.setQuadCurved(q, true); modelStore.setShellOffset('quad', q, { frame: 'local', x: 0, y: 0, z: 0.05 }); }
    const [p] = platesFromShells(looseShells());
    const s = physicalPlates().find((e) => e.id === p)!.surface;
    expect(s.curved).toBe(true);
    expect(s.offset).toEqual({ frame: 'local', x: 0, y: 0, z: 0.05 });
  });
});

describe('plates side by side', () => {
  it('taking one plate\'s mesh out leaves the plate beside it current, and a bay made of large shells keeps a mesh size one would mesh at', async () => {
    const { clearPlateMesh } = await import('../physical-plates');
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const n = [[0, 0, 0], [5, 0, 0], [5, 5, 0], [0, 5, 0], [5, 0, 3], [0, 0, 3]].map(([x, y, z]) => modelStore.addNode(x!, y!, z!));
    for (const k of [n[0]!, n[1]!, n[2]!, n[3]!]) modelStore.addSupport(k, 'pinned3d');
    modelStore.addQuad([n[0]!, n[1]!, n[2]!, n[3]!], 1, 0.15);
    modelStore.addQuad([n[0]!, n[1]!, n[4]!, n[5]!], 1, 0.2);
    ensurePlates();
    const slab = physicalPlates().find((p) => p.physical.kind === 'slab')!, wall = physicalPlates().find((p) => p.physical.kind === 'wall')!;
    expect([slab.surface.mesh.size, wall.surface.mesh.size]).toEqual([0.5, 0.5]);
    clearPlateMesh(wall.id);
    expect(plateStatus(wall.id)).toBe('unmeshed');
    expect(plateStatus(slab.id)).toBe('current');
  });
});

describe('what made a plate\'s mesh', () => {
  it('says a mesh came with the model until a mesher makes one, and a mesh made at a size is the mesher\'s', () => {
    grid(3, 2);
    const [p] = platesFromShells(looseShells());
    expect(physicalPlates()[0]!.surface.meshed?.original).toBe(true);
    applyPlateMeshes([planPlateMesh(p!, { size: 0.5 })!]);
    expect(physicalPlates()[0]!.surface.meshed?.original).toBeUndefined();
    grid(2, 2);
    platesFromShells(looseShells(), { size: 1 });
    expect(physicalPlates()[0]!.surface.meshed?.original).toBeUndefined();
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

describe('plates and the recognition of physical elements', () => {
  it('a recognised slab made a plate and meshed again stays that plate when the model is read again', async () => {
    const { recognizeAndApply } = await import('../physical-recognition');
    grid(3, 2);
    recognizeAndApply();
    const host = [...modelStore.model.groups.values()].find((g) => (g.data as { kind?: string } | undefined)?.kind === 'slab');
    expect(host).toBeDefined();
    const [p] = platesFromShells(looseShells());
    expect(p).toBe(host!.id);
    applyPlateMeshes([planPlateMesh(p!, { size: 0.5 })!]);
    const surface = (modelStore.model.groups.get(p!)!.data as { surface?: unknown }).surface;
    const quads = modelStore.model.groups.get(p!)!.members.quads;
    recognizeAndApply();
    expect(modelStore.model.groups.get(p!)?.members.quads).toEqual(quads);
    expect((modelStore.model.groups.get(p!)?.data as { surface?: unknown } | undefined)?.surface).toEqual(surface);
    expect(plateStatus(p!)).toBe('current');
    expect(physicalPlates()).toHaveLength(1);
  });

  it('a recognised slab made a plate waiting for its mesh is not dropped when the model is read again', async () => {
    const { recognizeAndApply } = await import('../physical-recognition');
    grid(3, 2);
    recognizeAndApply();
    const [p] = platesFromShells(looseShells(), { keepMesh: false });
    expect(plateStatus(p!)).toBe('unmeshed');
    recognizeAndApply();
    expect(modelStore.model.groups.get(p!)).toBeDefined();
  });
});

describe('loads written on the elements of many panels', () => {
  it('stay as they were when the panels are made plates, and a uniform one becomes each plate\'s own when it is meshed again', () => {
    const { id, quads } = grid(3, 2);
    modelStore.addElement(id[1]![0]!, id[1]![2]!);
    const partial = modelStore.addSurfaceLoad3D(quads[0]!, 2, 2);
    const before = solve();
    const loads = modelStore.loads.map((l) => l.data.id);
    const plates = platesFromShells(looseShells());
    expect(plates).toHaveLength(2);
    expect(plates.map((p) => plateLoadDefs(p).length)).toEqual([0, 0]);
    expect(modelStore.loads.map((l) => l.data.id)).toEqual(loads);
    expect(fz(solve())).toBeCloseTo(fz(before), 6);
    const plans = plates.map((p) => planPlateMesh(p, { size: 0.5 })!);
    expect(plans.map((p) => p.localLoads).sort()).toEqual([0, 1]);
    const r = applyPlateMeshes(plans);
    expect(r.droppedLocalLoads).toBe(1);
    expect(plates.map((p) => plateLoadDefs(p).length)).toEqual([1, 1]);
    expect(modelStore.loads.some((l) => l.data.id === partial)).toBe(false);
    expect(fz(solve())).toBeCloseTo(5 * 6, 6);
  });
});

describe('removeLoads', () => {
  it('takes the loads given out in one undo step, never one a definition wrote, and says how many went', async () => {
    const { addPlateLoad } = await import('../physical-plates');
    const { syncDefinedLoads } = await import('../defined-loads');
    grid(2, 2);
    const [p] = platesFromShells(looseShells());
    addPlateLoad(p!, 2, 1);
    syncDefinedLoads();
    const defined = modelStore.loads.find((l) => (l.data as { fromDef?: number }).fromDef !== undefined)!.data.id;
    const kept = modelStore.loads.length;
    const plain = modelStore.loads.filter((l) => (l.data as { fromDef?: number }).fromDef === undefined).map((l) => l.data.id);
    expect(plain).toHaveLength(4);
    const undo = historyStore.undoCount;
    expect(modelStore.removeLoads([...plain, defined, 99_999])).toBe(plain.length);
    expect(modelStore.loads.map((l) => l.data.id)).not.toContain(plain[0]);
    expect(modelStore.loads.some((l) => l.data.id === defined)).toBe(true);
    expect(modelStore.loads).toHaveLength(kept - plain.length);
    expect(historyStore.undoCount).toBe(undo + 1);
    expect(modelStore.removeLoads([defined])).toBe(0);
    expect(historyStore.undoCount).toBe(undo + 1);
  });
});

describe('every shell a plate in PRO', () => {
  it('makes the shells no plate holds plates as they are, in no undo step, and leaves the answer where it was', () => {
    const { id } = grid(3, 2);
    const before = solve();
    const undo = historyStore.undoCount;
    expect(ensurePlates()).toBe(1);
    expect(looseShells()).toHaveLength(0);
    expect(physicalPlates().map((p) => plateStatus(p.id))).toEqual(['current']);
    expect(historyStore.undoCount).toBe(undo);
    const after = solve();
    expect(after.displacements.find((x) => x.nodeId === id[1]![1])!.uz).toBeCloseTo(before.displacements.find((x) => x.nodeId === id[1]![1])!.uz, 9);
    expect(ensurePlates()).toBe(0);
  });

  it('reads the whole physical model off the seven-storey example by itself: plates L and M with their levels, columns and beams, nothing to recognise by hand', async () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('pro-edificio-7p');
    const before = solve();
    const undo = historyStore.undoCount;
    ensurePhysicalModel();
    expect(historyStore.undoCount).toBe(undo);
    const plates = physicalPlates();
    expect(plates.every((p) => p.physical.provenance === 'inferred')).toBe(true);
    expect(plates.every((p) => /^[LM]\d+$/.test(p.name) && (p.name[0] === 'M') === (p.physical.kind === 'wall'))).toBe(true);
    expect(plates.every((p) => !!p.physical.levelFrom && !!p.physical.levelTo)).toBe(true);
    const kinds = new Set(physicalGroups().map((g) => g.physical.kind));
    expect([...kinds].sort()).toEqual(expect.arrayContaining(['beam', 'column', 'slab', 'wall']));
    expect(planRecognition().changes).toBe(false);
    const groups = modelStore.model.groups;
    ensurePhysicalModel();
    expect(modelStore.model.groups).toBe(groups);
    expect(looseShells()).toHaveLength(0);
    expect(plates.every((p) => plateStatus(p.id) === 'current')).toBe(true);
    expect(fz(solve())).toBeCloseTo(fz(before), 4);
  });

  it('never reads a plate again from its shells: its outline and mesh stay, and a bar drawn later is read on its own', () => {
    const { id } = grid(3, 2);
    ensurePhysicalModel();
    const [p] = physicalPlates();
    const surface = JSON.stringify(p!.surface), members = JSON.stringify(p!.group.members);
    modelStore.addElement(id[0]![0]!, id[3]![0]!);
    ensurePhysicalModel();
    expect(JSON.stringify(physicalPlates()[0]!.surface)).toBe(surface);
    expect(JSON.stringify(physicalPlates()[0]!.group.members)).toBe(members);
    expect(physicalGroups().filter((g) => g.physical.kind === 'beam').map((g) => g.name)).toEqual(['V1']);
  });

  it('leaves an element a person declared as it is', async () => {
    const { declarePhysicalKind } = await import('../physical');
    const { id } = grid(1, 1);
    modelStore.addElement(id[0]![0]!, id[1]![0]!);
    ensurePhysicalModel();
    const beam = physicalGroups().find((g) => g.physical.kind === 'beam')!;
    declarePhysicalKind(beam.id, 'brace');
    modelStore.addElement(id[0]![1]!, id[1]![1]!);
    ensurePhysicalModel();
    expect(modelStore.model.groups.get(beam.id)!.data).toMatchObject({ kind: 'brace', provenance: 'declared' });
    expect(physicalGroups().filter((g) => g.physical.kind === 'beam')).toHaveLength(1);
  });

  it('leaves the shells alone outside PRO', () => {
    grid(2, 2);
    uiStore.analysisMode = '3d';
    expect(ensurePlates()).toBe(0);
    expect(looseShells()).toHaveLength(4);
    uiStore.analysisMode = 'pro';
  });

  it('makes a shell drawn on its corners a plate of one element, meshed again later at any size', () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const n = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    for (const k of n) modelStore.addSupport(k, 'pinned3d');
    modelStore.addQuad(n as [number, number, number, number], 1, 0.15);
    ensurePlates();
    const [p] = physicalPlates();
    expect(p!.group.members.quads).toHaveLength(1);
    applyPlateMeshes([planPlateMesh(p!.id, { size: 1, pattern: 'square' })!]);
    expect(modelStore.model.groups.get(p!.id)!.members.quads).toHaveLength(12);
    expect(plateStatus(p!.id)).toBe('current');
  });
});
