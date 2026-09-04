import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NodesInstanced } from '../nodes-instanced';

describe('NodesInstanced', () => {
  it('exposes a single InstancedMesh tagged with type:nodeBatch', () => {
    const ni = new NodesInstanced();
    expect(ni.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(ni.mesh.userData.type).toBe('nodeBatch');
  });

  it('upsert assigns an instance index, setMatrixAt reflects position', () => {
    const ni = new NodesInstanced();
    ni.upsert(7, 1, 2, 3);
    ni.upsert(42, 4, 5, 6);

    expect(ni.count).toBe(2);
    expect(ni.has(7)).toBe(true);
    expect(ni.has(42)).toBe(true);
    expect(ni.nodeIdAt(0)).toBe(7);
    expect(ni.nodeIdAt(1)).toBe(42);

    const m = new THREE.Matrix4();
    ni.mesh.getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(3);
  });

  it('upsert on existing id updates position in place without changing index', () => {
    const ni = new NodesInstanced();
    ni.upsert(7, 1, 2, 3);
    const firstIndex = ni.indexOf(7);
    ni.upsert(7, 9, 9, 9);

    expect(ni.count).toBe(1);
    expect(ni.indexOf(7)).toBe(firstIndex);

    const m = new THREE.Matrix4();
    ni.mesh.getMatrixAt(firstIndex!, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect(p.x).toBeCloseTo(9);
    expect(p.y).toBeCloseTo(9);
    expect(p.z).toBeCloseTo(9);
  });

  it('remove swaps the last instance into the removed slot (swap-pop)', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 0, 0, 0);
    ni.upsert(2, 2, 2, 2);
    ni.upsert(3, 3, 3, 3);
    expect(ni.count).toBe(3);

    ni.remove(2);

    expect(ni.count).toBe(2);
    expect(ni.has(2)).toBe(false);
    expect(ni.has(1)).toBe(true);
    expect(ni.has(3)).toBe(true);
    // id 3 should have moved into id 2's old slot
    const m = new THREE.Matrix4();
    ni.mesh.getMatrixAt(ni.indexOf(3)!, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect(p.x).toBeCloseTo(3);
  });

  it('setColor sets per-instance color; getBaseColor returns last non-hover base', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 0, 0, 0);
    ni.setBaseColor(1, 0xdddddd);
    expect(ni.getBaseColor(1)).toBe(0xdddddd);

    // Hover should not change base color
    ni.setColor(1, 0xffff44);
    expect(ni.getBaseColor(1)).toBe(0xdddddd);

    // New base
    ni.setBaseColor(1, 0x00ffff);
    expect(ni.getBaseColor(1)).toBe(0x00ffff);
  });

  it('auto-grows capacity when upserts exceed initial capacity', () => {
    const ni = new NodesInstanced({ initialCapacity: 2 });
    ni.upsert(1, 0, 0, 0);
    ni.upsert(2, 0, 0, 0);
    ni.upsert(3, 0, 0, 0); // triggers growth
    expect(ni.count).toBe(3);
    expect(ni.has(3)).toBe(true);
    expect(ni.nodeIdAt(2)).toBe(3);
  });

  it('nodeIdAt returns null for out-of-range instance ids', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 0, 0, 0);
    expect(ni.nodeIdAt(0)).toBe(1);
    expect(ni.nodeIdAt(1)).toBeNull();
    expect(ni.nodeIdAt(99)).toBeNull();
  });

  it('clear resets all state', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 0, 0, 0);
    ni.upsert(2, 0, 0, 0);
    ni.clear();
    expect(ni.count).toBe(0);
    expect(ni.has(1)).toBe(false);
    expect(ni.nodeIdAt(0)).toBeNull();
  });
});

/**
 * Node markers in «Modelo con secciones», and the joint's own marker.
 *
 * Two separate rules, and the tests keep them separate because they answer different questions:
 * `setDrawn` is about a MODE (sections draws no markers), `suppress` is about the ONE node whose
 * joint geometry is on screen.
 *
 * Both replace the old answer, which was to halve the radius — and the reason halving stopped
 * short is the property asserted hardest here: hiding must not cost picking.
 */
describe('markers can be hidden without becoming unpickable', () => {
  it('drawn by default, and setDrawn(false) takes them out of the render list only', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 0, 0, 0);
    expect(ni.drawn).toBe(true);

    ni.setDrawn(false);
    expect(ni.drawn).toBe(false);
    // The material stops rendering; the OBJECT stays visible and in the scene graph, which is
    // what `InstancedMesh.raycast` walks. A `mesh.visible = false` here would have hidden it
    // from the raycaster too, and that is the bug this API exists to avoid.
    expect((ni.mesh.material as THREE.Material).visible).toBe(false);
    expect(ni.mesh.visible).toBe(true);
    expect(ni.mesh.count).toBe(1);
  });

  it('restores on setDrawn(true)', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 0, 0, 0);
    ni.setDrawn(false);
    ni.setDrawn(true);
    expect(ni.drawn).toBe(true);
    expect((ni.mesh.material as THREE.Material).visible).toBe(true);
  });

  it('keeps the instance count, so hiding is not removing', () => {
    const ni = new NodesInstanced();
    for (let i = 1; i <= 5; i++) ni.upsert(i, i, 0, 0);
    ni.setDrawn(false);
    expect(ni.mesh.count).toBe(5);
    for (let i = 1; i <= 5; i++) expect(ni.has(i)).toBe(true);
  });
});

describe('one node can be collapsed while its joint is drawn', () => {
  const scaleOf = (ni: NodesInstanced, id: number) => {
    const idx = [...Array(ni.mesh.count).keys()].find((i) => ni.nodeIdAt(i) === id)!;
    const m = new THREE.Matrix4();
    ni.mesh.getMatrixAt(idx, m);
    return new THREE.Vector3().setFromMatrixScale(m).length();
  };
  const positionOf = (ni: NodesInstanced, id: number) => {
    const idx = [...Array(ni.mesh.count).keys()].find((i) => ni.nodeIdAt(i) === id)!;
    const m = new THREE.Matrix4();
    ni.mesh.getMatrixAt(idx, m);
    return new THREE.Vector3().setFromMatrixPosition(m);
  };

  it('collapses only the named node', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 1, 0, 0);
    ni.upsert(2, 2, 0, 0);
    ni.suppress(1);
    expect(ni.suppressed).toBe(1);
    expect(scaleOf(ni, 1)).toBeCloseTo(0, 9);
    expect(scaleOf(ni, 2)).toBeGreaterThan(0);
  });

  it('keeps the collapsed node at its own position, so it is not moved to the origin', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 3, 4, 5);
    ni.suppress(1);
    const p = positionOf(ni, 1);
    expect(p.x).toBeCloseTo(3, 9);
    expect(p.y).toBeCloseTo(4, 9);
    expect(p.z).toBeCloseTo(5, 9);
  });

  it('restores the previous node when the suppression moves', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 1, 0, 0);
    ni.upsert(2, 2, 0, 0);
    ni.suppress(1);
    ni.suppress(2);
    expect(scaleOf(ni, 1)).toBeGreaterThan(0);
    expect(scaleOf(ni, 2)).toBeCloseTo(0, 9);
  });

  it('restores everything on suppress(null)', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 1, 0, 0);
    ni.suppress(1);
    ni.suppress(null);
    expect(ni.suppressed).toBeNull();
    expect(scaleOf(ni, 1)).toBeGreaterThan(0);
  });

  it('survives a later upsert of the same node — a model change must not un-hide it', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 1, 0, 0);
    ni.suppress(1);
    ni.upsert(1, 9, 9, 9);
    expect(scaleOf(ni, 1)).toBeCloseTo(0, 9);
    expect(positionOf(ni, 1).x).toBeCloseTo(9, 9);
  });

  it('is a no-op when the node is not present, and does not throw', () => {
    const ni = new NodesInstanced();
    ni.upsert(1, 0, 0, 0);
    expect(() => ni.suppress(999)).not.toThrow();
    expect(ni.suppressed).toBe(999);
    expect(scaleOf(ni, 1)).toBeGreaterThan(0);
  });
});
