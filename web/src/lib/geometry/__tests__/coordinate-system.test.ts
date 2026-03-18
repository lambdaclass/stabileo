import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  TWO_D_DISPLACEMENT_LABELS,
  TWO_D_REACTION_LABELS,
  TWO_D_VERTICAL_AXIS_LABEL,
  get2DDisplayDisplacementVertical,
  get2DDisplayMoment,
  get2DDisplayReactionVertical,
  get2DDisplayedVertical,
  getElevation,
  isHorizontalPlane,
  planeLevelAxis,
  planeNormal,
  projectNodeToScene,
  setElevation,
  setPlaneOffset,
  shouldProjectModelToXZ,
} from '../coordinate-system';

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

  it('treats 2D presentation as the XZ plane', () => {
    expect(TWO_D_VERTICAL_AXIS_LABEL).toBe('Z');
    expect(TWO_D_DISPLACEMENT_LABELS.vertical).toBe('uz');
    expect(TWO_D_REACTION_LABELS.vertical).toBe('Rz');
    expect(get2DDisplayedVertical({ y: 6 })).toBe(6);
    expect(get2DDisplayDisplacementVertical({ uy: -0.02 })).toBe(-0.02);
    expect(get2DDisplayReactionVertical({ ry: 12 })).toBe(12);
    expect(get2DDisplayMoment({ mz: 7 })).toBe(7);
  });

  it('projects flat 2D models upright onto XZ in the 3D scene', () => {
    expect(shouldProjectModelToXZ({
      nodes: [{ x: 0, y: 0 }, { x: 5, y: 3 }],
      supports: [{ type: 'pinned' }],
      loads: [{ type: 'nodal' }],
      plateCount: 0,
      quadCount: 0,
    })).toBe(true);

    expect(projectNodeToScene({ x: 5, y: 3 }, true)).toEqual({ x: 5, y: 0, z: 3 });
    expect(shouldProjectModelToXZ({
      nodes: [{ x: 0, y: 0, z: 2 }],
      supports: [{ type: 'fixed3d' }],
      loads: [],
      plateCount: 0,
      quadCount: 0,
    })).toBe(false);
  });
});
