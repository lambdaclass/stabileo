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
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      await window.__stabileoActions.solve();
    });
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
    for (const r of ratios) if (r !== '—') expect(Number(r.replace(/[^\d.]/g, ''))).toBeLessThanOrEqual(80);
  });
});
