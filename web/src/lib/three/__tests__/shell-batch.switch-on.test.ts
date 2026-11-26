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

describe('the batch against what changes its sources', () => {
  it('takes a second contour, set as a new colour attribute at version 0 as the first was', () => {
    const parent = new THREE.Group();
    const shell = quad(0, 1);
    parent.add(shell);
    const face = shell.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    const paint = (r: number) => { const n = face.geometry.getAttribute('position').count; face.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Array.from({ length: n }, () => [r, 0, 1 - r]).flat()), 3)); (face.material as THREE.MeshStandardMaterial).vertexColors = true; (face.material as THREE.MeshStandardMaterial).color.set(0xffffff); };
    const batch = new ShellBatch(parent);
    paint(1);
    batch.sync();
    paint(0);
    batch.sync();
    const col = batch.batches().find((b) => b instanceof THREE.Mesh)!.geometry.getAttribute('color');
    expect([col.getX(0), col.getZ(0)]).toEqual([0, 1]);
  });

  it('keeps apart sources that render differently, steel beside concrete', () => {
    const parent = new THREE.Group();
    const steel = quad(0, 1), concrete = quad(1, 2);
    ((steel.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh).material as THREE.MeshStandardMaterial).metalness = 0.4;
    parent.add(steel, concrete);
    const batch = new ShellBatch(parent);
    batch.sync();
    expect(batch.batches().filter((b) => b instanceof THREE.Mesh)).toHaveLength(2);
  });

  it('is left alone by the category tones, which tone its sources, so a halftone is taken once', async () => {
    const { toneObject } = await import('../../viewport3d/category-tone');
    const parent = new THREE.Group();
    parent.add(quad(0, 1));
    const batch = new ShellBatch(parent);
    toneObject(parent, 'halftone');
    batch.sync();
    const op = () => (batch.batches().find((b) => b instanceof THREE.Mesh)!.material as THREE.Material).opacity;
    const once = op();
    toneObject(parent, 'halftone');
    batch.sync();
    expect(op()).toBeCloseTo(once, 12);
  });
});
