/**
 * A model's results held to a baseline file: its maxima (every component, where it occurs and
 * under which result) and its statics (applied, reactions and residual per case and
 * combination), as the project workbook writes them at 5 stations. Text is compared exactly and
 * numbers to 1e-9 of their column's scale (see `sameRows` for the two statics columns that differ). `STABILEO_UPDATE_BASELINES=1` re-records.
 */
import { expect } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { currentWorkbookSheets } from '../../store/project-workbook';

type Cell = string | number;
export interface Baseline { maxima: Cell[][]; statics: Cell[][] }

/*
 * A column's scale is its own largest value, except for two in the statics:
 * - `residual` is applied − reactions, round-off when the statics close (1e-15 against loads of
 *   hundreds). Measured against itself, its tolerance was 1e-9 of round-off, which no two
 *   platforms reproduce: a baseline recorded on one machine failed on CI at its last digit. It is
 *   measured against the forces it is the difference of.
 * - `worstRelative` is already relative: absolute 1e-9.
 */
function sameRows(label: string, got: Cell[][], want: Cell[][]) {
  expect(got.length, `${label}: rows`).toBe(want.length);
  const own = (c: number) => Math.max(1e-12, ...want.slice(1).map((r) => (typeof r[c] === 'number' ? Math.abs(r[c] as number) : 0)));
  const header = want[0]!.map(String);
  const column = (name: string) => header.indexOf(name);
  const scale = (c: number) => {
    if (header[c] === 'residual') return Math.max(own(c), ...['applied', 'reactions'].map(column).filter((k) => k >= 0).map(own));
    if (header[c] === 'worstRelative') return 1;
    return own(c);
  };
  want.forEach((w, i) => {
    w.forEach((v, c) => {
      const g = got[i]![c];
      if (typeof v === 'number' && typeof g === 'number') expect(Math.abs(g - v), `${label}, row ${i} "${want[0]![c]}": ${g} against ${v}`).toBeLessThanOrEqual(1e-9 * scale(c));
      else expect(g, `${label}, row ${i} "${want[0]![c]}"`).toEqual(v);
    });
  });
}

/** Compare the published results with `<dir>/<id>.json`, or record it when asked to. */
export function expectBaseline(dir: string, id: string): void {
  const sheets = currentWorkbookSheets(5, { model: false });
  const pick = (name: string) => sheets.find((s) => s.name === name)?.rows ?? [];
  const got: Baseline = { maxima: pick('Maxima'), statics: pick('Statics') };
  const file = join(dir, `${id}.json`);
  if (process.env.STABILEO_UPDATE_BASELINES === '1') {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(got) + '\n');
  }
  if (!existsSync(file)) throw new Error(`${id}: no baseline; record it with STABILEO_UPDATE_BASELINES=1`);
  const want = JSON.parse(readFileSync(file, 'utf8')) as Baseline;
  sameRows(`${id} maxima`, got.maxima, want.maxima);
  sameRows(`${id} statics`, got.statics, want.statics);
}
