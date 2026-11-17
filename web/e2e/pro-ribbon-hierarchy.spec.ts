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

import { test, expect, clickStage, designPlace } from './fixtures';
import type { Page } from '@playwright/test';

const openStage = async (page: Page, stage: string) =>
  clickStage(page, stage);

/** The `data-group` of the section a command is rendered inside. */
const groupOf = (page: Page, cmd: string) =>
  page.getByTestId(`pr-cmd-${cmd}`)
    .locator('xpath=ancestor::section[@data-group][1]')
    .getAttribute('data-group');

/** The groups of the open stage, left to right. */
const groupOrder = (page: Page) =>
  page.locator('.pr-groups section[data-group]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-group') ?? ''));

/*
 * Migrated with the «More tools» menu (design/43): the building constructor, the foundations,
 * the physical elements and the generators left Organize and Draw for one on-demand group,
 * `moreTools`, so a finite-element model is drawn with the general tools on screen. The same
 * placement rules are asserted against the new arrangement: which group each command is in, the
 * group order, the order inside the group, and that each command exists once.
 */
const openMoreTools = async (page: Page) => {
  if (!(await page.getByTestId('pr-more-list-moreTools').isVisible())) await page.getByTestId('pr-more-moreTools').click();
  await expect(page.getByTestId('pr-more-list-moreTools')).toBeVisible();
};

test.describe('@smoke Model — Organize, Draw, the tools on demand, and Code on its own', () => {
  test('the groups run Organize, Draw, More tools, Properties, Conditions, Automate', async ({ pro: page }) => {
    await openStage(page, 'model');
    expect(await groupOrder(page)).toEqual(['organize', 'draw', 'moreTools', 'properties', 'conditions', 'automate']);
    for (const c of ['view', 'grid', 'groups']) expect(await groupOf(page, c)).toBe('organize');
    const draw = await page.locator('section[data-group="draw"] button[data-testid^="pr-cmd-"]')
      .evaluateAll((n) => n.map((x) => x.getAttribute('data-testid')));
    expect(draw).toEqual(['pr-cmd-nodes', 'pr-cmd-elements', 'pr-cmd-shells', 'pr-cmd-transform', 'pr-cmd-edit']);
    expect(await groupOf(page, 'code')).toBe('automate');
    // The design-oriented tools are not on the ribbon until asked for.
    for (const c of ['building', 'foundations', 'physical', 'generators']) await expect(page.getByTestId(`pr-cmd-${c}`), c).toHaveCount(0);
    await openMoreTools(page);
    for (const c of ['building', 'foundations', 'physical', 'generators']) expect(await groupOf(page, c), c).toBe('moreTools');
    const more = await page.locator('[data-testid="pr-more-list-moreTools"] button[data-testid^="pr-cmd-"]')
      .evaluateAll((n) => n.map((x) => x.getAttribute('data-testid')));
    // Generators close the group.
    expect(more).toEqual(['pr-cmd-building', 'pr-cmd-foundations', 'pr-cmd-physical', 'pr-cmd-generators']);
  });

  test('opens the generators panel, and exists exactly once', async ({ pro: page }) => {
    await openStage(page, 'model');
    await openMoreTools(page);
    await expect(page.getByTestId('pr-cmd-generators')).toHaveCount(1);
    await page.getByTestId('pr-cmd-generators').click();
    await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
    // The menu closes on the pick, and its button reads as on while one of its panels shows.
    await expect(page.getByTestId('pr-more-list-moreTools')).toBeHidden();
    await expect(page.getByTestId('pr-more-moreTools')).toHaveClass(/active/);
  });

  test('explains what it generates, as text and not only as a tooltip', async ({ pro: page }) => {
    await openStage(page, 'model');
    await openMoreTools(page);
    const btn = page.getByTestId('pr-cmd-generators');
    expect(await btn.getAttribute('aria-describedby'), 'points at a description').toBeTruthy();
    const why = page.getByTestId('pr-cmd-why-generators');
    // Named one by one: a description reading "generates geometry" would be true and useless.
    await expect(why).toContainText(/truss/i);
    await expect(why).toContainText(/latticed column/i);
    await expect(why).toContainText(/industrial buildings/i);
    // The tooltip carries the same sentence, so the two cannot drift apart.
    expect(await btn.getAttribute('title')).toContain('trusses');
  });
});

/*
 * ── Design: the ribbon draws no groups; the desk's rail holds the places ──
 *
 * Interface A: the Design stage is one workspace, and its top row is the desk's four steps
 * (`DeskProcessBar`), not seven commands. The placement claims these blocks made of the ribbon's
 * Design groups are claims about the rail now: concrete and steel are two sub-sections of sizing,
 * concrete first, each place once, and the 3-D view says what it waits on.
 */
const railSection = (page: Page, testid: string) =>
  page.getByTestId(testid).evaluate((el) => {
    let n: Element | null = el.previousElementSibling;
    while (n && !n.classList.contains('dr-sec')) n = n.previousElementSibling;
    return (n?.textContent ?? '').trim();
  });

test.describe('@smoke Design — Concrete and Steel are two sub-sections of sizing', () => {
  test('the stage draws no ribbon groups: its row is the steps of design', async ({ pro: page }) => {
    await openStage(page, 'design');
    await expect(page.locator('.pr-groups')).toHaveCount(0);
    await expect(page.getByTestId('desk-process')).toBeVisible();
  });

  test('each place is under the material it belongs to', async ({ pro: page }) => {
    await designPlace(page, 'plan');
    expect(await railSection(page, 'desk-rail-list'), 'the member list is concrete').toMatch(/concrete/i);
    expect(await railSection(page, 'desk-tab-plan'), 'the plan is concrete').toMatch(/concrete/i);
    expect(await railSection(page, 'desk-rail-steel'), 'profile design is steel').toMatch(/steel/i);
    expect(await railSection(page, 'desk-rail-connections'), 'joints are steel').toMatch(/steel/i);
  });

  test('concrete comes first, and each place appears once', async ({ pro: page }) => {
    await designPlace(page, 'plan');
    const ids = await page.getByTestId('desk-rail').locator('[data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(ids.indexOf('desk-rail-list')).toBeLessThan(ids.indexOf('desk-rail-steel'));
    for (const id of ['desk-tab-plan', 'desk-rail-list', 'desk-rail-steel', 'desk-rail-connections', 'desk-rail-codes']) {
      await expect(page.getByTestId(id), id).toHaveCount(1);
    }
  });

  test('the steel places open the panels they always opened', async ({ pro: page }) => {
    await designPlace(page, 'steel');
    await expect(page.getByTestId('pro-steel-panel')).toBeVisible();
    await designPlace(page, 'connections');
    await expect(page.getByTestId('conn-experimental-banner')).toBeVisible();
  });
});

test.describe('@smoke Design — the 3-D reinforcement is gated, and says what is missing', () => {
  test('is disabled on a fresh model', async ({ pro: page }) => {
    await designPlace(page, 'detailing');
    await expect(page.getByTestId('desk-rail-3d')).toBeDisabled();
  });

  test('names the steps, in text a screen reader reaches', async ({ pro: page }) => {
    await designPlace(page, 'detailing');
    const btn = page.getByTestId('desk-rail-3d');
    expect(await btn.getAttribute('aria-describedby')).toBeTruthy();
    const why = page.getByTestId('desk-rail-3d-why');
    await expect(why).toContainText(/missing/i);
    await expect(why).toContainText(/solve the model/i);
    await expect(why).toContainText(/design the reinforcement/i);
    await expect(why).toContainText(/generate the detailing/i);
  });

  test('the tooltip carries the same reason, so neither can go stale', async ({ pro: page }) => {
    await designPlace(page, 'detailing');
    const title = await page.getByTestId('desk-rail-3d').getAttribute('title');
    expect(title).toMatch(/missing/i);
    expect(title).toMatch(/generate the detailing/i);
  });

  test('refuses rather than running the design by itself', async ({ pro: page }) => {
    await designPlace(page, 'detailing');
    await expect(page.getByTestId('desk-rail-3d')).toBeDisabled();
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
  ['es', { generators: /^dibujar$/i, more: /^m.s herramientas$/i, button: /^generadores$/i, concrete: /hormig/i, steel: /^acero$/i, list: /^lista$/i, detail: /^armaduras 3d$/i, profiles: /^perfiles$/i, joints: /^uniones met.licas$/i }],
  ['pt', { generators: /^desenhar$/i, more: /^mais ferramentas$/i, button: /^geradores$/i, concrete: /concreto/i, steel: /^a.o$/i, list: /^lista$/i, detail: /^armaduras 3d$/i, profiles: /^perfis$/i, joints: /^liga..es met.licas$/i }],
] as const) {
  test.describe(`the hierarchy keeps its names in ${locale}`, () => {
    test.use({ appLocale: locale });

    test('Model → Draw, and Generators under More tools', async ({ pro: page }) => {
      await openStage(page, 'model');
      await expect(page.locator('section[data-group="draw"] .pr-group-label')).toHaveText(words.generators);
      await expect(page.locator('section[data-group="moreTools"] .pr-group-label')).toHaveText(words.more);
      await openMoreTools(page);
      await expect(page.getByTestId('pr-cmd-generators').locator('.pr-cmd-label')).toHaveText(words.button);
    });

    test('Design → Concrete and Steel in the rail, with their places', async ({ pro: page }) => {
      await designPlace(page, 'plan');
      expect(await railSection(page, 'desk-rail-list')).toMatch(words.concrete);
      expect(await railSection(page, 'desk-rail-steel')).toMatch(words.steel);
      await expect(page.getByTestId('desk-rail-list')).toHaveText(words.list);
      await expect(page.getByTestId('desk-rail-steel')).toHaveText(words.profiles);
      await expect(page.getByTestId('desk-rail-connections')).toHaveText(words.joints);
      await page.getByTestId('desk-step-detail').click();
      await expect(page.getByTestId('desk-rail-3d')).toHaveText(words.detail);
    });
  });
}
