import { test, expect } from './fixtures';

// The end-to-end certificate (docs/verification/CERTIFY.md, "End-to-end certificates") must
// reach the results panel through the real certify path (worker or main-thread fallback),
// not only through direct engine calls in the Rust tests: a solved frame shows the
// end-to-end line under the certificate.
test.describe('@smoke end-to-end certificate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 45_000 });
  });

  // 2D only: with the 3D examples tried (3d-portal-frame, 3d-cantilever-load) the 3D results
  // panel shows no certificate line at all, end-to-end or not, before and after this change
  // (a separate gap); the 3D end-to-end level is checked through the engine in
  // engine/tests/certify_end_to_end*.rs.
  for (const example of ['portal-frame', 'simply-supported']) {
    test(`a solved ${example} shows the end-to-end check`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.evaluate((name) => window.__stabileoActions.loadExample(name), example);
      await page.evaluate(() => window.__stabileoActions.solve());
      // The results panel (where the certificate is shown) opens with a diagram.
      await page.getByTestId('rb-cmd-deformed').first().click();
      // Folded under the results table, closed while nothing warns.
      await expect(page.getByTestId('result-checks-toggle')).toContainText('certified', { timeout: 45_000 });
      await page.getByTestId('result-checks-toggle').click();
      await expect(page.getByTestId('certificate-status')).toContainText('Certified', { timeout: 45_000 });
      const line = page.getByTestId('certificate-e2e');
      await expect(line).toBeVisible({ timeout: 45_000 });
      await expect(line).toContainText('Checked end to end');
      await expect(line).toContainText('independent re-assembly');
      expect(errors).toEqual([]);
    });
  }
});
