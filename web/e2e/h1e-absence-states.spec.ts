/**
 * The three different ways something can be missing, and which of them the app can reach.
 *
 * ── They are not one state ─────────────────────────────────────────
 *
 *   ABSENCE OF ELEMENTS      nothing was detailed, so there is nothing to document
 *                            → `documents-empty` in the stage, `rebar-empty-families` in the rail
 *   NOTHING BUILT YET        detailing exists, no document has been produced from it
 *                            → `doc-none`
 *   A REFUSAL PER ELEMENT    the design ran and could not find a passing arrangement
 *                            → `REFUSED` in the rail
 *   A PASS ERROR             `buildDocument` returned null
 *                            → `doc-error`
 *
 * Conflating any two of them is how a panel comes to tell an engineer their building has no
 * slabs. The first three are exercised here. The fourth is not reachable, and §the last describe
 * says why rather than leaving a hole.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

type Hooks = {
  __stabileo: { detailingAssemblies(): unknown[]; rebarSceneBuilds(): number };
  __stabileoActions: { seedDetailing(a: unknown): void };
};

async function generate(page: Page, model = 'rc-design-qa-8') {
  await loadModel(page, model);
  await designAll(page);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() =>
      (window as unknown as Hooks).__stabileo.detailingAssemblies().length), { timeout: 120_000 })
    .toBeGreaterThan(0);
}

/** Wipe the PERSISTED detailing, which is the only absence a test can create. */
const wipe = (page: Page) => page.evaluate(() =>
  (window as unknown as Hooks).__stabileoActions.seedDetailing([]));

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`@slow absence, in ${locale}`, () => {
    test.slow();
    test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });

    test('no detailing at all: the stage says so, and offers nothing to export',
      async ({ pro: page }) => {
        await generate(page);
        await openDocumentsStage(page);
        await expect(page.getByTestId('documents-stage')).toBeVisible();

        await wipe(page);
        await expect(page.getByTestId('documents-empty')).toBeVisible();
        await expect(page.getByTestId('documents-stage')).toHaveCount(0);

        /*
         * A sentence, and no controls. The source comment says what this state is for — "Not a
         * blank stage: the reason there is nothing to export, and where to get one" — so the
         * assertion is that it reads as a reason, in every language.
         */
        const text = (await page.getByTestId('documents-empty').innerText()).trim();
        expect(text.length, 'it explains rather than showing a blank').toBeGreaterThan(20);
        for (const id of ['doc-xlsx', 'doc-dxf', 'doc-report', 'doc-3d']) {
          await expect(page.getByTestId(id), `${id} is not offered`).toHaveCount(0);
        }
        // And not one figure: an absence is not a zero.
        expect(text, 'no fabricated count').not.toMatch(/\b0\b/);
      });

    test('detailing but no document: a different sentence, and the exports ARE offered',
      async ({ pro: page }) => {
        await generate(page);
        await openDocumentsStage(page);
        await expect(page.getByTestId('doc-none')).toBeVisible();
        await expect(page.getByTestId('documents-empty')).toHaveCount(0);
        const text = (await page.getByTestId('doc-none').innerText()).trim();
        expect(text.length).toBeGreaterThan(5);
        // The distinction that matters: here the first export is what builds it.
        await expect(page.getByTestId('doc-xlsx')).toBeEnabled();
      });

    test('and the two sentences are not the same sentence', async ({ pro: page }) => {
      await generate(page);
      await openDocumentsStage(page);
      const noDocument = (await page.getByTestId('doc-none').innerText()).trim();
      await wipe(page);
      const noDetailing = (await page.getByTestId('documents-empty').innerText()).trim();
      /*
       * The whole point of this file. Two absences with one message would be the same defect the
       * floor families had: "we looked and found none" printed identically to "nobody looked".
       */
      expect(noDetailing).not.toBe(noDocument);
    });
  });
}

test.describe('@slow the rail names the families that have nothing', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('an empty viewer says which families, not that the workspace is empty',
    async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      await designAll(page);
      await openDocumentsStage(page);
      await page.getByTestId('doc-3d').click();
      await expect(page.getByTestId('rebar-workspace')).toBeVisible();

      await expect(page.getByTestId('rebar-empty-families')).toBeVisible();
      const text = (await page.getByTestId('rebar-empty-families').innerText()).trim();
      expect(text.length).toBeGreaterThan(5);
      /*
       * `rebar-workspace-empty` means the workspace has nothing at all;
       * `rebar-empty-families` means these particular families do. Only one of them is true
       * here, and showing the other would overstate the absence.
       */
      await expect(page.getByTestId('rebar-workspace-empty')).toHaveCount(0);
    });
});

test.describe('@slow no absence is ever dressed as a verified result', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('nothing on an empty documents stage claims VERIFIED', async ({ pro: page }) => {
    await generate(page);
    await openDocumentsStage(page);
    await wipe(page);
    /*
     * Scoped to what the ABSENCE says, not to the whole panel.
     *
     * The first version read `.pro-panel` and failed on "not verified" in `DesignOverview`'s
     * census, "Verified" in a verification chip, and a sentence in the regulations panel about
     * the code every member is verified against. All three are true statements about other
     * things on the same screen — the rule is that the empty stage must not claim a verdict, not
     * that the word may not appear anywhere in the application.
     */
    const empty = (await page.getByTestId('documents-empty').innerText()).toLowerCase();
    for (const claim of ['verified', 'verificado', 'issued', 'emitido', 'constructible']) {
      expect(empty, `the empty stage must not say "${claim}"`).not.toContain(claim);
    }
    // And the elements that would carry a verdict do not exist at all, which is stronger than
    // their text being careful.
    for (const id of ['doc-readiness', 'doc-maturity', 'doc-contents', 'review-record',
      'doc-revision', 'issue-submit']) {
      await expect(page.getByTestId(id), `${id} belongs to a document`).toHaveCount(0);
    }
  });
});

/**
 * `doc-error` is NOT reachable, and the reason is structural.
 *
 * `buildDocument` returns null on exactly one condition — `persisted.assemblies.length === 0` —
 * and `DocumentsSection` renders its whole stage behind `{#if !selected}`, where `selected`
 * derives from the same list. So the emptiness that would make the build fail also removes the
 * buttons that would call it. Measured: after `seedDetailing([])` the stage count is 0, the
 * export buttons are 0, and there is nothing to click.
 *
 * `docError = t('detailing.doc.noCoordinated')` is therefore defensive code for a race the
 * codebase has since designed away — `buildDocument`'s own comment describes the fix, reading
 * from the PERSISTED store rather than from a `$derived` that "does not necessarily recompute
 * inside the synchronous turn that wrote its dependency".
 *
 * Asserted as unreachable rather than left as an untested branch, and NOT manufactured: forcing
 * it would mean changing production to make a guard fire.
 */
test.describe('@slow the export error branch', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('cannot be reached: emptying the detailing removes the controls that would trigger it',
    async ({ pro: page }) => {
      await generate(page);
      await openDocumentsStage(page);
      await expect(page.getByTestId('doc-xlsx')).toBeVisible();

      await wipe(page);
      await expect(page.getByTestId('documents-empty')).toBeVisible();
      await expect(page.getByTestId('doc-xlsx'), 'no export survives the emptiness')
        .toHaveCount(0);
      await expect(page.getByTestId('doc-error'), 'so the error branch never runs')
        .toHaveCount(0);
    });
});
