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
 * THREE steps, at the top of the Design stage (interface A). The concrete flow's own strip of
 * five stages is gone with the classic screen; preparing is the model and the code together
 * (they gate one thing), and the strip's other claims are the steps' now. Read from
 * `rc-stages.ts` all the same: the code check is still what FINISHES sizing, never a step
 * before it.
 */
const STEPS = ['prepare', 'size', 'document'] as const;

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
      expect(await stepState(page, 'size')).toBe('blocked');
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
  });

  test('a step opens its places, and does not run anything', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    const solvesBefore = await page.evaluate(() => window.__stabileo.solveCount());
    await page.getByTestId('desk-step-prepare').click();
    await expect(page.getByTestId('desk-prepare')).toBeVisible();
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

  test('@smoke every step states its state, and what it waits on, in words', async ({ pro: page }) => {
    /*
     * The steps say their state as text (a tick or the number, and a word a screen reader reads)
     * and, while unfinished, what they wait on: a state told only in colour would pass nothing.
     */
    await expect(page.getByTestId('desk-step-size')).toHaveAttribute('data-state', 'blocked');
    await expect(page.getByTestId('desk-step-size')).toHaveAttribute('title', en['design.stage.needDemands']);
    await expect(page.getByTestId('desk-step-size').locator('.sr-only')).toContainText(en['design.stage.srBlocked']);
    // The floor pass is still an optional sub-step of the list, and says so.
    await loadModel(page, 'rc-design-qa-8');
    await designPlace(page, 'list');
    await expect(page.getByTestId('floor-families-disclosure-state')).toContainText(en['design.stageCard.optional']);
    await expect(page.getByTestId('floor-families-disclosure-purpose')).toHaveText(en['design.stagePurpose.floors']);
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
