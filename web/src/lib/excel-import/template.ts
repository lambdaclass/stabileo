/**
 * The empty workbook a reader downloads to find out what to fill in.
 *
 * ── Why a template exists at all ───────────────────────────────────
 *
 * An importer without one is a guessing game: the reader has a spreadsheet of
 * their own, no idea which column we call `nodeI`, and one way to find out —
 * import, read the error, edit, repeat. The template turns that loop into a
 * file that is already correct and only needs its numbers replaced.
 *
 * ── Filled in, not blank ───────────────────────────────────────────
 *
 * Every sheet ships with two or three example rows describing a small portal
 * frame. A blank grid with headers still leaves the questions that actually
 * stop people: is `type` `frame` or `Frame`, does a hinge want `yes` or
 * `TRUE`, what does an unused column want — and each of those has a shape you
 * can copy but not one you can guess. The examples are meant to be deleted,
 * and the instructions sheet says so in the first line.
 *
 * The four Loads rows are chosen to be the four kinds of thing a load can be —
 * at a node, along a member, at a point on a member, thermal — rather than
 * four of the easiest kind, because the columns that go blank between them are
 * the explanation.
 */

import { loadXlsxModule } from '../export/excel';
import { t } from '../i18n';
import { uiStore } from '../store';
import { SHEETS, INSTRUCTIONS_SHEET, headerFor, LOAD_TYPES } from './schema';

/** Column widths, so a header is readable without dragging anything. */
function widthsFor(headers: string[]): Array<{ wch: number }> {
  return headers.map((h) => ({ wch: Math.max(10, Math.min(28, h.length + 4)) }));
}

/**
 * The prose sheet, in the reader's language.
 *
 * This is where translation belongs — and the ONLY place it belongs in this
 * file. Sheet names and headers stay English because they are the format; see
 * `schema.ts`. A reader gets the explanation in Spanish and the keys in the
 * one spelling every version of the importer will accept.
 */
function instructionRows(): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    [t('xls.tpl.title')],
    [],
    [t('xls.tpl.intro')],
    [t('xls.tpl.deleteExamples')],
    [t('xls.tpl.units')],
    [t('xls.tpl.optional')],
    [],
    [t('xls.tpl.loadTypesHeading')],
    [LOAD_TYPES.join('   ·   ')],
    [],
  ];

  for (const sheet of SHEETS) {
    rows.push([`── ${sheet.name} — ${t(sheet.titleKey)}`]);
    for (const col of sheet.columns) {
      rows.push([
        '',
        headerFor(col),
        col.required ? t('xls.tpl.required') : t('xls.tpl.optionalMark'),
        t(col.helpKey),
      ]);
    }
    rows.push([]);
  }
  return rows;
}

/**
 * Build and download `plantilla-stabileo.xlsx`.
 *
 * Returns false when the spreadsheet library could not be loaded — the same
 * bargain `loadXlsxModule` strikes with every other caller: the reader has
 * already been told, and nothing throws into a handler that would not catch it.
 */
/**
 * The workbook itself, separated from downloading it.
 *
 * Split out so a test can build the REAL file — headers, example rows, sheet
 * names and all — write it to a buffer, read it back and run it through the
 * importer. Asserting against `SHEETS` instead would only prove the schema
 * agrees with itself; this proves the bytes we hand somebody parse under the
 * reader we hand them alongside.
 *
 * Takes the module rather than loading it, because the caller already has to
 * deal with the load failing and a second failure path here would be a second
 * place to report the same thing.
 */
export function buildTemplateWorkbook(XLSX: NonNullable<Awaited<ReturnType<typeof loadXlsxModule>>>) {
  const wb = XLSX.utils.book_new();

  const help = XLSX.utils.aoa_to_sheet(instructionRows());
  help['!cols'] = [{ wch: 2 }, { wch: 18 }, { wch: 12 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, help, INSTRUCTIONS_SHEET);

  for (const sheet of SHEETS) {
    const headers = sheet.columns.map(headerFor);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sheet.examples]);
    ws['!cols'] = widthsFor(headers);
    /* The header row stays put while a long Loads sheet is scrolled. */
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  return wb;
}

export async function downloadTemplate(): Promise<boolean> {
  const XLSX = await loadXlsxModule();
  if (!XLSX) return false;
  XLSX.writeFile(buildTemplateWorkbook(XLSX), 'plantilla-stabileo.xlsx');
  uiStore.toast(t('xls.tpl.downloaded'), 'success');
  return true;
}
