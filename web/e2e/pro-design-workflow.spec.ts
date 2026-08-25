/**
 * The concrete workflow, as a person reads it.
 *
 * `pro-design-gates.spec.ts` asserts that a disabled command says why. This file asserts the
 * layer above that: that the panel says WHERE YOU ARE, in what ORDER the steps go, which step is
 * next, and that two buttons with different scopes no longer share a label. Those were the
 * complaints that kept PR20 in draft, and none of them is visible to a test that only checks
 * whether a control works.
 *
 * Everything here is read off the screen. Nothing asserts a class name or a colour: the rule the
 * plan document sets — anything the interface says with colour it must also say in words — is
 * exactly what would be untestable if these assertions were about styling.
 */

import { test, expect, designAll, loadModel } from './fixtures';
import en from '../src/lib/i18n/locales/en';
import es from '../src/lib/i18n/locales/es';
import pt from '../src/lib/i18n/locales/pt';
import type { Page } from '@playwright/test';

const DICTS: Record<string, Record<string, string>> = {
  en: en as unknown as Record<string, string>,
  es: es as unknown as Record<string, string>,
  pt: pt as unknown as Record<string, string>,
};

/**
 * FIVE stages now, and the concrete flow's own strip.
 *
 * `demands` and `check` are gone as stages: demands are the solver's output and belong to
 * MODELADO, and the code check is what FINISHES Diseñar rather than a step before it. A
 * completed *Verificación* drawn ahead of DISEÑAR said the reinforcement had been verified
 * before it existed. See `lib/flow/rc-stages.ts`.
 */
const STAGES = ['model', 'codes', 'design', 'detailing', 'documents'] as const;

/** The state a stage advertises, as the strip records it. */
function stageState(page: Page, id: string) {
  return page.getByTestId(`rc-stage-${id}`).getAttribute('data-state');
}

test.describe('@smoke the workflow says where you are', () => {
  test('an empty project shows every stage, in order, with the first one current',
    async ({ pro: page }) => {
      const strip = page.getByTestId('rc-stage-timeline');
      await expect(strip).toBeVisible();

      // Order is the claim: a strip that renders the six stages in a different order every time
      // would still pass a per-stage assertion.
      const ids = await strip.locator('[data-testid^="rc-stage-"]').evaluateAll(
        (els) => els.filter((e) => e.tagName === 'LI')
          .map((e) => e.getAttribute('data-testid')));
      expect(ids).toEqual(STAGES.map((s) => `rc-stage-${s}`));

      // Nothing is done, and the first step is where you are.
      // `complete` and not `done`: the strip says what the USER did, never that a calculation
      // is certified. The word changed with the vocabulary.
      for (const s of STAGES) expect(await stageState(page, s)).not.toBe('complete');
      expect(await stageState(page, 'model')).toBe('current');
      // Nothing can start without a model, so this is unreachable rather than merely not-yet.
      expect(await stageState(page, 'detailing')).toBe('blocked');

      // And the panel states the next thing to do, in words, not only as a grey button.
      await expect(page.getByTestId('rc-stage-next')).toHaveText(en['design.stage.needModel']);
    });

  test('the stages advance as the work is done, and the hint follows', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    // A model but no results: the instruction changes to the thing that is now missing.
    await expect(page.getByTestId('rc-stage-next')).toHaveText(en['design.stage.needSolve']);

    await designAll(page);
    for (const s of ['model', 'codes', 'design'] as const) {
      expect(await stageState(page, s), `${s} is complete after a design run`).toBe('complete');
    }
    // Detailing is now reachable rather than unreachable.
    expect(await stageState(page, 'detailing')).not.toBe('blocked');
  });

  test('a stage opens the section that owns it, and does not run anything',
    async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      const solvesBefore = await page.evaluate(() => window.__stabileo.solveCount());

      await page.getByTestId('rc-stage-detailing').locator('button').click();
      await expect(page.getByTestId('detailing-disclosure')).toHaveAttribute('open', '');

      // Navigation only. A strip that also ran commands would be a second command surface, and
      // the two would be able to disagree about what is allowed.
      expect(await page.evaluate(() => window.__stabileo.solveCount())).toBe(solvesBefore);
      expect(await page.evaluate(() => window.__stabileo.runCounts())).toBeNull();
    });
});

test.describe('@smoke commands are grouped, and none of them is ambiguous', () => {
  test('the command row is three named groups in pipeline order', async ({ pro: page }) => {
    for (const [id, key] of [
      ['cmd-group-verify', 'design.group.verify'],
      ['cmd-group-design', 'design.group.design'],
      ['cmd-group-detailing', 'design.group.detailing'],
    ] as const) {
      await expect(page.getByTestId(id)).toContainText(en[key]);
    }
    // The regulation is a read-out and sits outside the groups — it is not a fourth command.
    const groups = page.locator('[data-testid^="cmd-group-"]');
    await expect(groups).toHaveCount(3);
    await expect(groups.filter({ has: page.getByTestId('active-concrete-code') })).toHaveCount(0);
  });

  test('the two Design buttons no longer share a label', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    const frame = (await page.getByTestId('cmd-design-all').innerText()).trim();
    const families = (await page.getByTestId('cmd-design-families').innerText()).trim();
    expect(frame).toBe(en['design.cmd.designAll']);
    expect(families).toBe(en['design.families.runScoped']);
    expect(families, 'two commands with different scopes must not read the same')
      .not.toBe(frame);

    // And each says what it covers, where it is.
    expect(await page.getByTestId('cmd-design-all').getAttribute('title'))
      .toBe(en['design.cmd.designAllScope']);
    await expect(page.getByTestId('design-families-subtitle'))
      .toHaveText(en['design.families.subtitle']);
  });

  test('the auto-detailing preference sits with the command it governs', async ({ pro: page }) => {
    // It used to float between the commands and the counts, belonging to neither.
    const group = page.getByTestId('cmd-group-detailing');
    await expect(group.getByTestId('detailing-auto')).toBeVisible();
    await expect(group.getByTestId('cmd-generate-detailing')).toBeVisible();
  });

  test('every stage states its step, its purpose and its state in words', async ({ pro: page }) => {
    /**
     * The repeatable pattern, asserted on the three stages that use it.
     *
     * The sections used to be identical grey bars: no number, no purpose, no state. `optional` in
     * particular was carried by a separate inline tag; it is now the stage's own state chip, which
     * is where every other stage says the same kind of thing. The chip carries a glyph AND a word,
     * so this assertion is on TEXT — a state told only in colour would pass nothing here.
     */
    await expect(page.getByTestId('floor-families-disclosure-state'))
      .toContainText(en['design.stageCard.optional']);
    await expect(page.getByTestId('floor-families-disclosure-purpose'))
      .toHaveText(en['design.stagePurpose.floors']);

    await expect(page.getByTestId('code-settings-disclosure-purpose'))
      .toHaveText(en['design.stagePurpose.regulations']);

    // Detailing cannot run before a design exists, and the shell says what it is waiting for
    // instead of showing its purpose.
    await expect(page.getByTestId('detailing-disclosure')).toHaveAttribute('data-state', 'blocked');
    await expect(page.getByTestId('detailing-disclosure-purpose'))
      .toHaveText(en['design.stage.needDesign']);
  });

  test('a stage that has run says so, and carries its count', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await expect(page.getByTestId('detailing-disclosure')).toHaveAttribute('data-state', 'done');
    await expect(page.getByTestId('detailing-disclosure-state'))
      .toContainText(en['design.stageCard.done']);
    /**
     * The badge is the assembly count, visible without opening the stage.
     *
     * Addressed by `detailing-count` and not by the shell's default `…-badge`: that id predates
     * the shell and `floor-design.spec.ts` asserts on it. The chip moved into a new container;
     * renaming its id would have broken coverage for no user-visible reason, so the shell takes
     * the id as a prop.
     */
    expect(Number(await page.getByTestId('detailing-count').innerText())).toBeGreaterThan(0);
  });
});

test.describe('@slow the detailing panel fits, and the sheet can be read', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('nothing overflows the panel horizontally at 1280×720', async ({ pro: page }) => {
    test.setTimeout(300_000);
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await page.getByTestId('detailing-disclosure').locator('> summary').click();
    await expect.poll(() => page.evaluate(() => (window.__stabileo as unknown as
      { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 120_000 })
      .toBeGreaterThan(0);

    /**
     * The overflow this guards.
     *
     * The panel was a two-column grid whose second track was `1fr`, which refuses to shrink below
     * its content's min-content width — so the schedule and the sheet pushed the grid wider than
     * the panel and the state pills were cut off on the right, with no scrollbar to reach them.
     * Measured on the element rather than eyeballed: a child wider than its scroll container is
     * the defect, whatever caused it.
     */
    const overflow = await page.getByTestId('detailing-workflow').evaluate((el) => ({
      scroll: el.scrollWidth, client: el.clientWidth,
    }));
    expect(overflow.scroll, 'the detailing panel does not overflow sideways')
      .toBeLessThanOrEqual(overflow.client + 1);

    // And every command in it stays inside the panel's own box.
    const panel = await page.locator('.pro-panel').boundingBox();
    for (const id of ['doc-report', 'doc-dxf', 'doc-xlsx', 'doc-3d']) {
      const box = await page.getByTestId(id).boundingBox();
      if (!box) continue;
      expect(box.x + box.width, `${id} stays inside the panel`)
        .toBeLessThanOrEqual(panel!.x + panel!.width + 1);
    }
  });

  test('the sheet has a title, and enlarges into a dialog that keeps the drawing whole',
    async ({ pro: page }) => {
      test.setTimeout(300_000);
      await loadModel(page, 'rc-design-qa-8');
      await designAll(page);
      await page.getByTestId('detailing-disclosure').locator('> summary').click();
      await expect.poll(() => page.evaluate(() => (window.__stabileo as unknown as
        { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 120_000 })
        .toBeGreaterThan(0);

      // The preview says WHICH sheet it is: assembly and kind, not a bare drawing.
      const caption = page.getByTestId('sheet-caption');
      await expect(caption).toBeVisible();
      await expect(caption).toContainText(en['detailing.sheet.elevation']);

      const preview = await page.getByTestId('sheet-preview').boundingBox();
      expect(preview!.height, 'a preview too small to read is decoration').toBeGreaterThan(100);

      // Enlarge.
      await page.getByTestId('sheet-expand').click();
      const modal = page.getByTestId('sheet-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toHaveAttribute('aria-modal', 'true');

      // The enlarged sheet is bigger than the preview and is not cropped by the window: the
      // dialog scrolls, so the drawing keeps its own size.
      const big = await page.getByTestId('sheet-modal-body').boundingBox();
      expect(big!.width).toBeGreaterThan(preview!.width);
      const body = await page.getByTestId('sheet-modal-body').evaluate((el) => ({
        clientW: el.clientWidth, scrollW: el.scrollWidth,
        clientH: el.clientHeight, scrollH: el.scrollHeight,
      }));
      // Either it fits, or it scrolls — what it must never do is clip with no way to reach the
      // rest, which is what the panel-sized preview did.
      const reachable = body.scrollW <= body.clientW
        || await page.getByTestId('sheet-modal-body')
          .evaluate((el) => getComputedStyle(el).overflowX !== 'hidden');
      expect(reachable, 'the enlarged sheet is either whole or scrollable').toBe(true);

      // It is the SAME projection, not a second renderer: one <svg>, from the same source.
      const svgs = await page.getByTestId('sheet-modal-body').locator('svg').count();
      expect(svgs).toBe(1);

      // Keyboard: Escape closes and focus comes back into the panel.
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await expect(page.getByTestId('sheet-expand')).toBeFocused();
    });
});

// ─── The strip in three languages ────────────────────────────────

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`the workflow strip in ${locale}`, () => {
    test.use({ appLocale: locale });

    test('names every stage and its instruction in this language', async ({ pro: page }) => {
      const D = DICTS[locale];
      for (const [id, key] of [
        ['rc-stage-model', 'design.stage.model'],
        ['rc-stage-codes', 'design.stage.codes'],
        ['rc-stage-design', 'design.stage.design'],
        ['rc-stage-detailing', 'design.stage.detailing'],
        ['rc-stage-documents', 'design.stage.documents'],
      ] as const) {
        await expect(page.getByTestId(id)).toContainText(D[key]);
      }
      await expect(page.getByTestId('rc-stage-next')).toHaveText(D['design.stage.needModel']);
      await expect(page.getByTestId('cmd-group-verify')).toContainText(D['design.group.verify']);
    });
  });
}
