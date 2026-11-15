/**
 * Three languages, in a real browser, through the whole PRO workflow.
 *
 * ── What the unit tests cannot say ─────────────────────────────────
 *
 * `offered-locales.test.ts` proves the RULES — detection, fallback, persistence — against a
 * stubbed navigator, and `pro-flow-coverage.test.ts` proves every key the flow uses exists in all
 * three dictionaries. Neither can say that the app a person opens in a Portuguese browser is in
 * Portuguese: the first never renders anything, and the second never checks that the right key
 * reaches the right element.
 *
 * So this file opens the app the way a Brazilian, an Argentine and an American each would — by
 * having a browser set to their language and nothing else — and then reads the screen.
 *
 * ── How the expected strings are obtained ──────────────────────────
 *
 * From the dictionaries themselves, imported here. Restating them would produce a test that
 * passes when the app and the test are wrong in the same way, and would have to be edited every
 * time a word changes. Importing them means the assertion is "the element renders the value this
 * key has in this language", which is the property that actually matters — and it fails loudly if
 * a component starts rendering a different key.
 *
 * The dictionaries are plain objects with a single type-only import, so this costs the test
 * process nothing.
 */

import { readFileSync } from 'node:fs';
import { test, expect, designAll, loadModel, PRO_URL, setAppLanguage, appLanguage, designPlace } from './fixtures';
import en from '../src/lib/i18n/locales/en';
import es from '../src/lib/i18n/locales/es';
import pt from '../src/lib/i18n/locales/pt';
import de from '../src/lib/i18n/locales/full/de';
import fr from '../src/lib/i18n/locales/full/fr';
import tr from '../src/lib/i18n/locales/full/tr';
import type { Page } from '@playwright/test';
import { OFFERED_LOCALES, isComplete } from '../src/lib/i18n/offered';

const DICTS: Record<string, Record<string, string>> = {
  en: en as unknown as Record<string, string>,
  es: es as unknown as Record<string, string>,
  pt: pt as unknown as Record<string, string>,
  de, fr, tr,
};

/** What a key renders as in a language: a language still being translated shows the English for what it lacks. */
const rendered = (locale: string, key: string) => DICTS[locale][key] ?? DICTS.en[key];

/** Where a browser in this language lands: the language once it is complete, English until then. */
const reach = (code: 'de' | 'fr' | 'tr') => (isComplete(code) ? code : 'en');

/**
 * Boot PRO with NOTHING stored — the app must decide from the browser alone.
 *
 * Deliberately not `bootPro`, which seeds `stabileo-lang` and the manual flag: that is right for
 * every other spec, whose assertions need a language they can rely on, and it is exactly what
 * must not happen here. What is cleared is storage; what decides is `navigator.languages`, set by
 * the context's `locale` option.
 */
async function bootDetecting(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      // The language is left to the browser; design is turned on as `bootPro` does, since the
      // surface read below is design's.
      localStorage.setItem('stabileo-design-in-pro', '1');
    } catch { /* private mode */ }
  });
  await page.goto(PRO_URL);
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 45_000 })
    .toBe(true);
  await page.evaluate(() => window.__stabileoActions.openDesignTab());
}

/** What the picker is showing, as a language code. */
function pickerValue(page: Page) {
  /* `data-value` rather than `inputValue`: the picker is a drawn list now, and
     the attribute is what it publishes in place of a `<select>`'s value. */
  return appLanguage(page);
}

// ─── Detection, fallback, and the picker's contents ──────────────

/**
 * Which browser locales are worth a browser, and which are worth a unit test.
 *
 * `offered-locales.test.ts` already drives detection for all three offered languages, six
 * regional variants and ELEVEN unsupported ones, against a stubbed navigator — the rule is
 * thoroughly covered there and costs milliseconds. What only a browser can add is that the app
 * RENDERS in the chosen language, and for that three offered languages plus one proof of the
 * fallback is the whole claim.
 *
 * So the smoke set is four, and the rest stay here as a fuller sweep outside it. That is a
 * deliberate budget, and it was measured: eleven of these in `@smoke` pushed
 * `rc-design.spec.ts` B15 — whose own solve is 4 s in isolation — past its sixty-second budget
 * on an already-loaded worker, the load sensitivity `fixtures.ts` documents. Removing redundancy
 * is the honest way to give it back; widening B15's budget would have been hiding it.
 */
const SMOKE_DETECTION = [
  ['en-US', 'en'], ['es-AR', 'es'], ['pt-BR', 'pt'], ['fr-FR', reach('fr')],
  // One proof that an unoffered language lands on English rather than a half-translated UI.
  ['it-IT', 'en'],
] as const;

/** The rest of the sweep: same assertion, outside the blocking suite. */
const FULL_DETECTION = [
  ['de-DE', reach('de')], ['de-AT', reach('de')], ['tr-TR', reach('tr')], ['fr-CA', reach('fr')], ['ja-JP', 'en'], ['zh-CN', 'en'], ['ru-RU', 'en'],
] as const;

test.describe('@smoke the language a browser gets', () => {
  for (const [browserLocale, expected] of SMOKE_DETECTION) {
    test.describe(`a browser set to ${browserLocale}`, () => {
      test.use({ locale: browserLocale });

      test(`opens PRO in ${expected}`, async ({ page }) => {
        await bootDetecting(page);
        expect(await pickerValue(page), 'the picker agrees with what the app chose')
          .toBe(expected);
        // And the screen is actually in that language: design's rail is the first PRO surface the
        // boot lands on.
        await expect(page.getByTestId('desk-rail-steel'))
          .toContainText(rendered(expected, 'desk.rail.profiles'));
      });
    });
  }

  test('offers its complete languages, each named in its own language',
    async ({ pro: page }) => {
      /* The list only exists while it is open — that is the difference between a
         drawn list and a `<select>`, whose options are in the DOM either way. */
      await page.getByTestId('lang-select-button').click();
      const options = page.getByTestId('lang-select-list').getByRole('option');
      const codes = [...OFFERED_LOCALES];
      await expect(options).toHaveCount(codes.length);
      expect(await options.allTextContents()).toEqual(codes.map((c) => en[`lang.${c}`]));
      expect(await options.evaluateAll((os) =>
        os.map((o) => o.getAttribute('data-value')))).toEqual(codes);
    });

  test('a language nobody offers any more is not restored, and the picker is never blank',
    async ({ page }) => {
      // Someone who chose Italian when the picker listed fourteen. Honouring it would leave the
      // picker with a value matching none of its options, which renders empty.
      await page.addInitScript(() => {
        try {
          localStorage.clear();
          localStorage.setItem('stabileo-lang', 'it');
          localStorage.setItem('stabileo-lang-manual', '1');
        } catch { /* private mode */ }
      });
      await page.goto(PRO_URL);
      await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
      const value = await pickerValue(page);
      expect(OFFERED_LOCALES, `the picker showed "${value}"`).toContain(value);
    });
});

// ─── Switching, and what a switch must not cost ──────────────────

test.describe('the rest of the detection sweep', () => {
  for (const [browserLocale, expected] of FULL_DETECTION) {
    test.describe(`a browser set to ${browserLocale}`, () => {
      test.use({ locale: browserLocale });
      test(`opens PRO in ${expected}`, async ({ page }) => {
        await bootDetecting(page);
        expect(await pickerValue(page)).toBe(expected);
        await expect(page.getByTestId('desk-rail-steel'))
          .toContainText(rendered(expected, 'desk.rail.profiles'));
      });
    });
  }
});

test.describe('changing language keeps the work', () => {
  test('the model, the design and the selection survive the switch', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    const before = await page.evaluate(() => ({
      elements: window.__stabileo.elementIds(),
      run: window.__stabileo.runCounts(),
      solves: window.__stabileo.solveCount(),
    }));

    await setAppLanguage(page, 'pt');
    await expect(page.getByTestId('desk-rail-steel')).toHaveText(pt['desk.rail.profiles']);

    const after = await page.evaluate(() => ({
      elements: window.__stabileo.elementIds(),
      run: window.__stabileo.runCounts(),
      solves: window.__stabileo.solveCount(),
    }));
    // A language is a view of the work, not a change to it. Re-solving on a language change
    // would be the loud failure; silently dropping the run would be the quiet one.
    expect(after).toEqual(before);
  });

  test('the choice survives a reload', async ({ page }) => {
    /**
     * This one boots itself, and clears storage ONCE.
     *
     * `addInitScript` runs on every navigation, so the `pro` fixture — which seeds the language
     * to make every other spec's assertions stable — re-seeds it on `reload()` too, and the
     * choice under test would be overwritten by the harness rather than by the app. The guard
     * makes the clear a first-load thing, which is what a returning user's browser does.
     */
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('e2e-storage-cleared')) {
          localStorage.clear();
          // The step it reads is the design desk's, off by default in PRO: turned on, as a reader
          // turns it on, before the language is chosen. The language is what this test follows.
          localStorage.setItem('stabileo-design-in-pro', '1');
          sessionStorage.setItem('e2e-storage-cleared', '1');
        }
      } catch { /* private mode */ }
    });
    await page.goto(PRO_URL);
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    await page.evaluate(() => window.__stabileoActions.openDesignTab());

    await setAppLanguage(page, 'pt');
    await expect(page.getByTestId('desk-rail-steel')).toContainText(pt['desk.rail.profiles']);

    await page.reload();
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    await page.evaluate(() => window.__stabileoActions.openDesignTab());
    expect(await pickerValue(page)).toBe('pt');
    await expect(page.getByTestId('desk-rail-steel')).toContainText(pt['desk.rail.profiles']);
  });
});

// ─── The whole workflow, once per language ───────────────────────

for (const locale of OFFERED_LOCALES) {
  const D = DICTS[locale];

  test.describe(`@slow the PRO workflow in ${locale}`, () => {
    test.use({ appLocale: locale });

    test('the project, its design data and its file — all in one language', async (
      { pro: page }, testInfo,
    ) => {
      test.setTimeout(300_000);
      await loadModel(page, 'rc-design-qa-8');

      // ── A. Project, Settings and Diagnostics ───────────────────
      await page.getByTestId('pr-project').click();
      await expect(page.getByTestId('pro-project-tab')).toBeVisible();
      await expect(page.getByTestId('pp-open')).toHaveText(D['project.open']);
      await expect(page.getByTestId('pp-save')).toHaveText(D['project.save']);
      await expect(page.getByTestId('pp-autosave'))
        .toContainText(D['proProject.autosaveSection']);

      await designPlace(page, 'designData');
      await expect(page.getByTestId('project-regulations'))
        .toContainText(D['regulations.title']);

      // ── D. The `.ded`, saved and reopened in this language ─────
      const download = page.waitForEvent('download', { timeout: 120_000 });
      await page.getByTestId('pr-save').click();
      const file = testInfo.outputPath(`project-${locale}.ded.json`);
      await (await download).saveAs(file);
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      expect(saved.version).toBe('2.0');
      expect(saved.snapshot.elements.length).toBeGreaterThan(0);

      await page.reload();
      await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
      // The language survived the reload, and the reopened project lands in the same one.
      expect(await pickerValue(page)).toBe(locale);
      await page.getByTestId('pr-project').click();
      await page.getByTestId('pp-open-file').setInputFiles(file);
      await expect
        .poll(() => page.evaluate(() => window.__stabileo.elementIds().length),
          { timeout: 120_000 })
        .toBe(saved.snapshot.elements.length);
      expect(await pickerValue(page), 'opening a project does not change the language')
        .toBe(locale);
    });
  });
}
