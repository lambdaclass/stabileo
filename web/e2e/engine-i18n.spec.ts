/**
 * PR16 — engine output reaches the user translated, and no load case disappears quietly.
 *
 * Two regressions, both found after the first PR16 pass was reported complete:
 *
 *   I1  The pure load/wind/regulation engines returned Spanish sentences. A user reading
 *       the app in English saw Spanish derivations, and no other locale had any hope.
 *   I2  The load preview reported the plan's own counts as "after" regardless of the
 *       "replace existing loads" flag, and a case type the plan no longer produced simply
 *       stopped being mentioned — along with every combination that referenced it.
 *
 * Everything here goes through visible controls. The one hook used reads a counter after a
 * UI action; nothing seeds the state under test.
 */

import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

/** Any engine key that leaked into the DOM as literal text. */
const KEY_PATTERN =
  /(?:^|[\s(>])(?:loadPlan|regulations|loads|codes|maturity|revisions|autoLoad)\.[a-z][\w.]*/;

/**
 * Navigation by test id, not by label.
 *
 * A bilingual journey must click the SAME control in both languages. Matching translated
 * text means the Spanish run silently tests a different path — or, as happened here, fails
 * to find the control at all because the label is "Auto-generar desde norma" and the
 * English-derived guess was "Generar automáticamente".
 */
async function openLoadsTab(page: Page) {
  // The PRO bar is a two-level ribbon now: the stage, then its command. The
  // old bar hid these behind a dropdown that had to be opened first.
  await page.getByTestId('pr-stage-conditions').click();
  await page.getByTestId('pr-cmd-loads').click();
}

async function openDialog(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await openLoadsTab(page);
  await page.getByTestId('pro-auto-loads-btn').click();
  await expect(page.getByTestId('al-regulations')).toBeVisible();
}

/** Reopen the dialog after an Apply closed it. */
async function reopenDialog(page: Page) {
  await page.getByTestId('pro-auto-loads-btn').click();
  await expect(page.getByTestId('al-regulations')).toBeVisible();
}

/** Fail if a raw i18n key is visible anywhere on the page. */
async function expectNoRawKeys(page: Page, where: string) {
  const text = await page.locator('body').innerText();
  const hits = [...text.matchAll(new RegExp(KEY_PATTERN.source, 'g'))]
    .map((m) => m[0].trim());
  expect([...new Set(hits)], `raw i18n keys visible at ${where}`).toEqual([]);
}

async function openPreview(page: Page) {
  await page.getByTestId('al-preview-btn').click();
  await expect(page.getByTestId('al-delta')).toBeVisible();
  await page.getByTestId('al-derivation').locator('summary').click();
  await page.getByTestId('al-dispositions').locator('summary').click();
}

// ─── I1: the same journey, in both languages ─────────────────────

for (const locale of ['en', 'es'] as const) {
  test.describe(`@smoke engine output is translated — ${locale}`, () => {
    test.use({ appLocale: locale });

    test(`I1 — no raw engine key is ever visible (${locale})`, async ({ pro: page }) => {
      await expectNoRawKeys(page, `${locale} initial`);
      await openDialog(page);
      await expectNoRawKeys(page, `${locale} dialog`);
      await openPreview(page);
      await expectNoRawKeys(page, `${locale} preview`);
      await page.getByTestId('al-clear').check();
      await expectNoRawKeys(page, `${locale} preview with replace on`);
    });

    test(`I1 — the derivation reads in ${locale}, with ${locale} number format`,
      async ({ pro: page }) => {
        await openDialog(page);
        await openPreview(page);
        const lines = await page.getByTestId('al-derivation').locator('li').allInnerTexts();
        expect(lines.length).toBeGreaterThan(3);
        const all = lines.join('\n');

        if (locale === 'en') {
          expect(all).toContain('Basis of calculation');
          expect(all).toMatch(/Occupancy:/);
          expect(all).toMatch(/plan area .*from the actual node extents/);
          // English decimal point on a non-integer level elevation or load.
          expect(all).toMatch(/\d+\.\d/);
          expect(all).not.toMatch(/Base de cálculo|Destino:|Nivel \+/);
        } else {
          expect(all).toContain('Base de cálculo');
          expect(all).toMatch(/Destino:/);
          expect(all).toMatch(/de la extensión real de los nodos/);
          // Spanish decimal comma — the whole reason numbers are formatted at the boundary.
          expect(all).toMatch(/\d+,\d/);
          expect(all).not.toMatch(/Basis of calculation|Occupancy:|plan area/);
        }
      });

    test(`I1 — the regulation label always carries its edition (${locale})`,
      async ({ pro: page }) => {
        await openDialog(page);
        // Proper nouns stay; the surrounding template is localised. Either way the edition
        // is present, which is what makes 2025 and 2005 distinguishable.
        await expect(page.getByTestId('al-regulations')).toContainText('CIRSOC 101 (2025)');
      });
  });
}

// ─── I2: no load case is dropped silently ────────────────────────

test.describe('@smoke the load preview tells the truth about what Apply will do', () => {
  test('I2 — "after" follows the replace flag instead of the plan alone',
    async ({ pro: page }) => {
      await openDialog(page);
      // Generate once so the model genuinely holds loads and combinations to collide with.
      await page.getByTestId('al-preview-btn').click();
      await page.getByTestId('al-apply').click();
      await expect(page.getByTestId('al-preview')).toBeHidden();

      await reopenDialog(page);
      await openPreview(page);

      // Replace OFF: the plan is ADDED to what is there, so after > before.
      const beforeDist = Number(
        await page.getByTestId('al-delta').locator('tbody tr').first()
          .locator('td').nth(1).innerText());
      const addDist = Number(await page.getByTestId('al-after-dist').innerText());
      expect(addDist).toBeGreaterThan(beforeDist);

      // Replace ON: the plan IS the model, so after equals the plan's own count.
      await page.getByTestId('al-clear').check();
      const replaceDist = Number(await page.getByTestId('al-after-dist').innerText());
      expect(replaceDist).toBeLessThan(addDist);
      expect(replaceDist).toBe(addDist - beforeDist);
    });

  test('I2 — regenerating into existing cases warns about double counting',
    async ({ pro: page }) => {
      await openDialog(page);
      await page.getByTestId('al-preview-btn').click();
      await page.getByTestId('al-apply').click();
      await reopenDialog(page);
      await openPreview(page);

      const warnings = page.getByTestId('al-case-warnings');
      await expect(warnings).toBeVisible();
      await expect(warnings).toContainText(/counted twice/i);

      // With replace on, the double-count warning is no longer true and must disappear.
      await page.getByTestId('al-clear').check();
      await expect(warnings).not.toContainText(/counted twice/i);
    });

  test('I2 — every load case has a stated disposition', async ({ pro: page }) => {
    await openDialog(page);
    await openPreview(page);

    const items = page.getByTestId('al-dispositions').locator('li');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    // Each entry names its case and explains what happens to it — never a bare code.
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).innerText();
      expect(text).toMatch(/^[A-Z][a-z]?\s+—\s+\S/);
      expect(text.length).toBeGreaterThan(20);
    }
  });

  test('I2 — a case the plan no longer produces is reported, not dropped',
    async ({ pro: page }) => {
      // Generate WITH wind, so the model holds a W case. Then regenerate with wind off:
      // the plan stops producing W, and the user must be told before applying.
      await openDialog(page);
      await page.getByTestId('al-enable-wind').check();
      await page.getByTestId('al-preview-btn').click();
      await page.getByTestId('al-apply').click();

      // The dialog keeps its form state across close/reopen, so wind has to be turned
      // OFF explicitly — which is the scenario: the user changes their mind after
      // generating, and the W case must not vanish without a word.
      await reopenDialog(page);
      await page.getByTestId('al-enable-wind').uncheck();
      await openPreview(page);

      await expect(page.getByTestId('al-disposition-W')).toBeVisible();
      await expect(page.getByTestId('al-disposition-W')).toContainText(/kept|delete/i);
      await expect(page.getByTestId('al-case-warnings')).toContainText(/W/);
    });

  test('I2 — the preview cannot be applied under a flag it was not computed for',
    async ({ pro: page }) => {
      await openDialog(page);
      await openPreview(page);
      // Flipping the flag re-derives the preview rather than leaving a stale one that
      // disagrees with what Apply would do.
      const before = await page.getByTestId('al-after-combos').innerText();
      await page.getByTestId('al-clear').check();
      await expect(page.getByTestId('al-after-combos')).not.toHaveText(before);
    });
});
