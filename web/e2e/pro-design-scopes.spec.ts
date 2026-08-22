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
import { test, expect } from './fixtures';

test.describe('@smoke the families section says something before it is run', () => {
  test('D1 — every family has a row, a census and a state, with nothing run yet', async (
    { pro: page },
  ) => {
    await expect(page.getByTestId('design-family-rows')).toBeVisible();

    for (const f of ['column', 'beam', 'slab', 'wall', 'footing']) {
      await expect(page.getByTestId(`design-family-row-${f}`), `${f} has a row`).toBeVisible();
      const census = page.getByTestId(`design-family-census-${f}`);
      const state = page.getByTestId(`design-family-state-${f}`);
      await expect(census, `${f} says what the model holds`).toBeVisible();
      expect((await state.innerText()).trim().length, `${f} states where it stands`)
        .toBeGreaterThan(0);
    }
  });

  test('D2 — the state is a word, not a colour', async ({ pro: page }) => {
    // Ticked but not yet run, and unticked, are different words — the two the old checkboxes
    // could not tell apart.
    await expect(page.getByTestId('design-family-state-column')).toContainText('not run');
    await page.getByTestId('design-family-footing').uncheck();
    await expect(page.getByTestId('design-family-state-footing')).toContainText('skipped');
    await page.getByTestId('design-family-footing').check();
    await expect(page.getByTestId('design-family-state-footing')).toContainText('not run');
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
    // A shell becomes a slab or a wall when the floor pass classifies it. Before that runs, the
    // honest answer is "not counted yet" — a fabricated "0 slabs" is the failure this guards.
    await expect(page.getByTestId('design-family-census-slab')).toContainText('not counted yet');
    await expect(page.getByTestId('design-family-census-wall')).toContainText('not counted yet');
    // Columns and beams ARE countable from the same map the run splits on.
    await expect(page.getByTestId('design-family-census-column')).toContainText('in the model');
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
      await page.getByTestId('lang-select').selectOption(locale);
      await expect(page.getByTestId('design-family-state-column')).toContainText(notRun);
      await page.getByTestId('floor-families-disclosure').locator('> summary').click();
      await expect(page.getByTestId('floor-run-contract')).toContainText(does);
    });
  }
});
