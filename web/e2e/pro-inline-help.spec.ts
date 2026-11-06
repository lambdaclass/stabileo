import { test, expect } from '@playwright/test';

/** The line under each PRO option: on in a fresh browser, off from Settings, remembered across a reload. */
test.use({ storageState: { cookies: [], origins: [] } });

test('@smoke the inline help is on by default, turns off from Settings, and stays off', async ({ page }) => {
  await page.goto('/app/pro?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  const help = page.locator('[data-hint]');
  await expect(help.first()).toBeVisible();
  const shown = await help.count();
  expect(shown).toBeGreaterThan(0);

  await page.getByTestId('pro-settings').click();
  const toggle = page.getByTestId('cfg-inline-help');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  await page.reload();
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  await expect(page.getByTestId('lc-new')).toBeVisible();
  await expect(help).toHaveCount(0);

  await page.getByTestId('pro-settings').click();
  await page.getByTestId('cfg-inline-help').check();
  await page.keyboard.press('Escape');
  await page.getByTestId('pr-cmd-loads').click();
  await expect(help.first()).toBeVisible();
});
