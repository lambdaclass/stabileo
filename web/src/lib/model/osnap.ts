/**
 * Object snaps on the background drawings, as a CAD program offers them: each kind turned on or off
 * by the person drawing.
 *
 *   endpoint      the ends of lines and arcs, a polyline's vertices
 *   midpoint      the middle of a line, of a polyline's piece, of an arc (along it)
 *   center        an arc's or a circle's centre, a polyline arc's
 *   quadrant      a circle's points at 0°, 90°, 180°, 270°, an arc's that lie on it
 *   intersection  where two drawn segments cross
 *   perpendicular the foot of the perpendicular from the point drawn last onto a segment
 *   nearest       the closest point on a drawn segment (only when nothing else is within reach)
 *
 * Read from the entities the drawing keeps (`UnderlayShape`), so an arc's middle is its own and not
 * the middle of one of the chords it is drawn with; a drawing saved without them falls back to its
 * segments' ends and middles. A layer hidden or taken out of the snaps gives nothing.
 *
 * Pure: the drawings in, a point out.
 */
import { laidPoint, segmentSnaps, underlayExtent, type Underlay } from './underlay';

import type { OsnapMode } from './osnap-modes';
export { OSNAP_MODES, DEFAULT_OSNAP, type OsnapMode } from './osnap-modes';

export interface OsnapHit { x: number; y: number; mode: OsnapMode }

type P = [number, number];

interface Index {
  cell: number;
  points: Map<string, Array<{ p: P; mode: Exclude<OsnapMode, 'intersection' | 'perpendicular' | 'nearest'> }>>;
  segments: Map<string, number[]>;
  segs: Array<[P, P]>;
}
const cache = new WeakMap<Underlay, Index>();

function layerSnaps(u: Underlay, L: number): boolean {
  const name = u.layers?.[L] ?? '';
  return !(u.hiddenLayers?.includes(name) || u.noSnapLayers?.includes(name));
}

function indexOf(u: Underlay): Index {
  const hit = cache.get(u);
  if (hit) return hit;
  const ext = underlayExtent(u.segments);
  const span = ext ? Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY, 1) : 1;
  const cell = span / 256;
  const idx: Index = { cell, points: new Map(), segments: new Map(), segs: [] };
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const put = (q: P, mode: Exclude<OsnapMode, 'intersection' | 'perpendicular' | 'nearest'>) => {
    const p = laidPoint(u, q[0], q[1]);
    const k = key(p[0], p[1]);
    (idx.points.get(k) ?? idx.points.set(k, []).get(k)!).push({ p, mode });
  };
  const arc = (c: P, r: number, a0: number, a1: number) => {
    let sweep = a1 - a0;
    while (sweep <= 0) sweep += 2 * Math.PI;
    const at = (a: number): P => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
    put(at(a0), 'endpoint'); put(at(a0 + sweep), 'endpoint'); put(at(a0 + sweep / 2), 'midpoint'); put(c, 'center');
    for (let q = 0; q < 4; q++) {
      const a = (q * Math.PI) / 2;
      let d = a - a0;
      while (d < 0) d += 2 * Math.PI;
      if (d <= sweep + 1e-12) put(at(a), 'quadrant');
    }
  };
  if (u.shapes?.length) {
    for (const s of u.shapes) {
      if (!layerSnaps(u, s.L)) continue;
      switch (s.k) {
        case 'l': put(s.a, 'endpoint'); put(s.b, 'endpoint'); put([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], 'midpoint'); break;
        case 'a': arc(s.c, s.r, s.a0, s.a1); break;
        case 'c': put(s.c, 'center'); for (let q = 0; q < 4; q++) put([s.c[0] + s.r * Math.cos(q * Math.PI / 2), s.c[1] + s.r * Math.sin(q * Math.PI / 2)], 'quadrant'); break;
        case 'p': {
          const n = s.pts.length, pieces = s.closed ? n : n - 1;
          for (const q of s.pts) put(q, 'endpoint');
          for (let i = 0; i < pieces; i++) {
            const a = s.pts[i]!, b = s.pts[(i + 1) % n]!, bulge = s.bulges?.[i] ?? 0;
            if (Math.abs(bulge) < 1e-12) { put([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'midpoint'); continue; }
            // A bulged piece is an arc of included angle 4·atan(bulge), counter-clockwise when positive.
            const theta = 4 * Math.atan(bulge), chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
            const m: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            const h = r * Math.cos(Math.abs(theta) / 2) * Math.sign(bulge);
            const nx = -(b[1] - a[1]) / chord, ny = (b[0] - a[0]) / chord;
            const c: P = [m[0] + nx * h, m[1] + ny * h];
            const sag = r * (1 - Math.cos(Math.abs(theta) / 2));
            put([m[0] - nx * sag * Math.sign(bulge), m[1] - ny * sag * Math.sign(bulge)], 'midpoint');
            put(c, 'center');
          }
          break;
        }
        default: break;
      }
    }
  } else {
    for (let s = 0; s * 4 + 3 < u.segments.length; s++) {
      if (!segmentSnaps(u, s)) continue;
      const a: P = [u.segments[s * 4]!, u.segments[s * 4 + 1]!], b: P = [u.segments[s * 4 + 2]!, u.segments[s * 4 + 3]!];
      put(a, 'endpoint'); put(b, 'endpoint'); put([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'midpoint');
    }
  }
  // The drawn segments, laid, for crossings, perpendiculars and the nearest point.
  for (let s = 0; s * 4 + 3 < u.segments.length; s++) {
    if (!segmentSnaps(u, s)) continue;
    const a = laidPoint(u, u.segments[s * 4]!, u.segments[s * 4 + 1]!), b = laidPoint(u, u.segments[s * 4 + 2]!, u.segments[s * 4 + 3]!);
    const id = idx.segs.length;
    idx.segs.push([a, b]);
    // The cells it passes through, sampled at half a cell along it (a long line is not its box).
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.min(100000, Math.max(1, Math.ceil((2 * L) / cell)));
    const seen = new Set<string>();
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const key2 = `${Math.floor((a[0] + t * (b[0] - a[0])) / cell)},${Math.floor((a[1] + t * (b[1] - a[1])) / cell)}`;
      if (seen.has(key2)) continue;
      seen.add(key2);
      (idx.segments.get(key2) ?? idx.segments.set(key2, []).get(key2)!).push(id);
    }
  }
  cache.set(u, idx);
  return idx;
}

function foot(p: P, a: P, b: P): { q: P; t: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 < 1e-24 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  return { q: [a[0] + t * dx, a[1] + t * dy], t };
}

function crossing(a: [P, P], b: [P, P]): P | null {
  const r: P = [a[1][0] - a[0][0], a[1][1] - a[0][1]], s: P = [b[1][0] - b[0][0], b[1][1] - b[0][1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-15) return null;
  const qp: P = [b[0][0] - a[0][0], b[0][1] - a[0][1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  // Two segments that only meet end to end (the chords an arc is drawn with) do not cross there.
  const atEnd = (x: number) => x < 1e-9 || x > 1 - 1e-9;
  if (atEnd(t) && atEnd(u)) return null;
  return [a[0][0] + t * r[0], a[0][1] + t * r[1]];
}

/**
 * The snap point nearest (x, y) within `tol`, of the kinds turned on, on the visible drawings laid
 * at elevation `z` (any when null). `from` is the point drawn last, for the perpendicular.
 * Nearest only answers when no other kind is within reach.
 */
export function osnapUnderlays(list: readonly Underlay[], x: number, y: number, tol: number, z: number | null, modes: ReadonlySet<OsnapMode>, from?: { x: number; y: number } | null): OsnapHit | null {
  if (modes.size === 0) return null;
  let best: { x: number; y: number; d: number; mode: OsnapMode } | null = null;
  let near: { x: number; y: number; d: number } | null = null;
  const offer = (p: P, mode: OsnapMode) => {
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d <= tol && (!best || d < best.d - 1e-12)) best = { x: p[0], y: p[1], d, mode };
  };
  for (const u of list) {
    if (!u.visible || (z !== null && Math.abs(u.z - z) > 1e-6)) continue;
    const idx = indexOf(u);
    const r = Math.ceil(tol / idx.cell) + 1;
    const cx = Math.floor(x / idx.cell), cy = Math.floor(y / idx.cell);
    const segIds = new Set<number>();
    for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) {
      for (const pt of idx.points.get(`${i},${j}`) ?? []) if (modes.has(pt.mode)) offer(pt.p, pt.mode);
      for (const s of idx.segments.get(`${i},${j}`) ?? []) segIds.add(s);
    }
    const near2 = [...segIds].map((s) => idx.segs[s]!).filter(([a, b]) => { const f = foot([x, y], a, b); const t = Math.max(0, Math.min(1, f.t)); return Math.hypot(a[0] + t * (b[0] - a[0]) - x, a[1] + t * (b[1] - a[1]) - y) <= tol; });
    if (modes.has('intersection') && near2.length <= 80) {
      for (let i = 0; i < near2.length; i++) for (let j = i + 1; j < near2.length; j++) {
        const c = crossing(near2[i]!, near2[j]!);
        if (c) offer(c, 'intersection');
      }
    }
    if (modes.has('perpendicular') && from) {
      for (const [a, b] of near2) {
        const f = foot([from.x, from.y], a, b);
        if (f.t > 1e-9 && f.t < 1 - 1e-9) offer(f.q, 'perpendicular');
      }
    }
    if (modes.has('nearest')) {
      for (const [a, b] of near2) {
        const f = foot([x, y], a, b);
        const t = Math.max(0, Math.min(1, f.t));
        const q: P = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        const d = Math.hypot(q[0] - x, q[1] - y);
        if (d <= tol && (!near || d < near.d)) near = { x: q[0], y: q[1], d };
      }
    }
  }
  if (best) return { x: (best as { x: number }).x, y: (best as { y: number }).y, mode: (best as { mode: OsnapMode }).mode };
  if (near) return { x: (near as { x: number }).x, y: (near as { y: number }).y, mode: 'nearest' };
  return null;
}
