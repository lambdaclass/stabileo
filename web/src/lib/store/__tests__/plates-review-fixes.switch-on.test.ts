/**
 * Plates kept safe where the review found them unsafe:
 *  - an edit or an undo between the slices of a background mesh stops it, and the edit stays its own step;
 *  - so does an edit, or a load on the old mesh, in the frame before the old mesh is taken out;
 *  - an analysis waits for a mesh the dialog started instead of running a second one beside it;
 *  - "Size" stops when the plates cannot be meshed, as Calculate does;
 *  - a slab the solve was to mesh keeps a load the plate cannot take over, and its conversion is no undo step;
 *  - a load without a case is read as case 1;
 *  - taking a mesh out takes its foundation springs and nodes with it;
 *  - closing a hole leaves none of its corners behind;
 *  - remeshing gives back the support spread to a node the new mesh keeps;
 *  - a side held all along spreads its support to the user's own nodes on it that have none, and only to those;
 *  - supports at a plate's corners hold those corners, not its sides.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import {
  applyPlateMeshes, applyPlateMeshesAsync, clearPlateMesh, createPlate, holdPlateSides, physicalPlates, planPlateMesh, plateEntry, plateStatus,
  preparePlatesForAnalysisAsync, setPlateShellSpec, shellAreaLoads,
} from '../physical-plates';
import { ensurePlates } from '../plates-from-shells';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { meshProgress } from '../mesh-progress.svelte';
import { meshPlatesInModel } from '../mesh-apply';
import { solveForDesign } from '../design-resize';
import { closePlateHole } from '../plate-shape';
import { plateLoops } from '../../model/physical/plate';

function fresh() { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; }

function slabs(n: number): number[] {
  fresh();
  const ids: number[] = [];
  for (let k = 0; k < n; k++) {
    const c = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x! + 6 * k, y!, 0));
    for (const id of c) modelStore.addSupport(id, 'pinned3d');
    ids.push((createPlate({ outline: c, materialId: 1, thickness: 0.15 }) as { id: number }).id);
  }
  return ids;
}

const unused = () => [...modelStore.nodes.keys()].filter((n) =>
  ![...modelStore.elements.values()].some((e) => e.nodeI === n || e.nodeJ === n)
  && ![...modelStore.quads.values(), ...modelStore.plates.values()].some((s) => s.nodes.includes(n))
  && ![...modelStore.supports.values()].some((s) => s.nodeId === n)
  && ![...modelStore.model.groups.values()].some((g) => g.members.nodes?.includes(n)));

describe('a mesh run in slices', () => {
  it('stops when an edit lands between its frames, and that edit is undone on its own', async () => {
    const ids = slabs(4);
    const plans = ids.map((id) => planPlateMesh(id, { size: 0.5, element: 'quad' })!);
    let added = -1;
    const r = await applyPlateMeshesAsync(plans, (done) => { if (done > 0 && added < 0) added = modelStore.addNode(50, 50, 0); }, 0);
    expect(added).toBeGreaterThan(0);
    expect(r.refused.map((x) => x.reason)).toContain('interrupted');
    expect(r.plates + r.refused.length).toBe(plans.length);
    const meshedQuads = modelStore.quads.size;
    historyStore.undo();
    expect(modelStore.nodes.has(added)).toBe(false);
    expect(modelStore.quads.size).toBe(meshedQuads);
  });

  it('stops before taking the old mesh out when a load is put on it during the first frame', async () => {
    for (const record of [true, false]) {
      const [id] = slabs(1);
      applyPlateMeshes([planPlateMesh(id!, { size: 2, element: 'quad' })!]);
      const plan = planPlateMesh(id!, { size: 0.5, element: 'quad' })!;
      expect(plan.localLoads).toBe(0);
      const q = plateEntry(id!)!.group.members.quads![0]!;
      const run = applyPlateMeshesAsync([plan], undefined, 0);
      const put = () => modelStore.addThermalLoadQuad3D(q, 10, 0, 1);
      if (record) put(); else modelStore.withoutUndo(put);
      const r = await run;
      expect(r.refused.map((x) => x.reason)).toEqual(['interrupted']);
      expect(r.plates).toBe(0);
      expect(modelStore.quads.has(q)).toBe(true);
      expect(modelStore.loads.filter((l) => l.type === 'thermalQuad3d')).toHaveLength(1);
    }
  });

  it('an analysis started while the dialog meshes waits for it, and the card is cleared once', async () => {
    const ids = slabs(3);
    meshBeforeAnalysis.value = true;
    const plans = ids.map((id) => planPlateMesh(id, { size: 0.5, element: 'quad' })!);
    const dialog = meshPlatesInModel(plans, ids);
    const analysis = preparePlatesForAnalysisAsync();
    const [d, a] = await Promise.all([dialog, analysis]);
    expect(d?.plates).toBe(3);
    expect(a).toEqual({ ok: true, meshed: 0, cells: 0 });
    expect(meshProgress.now).toBeNull();
    for (const id of ids) expect(plateStatus(id)).toBe('current');
  });
});

describe('«Size»', () => {
  it('stops before solving when a plate is left without a mesh', () => {
    slabs(1);
    meshBeforeAnalysis.value = false;
    try {
      expect(solveForDesign()).toBe(false);
    } finally {
      meshBeforeAnalysis.value = true;
    }
  });
});

describe('a slab the solve was to mesh, from an older project', () => {
  it('keeps its shell and every load on it when one cannot be lifted onto the plate, as no undo step', () => {
    fresh();
    const c = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    for (const n of c) modelStore.addSupport(n, 'pinned3d');
    const q = modelStore.addQuad(c as [number, number, number, number], 1, 0.15);
    modelStore.addSurfaceLoad3D(q, 4, 1);
    modelStore.addThermalLoadQuad3D(q, 10, 0, 1);
    modelStore.addGroup('L1', 'physicalMember', { quads: [q] }, { data: { kind: 'slab', provenance: 'declared', meshAtSolve: { size: 0.5, meshed: false, panel: c } } });
    const loads = modelStore.loads.length;
    const steps = historyStore.undoCount;
    expect(ensurePlates()).toBe(1);
    expect(historyStore.undoCount).toBe(steps);
    expect(modelStore.quads.has(q)).toBe(true);
    expect(modelStore.loads.length).toBe(loads);
  });
});

describe('the loads on a plate\'s shells', () => {
  it('a load with no case is in case 1', () => {
    const [id] = slabs(1);
    applyPlateMeshes([planPlateMesh(id!, { size: 2, element: 'quad' })!]);
    const q = plateEntry(id!)!.group.members.quads![0]!;
    modelStore.addSurfaceLoad3D(q, 3, 1);
    const load = modelStore.loads.find((l) => l.type === 'surface3d')!;
    delete (load.data as { caseId?: number }).caseId;
    expect(shellAreaLoads().get(`q${q}`)![0]!.caseId).toBe(1);
  });
});

describe('taking a plate\'s mesh out', () => {
  it('takes its foundation springs and its nodes with it', () => {
    fresh();
    const c = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const { id } = createPlate({ outline: c, materialId: 1, thickness: 0.2 }) as { id: number };
    setPlateShellSpec([id], { springs: { ks: 20000, uplift: false, holdHorizontal: true } });
    applyPlateMeshes([planPlateMesh(id, { size: 1 })!]);
    const owned = new Set(plateLoops(plateEntry(id)!.group).owned);
    expect(owned.size).toBeGreaterThan(0);
    clearPlateMesh(id);
    for (const n of owned) expect(modelStore.nodes.has(n)).toBe(false);
    expect([...modelStore.supports.values()].filter((s) => owned.has(s.nodeId))).toEqual([]);
  });
});

describe('closing a hole', () => {
  it('of a plate with no mesh leaves none of its corners in the model', () => {
    fresh();
    const c = [[0, 0], [6, 0], [6, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const h = [[2, 1.5], [3, 1.5], [3, 2.5], [2, 2.5]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    for (const n of c) modelStore.addSupport(n, 'pinned3d');
    const { id } = createPlate({ outline: c, holes: [h], materialId: 1, thickness: 0.15 }) as { id: number };
    expect(plateStatus(id)).toBe('unmeshed');
    expect(closePlateHole(id, 0)).toBeNull();
    for (const n of h) expect(modelStore.nodes.has(n)).toBe(false);
    expect(unused()).toEqual([]);
  });
});

describe('remeshing a supported plate', () => {
  it('gives the support spread along a side back to the nodes the new mesh keeps', () => {
    fresh();
    const c = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const { id } = createPlate({ outline: c, materialId: 1, thickness: 0.15 }) as { id: number };
    holdPlateSides(id, [[c[0]!, c[1]!]], 'pinned3d');
    applyPlateMeshes([planPlateMesh(id, { size: 1 })!]);
    const first = plateEntry(id)!.surface.meshed!.supported ?? [];
    expect(first.length).toBeGreaterThan(0);
    // A member along the supported side keeps the side's mesh nodes in the model through the remesh.
    for (let i = 0; i + 1 < first.length; i++) modelStore.addElement(first[i]!, first[i + 1]!, 'frame');
    applyPlateMeshes([planPlateMesh(id, { size: 1 })!]);
    const supported = new Set([...modelStore.supports.values()].map((s) => s.nodeId));
    for (const n of first) if (modelStore.nodes.has(n)) expect(supported.has(n)).toBe(true);
    expect(physicalPlates()).toHaveLength(1);
  });
});

describe('a plate on supports at its corners only', () => {
  it('stands on those four points: no node of its mesh along a side is given their support', () => {
    fresh();
    const c = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    for (const n of c) modelStore.addSupport(n, 'pinned3d');
    const { id } = createPlate({ outline: c, materialId: 1, thickness: 0.15 }) as { id: number };
    applyPlateMeshes([planPlateMesh(id, { size: 0.5 })!]);
    expect(modelStore.quads.size).toBeGreaterThan(20);
    expect(plateEntry(id)!.surface.meshed!.supported ?? []).toEqual([]);
    expect([...modelStore.supports.values()].map((s) => s.nodeId).sort((a, b) => a - b)).toEqual([...c].sort((a, b) => a - b));
  });
});

describe('a supported side and the user\'s nodes on it', () => {
  it('gives the side\'s support to a node of the user\'s on it that has none, leaves one that has its own, and takes back only what it gave', () => {
    fresh();
    const c = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const bare = modelStore.addNode(1, 0, 0), own = modelStore.addNode(3, 0, 0);
    modelStore.addSupport(own, 'rollerXY');
    const typeOf = (n: number) => [...modelStore.supports.values()].filter((s) => s.nodeId === n).map((s) => s.type);
    const { id } = createPlate({ outline: c, materialId: 1, thickness: 0.15 }) as { id: number };
    holdPlateSides(id, [[c[0]!, c[1]!]], 'pinned3d');
    expect(typeOf(c[0]!)).toEqual(['pinned3d']);
    applyPlateMeshes([planPlateMesh(id, { size: 0.5 })!]);
    const inMesh = (n: number) => [...modelStore.quads.values()].some((q) => q.nodes.includes(n));
    expect(inMesh(bare) && inMesh(own)).toBe(true);
    expect(typeOf(bare)).toEqual(['pinned3d']);
    expect(typeOf(own)).toEqual(['rollerXY']);
    expect(plateEntry(id)!.surface.meshed!.supported).toContain(bare);
    expect(plateEntry(id)!.surface.meshed!.supported).not.toContain(own);

    applyPlateMeshes([planPlateMesh(id, { size: 1 })!]);
    expect(inMesh(bare) && inMesh(own)).toBe(true);
    expect(typeOf(bare)).toEqual(['pinned3d']);
    expect(typeOf(own)).toEqual(['rollerXY']);

    clearPlateMesh(id);
    expect(modelStore.nodes.has(bare) && modelStore.nodes.has(own)).toBe(true);
    expect(typeOf(bare)).toEqual([]);
    expect(typeOf(own)).toEqual(['rollerXY']);
    expect(typeOf(c[0]!)).toEqual(['pinned3d']);
  });
});

describe('the supports and springs a plate\'s mesh was given', () => {
  const springsAt = (n: number) => [...modelStore.supports.values()].filter((s) => s.nodeId === n && s.type === 'custom3d').map((s) => (s as { kz?: number }).kz ?? 0);

  it('a support the user put in place of the one a held side gave is kept when the mesh goes', () => {
    fresh();
    const c = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const { id } = createPlate({ outline: c, materialId: 1, thickness: 0.15 }) as { id: number };
    holdPlateSides(id, [[c[0]!, c[1]!]], 'pinned3d');
    applyPlateMeshes([planPlateMesh(id, { size: 1 })!]);
    const given = plateEntry(id)!.surface.meshed!.supported!.find((n) => !c.includes(n))!;
    expect(given).toBeDefined();
    const before = [...modelStore.supports.values()].find((s) => s.nodeId === given)!;
    modelStore.removeSupport(before.id);
    modelStore.addSupport(given, 'fixed3d');
    clearPlateMesh(id);
    expect([...modelStore.supports.values()].filter((s) => s.nodeId === given).map((s) => s.type)).toEqual(['fixed3d']);
  });

  it('a spring at a node two spring plates share keeps the other plate\'s share when one mesh goes', () => {
    fresh();
    const a = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const b = [a[1]!, modelStore.addNode(8, 0, 0), modelStore.addNode(8, 4, 0), a[2]!];
    const p = (createPlate({ outline: a, materialId: 1, thickness: 0.2 }) as { id: number }).id;
    const q = (createPlate({ outline: b, materialId: 1, thickness: 0.2 }) as { id: number }).id;
    const springs = { ks: 20000, uplift: false, holdHorizontal: false };
    setPlateShellSpec([p, q], { springs });
    applyPlateMeshes([planPlateMesh(p, { size: 1 })!, planPlateMesh(q, { size: 1 })!]);
    const shared = [...modelStore.nodes.values()].find((n) => n.x === 4 && n.y === 2)!.id;
    const both = springsAt(shared);
    expect(both).toHaveLength(1);
    clearPlateMesh(p);
    const left = springsAt(shared);
    expect(left).toHaveLength(1);
    expect(left[0]).toBeCloseTo(both[0]! / 2, 6);
  });

  it('springs taken off a meshed plate leave its mesh, and changed ones are put on it as they are now', () => {
    fresh();
    const c = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const { id } = createPlate({ outline: c, materialId: 1, thickness: 0.2 }) as { id: number };
    setPlateShellSpec([id], { springs: { ks: 20000, uplift: false, holdHorizontal: false } });
    applyPlateMeshes([planPlateMesh(id, { size: 1 })!]);
    const centre = [...modelStore.nodes.values()].find((n) => n.x === 2 && n.y === 2)!.id;
    const k0 = springsAt(centre)[0]!;
    expect(k0).toBeCloseTo(20000, 6);
    setPlateShellSpec([id], { springs: { ks: 40000, uplift: false, holdHorizontal: false } });
    expect(springsAt(centre)).toEqual([2 * k0]);
    setPlateShellSpec([id], { springs: null });
    expect([...modelStore.supports.values()].filter((s) => s.type === 'custom3d')).toEqual([]);
  });

  it('a run stopped by an edit leaves the plates it meshed with their springs', async () => {
    const ids = slabs(3);
    setPlateShellSpec(ids, { springs: { ks: 20000, uplift: false, holdHorizontal: false } });
    const plans = ids.map((id) => planPlateMesh(id, { size: 0.5, element: 'quad' })!);
    let added = -1;
    const r = await applyPlateMeshesAsync(plans, (done) => { if (done > 0 && added < 0) added = modelStore.addNode(50, 50, 0); }, 0);
    expect(r.refused.map((x) => x.reason)).toContain('interrupted');
    const first = ids[0]!;
    const inner = plateLoops(plateEntry(first)!.group).owned;
    expect(inner.length).toBeGreaterThan(0);
    for (const n of inner) expect(springsAt(n), `node ${n}`).toHaveLength(1);
  });
});

it('#1928 preserves pending meshes and applies the completed plate load during interruption', async () => {
  const [first, second] = slabs(2) as [number, number];
  const mesh = { size: 2, element: 'quad' } as const;
  expect(applyPlateMeshes([first, second].map(id => planPlateMesh(id, mesh)!)).plates).toBe(2);
  const originalSecondShells = plateEntry(second)!.group.members.quads!;
  for (const id of plateEntry(first)!.group.members.quads!) modelStore.addSurfaceLoad3D(id, 5, 1);
  const plans = [first, second].map(id => planPlateMesh(id, { ...mesh, size: 1 })!);
  const report = await applyPlateMeshesAsync(plans, done => {
    if (done === 1) modelStore.addNode(50, 50, 0);
  }, 0);
  expect(report.plates).toBe(1);
  expect(report.refused).toEqual([{ id: second, reason: 'interrupted' }]);
  expect(plateEntry(second)!.group.members.quads).toEqual(originalSecondShells);
  const firstShells = plateEntry(first)!.group.members.quads!;
  expect(firstShells.length).toBeGreaterThan(0);
  expect([...shellAreaLoads().keys()].sort()).toEqual(firstShells.map(id => 'q' + id).sort());
});
