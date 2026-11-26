import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { placeOverhead } from '../camera';
import { toneBelowPlanCut, PLAN_DEPTH_M } from '../plan-cut';

function overhead(rotationDeg: number) {
  const camera = new THREE.OrthographicCamera();
  const controls = { target: new THREE.Vector3(), update() {} } as unknown as OrbitControls;
  placeOverhead(camera, controls, { x: 4, y: -2, z: 6 }, 50, rotationDeg, 2e-6);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  camera.matrixWorld.extractBasis(right, up, back);
  return { camera, controls, up, back };
}

describe('the plan view camera', () => {
  it('looks straight down on the level, within a microradian', () => {
    const { camera, controls, back } = overhead(0);
    expect(controls.target.toArray()).toEqual([4, -2, 6]);
    expect(camera.position.z - 6).toBeCloseTo(50, 6);
    expect(Math.acos(back.z)).toBeLessThan(1e-5);
  });

  it('turns by quarters: +Y reads up, then −X, then −Y, then +X', () => {
    const ups = [0, 90, 180, 270].map((r) => overhead(r).up.toArray().map((v) => Math.round(v)));
    expect(ups).toEqual([[0, 1, 0], [-1, 0, 0], [0, -1, 0], [1, 0, 0]].map((u) => u.map((v) => v + 0)));
  });
});

describe('what lies under the plan', () => {
  const at = (z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2), new THREE.MeshBasicMaterial());
    m.position.z = z;
    m.updateMatrixWorld();
    return m;
  };

  it('is hidden by default, shown in halftone on request, and back as it was outside the plan', () => {
    const parent = new THREE.Group();
    const lower = at(0), level = at(3), column = at(1.5);
    column.scale.z = 15;
    column.updateMatrixWorld();
    parent.add(lower, level, column);
    const cut = { cutZ: 3.15, below: 'hidden' as const };

    toneBelowPlanCut([parent], cut);
    expect([lower.visible, level.visible, column.visible]).toEqual([false, true, true]);

    toneBelowPlanCut([parent], { ...cut, below: 'ghost' });
    expect(lower.visible).toBe(true);
    expect((lower.material as THREE.Material).transparent).toBe(true);

    toneBelowPlanCut([parent], { ...cut, cutZ: 0.1 + PLAN_DEPTH_M });
    toneBelowPlanCut([parent], null);
    expect([lower.visible, level.visible, column.visible]).toEqual([true, true, true]);
  });
});
