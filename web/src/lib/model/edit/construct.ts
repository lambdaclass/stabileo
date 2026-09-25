/**
 * Members placed by construction, and holes filled with plates.
 *
 *   · A member from a node, perpendicular to another member: the foot of the perpendicular
 *     becomes a node on the target, which is cut there so the two connect.
 *   · A member between the midpoints of two members, each cut at its midpoint.
 *   · Plates over every closed hole the selected members bound in one plane.
 *
 * One undo step each; every cut goes through `splitMember`.
 */

import { modelStore } from '../../store/model.svelte';
import { cross, dot, norm, unit, type Vec3 } from './affine';
import { CUT_TOL } from './cut-members';
import { meshQuadRegion, type MeshDensity } from './mesh-region';
import { trianglesOverlap, type Triangle2 } from './triangle-overlap';

export type ConstructRefusal = 'footAtEnd' | 'alreadyOnMember' | 'sameMember' | 'notCoplanar' | 'noHoles';

export interface MemberSpec { type: 'frame' | 'truss'; materialId: number; sectionId: number }

type N = { x: number; y: number; z?: number };
const pv = (n: N): Vec3 => [n.x, n.y, n.z ?? 0];

function addMember(i: number, j: number, spec: MemberSpec): number {
  const id = modelStore.addElement(i, j, spec.type);
  modelStore.updateElement(id, { materialId: spec.materialId, sectionId: spec.sectionId });
  return id;
}

/** A member from `nodeId` to the foot of its perpendicular on `elementId`. */
export function perpendicularMember(nodeId: number, elementId: number, spec: MemberSpec):
  { elementId: number; footNode: number } | { refused: ConstructRefusal } {
  const e = modelStore.elements.get(elementId), n = modelStore.nodes.get(nodeId);
  if (!e || !n) return { refused: 'sameMember' };
  const a = pv(modelStore.nodes.get(e.nodeI)!), b = pv(modelStore.nodes.get(e.nodeJ)!), p = pv(n);
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const t = dot([p[0] - a[0], p[1] - a[1], p[2] - a[2]], ab) / dot(ab, ab);
  const foot: Vec3 = [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]];
  if (Math.hypot(p[0] - foot[0], p[1] - foot[1], p[2] - foot[2]) <= CUT_TOL) return { refused: 'alreadyOnMember' };
  if (t <= 1e-6 || t >= 1 - 1e-6) return { refused: 'footAtEnd' };
  let out: { elementId: number; footNode: number } = { elementId: -1, footNode: -1 };
  modelStore.batch(() => {
    const r = modelStore.splitMember(elementId, [t], { reuseNodeTol: CUT_TOL })!;
    out = { footNode: r.nodeIds[0]!, elementId: addMember(nodeId, r.nodeIds[0]!, spec) };
  });
  return out;
}

/** A member between the midpoints of two members. */
export function midpointMember(a: number, b: number, spec: MemberSpec):
  { elementId: number; nodes: [number, number] } | { refused: ConstructRefusal } {
  if (a === b || !modelStore.elements.has(a) || !modelStore.elements.has(b)) return { refused: 'sameMember' };
  let out: { elementId: number; nodes: [number, number] } = { elementId: -1, nodes: [-1, -1] };
  modelStore.batch(() => {
    const ra = modelStore.splitMember(a, [0.5], { reuseNodeTol: CUT_TOL })!;
    const rb = modelStore.splitMember(b, [0.5], { reuseNodeTol: CUT_TOL })!;
    const m = [ra.nodeIds[0]!, rb.nodeIds[0]!] as [number, number];
    out = { nodes: m, elementId: addMember(m[0], m[1], spec) };
  });
  return out;
}

// ─── Filling holes ────────────────────────────────────────────────

export interface FillReport { quads: number[]; plates: number[]; skippedExisting: number }

/** The plane of a set of points, or null when they do not share one within `tol`. */
function planeOf(points: Vec3[], tol: number): { o: Vec3; n: Vec3; u: Vec3; v: Vec3 } | null {
  if (points.length < 3) return null;
  const o = points[0]!;
  let n: Vec3 | null = null;
  for (let i = 1; i < points.length && !n; i++) for (let j = i + 1; j < points.length && !n; j++) {
    const c = cross([points[i]![0] - o[0], points[i]![1] - o[1], points[i]![2] - o[2]], [points[j]![0] - o[0], points[j]![1] - o[1], points[j]![2] - o[2]]);
    if (norm(c) > 1e-9) n = unit(c);
  }
  if (!n) return null;
  if (points.some((p) => Math.abs(dot([p[0] - o[0], p[1] - o[1], p[2] - o[2]], n!)) > tol)) return null;
  // A plane facing up if it can: horizontal floors then read with a +Z normal.
  if (n[2] < -1e-12 || (Math.abs(n[2]) <= 1e-12 && (n[1] < 0 || (n[1] === 0 && n[0] < 0)))) n = [-n[0], -n[1], -n[2]];
  const ref: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(ref, n)), v = cross(n, u);
  return { o, n, u, v };
}

/**
 * The bounded faces of a planar graph, each as its node cycle, counter-clockwise in (u, v).
 *
 * Each directed edge a→b is walked into the face on its left: at b, the next edge is the one
 * that turns most sharply left, which is the neighbour immediately clockwise of a around b.
 * Faces with positive area are the bounded ones; the single negative one is the outside.
 */
export function boundedFaces(adj: Map<number, number[]>, uv: Map<number, [number, number]>): number[][] {
  const angle = (from: number, to: number) => { const a = uv.get(from)!, b = uv.get(to)!; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  const sorted = new Map<number, number[]>();
  for (const [n, ns] of adj) sorted.set(n, [...ns].sort((p, q) => angle(n, p) - angle(n, q)));
  const seen = new Set<string>();
  const faces: number[][] = [];
  for (const [a0, ns] of sorted) for (const b0 of ns) {
    if (seen.has(`${a0}>${b0}`)) continue;
    const face: number[] = [];
    let a = a0, b = b0, guard = 0;
    while (!seen.has(`${a}>${b}`) && guard++ < 100000) {
      seen.add(`${a}>${b}`);
      face.push(a);
      const around = sorted.get(b)!;
      const k = around.indexOf(a);
      const next = around[(k - 1 + around.length) % around.length]!;
      a = b; b = next;
    }
    let area = 0;
    for (let i = 0; i < face.length; i++) {
      const p = uv.get(face[i]!)!, q = uv.get(face[(i + 1) % face.length]!)!;
      area += p[0] * q[1] - q[0] * p[1];
    }
    if (area > 1e-12 && face.length >= 3) faces.push(face);
  }
  return faces;
}

/** A CCW polygon turns left at every corner. A concave quad is a poor element: it is triangulated. */
function convex(poly: [number, number][]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, c = poly[(i + 2) % poly.length]!;
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 1e-12) return false;
  }
  return true;
}

/** Ear clipping of a simple CCW polygon, as index triples. */
function earClip(poly: [number, number][]): Array<[number, number, number]> {
  const idx = poly.map((_, i) => i);
  const out: Array<[number, number, number]> = [];
  const area2 = (a: number, b: number, c: number) =>
    (poly[b]![0] - poly[a]![0]) * (poly[c]![1] - poly[a]![1]) - (poly[c]![0] - poly[a]![0]) * (poly[b]![1] - poly[a]![1]);
  const inside = (p: number, a: number, b: number, c: number) =>
    area2(a, b, p) >= -1e-12 && area2(b, c, p) >= -1e-12 && area2(c, a, p) >= -1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k - 1 + idx.length) % idx.length]!, b = idx[k]!, c = idx[(k + 1) % idx.length]!;
      if (area2(a, b, c) <= 1e-12) continue;
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push([a, b, c]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0]!, idx[1]!, idx[2]!]);
  return out;
}

/**
 * Plates over every hole the members bound. When they are not in one plane, each horizontal level
 * of them is filled on its own — the floors of a storey or a building.
 *
 * A convex hole of four corners is meshed with quads —
 * one, or a grid at the requested density, through the same mesher as the shell tab; any other
 * becomes triangles. Faces overlapping an existing coplanar shell are left alone.
 */
export function fillHoles(
  elementIds: Iterable<number>, materialId: number, thickness: number,
  opts: { density?: MeshDensity; tol?: number } = {},
): FillReport | { refused: ConstructRefusal } {
  const tol = opts.tol ?? 1e-3;
  // One quad per hole unless a density is asked for; a density meshes it with the shell tab's
  // own mesher and cuts the bounding members at the new edge nodes.
  const density: MeshDensity = opts.density ?? { mode: 'fixedDivisions', nx: 1, ny: 1 };
  const elements = [...elementIds].map((id) => modelStore.elements.get(id)).filter((e) => !!e);
  const nodeIds = [...new Set(elements.flatMap((e) => [e!.nodeI, e!.nodeJ]))];
  if (nodeIds.length < 3) return { refused: 'noHoles' };
  const pts = nodeIds.map((id) => pv(modelStore.nodes.get(id)!));
  const plane = planeOf(pts, tol);
  if (!plane) {
    // Not one plane — a whole storey or building, columns included. The holes wanted are the
    // floors: the horizontal members, level by level.
    const levels = new Map<number, number[]>();
    for (const e of elements) {
      const a = modelStore.nodes.get(e!.nodeI)!, b = modelStore.nodes.get(e!.nodeJ)!;
      if (Math.abs((a.z ?? 0) - (b.z ?? 0)) > tol) continue;
      const k = Math.round((a.z ?? 0) / tol);
      (levels.get(k) ?? levels.set(k, []).get(k)!).push(e!.id);
    }
    const total: FillReport = { quads: [], plates: [], skippedExisting: 0 };
    let any = false;
    modelStore.batch(() => {
      for (const ids of levels.values()) {
        // A collinear horizontal selection cannot define a plane. Partitioning must
        // make progress instead of recursively retrying exactly the same members.
        if (ids.length === elements.length) continue;
        const r = fillHoles(ids, materialId, thickness, opts);
        if ('refused' in r) continue;
        any = true;
        total.quads.push(...r.quads); total.plates.push(...r.plates); total.skippedExisting += r.skippedExisting;
      }
    });
    return any ? total : { refused: levels.size === 0 ? 'notCoplanar' : 'noHoles' };
  }

  const uv = new Map<number, [number, number]>();
  nodeIds.forEach((id, k) => {
    const d: Vec3 = [pts[k]![0] - plane.o[0], pts[k]![1] - plane.o[1], pts[k]![2] - plane.o[2]];
    uv.set(id, [dot(d, plane.u), dot(d, plane.v)]);
  });
  const adj = new Map<number, number[]>();
  for (const e of elements) {
    (adj.get(e!.nodeI) ?? adj.set(e!.nodeI, []).get(e!.nodeI)!).push(e!.nodeJ);
    (adj.get(e!.nodeJ) ?? adj.set(e!.nodeJ, []).get(e!.nodeJ)!).push(e!.nodeI);
  }
  // Dangling members bound nothing; prune them so their faces do not degenerate.
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [n, ns] of adj) {
      if (ns.length > 1) continue;
      adj.delete(n);
      for (const m of ns) adj.set(m, adj.get(m)!.filter((x) => x !== n));
      pruned = true;
    }
  }
  const faces = boundedFaces(adj, uv);
  if (faces.length === 0) return { refused: 'noHoles' };

  // A face may already contain a mesh, not just one shell with the same corners.
  // Skip occupied faces (including partially occupied ones) rather than overlaying
  // stiffness and self-weight. Shells on other planes do not occupy this face.
  const occupied: Triangle2[] = [];
  for (const shell of [...modelStore.quads.values(), ...modelStore.plates.values()]) {
    const points = shell.nodes.map((id) => modelStore.nodes.get(id));
    if (points.some((p) => !p)) continue;
    const delta = points.map((p): Vec3 => [p!.x - plane.o[0], p!.y - plane.o[1], (p!.z ?? 0) - plane.o[2]]);
    if (delta.some((p) => Math.abs(dot(p, plane.n)) > tol)) continue;
    const projected = delta.map((p): [number, number] => [dot(p, plane.u), dot(p, plane.v)]);
    occupied.push([projected[0]!, projected[1]!, projected[2]!]);
    if (projected.length === 4) occupied.push([projected[0]!, projected[2]!, projected[3]!]);
  }
  const report: FillReport = { quads: [], plates: [], skippedExisting: 0 };
  modelStore.batch(() => {
    for (const f of faces) {
      const polygon = f.map((id) => uv.get(id)!);
      const tris = earClip(polygon);
      if (tris.some(([a, b, c]) => occupied.some((shell) => trianglesOverlap([polygon[a]!, polygon[b]!, polygon[c]!], shell)))) {
        report.skippedExisting++;
        continue;
      }
      if (f.length === 4 && convex(f.map((id) => uv.get(id)!))) {
        const m = meshQuadRegion(f as [number, number, number, number], { density, materialId, thickness, splitBeams: true });
        report.quads.push(...m.quads);
        continue;
      }
      for (const [a, b, c] of tris) report.plates.push(modelStore.addPlate([f[a]!, f[b]!, f[c]!], materialId, thickness));
    }
  });
  return report;
}
