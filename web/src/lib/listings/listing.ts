/**
 * A listing: one topic of the project (its combinations, its beams, its checks…) as a table with
 * named columns, rows of values and notes. Each listing is chosen column by column and filtered,
 * and written in every format from the same rows (`toHtml`, `toCsv`, `toAoa` for the workbook,
 * `toPdfPages` for the native PDF), so the formats cannot disagree about what a listing says.
 *
 * Pure.
 */
import { drawTable } from '../sheets/plans/table';
import type { Primitive } from '../sheets/primitives';
import type { DocModel } from '../export/docx';

export interface ListingColumn { key: string; label: string; unit?: string; align?: 'left' | 'right'; digits?: number }
export type ListingValue = string | number | null;
export interface Listing { id: string; title: string; columns: ListingColumn[]; rows: Array<Record<string, ListingValue>>; notes?: string[] }

/** What a person chose for a listing: its columns (absent, all) and its filter. */
export interface ListingConfig { columns?: string[]; text?: string; failingOnly?: boolean }

/** The listing as configured: its columns in the chosen set, its rows passing the filter. */
export function configure(l: Listing, c: ListingConfig | undefined, statusKey = 'status'): Listing {
  if (!c) return l;
  const cols = c.columns?.length ? l.columns.filter((x) => c.columns!.includes(x.key)) : l.columns;
  const q = c.text?.trim().toLowerCase();
  const rows = l.rows.filter((r) => {
    if (c.failingOnly && r[statusKey] !== undefined && !/fail|no verifica|não verifica/i.test(String(r[statusKey]))) return false;
    if (q && !Object.values(r).some((v) => v !== null && String(v).toLowerCase().includes(q))) return false;
    return true;
  });
  return { ...l, columns: cols, rows };
}

/** A value as every format writes it: numbers at their column's digits, in the listing's locale. */
export function cellText(v: ListingValue, col: ListingColumn, locale: string): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? new Intl.NumberFormat(locale, { minimumFractionDigits: col.digits ?? 2, maximumFractionDigits: col.digits ?? 2 }).format(v) : '—';
  return v;
}

const head = (c: ListingColumn) => (c.unit ? `${c.label} (${c.unit})` : c.label);

/** Rows of texts, header first: what the workbook, the CSV and the checks compare. */
export function toAoa(l: Listing, locale: string): string[][] {
  return [l.columns.map(head), ...l.rows.map((r) => l.columns.map((c) => cellText(r[c.key] ?? null, c, locale)))];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A standalone HTML document of the listing. */
export function toHtml(l: Listing, locale: string, project = ''): string {
  const aoa = toAoa(l, locale);
  const align = (i: number) => (l.columns[i]?.align === 'right' ? ' class="r"' : '');
  return `<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><title>${esc(l.title)}</title>`
    + `<style>body{font:13px/1.4 Helvetica,Arial,sans-serif;margin:24px;color:#111}h1{font-size:18px}table{border-collapse:collapse}th,td{border:1px solid #999;padding:3px 8px}th{background:#eee;text-align:left}.r{text-align:right;font-variant-numeric:tabular-nums}p.n{color:#444}</style></head><body>`
    + `<h1>${esc(l.title)}</h1>${project ? `<p>${esc(project)}</p>` : ''}<table><thead><tr>${aoa[0]!.map((h, i) => `<th${align(i)}>${esc(h)}</th>`).join('')}</tr></thead><tbody>`
    + aoa.slice(1).map((r) => `<tr>${r.map((v, i) => `<td${align(i)}>${esc(v)}</td>`).join('')}</tr>`).join('')
    + `</tbody></table>${(l.notes ?? []).map((n) => `<p class="n">${esc(n)}</p>`).join('')}</body></html>`;
}

/** CSV with a semicolon (the separator spreadsheets read where the decimal comma is used). */
export function toCsv(l: Listing, locale: string): string {
  const q = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return toAoa(l, locale).map((r) => r.map(q).join(';')).join('\r\n') + '\r\n';
}

/** The listing on A4 pages for the native PDF: its title, the table split into pages, the notes. */
export function toPdfPages(l: Listing, locale: string, project = ''): Array<{ width: number; height: number; primitives: Primitive[] }> {
  const aoa = toAoa(l, locale), W = 297, H = 210, M = 12, perPage = 26;
  // Column widths from the longest text in each, scaled to fit the page.
  const want = aoa[0]!.map((_, j) => Math.max(...aoa.map((r) => (r[j] ?? '').length)) * 1.6 + 4);
  const k = Math.min(1, (W - 2 * M) / want.reduce((s, w) => s + w, 0));
  const columns = aoa[0]!.map((label, j) => ({ label, width: want[j]! * k, align: l.columns[j]?.align === 'right' ? 'right' as const : 'left' as const }));
  const body = aoa.slice(1), pages: Array<{ width: number; height: number; primitives: Primitive[] }> = [];
  for (let p = 0; p === 0 || p * perPage < body.length; p++) {
    const t = drawTable({ columns, rows: body.slice(p * perPage, (p + 1) * perPage), textHeight: 2.2, rowHeight: 6 });
    const top = H - M - 14;
    const prims: Primitive[] = [
      { kind: 'text', layer: 'TB-TEXT', at: { x: M, y: H - M - 6 }, text: l.title + (body.length > perPage ? ` (${p + 1})` : ''), height: 4.5 },
      ...(project ? [{ kind: 'text' as const, layer: 'TB-TEXT', at: { x: W - M, y: H - M - 6 }, text: project, height: 2.5, align: 'right' as const }] : []),
      ...t.primitives.map((q) => shift(q, M, top - t.height)),
    ];
    const last = (p + 1) * perPage >= body.length;
    if (last) (l.notes ?? []).forEach((n, i) => prims.push({ kind: 'text', layer: 'TB-TEXT', at: { x: M, y: top - t.height - 6 - i * 4.5 }, text: n, height: 2.2 }));
    pages.push({ width: W, height: H, primitives: prims });
  }
  return pages;
}

function shift(p: Primitive, dx: number, dy: number): Primitive {
  const f = (q: { x: number; y: number }) => ({ x: q.x + dx, y: q.y + dy });
  switch (p.kind) {
    case 'line': return { ...p, a: f(p.a), b: f(p.b) };
    case 'polyline': return { ...p, points: p.points.map(f) };
    case 'circle': case 'arc': return { ...p, c: f(p.c) };
    case 'text': return { ...p, at: f(p.at) };
    case 'dimension': return { ...p, a: f(p.a), b: f(p.b) };
  }
}

/** The listing as a Word document: its title, the project, the table and the notes. */
export function toDocModel(l: Listing, locale: string, project = ''): DocModel {
  const aoa = toAoa(l, locale);
  return {
    title: l.title, landscape: l.columns.length > 6,
    blocks: [
      ...(project ? [{ kind: 'paragraph' as const, text: project, muted: true }] : []),
      { kind: 'table' as const, head: aoa[0]!, rows: aoa.slice(1), align: l.columns.map((c) => c.align ?? 'left') },
      ...(l.notes ?? []).map((n) => ({ kind: 'paragraph' as const, text: n, muted: true })),
    ],
  };
}
