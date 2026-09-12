/*
 * Clicking a node worked or did not, depending on how the model got there.
 *
 * `InstancedMesh.raycast` tests the mesh's bounding sphere before it tests
 * anything else, and three computes that sphere ONCE — on first use, from
 * whatever instances existed at that moment. Nothing invalidates it when
 * instances are added, moved or resized.
 *
 * So a model built up node by node had its sphere computed while the mesh was
 * empty, and every later click was rejected before a single instance was
 * tested; a model LOADED from a file was fine, because its mesh was populated
 * before anything raycast it. The same gesture worked or did not for reasons
 * entirely invisible to the person making it — and the gesture is the one the
 * whole modelling flow is built on.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NodesInstanced } from '../nodes-instanced';

/** Force three to cache the bounds, the way a first raycast would. */
function cacheBounds(n: NodesInstanced): void {
  n.mesh.computeBoundingSphere();
}

describe('the bounds a node pick is tested against', () => {
  it('are thrown away when a node is added', () => {
    const n = new NodesInstanced();
    n.upsert(1, 0, 0, 0);
    cacheBounds(n);
    expect(n.mesh.boundingSphere).not.toBeNull();

    n.upsert(2, 50, 0, 0);
    expect(n.mesh.boundingSphere,
      'a stale sphere would reject every click near the new node').toBeNull();
  });

  it('are thrown away when a node MOVES', () => {
    const n = new NodesInstanced();
    n.upsert(1, 0, 0, 0);
    cacheBounds(n);
    n.upsert(1, 100, 0, 0);
    expect(n.mesh.boundingSphere).toBeNull();
  });

  it('are thrown away when the markers are resized', () => {
    const n = new NodesInstanced();
    n.upsert(1, 0, 0, 0);
    cacheBounds(n);
    n.setRadius(0.5);
    expect(n.mesh.boundingSphere).toBeNull();
  });

  it('once recomputed, actually contain the nodes', () => {
    const n = new NodesInstanced();
    n.upsert(1, 0, 0, 0);
    n.upsert(2, 10, 0, 0);
    n.mesh.computeBoundingSphere();
    const s = n.mesh.boundingSphere!;
    expect(s.containsPoint(new THREE.Vector3(10, 0, 0)),
      'the far node is inside the sphere a raycast will test').toBe(true);
  });
});
