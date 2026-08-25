/**
 * A shed that will not solve says so before Generate, not after Solve.
 *
 * Unticking Purlins produces a set of planar trusses with nothing holding them sideways. The
 * parameters are all individually valid, so nothing blocks Generate and nothing should — a
 * user may want the bare geometry to brace it their own way. What they must not get is a model
 * that looks finished and answers "mechanism" the first time they press Solve.
 *
 * The cause is measured, not guessed: restraining out-of-plane TRANSLATION at the roof truss
 * nodes turns the singular matrix into a 4 mm deflection, and restraining rotations there does
 * not. `shed-default-solves.test.ts` carries that experiment. This file only checks that the
 * finding reaches the screen.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function openShed(page: Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-generators').click();
  await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
  await page.getByTestId('gen-kind-shed').click();
}

const purlins = (page: Page) => page.getByRole('checkbox', { name: /purlins|correas|terças/i });

test.describe('@smoke the shed warns when it cannot be solved', () => {
  test('no notice while purlins are on, which is the default', async ({ pro: page }) => {
    await openShed(page);
    await expect(purlins(page)).toBeChecked();
    await expect(page.getByTestId('gen-stability-notice')).toHaveCount(0);
  });

  test('unticking purlins names the missing restraint and the switch that supplies it',
    async ({ pro: page }) => {
      await openShed(page);
      await purlins(page).uncheck();
      const notice = page.getByTestId('gen-stability-notice');
      await expect(notice).toBeVisible();
      // What is missing, in the user's words rather than "singular matrix".
      await expect(notice).toContainText(/out-of-plane/i);
      // That it will generate but not solve — the distinction the whole notice exists for.
      await expect(notice).toContainText(/cannot be solved/i);
      // And the way out, named. A warning that does not say what to do is a shrug.
      await expect(notice).toContainText(/purlins/i);
    });

  test('does not block Generate — the geometry is still the user\'s to take',
    async ({ pro: page }) => {
      await openShed(page);
      await purlins(page).uncheck();
      await expect(page.getByTestId('gen-stability-notice')).toBeVisible();
      await expect(page.getByTestId('gen-generate')).toBeEnabled();
    });

  test('the notice goes when the fix is applied', async ({ pro: page }) => {
    await openShed(page);
    await purlins(page).uncheck();
    await expect(page.getByTestId('gen-stability-notice')).toBeVisible();
    await purlins(page).check();
    await expect(page.getByTestId('gen-stability-notice')).toHaveCount(0);
  });

  test('the assumption travels with the generated model as well', async ({ pro: page }) => {
    await openShed(page);
    await purlins(page).uncheck();
    // The panel's own assumptions disclosure carries it, so the fact survives the notice
    // being dismissed by scrolling past it.
    await page.getByText(/assumptions|hip.tesis|hip.teses/i).first().click();
    await expect(page.getByTestId('pro-generators-panel')).toContainText(/no purlins/i);
  });
});

test.describe('the warning exists in the other two offered languages', () => {
  for (const [locale, words] of [
    ['es', /fuera del plano/i],
    ['pt', /fora do plano/i],
  ] as const) {
    test.describe(locale, () => {
      test.use({ appLocale: locale });
      test('names the missing restraint', async ({ pro: page }) => {
        await openShed(page);
        await purlins(page).uncheck();
        await expect(page.getByTestId('gen-stability-notice')).toContainText(words);
      });
    });
  }
});
