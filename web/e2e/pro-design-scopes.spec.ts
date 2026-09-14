/**
 * The three commands that start a design, and the section that was empty under its own heading.
 *
 * ── What was wrong ─────────────────────────────────────────────────
 *
 * **"Families to design" had a heading, a sentence, and then nothing useful.** Five bare
 * checkboxes. Ticking `footing` on a building with no footings looked exactly like ticking it on
 * one full of them; leaving `slab` unticked looked exactly like a slab family that had already
 * run. Everything the section is for — what the model holds, and where each family stands — only
 * appeared after pressing the button, which is what made it read as unfinished.
 *
 * **Three buttons start a design and nothing said how they differ.** `Design all` on the command
 * row does the frame. `Design the ticked families` does whatever is ticked. `Size and detail
 * floors` does slabs, walls and footings AND their detailing. A user who discovers that by
 * pressing them is running structural design to find out what a button does.
 *
 * ── What these tests hold to ───────────────────────────────────────
 *
 * That the section carries content BEFORE any run — the regression that would otherwise recur is
 * exactly "it looks fine once you press the button". Every state assertion also checks the word,
 * not the colour.
 */
import { test, expect, computeDemands, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * A model whose shells make the slab/wall split a real question.
 *
 * `rc-qa-diagnostic-shells` carries frame members AND quad panels, which is what D1 and D5 need:
 * four of the five families offered, and the two whose count is genuinely unknowable until the
 * floor pass classifies them. It holds no footings, and that absence is asserted rather than
 * worked around — see D1.
 */
const SHELLS = 'rc-qa-diagnostic-shells';

/**
 * The families the model holds, ready to be read.
 *
 * ── Why the tests load a model now, and what changed under them ────
 *
 * F2 made the selector offer only the families the model HAS (`availableDesignFamilies`). Before
 * it, `DESIGN_FAMILIES` was rendered unconditionally, so five rows existed on an empty project
 * and D1, D2 and D5 read them straight off the boot state.
 *
 * That was the fabricated-zero failure one level up: a `footing` box on a project with no
 * footings is the same defect as a "0 slabs" census, and offering it was what made ticking it
 * meaningless. So the rows are gone on an empty model — correctly — and D4 is what covers that
 * state now, by name.
 *
 * What these three tests are FOR is unchanged and is not about the boot screen: the section must
 * carry its census and its states before the DESIGN RUN, not before a model exists. So they load
 * one and assert the same properties, plus the one the new contract adds — a family the model
 * does not hold is not offered at all.
 *
 * Demands are computed because `census.column` and `census.beam` are read off
 * `verificationStore.contexts`, the same map the run splits the frame on. Without that pass the
 * counts are a true zero for the panel and would print "0 in the model", which is the sentence
 * D5 exists to keep off the screen.
 */
async function withShellModel(page: Page) {
  await loadModel(page, SHELLS);
  await solveModel(page);
  await computeDemands(page);
  await expect(page.getByTestId('design-family-rows')).toBeVisible();
}

test.describe('@smoke the families section says something before it is run', () => {
  test('D1 — every family has a row, a census and a state, with nothing run yet', async (
    { pro: page },
  ) => {
    await withShellModel(page);

    for (const f of ['column', 'beam', 'slab', 'wall']) {
      await expect(page.getByTestId(`design-family-row-${f}`), `${f} has a row`).toBeVisible();
      const census = page.getByTestId(`design-family-census-${f}`);
      const state = page.getByTestId(`design-family-state-${f}`);
      await expect(census, `${f} says what the model holds`).toBeVisible();
      expect((await state.innerText()).trim().length, `${f} states where it stands`)
        .toBeGreaterThan(0);
    }

    // The other half of the contract, and the one the old five-row version could not state: this
    // model has no footings, so there is no footing box to tick. An offered box on an absent
    // family is the same fabrication as a census that reports zero of something uncounted.
    await expect(page.getByTestId('design-family-row-footing')).toHaveCount(0);
  });

  test('D2 — the state is a word, not a colour', async ({ pro: page }) => {
    await withShellModel(page);
    // Ticked but not yet run, and unticked, are different words — the two the old checkboxes
    // could not tell apart. Read on `slab`, which this model HOLDS: the family the first version
    // of this test toggled was `footing`, and it is no longer offered here for the reason D1
    // asserts.
    //
    // The default scope is the frame, so `column` is ticked and `slab` is not. Both directions of
    // the toggle are exercised from whichever side the default puts them on, rather than assuming
    // one — that assumption is what tied the old version to a five-family default.
    await expect(page.getByTestId('design-family-state-column')).toContainText('not run');
    await expect(page.getByTestId('design-family-state-slab')).toContainText('skipped');
    await page.getByTestId('design-family-slab').check();
    await expect(page.getByTestId('design-family-state-slab')).toContainText('not run');
    await page.getByTestId('design-family-slab').uncheck();
    await expect(page.getByTestId('design-family-state-slab')).toContainText('skipped');
  });

  test('D3 — the three scopes are stated, each naming what it does not touch', async (
    { pro: page },
  ) => {
    const scopes = page.getByTestId('design-families-scopes');
    await expect(scopes).toBeVisible();
    // The frame command, and the fact that it is the frame only.
    await expect(scopes).toContainText('frame');
    await expect(scopes).toContainText('slabs, walls or foundations');
    // The floors command, and that it details as well as designs.
    await expect(scopes).toContainText('detailing');

    // And the standing limit on all of them.
    await expect(page.getByTestId('design-families-untouched'))
      .toContainText('Reinforcement only');
  });

  test('D4 — an empty model explains itself instead of leaving a blank area', async (
    { pro: page },
  ) => {
    const empty = page.getByTestId('design-families-empty');
    await expect(empty).toBeVisible();
    expect((await empty.innerText()).trim().length).toBeGreaterThan(40);
  });

  test('D5 — the slab/wall split is declared unknown rather than reported as zero', async (
    { pro: page },
  ) => {
    await withShellModel(page);
    // A shell becomes a slab or a wall when the floor pass classifies it. Before that runs, the
    // honest answer is "not counted yet" — a fabricated "0 slabs" is the failure this guards.
    await expect(page.getByTestId('design-family-census-slab')).toContainText('not counted yet');
    await expect(page.getByTestId('design-family-census-wall')).toContainText('not counted yet');
    // Columns and beams ARE countable from the same map the run splits on, and this asserts the
    // COUNT rather than the sentence: `{n} in the model` reads the same at zero, so matching the
    // words alone would pass on exactly the fabricated zero the two lines above forbid.
    const frame = page.getByTestId('design-family-census-column');
    await expect(frame).toContainText('in the model');
    expect(Number((await frame.innerText()).match(/\d+/)?.[0] ?? 0),
      'and the count it states is a real one').toBeGreaterThan(0);
  });
});

test.describe('@smoke the floors command states its own contract', () => {
  test('D6 — what it does, what it leaves alone, and what comes next', async ({ pro: page }) => {
    await page.getByTestId('floor-families-disclosure').locator('> summary').click();

    await expect(page.getByTestId('floor-run-contract')).toBeVisible();
    // It designs AND details in one pass — the fact that decides whether a second run is needed.
    await expect(page.getByTestId('floor-run-does')).toContainText('detailing');
    // It does not touch the frame.
    await expect(page.getByTestId('floor-run-not')).toContainText('Columns and beams');
    // And the coordinated detailing runs after it.
    await expect(page.getByTestId('floor-run-next')).toContainText('coordinated detailing');
  });

  test('D7 — the disabled command still says what it is waiting for', async ({ pro: page }) => {
    await page.getByTestId('floor-families-disclosure').locator('> summary').click();
    await expect(page.getByTestId('floor-design-run')).toBeDisabled();
    const why = page.getByTestId('floor-design-prereqs');
    await expect(why).toBeVisible();
    expect((await why.innerText()).trim().length, 'the reason is on the page').toBeGreaterThan(0);
  });
});

test.describe('the scopes and the family states speak the three languages', () => {
  for (const [locale, notRun, does] of [
    ['en', 'not run', 'What it does'],
    ['es', 'no ejecutado', 'Qué hace'],
    ['pt', 'não executado', 'O que faz'],
  ] as const) {
    test(`D8 ${locale} — states and the floors contract are localised`, async ({ pro: page }) => {
      // A model, for the reason `withShellModel` states: the family rows are the model's families
      // now, so there is no `column` state to translate on an empty project.
      await withShellModel(page);
      await page.getByTestId('lang-select').selectOption(locale);
      await expect(page.getByTestId('design-family-state-column')).toContainText(notRun);
      await page.getByTestId('floor-families-disclosure').locator('> summary').click();
      await expect(page.getByTestId('floor-run-contract')).toContainText(does);
    });
  }
});
