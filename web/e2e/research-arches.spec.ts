import { test, expect } from '@playwright/test';
test('@smoke research arches replay, mode and production WASM recomputation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/mechanics/biggins-2026/');
  const app = page.locator('.arches-app');
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(app).toHaveAttribute('data-step', '60');
  await expect(page.locator('.sfv canvas').first()).toBeVisible();
  expect(Number(await app.getAttribute('data-threshold'))).toBeCloseTo(21.52 * Math.sqrt(0.012), 2);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 60000 }); // slow-ok: The arches WASM worker computes the mode and equilibrium curve.
  expect(Number(await app.getAttribute('data-threshold'))).toBeCloseTo(21.52 * Math.sqrt(0.012), 2);
});

test('@smoke research arches width recomputation and stop', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/mechanics/biggins-2026/');
  const app = page.locator('.arches-app');
  await page.getByRole('checkbox').check();
  await page.locator('#arch-width').focus();
  await page.locator('#arch-width').press('End');
  await expect(app).toHaveAttribute('data-width', '0.9', { timeout: 60000 }); // slow-ok: Changing width starts a new arches WASM equilibrium solve.
  expect(Number(await app.getAttribute('data-threshold'))).toBeGreaterThan(4.8);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const step = await app.getAttribute('data-step');
  await page.waitForTimeout(400);
  await expect(app).toHaveAttribute('data-step', step!);
});
