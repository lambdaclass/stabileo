/**
 * A plate as a physical object: an outline with holes, a material and a thickness, and the mesh it
 * is analysed with, which is made from it and can be made again.
 *
 * ── Where it lives ────────────────────────────────────────────────
 *
 * A physical element (`types.ts`) whose data carries `surface`. The group's nodes hold, in order,
 * the outline, then each hole, then the nodes the current mesh created (`loops` gives the length
 * of each loop; what follows them is the mesh's own). Kept in the members, the outline follows its
 * nodes when they move and is remapped when the plate is copied, as a load zone's is. The group's
 * shells are the mesh. A plate that has not been meshed holds no shell: it is drawn and selected
 * from its outline, and the analysis asks for its mesh first (`store/physical-plates.ts`).
 *
 * ── What makes a mesh current ─────────────────────────────────────
 *
 * The signature of what the mesh was made from: the outline and holes, the mesh settings and,
 * when the mesh follows the members, the members it had to meet (`externalSegments`). A mesh
 * whose signature differs from the plate's now is out of date and says so; nothing meshes it
 * again behind the reader's back while they model.
 *
 * Pure: the model in, geometry and decisions out.
 */
import { cross, dot, norm, unit, type Vec3 } from '../edit/affine';
import type { MeshInput, MeshOutput } from '../edit/mesher';

export interface PlateMeshSpec {
  /** Target element size, m. */
  size: number;
  element: 'quad' | 'tri';
  /**
   * Meet the members: the nodes on the plate and the members in its plane become mesh points and
   * edges, members crossing it are met where they cross, and every member is cut at the mesh
   * nodes it passes through, so plate and members share them.
   */
  followMembers: boolean;
  /**
   * The cells' shape, quadrilaterals only: free (the mesher's), or a grid of rectangles of sides
   * `size` along the grid's u and `sizeV` along its v, or of squares of side `size`
   * (`edit/grid-mesh.ts`). Absent: free.
   */
  pattern?: 'free' | 'rect' | 'square';
  /** The rectangles' side along v, m (pattern 'rect'). */
  sizeV?: number;
  /** The grid's u: the plate's first side, or global X laid in its plane. Absent: the first side. */
  orient?: 'plate' | 'globalX';
}

/** The grid a spec asks for, when it asks for one: the cells' sides and the axis they follow. */
export function gridOfSpec(spec: PlateMeshSpec): { a: number; b: number; orient: 'plate' | 'globalX' } | null {
  if (spec.element !== 'quad' || !spec.pattern || spec.pattern === 'free') return null;
  const a = spec.size, b = spec.pattern === 'square' ? spec.size : (spec.sizeV ?? spec.size);
  return a > 0 && b > 0 ? { a, b, orient: spec.orient ?? 'plate' } : null;
}

export interface PlateSurface {
  /** Lengths of the loops held in the group's nodes: the outline first, then each hole. */
  loops: number[];
  materialId: number;
  thickness: number;
  mesh: PlateMeshSpec;
  /**
   * Curved sides: indices, in the group's nodes, of nodes the outline or a hole passes through on
   * an arc. Node k marked joins its neighbours in the loop by the arc through the three of them,
   * so the plate keeps its curved side whatever its mesh does with it (`arcSampler`).
   */
  arcMids?: number[];
  /** Set when the current mesh was made: what it was made from, and what it is. */
  meshed?: { signature: string; cells: number; quality: MeshQuality };
}

export interface MeshQuality {
  /** Smallest interior angle of any cell, degrees. */
  minAngle: number;
  /** Largest ratio of a cell's longest edge to its shortest. */
  maxAspect: number;
  /** Cells past the limits below. */
  poor: number;
}

/** A cell is poor below this angle or past this aspect: past them the element's answer degrades. */
export const POOR_MIN_ANGLE = 15;
export const POOR_MAX_ASPECT = 6;
/** How far a point may be from the plate's plane and still lie on it, m. */
export const PLANE_TOL = 1e-3;
export const DEFAULT_PLATE_MESH: PlateMeshSpec = { size: 0.5, element: 'quad', followMembers: true };

type Pt = { x: number; y: number; z?: number };
type GroupLike = { id: number; members: { nodes?: number[]; elements?: number[]; quads?: number[]; plates?: number[] }; data?: Record<string, unknown> };
export interface PlateModel {
  nodes: ReadonlyMap<number, Pt>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number }>;
}

const v3 = (p: Pt): Vec3 => [p.x, p.y, p.z ?? 0];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** The surface a group carries, or null when it is not a physical plate. */
export function plateSurfaceOf(g: { data?: Record<string, unknown> } | undefined): PlateSurface | null {
  const s = (g?.data as { surface?: PlateSurface } | undefined)?.surface;
  return s && Array.isArray(s.loops) && s.loops.length > 0 ? s : null;
}

/** The node ids of a plate's outline, its holes, and the nodes its mesh created. */
export function plateLoops(g: GroupLike): { outer: number[]; holes: number[][]; owned: number[] } {
  const s = plateSurfaceOf(g);
  const all = g.members.nodes ?? [];
  if (!s) return { outer: [], holes: [], owned: [] };
  let at = 0;
  const loops = s.loops.map((n) => { const l = all.slice(at, at + n); at += n; return l; });
  return { outer: loops[0] ?? [], holes: loops.slice(1), owned: all.slice(at) };
}

export interface PlateFrame { o: Vec3; u: Vec3; v: Vec3; n: Vec3 }

/** Newell's normal and an in-plane frame for a loop of points; null when it encloses no area. */
export function frameOfLoop(p: readonly Vec3[]): PlateFrame | null {
  if (p.length < 3) return null;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!;
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-12) return null;
  const n: Vec3 = [nx / l, ny / l, nz / l];
  const e = sub(p[1]!, p[0]!);
  const u = norm(e) > 1e-12 ? unit(sub(e, [n[0] * dot(e, n), n[1] * dot(e, n), n[2] * dot(e, n)])) : unit(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n));
  return { o: p[0]!, u, v: cross(n, u), n };
}

function collinear(p: readonly Vec3[]): boolean {
  const a = p[0]!;
  for (let i = 1; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (norm(cross(sub(p[i]!, a), sub(p[j]!, a))) > 1e-9) return false;
  return true;
}

const to2 = (f: PlateFrame, p: Vec3): [number, number] => { const d = sub(p, f.o); return [dot(d, f.u), dot(d, f.v)]; };
const offPlane = (f: PlateFrame, p: Vec3) => Math.abs(dot(sub(p, f.o), f.n));

export interface PlateGeometry { outer: Vec3[]; holes: Vec3[][]; frame: PlateFrame }

/**
 * The points strictly between a and b on a curved side through `mid`, in order. The default draws
 * the arc in steps of 5°; the mesh asks for its own (`store/physical-plates.ts`).
 */
export type ArcSampler = (a: { id: number; p: Vec3 }, mid: { id: number; p: Vec3 }, b: { id: number; p: Vec3 }) => Vec3[];

/** The circle through three points: centre, normal and the angle a→b the way through mid. Null in line. */
export function circleThrough(a: Vec3, m: Vec3, b: Vec3): { c: Vec3; n: Vec3; r: number; sweep: number } | null {
  const u = sub(m, a), v = sub(b, a), n = cross(u, v);
  const n2 = dot(n, n);
  if (n2 < 1e-18) return null;
  const k1 = dot(u, u), k2 = dot(v, v);
  const t1 = cross(v, n), t2 = cross(n, u);
  const c: Vec3 = [a[0] + (k1 * t1[0] + k2 * t2[0]) / (2 * n2), a[1] + (k1 * t1[1] + k2 * t2[1]) / (2 * n2), a[2] + (k1 * t1[2] + k2 * t2[2]) / (2 * n2)];
  const nn = unit(n);
  const ang = (p: Vec3, q: Vec3) => { const x = sub(p, c), y = sub(q, c); const t = Math.atan2(dot(cross(x, y), nn), dot(x, y)); return t < 0 ? t + 2 * Math.PI : t; };
  return { c, n: nn, r: norm(sub(a, c)), sweep: ang(a, m) + ang(m, b) };
}

/** `count` − 1 points strictly inside the arc a→b through m, evenly spaced along it. */
export function arcInterior(a: Vec3, m: Vec3, b: Vec3, count: number): Vec3[] {
  const ci = circleThrough(a, m, b);
  if (!ci) return [];
  const r0 = sub(a, ci.c);
  const out: Vec3[] = [];
  for (let k = 1; k < count; k++) {
    const t = (ci.sweep * k) / count, ct = Math.cos(t), st = Math.sin(t);
    const kx = cross(ci.n, r0), kd = dot(ci.n, r0);
    out.push([0, 1, 2].map((i) => ci.c[i]! + r0[i]! * ct + kx[i]! * st + ci.n[i]! * kd * (1 - ct)) as Vec3);
  }
  return out;
}

const fineSampler: ArcSampler = (a, mid, b) => {
  const ci = circleThrough(a.p, mid.p, b.p);
  return ci ? arcInterior(a.p, mid.p, b.p, Math.max(2, Math.ceil(ci.sweep / ((5 * Math.PI) / 180)))) : [];
};

/**
 * A plate's outline and holes as points, with its plane; null when a node is gone or it has no
 * area. A curved side is drawn by `sampler` (5° steps unless asked otherwise).
 */
export function plateGeometry(m: PlateModel, g: GroupLike, sampler: ArcSampler = fineSampler): PlateGeometry | null {
  const s = plateSurfaceOf(g);
  const { outer, holes } = plateLoops(g);
  const mids = new Set(s?.arcMids ?? []);
  let base = 0;
  const loop = (ids: number[]): Vec3[] | null => {
    const at = base; base += ids.length;
    const out: Vec3[] = [];
    for (let k = 0; k < ids.length; k++) {
      const n = m.nodes.get(ids[k]!);
      if (!n) return null;
      if (!mids.has(at + k)) { out.push(v3(n)); continue; }
      // A curved side: its neighbours in the loop and the arc between them through this node.
      const ia = ids[(k + ids.length - 1) % ids.length]!, ib = ids[(k + 1) % ids.length]!;
      const na = m.nodes.get(ia), nb = m.nodes.get(ib);
      if (!na || !nb) return null;
      const pts = sampler({ id: ia, p: v3(na) }, { id: ids[k]!, p: v3(n) }, { id: ib, p: v3(nb) });
      out.push(...(pts.length ? pts : [v3(n)]));
    }
    return out;
  };
  const o = loop(outer);
  if (!o) return null;
  const frame = frameOfLoop(o);
  if (!frame) return null;
  const hs: Vec3[][] = [];
  for (const h of holes) { const p = loop(h); if (!p) return null; hs.push(p); }
  return { outer: o, holes: hs, frame };
}

function area2(p: ReadonlyArray<[number, number]>): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i]!, b = p[(i + 1) % p.length]!; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

function inPoly(q: [number, number], poly: ReadonlyArray<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function selfCrossing(p: ReadonlyArray<[number, number]>): boolean {
  const n = p.length;
  const o = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    const a = p[i]!, b = p[(i + 1) % n]!, c = p[j]!, d = p[(j + 1) % n]!;
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    if (o1 * o2 < -1e-18 && o3 * o4 < -1e-18) return true;
  }
  return false;
}

export type PlateProblem = 'needNodes' | 'repeatedNode' | 'noArea' | 'notPlanar' | 'selfIntersecting' | 'holeOutside' | 'holesOverlap';

/**
 * Why these loops make no plate, or null when they make one: at least three distinct nodes, one
 * plane, an outline that does not cross itself, holes inside it and apart from each other.
 */
export function plateProblem(m: PlateModel, outer: readonly number[], holes: readonly (readonly number[])[] = [], arcMids: readonly number[] = []): PlateProblem | null {
  if (outer.length < 3) return 'needNodes';
  const ids = [outer, ...holes].flat();
  if (new Set(ids).size !== ids.length) return 'repeatedNode';
  if (ids.some((id) => !m.nodes.has(id)) || holes.some((h) => h.length < 3)) return 'needNodes';
  // An arc needs a neighbour on each side that is not itself an arc's point.
  const mids = new Set(arcMids);
  let at = 0;
  for (const l of [outer, ...holes]) {
    for (let k = 0; k < l.length; k++) if (mids.has(at + k) && (mids.has(at + ((k + 1) % l.length)) || mids.has(at + ((k + l.length - 1) % l.length)))) return 'selfIntersecting';
    at += l.length;
  }
  const temp = { id: 0, members: { nodes: ids }, data: { surface: { loops: [outer.length, ...holes.map((h) => h.length)], arcMids: [...arcMids] } as unknown as PlateSurface } };
  const raw = ids.map((id) => v3(m.nodes.get(id)!));
  const geo = plateGeometry(m, temp);
  if (!geo) return collinear(raw.slice(0, outer.length)) ? 'noArea' : 'selfIntersecting';
  const frame = geo.frame;
  if ([...raw, ...geo.outer, ...geo.holes.flat()].some((p) => offPlane(frame, p) > PLANE_TOL)) return 'notPlanar';
  const o2 = geo.outer.map((p) => to2(frame, p));
  if (Math.abs(area2(o2)) < 1e-9) return 'noArea';
  if (selfCrossing(o2)) return 'selfIntersecting';
  const h2 = geo.holes.map((h) => h.map((p) => to2(frame, p)));
  for (const h of h2) {
    if (Math.abs(area2(h)) < 1e-9 || selfCrossing(h)) return 'selfIntersecting';
    if (!h.every((q) => inPoly(q, o2))) return 'holeOutside';
  }
  for (let a = 0; a < h2.length; a++) for (let b = a + 1; b < h2.length; b++) {
    if (h2[a]!.some((q) => inPoly(q, h2[b]!)) || h2[b]!.some((q) => inPoly(q, h2[a]!))) return 'holesOverlap';
  }
  return null;
}

/** A plate's area less its holes', m². */
export function plateArea(geo: PlateGeometry): number {
  const a = (l: Vec3[]) => Math.abs(area2(l.map((p) => to2(geo.frame, p))));
  return a(geo.outer) - geo.holes.reduce((s, h) => s + a(h), 0);
}

/** Whether a point of the plate's plane is inside its outline and outside its holes. */
export function insidePlate(geo: PlateGeometry, p: Vec3): boolean {
  const q = to2(geo.frame, p);
  return inPoly(q, geo.outer.map((x) => to2(geo.frame, x))) && !geo.holes.some((h) => inPoly(q, h.map((x) => to2(geo.frame, x))));
}

/** A horizontal plate is a slab; one standing up is a wall. */
export function plateKindOf(geo: PlateGeometry): 'slab' | 'wall' {
  return Math.abs(geo.frame.n[2]) >= Math.cos((30 * Math.PI) / 180) ? 'slab' : 'wall';
}

/**
 * The members the mesh has to meet, as their whole extents: a member the current mesh cut is put
 * back together through the nodes the mesh created, so the answer does not change once a mesh is
 * in. Members in the plate's plane come back as segments the mesh follows; members crossing the
 * plane inside the plate come back as the point where they cross; nodes of other things on the
 * plate as points. `owned` are the nodes the plate's own mesh created, which do not count.
 */
export function externalFeatures(m: PlateModel, geo: PlateGeometry, owned: ReadonlySet<number>, loopNodes: ReadonlySet<number>, opts: { mine?: ReadonlySet<number>; neighbours?: ReadonlySet<number> } = {}): { points: Vec3[]; segments: Array<[Vec3, Vec3]> } {
  // Members by node, to walk through the mesh's own nodes.
  const at = new Map<number, number[]>();
  for (const e of m.elements.values()) {
    if (!m.nodes.has(e.nodeI) || !m.nodes.has(e.nodeJ)) continue;
    (at.get(e.nodeI) ?? at.set(e.nodeI, []).get(e.nodeI)!).push(e.id);
    (at.get(e.nodeJ) ?? at.set(e.nodeJ, []).get(e.nodeJ)!).push(e.id);
  }
  const pos = (id: number) => v3(m.nodes.get(id)!);
  const other = (eid: number, n: number) => { const e = m.elements.get(eid)!; return e.nodeI === n ? e.nodeJ : e.nodeI; };
  const seen = new Set<number>();
  const chains: Array<[number, number]> = [];
  for (const e of m.elements.values()) {
    if (seen.has(e.id) || !m.nodes.has(e.nodeI) || !m.nodes.has(e.nodeJ)) continue;
    seen.add(e.id);
    // From each end, continue through owned nodes along the piece that keeps the direction.
    const walk = (from: number, to: number): number => {
      let prev = from, cur = to;
      for (let guard = 0; owned.has(cur) && guard < 100000; guard++) {
        const d = unit(sub(pos(cur), pos(prev)));
        const next = (at.get(cur) ?? []).find((id) => !seen.has(id) && dot(unit(sub(pos(other(id, cur)), pos(cur))), d) > 1 - 1e-6);
        if (next === undefined) break;
        seen.add(next);
        prev = cur; cur = other(next, cur);
      }
      return cur;
    };
    const a = walk(e.nodeJ, e.nodeI), b = walk(e.nodeI, e.nodeJ);
    chains.push(a < b ? [a, b] : [b, a]);
  }
  const points: Vec3[] = [];
  const segments: Array<[Vec3, Vec3]> = [];
  const inPlane = (p: Vec3) => offPlane(geo.frame, p) <= PLANE_TOL;
  const external = new Set<number>();
  for (const [a, b] of chains) {
    const pa = pos(a), pb = pos(b);
    const ia = inPlane(pa), ib = inPlane(pb);
    if (ia && ib) {
      if (insidePlate(geo, pa) || insidePlate(geo, pb) || insidePlate(geo, [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2])) segments.push([pa, pb]);
      external.add(a); external.add(b);
      continue;
    }
    if (ia) { external.add(a); continue; }
    if (ib) { external.add(b); continue; }
    // Crossing the plane between its ends: met where it crosses, when that is on the plate.
    const da = dot(sub(pa, geo.frame.o), geo.frame.n), db = dot(sub(pb, geo.frame.o), geo.frame.n);
    if (da * db >= 0) continue;
    const t = da / (da - db);
    const x: Vec3 = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t];
    if (insidePlate(geo, x)) points.push(x);
  }
  for (const id of external) {
    if (owned.has(id) || loopNodes.has(id)) continue;
    const p = pos(id);
    if (inPlane(p) && insidePlate(geo, p)) points.push(p);
  }
  // The mesh of a plate beside this one: its nodes on this plate's outline are where this mesh
  // meets it, so the two share them (`opts.mine`, this plate's own mesh nodes, do not count).
  for (const id of opts.neighbours ?? []) {
    if (opts.mine?.has(id) || loopNodes.has(id) || external.has(id)) continue;
    const n = m.nodes.get(id);
    if (!n) continue;
    const p = v3(n);
    if (inPlane(p) && onOutline(geo, p)) points.push(p);
  }
  return { points, segments };
}

/** Whether a point of the plate's plane lies on its outline or a hole's edge (within the plane tolerance). */
export function onOutline(geo: PlateGeometry, p: Vec3): boolean {
  for (const loop of [geo.outer, ...geo.holes]) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!, b = loop[(i + 1) % loop.length]!;
      const ab = sub(b, a), L2 = dot(ab, ab);
      if (L2 < 1e-18) continue;
      const t = dot(sub(p, a), ab) / L2;
      if (t < 1e-9 || t > 1 - 1e-9) continue;
      const q: Vec3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
      if (norm(sub(p, q)) <= PLANE_TOL) return true;
    }
  }
  return false;
}

const r6 = (v: number) => (Math.round(v * 1e6) / 1e6).toString();

/**
 * What a mesh is made from, as one string: equal strings, the same mesh. Written in the plate's own
 * axes, so a plate moved or turned whole with what it meets (a copy) keeps a current mesh.
 */
export function plateSignature(geo: PlateGeometry, spec: PlateMeshSpec, features: { points: Vec3[]; segments: Array<[Vec3, Vec3]> } | null): string {
  const f = geo.frame;
  const key3 = (p: Vec3) => { const d = sub(p, f.o); return `${r6(dot(d, f.u))},${r6(dot(d, f.v))},${r6(dot(d, f.n))}`; };
  const loops = [geo.outer, ...geo.holes].map((l) => l.map(key3).join(';')).join('|');
  const ft = features && spec.followMembers
    ? `${features.points.map(key3).sort().join(';')}#${features.segments.map(([a, b]) => [key3(a), key3(b)].sort().join('>')).sort().join(';')}`
    : '';
  // A grid adds its shape to the string; a free mesh's string is what it always was.
  const grid = gridOfSpec(spec);
  const g = grid ? `/grid:${r6(grid.a)}x${r6(grid.b)}:${grid.orient}` : '';
  return `${loops}@${r6(spec.size)}/${spec.element}/${spec.followMembers ? 1 : 0}${g}@${ft}`;
}

/** The mesher's input for a plate. */
export function plateMeshInput(geo: PlateGeometry, spec: PlateMeshSpec, features: { points: Vec3[]; segments: Array<[Vec3, Vec3]> } | null): MeshInput {
  // A side a neighbour's mesh already meets takes that mesh's spacing: as many divisions as the
  // neighbour's points on it make, so the two meshes meet node to node whatever their sizes. The
  // other sides keep the element size.
  const met = geo.outer.map((a, i) => {
    const b = geo.outer[(i + 1) % geo.outer.length]!;
    const ab = sub(b, a), L2 = dot(ab, ab);
    const count = (features?.points ?? []).filter((p) => {
      const t = dot(sub(p, a), ab) / L2;
      if (t <= 1e-9 || t >= 1 - 1e-9) return false;
      return norm(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t])) <= PLANE_TOL;
    }).length;
    return { count, length: Math.sqrt(L2) };
  });
  let sides = met.some((x) => x.count > 0) ? met.map((x) => ({ divisions: x.count > 0 ? x.count + 1 : Math.max(1, Math.round(x.length / spec.size)) })) : undefined;
  // Four sides: the side opposite a met one takes its divisions, so the mesh stays a grid (the
  // mesher's structured path needs opposite sides equal) and no midpoint lands on the met side.
  if (sides && sides.length === 4 && geo.holes.length === 0) {
    for (const [i, j] of [[0, 2], [1, 3]] as const) {
      const mi = met[i]!.count > 0, mj = met[j]!.count > 0;
      if (mi && !mj) sides[j] = { ...sides[i]! };
      else if (mj && !mi) sides[i] = { ...sides[j]! };
    }
  }
  return {
    outer: { kind: 'polygon', points: geo.outer },
    ...(sides ? { sides } : {}),
    holes: geo.holes.map((h) => ({ kind: 'polygon' as const, points: h })),
    size: spec.size,
    element: spec.element,
    // The outline's own nodes are on it already; others the mesh meets only when asked.
    fixedPoints: spec.followMembers && features ? features.points : [],
    fixedSegments: spec.followMembers && features ? features.segments : [],
  };
}

/** How good a mesh's cells are, by the two numbers that degrade a shell's answer first. */
export function meshQuality(mesh: Pick<MeshOutput, 'points' | 'cells'>): MeshQuality {
  let minAngle = 180, maxAspect = 1, poor = 0;
  for (const c of mesh.cells) {
    const p = c.map((i) => mesh.points[i]!);
    let cellMin = 180, lo = Infinity, hi = 0;
    for (let k = 0; k < p.length; k++) {
      const a = p[(k + p.length - 1) % p.length]!, b = p[k]!, d = p[(k + 1) % p.length]!;
      const e1 = sub(a, b), e2 = sub(d, b);
      const l1 = norm(e1), l2 = norm(e2);
      if (l1 < 1e-12 || l2 < 1e-12) { cellMin = 0; continue; }
      cellMin = Math.min(cellMin, (Math.acos(Math.max(-1, Math.min(1, dot(e1, e2) / (l1 * l2)))) * 180) / Math.PI);
      lo = Math.min(lo, l2); hi = Math.max(hi, l2);
    }
    const aspect = lo > 0 ? hi / lo : Infinity;
    minAngle = Math.min(minAngle, cellMin);
    maxAspect = Math.max(maxAspect, aspect);
    if (cellMin < POOR_MIN_ANGLE || aspect > POOR_MAX_ASPECT) poor++;
  }
  return { minAngle: mesh.cells.length ? minAngle : 0, maxAspect: mesh.cells.length ? maxAspect : 0, poor };
}
