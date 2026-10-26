/**
 * Put a mesh from `mesher.ts` into the model: its points welded onto nodes already there, its
 * cells as quadrilateral or triangular shells, and the members along its boundary cut at the
 * mesh's boundary nodes so slab and beam share them. One undo step.
 */
import { modelStore } from '../../store/model.svelte';
import { findCoincidentNode } from '../../engine/mesh-weld';
import { weldTolerance } from '../weld-tolerance';
import { splitAtNodes } from './cut-members';
import { generateMesh, type MeshInput, type MeshOutput } from './mesher';
import type { Vec3 } from './affine';

export interface MeshApplyOptions {
  materialId: number; thickness: number; splitBeams: boolean;
  /** Which edge points may cut a member; absent, every one (`column-footprints.ts` keeps the columns' sections out). */
  splitAt?: (p: Vec3) => boolean;
}

export interface MeshApplyResult {
  newNodes: number; quads: number[]; plates: number[]; splitCount: number; structured: boolean; nodeIds: number[];
  /** The region already had shells in its plane, and nothing was added. */
  occupied?: boolean;
}

/**
 * Whether shells of the model already lie in the region, in its plane.
 *
 * Meshing a region twice stacked a second mesh on the first: twice the stiffness and twice the
 * self-weight, with nothing on screen to tell. A shell counts when its centre is inside the
 * outline, outside every hole, and on the region's plane. `exceptQuad` is a quad about to be
 * replaced by the mesh, which does not count.
 */
export function regionOccupied(input: MeshInput, plane: MeshOutput['plane'], exceptQuad?: number): boolean {
  const n: Vec3 = [
    plane.u[1] * plane.v[2] - plane.u[2] * plane.v[1],
    plane.u[2] * plane.v[0] - plane.u[0] * plane.v[2],
    plane.u[0] * plane.v[1] - plane.u[1] * plane.v[0],
  ];
  const d = (p: Vec3): Vec3 => [p[0] - plane.o[0], p[1] - plane.o[1], p[2] - plane.o[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const uv = (p: Vec3): [number, number] => [dot(d(p), plane.u), dot(d(p), plane.v)];
  const inLoop = (q: [number, number], loop: MeshInput['outer']) => {
    if (loop.kind === 'circle') { const c = uv(loop.center); return Math.hypot(q[0] - c[0], q[1] - c[1]) < loop.radius; }
    const poly = loop.points.map(uv);
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!, b = poly[j]!;
      if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const tol = 1e-3;
  for (const shell of [...modelStore.quads.values(), ...modelStore.plates.values()]) {
    if (shell.nodes.length === 4 && shell.id === exceptQuad) continue;
    const ps = shell.nodes.map((id) => modelStore.nodes.get(id));
    if (ps.some((p) => !p)) continue;
    const pts = ps.map((p): Vec3 => [p!.x, p!.y, p!.z ?? 0]);
    if (pts.some((p) => Math.abs(dot(d(p), n)) > tol)) continue;
    const c: Vec3 = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k]!, 0) / pts.length) as Vec3;
    const q = uv(c);
    if (inLoop(q, input.outer) && !input.holes.some((h) => inLoop(q, h))) return true;
  }
  return false;
}

/** Every model node, as the points a boundary may have to pass through. */
export const modelPoints = (): Vec3[] => [...modelStore.nodes.values()].map((n) => [n.x, n.y, n.z ?? 0]);
/** The model's bars as segments, for a mesh to follow where they lie in its region (`MeshInput.fixedSegments`). */
export const modelSegments = (): Array<[Vec3, Vec3]> => [...modelStore.elements.values()].flatMap((e) => {
  const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
  return a && b ? [[[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]] as [Vec3, Vec3]] : [];
});

export function applyMesh(input: MeshInput, o: MeshApplyOptions, mesh: MeshOutput | null = generateMesh({ ...input, fixedPoints: input.fixedPoints ?? modelPoints(), fixedSegments: input.fixedSegments ?? modelSegments() })): MeshApplyResult | null {
  if (!mesh) return null;
  const out: MeshApplyResult = { newNodes: 0, quads: [], plates: [], splitCount: 0, structured: mesh.structured, nodeIds: [] };
  if (regionOccupied(input, mesh.plane)) return { ...out, occupied: true };
  // The model's nodes hashed by position, once: a mesh of thousands of points looked each one up
  // against every node, and the whole slab of a building took minutes to land.
  const tol = weldTolerance();
  const cell = Math.max(tol * 4, 1e-3);
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const buckets = new Map<string, Array<{ id: number; x: number; y: number; z: number }>>();
  const put = (n: { id: number; x: number; y: number; z: number }) => { const k = key(n.x, n.y, n.z); const b = buckets.get(k); if (b) b.push(n); else buckets.set(k, [n]); };
  for (const n of modelStore.nodes.values()) put({ id: n.id, x: n.x, y: n.y, z: n.z ?? 0 });
  const near = (x: number, y: number, z: number): number | null => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const hit = findCoincidentNode(buckets.get(`${cx + i},${cy + j},${cz + k}`) ?? [], x, y, z, tol);
      if (hit !== null) return hit;
    }
    return null;
  };
  modelStore.bulkMutate(() => {
    const ids = mesh.points.map((p) => {
      const hit = near(p[0], p[1], p[2]);
      if (hit !== null) return hit;
      out.newNodes++;
      const id = modelStore.addNode(p[0], p[1], p[2] !== 0 ? p[2] : undefined);
      put({ id, x: p[0], y: p[1], z: p[2] });
      return id;
    });
    out.nodeIds = ids;
    const at3 = (id: number) => { const p = modelStore.nodes.get(id)!; return { x: p.x, y: p.y, z: p.z ?? 0 }; };
    for (const c of mesh.cells) {
      for (const n of validCells(c.map((i) => ids[i]!), at3)) {
        if (n.length === 4) out.quads.push(modelStore.addQuad(n as [number, number, number, number], o.materialId, o.thickness));
        else out.plates.push(modelStore.addPlate(n as [number, number, number], o.materialId, o.thickness));
      }
    }
    if (o.splitBeams) {
      // Every mesh node a member passes through cuts it: on the region's edge (the beams round a
      // panel) and inside it (a beam in the slab's plane, which works with the slab only where
      // they share nodes; left whole, it crossed the slab's nodes unconnected).
      const at = mesh.points.map((_, i) => i).filter((i) => !o.splitAt || o.splitAt(mesh.points[i]!)).map((i) => ids[i]!);
      const cut = splitAtNodes([...modelStore.elements.keys()], at);
      out.splitCount = cut.cut.reduce((s, x) => s + x.segments.length - 1, 0);
    }
  });
  return out;
}

/**
 * A mesh cell as the model can hold it, once its points have landed on the model's nodes.
 *
 * Two points of a cell within the weld tolerance of one existing node land on that node, and the
 * cell loses a corner: a quad whose two opposite corners became one node folds over itself, and the
 * solve refused the whole model for it (a column a few centimetres from a beam the mesh follows).
 * Repeated corners are dropped; three left in order make a triangle; a cell that encloses no area
 * is left out (it was a sliver between two points the weld made one). A quad with four corners that
 * turns back on itself is split along the diagonal that leaves two proper triangles.
 */
export function validCells(n: readonly number[], at: (id: number) => { x: number; y: number; z: number }): number[][] {
  const cyc = n.filter((id, i) => id !== n[(i + n.length - 1) % n.length]);
  const uniq = [...new Set(cyc)];
  const area = (ids: readonly number[]) => {
    // Twice the area, from the cross products about the first corner (any plane).
    const p = ids.map(at), o = p[0]!;
    let x = 0, y = 0, z = 0;
    for (let i = 1; i + 1 < p.length; i++) {
      const a = { x: p[i]!.x - o.x, y: p[i]!.y - o.y, z: p[i]!.z - o.z }, b = { x: p[i + 1]!.x - o.x, y: p[i + 1]!.y - o.y, z: p[i + 1]!.z - o.z };
      x += a.y * b.z - a.z * b.y; y += a.z * b.x - a.x * b.z; z += a.x * b.y - a.y * b.x;
    }
    return { x, y, z, m: Math.hypot(x, y, z) };
  };
  if (uniq.length < 3 || cyc.length !== uniq.length) {
    // A spike (a corner repeated across the cell) or fewer than three corners: the corners left,
    // in order, if they still make a triangle with area.
    if (uniq.length === 3 && cyc.length === 3 && area(uniq).m > 1e-8) return [uniq];
    return [];
  }
  if (uniq.length === 3) return area(uniq).m > 1e-8 ? [uniq] : [];
  // Four corners: the two triangles on each diagonal must face the way the whole cell does.
  const whole = area(uniq);
  if (whole.m <= 1e-8) return [];
  const dot = (t: number[]) => { const a = area(t); return a.x * whole.x + a.y * whole.y + a.z * whole.z; };
  const [a, b, c, d] = uniq as [number, number, number, number];
  if (dot([a, b, c]) > 0 && dot([a, c, d]) > 0 && dot([b, c, d]) > 0 && dot([a, b, d]) > 0) return [uniq];
  for (const pair of [[[a, b, c], [a, c, d]], [[a, b, d], [b, c, d]]]) {
    if (pair.every((t) => dot(t) > 1e-10)) return pair;
  }
  return [];
}

