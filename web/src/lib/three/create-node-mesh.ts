// Create Three.js mesh for a structural node (sphere)
import * as THREE from 'three';
import { COLORS } from './selection-helpers';

// Shared geometry — reused across all node meshes
let _sharedGeo: THREE.SphereGeometry | null = null;
function getSharedGeo(radius: number): THREE.SphereGeometry {
  if (!_sharedGeo) {
    _sharedGeo = new THREE.SphereGeometry(radius, 16, 12);
  }
  return _sharedGeo;
}

export interface CreateNodeOpts {
  nodeId: number;
  selected?: boolean;
  hovered?: boolean;
  radius?: number;
}

export function createNodeMesh(
  x: number, y: number, z: number,
  opts: CreateNodeOpts,
): THREE.Mesh {
  const radius = opts.radius ?? 0.07;
  const geo = getSharedGeo(radius);

  let color = COLORS.node;
  if (opts.selected) color = COLORS.nodeSelected;
  else if (opts.hovered) color = COLORS.nodeHovered;

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.1,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.userData = { type: 'node', id: opts.nodeId };
  return mesh;
}

/** Update position of an existing node mesh */
export function updateNodePosition(mesh: THREE.Mesh, x: number, y: number, z: number): void {
  mesh.position.set(x, y, z);
}
