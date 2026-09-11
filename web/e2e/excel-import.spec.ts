/**
 * A spreadsheet becomes a structure.
 *
 * ── What is worth testing here ─────────────────────────────────────
 *
 * The reading rules are covered in `lib/excel-import/__tests__` — 23 cases
 * that run in milliseconds and need no browser. What those cannot reach is the
 * part between a file on disk and a model on screen: the file input, the
 * lazily-imported xlsx module, `loadFixture` remapping every id, and the
 * report the reader is left looking at.
 *
 * So this file does not re-check the parser. It checks the three claims the
 * feature makes to a user:
 *
 *   1. the template we offer is a file you can fill in and bring back
 *   2. a bad row costs you that row, not the import
 *   3. your own load cases and combinations arrive, alongside the defaults
 *
 * The third is the one that motivated the feature. Basic ships four
 * combinations and they are fine for most work; the reason to import is the
 * job that needs its own, and an importer that quietly replaced or dropped
 * them would satisfy every other test here.
 */

import { test, expect } from './fixtures';
import * as XLSX from 'xlsx';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Page = import('@playwright/test').Page;

const sheet = (header: string[], ...rows: Array<Array<unknown>>) =>
  XLSX.utils.aoa_to_sheet([header, ...rows]);

/** Write a workbook to a temp file and hand back its path. */
function workbook(sheets: Record<string, XLSX.WorkSheet>): string {
  const wb = XLSX.utils.book_new();
  for (const [name, ws] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, ws, name);
  const path = join(mkdtempSync(join(tmpdir(), 'stabileo-xls-')), 'model.xlsx');
  writeFileSync(path, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return path;
}

const census = (page: Page) => page.evaluate(() => window.__stabileo.modelCensus());

async function openProject(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await page.getByTestId('hdr-project').click();
}

test.describe('@smoke importing a spreadsheet', () => {
  test('the template downloads and comes back as a model', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await openProject(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('xls-template').click(),
    ]);
    expect(download.suggestedFilename()).toBe('plantilla-stabileo.xlsx');

    /*
     * Brought straight back, unedited. The examples inside it are meant to be
     * deleted, but they have to be VALID — a template that teaches a shape the
     * importer rejects is worse than no template, because the reader cannot
     * tell which of the two is wrong.
     */
    const path = join(testInfo.outputDir, 'plantilla.xlsx');
    await download.saveAs(path);
    await page.getByTestId('xls-input').setInputFiles(path);

    await expect.poll(() => census(page).then((c) => c.nodes), { timeout: 30_000 })
      .toBeGreaterThan(0);
    const report = page.getByTestId('xls-report');
    await expect(report).toBeVisible();
    await expect(report, 'our own template must import clean').toContainText(
      /Sin problemas|No problems|Sem problemas/,
    );
  });

  test('a bad row is dropped and named, and the rest still loads', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    const path = workbook({
      Nodes: sheet(['id', 'x [m]', 'y [m]'], [1, 0, 0], [2, 6, 0], [3, 6, 4]),
      Materials: sheet(['id', 'name', 'E [MPa]', 'nu'], [1, 'H-25', 25000, 0.2]),
      Sections: sheet(['id', 'name', 'b [m]', 'h [m]'], [1, 'V 20x40', 0.2, 0.4]),
      Members: sheet(
        ['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'],
        [1, 'frame', 1, 2, 1, 1],
        [2, 'frame', 2, 3, 1, 1],
        [3, 'frame', 1, 99, 1, 1], // node 99 does not exist
      ),
      Supports: sheet(['node', 'type'], [1, 'fixed'], [3, 'pinned']),
    });
    await page.getByTestId('xls-input').setInputFiles(path);

    await expect.poll(() => census(page).then((c) => c.elements), { timeout: 30_000 }).toBe(2);
    expect((await census(page)).nodes).toBe(3);

    /*
     * Row 4, not row 3 and not "a member". The number has to be the one Excel
     * shows or the reader cannot find the cell, and the message has to name
     * the reference or they cannot tell which of the four is wrong.
     */
    const report = page.getByTestId('xls-report');
    await expect(report).toContainText('99');
    await expect(report).toContainText('4');
  });

  test('load cases and combinations arrive with their factors', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const before = await census(page);

    const path = workbook({
      Nodes: sheet(['id', 'x [m]', 'y [m]'], [1, 0, 0], [2, 6, 0]),
      Materials: sheet(['id', 'name', 'E [MPa]', 'nu'], [1, 'H-25', 25000, 0.2]),
      Sections: sheet(['id', 'name', 'b [m]', 'h [m]'], [1, 'V', 0.2, 0.4]),
      Members: sheet(['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'], [1, 'frame', 1, 2, 1, 1]),
      LoadCases: sheet(
        ['id', 'name', 'type'],
        [1, 'Peso propio', 'D'],
        [2, 'Sobrecarga', 'L'],
        [3, 'Viento', 'W'],
        [4, 'Nieve', 'S'],
        [5, 'Sismo', 'E'],
      ),
      Combinations: sheet(
        ['combination', 'case', 'factor'],
        ['Obra 1.2D+1.6L', 1, 1.2],
        ['Obra 1.2D+1.6L', 2, 1.6],
        ['Obra 1.2D+1.0W+0.5S', 1, 1.2],
        ['Obra 1.2D+1.0W+0.5S', 3, 1.0],
        ['Obra 1.2D+1.0W+0.5S', 4, 0.5],
        ['Obra 0.9D+1.0E', 1, 0.9],
        ['Obra 0.9D+1.0E', 5, 1.0],
      ),
      Loads: sheet(['type', 'case', 'node', 'fy [kN]'], ['nodal', 5, 2, -30]),
    });
    await page.getByTestId('xls-input').setInputFiles(path);

    await expect.poll(() => census(page).then((c) => c.nodes), { timeout: 30_000 }).toBe(2);
    const after = await census(page);

    /*
     * The workbook's combinations, and only those.
     *
     * A file that lists them is describing the whole job, so it replaces
     * Basic's four defaults rather than being appended under them — otherwise
     * every import would leave the reader deleting our combinations out of
     * their model. Silence is different, and the next test covers it.
     */
    expect(after.combinations, 'the three in the file, not three plus the defaults').toBe(3);
    expect(after.loadCases).toBe(5);
    expect(after.loads, 'a load on the fifth case must survive').toBe(1);
    expect(before.combinations, 'Basic ships some, or this test proves nothing')
      .toBeGreaterThan(0);
  });

  test('a workbook that says nothing about combinations keeps the defaults', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);
    const before = await census(page);

    const path = workbook({
      Nodes: sheet(['id', 'x [m]', 'y [m]'], [1, 0, 0], [2, 6, 0]),
      Materials: sheet(['id', 'name', 'E [MPa]', 'nu'], [1, 'H-25', 25000, 0.2]),
      Sections: sheet(['id', 'name', 'b [m]', 'h [m]'], [1, 'V', 0.2, 0.4]),
      Members: sheet(['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'], [1, 'frame', 1, 2, 1, 1]),
    });
    await page.getByTestId('xls-input').setInputFiles(path);

    await expect.poll(() => census(page).then((c) => c.nodes), { timeout: 30_000 }).toBe(2);
    const after = await census(page);
    expect(after.combinations, 'no opinion in the file means ours stand')
      .toBe(before.combinations);
    expect(after.loadCases).toBe(before.loadCases);
  });
});
