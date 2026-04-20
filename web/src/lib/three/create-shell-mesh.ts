// Create Three.js meshes for plate (DKT triangle) and quad (MITC4) shell elements
import * as THREE from 'three';

const SHELL_COLOR = 0x4ecdc4;
const SHELL_OPACITY = 0.45;
const EDGE_COLOR = 0x88ddcc;

/** Shared material for shell faces (translucent, double-sided).
 *  Shared across all shell meshes at creation time. Heatmap / selection code
 *  that mutates per-mesh properties must first call ensureOwnShellMaterial(). */
const sharedShellMaterial = new THREE.MeshStandardMaterial({
  color: SHELL_COLOR,
  transparent: true,
  opacity: SHELL_OPACITY,
  side: THREE.DoubleSide,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

const edgeMaterial = new THREE.LineBasicMaterial({ color: EDGE_COLOR, linewidth: 1 });

/** Clone-on-write the shared shell material so a mesh can mutate it safely. */
export function ensureOwnShellMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (mesh.userData.ownShellMaterial) return mat;
  const owned = mat.clone();
  mesh.material = owned;
  mesh.userData.ownShellMaterial = true;
  return owned;
}

type Vec3 = { x: number; y: number; z: number };

/**
 * Create a triangular plate mesh (3-node DKT element)
 */
export function createPlateMesh(
  n0: Vec3, n1: Vec3, n2: Vec3,
  plateId: number,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'plate', id: plateId };

  // Face geometry
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    n0.x, n0.y, n0.z,
    n1.x, n1.y, n1.z,
    n2.x, n2.y, n2.z,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, sharedShellMaterial);
  group.add(mesh);

  // Edges
  const edgeGeo = new THREE.BufferGeometry();
  const edgeVerts = new Float32Array([
    n0.x, n0.y, n0.z,
    n1.x, n1.y, n1.z,
    n1.x, n1.y, n1.z,
    n2.x, n2.y, n2.z,
    n2.x, n2.y, n2.z,
    n0.x, n0.y, n0.z,
  ]);
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeVerts, 3));
  group.add(new THREE.LineSegments(edgeGeo, edgeMaterial));

  return group;
}

/**
 * Create a quadrilateral shell mesh (4-node MITC4 element)
 * Nodes should be in order (CCW or CW, the material is double-sided)
 */
export function createQuadMesh(
  n0: Vec3, n1: Vec3, n2: Vec3, n3: Vec3,
  quadId: number,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'quad', id: quadId };

  // Face: two triangles (0-1-2, 0-2-3)
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    n0.x, n0.y, n0.z,
    n1.x, n1.y, n1.z,
    n2.x, n2.y, n2.z,
    n0.x, n0.y, n0.z,
    n2.x, n2.y, n2.z,
    n3.x, n3.y, n3.z,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, sharedShellMaterial);
  group.add(mesh);

  // Edges
  const edgeGeo = new THREE.BufferGeometry();
  const edgeVerts = new Float32Array([
    n0.x, n0.y, n0.z, n1.x, n1.y, n1.z,
    n1.x, n1.y, n1.z, n2.x, n2.y, n2.z,
    n2.x, n2.y, n2.z, n3.x, n3.y, n3.z,
    n3.x, n3.y, n3.z, n0.x, n0.y, n0.z,
  ]);
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeVerts, 3));
  group.add(new THREE.LineSegments(edgeGeo, edgeMaterial));

  return group;
}
