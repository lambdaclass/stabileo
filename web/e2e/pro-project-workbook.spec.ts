/**
 * The project workbook from the Project tab: a validation model solved, 13 stations asked for,
 * and the file that arrives holds the cover, the model and every combination's stations.
 * The sheets themselves are checked in `project-workbook.test.ts`; this checks the button
 * reaches them with the stations chosen.
 */
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { test, expect } from './fixtures';

test.describe('PRO project workbook', () => {
  test.describe.configure({ timeout: 180_000 });

  test('downloads the model and every result at the stations asked for', async ({ pro: page }) => {
    await expect.poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 }).toBe(true);
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    await page.getByTestId('pp-gallery').locator('.pp-ex').filter({ hasText: 'Validation 06' }).click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBe(25);
    await page.evaluate(() => window.__stabileoActions.solve());

    await page.getByTestId('pr-project').click();
    await page.getByTestId('project-workbook-stations').selectOption('13');
    const wait = page.waitForEvent('download');
    await page.getByTestId('project-workbook').click();
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
});
