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
import { test, expect, designAll, loadModel, PRO_URL, openDocumentsStage } from './fixtures';
import en from '../src/lib/i18n/locales/en';
import es from '../src/lib/i18n/locales/es';
import pt from '../src/lib/i18n/locales/pt';
import type { Page } from '@playwright/test';

const DICTS: Record<string, Record<string, string>> = {
  en: en as unknown as Record<string, string>,
  es: es as unknown as Record<string, string>,
  pt: pt as unknown as Record<string, string>,
};

/** The three the picker offers, and the browser locales that must reach each of them. */
const OFFERED = ['en', 'es', 'pt'] as const;
type Offered = (typeof OFFERED)[number];

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
    try { localStorage.clear(); } catch { /* private mode */ }
  });
  await page.goto(PRO_URL);
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
  await page.evaluate(() => window.__stabileoActions.openDesignTab());
}

/** What the picker is showing, as a language code. */
function pickerValue(page: Page) {
  return page.getByTestId('lang-select').inputValue();
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
  ['en-US', 'en'], ['es-AR', 'es'], ['pt-BR', 'pt'],
  // One proof that an unoffered language lands on English rather than a half-translated UI.
  ['fr-FR', 'en'],
] as const;

/** The rest of the sweep: same assertion, outside the blocking suite. */
const FULL_DETECTION = [
  ['de-DE', 'en'], ['it-IT', 'en'], ['ja-JP', 'en'], ['zh-CN', 'en'], ['ru-RU', 'en'],
] as const;

test.describe('@smoke the language a browser gets', () => {
  for (const [browserLocale, expected] of SMOKE_DETECTION) {
    test.describe(`a browser set to ${browserLocale}`, () => {
      test.use({ locale: browserLocale });

      test(`opens PRO in ${expected}`, async ({ page }) => {
        await bootDetecting(page);
        expect(await pickerValue(page), 'the picker agrees with what the app chose')
          .toBe(expected);
        // And the screen is actually in that language: the RC design command row is the first
        // PRO surface a user sees.
        await expect(page.getByTestId('cmd-design-all'))
          .toHaveText(DICTS[expected]['design.cmd.designAll']);
      });
    });
  }

  test('offers exactly English, Español and Português, named in their own language',
    async ({ pro: page }) => {
      const options = page.getByTestId('lang-select').locator('option');
      await expect(options).toHaveCount(3);
      expect(await options.allTextContents())
        .toEqual([en['lang.es'], en['lang.en'], en['lang.pt']]);
      expect(await options.evaluateAll((os) =>
        os.map((o) => (o as HTMLOptionElement).value))).toEqual(['es', 'en', 'pt']);
    });

  test('a language nobody offers any more is not restored, and the picker is never blank',
    async ({ page }) => {
      // Someone who chose German before the picker narrowed. Honouring it would leave the
      // `<select>` with a value matching none of its options, which renders empty.
      await page.addInitScript(() => {
        try {
          localStorage.clear();
          localStorage.setItem('stabileo-lang', 'de');
          localStorage.setItem('stabileo-lang-manual', '1');
        } catch { /* private mode */ }
      });
      await page.goto(PRO_URL);
      await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
      const value = await pickerValue(page);
      expect(OFFERED, `the picker showed "${value}"`).toContain(value as Offered);
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
        await expect(page.getByTestId('cmd-design-all'))
          .toHaveText(DICTS[expected]['design.cmd.designAll']);
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

    await page.getByTestId('lang-select').selectOption('pt');
    await expect(page.getByTestId('cmd-design-all')).toHaveText(pt['design.cmd.designAll']);

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
          sessionStorage.setItem('e2e-storage-cleared', '1');
        }
      } catch { /* private mode */ }
    });
    await page.goto(PRO_URL);
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.openDesignTab());

    await page.getByTestId('lang-select').selectOption('pt');
    await expect(page.getByTestId('cmd-design-all')).toHaveText(pt['design.cmd.designAll']);

    await page.reload();
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.openDesignTab());
    expect(await pickerValue(page)).toBe('pt');
    await expect(page.getByTestId('cmd-design-all')).toHaveText(pt['design.cmd.designAll']);
  });
});

// ─── The whole workflow, once per language ───────────────────────

/**
 * Surfaces asserted per language, as `testid → key`.
 *
 * Chosen to cover the enumerated audit surfaces rather than to be exhaustive: the command row,
 * the empty states, the detailing panel, the floor families, the 3-D rail and its tally, the
 * conflict and provisional wording, and the document exports.
 */
/**
 * The pipeline's commands, each with the key that LABELS it.
 *
 * `cmd-code-check` reads `design.cmd.requiredSteel`, not `design.cmd.codeCheck`. The command
 * computes what the code REQUIRES and never looks at a provided bar, so "Run code check" claimed a
 * verification of reinforcement that did not exist yet — the claim F1 took off the stage strip and
 * this label went on making. It was renamed with the move to the REGLAMENTOS strip.
 *
 * `design.cmd.codeCheck` still exists in all three dictionaries and still says "Run code check",
 * which is why this kept resolving to a string and failing on its VALUE in every language at once.
 * An obsolete expectation, not broken behaviour — same shape as D7.
 */
const COMMAND_ROW: Array<[string, string]> = [
  ['cmd-compute-demands', 'design.cmd.computeDemands'],
  ['cmd-code-check', 'design.cmd.requiredSteel'],
  ['cmd-design-all', 'design.cmd.designAll'],
];

/** Rail switches: a checkbox whose text sits on the surrounding <label>. */
const VIEWER_SWITCHES: Array<[string, string]> = [
  ['rebar-layer-bars', 'detailing.scene.showBars'],
  ['rebar-layer-concrete', 'detailing.scene.showConcrete'],
  ['rebar-layer-conflicts', 'detailing.scene.showConflicts'],
];

/** Header buttons: their own text. */
const VIEWER_BUTTONS: Array<[string, string]> = [
  ['rebar-fit-view', 'detailing.scene.reset'],
  ['rebar-workspace-close', 'detailing.scene.workspace.close'],
];

for (const locale of OFFERED) {
  const D = DICTS[locale];

  test.describe(`@slow the PRO workflow in ${locale}`, () => {
    test.use({ appLocale: locale });

    test('design, detail, view in 3-D, and export — all in one language', async (
      { pro: page }, testInfo,
    ) => {
      test.setTimeout(300_000);

      // ── A. Shell and empty states ──────────────────────────────
      await expect(page.getByTestId('design-placeholder-solve'))
        .toHaveText(D['design.error.solveFirst']);
      for (const [id, key] of COMMAND_ROW) {
        await expect(page.getByTestId(id)).toHaveText(D[key]);
      }
      // A disabled command states its reason in the same language.
      expect(await page.getByTestId('cmd-open-3d').getAttribute('title'))
        .toBe(D['detailing.scene.openBlocked']);

      // ── B. The design flow ─────────────────────────────────────
      await loadModel(page, 'rc-design-qa-8');
      await designAll(page);
      await expect(page.getByTestId('summary-count-verified'))
        .toContainText(D['design.counts.verified']);
      await expect(page.getByTestId('summary-count-provisional'))
        .toContainText(D['design.counts.provisional']);

      await page.getByTestId('detailing-disclosure').locator('> summary').click();
      const generate = page.getByTestId('cmd-generate-detailing');
      /**
       * Generate OR Regenerate, in this language.
       *
       * The command renames itself once a document exists, and `designAll` produces one on its
       * own — `detailingStore.autoGenerate` is on by default. Asserting only the first wording
       * would be asserting that the auto-detailing did not run.
       */
      expect([D['detailing.cmd.generate'], D['detailing.cmd.regenerate']])
        .toContain((await generate.innerText()).trim());
      await generate.click();
      await expect
        .poll(() => page.evaluate(() => (window.__stabileo as unknown as
          { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 120_000 })
        .toBeGreaterThan(0);

      // The floor-design command and its panel title.
      await page.getByTestId('floor-families-disclosure').locator('> summary').click();
      await expect(page.getByTestId('floor-design-run'))
        .toHaveText(D['detailing.floorRun.designAndDetail']);

      // ── D. The exports, named in this language ─────────────────
      await openDocumentsStage(page);
      await expect(page.getByTestId('doc-report')).toHaveText(D['detailing.doc.report']);
      await expect(page.getByTestId('doc-dxf')).toHaveText(D['detailing.doc.dxf']);
      await expect(page.getByTestId('doc-xlsx')).toHaveText(D['detailing.doc.xlsx']);

      // ── C. The 3-D viewer ──────────────────────────────────────
      const before = await page.evaluate(() => window.__stabileo.rebarSceneBuilds());
      await page.getByTestId('cmd-open-3d').click();
      await expect(page.getByTestId('rebar-workspace')).toBeVisible({ timeout: 120_000 });
      await expect
        .poll(() => page.evaluate(() => window.__stabileo.rebarSceneBuilds()), { timeout: 180_000 })
        .toBeGreaterThan(before);

      for (const [id, key] of VIEWER_SWITCHES) {
        // The switches are checkboxes; the text sits on the label around the input.
        await expect(page.getByTestId(id).locator('xpath=ancestor::label[1]'))
          .toContainText(D[key]);
      }
      for (const [id, key] of VIEWER_BUTTONS) {
        await expect(page.getByTestId(id)).toContainText(D[key]);
      }
      await expect(page.getByTestId('rebar-tally'))
        .toContainText(D['detailing.scene.tally.title']);
      // Family names in the tally — the enumerated ones a template literal builds.
      await expect(page.getByTestId('rebar-tally-column'))
        .toContainText(D['detailing.scene.kind.column']);
      await expect(page.getByTestId('rebar-tally-beam'))
        .toContainText(D['detailing.scene.kind.beam']);
      // And a STATE name, which is what used to read PROVISIONAL in English everywhere.
      await expect(page.getByTestId('rebar-status-panel'))
        .toContainText(D['detailing.scene.status.title']);

      await page.getByTestId('rebar-workspace-close').click();
      await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);

      // ── A. Project, Settings and Diagnostics ───────────────────
      await page.getByTestId('pr-project').click();
      await expect(page.getByTestId('pro-project-tab')).toBeVisible();
      await expect(page.getByTestId('pp-open')).toHaveText(D['project.open']);
      await expect(page.getByTestId('pp-save')).toHaveText(D['project.saveTab']);
      await expect(page.getByTestId('pp-autosave'))
        .toContainText(D['proProject.autosaveSection']);

      await page.evaluate(() => { window.__stabileoActions.openDesignTab(); });
      await page.getByTestId('code-settings-disclosure').locator('> summary').click();
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
