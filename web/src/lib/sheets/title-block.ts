/**
 * The sheet's frame and its one title block, from the project's data (`ProjectInfo` and the
 * rótulo): office and project, client, job and site; the sheet's number, title, scale, format and
 * revision; who designed, checked and approved; and the drawing's own codes. Labels in the language
 * chosen for documents.
 */
import type { FormatGeometry, SheetFormat } from './formats';
import type { Primitive } from './primitives';

export interface TitleBlockData {
  office?: string; project?: string; client?: string; job?: string; jobNumber?: string; site?: string;
  sheetNumber: string; sheetTitle: string; scale: string; format: SheetFormat;
  revision?: { code: string; date?: string; note?: string };
  designer?: string; checker?: string; approver?: string;
  codes?: string;
  /** The document's readiness ("for review", "issued"), read on every sheet just above the block. */
  status?: string;
  /** Lines from the office's title block template, its variables filled (`sheet-entries.ts`). */
  lines?: string[];
}

/** `label(key)` translates a label in the documents' language. */
export function frameAndTitleBlock(g: FormatGeometry, d: TitleBlockData, label: (key: string) => string): Primitive[] {
  const L = 'SHEET-FRAME', T = 'SHEET-TITLE', { frame: f, titleBlock: b } = g;
  const rect = (x0: number, y0: number, x1: number, y1: number, layer = T): Primitive => ({ kind: 'polyline', layer, closed: true, points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
  const out: Primitive[] = [rect(0.5, 0.5, g.width - 0.5, g.height - 0.5, L), rect(f.x0, f.y0, f.x1, f.y1, L), rect(b.x0, b.y0, b.x1, b.y1)];
  // Rows of the block, bottom up: signatures, revision, sheet, project, office.
  const rows = [0, 10, 20, 34, 46, 56];
  for (const r of rows.slice(1, -1)) out.push({ kind: 'line', layer: T, a: { x: b.x0, y: b.y0 + r }, b: { x: b.x1, y: b.y0 + r } });
  const mid = b.x0 + 90, col = (k: number) => b.x0 + k * 60;
  out.push({ kind: 'line', layer: T, a: { x: mid, y: b.y0 + 20 }, b: { x: mid, y: b.y0 + 34 } });
  for (const k of [1, 2]) out.push({ kind: 'line', layer: T, a: { x: col(k), y: b.y0 }, b: { x: col(k), y: b.y0 + 10 } });
  const tx = (x: number, y: number, s: string, h = 2.2): Primitive => ({ kind: 'text', layer: T, at: { x, y }, text: s, height: h });
  const lab = (x: number, y: number, k: string): Primitive => tx(x, y, label(k), 1.6);
  out.push(tx(b.x0 + 3, b.y0 + 49, d.office ?? '', 3));
  out.push(lab(b.x0 + 3, b.y0 + 42.5, 'sheet.tb.project'), tx(b.x0 + 3, b.y0 + 37.5, [d.project, d.jobNumber && `(${d.jobNumber})`].filter(Boolean).join(' '), 3));
  if (d.lines?.length) d.lines.slice(0, 3).forEach((l, i) => out.push(tx(b.x0 + 100, b.y0 + 52 - i * 4.5, l, 1.8)));
  else out.push(tx(b.x0 + 100, b.y0 + 42.5, [d.client, d.site].filter(Boolean).join(' · '), 2));
  out.push(lab(b.x0 + 3, b.y0 + 30.5, 'sheet.tb.sheet'), tx(b.x0 + 3, b.y0 + 23.5, d.sheetTitle, 2.8));
  out.push(lab(mid + 3, b.y0 + 30.5, 'sheet.tb.number'), tx(mid + 3, b.y0 + 23.5, d.sheetNumber, 4));
  out.push(lab(mid + 45, b.y0 + 30.5, 'sheet.tb.scale'), tx(mid + 45, b.y0 + 23.5, `${d.scale} · ${d.format}`, 2.5));
  out.push(lab(b.x0 + 3, b.y0 + 15.5, 'sheet.tb.revision'), tx(b.x0 + 3, b.y0 + 11.5, d.revision ? [d.revision.code, d.revision.date, d.revision.note].filter(Boolean).join(' · ') : '—', 2));
  if (d.status) out.push({ kind: 'text', layer: T, at: { x: b.x1, y: b.y1 + 1.5 }, text: d.status, height: 2.5, align: 'right' });
  if (d.codes) out.push(tx(mid + 3, b.y0 + 11.5, d.codes, 1.8));
  for (const [k, who, key] of [[0, d.designer, 'sheet.tb.designer'], [1, d.checker, 'sheet.tb.checker'], [2, d.approver, 'sheet.tb.approver']] as const) {
    out.push(lab(col(k) + 2, b.y0 + 6.5, key), tx(col(k) + 2, b.y0 + 2, who ?? '', 2));
  }
  return out;
}
