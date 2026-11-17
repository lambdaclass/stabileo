/**
 * Listings and formats on the Documents stage: a listing in each format downloaded, its columns
 * and filter chosen, every listing in one workbook, the bar schedule for bending machines, and the
 * sheets as DXF 2004, DXF R12 and SVG. The content of each format is pinned cell by cell in
 * `store/__tests__/listings-formats.test.ts`; the DXF 2004 in `sheets/__tests__/to-dxf2004.test.ts`.
 */
import { test, expect, designAll, loadModel, openDocumentsStage, designPlace, openSheetsPlace } from './fixtures';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1400, height: 900 } });

async function download(page: Page, testid: string) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testid).click()]);
  return { name: d.suggestedFilename(), bytes: readFileSync(await d.path()) };
}

test.describe('@slow listings and formats', () => {
  test('a listing in every format, its columns chosen, BVBS, and the sheets as DXF 2004, R12 and SVG', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await designPlace(page, 'detailing');
    await page.getByTestId('cmd-generate-detailing').click();
    await expect.poll(async () => page.evaluate(() => (window.__stabileo as unknown as { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 30_000 }).toBeGreaterThan(0);
    await designPlace(page, 'listings');
    const panel = page.getByTestId('listings-panel');
    await panel.scrollIntoViewIfNeeded();

    for (const f of ['pdf', 'html', 'xlsx', 'csv'] as const) {
      const d = await download(page, `listing-beams-${f}`);
      expect(d.name).toBe(`beams.${f}`);
      expect(d.bytes.length).toBeGreaterThan(100);
    }
    expect((await download(page, 'listing-checks-html')).bytes.toString('utf8')).toMatch(/<table>/);
    // Columns and a filter for the beams' listing.
    await page.getByTestId('listing-beams').locator('button.name').click();
    await page.getByTestId('listing-filter-beams').fill('zzz-none');
    await page.getByTestId('listing-filter-beams').press('Enter');
    await expect(page.getByTestId('listing-config-beams')).toContainText(/0 fila|0 row/);
    await page.getByTestId('listing-filter-beams').fill('');
    await page.getByTestId('listing-filter-beams').press('Enter');
    await page.getByTestId('listings-waste').fill('10');
    await page.getByTestId('listings-waste').press('Enter');
    expect((await download(page, 'listings-all-xlsx')).name).toBe('listings.xlsx');
    const bvbs = await download(page, 'listings-bvbs');
    expect(bvbs.bytes.toString('latin1')).toMatch(/^BF2D@/);

    // The sheets: DXF 2004 by default, R12 when asked, and SVG.
    await openSheetsPlace(page, { setup: true });
    await page.getByTestId('sheets-build').click();
    await expect(page.getByTestId('sheets-count')).toBeVisible();
    expect((await download(page, 'sheets-dxf')).name).toMatch(/-dxf\.zip$/);
    await page.getByTestId('sheets-dxf-version').selectOption('r12');
    expect((await download(page, 'sheets-dxf')).name).toMatch(/-dxf-r12\.zip$/);
    expect((await download(page, 'sheets-svg')).name).toMatch(/-svg\.zip$/);
  });
});
