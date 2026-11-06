import { test, expect } from '@playwright/test';

/**
 * The PRO header says where the project stands against its autosave: changes not yet saved after
 * an edit, saved once the autosave runs (or on a click), and the Project tab one click away.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('@smoke the save status follows the autosave and opens the Project tab', async ({ page }) => {
  await page.goto('/app/pro?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  const status = page.getByTestId('pro-save-status');
  await expect(status).toHaveCount(0);

  await page.evaluate(async () => { await window.__stabileoActions.loadExample('3d-portal-frame'); });
  await expect(status).toHaveAttribute('data-state', 'changed');

  await status.click();
  await expect(status).toHaveAttribute('data-state', /saved|degraded/, { timeout: 30_000 });

  await status.click();
  await expect(page.getByTestId('pp-autosave')).toBeVisible();
});
