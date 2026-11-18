import { test, expect } from '@playwright/test';

const PAGE = '/en/research/mechanics/vella-2024/';

test('@smoke research snap-through: the replay shows a seeded strip that snaps asymmetrically, with the paper comparison', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.snap-app');
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(page.locator('.sfv canvas').first()).toBeVisible();
  await expect(app).toHaveAttribute('data-symmetric', 'false');
  await expect(app.locator('.summary').last()).toContainText('asymmetric');
  await expect(page.locator('table.checks').first()).toContainText('ω of the natural state at µ = 1/4');
  await expect(page.locator('table.checks').first()).toContainText('57.86');
  await expect(page.getByText('Research, not a design tool.')).toBeVisible();
  await page.getByRole('button', { name: 'Show the stability diagram' }).click();
  await expect(app).toHaveAttribute('data-tab', 'stability');
  await page.locator('#rs-tab-rates').click();
  await expect(app).toHaveAttribute('data-tab', 'rates');
  await expect(app).toContainText('Paper, simulations (Fig. 2c)');
});

test('@smoke research snap-through: a fast live release snaps symmetrically, and back to the replay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.snap-app');
  await page.getByRole('button', { name: 'Try µ̇ = 0.3' }).click();
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 60000 }); // slow-ok: the WASM worker traces the static path and integrates the snap in the browser.
  await expect(app).toHaveAttribute('data-rate', '0.3');
  await expect(app).toHaveAttribute('data-symmetric', 'true');
  await expect(app).toHaveAttribute('data-stale', 'false');
  await app.getByRole('button', { name: 'Back to the replay’s setting' }).click();
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(app).toHaveAttribute('data-symmetric', 'false');
});

test('@smoke research snap-through: the one-clamp protocol recomputes live without a seed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.snap-app');
  await app.getByRole('radio', { name: 'One clamp' }).click();
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 60000 }); // slow-ok: the WASM worker runs statics and dynamics in the browser.
  await expect(app).toHaveAttribute('data-one-end', 'true');
  await expect(app.locator('#snap-seed')).toBeDisabled();
});
