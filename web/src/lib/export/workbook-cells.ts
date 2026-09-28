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
