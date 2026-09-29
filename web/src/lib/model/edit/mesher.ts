/**
 * The shell mesher: a planar region with holes, as quadrilaterals or triangles.
 *
 * ── The region ────────────────────────────────────────────────────
 *
 * The outline is a polygon through model nodes or a circle; holes are polygons or circles in
 * the same plane. Each side of the outline takes its own divisions and bias (the ratio of its
 * last segment to its first), or follows the target element size. Model nodes that already lie
 * on the outline or on a hole's edge become mesh points, so a wall and a slab meshed against
 * each other share their nodes instead of meeting with slivers.
 *
 * ── How it meshes ─────────────────────────────────────────────────
 *
 *   · Four sides, no holes, opposite sides with equal divisions: a structured grid by
 *     transfinite interpolation between the four (graded) sides. A rectangle comes out as the
 *     familiar grid; a skewed or biased one follows its sides.
 *   · A circle with no holes, in quadrilaterals: an O-grid, a central square and four patches out
 *     to the arc. Splitting triangles would give quadrilaterals poor enough to stay 13–18 % off a
 *     clamped plate's closed form at practical sizes; the O-grid is within 5 %.
 *   · Anything else: a conforming Delaunay triangulation of the discretised outline and holes
 *     and a lattice of interior points at the target size, boundary segments recovered by
 *     splitting, triangles outside the region dropped, interior points smoothed. Quadrilaterals
 *     are made by splitting every triangle into three at its centroid and edge midpoints, which
 *     keeps the mesh conforming everywhere.
 *
 * Pure: the geometry only. `applyMesh` puts it in the model.
 */
import { cross, dot, norm, unit, type Vec3 } from './affine';

type P2 = [number, number];

export type Loop2 = { kind: 'polygon'; points: Vec3[] } | { kind: 'circle'; center: Vec3; radius: number };

export interface SideSpec { divisions?: number; bias?: number }

export interface MeshInput {
  outer: Loop2;
  holes: Loop2[];
  /** Target element size, m. */
  size: number;
  /** Per side of a polygon outline, in order. */
  sides?: SideSpec[];
  element: 'quad' | 'tri';
  /** Model points that must be mesh points if they lie on a boundary. */
  fixedPoints?: Vec3[];
  /** Normal of a circle outline's plane; default +Z. */
  normal?: Vec3;
}

export interface MeshOutput {
  points: Vec3[];
  cells: number[][];
  structured: boolean;
  /** Indices of points on the outline or a hole edge. */
  boundary: Set<number>;
  /** The region's plane, for drawing the mesh flat. */
  plane: { o: Vec3; u: Vec3; v: Vec3 };
}

const EPS = 1e-9;
export const MAX_MESH_CELLS = 20000;
export const MAX_MESH_POINTS = 40000;
// Bowyer–Watson scans the current triangles for each point. Bound its work separately
// from the linear-time structured paths and from the final triangle-to-quad expansion.
const MAX_TRIANGULATION_POINTS = 4000;
const MAX_BOUNDARY_WORK = 2_000_000;

// ─── The plane ────────────────────────────────────────────────────

interface Frame { o: Vec3; u: Vec3; v: Vec3; n: Vec3 }

function frameOf(input: MeshInput): Frame | null {
  if (input.outer.kind === 'circle') {
    const n = unit(input.normal ?? [0, 0, 1]);
    const ref: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = unit(cross(ref, n));
    return { o: input.outer.center, u, v: cross(n, u), n };
  }
  const p = input.outer.points;
  if (p.length < 3) return null;
  // Newell's normal: robust for any simple polygon.
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!;
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < EPS) return null;
  const n: Vec3 = [nx / len, ny / len, nz / len];
  const e0: Vec3 = [p[1]![0] - p[0]![0], p[1]![1] - p[0]![1], p[1]![2] - p[0]![2]];
  const u = unit(e0);
  return { o: p[0]!, u, v: cross(n, u), n };
}

const to2 = (f: Frame, p: Vec3): P2 => { const d: Vec3 = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]]; return [dot(d, f.u), dot(d, f.v)]; };
const to3 = (f: Frame, q: P2): Vec3 => [f.o[0] + q[0] * f.u[0] + q[1] * f.v[0], f.o[1] + q[0] * f.u[1] + q[1] * f.v[1], f.o[2] + q[0] * f.u[2] + q[1] * f.v[2]];
const outOfPlane = (f: Frame, p: Vec3) => Math.abs(dot([p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]], f.n));

// ─── Boundary discretisation ──────────────────────────────────────

/** Parameters of `n` graded segments over [0, 1], first to last in ratio `bias`. */
export function gradedStations(n: number, bias = 1): number[] {
  const out = [0];
  if (n <= 1 || Math.abs(bias - 1) < 1e-9) { for (let k = 1; k <= n; k++) out.push(k / n); return out; }
  const q = Math.pow(bias, 1 / (n - 1));
  const l1 = (1 - q) / (1 - Math.pow(q, n));
  let s = 0;
  for (let k = 0; k < n; k++) { s += l1 * Math.pow(q, k); out.push(k === n - 1 ? 1 : s); }
  return out;
}

function sidePoints(a: P2, b: P2, n: number, bias: number, fixed: P2[], h: number): P2[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ts = gradedStations(n, bias).slice(0, -1);
  const locked = new Set<number>([0]);
  // Fixed points on the side replace the nearest station, or are added.
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  for (const p of fixed) {
    const t = ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / L;
    const off = Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux);
    if (off > 1e-4 || t <= 1e-6 || t >= 1 - 1e-6) continue;
    const same = ts.findIndex((s) => Math.abs(s - t) * L < 1e-8);
    if (same >= 0) { locked.add(same); continue; }
    let best = -1, bd = Infinity;
    ts.forEach((s, i) => { if (!locked.has(i) && Math.abs(s - t) < bd) { bd = Math.abs(s - t); best = i; } });
    if (best > 0 && bd * L < 0.35 * Math.min(h, L / Math.max(n, 1))) { ts[best] = t; locked.add(best); }
    else { locked.add(ts.length); ts.push(t); }
  }
  ts.sort((x, y) => x - y);
  return ts.map((t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as P2);
}

function loopPoints(f: Frame, loop: Loop2, h: number, sides: SideSpec[] | undefined, fixed: P2[]): { pts: P2[]; perSide: P2[][] } | null {
  if (loop.kind === 'circle') {
    const c = to2(f, loop.center);
    const n = Math.max(8, Math.round((2 * Math.PI * loop.radius) / h));
    if (!Number.isFinite(n) || n > MAX_MESH_POINTS) return null;
    const angles = Array.from({ length: n }, (_, k) => (2 * Math.PI * k) / n);
    for (const p of fixed) {
      if (Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - loop.radius) > 1e-4) continue;
      angles.push((Math.atan2(p[1] - c[1], p[0] - c[0]) + 2 * Math.PI) % (2 * Math.PI));
    }
    angles.sort((a, b) => a - b);
    const unique = angles.filter((a, i) => i === 0 || (a - angles[i - 1]!) * loop.radius > 1e-8);
    if (unique.length > 1 && (2 * Math.PI + unique[0]! - unique.at(-1)!) * loop.radius < 1e-8) unique.pop();
    if (unique.length > MAX_MESH_POINTS) return null;
    const pts: P2[] = unique.map((a) => [c[0] + loop.radius * Math.cos(a), c[1] + loop.radius * Math.sin(a)]);
    return { pts, perSide: [] };
  }
  const corners = loop.points.map((p) => to2(f, p));
  const perSide: P2[][] = [];
  let total = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const s = sides?.[i];
    const n = Math.max(1, s?.divisions ?? Math.round(L / h));
    if (!Number.isSafeInteger(n) || n > MAX_MESH_POINTS || L < EPS) return null;
    if (!Number.isFinite(s?.bias ?? 1) || (s?.bias ?? 1) <= 0) return null;
    const side = sidePoints(a, b, n, s?.bias ?? 1, fixed, h);
    total += side.length;
    if (total > MAX_MESH_POINTS || side.some((p) => !p.every(Number.isFinite))) return null;
    perSide.push(side);
  }
  return { pts: perSide.flat(), perSide };
}

// ─── Geometry helpers ─────────────────────────────────────────────

function signedArea(p: P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]!; a += p[i]![0] * q[1] - q[0] * p[i]![1]; }
  return a / 2;
}

function convex(p: P2[]): boolean {
  return p.every((a, i) => {
    const b = p[(i + 1) % p.length]!, c = p[(i + 2) % p.length]!;
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > EPS;
  });
}

function inPoly(p: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function segDist(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// ─── Delaunay (Bowyer–Watson) ─────────────────────────────────────

function delaunay(pts: P2[]): Array<[number, number, number]> {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const d = Math.max(maxX - minX, maxY - minY) * 20 + 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const all: P2[] = [...pts, [cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]];
  const n = pts.length;
  type T = { a: number; b: number; c: number; x: number; y: number; r2: number };
  const circ = (a: number, b: number, c: number): T => {
    const [ax, ay] = all[a]!, [bx, by] = all[b]!, [qx, qy] = all[c]!;
    const D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / D;
    return { a, b, c, x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris: T[] = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = all[i]!;
    const bad: T[] = [], keep: T[] = [];
    for (const t of tris) ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r2 * (1 + 1e-12) ? bad : keep).push(t);
    const edges = new Map<string, [number, number]>();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as const) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      if (edges.has(k)) edges.delete(k); else edges.set(k, [u, v]);
    }
    for (const [u, v] of edges.values()) keep.push(circ(u, v, i));
    tris = keep;
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => {
    const area = (all[t.b]![0] - all[t.a]![0]) * (all[t.c]![1] - all[t.a]![1]) - (all[t.c]![0] - all[t.a]![0]) * (all[t.b]![1] - all[t.a]![1]);
    return area >= 0 ? [t.a, t.b, t.c] as [number, number, number] : [t.a, t.c, t.b] as [number, number, number];
  });
}

// ─── The mesher ───────────────────────────────────────────────────

export function generateMesh(input: MeshInput): MeshOutput | null {
  if (!Number.isFinite(input.size) || input.size <= 0) return null;
  const loops3 = [input.outer, ...input.holes];
  if (loops3.some((l) => l.kind === 'circle'
    ? !Number.isFinite(l.radius) || l.radius <= 0 || !l.center.every(Number.isFinite)
    : l.points.length < 3 || l.points.length > MAX_MESH_POINTS || l.points.some((p) => !p.every(Number.isFinite)))) return null;
  const f = frameOf(input);
  if (!f || ![...f.o, ...f.u, ...f.v, ...f.n].every(Number.isFinite) || norm(f.n) < EPS) return null;
  const h = Math.max(input.size, 1e-3);
  if (input.outer.kind === 'polygon' && input.outer.points.some((p) => outOfPlane(f, p) > 1e-3)) return null;
  const fixed2 = (input.fixedPoints ?? []).filter((p) => outOfPlane(f, p) < 1e-4).map((p) => to2(f, p));

  const outer = loopPoints(f, input.outer, h, input.sides, fixed2);
  if (!outer) return null;
  if (signedArea(outer.pts) < 0) outer.pts.reverse();
  const holes: P2[][] = [];
  for (const l of input.holes) {
    const loop = loopPoints(f, l, h, undefined, fixed2);
    if (!loop) return null;
    holes.push(loop.pts);
  }

  // ── Structured: four sides, no holes, opposite sides matching ──
  if (input.outer.kind === 'polygon' && input.outer.points.length === 4 && holes.length === 0 && convex(input.outer.points.map((p) => to2(f, p)))) {
    const s = outer.perSide.map((pts, i) => [...pts, outer.perSide[(i + 1) % 4]![0]!]);
    if (s[0]!.length === s[2]!.length && s[1]!.length === s[3]!.length) {
      const nu = s[0]!.length - 1, nv = s[1]!.length - 1;
      if (nu * nv * (input.element === 'tri' ? 2 : 1) > MAX_MESH_CELLS || (nu + 1) * (nv + 1) > MAX_MESH_POINTS) return null;
      const bottom = s[0]!, right = s[1]!, top = [...s[2]!].reverse(), left = [...s[3]!].reverse();
      const P00 = bottom[0]!, P10 = bottom[nu]!, P11 = top[nu]!, P01 = top[0]!;
      const grid: P2[][] = [];
      for (let j = 0; j <= nv; j++) {
        const row: P2[] = [];
        for (let i = 0; i <= nu; i++) {
          // Parameters from the graded sides themselves (averaged), then Coons' patch.
          const ub = i / nu, vb = j / nv;
          const pt = (k: 0 | 1) => {
            const B = bottom[i]!, T = top[i]!, Lf = left[j]!, R = right[j]!;
            return (1 - vb) * B[k] + vb * T[k] + (1 - ub) * Lf[k] + ub * R[k]
              - ((1 - ub) * (1 - vb) * P00[k] + ub * (1 - vb) * P10[k] + ub * vb * P11[k] + (1 - ub) * vb * P01[k]);
          };
          row.push([pt(0), pt(1)]);
        }
        grid.push(row);
      }
      const points: Vec3[] = [], idx = (i: number, j: number) => j * (nu + 1) + i;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) points.push(to3(f, grid[j]![i]!));
      const cells: number[][] = [];
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        // Even a convex outline can fold under incompatible opposite-side grading.
        if (!convex([grid[j]![i]!, grid[j]![i + 1]!, grid[j + 1]![i + 1]!, grid[j + 1]![i]!])) return null;
        const q = [idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)];
        if (input.element === 'quad') cells.push(q);
        else { cells.push([q[0]!, q[1]!, q[2]!]); cells.push([q[0]!, q[2]!, q[3]!]); }
      }
      const boundary = new Set<number>();
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) if (i === 0 || j === 0 || i === nu || j === nv) boundary.add(idx(i, j));
      return { points, cells, structured: true, boundary, plane: f };
    }
  }

  // ── Structured circle: an O-grid, a central square and four patches out to the arc ──
  // The regular O-grid cannot honour arbitrary boundary stations. Use the conforming path
  // when existing nodes lie on the circle, so their connections survive meshing.
  const fixedCircleBoundary = input.outer.kind === 'circle'
    && fixed2.some((p) => Math.abs(Math.hypot(p[0], p[1]) - (input.outer as { radius: number }).radius) <= 1e-4);
  if (input.outer.kind === 'circle' && holes.length === 0 && input.element === 'quad' && !fixedCircleBoundary) {
    const r = input.outer.radius;
    // Divisions per quarter, even, so the centre is a node (a dome's crown, a plate's middle).
    const n = Math.max(2, 2 * Math.round((Math.PI * r) / 4 / h));
    const s = 0.5 * r / Math.SQRT2;                               // half side of the inner square
    const m = Math.max(1, Math.round((r - s * Math.SQRT2) / h));  // radial divisions
    if (n * n + 4 * n * m > MAX_MESH_CELLS || (n + 1) ** 2 + 4 * n * m > MAX_MESH_POINTS) return null;
    const key = new Map<string, number>();
    const points: Vec3[] = [];
    const boundary = new Set<number>();
    const id = (p: P2, onArc: boolean) => {
      const k = `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
      let i = key.get(k);
      if (i === undefined) { i = points.length; key.set(k, i); points.push(to3(f, p)); }
      if (onArc) boundary.add(i);
      return i;
    };
    const cells: number[][] = [];
    // Inner square, n × n.
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const at = (a: number, b: number): P2 => [-s + (2 * s * a) / n, -s + (2 * s * b) / n];
      cells.push([id(at(i, j), false), id(at(i + 1, j), false), id(at(i + 1, j + 1), false), id(at(i, j + 1), false)]);
    }
    // Four patches: square edge (t along it) out to the quarter arc.
    for (let q = 0; q < 4; q++) {
      const rot = (p: P2): P2 => { const a = (q * Math.PI) / 2; return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)]; };
      const inner = (t: number): P2 => rot([s, -s + 2 * s * t]);
      const arc = (t: number): P2 => { const a = -Math.PI / 4 + (Math.PI / 2) * t; return rot([r * Math.cos(a), r * Math.sin(a)]); };
      const pt = (i: number, k: number): P2 => { const t = i / n, u = k / m; const a = inner(t), b = arc(t); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
      for (let k = 0; k < m; k++) for (let i = 0; i < n; i++) {
        cells.push([id(pt(i, k), false), id(pt(i, k + 1), k + 1 === m), id(pt(i + 1, k + 1), k + 1 === m), id(pt(i + 1, k), false)]);
      }
    }
    // Orient every cell counter-clockwise in the plane.
    const p2 = (i: number) => to2(f, points[i]!);
    for (const c of cells) {
      const a = p2(c[0]!), b = p2(c[1]!), d = p2(c[2]!);
      if ((b[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (b[1] - a[1]) < 0) c.reverse();
    }
    return { points, cells, structured: true, boundary, plane: f };
  }

  // ── Unstructured ──
  const loops: P2[][] = [outer.pts, ...holes];
  const segs: Array<[number, number]> = [];
  let pts: P2[] = [];
  for (const loop of loops) {
    const base = pts.length;
    pts.push(...loop);
    for (let k = 0; k < loop.length; k++) segs.push([base + k, base + ((k + 1) % loop.length)]);
  }
  const nBoundary0 = pts.length;
  if (nBoundary0 > MAX_TRIANGULATION_POINTS) return null;
  const inside = (p: P2) => inPoly(p, outer.pts) && !holes.some((hl) => inPoly(p, hl));
  const boundaryDist = (p: P2) => {
    let d = Infinity;
    for (const [a, b] of segs) d = Math.min(d, segDist(p, pts[a]!, pts[b]!));
    return d;
  };
  // Interior lattice, triangular, at the target size.
  const xs = outer.pts.map((p) => p[0]), ys = outer.pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const dy = (h * Math.sqrt(3)) / 2;
  const candidates = Math.ceil((x1 - x0) / h) * Math.ceil((y1 - y0) / dy);
  if (!Number.isFinite(candidates) || candidates + nBoundary0 > MAX_TRIANGULATION_POINTS
    || candidates * segs.length > MAX_BOUNDARY_WORK) return null;
  const interior: P2[] = [];
  let row = 0;
  for (let y = y0 + dy / 2; y < y1; y += dy, row++) {
    for (let x = x0 + (row % 2 ? h / 2 : h / 4); x < x1; x += h) {
      const p: P2 = [x, y];
      if (inside(p) && boundaryDist(p) > 0.6 * h) interior.push(p);
    }
    if (interior.length + nBoundary0 > MAX_TRIANGULATION_POINTS) return null;
  }
  pts.push(...interior);

  // Conforming: split any boundary segment the triangulation does not contain.
  let tris: Array<[number, number, number]> = [];
  let boundarySegs = [...segs];
  for (let pass = 0; pass < 12; pass++) {
    tris = delaunay(pts);
    const edges = new Set<string>();
    for (const t of tris) for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]] as const) edges.add(u < v ? `${u},${v}` : `${v},${u}`);
    const missing = boundarySegs.filter(([a, b]) => !edges.has(a < b ? `${a},${b}` : `${b},${a}`));
    if (missing.length === 0) break;
    if (pass === 11 || pts.length + missing.length > MAX_TRIANGULATION_POINTS) return null;
    const next: Array<[number, number]> = [];
    const miss = new Set(missing.map(([a, b]) => `${a},${b}`));
    for (const [a, b] of boundarySegs) {
      if (!miss.has(`${a},${b}`)) { next.push([a, b]); continue; }
      const m = pts.length;
      pts.push([(pts[a]![0] + pts[b]![0]) / 2, (pts[a]![1] + pts[b]![1]) / 2]);
      next.push([a, m], [m, b]);
    }
    boundarySegs = next;
  }
  const isBoundary = new Set<number>();
  for (const [a, b] of boundarySegs) { isBoundary.add(a); isBoundary.add(b); }
  tris = tris.filter((t) => {
    const c: P2 = [(pts[t[0]]![0] + pts[t[1]]![0] + pts[t[2]]![0]) / 3, (pts[t[0]]![1] + pts[t[1]]![1] + pts[t[2]]![1]) / 3];
    return inside(c);
  });

  // Laplacian smoothing of interior points, never inverting a triangle.
  const nbrs = new Map<number, Set<number>>();
  for (const t of tris) for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]] as const) {
    (nbrs.get(u) ?? nbrs.set(u, new Set()).get(u)!).add(v);
    (nbrs.get(v) ?? nbrs.set(v, new Set()).get(v)!).add(u);
  }
  const trisOf = new Map<number, Array<[number, number, number]>>();
  for (const t of tris) for (const v of t) (trisOf.get(v) ?? trisOf.set(v, []).get(v)!).push(t);
  const area2 = (t: [number, number, number]) => (pts[t[1]]![0] - pts[t[0]]![0]) * (pts[t[2]]![1] - pts[t[0]]![1]) - (pts[t[2]]![0] - pts[t[0]]![0]) * (pts[t[1]]![1] - pts[t[0]]![1]);
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < pts.length; i++) {
      if (isBoundary.has(i) || i < nBoundary0) continue;
      const nb = nbrs.get(i);
      if (!nb || nb.size === 0) continue;
      let sx = 0, sy = 0;
      for (const j of nb) { sx += pts[j]![0]; sy += pts[j]![1]; }
      const old = pts[i]!;
      pts[i] = [sx / nb.size, sy / nb.size];
      if ((trisOf.get(i) ?? []).some((t) => area2(t) <= 1e-12)) pts[i] = old;
    }
  }

  // Keep only the points the triangles use, renumbered.
  const used = new Map<number, number>();
  const points: Vec3[] = [];
  const boundary = new Set<number>();
  const map = (i: number) => {
    let k = used.get(i);
    if (k === undefined) { k = points.length; used.set(i, k); points.push(to3(f, pts[i]!)); if (isBoundary.has(i)) boundary.add(k); }
    return k;
  };
  const triCells = tris.map((t) => t.map(map) as [number, number, number]);
  if (triCells.length * (input.element === 'tri' ? 1 : 3) > MAX_MESH_CELLS) return null;
  if (input.element === 'tri') return { points, cells: triCells, structured: false, boundary, plane: f };

  // Quads: every triangle into three, at its centroid and edge midpoints.
  const mid = new Map<string, number>();
  const pts3 = points;
  const midOf = (a: number, b: number) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    let m = mid.get(k);
    if (m === undefined) {
      m = pts3.length;
      pts3.push([(pts3[a]![0] + pts3[b]![0]) / 2, (pts3[a]![1] + pts3[b]![1]) / 2, (pts3[a]![2] + pts3[b]![2]) / 2]);
      mid.set(k, m);
      if (boundary.has(a) && boundary.has(b) && isBoundaryEdge(a, b)) boundary.add(m);
    }
    return m;
  };
  // An edge is on the boundary when only one kept triangle uses it.
  const edgeUse = new Map<string, number>();
  for (const t of triCells) for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]] as const) {
    const k = u < v ? `${u},${v}` : `${v},${u}`;
    edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
  }
  function isBoundaryEdge(a: number, b: number) { return (edgeUse.get(a < b ? `${a},${b}` : `${b},${a}`) ?? 0) === 1; }
  const cells: number[][] = [];
  for (const [a, b, c] of triCells) {
    const g = pts3.length;
    pts3.push([(pts3[a]![0] + pts3[b]![0] + pts3[c]![0]) / 3, (pts3[a]![1] + pts3[b]![1] + pts3[c]![1]) / 3, (pts3[a]![2] + pts3[b]![2] + pts3[c]![2]) / 3]);
    const mab = midOf(a, b), mbc = midOf(b, c), mca = midOf(c, a);
    cells.push([a, mab, g, mca], [b, mbc, g, mab], [c, mca, g, mbc]);
  }
  return { points: pts3, cells, structured: false, boundary, plane: f };
}

/** Plane-area of a mesh's cells, for checking coverage. */
export function meshArea(m: MeshOutput): number {
  let s = 0;
  for (const c of m.cells) {
    const p = c.map((i) => m.points[i]!);
    for (let k = 1; k + 1 < p.length; k++) {
      const a = p[0]!, b = p[k]!, d = p[k + 1]!;
      s += norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]])) / 2;
    }
  }
  return s;
}
