/**
 * Background drawings: a plan read from a DXF, laid at a level as a reference to model over.
 * It is not the model and touches no result; it is saved with the project (the views channel)
 * so the plan is there when the project is opened again.
 *
 * A drawing is kept as plain segments in metres, in its own coordinates, with a shift and a turn
 * that lay it on the model; the points a click can capture are its segments' ends.
 */
import type { CadDocument, CadEntity, CadPt, CadUnit } from '../cad/types';
import { CAD_UNIT_SCALE } from '../cad/types';
import { insertCopies } from '../cad/parse';

export interface Underlay {
  id: string;
  name: string;
  /** The level it lies at, and that level's elevation when it was laid. */
  levelId?: string;
  z: number;
  /** Segments, m, as x1, y1, x2, y2, … in the drawing's own coordinates. */
  segments: number[];
  /** Laid on the model: turned about the drawing's origin, then shifted. */
  dx: number; dy: number; rotationDeg: number;
  visible: boolean;
  /** The layers it was read from, for the record. */
  layers?: string[];
}

/** More than this many segments is not a plan anyone models over: the rest is left out, and said. */
export const MAX_UNDERLAY_SEGMENTS = 200_000;

const ARC_STEP = Math.PI / 18;

type Xf = (p: CadPt) => CadPt;

/** The segments of a drawing's entities on the layers chosen, blocks drawn through. */
export function cadSegments(doc: CadDocument, unit: CadUnit, layers?: ReadonlySet<string>): { segments: number[]; truncated: boolean } {
  const k = CAD_UNIT_SCALE[unit];
  const out: number[] = [];
  let truncated = false;
  const push = (a: CadPt, b: CadPt) => {
    if (out.length / 4 >= MAX_UNDERLAY_SEGMENTS) { truncated = true; return; }
    out.push(a.x * k, a.y * k, b.x * k, b.y * k);
  };
  const arc = (xf: Xf, c: CadPt, r: number, a0: number, a1: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / ARC_STEP));
    let prev = xf({ x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) });
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const p = xf({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
      push(prev, p); prev = p;
    }
  };
  const draw = (e: CadEntity, xf: Xf, depth: number) => {
    if (truncated) return;
    switch (e.kind) {
      case 'line': push(xf(e.a), xf(e.b)); return;
      case 'polyline': {
        const n = e.pts.length, last = e.closed ? n : n - 1;
        for (let i = 0; i < last; i++) {
          const a = e.pts[i]!, b = e.pts[(i + 1) % n]!, bulge = e.bulges?.[i] ?? 0;
          if (Math.abs(bulge) < 1e-9) { push(xf(a), xf(b)); continue; }
          // A bulged segment is an arc of included angle 4·atan(bulge) through its two ends.
          const th = 4 * Math.atan(bulge), chord = Math.hypot(b.x - a.x, b.y - a.y);
          const r = chord / (2 * Math.sin(Math.abs(th) / 2));
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = r * Math.cos(th / 2) * Math.sign(bulge);
          const ux = -(b.y - a.y) / chord, uy = (b.x - a.x) / chord;
          const c = { x: mx + ux * h, y: my + uy * h };
          const a0 = Math.atan2(a.y - c.y, a.x - c.x);
          arc(xf, c, r, a0, a0 + th);
        }
        return;
      }
      case 'arc': {
        // The reader gives an arc's angles in radians.
        const a0 = e.startAngle;
        let a1 = e.endAngle;
        if (a1 <= a0) a1 += 2 * Math.PI;
        arc(xf, e.center, e.r, a0, a1);
        return;
      }
      case 'circle': arc(xf, e.center, e.r, 0, 2 * Math.PI); return;
      case 'insert': {
        const block = doc.blocks?.[e.blockName];
        if (!block || depth > 6) return;
        const th = ((e.rotationDeg ?? 0) * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
        const sx = e.xScale ?? 1, sy = e.yScale ?? 1;
        for (const at of insertCopies(e)) {
          const inner: Xf = (p) => {
            const u = (p.x - block.base.x) * sx, v = (p.y - block.base.y) * sy;
            return xf({ x: at.x + u * cos - v * sin, y: at.y + u * sin + v * cos });
          };
          for (const be of block.entities) draw(be, inner, depth + 1);
        }
        return;
      }
      default: return;
    }
  };
  const id: Xf = (p) => p;
  for (const e of doc.entities) {
    if (layers && !layers.has(e.layer)) continue;
    draw(e, id, 0);
  }
  return { segments: out, truncated };
}

/** A segment's ends laid on the model. */
export function laidPoint(u: Pick<Underlay, 'dx' | 'dy' | 'rotationDeg'>, x: number, y: number): [number, number] {
  const th = (u.rotationDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  return [x * c - y * s + u.dx, x * s + y * c + u.dy];
}

/** The extent of a drawing in its own coordinates. */
export function underlayExtent(segments: number[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (segments.length < 4) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < segments.length; i += 2) {
    const x = segments[i]!, y = segments[i + 1]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// ─── Capturing a point ────────────────────────────────────────

interface PointIndex { cell: number; cells: Map<string, Array<[number, number]>> }
const indexCache = new WeakMap<Underlay, PointIndex>();

/** The drawing's segment ends, laid, hashed into cells of a size fit to the drawing. */
function indexOf(u: Underlay): PointIndex {
  const hit = indexCache.get(u);
  if (hit) return hit;
  const ext = underlayExtent(u.segments);
  const span = ext ? Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY, 1) : 1;
  const cell = span / 256;
  const cells = new Map<string, Array<[number, number]>>();
  for (let i = 0; i + 1 < u.segments.length; i += 2) {
    const p = laidPoint(u, u.segments[i]!, u.segments[i + 1]!);
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(p);
  }
  const idx = { cell, cells };
  indexCache.set(u, idx);
  return idx;
}

/**
 * The end of a visible drawing's segment nearest to (x, y) within `tol`, on the drawings laid at
 * elevation `z` (any elevation when `z` is null).
 */
export function snapToUnderlays(list: readonly Underlay[], x: number, y: number, tol: number, z: number | null): { x: number; y: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (const u of list) {
    if (!u.visible || (z !== null && Math.abs(u.z - z) > 1e-6)) continue;
    const { cell, cells } = indexOf(u);
    const r = Math.ceil(tol / cell);
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) {
      for (const p of cells.get(`${i},${j}`) ?? []) {
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d <= tol && (!best || d < best.d)) best = { x: p[0], y: p[1], d };
      }
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}
