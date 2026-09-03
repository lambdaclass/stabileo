/**
 * PRO's phone shell: the bar's controls have to work with the sheet SHUT.
 *
 * ── The defect this exists for ─────────────────────────────────────
 *
 * `proPanelRef` is bound by `ProPanel`, and on a phone that component mounts
 * only inside `{#if uiStore.isMobile && uiStore.rightDrawerOpen ...}`. Calcular
 * asked that ref whether it could solve:
 *
 *     disabled={!(proPanelRef?.canSolve() ?? false)}
 *
 * With the sheet shut there is no instance, so the ref is null, so the button
 * renders disabled — and being disabled its own onclick cannot fire, so it
 * cannot open the sheet that would create the panel that would enable it. The
 * sheet starts shut, so Calcular was dead on arrival and went dead again on
 * every close.
 *
 * ── Why no existing test caught it ────────────────────────────────
 *
 * Two reasons, and both are worth keeping in mind when adding to this file.
 *
 * The suite had NOTHING on `pmt-solve` — the whole PRO phone bar was untested.
 * And the manual audit that accompanied the shell work pressed "every visible,
 * ENABLED control", which by construction skips a control that is wrongly
 * disabled. A dead button is invisible to a method that only presses live ones.
 *
 * So the assertions here are about the button being ENABLED and about a press
 * producing a solve — not about it merely existing.
 */

import { test, expect, loadModel } from './fixtures';

/** Small enough that a solve is quick; real enough that `hasModel` is true. */
const SMALL = 'rc-qa-diagnostic';

/** iPhone SE. The narrowest width the shell claims to support. */
const PHONE = { width: 375, height: 667 };

test.describe('@smoke PRO phone bar — Calcular', () => {
  test('is enabled with the sheet shut, and solves when pressed', async ({ pro: page }) => {
    await page.setViewportSize(PHONE);

    const solve = page.getByTestId('pmt-solve');
    await expect(solve, 'the phone bar mounts below 768 px').toBeVisible();

    /*
     * The precondition that produced the bug. If this ever fails because
     * something started opening the sheet on boot, the test below stops
     * covering the reported defect even while passing — so it is asserted
     * rather than assumed.
     */
    await expect(
      page.getByTestId('pm-stage-toggle'),
      'the sheet must start shut, or this test is not exercising the defect',
    ).toHaveCount(0);

    await loadModel(page, SMALL);

    /*
     * THE assertion. Before the fix this was `disabled`, because the panel
     * that answers `canSolve()` had not been mounted.
     */
    await expect(
      solve,
      'Calcular must be live once a model exists, sheet open or not — it cannot ' +
        'depend on the panel it is meant to open',
    ).toBeEnabled();

    const before = await page.evaluate(() => window.__stabileo.solveCount());
    await solve.click();

    /*
     * Pressing has to SOLVE, not merely open the sheet. The press sets
     * `rightDrawerOpen` and then awaits `tick()` before calling into the panel,
     * because the panel does not exist at the moment of the click — it is
     * mounted by that very assignment.
     */
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.solveCount()), {
        message: 'the press must reach ProPanel.solve(), not just open the sheet',
      })
      .toBeGreaterThan(before);

    await expect(page.getByTestId('pm-stage-toggle'), 'and the sheet opens').toBeVisible();
  });

  test('stays enabled after the sheet is closed again', async ({ pro: page }) => {
    await page.setViewportSize(PHONE);
    await loadModel(page, SMALL);

    // Open it the way a reader would, then shut it.
    await page.getByTestId('pmt-solve').click();
    await expect(page.getByTestId('pm-stage-toggle')).toBeVisible();
    await page.getByTestId('pro-sheet-close').click();
    await expect(page.getByTestId('pm-stage-toggle')).toHaveCount(0);

    /*
     * Closing the sheet unmounts `ProPanel`, and Svelte sets a `bind:this` back
     * to null on destroy — which is the same null the first-load case had. A
     * fix that only seeded the ref once would pass the test above and fail here.
     */
    await expect(
      page.getByTestId('pmt-solve'),
      'closing the sheet unmounts the panel and nulls the ref; Calcular must survive it',
    ).toBeEnabled();
  });
});
