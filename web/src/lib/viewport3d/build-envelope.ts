/**
 * The building's envelope for the build timelapse: cladding and glass put on the façades once
 * the structure stands, and glass railings on the balconies. It is a picture, not part of the
 * model: nothing here is analysed.
 *
 * Pure. From the pieces the timelapse builds (scene space, Z up) it finds the floors and, on each
 * storey, the outline the envelope closes: the convex hull of the columns standing in it (of its
 * beams and slab edges when it has no columns), so a slab cantilevered past the columns stays out,
 * as a balcony, and a re-entrant corner of an L-shaped plan stays open. Each side of the outline
 * that the floor's beams or slab edges cover is split into bays at the columns and at the ends of
 * any wall (vertical shell) on it: a bay a wall stands in is clad solid, the others are glazed.
 * A slab outside the outline is a balcony, and its free edges get a railing.
 * `envelopeSchedule` then puts it all up floor by floor, each floor going round the building.
 */
import type { BuildPiece, BuildStep, P3 } from './build-timelapse';

interface P2 { x: number; y: number }

export interface EnvelopeBay {
  key: string;
  /**
   * `glazed`: a spandrel, glass and a slab-edge band. `solid`: cladding from floor to floor, where
   * a wall stands. `rail`: a balcony's glass railing on the slab edge.
   */
  kind: 'glazed' | 'solid' | 'rail';
  /** The bay's ends on its line, in plan. */
  a: P2;
  b: P2;
  /** Its foot and its head: the floors below and above, or for a railing its slab and its top. */
  z0: number;
  z1: number;
  /** Unit plan normal pointing out of the building (out of the balcony, for a railing). */
  out: P2;
  /** Turn, by floor: 1 for the first storey above the ground; a railing goes with the storey above its slab. */
  floor: number;
}

/** A balcony railing's height above its slab (m). */
export const RAIL_HEIGHT = 1.05;

const cross2 = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Counter-clockwise convex hull (Andrew's monotone chain). */
function hull(points: P2[]): P2[] {
  const pts = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  if (pts.length < 3) return pts;
  const lower: P2[] = [], upper: P2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 1e-12) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross2(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 1e-12) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Where `p` falls along the edge a→b, as a length from a, and how far off its line it is. */
function onEdge(a: P2, b: P2, p: P2): { s: number; off: number; len: number } {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const rx = p.x - a.x, ry = p.y - a.y;
  return { s: rx * ux + ry * uy, off: Math.abs(-rx * uy + ry * ux), len };
}

/** Whether `p` is inside the counter-clockwise ring, at least `tol` in from its sides. */
function inside(ring: P2[], p: P2, tol: number): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    if (cross2(a, b, p) / len < tol) return false;
  }
  return true;
}

/** Overlapping intervals merged (within `tol`). */
function union(iv: Array<[number, number]>, tol: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const c of [...iv].sort((u, v) => u[0] - v[0])) {
    const last = out[out.length - 1];
    if (last && c[0] <= last[1] + tol) last[1] = Math.max(last[1], c[1]);
    else out.push([c[0], c[1]]);
  }
  return out;
}

const centroid2 = (poly: P2[]): P2 => poly.reduce((s, q) => ({ x: s.x + q.x / poly.length, y: s.y + q.y / poly.length }), { x: 0, y: 0 });

/** The façade bays and balcony railings of the structure; none for a model with no floor above its foot. */
export function facadeBays(pieces: readonly BuildPiece[]): EnvelopeBay[] {
  if (pieces.length === 0) return [];
  let zMin = Infinity, span = 0;
  {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const p of pieces) for (const q of p.kind === 'member' ? [p.a, p.b] : p.pts) {
      zMin = Math.min(zMin, q.z); z1 = Math.max(z1, q.z);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
    span = Math.max(x1 - x0, y1 - y0, z1 - zMin, 1e-6);
  }
  const tol = Math.max(0.05, span * 0.005);
  const band = (z: number) => Math.round(z / tol);

  // Horizontal lines (beams, slab edges) and slabs by floor; columns and walls.
  const lines = new Map<number, Array<{ a: P2; b: P2; z: number }>>();
  const slabs = new Map<number, P2[][]>();
  const addLine = (a: P3, b: P3) => {
    const z = (a.z + b.z) / 2;
    if (z <= zMin + tol) return;
    const k = band(z);
    const list = lines.get(k) ?? [];
    list.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, z });
    lines.set(k, list);
  };
  const columns: Array<{ p: P2; z0: number; z1: number }> = [];
  const walls: Array<{ a: P2; b: P2; z0: number; z1: number }> = [];
  for (const p of pieces) {
    if (p.kind === 'member') {
      const dz = Math.abs(p.b.z - p.a.z), L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y, dz);
      if (L < 1e-9) continue;
      if (dz / L < 0.05) addLine(p.a, p.b);
      else if (dz / L > 0.95) columns.push({ p: { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 }, z0: Math.min(p.a.z, p.b.z), z1: Math.max(p.a.z, p.b.z) });
    } else {
      const zs = p.pts.map((q) => q.z);
      const lo = Math.min(...zs), hi = Math.max(...zs);
      if (hi - lo < tol) {
        for (let i = 0; i < p.pts.length; i++) addLine(p.pts[i]!, p.pts[(i + 1) % p.pts.length]!);
        if (lo > zMin + tol) {
          const k = band(lo);
          const list = slabs.get(k) ?? [];
          list.push(p.pts.map((q) => ({ x: q.x, y: q.y })));
          slabs.set(k, list);
        }
      } else {
        // A wall: its plan trace, the two points farthest apart.
        let best: [P3, P3] = [p.pts[0]!, p.pts[0]!], d = -1;
        for (const q of p.pts) for (const r of p.pts) {
          const e = Math.hypot(q.x - r.x, q.y - r.y);
          if (e > d) { d = e; best = [q, r]; }
        }
        if (d > tol) walls.push({ a: { x: best[0].x, y: best[0].y }, b: { x: best[1].x, y: best[1].y }, z0: lo, z1: hi });
      }
    }
  }

  const floors = [...lines.keys()].sort((a, b) => a - b);
  const levelZ = (k: number) => { const l = lines.get(k)!; return l.reduce((s, x) => s + x.z, 0) / l.length; };
  const bays: EnvelopeBay[] = [];
  floors.forEach((k, fi) => {
    const segs = lines.get(k)!;
    const z1 = levelZ(k);
    const z0 = fi === 0 ? zMin : levelZ(floors[fi - 1]!);
    const zm = (z0 + z1) / 2;
    // The outline: the columns standing in this storey, else its beams and slab edges.
    const colPts: P2[] = [];
    for (const c of columns) {
      if (c.z0 >= z1 - tol || c.z1 <= z0 + tol) continue;
      if (!colPts.some((q) => Math.hypot(q.x - c.p.x, q.y - c.p.y) <= tol)) colPts.push(c.p);
    }
    let ring = colPts.length >= 3 ? hull(colPts) : [];
    if (ring.length < 3) ring = hull(segs.flatMap((l) => [l.a, l.b]));
    if (ring.length < 3) return;

    for (let e = 0; e < ring.length; e++) {
      const A = ring[e]!, B = ring[(e + 1) % ring.length]!;
      const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
      // The stretch of a line (or wall) lying on this side, as lengths along it.
      const along = (p: P2, q: P2, off: number): [number, number] | null => {
        const u = onEdge(A, B, p), v = onEdge(A, B, q);
        if (u.off > off || v.off > off) return null;
        const s0 = Math.max(0, Math.min(u.s, v.s)), s1 = Math.min(len, Math.max(u.s, v.s));
        return s1 - s0 > tol ? [s0, s1] : null;
      };
      const merged = union(segs.map((l) => along(l.a, l.b, tol)).filter((x): x is [number, number] => !!x), tol);
      if (merged.length === 0) continue;
      const cuts: number[] = [];
      for (const c of columns) {
        if (c.z1 < z0 + tol || c.z0 > z1 - tol) continue;
        const r = onEdge(A, B, c.p);
        if (r.off <= tol) cuts.push(r.s);
      }
      const walled = union(walls.filter((w) => zm >= w.z0 - tol && zm <= w.z1 + tol)
        .map((w) => along(w.a, w.b, tol * 2)).filter((x): x is [number, number] => !!x), tol);
      const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
      // Counter-clockwise ring: the outside is to the right of each side.
      const out = { x: uy, y: -ux };
      for (const [m0, m1] of merged) {
        const within = (s: number) => s > m0 + tol && s < m1 - tol;
        const stops = [m0, ...cuts.filter(within), ...walled.flat().filter(within), m1].sort((u, v) => u - v)
          .filter((s, i, all) => i === 0 || s - all[i - 1]! > tol);
        // No column nor wall on the side (a flat slab's edge): bays of about 3 m.
        if (cuts.length === 0 && walled.length === 0 && m1 - m0 > 4.5) {
          const n = Math.round((m1 - m0) / 3);
          stops.splice(1, 0, ...Array.from({ length: n - 1 }, (_, i) => m0 + ((i + 1) * (m1 - m0)) / n));
        }
        for (let i = 0; i + 1 < stops.length; i++) {
          const s0 = stops[i]!, s1 = stops[i + 1]!, sm = (s0 + s1) / 2;
          bays.push({
            key: `f${fi + 1}:${e}:${i}:${Math.round(s0 * 100)}`,
            kind: walled.some(([w0, w1]) => sm > w0 && sm < w1) ? 'solid' : 'glazed',
            a: { x: A.x + ux * s0, y: A.y + uy * s0 }, b: { x: A.x + ux * s1, y: A.y + uy * s1 },
            z0, z1, out, floor: fi + 1,
          });
        }
      }
    }

    // Balconies at this floor: slabs outside the outline, railed along their free edges (not
    // shared with another balcony slab, not on the outline).
    const onRing = (p: P2, q: P2) => ring.some((A, i) => {
      const B = ring[(i + 1) % ring.length]!;
      const u = onEdge(A, B, p), v = onEdge(A, B, q);
      return u.off <= tol && v.off <= tol && u.s >= -tol && u.s <= u.len + tol && v.s >= -tol && v.s <= v.len + tol;
    });
    const balconies = (slabs.get(k) ?? []).filter((poly) => !inside(ring, centroid2(poly), -tol));
    const edgeKey = (p: P2, q: P2) => {
      const a = `${Math.round(p.x / tol)},${Math.round(p.y / tol)}`, b = `${Math.round(q.x / tol)},${Math.round(q.y / tol)}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };
    const count = new Map<string, number>();
    for (const poly of balconies) poly.forEach((p, i) => { const key = edgeKey(p, poly[(i + 1) % poly.length]!); count.set(key, (count.get(key) ?? 0) + 1); });
    balconies.forEach((poly, bi) => {
      const c = centroid2(poly);
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length]!;
        const l = Math.hypot(q.x - p.x, q.y - p.y);
        if (l <= tol || count.get(edgeKey(p, q))! > 1 || onRing(p, q)) return;
        let out = { x: (q.y - p.y) / l, y: -(q.x - p.x) / l };
        if (out.x * ((p.x + q.x) / 2 - c.x) + out.y * ((p.y + q.y) / 2 - c.y) < 0) out = { x: -out.x, y: -out.y };
        bays.push({ key: `r${fi + 1}:${bi}:${i}`, kind: 'rail', a: p, b: q, z0: z1, z1: z1 + RAIL_HEIGHT, out, floor: fi + 2 });
      });
    });
  });
  return bays;
}

/** Each bay's turn: its cladding, then its glass a little after. */
export interface EnvelopeStep {
  bay: EnvelopeBay;
  cladding: BuildStep;
  glass: BuildStep;
}

/**
 * When each bay goes on, from `start` over `duration` seconds: floor by floor from the bottom,
 * each floor round the building. A bay rises from its foot like a curtain.
 */
export function envelopeSchedule(bays: readonly EnvelopeBay[], start: number, duration: number): EnvelopeStep[] {
  if (bays.length === 0) return [];
  let cx = 0, cy = 0;
  for (const b of bays) { cx += (b.a.x + b.b.x) / 2; cy += (b.a.y + b.b.y) / 2; }
  cx /= bays.length; cy /= bays.length;
  const angle = (b: EnvelopeBay) => Math.atan2((b.a.y + b.b.y) / 2 - cy, (b.a.x + b.b.x) / 2 - cx);
  const order = [...bays].sort((p, q) => p.floor - q.floor || angle(p) - angle(q));
  const n = order.length;
  const grow = Math.min(0.8, Math.max(0.2, (duration / n) * 8), duration * 0.4);
  const spacing = n > 1 ? Math.max(0, duration - grow * 1.4) / (n - 1) : 0;
  return order.map((bay, i) => {
    const t = start + i * spacing;
    const foot = (z: number): P3 => ({ x: (bay.a.x + bay.b.x) / 2, y: (bay.a.y + bay.b.y) / 2, z });
    const rise = (t0: number, z: number): BuildStep => ({
      key: `${bay.key}`, start: t0, end: t0 + grow, origin: foot(z), dir: { x: 0, y: 0, z: 1 }, kind: 'member', top: bay.z1,
    });
    return { bay, cladding: rise(t, bay.z0), glass: rise(t + grow * 0.4, bay.z0) };
  });
}
