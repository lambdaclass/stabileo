// Create Three.js meshes for plate (DKT triangle) and quad (MITC4) shell elements.
//
// Render-mode aware (CP1 — shell render/thickness/visualization):
//   - 'wireframe' : faint translucent face + prominent outline (reads as a wire shell)
//   - 'solid'     : translucent flat face + outline (mid-surface preview)
//   - 'sections'  : THICK extruded solid (slab/wall) — the "mini rendered model"
//
// Every face geometry carries `userData.vertexNodeIndex` mapping each position
// vertex back to its corner node (0..2 for plates, 0..3 for quads). The stress
// heatmap / contour code uses it to colour ALL vertices of the (possibly
// extruded) geometry instead of assuming the flat-fan layout.
import * as THREE from 'three';

const SHELL_COLOR = 0x4ecdc4;
const EDGE_COLOR = 0x88ddcc;

// Per-material palette so different shell materials read distinctly in 3D.
// materialId 0 keeps the historic teal; others cycle a calm, high-contrast set.
const SHELL_PALETTE = [
  0x4ecdc4, 0xf6a560, 0x9b8cf0, 0x6fcf67, 0xe06f9c, 0x5aa9e6, 0xd9c04a,
];

/** Stable face colour for a shell from its material id. */
export function shellColorForMaterial(materialId: number | undefined): number {
  if (materialId === undefined || !Number.isFinite(materialId)) return SHELL_COLOR;
  const n = SHELL_PALETTE.length;
  return SHELL_PALETTE[((materialId % n) + n) % n];
}

export type ShellRenderMode = 'wireframe' | 'solid' | 'sections';

export interface ShellRenderOpts {
  renderMode: ShellRenderMode;
  /** Element thickness in metres — drives the extruded slab depth in 'sections'. */
  thickness: number;
  /** Face colour (defaults to the material palette / teal). */
  faceColor?: number;
}

type Vec3 = { x: number; y: number; z: number };

/** Build a per-shell face material (cloned per mesh so selection/contour code
 *  can mutate colour/vertexColors without touching other shells). */
function makeFaceMaterial(color: number, mode: ShellRenderMode): THREE.MeshStandardMaterial {
  const sections = mode === 'sections';
  const wire = mode === 'wireframe';
  return new THREE.MeshStandardMaterial({
    color,
    transparent: !sections,
    opacity: sections ? 1.0 : wire ? 0.14 : 0.5,
    side: THREE.DoubleSide,
    // Opaque slabs write depth (so they occlude correctly like a real model);
    // translucent mid-surface previews keep depthWrite off to avoid sorting halos.
    depthWrite: sections,
    roughness: 0.7,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/** Outward face normal of a planar polygon (CCW by node order). */
function faceNormal(verts: Vec3[]): THREE.Vector3 {
  const a = new THREE.Vector3(verts[0].x, verts[0].y, verts[0].z);
  const b = new THREE.Vector3(verts[1].x, verts[1].y, verts[1].z);
  const c = new THREE.Vector3(verts[2].x, verts[2].y, verts[2].z);
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const len = n.length();
  return len > 1e-12 ? n.multiplyScalar(1 / len) : new THREE.Vector3(0, 0, 1);
}

/** Flat (zero-thickness) triangulated face. Returns geometry + vertex→node map. */
function buildFlatGeometry(verts: Vec3[]): THREE.BufferGeometry {
  const n = verts.length;
  const pos: number[] = [];
  const nodeIdx: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const tri = [0, i, i + 1];
    for (const k of tri) {
      pos.push(verts[k].x, verts[k].y, verts[k].z);
      nodeIdx.push(k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  geo.userData.vertexNodeIndex = nodeIdx;
  return geo;
}

/** Extruded slab: the polygon thickened by `t` (centred on the mid-surface). */
function buildPrismGeometry(verts: Vec3[], normal: THREE.Vector3, t: number): THREE.BufferGeometry {
  const h = Math.max(t, 1e-4) / 2;
  const top = verts.map(v => new THREE.Vector3(v.x, v.y, v.z).addScaledVector(normal, h));
  const bot = verts.map(v => new THREE.Vector3(v.x, v.y, v.z).addScaledVector(normal, -h));
  const n = verts.length;
  const pos: number[] = [];
  const nodeIdx: number[] = [];
  const push = (p: THREE.Vector3, corner: number) => {
    pos.push(p.x, p.y, p.z);
    nodeIdx.push(corner);
  };
  // Top face (fan, +normal side)
  for (let i = 1; i < n - 1; i++) {
    push(top[0], 0); push(top[i], i); push(top[i + 1], i + 1);
  }
  // Bottom face (fan, reversed winding)
  for (let i = 1; i < n - 1; i++) {
    push(bot[0], 0); push(bot[i + 1], i + 1); push(bot[i], i);
  }
  // Side walls
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    push(bot[i], i); push(bot[j], j); push(top[j], j);
    push(bot[i], i); push(top[j], j); push(top[i], i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  geo.userData.vertexNodeIndex = nodeIdx;
  return geo;
}

/** Crisp outline geometry (coplanar fan diagonals suppressed for flat faces). */
function buildEdges(geo: THREE.BufferGeometry, mode: ShellRenderMode): THREE.LineSegments {
  const thresholdDeg = mode === 'sections' ? 20 : 1;
  const eg = new THREE.EdgesGeometry(geo, thresholdDeg);
  const mat = new THREE.LineBasicMaterial({ color: EDGE_COLOR, linewidth: 1 });
  const edges = new THREE.LineSegments(eg, mat);
  edges.userData.shellEdge = true;
  edges.raycast = () => {};
  return edges;
}

/** Shared builder for plate (3 nodes) and quad (4 nodes). */
function buildShellGroup(
  verts: Vec3[],
  type: 'plate' | 'quad',
  id: number,
  opts: ShellRenderOpts,
): THREE.Group {
  const group = new THREE.Group();
  const faceColor = opts.faceColor ?? SHELL_COLOR;
  const mode = opts.renderMode;

  const geo = mode === 'sections'
    ? buildPrismGeometry(verts, faceNormal(verts), opts.thickness)
    : buildFlatGeometry(verts);

  const mesh = new THREE.Mesh(geo, makeFaceMaterial(faceColor, mode));
  mesh.userData.shellFace = true;
  mesh.userData.ownShellMaterial = true;
  group.add(mesh);
  group.add(buildEdges(geo, mode));

  group.userData = {
    type, id,
    baseFaceColor: faceColor,
    baseEdgeColor: EDGE_COLOR,
    thickness: opts.thickness,
    renderMode: mode,
  };
  return group;
}

/** Create a triangular plate mesh (3-node DKT element). */
export function createPlateMesh(
  n0: Vec3, n1: Vec3, n2: Vec3,
  plateId: number,
  opts: ShellRenderOpts,
): THREE.Group {
  return buildShellGroup([n0, n1, n2], 'plate', plateId, opts);
}

/** Create a quadrilateral shell mesh (4-node MITC4 element). Nodes in CCW/CW
 *  order (material is double-sided). */
export function createQuadMesh(
  n0: Vec3, n1: Vec3, n2: Vec3, n3: Vec3,
  quadId: number,
  opts: ShellRenderOpts,
): THREE.Group {
  return buildShellGroup([n0, n1, n2, n3], 'quad', quadId, opts);
}

/** Repaint a shell group's face + outline (selection / hover / restore). */
export function paintShell(group: THREE.Group, faceColor: number, edgeColor: number): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData?.shellFace) {
      const mat = child.material as THREE.MeshStandardMaterial;
      // Don't fight an active contour (vertexColors) — only tint flat material.
      if (!mat.vertexColors) {
        mat.color.setHex(faceColor);
        mat.needsUpdate = true;
      }
    } else if (child instanceof THREE.LineSegments && child.userData?.shellEdge) {
      (child.material as THREE.LineBasicMaterial).color.setHex(edgeColor);
      (child.material as THREE.LineBasicMaterial).needsUpdate = true;
    }
  });
}

/** Restore a shell group to its stored base colours. */
export function restoreShellColor(group: THREE.Group): void {
  paintShell(
    group,
    (group.userData.baseFaceColor as number) ?? SHELL_COLOR,
    (group.userData.baseEdgeColor as number) ?? EDGE_COLOR,
  );
}

/** Back-compat: shells now own their material at creation. Returns it. */
export function ensureOwnShellMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (mesh.userData.ownShellMaterial) return mat;
  const owned = mat.clone();
  mesh.material = owned;
  mesh.userData.ownShellMaterial = true;
  return owned;
}
