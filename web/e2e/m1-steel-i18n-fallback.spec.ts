/**
 * A locale the app does not offer cannot be forced back into it.
 *
 * ── Why this is worth a browser ────────────────────────────────────
 *
 * The unit gate proves the three offered dictionaries hold the metallic namespace and that
 * English carries it as the fallback. It cannot prove the thing that actually protects a user,
 * because that lives in `localStorage` and in the boot path:
 *
 *     getInitialLocale() refuses a stored locale that is no longer offered, "which would
 *     resurrect exactly the half-translated state this exists to remove"
 *
 * That comment is a product commitment. This spec is the test of it: with `stabileo-lang` set to
 * `de` and the manual flag on — the exact state a user who picked German before the narrowing
 * would have — the app has to boot in a language it can actually sustain, and the metallic
 * surfaces have to read as one language rather than as a mixture.
 *
 * It matters for the metallic namespace specifically because those eleven dictionaries are NOT
 * empty: each already carries 22 `conn.*` labels written before the namespace existed. So the
 * failure mode is not "everything in English" — it is 22 German strings among 292 English ones,
 * inside the joints panel. See `docs/handoffs/m1-steel-i18n-audit.md` §1.3.
 */

import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

const STAGE_OF = { generators: 'model', steel: 'design', connections: 'design' } as const;

async function openTab(page: Page, tab: keyof typeof STAGE_OF): Promise<void> {
  await page.getByTestId(`pr-stage-${STAGE_OF[tab]}`).click();
  await page.getByTestId(`pr-cmd-${tab}`).click();
}

/** Boot with a locale forced into storage, as a returning user would arrive. */
async function bootWithStoredLocale(page: Page, locale: string): Promise<void> {
  await page.addInitScript((loc) => {
    try {
      localStorage.clear();
      localStorage.setItem('stabileo-lang', loc);
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  }, locale);
  await page.goto(PRO_URL);
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

/** The locale the app settled on. */
function activeLocale(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('stabileo-lang'));
}

test.describe('a stored locale the app no longer offers', () => {
  test('does not survive the boot, for any of the eleven @smoke', async ({ page }) => {
    // One representative rather than all eleven: the barrier is `isOfferedLocale`, which does not
    // know which code it is refusing. `de` is the one the source comment names.
    await bootWithStoredLocale(page, 'de');
    const settled = await activeLocale(page);
    expect(['es', 'en', 'pt'], `settled on ${settled}`).toContain(settled);
  });

  test('leaves the metallic panel reading as ONE language, not a mixture', async ({ page }) => {
    await bootWithStoredLocale(page, 'de');

    // Generate a truss so the panel has rows, then read the joints panel — the one surface where
    // a partial German dictionary would show through, because those 22 keys are its labels.
    await openTab(page, 'generators');
    await page.getByTestId('gen-kind-truss').click();
    await page.getByTestId('gen-generate').click();
    await expect(page.getByTestId('gen-result')).toBeVisible();

    await openTab(page, 'connections');
    await expect(page.getByTestId('conn-experimental-banner')).toBeVisible();

    /*
     * The 22 pre-existing keys, in German, are what a mixture would look like. `conn.verify` is
     * "Verify" in English and "Prüfen" in the German dictionary, so its German form appearing here
     * would be the exact regression this test exists for.
     */
    const body = await page.getByTestId('conn-experimental-banner').innerText();
    expect(body.trim().length).toBeGreaterThan(20);

    const germanLeak = await page.evaluate(() => {
      const root = document.querySelector('.conn-tab') ?? document.body;
      const text = root.textContent ?? '';
      // Words that only exist in the German dictionary's version of this panel.
      return ['Prüfen', 'Schrauben', 'Schweißnaht', 'Knoten', 'Auslastung']
        .filter((w) => text.includes(w));
    });
    expect(germanLeak, `German strings leaked: ${germanLeak.join(', ')}`).toEqual([]);
  });

  test('renders no raw key on the metallic surfaces after falling back', async ({ page }) => {
    await bootWithStoredLocale(page, 'ja');

    await openTab(page, 'generators');
    const leaked = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="pro-generators-panel"]')!;
      return [...root.querySelectorAll('*')]
        .map((el) => (el.childElementCount === 0 ? (el.textContent ?? '').trim() : ''))
        .filter((t) => /^(steel|generator|conn)\.[a-zA-Z0-9_.]+$/.test(t));
    });
    // English carries the whole namespace, so the fallback resolves every key to real text.
    expect(leaked, 'raw keys rendered after locale fallback').toEqual([]);
  });
});

test.describe('the three offered locales each hold the namespace on their own', () => {
  for (const locale of ['es', 'en', 'pt'] as const) {
    test(`${locale} renders the metallic props card without falling through to English`, async ({ page }) => {
      await bootWithStoredLocale(page, locale);
      expect(await activeLocale(page)).toBe(locale);

      await openTab(page, 'generators');
      await page.locator('[data-testid^="gen-profile-trigger-"]').first().click();
      await page.getByTestId('profile-search').fill('UPN 200');
      await page.getByTestId('profile-option-UPN 200').hover();
      await expect(page.getByTestId('profile-card')).toBeVisible();

      /*
       * The card is where a fallback would be visible: its labels and its basis badges are all
       * `steel.props.*`, which live only in the steel namespace. If this locale were falling
       * through, every one of them would read in English.
       *
       * Asserted by comparing against the ENGLISH rendering rather than against fixed prose: for
       * es and pt the label must differ from English, and for en it must match. That covers the
       * fallback without pinning a translation this spec has no business pinning.
       */
      const label = (await page.getByTestId('profile-prop-wz').innerText()).split('\n')[0];
      expect(label.trim().length).toBeGreaterThan(3);
      if (locale === 'en') {
        expect(label).toMatch(/modulus/i);
      } else {
        expect(label, `${locale} fell through to English`).not.toMatch(/section modulus/i);
      }
    });
  }
});
