/** An imported wall whose feet the import fixes stands on its whole base once meshed, not on its two corners. */
import { describe, it, expect } from 'vitest';
import { parseIfc } from '../ifc-parser';
import { replaceWithIfcBuilding, IFC_IMPORT_DEFAULTS } from '../ifc-import';
import { modelStore, historyStore, uiStore } from '../../store';
import { physicalPlates, preparePlatesForAnalysis, preparePlatesForAnalysisAsync } from '../../store/physical-plates';
import { meshBeforeAnalysis } from '../../store/mesh-policy.svelte';
import { BUILDING_IFC } from './building-ifc';

describe('a wall brought in from a building file', () => {
  it.skip.each([
    ['synchronous', preparePlatesForAnalysis],
    ['asynchronous', preparePlatesForAnalysisAsync],
  ] as const)('keeps its base held along its whole length after the analysis meshes it (%s) [known wrong result: #2365]', async (_mode, prepare) => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; meshBeforeAnalysis.value = true;
    const read = await parseIfc(new TextEncoder().encode(BUILDING_IFC).buffer as ArrayBuffer, { wasmPath: './' });
    expect(replaceWithIfcBuilding(read, IFC_IMPORT_DEFAULTS, 'Edificio')).not.toBeNull();
    const walls = physicalPlates().filter((p) => p.physical.kind === 'wall');
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) expect(w.surface.edgeSupports?.length, w.name).toBeGreaterThan(0);
    expect(await prepare()).toMatchObject({ ok: true });
    const zOf = (n: number) => modelStore.nodes.get(n)!.z ?? 0;
    const shells = walls.flatMap((w) => (physicalPlates().find((p) => p.id === w.id)!.group.members.quads ?? []).map((q) => modelStore.quads.get(q)!.nodes));
    const zMin = Math.min(...shells.flat().map(zOf));
    const base = [...new Set(shells.flat())].filter((n) => Math.abs(zOf(n) - zMin) < 1e-6);
    expect(base.length).toBeGreaterThan(2);
    const held = new Set([...modelStore.supports.values()].map((s) => s.nodeId));
    expect(base.filter((n) => !held.has(n))).toEqual([]);
  }, 300_000);
});
