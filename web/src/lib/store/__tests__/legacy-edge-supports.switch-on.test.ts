import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { createPlate, holdPlateSides, physicalPlates, plateEntry, platesNeedingMesh, preparePlatesForAnalysis } from '../physical-plates';
import { ensurePhysicalModel, ensurePlates } from '../plates-from-shells';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { deserializeProject, serializeProject } from '../file';
import { PRO_EXAMPLES } from '../../data/pro-examples';

beforeAll(async () => { await wasmSolver.initSolver(); });

function fresh() { modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro'; meshBeforeAnalysis.value = true; }
const held = () => new Set([...modelStore.supports.values()].map((s) => s.nodeId));
const baseNodes = (id: number) => [...new Set((plateEntry(id)!.group.members.quads ?? []).flatMap((q) => modelStore.quads.get(q)!.nodes))]
  .filter((n) => Math.abs(modelStore.nodes.get(n)!.z ?? 0) < 1e-9);
function wallOnTwoPoints() {
  const corners = [[0, 0, 0], [4, 0, 0], [4, 0, 3], [0, 0, 3]].map(([x, y, z]) => modelStore.addNode(x!, y!, z!));
  modelStore.addSupport(corners[0]!, 'fixed3d');
  modelStore.addSupport(corners[1]!, 'fixed3d');
  const { id } = createPlate({ outline: corners, materialId: 1, thickness: 0.2 }) as { id: number };
  return { id, from: corners[0]!, to: corners[1]! };
}

describe('a model that comes in', () => {
  it('keeps the gallery DXF supports as modelled and meshes the plates conformingly', async () => {
    fresh();
    await PRO_EXAMPLES.find((e) => e.id === 'cad-arch-only-dxf')!.load();
    ensurePhysicalModel();
    const supports = [...modelStore.supports.values()];
    expect(supports).toHaveLength(24);
    meshBeforeAnalysis.value = false;
    expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
    meshBeforeAnalysis.value = true;
    expect(preparePlatesForAnalysis()).toEqual({
      ok: true, meshed: physicalPlates().length, cells: modelStore.quads.size + modelStore.plates.size,
    });
    expect(platesNeedingMesh()).toEqual([]);
    expect([...modelStore.supports.values()]).toEqual(supports);
  }, 600_000);

  it('a saved explicit edge support keeps the whole wall base held through a new mesh', () => {
    fresh();
    const { id, from, to } = wallOnTwoPoints();
    holdPlateSides(id, [[from, to]], 'fixed3d');
    expect(deserializeProject(serializeProject())).toBe(true);
    ensurePlates();
    const [wall] = physicalPlates();
    expect(wall!.surface.edgeSupports).toEqual([{ from, to, type: 'fixed3d' }]);
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true, meshed: 1 });
    const base = baseNodes(wall!.id);
    expect(base.length).toBeGreaterThan(4);
    expect(base.filter((n) => !held().has(n))).toEqual([]);
  });

  it('reopens an older wall on its two point supports without adding a restrained edge', () => {
    fresh();
    const { id, from, to } = wallOnTwoPoints();
    const g = plateEntry(id)!.group;
    const surface = { ...plateEntry(id)!.surface };
    delete surface.edgeSupports;
    modelStore.setGroupData(id, { ...g.data, surface });
    const saved = serializeProject();
    expect(saved).not.toContain('edgeSupports');
    expect(deserializeProject(saved)).toBe(true);
    ensurePlates();
    const [wall] = physicalPlates();
    expect(wall!.surface.edgeSupports).toBeUndefined();
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true, meshed: 1 });
    expect(baseNodes(wall!.id).length).toBeGreaterThan(4);
    expect(held()).toEqual(new Set([from, to]));
  });
});

describe('a plate made now', () => {
  it('drawn as a shell on four corner supports, stands on those four points once meshed', () => {
    fresh();
    const c = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    for (const n of c) modelStore.addSupport(n, 'pinned3d');
    modelStore.addQuad(c as [number, number, number, number], 1, 0.15);
    ensurePlates();
    const [slab] = physicalPlates();
    expect(slab!.surface.edgeSupports).toEqual([]);
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true, meshed: 1 });
    expect(modelStore.quads.size).toBeGreaterThan(20);
    expect(modelStore.supports.size).toBe(4);
  });

  it('drawn by its outline on four corner supports, too', () => {
    fresh();
    const c = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    for (const n of c) modelStore.addSupport(n, 'pinned3d');
    const { id } = createPlate({ outline: c, materialId: 1, thickness: 0.15 }) as { id: number };
    expect(plateEntry(id)!.surface.edgeSupports).toEqual([]);
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true, meshed: 1 });
    expect(modelStore.supports.size).toBe(4);
  });
});
