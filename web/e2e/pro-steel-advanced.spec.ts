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
