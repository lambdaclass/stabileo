/**
 * The two committed screenshot comparisons (approved decision O7).
 *
 * NON-BLOCKING on this first landing: pixel gates that block on day one are how E2E
 * suites end up disabled. The functional DOM/hook assertions in rc-design.spec.ts
 * remain blocking. Promote these to blocking once the baselines have proven stable
 * across a few CI runs.
 *
 * Baselines are per-platform (`e2e/__screenshots__/<platform>/`); CI commits only the
 * linux set. Regenerate with `npm run test:e2e:update-snapshots`.
 */

import { test, expect, loadModel, solveModel } from './fixtures';

const QA = 'rc-design-qa-8';

// Soft-fail: a mismatch is reported in the run summary but does not fail the job.
test.describe('@slow visual baselines (non-blocking)', () => {
  /*
   * Not `mode: 'serial'`: the two tests share nothing (each loads, solves and designs on its
   * own page), and serial mode skipped the dialog whenever the legend's soft mismatch failed.
   * With `workers: 1` and no `fullyParallel` they still run in order, in one worker.
   */
  test('overlay legend', async ({ pro: page }) => {
    await loadModel(page, QA);
    await solveModel(page);
    await page.evaluate(() => window.__stabileoActions.designAll());
    await expect.poll(() => page.evaluate(() => window.__stabileo.runCounts()?.verified ?? 0)).toBeGreaterThan(0);

    // The baseline was taken with the viewer at the model's width: the model stage, not the
    // viewer docked between design's rail and sheet (interface A).
    await page.getByTestId('pr-stage-model').click();
    const legend = page.getByTestId('overlay-legend');
    await expect(legend).toBeVisible();
    /*
     * The solve's toast («4 reactions + 4 combinations», 4 s, bottom right) lies across the
     * legend's right end, and the design now finishes inside those 4 s, so the shot caught the
     * toast and not the legend (the 0.06 diff, f2f2bdb38 and after). The legend is what is
     * compared: the toast is let go first.
     */
    await expect(page.locator('.toast-container .toast')).toHaveCount(0, { timeout: 15_000 });
    await expect.soft(legend).toHaveScreenshot('overlay-legend.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('batch edit dialog', async ({ pro: page }) => {
    const ids = await loadModel(page, QA);
    await solveModel(page);
    await page.evaluate(() => window.__stabileoActions.designAll());
    await expect.poll(() => page.evaluate(() => window.__stabileo.runCounts()?.verified ?? 0)).toBeGreaterThan(0);

    // Select BEAMS: the beam fieldset only renders when the selection contains one
    // (elements 1-4 of the QA fixture are columns).
    const beams = await page.evaluate(
      (list) => list.filter(id => window.__stabileo.rebarSummary(id).startsWith('b')), ids);
    expect(beams.length).toBeGreaterThan(0);
    for (const id of beams) await page.getByTestId(`row-checkbox-${id}`).check();
    await page.getByTestId('batch-open').click();
    const dialog = page.getByTestId('batch-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('batch-bs-count').fill('5');
    await page.getByTestId('batch-bs-dia').selectOption('20');
    await expect(page.getByTestId('batch-summary')).toContainText('change');

    await expect.soft(dialog).toHaveScreenshot('batch-dialog.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
