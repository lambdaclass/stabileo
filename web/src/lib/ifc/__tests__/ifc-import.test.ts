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
