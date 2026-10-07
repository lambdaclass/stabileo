/**
 * The nodal forces of an area load on one shell (a MITC4 quad or a DKT triangle):
 *
 *     Fᵢ = d · ∫ Nᵢ q dA
 *
 * with Nᵢ the element's shape functions, q the pressure field and d its direction. It is the
 * engine's own load vector for a pressure (`quad_pressure_load`, `plate_pressure_load`: forces,
 * no moments, on the element's flat projection), extended to what the engine does not take:
 *
 *   direction   the shell's local z (as the engine's), a global direction per true area, or per
 *               area projected normal to it (a roof's snow); without a frame, −Z per true area;
 *   variation   uniform; by corner (q = Σ Nⱼ qⱼ); or linear in a global coordinate between two
 *               values, and nothing outside them (a hydrostatic or a soil pressure, a trapezoid);
 *   extent      the whole shell, or the part inside a polygon projected onto it along a direction
 *               (a partial rectangle, a zone with its openings).
 *
 * A whole shell under a field it carries everywhere is integrated in the element's own natural
 * coordinates, exactly (3×3 Gauss on a quad, a degree-4 rule on a triangle). A shell cut by a region
 * or by the ends of a variation is clipped in its plane, and the piece is integrated over triangles
 * with a composite degree-5 rule, mapping each point back to natural coordinates. That is exact on a
 * triangle and on a parallelogram. On any other quad the shape functions are not polynomials of
 * the plane's coordinates and the rule only converges: a corner's share is good to about 1e-6 of
 * it (1.6e-6 kN of 2.7 kN on a strongly distorted quad), while the total and its moment are exact
 * (the shares add to one and reproduce the coordinates). A region with openings is the set of
 * points in its outline and in none of them, the rule the drawing uses: an opening reaching past
 * the outline, or overlapping another, is not subtracted twice (`regionCells`).
 *
 * Pure: no store, no engine.
 */
import { shellLocalAxes } from './shell-results';

export type Vec3 = [number, number, number];
type P2 = [number, number];
export interface ShellPoint { x: number; y: number; z?: number }

/** Where an area load points, and per which area. */
export type ShellLoadFrame = 'local' | 'global' | 'projected';

/** An area load's field and extent, in global terms (so a move or a mirror carries it). */
export interface ShellLoadSpec {
  /** kN/m², uniform; positive along the direction. */
  q: number;
  /** Absent: −Z per true area, q positive downward (the model's original surface load). */
  frame?: ShellLoadFrame;
  /** The global direction of `global` and `projected` (a unit vector; normalised here). */
  dir?: Vec3;
  /** q at each corner, in the shell's node order: a field by node. Replaces q. */
  qNodes?: number[];
  /**
   * q linear in the coordinate c = dir·X: q1 at c1, q2 at c2, and nothing outside [c1, c2]. With
   * c1 = c2 the range is empty and the load is none, a shell lying at that coordinate included (no
   * value between two equal coordinates is the one meant).
   */
  vary?: { dir: Vec3; c1: number; q1: number; c2: number; q2: number };
  /** Only inside this polygon, projected onto the shell along `normal`. Openings are taken out. */
  region?: { normal: Vec3; points: Vec3[]; holes?: Vec3[][] };
}

export interface ShellLoadForces {
  /** Global force at each corner, in node order, kN. */
  forces: Vec3[];
  /** The area that carries load, m² (the shell's, or the part inside the region and the range). */
  loadedArea: number;
  /** The shell's area, m², as the engine measures it. */
  area: number;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: Vec3): Vec3 => { const n = Math.hypot(...a); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0]; };
const v3 = (p: ShellPoint): Vec3 => [p.x, p.y, p.z ?? 0];

// ── Element geometry ─────────────────────────────────────────────

interface Element {
  kind: 'quad' | 'plate';
  /** Corners in 3D. */
  X: Vec3[];
  /** Corners in the element's plane, origin at corner 0. */
  p: P2[];
  ex: Vec3; ey: Vec3; ez: Vec3;
  area: number;
}

function element(kind: 'quad' | 'plate', pts: readonly ShellPoint[]): Element | null {
  const axes = shellLocalAxes(kind, pts as never);
  if (!axes) return null;
  const X = pts.map(v3);
  const o = X[0]!;
  const p = X.map((c): P2 => [dot(sub(c, o), axes.ex as Vec3), dot(sub(c, o), axes.ey as Vec3)]);
  return { kind, X, p, ex: axes.ex as Vec3, ey: axes.ey as Vec3, ez: axes.ez as Vec3, area: Math.abs(polygonArea(p)) };
}

/** Shape functions at natural coordinates: (ξ, η) on [−1, 1]² for a quad, (r, s) for a triangle. */
function shape(kind: 'quad' | 'plate', a: number, b: number): number[] {
  if (kind === 'plate') return [1 - a - b, a, b];
  return [0.25 * (1 - a) * (1 - b), 0.25 * (1 + a) * (1 - b), 0.25 * (1 + a) * (1 + b), 0.25 * (1 - a) * (1 + b)];
}

function mapPoint(el: Element, N: number[]): P2 {
  let x = 0, y = 0;
  N.forEach((n, i) => { x += n * el.p[i]![0]; y += n * el.p[i]![1]; });
  return [x, y];
}

/** |J| of the map to the element's plane, at natural coordinates. */
function detJ(el: Element, a: number, b: number): number {
  if (el.kind === 'plate') {
    const [p0, p1, p2] = el.p as [P2, P2, P2];
    return Math.abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]));
  }
  const xi = [-1, 1, 1, -1], eta = [-1, -1, 1, 1];
  let xa = 0, ya = 0, xb = 0, yb = 0;
  for (let i = 0; i < 4; i++) {
    const da = 0.25 * xi[i]! * (1 + b * eta[i]!), db = 0.25 * eta[i]! * (1 + a * xi[i]!);
    xa += da * el.p[i]![0]; ya += da * el.p[i]![1]; xb += db * el.p[i]![0]; yb += db * el.p[i]![1];
  }
  return Math.abs(xa * yb - xb * ya);
}

/** Natural coordinates of a point of the element's plane (Newton on the bilinear map). */
function natural(el: Element, q: P2): [number, number] {
  if (el.kind === 'plate') {
    const [p0, p1, p2] = el.p as [P2, P2, P2];
    const d = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    const r = ((q[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (q[1] - p0[1])) / d;
    const s = ((p1[0] - p0[0]) * (q[1] - p0[1]) - (q[0] - p0[0]) * (p1[1] - p0[1])) / d;
    return [r, s];
  }
  const xi = [-1, 1, 1, -1], eta = [-1, -1, 1, 1];
  let a = 0, b = 0;
  for (let it = 0; it < 30; it++) {
    const [x, y] = mapPoint(el, shape('quad', a, b));
    let xa = 0, ya = 0, xb = 0, yb = 0;
    for (let i = 0; i < 4; i++) {
      const da = 0.25 * xi[i]! * (1 + b * eta[i]!), db = 0.25 * eta[i]! * (1 + a * xi[i]!);
      xa += da * el.p[i]![0]; ya += da * el.p[i]![1]; xb += db * el.p[i]![0]; yb += db * el.p[i]![1];
    }
    const det = xa * yb - xb * ya;
    if (Math.abs(det) < 1e-300) break;
    const rx = q[0] - x, ry = q[1] - y;
    const da = (rx * yb - xb * ry) / det, db = (xa * ry - rx * ya) / det;
    a += da; b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-14) break;
  }
  return [a, b];
}

/** A point of the element's plane in 3D. */
const onPlane = (el: Element, q: P2): Vec3 => [
  el.X[0]![0] + q[0] * el.ex[0] + q[1] * el.ey[0],
  el.X[0]![1] + q[0] * el.ex[1] + q[1] * el.ey[1],
  el.X[0]![2] + q[0] * el.ex[2] + q[1] * el.ey[2],
];

// ── Quadrature ───────────────────────────────────────────────────

const G3 = [[-Math.sqrt(0.6), 5 / 9], [0, 8 / 9], [Math.sqrt(0.6), 5 / 9]] as const;
/** Degree 4 on the reference triangle (Dunavant, 6 points); weights add to 1/2. */
const T4: ReadonlyArray<[number, number, number]> = [
  [0.445948490915965, 0.445948490915965, 0.223381589678011 / 2], [0.108103018168070, 0.445948490915965, 0.223381589678011 / 2],
  [0.445948490915965, 0.108103018168070, 0.223381589678011 / 2], [0.091576213509771, 0.091576213509771, 0.109951743655322 / 2],
  [0.816847572980459, 0.091576213509771, 0.109951743655322 / 2], [0.091576213509771, 0.816847572980459, 0.109951743655322 / 2],
];
/** Degree 5 on the reference triangle (7 points); weights add to 1/2. */
const T5: ReadonlyArray<[number, number, number]> = (() => {
  const a1 = 0.059715871789770, b1 = 0.470142064105115, a2 = 0.797426985353087, b2 = 0.101286507323456;
  const w0 = 0.225 / 2, w1 = 0.132394152788506 / 2, w2 = 0.125939180544827 / 2;
  return [[1 / 3, 1 / 3, w0], [a1, b1, w1], [b1, a1, w1], [b1, b1, w1], [a2, b2, w2], [b2, a2, w2], [b2, b2, w2]];
})();

/** ∫ over a triangle of the plane (signed by its orientation), f at points of the plane. */
function triangleIntegral(t: [P2, P2, P2], f: (q: P2) => number[], size: number, levels: number): number[] {
  const out = new Array<number>(size).fill(0);
  const rec = (a: P2, b: P2, c: P2, lv: number) => {
    if (lv > 0) {
      const ab: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc: P2 = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca: P2 = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      rec(a, ab, ca, lv - 1); rec(ab, b, bc, lv - 1); rec(ca, bc, c, lv - 1); rec(ab, bc, ca, lv - 1);
      return;
    }
    const j = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    for (const [r, s, w] of T5) {
      const v = f([a[0] + r * (b[0] - a[0]) + s * (c[0] - a[0]), a[1] + r * (b[1] - a[1]) + s * (c[1] - a[1])]);
      for (let k = 0; k < size; k++) out[k] += w * j * v[k]!;
    }
  };
  rec(t[0], t[1], t[2], levels);
  return out;
}

/** ∫ over a closed polygon of the plane, by its signed fan: right for any winding. */
function polygonIntegral(poly: readonly P2[], f: (q: P2) => number[], size: number, levels: number): number[] {
  const out = new Array<number>(size).fill(0);
  for (let i = 1; i + 1 < poly.length; i++) {
    const v = triangleIntegral([poly[0]!, poly[i]!, poly[i + 1]!], f, size, levels);
    for (let k = 0; k < size; k++) out[k] += v[k]!;
  }
  return out;
}

// ── Clipping ─────────────────────────────────────────────────────

function polygonArea(p: readonly P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i]!, b = p[(i + 1) % p.length]!; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

/** The part of a polygon where g ≥ 0, g linear (Sutherland–Hodgman against one half-plane). */
export function clipHalfPlane(poly: readonly P2[], g: (p: P2) => number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const ga = g(a), gb = g(b);
    if (ga >= 0) out.push(a);
    if ((ga >= 0) !== (gb >= 0)) {
      const t = ga / (ga - gb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/**
 * The part of a convex polygon (the element, counter-clockwise) inside `outer` and in none of
 * `holes`, as convex cells. The plane is cut into strips across x at every vertex and every
 * crossing of two edges, so no edge crosses another inside a strip; each strip is cut into
 * trapezoids between consecutive edges, and a trapezoid is kept when its middle is in the
 * region. Exact for any outline and any openings, overlapping each other or reaching past the
 * outline, and the same rule the drawing samples (`shellLoadSamples`): in the outline, in no
 * opening.
 */
function regionCells(el: readonly P2[], outer: readonly P2[], holes: readonly P2[][]): P2[][] {
  const xs = el.map((p) => p[0]), ys = el.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const tol = 1e-10 * Math.max(x1 - x0, Math.max(...ys) - Math.min(...ys), 1e-300);
  const edges: Array<[P2, P2]> = [];
  for (const poly of [el, outer, ...holes]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      // Only an edge reaching the element's strip, and not across x (it lies on a strip's side).
      if (Math.max(a[0], b[0]) < x0 - tol || Math.min(a[0], b[0]) > x1 + tol || Math.abs(b[0] - a[0]) <= tol) continue;
      edges.push(a[0] <= b[0] ? [a, b] : [b, a]);
    }
  }
  const cuts = [x0, x1];
  for (const [a, b] of edges) cuts.push(a[0], b[0]);
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i]!, [c, d] = edges[j]!;
      const r: P2 = [b[0] - a[0], b[1] - a[1]], s: P2 = [d[0] - c[0], d[1] - c[1]];
      const den = r[0] * s[1] - r[1] * s[0];
      if (Math.abs(den) < 1e-300) continue;
      const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
      if (t > 0 && t < 1 && u > 0 && u < 1) cuts.push(a[0] + t * r[0]);
    }
  }
  const strips = cuts.filter((x) => x >= x0 - tol && x <= x1 + tol).sort((a, b) => a - b)
    .filter((x, i, arr) => i === 0 || x - arr[i - 1]! > tol);
  const yAt = ([a, b]: [P2, P2], x: number) => a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  const inside = (p: P2) => insidePolygon(p, el) && insidePolygon(p, outer) && !holes.some((h) => insidePolygon(p, h));
  const cells: P2[][] = [];
  for (let k = 0; k + 1 < strips.length; k++) {
    const xa = strips[k]!, xb = strips[k + 1]!, xm = (xa + xb) / 2;
    const across = edges.filter(([a, b]) => a[0] <= xa + tol && b[0] >= xb - tol)
      .map((e) => ({ ya: yAt(e, xa), yb: yAt(e, xb), ym: yAt(e, xm) })).sort((p, q) => p.ym - q.ym);
    for (let i = 0; i + 1 < across.length; i++) {
      const lo = across[i]!, hi = across[i + 1]!;
      if (hi.ym - lo.ym <= tol || !inside([xm, (lo.ym + hi.ym) / 2])) continue;
      cells.push([[xa, lo.ya], [xb, lo.yb], [xb, hi.yb], [xa, hi.ya]]);
    }
  }
  return cells;
}

/** A polygon clipped by a convex one (counter-clockwise). The subject may be any simple polygon. */
function clipConvex(subject: readonly P2[], convexCcw: readonly P2[]): P2[] {
  let out = [...subject];
  for (let i = 0; i < convexCcw.length && out.length; i++) {
    const a = convexCcw[i]!, b = convexCcw[(i + 1) % convexCcw.length]!;
    out = clipHalfPlane(out, (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
  }
  return out;
}

// ── The load ─────────────────────────────────────────────────────

function directionOf(el: Element, spec: ShellLoadSpec): { d: Vec3; factor: number } {
  if (!spec.frame) return { d: [0, 0, -1], factor: 1 };
  if (spec.frame === 'local') return { d: el.ez, factor: 1 };
  const d = unit(spec.dir ?? [0, 0, -1]);
  return { d, factor: spec.frame === 'projected' ? Math.abs(dot(el.ez, d)) : 1 };
}

/**
 * The corner forces of an area load on one shell, or null for a degenerate one. `pts` are the
 * shell's corners in node order (three for a triangle).
 */
export function shellLoadForces(kind: 'quad' | 'plate', pts: readonly ShellPoint[], spec: ShellLoadSpec): ShellLoadForces | null {
  const el = element(kind, pts);
  if (!el) return null;
  const n = el.X.length;
  const { d, factor } = directionOf(el, spec);
  const vary = spec.vary ? { ...spec.vary, dir: unit(spec.vary.dir) } : undefined;
  const lo = vary ? Math.min(vary.c1, vary.c2) : -Infinity, hi = vary ? Math.max(vary.c1, vary.c2) : Infinity;
  const field = (X: Vec3, N: number[]): number => {
    if (spec.qNodes) return N.reduce((s, v, i) => s + v * (spec.qNodes![i] ?? 0), 0);
    if (vary) return vary.q1 + (vary.q2 - vary.q1) * (dot(vary.dir, X) - vary.c1) / (vary.c2 - vary.c1);
    return spec.q;
  };

  // Integrand: [N₀q, N₁q, …, area].
  const size = n + 1;
  const done = (acc: number[]): ShellLoadForces => ({
    forces: Array.from({ length: n }, (_, i): Vec3 => [d[0] * factor * acc[i]!, d[1] * factor * acc[i]!, d[2] * factor * acc[i]!]),
    loadedArea: acc[n]!, area: el.area,
  });
  // A range from a coordinate to itself is empty, on a shell lying at it as on one crossing it.
  if (vary && vary.c1 === vary.c2) return done(new Array<number>(size).fill(0));

  const cornerC = vary ? el.X.map((x) => dot(vary.dir, x)) : [];
  const wholeInRange = !vary || cornerC.every((c) => c >= lo - 1e-12 && c <= hi + 1e-12);
  if (!spec.region && wholeInRange) {
    // The whole element: its own natural coordinates, exactly.
    const acc = new Array<number>(size).fill(0);
    const at = (a: number, b: number, w: number) => {
      const N = shape(el.kind, a, b);
      const X: Vec3 = [0, 0, 0];
      N.forEach((v, i) => { X[0] += v * el.X[i]![0]; X[1] += v * el.X[i]![1]; X[2] += v * el.X[i]![2]; });
      const dv = w * detJ(el, a, b);
      const q = field(X, N);
      for (let i = 0; i < n; i++) acc[i] += N[i]! * q * dv;
      acc[n] += dv;
    };
    if (el.kind === 'quad') { for (const [a, wa] of G3) for (const [b, wb] of G3) at(a, b, wa * wb); }
    else for (const [r, s, w] of T4) at(r, s, w);
    return done(acc);
  }

  // A piece of it: clipped in its plane, integrated over triangles.
  const ccw = polygonArea(el.p) >= 0 ? el.p : [...el.p].reverse();
  const toPlane = (P: Vec3, normal: Vec3): P2 | null => {
    const nn = unit(normal);
    const den = dot(el.ez, nn);
    if (Math.abs(den) < 1e-9) return null;
    const t = dot(el.ez, sub(el.X[0]!, P)) / den;
    const X = sub([P[0] + t * nn[0], P[1] + t * nn[1], P[2] + t * nn[2]], el.X[0]!);
    return [dot(X, el.ex), dot(X, el.ey)];
  };
  const inRange = (poly: P2[]): P2[] => {
    let out = poly;
    if (vary && out.length) {
      const c = (q: P2) => dot(vary.dir, onPlane(el, q));
      out = clipHalfPlane(out, (q) => c(q) - lo);
      if (out.length) out = clipHalfPlane(out, (q) => hi - c(q));
    }
    return out;
  };
  const cut = (poly: P2[]): P2[] => inRange(clipConvex(poly, ccw));
  const f = (q: P2): number[] => {
    const [a, b] = natural(el, q);
    const N = shape(el.kind, a, b);
    const v = field(onPlane(el, q), N);
    return [...N.map((x) => x * v), 1];
  };
  const integratePiece = (piece: P2[]): number[] => {
    if (piece.length < 3) return new Array<number>(size).fill(0);
    const v = polygonIntegral(piece, f, size, 2);
    // The fan follows the piece's winding; a clockwise region integrates negative.
    const s = polygonArea(piece) >= 0 ? 1 : -1;
    return v.map((x) => x * s);
  };
  const integrate = (poly: P2[]): number[] => integratePiece(cut(poly));

  let acc: number[];
  if (spec.region) {
    const outer = spec.region.points.map((P) => toPlane(P, spec.region!.normal));
    if (outer.some((p) => !p)) return done(new Array<number>(size).fill(0));
    // The openings that reach the element; one projected edge-on covers nothing.
    const xs = ccw.map((p) => p[0]), ys = ccw.map((p) => p[1]);
    const near = (h: P2[]) => Math.max(...h.map((p) => p[0])) > Math.min(...xs) && Math.min(...h.map((p) => p[0])) < Math.max(...xs)
      && Math.max(...h.map((p) => p[1])) > Math.min(...ys) && Math.min(...h.map((p) => p[1])) < Math.max(...ys);
    const holes = (spec.region.holes ?? []).map((h) => h.map((P) => toPlane(P, spec.region!.normal)))
      .filter((h): h is P2[] => h.length >= 3 && h.every((p) => !!p)).filter(near);
    if (!holes.length) acc = integrate(outer as P2[]);
    else {
      // In the outline and in no opening, as the drawing shows it: an opening is not subtracted
      // whole, since it may reach past the outline or overlap another.
      acc = new Array<number>(size).fill(0);
      for (const cell of regionCells(ccw, outer as P2[], holes)) {
        const v = integratePiece(inRange(cell));
        for (let k = 0; k < size; k++) acc[k] += v[k]!;
      }
    }
  } else {
    acc = integrate([...ccw]);
  }
  return done(acc);
}

/**
 * A force at a point of a shell, as the corner forces its shape functions give (the consistent
 * nodal loads of a concentrated load). The point is projected onto the shell along `normal`; null
 * when it falls outside it.
 */
export function shellPointForces(kind: 'quad' | 'plate', pts: readonly ShellPoint[], at: Vec3, force: Vec3, normal: Vec3 = [0, 0, 1]): Vec3[] | null {
  const el = element(kind, pts);
  if (!el) return null;
  const nn = unit(normal);
  const den = dot(el.ez, nn);
  if (Math.abs(den) < 1e-9) return null;
  const t = dot(el.ez, sub(el.X[0]!, at)) / den;
  const X = sub([at[0] + t * nn[0], at[1] + t * nn[1], at[2] + t * nn[2]], el.X[0]!);
  const [a, b] = natural(el, [dot(X, el.ex), dot(X, el.ey)]);
  const tol = 1e-9;
  const inside = el.kind === 'plate' ? a >= -tol && b >= -tol && a + b <= 1 + tol : Math.abs(a) <= 1 + tol && Math.abs(b) <= 1 + tol;
  if (!inside) return null;
  return shape(el.kind, a, b).map((N): Vec3 => [N * force[0], N * force[1], N * force[2]]);
}

/** The shell's normal (the engine's local z) and area: what a tool needs to choose a sign. */
export function shellFrame(kind: 'quad' | 'plate', pts: readonly ShellPoint[]): { ez: Vec3; centroid: Vec3; area: number } | null {
  const el = element(kind, pts);
  if (!el) return null;
  const c = el.X.reduce<Vec3>((s, x) => [s[0] + x[0] / el.X.length, s[1] + x[1] / el.X.length, s[2] + x[2] / el.X.length], [0, 0, 0]);
  return { ez: el.ez, centroid: c, area: el.area };
}

/** The shell's shape functions at a point of it (projected along its normal), or null outside. */
export function shellShapeAt(kind: 'quad' | 'plate', pts: readonly ShellPoint[], at: Vec3): number[] | null {
  const el = element(kind, pts);
  if (!el) return null;
  const X = sub(at, el.X[0]!);
  const [a, b] = natural(el, [dot(X, el.ex), dot(X, el.ey)]);
  const tol = 1e-6;
  const inside = el.kind === 'plate' ? a >= -tol && b >= -tol && a + b <= 1 + tol : Math.abs(a) <= 1 + tol && Math.abs(b) <= 1 + tol;
  return inside ? shape(el.kind, a, b) : null;
}

/**
 * Points of a shell with the load's value there, for drawing: a grid in natural coordinates, the
 * value zero outside the region or the variation's range. `dir` is the force's direction for a
 * positive value.
 */
export function shellLoadSamples(kind: 'quad' | 'plate', pts: readonly ShellPoint[], spec: ShellLoadSpec, n = 3): { dir: Vec3; samples: Array<{ X: Vec3; q: number }> } | null {
  const el = element(kind, pts);
  if (!el) return null;
  const { d } = directionOf(el, spec);
  const vary = spec.vary ? { ...spec.vary, dir: unit(spec.vary.dir) } : undefined;
  const lo = vary ? Math.min(vary.c1, vary.c2) : -Infinity, hi = vary ? Math.max(vary.c1, vary.c2) : Infinity;
  // The region as a polygon in a plane normal to its direction.
  let inRegion: (X: Vec3) => boolean = () => true;
  if (spec.region) {
    const nn = unit(spec.region.normal);
    const u = unit(Math.abs(nn[0]) < 0.9 ? [0, nn[2], -nn[1]] : [-nn[2], 0, nn[0]]);
    const v: Vec3 = [nn[1] * u[2] - nn[2] * u[1], nn[2] * u[0] - nn[0] * u[2], nn[0] * u[1] - nn[1] * u[0]];
    const to2 = (P: Vec3): P2 => [dot(P, u), dot(P, v)];
    const outer = spec.region.points.map(to2), holes = (spec.region.holes ?? []).map((h) => h.map(to2));
    inRegion = (X) => { const p = to2(X); return insidePolygon(p, outer) && !holes.some((h) => insidePolygon(p, h)); };
  }
  const samples: Array<{ X: Vec3; q: number }> = [];
  const at = (a: number, b: number) => {
    const N = shape(el.kind, a, b);
    const X: Vec3 = [0, 0, 0];
    N.forEach((w, i) => { X[0] += w * el.X[i]![0]; X[1] += w * el.X[i]![1]; X[2] += w * el.X[i]![2]; });
    let q = spec.q;
    if (spec.qNodes) q = N.reduce((s, w, i) => s + w * (spec.qNodes![i] ?? 0), 0);
    else if (vary) {
      const c = dot(vary.dir, X);
      // A range from a coordinate to itself is empty (as `shellLoadForces` integrates it).
      q = c < lo - 1e-9 || c > hi + 1e-9 || vary.c2 === vary.c1 ? 0 : vary.q1 + (vary.q2 - vary.q1) * (c - vary.c1) / (vary.c2 - vary.c1);
    }
    samples.push({ X, q: inRegion(X) ? q : 0 });
  };
  if (el.kind === 'quad') { for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) at(-1 + 2 * i / n, -1 + 2 * j / n); }
  else for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) at(i / n, j / n);
  return { dir: d, samples };
}

function insidePolygon(p: P2, poly: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
