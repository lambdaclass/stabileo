import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ElementsPicking } from '../elements-picking';

describe('ElementsPicking', () => {
  it('exposes one InstancedMesh tagged with type:elementPick', () => {
    const ep = new ElementsPicking();
    expect(ep.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(ep.mesh.userData.type).toBe('elementPick');
  });

  it('upsert assigns an instance; elementIdAt reflects insertion order', () => {
    const ep = new ElementsPicking();
    ep.upsert(11, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ep.upsert(22, { x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 });
    expect(ep.count).toBe(2);
    expect(ep.elementIdAt(0)).toBe(11);
    expect(ep.elementIdAt(1)).toBe(22);
  });

  it('upsert on existing id updates matrix in place, preserves index', () => {
    const ep = new ElementsPicking();
    ep.upsert(5, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const firstIdx = ep.indexOf(5);
    ep.upsert(5, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 3 });
    expect(ep.count).toBe(1);
    expect(ep.indexOf(5)).toBe(firstIdx);
  });

  it('remove swap-pops', () => {
    const ep = new ElementsPicking();
    ep.upsert(1, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ep.upsert(2, { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
    ep.upsert(3, { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 });
    ep.remove(2);
    expect(ep.count).toBe(2);
    expect(ep.has(2)).toBe(false);
    expect(ep.indexOf(3)).toBe(1);
  });

  it('elementIdAt returns null for out-of-range ids', () => {
    const ep = new ElementsPicking();
    ep.upsert(1, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(ep.elementIdAt(1)).toBeNull();
    expect(ep.elementIdAt(-1)).toBeNull();
  });

  it('auto-grows capacity when exceeded', () => {
    const ep = new ElementsPicking({ initialCapacity: 2 });
    ep.upsert(1, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ep.upsert(2, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ep.upsert(3, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(ep.count).toBe(3);
    expect(ep.elementIdAt(2)).toBe(3);
  });

  it('raycast finds the element whose segment the ray crosses', () => {
    const ep = new ElementsPicking();
    // One element along +X from origin
    ep.upsert(42, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });

    // Ray: from (5, 5, 0) aimed at (5, -5, 0) — shoots straight down at the midpoint
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(5, 5, 0), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(ep.mesh, false);
    expect(hits.length).toBeGreaterThan(0);
    const hit = hits[0];
    expect(hit.instanceId).toBe(0);
    expect(ep.elementIdAt(hit.instanceId!)).toBe(42);
  });

  it('raycast is accelerated (BVH present on geometry)', () => {
    // This is a soft check — three-mesh-bvh installs `boundsTree` as a property
    // on geometries it builds a BVH over. If the class calls computeBoundsTree
    // during construction, this property will exist.
    const ep = new ElementsPicking();
    const geom = ep.mesh.geometry as THREE.BufferGeometry & { boundsTree?: unknown };
    expect(geom.boundsTree).toBeDefined();
  });
});
