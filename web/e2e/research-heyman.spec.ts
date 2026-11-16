import { test, expect } from '@playwright/test';

const PAGE = '/en/research/mechanics/heyman-1966/';

test('@smoke research masonry arch: the replay ends on the five-hinge least thickness and its mechanism', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.arch-app');
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(page.locator('.sfv canvas').first()).toBeVisible();
  await expect(app).toHaveAttribute('data-kind', 'mechanism');
  await expect(app.locator('.summary')).toContainText('0.107451');
  await expect(app.locator('.summary')).toContainText('0.0° extrados, 35.6° intrados, 89.1° extrados, 144.4° intrados, 180.0° extrados');
  await page.getByRole('button', { name: 'Watch the bisection' }).click();
  await expect(app).toHaveAttribute('data-kind', 'bisection');
  await expect(app).toContainText('no thrust line fits');
  await expect(page.locator('table.checks')).toContainText('0.107478');
});

test('@smoke research masonry arch: a live recompute of a flatter arch and of the ring', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.arch-app');
  await page.getByRole('button', { name: 'Try α = 60°' }).click();
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 30000 }); // slow-ok: the arch WASM worker loads and bisects in the browser.
  await expect(app).toHaveAttribute('data-alpha', '60');
  await expect(app.locator('.summary')).toContainText('0.0228');
  await app.getByRole('button', { name: 'Back to the reference case' }).click();
  await expect(app).toHaveAttribute('data-source', 'replay');
  await page.locator('#rs-tab-load').click();
  await expect(app).toHaveAttribute('data-tab', 'load');
  await expect(app.locator('.summary')).toContainText('3.7441 kN');
  await page.locator('#arch-ring-voussoirs').fill('20');
  await page.locator('#arch-ring-voussoirs').dispatchEvent('change');
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 30000 }); // slow-ok: the arch WASM worker loads and enumerates every mechanism.
  await expect(app).toHaveAttribute('data-n', '20');
  await expect(app.locator('.summary')).toContainText('3.7497 kN');
  await page.locator('#arch-thickness').fill('0.2');
  await page.locator('#arch-thickness').dispatchEvent('change');
  await expect(app).toContainText('too thin to stand under its own weight');
  await expect(app).toHaveAttribute('data-stale', 'true');
});
