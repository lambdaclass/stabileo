/**
 * A plate meshed as a grid of rectangles (squares when both sides are equal) of the sides asked
 * for, laid along chosen axes in its plane.
 *
 * ── How ───────────────────────────────────────────────────────────
 *
 *   · A rectangle with no holes and nothing inside it, its sides along the axes: a structured grid
 *     whose divisions are the sides' lengths over the cell sides, rounded, so the cells fill it
 *     exactly and come out as close to the sides asked for as the lengths allow.
 *   · Anything else: the grid through the outline's first point; every cell that lies whole in the
 *     plate, clear of its outline, holes, members and nodes by a margin, stays a rectangle of
 *     exactly those sides. The rest, a strip along the outline and the holes and round what the
 *     plate meets, is meshed by the shell mesher with the grid cells' edges as its boundary, so
 *     the strip and the grid share their nodes: the mesh is conforming throughout.
 *
 * Pure: the geometry only, in the plate's plane.
 */
import { cross, dot, norm, unit, type Vec3 } from './affine';
import { generateMesh, MAX_MESH_CELLS, type MeshOutput, type SideSpec } from './mesher';

type P2 = [number, number];

export interface GridFrame { o: Vec3; u: Vec3; v: Vec3; n: Vec3 }

export interface GridMeshInput {
  outer: Vec3[];
  holes: Vec3[][];
  /** The grid's axes in the plate's plane: cells have side `a` along `u` and `b` along `v`. */
  frame: GridFrame;
  a: number;
  b: number;
  /** What the strip along the boundary is meshed with. */
  element: 'quad' | 'tri';
  /** The outline's sides, as the shell mesher takes them (a neighbour's spacing on a side). */
  sides?: SideSpec[];
  fixedPoints?: Vec3[];
  fixedSegments?: Array<[Vec3, Vec3]>;
}

export interface GridMeshOutput extends MeshOutput {
  /** Cells that are rectangles of the grid. */
  gridCells: number;
  /** Cells of the strip along the boundary and round what the plate meets. */
  bandCells: number;
  /** The rectangles' sides, as they came out (a rectangle plate's cells are fitted to it). */
  cellA: number;
  cellB: number;
}

const EPS = 1e-9;

/** The plate's frame turned so `u` lies along a direction in its plane (global X, say). */
export function frameAlong(frame: GridFrame, dir: Vec3): GridFrame {
  const n = frame.n;
  const inPlane = (w: Vec3): Vec3 => [w[0] - n[0] * dot(w, n), w[1] - n[1] * dot(w, n), w[2] - n[2] * dot(w, n)];
  // A direction along the plate's normal has no trace in it: global Y stands in, then the plate's own u.
  let d = inPlane(dir);
  if (norm(d) < 1e-6) d = inPlane([0, 1, 0]);
  if (norm(d) < 1e-6) return frame;
  const u = unit(d);
  return { o: frame.o, u, v: cross(n, u), n };
}

export function gridMesh(input: GridMeshInput): GridMeshOutput | null {
  const { frame: f, a, b } = input;
  if (!(a > EPS) || !(b > EPS) || input.outer.length < 3) return null;
  const to2 = (p: Vec3): P2 => { const d: Vec3 = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]]; return [dot(d, f.u), dot(d, f.v)]; };
  const to3 = (p: P2): Vec3 => [f.o[0] + f.u[0] * p[0] + f.v[0] * p[1], f.o[1] + f.u[1] * p[0] + f.v[1] * p[1], f.o[2] + f.u[2] * p[0] + f.v[2] * p[1]];
  const outer = input.outer.map(to2);
  const holes = input.holes.map((h) => h.map(to2));
  const fixedPts = (input.fixedPoints ?? []).map(to2);
  const fixedSegs = (input.fixedSegments ?? []).map(([p, q]) => [to2(p), to2(q)] as [P2, P2]);

  // A rectangle along the axes, with nothing in it: fitted divisions, one structured grid.
  const rect = alignedRectangle(outer);
  if (rect && holes.length === 0 && !fixedPts.some((p) => strictlyInside(p, rect)) && !fixedSegs.some((s) => segHitsBox(s, rect, -1e-6))) {
    const nu = Math.max(1, Math.round((rect.u1 - rect.u0) / a)), nv = Math.max(1, Math.round((rect.v1 - rect.v0) / b));
    if (nu * nv > MAX_MESH_CELLS) return null;
    // Opposite sides take the same divisions; a side a neighbour's mesh meets keeps its spacing.
    const sides = sideDivisions(outer, rect, nu, nv, input.sides);
    const m = generateMesh({ outer: { kind: 'polygon', points: input.outer }, holes: [], size: Math.max(a, b), element: 'quad', sides, fixedPoints: input.fixedPoints ?? [], fixedSegments: input.fixedSegments ?? [] });
    if (!m) return null;
    return { ...m, gridCells: m.structured ? m.cells.length : 0, bandCells: m.structured ? 0 : m.cells.length, cellA: (rect.u1 - rect.u0) / nu, cellB: (rect.v1 - rect.v0) / nv };
  }

  // The grid through the outline's first point.
  const xs = [...outer, ...holes.flat()].map((p) => p[0]), ys = [...outer, ...holes.flat()].map((p) => p[1]);
  const u0 = outer[0]![0], v0 = outer[0]![1];
  const i0 = Math.floor((Math.min(...xs) - u0) / a) - 1, i1 = Math.ceil((Math.max(...xs) - u0) / a) + 1;
  const j0 = Math.floor((Math.min(...ys) - v0) / b) - 1, j1 = Math.ceil((Math.max(...ys) - v0) / b) + 1;
  if ((i1 - i0) * (j1 - j0) > MAX_MESH_CELLS * 4) return null;
  const U = (i: number) => u0 + i * a, V = (j: number) => v0 + j * b;
  const inRegion = (p: P2) => inPoly(p, outer) && !holes.some((h) => inPoly(p, h));
  const loopSegs: Array<[P2, P2]> = [outer, ...holes].flatMap((l) => l.map((p, k) => [p, l[(k + 1) % l.length]!] as [P2, P2]));
  const margin = 0.3 * Math.min(a, b);
  const atCorner = (p: P2, i: number, j: number) => [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].some(([ii, jj]) => Math.hypot(p[0] - U(ii!), p[1] - V(jj!)) < 1e-6);

  const full = new Set<string>();
  const key = (i: number, j: number) => `${i},${j}`;
  for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
    const box = { u0: U(i), u1: U(i + 1), v0: V(j), v1: V(j + 1) };
    if (![[box.u0, box.v0], [box.u1, box.v0], [box.u1, box.v1], [box.u0, box.v1]].every((c) => inRegion(c as P2))) continue;
    if (loopSegs.some((s) => segHitsBox(s, box, margin))) continue;
    if (fixedPts.some((p) => !atCorner(p, i, j) && insideBox(p, box, margin))) continue;
    if (fixedSegs.some((s) => segHitsBox(s, box, margin))) continue;
    full.add(key(i, j));
  }
  // Two cells meeting only at a corner would make the grid's boundary touch itself: drop one.
  for (let changed = true; changed;) {
    changed = false;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const ll = full.has(key(i - 1, j - 1)), lr = full.has(key(i, j - 1)), ul = full.has(key(i - 1, j)), ur = full.has(key(i, j));
      if (ll && ur && !lr && !ul) { full.delete(key(i, j)); changed = true; }
      else if (lr && ul && !ll && !ur) { full.delete(key(i - 1, j)); changed = true; }
    }
  }
  if (full.size === 0) {
    // Too small for a whole cell: the shell mesher alone, at the smaller side.
    const m = generateMesh({ outer: { kind: 'polygon', points: input.outer }, holes: input.holes.map((h) => ({ kind: 'polygon' as const, points: h })), size: Math.min(a, b), element: input.element, ...(input.sides ? { sides: input.sides } : {}), fixedPoints: input.fixedPoints ?? [], fixedSegments: input.fixedSegments ?? [] });
    return m ? { ...m, gridCells: 0, bandCells: m.cells.length, cellA: a, cellB: b } : null;
  }

  /** The grid's cells and the strip round them, and the cells the strip lands on between corners. */
  const buildMesh = (cellsIn: Set<string>): { points: Vec3[]; cells: number[][]; gridCells: number; hanging: Set<string> } | null => {
    // The grid cells' boundary: the edges no two cells share, chained into loops through grid points.
    const edges = new Map<string, [number, number, number, number]>();
    for (const k of cellsIn) {
      const [i, j] = k.split(',').map(Number) as [number, number];
      const ring: Array<[number, number]> = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      for (let s2 = 0; s2 < 4; s2++) {
        const [pi, pj] = ring[s2]!, [qi, qj] = ring[(s2 + 1) % 4]!;
        const back = `${qi},${qj}>${pi},${pj}`;
        if (edges.has(back)) edges.delete(back); else edges.set(`${pi},${pj}>${qi},${qj}`, [pi, pj, qi, qj]);
      }
    }
    const next = new Map<string, string>();
    for (const [, [pi, pj, qi, qj]] of edges) next.set(`${pi},${pj}`, `${qi},${qj}`);
    const loops: P2[][] = [];
    const used = new Set<string>();
    for (const startKey of next.keys()) {
      if (used.has(startKey)) continue;
      const loop: P2[] = [];
      let atKey: string | undefined = startKey;
      while (atKey !== undefined && !used.has(atKey)) {
        used.add(atKey);
        const [i, j] = atKey.split(',').map(Number) as [number, number];
        loop.push([U(i), V(j)]);
        atKey = next.get(atKey);
      }
      if (atKey === undefined) return null;
      loops.push(loop);
    }
    // Counter-clockwise loops bound the grid's pieces; clockwise ones are pockets inside them.
    const pieceLoops = loops.filter((l) => signedArea(l) > 0);
    const pockets = loops.filter((l) => signedArea(l) < 0).map((l) => [...l].reverse());
    // The strip's regions: the plate's outline, and each pocket; each takes as holes the plate's
    // holes and the grid's pieces that lie directly inside it.
    const regions: Array<{ outer: P2[]; holes: P2[][]; isPlate: boolean }> = [{ outer, holes: [], isPlate: true }, ...pockets.map((p) => ({ outer: p, holes: [] as P2[][], isPlate: false }))];
    const place = (loop: P2[], probe: P2) => {
      let best: (typeof regions)[number] | null = null;
      for (const r of regions) {
        if (r.outer === loop || !inPoly(probe, r.outer)) continue;
        if (!best || Math.abs(signedArea(r.outer)) < Math.abs(signedArea(best.outer))) best = r;
      }
      best?.holes.push(loop);
    };
    for (const h of holes) place(h, h[0]!);
    // A point just inside a piece's first edge, to tell which region holds it.
    for (const l of pieceLoops) { const [p, q] = [l[0]!, l[1]!]; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); place(l, [(p[0] + q[0]) / 2 - (q[1] - p[1]) / d * 1e-4, (p[1] + q[1]) / 2 + (q[0] - p[0]) / d * 1e-4]); }

    const pts: Vec3[] = [];
    const index = new Map<string, number>();
    const idOf = (p: P2) => {
      const k = `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
      let n = index.get(k);
      if (n === undefined) { n = pts.length; pts.push(to3(p)); index.set(k, n); }
      return n;
    };
    const out: number[][] = [];
    const gridKeys = [...cellsIn];
    for (const k of gridKeys) {
      const [i, j] = k.split(',').map(Number) as [number, number];
      out.push([idOf([U(i), V(j)]), idOf([U(i + 1), V(j)]), idOf([U(i + 1), V(j + 1)]), idOf([U(i), V(j + 1)])]);
    }
    const nGrid = out.length;
    // The strip in triangles at the larger side, so no side of a cell is divided by the stations;
    // asked for quadrilaterals, neighbouring triangles are paired below.
    const h = Math.max(a, b) * (1 + 1e-9);
    for (const r of regions) {
      const m = generateMesh({
        outer: { kind: 'polygon', points: r.outer.map(to3) },
        holes: r.holes.map((l) => ({ kind: 'polygon' as const, points: l.map(to3) })),
        size: h, element: 'tri',
        ...(r.isPlate && input.sides ? { sides: input.sides } : {}),
        fixedPoints: input.fixedPoints ?? [], fixedSegments: input.fixedSegments ?? [],
      });
      if (!m) return null;
      const tris = m.cells.map((c) => {
        const ids = c.map((n) => idOf(to2(m.points[n]!)));
        // The mesher winds its cells by its own frame: wind them as the grid's (counter-clockwise in u, v).
        return signedArea(ids.map((n) => to2(pts[n]!))) < 0 ? [...ids].reverse() : ids;
      });
      out.push(...(input.element === 'quad' ? pairTriangles(tris, (n) => to2(pts[n]!)) : tris));
    }
    // A point of the strip strictly inside a cell's side: that cell joins the strip.
    const hanging = new Set<string>();
    const stripPts = new Set<number>();
    for (const c of out.slice(nGrid)) for (const n of c) stripPts.add(n);
    gridKeys.forEach((k, ci) => {
      const c = out[ci]!;
      for (let e = 0; e < 4 && !hanging.has(k); e++) {
        const A = to2(pts[c[e]!]!), B = to2(pts[c[(e + 1) % 4]!]!);
        for (const n of stripPts) {
          if (c.includes(n)) continue;
          const p = to2(pts[n]!);
          if (segDist(p, A, B) < 1e-7 && Math.hypot(p[0] - A[0], p[1] - A[1]) > 1e-7 && Math.hypot(p[0] - B[0], p[1] - B[1]) > 1e-7) { hanging.add(k); break; }
        }
      }
    });
    return { points: pts, cells: out, gridCells: nGrid, hanging };
  };

  // The grid's cells and the strip, meshed until the strip lands on no cell's side between its
  // corners: a cell it does land on joins the strip and the strip is meshed again.
  let built: { points: Vec3[]; cells: number[][]; gridCells: number } | null = null;
  for (let round = 0; round < 12 && !built; round++) {
    const r = buildMesh(full);
    if (!r) return null;
    if (r.hanging.size === 0) built = r;
    else for (const k of r.hanging) full.delete(k);
    if (full.size === 0) break;
  }
  if (!built) {
    const m = generateMesh({ outer: { kind: 'polygon', points: input.outer }, holes: input.holes.map((h) => ({ kind: 'polygon' as const, points: h })), size: Math.min(a, b), element: input.element, ...(input.sides ? { sides: input.sides } : {}), fixedPoints: input.fixedPoints ?? [], fixedSegments: input.fixedSegments ?? [] });
    return m ? { ...m, gridCells: 0, bandCells: m.cells.length, cellA: a, cellB: b } : null;
  }
  const { points, cells, gridCells } = built;
  if (cells.length > MAX_MESH_CELLS) return null;
  const boundary = new Set<number>();
  points.forEach((p3, n) => { const p = to2(p3); if ([outer, ...holes].some((l) => l.some((q, k) => segDist(p, q, l[(k + 1) % l.length]!) < 1e-6))) boundary.add(n); });
  return { points, cells, structured: false, boundary, plane: { o: f.o, u: f.u, v: f.v }, gridCells, bandCells: cells.length - gridCells, cellA: a, cellB: b };
}

// ─── Helpers ──────────────────────────────────────────────────────

interface Box { u0: number; u1: number; v0: number; v1: number }

/** The outline as a rectangle along the axes, when it is one (four corners, sides along u and v). */
function alignedRectangle(p: P2[]): Box | null {
  if (p.length !== 4) return null;
  const us = p.map((q) => q[0]), vs = p.map((q) => q[1]);
  const box = { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
  const tol = 1e-6 * Math.max(box.u1 - box.u0, box.v1 - box.v0, 1);
  const onCorner = (q: P2) => (Math.abs(q[0] - box.u0) < tol || Math.abs(q[0] - box.u1) < tol) && (Math.abs(q[1] - box.v0) < tol || Math.abs(q[1] - box.v1) < tol);
  if (!p.every(onCorner) || box.u1 - box.u0 < tol || box.v1 - box.v0 < tol) return null;
  // Four distinct corners in order round it.
  for (let k = 0; k < 4; k++) { const q = p[k]!, r = p[(k + 1) % 4]!; if (Math.abs(q[0] - r[0]) > tol && Math.abs(q[1] - r[1]) > tol) return null; }
  return box;
}

/** Each side's divisions: nu along u, nv along v, except a side whose spacing a neighbour fixes. */
function sideDivisions(p: P2[], box: Box, nu: number, nv: number, given?: SideSpec[]): SideSpec[] {
  const along = p.map((q, k) => Math.abs(p[(k + 1) % 4]![1] - q[1]) < 1e-9 * Math.max(1, box.v1 - box.v0));
  const out = along.map((isU) => ({ divisions: isU ? nu : nv }));
  if (given) for (let k = 0; k < 4; k++) {
    const g = given[k]?.divisions;
    if (g && g !== out[k]!.divisions) { out[k] = { divisions: g }; out[(k + 2) % 4] = { divisions: g }; }
  }
  return out;
}

function strictlyInside(p: P2, b: Box): boolean { return p[0] > b.u0 + 1e-6 && p[0] < b.u1 - 1e-6 && p[1] > b.v0 + 1e-6 && p[1] < b.v1 - 1e-6; }
function insideBox(p: P2, b: Box, m: number): boolean { return p[0] > b.u0 - m && p[0] < b.u1 + m && p[1] > b.v0 - m && p[1] < b.v1 + m; }

/** Whether a segment meets the box grown by `m` on every side (Liang–Barsky). */
function segHitsBox([p, q]: [P2, P2], b: Box, m: number): boolean {
  const x0 = b.u0 - m, x1 = b.u1 + m, y0 = b.v0 - m, y1 = b.v1 + m;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  let t0 = 0, t1 = 1;
  for (const [pp, qq] of [[-dx, p[0] - x0], [dx, x1 - p[0]], [-dy, p[1] - y0], [dy, y1 - p[1]]] as Array<[number, number]>) {
    if (Math.abs(pp) < 1e-15) { if (qq < 0) return false; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}

function inPoly(p: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, c = poly[j]!;
    if ((a[1] > p[1]) !== (c[1] > p[1]) && p[0] < ((c[0] - a[0]) * (p[1] - a[1])) / (c[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function signedArea(p: P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i]!, c = p[(i + 1) % p.length]!; s += a[0] * c[1] - c[0] * a[1]; }
  return s / 2;
}

function segDist(p: P2, a: P2, c: P2): number {
  const dx = c[0] - a[0], dy = c[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 < 1e-24 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/**
 * Neighbouring triangles joined into quadrilaterals where the four corners make a good one: convex,
 * no corner under 45° or over 150°. Best pairs first; a triangle with no good partner stays one.
 */
function pairTriangles(tris: number[][], p: (n: number) => P2): number[][] {
  const edgeOwners = new Map<string, number[]>();
  tris.forEach((t, ti) => { for (let k = 0; k < 3; k++) { const a = t[k]!, b = t[(k + 1) % 3]!; const key = a < b ? `${a}-${b}` : `${b}-${a}`; (edgeOwners.get(key) ?? edgeOwners.set(key, []).get(key)!).push(ti); } });
  const candidates: Array<{ score: number; t1: number; t2: number; quad: number[] }> = [];
  for (const [key, owners] of edgeOwners) {
    if (owners.length !== 2) continue;
    const [a, b] = key.split('-').map(Number) as [number, number];
    const [t1, t2] = owners as [number, number];
    const c1 = tris[t1]!.find((n) => n !== a && n !== b)!, c2 = tris[t2]!.find((n) => n !== a && n !== b)!;
    // The quad round a, c2, b, c1 in the first triangle's winding.
    const t = tris[t1]!;
    const ia = t.indexOf(a), ib = t.indexOf(b);
    const quad = (ib === (ia + 1) % 3) ? [a, c2, b, c1] : [b, c2, a, c1];
    const angles = quad.map((n, k) => {
      const P0 = p(quad[(k + 3) % 4]!), P1 = p(n), P2v = p(quad[(k + 1) % 4]!);
      const u: P2 = [P0[0] - P1[0], P0[1] - P1[1]], v: P2 = [P2v[0] - P1[0], P2v[1] - P1[1]];
      const crossz = v[0] * u[1] - v[1] * u[0];
      const ang = Math.atan2(Math.abs(crossz), u[0] * v[0] + u[1] * v[1]) * 180 / Math.PI;
      return crossz > 0 ? ang : 360 - ang;
    });
    if (angles.some((g) => g < 45 || g > 150)) continue;
    candidates.push({ score: Math.max(...angles.map((g) => Math.abs(g - 90))), t1, t2, quad });
  }
  candidates.sort((x, y) => x.score - y.score);
  const taken = new Set<number>();
  const out: number[][] = [];
  for (const c of candidates) {
    if (taken.has(c.t1) || taken.has(c.t2)) continue;
    taken.add(c.t1); taken.add(c.t2);
    out.push(c.quad);
  }
  tris.forEach((t, ti) => { if (!taken.has(ti)) out.push(t); });
  return out;
}
