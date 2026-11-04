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
import type { PrismLayer } from '../engine/physical/physical-frame';
import { prismLayersGeometry } from './physical-mesh';

const SHELL_COLOR = 0x4ecdc4;

const EDGE_COLOR = 0x88ddcc;
/** The shells' outline colour, for what draws them other than here. */
export const SHELL_EDGE_COLOR = EDGE_COLOR;

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

export type ShellRenderMode = 'wireframe' | 'solid' | 'sections' | 'physical';

export interface ShellRenderOpts {
  renderMode: ShellRenderMode;
  /** Element thickness in metres — drives the extruded slab depth in 'sections'. */
  thickness: number;
  /** Face colour (defaults to the material palette / teal). */
  faceColor?: number;
  /** In `physical` mode, the slab net of the frame (`store/physical-frame.ts`); absent, drawn as `sections`. */
  physicalLayers?: readonly PrismLayer[];
}

type Vec3 = { x: number; y: number; z: number };

/** Build a per-shell face material (cloned per mesh so selection/contour code
 *  can mutate colour/vertexColors without touching other shells). */
function makeFaceMaterial(color: number, mode: ShellRenderMode): THREE.MeshStandardMaterial {
  const sections = mode === 'sections' || mode === 'physical';
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

/**
 * How many pieces each edge of a shell face is cut into for display.
 *
 * ── Why a face is not two triangles ────────────────────────────────
 *
 * A result contour on a quad drawn as two triangles can only be what Gouraud
 * makes of four corner colours, and that has two visible consequences: a seam
 * down the diagonal, because the two triangles interpolate along different
 * directions, and a field that is flat everywhere between the corners. A
 * stress map of a raft then reads as faceted panels rather than as the smooth
 * field it is.
 *
 * Cut into a 6 × 6 grid the seam is gone and the colour varies bilinearly
 * across the face, which is the interpolation the nodal values actually
 * support — no more is claimed, and nothing is invented between them. The
 * cost is 72 triangles where there were 2, which for a mesh of hundreds of
 * shells is still a rounding error next to the members around them.
 *
 * Only the FLAT face is cut. The extruded `sections` view is a solid, and its
 * interior faces have nothing to interpolate.
 */
const FACE_SUBDIVISIONS = 6;

/**
 * Flat (zero-thickness) subdivided face.
 *
 * Carries two maps for the painters: `vertexNodeIndex`, the nearest corner,
 * kept for callers that only need a corner; and `vertexNodeWeights`, the
 * barycentric or bilinear share of every corner at that vertex, which is what
 * makes a smooth contour possible.
 */
function buildFlatGeometry(verts: Vec3[]): THREE.BufferGeometry {
  const n = verts.length;
  const pos: number[] = [];
  const nodeIdx: number[] = [];
  const weights: number[][] = [];
  const N = FACE_SUBDIVISIONS;

  /** Push one vertex from a set of corner weights. */
  const push = (w: number[]) => {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < n; k++) {
      x += w[k] * verts[k].x; y += w[k] * verts[k].y; z += w[k] * verts[k].z;
    }
    pos.push(x, y, z);
    weights.push(w);
    let best = 0;
    for (let k = 1; k < n; k++) if (w[k] > w[best]) best = k;
    nodeIdx.push(best);
  };

  if (n === 4) {
    // Bilinear in (u, v) over corners 0-1-2-3 taken in order round the face.
    const w = (u: number, v: number) => [
      (1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v,
    ];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N;
        push(w(u0, v0)); push(w(u1, v0)); push(w(u1, v1));
        push(w(u0, v0)); push(w(u1, v1)); push(w(u0, v1));
      }
    }
  } else if (n === 3) {
    // Barycentric: the standard subdivision of a triangle into N² triangles.
    const w = (a: number, b: number) => [1 - a - b, a, b];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N - i; j++) {
        const a0 = i / N, a1 = (i + 1) / N, b0 = j / N, b1 = (j + 1) / N;
        push(w(a0, b0)); push(w(a1, b0)); push(w(a0, b1));
        if (j < N - i - 1) { push(w(a1, b0)); push(w(a1, b1)); push(w(a0, b1)); }
      }
    }
  } else {
    // Anything else keeps the old fan; no shell type in the model reaches here.
    for (let i = 1; i < n - 1; i++) {
      for (const k of [0, i, i + 1]) {
        const w = new Array(n).fill(0); w[k] = 1;
        push(w);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  geo.userData.vertexNodeIndex = nodeIdx;
  geo.userData.vertexNodeWeights = weights;
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
  const thresholdDeg = mode === 'sections' || mode === 'physical' ? 20 : 1;
  const eg = new THREE.EdgesGeometry(geo, thresholdDeg);
  const mat = new THREE.LineBasicMaterial({ color: EDGE_COLOR, linewidth: 1 });
  const edges = new THREE.LineSegments(eg, mat);
  edges.userData.shellEdge = true;
  edges.raycast = () => {};
  return edges;
}

/**
 * A net slab's painters' maps: each vertex's nearest corner (`vertexNodeIndex`) and that corner
 * alone as its weight (`vertexNodeWeights`), so a result contour still reads on a cut outline.
 */
function withCornerMaps(geo: THREE.BufferGeometry, verts: Vec3[]): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const idx: number[] = [], weights: number[][] = [];
  for (let i = 0; i < pos.count; i++) {
    let best = 0, d = Infinity;
    verts.forEach((v, k) => { const e = Math.hypot(pos.getX(i) - v.x, pos.getY(i) - v.y); if (e < d) { d = e; best = k; } });
    idx.push(best);
    const w = new Array(verts.length).fill(0); w[best] = 1; weights.push(w);
  }
  geo.userData.vertexNodeIndex = idx;
  geo.userData.vertexNodeWeights = weights;
  return geo;
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

  const net = mode === 'physical' && opts.physicalLayers ? prismLayersGeometry(opts.physicalLayers) : null;
  // A slab the frame covers whole keeps its flat face, so it can still be picked.
  const geo = mode === 'physical' && opts.physicalLayers ? (net ? withCornerMaps(net, verts) : buildFlatGeometry(verts))
    : mode === 'sections' || mode === 'physical'
      ? buildPrismGeometry(verts, faceNormal(verts), opts.thickness)
      : buildFlatGeometry(verts);

  const faceMat = makeFaceMaterial(faceColor, mode);
  const mesh = new THREE.Mesh(geo, faceMat);
  mesh.userData.shellFace = true;
  mesh.userData.ownShellMaterial = true;
  // Remember the mode's base look so a result contour can switch the face to
  // opaque and back without guessing.
  mesh.userData.baseOpacity = faceMat.opacity;
  mesh.userData.baseTransparent = faceMat.transparent;
  mesh.userData.baseDepthWrite = faceMat.depthWrite;
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

/** Repaint only a shell group's outline (selection highlight while a result
 *  contour owns the face colours). */
export function paintShellEdge(group: THREE.Group, edgeColor: number): void {
  group.traverse((child) => {
    if (child instanceof THREE.LineSegments && child.userData?.shellEdge) {
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

/** The outline colour of a physical plate that has no mesh yet: the plate is there, its elements are not. */
export const UNMESHED_PLATE_EDGE = 0xe0a040;

/**
 * A physical plate with no mesh (`store/physical-plates.ts`), drawn from its outline and holes:
 * its face triangulated only to be seen and clicked, and its loops as the outline. `uv` are the
 * loops' points in the plate's own plane, in the same order as `outer` and `holes`.
 */
/**
 * A physical plate with no mesh drawn as the slab it is, in the views that draw thickness: the
 * outline and holes triangulated top and bottom, half the thickness each side of the mid-plane,
 * and a wall along every loop. `faces` index the outline's points followed by each hole's.
 */
function plateSlabGeometry(outer: Vec3[], holes: Vec3[][], faces: number[][], thickness: number): THREE.BufferGeometry {
  const loops = [outer, ...holes];
  const pts = loops.flat();
  // Newell's normal of the outline: robust for any planar polygon, whatever its winding.
  const n = new THREE.Vector3();
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i]!, b = outer[(i + 1) % outer.length]!;
    n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y);
  }
  if (n.lengthSq() < 1e-18) n.set(0, 0, 1); else n.normalize();
  const h = thickness / 2;
  const top = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z).addScaledVector(n, h));
  const bot = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z).addScaledVector(n, -h));
  const pos: number[] = [];
  const push = (v: THREE.Vector3) => pos.push(v.x, v.y, v.z);
  for (const [a, b, c] of faces) { push(top[a!]!); push(top[b!]!); push(top[c!]!); push(bot[a!]!); push(bot[c!]!); push(bot[b!]!); }
  let base = 0;
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = base + i, b = base + (i + 1) % loop.length;
      push(bot[a]!); push(bot[b]!); push(top[b]!);
      push(bot[a]!); push(top[b]!); push(top[a]!);
    }
    base += loop.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  return geo;
}

export function createPhysicalPlateMesh(
  outer: Vec3[], holes: Vec3[][], uv: { outer: Array<[number, number]>; holes: Array<Array<[number, number]>> },
  plateId: number, opts: { faceColor?: number; renderMode: ShellRenderMode; thickness?: number },
): THREE.Group {
  const group = new THREE.Group();
  const contour = uv.outer.map(([x, y]) => new THREE.Vector2(x, y));
  const hs = uv.holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
  const faces = THREE.ShapeUtils.triangulateShape(contour, hs);
  const pts = [...outer, ...holes.flat()];
  const solid = (opts.renderMode === 'sections' || opts.renderMode === 'physical') && (opts.thickness ?? 0) > 0;
  const geo = solid ? plateSlabGeometry(outer, holes, faces, opts.thickness!) : (() => {
    const pos = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(faces.flat());
    g.computeVertexNormals();
    return g;
  })();
  const faceColor = opts.faceColor ?? SHELL_COLOR;
  // Drawn as a slab where the view draws thickness, with that view's opaque material; flat otherwise.
  const faceMat = makeFaceMaterial(faceColor, solid ? opts.renderMode : opts.renderMode === 'sections' || opts.renderMode === 'physical' ? 'solid' as ShellRenderMode : opts.renderMode);
  const mesh = new THREE.Mesh(geo, faceMat);
  mesh.userData.shellFace = true;
  mesh.userData.ownShellMaterial = true;
  group.add(mesh);
  const seg: number[] = [];
  for (const loop of [outer, ...holes]) {
    for (let i = 0; i < loop.length; i++) { const a = loop[i]!, b = loop[(i + 1) % loop.length]!; seg.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
  const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: UNMESHED_PLATE_EDGE }));
  edges.userData.shellEdge = true;
  group.add(edges);
  group.userData = { type: 'physicalPlate', id: plateId, baseFaceColor: faceColor, baseEdgeColor: UNMESHED_PLATE_EDGE, renderMode: opts.renderMode };
  return group;
}
