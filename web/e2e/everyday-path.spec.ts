/**
 * The everyday path, end to end, as a first user takes it.
 *
 * Every step below is covered somewhere on its own: the regulation load generator
 * (`regulations.spec.ts`), the solve, the CIRSOC 301 checks (`steel-results.spec.ts`), the report
 * (`pro-exports.spec.ts`). Nothing ran them one after the other on one model, so a change that kept
 * each step working but broke the hand-off between two of them (loads the solve does not see, a
 * solve the steel checks do not pick up, a report missing what was just checked) passed every
 * test. This walks the path a newcomer follows on a steel portal frame:
 *
 *   example → CIRSOC loads and combinations → solve → steel checks → report
 */
import { test, expect, loadModel, solveModel, alSection, designPlace } from './fixtures';

test.describe('@slow the everyday path', () => {
  test('a steel portal frame, from code loads to the report', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await loadModel(page, '3d-portal-frame');
    const before = await page.evaluate(() => window.__stabileo.modelCensus());
    expect(before.elements).toBeGreaterThan(0);

    // Loads from the code: the regulation generator, previewed, then applied.
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByRole('button', { name: /Auto-generate from code/i }).click();
    await alSection(page, 'regulations');
    await expect(page.getByTestId('al-regulations')).toBeVisible();
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-delta')).toBeVisible();
    await page.getByTestId('al-apply').click();
    await expect(page.getByTestId('al-preview')).toBeHidden();
    const loaded = await page.evaluate(() => window.__stabileo.modelCensus());
    expect(loaded.loadCases, 'the generator added load cases').toBeGreaterThan(before.loadCases);
    expect(loaded.combinations, 'and CIRSOC combinations').toBeGreaterThan(0);

    // The solve sees what was just applied.
    await solveModel(page);

    // The steel checks pick the solve up: every member has a row, and each row a verdict.
    // Design is one workspace: the profiles are its place in sizing.
    await designPlace(page, 'steel');
    await expect(page.getByTestId('pro-steel-workflow')).toBeVisible();
    const table = page.getByTestId('steel-results');
    await table.scrollIntoViewIfNeeded();
    await expect(table).toBeVisible();
    await expect(table.locator('[data-testid^="steel-result-open-"]').first()).toBeVisible();

    // And the report carries the result, as a document a reader can open.
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-export-report').click();
    const dialog = page.getByTestId('pro-report-dialog');
    await expect(dialog).toBeVisible();
    const opened = page.context().waitForEvent('page');
    await dialog.getByTestId('rpt-pdf').click();
    const report = await opened;
    await report.waitForLoadState();
    const html = await report.content();
    expect(html).toMatch(/(Reacciones|Reactions)/);
  });
});
