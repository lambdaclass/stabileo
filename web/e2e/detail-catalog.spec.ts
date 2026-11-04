/**
 * The construction detail catalogue on the Documents stage: every family with its details, each
 * previewed with the project's values and its note; a seismic joint chosen and sent to the
 * column sheet lands there, and the choice reaches the built set. The catalogue itself and the
 * placement are pinned in `lib/sheets/details/__tests__/catalog.test.ts` and
 * `lib/store/__tests__/detail-catalog.test.ts`.
 */
import { test, expect, designAll, loadModel, openDocumentsStage, designPlace, openSheetsPlace } from './fixtures';

test.use({ viewport: { width: 1400, height: 900 } });

test.describe('@slow detail catalogue', () => {
  test('families, previews, a detail chosen onto the column sheet', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await designPlace(page, 'detailing');
    await page.getByTestId('cmd-generate-detailing').click();
    await expect.poll(async () => page.evaluate(() =>
      (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
        .detailingAssemblies().length), { timeout: 30_000 }).toBeGreaterThan(0);
    await openSheetsPlace(page, { setup: true });

    const cat = page.getByTestId('sheets-details-catalog');
    await cat.scrollIntoViewIfNeeded();
    await cat.locator('> summary').click();
    // Every family is there, closed until opened.
    for (const f of ['general', 'slabs', 'beams', 'columns', 'joints', 'foundations', 'walls', 'stairs', 'tables']) await expect(page.getByTestId(`det-fam-${f}`)).toBeVisible();

    // The joints: with and without earthquake, each with a drawn preview and its note.
    await page.getByTestId('det-fam-joints').locator('> summary').click();
    await expect(page.getByTestId('det-preview-joint-exterior-seismic').locator('svg')).toBeVisible();
    await expect(page.getByTestId('det-joint-exterior-seismic')).toContainText('N-05');
    await expect(page.getByTestId('det-joint-exterior-seismic')).toContainText(/ldh = \d+ mm/);
    await expect(page.getByTestId('det-joint-exterior')).toContainText('N-02');

    // Chosen, and sent to the column schedule's sheets.
    await page.getByTestId('det-pick-joint-exterior-seismic').check();
    await page.getByTestId('det-target-joint-exterior-seismic').selectOption('columns');
    await expect(page.getByTestId('det-target-joint-exterior-seismic')).toHaveValue('columns');

    // A characteristics table, its numbers from the project.
    await page.getByTestId('det-fam-tables').locator('> summary').click();
    await expect(page.getByTestId('det-preview-chars-anchorage').locator('svg')).toContainText('ldh');

    await page.getByTestId('sheets-build').click();
    await expect(page.getByTestId('sheets-count')).toBeVisible();
    const items = page.getByTestId('sheets-list').locator('[data-testid^="sheets-item-"]');
    const n = await items.count();
    let found = false;
    for (let i = 0; i < n && !found; i++) {
      const item = items.nth(i);
      if (!/Cuadro de columnas|Column schedule/.test((await item.textContent()) ?? '')) continue;
      await item.click();
      found = /N-05 ·/.test((await page.getByTestId('sheets-preview').textContent()) ?? '');
    }
    expect(found, 'the seismic exterior joint on a column sheet').toBe(true);
  });
});
