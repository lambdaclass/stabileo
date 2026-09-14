/**
 * What the Generate command says it will produce, in the browser.
 *
 * ── The state this guards against ──────────────────────────────────
 *
 * `runDetailing` draws `readiness.detailable` and nothing else, and every constructibility
 * condition but one is counted over what was drawn. A frame with four verified columns out of
 * twelve therefore produced a cage that was complete, clash-free and fully certified — of four
 * columns — and it satisfied the gate, opened the review and could be issued for construction.
 *
 * `selectedScopeDetailed` is the condition that refuses that claim, and `design-convergence.test.ts`
 * proves it in the engine. What these assert is the half the engine cannot: that the app SAYS SO
 * before the run, next to the button, rather than leaving the user to discover it in a document
 * that will not issue.
 *
 * ── And that the claim names its scope ─────────────────────────────
 *
 * Convergence is measured over the families the user SELECTED, so "converged" alone is a
 * sentence about a scope the reader cannot see. The strip must say which families it covers, and
 * name the ones the model has that it does not — that qualifier is the whole reason a scoped
 * denominator is safe.
 *
 * ── And what they assert is NOT gated ──────────────────────────────
 *
 * The command stays enabled. Detailing a partly designed frame is how an engineer sees what the
 * refused members do to the rest of the cage, and taking the drawing away would remove the tool
 * used to converge the design. `h1e-refused-state` holds that line on a model with real refused
 * members; here it is held on the ordinary path.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

const notice = (page: Page) => page.getByTestId('detailing-convergence');

/** Open DETALLE. Direct child only: the stage contains nested disclosures of its own. */
async function openDetailing(page: Page) {
  const d = page.getByTestId('detailing-disclosure');
  await expect(d).toBeVisible();
  if (await d.getAttribute('open') === null) await d.locator('> summary').click();
}

test.describe('@smoke the strip states what the next run will produce', () => {
  test('DC-A nothing designed: the prerequisites speak and the claim does not', async (
    { pro: page },
  ) => {
    await openDetailing(page);
    /*
     * Two sentences about the same absence would be one too many, and the second would have to
     * invent a figure: "0 of 0 members detailed" is the fabricated zero this branch removes
     * everywhere else. The prerequisites already say why the command cannot run.
     */
    await expect(page.getByTestId('cmd-generate-detailing')).toBeDisabled();
    await expect(page.getByTestId('detailing-prerequisites')).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
  });

  test('DC-B a design that converged is named construction documentation', async (
    { pro: page },
  ) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openDetailing(page);

    await expect(page.getByTestId('cmd-generate-detailing')).toBeEnabled();
    const n = notice(page);
    await expect(n).toBeVisible();
    // The state is a word AND an attribute. The attribute is what the styling keys on; the word
    // is what a reader who cannot see the rule relies on, and neither may stand alone.
    await expect(n).toHaveAttribute('data-state', 'converged');
    await expect(n).toContainText('Construction documentation');
    // And it names the families it converged FOR. `rc-design-qa-8` is a bare frame and the
    // default scope is the frame pair, so the claim covers the whole model here — which is
    // exactly why the sentence still has to say which families that was.
    await expect(n).toContainText('columns');
    await expect(n).toContainText('beams');
    // Nothing outstanding, so nothing is named. An empty gap list must render as absence rather
    // than as an empty element with a heading.
    await expect(page.getByTestId('detailing-convergence-gaps')).toHaveCount(0);
    // Nor an out-of-scope line: this model has no family the scope leaves out, and printing an
    // empty exclusion would read as a redaction.
    await expect(page.getByTestId('detailing-convergence-out-of-scope')).toHaveCount(0);
  });

  test('DC-E dropping a family narrows the claim instead of breaking it', async (
    { pro: page },
  ) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openDetailing(page);
    await expect(notice(page)).toHaveAttribute('data-state', 'converged');

    /*
     * The scope rule, driven through the control the user actually has.
     *
     * Unticking `beam` is not a failure and must not read as one: the run now claims columns,
     * the claim is still CONVERGED, and the beams move from the denominator into the
     * out-of-scope line. A global denominator would have reported this as INCOMPLETE — a
     * complete piece of work declared unfinished for something nobody asked for.
     */
    await page.getByTestId('design-family-beam').uncheck();

    const n = notice(page);
    await expect(n).toHaveAttribute('data-state', 'converged');
    await expect(n).toContainText('columns');
    const out = page.getByTestId('detailing-convergence-out-of-scope');
    await expect(out).toBeVisible();
    await expect(out).toContainText('beams');

    // And putting it back re-opens the denominator rather than leaving a narrowed claim behind.
    await page.getByTestId('design-family-beam').check();
    await expect(page.getByTestId('detailing-convergence-out-of-scope')).toHaveCount(0);
    await expect(notice(page)).toContainText('beams');
  });

  test('DC-F selecting nothing is not a vacuous success', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openDetailing(page);

    await page.getByTestId('design-family-none').click();
    const n = notice(page);
    await expect(n).toHaveAttribute('data-state', 'empty_scope');
    // "Converged over no families" would read as success and mean nothing was done. The command
    // itself stays available — there is still a drawing to make — and only the claim is refused.
    await expect(n).not.toContainText('Construction documentation');
    await expect(page.getByTestId('cmd-generate-detailing')).toBeEnabled();
  });

  test('DC-C the claim counts the members, so it is auditable', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openDetailing(page);

    /*
     * The sentence carries the population it is a claim about. "All members detailed" over an
     * unstated number is the shape of claim this whole condition exists to refuse — it reads
     * identically whether the frame has forty members or four.
     */
    const text = (await notice(page).innerText()).trim();
    expect(Number(text.match(/\d+/)?.[0] ?? 0), 'the claim names a real count')
      .toBeGreaterThan(0);
  });

  test('DC-D the claim survives a locale change, and stays the same claim', async (
    { pro: page },
  ) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openDetailing(page);
    await expect(notice(page)).toHaveAttribute('data-state', 'converged');

    for (const locale of ['es', 'pt'] as const) {
      await page.getByTestId('lang-select').selectOption(locale);
      const n = notice(page);
      await expect(n, `${locale} renders the notice`).toBeVisible();
      // The STATE is an engineering identifier and does not translate; the sentence does. A
      // locale that changed the attribute would be styling a different claim.
      await expect(n, `${locale} keeps the state`).toHaveAttribute('data-state', 'converged');
      expect((await n.innerText()).trim().length, `${locale} says something`).toBeGreaterThan(10);
      await expect(n, `${locale} is not the English string`)
        .not.toContainText('Construction documentation');
    }
  });
});

test.describe('the claim holds its layout and its three languages', () => {
  /**
   * The four widths §8 audits, on the one element this block adds to a sticky strip.
   *
   * The strip is `position: sticky`, so anything inside it that overflows sideways takes the
   * whole workflow's navigation with it — and this notice is a full sentence naming families and
   * element ids, which is the longest string on that surface. `h1b-panel-navigation` measures the
   * strip's own row at the same four; this measures the paragraph the row now carries.
   */
  for (const w of [1280, 1024, 900, 820]) {
    test(`DC-W${w} nothing overflows at ${w} px`, async ({ pro: page }) => {
      await page.setViewportSize({ width: w, height: 720 });
      await loadModel(page, 'rc-design-qa-8');
      await designAll(page);
      await openDetailing(page);

      const n = notice(page);
      await expect(n).toBeVisible();
      const over = await n.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over, `no sideways scroll at ${w}`).toBeLessThanOrEqual(1);
      // And it is inside the strip, not spilling out of it — a wrapped sentence is fine, a
      // sentence wider than its container is what breaks a sticky element.
      const fits = await n.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.left >= -1 && box.right <= window.innerWidth + 1;
      });
      expect(fits, `stays within the viewport at ${w}`).toBe(true);
    });
  }

  for (const [locale, word] of [
    ['en', 'columns'], ['es', 'columnas'], ['pt', 'colunas'],
  ] as const) {
    test(`DC-L ${locale} — the families are named in the reader's language`, async (
      { pro: page },
    ) => {
      await loadModel(page, 'rc-design-qa-8');
      await designAll(page);
      await openDetailing(page);
      await page.getByTestId('lang-select').selectOption(locale);

      const n = notice(page);
      await expect(n).toBeVisible();
      // The FAMILY names, not only the claim: a sentence that translates its verb and prints
      // `column` for the noun is the half-translated state `i18n-coverage-gap.md` is about.
      await expect(n, `${locale} names the family`).toContainText(word);
      // The state is an engineering identifier and does not translate. A locale that changed it
      // would be styling a different claim.
      await expect(n).toHaveAttribute('data-state', 'converged');
    });
  }
});

test.describe('@smoke the document states its scope on screen too', () => {
  test('DC-S the Documents stage names the families the set covers', async ({ pro: page }) => {
    /*
     * The on-screen half of the same sentence the exports carry.
     *
     * `document-render.test.ts` asserts the stamp reaches the report, the schedule and the DXF.
     * This asserts it is beside the BUTTONS that produce them: a reader who checks the scope
     * only by opening the file has already sent it to somebody.
     */
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openDetailing(page);
    await page.getByTestId('cmd-generate-detailing').click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as {
        __stabileo: { detailingAssemblies(): unknown[] };
      }).__stabileo.detailingAssemblies().length), { timeout: 120_000 })
      .toBeGreaterThan(0);

    await openDocumentsStage(page);
    await page.getByTestId('doc-report').click();

    const scope = page.getByTestId('doc-scope');
    await expect(scope).toBeVisible();
    await expect(scope).toContainText('columns');
    await expect(scope).toContainText('beams');
    // A bare frame leaves nothing out, and an empty exclusion line would read as a redaction.
    await expect(page.getByTestId('doc-scope-out')).toHaveCount(0);
  });
});
