/**
 * Preparing a DXF as templates: the parts of one drawing that may be separate plans, and the
 * shapes each template keeps for the snaps and a later conversion.
 *
 * ── Regions ───────────────────────────────────────────────────────
 *
 * A drawing with several plans side by side is split into clusters of entities: two entities are
 * in one cluster when their boxes come within `gap` of each other. The clusters are offered, not
 * imposed: a floor plan with an isolated detail beside it, or a title block, comes out as more
 * than one cluster, and the reader chooses which are plans, which level each goes to and the point
 * each is laid by.
 *
 * ── Shapes ────────────────────────────────────────────────────────
 *
 * What a template keeps of each entity besides its drawn segments, in metres in the drawing's own
 * coordinates: lines, arcs (centre, radius, angles), circles and polylines with their bulges, by
 * layer, and texts with their point (what a room label may suggest; never converted). Blocks are
 * drawn but not kept as shapes: they are counted.
 *
 * Pure.
 */
import { CAD_UNIT_SCALE, type CadBBox, type CadDocument, type CadEntity, type CadPt, type CadUnit } from '../cad/types';
import { insertCopies } from '../cad/parse';

export interface DrawingRegion {
  /** Extent, metres, in the drawing's coordinates. */
  box: CadBBox;
  /** Entities whose box lies in it. */
  count: number;
  /** Its lower-left corner, the default point it is laid by. */
  ref: CadPt;
}

export type UnderlayShape =
  | { k: 'l'; L: number; a: [number, number]; b: [number, number] }
  | { k: 'a'; L: number; c: [number, number]; r: number; a0: number; a1: number }
  | { k: 'c'; L: number; c: [number, number]; r: number }
  | { k: 'p'; L: number; pts: Array<[number, number]>; closed: boolean; bulges?: number[] }
  /** A text, kept for what it may suggest (a room's name); never converted. */
  | { k: 't'; L: number; at: [number, number]; text: string };

const empty = (): CadBBox => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
const grow = (b: CadBBox, p: CadPt) => { b.minX = Math.min(b.minX, p.x); b.minY = Math.min(b.minY, p.y); b.maxX = Math.max(b.maxX, p.x); b.maxY = Math.max(b.maxY, p.y); };

/** An entity's box in the drawing's raw units; null for one with no extent (a text has a point). */
export function entityBox(e: CadEntity, doc?: CadDocument): CadBBox | null {
  const b = empty();
  switch (e.kind) {
    case 'line': grow(b, e.a); grow(b, e.b); break;
    case 'polyline': for (const p of e.pts) grow(b, p); break;
    case 'arc': case 'circle': grow(b, { x: e.center.x - e.r, y: e.center.y - e.r }); grow(b, { x: e.center.x + e.r, y: e.center.y + e.r }); break;
    case 'insert': {
      if (e.bbox) { grow(b, { x: e.bbox.minX, y: e.bbox.minY }); grow(b, { x: e.bbox.maxX, y: e.bbox.maxY }); }
      else for (const at of insertCopies(e)) grow(b, at);
      void doc;
      break;
    }
    case 'text': grow(b, e.at); break;
    default: return null;
  }
  return Number.isFinite(b.minX) ? b : null;
}

/**
 * The clusters of a drawing, in metres: entities whose boxes come within `gap` m of each other
 * belong together. Largest first. Texts join the cluster they sit in and start none of their own.
 */
export function drawingRegions(doc: CadDocument, unit: CadUnit, opts: { gap?: number; layers?: ReadonlySet<string> } = {}): DrawingRegion[] {
  const k = CAD_UNIT_SCALE[unit];
  const boxes: CadBBox[] = [];
  for (const e of doc.entities) {
    if (e.kind === 'text') continue;
    if (opts.layers && !opts.layers.has(e.layer)) continue;
    const b = entityBox(e, doc);
    if (b) boxes.push({ minX: b.minX * k, minY: b.minY * k, maxX: b.maxX * k, maxY: b.maxY * k });
  }
  if (!boxes.length) return [];
  const ext = boxes.reduce((a, b) => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }), empty());
  const gap = opts.gap ?? Math.max(1, 0.02 * Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY));
  // Connected cells of a grid half the gap wide: each box marks the cells it covers grown by half
  // the gap, and boxes whose cells touch are one cluster. Linear in the boxes and the cells, where
  // comparing boxes pairwise took seconds on a plan of tens of thousands of lines.
  const cell = Math.max(gap / 2, Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY) / 1024);
  const cx = (x: number) => Math.floor((x - ext.minX) / cell), cy = (y: number) => Math.floor((y - ext.minY) / cell);
  // Row width with room for the boxes grown past the extent on both sides, so no cell wraps.
  const nx = cx(ext.maxX + gap) + 3;
  const owner = new Map<number, number>();
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
  boxes.forEach((b, i) => {
    const x0 = cx(b.minX - gap / 2), x1 = cx(b.maxX + gap / 2), y0 = cy(b.minY - gap / 2), y1 = cy(b.maxY + gap / 2);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = (y + 1) * nx + (x + 1);
      const o = owner.get(k);
      if (o === undefined) owner.set(k, i); else { const a = find(o), c = find(i); if (a !== c) parent[a] = c; }
    }
  });
  const byRoot = new Map<number, DrawingRegion>();
  boxes.forEach((b, i) => {
    const r = find(i);
    const reg = byRoot.get(r) ?? { box: empty(), count: 0, ref: { x: 0, y: 0 } };
    grow(reg.box, { x: b.minX, y: b.minY }); grow(reg.box, { x: b.maxX, y: b.maxY }); reg.count++;
    byRoot.set(r, reg);
  });
  const out = [...byRoot.values()].map((r) => ({ ...r, ref: { x: r.box.minX, y: r.box.minY } }));
  const area = (r: DrawingRegion) => (r.box.maxX - r.box.minX) * (r.box.maxY - r.box.minY);
  return out.sort((a, b) => area(b) - area(a));
}


/** Whether an entity lies in a region (metres): its box's centre inside the region's box. */
export function inRegion(e: CadEntity, unit: CadUnit, box: CadBBox | null | undefined, doc?: CadDocument): boolean {
  if (!box) return true;
  const b = entityBox(e, doc);
  if (!b) return false;
  const k = CAD_UNIT_SCALE[unit];
  const cx = ((b.minX + b.maxX) / 2) * k, cy = ((b.minY + b.maxY) / 2) * k;
  return cx >= box.minX - 1e-9 && cx <= box.maxX + 1e-9 && cy >= box.minY - 1e-9 && cy <= box.maxY + 1e-9;
}

/**
 * The shapes a template keeps, in metres, by layer index into `layers`, and what was left out by
 * kind (blocks drawn but not kept, texts, anything else).
 */
export function cadShapes(doc: CadDocument, unit: CadUnit, layers: readonly string[], box?: CadBBox | null): { shapes: UnderlayShape[]; leftOut: Record<string, number> } {
  const k = CAD_UNIT_SCALE[unit];
  const index = new Map(layers.map((l, i) => [l, i]));
  const shapes: UnderlayShape[] = [];
  const leftOut: Record<string, number> = {};
  const p2 = (p: CadPt): [number, number] => [p.x * k, p.y * k];
  for (const e of doc.entities) {
    const L = index.get(e.layer);
    if (L === undefined || !inRegion(e, unit, box, doc)) continue;
    switch (e.kind) {
      case 'line': shapes.push({ k: 'l', L, a: p2(e.a), b: p2(e.b) }); break;
      case 'arc': shapes.push({ k: 'a', L, c: p2(e.center), r: e.r * k, a0: e.startAngle, a1: e.endAngle }); break;
      case 'circle': shapes.push({ k: 'c', L, c: p2(e.center), r: e.r * k }); break;
      case 'polyline': shapes.push({ k: 'p', L, pts: e.pts.map(p2), closed: e.closed, ...(e.bulges?.some((b) => Math.abs(b) > 1e-12) ? { bulges: [...e.bulges] } : {}) }); break;
      case 'text': if (e.value.trim()) shapes.push({ k: 't', L, at: p2(e.at), text: e.value.trim().slice(0, 80) }); break;
      default: leftOut[e.kind] = (leftOut[e.kind] ?? 0) + 1;
    }
  }
  return { shapes, leftOut };
}
