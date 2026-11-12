import { test, expect } from '@playwright/test';

const PAGE = '/en/research/stability/feher-sipos-varkonyi-2026/';

test('@smoke research shape control: the path takes the arch to the inverted shape', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.shape-app');
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(page.locator('.sfv canvas').first()).toBeVisible();
  await expect(app).toHaveAttribute('data-step', '162');
  await app.getByRole('button', { name: 'Shape 1', exact: true }).click();
  await expect(app).toHaveAttribute('data-step', '0');
  expect(Number(await app.getAttribute('data-ymid'))).toBeCloseTo(0.2258, 3);
  await app.getByRole('button', { name: 'Shape 5', exact: true }).click();
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
  await page.locator('#shape-delta').fill('0.6');
  await page.locator('#shape-delta').dispatchEvent('change');
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 60000 }); // slow-ok: the shape-control WASM worker solves the whole actuator path.
  await expect(app).toContainText('The strip came back as an arch');
  await page.locator('#shape-step').fill('92');
  expect(Number(await app.getAttribute('data-ymid'))).toBeCloseTo(0.2258, 3);
});

test('@smoke research shape control: a heavier load snaps, and Back to the paper restores Section 3.4', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.shape-app');
  await expect(app).toHaveAttribute('data-paper', 'true');
  await expect(app.getByRole('button', { name: 'Back to the paper' })).toBeDisabled();
  await page.locator('#shape-q').fill('4');
  await page.locator('#shape-q').dispatchEvent('change');
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 60000 }); // slow-ok: the shape-control WASM worker solves the whole actuator path.
  await expect(app).toHaveAttribute('data-load', '4');
  await expect(app).toContainText('The strip jumped near');
  await expect(app).toContainText('Changed from the paper: q = 4.0.');
  await app.getByRole('button', { name: 'Back to the paper' }).click();
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(app).toHaveAttribute('data-paper', 'true');
  await expect(app).toHaveAttribute('data-load', '2.5');
  await expect(page.locator('#shape-q')).toHaveValue('2.5');
});

test('@smoke research shape control: an arch that cannot carry the load leaves the previous run marked as not current', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.shape-app');
  await expect(app).toHaveAttribute('data-stale', 'false');
  await app.getByRole('radio', { name: 'half span' }).click();
  await expect(app).toContainText('cannot carry this load', { timeout: 60000 }); // slow-ok: the shape-control WASM worker loads before it refuses the start.
  await expect(app).toHaveAttribute('data-stale', 'true');
  await expect(app).toHaveAttribute('data-load', '2.5');
  await app.getByRole('button', { name: 'Back to the paper' }).click();
  await expect(app).toHaveAttribute('data-stale', 'false');
  await expect(app).toHaveAttribute('data-paper', 'true');
});

test('@smoke research shape control: the page reads in Hungarian and explains each difference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/hu/research/stability/feher-sipos-varkonyi-2026/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Egy hajlított csík vezetése két alak között');
  const why = page.locator('.why details').first();
  await expect(why.locator('p')).toBeHidden();
  await why.locator('summary').click();
  await expect(why.locator('p')).toContainText('96-ról 192 rúdra');
});
