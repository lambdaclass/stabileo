/**
 * What every sheet of the project workbook shares: its shape, and the two rules its cells follow.
 *
 * Numbers are written as they are, in full precision: the workbook is a record of the results,
 * and rounding belongs to whoever reads it. Text never starts with `+`, `-`, `=` or `@`: a
 * spreadsheet opening a CSV takes such a cell for a formula, which is how a combination named
 * "-1.2 D" turned into `#NAME?` in the reference workbook.
 */

/** One sheet: its name, then its rows, the first one the header. */
export interface WorkbookSheet { name: string; rows: Array<Array<string | number>> }

/** Rows per sheet an xlsx file can hold, the header included. */
export const XLSX_MAX_ROWS = 1_048_576;

/**
 * A text cell that no spreadsheet reads as a formula. A leading minus becomes the minus sign
 * (U+2212), which reads the same; `+`, `=` and `@` get a space before them.
 */
export function safeText(s: string): string {
  if (s.startsWith('-')) return `−${s.slice(1)}`;
  return /^[+=@]/.test(s) ? ` ${s}` : s;
}

/**
 * A name as it was before `safeText`: the leading minus sign read back as the hyphen it was
 * written for (the space before `+`, `=` and `@` goes with the trim every name gets). Without it,
 * a node named "-A1" came back from Excel as "−A1".
 */
export function unguardText(s: string): string {
  const t = s.trim();
  return t.startsWith('−') ? `-${t.slice(1)}` : t;
}

/**
 * Cells a workbook is written as xlsx up to; above them, as a zip of CSVs.
 *
 * Measured on validation model 04 at 5 stations, 10.9 million cells: the xlsx library took 27 s
 * and 2.1 GB of heap to write 156 MB, where the zip of CSVs took 3 s and came to 27 MB. At 13
 * stations the xlsx would not fit in a browser tab's memory. At the same rate, four million cells
 * take about ten seconds and under a gigabyte.
 */
export const XLSX_MAX_CELLS = 4_000_000;

/** Whether the workbook fits in an xlsx file: every sheet under the row limit, the whole under the cell budget. */
export function fitsInXlsx(sheets: readonly WorkbookSheet[]): boolean {
  let cells = 0;
  for (const s of sheets) {
    if (s.rows.length > XLSX_MAX_ROWS) return false;
    for (const r of s.rows) cells += r.length;
  }
  return cells <= XLSX_MAX_CELLS;
}

export type WorkbookRow = Array<string | number>;

/** A sheet whose rows are produced as they are written, and counted beforehand without producing them. */
export interface StreamedSheet { name: string; header: WorkbookRow; body: () => Iterable<WorkbookRow>; count: () => number; columns?: number }

export type WorkbookPart = WorkbookSheet | StreamedSheet;

export const isStreamed = (p: WorkbookPart): p is StreamedSheet => 'body' in p;

export function materialize(p: WorkbookPart): WorkbookSheet {
  return isStreamed(p) ? { name: p.name, rows: [p.header, ...p.body()] } : p;
}

/** Rows and cells a part will have once written, the header included. */
export function partSize(p: WorkbookPart): { rows: number; cells: number } {
  if (isStreamed(p)) { const n = p.count() + 1; return { rows: n, cells: n * (p.columns ?? p.header.length) }; }
  let cells = 0;
  for (const r of p.rows) cells += r.length;
  return { rows: p.rows.length, cells };
}

/** `fitsInXlsx` before any streamed row is produced. */
export function partsFitInXlsx(parts: readonly WorkbookPart[]): boolean {
  let cells = 0;
  for (const p of parts) {
    const s = partSize(p);
    if (s.rows > XLSX_MAX_ROWS) return false;
    cells += s.cells;
  }
  return cells <= XLSX_MAX_CELLS;
}
