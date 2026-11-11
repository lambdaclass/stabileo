/**
 * Every plate of the seven-storey building meshed at once, as the plates panel and "Mesh before
 * analysis" do. Each plate used to be meshed against its neighbours' old meshes, and a stack of
 * core walls grew storey by storey (30 planned cells, 2,500 put in on the top storey); the model
 * then had 21,000 nodes and the solve ran out of memory in the engine's dense fallback.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '..';
import { applyPlateMeshes, applyPlateMeshesAsync, coarseAsModelled, physicalPlates, planPlateMesh, plateStatus, platesNeedingMesh, preparePlatesForAnalysis, preparePlatesForAnalysisAsync } from '../physical-plates';
import { ensurePhysicalModel } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { meshProgress } from '../mesh-progress.svelte';

beforeAll(async () => { await wasmSolver.initSolver(); });

async function building() {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
  await modelStore.loadExample('pro-edificio-7p');
  ensurePhysicalModel();
}
const cellsOf = (name: string) => { const p = physicalPlates().find((x) => x.name === name)!; return (p.group.members.quads?.length ?? 0) + (p.group.members.plates?.length ?? 0); };

describe('the seven-storey building meshed whole', () => {
  it('takes about the cells planned, the same on every storey of a wall stack, and solves', async () => {
    await building();
    const plans = physicalPlates().map((p) => planPlateMesh(p.id, { size: 0.5, element: 'quad', pattern: 'square' })!);
    const planned = plans.reduce((s, p) => s + p.cells, 0);
    const r = applyPlateMeshes(plans);
    expect(r.refused).toEqual([]);
    expect(r.cells).toBeLessThan(planned * 1.1);
    // The core walls one per storey: the same few dozen cells on every storey, not growing up the stack.
    const stack = Array.from({ length: 12 }, (_, i) => cellsOf(`M${i + 4}`));
    expect(Math.max(...stack)).toBeLessThan(60);
    expect(Math.max(...stack)).toBeLessThanOrEqual(1.25 * Math.min(...stack));
    expect(modelStore.nodes.size).toBeLessThan(10000);
    syncDefinedLoadsForAnalysis();
    const res = modelStore.solve3D(false, false, true);
    expect(typeof res, String(res)).not.toBe('string');
  }, 300000);

  it('in slices with a frame between them, gives the same mesh as one step and one undo takes it all back', async () => {
    await building();
    const before = modelStore.quads.size;
    const plans = physicalPlates().map((p) => planPlateMesh(p.id, { size: 0.5, element: 'quad', pattern: 'square' })!);
    const seen: number[] = [];
    const r = await applyPlateMeshesAsync(plans, (done) => seen.push(done), 1);
    expect(seen.length).toBeGreaterThan(2);
    expect(seen.at(-1)).toBe(plans.length);
    const sliced = modelStore.quads.size;
    historyStore.undo();
    expect(modelStore.quads.size).toBe(before);
    applyPlateMeshes(plans.map((p) => planPlateMesh(p.id, p.spec)!));
    expect(modelStore.quads.size).toBe(sliced);
    expect(r.cells).toBe(sliced);
  }, 300000);
});

describe('mesh before analysis', () => {
  it('meshes the plates that came as one shell per bay, while live calc solves them as they are', async () => {
    await building();
    const all = physicalPlates();
    const coarse = all.filter((p) => coarseAsModelled(p)).map((p) => p.id);
    expect(coarse.length).toBeGreaterThan(all.length * 0.8);
    expect(platesNeedingMesh().sort((a, b) => a - b)).toEqual(coarse.sort((a, b) => a - b));
    expect(platesNeedingMesh({ coarse: false })).toEqual([]);
    meshBeforeAnalysis.value = true;
    const phases = new Set<string>();
    const watch = setInterval(() => { if (meshProgress.now) phases.add(meshProgress.now.phase); }, 0);
    const r = await preparePlatesForAnalysisAsync();
    clearInterval(watch);
    expect(r).toMatchObject({ ok: true, meshed: coarse.length });
    expect(meshProgress.now).toBeNull();
    expect(platesNeedingMesh()).toEqual([]);
    expect(modelStore.quads.size).toBeGreaterThan(coarse.length * 10);
  }, 300000);

  it('turned off, solves those plates as they came instead of stopping', async () => {
    await building();
    meshBeforeAnalysis.value = false;
    const shells = modelStore.quads.size;
    try {
      expect(await preparePlatesForAnalysisAsync()).toEqual({ ok: true, meshed: 0, cells: 0 });
      expect(modelStore.quads.size).toBe(shells);
    } finally {
      meshBeforeAnalysis.value = true;
    }
  }, 300000);

  it('keeps a fine mesh that came with the model, taking its element size as the plate\'s', async () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('rc-qa-diagnostic-shells');
    ensurePhysicalModel();
    const plates = physicalPlates();
    expect(plates.length).toBeGreaterThan(0);
    for (const p of plates) {
      expect(p.surface.mesh.size).toBeGreaterThan(1);
      expect(coarseAsModelled(p)).toBe(false);
    }
    expect(platesNeedingMesh()).toEqual([]);
  }, 300000);

  it('leaves a one-shell wall loaded by hand as it came, and meshes the bare one beside it', () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const wall = (x: number) => {
      const a = modelStore.addNode(x, 0, 0), b = modelStore.addNode(x + 4, 0, 0), c = modelStore.addNode(x + 4, 0, 3), d = modelStore.addNode(x, 0, 3);
      modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
      return modelStore.addQuad([a, b, c, d], conc, 0.2);
    };
    const bare = wall(0), loaded = wall(10);
    modelStore.addSurfaceLoad3D(loaded, 2, modelStore.model.loadCases[0]!.id);
    ensurePhysicalModel();
    const plateOf = (q: number) => physicalPlates().find((p) => p.group.members.quads?.includes(q))!;
    expect(coarseAsModelled(plateOf(bare))).toBe(true);
    expect(coarseAsModelled(plateOf(loaded))).toBe(false);
    const loadedId = plateOf(loaded).id;
    meshBeforeAnalysis.value = true;
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true, meshed: 1 });
    expect(modelStore.quads.has(loaded)).toBe(true);
    expect(plateStatus(loadedId)).toBe('current');
    expect(modelStore.loads.filter((l) => l.type === 'surface3d' && (l.data as { quadId: number }).quadId === loaded)).toHaveLength(1);
    expect(platesNeedingMesh()).toEqual([]);
  });
});
