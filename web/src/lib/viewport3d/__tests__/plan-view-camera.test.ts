import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { placeOverhead } from '../camera';
import { clearPlanCut, planCutCensus, planCutFor, toneBelowPlanCut, underPlanFloor } from '../plan-cut';
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

  const pass = (parents: THREE.Object3D[], cut: Parameters<typeof toneBelowPlanCut>[1], slabs: THREE.Object3D[] = []) => { clearPlanCut(parents); toneBelowPlanCut(parents, cut, slabs); };
  const storey3 = (below: 'hidden' | 'ghost' = 'hidden') => planCutFor(3, { lowest: false, ceiling: true, below });
  const member = (zi: number, zj: number) => {
    const a = modelStore.addNode(0, 0, zi), b = modelStore.addNode(zi === zj ? 4 : 0, 0, zj);
    const g = new THREE.Group();
    g.userData = { type: 'element', id: modelStore.addElement(a, b) };
    g.add(at((zi + zj) / 2));
    return g;
  };

  it('on a storey, hides what is under it and what sits on its floor; its columns and its ceiling stay', () => {
    modelStore.clear();
    const parent = new THREE.Group();
    const below = member(0, 0), columnBelow = member(0, 3), floorBeam = member(3, 3), column = member(3, 6), ceilingBeam = member(6, 6);
    parent.add(below, columnBelow, floorBeam, column, ceilingBeam);

    pass([parent], storey3());
    expect([below, columnBelow, floorBeam, column, ceilingBeam].map((o) => o.visible)).toEqual([false, false, false, true, true]);

    pass([parent], storey3('ghost'));
    expect(floorBeam.visible).toBe(true);
    expect((floorBeam.children[0] as THREE.Mesh).material).toHaveProperty('transparent', true);

    pass([parent], null);
    expect([below, columnBelow, floorBeam, column, ceilingBeam].every((o) => o.visible)).toBe(true);
  });

  it('a section deep under its level does not bring a floor beam into the storey', () => {
    modelStore.clear();
    const parent = new THREE.Group();
    const beam = member(3, 3);
    beam.children[0]!.scale.z = 5;
    beam.updateMatrixWorld(true);
    parent.add(beam);
    pass([parent], storey3());
    expect(beam.visible).toBe(false);
  });

  it('draws the slab of its ceiling in halftone, so the storey shows through it', () => {
    const slabs = new THREE.Group();
    const ceiling = at(6), floor = at(3);
    slabs.add(ceiling, floor);
    pass([slabs], storey3(), [slabs]);
    expect((ceiling.material as THREE.Material).transparent).toBe(true);
    expect((floor.material as THREE.Material).transparent).toBe(false);
    expect(planCutCensus().overhead).toBe(1);
  });

  it('reads a drawn slab by its outline, not its thickness: the one on the floor goes with the storey below', () => {
    modelStore.clear();
    const slab = (z: number) => {
      const ids = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, z));
      const id = modelStore.addGroup(`L${z}`, 'physicalMember', { nodes: ids }, { data: { kind: 'slab', provenance: 'declared' } });
      const g = new THREE.Group();
      g.userData = { type: 'physicalPlate', id };
      const m = at(z);
      m.scale.z = 1.5;
      g.add(m);
      return g;
    };
    const floor = slab(3), ceiling = slab(6);
    const parent = new THREE.Group();
    parent.add(floor, ceiling);
    pass([parent], storey3(), [parent]);
    expect([floor.visible, ceiling.visible]).toEqual([false, true]);
    expect(planCutCensus().overhead).toBe(1);
  });

  it('on the lowest level, keeps what sits on it: the foundation beams', () => {
    modelStore.clear();
    const parent = new THREE.Group();
    const foundation = member(0, 0), deep = member(-1, -1);
    parent.add(foundation, deep);
    pass([parent], planCutFor(0, { lowest: true, ceiling: true, below: 'hidden' }));
    expect([foundation.visible, deep.visible]).toEqual([true, false]);
  });

  it('does not show what something else hid', () => {
    const parent = new THREE.Group();
    const lower = at(0);
    parent.add(lower);
    pass([parent], storey3());
    lower.visible = false;
    clearPlanCut([parent]);
    lower.visible = false;
    toneBelowPlanCut([parent], storey3('ghost'));
    expect(lower.visible).toBe(false);
  });

  it('cannot be picked while hidden, but the nodes on its floor can', () => {
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(0, 0, 3), d = modelStore.addNode(4, 0, 3), e = modelStore.addNode(0, 0, 6);
    const low = modelStore.addElement(a, b), onFloor = modelStore.addElement(c, d), column = modelStore.addElement(c, e);
    toneBelowPlanCut([], storey3());
    expect([low, onFloor, column].map((id) => underPlanFloor({ type: 'element', id }))).toEqual([true, true, false]);
    expect([underPlanFloor({ type: 'node', id: a }), underPlanFloor({ type: 'node', id: c })]).toEqual([true, false]);
    const base = modelStore.addSupport(a, 'fixed3d'), upper = modelStore.addSupport(c, 'fixed3d');
    expect([underPlanFloor({ type: 'support', id: base }), underPlanFloor({ type: 'support', id: upper })], 'a support goes with its node').toEqual([true, false]);
    toneBelowPlanCut([], storey3('ghost'));
    expect(underPlanFloor({ type: 'element', id: low })).toBe(false);
    toneBelowPlanCut([], null);
  });

  it('in wireframe, clips the members below or draws them dim', () => {
    const batch = new ElementsBatched();
    batch.upsert(1, 0, 0, 0, 4, 0, 0);
    batch.upsert(2, 0, 0, 3, 0, 0, 6);
    batch.flush();
    const color = (id: number) => { const off = batch.indexOf(id)! * 6; return (batch as unknown as { colors: Float32Array }).colors.slice(off, off + 3); };
    const base = [...color(1)];
    batch.setPlanFloor(storey3().floorZ, 'hidden');
    expect(batch.mesh.material.clippingPlanes?.[0]?.constant).toBeCloseTo(-3.001, 12);
    batch.setPlanFloor(storey3().floorZ, 'ghost');
    expect(batch.mesh.material.clippingPlanes).toBeNull();
    expect(color(1)[0]).toBeCloseTo(base[0]! * 0.35, 2);
    expect([...color(2)]).toEqual(base);
    batch.setPlanFloor(null, 'hidden');
    expect([...color(1)]).toEqual(base);
  });
});
