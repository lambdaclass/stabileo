import type { Page } from '@playwright/test';
import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * The seven-storey concrete building solved as the app solves it and designed by the sheets with
 * chapter 18: opened from its gallery card no row of any family fails, the core's walls standing on
 * the base the card holds, and a column states its hoops against Ash and hx; loaded as tests load
 * it, without the card's correction, only the core's ground-floor walls fail, for resting on a node,
 * until one click holds their bases, and then nothing does.
 */
test.use({ appLocale: 'en' });

async function designSeismic(page: Page): Promise<void> {
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-sheets-panel')).toBeVisible();
  const mesh = page.getByTestId('rc-mesh-walls');
  if (await mesh.count()) {
    await mesh.click();
    await expect(mesh).toHaveCount(0, { timeout: 120_000 });
  }
  await expect(page.getByTestId('rc-design')).toBeEnabled({ timeout: 120_000 });
  await page.getByTestId('rc-design').click();
  await expect(page.getByTestId('rc-open-column')).toBeEnabled({ timeout: 120_000 }); // slow-ok: the sheets design every member and combination before the families open
  await page.getByTestId('rc-opt-seismic').check();
  const redesign = page.getByTestId('rc-redesign');
  if (await redesign.count()) await redesign.click();
  await expect(page.getByTestId('rc-redesign')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('rc-building')).toHaveCount(0, { timeout: 180_000 }); // slow-ok: chapter 18 designs every column against the joints' beams again
  await expect(page.getByTestId('rc-open-column')).toBeEnabled();
}

test('@slow the gallery\'s seven-storey building designs with the seismic provisions and no row fails', async ({ pro: page }) => {
  test.setTimeout(300_000);
  await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 60_000 }).toBe(true);
  await page.getByTestId('pr-project').click();
  await page.getByTestId('pp-examples').click();
  await page.getByTestId('pp-gallery').locator('[data-example="pro-edificio-7p"] .pp-ex').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBeGreaterThan(0);
  await solveModel(page);

  await designSeismic(page);

  for (const f of ['beam', 'column', 'slab', 'wall', 'footing']) {
    const open = page.getByTestId(`rc-open-${f}`);
    if (!(await open.isEnabled())) continue;
    await expect(open, `${f} rows`).toContainText(/\b0 failing/);
  }

  await page.getByTestId('rc-open-column').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await ws.getByTestId('rc-tab-column').click();
  await expect(ws.getByTestId('rc-row').filter({ hasText: 'Fails' })).toHaveCount(0);
  await ws.getByTestId('rc-row').first().click();
  const checks = ws.getByTestId('rc-checks').first();
  await expect(checks).toContainText('§18.7.5.4');
  await expect(checks).toContainText('§18.7.5.2');
});

test('@slow the seven-storey building as tests load it fails only at its unheld core walls, and not once they are held', async ({ pro: page }) => {
  test.setTimeout(300_000);
  await loadModel(page, 'pro-edificio-7p');
  await solveModel(page);
  await designSeismic(page);
  for (const f of ['beam', 'column', 'slab', 'footing']) await expect(page.getByTestId(`rc-open-${f}`), `${f} rows`).toContainText(/\b0 failing/);
  await expect(page.getByTestId('rc-open-wall')).toContainText(/\b3 failing/);

  await page.getByTestId('rc-open-wall').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await ws.getByTestId('rc-tab-wall').click();
  const ground = ws.getByTestId('rc-row').filter({ hasText: 'N0' }).filter({ hasText: 'Fails' });
  await expect(ground).toHaveCount(3);
  await ground.first().click();
  await ws.getByTestId('rc-wall-hold-base').click();
  await expect(ws.getByTestId('rc-wall-hold-base')).toHaveCount(0, { timeout: 180_000 });
  for (const f of ['beam', 'column', 'slab', 'wall']) {
    await ws.getByTestId(`rc-tab-${f}`).click();
    await expect(ws.getByTestId('rc-row').first()).toBeVisible({ timeout: 180_000 });
    await expect(ws.getByTestId('rc-row').filter({ hasText: 'Fails' }), `${f} rows`).toHaveCount(0, { timeout: 60_000 });
  }
});

