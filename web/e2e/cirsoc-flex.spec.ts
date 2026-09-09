/**
 * The section calculator, from the ribbon.
 *
 * The clauses are covered by unit tests — 25 of them across the flanged and
 * circular modules, plus the 77 the rectangular engine already had. What none
 * of those can reach is whether a reader can get to any of it: the command
 * exists, the panel mounts without a model on screen, every case computes
 * rather than throwing, and the numbers change when the inputs do.
 *
 * The last one is the assertion worth having. A panel that renders a plausible
 * answer and ignores the fields would pass everything else here, and it is a
 * failure mode this design invites: five cases reading from one shared set of
 * inputs, where a case that forgot to read `Mu` would still show a number.
 */

import { test, expect } from './fixtures';

type Page = import('@playwright/test').Page;

const CASES = ['rect-flexure', 'tee-flexure', 'rect-column', 'circ-column', 'rect-biaxial'];

async function openFlex(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await page.getByTestId('rb-cmd-flex').click();
  await expect(page.getByTestId('flex-panel')).toBeVisible();
}

const resultText = (page: Page) => page.getByTestId('flex-result').innerText();

test.describe('@smoke CIRSOC Flex', () => {
  test('opens with no model on screen and answers every case', async ({ page }) => {
    test.setTimeout(120_000);
    await openFlex(page);

    /*
     * Asserted, because it is the point of the panel. If a model were needed
     * this would be PRO's verification with extra steps, and a reader sizing
     * a lintel would have to invent a structure first.
     */
    expect(await page.evaluate(() => window.__stabileo.modelCensus().nodes))
      .toBe(0);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    for (const id of CASES) {
      await page.getByTestId('flex-case').selectOption(id);
      const text = await resultText(page);
      expect(text, `${id} produced nothing`).toMatch(/\d/);
      expect(text, `${id} says the inputs are wrong`).not.toContain('Check the inputs');
    }
    expect(errors, 'no case may throw').toEqual([]);
  });

  test('the answer follows the demand', async ({ page }) => {
    test.setTimeout(120_000);
    await openFlex(page);

    const readAs = async () => {
      const m = (await resultText(page)).match(/As = ([\d.]+)/);
      return m ? Number(m[1]) : NaN;
    };

    const mu = page.locator('.flex-panel input').filter({ hasNot: page.locator('[type=checkbox]') });
    // Mu is the first field in the Demand block for the simple-bending case.
    const muField = page.getByText('Mu [kN·m]').locator('..').locator('input');

    await page.getByTestId('flex-case').selectOption('rect-flexure');
    const light = await readAs();
    await muField.fill('200');
    await muField.blur();
    const heavy = await readAs();

    expect(light).toBeGreaterThan(0);
    expect(heavy, 'more moment must need more steel').toBeGreaterThan(light);
    expect(mu).toBeTruthy();
  });

  test('a section that cannot work is said to fail, not quietly sized', async ({ page }) => {
    test.setTimeout(120_000);
    await openFlex(page);
    await page.getByTestId('flex-case').selectOption('rect-flexure');

    /*
     * A 20×50 beam asked for ten times what it can carry. The panel must mark
     * it — a calculator that answers every question with a number teaches
     * people to trust the number.
     */
    const muField = page.getByText('Mu [kN·m]').locator('..').locator('input');
    await muField.fill('2000');
    await muField.blur();

    await expect(page.getByTestId('flex-result')).toHaveClass(/fp-fail/);
  });

  test('shows its working, and says whose rules they are', async ({ page }) => {
    test.setTimeout(120_000);
    await openFlex(page);

    /*
     * The memo is the reason a spreadsheet is trusted and a black box is not,
     * so its absence is a defect rather than a missing nicety.
     */
    await page.getByText(/Calculation steps|Memoria de cálculo/).click();
    const steps = page.locator('.fp-memo li');
    expect(await steps.count()).toBeGreaterThan(2);

    await expect(page.locator('.fp-attrib')).toContainText('CIRSOC 201-2005');
    await expect(page.locator('.fp-attrib')).toContainText('Ortega');
  });
});
