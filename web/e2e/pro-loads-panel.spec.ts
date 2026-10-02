import { test, expect, loadModel } from './fixtures';

/*
 * The Loads tab's cases and combinations: a new case is a type and an optional name, the eye
 * shows or hides a case in the model, the self-weight is one closed row, and a combination is
 * one closed row that says what it adds up.
 */

test.describe('@smoke PRO loads panel', () => {
  test.beforeEach(async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
  });

  test('a new case takes its type, and its type\'s name when none is typed', async ({ pro: page }) => {
    const before = (await page.evaluate(() => window.__stabileo.loadCaseNames())).length;
    await page.getByTestId('lc-new-type').selectOption('L');
    await expect(page.getByTestId('lc-new-name')).toHaveAttribute('placeholder', /Live/);
    await page.getByTestId('lc-new-add').click();
    await page.getByTestId('lc-new-type').selectOption('W');
    await page.getByTestId('lc-new-name').fill('Viento oeste');
    await page.getByTestId('lc-new-name').press('Enter');
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names).toHaveLength(before + 2);
    expect(names.at(-1)).toBe('Viento oeste');
    expect(names.at(-2)).toMatch(/Live/);
  });

  test('the eye is the app\'s icon, and it hides the case in the model', async ({ pro: page }) => {
    const eye = page.locator('[data-testid^="lc-vis-"]').first();
    await expect(eye.locator('svg')).toHaveCount(1);
    await expect(eye).not.toContainText('👁');
    await expect(eye).toHaveAttribute('aria-pressed', 'true');
    await eye.click();
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('lc-show-all').click();
    await expect(eye).toHaveAttribute('aria-pressed', 'true');
  });

  test('the self-weight is one closed row that says where it goes', async ({ pro: page }) => {
    await expect(page.getByTestId('sw-summary')).toBeVisible();
    await expect(page.getByTestId('sw-add')).toHaveCount(0);
    await page.getByTestId('sw-toggle').click();
    await expect(page.getByTestId('sw-add')).toBeVisible();
  });

  test('combinations are closed rows that read as their definition', async ({ pro: page }) => {
    await page.getByTestId('load-tab-combos').click();
    const rows = page.getByTestId('combo-row');
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(page.locator('[data-testid^="combo-factor-"]')).toHaveCount(0);
    const def = rows.first().getByTestId('combo-definition');
    await expect(def).toHaveText(/^\d+\.\d+ D( [+−] \d+\.\d+ \S+.*)?$/);
    await rows.first().getByTestId('combo-toggle').click();
    const first = rows.first().locator('[data-testid^="combo-factor-"]').first();
    await first.fill('1.5');
    await first.press('Tab');
    await expect(def).toContainText('1.5 D');
  });
});
