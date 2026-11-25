/**
 * The discretization-error estimate in the real app (testing/docs/DISCRETIZATION.md): a
 * frame-and-shell model solved in PRO shows "discretization error: estimated ~Y% (… not
 * certified)" next to the certificate, and the convergence check re-solves and fills its table.
 *
 * Both run through the worker pool in a real browser: the estimate exports once failed there
 * ("Worker certificate … not available") while every unit test, which runs on the main thread,
 * passed. The model has load combinations, so the base result on screen is the "all loads" sum
 * of its cases, which no single solve returned: the estimate once stayed idle on it.
 */
import { test, expect, loadModel, solveModel } from './fixtures';

test('@smoke a frame-and-shell model shows its estimated discretization error and runs the convergence check', async ({ pro: page }) => {
  await loadModel(page, 'rc-qa-diagnostic-shells');
  await solveModel(page);
  await expect.poll(() => page.evaluate(() => window.__stabileo.discretizationState().estimate), { timeout: 30_000 })
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
  await expect.poll(() => page.evaluate(() => window.__stabileo.discretizationState().study), { timeout: 30_000 })
    .not.toBe('running');
  expect((await page.evaluate(() => window.__stabileo.discretizationState())).reason).toBeNull();
  const table = page.getByTestId('discretization-study').first();
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr').first()).toBeVisible();
});

test('@smoke the adaptive refinement is folded away until asked for, runs in the worker and reports its passes', async ({ pro: page }) => {
  await loadModel(page, 'rc-qa-diagnostic-shells');
  await solveModel(page);
  await expect.poll(() => page.evaluate(() => window.__stabileo.discretizationState().estimate), { timeout: 30_000 })
    .toBe('done');
  await page.evaluate(() => window.__stabileoActions.openProTab('results'));
  const section = page.getByTestId('discretization-adaptive').first();
  await expect(section).toBeVisible({ timeout: 30_000 });
  const run = page.getByTestId('discretization-run-adaptive').first();
  await expect(section).not.toHaveAttribute('open', '');
  await expect(run).toBeHidden();
  expect((await page.evaluate(() => window.__stabileo.discretizationState())).adaptive).toBe('idle');

  await section.locator('summary').click();
  await page.getByTestId('discretization-adaptive-target').first().fill('1000');
  await expect(run).toBeDisabled();
  await page.getByTestId('discretization-adaptive-target').first().fill('20');
  await run.click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.discretizationState().adaptive), { timeout: 30_000 })
    .toBe('done');
  expect((await page.evaluate(() => window.__stabileo.discretizationState())).reason).toBeNull();
  await expect(page.getByTestId('discretization-adaptive-status').first()).toContainText('%');
  const passes = page.getByTestId('discretization-adaptive-passes').first();
  await expect(passes.locator('tbody tr').first()).toContainText(/model/i);
  expect(await passes.locator('tbody tr').count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('discretization-estimate').first()).toContainText(/not certified/i);

  const quads = await page.evaluate(() => window.__stabileo.quadIds().length);
  await page.getByTestId('discretization-apply-adaptive').first().click();
  await expect(page.getByTestId('discretization-apply-refused')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__stabileo.quadIds().length)).toBeGreaterThan(quads);
  await solveModel(page);
  await expect.poll(() => page.evaluate(() => window.__stabileo.discretizationState().estimate), { timeout: 60_000 })
    .toBe('done');
  expect((await page.evaluate(() => window.__stabileo.discretizationState())).reason).toBeNull();
});
