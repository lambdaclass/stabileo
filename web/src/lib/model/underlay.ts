/**
 * Background drawings: a plan read from a DXF, laid at a level as a reference to model over.
 * It is not the model and touches no result; it is saved with the project (the views channel)
 * so the plan is there when the project is opened again.
 *
 * A drawing is kept as plain segments in metres, in its own coordinates, with a shift and a turn
 * that lay it on the model; what a click can capture on it is `osnap.ts`'s.
 */
import type { CadDocument, CadEntity, CadPt, CadUnit } from '../cad/types';
import { CAD_UNIT_SCALE } from '../cad/types';
import { insertCopies } from '../cad/parse';
import { inRegion } from './underlay-regions';
import type { CadBBox } from '../cad/types';

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
  /** Each segment's layer, as an index into `layers` (one per segment). Absent in older files. */
  segLayer?: number[];
  /** Layers not drawn: neither seen nor captured. */
  hiddenLayers?: string[];
  /** Layers drawn but not captured by the snaps. */
  noSnapLayers?: string[];
  /** Locked: its placement cannot be changed or its file replaced until unlocked. */
  locked?: boolean;
  /** How strongly it is drawn, 0.1 to 1 (0.9 by default on its level). */
  opacity?: number;
  /** The unit the file was read in, and the part of it this template is (metres, drawing coordinates). */
  unit?: import('../cad/types').CadUnit;
  region?: { minX: number; minY: number; maxX: number; maxY: number };
  /** The drawing point it was laid by: (dx, dy) took it to the model point chosen. */
  ref?: { x: number; y: number };
  /** The entities kept for a conversion (`underlay-regions.ts`), and what the file had that is not kept. */
  shapes?: import('./underlay-regions').UnderlayShape[];
  leftOut?: Record<string, number>;
  source?: string;
}

/** More than this many segments is not a plan anyone models over: the rest is left out, and said. */
export const MAX_UNDERLAY_SEGMENTS = 200_000;

const ARC_STEP = Math.PI / 18;

type Xf = (p: CadPt) => CadPt;

/**
 * The segments of a drawing's entities on the layers chosen, blocks drawn through; within `box`
 * (metres, drawing coordinates) when given. With `layerOrder`, each segment's layer as an index
 * into it (`segLayer`).
 */
export function cadSegments(doc: CadDocument, unit: CadUnit, layers?: ReadonlySet<string>, opts: { box?: CadBBox | null; layerOrder?: readonly string[] } = {}): { segments: number[]; truncated: boolean; segLayer?: number[] } {
  const k = CAD_UNIT_SCALE[unit];
  const out: number[] = [];
  const segLayer: number[] = [];
  const order = opts.layerOrder ? new Map(opts.layerOrder.map((l, i) => [l, i])) : null;
  let current = 0;
  let truncated = false;
  const push = (a: CadPt, b: CadPt) => {
    if (out.length / 4 >= MAX_UNDERLAY_SEGMENTS) { truncated = true; return; }
    out.push(a.x * k, a.y * k, b.x * k, b.y * k);
    if (order) segLayer.push(current);
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
    if (opts.box && !inRegion(e, unit, opts.box, doc)) continue;
    current = order?.get(e.layer) ?? 0;
    draw(e, id, 0);
  }
  return { segments: out, truncated, ...(order ? { segLayer } : {}) };
}

/** Whether a template's segment k is drawn, and whether it is captured by the snaps. */
export function segmentShown(u: Underlay, k: number): boolean {
  if (!u.hiddenLayers?.length || !u.segLayer || !u.layers) return true;
  return !u.hiddenLayers.includes(u.layers[u.segLayer[k] ?? 0] ?? '');
}
export function segmentSnaps(u: Underlay, k: number): boolean {
  if (!segmentShown(u, k)) return false;
  if (!u.noSnapLayers?.length || !u.segLayer || !u.layers) return true;
  return !u.noSnapLayers.includes(u.layers[u.segLayer[k] ?? 0] ?? '');
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

// Capturing a point on a drawing: `model/osnap.ts`, with the snaps the person chose.

