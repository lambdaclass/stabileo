/**
 * One line of formats for every report the program writes, the analysed model's and the designed
 * one's alike: PDF (printed by the browser from the same HTML, figures included), HTML, Word
 * (DOCX), a workbook (XLSX) and CSV. Each report keeps its own content; what it shares is the
 * formats and how they are made: the report's HTML read as blocks (headings, paragraphs, tables)
 * for the formats that are not HTML, so a table says the same in each.
 *
 * `htmlToBlocks` reads the subset our reports write (h1–h4, p, li, caption, div text, tables);
 * figures (SVG, images) stay in the HTML and the PDF.
 */
import { strToU8, zipSync } from 'fflate';
import type * as Xlsx from 'xlsx';
import { docxBytes, type DocBlock } from './docx';

export type ReportFormat = 'pdf' | 'html' | 'docx' | 'xlsx' | 'csv';
export const REPORT_FORMATS: readonly ReportFormat[] = ['pdf', 'html', 'docx', 'xlsx', 'csv'];

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', deg: '°', times: '×', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', sup2: '²', sup3: '³' };
export const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d?);/gi, (m, e: string) => {
  if (e[0] === '#') { const k = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(k) ? String.fromCodePoint(k) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const clean = (s: string) => decodeEntities(s).replace(/\s+/g, ' ').trim();

/** A report's HTML as blocks: headings, paragraphs and tables, in order. */
export function htmlToBlocks(html: string): DocBlock[] {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<![^>]*>/g, '')
    .replace(/<(script|style|svg|head|title|noscript)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<img\b[^>]*>/gi, '');
  const out: DocBlock[] = [];
  const BLOCK = new Set(['p', 'li', 'div', 'caption', 'section', 'header', 'footer', 'figcaption', 'dt', 'dd', 'ul', 'ol', 'figure', 'main', 'article', 'body']);
  let text = '', heading: 1 | 2 | 3 | null = null;
  let table: { rows: string[][]; heads: boolean[] } | null = null, row: string[] | null = null, cell: string | null = null, rowHead = false;
  const paragraph = () => { const t = clean(text); text = ''; if (t) out.push({ kind: 'paragraph', text: t }); };
  const re = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>|([^<]+)/gi;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m[3] !== undefined) { if (cell !== null) cell += m[3]; else text += m[3]; continue; }
    const close = m[1] === '/', tag = m[2]!.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      if (!close) { paragraph(); heading = Math.min(3, Number(tag[1])) as 1 | 2 | 3; }
      else { const t = clean(text); text = ''; if (t) out.push({ kind: 'heading', text: t, level: heading ?? 2 }); heading = null; }
    } else if (tag === 'table') {
      if (!close) { paragraph(); table = { rows: [], heads: [] }; }
      else if (table) {
        const keep = table.rows.map((r, i) => ({ r, h: table!.heads[i] })).filter((x) => x.r.some((c) => c));
        if (keep.length) {
          const width = Math.max(...keep.map((x) => x.r.length));
          const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
          const headFirst = !!keep[0]!.h;
          out.push({ kind: 'table', head: headFirst ? pad(keep[0]!.r) : Array(width).fill(''), rows: (headFirst ? keep.slice(1) : keep).map((x) => pad(x.r)) });
        }
        table = null;
      }
    } else if (table && tag === 'tr') {
      if (!close) { row = []; rowHead = false; } else if (row) { table.rows.push(row); table.heads.push(rowHead); row = null; }
    } else if (table && (tag === 'td' || tag === 'th')) {
      if (!close) { cell = ''; if (tag === 'th') rowHead = true; } else if (row && cell !== null) { row.push(clean(cell)); cell = null; }
    } else if (tag === 'br') {
      // A line break inside a block reads as a space: the block stays one paragraph.
      if (cell !== null) cell += ' '; else text += ' ';
    } else if (BLOCK.has(tag) && cell === null && heading === null) paragraph();
  }
  paragraph();
  return out;
}

/** The blocks as a workbook: the text in a first sheet, each table in a sheet named after the heading over it. */
export function blocksWorkbook(X: typeof Xlsx, title: string, blocks: readonly DocBlock[]): Uint8Array {
  const wb = X.utils.book_new(), used = new Set<string>();
  const name = (s: string) => {
    let n = s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Tabla', k = 2;
    while (used.has(n)) n = `${n.slice(0, 27)} ${k++}`;
    used.add(n); return n;
  };
  const text = [[title], ...blocks.filter((b) => b.kind !== 'table').map((b) => [(b as { text: string }).text])];
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(text), name(title));
  let last = title;
  for (const b of blocks) {
    if (b.kind === 'heading') last = b.text;
    if (b.kind !== 'table') continue;
    const ws = X.utils.aoa_to_sheet([b.head, ...b.rows].map((r) => r.map((c) => { const v = Number(c.replace(/\s/g, '').replace(',', '.')); return c !== '' && /^-?[\d\s.,]+$/.test(c) && Number.isFinite(v) && !/\d\.\d{3}/.test(c) ? v : c; })));
    ws['!cols'] = b.head.map((_, j) => ({ wch: Math.min(60, Math.max(...[b.head, ...b.rows].map((r) => (r[j] ?? '').length)) + 2) }));
    X.utils.book_append_sheet(wb, ws, name(last));
  }
  return X.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

const csvOf = (rows: string[][]) => rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n') + '\r\n';

/** The blocks' tables as CSV: one file when there is one table, a zip of them when there are more. */
export function blocksCsv(blocks: readonly DocBlock[]): { name: 'csv' | 'zip'; bytes: Uint8Array } {
  const tables = blocks.flatMap((b, i) => (b.kind === 'table' ? [{ b, title: [...blocks.slice(0, i)].reverse().find((x) => x.kind === 'heading') as { text: string } | undefined }] : []));
  if (tables.length === 1) return { name: 'csv', bytes: strToU8(csvOf([tables[0]!.b.head, ...tables[0]!.b.rows])) };
  const used = new Map<string, number>();
  return {
    name: 'zip',
    bytes: zipSync(Object.fromEntries(tables.map(({ b, title }, i) => {
      const base = (title?.text ?? `tabla-${i + 1}`).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(0, 40) || `tabla-${i + 1}`;
      const n = (used.get(base) ?? 0) + 1; used.set(base, n);
      return [`${String(i + 1).padStart(2, '0')}-${base}${n > 1 ? `-${n}` : ''}.csv`, strToU8(csvOf([b.head, ...b.rows]))];
    }))),
  };
}

/** A report in a format, as a file: name and bytes (or null for the PDF, which the browser prints). */
export async function reportFile(format: ReportFormat, r: { title: string; html: string; stem: string; blocks?: DocBlock[]; loadXlsx: () => Promise<typeof Xlsx | null> }): Promise<{ filename: string; mime: string; bytes: Uint8Array | string } | null> {
  const blocks = () => r.blocks ?? htmlToBlocks(r.html);
  switch (format) {
    case 'pdf': return null;
    case 'html': return { filename: `${r.stem}.html`, mime: 'text/html', bytes: r.html };
    case 'docx': return { filename: `${r.stem}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: docxBytes({ title: r.title, blocks: blocks(), landscape: blocks().some((b) => b.kind === 'table' && b.head.length > 7) }) };
    case 'xlsx': { const X = await r.loadXlsx(); return X ? { filename: `${r.stem}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: blocksWorkbook(X, r.title, blocks()) } : null; }
    case 'csv': { const c = blocksCsv(blocks()); return { filename: `${r.stem}${c.name === 'zip' ? '-csv.zip' : '.csv'}`, mime: c.name === 'zip' ? 'application/zip' : 'text/csv', bytes: c.bytes }; }
  }
}
