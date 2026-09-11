/**
 * The section calculator, from the bottom of the Advanced list.
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

/** The workbook's own sheet names, which the selector now uses. */
const CASES = ['FSR', 'FST', 'FCR', 'FCR-CIR', 'FCO'];

async function openFlex(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  /*
   * Reached from the bottom of the Advanced list, not from the ribbon. It was
   * a ribbon command until its two-word label wrapped and took ten pixels of
   * canvas off every Basic user; see the commit that moved it.
   */
  await page.getByTestId('rb-cmd-advanced').click();
  await page.getByTestId('adv-flex').click();
  await expect(page.getByTestId('flex-panel')).toBeVisible();
}

const resultText = (page: Page) => page.getByTestId('flex-result').innerText();

test.describe('@smoke the reinforced-concrete calculator', () => {
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

  test('both modes answer every case, and the section is drawn for each', async ({ page }) => {
    test.setTimeout(180_000);
    await openFlex(page);

    /*
     * The drawing is the check on the inputs — a flange narrower than its web,
     * a cover deeper than the section — so it has to be there in every
     * combination, not only the one the panel opens on. Counting shapes
     * rather than asserting an image: what matters is that something was
     * drawn from the current numbers, and a screenshot would fail on a
     * colour change.
     */
    const drawing = page.getByTestId('section-drawing');
    for (const mode of ['design', 'verify']) {
      await page.getByTestId(`flex-mode-${mode}`).click();
      for (const id of CASES) {
        await page.getByTestId('flex-case').selectOption(id);
        await expect(drawing, `${mode}/${id}`).toBeVisible();
        const shapes = await drawing.locator('svg circle, svg path').count();
        expect(shapes, `${mode}/${id} drew nothing`).toBeGreaterThan(1);
        expect(await resultText(page), `${mode}/${id}`).toMatch(/\d/);
      }
    }
  });

  test('sizing and checking are different questions with consistent answers', async ({ page }) => {
    test.setTimeout(180_000);
    await openFlex(page);
    await page.getByTestId('flex-case').selectOption('FSR');

    /*
     * Size the section, then hand the steel it asked for back to the checker.
     * The capacity it reports must cover the moment that produced it — if it
     * did not, one of the two modes is applying a different method, which is
     * the failure this pair exists to catch.
     */
    await page.getByTestId('flex-mode-design').click();
    const sized = (await resultText(page)).match(/As = ([\d.]+)/);
    expect(sized, 'sizing must report an area').not.toBeNull();

    await page.getByTestId('flex-mode-verify').click();
    const asField = page.getByText(/Ast provided|Ast adoptada/).locator('..').locator('input');
    await asField.fill(sized![1]);
    await asField.blur();

    const ratio = (await resultText(page)).match(/Ratio = ([\d.]+)/);
    expect(ratio, 'checking must report a ratio').not.toBeNull();
    expect(Number(ratio![1]), 'the steel sizing asked for must pass the check')
      .toBeLessThanOrEqual(1.02);
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

    await page.getByTestId('flex-case').selectOption('FSR');
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
    await page.getByTestId('flex-case').selectOption('FSR');

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

    /*
     * Two footnotes now, and they must stay two: one about the tool being in
     * whose clauses these are, one about how far the checking goes. The
     * second is the one that erodes: "tested against the workbook" invites a
     * reader to hear "identical", and the two places we are NOT identical
     * have to survive every future edit to this panel.
     */
    const notes = page.locator('.fp-attrib');
    await expect(notes).toHaveCount(1);
    await expect(notes.first()).toContainText('CIRSOC 201-2005');
    await expect(notes.first()).toContainText(/CIRSOC_FLEX/);
    await expect(notes.first()).toContainText('Ortega');

    /*
     * The scope is folded, and it has to OPEN — a caveat behind a summary
     * that never expands is a caveat that was removed with extra steps.
     */
    const scope = page.locator('.fp-scope');
    await expect(scope).toHaveCount(1);
    await scope.locator('summary').click();
    await expect(scope).toContainText(/circular|circulares|anillo|ring|anel/);
    await expect(scope).toContainText(/capa|layer|camada/);

    /*
     * And both belong to the 2005 edition alone. Under any other code they
     * are not merely stale, they vouch for numbers this panel did not
     * produce — so they must be gone, not greyed.
     */
    const code = page.getByTestId('flex-code');
    const other = await code.locator('option:not([disabled])').count();
    if (other > 1) {
      await code.selectOption({ index: 1 });
      await expect(page.locator('.fp-attrib')).toHaveCount(0);
      await expect(page.locator('.fp-scope')).toHaveCount(0);
    }
  });
});
