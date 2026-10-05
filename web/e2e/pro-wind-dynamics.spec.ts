import { test, expect, loadModel } from './fixtures';

/**
 * The wind's dynamics in the load generator (CIRSOC 102-2025 §1.9), and the dialog reading back
 * what the project saved.
 *
 *  · A building that is not low-rise says where each direction's frequency comes from; a typed
 *    n₁ under 1 Hz is flexible and the preview reads G_f with its steps.
 *  · Closing the dialog and opening it again starts from the project's parameters, not from the
 *    defaults: the speed, the frequency source and the typed frequencies are the ones left.
 */
async function openWind(page: import('@playwright/test').Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  await page.getByTestId('lc-code-W').first().click();
  await expect(page.getByTestId('al-enable-wind')).toBeChecked();
  await expect(page.getByTestId('wind-dynamics')).toBeVisible();
}

test.describe('@smoke the wind of a flexible building, and the dialog reading back its parameters', () => {
  test('typed frequencies under 1 Hz read G_f, and the dialog reopens on them', async ({ pro: page }) => {
    await loadModel(page, 'pro-edificio-7p');
    await openWind(page);
    await expect(page.getByTestId('wind-low-rise')).toHaveCount(0);

    await page.getByTestId('al-wind-speed').fill('40');
    await page.getByTestId('wind-n1-typed').check();
    await page.getByTestId('wind-n1-x').fill('0,8');
    await page.getByTestId('wind-n1-y').fill('0.6');
    await page.getByTestId('wind-n1-y').press('Tab');
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-delta')).toBeVisible();
    // The reading sits with the wind's inputs, one step back from the before-and-after.
    await page.getByTestId('al-back').click();

    const y = page.getByTestId('wind-gust-y');
    await expect(y).toContainText(/n₁ = 0\.600 Hz < 1 Hz → flexible → G_f = \d\.\d{3}/);
    await expect(page.getByTestId('wind-gust-x')).toContainText(/n₁ = 0\.800 Hz/);
    await y.locator('summary').click();
    await expect(y.locator('table.wd-steps')).toContainText('(1.9-10)');

    await page.getByTestId('al-cancel').click();
    await openWind(page);
    await expect(page.getByTestId('al-wind-speed')).toHaveValue('40');
    await expect(page.getByTestId('wind-n1-typed')).toBeChecked();
    await expect(page.getByTestId('wind-n1-x')).toHaveValue('0.8');
    await expect(page.getByTestId('wind-n1-y')).toHaveValue('0.6');
  });
});
