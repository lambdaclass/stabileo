/**
 * Moving loads in PRO: the selection is the path, the envelope comes back per member, and the
 * lane load becomes an ordinary load case. The numbers are pinned in `moving-loads-3d.test.ts`.
 */
import { test, expect } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('@smoke moving loads in PRO', () => {
  test('a train along three beams gives an envelope, and the lane load a case', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      // Beams 7 (5→7), 5 (5→6) and 8 (6→8): one row through nodes 7, 5, 6, 8.
      window.__stabileoActions.selectElements([7, 5, 8]);
    });
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('adv-chip-moving').click();
    await expect(page.getByTestId('moving-path')).toContainText('3');
    await page.getByTestId('moving-run').click();
    await expect(page.getByTestId('moving-table')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('moving-summary')).toContainText(/over 3 members/);
    // The loaded beams carry a moment under the train.
    const first = page.getByTestId('moving-table').locator('tbody tr').first();
    expect(Math.abs(Number(await first.locator('td:nth-child(2)').innerText()))
      + Math.abs(Number(await first.locator('td:nth-child(4)').innerText()))).toBeGreaterThan(1);

    const before = await page.evaluate(() => window.__stabileo.modelCensus().loadCases);
    await page.locator('[data-testid="moving-panel"] input[type="number"]').last().fill('5');
    await page.getByTestId('moving-lane').click();
    expect(await page.evaluate(() => window.__stabileo.modelCensus().loadCases)).toBe(before + 1);
  });

  test('a selection that is not one row is refused, with the reason', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      window.__stabileoActions.selectElements([5, 6]);
    });
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();
    await page.getByTestId('adv-chip-moving').click();
    await page.getByTestId('moving-run').click();
    await expect(page.getByTestId('moving-error')).toContainText(/one continuous row/);
  });
});
