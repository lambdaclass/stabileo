/**
 * The project workbook from the Project tab: an example solved, Excel opens its dialog, 13 points
 * per member asked for, and the file that arrives holds the cover, the model and every
 * combination's stations. A CSV of one sheet is a zip of that sheet, the cover and the conventions.
 * The sheets themselves are checked in `project-workbook.test.ts`; this checks the dialog reaches
 * them with the choices made.
 */
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { test, expect } from './fixtures';

test.describe('@slow PRO project workbook', () => {
  test.describe.configure({ timeout: 180_000 });

  test('downloads the model and every result at the stations asked for', async ({ pro: page }) => {
    await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 60_000 }).toBe(true);
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    await page.getByTestId('pp-gallery').locator('[data-example="pro-plane-frame-seismic"] .pp-ex').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBe(28);
    await page.evaluate(() => window.__stabileoActions.solve());

    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-export-results').click();
    const dialog = page.getByTestId('pro-data-export-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('pro-data-format-xlsx').click();
    await dialog.getByTestId('pro-data-export-stations').locator('summary').click();
    await dialog.getByTestId('pro-data-stations-13').check();
    const wait = page.waitForEvent('download');
    await dialog.getByTestId('pro-data-export-download').click();
    const dl = await wait;
    expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);

    const wb = XLSX.read(readFileSync((await dl.path())!), { type: 'buffer' });
    for (const n of ['Cover', 'Conventions', 'Nodes', 'Members', 'Reactions', 'EndForces', 'Stations', 'Envelope', 'Statics']) expect(wb.SheetNames).toContain(n);
    const members = XLSX.utils.sheet_to_json(wb.Sheets.Members!).length;
    const stations = XLSX.utils.sheet_to_json<{ source: string; member: number }>(wb.Sheets.Stations!);
    const sources = new Set(stations.map((r) => `${r.source}`)).size;
    expect(sources).toBeGreaterThan(0);
    // Every member of every result, at 13 stations.
    const perResult = new Map<string, number>();
    for (const r of stations as Array<{ source: string; sourceId: number }>) perResult.set(`${r.source}:${r.sourceId}`, (perResult.get(`${r.source}:${r.sourceId}`) ?? 0) + 1);
    for (const n of perResult.values()) expect(n).toBe(13 * members);
  });

  test('CSV of a single sheet is that sheet, with the cover and the conventions', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    await page.getByTestId('pp-gallery').locator('[data-example="pro-plane-frame-seismic"] .pp-ex').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBe(28);
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-export-results').click();
    const dialog = page.getByTestId('pro-data-export-dialog');
    await dialog.getByTestId('pro-data-format-csv').click();
    // Everything off but the nodes.
    for (const b of await dialog.getByRole('button', { name: /^(Nada|None)$/ }).all()) await b.click();
    await dialog.getByTestId('pro-data-sheet-Nodes').check();
    const wait = page.waitForEvent('download');
    await dialog.getByTestId('pro-data-export-download').click();
    const dl = await wait;
    expect(dl.suggestedFilename()).toMatch(/_Nodes_csv\.zip$/);
    const files = unzipSync(new Uint8Array(readFileSync((await dl.path())!)));
    expect(Object.keys(files)).toEqual(['01-Cover.csv', '02-Conventions.csv', '03-Nodes.csv']);
    expect(strFromU8(files['03-Nodes.csv']!).split('\n')[0]).toContain('id');
  });
});
