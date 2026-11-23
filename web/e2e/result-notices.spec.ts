import { BUILD_FEATURES } from './build-features';
/**
 * The result notices as one compact pattern: one plain line over the model, the engine's text a
 * click away, a kind hidden for good from the notice itself, and Diagnostics still listing it.
 */
import { test, expect, type Page } from './fixtures';
if (BUILD_FEATURES.proPlatesUnified) {

  test.use({ viewport: { width: 1440, height: 900 } });

  async function solveSecondOrderPortal(page: Page) {
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 30_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-second-order'));
    await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 30_000 }).toBe(true);
    await page.getByTestId('rb-cmd-solve').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 30_000 }).toBe(true);
  }

  test('@smoke a second-order notice is one plain line, opens to the engine text, hides per kind across a reload, and stays in Diagnostics', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('notices-cleared')) { localStorage.clear(); sessionStorage.setItem('notices-cleared', '1'); }
      } catch { /* private mode */ }
    });
    await solveSecondOrderPortal(page);

    const notice = page.getByTestId('containment-notice');
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toHaveAttribute('data-level', 'warning');
    await expect(page.getByTestId('containment-headline')).toHaveText(/second-order effects may change these results/i);
    expect((await notice.boundingBox())!.height).toBeLessThan(40);
    expect(await page.getByTestId('containment-headline').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(12);

    await page.getByTestId('containment-toggle').click();
    const row = notice.getByTestId('containment-row');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-kind', 'secondOrder');
    await expect(row.locator('.notice-details')).toBeHidden();
    await row.getByTestId('notice-summary').click();
    await expect(row.locator('.notice-details p').first()).toContainText('#1551');
    await expect(row.locator('.notice-details p').first()).toBeVisible();

    await row.getByTestId('notice-hide-kind').click();
    await expect(notice).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stabileo-hidden-notices') ?? '[]'))).toEqual(['secondOrder']);

    await page.reload();
    await solveSecondOrderPortal(page);
    await page.getByTestId('rb-cmd-deformed').first().click();
    await expect(page.getByTestId('containment-notice')).toHaveCount(0);

    const panel = page.locator('[data-testid="basic-panel"]');
    await panel.getByRole('button', { name: /^Diagnostics \(\d+\)$/ }).click();
    const diagRow = panel.locator('.results-content table [data-testid="results-diag-message"]').filter({ hasText: /second-order/i }).first();
    await expect(diagRow).toBeVisible();
    await expect(diagRow).not.toContainText('#1551');
    await expect(diagRow).toHaveAttribute('title', /#1551/);

    await page.getByTestId('rb-settings').click();
    const settings = page.getByTestId('cfg-result-notices');
    if (!(await settings.isVisible())) await page.getByRole('button', { name: /Results/ }).filter({ hasText: '▸' }).first().click();
    await settings.locator('summary').click();
    const box = page.getByTestId('cfg-notice-secondOrder');
    await expect(box).not.toBeChecked();
    await box.check();
    await expect(page.getByTestId('containment-notice')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stabileo-hidden-notices') ?? '[]'))).toEqual([]);
  });
}
