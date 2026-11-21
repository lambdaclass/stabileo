import { EPS_CU, ES, type Ts500Mat } from './basis';

/** A bar about the centre of a b × h rectangle: x along b, y along h, m and m². */
export interface Bar2 { x: number; y: number; area: number }

export interface RectSection { b: number; h: number; bars: Bar2[] }

const KN = 1000;

type Pt = [number, number];

function clipArea(poly: Pt[], nx: number, ny: number, limit: number): { area: number; cx: number; cy: number } {
  const inside = (p: Pt) => p[0] * nx + p[1] * ny >= limit;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const ip = inside(p), iq = inside(q);
    if (ip) out.push(p);
    if (ip !== iq) {
      const sp = p[0] * nx + p[1] * ny, sq = q[0] * nx + q[1] * ny;
      const u = (limit - sp) / (sq - sp);
      out.push([p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])]);
    }
  }
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < out.length; i++) {
    const p = out[i]!, q = out[(i + 1) % out.length]!;
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr;
  }
  a /= 2;
  return Math.abs(a) < 1e-14 ? { area: 0, cx: 0, cy: 0 } : { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
}

/** Forces with the compressed side towards (cos θ, sin θ) and the neutral axis at c from the extreme fibre: N, Mx = ΣF·y, My = ΣF·x (kN, kN·m). */
export function rectState(s: RectSection, t: Ts500Mat, theta: number, c: number): { n: number; mx: number; my: number; epsT: number } {
  const nx = Math.cos(theta), ny = Math.sin(theta);
  const smax = (s.b / 2) * Math.abs(nx) + (s.h / 2) * Math.abs(ny);
  const a = t.k1 * c;
  const poly: Pt[] = [[-s.b / 2, -s.h / 2], [s.b / 2, -s.h / 2], [s.b / 2, s.h / 2], [-s.b / 2, s.h / 2]];
  const blk = clipArea(poly, nx, ny, smax - a);
  const cc = 0.85 * t.fcd * blk.area * KN;
  let n = cc, mx = cc * blk.cy, my = cc * blk.cx, epsT = -Infinity;
  for (const bar of s.bars) {
    const depth = smax - (bar.x * nx + bar.y * ny);
    const eps = EPS_CU * (c - depth) / c;
    epsT = Math.max(epsT, -eps);
    let sigma = Math.max(-t.fyd, Math.min(t.fyd, ES * eps));
    if (sigma > 0 && depth < a) sigma -= 0.85 * t.fcd;
    const f = sigma * bar.area * KN;
    n += f; mx += f * bar.y; my += f * bar.x;
  }
  return { n, mx, my, epsT };
}

export function axialLimits(s: RectSection, t: Ts500Mat): { max: number; min: number } {
  const as = s.bars.reduce((x, b) => x + b.area, 0);
  return { max: (0.85 * t.fcd * (s.b * s.h - as) + t.fyd * as) * KN, min: -t.fyd * as * KN };
}

export function capacityAt(s: RectSection, t: Ts500Mat, theta: number, n: number): { mx: number; my: number } | null {
  const span = s.b + s.h;
  let lo = 1e-6 * span, hi = 200 * span;
  if (rectState(s, t, theta, hi).n < n || rectState(s, t, theta, lo).n > n) return null;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (rectState(s, t, theta, mid).n > n) hi = mid; else lo = mid;
  }
  const r = rectState(s, t, theta, (lo + hi) / 2);
  return { mx: r.mx, my: r.my };
}

const ANGLES = 24;

/** The moment contour at axial force n in the first quadrant (the bars are symmetric about both axes). */
export function contour(s: RectSection, t: Ts500Mat, n: number): Array<{ mx: number; my: number; alpha: number }> {
  const pts: Array<{ mx: number; my: number; alpha: number }> = [];
  for (let i = 0; i <= ANGLES; i++) {
    const theta = (Math.PI / 2) * i / ANGLES;
    const p = capacityAt(s, t, theta, n);
    if (p) pts.push({ mx: Math.max(0, p.mx), my: Math.max(0, p.my), alpha: Math.atan2(Math.max(0, p.mx), Math.max(0, p.my)) });
  }
  return pts.sort((p, q) => p.alpha - q.alpha);
}

export function utilisation(s: RectSection, t: Ts500Mat, n: number, mx: number, my: number): number {
  const lim = axialLimits(s, t);
  if (n > lim.max) return n / Math.max(lim.max, 1e-9);
  if (n < lim.min) return n / Math.min(lim.min, -1e-9);
  const m = Math.hypot(mx, my);
  if (m < 1e-6) return n >= 0 ? n / Math.max(lim.max, 1e-9) : n / Math.min(lim.min, -1e-9);
  const pts = contour(s, t, n);
  if (pts.length < 2) return Number.POSITIVE_INFINITY;
  const alpha = Math.atan2(Math.abs(mx), Math.abs(my));
  const ux = Math.cos(alpha), uy = Math.sin(alpha);
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i]!, q = pts[i + 1]!;
    if (alpha < p.alpha - 1e-12 || alpha > q.alpha + 1e-12) continue;
    const dx = q.my - p.my, dy = q.mx - p.mx;
    const den = ux * dy - uy * dx;
    const r = Math.abs(den) < 1e-12 ? Math.hypot(p.my, p.mx) : (p.my * dy - p.mx * dx) / den;
    return r > 1e-9 ? m / r : Number.POSITIVE_INFINITY;
  }
  const near = alpha <= pts[0]!.alpha ? pts[0]! : pts[pts.length - 1]!;
  const r = Math.hypot(near.mx, near.my);
  return r > 1e-9 ? m / r : Number.POSITIVE_INFINITY;
}
