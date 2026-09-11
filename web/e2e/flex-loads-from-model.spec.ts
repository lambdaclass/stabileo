/**
 * Arming and disarming the load picker.
 *
 * ── What is tested where ───────────────────────────────────────────
 *
 * The interesting part of this feature — the axial SIGN flip and the rule
 * that each Case takes only the terms it uses — is a pure mapping, and it is
 * tested as one in `demand-from-model.test.ts`. Driving it from here would
 * mean landing a mouse click on a member at a particular pixel, which is
 * both flaky and tests the viewport's hit-testing rather than this feature.
 *
 * What genuinely needs a browser is the state around it: that the control
 * refuses before there are results instead of filling in zeros, that arming
 * it says so, and that it can be turned off again. A crosshair with no way
 * out is how a viewport comes to feel frozen — clicks select nothing and no
 * visible control says which mode you are in.
 */

import { test, expect, type Page } from '@playwright/test';
import { loadModel } from './fixtures';

async function openBasic(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stabileo-lang', 'es');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

async function openCalculator(page: Page) {
  await page.getByRole('button', { name: /Avanzado|Advanced/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByTestId('adv-flex').click();
  await page.waitForTimeout(500);
}

/** The field value as a number, whatever the locale formatting. */
async function fieldValue(page: Page, label: string): Promise<number> {
  const input = page.getByText(label, { exact: true }).locator('..').locator('input');
  return Number(await input.inputValue());
}

test.describe('@smoke loads taken from the model', () => {
  test('refuses before there are results, and says why', async ({ page }) => {
    await openBasic(page);
    await openCalculator(page);

    await page.getByTestId('flex-pick-loads').click();
    await page.waitForTimeout(300);

    /*
     * Not a silent no-op and not zeros: the demand comes from an analysis,
     * and a reader who has not run one needs to be told that rather than
     * left wondering why nothing happened.
     */
    await expect(page.locator('.fp-note').last()).toContainText(/calcul/i);
  });

  test('cancelling gives the pointer back', async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    await page.getByTestId('rb-cmd-solve').click();
    await expect(page.getByTestId('rb-cmd-stress')).toBeEnabled({ timeout: 60_000 });

    await openCalculator(page);
    await page.getByTestId('flex-pick-loads').click();
    await expect(page.locator('.fp-note-live')).toBeVisible();

    /*
     * Arming a crosshair with no way out is how the viewport ends up feeling
     * frozen: clicks select nothing and there is no visible control to say
     * what mode you are in.
     */
    await page.getByTestId('flex-pick-loads').click();
    await expect(page.locator('.fp-note-live')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo?.selectMode?.() ?? 'elements'))
      .not.toBe('stress');
  });
});
