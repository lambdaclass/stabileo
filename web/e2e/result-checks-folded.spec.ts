/**
 * The certificate and the discretization error sit folded under the results, not at the top of
 * the panel.
 */
import { test, expect } from './fixtures';

test('@smoke Basic: the result checks are folded under the results table, closed while nothing warns', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-deformed').first().click();
  const checks = page.getByTestId('result-checks');
  await expect(checks).toBeVisible({ timeout: 60_000 });
  await expect(checks).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('certificate-status')).toBeHidden();
  const panel = page.locator('[data-testid="basic-panel"]');
  const table = (await panel.getByText(/^Results$|^Resultados$/).last().boundingBox())!;
  expect((await checks.boundingBox())!.y, 'below the results table').toBeGreaterThan(table.y);
  await page.getByTestId('result-checks-toggle').click();
  await expect(page.getByTestId('certificate-status')).toBeVisible();
});
