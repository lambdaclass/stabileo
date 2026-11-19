/**
 * Sides held all along before plates declared them (`edgeSupports`): a model that comes in from a
 * file, an example or an import keeps the sides a plain support at both ends held, as data; a
 * plate drawn now on corner supports stands on those points.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { createPlate, physicalPlates, plateEntry, preparePlatesForAnalysis } from '../physical-plates';
import { ensurePhysicalModel, ensurePlates } from '../plates-from-shells';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { deserializeProject, serializeProject } from '../file';
import { PRO_EXAMPLES } from '../../data/pro-examples';

beforeAll(async () => { await wasmSolver.initSolver(); });

function fresh() { modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro'; meshBeforeAnalysis.value = true; }
const held = () => new Set([...modelStore.supports.values()].map((s) => s.nodeId));
const baseNodes = (id: number) => [...new Set((plateEntry(id)!.group.members.quads ?? []).flatMap((q) => modelStore.quads.get(q)!.nodes))]
  .filter((n) => Math.abs(modelStore.nodes.get(n)!.z ?? 0) < 1e-9);
const strip = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'edgeSupports').map(([k, x]) => [k, strip(x)]));
  return v;
};

describe('a model that comes in', () => {
  it('the gallery\'s architectural DXF keeps every wall standing on its whole base once meshed', async () => {
    fresh();
    await PRO_EXAMPLES.find((e) => e.id === 'cad-arch-only-dxf')!.load();
    ensurePhysicalModel();
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true });
    expect(modelStore.supports.size).toBe(66);
  }, 600_000);

  it('a project saved before sides were declared keeps its wall held along its base through a new mesh', () => {
    fresh();
    const c = [[0, 0, 0], [4, 0, 0], [4, 0, 3], [0, 0, 3]].map(([x, y, z]) => modelStore.addNode(x!, y!, z!));
    modelStore.addSupport(c[0]!, 'fixed3d'); modelStore.addSupport(c[1]!, 'fixed3d');
    createPlate({ outline: c, materialId: 1, thickness: 0.2 });
    const file = strip(JSON.parse(serializeProject()));
    expect(JSON.stringify(file)).not.toContain('edgeSupports');
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
    ensurePlates();
    const [wall] = physicalPlates();
    expect(wall!.surface.edgeSupports).toEqual([{ from: c[0], to: c[1], type: 'fixed3d' }]);
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true, meshed: 1 });
    const base = baseNodes(wall!.id);
    expect(base.length).toBeGreaterThan(4);
    expect(base.filter((n) => !held().has(n))).toEqual([]);
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
