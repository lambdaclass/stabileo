import { test, expect } from '@playwright/test';

/**
 * The normative design, off by default in PRO and turned on from its settings.
 *
 * PRO's modelling and analysis stand on their own; the design (members, reinforcement, detailing,
 * drawings) is still being built. A fresh browser sees Model and Analysis only; turned on in
 * Settings, the Design stage appears and stays across a reload, as Basic's Educational does;
 * turned off, it goes and its desk with it.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('@smoke PRO starts without the Design stage, and offers it once turned on in its settings', async ({ page }) => {
  await page.goto('/app/pro?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  await expect(page.getByTestId('pr-stage-model')).toBeVisible();
  await expect(page.getByTestId('pr-stage-design')).toHaveCount(0);

  await page.getByTestId('pro-settings').click();
  const toggle = page.getByTestId('cfg-design-in-pro');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(page.getByTestId('pr-stage-design')).toBeVisible();

  // Remembered per browser.
  await page.reload();
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  await expect(page.getByTestId('pr-stage-design')).toBeVisible();
  await page.getByTestId('pr-stage-design').click();
  await expect(page.getByTestId('design-desk')).toBeVisible();

  // Off again: the stage and the desk go, back on the model.
  await page.getByTestId('pro-settings').click();
  await page.getByTestId('cfg-design-in-pro').uncheck();
  await expect(page.getByTestId('pr-stage-design')).toHaveCount(0);
  await expect(page.getByTestId('design-desk')).toHaveCount(0);
});
