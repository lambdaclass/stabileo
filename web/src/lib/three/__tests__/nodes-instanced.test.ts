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
