/**
 * The containment notice on a desktop: folded to one line over the model like on a phone, the
 * plain line for each kind one click on its button away, and closed until it says something else.
 */
import { test, expect } from './fixtures';
import { BUILD_FEATURES } from './build-features';

test.use({ viewport: { width: 1440, height: 900 } });

const title = BUILD_FEATURES.proPlatesUnified
  ? '@smoke on a desktop the second-order notice is one line and opens on a click'
  : '@smoke the production desktop shows the second-order notice';

test(title, async ({ page }) => {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 30_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 30_000 }).toBe(true);
  await page.getByTestId('rb-cmd-solve').click();
  const notice = page.getByTestId('containment-notice');
  await expect(notice).toContainText('#1551', { timeout: 30_000 });
  const toggle = page.getByTestId('containment-toggle');
  if (!BUILD_FEATURES.proPlatesUnified) {
    await expect(notice).toBeVisible();
    await expect(notice.locator('p').filter({ hasText: '#1551' })).toBeVisible();
    await expect(toggle).toBeHidden();
    return;
  }
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await notice.boundingBox())!.height).toBeLessThan(40);
  await expect(notice).toHaveCSS('pointer-events', 'none');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(notice).toHaveCSS('pointer-events', 'auto');
  await expect(notice.getByTestId('containment-row').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('open.png') });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await notice.boundingBox())!.height).toBeLessThan(40);

  await page.getByTestId('containment-dismiss').click();
  await expect(notice).toHaveCount(0);
  const panel = page.locator('[data-testid="basic-panel"]');
  await page.getByTestId('rb-cmd-deformed').first().click();
  await panel.getByRole('button', { name: /^Diagnostics \(\d+\)$/ }).click();
  const diagRow = panel.locator('.results-content table [data-testid="results-diag-message"]').filter({ hasText: /second-order/i }).first();
  await expect(diagRow).toBeVisible();
  await expect(diagRow).not.toContainText('#1551');
  await expect(diagRow).toHaveAttribute('title', /#1551/);
  const solveStamp = () => page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()).snapshot.solvedWith?.id as string | undefined);
  const firstSolve = await solveStamp();
  expect(firstSolve).toBeTruthy();
  await page.getByTestId('rb-cmd-solve').click();
  await expect.poll(solveStamp, { timeout: 30_000 }).not.toBe(firstSolve);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(diagRow).toBeVisible();
  await expect(notice).toHaveCount(0);
});
