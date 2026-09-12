/**
 * Every column the template offers is a column the importer reads.
 *
 * ── The failure this exists to prevent ─────────────────────────────
 *
 * The template and the parser are two descriptions of one format. They are
 * written apart — `schema.ts` says what the file looks like, `parse.ts` says
 * what is done with it — and nothing structural keeps them in step. Either
 * can drift alone, and each direction fails silently:
 *
 *   A column in the template that the parser never reads is a promise the
 *   file makes and the importer breaks. The reader fills it in, the import
 *   reports no problems, and the value is simply gone.
 *
 *   A key the parser reads that the template never offers is a column the
 *   reader has no way to learn about except by guessing the spelling.
 *
 * `template-roundtrip.test.ts` writes the real bytes and reads them back, so
 * it catches serialisation faults. It does not catch either of these: a
 * template with a dead column round-trips perfectly.
 *
 * ── How this checks it ─────────────────────────────────────────────
 *
 * Behaviourally, not by scanning source. For each column, parse the
 * template's own example rows twice — once as they are, once with that one
 * cell changed — and require the resulting model to differ. A column that
 * cannot change the outcome is not being read.
 *
 * That phrasing survives refactoring: it does not care whether the parser
 * reads `cells.rho` or goes through a helper, only that the column matters.
 */

import { describe, it, expect } from 'vitest';
import { SHEETS, INSTRUCTIONS_SHEET, type SheetSpec } from '../schema';
import { parseWorkbook } from '../parse';

/** The template's own sheets, as rows of cells, without touching xlsx. */
function templateSheets(): Record<string, unknown[][]> {
  const out: Record<string, unknown[][]> = {};
  for (const sheet of SHEETS) {
    const header = sheet.columns.map((c) => (c.unit ? `${c.key} [${c.unit}]` : c.key));
    out[sheet.name] = [header, ...sheet.examples.map((r) => [...r])];
  }
  return out;
}

/**
 * Values worth trying in one cell, most plausible first.
 *
 * Guessing a single "different value" does not work here. Most optional
 * columns are blank in the example rows AND declare `example: ''`, so there
 * is nothing in the schema that says whether the column wants a number, a
 * word, or one of a fixed set — and a word dropped into a numeric column
 * reads as "no number given", changes nothing, and looks exactly like a
 * column the parser ignores.
 *
 * So the question asked is the honest one: is there ANY value this cell can
 * hold that changes what gets imported? A column with no such value is not
 * being read, whatever its type.
 */
function candidates(current: unknown, sheet: SheetSpec, key: string): unknown[] {
  const out: unknown[] = [];

  if (typeof current === 'number') out.push(current + 7);
  else out.push(12_345);

  /*
   * Enumerated columns must move to ANOTHER member of their enum: a made-up
   * word is rejected as unknown, and a rejected row proves nothing about
   * whether the column is read.
   */
  const enums: Record<string, string[]> = {
    type: sheet.name === 'Supports'
      ? ['fixed', 'pinned', 'rollerX', 'spring']
      : sheet.name === 'Loads'
        ? ['nodal', 'distributed', 'pointOnElement']
        : ['frame', 'truss'],
    shape: ['rect', 'circle', 'I'],
    /* The yes/no columns, whose opposite is the only interesting value. */
    hingeStart: ['yes', 'no', 'si'],
    hingeEnd: ['yes', 'no', 'si'],
  };
  const options = enums[key];
  if (options) {
    const text = String(current ?? '').toLowerCase();
    for (const o of options) if (o.toLowerCase() !== text) out.push(o);
  }

  const text = String(current ?? '');
  out.push(text === '' ? 'Zx9' : `${text}_b`);
  return out;
}

/**
 * Columns whose job is to be echoed, not acted on. Kept short and named,
 * because "this one does not have to matter" is exactly the excuse a real
 * drift would hide behind.
 */
const INFORMATIONAL = new Set<string>([
  /* A material's display name reaches the model but changes no number. */
  'Materials:name',
  'Sections:name',
]);

describe('the template and the importer describe the same format', () => {
  it('every sheet in the template is one the parser knows', () => {
    const parsed = parseWorkbook(templateSheets());
    expect(parsed.unknownSheets, 'a sheet nobody reads is a sheet nobody should ship')
      .toEqual([]);
  });

  it('the instructions sheet is not mistaken for data', () => {
    const withNotes = { ...templateSheets(), [INSTRUCTIONS_SHEET]: [['—']] };
    expect(parseWorkbook(withNotes).unknownSheets).toEqual([]);
  });

  it('the template imports with nothing to report', () => {
    /*
     * The baseline every case below is measured against. If the template
     * itself does not parse cleanly, a difference caused by perturbing a
     * cell would tell us nothing.
     */
    const parsed = parseWorkbook(templateSheets());
    expect(parsed.problems, JSON.stringify(parsed.problems.slice(0, 4))).toEqual([]);
  });

  for (const sheet of SHEETS) {
    for (let col = 0; col < sheet.columns.length; col += 1) {
      const column = sheet.columns[col];
      const label = `${sheet.name}:${column.key}`;
      if (INFORMATIONAL.has(label)) continue;

      it(`${label} reaches the model`, () => {
        const base = templateSheets();
        const rows = base[sheet.name];
        if (rows.length < 2) return; // a sheet with no examples has nothing to check

        const before = parseWorkbook(base);

        /*
         * Every example row, not just the first. `Loads` is one wide sheet
         * where a row's TYPE decides which columns apply — `qi` means
         * nothing on a nodal load — so a column can only be shown to matter
         * on a row that uses it. Asking the first row alone accused half the
         * load columns of being dead.
         */
        let read = false;
        const tried: unknown[] = [];
        for (let r = 1; r < rows.length && !read; r += 1) {
        for (const value of candidates((rows[r] as unknown[])[col], sheet, column.key)) {
          const changed = templateSheets();
          (changed[sheet.name][r] as unknown[])[col] = value;
          const after = parseWorkbook(changed);
          /*
           * Either the model changed, or the importer refused the new value
           * — both mean the column was READ. What must not happen is the
           * value changing and nothing downstream noticing.
           */
          const modelMoved = JSON.stringify(before.model) !== JSON.stringify(after.model);
          const complained = after.problems.length > before.problems.length;
          tried.push(value);
          if (modelMoved || complained) { read = true; break; }
        }
        }

        expect(
          read,
          `${label}: nothing changes the import — tried ${JSON.stringify(tried)}. `
          + 'The template offers a column the parser never reads.',
        ).toBe(true);
      });
    }
  }
});

describe('the header the template writes is the header the parser expects', () => {
  it('a unit in brackets does not hide the column', () => {
    /*
     * The template writes "x [m]" and the parser has to find `x`. Stripping
     * the unit is one line in `parse.ts`, and losing it would make every
     * dimensioned column vanish at once — silently, because a missing
     * optional column is not an error.
     */
    const sheets = templateSheets();
    const dimensioned = SHEETS.flatMap((s) =>
      s.columns.filter((c) => c.unit).map((c) => `${s.name}:${c.key}`));
    expect(dimensioned.length, 'there are dimensioned columns to protect')
      .toBeGreaterThan(5);

    const parsed = parseWorkbook(sheets);
    expect(parsed.problems).toEqual([]);
    expect(parsed.model.nodes.length).toBeGreaterThan(0);
    /* The coordinates arrived, so "x [m]" was read as `x`. */
    expect(parsed.model.nodes.some((n) => n.x !== 0)).toBe(true);
  });

  it('the parser reads headers case- and space-insensitively', () => {
    /*
     * People edit these files. A column retyped as " X [m] " must still be
     * the same column, or a template that has been through one round of
     * hand-editing stops importing for a reason nobody can see.
     */
    const sheets = templateSheets();
    const header = sheets.Nodes[0] as string[];
    sheets.Nodes[0] = header.map((h) => ` ${String(h).toUpperCase()} `);
    const parsed = parseWorkbook(sheets);
    expect(parsed.problems).toEqual([]);
    expect(parsed.model.nodes.length).toBeGreaterThan(0);
  });
});
