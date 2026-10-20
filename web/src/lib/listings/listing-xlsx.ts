/**
 * A listing as a worksheet: the header row, numbers kept as numbers with their column's decimals
 * as the cell format, texts as texts, the columns as wide as their content. Takes the spreadsheet
 * module as a parameter so the library loads only when a workbook is asked for.
 */
import type * as Xlsx from 'xlsx';
import { cellText, type Listing } from './listing';

export function listingSheet(X: typeof Xlsx, l: Listing, locale: string): Xlsx.WorkSheet {
  const head = l.columns.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label));
  const ws = X.utils.aoa_to_sheet([head]);
  l.rows.forEach((r, i) => l.columns.forEach((c, j) => {
    const v = r[c.key] ?? null, ref = X.utils.encode_cell({ r: i + 1, c: j });
    ws[ref] = typeof v === 'number' && Number.isFinite(v)
      ? { t: 'n', v, z: (c.digits ?? 2) > 0 ? `0.${'0'.repeat(c.digits ?? 2)}` : '0' }
      : { t: 's', v: cellText(v, c, locale) };
  }));
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: l.rows.length, c: Math.max(0, l.columns.length - 1) } });
  ws['!cols'] = l.columns.map((c, j) => ({ wch: Math.min(60, Math.max(head[j]!.length, ...l.rows.map((r) => cellText(r[c.key] ?? null, c, locale).length)) + 2) }));
  return ws;
}

/** A workbook of listings, one sheet each (names cut to the 31 characters a sheet name allows). */
export function listingsWorkbook(X: typeof Xlsx, ls: readonly Listing[], locale: string): Uint8Array {
  const wb = X.utils.book_new(), used = new Set<string>();
  for (const l of ls) {
    let name = l.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || l.id, n = 2;
    while (used.has(name)) name = `${name.slice(0, 28)} ${n++}`;
    used.add(name);
    X.utils.book_append_sheet(wb, listingSheet(X, l, locale), name);
  }
  return X.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
