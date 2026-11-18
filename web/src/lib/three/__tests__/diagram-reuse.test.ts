import { expect, it, vi } from 'vitest';
import * as diagrams from '../../engine/diagrams-3d';
import type { ElementForces3D } from '../../engine/types-3d';
import { modelStore } from '../../store/model.svelte';
import { createDiagramGroup3D } from '../diagram-render-3d';
import { disposeObject } from '../selection-helpers';
import type { Mesh } from 'three';

function force(): ElementForces3D {
  return {
    elementId: 1, length: 5, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0,
    vzStart: 0, vzEnd: 0, myStart: 10, myEnd: 10, mzStart: 0, mzEnd: 0, mxStart: 0, mxEnd: 0,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
    releaseTStart: false, releaseTEnd: false,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
  };
}

it('samples once per member while retaining the diagram scale and geometry', () => {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0);
  const id = modelStore.addElement(a, b);
  const ef = { ...force(), elementId: id };
  const spy = vi.spyOn(diagrams, 'computeDiagram3D');
  const group = createDiagramGroup3D(modelStore.elements, modelStore.nodes, [ef], 'momentY', 1, false);
  try {
    expect(spy).toHaveBeenCalledTimes(1);
    const mesh = group.children.find(c => c.userData.type === 'diagram3dMesh') as Mesh;
    const positions = mesh.geometry.getAttribute('position');
    expect(positions.count).toBe(42);
    expect(positions.getZ(0)).toBe(0);
    expect(positions.getZ(1)).toBeCloseTo(-0.4, 6);
    expect(positions.getX(40)).toBe(5);
    expect(positions.getZ(41)).toBeCloseTo(-0.4, 6);
  } finally { spy.mockRestore(); disposeObject(group); modelStore.clear(); }
});

it('does not share mutable diagram points between calls', () => {
  const first = diagrams.computeDiagram3D(force(), 'momentY');
  first.points[0].t = 99;
  first.points[0].value = 99;
  const next = diagrams.computeDiagram3D(force(), 'momentY');
  expect(next.points.map(p => p.t)).toEqual(Array.from({ length: 21 }, (_, i) => i / 20));
  expect(next.points.every(p => p.value === 10)).toBe(true);
});

it('retains off-grid point-load jumps and variable-member boundaries', () => {
  const ef = force();
  ef.pointLoadsZ = [{ a: 1.63, p: 7 }];
  const diagram = diagrams.computeDiagram3D(ef, 'shearZ');
  const t = 1.63 / 5;
  expect(diagram.points.find(p => p.t === t - 1e-6)?.value).toBe(0);
  expect(diagram.points.find(p => p.t === t + 1e-6)?.value).toBe(7);
  ef.pointLoadsZ = [];
  ef.pieces = [{ x0: 0, x1: 1.63, sectionId: 1, forces: { ...force(), length: 1.63 } },
    { x0: 1.63, x1: 5, sectionId: 1, forces: { ...force(), length: 3.37, myStart: 20 } }];
  const piecewise = diagrams.computeDiagram3D(ef, 'momentY');
  expect(piecewise.points.find(p => p.t === t)?.value).toBe(10);
  expect(piecewise.maxValue).toBe(20);
});

it('draws every member of a group with one set of materials and one marker geometry', async () => {
  const THREE = await import('three');
  const { createEnvelopeDiagramGroup3D } = await import('../diagram-render-3d');
  modelStore.clear();
  const nodes = [0, 5, 10, 15].map((x) => modelStore.addNode(x, 0, 0));
  const ids = [0, 1, 2].map((i) => modelStore.addElement(nodes[i]!, nodes[i + 1]!));
  const forces = ids.map((id, i) => ({ ...force(), elementId: id, myStart: 10 + i, myEnd: -(4 + i) }));
  const group = createDiagramGroup3D(modelStore.elements, modelStore.nodes, forces, 'momentY', 1, false);
  const tPositions = [0, 0.5, 1];
  const envelope = createEnvelopeDiagramGroup3D(modelStore.elements, modelStore.nodes, {
    kind: 'momentY', globalMax: 12,
    elements: ids.map((id, i) => ({ elementId: id, tPositions, posValues: [10 + i, 4, 0], negValues: [0, -3, -(6 + i)] })),
  } as never, 'momentY', 1, false);
  try {
    type Drawn = InstanceType<typeof THREE.Mesh>;
    const of = (root: typeof group, type: string) => root.children.filter((c) => c.userData.type === type) as Drawn[];
    const fills = of(group, 'diagram3dMesh'), outlines = of(group, 'diagram3dLine');
    expect([fills.length, outlines.length]).toEqual([3, 3]);
    expect(new Set(fills.map((m) => m.material)).size).toBe(1);
    expect(new Set(outlines.map((m) => m.material)).size).toBe(1);
    const fill = fills[0]!.material as InstanceType<typeof THREE.MeshBasicMaterial>;
    expect([fill.opacity, fill.transparent, fill.depthWrite, fill.side]).toEqual([0.35, true, false, THREE.DoubleSide]);
    expect(new Set(fills.map((m) => m.geometry)).size).toBe(3);
    // The closing lines of all the members are one object, two segments a member, and so are the markers.
    const closing = of(group, 'diagram3dClosing') as unknown as InstanceType<typeof THREE.LineSegments>[];
    expect(closing.length).toBe(1);
    expect(closing[0]).toBeInstanceOf(THREE.LineSegments);
    const ends = closing[0]!.geometry.getAttribute('position');
    expect(ends.count).toBe(12);
    for (let member = 0; member < 3; member++) {
      const curve = fills[member]!.geometry.getAttribute('position');
      const last = curve.count - 2;
      // Baseline to curve at the member's first and last stations, as the member's own fill has them.
      expect([0, 1, 2, 3].map((v) => [ends.getX(4 * member + v), ends.getY(4 * member + v), ends.getZ(4 * member + v)]))
        .toEqual([0, 1, last, last + 1].map((v) => [curve.getX(v), curve.getY(v), curve.getZ(v)]));
    }
    const markers = of(group, 'diagram3dMarkers') as unknown as InstanceType<typeof THREE.InstancedMesh>[];
    expect(markers.length).toBe(1);
    expect([markers[0]!.count, markers[0]!.renderOrder]).toEqual([3, 1]);
    expect((markers[0]!.material as InstanceType<typeof THREE.MeshBasicMaterial>).depthTest).toBe(false);
    const at = new THREE.Matrix4();
    for (let member = 0; member < 3; member++) {
      markers[0]!.getMatrixAt(member, at);
      const curve = fills[member]!.geometry.getAttribute('position');
      // Each member's largest moment is at its start: the marker stands on the curve there.
      expect([at.elements[12], at.elements[13], at.elements[14]]).toEqual([curve.getX(1), curve.getY(1), curve.getZ(1)]);
      expect([at.elements[0], at.elements[5], at.elements[10]]).toEqual([1, 1, 1]);
    }
    expect(group.children.length).toBe(3 + 3 + 1 + 1);
    const disposed = vi.spyOn(markers[0]!, 'dispose');
    disposeObject(group);
    expect(disposed).toHaveBeenCalledTimes(1);

    // An envelope keeps its two colours apart: one set a curve.
    for (const curve of ['pos', 'neg']) {
      const meshes = envelope.children.filter((c) => c.userData.type === 'diagram3dEnvelopeMesh' && c.userData.curve === curve) as Drawn[];
      expect(meshes.length).toBe(3);
      expect(new Set(meshes.map((m) => m.material)).size).toBe(1);
      expect((meshes[0]!.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity).toBe(0.25);
    }
    const colours = new Set((envelope.children.filter((c) => c.userData.type === 'diagram3dEnvelopeMesh') as Drawn[])
      .map((m) => (m.material as InstanceType<typeof THREE.MeshBasicMaterial>).color.getHex()));
    expect(colours.size).toBe(2);
  } finally { disposeObject(group); disposeObject(envelope); modelStore.clear(); }
});

it('keeps markers far from the origin in view: the instanced mesh is culled by where its instances are', async () => {
  const THREE = await import('three');
  modelStore.clear();
  const a = modelStore.addNode(5000, 3000, 40), b = modelStore.addNode(5005, 3000, 40);
  const id = modelStore.addElement(a, b);
  const group = createDiagramGroup3D(modelStore.elements, modelStore.nodes, [{ ...force(), elementId: id }], 'momentY', 1, false);
  try {
    const markers = group.children.find((child) => child.userData.type === 'diagram3dMarkers') as InstanceType<typeof THREE.InstancedMesh>;
    const at = new THREE.Matrix4();
    markers.getMatrixAt(0, at);
    const marker = new THREE.Vector3().setFromMatrixPosition(at);
    expect(marker.distanceTo(new THREE.Vector3(5000, 3000, 40))).toBeLessThan(10);
    group.updateMatrixWorld(true);
    // What the renderer asks before it draws: a camera looking at the member, the origin 5.8 km behind it.
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(marker.x, marker.y - 20, marker.z);
    camera.up.set(0, 0, 1);
    camera.lookAt(marker);
    camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    expect(frustum.intersectsObject(markers)).toBe(true);
    expect(frustum.containsPoint(new THREE.Vector3(0, 0, 0))).toBe(false);
    expect(markers.boundingSphere!.containsPoint(marker)).toBe(true);
  } finally { disposeObject(group); modelStore.clear(); }
});

it('leaves an instanced mesh marked as shared for its owner to dispose', async () => {
  const THREE = await import('three');
  const group = new THREE.Group();
  const owned = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 2), new THREE.MeshBasicMaterial(), 2);
  const pooled = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 2), new THREE.MeshBasicMaterial(), 2);
  pooled.userData.shared = true;
  group.add(owned, pooled);
  const calls = [vi.spyOn(owned, 'dispose'), vi.spyOn(pooled, 'dispose')];
  disposeObject(group);
  expect(calls.map((spy) => spy.mock.calls.length)).toEqual([1, 0]);
  pooled.geometry.dispose(); (pooled.material as InstanceType<typeof THREE.MeshBasicMaterial>).dispose(); pooled.dispose();
});

it('marks only the members whose values are worth marking', async () => {
  const THREE = await import('three');
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0), c = modelStore.addNode(10, 0, 0);
  const big = modelStore.addElement(a, b), small = modelStore.addElement(b, c);
  // The second member's values are under 5 % of the largest: it is drawn and not marked.
  const group = createDiagramGroup3D(modelStore.elements, modelStore.nodes,
    [{ ...force(), elementId: big, myStart: 100, myEnd: 100 }, { ...force(), elementId: small, myStart: 1, myEnd: 1 }], 'momentY', 1, false);
  try {
    expect(group.children.filter((child) => child.userData.type === 'diagram3dMesh').length).toBe(2);
    const markers = group.children.filter((child) => child.userData.type === 'diagram3dMarkers') as unknown as InstanceType<typeof THREE.InstancedMesh>[];
    expect(markers.map((m) => m.count)).toEqual([1]);
  } finally { disposeObject(group); modelStore.clear(); }
});
