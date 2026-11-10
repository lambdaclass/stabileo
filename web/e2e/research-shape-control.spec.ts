import { test, expect } from '@playwright/test';

const PAGE = '/en/research/stability/feher-sipos-varkonyi-2026/';

test('@smoke research shape control: the path takes the arch to the inverted shape', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.shape-app');
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(page.locator('.sfv canvas').first()).toBeVisible();
  await expect(app).toHaveAttribute('data-step', '162');
  await app.getByRole('button', { name: 'shape 1', exact: true }).click();
  await expect(app).toHaveAttribute('data-step', '0');
  expect(Number(await app.getAttribute('data-ymid'))).toBeCloseTo(0.2258, 3);
  await app.getByRole('button', { name: 'shape 5', exact: true }).click();
  await expect(app).toHaveAttribute('data-theta', '1');
  await expect(app).toHaveAttribute('data-delta', '0');
  await expect(app).toHaveAttribute('data-stable', 'true');
  expect(Number(await app.getAttribute('data-ymid'))).toBeCloseTo(-0.1498, 3);
  await expect(app).toContainText('The strip ended inverted, without a jump.');
});

test('@smoke research shape control: a rectangle below the cusp brings the arch back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.shape-app');
  await page.locator('#shape-delta').fill('0.4');
  await page.locator('#shape-delta').dispatchEvent('change');
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 60000 }); // slow-ok: the shape-control WASM worker solves the whole actuator path.
  await expect(app).toContainText('The strip came back as an arch');
  await page.locator('#shape-step').fill('72');
  expect(Number(await app.getAttribute('data-ymid'))).toBeCloseTo(0.2258, 3);
});
