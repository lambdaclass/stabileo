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

import { test, expect, designPlace } from './fixtures';

type Page = import('@playwright/test').Page;

async function openRegulations(page: Page) {
  await designPlace(page, 'designData');
  await expect(page.getByTestId('project-regulations')).toBeVisible();
}

for (const lang of ['en', 'es'] as const) {
  test.describe(`@smoke one regulation selector — ${lang}`, () => {
    test.use({ appLocale: lang });

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
  });
}
