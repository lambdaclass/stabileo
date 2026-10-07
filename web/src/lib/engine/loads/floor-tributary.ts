/**
 * How a panel's area load reaches its sides (`floor-loads.ts`), in the panel's plane.
 *
 *   two way   each side takes the region it sweeps: on a convex panel the region nearer to it
 *             than to any other (the 45° pattern), elsewhere the straight skeleton's
 *             (`floor-skeleton.ts`). The load per metre at a point of the side is q times the depth
 *             of that region there, inside the zone and outside its openings when a zone is given.
 *             It is linear between breakpoints (the regions' corners, the zone's corners and where
 *             their edges cross), so every side receives a sum of partial linear loads that
 *             integrates to q times its area. Beside a re-entrant corner a side's region reaches
 *             past the side's end; that part is carried at the end node, with its area.
 *   one way   strips along the span rest on the two sides they reach, half to each; a strip that
 *             crosses an opening rests on the opening's sides. Each strip is inside a zone or out
 *             of it: a zone edge across a strip would give a load that is not linear along the
 *             side, and the panel is left out and reported.
 *
 * Pure.
 */
import { skeletonCells, type P2 } from './floor-skeleton';

export interface Side {
  /** Start and end of the side, the panel on its left. */
  a: P2; b: P2;
  u: P2; len: number;
  /** Inward normal. */
  n: P2;
  /** The members along it, by arc length from a. */
  segments: Array<{ elementId: number; s0: number; s1: number; forward: boolean }>;
  /** The nodes at a and b. */
  nodeA: number; nodeB: number;
}

export interface Piece { s0: number; s1: number; q0: number; q1: number }

/** A region the load acts in: an outline and its openings, in the panel's plane. */
export interface Zone2D { outer: P2[]; holes: P2[][] }

export interface SideShare {
  pieces: Piece[];
  /** Load past the side's ends, kN (q included): carried at nodeA and nodeB. */
  atA: number; atB: number;
}

const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const along = (e: Side, p: P2) => (p[0] - e.a[0]) * e.u[0] + (p[1] - e.a[1]) * e.u[1];
const dist = (e: Side, p: P2) => (p[0] - e.a[0]) * e.n[0] + (p[1] - e.a[1]) * e.n[1];

function signedArea(p: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]!; a += p[i]![0] * q[1] - q[0] * p[i]![1]; }
  return a / 2;
}

/** Sutherland–Hodgman against g(p) ≤ 0, g linear. */
function clip(poly: P2[], g: (p: P2) => number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const gp = g(p), gq = g(q);
    if (gp <= 1e-12) out.push(p);
    if ((gp < -1e-12 && gq > 1e-12) || (gp > 1e-12 && gq < -1e-12)) {
      const t = gp / (gp - gq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Where the vertical line x = s crosses a polygon's edges: the y values. */
function crossings(poly: readonly P2[], s: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    if ((p[0] <= s) === (q[0] <= s)) continue;
    out.push(p[1] + (q[1] - p[1]) * (s - p[0]) / (q[0] - p[0]));
  }
  return out;
}

/** The intervals of x = s inside a zone (outline and openings, even-odd). */
function zoneIntervals(loops: readonly (readonly P2[])[], s: number): Array<[number, number]> {
  const ys = loops.flatMap((l) => crossings(l, s)).sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < ys.length; i += 2) out.push([ys[i]!, ys[i + 1]!]);
  return out;
}

function segCross(a: P2, b: P2, c: P2, d: P2): P2 | null {
  const r: P2 = [b[0] - a[0], b[1] - a[1]], q: P2 = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-14) return null;
  const w: P2 = [c[0] - a[0], c[1] - a[1]];
  const t = (w[0] * q[1] - w[1] * q[0]) / den, u = (w[0] * r[1] - w[1] * r[0]) / den;
  return t >= -1e-12 && t <= 1 + 1e-12 && u >= -1e-12 && u <= 1 + 1e-12 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
}

/** One side's share from the cells of its region (plane coordinates). */
function shareOf(e: Side, cells: P2[][], q: number, zone?: Zone2D): SideShare {
  const local = (p: P2): P2 => [along(e, p), dist(e, p)];
  const cs = cells.map((c) => c.map(local));
  const zl = zone ? [zone.outer, ...zone.holes].map((l) => l.map(local)) : null;
  const chord = (s: number): number => {
    let total = 0;
    for (const c of cs) {
      const ys = crossings(c, s);
      if (ys.length < 2) continue;
      const lo = Math.min(...ys), hi = Math.max(...ys);
      if (!zl) { total += hi - lo; continue; }
      for (const [a, b] of zoneIntervals(zl, s)) total += Math.max(0, Math.min(hi, b) - Math.max(lo, a));
    }
    return total;
  };
  const bp = new Set<number>([0, e.len]);
  for (const c of cs) for (const p of c) bp.add(p[0]);
  if (zl) {
    for (const l of zl) for (const p of l) bp.add(p[0]);
    for (const c of cs) for (let i = 0; i < c.length; i++) for (const l of zl) for (let j = 0; j < l.length; j++) {
      const x = segCross(c[i]!, c[(i + 1) % c.length]!, l[j]!, l[(j + 1) % l.length]!);
      if (x) bp.add(x[0]);
    }
  }
  const ss = [...bp].map((s) => Math.round(s * 1e9) / 1e9).sort((a, b) => a - b).filter((s, i, a) => i === 0 || s - a[i - 1]! > 1e-9);
  const out: SideShare = { pieces: [], atA: 0, atB: 0 };
  for (let i = 0; i + 1 < ss.length; i++) {
    const s0 = ss[i]!, s1 = ss[i + 1]!;
    // Linear inside: read at two inner points, carried to the ends.
    const h = s1 - s0, c1 = chord(s0 + h / 3), c2 = chord(s0 + 2 * h / 3);
    const q0 = q * (2 * c1 - c2), q1 = q * (2 * c2 - c1);
    if (Math.abs(q0) < 1e-12 && Math.abs(q1) < 1e-12) continue;
    if (s1 <= 1e-9) out.atA += ((q0 + q1) / 2) * h;
    else if (s0 >= e.len - 1e-9) out.atB += ((q0 + q1) / 2) * h;
    else out.pieces.push({ s0, s1, q0, q1 });
  }
  return out;
}

/** Two way: each side's share. Convex panels without openings by nearest side; others by the skeleton. */
export function twoWayShares(sides: Side[], holes: Side[][], q: number, zone?: Zone2D): SideShare[] | null {
  const all = [...sides, ...holes.flat()];
  let cells: P2[][][];
  if (!holes.length && isConvex(sides.map((s) => s.a))) {
    const corners = sides.map((s) => s.a);
    cells = sides.map((e, k) => {
      let face: P2[] = corners;
      for (let f = 0; f < sides.length && face.length >= 3; f++) {
        if (f !== k) { const g = sides[f]!; face = clip(face, (p) => dist(e, p) - dist(g, p)); }
      }
      return face.length >= 3 ? [face] : [];
    });
  } else {
    const c = skeletonCells([sides.map((s) => s.a), ...holes.map((h) => h.map((s) => s.a))]);
    if (!c) return null;
    cells = c;
  }
  return all.map((e, k) => shareOf(e, cells[k]!, q, zone));
}

/** One way along d: strips resting on the sides they reach. Null when a zone cuts a strip. */
export function oneWayShares(sides: Side[], holes: Side[][], d: P2, q: number, zone?: Zone2D): SideShare[] | null {
  const all = [...sides, ...holes.flat()];
  const out: SideShare[] = all.map(() => ({ pieces: [], atA: 0, atB: 0 }));
  const n: P2 = [-d[1], d[0]];
  const ts0 = all.map((s) => dot(n, s.a));
  if (zone) for (const l of [zone.outer, ...zone.holes]) for (const p of l) ts0.push(dot(n, p));
  const ts = [...new Set(ts0.map((t) => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b);
  const sAt = (s: Side, t: number) => (t - dot(n, s.a)) / dot(s.u, n);
  const point = (s: Side, t: number): P2 => { const sa = sAt(s, t); return [s.a[0] + s.u[0] * sa, s.a[1] + s.u[1] * sa]; };
  const zl = zone ? [zone.outer, ...zone.holes] : null;
  /** The share of the strip at t between two points inside the zone. */
  const inside = (p: P2, r: P2): number => {
    if (!zl) return 1;
    // Along the strip in the zone's frame: rotate so the strip runs along x.
    const rot = (x: P2): P2 => [dot(d, x), dot(n, x)];
    const loops = zl.map((l) => l.map(rot).map(([a, b]): P2 => [b, a]));
    const t = dot(n, p);
    const lo = dot(d, p), hi = dot(d, r);
    let len = 0;
    for (const [a, b] of zoneIntervals(loops, t)) len += Math.max(0, Math.min(hi, b) - Math.max(lo, a));
    return hi - lo > 0 ? len / (hi - lo) : 0;
  };
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]!, t1 = ts[i + 1]!;
    if (t1 - t0 < 1e-9) continue;
    const at = (t: number) => {
      const hits: Array<{ k: number; r: number }> = [];
      all.forEach((s, k) => {
        if (Math.abs(dot(s.u, n)) < 1e-12) return;
        const sa = sAt(s, t);
        if (sa < -1e-9 || sa > s.len + 1e-9) return;
        hits.push({ k, r: dot(d, point(s, t)) });
      });
      return hits.sort((a, b) => a.r - b.r);
    };
    const tm = (t0 + t1) / 2;
    const hits = at(tm);
    for (let j = 0; j + 1 < hits.length; j += 2) {
      const near = all[hits[j]!.k]!, far = all[hits[j + 1]!.k]!;
      const fr = [t0 + (t1 - t0) * 0.02, tm, t1 - (t1 - t0) * 0.02].map((t) => inside(point(near, t), point(far, t)));
      if (fr.every((f) => f < 1e-9)) continue;
      if (fr.some((f) => Math.abs(f - 1) > 1e-9)) return null;
      const L = (t: number) => dot(d, point(far, t)) - dot(d, point(near, t));
      for (const [side, k] of [[near, hits[j]!.k], [far, hits[j + 1]!.k]] as const) {
        const f = Math.abs(dot(side.u, n));
        const sa = sAt(side, t0), sb = sAt(side, t1);
        const [s0, s1, qa, qb] = sa <= sb ? [sa, sb, L(t0), L(t1)] : [sb, sa, L(t1), L(t0)];
        out[k]!.pieces.push({ s0: Math.max(0, s0), s1: Math.min(side.len, s1), q0: (q * qa * f) / 2, q1: (q * qb * f) / 2 });
      }
    }
  }
  return out;
}

export function isConvex(p: P2[]): boolean {
  if (p.length < 3) return false;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!, c = p[(i + 2) % p.length]!;
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-9) return false;
  }
  return true;
}

export { signedArea };
