import { test, expect } from './fixtures';

test.describe('@engine @smoke certificate line in 2D and 3D (#471)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 45_000 });
  });

  for (const example of ['3d-cantilever-load', 'simply-supported']) {
    test(`a solved ${example} says whether its solve is certified`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.evaluate((name) => window.__stabileoActions.loadExample(name), example);
      await page.evaluate(() => window.__stabileoActions.solve());
      await page.getByTestId('rb-cmd-deformed').first().click();
      const toggle = page.getByTestId('result-checks-toggle');
      await expect(toggle).toBeVisible({ timeout: 45_000 });
      if ((await page.getByTestId('result-checks').getAttribute('open')) === null) await toggle.click();
      const line = page.getByTestId('certificate-status');
      await expect(line).toBeVisible({ timeout: 45_000 });
      await expect(line).not.toHaveText(/Certifying/, { timeout: 45_000 });
      await expect(line).toHaveText(/^Certified: displacement error ≤ /);
      expect(errors).toEqual([]);
    });
  }
});
