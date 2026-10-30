/**
 * Basic 3D's defaults: a grid 100 m across, and an example that arrives without node IDs (as in
 * PRO); a model being built keeps them.
 */
import { test, expect, type Page } from '@playwright/test';

async function openBasic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
}

test.describe('@smoke Basic 3D defaults', () => {
  test('the grid is 100 m across, and a 3D example arrives without node IDs', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('rb-cmd-dim').click();
    await page.getByTestId('rb-settings').click();
    // The stops are 20, 50, 100, 200 … m: 100 m is the third.
    await expect(page.getByTestId('cfg-grid-extent')).toHaveValue('2');
    await expect(page.getByTestId('cfg-node-ids')).toBeChecked();

    if (await page.locator('[data-testid="basic-panel"][data-panel="project"]').count() === 0) await page.getByTestId('hdr-project').click();
    await page.getByTestId('ex-group-3d').click();
    await page.getByTestId('example-3d-portal-frame').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBeGreaterThan(0);
    await page.getByTestId('rb-settings').click();
    await expect(page.getByTestId('cfg-node-ids')).not.toBeChecked();
  });
});
