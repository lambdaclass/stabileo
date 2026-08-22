/**
 * One regulation selector, seen the way a user sees it — in English and in Spanish.
 *
 * The Design command bar used to carry its own regulation dropdown, listing the whole adapter
 * registry: "CIRSOC 201" appeared twice because the 2025 and 2005 adapters shared a display
 * name, and the 2005 edition was offered although its official text is not supplied with this
 * app. It also wrote its own state, which the code check, the candidate search and detailing
 * read, while Project Regulations bound a `concrete` role that reached only part of detailing.
 *
 * These journeys use visible controls only. Nothing seeds a regulation store.
 */

import { test, expect, loadModel, solveModel } from './fixtures';

type Page = import('@playwright/test').Page;

async function openDesign(page: Page) {
  // By testid throughout: this journey runs in both languages. The PRO bar is a
  // two-level ribbon now — the stage, then its command — so the label-matching
  // that the old dropdown forced is no longer needed at all.
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
  await expect(page.getByTestId('design-toolbar')).toBeVisible();
}

async function openRegulations(page: Page) {
  await openDesign(page);
  await page.locator('[data-testid="code-settings-disclosure"] summary').first().click();
  await expect(page.getByTestId('project-regulations')).toBeVisible();
}

for (const lang of ['en', 'es'] as const) {
  test.describe(`@smoke one regulation selector — ${lang}`, () => {
    test.use({ appLocale: lang });

    test(`${lang}: the design command bar has NO regulation selector`, async ({ pro: page }) => {
      await openDesign(page);
      const toolbar = page.getByTestId('design-toolbar');
      await expect(toolbar).toBeVisible();
      // The removed control, by its own id and by shape.
      await expect(page.getByTestId('code-select')).toHaveCount(0);
      await expect(toolbar.locator('select')).toHaveCount(0);
    });

    test(`${lang}: it shows the active concrete code as a read-out`, async ({ pro: page }) => {
      await openDesign(page);
      const readout = page.getByTestId('active-concrete-code');
      await expect(readout).toBeVisible();
      // Edition-qualified, so the two CIRSOC editions can never read alike.
      await expect(readout).toContainText(/CIRSOC 201/);
      await expect(readout).toContainText(/2025/);
      // A read-out, not a control.
      await expect(readout.locator('select, input, button')).toHaveCount(0);
    });

    test(`${lang}: Project Regulations holds the one concrete selector`, async ({ pro: page }) => {
      await openRegulations(page);
      const sel = page.getByTestId('role-select-concrete');
      await expect(sel).toBeVisible();
      const opts = (await sel.locator('option').allInnerTexts())
        .map((s) => s.trim()).filter((s) => s && !s.startsWith('—'));
      // No duplicate label anywhere in it, and the unsourced edition is not offered.
      expect(new Set(opts).size, opts.join(' | ')).toBe(opts.length);
      expect(opts.filter((o) => /CIRSOC 201/.test(o)), opts.join(' | ')).toHaveLength(1);
      expect(opts.join(' ')).not.toMatch(/2005/);
    });

    test(`${lang}: no duplicate regulation label anywhere on the design surface`,
      async ({ pro: page }) => {
        await openRegulations(page);
        const labels = (await page.getByTestId('project-regulations')
          .locator('option').allInnerTexts())
          .map((s) => s.trim()).filter((s) => /CIRSOC 201\b/.test(s));
        expect(new Set(labels).size, labels.join(' | ')).toBe(labels.length);
      });

    test(`${lang}: the design run uses the project's concrete code end to end`,
      async ({ pro: page }) => {
        await loadModel(page, 'rc-qa-diagnostic');
        await solveModel(page);
        await openDesign(page);
        // The read-out states the code the commands are about to use.
        await expect(page.getByTestId('active-concrete-code')).toContainText(/2025/);
        await page.getByTestId('cmd-compute-demands').click();
        await page.getByTestId('cmd-code-check').click();
        // The commands ran against a bound code rather than being gated.
        await expect(page.getByTestId('concrete-code-gate')).toHaveCount(0);
        await expect(page.getByTestId('design-counts')).toBeVisible();
      });
  });
}
