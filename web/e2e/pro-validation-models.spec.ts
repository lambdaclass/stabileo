/**
 * The "Validation models" group of the PRO examples: seven structures modelled one to one, each
 * loaded from its card with its own numbering, cases and combinations, and nothing generated over
 * them. The models themselves are checked in `validation-models.test.ts`; this checks the menu
 * reaches them.
 */
import { test, expect, solveModel } from './fixtures';

test.describe('PRO validation models', () => {
  test.describe.configure({ timeout: 180_000 });

  test('the group lists the seven, and a card loads its model as it is', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    const gallery = page.getByTestId('pp-gallery');
    await expect(gallery).toBeVisible();
    await expect(gallery.locator('.pp-gal-group').filter({ hasText: 'Validation models' })).toHaveCount(1);
    const cards = gallery.locator('.pp-ex').filter({ hasText: /^Validation 0\d/ });
    await expect(cards).toHaveCount(7);

    await cards.filter({ hasText: 'Validation 06' }).click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBe(25);
    // The model's own cases, and no regulation combinations over them.
    expect(await page.evaluate(() => window.__stabileo.loadCaseNames())).toEqual(['EX', 'DL', 'LL']);
    expect((await page.evaluate(() => window.__stabileo.analysisSettings()))?.selfWeight)
      .toEqual([{ caseId: 2, direction: 'Z', factor: -1 }]);
  });

  test('the hangar solves and identifies combinations without stable equilibrium', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    await page.getByTestId('pp-gallery').locator('.pp-ex').filter({ hasText: /^Validation 04/ }).click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBe(2482);
    await solveModel(page);
    await expect(page.locator('[class*=toast]').filter({ hasText: /Without a second-order equilibrium/ }).first()).toBeVisible();
  });

});
