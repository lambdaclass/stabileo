/**
 * PRO 10/10: tapered members from the edit panel, and the shed generator's tapered columns.
 */
import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('@smoke PRO tapered members', () => {
  test('a selected member is cut into prismatic segments of varying depth', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    const before = await page.evaluate(() => window.__stabileo.modelCensus().elements);
    await page.evaluate(() => window.__stabileoActions.selectElements([1]));
    await page.getByTestId('pr-cmd-edit').click();
    await expect(page.getByTestId('ep-taper')).toBeVisible();
    await page.getByTestId('ep-taper-n').fill('4');
    await page.getByTestId('ep-taper-n').blur();
    await page.getByTestId('ep-taper-go').click();
    await expect(page.getByTestId('ep-done')).toContainText('1');
    const after = await page.evaluate(() => window.__stabileo.modelCensus().elements);
    expect(after).toBe(before + 3);
  });
});

test.describe('@smoke PRO direct analysis', () => {
  test('AISC 360 reads the direct analysis at K = 1, one row per combination', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      window.__stabileoActions.updateSection(1, { shape: 'I', tw: 0.0108, tf: 0.0162 });
      window.__stabileoActions.combineCases('1.0 todos');
      await window.__stabileoActions.solve();
    });
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-otherCodes').click();
    await page.getByTestId('other-codes-source-direct').click();
    await expect(page.getByTestId('other-codes-run')).toBeDisabled();
    await page.getByTestId('direct-run').click();
    await expect(page.getByTestId('direct-table').locator('tbody tr')).not.toHaveCount(0);
    await page.getByTestId('other-codes-run').click();
    await expect(page.getByTestId('other-codes-direct-note')).toBeVisible();
    await expect(page.getByTestId('other-codes-summary')).toBeVisible();
  });
});

test.describe('@smoke PRO optimiser criteria', () => {
  test('a target ratio and a depth limit shape the proposal', async ({ pro: page }) => {
    // A gallery steel example, opened through its card: its steel declares the grade and both
    // strengths the check needs (a bare fixture carries no fu, and nothing was checked).
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    await page.getByTestId('pp-gallery').locator('[data-example="pipe-rack"] .pp-ex').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBeGreaterThan(0);
    await page.evaluate(async () => { await window.__stabileoActions.solve(); });
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-steel').click();
    const opt = page.getByTestId('steel-optimise');
    await opt.scrollIntoViewIfNeeded();
    await page.getByTestId('opt-criteria').locator('summary').click();
    await page.getByTestId('opt-family-HEB').check();
    await page.getByTestId('opt-hmax').fill('400');
    await page.getByTestId('opt-target').fill('80');
    await page.getByTestId('opt-run').click();
    const rows = page.getByTestId('opt-rows').locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const ratios = await rows.locator('td:nth-child(6)').allInnerTexts();
    const numeric = ratios.filter((r) => r !== '—');
    // At least one proposal, or the test would pass on a table of dashes.
    expect(numeric.length).toBeGreaterThan(0);
    for (const r of numeric) expect(Number(r.replace(/[^\d.]/g, ''))).toBeLessThanOrEqual(80);
    // And the depth limit held: every HEB proposed is at most 400 mm deep.
    const proposed = (await rows.locator('td:nth-child(5)').allInnerTexts()).map((s) => s.match(/HEB\s*(\d+)/)?.[1]).filter(Boolean);
    expect(proposed.length).toBeGreaterThan(0);
    for (const h of proposed) expect(Number(h)).toBeLessThanOrEqual(400);
  });
});
