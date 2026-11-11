/**
 * A grid of rectangles for a region whose sides all run along two directions of its plane: a
 * rectangle, an L, a notched outline, with rectangular holes. Its lines go through every corner,
 * every fixed point and along every fixed segment, and are filled between at no more than the
 * sides asked for, so each cell is a rectangle and the mesh meets the members and nodes on it.
 * Null for any region it cannot draw that way, which the general mesher then takes.
 */
import type { Vec3 } from './affine';
import type { MeshOutput } from './mesher';
import type { GridFrame } from './grid-mesh';

const TOL = 1e-6;
const MERGE = 1e-4;
type P2 = [number, number];

export interface RectGridInput {
  frame: GridFrame;
  outer: Vec3[];
  holes: Vec3[][];
  /** Largest cell sides along the frame's u and v. */
  a: number;
  b: number;
  element: 'quad' | 'tri';
  fixedPoints?: Vec3[];
  fixedSegments?: Array<[Vec3, Vec3]>;
  maxCells: number;
}

const to2 = (f: GridFrame, p: Vec3): P2 => { const d = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]]; return [d[0]! * f.u[0] + d[1]! * f.u[1] + d[2]! * f.u[2], d[0]! * f.v[0] + d[1]! * f.v[1] + d[2]! * f.v[2]]; };
const to3 = (f: GridFrame, q: P2): Vec3 => [f.o[0] + f.u[0] * q[0] + f.v[0] * q[1], f.o[1] + f.u[1] * q[0] + f.v[1] * q[1], f.o[2] + f.u[2] * q[0] + f.v[2] * q[1]];
const offPlane = (f: GridFrame, p: Vec3) => Math.abs((p[0] - f.o[0]) * f.n[0] + (p[1] - f.o[1]) * f.n[1] + (p[2] - f.o[2]) * f.n[2]);

const rectilinear = (l: P2[]) => l.length >= 4 && l.every((p, i) => { const q = l[(i + 1) % l.length]!; return Math.abs(p[0] - q[0]) < TOL || Math.abs(p[1] - q[1]) < TOL; });

function inside(q: P2, l: P2[]): boolean {
  let c = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
    const a = l[i]!, b = l[j]!;
    if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** The lines along one direction: the forced ones, and as many evenly between each pair as keep the gap at or under `size`. */
function stations(forced: number[], size: number): number[] {
  const s = [...forced].sort((x, y) => x - y).filter((x, i, all) => i === 0 || x - all[i - 1]! > MERGE);
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    out.push(s[i]!);
    if (i + 1 === s.length) break;
    const gap = s[i + 1]! - s[i]!, n = Math.max(1, Math.round(gap / size));
    for (let k = 1; k < n; k++) out.push(s[i]! + (gap * k) / n);
  }
  return out;
}

export function rectGrid(o: RectGridInput): MeshOutput | null {
  const f = o.frame;
  if ([...o.outer, ...o.holes.flat()].some((p) => offPlane(f, p) > 1e-4)) return null;
  const outer = o.outer.map((p) => to2(f, p)), holes = o.holes.map((h) => h.map((p) => to2(f, p)));
  if (!rectilinear(outer) || !holes.every(rectilinear)) return null;
  const us: number[] = [], vs: number[] = [];
  for (const q of [...outer, ...holes.flat()]) { us.push(q[0]); vs.push(q[1]); }
  const x0 = Math.min(...us), x1 = Math.max(...us), y0 = Math.min(...vs), y1 = Math.max(...vs);
  const within = (q: P2) => q[0] > x0 - TOL && q[0] < x1 + TOL && q[1] > y0 - TOL && q[1] < y1 + TOL;
  for (const p of o.fixedPoints ?? []) {
    if (offPlane(f, p) > 1e-4) continue;
    const q = to2(f, p);
    if (within(q)) { us.push(q[0]); vs.push(q[1]); }
  }
  for (const [p, r] of o.fixedSegments ?? []) {
    if (offPlane(f, p) > 1e-4 || offPlane(f, r) > 1e-4) continue;
    const a = to2(f, p), b = to2(f, r);
    if (Math.max(a[0], b[0]) < x0 - TOL || Math.min(a[0], b[0]) > x1 + TOL || Math.max(a[1], b[1]) < y0 - TOL || Math.min(a[1], b[1]) > y1 + TOL) continue;
    // A member across the plate at a slant cannot be met by a grid of rectangles.
    if (Math.abs(a[0] - b[0]) > TOL && Math.abs(a[1] - b[1]) > TOL) return null;
    for (const q of [a, b]) if (within(q)) { us.push(q[0]); vs.push(q[1]); }
    if (Math.abs(a[0] - b[0]) < TOL) us.push(a[0]); else vs.push(a[1]);
  }
  const xs = stations(us.filter((u) => u > x0 - TOL && u < x1 + TOL), o.a);
  const ys = stations(vs.filter((v) => v > y0 - TOL && v < y1 + TOL), o.b);
  if ((xs.length - 1) * (ys.length - 1) * (o.element === 'tri' ? 2 : 1) > o.maxCells) return null;

  const index = new Map<number, number>(), points: Vec3[] = [], boundary = new Set<number>();
  const onEdge = (q: P2) => [outer, ...holes].some((l) => l.some((p, i) => {
    const r = l[(i + 1) % l.length]!;
    return Math.abs((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) < 1e-9 * Math.max(1, Math.hypot(r[0] - p[0], r[1] - p[1]))
      && q[0] > Math.min(p[0], r[0]) - TOL && q[0] < Math.max(p[0], r[0]) + TOL && q[1] > Math.min(p[1], r[1]) - TOL && q[1] < Math.max(p[1], r[1]) + TOL;
  }));
  const at = (i: number, j: number) => {
    const k = j * xs.length + i;
    let n = index.get(k);
    if (n === undefined) {
      n = points.length; index.set(k, n);
      const q: P2 = [xs[i]!, ys[j]!];
      points.push(to3(f, q));
      if (onEdge(q)) boundary.add(n);
    }
    return n;
  };
  const cells: number[][] = [];
  for (let j = 0; j + 1 < ys.length; j++) for (let i = 0; i + 1 < xs.length; i++) {
    const c: P2 = [(xs[i]! + xs[i + 1]!) / 2, (ys[j]! + ys[j + 1]!) / 2];
    if (!inside(c, outer) || holes.some((h) => inside(c, h))) continue;
    const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
    if (o.element === 'quad') cells.push(q);
    else if ((i + j) % 2 === 0) cells.push([q[0]!, q[1]!, q[2]!], [q[0]!, q[2]!, q[3]!]);
    else cells.push([q[0]!, q[1]!, q[3]!], [q[1]!, q[2]!, q[3]!]);
  }
  if (!cells.length) return null;
  return { points, cells, structured: o.element === 'quad', boundary, plane: { o: f.o, u: f.u, v: f.v } };
}
