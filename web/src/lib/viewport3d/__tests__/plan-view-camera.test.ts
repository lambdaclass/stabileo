import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { placeOverhead } from '../camera';
import { clearPlanCut, planFloorFor, toneBelowPlanCut, underPlanFloor } from '../plan-cut';
import { ElementsBatched } from '../../three/elements-batched';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';

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

  const pass = (parents: THREE.Object3D[], cut: Parameters<typeof toneBelowPlanCut>[1]) => { clearPlanCut(parents); toneBelowPlanCut(parents, cut); };

  it('is hidden by default, shown in halftone on request, and back as it was outside the plan; the level stays whatever the cut', () => {
    const parent = new THREE.Group();
    const lower = at(0), level = at(3), column = at(1.5);
    column.scale.z = 15;
    column.updateMatrixWorld();
    parent.add(lower, level, column);
    const cut = { floorZ: planFloorFor(3), below: 'hidden' as const };

    pass([parent], cut);
    expect([lower.visible, level.visible, column.visible]).toEqual([false, true, true]);

    pass([parent], { ...cut, below: 'ghost' });
    expect(lower.visible).toBe(true);
    expect((lower.material as THREE.Material).transparent).toBe(true);

    pass([parent], null);
    expect([lower.visible, level.visible, column.visible]).toEqual([true, true, true]);
  });

  it('does not show what something else hid', () => {
    const parent = new THREE.Group();
    const lower = at(0);
    parent.add(lower);
    pass([parent], { floorZ: planFloorFor(3), below: 'hidden' });
    lower.visible = false;
    clearPlanCut([parent]);
    lower.visible = false;
    toneBelowPlanCut([parent], { floorZ: planFloorFor(3), below: 'ghost' });
    expect(lower.visible).toBe(false);
  });

  it('cannot be picked while hidden', () => {
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(0, 0, 3), d = modelStore.addNode(4, 0, 3);
    const low = modelStore.addElement(a, b), high = modelStore.addElement(c, d);
    toneBelowPlanCut([], { floorZ: planFloorFor(3), below: 'hidden' });
    expect([underPlanFloor({ type: 'element', id: low }), underPlanFloor({ type: 'element', id: high }), underPlanFloor({ type: 'node', id: a })]).toEqual([true, false, true]);
    toneBelowPlanCut([], { floorZ: planFloorFor(3), below: 'ghost' });
    expect(underPlanFloor({ type: 'element', id: low })).toBe(false);
    toneBelowPlanCut([], null);
  });

  it('in wireframe, clips the members below or draws them dim', () => {
    const batch = new ElementsBatched();
    batch.upsert(1, 0, 0, 0, 4, 0, 0);
    batch.upsert(2, 0, 0, 3, 4, 0, 3);
    batch.flush();
    const color = (id: number) => { const off = batch.indexOf(id)! * 6; return (batch as unknown as { colors: Float32Array }).colors.slice(off, off + 3); };
    const base = [...color(1)];
    batch.setPlanFloor(planFloorFor(3), 'hidden');
    expect(batch.mesh.material.clippingPlanes?.[0]?.constant).toBeCloseTo(-2.85, 12);
    batch.setPlanFloor(planFloorFor(3), 'ghost');
    expect(batch.mesh.material.clippingPlanes).toBeNull();
    expect(color(1)[0]).toBeCloseTo(base[0]! * 0.35, 2);
    expect([...color(2)]).toEqual(base);
    batch.setPlanFloor(null, 'hidden');
    expect([...color(1)]).toEqual(base);
  });
});
