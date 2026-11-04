/**
 * The certificate and the discretization error sit folded under the results, not at the top of
 * the panel.
 */
import { test, expect } from './fixtures';

test('@smoke Basic: the result checks are folded under the results table, closed while nothing warns', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 45_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-deformed').first().click();
  const checks = page.getByTestId('result-checks');
  await expect(checks).toBeVisible({ timeout: 45_000 });
  await expect(checks).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('certificate-status')).toBeHidden();
  const panel = page.locator('[data-testid="basic-panel"]');
  const table = (await panel.getByText(/^Results$|^Resultados$/).last().boundingBox())!;
  expect((await checks.boundingBox())!.y, 'below the results table').toBeGreaterThan(table.y);
  const toggle = page.getByTestId('result-checks-toggle');
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const text of await toggle.locator('span').all()) {
    expect(await text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
  }
  await toggle.click();
  await expect(page.getByTestId('certificate-status')).toBeVisible();
});
