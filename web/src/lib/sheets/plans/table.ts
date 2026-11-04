/**
 * A table drawn on the sheet, in paper millimetres: a header row, the rows, and cells that hold a
 * text or a small figure (a section, a bending shape). The column schedule, the bending schedule,
 * the setting-out table and the notes are all drawn with it, so they read alike on every sheet.
 */
import { bounds, place, type Primitive } from '../primitives';

export type Cell = string | { figure: Primitive[]; text?: string };
export interface TableSpec {
  columns: Array<{ label: string; width: number; align?: 'left' | 'center' | 'right' }>;
  rows: Cell[][];
  /** Row height for text rows; a row holding a figure grows to `figureHeight`. */
  rowHeight?: number;
  figureHeight?: number;
  textHeight?: number;
  /** Model millimetres per paper millimetre for every figure, so sizes compare across cells.
   *  Absent: each figure is fitted to its cell. A figure too big for its cell is still fitted. */
  figureScale?: number;
}

const L = 'TB-LINE', T = 'TB-TEXT';

/** The table with its lower left at (0, 0), the header on top. */
export function drawTable(spec: TableSpec): { primitives: Primitive[]; width: number; height: number } {
  const rh = spec.rowHeight ?? 7, fh = spec.figureHeight ?? 30, th = spec.textHeight ?? 2.5;
  const width = spec.columns.reduce((a, c) => a + c.width, 0);
  const heights = spec.rows.map((r) => (r.some((c) => typeof c !== 'string') ? fh : rh));
  const height = rh + heights.reduce((a, h) => a + h, 0);
  const out: Primitive[] = [{ kind: 'polyline', layer: L, closed: true, points: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] }];
  const xs: number[] = [0];
  for (const c of spec.columns) xs.push(xs[xs.length - 1]! + c.width);
  for (const x of xs.slice(1, -1)) out.push({ kind: 'line', layer: L, a: { x, y: 0 }, b: { x, y: height } });
  const text = (s: string, j: number, yMid: number, bold = false): Primitive => {
    const c = spec.columns[j]!, align = c.align ?? 'left';
    const x = align === 'left' ? xs[j]! + 1.5 : align === 'right' ? xs[j + 1]! - 1.5 : (xs[j]! + xs[j + 1]!) / 2;
    return { kind: 'text', layer: T, at: { x, y: yMid - th / 2 }, text: s, height: bold ? th * 1.05 : th, align };
  };
  let y = height - rh;
  out.push({ kind: 'line', layer: L, a: { x: 0, y }, b: { x: width, y } });
  spec.columns.forEach((c, j) => out.push(text(c.label, j, y + rh / 2, true)));
  spec.rows.forEach((r, i) => {
    const h = heights[i]!;
    y -= h;
    if (i < spec.rows.length - 1) out.push({ kind: 'line', layer: L, a: { x: 0, y }, b: { x: width, y } });
    r.forEach((cell, j) => {
      if (typeof cell === 'string') { if (cell) out.push(text(cell, j, y + h / 2)); return; }
      const lines = cell.text ? cell.text.split('\n') : [];
      const room = h - lines.length * (th * 1.4) - 3, w = xs[j + 1]! - xs[j]! - 4;
      const b = bounds(cell.figure), fw = b.x1 - b.x0 || 1, fhh = b.y1 - b.y0 || 1;
      // Figures arrive in model millimetres; scaled to fit the cell, centred.
      const s = Math.max(fw / w, fhh / Math.max(room, 4), spec.figureScale ?? 1e-9);
      const ox = (xs[j]! + xs[j + 1]!) / 2 - fw / s / 2, oy = y + 1.5 + lines.length * th * 1.4 + (room - fhh / s) / 2;
      out.push(...place(cell.figure, s, { x: ox, y: oy }, { x: b.x0, y: b.y0 }));
      lines.forEach((ln, k) => out.push(text(ln, j, y + 1.5 + (lines.length - 1 - k) * th * 1.4 + th * 0.7)));
    });
  });
  return { primitives: out, width, height };
}

/** A block of numbered notes, wrapped to a width, top down from (0, height). */
export function drawNotes(title: string, notes: readonly string[], width = 170, h = 2.5): { primitives: Primitive[]; width: number; height: number } {
  const perLine = Math.max(20, Math.floor(width / (h * 0.55)));
  const lines: Array<{ s: string; indent: number }> = [];
  notes.forEach((n, i) => {
    let cur = `${i + 1}.`, first = true;
    for (const w of n.split(/\s+/).filter(Boolean)) {
      if (cur.length + 1 + w.length > perLine) { lines.push({ s: cur, indent: first ? 0 : 1 }); cur = w; first = false; }
      else cur = `${cur} ${w}`;
    }
    lines.push({ s: cur, indent: first ? 0 : 1 });
  });
  const lh = h * 1.6, height = (lines.length + 2) * lh;
  const out: Primitive[] = [{ kind: 'text', layer: 'NOTE-TEXT', at: { x: 0, y: height - lh }, text: title, height: h * 1.3 }];
  lines.forEach((l, k) => out.push({ kind: 'text', layer: 'NOTE-TEXT', at: { x: l.indent ? h * 1.6 : 0, y: height - (k + 2.5) * lh }, text: l.s, height: h }));
  return { primitives: out, width, height };
}
