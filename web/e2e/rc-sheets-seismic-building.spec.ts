import type { Page } from '@playwright/test';
import { test, expect, loadModel, solveModel } from './fixtures';
import { setDesignOption } from './design-options';

/**
 * The seven-storey concrete building solved as the app solves it and designed by the sheets with
 * chapter 18: opened from its gallery card no row fails but its seven balconies, the core's walls
 * standing on the base the card holds, and a column states its hoops against Ash and hx; loaded as
 * tests load it, without the card's correction, the core's ground-floor walls fail too, for resting
 * on a node, until one click holds their bases. The balconies are 15 cm thick for a 1.85 m
 * projection: under Table 7.3.1.1's ℓ/10 they are calculated, and their long-term deflection, about
 * 15 to 19 mm, exceeds ℓ/240; no steel within 2 % meets it, so they fail on the deflection alone and
 * the sheets offer a thicker slab.
 */
test.use({ appLocale: 'en' });

/** The balconies fail on their deflection alone, and each offers a thicker slab. */
async function balconiesFailOnDeflection(page: Page): Promise<void> {
  await expect(page.getByTestId('rc-open-slab')).toContainText(/\b7 failing/);
  await page.getByTestId('rc-open-slab').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await ws.getByTestId('rc-tab-slab').click();
  const failing = ws.getByTestId('rc-row').filter({ hasText: 'Fails' });
  await expect(failing).toHaveCount(7);
  await failing.first().click();
  const checks = ws.getByTestId('rc-checks').first();
  await expect(checks.locator('tr.bad')).toHaveCount(1);
  await expect(checks.locator('tr.bad')).toContainText('Deflection');
  await expect(ws.locator('[data-testid="rc-resize-hint"][data-what="slabH"]')).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('Escape');
}

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
  await setDesignOption(page, 'seismic');
  const redesign = page.getByTestId('rc-redesign');
  if (await redesign.count()) await redesign.click();
  await expect(page.getByTestId('rc-redesign')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('rc-building')).toHaveCount(0, { timeout: 180_000 }); // slow-ok: chapter 18 designs every column against the joints' beams again
  await expect(page.getByTestId('rc-open-column')).toBeEnabled();
}

test('@slow the gallery\'s seven-storey building designs with the seismic provisions and no row fails but its balconies, on their deflection', async ({ pro: page }) => {
  test.setTimeout(300_000);
  await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 60_000 }).toBe(true);
  await page.getByTestId('pr-project').click();
  await page.getByTestId('pp-examples').click();
  await page.getByTestId('pp-gallery').locator('[data-example="pro-edificio-7p"] .pp-ex').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBeGreaterThan(0);
  await solveModel(page);

  await designSeismic(page);

  for (const f of ['beam', 'column', 'wall']) {
    const open = page.getByTestId(`rc-open-${f}`);
    if (!(await open.isEnabled())) continue;
    await expect(open, `${f} rows`).toContainText(/\b0 failing/);
  }
  await balconiesFailOnDeflection(page);

  await page.getByTestId('rc-open-column').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await ws.getByTestId('rc-tab-column').click();
  await expect(ws.getByTestId('rc-row').filter({ hasText: 'Fails' })).toHaveCount(0);
  await ws.getByTestId('rc-row').first().click();
  const checks = ws.getByTestId('rc-checks').first();
  await expect(checks).toContainText('§18.7.5.4');
  await expect(checks).toContainText('§18.7.5.2');
});

test('@slow the seven-storey building as tests load it fails at its unheld core walls, and not once they are held, and at its balconies on their deflection', async ({ pro: page }) => {
  test.setTimeout(300_000);
  await loadModel(page, 'pro-edificio-7p');
  await solveModel(page);
  await designSeismic(page);
  for (const f of ['beam', 'column']) await expect(page.getByTestId(`rc-open-${f}`), `${f} rows`).toContainText(/\b0 failing/);
  await expect(page.getByTestId('rc-open-wall')).toContainText(/\b3 failing/);
  await balconiesFailOnDeflection(page);

  await page.getByTestId('rc-open-wall').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await ws.getByTestId('rc-tab-wall').click();
  const ground = ws.getByTestId('rc-row').filter({ hasText: 'N0' }).filter({ hasText: 'Fails' });
  await expect(ground).toHaveCount(3);
  await ground.first().click();
  await ws.getByTestId('rc-wall-hold-base').click();
  await expect(ws.getByTestId('rc-wall-hold-base')).toHaveCount(0, { timeout: 180_000 });
  for (const [f, n] of [['beam', 0], ['column', 0], ['slab', 7], ['wall', 0]] as const) {
    await ws.getByTestId(`rc-tab-${f}`).click();
    await expect(ws.getByTestId('rc-row').first()).toBeVisible({ timeout: 180_000 });
    await expect(ws.getByTestId('rc-row').filter({ hasText: 'Fails' }), `${f} rows`).toHaveCount(n, { timeout: 60_000 });
  }
});

