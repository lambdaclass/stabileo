/**
 * The shape of the top panel: which sub-section a command lives in, and what it is called.
 *
 * ── What these assert that a screenshot would not ──────────────────
 *
 * Every failure this file is written for is a NAMING or PLACEMENT failure, and both are
 * invisible to a test that only checks a button exists:
 *
 *   · "Generators" sat inside Draw, beside Nodes and Elements, so a control that replaces the
 *     whole model read as one more drawing tool.
 *   · The metallic commands sat inside the CONCRETE sub-section, so the ribbon said the steel
 *     surface was part of the concrete workflow.
 *   · The button that opens the generators was called "Generators" — the same word as the
 *     section above it, and still no answer to "what comes out of this".
 *
 * So the assertions are on the group a command belongs to, on the ORDER of the groups, and on
 * the words. Not on whether a click works.
 *
 * The fixture boots in English, so the wording assertions live in their own blocks with an
 * explicit `appLocale`. That is deliberate: a name is only correct in a language.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const openStage = async (page: Page, stage: string) =>
  page.getByTestId(`pr-stage-${stage}`).click();

/** The `data-group` of the section a command is rendered inside. */
const groupOf = (page: Page, cmd: string) =>
  page.getByTestId(`pr-cmd-${cmd}`)
    .locator('xpath=ancestor::section[@data-group][1]')
    .getAttribute('data-group');

/** The groups of the open stage, left to right. */
const groupOrder = (page: Page) =>
  page.locator('.pr-groups section[data-group]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-group') ?? ''));

test.describe('@smoke Model — Generators is its own sub-section', () => {
  test('sits in a group of its own, to the right of Properties', async ({ pro: page }) => {
    await openStage(page, 'model');
    expect(await groupOf(page, 'generators')).toBe('generators');
    const order = await groupOrder(page);
    expect(order).toContain('properties');
    expect(order.indexOf('generators')).toBeGreaterThan(order.indexOf('properties'));
    // And it is NOT back in Draw, which is where it started.
    expect(await groupOf(page, 'nodes')).toBe('geometry');
  });

  test('opens the generators panel, and exists exactly once', async ({ pro: page }) => {
    await openStage(page, 'model');
    await expect(page.getByTestId('pr-cmd-generators')).toHaveCount(1);
    await page.getByTestId('pr-cmd-generators').click();
    await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
  });

  test('explains what it generates, as text and not only as a tooltip', async ({ pro: page }) => {
    await openStage(page, 'model');
    const btn = page.getByTestId('pr-cmd-generators');
    expect(await btn.getAttribute('aria-describedby'), 'points at a description').toBeTruthy();
    const why = page.getByTestId('pr-cmd-why-generators');
    // Named one by one: a description reading "generates geometry" would be true and useless.
    await expect(why).toContainText(/truss/i);
    await expect(why).toContainText(/latticed column/i);
    await expect(why).toContainText(/shed/i);
    // The tooltip carries the same sentence, so the two cannot drift apart.
    expect(await btn.getAttribute('title')).toContain('trusses');
  });
});

test.describe('@smoke Design — Concrete and Metallic are two sub-sections', () => {
  test('each command is in the group its material belongs to', async ({ pro: page }) => {
    await openStage(page, 'design');
    expect(await groupOf(page, 'design'), 'reinforcement design is concrete').toBe('rc');
    expect(await groupOf(page, 'rebar3d'), '3-D detailing is concrete').toBe('rc');
    expect(await groupOf(page, 'steel'), 'profile design is metallic').toBe('steel');
    expect(await groupOf(page, 'connections'), 'joints are metallic').toBe('steel');
  });

  test('concrete comes first, and neither group holds the other material', async ({ pro: page }) => {
    await openStage(page, 'design');
    const order = await groupOrder(page);
    expect(order.indexOf('rc')).toBeLessThan(order.indexOf('steel'));
    const rcCmds = await page.locator('section[data-group="rc"] .pr-cmd').count();
    const steelCmds = await page.locator('section[data-group="steel"] .pr-cmd').count();
    expect(rcCmds, 'reinforcement design + 3-D detailing').toBe(2);
    expect(steelCmds, 'profile design + metallic joints').toBe(2);
  });

  test('each command appears once — the rename replaced a button, it did not add one',
    async ({ pro: page }) => {
      await openStage(page, 'design');
      for (const id of ['design', 'rebar3d', 'steel', 'connections']) {
        await expect(page.getByTestId(`pr-cmd-${id}`), id).toHaveCount(1);
      }
    });

  test('the metallic commands still open the panels they always opened', async ({ pro: page }) => {
    await openStage(page, 'design');
    await page.getByTestId('pr-cmd-steel').click();
    await expect(page.getByTestId('pro-steel-panel')).toBeVisible();
    await openStage(page, 'design');
    await page.getByTestId('pr-cmd-connections').click();
    // The panel heading follows the command that opens it: one place, one name.
    await expect(page.getByTestId('pro-panel-title')).toHaveText(/metallic joints/i);
  });
});

test.describe('@smoke Design — 3-D detailing is gated, and says what is missing', () => {
  test('is disabled on a fresh model', async ({ pro: page }) => {
    await openStage(page, 'design');
    await expect(page.getByTestId('pr-cmd-rebar3d')).toBeDisabled();
  });

  test('names the steps, in text a screen reader reaches', async ({ pro: page }) => {
    await openStage(page, 'design');
    const btn = page.getByTestId('pr-cmd-rebar3d');
    expect(await btn.getAttribute('aria-describedby')).toBeTruthy();
    const why = page.getByTestId('pr-cmd-why-rebar3d');
    // Three concrete steps, not "solve first". This is the assertion the old
    // `ribbon.needsSolve` tooltip could not satisfy on a solved, undetailed model.
    await expect(why).toContainText(/missing/i);
    await expect(why).toContainText(/solve the model/i);
    await expect(why).toContainText(/design the reinforcement/i);
    await expect(why).toContainText(/generate the detailing/i);
  });

  test('the tooltip carries the same reason, so neither can go stale', async ({ pro: page }) => {
    await openStage(page, 'design');
    const title = await page.getByTestId('pr-cmd-rebar3d').getAttribute('title');
    expect(title).toMatch(/missing/i);
    expect(title).toMatch(/generate the detailing/i);
  });

  test('refuses rather than running the design by itself', async ({ pro: page }) => {
    await openStage(page, 'design');
    // A disabled command that quietly ran the workflow would be worse than one that refuses:
    // the user asked to LOOK at the reinforcement, not to design it.
    await expect(page.getByTestId('pr-cmd-rebar3d')).toBeDisabled();
    await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
  });
});

/**
 * The names, in the languages the picker offers.
 *
 * English is covered by the blocks above, which run on the fixture's default. These two pin
 * that the hierarchy is not an English-only arrangement: a section that loses its name in
 * Portuguese is a section a Portuguese user cannot navigate.
 */
for (const [locale, words] of [
  ['es', { generators: /generadores/i, button: /estructuras met/i, concrete: /hormig/i, metallic: /^met.licas$/i, rebar: /dise.o de armaduras/i, detail: /detallado 3d/i, profiles: /dise.o de perfiles/i, joints: /uniones met.licas/i }],
  ['pt', { generators: /geradores/i, button: /estruturas met/i, concrete: /concreto/i, metallic: /^met.licas$/i, rebar: /dimensionamento de armaduras/i, detail: /detalhamento 3d/i, profiles: /dimensionamento de perfis/i, joints: /liga..es met.licas/i }],
] as const) {
  test.describe(`the hierarchy keeps its names in ${locale}`, () => {
    test.use({ appLocale: locale });

    test('Model → Generators, and the button that is not called Generators', async ({ pro: page }) => {
      await openStage(page, 'model');
      await expect(page.locator('section[data-group="generators"] .pr-group-label'))
        .toHaveText(words.generators);
      const label = page.getByTestId('pr-cmd-generators').locator('.pr-cmd-label');
      await expect(label).toHaveText(words.button);
      // The section already says "Generators". The button must not say it a second time.
      await expect(label).not.toHaveText(words.generators);
    });

    test('Design → Concrete and Metallic, with their four commands', async ({ pro: page }) => {
      await openStage(page, 'design');
      await expect(page.locator('section[data-group="rc"] .pr-group-label')).toHaveText(words.concrete);
      await expect(page.locator('section[data-group="steel"] .pr-group-label')).toHaveText(words.metallic);
      await expect(page.getByTestId('pr-cmd-design').locator('.pr-cmd-label')).toHaveText(words.rebar);
      await expect(page.getByTestId('pr-cmd-rebar3d').locator('.pr-cmd-label')).toHaveText(words.detail);
      await expect(page.getByTestId('pr-cmd-steel').locator('.pr-cmd-label')).toHaveText(words.profiles);
      await expect(page.getByTestId('pr-cmd-connections').locator('.pr-cmd-label')).toHaveText(words.joints);
    });
  });
}
