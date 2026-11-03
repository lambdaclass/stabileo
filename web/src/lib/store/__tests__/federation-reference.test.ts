import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../index';
import { federation, linkIfc, referenceAvailable, relinkReference, removeLink } from '../federation.svelte';
import { forgetLinkedGeometryCache, linkedGeometry } from '../linked-geometry';
import { BUILDING_IFC } from '../../ifc/__tests__/building-ifc';

const W = { wasmPath: './' };
const file = () => new TextEncoder().encode(BUILDING_IFC).buffer as ArrayBuffer;

describe('a linked IFC as a 3D reference', () => {
  beforeEach(() => { modelStore.clear(); forgetLinkedGeometryCache(); });

  it('keeps the shape in this browser by the file hash, and the counts in the project', async () => {
    const l = await linkIfc(file(), { name: 'Arq', discipline: 'architecture', fileName: 'a.ifc', version: '1' }, W);
    expect(l.reference!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(l.reference!.counts.drawn).toBe(3);
    expect(federation().links[0]!.reference).toEqual(l.reference);
    forgetLinkedGeometryCache();
    const g = await linkedGeometry(l.reference!.hash);
    expect(g!.meshes.length).toBe(3);
    expect(await referenceAvailable(l)).toBe(true);
  });

  it('takes the same file again when the shape is missing, and refuses another one', async () => {
    const l = await linkIfc(file(), { name: 'Arq', discipline: 'architecture', fileName: 'a.ifc', version: '1' }, W);
    expect(await relinkReference(l.id, file(), W)).toBe('ok');
    const other = new TextEncoder().encode(BUILDING_IFC.replace("'C1'", "'C2'")).buffer as ArrayBuffer;
    expect(await relinkReference(l.id, other, W)).toBe('otherFile');
  });

  it('keeps the shape when a link is removed: another project or an undo may still use the file', async () => {
    const l = await linkIfc(file(), { name: 'Arq', discipline: 'architecture', fileName: 'a.ifc', version: '1' }, W);
    removeLink(l.id);
    await new Promise((r) => setTimeout(r, 20));
    forgetLinkedGeometryCache();
    expect((await linkedGeometry(l.reference!.hash))!.meshes.length).toBe(3);
    modelStore.clear();
    const again = await linkIfc(file(), { name: 'Arq', discipline: 'architecture', fileName: 'a.ifc', version: '1' }, W);
    expect(again.reference!.hash).toBe(l.reference!.hash);
    expect(await referenceAvailable(again)).toBe(true);
  });
});
