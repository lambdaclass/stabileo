/**
 * Picking loads off the model, end to end.
 *
 * ── Why this test exists in this form ──────────────────────────────
 *
 * It was written, found flaky, and cut down to the state checks — arming,
 * refusing, cancelling — on the reasoning that the interesting part is a pure
 * mapping tested elsewhere and that clicking a member at a pixel tests the
 * viewport's hit-testing rather than this feature.
 *
 * That reasoning was wrong, and cutting the test hid a real bug for a whole
 * revision. Arming the picker set `selectMode = 'stress'`, which says what a
 * click MEANS, and left the pointer in `pan`, where the viewport never
 * reaches that branch at all. Crosshair showing, every click doing nothing.
 * Both state checks passed the whole time, because both halves of the state
 * they check were correct — the missing half was the tool.
 *
 * The flakiness was never the click; it was clicking at a fraction of the
 * canvas and hoping a member was there. `nodeScreenPos` gives the real
 * position, so the click lands on a member by construction.
 *
 * The SIGN and the per-Case restraint stay in `demand-from-model.test.ts`,
 * where they can be swept without a browser. What is here is the wiring.
 */

import { test, expect, type Page } from '@playwright/test';
import { loadModel } from './fixtures';

async function openBasic(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stabileo-lang', 'es');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

async function openCalculator(page: Page) {
  await page.getByRole('button', { name: /Avanzado|Advanced/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByTestId('adv-flex').click();
  await page.waitForTimeout(500);
}

/** The field value as a number, whatever the locale formatting. */
async function fieldValue(page: Page, label: string): Promise<number> {
  const input = page.getByText(label, { exact: true }).locator('..').locator('input');
  return Number(await input.inputValue());
}

test.describe('@smoke loads taken from the model', () => {
  test('refuses before there are results, and says why', async ({ page }) => {
    await openBasic(page);
    await openCalculator(page);

    await page.getByTestId('flex-pick-loads').click();
    await page.waitForTimeout(300);

    /*
     * Not a silent no-op and not zeros: the demand comes from an analysis,
     * and a reader who has not run one needs to be told that rather than
     * left wondering why nothing happened.
     */
    await expect(page.locator('.fp-note').last()).toContainText(/calcul/i);
  });

  test('a click on a member fills the demand, and says where it came from',
    async ({ page }) => {
      await openBasic(page);
      await loadModel(page, 'two-story-frame');
      await page.getByTestId('rb-cmd-solve').click();
      await expect(page.getByTestId('rb-cmd-stress')).toBeEnabled({ timeout: 60_000 });

      await openCalculator(page);
      await page.getByTestId('flex-case').selectOption('FCR');
      await page.waitForTimeout(300);

      const puField = page.getByText('Pu [kN]', { exact: true }).locator('..').locator('input');
      const muField = page.getByText('Mu [kN·m]', { exact: true }).locator('..').locator('input');
      const before = { pu: await puField.inputValue(), mu: await muField.inputValue() };

      await page.getByTestId('flex-pick-loads').click();
      await expect(page.locator('.fp-note-live')).toBeVisible();

      /*
       * Both halves of the armed state. `selectMode` says what a click means
       * and the TOOL decides whether the viewport ever asks — this is the
       * assertion whose absence let the feature ship inert.
       */
      const armed = await page.evaluate(() => window.__stabileo.viewportPick());
      expect(armed.selectMode).toBe('stress');
      expect(armed.tool, 'a click only reaches the stress branch under select').toBe('select');

      /*
       * The midpoint of a real member, from its own nodes' screen positions.
       * Clicking a fraction of the canvas and hoping is what made the first
       * version of this test flaky.
       */
      const pts = await page.evaluate(() => {
        const out: Array<{ n: number; x: number; y: number }> = [];
        for (let n = 1; n <= 12; n += 1) {
          const q = window.__stabileo.nodeScreenPos(n);
          if (q) out.push({ n, ...q });
        }
        return out;
      });
      expect(pts.length, 'the model is on screen').toBeGreaterThan(1);

      let picked = false;
      outer: for (let i = 0; i < pts.length - 1; i += 1) {
        for (let j = i + 1; j < pts.length; j += 1) {
          await page.mouse.click((pts[i].x + pts[j].x) / 2, (pts[i].y + pts[j].y) / 2);
          await page.waitForTimeout(350);
          if (await page.locator('.fp-note-live').count() === 0) { picked = true; break outer; }
        }
      }
      expect(picked, 'a click on a member was taken').toBe(true);

      const after = { pu: await puField.inputValue(), mu: await muField.inputValue() };
      expect(after, 'the demand came from the model').not.toEqual(before);

      /* It names the member and the station, so the number can be traced. */
      await expect(page.locator('.fp-note').last()).toContainText(/barra|member/i);

      /*
       * A column of this frame carries the storeys above it. The solver
       * reports that as NEGATIVE axial and the sheet wants Pu positive in
       * compression, so a positive number here is the one flip working.
       */
      expect(Number(after.pu)).toBeGreaterThan(0);

      /* And the pointer comes back, rather than being left in the crosshair. */
      const done = await page.evaluate(() => window.__stabileo.viewportPick());
      expect(done.selectMode).not.toBe('stress');

      /* What it filled stays a starting point, not a binding. */
      await muField.fill('123');
      await muField.blur();
      await expect(muField).toHaveValue('123');
    });

  test('cancelling gives the pointer back', async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    await page.getByTestId('rb-cmd-solve').click();
    await expect(page.getByTestId('rb-cmd-stress')).toBeEnabled({ timeout: 60_000 });

    await openCalculator(page);
    await page.getByTestId('flex-pick-loads').click();
    await expect(page.locator('.fp-note-live')).toBeVisible();

    /*
     * Arming a crosshair with no way out is how the viewport ends up feeling
     * frozen: clicks select nothing and there is no visible control to say
     * what mode you are in.
     */
    await page.getByTestId('flex-pick-loads').click();
    await expect(page.locator('.fp-note-live')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo?.selectMode?.() ?? 'elements'))
      .not.toBe('stress');
  });
});
