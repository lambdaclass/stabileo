// Pure 2D geometry helpers for the CAD → RC draft pipeline.
// Everything here is deterministic and unit-agnostic (works in raw DXF units
// or metres alike, with tolerances passed in by the caller).

import type { CadBBox, CadPt } from './types';

export function dist(a: CadPt, b: CadPt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Signed polygon area (positive = counter-clockwise). Outline must be open
 *  (no repeated last point). */
export function signedArea(pts: CadPt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Remove vertices that are collinear with their neighbours (within tol of
 *  perpendicular deviation) and consecutive duplicates. */
export function pruneCollinear(pts: CadPt[], tol = 1e-6): CadPt[] {
  if (pts.length < 3) return [...pts];
  // Drop consecutive duplicates first.
  const dedup: CadPt[] = [];
  for (const p of pts) {
    const last = dedup[dedup.length - 1];
    if (!last || dist(last, p) > tol) dedup.push(p);
  }
  while (dedup.length > 1 && dist(dedup[0], dedup[dedup.length - 1]) <= tol) dedup.pop();
  if (dedup.length < 3) return dedup;

  const out: CadPt[] = [];
  const n = dedup.length;
  for (let i = 0; i < n; i++) {
    const prev = dedup[(i - 1 + n) % n];
    const cur = dedup[i];
    const next = dedup[(i + 1) % n];
    // Perpendicular distance from cur to segment prev→next.
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const L = Math.hypot(dx, dy);
    if (L < tol) continue;
    const d = Math.abs((cur.x - prev.x) * dy - (cur.y - prev.y) * dx) / L;
    if (d > tol) out.push(cur);
  }
  return out;
}

/** Ensure counter-clockwise winding. */
export function toCCW(pts: CadPt[]): CadPt[] {
  return signedArea(pts) < 0 ? [...pts].reverse() : [...pts];
}

export function polygonBBox(pts: CadPt[]): CadBBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Ray-casting point-in-polygon (outline open, any winding). */
export function pointInPolygon(p: CadPt, pts: CadPt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** True when every edge of the outline is parallel to an axis (within tol). */
export function isAxisAlignedRectilinear(pts: CadPt[], tol = 1e-6): boolean {
  if (pts.length < 4) return false;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    if (dx > tol && dy > tol) return false;
  }
  return true;
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Decompose a simple axis-aligned rectilinear polygon into disjoint rectangles
 * via a vertical-strip sweep:
 *   - cut the plane at every distinct vertex x,
 *   - inside each strip, intersect the vertical mid-line with the polygon's
 *     horizontal edges → sorted crossing ys → inside intervals → rectangles,
 *   - merge horizontally adjacent rectangles sharing the same y-interval.
 * Deterministic; returns null when the outline is not rectilinear or the
 * sweep finds an inconsistent crossing pattern (self-intersection).
 */
export function decomposeRectilinear(ptsIn: CadPt[], tol = 1e-6): Rect[] | null {
  const pts = pruneCollinear(ptsIn, tol);
  if (!isAxisAlignedRectilinear(pts, tol)) return null;

  const xs = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
  if (xs.length < 2) return null;

  // Horizontal edges as (y, x0, x1).
  const hEdges: Array<{ y: number; x0: number; x1: number }> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (Math.abs(a.y - b.y) <= tol) {
      hEdges.push({ y: a.y, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) });
    }
  }

  const strips: Rect[][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    if (x1 - x0 <= tol) { strips.push([]); continue; }
    const xm = (x0 + x1) / 2;
    const ys = hEdges
      .filter((e) => e.x0 - tol < xm && xm < e.x1 + tol)
      .map((e) => e.y)
      .sort((a, b) => a - b);
    if (ys.length % 2 !== 0) return null; // inconsistent → not a simple polygon
    const rects: Rect[] = [];
    for (let k = 0; k < ys.length; k += 2) {
      if (ys[k + 1] - ys[k] > tol) {
        rects.push({ minX: x0, maxX: x1, minY: ys[k], maxY: ys[k + 1] });
      }
    }
    strips.push(rects);
  }

  // Merge adjacent strips with identical y-intervals.
  const out: Rect[] = [];
  let open: Rect[] = [];
  for (const strip of strips) {
    const next: Rect[] = [];
    for (const r of strip) {
      const prev = open.find(
        (o) => Math.abs(o.minY - r.minY) <= tol && Math.abs(o.maxY - r.maxY) <= tol &&
               Math.abs(o.maxX - r.minX) <= tol,
      );
      if (prev) {
        prev.maxX = r.maxX;
        next.push(prev);
      } else {
        next.push(r);
      }
    }
    for (const o of open) if (!next.includes(o)) out.push(o);
    open = next;
  }
  out.push(...open);
  return out;
}

/** Average-of-vertices centroid (adequate for the convex/rectilinear opening
 *  and slab outlines we test containment against). */
export function polygonCentroid(pts: CadPt[]): CadPt {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

/** An opening polygon in the slab plane, pre-analyzed for meshing. */
export interface OpeningPoly {
  outline: CadPt[];
  bbox: Rect;
  /** Axis-aligned rectilinear → its edges can become exact mesh lines. */
  rectilinear: boolean;
  centroid: CadPt;
}

export function makeOpeningPoly(outlineRaw: CadPt[], tol = 1e-4): OpeningPoly | null {
  const outline = pruneCollinear(outlineRaw, tol);
  if (outline.length < 3) return null;
  const bb = polygonBBox(outline);
  return {
    outline,
    bbox: { minX: bb.minX, minY: bb.minY, maxX: bb.maxX, maxY: bb.maxY },
    rectilinear: isAxisAlignedRectilinear(outline, tol),
    centroid: polygonCentroid(outline),
  };
}

/** Sorted, tol-merged breakpoints across [lo, hi]: the bounds, `divisions`
 *  regular interior lines, and every `extra` coordinate strictly inside. */
export function meshBreakpoints(
  lo: number, hi: number, divisions: number, extra: number[], tol = 1e-4,
): number[] {
  const vals = [lo, hi];
  for (let i = 1; i < divisions; i++) vals.push(lo + (i * (hi - lo)) / divisions);
  for (const e of extra) if (e > lo + tol && e < hi - tol) vals.push(e);
  vals.sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of vals) if (out.length === 0 || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

/**
 * Build sorted mesh breakpoints across [lo, hi] honoring structural lines.
 *
 * "Hard" lines (always kept, merged among themselves within `snapTol` keeping
 * the most structural): the bounds, opening edges, and `forced` lines (beams /
 * walls / columns / adjacent shells). Then:
 *   - 'targetSize': each interval between consecutive hard lines is split into
 *     round(gap / target) cells (≥1), so cells sit near `target` while every
 *     hard line stays a cell boundary. No sliver is ever created NEXT TO a hard
 *     line (subdivisions are interior at ~target spacing).
 *   - 'fixedDivisions': the whole span is divided into `fixed` even cells,
 *     unioned with the hard lines (legacy behavior + opening/forced lines).
 * Adjacent final gaps smaller than `target*minRatio` are counted as slivers
 * (two structural lines genuinely closer than the target — flagged, not hidden).
 */
export function structuredBreakpoints(
  lo: number, hi: number,
  opts: {
    mode: 'targetSize' | 'fixedDivisions';
    target?: number; fixed?: number;
    forced?: number[]; openingEdges?: number[];
    snapTol?: number; minRatio?: number;
  },
): { lines: number[]; slivers: number } {
  const snapTol = opts.snapTol ?? 0.03;
  // Sanitize the target cell size: a non-finite or ≤0 value (e.g. a cleared or
  // zeroed wizard field) would make `round(gap / target)` Infinity/NaN and the
  // subdivision loop below run unbounded — exhausting memory and crashing the
  // tab. Fall back to the 1 m default so meshing always terminates.
  const rawTarget = opts.target ?? 1.0;
  const target = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : 1.0;
  const minRatio = opts.minRatio ?? 0.75;
  if (hi - lo <= snapTol) return { lines: [lo, hi], slivers: 0 };

  // Tagged hard lines by structural priority: bound 1, opening 2, forced 3.
  const tagged: Array<{ v: number; p: number }> = [{ v: lo, p: 1 }, { v: hi, p: 1 }];
  for (const e of opts.openingEdges ?? []) if (e > lo + 1e-9 && e < hi - 1e-9) tagged.push({ v: e, p: 2 });
  for (const e of opts.forced ?? []) if (e > lo + 1e-9 && e < hi - 1e-9) tagged.push({ v: e, p: 3 });
  tagged.sort((a, b) => a.v - b.v);

  // Merge clusters within snapTol → keep the highest-priority value (snaps a
  // near line onto the structural one, avoiding a thin strip).
  const hard: number[] = [];
  let cluster: Array<{ v: number; p: number }> = [tagged[0]];
  const flush = () => {
    let best = cluster[0];
    for (const t of cluster) if (t.p > best.p) best = t;
    hard.push(best.v);
  };
  for (let i = 1; i < tagged.length; i++) {
    if (tagged[i].v - cluster[cluster.length - 1].v <= snapTol) cluster.push(tagged[i]);
    else { flush(); cluster = [tagged[i]]; }
  }
  flush();

  let lines: number[];
  if (opts.mode === 'fixedDivisions') {
    const nn = Math.max(1, Math.round(opts.fixed ?? 2));
    const set = new Set(hard);
    for (let i = 1; i < nn; i++) set.add(lo + (i * (hi - lo)) / nn);
    lines = [...set].sort((a, b) => a - b);
    // Merge soft-near-hard within snapTol (hard kept by being in `hard`).
    const merged: number[] = [];
    const hardSet = new Set(hard);
    for (const v of lines) {
      const prev = merged[merged.length - 1];
      if (prev !== undefined && v - prev <= snapTol) {
        if (!hardSet.has(prev) && hardSet.has(v)) merged[merged.length - 1] = v; // prefer hard
      } else merged.push(v);
    }
    lines = merged;
  } else {
    lines = [hard[0]];
    for (let i = 0; i < hard.length - 1; i++) {
      const a = hard[i], b = hard[i + 1], gap = b - a;
      // Cap subdivisions per structural gap so a pathologically small target
      // can't generate millions of cells (memory blow-up). 256 cells across a
      // single bay is already far finer than any RC analysis needs.
      const nSub = Math.min(256, Math.max(1, Math.round(gap / target)));
      for (let k = 1; k < nSub; k++) lines.push(a + (k * gap) / nSub);
      lines.push(b);
    }
  }

  let slivers = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i + 1] - lines[i] < target * minRatio - 1e-9) slivers++;
  }
  return { lines, slivers };
}

/** Opening edge coordinates (rectilinear openings only) for breakpoint forcing. */
function openingEdgeCoords(openings: OpeningPoly[]): { xs: number[]; ys: number[] } {
  const xs: number[] = [], ys: number[] = [];
  for (const op of openings) {
    if (!op.rectilinear) continue;
    for (const p of op.outline) { xs.push(p.x); ys.push(p.y); }
  }
  return { xs, ys };
}

export interface StructuredMeshOpts {
  panel: Rect;
  containment: CadPt[];
  openings: OpeningPoly[];
  mode: 'targetSize' | 'fixedDivisions';
  targetSize?: number;
  fixedNx?: number;
  fixedNy?: number;
  /** Structural lines (beam/wall/column/adjacent-shell) to force as mesh lines. */
  forcedX?: number[];
  forcedY?: number[];
  snapTolerance?: number;
  minSizeRatio?: number;
}

/**
 * Structured rectangular mesh of an axis-aligned panel, target-size or fixed.
 * Forces mesh lines through opening edges and the given structural lines,
 * snaps near lines together, keeps only cells whose centroid is inside the
 * slab outline and outside every opening. Reports sliver cells (gaps below
 * target*minRatio) so the caller can warn.
 */
export function generateStructuredMesh(opts: StructuredMeshOpts):
  { cells: Rect[]; droppedByOpening: number; slivers: number } {
  const tol = opts.snapTolerance ?? 0.03;
  const target = opts.targetSize ?? 1.0;
  const minRatio = opts.minSizeRatio ?? 0.75;
  const oe = openingEdgeCoords(opts.openings);
  const bx = structuredBreakpoints(opts.panel.minX, opts.panel.maxX, {
    mode: opts.mode, target, fixed: opts.fixedNx, forced: opts.forcedX, openingEdges: oe.xs, snapTol: tol, minRatio,
  });
  const by = structuredBreakpoints(opts.panel.minY, opts.panel.maxY, {
    mode: opts.mode, target, fixed: opts.fixedNy, forced: opts.forcedY, openingEdges: oe.ys, snapTol: tol, minRatio,
  });
  const xs = bx.lines, ys = by.lines;
  const cells: Rect[] = [];
  let droppedByOpening = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
      if (!pointInPolygon(c, opts.containment)) continue;
      if (opts.openings.some((op) => pointInPolygon(c, op.outline))) { droppedByOpening++; continue; }
      cells.push({ minX: xs[i], maxX: xs[i + 1], minY: ys[j], maxY: ys[j + 1] });
    }
  }
  // Sliver count: distinct sliver-causing lines in either axis (only meaningful
  // where a kept cell uses that thin gap; report the axis totals — conservative).
  return { cells, droppedByOpening, slivers: bx.slivers + by.slivers };
}

/**
 * Legacy fixed-divisions rect mesher (back-compat thin wrapper over
 * generateStructuredMesh). Mesh lines = `divisions` even subdivisions + every
 * rectilinear opening edge; cells kept by centroid in `containment` & outside
 * openings.
 */
export function meshRectWithOpenings(
  panel: Rect,
  containment: CadPt[],
  divisions: number,
  openings: OpeningPoly[],
  tol = 1e-4,
): { cells: Rect[]; droppedByOpening: number } {
  const { cells, droppedByOpening } = generateStructuredMesh({
    panel, containment, openings,
    mode: 'fixedDivisions', fixedNx: divisions, fixedNy: divisions,
    snapTolerance: tol,
  });
  return { cells, droppedByOpening };
}

// ─── Double-line wall pairing ─────────────────────────────────

export interface Segment {
  a: CadPt;
  b: CadPt;
}

export interface PairedWall {
  /** Centerline of the overlap region. */
  a: CadPt;
  b: CadPt;
  thickness: number;
  /** Indices of the two source segments in the input array. */
  pair: [number, number];
}

interface SegFrame {
  origin: CadPt;
  dir: CadPt; // unit
  t0: number;
  t1: number;
  offset: number; // signed perpendicular offset of the segment from origin line
  len: number;
}

/**
 * Pair parallel wall face lines into centerlines with thickness.
 * Two segments pair when they are parallel (within angleTol radians), their
 * perpendicular gap is in [minGap, maxGap], and they overlap along their
 * common direction by at least minOverlapRatio of the shorter one.
 * Greedy and deterministic: segments are processed in input order and each
 * pairs with the closest-gap eligible partner.
 * Returns paired centerlines plus the indices of segments left unpaired.
 */
export function pairWallLines(
  segments: Segment[],
  opts: { minGap: number; maxGap: number; angleTol?: number; minOverlapRatio?: number },
): { paired: PairedWall[]; unpaired: number[] } {
  const angleTol = opts.angleTol ?? 0.035; // ~2°
  const minOverlapRatio = opts.minOverlapRatio ?? 0.5;

  const frames: SegFrame[] = segments.map((s) => {
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    const len = Math.hypot(dx, dy);
    const dir = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
    return { origin: s.a, dir, t0: 0, t1: len, offset: 0, len };
  });

  const used = new Array(segments.length).fill(false);
  const paired: PairedWall[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i] || frames[i].len <= 0) continue;
    const fi = frames[i];
    let best = -1;
    let bestGap = Infinity;
    let bestProj: { t0: number; t1: number; offMid: number } | null = null;

    for (let j = i + 1; j < segments.length; j++) {
      if (used[j] || frames[j].len <= 0) continue;
      const fj = frames[j];
      // Parallel check (direction or anti-direction).
      const cross = Math.abs(fi.dir.x * fj.dir.y - fi.dir.y * fj.dir.x);
      if (cross > Math.sin(angleTol)) continue;
      // Project segment j onto i's frame.
      const rel = (p: CadPt) => ({
        t: (p.x - fi.origin.x) * fi.dir.x + (p.y - fi.origin.y) * fi.dir.y,
        o: -(p.x - fi.origin.x) * fi.dir.y + (p.y - fi.origin.y) * fi.dir.x,
      });
      const pa = rel(segments[j].a), pb = rel(segments[j].b);
      const gap = Math.abs((pa.o + pb.o) / 2);
      if (gap < opts.minGap || gap > opts.maxGap) continue;
      // Faces must be near-parallel lines, not skewed: offsets similar.
      if (Math.abs(pa.o - pb.o) > opts.maxGap * 0.5) continue;
      const jt0 = Math.min(pa.t, pb.t), jt1 = Math.max(pa.t, pb.t);
      const ov0 = Math.max(0, jt0), ov1 = Math.min(fi.len, jt1);
      const overlap = ov1 - ov0;
      const shorter = Math.min(fi.len, jt1 - jt0);
      if (shorter <= 0 || overlap / shorter < minOverlapRatio) continue;
      if (gap < bestGap) {
        bestGap = gap;
        best = j;
        bestProj = { t0: ov0, t1: ov1, offMid: (pa.o + pb.o) / 4 }; // mid between 0 and face offset
      }
    }

    if (best >= 0 && bestProj) {
      used[i] = used[best] = true;
      const perp = { x: -fi.dir.y, y: fi.dir.x };
      const at = (t: number): CadPt => ({
        x: fi.origin.x + fi.dir.x * t + perp.x * bestProj!.offMid,
        y: fi.origin.y + fi.dir.y * t + perp.y * bestProj!.offMid,
      });
      paired.push({ a: at(bestProj.t0), b: at(bestProj.t1), thickness: bestGap, pair: [i, best] });
    }
  }

  const unpaired: number[] = [];
  for (let i = 0; i < segments.length; i++) if (!used[i] && frames[i].len > 0) unpaired.push(i);
  return { paired, unpaired };
}

/**
 * Chain bare line segments into closed loops by endpoint proximity.
 * Architectural/structural CADs often draw column rectangles as 4 separate
 * LINE entities; this reconstructs them. A loop is returned only when every
 * vertex in a connected component has degree exactly 2 and the chain closes
 * back on its start — open chains and junctions are left out (their segment
 * indices are reported as `unchained`).
 */
export function chainSegmentsIntoLoops(
  segments: Segment[],
  tol: number,
): { loops: CadPt[][]; unchained: number[] } {
  // Weld endpoints into vertex ids.
  const verts: CadPt[] = [];
  const vertOf = (p: CadPt): number => {
    for (let i = 0; i < verts.length; i++) {
      if (dist(verts[i], p) <= tol) return i;
    }
    verts.push({ x: p.x, y: p.y });
    return verts.length - 1;
  };
  const edges = segments.map((s, i) => ({ i, a: vertOf(s.a), b: vertOf(s.b) }))
    .filter((e) => e.a !== e.b);

  const adj = new Map<number, Array<{ to: number; edge: number }>>();
  for (const e of edges) {
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push({ to: e.b, edge: e.i });
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push({ to: e.a, edge: e.i });
  }

  const usedEdge = new Set<number>();
  const loops: CadPt[][] = [];
  const inLoop = new Set<number>();

  for (const start of adj.keys()) {
    if ((adj.get(start)?.length ?? 0) !== 2) continue;
    // Walk from `start`; succeed only if we return to start through
    // degree-2 vertices without reusing edges.
    const path: number[] = [start];
    const pathEdges: number[] = [];
    let cur = start;
    let prevEdge = -1;
    let closed = false;
    for (let guard = 0; guard <= edges.length; guard++) {
      const nexts = (adj.get(cur) ?? []).filter(
        (n) => n.edge !== prevEdge && !usedEdge.has(n.edge) && !pathEdges.includes(n.edge),
      );
      if (nexts.length === 0) break;
      const n = nexts[0];
      pathEdges.push(n.edge);
      if (n.to === start) { closed = true; break; }
      if ((adj.get(n.to)?.length ?? 0) !== 2 || path.includes(n.to)) break;
      path.push(n.to);
      cur = n.to;
      prevEdge = n.edge;
    }
    if (closed && path.length >= 3) {
      for (const e of pathEdges) { usedEdge.add(e); inLoop.add(e); }
      loops.push(path.map((v) => ({ x: verts[v].x, y: verts[v].y })));
    }
  }

  const unchained = segments.map((_, i) => i).filter((i) => !inLoop.has(i));
  return { loops, unchained };
}

/**
 * True when segment (a1→a2) is collinear with (b1→b2) and the two overlap
 * along their common direction by at least `minOverlap` (m). Used to decide
 * whether a slab edge is "supported" by a beam (or shares an edge with
 * another slab). `tol` is the max perpendicular gap treated as collinear.
 */
export function segmentsCollinearOverlap(
  a1: CadPt, a2: CadPt, b1: CadPt, b2: CadPt, tol = 0.05, minOverlap = 0.1,
): boolean {
  const ax = a2.x - a1.x, ay = a2.y - a1.y;
  const La = Math.hypot(ax, ay);
  if (La < 1e-9) return false;
  const ux = ax / La, uy = ay / La;          // unit along edge a
  const bx = b2.x - b1.x, by = b2.y - b1.y;
  const Lb = Math.hypot(bx, by);
  if (Lb < 1e-9) return false;
  // Parallel? cross of unit directions ~ 0.
  if (Math.abs(ux * (by / Lb) - uy * (bx / Lb)) > 1e-3) return false;
  // Perpendicular distance of b's endpoints from line a.
  const perp = (p: CadPt) => Math.abs(-(p.x - a1.x) * uy + (p.y - a1.y) * ux);
  if (perp(b1) > tol || perp(b2) > tol) return false;
  // Overlap of the [0,La] span of a with b's projection.
  const tb1 = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy;
  const tb2 = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy;
  const lo = Math.max(0, Math.min(tb1, tb2));
  const hi = Math.min(La, Math.max(tb1, tb2));
  return hi - lo >= minOverlap;
}

/** Parameter t∈(0,1) where p lies on segment a→b (within posTol), else null.
 *  Endpoints excluded (endTol fraction). The plan-view cousin of beamThrough. */
export function pointOnSegment(
  p: CadPt, a: CadPt, b: CadPt, posTol = 1e-3, endTol = 0.02,
): number | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) return null;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  if (t <= endTol || t >= 1 - endTol) return null;
  const px = a.x + t * dx, py = a.y + t * dy;
  return (px - p.x) ** 2 + (py - p.y) ** 2 < posTol * posTol ? t : null;
}
