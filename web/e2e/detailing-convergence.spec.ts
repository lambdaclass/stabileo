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
 * `wholeModelDetailed` is the condition that refuses that claim, and `design-convergence.test.ts`
 * proves it in the engine. What these assert is the half the engine cannot: that the app SAYS SO
 * before the run, next to the button, rather than leaving the user to discover it in a document
 * that will not issue.
 *
 * ── And what they assert is NOT gated ──────────────────────────────
 *
 * The command stays enabled. Detailing a partly designed frame is how an engineer sees what the
 * refused members do to the rest of the cage, and taking the drawing away would remove the tool
 * used to converge the design. `h1e-refused-state` holds that line on a model with real refused
 * members; here it is held on the ordinary path.
 */

import { test, expect, designAll, loadModel } from './fixtures';
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
    // Nothing outstanding, so nothing is named. An empty gap list must render as absence rather
    // than as an empty element with a heading.
    await expect(page.getByTestId('detailing-convergence-gaps')).toHaveCount(0);
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
