/**
 * The discretization-error estimate in the real app (docs/verification/DISCRETIZATION.md): a
 * frame-and-shell model solved in PRO shows "discretization error: estimated ~Y% (… not
 * certified)" next to the certificate, and the convergence check re-solves and fills its table.
 *
 * Both run through the worker pool in a real browser: the estimate exports once failed there
 * ("Worker certificate … not available") while every unit test, which runs on the main thread,
 * passed. The model has load combinations, so the base result on screen is the "all loads" sum
 * of its cases, which no single solve returned: the estimate once stayed idle on it.
 */
import { test, expect, loadModel, solveModel } from './fixtures';

test('a frame-and-shell model shows its estimated discretization error and runs the convergence check', async ({ pro: page }) => {
  test.setTimeout(300_000);
  await loadModel(page, 'rc-qa-diagnostic-shells');
  await solveModel(page);
  await expect.poll(() => page.evaluate(() => window.__stabileo.discretizationState().estimate), { timeout: 60_000 })
    .toBe('done');
  const state = await page.evaluate(() => window.__stabileo.discretizationState());
  expect(state.reason, 'the estimate must not fail in the worker').toBeNull();
  expect(state.applies).toBe(true);

  await page.evaluate(() => window.__stabileoActions.openProTab('results'));
  // Folded under the results, and open by itself: this estimate is over the threshold.
  await expect(page.getByTestId('result-checks')).toHaveAttribute('open', '');
  await expect(page.getByTestId('result-checks-toggle')).toContainText(/high discretization error/i);
  const status = page.getByTestId('discretization-status').first();
  await expect(status).toBeVisible({ timeout: 30_000 });
  const estimate = page.getByTestId('discretization-estimate').first();
  await expect(estimate).toContainText('%');
  await expect(estimate).toContainText(/not certified/i);
  await expect(status).not.toContainText(/not available/i);

  await page.getByTestId('discretization-run-study').first().click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.discretizationState().study), { timeout: 240_000 })
    .not.toBe('running');
  expect((await page.evaluate(() => window.__stabileo.discretizationState())).reason).toBeNull();
  const table = page.getByTestId('discretization-study').first();
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr').first()).toBeVisible();
});
