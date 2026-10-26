/**
 * Coordination through the store, with an IFC already read (the parser runs in the browser):
 * a structural file linked and drawn per storey, hidden and shown; its next version compared,
 * applied by rules and its new column brought into the model in one undo step; then a version
 * published as a package and compared with the model after an edit.
 */
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { applyPendingUpdate, compareWithVersion, contributeAdded, federation, federationState, linkParsed, prepareUpdateParsed, publishVersion, setLinkVisible } from '../federation.svelte';
import type { IfcMember } from '../../ifc/ifc-mapper';

const col = (g: string, x: number, h = 3): IfcMember => ({ id: 1, type: 'column', name: `C-${g}`, start: { x, y: 0, z: 0 }, end: { x, y: 0, z: h }, ifcClass: 'IfcColumn', storey: 'PB', globalId: g, profileName: '30×30', profileDims: { shape: 'rect', b: 0.3, h: 0.3 }, materialName: 'H-30' });
const tr = (k: string) => k;

describe('coordination and versions', () => {
  it('links, updates by rules, brings in the new, publishes and compares', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    modelStore.setUnderlays([{ id: 'own', name: 'Planta', z: 0, segments: [0, 0, 1, 0], dx: 0, dy: 0, rotationDeg: 0, visible: true }]);
    const link = linkParsed({ members: [col('A', 0), col('B', 4)], surfaces: [], storeys: [{ name: 'PB', elevation: 0 }] }, { name: 'Estructura', discipline: 'structure', fileName: 'e.ifc', version: '1' });
    expect(link.entities).toHaveLength(2);
    expect(modelStore.underlays.map((u) => u.id)).toEqual(['own', expect.stringMatching(/^link-/)]);
    setLinkVisible(link.id, false);
    expect(modelStore.underlays.map((u) => u.id)).toEqual(['own']);
    setLinkVisible(link.id, true);

    const d = prepareUpdateParsed(link.id, { members: [col('A', 0), col('B', 4, 3.5), col('C', 8)], surfaces: [], storeys: [{ name: 'PB', elevation: 0 }] }, 'e2.ifc', '2')!;
    expect([d.added.length, d.modified.length, d.removed.length, d.unchanged]).toEqual([1, 1, 0, 1]);
    applyPendingUpdate({ added: 'take', modified: 'skip', removed: 'remove' });
    const held = federation().links[0]!;
    expect(held.version).toBe('2');
    expect(held.entities.map((e) => e.guid)).toEqual(['A', 'B', 'C']);
    expect(held.entities.find((e) => e.guid === 'B')!.pts[5]).toBe(3);

    const before = modelStore.elements.size;
    const r = contributeAdded();
    expect(r.bars).toBe(1);
    expect(modelStore.elements.size).toBe(before + 1);
    historyStore.undo();
    expect(modelStore.elements.size).toBe(before);
    historyStore.redo();
    expect(federationState.pending).not.toBeNull();

    const { version, zip } = publishVersion('B. C.', 'Para coordinación', tr, 'es');
    expect(version.number).toBe(1);
    expect(version.counts.elements).toBe(1);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(expect.arrayContaining([expect.stringMatching(/-v1\.ded$/), expect.stringMatching(/-v1\.ifc$/), 'version-1.json']));
    expect(JSON.parse(strFromU8(files['version-1.json']!)).note).toBe('Para coordinación');

    const n = [...modelStore.nodes.values()][0]!;
    modelStore.updateNode(n.id, n.x + 0.1, n.y, n.z);
    const cmp = compareWithVersion(1)!;
    expect(cmp.nodes.modified).toEqual([String(n.id)]);
    expect(cmp.elements.modified).toEqual([]);
  });
});
