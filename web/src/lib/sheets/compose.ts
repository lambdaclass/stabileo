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

export function composeSheets(drawings: readonly DrawingInput[], format: SheetFormat, geometryOf: (f: SheetFormat) => FormatGeometry = formatGeometry): ComposedSheet[] {
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
