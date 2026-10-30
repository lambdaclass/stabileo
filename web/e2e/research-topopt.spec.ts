import { test, expect } from '@playwright/test';

test('MBB replay, both filters and live solve @smoke', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/optimization/andreassen-2011/');
  await expect(page.getByRole('heading', { name: 'Topology optimization of an MBB beam' })).toBeVisible();
  await expect(page.getByText('Research, not a design tool. Nothing here is an engineering result.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Compliance: 216\.8137/)).toBeVisible();
  await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Convergence', exact: true }).click();
  await expect(page.getByText('Authors’ reference · Stabileo', { exact: true })).toBeVisible();
  await page.getByLabel('Filter', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Recompute live' }).click();
  await expect(page.getByText('Cached result', { exact: true })).toBeVisible({ timeout: 120000 }); // slow-ok: The topology-optimization worker completes the density-filter MBB iterations.
  await expect(page.getByText(/Compliance: 233\.7146/)).toBeVisible();
  await page.getByLabel('Horizontal elements', { exact: true }).fill('100000');
  await expect(page.getByRole('button', { name: 'Recompute live' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Invalid');
});
