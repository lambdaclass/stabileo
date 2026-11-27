import * as THREE from 'three';
import { expect, it } from 'vitest';
import { ExplicitShellBatches } from '../explicit-shell-batches';

it('matches a fresh batch after moving shared nodes, reversing winding and changing connectivity', () => {
  const nodes = [
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 1, z: 0 },
  ];
  const cells = [
    { key: 'q1', nodes: [0, 1, 2, 3] },
    { key: 'p1', nodes: [1, 4, 2] },
    { key: 'p2', nodes: [2, 4, 5] },
  ];
  const sync = (batch: ExplicitShellBatches, parent: THREE.Group) => {
    const display = cells.map(cell => ({ ...cell, materialId: 1, points: cell.nodes.map(id => nodes[id]!) }));
    batch.sync(parent, new Map([['floor', display]]), 'wireframe');
  };
  const parent = new THREE.Group();
  const batch = new ExplicitShellBatches();
  sync(batch, parent);
  batch.selection(new Set(['q1']));
  batch.hover('p1');
  const original = parent.children[0]!;
  function expectFreshGeometry() {
    const other = new THREE.Group();
    const fresh = new ExplicitShellBatches();
    sync(fresh, other);
    fresh.selection(new Set(['q1']));
    fresh.hover('p1');
    for (const [i, child] of parent.children[0]!.children.entries()) {
      const actual = (child as THREE.Mesh).geometry;
      const expected = (other.children[0]!.children[i] as THREE.Mesh).geometry;
      for (const name of Object.keys(expected.attributes)) {
        expect(actual.getAttribute(name).array).toEqual(expected.getAttribute(name).array);
      }
      expect(child.userData.faceKeys).toEqual(other.children[0]!.children[i]!.userData.faceKeys);
      // Populate the cached bounds before the next edit, as rendering and picking would.
      actual.computeBoundingBox();
      actual.computeBoundingSphere();
    }
  }
  expectFreshGeometry();
  nodes[1]!.x += 0.2;
  nodes[2]!.y += 0.3;
  sync(batch, parent);
  expect(parent.children[0]).toBe(original);
  expectFreshGeometry();

  // Picking must use the new bounds even before another draw. Flipping a floor reverses its normals.
  for (const p of nodes) p.x = 10 - p.x;
  sync(batch, parent);
  const ray = new THREE.Raycaster(new THREE.Vector3(9.6, 0.2, 2), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(parent)[0]!;
  expect(hit.object.userData.faceKeys[hit.faceIndex!]).toBe('q1');
  expect(parent.children[0]).toBe(original);
  expectFreshGeometry();

  // Coincident coordinates with distinct IDs no longer share the same mesh edge.
  nodes.push({ ...nodes[2]! });
  cells[2]!.nodes[0] = nodes.length - 1;
  sync(batch, parent);
  expect(parent.children[0]).not.toBe(original);
  expectFreshGeometry();
});
