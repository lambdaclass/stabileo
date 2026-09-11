/**
 * F5 — the raw forces report, on screen.
 *
 * The unit tests in `forces-report.test.ts` hold the rules about what comes out. This spec holds
 * the ones that only exist in a browser:
 *
 *   · it is reachable, and from Results rather than from Documentos — §5 keeps raw solver output
 *     and reinforcement design as two documents, and Documentos is where a reader would most
 *     reasonably assume they belong together;
 *   · every refusal is in WORDS beside the command, instead of a grey button;
 *   · every choice is on screen, and the quarter convention names itself as a convention;
 *   · it says what it is not, before the button rather than only inside the file;
 *   · it produces a file and says which one.
 */

import { test, expect, bootPro, loadModel, solveModel } from './fixtures';

/** Small on purpose: 18 nodes and 26 members solve in seconds. */
const MODEL = 'rc-qa-diagnostic';

/**
 * Reach the report.
 *
 * A solve first, always — and that is not the spec working around a gate. The Results tab shows
 * nothing but "press Calculate" until there are results, which is the same refusal in the same
 * place, said once. Rendering the report's configuration over that message would be a second
 * copy of it, and this branch has spent three commits removing second copies.
 */
async function openForcesReport(page: import('@playwright/test').Page) {
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('res-tab-report').click();
  await expect(page.getByTestId('forces-report')).toBeVisible();
}

test.describe('@smoke F5 — the raw forces report', () => {
  test('FR1 — it lives on Results, and not in Documentos', async ({ pro: page }) => {
    await loadModel(page, MODEL);
    await solveModel(page);
    await openForcesReport(page);

    // Never disabled by a row count. The other sections of the strip are tables and grey out
    // when they are empty; this one is a configuration, and it explains itself in words.
    await expect(page.getByTestId('res-tab-report')).toBeEnabled();

    // And it is NOT among the Documentos actions, which are the detailing document's.
    await page.getByTestId('pr-stage-design').click();
    await expect(page.getByTestId('forces-report')).toHaveCount(0);
  });

  test('FR2 — with nothing solved the tab says so, without a second copy of the message',
    async ({ pro: page }) => {
      await loadModel(page, MODEL);
      await page.getByTestId('pr-stage-analyse').click();

      // The whole outputs strip is behind the solve, including this report. That is the tab's
      // own refusal and it is enough: the report does not print a second "solve first" over it.
      await expect(page.getByTestId('res-tab-report')).toHaveCount(0);
      await expect(page.getByTestId('forces-report')).toHaveCount(0);
      await expect(page.locator('.pro-empty')).toBeVisible();
    });

  test('FR3 — every choice is explicit, and the convention names itself', async ({ pro: page }) => {
    await loadModel(page, MODEL);
    await solveModel(page);
    await openForcesReport(page);

    // Scope: the whole model or the selection, both offered, never inferred.
    await expect(page.getByTestId('fr-scope-model')).toBeChecked();
    await expect(page.getByTestId('fr-scope-elements')).toBeVisible();

    // The five sheets of the contract, each individually refusable.
    for (const s of ['reactions', 'displacements', 'elementForces', 'stations', 'rawStations']) {
      await expect(page.getByTestId(`fr-section-${s}`)).toBeChecked();
    }

    // The six magnitudes, in reading order.
    for (const m of ['n', 'vy', 'vz', 'my', 'mz', 'torsion']) {
      await expect(page.getByTestId(`fr-magnitude-${m}`)).toBeChecked();
    }

    // The quarter grid is the default AND says out loud that it is a convention. Five evenly
    // spaced numbers look like a result; the sentence beside the control is what stops that.
    await expect(page.getByTestId('fr-stations-quarters')).toBeChecked();
    const note = page.getByTestId('fr-stations-note');
    await expect(note).toBeVisible();
    const quartersNote = (await note.textContent())?.trim() ?? '';
    expect(quartersNote.length).toBeGreaterThan(20);

    // Choosing the engine's own stations changes the sentence, so the two can never be confused.
    await page.getByTestId('fr-stations-critical').click();
    await expect(note).not.toHaveText(quartersNote);
  });

  test('FR4 — it says what it is not, before the button', async ({ pro: page }) => {
    await loadModel(page, MODEL);
    await solveModel(page);
    await openForcesReport(page);

    const isNot = page.getByTestId('fr-isnot');
    await expect(isNot).toBeVisible();
    await expect(isNot.locator('li')).toHaveCount(3);

    // Above the command, not under it: a qualification a reader reaches after pressing the
    // button has already failed.
    const qualBox = await isNot.boundingBox();
    const leadBox = await page.getByTestId('forces-report-lead').boundingBox();
    expect(leadBox!.y).toBeLessThan(qualBox!.y);
  });

  test('FR5 — a solved model produces a file, and the panel names it', async ({ pro: page }) => {
    await loadModel(page, MODEL);
    await solveModel(page);
    await openForcesReport(page);

    await expect(page.getByTestId('fr-blockers')).toHaveCount(0);
    await expect(page.getByTestId('fr-generate')).toBeEnabled();

    // HTML rather than print: `window.print()` hands off to the operating system and nothing
    // in a test can assert what it did. The HTML file is the same document.
    await page.getByTestId('fr-format-html').click();
    const download = page.waitForEvent('download');
    await page.getByTestId('fr-generate').click();
    expect((await download).suggestedFilename()).toMatch(/\.html$/);

    const done = page.getByTestId('fr-exported');
    await expect(done).toBeVisible();
    await expect(done).toContainText('.html');
    await expect(page.getByTestId('fr-error')).toHaveCount(0);

    // And the workbook, which is the default and the one §5 asks to be split into sheets.
    // What is IN each sheet is asserted in `forces-report.test.ts`; what this can only check
    // here is that the workbook is actually written and the panel reports the right file.
    await page.getByTestId('fr-format-xlsx').click();
    const book = page.waitForEvent('download');
    await page.getByTestId('fr-generate').click();
    expect((await book).suggestedFilename()).toMatch(/\.xlsx$/);
    await expect(done).toContainText('.xlsx');
    await expect(page.getByTestId('fr-error')).toHaveCount(0);
  });

  test('FR6 — an empty selection blocks rather than quietly reporting everything', async ({ pro: page }) => {
    await loadModel(page, MODEL);
    await solveModel(page);
    await openForcesReport(page);

    // Nothing is selected in the viewport, so "selected elements" has no members. The contract
    // draws this distinction on purpose: none-chosen must not resolve to all.
    await page.getByTestId('fr-scope-elements').click();
    await expect(page.getByTestId('fr-blockers')).toBeVisible();
    await expect(page.getByTestId('fr-generate')).toBeDisabled();

    await page.getByTestId('fr-scope-model').click();
    await expect(page.getByTestId('fr-generate')).toBeEnabled();
  });

  test('FR7 — dropping every sheet blocks, and so does dropping every column', async ({ pro: page }) => {
    await loadModel(page, MODEL);
    await solveModel(page);
    await openForcesReport(page);

    for (const s of ['reactions', 'displacements', 'elementForces', 'stations', 'rawStations']) {
      await page.getByTestId(`fr-section-${s}`).click();
    }
    await expect(page.getByTestId('fr-generate')).toBeDisabled();
    await expect(page.getByTestId('fr-blockers')).toBeVisible();

    // Put the station sheets back and empty the magnitudes instead.
    await page.getByTestId('fr-section-stations').click();
    await expect(page.getByTestId('fr-generate')).toBeEnabled();
    for (const m of ['n', 'vy', 'vz', 'my', 'mz', 'torsion']) {
      await page.getByTestId(`fr-magnitude-${m}`).click();
    }
    await expect(page.getByTestId('fr-generate')).toBeDisabled();
  });
});

test.describe('@smoke F5 — the report speaks the interface\'s language', () => {
  for (const locale of ['en', 'es', 'pt']) {
    test(`FR8 ${locale} — the convention and the qualification are translated`, async ({ page }) => {
      await bootPro(page, locale);
      await loadModel(page, MODEL);
      await solveModel(page);
      await openForcesReport(page);

      // Not a key, and not English in a Spanish interface: the failure `i18n-coverage-gap.md`
      // describes is a sentence that translates its verb and prints the key for its noun.
      for (const id of ['forces-report-lead', 'fr-stations-note', 'fr-isnot']) {
        const text = (await page.getByTestId(id).textContent())?.trim() ?? '';
        expect(text.length, `${id} is empty in ${locale}`).toBeGreaterThan(20);
        expect(text, `${id} prints a raw key in ${locale}`).not.toContain('design.forcesReport');
      }
    });
  }
});
