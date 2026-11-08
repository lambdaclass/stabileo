/**
 * The containment notice on a desktop: folded to one line over the model like on a phone, the
 * full text one click on its button away, and closed for good until it says something else.
 */
import { test, expect } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test('@smoke on a desktop the second-order notice is one line and opens on a click', async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 30_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 30_000 }).toBe(true);
  await page.getByTestId('rb-cmd-solve').click();
  const notice = page.getByTestId('containment-notice');
  await expect(notice).toContainText('#1551', { timeout: 30_000 });
  const toggle = page.getByTestId('containment-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await notice.boundingBox())!.height).toBeLessThan(40);
  await expect(notice).toHaveCSS('pointer-events', 'none');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(notice).toHaveCSS('pointer-events', 'auto');
  await expect(notice.locator('p').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('open.png') });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await notice.boundingBox())!.height).toBeLessThan(40);

  await page.getByTestId('containment-dismiss').click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator('.containment-banner').filter({ hasText: '#1551' })).toBeVisible();
  await page.getByTestId('rb-cmd-solve').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false)).toBe(true);
  await expect(notice).toHaveCount(0);
});
