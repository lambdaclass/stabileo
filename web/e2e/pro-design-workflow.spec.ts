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

import { test, expect, designAll, loadModel, declareBeamsNotLateral, designPlace, solveModel } from './fixtures';
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
 * FOUR steps, at the top of the Design stage (interface A). The concrete flow's own strip of
 * five stages is gone with the classic screen; preparing is the model and the code together
 * (they gate one thing), and the strip's other claims are the steps' now. Read from
 * `rc-stages.ts` all the same: the code check is still what FINISHES sizing, never a step
 * before it.
 */
const STEPS = ['prepare', 'size', 'detail', 'document'] as const;

/** The state a step advertises, as the bar records it. */
function stepState(page: Page, id: string) {
  return page.getByTestId(`desk-step-${id}`).getAttribute('data-state');
}

test.describe('@smoke the workflow says where you are', () => {
  test('an empty project shows every step, in order, with the first one current',
    async ({ pro: page }) => {
      const bar = page.getByTestId('desk-process');
      await expect(bar).toBeVisible();
      const ids = await bar.locator('[data-testid^="desk-step-"][data-state]').evaluateAll(
        (els) => els.map((e) => e.getAttribute('data-testid')));
      expect(ids).toEqual(STEPS.map((s) => `desk-step-${s}`));
      for (const s of STEPS) expect(await stepState(page, s)).not.toBe('complete');
      expect(await stepState(page, 'prepare')).toBe('current');
      // Nothing can start without a model, so this is unreachable rather than merely not-yet.
      expect(await stepState(page, 'detail')).toBe('blocked');
      // And the bar states the next thing to do, in words, not only as a grey button.
      await expect(page.getByTestId('desk-step-next')).toHaveText(en['design.stage.needModel']);
    });

  test('the steps advance as the work is done, and the hint follows', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await expect(page.getByTestId('desk-step-next')).toHaveText(en['design.stage.needSolve']);
    /*
     * Sizing completes when every member verifies. Since 292b87f68 qa-8's undeclared beams are
     * designed as part of the lateral system and e5 and e6 refuse; the beams declare their role
     * here, so the run the bar follows is one that completes.
     */
    await declareBeamsNotLateral(page);
    await designAll(page);
    for (const s of ['prepare', 'size'] as const) {
      expect(await stepState(page, s), `${s} is complete after a design run`).toBe('complete');
    }
    expect(await stepState(page, 'detail')).not.toBe('blocked');
  });

  test('a step opens its places, and does not run anything', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    const solvesBefore = await page.evaluate(() => window.__stabileo.solveCount());
    await page.getByTestId('desk-step-detail').click();
    await expect(page.getByTestId('desk-detailing')).toBeVisible();
    // Navigation only: pressing a step is not pressing the command of the step.
    expect(await page.evaluate(() => window.__stabileo.solveCount())).toBe(solvesBefore);
    expect(await page.evaluate(() => window.__stabileo.runCounts())).toBeNull();
  });
});

test.describe('commands are grouped, and none of them is ambiguous', () => {
  test('@smoke the member list\'s command row is two named groups in pipeline order', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designPlace(page, 'list');
    await expect(page.getByTestId('cmd-group-verify')).toHaveCount(0);
    for (const [id, key] of [
      ['cmd-group-design', 'design.group.design'],
      ['cmd-group-detailing', 'design.group.detailing'],
    ] as const) {
      await expect(page.getByTestId(id)).toContainText(en[key]);
    }
    const groups = page.locator('[data-testid^="cmd-group-"]');
    await expect(groups).toHaveCount(2);
    await expect(groups.filter({ has: page.getByTestId('active-concrete-code') })).toHaveCount(0);
  });

  test('@smoke there is ONE design command, and it states its own scope', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await designPlace(page, 'list');
    /*
     * One command, «Size…», reached from the top of the stage and from the list's toolbar, the
     * same dialog behind both. The classic strip's «Design all», the toolbar's «Design selected»
     * and its «design all the undesigned» were three commands with two rules for the edited bars.
     */
    await expect(page.getByTestId('cmd-design-families'), 'the second design command is gone').toHaveCount(0);
    await expect(page.getByTestId('cmd-design-all'), 'the strip\'s «Design all» is gone').toHaveCount(0);
    await expect(page.getByTestId('cmd-autodesign-menu'), 'and so is the toolbar\'s menu').toHaveCount(0);
    await expect(page.getByTestId('desk-design')).toHaveText(en['desk.size']);
    await expect(page.getByTestId('cmd-autodesign')).toHaveText(new RegExp(`^${en['desk.size'].replace('…', '\\u2026')}`));
    // The scope it will run is on screen BEFORE it runs: the dialog names it, and the families.
    await page.getByTestId('desk-design').click();
    await expect(page.getByTestId('desk-run-scope')).toBeVisible();
    await expect(page.getByTestId('desk-run-scope-all')).toBeChecked();
    const families = (await page.getByTestId('desk-run-families').innerText()).trim();
    expect(families, 'and it names the families').toMatch(/column|beam/i);
    await page.getByTestId('desk-run-cancel').click();
  });

  test('@smoke the auto-detailing preference sits with what it governs, once', async ({ pro: page }) => {
    /*
     * The command and the preference that governs it travelled as a pair; with interface A the
     * command is the Detail step's action at the top and the preference sits over the detailing
     * it produces, one of each.
     */
    await designPlace(page, 'detailing');
    await expect(page.getByTestId('desk-detailing').getByTestId('detailing-auto')).toBeVisible();
    await expect(page.getByTestId('desk-step-actions').getByTestId('cmd-generate-detailing')).toBeVisible();
    await expect(page.getByTestId('cmd-generate-detailing')).toHaveCount(1);
    await expect(page.getByTestId('detailing-auto')).toHaveCount(1);
  });

  test('@smoke every step states its state, and what it waits on, in words', async ({ pro: page }) => {
    /*
     * The steps say their state as text (a tick or the number, and a word a screen reader reads)
     * and, while unfinished, what they wait on: a state told only in colour would pass nothing.
     */
    await expect(page.getByTestId('desk-step-detail')).toHaveAttribute('data-state', 'blocked');
    await expect(page.getByTestId('desk-step-detail')).toHaveAttribute('title', en['design.stage.needDesign']);
    await expect(page.getByTestId('desk-step-detail').locator('.sr-only')).toContainText(en['design.stage.srBlocked']);
    // The floor pass is still an optional sub-step of the list, and says so.
    await loadModel(page, 'rc-design-qa-8');
    await designPlace(page, 'list');
    await expect(page.getByTestId('floor-families-disclosure-state')).toContainText(en['design.stageCard.optional']);
    await expect(page.getByTestId('floor-families-disclosure-purpose')).toHaveText(en['design.stagePurpose.floors']);
  });

  test('@slow a step that has run says so', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await expect.poll(() => page.evaluate(() => (window.__stabileo as unknown as { detailingAssemblies(): unknown[] }).detailingAssemblies().length), { timeout: 120_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('desk-step-detail').locator('.sr-only')).not.toContainText(en['design.stage.srBlocked']);
    expect(await stepState(page, 'detail')).not.toBe('blocked');
  });
});

test.describe('@slow the detailing panel fits, and the sheet can be read', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('nothing overflows the panel horizontally at 1280×720', async ({ pro: page }) => {
    test.setTimeout(300_000);
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await designPlace(page, 'detailing');
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

    // And every command in it stays inside the canvas it is shown in.
    await designPlace(page, 'documents');
    const panel = await page.getByTestId('desk-canvas').boundingBox();
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
      await designPlace(page, 'detailing');
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

// ─── The steps in three languages ────────────────────────────────

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`the workflow steps in ${locale}`, () => {
    test.use({ appLocale: locale });

    test('names every step and its instruction in this language', async ({ pro: page }) => {
      const D = DICTS[locale];
      for (const s of STEPS) await expect(page.getByTestId(`desk-step-${s}`)).toContainText(D[`desk.step.${s}`]!);
      await expect(page.getByTestId('desk-step-next')).toHaveText(D['design.stage.needModel']!);
      await loadModel(page, 'rc-design-qa-8');
      await designPlace(page, 'list');
      await expect(page.getByTestId('cmd-group-design')).toContainText(D['design.group.design']!);
    });
  });
}
