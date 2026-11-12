/**
 * Plates kept safe where the review found them unsafe:
 *  - an edit or an undo between the slices of a background mesh stops it, and the edit stays its own step;
 *  - an analysis waits for a mesh the dialog started instead of running a second one beside it;
 *  - "Size" stops when the plates cannot be meshed, as Calculate does;
 *  - a slab the solve was to mesh keeps a load the plate cannot take over, and its conversion is no undo step;
 *  - a load without a case is read as case 1;
 *  - taking a mesh out takes its foundation springs and nodes with it;
 *  - closing a hole leaves none of its corners behind;
 *  - remeshing gives back the support spread to a node the new mesh keeps.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import {
  applyPlateMeshes, applyPlateMeshesAsync, clearPlateMesh, createPlate, physicalPlates, planPlateMesh, plateEntry, plateStatus,
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
    modelStore.addSupport(c[0]!, 'pinned3d'); modelStore.addSupport(c[1]!, 'pinned3d');
    const { id } = createPlate({ outline: c, materialId: 1, thickness: 0.15 }) as { id: number };
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
