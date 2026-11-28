/**
 * The import as one call: the small building read from its file replaces the open model with its
 * levels, its elements and its feet fixed, the same the dialog brings in.
 */
import { describe, it, expect } from 'vitest';
import { parseIfc } from '../ifc-parser';
import { replaceWithIfcBuilding, IFC_IMPORT_DEFAULTS } from '../ifc-import';
import { modelStore, historyStore } from '../../store';
import { BUILDING_IFC } from './building-ifc';

describe('a building file brought in by one call', () => {
  it('replaces the model with its levels, elements and fixed feet', async () => {
    modelStore.clear(); historyStore.clear();
    modelStore.addNode(100, 100, 0);
    const read = await parseIfc(new TextEncoder().encode(BUILDING_IFC).buffer as ArrayBuffer, { wasmPath: './' });
    const b = replaceWithIfcBuilding(read, IFC_IMPORT_DEFAULTS, 'Edificio');
    expect(b).not.toBeNull();
    expect(modelStore.model.name).toBe('Edificio');
    expect(modelStore.grid?.levels.map((l) => l.name)).toEqual(read.storeys.map((s) => s.name));
    expect(modelStore.elements.size).toBeGreaterThan(0);
    expect([...modelStore.nodes.values()].some((n) => n.x === 100 && n.y === 100)).toBe(false);
    expect([...modelStore.supports.values()].some((s) => s.type === 'fixed3d')).toBe(true);
  });
});

it('known wrong result: #1928 the released IFC feet command assigns point supports on an existing wall', async () => {
  const { createPlate, plateEntry, planPlateMesh, applyPlateMeshes } = await import('../../store/physical-plates');
  const { fixBases } = await import('../ifc-physical');
  modelStore.clear();
  historyStore.clear();
  const corners = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, z]) => modelStore.addNode(x!, 0, z!));
  const made = createPlate({ outline: corners, materialId: 1, thickness: 0.2 });
  if (!('id' in made)) throw new Error(JSON.stringify(made));
  const plan = planPlateMesh(made.id);
  expect(plan).not.toBeNull();
  expect(applyPlateMeshes([plan!])).toMatchObject({ plates: 1 });
  modelStore.addSupport(corners[0]!, 'pinned3d');
  const base = new Set([...modelStore.nodes.values()].filter(n => (n.z ?? 0) === 0).map(n => n.id));
  expect(fixBases()).toBe(base.size - 1);
  const held = new Map([...modelStore.supports.values()].map(s => [s.nodeId, s.type]));
  expect(new Set(held.keys())).toEqual(base);
  expect(held.get(corners[0]!)).toBe('pinned3d');
  expect(plateEntry(made.id)!.surface).not.toHaveProperty('edgeSupports');
  expect(fixBases()).toBe(0);
});
