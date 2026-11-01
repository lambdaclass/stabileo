import { test, expect } from './fixtures';

test.describe('@slow second order and buckling in Basic', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('liveCalc', 'false'));
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-second-order'));
    await page.getByTestId('rb-cmd-advanced').click();
  });

  test('P-Δ with φ and 4 elements per member, its step by step, and buckling with 4 elements', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.getByTestId('so-options-toggle').click();
    await page.getByTestId('so-method').selectOption('phi');
    await page.getByTestId('so-n-4').click();
    await page.locator('button.adv-btn', { hasText: 'P-Δ' }).click();
    await expect(page.getByTestId('pdelta-result')).toContainText(/B₂ = 1\.\d{3}/);
    await expect(page.getByTestId('pdelta-b2-line')).toContainText('λ₁');
    await page.getByTestId('pdelta-iterations').locator('summary').click();
    await expect(page.getByTestId('pdelta-iterations').locator('tbody tr').first()).toBeVisible();
    await page.getByTestId('pdelta-compare').locator('summary').click();
    await expect(page.getByTestId('pdelta-compare').locator('tbody tr')).toHaveCount(4);
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-bautistachesta-Claude/a16c81ba-8308-49a3-8025-59a14cabb9a4/scratchpad/second-order/pdelta-panel.png' });

    await page.getByTestId('pdelta-open-steps').click();
    await expect(page.getByTestId('steps-doc')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('steps-error')).toHaveCount(0);
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-bautistachesta-Claude/a16c81ba-8308-49a3-8025-59a14cabb9a4/scratchpad/second-order/steps-doc.png' });
    await page.getByTestId('steps-back').click();
    await page.getByTestId('steps-catalog-back').click();

    await page.getByTestId('so-options-toggle').click();
    await page.getByTestId('so-method').selectOption('consistent');
    await expect(page.getByTestId('pdelta-compare')).toHaveCount(0);
    await page.getByTestId('adv-close').click();
    await page.locator('button.adv-btn', { hasText: 'Pcr' }).click();
    await expect(page.locator('.adv-result-info').filter({ hasText: /λ_cr = \d/ })).toBeVisible();
    await expect(page.getByTestId('buckling-how')).toContainText('4');
    await expect(page.getByTestId('buckling-n1-warning')).toHaveCount(0);
    await page.getByTestId('buckling-keff').locator('summary').click();
    await expect(page.getByTestId('buckling-keff').locator('tbody tr')).toHaveCount(3);
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-bautistachesta-Claude/a16c81ba-8308-49a3-8025-59a14cabb9a4/scratchpad/second-order/buckling-panel.png' });
    expect(errors).toEqual([]);
  });
});
