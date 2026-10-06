import { test, expect, loadModel, alSection } from './fixtures';

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
  test('member live-load reduction does not change the wind modal frequencies', async ({ pro: page }) => {
    await loadModel(page, 'pro-edificio-7p');
    await openWind(page);
    await page.getByTestId('wind-n1-modal').check();
    // Load the members by width so the design reduction actually changes their live loads;
    // shell surface loads retain Lo even when the checkbox is on.
    await alSection(page, 'applying');
    await page.getByTestId('al-gravity-mode').selectOption('width');
    await page.getByTestId('al-trib').fill('10');
    await alSection(page, 'live');
    await page.getByTestId('al-live-reduction').check();
    await alSection(page, 'wind');
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-delta')).toBeVisible();
    await page.getByTestId('al-back').click();
    const read = async () => Promise.all(['x', 'y'].map(async (axis) => {
      const text = await page.getByTestId(`wind-gust-${axis}`).innerText();
      const n1 = text.match(/n₁ = ([\d.]+) Hz/);
      expect(n1).not.toBeNull();
      expect(Number(n1![1])).toBeGreaterThan(0);
      return n1![1];
    }));
    const reduced = await read();
    await alSection(page, 'live');
    await page.getByTestId('al-live-reduction').uncheck();
    await alSection(page, 'wind');
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-delta')).toBeVisible();
    await page.getByTestId('al-back').click();
    expect(await read()).toEqual(reduced);
  });

  test('a free roof keeps the frequency controls even within low-rise dimensions', async ({ pro: page }) => {
    await loadModel(page, '3d-nave-industrial');
    await openWind(page);
    await page.getByTestId('al-wind-enclosure').selectOption('enclosed');
    await expect(page.getByTestId('wind-low-rise')).toBeVisible();
    await page.getByTestId('al-wind-kind').selectOption('freeRoof');
    await expect(page.getByTestId('wind-low-rise')).toHaveCount(0);
    await expect(page.getByTestId('wind-n1-modal')).toBeVisible();
    await page.getByTestId('wind-n1-typed').check();
    await page.getByTestId('wind-n1-x').fill('0.4');
    await page.getByTestId('wind-n1-y').fill('0.4');
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-delta')).toBeVisible();
    await page.getByTestId('al-back').click();
    await expect(page.getByTestId('wind-gust-y')).toContainText('n₁ = 0.400 Hz < 1 Hz → flexible');
  });

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
