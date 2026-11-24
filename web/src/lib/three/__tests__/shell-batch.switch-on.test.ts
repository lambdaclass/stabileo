/**
 * The shells drawn in a few draw calls: their faces and edges copied into one mesh and one set of
 * lines a look, the shells themselves kept for picking but not rendered; a colour change rewrites
 * colours only, a shell hidden or moved rebuilds, and switched off each draws on its own again.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createQuadMesh, paintShell } from '../create-shell-mesh';
import { ShellBatch } from '../shell-batch';

const quad = (x: number, id: number) => createQuadMesh({ x, y: 0, z: 0 }, { x: x + 1, y: 0, z: 0 }, { x: x + 1, y: 1, z: 0 }, { x, y: 1, z: 0 }, id, { renderMode: 'solid', thickness: 0.2 });
const rendered = (parent: THREE.Object3D) => { const out: THREE.Object3D[] = []; parent.traverseVisible((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && m.visible) out.push(o); }); return out; };

describe('the shells drawn in batches', () => {
  it('draw a thousand shells in two draw calls and keep each for picking', () => {
    const parent = new THREE.Group();
    for (let i = 0; i < 1000; i++) parent.add(quad(i, i));
    expect(rendered(parent)).toHaveLength(2000);
    const batch = new ShellBatch(parent);
    batch.sync();
    expect(rendered(parent)).toHaveLength(2);
    expect(batch.sources).toBe(2000);
    const hits = new THREE.Raycaster(new THREE.Vector3(500.5, 0.5, 5), new THREE.Vector3(0, 0, -1)).intersectObjects(parent.children, true);
    expect(hits[0]!.object.parent!.userData).toMatchObject({ type: 'quad', id: 500 });
  });

  it('rewrites only the colours of a shell painted, and rebuilds for one hidden', () => {
    const parent = new THREE.Group();
    const shells = [quad(0, 1), quad(1, 2)];
    parent.add(...shells);
    const batch = new ShellBatch(parent);
    batch.sync();
    const [faces] = batch.batches().filter((b) => b instanceof THREE.Mesh);
    const geo = faces!.geometry;
    paintShell(shells[1]!, 0xff0000, 0xff0000);
    batch.sync();
    expect(faces!.geometry).toBe(geo);
    const col = geo.getAttribute('color');
    expect([col.getX(col.count - 1), col.getY(col.count - 1)]).toEqual([1, 0]);
    shells[1]!.visible = false;
    batch.sync();
    expect(batch.sources).toBe(2);
    expect(batch.batches().find((b) => b instanceof THREE.Mesh)!.geometry.getAttribute('position').count).toBe(geo.getAttribute('position').count / 2);
  });

  it('switched off, draws each shell on its own again', () => {
    const parent = new THREE.Group();
    parent.add(quad(0, 1));
    const batch = new ShellBatch(parent);
    batch.sync();
    batch.sync(true);
    expect(rendered(parent)).toHaveLength(2);
    expect(batch.batches()).toEqual([]);
  });
});
