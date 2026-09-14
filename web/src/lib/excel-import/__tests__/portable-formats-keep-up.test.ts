/**
 * The three portable formats have to carry whatever the model grows.
 *
 * ── The failure this exists to prevent ─────────────────────────────
 *
 * A model can be moved out of the application three ways: the `.ded` file,
 * the share link, and now an Excel workbook. Each was written against the
 * model as it stood that day, and none of them is exercised by adding a
 * feature. So the realistic accident is not that someone breaks a format —
 * it is that someone adds `footings` to the model, ships it, and discovers
 * six weeks later that a saved project comes back without them.
 *
 * That failure is silent by construction: the file opens, the link resolves,
 * the import succeeds. Only the missing thing is missing, and nobody looks
 * for what they did not lose.
 *
 * ── How this catches it ────────────────────────────────────────────
 *
 * By reading `JSONModel`'s own field list out of the source and asserting
 * that each collection has somewhere to live in each format. A type is gone
 * at runtime, so the census is textual — the same technique
 * `one-code-one-place.test.ts` uses, and for the same reason: the list has to
 * come from the code rather than from a copy of the code kept in a test.
 *
 * When this fails, it is not asking for a rubber stamp. Either the new
 * collection belongs in the portable formats and they need a sheet, or it
 * does not — a derived result, a UI preference — and it goes in the
 * exemption list below WITH a reason. Both are answers; neither is silence.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEETS } from '../schema';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..');

const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/**
 * The collections `JSONModel` declares — the shape `loadFixture` accepts and
 * therefore the most a workbook could ever produce.
 */
function jsonModelCollections(): string[] {
  const src = read('templates/load-fixture.ts');
  const start = src.indexOf('export interface JSONModel');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  /* `name: Array<…>` — only the plural things, which is what a sheet holds. */
  return [...body.matchAll(/^\s{2}([a-zA-Z]+)\??:\s*Array</gm)].map((m) => m[1]);
}

/**
 * Collections that deliberately have no Excel sheet, and why.
 *
 * Short on purpose. A long list here means the workbook has quietly stopped
 * being able to describe a structure.
 */
const NO_SHEET_NEEDED: Record<string, string> = {};

describe('the Excel importer keeps up with the model', () => {
  it('every collection the loader accepts has a sheet, or a stated reason', () => {
    const sheetFor: Record<string, string> = {
      nodes: 'Nodes', elements: 'Members', materials: 'Materials',
      sections: 'Sections', supports: 'Supports', loads: 'Loads',
      loadCases: 'LoadCases', combinations: 'Combinations',
      plates: 'Plates', quads: 'Quads', constraints: 'Constraints',
    };
    const have = new Set(SHEETS.map((s) => s.name));

    const uncovered = jsonModelCollections().filter((c) => {
      if (c in NO_SHEET_NEEDED) return false;
      const sheet = sheetFor[c];
      return !sheet || !have.has(sheet);
    });

    expect(
      uncovered,
      `these can be loaded into a model and cannot be written in a workbook: ${uncovered.join(', ')}.\n` +
        'Add a sheet in `excel-import/schema.ts` and read it in `parse.ts`, or add the ' +
        'collection to NO_SHEET_NEEDED with the reason it does not belong in a spreadsheet.',
    ).toEqual([]);
  });

  it('every sheet the format defines is actually read', () => {
    /*
     * The other direction. A sheet in the template that `parse.ts` never
     * looks at is worse than a missing one: the reader fills it in and the
     * import reports no problem at all.
     */
    const parser = read('excel-import/parse.ts');
    const unread = SHEETS.map((s) => s.name).filter((name) => !parser.includes(`'${name}'`));
    expect(
      unread,
      `the template offers these and the parser ignores them: ${unread.join(', ')}. ` +
        'A sheet nobody reads accepts data and silently drops it.',
    ).toEqual([]);
  });
});

describe('the share link keeps up with the model', () => {
  /**
   * `url-sharing.ts` packs a snapshot into a compact array-of-arrays. Every
   * collection needs a key in that format, and the file names them in
   * `compressV2` — so its own source is the census.
   */
  it('every collection is packed into the compact format', () => {
    /*
     * The whole file, not the body of `compressV2`. The packing is done by
     * helpers ABOVE it, so slicing from the function name found nothing and
     * reported every collection missing — a guard that fails on everything
     * teaches people to ignore it, which is worse than not having one.
     */
    const packed = read('utils/url-sharing.ts');

    const missing = jsonModelCollections().filter((c) => {
      if (c in NO_SHEET_NEEDED) return false;
      /* `snapshot.plates`, `snapshot.loadCases?.length` — any mention counts. */
      return !packed.includes(`snapshot.${c}`);
    });

    expect(
      missing,
      `a shared link would arrive without these: ${missing.join(', ')}. ` +
        'See `compressV2` in url-sharing.ts — every collection needs a key, and ' +
        '`share-link-fidelity.spec.ts` compares a census on the receiving page.',
    ).toEqual([]);
  });
});

describe('the .ded file keeps up with the model', () => {
  /**
   * The `.ded` writes `modelStore.snapshot()` wholesale, so it cannot omit a
   * collection by forgetting one — but it CAN fail to migrate an old file
   * into a new shape. What is asserted here is the weaker, checkable thing:
   * that the save path still goes through the snapshot rather than through a
   * hand-listed subset, which is how the omission would become possible.
   */
  it('saves the whole snapshot rather than a hand-picked list of fields', () => {
    const src = read('store/file.ts');
    expect(
      /snapshot\(\)/.test(src),
      'file.ts no longer saves modelStore.snapshot(). If the save was narrowed to ' +
        'specific fields, this guard cannot see what was left out — and neither can anyone else.',
    ).toBe(true);
  });
});
