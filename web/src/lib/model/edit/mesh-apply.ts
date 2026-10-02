/**
 * Put a mesh from `mesher.ts` into the model: its points welded onto nodes already there, its
 * cells as quadrilateral or triangular shells, and the members along its boundary cut at the
 * mesh's boundary nodes so slab and beam share them. One undo step.
 */
import { modelStore } from '../../store/model.svelte';
import { findCoincidentNode } from '../../engine/mesh-weld';
import { splitAtNodes } from './cut-members';
import { generateMesh, type MeshInput, type MeshOutput } from './mesher';
import type { Vec3 } from './affine';

export interface MeshApplyOptions { materialId: number; thickness: number; splitBeams: boolean }

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

export function applyMesh(input: MeshInput, o: MeshApplyOptions, mesh: MeshOutput | null = generateMesh({ ...input, fixedPoints: input.fixedPoints ?? modelPoints() })): MeshApplyResult | null {
  if (!mesh) return null;
  const out: MeshApplyResult = { newNodes: 0, quads: [], plates: [], splitCount: 0, structured: mesh.structured, nodeIds: [] };
  if (regionOccupied(input, mesh.plane)) return { ...out, occupied: true };
  modelStore.batch(() => {
    const ids = mesh.points.map((p) => {
      const hit = findCoincidentNode(modelStore.nodes.values(), p[0], p[1], p[2]);
      if (hit !== null) return hit;
      out.newNodes++;
      return modelStore.addNode(p[0], p[1], p[2] !== 0 ? p[2] : undefined);
    });
    out.nodeIds = ids;
    for (const c of mesh.cells) {
      const n = c.map((i) => ids[i]!);
      if (n.length === 4) out.quads.push(modelStore.addQuad(n as [number, number, number, number], o.materialId, o.thickness));
      else out.plates.push(modelStore.addPlate(n as [number, number, number], o.materialId, o.thickness));
    }
    if (o.splitBeams) {
      const edge = [...mesh.boundary].map((i) => ids[i]!);
      const cut = splitAtNodes([...modelStore.elements.keys()], edge);
      out.splitCount = cut.cut.reduce((s, x) => s + x.segments.length - 1, 0);
    }
  });
  return out;
}
