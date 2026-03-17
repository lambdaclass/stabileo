import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getElevation, isHorizontalPlane, planeLevelAxis, planeNormal, setElevation, setPlaneOffset } from '../coordinate-system';

describe('coordinate-system contract', () => {
  it('uses z as elevation for 3D nodes', () => {
    const node = { x: 1, y: 2, z: 3 };
    expect(getElevation(node)).toBe(3);
    expect(setElevation(node, 7).z).toBe(7);
  });

  it('treats XY as the horizontal plane', () => {
    expect(isHorizontalPlane('XY')).toBe(true);
    expect(isHorizontalPlane('XZ')).toBe(false);
    expect(planeLevelAxis('XY')).toBe('z');
    expect(planeLevelAxis('XZ')).toBe('y');
    expect(planeLevelAxis('YZ')).toBe('x');
  });

  it('uses z-up plane normals and offsets', () => {
    expect(planeNormal('XY').toArray()).toEqual([0, 0, 1]);
    expect(planeNormal('XZ').toArray()).toEqual([0, 1, 0]);
    expect(planeNormal('YZ').toArray()).toEqual([1, 0, 0]);

    const obj = new THREE.Object3D();
    setPlaneOffset(obj, 'XY', 4);
    expect(obj.position.z).toBe(4);
    expect(obj.rotation.x).toBeCloseTo(Math.PI / 2);
  });
});
