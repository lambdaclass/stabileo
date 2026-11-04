/**
 * The meshes of a joint's typology: every part the design returns (plates, bolts, fillets,
 * stiffeners, anchors) as a box on its own axes. Nothing is measured here; every dimension is the
 * design's, so what is drawn is what was checked.
 */
import * as THREE from 'three';
import type { Part } from '../connection/typology/types';

const COLOUR: Record<Part['kind'], number> = {
  plate: 0x8899aa, stiffener: 0x99aabb, bolt: 0x445566, anchor: 0x445566, weld: 0xc98a3d,
};

export function buildTypologyMeshes(parts: readonly Part[], nodeId: number): { meshes: THREE.Mesh[]; boundingRadiusM: number; centreM: { x: number; y: number; z: number } | null } {
  const meshes: THREE.Mesh[] = [];
  if (!parts.length) return { meshes, boundingRadiusM: 0, centreM: null };
  const c = parts.reduce((a, p) => ({ x: a.x + p.center.x / parts.length, y: a.y + p.center.y / parts.length, z: a.z + p.center.z / parts.length }), { x: 0, y: 0, z: 0 });
  let r = 0;
  for (const p of parts) {
    const u = new THREE.Vector3(p.u.x, p.u.y, p.u.z).normalize(), v = new THREE.Vector3(p.v.x, p.v.y, p.v.z).normalize();
    const w = new THREE.Vector3().crossVectors(u, v).normalize();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(p.size[0], 1e-4), Math.max(p.size[1], 1e-4), Math.max(p.size[2], 1e-4)),
      new THREE.MeshStandardMaterial({ color: COLOUR[p.kind], roughness: p.kind === 'bolt' ? 0.4 : 0.6, metalness: p.kind === 'weld' ? 0.1 : 0.5 }),
    );
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, w));
    mesh.position.set(p.center.x, p.center.y, p.center.z);
    mesh.userData = { type: 'jointPart', part: p.kind, nodeId, jointPickable: true };
    meshes.push(mesh);
    r = Math.max(r, Math.hypot(p.center.x - c.x, p.center.y - c.y, p.center.z - c.z) + Math.hypot(...p.size) / 2);
  }
  return { meshes, boundingRadiusM: r, centreM: c };
}
