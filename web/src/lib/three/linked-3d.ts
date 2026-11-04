import * as THREE from 'three';
import type { IfcReference } from '../ifc/ifc-reference';
import { disposeObject } from './selection-helpers';

/** A linked IFC drawn as a reference: its meshes in a light, flat shade of their own colours, and a mark for each product without a shape. */
export function buildLinkedReference(ref: IfcReference): THREE.Group {
  const group = new THREE.Group();
  group.name = 'linkedReference';
  for (const m of ref.meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    g.computeVertexNormals();
    const c = new THREE.Color(m.color[0], m.color[1], m.color[2]).lerp(new THREE.Color(0.85, 0.87, 0.9), 0.5);
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    mesh.userData.linkedType = m.type;
    mesh.renderOrder = -1;
    group.add(mesh);
  }
  if (ref.symbols.length) {
    const pos = new Float32Array(ref.symbols.flatMap((s) => [s.x, s.y, s.z]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8fa3b3, size: 6, sizeAttenuation: false, transparent: true, opacity: 0.9 })));
  }
  return group;
}

/** Replace the drawn references with `next`. */
export function swapLinked(scene: THREE.Scene, prev: THREE.Group | null, next: THREE.Group | null): THREE.Group | null {
  if (prev) { scene.remove(prev); disposeObject(prev); }
  if (next) scene.add(next);
  return next;
}
