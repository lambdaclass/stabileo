import type { Footprint, P2 } from './draw-on-plan';

export type Seg = [[number, number], [number, number]];
/** The template's segments within `r` of a point, laid on the model. */
export type SegmentsNear = (x: number, y: number, r: number) => Seg[];

const PARALLEL = Math.sin((1 * Math.PI) / 180);
const ON_LINE = 0.01;

const dirOf = (s: Seg): P2 | null => {
  const dx = s[1][0] - s[0][0], dy = s[1][1] - s[0][1], L = Math.hypot(dx, dy);
  return L < 1e-6 ? null : { x: dx / L, y: dy / L };
};
const cross = (a: P2, b: P2) => a.x * b.y - a.y * b.x;
const dot = (a: P2, b: P2) => a.x * b.x + a.y * b.y;

/** The directions the segments run in, folded to [0°, 90°) for a rectangle or [0°, 180°) for a band, one per degree. */
function directions(segs: Seg[], fold: number): P2[] {
  const seen = new Map<number, P2>();
  for (const s of segs) {
    const d = dirOf(s);
    if (!d) continue;
    let a = Math.atan2(d.y, d.x) * 180 / Math.PI;
    a = ((a % fold) + fold) % fold;
    const key = Math.round(a) % fold;
    if (!seen.has(key)) seen.set(key, { x: Math.cos(a * Math.PI / 180), y: Math.sin(a * Math.PI / 180) });
  }
  return [...seen.values()];
}

/** How far along `d` from `p` the first segment running along `side` is met, or null. */
function hit(segs: Seg[], p: P2, d: P2, side: P2): number | null {
  let best: number | null = null;
  for (const s of segs) {
    const sd = dirOf(s);
    if (!sd || Math.abs(cross(sd, side)) > PARALLEL) continue;
    const a = { x: s[0][0], y: s[0][1] }, e = { x: s[1][0] - s[0][0], y: s[1][1] - s[0][1] };
    const den = cross(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const w = { x: a.x - p.x, y: a.y - p.y };
    const t = cross(w, e) / den, u = cross(w, d) / den;
    if (t > 1e-4 && u >= -1e-6 && u <= 1 + 1e-6 && (best === null || t < best)) best = t;
  }
  return best;
}

/** Whether the line from `a` to `b` is drawn along its length, by one segment or several end to end. */
function drawn(segs: Seg[], a: P2, b: P2): boolean {
  for (const f of [0.08, 0.3, 0.5, 0.7, 0.92]) {
    const q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    const on = segs.some((s) => {
      const e = { x: s[1][0] - s[0][0], y: s[1][1] - s[0][1] }, L2 = dot(e, e);
      if (L2 < 1e-12) return false;
      const t = ((q.x - s[0][0]) * e.x + (q.y - s[0][1]) * e.y) / L2;
      return t >= -1e-6 && t <= 1 + 1e-6 && Math.hypot(s[0][0] + e.x * t - q.x, s[0][1] + e.y * t - q.y) <= ON_LINE;
    });
    if (!on) return false;
  }
  return true;
}

/**
 * The rectangle of the template around `p`: its four sides drawn, any angle, each between `min` and
 * `max` long; the smallest when one lies in another (a hatch inside a column is passed over, since
 * only lines along the sides are read).
 */
export function captureRect(near: SegmentsNear, p: P2, opts: { min?: number; max?: number } = {}): Footprint | null {
  const min = opts.min ?? 0.05, max = opts.max ?? 3;
  const segs = near(p.x, p.y, max);
  let best: Footprint | null = null;
  for (const u of directions(segs, 90)) {
    const v = { x: -u.y, y: u.x };
    const up = hit(segs, p, u, v), um = hit(segs, p, { x: -u.x, y: -u.y }, v);
    const vp = hit(segs, p, v, u), vm = hit(segs, p, { x: -v.x, y: -v.y }, u);
    if (up === null || um === null || vp === null || vm === null) continue;
    const b = up + um, h = vp + vm;
    if (b < min || h < min || b > max || h > max) continue;
    const c = { x: p.x + u.x * (up - um) / 2 + v.x * (vp - vm) / 2, y: p.y + u.y * (up - um) / 2 + v.y * (vp - vm) / 2 };
    const at = (i: number, j: number) => ({ x: c.x + u.x * i * b / 2 + v.x * j * h / 2, y: c.y + u.y * i * b / 2 + v.y * j * h / 2 });
    const [k0, k1, k2, k3] = [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
    if (!drawn(segs, k0, k1) || !drawn(segs, k1, k2) || !drawn(segs, k2, k3) || !drawn(segs, k3, k0)) continue;
    if (!best || b * h < best.b * best.h) best = { center: c, u, v, b, h };
  }
  return best;
}

/** How far a line drawn along `u` through `q` runs on each side of `q`, its pieces followed end to end. */
function reach(near: SegmentsNear, q: P2, u: P2, cap: number): [number, number] {
  const ends: [number, number] = [0, 0];
  for (const [k, sgn] of [[0, -1], [1, 1]] as const) {
    let s = 0;
    for (let step = 0; step < 200 && s < cap; step++) {
      const at = { x: q.x + u.x * s * sgn, y: q.y + u.y * s * sgn };
      let further = s;
      for (const seg of near(at.x, at.y, 0.03)) {
        const d = dirOf(seg);
        if (!d || Math.abs(cross(d, u)) > PARALLEL) continue;
        const off = Math.abs((seg[0][0] - q.x) * -u.y + (seg[0][1] - q.y) * u.x);
        if (off > ON_LINE) continue;
        for (const e of seg) further = Math.max(further, ((e[0] - q.x) * u.x + (e[1] - q.y) * u.y) * sgn);
      }
      if (further <= s + 1e-4) break;
      s = Math.min(further + 0.02, cap);
    }
    ends[k] = Math.max(0, s - 0.02);
  }
  return ends;
}

export interface Band { a: P2; b: P2; width: number; u: P2 }

/**
 * The band between the two parallel lines of the template on each side of `p` (a wall drawn with
 * its two faces), `min` to `max` apart, the narrowest: its axis from where both faces are drawn to
 * where either stops, at most `cap` each way, and its width.
 */
export function captureBand(near: SegmentsNear, p: P2, opts: { min?: number; max?: number; cap?: number } = {}): Band | null {
  const min = opts.min ?? 0.05, max = opts.max ?? 0.8, cap = opts.cap ?? 30;
  const segs = near(p.x, p.y, max);
  let best: Band | null = null;
  for (const u of directions(segs, 180)) {
    const n = { x: -u.y, y: u.x };
    const dp = hit(segs, p, n, u), dm = hit(segs, p, { x: -n.x, y: -n.y }, u);
    if (dp === null || dm === null) continue;
    const w = dp + dm;
    if (w < min || w > max || (best && w >= best.width)) continue;
    const fp = { x: p.x + n.x * dp, y: p.y + n.y * dp }, fm = { x: p.x - n.x * dm, y: p.y - n.y * dm };
    const [rp0, rp1] = reach(near, fp, u, cap), [rm0, rm1] = reach(near, fm, u, cap);
    const back = Math.min(rp0, rm0), ahead = Math.min(rp1, rm1);
    if (back + ahead < 0.1) continue;
    const c = { x: p.x + n.x * (dp - dm) / 2, y: p.y + n.y * (dp - dm) / 2 };
    best = { a: { x: c.x - u.x * back, y: c.y - u.y * back }, b: { x: c.x + u.x * ahead, y: c.y + u.y * ahead }, width: w, u };
  }
  return best;
}
