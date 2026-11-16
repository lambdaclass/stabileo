/**
 * Drawings composed onto sheets: each at the largest standard scale that fits the sheet's drawable
 * area (or a scale asked for), with its title and scale under it, laid in rows left to right and
 * top to bottom, a new sheet when the current one is full. A drawing too large for the format at
 * any scale goes on a sheet of its own at the scale that fits the larger format it is moved to.
 */
import { fittingScale, formatGeometry, SHEET_FORMATS, type FormatGeometry, type SheetFormat } from './formats';
import { place, type Primitive } from './primitives';

/** `paper`: drawn in paper millimetres already (a table, a block of notes), placed at 1:1 with no
 *  scale in its caption. */
export interface DrawingInput { key: string; title: string; primitives: Primitive[]; width: number; height: number; origin: { x: number; y: number }; scale?: number; paper?: boolean;
  /** The kind of plan it belongs to: a new kind starts a new sheet, named after it. */
  group?: string;
  /** Its own paper format; absent, the set's. */
  format?: SheetFormat;
  /** A table that goes with a plan (coordinates, breakdown): left out when its entry says so. */
  table?: boolean }

/** Each drawing as placed: its lower left and size on the sheet, paper mm, and where its primitives are in the sheet's list. */
export interface PlacedDrawing {
  key: string; title: string; scale: number; paper?: boolean; x: number; y: number; w: number; h: number;
  /** Its size in its own units (model mm, or paper mm for a table), as the drawing came. */
  mw: number; mh: number;
  /** Where its primitives sit in the composed list (before the title block is added). */
  from: number; to: number;
}
export interface ComposedSheet { format: SheetFormat; group?: string; drawings: PlacedDrawing[]; primitives: Primitive[] }

const GAP = 12, CAPTION = 8;
/** The band under each drawing that holds its title and scale, paper mm. */
export const CAPTION_MM = CAPTION;

/**
 * `dense`: drawings also go beside the title block, into the room a row leaves at its right when
 * they are no taller than the row, and 8 mm apart.
 */
export function composeSheets(drawings: readonly DrawingInput[], format: SheetFormat, geometryOf: (f: SheetFormat) => FormatGeometry = formatGeometry, dense = false): ComposedSheet[] {
  if (dense) return composeDense(drawings, format, geometryOf);
  const sheets: ComposedSheet[] = [];
  let cur: ComposedSheet | null = null, x = 0, top = 0, rowH = 0;
  let group: string | undefined;
  const open = (f: SheetFormat) => { cur = { format: f, ...(group ? { group } : {}), drawings: [], primitives: [] }; sheets.push(cur); const g = geometryOf(f); x = g.drawable.x0; top = g.drawable.y1; rowH = 0; };
  for (const d of drawings) {
    if (d.group !== group) { group = d.group; cur = null; }
    let f = d.format ?? format, g = geometryOf(f);
    const W = g.drawable.x1 - g.drawable.x0, H = g.drawable.y1 - g.drawable.y0 - CAPTION;
    let s = d.paper ? 1 : d.scale ?? fittingScale(d.width, d.height, W, H);
    if (s === null) {
      // Up the formats until one holds it.
      const bigger = SHEET_FORMATS.slice(0, SHEET_FORMATS.indexOf(f)).reverse();
      for (const b of bigger) { const gb = geometryOf(b); const sb = fittingScale(d.width, d.height, gb.drawable.x1 - gb.drawable.x0, gb.drawable.y1 - gb.drawable.y0 - CAPTION); if (sb !== null) { f = b; g = gb; s = sb; break; } }
      if (s === null) s = 500;
      open(f);
    }
    const w = d.width / s, h = d.height / s + CAPTION;
    if (!cur || (cur as ComposedSheet).format !== f) open(f);
    if (x + w > g.drawable.x1) { x = g.drawable.x0; top -= rowH + GAP; rowH = 0; }
    if (top - h < g.drawable.y0) open(f);
    // Rows hang from the top, in reading order; a drawing's top is the row's top.
    const y = top - h;
    const c = cur as unknown as ComposedSheet;
    const from = c.primitives.length;
    c.primitives.push(...place(d.primitives, s, { x, y: y + CAPTION }, d.origin));
    c.primitives.push({ kind: 'text', layer: 'RC-TITLE', at: { x, y: y + 2 }, text: d.paper ? d.title : `${d.title} — 1:${s}`, height: 3 });
    c.drawings.push({ key: d.key, title: d.title, scale: s, ...(d.paper ? { paper: true } : {}), x, y, w, h, mw: d.width, mh: d.height, from, to: c.primitives.length });
    x += w + GAP; rowH = Math.max(rowH, h);
  }
  return sheets;
}

const DENSE_GAP = 8;

/** Whether a drawing `w × h` paper mm (its caption included) fits the dense area: the drawable rectangle, or the column beside the title block down to the frame. */
export function fitsDense(g: FormatGeometry, w: number, h: number): boolean {
  const tbLeft = Math.min(g.drawable.x1, g.titleBlock.x0 - 5), floor = Math.min(g.drawable.y0, g.frame.y0 + 5);
  return (w <= g.drawable.x1 - g.drawable.x0 + 1e-6 && h <= g.drawable.y1 - g.drawable.y0 + 1e-6) || (w <= tbLeft - g.drawable.x0 + 1e-6 && h <= g.drawable.y1 - floor + 1e-6);
}

/** Drawings hung from the top of each sheet, each where it stands highest and then leftmost over what is placed already (a skyline), in their order. */
function composeDense(drawings: readonly DrawingInput[], format: SheetFormat, geometryOf: (f: SheetFormat) => FormatGeometry): ComposedSheet[] {
  const sheets: ComposedSheet[] = [];
  let cur: ComposedSheet | null = null;
  let sky: Array<{ x0: number; x1: number; y: number }> = [];
  let group: string | undefined;
  const open = (f: SheetFormat) => { const g = geometryOf(f); cur = { format: f, ...(group ? { group } : {}), drawings: [], primitives: [] }; sheets.push(cur); sky = [{ x0: g.drawable.x0, x1: g.drawable.x1, y: g.drawable.y1 + DENSE_GAP }]; };
  for (const d of drawings) {
    if (d.group !== group) { group = d.group; cur = null; }
    let f = d.format ?? format, g = geometryOf(f);
    const room = (gg: FormatGeometry) => ({ W: gg.drawable.x1 - gg.drawable.x0, H: gg.drawable.y1 - gg.drawable.y0 - CAPTION });
    let s = d.paper ? 1 : d.scale ?? fittingScale(d.width, d.height, room(g).W, room(g).H);
    if (s === null) {
      for (const b of SHEET_FORMATS.slice(0, SHEET_FORMATS.indexOf(f)).reverse()) { const sb = fittingScale(d.width, d.height, room(geometryOf(b)).W, room(geometryOf(b)).H); if (sb !== null) { f = b; g = geometryOf(b); s = sb; break; } }
      if (s === null) s = 500;
    }
    const w = d.width / s, h = d.height / s + CAPTION;
    const spot = (gg: FormatGeometry) => {
      const tbTop = gg.titleBlock.y1 + 5, tbLeft = Math.min(gg.drawable.x1, gg.titleBlock.x0 - 5), floor = Math.min(gg.drawable.y0, gg.frame.y0 + 5);
      const right = (bottom: number) => (bottom < tbTop - 1e-6 ? tbLeft : gg.drawable.x1);
      let best: { x: number; top: number } | null = null;
      for (const seg of sky) {
        const x = seg.x0;
        const top = Math.min(...sky.filter((q) => q.x1 > x + 1e-6 && q.x0 < x + w - 1e-6).map((q) => q.y)) - DENSE_GAP;
        if (top - h < floor - 1e-6 || x + w > right(top - h) + 1e-6) continue;
        if (!best || top > best.top + 1e-6) best = { x, top };
      }
      return best;
    };
    const now = cur as ComposedSheet | null;
    let at = now && (now.format === f || (SHEET_FORMATS.indexOf(now.format) < SHEET_FORMATS.indexOf(f) && fitsDense(geometryOf(now.format), w, h))) ? spot(geometryOf(now.format)) : null;
    if (!at) { open(f); at = spot(g) ?? { x: g.drawable.x0, top: g.drawable.y1 }; }
    const y = at.top - h, x1 = at.x + w;
    sky = [...sky.flatMap((q) => [
      ...(q.x0 < at!.x - 1e-6 ? [{ x0: q.x0, x1: Math.min(q.x1, at!.x), y: q.y }] : []),
      ...(q.x1 > x1 + 1e-6 ? [{ x0: Math.max(q.x0, x1), x1: q.x1, y: q.y }] : []),
    ]), { x0: at.x, x1, y }].sort((p, q) => p.x0 - q.x0);
    const c = cur as unknown as ComposedSheet;
    const from = c.primitives.length;
    c.primitives.push(...place(d.primitives, s, { x: at.x, y: y + CAPTION }, d.origin));
    c.primitives.push({ kind: 'text', layer: 'RC-TITLE', at: { x: at.x, y: y + 2 }, text: d.paper ? d.title : `${d.title} — 1:${s}`, height: 3 });
    c.drawings.push({ key: d.key, title: d.title, scale: s, ...(d.paper ? { paper: true } : {}), x: at.x, y, w, h, mw: d.width, mh: d.height, from, to: c.primitives.length });
  }
  return sheets;
}
